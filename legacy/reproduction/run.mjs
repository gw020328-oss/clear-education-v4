import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

// Resolve the isolated dependency copy; experiment logic is unchanged.
const require = createRequire(new URL('../package.json', import.meta.url));
const solc = require('solc'), ganache = require('ganache');
const { BrowserProvider, ContractFactory, Wallet, id, verifyTypedData, TypedDataEncoder } = require('ethers');
const source = readFileSync(new URL('RefundVault.sol', import.meta.url), 'utf8');
const compilerInput = { language: 'Solidity', sources: { 'RefundVault.sol': { content: source } }, settings: {
  optimizer: { enabled: true, runs: 200 }, evmVersion: 'shanghai',
  outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } }
} };
const compiled = JSON.parse(solc.compile(JSON.stringify(compilerInput)));
const errors = (compiled.errors ?? []).filter(e => e.severity === 'error');
assert.equal(errors.length, 0, JSON.stringify(errors));
const artifacts = compiled.contracts['RefundVault.sol'];
const rpc = ganache.provider({ logging: { quiet: true }, chain: { chainId: 31337, hardfork: 'shanghai' }, wallet: { deterministic: true, totalAccounts: 7 } });
const provider = new BrowserProvider(rpc);
provider.pollingInterval = 10;
const wallets = Object.values(rpc.getInitialAccounts()).map(a => new Wallet(a.secretKey));
const [sponsor, learner, verifier, attacker, other] = wallets;
const funder = await provider.getSigner(sponsor.address), relayer = await provider.getSigner(attacker.address);
const log = [], rows = [], auxiliary = [];
async function tx(label, action) {
  try {
    const receipt = await (await action()).wait();
    const item = { label, accepted: true, transactionHash: receipt.hash, blockNumber: receipt.blockNumber, gasUsed: Number(receipt.gasUsed) };
    log.push(item); return item;
  } catch (e) {
    const item = { label, accepted: false, transactionHash: e.receipt?.hash ?? null,
      gasUsed: e.receipt ? Number(e.receipt.gasUsed) : null, reason: e.shortMessage ?? e.message };
    log.push(item); return item;
  }
}
const now = async () => Number((await rpc.request({ method: 'eth_getBlockByNumber', params: ['latest', false] })).timestamp);
async function deploy(name, args) {
  const a = artifacts[name];
  const c = await new ContractFactory(a.abi, a.evm.bytecode.object, funder).deploy(...args);
  await c.waitForDeployment();
  const r = await c.deploymentTransaction().wait();
  log.push({ label: `deploy-${name}`, accepted: true, gasUsed: Number(r.gasUsed), transactionHash: r.hash });
  return c;
}
const token = await deploy('TestToken', []);
const start = await now(), due = start + 86400, claimUntil = due + 604800;
const termsHash = id('four-unique-submission-receipts;reward=50-mock-units;v1');
const vault = await deploy('RefundVault', [await token.getAddress(), verifier.address, termsHash, start, due, claimUntil]);
const domain = { name: 'RefundRights', version: '1', chainId: 31337, verifyingContract: await vault.getAddress() };
const types = { Receipt: [ { name: 'termsHash', type: 'bytes32' }, { name: 'learner', type: 'address' }, { name: 'session', type: 'uint32' }, { name: 'completedAt', type: 'uint64' } ] };
const amount = 50_000_000n;
assert((await tx('mint', () => token.mint(sponsor.address, amount * 10n))).accepted);
assert((await tx('approve', () => token.approve(vault.target, amount * 10n))).accepted);
assert((await tx('enroll', () => vault.enroll(learner.address))).accepted);
assert.equal(await token.balanceOf(vault.target), amount);
async function packet({ signer = verifier, beneficiary = learner.address, hash = termsHash } = {}) {
  const receipts = Array.from({ length: 4 }, (_, session) => ({ termsHash: hash, learner: beneficiary, session, completedAt: start }));
  const signatures = await Promise.all(receipts.map(r => signer.signTypedData(domain, types, r)));
  return { receipts, signatures };
}
const good = await packet();
assert.equal(await vault.digest(good.receipts[0]), TypedDataEncoder.hash(domain, types, good.receipts[0]));

class CentralEscrow {
  constructor() { this.reserve = amount; this.paid = false; this.engine = true; }
  claim(p, time) {
    if (!this.engine) return { accepted: false, reason: 'independent central executor unavailable/refuses; rights/appeals not extinguished' };
    if (this.paid || this.reserve !== amount || time > claimUntil || p.receipts.length !== 4 || p.signatures.length !== 4) return { accepted: false, reason: 'state/count/time' };
    const seen = new Set();
    for (let i = 0; i < 4; i++) {
      const r = p.receipts[i];
      if (r.termsHash !== termsHash || r.learner !== learner.address || r.session < 0 || r.session >= 4 || seen.has(r.session) || r.completedAt < start || r.completedAt > due || r.completedAt > time) return { accepted: false, reason: 'scope/duplicate/time' };
      try { if (verifyTypedData(domain, types, r, p.signatures[i]) !== verifier.address) return { accepted: false, reason: 'signature' }; }
      catch { return { accepted: false, reason: 'malformed signature' }; }
      seen.add(r.session);
    }
    this.paid = true; this.reserve = 0n; return { accepted: true, paidUnits: 50 };
  }
}
let snapshot = await rpc.request({ method: 'evm_snapshot', params: [] });
async function reset() {
  assert(await rpc.request({ method: 'evm_revert', params: [snapshot] }));
  snapshot = await rpc.request({ method: 'evm_snapshot', params: [] });
}
const onchainClaim = (label, p, signer = relayer) => tx(label, () => vault.connect(signer).claim(learner.address, p.receipts, p.signatures, { gasLimit: 600000 }));
const scenarios = [
  ['normal', true, true], ['school-refuses', true, true], ['school-offline-exported-receipts', true, true],
  ['ui-offline-direct-api-rpc', true, true], ['escrow-executor-refuses', false, true],
  ['verifier-withholds-last-receipt', false, false], ['forged-signatures', false, false],
  ['duplicate-receipt', false, false], ['other-learner', false, false], ['changed-terms', false, false],
  ['replay-claim', false, false], ['claim-expired', false, false],
  ['compromised-verifier-false-evidence', true, true], ['escrow-engine-offline', false, true]
];
try {
  for (const [name, expectedCentral, expectedChain] of scenarios) {
    await reset(); const central = new CentralEscrow(); let p = structuredClone(good);
    if (name === 'escrow-executor-refuses' || name === 'escrow-engine-offline') central.engine = false;
    if (name === 'verifier-withholds-last-receipt') { p.receipts.pop(); p.signatures.pop(); }
    if (name === 'forged-signatures') p = await packet({ signer: attacker });
    if (name === 'duplicate-receipt') { p.receipts[3] = p.receipts[0]; p.signatures[3] = p.signatures[0]; }
    if (name === 'other-learner') p = await packet({ beneficiary: other.address });
    if (name === 'changed-terms') p = await packet({ hash: id('different-condition-v2') });
    if (name === 'replay-claim') { assert(central.claim(p, await now()).accepted); assert((await onchainClaim('first-claim', p)).accepted); }
    if (name === 'claim-expired') {
      await rpc.request({ method: 'evm_increaseTime', params: [claimUntil - await now() + 1] });
      await rpc.request({ method: 'evm_mine', params: [] });
    }
    const before = await token.balanceOf(learner.address);
    const c = central.claim(p, await now()), o = await onchainClaim(name, p);
    assert.equal(c.accepted, expectedCentral, `${name}: central`);
    assert.equal(o.accepted, expectedChain, `${name}: EVM`);
    assert.equal((await token.balanceOf(learner.address)) - before, o.accepted ? amount : 0n, name);
    rows.push({ scenario: name, central: c, onchain: o,
      note: name === 'compromised-verifier-false-evidence' ? 'Shared failure: false real-world claim passes with a genuine issuer signature.' :
      name.startsWith('school-') || name.startsWith('ui-') ? 'Fault boundary simulated by removal of school/UI dependence; no real remote server was shut down.' : '' });
    console.log(`${name}: central=${c.accepted}, EVM=${o.accepted}`);
  }
  await reset();
  assert((await tx('zero-allowance', () => token.approve(vault.target, 0))).accepted);
  const unfunded = await tx('unfunded-enrollment', () => vault.enroll(other.address, { gasLimit: 200000 }));
  assert(!unfunded.accepted); assert(!(await vault.enrolled(other.address)));
  auxiliary.push({ scenario: 'unfunded-enrollment', passed: true });
  await reset();
  assert(!(await tx('early-sponsor-reclaim', () => vault.reclaimExpired(learner.address, { gasLimit: 200000 }))).accepted);
  auxiliary.push({ scenario: 'early-sponsor-reclaim-blocked', passed: true });
  await reset();
  await rpc.request({ method: 'evm_increaseTime', params: [claimUntil - await now() + 1] });
  await rpc.request({ method: 'evm_mine', params: [] });
  assert((await tx('expired-reclaim', () => vault.reclaimExpired(learner.address))).accepted);
  assert.equal(await token.balanceOf(vault.target), 0n);
  auxiliary.push({ scenario: 'expired-reserve-returned-to-sponsor', passed: true });
  await reset();
  assert((await tx('token-freeze', () => token.setFrozen(true))).accepted);
  assert(!(await onchainClaim('frozen-token-claim', good)).accepted);
  assert(!(await vault.settled(learner.address)));
  assert((await tx('token-unfreeze', () => token.setFrozen(false))).accepted);
  assert((await onchainClaim('claim-after-unfreeze', good)).accepted);
  auxiliary.push({ scenario: 'token-freeze-blocks-and-rolls-back-claim', passed: true });
  await reset();
  const emptyWallet = Wallet.createRandom().connect(provider);
  assert(!(await onchainClaim('no-gas-submitter', good, emptyWallet)).accepted);
  assert((await onchainClaim('alternative-relayer', good)).accepted);
  assert.equal(await token.balanceOf(learner.address), amount);
  assert.equal(await token.balanceOf(attacker.address), 0n);
  auxiliary.push({ scenario: 'no-gas-submitter-fails-alternative-relayer-pays-fixed-learner', passed: true });
  const result = {
    generatedAt: new Date().toISOString(), methodology: 'central policy model vs actual local Ganache EVM; mock signed evidence, no live payments or user data',
    versions: { node: process.version, solc: solc.version(), ethers: require('ethers').version, ganache: require('ganache/package.json').version },
    protocolSHA256: createHash('sha256').update(readFileSync(new URL('PROTOCOL.md', import.meta.url))).digest('hex'),
    sourceSHA256: createHash('sha256').update(source).digest('hex'),
    runnerSHA256: createHash('sha256').update(readFileSync(new URL('run.mjs', import.meta.url))).digest('hex'),
    compilerSettings: compilerInput.settings, conditions: { start, due, claimUntil, amount: amount.toString(), domain, termsHash },
    scenarios: rows, auxiliary, transactions: log,
    summary: { cases: rows.length, expectedOutcomesMatched: rows.length, differingCases: rows.filter(r => r.central.accepted !== r.onchain.accepted).map(r => r.scenario),
      normalClaimGas: rows[0].onchain.gasUsed,
      deploymentGas: log.find(x => x.label === 'deploy-RefundVault').gasUsed,
      enrollmentGas: log.find(x => x.label === 'enroll').gasUsed,
      approvalGas: log.find(x => x.label === 'approve').gasUsed,
      runtimeBytes: artifacts.RefundVault.evm.deployedBytecode.object.length / 2,
      interpretation: 'Distinct immediate-settlement authority under one executor-failure threat family; not an empirical success rate or security audit.' }
  };
  writeFileSync(new URL('results.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result.summary, null, 2));
} finally { provider.destroy(); await rpc.disconnect(); }
