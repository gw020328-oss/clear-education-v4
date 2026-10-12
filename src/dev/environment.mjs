import { existsSync, lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomBytes, randomInt } from 'node:crypto';
import ganache from 'ganache';
import { BrowserProvider, ContractFactory, id, NonceManager, Wallet } from 'ethers';
import { createApplicationService } from '../application/service.mjs';
import { compileSyntheticPolicy, COMPLETION_RULE_VERSION } from '../policy/compiler.mjs';
import { buildVault } from '../vault/build.mjs';
import { createVaultReader } from '../vault/reader.mjs';
import { canonical } from '../policy/values.mjs';
import { check, lock, privateDirectory, privateRead, readJson, writeJson } from './files.mjs';
import { createCertificates, loadTls } from './tls.mjs';

const roles = ['operator', 'learner', 'learner2', 'issuer', 'outage'];
export function syntheticDraft(instanceId, now) {
  const stamp = days => String(now + days * 86400);
  const date = new Date(now * 1000).toISOString().slice(0, 10);
  return { schemaVersion: 4, cohortId: 'dev-' + instanceId.slice(2, 18), policyVersion: '1', dataMode: 'SYNTHETIC',
    examType: 'TOEIC_LR', minScore: 800, minCompletionBps: 8000, examDateStart: date, examDateEnd: date,
    learningStart: stamp(-1), learningEnd: stamp(7), requiredLectureIds: ['demo-1', 'demo-2', 'demo-3', 'demo-4', 'demo-5'],
    completionRuleVersion: COMPLETION_RULE_VERSION, enrollmentStart: stamp(-1), enrollmentUntil: stamp(14),
    normalSubmitFrom: stamp(14), normalSubmitAt: stamp(21), amount: '50000000', tokenDecimals: 6,
    sourcePolicySetHash: id('CLEAR_LOCAL_SYNTHETIC_ONLY'), privacyNoticeVersion: 'dev-synthetic-1' };
}

function walletSet(directory, config) {
  const keys = readJson(join(directory, 'wallets.json'));
  check(Object.keys(keys).sort().join() === [...roles].sort().join(), 'DEV_WALLETS');
  const wallets = Object.fromEntries(roles.map(role => [role, new Wallet(keys[role])]));
  check(roles.every(role => wallets[role].address === config.accounts[role]), 'DEV_WALLETS');
  return wallets;
}
function chain(directory, config, wallets) {
  const raw = ganache.provider({ logging: { quiet: true }, database: { dbPath: join(directory, 'chain') },
    chain: { chainId: config.chainId, networkId: config.chainId, hardfork: 'shanghai' },
    wallet: { locked: true, accounts: roles.map(role => ({ secretKey: wallets[role].privateKey, balance: '0x3635c9adc5dea00000' })) } });
  const provider = new BrowserProvider(raw, undefined, { cacheTimeout: -1 });
  provider.pollingInterval = 50;
  return { raw, provider, async close() { provider.destroy(); await raw.disconnect(); } };
}
function serviceOptions(directory, config, reader) {
  return { directory: join(directory, 'application'), origin: config.origin, chainId: config.chainId,
    instanceId: config.instanceId, participants: [config.accounts.learner, config.accounts.learner2],
    operators: [config.accounts.operator], vaultReader: reader };
}
async function operatorLogin(service, config, wallet) {
  const challenge = service.challenge({ wallet: wallet.address, chainId: config.chainId });
  const result = service.login({ nonce: challenge.nonce, signature: await wallet.signMessage(challenge.message) }, challenge.browserToken);
  return { token: result.token, wallet: result.wallet, chainId: config.chainId, csrf: result.csrf };
}

export async function initializeEnvironment({ directory, port = 8443 }) {
  check(Number.isInteger(port) && port >= 1024 && port <= 65535, 'DEV_PORT');
  const root = resolve(directory);
  check(realpathSync(dirname(root)) === dirname(root), 'DEV_DIRECTORY');
  // No recursive mkdir here: an existing directory is never overwritten/resumed.
  mkdirSync(root, { mode: 0o700 });
  privateDirectory(root);
  const release = lock(root);
  let node, service;
  try {
    const wallets = Object.fromEntries(roles.map(role => [role, Wallet.createRandom()]));
    writeJson(join(root, 'wallets.json'), Object.fromEntries(roles.map(role => [role, wallets[role].privateKey])));
    const instanceId = '0x' + randomBytes(32).toString('hex');
    const config = { version: 1, profile: 'CLEAR_LOCAL_SYNTHETIC', directory: root,
      origin: `https://127.0.0.1:${port}`, chainId: randomInt(1000000000, 2000000000), instanceId,
      accounts: Object.fromEntries(roles.map(role => [role, wallets[role].address])),
      draft: syntheticDraft(instanceId, Math.floor(Date.now() / 1000)) };
    config.caFingerprint = createCertificates(root);
    node = chain(root, config, wallets);
    const signer = new NonceManager(wallets.operator.connect(node.provider)), artifacts = buildVault();
    const token = await new ContractFactory(artifacts.ClearTestToken.abi, artifacts.ClearTestToken.bytecode, signer).deploy(1000000000000n);
    await token.waitForDeployment();
    const compiled = compileSyntheticPolicy(config.draft), p = compiled.policy;
    const runtime = { configVersion: '4', instanceId, cohortId: id(p.cohortId), policyHash: compiled.policyHash,
      token: await token.getAddress(), sponsor: wallets.operator.address, issuer: wallets.issuer.address, outageSigner: wallets.outage.address,
      ...Object.fromEntries(['amount', 'enrollmentStart', 'enrollmentUntil', 'normalSubmitFrom', 'normalSubmitAt', 'supplementEndAt', 'claimUntil'].map(k => [k, p[k]])) };
    const vault = await new ContractFactory(artifacts.CourseRefundVaultV4.abi, artifacts.CourseRefundVaultV4.bytecode, signer).deploy(runtime);
    await vault.waitForDeployment();
    config.pin = { chainId: config.chainId, genesisHash: (await node.provider.send('eth_getBlockByNumber', ['0x0', false])).hash,
      vaultAddress: await vault.getAddress(), deploymentTxHash: vault.deploymentTransaction().hash };
    const reader = createVaultReader(node.provider, config.pin);
    service = createApplicationService(serviceOptions(root, config, reader));
    const context = await operatorLogin(service, config, wallets.operator);
    service.registerPolicy(context, config.draft);
    const record = await service.bindRuntime(context, { policyHash: compiled.policyHash });
    service.logout(context);
    config.runtimeConfigHash = record.runtimeConfigHash;
    // Written last; interrupted initialization is never treated as runnable.
    writeJson(join(root, 'environment.json'), config);
    return publicConfig(config);
  } finally {
    try { service?.close(); } finally { try { await node?.close(); } finally { release(); } }
  }
}

export function readEnvironment(directory) {
  const root = privateDirectory(directory), config = readJson(join(root, 'environment.json'));
  check(config.version === 1 && config.profile === 'CLEAR_LOCAL_SYNTHETIC' && config.directory === root, 'DEV_ENVIRONMENT');
  const url = new URL(config.origin);
  check(url.origin === config.origin && url.protocol === 'https:' && url.hostname === '127.0.0.1'
    && Number(url.port) >= 1024 && Number(url.port) <= 65535, 'DEV_ORIGIN');
  check(Number.isInteger(config.chainId) && config.chainId >= 1000000000 && config.chainId < 2000000000
    && config.pin.chainId === config.chainId && /^0x[0-9a-f]{64}$/.test(config.instanceId), 'DEV_ENVIRONMENT');
  return config;
}

export async function openEnvironment(directory) {
  const config = readEnvironment(directory), root = config.directory, release = lock(root);
  let node, service;
  try {
    const tls = loadTls(root, config.caFingerprint), wallets = walletSet(root, config);
    // Missing persistent state is an error, never permission to reset a chain/DB.
    check(lstatSync(join(root, 'chain')).isDirectory() && realpathSync(join(root, 'chain')) === join(root, 'chain')
      && existsSync(join(root, 'chain', 'CURRENT')), 'DEV_CHAIN_MISSING');
    privateDirectory(join(root, 'application'));
    privateRead(join(root, 'application', 'applications.sqlite'));
    node = chain(root, config, wallets);
    const reader = createVaultReader(node.provider, config.pin), record = await reader.inspect();
    const compiled = compileSyntheticPolicy(config.draft);
    check(record.config.instanceId === config.instanceId && record.config.policyHash === compiled.policyHash
      && record.config.sponsor === config.accounts.operator && record.runtimeConfigHash === config.runtimeConfigHash, 'DEV_ENVIRONMENT');
    service = createApplicationService(serviceOptions(root, config, reader));
    // Check persisted policy/runtime through the existing authenticated service.
    const context = await operatorLogin(service, config, wallets.operator);
    try {
      check(canonical(service.getPolicy(context, compiled.policyHash)) === canonical(compiled)
        && canonical(service.getRuntime(context, compiled.policyHash)) === canonical(record), 'DEV_ENVIRONMENT');
    } finally { service.logout(context); }
    let closed = false;
    return { config, tls, service, raw: node.raw,
      async close() {
        if (closed) return; closed = true;
        try { service.close(); } finally { try { await node.close(); } finally { release(); } }
      } };
  } catch (error) {
    try { service?.close(); } finally { try { await node?.close(); } finally { release(); } }
    throw error;
  }
}

export function publicConfig(config) {
  return { dataMode: 'SYNTHETIC', paymentAllowed: false, usableForClaim: false,
    origin: config.origin, rpcUrl: config.origin + '/rpc', chainId: config.chainId, instanceId: config.instanceId,
    accounts: config.accounts, policyHash: compileSyntheticPolicy(config.draft).policyHash,
    vaultAddress: config.pin.vaultAddress, runtimeConfigHash: config.runtimeConfigHash };
}
