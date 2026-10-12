import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, symlinkSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { BrowserProvider, Contract, NonceManager } from 'ethers';
import { startEnvironment } from '../../src/dev/server.mjs';
import { buildVault } from '../../src/vault/build.mjs';
import { fixture } from './helpers.mjs';

test('HTTPS preserves auth, serves only compiled assets, and persists a funded application', async t => {
  const f = await fixture(t), webRoot = join(f.root, 'dist');
  mkdirSync(webRoot); mkdirSync(join(webRoot, 'assets'));
  writeFileSync(join(webRoot, 'index.html'), '<!doctype html><title>Synthetic test build</title>');
  writeFileSync(join(webRoot, 'assets', 'app.js'), 'export const synthetic = true;');
  writeFileSync(join(webRoot, 'wallets.json'), '{"notPublic":true}');
  let app = await startEnvironment({ directory: f.directory, webRoot });
  f.cleanup.push(() => app.close());
  const provider = new BrowserProvider({ request: ({ method, params }) => f.rpc(method, params) }, undefined, { cacheTimeout: -1 });
  provider.pollingInterval = 50; f.cleanup.push(() => provider.destroy());

  await t.test('CA verification is required; plaintext HTTP is rejected', async () => {
    await assert.rejects(f.request('/', { trusted: false }));
    assert.equal((await f.request('/')).status, 200);
    await assert.rejects(new Promise((resolve, reject) => {
      const req = httpRequest(f.config.origin.replace('https:', 'http:') + '/', resolve);
      req.on('error', reject); req.end();
    }));
  });
  await t.test('built frontend and public config are same origin; private paths and source maps are absent', async () => {
    assert.match((await f.request('/')).body, /Synthetic test build/);
    assert.match((await f.request('/?scenario=empty')).body, /Synthetic test build/);
    assert.match((await f.request('/assets/app.js')).headers['content-type'], /javascript/);
    assert.equal((await f.request('/ui/applications')).status, 200);
    const response = await f.request('/__dev/config');
    assert.deepEqual(response.body, f.config); assert.equal(response.headers['cache-control'], 'no-store');
    for (const path of ['/wallets.json', '/environment.json', '/server.key', '/ca.key', '/.env', '/src/application/service.mjs',
      '/assets/app.js.map', '/%2e%2e/server.key', '/ui/../wallets.json']) assert.equal((await f.request(path)).status, 404);
  });
  for (const [label, headers] of [['Host', { host: 'attacker.invalid' }], ['Origin', { origin: 'https://attacker.invalid' }],
    ['fetch site', { 'sec-fetch-site': 'cross-site' }]]) await t.test(`rejects wrong ${label} for API, assets and RPC`, async () => {
      assert.equal((await f.request('/', { headers })).status, 403);
      assert.equal((await f.request('/auth/nonce', { method: 'POST', body: {}, headers })).status, 403);
      assert.equal((await f.request('/rpc', { method: 'POST', body: {}, headers })).status, 403);
    });
  await t.test('RPC only permits bounded requests and signed transactions for this chain', async () => {
    assert.equal(BigInt(await f.rpc('eth_chainId')), BigInt(f.config.chainId));
    for (const method of ['evm_revert', 'evm_setTime', 'evm_mine', 'personal_unlockAccount', 'eth_sendTransaction', 'eth_sign', 'eth_accounts']) {
      const r = await f.request('/rpc', { method: 'POST', body: { jsonrpc: '2.0', id: 1, method, params: [] } });
      assert.equal(r.body.error.code, -32601);
    }
    assert.equal((await f.request('/rpc', { method: 'POST', body: Array(21).fill({}) })).status, 400);
    const badChain = await f.wallets.operator.signTransaction({ chainId: 1, nonce: 0, gasLimit: 21000, gasPrice: 1000000000, to: f.wallets.learner.address, value: 1 });
    await assert.rejects(f.rpc('eth_sendRawTransaction', [badChain]), /Synthetic RPC request failed/);
  });
  const learner = await f.login(f.wallets.learner), operator = await f.login(f.wallets.operator);
  await t.test('login cookies retain flags; no token body; CSRF and wallet mismatch fail', async () => {
    for (const cookie of learner.response.headers['set-cookie']) for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) assert.ok(cookie.includes(flag));
    assert.equal(learner.response.body.token, undefined);
    assert.equal((await f.request('/auth/session', { headers: learner.headers })).status, 200);
    assert.equal((await f.request('/auth/session', { headers: { ...learner.headers, 'x-wallet': f.wallets.learner2.address } })).status, 403);
    const missing = await f.request('/applications', { method: 'POST', body: { policyHash: f.config.policyHash },
      headers: { ...learner.headers, 'x-csrf-token': '', 'idempotency-key': 'missing-csrf' } });
    assert.equal(missing.status, 403); assert.equal(missing.body.code, 'CSRF');
  });
  let enrolled;
  await t.test('application, both consents and funding work over verified HTTPS', async () => {
    const post = (path, body, headers = learner.headers) => f.request(path, { method: 'POST', body, headers });
    const r = await post('/applications', { policyHash: f.config.policyHash }, { ...learner.headers, 'idempotency-key': 'https-create' });
    assert.equal(r.status, 200); const id = r.body.applicationId;
    for (const kind of ['consent', 'final-consent']) {
      const challenge = await post(`/applications/${id}/${kind}-challenge`, {}); assert.equal(challenge.status, 200);
      const typed = challenge.body, signature = await f.wallets.learner.signTypedData(typed.domain, typed.types, typed.message);
      const accepted = await post(`/applications/${id}/${kind}`, { nonce: typed.message.nonce.slice(2), signature },
        { ...learner.headers, 'idempotency-key': 'https-' + kind });
      assert.equal(accepted.status, 200);
    }
    const intent = await post(`/applications/${id}/funding-intent`, {}, operator.headers);
    assert.equal(intent.status, 200); assert.equal(intent.body.application.state, 'FUNDING_PENDING');
    const signer = new NonceManager(f.wallets.operator.connect(provider));
    const token = new Contract(intent.body.approval.token, buildVault().ClearTestToken.abi, signer);
    await (await token.approve(intent.body.approval.spender, intent.body.approval.amount)).wait();
    const tx = await signer.sendTransaction(intent.body.transaction); await tx.wait();
    const confirmed = await post(`/applications/${id}/funding-confirmation`, { transactionHash: tx.hash }, operator.headers);
    assert.equal(confirmed.status, 200); assert.equal(confirmed.body.state, 'ENROLLED');
    assert.equal(confirmed.body.funded, true); assert.equal(confirmed.body.paymentAllowed, false);
    enrolled = confirmed.body;
  });
  await t.test('stop and restart preserve sessions, chain identity and funded evidence', async () => {
    const before = await f.rpc('eth_getBlockByNumber', ['latest', false]);
    await app.close(); app = await startEnvironment({ directory: f.directory, webRoot });
    assert.deepEqual(app.config, f.config);
    assert.deepEqual((await f.request(`/applications/${enrolled.applicationId}`, { headers: learner.headers })).body, enrolled);
    const after = await f.rpc('eth_getBlockByNumber', ['latest', false]); assert.equal(after.hash, before.hash);
    assert.equal((await f.request('/auth/session', { headers: learner.headers })).status, 200);
  });
  await t.test('symlinked assets fail before serving; existing state is preserved', async () => {
    await app.close();
    symlinkSync(join(f.directory, 'wallets.json'), join(webRoot, 'leak.js'));
    await assert.rejects(startEnvironment({ directory: f.directory, webRoot }), /DEV_WEB_SYMLINK/);
    unlinkSync(join(webRoot, 'leak.js'));
    app = await startEnvironment({ directory: f.directory, webRoot });
    assert.equal((await f.request(`/applications/${enrolled.applicationId}`, { headers: learner.headers })).body.state, 'ENROLLED');
  });
});
