import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request as httpsRequest } from 'node:https';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Wallet } from 'ethers';
import { fixture } from './fixture.mjs';
import { createCertificates, loadTls } from '../../src/dev/tls.mjs';
import { createApplicationServer } from '../../src/application/http.mjs';

async function httpFixture(t) {
  const f = await fixture(t), fingerprint = createCertificates(f.app.directory);
  const server = createApplicationServer(f.app.service, { tls: loadTls(f.app.directory, fingerprint) });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const ca = readFileSync(join(f.app.directory, 'ca.pem'));
  const headers = { host: 'clear.example.invalid', origin: f.app.config.origin, cookie: '__Host-clear-session=' + f.context.token,
    'x-wallet': f.context.wallet, 'x-chain-id': String(f.context.chainId), 'x-csrf-token': f.context.csrf };
  const path = `/applications/${f.applicationId}/proof-sessions`;
  const request = (suffix = '', { method = 'GET', body, change = {} } = {}) => new Promise((resolve, reject) => {
    const req = httpsRequest({ hostname: '127.0.0.1', port: server.address().port, path: path + suffix,
      servername: 'localhost', ca, method, agent: false, headers: { ...headers, ...change,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }) } }, res => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(Buffer.concat(chunks).toString()) }));
    });
    req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  return { ...f, request, headers };
}

test('HTTPS proof routes issue, list, read, authorize idempotently and cancel without ever returning a signature', async t => {
  const f = await httpFixture(t);
  const issued = await f.request('', { method: 'POST', body: f.body, change: { 'idempotency-key': 'http' } });
  assert.equal(issued.status, 200); assert.equal(issued.headers['cache-control'], 'no-store');
  const p = issued.body, path = '/' + p.proofSessionId, body = await f.signed(p);
  assert.deepEqual((await f.request()).body, [p]); assert.deepEqual((await f.request(path)).body, p);
  const approved = await f.request(path + '/authorize', { method: 'POST', body });
  assert.equal(approved.status, 200); assert.equal(approved.body.state, 'AUTHORIZED');
  assert.equal(JSON.stringify(approved.body).includes(body.signature), false);
  assert.deepEqual((await f.request(path + '/authorize', { method: 'POST', body })).body, approved.body);
  const cancelled = await f.request(path + '/cancel', { method: 'POST', body: {} });
  assert.equal(cancelled.body.state, 'CANCELLED');
  assert.equal((await f.request(path + '/authorize', { method: 'POST', body })).status, 409);
});

test('HTTPS rejects missing login, Origin/CSRF, changed wallet/chain and cross-application access', async t => {
  const f = await httpFixture(t);
  for (const [change, status] of [[{ cookie: '' }, 401], [{ origin: 'https://evil.invalid' }, 403],
    [{ 'x-csrf-token': '' }, 403], [{ 'x-wallet': f.app.bob.address }, 403], [{ 'x-chain-id': '1' }, 403]]) {
    const r = await f.request('', { method: 'POST', body: f.body, change: { 'idempotency-key': 'http', ...change } });
    assert.equal(r.status, status);
  }
  const p = await f.create(), bob = await f.app.login(f.app.bob);
  const r = await f.request('/' + p.proofSessionId, { change: { cookie: '__Host-clear-session=' + bob.token, 'x-wallet': bob.wallet } });
  assert.equal(r.status, 404); assert.equal(r.body.code, 'APPLICATION_NOT_FOUND');
});

test('HTTPS exposes explicit expired/conflict codes, validates schemas and has no proof-success callback', async t => {
  const f = await httpFixture(t), p = await f.create(), path = '/' + p.proofSessionId, body = await f.signed(p);
  const active = await f.request('', { method: 'POST', body: { ownerPublicKey: Wallet.createRandom().signingKey.publicKey }, change: { 'idempotency-key': 'other' } });
  assert.equal(active.status, 409); assert.equal(active.body.code, 'PROOF_SESSION_ACTIVE');
  for (const suffix of ['/callback', '/verified', '/consume']) assert.equal((await f.request(path + suffix, { method: 'POST', body: { verified: true } })).status, 404);
  assert.equal((await f.request(path + '/cancel', { method: 'POST', body: [] })).status, 422);
  assert.equal((await f.request(path + '/authorize', { method: 'POST', body: { ...body, verified: true } })).status, 422);
  await f.setTime(p.expiresAt);
  const expired = await f.request(path + '/authorize', { method: 'POST', body });
  assert.equal(expired.status, 410); assert.equal(expired.body.code, 'PROOF_SESSION_EXPIRED');
  assert.equal((await f.request(path)).body.state, 'EXPIRED');
});
