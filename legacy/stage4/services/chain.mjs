import ganache from 'ganache';
import { JsonRpcProvider, Wallet, ContractFactory, keccak256 } from 'ethers';
import { compile } from '../../stage2/lib/local.mjs';
import { AMOUNT, EXPIRY, STATEMENT, termsHash } from '../../stage2/lib/evidence.mjs';

const port = Number(process.env.CHAIN_PORT ?? 8545);
const sponsorKey = process.env.SPONSOR_KEY;
const issuerAddress = process.env.ISSUER_ADDRESS;
if (!sponsorKey || !issuerAddress) throw new Error('CHAIN_CONFIGURATION');
const sponsorWallet = new Wallet(sponsorKey);
const server = ganache.server({ logging: { quiet: true },
  chain: { chainId: 31337, hardfork: 'shanghai', time: new Date('2026-09-13T00:00:00Z') },
  miner: { timestampIncrement: 0 },
  wallet: { accounts: [{ secretKey: sponsorKey, balance: '0x3635c9adc5dea00000' }] } });
await server.listen(port, '127.0.0.1');
const provider = new JsonRpcProvider(`http://127.0.0.1:${port}`, undefined, { cacheTimeout: -1 });
const sponsor = sponsorWallet.connect(provider);
try {
  const artifacts = compile();
  async function deploy(name, args = []) {
    const artifact = artifacts[name];
    const contract = await new ContractFactory(artifact.abi, artifact.evm.bytecode.object, sponsor).deploy(...args);
    await contract.waitForDeployment();
    return contract;
  }
  const token = await deploy('TestToken');
  const start = Number((await provider.getBlock('latest')).timestamp);
  const terms = { version: 1, courseId: 'refund-course-001', submissionIds: [0, 1, 2, 3],
    amount: AMOUNT.toString(), tokenDecimals: 6, tokenSymbol: 'TEST', chainId: 31337,
    token: token.target, issuer: issuerAddress, sponsor: sponsorWallet.address,
    start, due: start + 86400, claimUntil: start + 86400 + 604800,
    expiryPolicy: EXPIRY, evidenceStatement: STATEMENT };
  const hash = termsHash(terms);
  const vault = await deploy('RefundVault', [token.target, issuerAddress, hash, terms.start, terms.due, terms.claimUntil]);
  const deployed = await vault.deploymentTransaction().wait();
  await (await token.mint(sponsorWallet.address, AMOUNT * 2n)).wait();
  await (await token.approve(vault.target, AMOUNT * 2n)).wait();
  const manifest = { manifestVersion: 1, terms, termsHash: hash,
    domain: { name: 'RefundRights', version: '2', chainId: 31337, verifyingContract: vault.target },
    deployment: { genesisHash: (await provider.getBlock(0)).hash, blockNumber: deployed.blockNumber,
      blockHash: deployed.blockHash, vaultCodeHash: keccak256(await provider.getCode(vault.target)), tokenCodeHash: keccak256(await provider.getCode(token.target)) } };
  process.send?.({ type: 'ready', service: 'chain', port, manifest });
} catch (error) {
  process.send?.({ type: 'failed', service: 'chain', code: 'CHAIN_SETUP_FAILED' });
  await provider.destroy(); await server.close(); process.exit(1);
}
const stop = async () => { await provider.destroy(); await server.close(); process.exit(0); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
