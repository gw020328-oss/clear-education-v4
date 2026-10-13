import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request as httpsRequest } from 'node:https';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './fixture.mjs';
import { fixture as productFixture } from '../product-proof/fixture.mjs';
import { createApplicationServer } from '../../src/application/http.mjs';
import { createSameOriginApi } from '../../src/application/api-client.mjs';
import { createCertificates, loadTls } from '../../src/dev/tls.mjs';

async function transport(t, f, context = f.aliceContext) {
  const server = createApplicationServer(f.service, { tls: loadTls(f.directory, createCertificates(f.directory)) });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const ca = readFileSync(join(f.directory, 'ca.pem'));
  let loseNextResponse = false, posts = 0, cookie = '__Host-clear-session=' + context.token;
  // Test-only HTTPS bridge: emulate the browser's cookie jar with a fresh
  // synthetic login, validate the local CA, and never contact a remote host.
  const api = createSameOriginApi({ origin: f.config.origin, fetch: (url, options) => new Promise((resolve, reject) => {
    assert.equal(new URL(url).origin, f.config.origin);
    if (options.method === 'POST') posts++;
    const lose = loseNextResponse; loseNextResponse = false;
    const req = httpsRequest({ hostname: '127.0.0.1', port: server.address().port, servername: 'localhost',
      ca, agent: false, path: new URL(url).pathname, method: options.method, signal: options.signal,
      headers: { host: 'clear.example.invalid', origin: f.config.origin, cookie, ...Object.fromEntries(options.headers) },
    }, res => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('error', reject);
      res.on('end', () => {
        // The service has committed and completed its reply before this loss.
        if (lose) { reject(new Error('synthetic lost response detail')); return; }
        resolve(new Response(Buffer.concat(chunks), { status: res.statusCode,
          headers: { 'content-type': res.headers['content-type'], 'cache-control': res.headers['cache-control'] } }));
      });
    });
    req.on('error', reject); req.end(options.body);
  }) });
  return { api, headers: { 'x-wallet': context.wallet, 'x-chain-id': String(context.chainId), 'x-csrf-token': context.csrf },
    loseResponse() { loseNextResponse = true; }, clearCookie() { cookie = ''; }, get posts() { return posts; } };
}

test('HTTPS server errors reach the browser adapter as safe authentication, CSRF, ownership and conflict codes', async t => {
  const f = await fixture(t), h = await transport(t, f), body = { policyHash: f.compiled.policyHash };
  const app = f.create(f.bobContext);
  await assert.rejects(h.api('/applications/' + app.applicationId, { headers: h.headers }), {
    code: 'APPLICATION_NOT_FOUND', status: 404, nextAction: 'CHECK_REQUEST', outcome: 'HTTP_ERROR',
  });
  await assert.rejects(h.api('/applications', { method: 'POST', body, headers: { ...h.headers, 'x-csrf-token': '' } }), {
    code: 'CSRF', status: 403, nextAction: 'SIGN_IN_AGAIN',
  });
  const headers = { ...h.headers, 'idempotency-key': 'transport-create' };
  await h.api('/applications', { method: 'POST', body, headers });
  await assert.rejects(h.api('/applications', { method: 'POST', body: { policyHash: '0x' + 'ab'.repeat(32) }, headers }), {
    code: 'IDEMPOTENCY_CONFLICT', status: 409, retryable: false, nextAction: 'REFRESH_STATE',
  });
  h.clearCookie();
  await assert.rejects(h.api('/applications', { headers: h.headers }), error => {
    assert.equal(error.message, 'AUTH_REQUIRED'); assert.equal(error.code, 'AUTH_REQUIRED');
    assert.equal(error.status, 401); assert.equal(error.nextAction, 'SIGN_IN_AGAIN');
    assert.match(error.requestId, /^[0-9a-f-]{36}$/); return true;
  });
});

test('lost HTTPS POST response is uncertain; read and explicit same-key replay recover one durable application', async t => {
  const f = await fixture(t), h = await transport(t, f);
  const request = { method: 'POST', body: { policyHash: f.compiled.policyHash },
    headers: { ...h.headers, 'idempotency-key': 'lost-response-create' } };
  h.loseResponse();
  await assert.rejects(h.api('/applications', request), {
    code: 'API_NETWORK', status: null, outcome: 'UNKNOWN', retryable: false, nextAction: 'CHECK_RESULT',
  });
  assert.equal(h.posts, 1);
  const listed = await h.api('/applications', { headers: h.headers }); assert.equal(listed.length, 1);
  const recovered = await h.api('/applications', request);
  assert.equal(recovered.applicationId, listed[0].applicationId); assert.equal(h.posts, 2);
  assert.equal(f.service.listApplications(f.aliceContext).length, 1);
});

test('HTTPS real-source block and expired proof session remain distinct without accepting evidence', async t => {
  const f = await productFixture(t), h = await transport(t, f.app, f.context), body = await f.signed();
  const path = `/applications/${f.applicationId}/proof-sessions/${f.session.proofSessionId}/evidence`;
  await assert.rejects(h.api(path, { method: 'POST', headers: h.headers, body: { ...body, profile: 'REAL_YBM' } }), {
    code: 'PROOF_SOURCE_INCOMPLETE', status: 409, retryable: false, nextAction: 'WAIT_FOR_SOURCE',
  });
  assert.equal(f.rows(), 0);
  await f.setTime(Number(f.session.expiresAt) + 1);
  await assert.rejects(h.api(path, { method: 'POST', headers: h.headers, body }), {
    code: 'PROOF_SESSION_EXPIRED', status: 410, retryable: false, nextAction: 'REFRESH_STATE',
  });
  assert.equal(f.rows(), 0);
});
