import { Contract, getAddress, keccak256, toQuantity, ZeroHash } from 'ethers';
import { buildLab } from './build.mjs';
import { exactKeys, hash32, decimal, requireRule as check } from '../../src/policy/values.mjs';

// Trusted local-chain reader. No event accumulator or writable product DB.
// Every returned state is a historical confirmed observation, not a payment promise.
export function createLabReader(provider, inputPin) {
  exactKeys(inputPin, ['chainId','genesisHash','vault','token','instanceId','configHash','confirmations'], 'LAB_PIN');
  const pin = structuredClone(inputPin), artifacts = buildLab();
  check(pin.chainId === 31338 && Number.isSafeInteger(pin.confirmations) && pin.confirmations >= 2 && pin.confirmations <= 100, 'LAB_PIN');
  for (const k of ['genesisHash','instanceId','configHash']) hash32(pin[k], 'LAB_PIN');
  for (const k of ['vault','token']) pin[k] = getAddress(pin[k]);
  const vault = new Contract(pin.vault, artifacts.FundingLab.abi, provider);
  const token = new Contract(pin.token, artifacts.ClearTestToken.abi, provider);
  const blockAt = n => provider.send('eth_getBlockByNumber', [toQuantity(n), false]);
  async function observed(fn) {
    check(Number(BigInt(await provider.send('eth_chainId', []))) === pin.chainId, 'LAB_ENVIRONMENT');
    check((await blockAt(0))?.hash === pin.genesisHash, 'LAB_ENVIRONMENT');
    const head = Number(BigInt(await provider.send('eth_blockNumber', []))), n = head - pin.confirmations + 1;
    check(n >= 0, 'LAB_CONFIRMATIONS'); const block = await blockAt(n); check(block, 'LAB_BLOCK');
    const opts = { blockTag:n };
    const [code, tokenCode, config, configHash] = await Promise.all([
      provider.send('eth_getCode',[pin.vault,toQuantity(n)]), provider.send('eth_getCode',[pin.token,toQuantity(n)]),
      vault.runtimeConfig(opts), vault.configHash(opts),
    ]);
    check(keccak256(code) === artifacts.FundingLab.codeHash && keccak256(tokenCode) === artifacts.ClearTestToken.codeHash, 'LAB_CODE');
    check(configHash === pin.configHash && config.instanceId === pin.instanceId && config.token === pin.token, 'LAB_ENVIRONMENT');
    const result = await fn({ n, block, opts, config });
    check((await blockAt(n))?.hash === block.hash && (await blockAt(0))?.hash === pin.genesisHash, 'LAB_REORG');
    check(Number(BigInt(await provider.send('eth_blockNumber', []))) >= n + pin.confirmations - 1, 'LAB_REORG');
    return { ...result, observation:'CONFIRMED_TEST', blockNumber:n, blockHash:block.hash,
      observedAt:Number(BigInt(block.timestamp)), confirmations:pin.confirmations,
      mode:'SYNTHETIC_TEST_ONLY', adapter:'PER_APPLICATION_TEST_ADAPTER', proofVerified:false, paymentAllowed:false, independentProductClaim:false };
  }
  return {
    snapshot(app) {
      hash32(app,'LAB_APPLICATION');
      return observed(async ({opts,block,config}) => {
        const [f,a,held,reserved,balance] = await Promise.all([
          vault.fixture(app,opts),vault.accounts(app,opts),vault.totalHeld(opts),vault.totalReserved(opts),token.balanceOf(pin.vault,opts),
        ]);
        const settlement = ['NONE','ALLOCATED','PAID','RECLAIMED'][Number(a.settlement)];
        const applicationReserved = settlement === 'ALLOCATED' ? a.allocated : 0n, t = BigInt(block.timestamp);
        check(balance >= held && held >= reserved && a.held >= applicationReserved
          && a.fundedTotal === a.held + a.paid + a.recovered, 'LAB_ACCOUNTING');
        const claimState = settlement === 'PAID' || settlement === 'RECLAIMED' ? settlement
          : t > config.claimUntil ? 'EXPIRED' : settlement === 'ALLOCATED' ? 'CLAIMABLE_TEST' : 'NOT_READY';
        return { applicationId:app, agreementHash:await vault.agreementHash(app,opts),
          registration:a.cancelled ? 'CANCELLED' : a.registered ? 'REGISTERED' : 'UNREGISTERED',
          consent:a.registered ? 'ONCHAIN_TEST_CONSENT' : 'NONE', eligibility:f.syntheticEligible ? 'FINAL_SYNTHETIC' : 'ON_HOLD',
          funding:settlement !== 'NONE' ? settlement : a.held === 0n ? 'UNFUNDED' : a.held < f.entitlement ? 'PARTIAL' : 'FUNDED',
          allocationWindow:t <= config.allocationUntil ? 'OPEN' : 'CLOSED', claimState,
          ...Object.fromEntries(Object.entries({entitlementAtoms:f.entitlement, fundedTotalAtoms:a.fundedTotal,
            securedAtoms:a.held, allocatedAtoms:a.allocated, reservedAtoms:applicationReserved, paidAtoms:a.paid,
            recoveredAtoms:a.recovered, unallocatedAtoms:a.held-applicationReserved,
            shortfallAtoms:settlement === 'NONE' && !a.cancelled && a.held < f.entitlement ? f.entitlement-a.held : 0n,
            contractBalanceAtoms:balance,totalHeldAtoms:held,totalReservedAtoms:reserved}).map(([k,v])=>[k,v.toString()])),
        };
      });
    },
    operation(app, operationId, amount) {
      hash32(app,'LAB_APPLICATION'); hash32(operationId,'LAB_OPERATION'); decimal(amount,'LAB_AMOUNT');
      check(operationId !== ZeroHash && BigInt(amount) > 0n,'LAB_OPERATION');
      return observed(async ({opts}) => {
        const stored = await vault.operations(operationId,opts), expected = await vault.operationHash(app,amount,opts);
        check(stored === ZeroHash || stored === expected,'LAB_OPERATION_CONFLICT');
        return { operationId, applicationId:app, amountAtoms:amount, applied:stored !== ZeroHash };
      });
    },
    confirmTopUp(app, operationId, amount, transactionHash) {
      hash32(app,'LAB_APPLICATION'); hash32(operationId,'LAB_OPERATION'); hash32(transactionHash,'LAB_TRANSACTION'); decimal(amount,'LAB_AMOUNT');
      check(operationId !== ZeroHash && BigInt(amount)>0n,'LAB_OPERATION');
      return observed(async ({n,opts,config}) => {
        const [tx,receipt] = await Promise.all([provider.send('eth_getTransactionByHash',[transactionHash]),provider.send('eth_getTransactionReceipt',[transactionHash])]);
        check(tx && receipt,'LAB_TX_UNKNOWN');
        check(tx.hash === transactionHash && receipt.transactionHash === transactionHash && tx.blockNumber === receipt.blockNumber, 'LAB_TX_BINDING');
        check(receipt.status === '0x1','LAB_TX_FAILED');
        const mined = Number(BigInt(receipt.blockNumber)); check(mined <= n,'LAB_CONFIRMATIONS');
        check((await blockAt(mined))?.hash === receipt.blockHash && tx.blockHash === receipt.blockHash,'LAB_REORG');
        check(getAddress(tx.to) === pin.vault && getAddress(tx.from) === config.sponsor
          && BigInt(tx.value) === 0n && tx.input === vault.interface.encodeFunctionData('topUp',[app,operationId,amount]),'LAB_TX_BINDING');
        check(await vault.operations(operationId,opts) === await vault.operationHash(app,amount,opts),'LAB_OPERATION_MISSING');
        // Idempotent duplicate calls have no new event/credit. The durable operation is authoritative.
        return { applicationId:app,operationId,amountAtoms:amount,transactionHash,applied:true };
      });
    },
  };
}
