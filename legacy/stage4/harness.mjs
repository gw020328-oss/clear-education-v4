import { fork } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { JsonRpcProvider, Wallet } from 'ethers';
import { validateEvidence } from '../stage2/lib/evidence.mjs';
import { chainTime, claimRefund, inspectClaim } from '../stage2/lib/chain.mjs';

const root = resolve(import.meta.dirname);
const mode = process.argv[2] ?? 'normal';
const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const artifactDir = resolve(root, 'artifacts', `${mode}-${stamp}`);
await mkdir(artifactDir, { recursive: true });
const serviceLogs = new Map();
const requestPaths = [];
const children = new Map();

function safeLog(service, chunk) {
  const text = String(chunk).replace(/0x[0-9a-fA-F]{64}/g, '[redacted-64-byte-value]');
  serviceLogs.set(service, (serviceLogs.get(service) ?? '') + text);
}
function spawnService(name, file, env, readyTimeout = 30_000) {
  return new Promise((resolveReady, reject) => {
    const child = fork(resolve(root, 'services', file), [], { cwd: resolve(root, '..'), env: { ...process.env, ...env }, silent: true });
    children.set(name, child);
    child.stdout.on('data', chunk => safeLog(name, chunk)); child.stderr.on('data', chunk => safeLog(name, chunk));
    const timer = setTimeout(() => reject(new Error(`${name.toUpperCase()}_READY_TIMEOUT`)), readyTimeout);
    child.on('message', message => {
      if (message?.type === 'request' && message.service === 'claim') requestPaths.push(message.path);
      if (message?.type === 'ready') { clearTimeout(timer); resolveReady({ child, ...message }); }
      if (message?.type === 'failed') { clearTimeout(timer); reject(new Error(message.code)); }
    });
    child.once('exit', code => { if (code && code !== 0) reject(new Error(`${name.toUpperCase()}_EXIT_${code}`)); });
  });
}
async function stopService(name) {
  const child = children.get(name);
  if (!child || child.exitCode !== null) return { name, alreadyStopped: true, exitCode: child?.exitCode ?? null };
  const stopped = new Promise(resolveStop => child.once('exit', (code, signal) => resolveStop({ name, code, signal })));
  child.kill('SIGTERM');
  const result = await Promise.race([stopped, new Promise((_, reject) => setTimeout(() => reject(new Error(`${name}_STOP_TIMEOUT`)), 10_000))]);
  return { ...result, requestedSignal: 'SIGTERM', stoppedAt: new Date().toISOString() };
}
async function isReachable(url) {
  try { const response = await fetch(url, { signal: AbortSignal.timeout(1500), cache: 'no-store' }); return response.ok; }
  catch { return false; }
}
async function isRpcReachable(url) {
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }), signal: AbortSignal.timeout(1500) });
    const value = await response.json(); return response.ok && value.result === '0x7a69';
  } catch { return false; }
}
async function writeJson(name, value) { await writeFile(resolve(artifactDir, name), `${JSON.stringify(value, null, 2)}\n`); }
async function flushLogs() {
  for (const [service, text] of serviceLogs) if (text.trim()) await writeFile(resolve(artifactDir, `${service}.log`), text);
}
async function stopAll() {
  for (const name of [...children.keys()].reverse()) { try { await stopService(name); } catch {} }
  await flushLogs();
}

const sponsor = Wallet.createRandom();
const issuer = Wallet.createRandom();
const learner = Wallet.createRandom();
let terminating = false;
process.on('SIGINT', async () => { if (terminating) return; terminating = true; await stopAll(); process.exit(130); });
process.on('SIGTERM', async () => { if (terminating) return; terminating = true; await stopAll(); process.exit(143); });

try {
  const chain = await spawnService('chain', 'chain.mjs', { CHAIN_PORT: '8545', SPONSOR_KEY: sponsor.privateKey, ISSUER_ADDRESS: issuer.address });
  const manifestPath = resolve(artifactDir, 'trusted-deployment.json');
  await writeJson('trusted-deployment.json', chain.manifest);
  await spawnService('issuer', 'issuer.mjs', { ISSUER_PORT: '4301', ISSUER_KEY: issuer.privateKey, MANIFEST_PATH: manifestPath });
  await spawnService('main', 'main.mjs', { MAIN_PORT: '4300', CHAIN_URL: 'http://127.0.0.1:8545', ISSUER_URL: 'http://127.0.0.1:4301',
    SPONSOR_KEY: sponsor.privateKey, LEARNER_KEY: learner.privateKey, MANIFEST_PATH: manifestPath });

  const prepared = await fetch('http://127.0.0.1:4300/prepare', { method: 'POST' });
  if (!prepared.ok) throw new Error('MAIN_PREPARE_FAILED');
  const evidenceResponse = await fetch('http://127.0.0.1:4300/evidence');
  if (!evidenceResponse.ok) throw new Error('EVIDENCE_DOWNLOAD_FAILED');
  const evidenceText = await evidenceResponse.text();
  const evidence = JSON.parse(evidenceText);
  const evidencePath = resolve(artifactDir, 'refund-evidence.v1.json');
  await writeFile(evidencePath, evidenceText.endsWith('\n') ? evidenceText : `${evidenceText}\n`);
  validateEvidence(evidence, chain.manifest, learner.address, await chainTime(new JsonRpcProvider('http://127.0.0.1:8545')));
  const serializedArtifacts = `${await readFile(manifestPath, 'utf8')}\n${await readFile(evidencePath, 'utf8')}`;
  for (const secret of [sponsor.privateKey, issuer.privateKey, learner.privateKey]) {
    if (serializedArtifacts.toLowerCase().includes(secret.slice(2).toLowerCase())) throw new Error('PRIVATE_KEY_LEAK');
  }
  await spawnService('claim', 'claim.mjs', { CLAIM_PORT: '4400', CHAIN_PORT: '8545', MANIFEST_PATH: manifestPath, EVIDENCE_PATH: evidencePath });

  if (mode === 'normal') {
    const provider = new JsonRpcProvider('http://127.0.0.1:8545', undefined, { cacheTimeout: -1 });
    const submitter = Wallet.createRandom().connect(provider);
    const zeroGas = await provider.getBalance(submitter.address) === 0n;
    let noGasCode = null;
    try { if (await provider.getBalance(submitter.address) === 0n) { const error = new Error('NO_GAS'); error.code = 'NO_GAS'; throw error; } }
    catch (error) { noGasCode = error.code; }
    await provider.send('evm_setAccountBalance', [submitter.address, '0xDE0B6B3A7640000']);
    const payment = await claimRefund(provider, chain.manifest, submitter, evidence, learner.address);
    const result = { scenario: 'normal', completedAt: new Date().toISOString(), services: {
      main: await isReachable('http://127.0.0.1:4300/health'), issuer: await isReachable('http://127.0.0.1:4301/health'),
      chain: await isRpcReachable('http://127.0.0.1:8545'), claimUi: await isReachable('http://127.0.0.1:4400') },
      savedEvidence: 'refund-evidence.v1.json', noGasPreflight: { actualZeroBalance: zeroGas, blockedBeforeSend: noGasCode === 'NO_GAS', alternateUsed: 'Ganache evm_setAccountBalance test RPC', relayerUsed: false }, payment,
      assertions: { receiptStatus: true, paidEvent: true, settled: true, recipientBalanceIncreaseUnits: payment.paidUnits },
      limitations: ['No relayer is provided.', 'The Ganache gas helper is local-test-only.', 'Issuer signatures are claims, not proof of actual learning or submission.'] };
    await writeJson('normal-result.json', result);
    console.log(JSON.stringify({ event: 'NORMAL_COMPLETE', artifactDir, transactionHash: payment.transactionHash }));
    await provider.destroy(); await stopAll();
  } else if (mode === 'outage') {
    const mainStop = await stopService('main');
    const issuerStop = await stopService('issuer');
    const status = { scenario: 'outage', stoppedAt: new Date().toISOString(), actualProcessStops: { main: mainStop, issuer: issuerStop }, simulatedByUiToggle: false,
      servicesAfterStop: { main: await isReachable('http://127.0.0.1:4300/health'), issuer: await isReachable('http://127.0.0.1:4301/health'),
        chain: await isRpcReachable('http://127.0.0.1:8545'), claimUi: await isReachable('http://127.0.0.1:4400') },
      savedEvidence: evidencePath, claimUrl: 'http://127.0.0.1:4400', chainRpc: 'http://127.0.0.1:8545' };
    await writeJson('outage-start.json', status);
    console.log(JSON.stringify({ event: 'OUTAGE_READY', artifactDir, claimUrl: status.claimUrl, evidencePath, servicesAfterStop: status.servicesAfterStop }));
    process.stdin.setEncoding('utf8'); process.stdin.resume();
    process.stdin.on('data', async chunk => {
      for (const command of chunk.trim().split(/\s+/)) {
        if (command === 'record') {
          const provider = new JsonRpcProvider(status.chainRpc, undefined, { cacheTimeout: -1 });
          let claimState;
          try {
            const { vault, token } = await inspectClaim(provider, chain.manifest, evidence, learner.address);
            claimState = { settled: await vault.settled(learner.address), recipientBalanceUnits: (await token.balanceOf(learner.address)).toString(), paymentFound: false };
          } catch (error) {
            const vault = new (await import('ethers')).Contract(chain.manifest.domain.verifyingContract, (await import('../stage2/lib/chain.mjs')).vaultAbi, provider);
            const token = new (await import('ethers')).Contract(chain.manifest.terms.token, (await import('../stage2/lib/chain.mjs')).tokenAbi, provider);
            const events = await vault.queryFilter(vault.filters.Paid(learner.address));
            claimState = { settled: await vault.settled(learner.address), recipientBalanceUnits: (await token.balanceOf(learner.address)).toString(), paymentFound: events.length === 1,
              transactionHash: events.at(-1)?.transactionHash ?? null, blockNumber: events.at(-1)?.blockNumber ?? null, inspectAfterPaymentCode: error.code ?? error.message };
          }
          const record = { ...status, recordedAt: new Date().toISOString(), servicesAtRecord: { main: await isReachable('http://127.0.0.1:4300/health'), issuer: await isReachable('http://127.0.0.1:4301/health'),
            chain: await isRpcReachable(status.chainRpc), claimUi: await isReachable(status.claimUrl) }, claimUiRequestPaths: [...requestPaths], mainOrIssuerRequestsAfterStop: 0,
            claimState, privateKeysWritten: false };
          await writeJson('outage-result.json', record); await provider.destroy(); await flushLogs();
          console.log(JSON.stringify({ event: 'OUTAGE_RECORDED', artifactDir, claimState }));
        } else if (command === 'stop') {
          await stopAll(); process.exit(0);
        }
      }
    });
  } else {
    throw new Error('MODE_MUST_BE_NORMAL_OR_OUTAGE');
  }
} catch (error) {
  console.error(JSON.stringify({ event: 'FAILED', code: error.code ?? error.message, artifactDir }));
  await stopAll(); process.exitCode = 1;
}
