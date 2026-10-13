import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request as httpsRequest } from 'node:https';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './fixture.mjs';
import { createApplicationServer } from '../../src/application/http.mjs';
import { createCertificates, loadTls } from '../../src/dev/tls.mjs';

async function http(t, f) {
  const server = createApplicationServer(f.app.service, { tls: loadTls(f.app.directory, createCertificates(f.app.directory)) });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const headers = { host: 'clear.example.invalid', origin: f.app.config.origin, cookie: '__Host-clear-session=' + f.context.token,
    'x-wallet': f.context.wallet, 'x-chain-id': String(f.context.chainId), 'x-csrf-token': f.context.csrf };
  function request(action, { method = 'GET', body, change = {} } = {}) {
    let req;
    const done = new Promise((resolve, reject) => {
      req = httpsRequest({ hostname: '127.0.0.1', port: server.address().port, servername: 'localhost',
        ca: readFileSync(join(f.app.directory, 'ca.pem')), agent: false, method,
        path: `/applications/${f.applicationId}/proof-sessions/${f.session.proofSessionId}/${action}`,
        headers: { ...headers, ...change, ...(body ? { 'content-type': 'application/json' } : {}) } }, res => {
        const chunks = []; res.on('data', c => chunks.push(c)); res.on('error', reject);
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()), headers: res.headers }));
      });
      req.on('error', reject); req.end(body ? JSON.stringify(body) : undefined);
    });
    return { done, abort: () => req.destroy() };
  }
  return request;
}

test('HTTPS accepts evidence and returns only an idempotent public receipt, never snapshot/score/signatures', async t => {
  const f = await fixture(t), request = await http(t, f), body = await f.signed();
  assert.equal((await request('result').done).body.state, 'NOT_ACCEPTED');
  const accepted = await request('evidence', { method: 'POST', body }).done;
  assert.equal(accepted.status, 200); assert.equal(accepted.headers['cache-control'], 'no-store');
  assert.deepEqual((await request('result').done).body, accepted.body);
  assert.deepEqual((await request('evidence', { method: 'POST', body }).done).body, accepted.body);
  assert.ok(!JSON.stringify(accepted.body).includes('totalScore')); assert.ok(!JSON.stringify(accepted.body).includes(body.ownerSignature));
  assert.equal((await request('snapshot').done).status, 404);
  assert.equal((await request('verified', { method: 'POST', body: { verified: true } }).done).status, 404);
});

test('HTTPS evidence preserves authentication, CSRF, wallet/origin checks and body/field limits', async t => {
  const f = await fixture(t), request = await http(t, f), body = await f.signed();
  for (const [change, code] of [[{ cookie: '' }, 401], [{ 'x-csrf-token': '' }, 403], [{ origin: 'https://evil.invalid' }, 403], [{ 'x-wallet': f.app.bob.address }, 403]]) {
    assert.equal((await request('evidence', { method: 'POST', body, change }).done).status, code);
  }
  assert.equal((await request('evidence', { method: 'POST', body: { ...body, verified: true } }).done).status, 422);
  assert.equal((await request('evidence', { method: 'POST', body: { huge: 'a'.repeat(66000) } }).done).status, 413);
  assert.equal((await request('evidence', { method: 'POST', body: { ...body, profile: 'REAL_YBM' } }).done).status, 409);
  assert.equal(f.rows(), 0);
});

test('HTTP disconnect during chain observation aborts acceptance before commit', async t => {
  const f = await fixture(t), body = await f.signed(); let entered, release, signal;
  const waiting = new Promise(resolve => { entered = resolve; });
  f.app.restart({ vaultReader: { ...f.reader, proofEnrollment: async (...args) => {
    const result = await f.reader.proofEnrollment(...args); entered(); await new Promise(resolve => { release = resolve; }); return result;
  } } });
  const accept = f.app.service.acceptProofEvidence;
  f.app.service.acceptProofEvidence = (...args) => { signal = args[4].signal; return accept(...args); };
  const request = await http(t, f), active = request('evidence', { method: 'POST', body });
  const rejected = assert.rejects(() => active.done); await waiting;
  const aborted = once(signal, 'abort'); active.abort(); await aborted; release(); await rejected;
  // Synchronize with a subsequent DB read after the rejected commit callback.
  await new Promise(resolve => setImmediate(resolve)); assert.equal(f.rows(), 0);
});
