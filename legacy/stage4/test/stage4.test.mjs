import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import ganache from 'ganache';
import { JsonRpcProvider } from 'ethers';
import { validateEvidence } from '../../stage2/lib/evidence.mjs';
import { verifyDeployment } from '../../stage2/lib/chain.mjs';

const execFileAsync = promisify(execFile);
const cwd = fileURLToPath(new URL('..', import.meta.url));

test('independent claim integration and preflight failures', async t => {
  const { stdout } = await execFileAsync(process.execPath, ['harness.mjs', 'normal'], { cwd, timeout: 60_000 });
  const line = stdout.trim().split('\n').find(value => value.includes('NORMAL_COMPLETE'));
  assert.ok(line, stdout);
  const { artifactDir } = JSON.parse(line);
  const [manifest, evidence, result] = await Promise.all([
    readFile(`${artifactDir}/trusted-deployment.json`, 'utf8').then(JSON.parse),
    readFile(`${artifactDir}/refund-evidence.v1.json`, 'utf8').then(JSON.parse),
    readFile(`${artifactDir}/normal-result.json`, 'utf8').then(JSON.parse)
  ]);

  await t.test('receipt, Paid event, settled state and exact balance are confirmed', () => {
    assert.deepEqual(result.services, { main: true, issuer: true, chain: true, claimUi: true });
    assert.equal(result.payment.paidUnits, '50000000');
    assert.equal(BigInt(result.payment.afterUnits) - BigInt(result.payment.beforeUnits), 50_000_000n);
    assert.deepEqual(result.assertions, { receiptStatus: true, paidEvent: true, settled: true, recipientBalanceIncreaseUnits: '50000000' });
  });

  await t.test('zero-gas wallet is blocked before sending and only the local helper is used', () => {
    assert.deepEqual(result.noGasPreflight, { actualZeroBalance: true, blockedBeforeSend: true, alternateUsed: 'Ganache evm_setAccountBalance test RPC', relayerUsed: false });
  });

  await t.test('foreign contract, other recipient and expired evidence fail before a transaction', () => {
    const foreign = structuredClone(evidence); foreign.domain.verifyingContract = '0x0000000000000000000000000000000000000001';
    assert.throws(() => validateEvidence(foreign, manifest, evidence.recipient, manifest.terms.start), error => error.code === 'DOMAIN_MISMATCH');
    const other = structuredClone(evidence); other.recipient = '0x0000000000000000000000000000000000000001';
    assert.throws(() => validateEvidence(other, manifest, evidence.recipient, manifest.terms.start), error => error.code === 'RECIPIENT_MISMATCH');
    assert.throws(() => validateEvidence(evidence, manifest, evidence.recipient, manifest.terms.claimUntil + 1), error => error.code === 'EXPIRED');
  });

  await t.test('an actual RPC with another chainId is rejected', async () => {
    const server = ganache.server({ logging: { quiet: true }, chain: { chainId: 1 } });
    await server.listen(18546, '127.0.0.1');
    const provider = new JsonRpcProvider('http://127.0.0.1:18546', undefined, { cacheTimeout: -1 });
    try { await assert.rejects(verifyDeployment(provider, manifest), error => error.code === 'CHAIN_MISMATCH'); }
    finally { await provider.destroy(); await server.close(); }
  });
});

test('claim page has no main-service or issuer API endpoint', async () => {
  const [app, service] = await Promise.all([readFile(new URL('../claim-ui/app.js', import.meta.url), 'utf8'), readFile(new URL('../services/claim.mjs', import.meta.url), 'utf8')]);
  assert.doesNotMatch(app, /127\.0\.0\.1:430[01]|\/prepare|\/issue-all/);
  assert.doesNotMatch(service, /127\.0\.0\.1:430[01]|\/prepare|\/issue-all/);
  assert.match(service, /connect-src 'self' http:\/\/127\.0\.0\.1:\*/);
  assert.match(app, /DEPLOYMENT_MISMATCH/); assert.match(app, /RECIPIENT_MISMATCH/); assert.match(app, /EXPIRED/); assert.match(app, /NO_GAS/);
});
