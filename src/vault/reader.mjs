import { Contract, getAddress, Interface, keccak256, TypedDataEncoder } from 'ethers';
import { exactKeys, freeze, hash32, requireRule } from '../policy/values.mjs';
import { buildVault } from './build.mjs';
import { runtimeFields, runtimeHash, vaultDomain, finalDigest } from './encoding.mjs';

// Trusted server configuration supplies provider and deployment pin. This
// reader never signs/sends a transaction or accepts an HTTP-supplied RPC URL.
export function createVaultReader(provider, pin) {
  const fixed = structuredClone(pin), artifacts = buildVault();
  exactKeys(fixed, ['chainId', 'genesisHash', 'vaultAddress', 'deploymentTxHash'], 'VAULT_PIN');
  requireRule(Number.isSafeInteger(fixed.chainId) && fixed.chainId > 0, 'VAULT_CHAIN');
  fixed.vaultAddress = getAddress(fixed.vaultAddress);
  hash32(fixed.genesisHash, 'VAULT_GENESIS'); hash32(fixed.deploymentTxHash, 'VAULT_DEPLOYMENT');
  const vault = new Contract(fixed.vaultAddress, artifacts.CourseRefundVaultV4.abi, provider);
  const iface = new Interface(artifacts.CourseRefundVaultV4.abi), tokenInterface = new Interface(artifacts.ClearTestToken.abi);
  const block = number => provider.send('eth_getBlockByNumber', [number, false]);
  const receipt = tx => provider.send('eth_getTransactionReceipt', [tx]);
  async function canonicalReceipt(txHash) {
    hash32(txHash, 'TRANSACTION_HASH');
    const r = await receipt(txHash); requireRule(r && r.transactionHash === txHash && r.status === '0x1', 'FUNDING_UNCONFIRMED');
    requireRule((await block(r.blockNumber))?.hash === r.blockHash, 'CHAIN_REORG'); return r;
  }
  async function inspect() {
    requireRule(BigInt(await provider.send('eth_chainId', [])) === BigInt(fixed.chainId), 'VAULT_CHAIN');
    requireRule((await block('0x0'))?.hash === fixed.genesisHash, 'VAULT_GENESIS');
    const deployed = await canonicalReceipt(fixed.deploymentTxHash);
    requireRule(deployed.contractAddress && getAddress(deployed.contractAddress) === fixed.vaultAddress, 'VAULT_DEPLOYMENT');
    const at = await block('latest'); requireRule(at, 'CHAIN_UNAVAILABLE');
    requireRule(keccak256(await provider.send('eth_getCode', [fixed.vaultAddress, at.number])) === artifacts.CourseRefundVaultV4.codeHash, 'VAULT_CODE');
    const values = await vault.runtimeConfig({ blockTag: at.number });
    const config = Object.fromEntries(runtimeFields.map((key, i) => [key, typeof values[i] === 'bigint' ? String(values[i]) : values[i]]));
    const token = new Contract(config.token, artifacts.ClearTestToken.abi, provider);
    requireRule(keccak256(await provider.send('eth_getCode', [config.token, at.number])) === artifacts.ClearTestToken.codeHash, 'TOKEN_CODE');
    requireRule(await token.decimals({ blockTag: at.number }) === 6n, 'TOKEN_DECIMALS');
    const record = { config, runtimeConfigHash: runtimeHash(config), deployment: { ...fixed,
      deploymentBlock: String(BigInt(deployed.blockNumber)), deploymentBlockHash: deployed.blockHash,
      vaultCodeHash: artifacts.CourseRefundVaultV4.codeHash, tokenCodeHash: artifacts.ClearTestToken.codeHash } };
    requireRule(await vault.runtimeConfigHash({ blockTag: at.number }) === record.runtimeConfigHash, 'RUNTIME_HASH');
    requireRule(await vault.domainSeparator({ blockTag: at.number }) === TypedDataEncoder.hashDomain(vaultDomain(record)), 'VAULT_DOMAIN');
    requireRule((await block(at.number))?.hash === at.hash, 'CHAIN_REORG');
    return freeze(record);
  }
  function fundingTransaction(record, typed, signature) {
    return { to: record.deployment.vaultAddress, from: record.config.sponsor, chainId: record.deployment.chainId,
      value: '0x0', data: iface.encodeFunctionData('enrollAndFund', [typed.message, signature]) };
  }
  async function requireUnfundedAfter(applicationId, expiresAt) {
    await inspect();
    const at = await block('latest');
    requireRule(BigInt(at.timestamp) >= BigInt(expiresAt), 'FINAL_CONSENT_ACTIVE');
    const e = await vault.enrollments(applicationId, { blockTag: at.number });
    requireRule(e.learner === '0x0000000000000000000000000000000000000000', 'FUNDING_RECOVERY_REQUIRED');
    requireRule((await block(at.number))?.hash === at.hash, 'CHAIN_REORG');
  }
  async function fundingEvidence(record, typed, signature, txHash) {
    const current = await inspect(); requireRule(current.runtimeConfigHash === record.runtimeConfigHash, 'RUNTIME_CHANGED');
    const r = await canonicalReceipt(txHash), tx = await provider.send('eth_getTransactionByHash', [txHash]);
    const expected = fundingTransaction(record, typed, signature);
    requireRule(tx && tx.blockHash === r.blockHash && tx.hash === txHash && getAddress(tx.from) === expected.from && tx.to && getAddress(tx.to) === expected.to
      && tx.input === expected.data && BigInt(tx.value) === 0n, 'FUNDING_TRANSACTION');
    const events = r.logs.filter(log => getAddress(log.address) === expected.to).map(log => { try { return iface.parseLog(log); } catch { return null; } });
    const event = events.find(e => e?.name === 'Enrolled');
    requireRule(event && event.args.applicationId === typed.message.applicationId && event.args.learner === typed.message.learner
      && event.args.consentDigest === finalDigest(typed) && String(event.args.amount) === record.config.amount, 'FUNDING_EVENT');
    const transfers = r.logs.filter(log => getAddress(log.address) === record.config.token).map(log => { try { return tokenInterface.parseLog(log); } catch { return null; } });
    requireRule(transfers.some(e => e?.name === 'Transfer' && e.args.from === record.config.sponsor
      && e.args.to === expected.to && String(e.args.value) === record.config.amount), 'FUNDING_TRANSFER');
    const e = await vault.enrollments(typed.message.applicationId, { blockTag: r.blockNumber });
    requireRule(e.learner === typed.message.learner && e.consentDigest === finalDigest(typed) && !e.settled, 'FUNDING_STATE');
    const token = new Contract(record.config.token, artifacts.ClearTestToken.abi, provider);
    requireRule(await token.balanceOf(expected.to, { blockTag: r.blockNumber }) >= await vault.totalReserved({ blockTag: r.blockNumber }), 'RESERVES');
    requireRule((await block(r.blockNumber))?.hash === r.blockHash, 'CHAIN_REORG');
    return { transactionHash: txHash, blockNumber: String(BigInt(r.blockNumber)), blockHash: r.blockHash };
  }
  return Object.freeze({ inspect, fundingTransaction, fundingEvidence, requireUnfundedAfter });
}
