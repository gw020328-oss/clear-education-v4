import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { createApplicationServer } from '../../src/application/http.mjs';
import { fixture } from './fixture.mjs';

async function serverFixture(t, options = { allowLoopbackHttpForTests: true }) {
  const f = await fixture(t), server = createApplicationServer(f.service, options);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const url = 'http://127.0.0.1:' + server.address().port;
  const request = async (path, { method = 'GET', body, headers = {} } = {}) => {
    return new Promise((resolve, reject) => {
    const req = httpRequest(url + path, { method, headers: { host: 'clear.example.invalid', origin: f.config.origin,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    }, response => {
      const chunks = []; response.on('data', c => chunks.push(c)); response.on('error', reject);
      response.on('end', () => { try { resolve({ res: { status: response.statusCode,
        headers: { get: key => response.headers[key], getSetCookie: () => response.headers['set-cookie'] ?? [] } },
        body: JSON.parse(Buffer.concat(chunks).toString()) }); } catch (error) { reject(error); } });
    });
    req.on('error', reject);
    req.end(body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body));
    });
  };
  return { ...f, request, server };
}
const contextHeaders = c => ({ cookie: '__Host-clear-session=' + c.token, 'x-wallet': c.wallet,
  'x-chain-id': String(c.chainId), 'x-csrf-token': c.csrf });

test('HTTP login sets secure host-only cookies, never returns session token and supports resume', async t => {
  const f = await serverFixture(t);
  const challenge = await f.request('/auth/nonce', { method: 'POST', body: { wallet: f.alice.address, chainId: f.config.chainId } });
  assert.equal(challenge.res.status, 200); assert.equal(challenge.body.browserToken, undefined);
  const preauth = challenge.res.headers.getSetCookie()[0];
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) assert.ok(preauth.includes(flag));
  const signature = await f.alice.signMessage(challenge.body.message);
  const login = await f.request('/auth/verify', { method: 'POST', headers: { cookie: preauth.split(';')[0] }, body: { nonce: challenge.body.nonce, signature } });
  assert.equal(login.res.status, 200); assert.equal(login.body.token, undefined);
  assert.equal(login.res.headers.get('cache-control'), 'no-store');
  const sessionCookie = login.res.headers.getSetCookie().find(c => c.startsWith('__Host-clear-session='));
  const headers = { cookie: sessionCookie.split(';')[0], 'x-wallet': f.alice.address, 'x-chain-id': String(f.config.chainId), 'x-csrf-token': login.body.csrf };
  const resumed = await f.request('/auth/session', { headers }); assert.equal(resumed.body.wallet, f.alice.address);
  const app = await f.request('/applications', { method: 'POST', body: { policyHash: f.compiled.policyHash }, headers: { ...headers, 'idempotency-key': 'http-create' } });
  assert.equal(app.res.status, 200); assert.equal(app.body.state, 'DRAFT');
  const signed = await f.request(`/applications/${app.body.applicationId}/consent-challenge`, { method: 'POST', body: {}, headers });
  const payload = signed.body;
  const consentSignature = await f.alice.signTypedData(payload.domain, payload.types, payload.message);
  const accepted = await f.request(`/applications/${app.body.applicationId}/consent`, { method: 'POST',
    body: { nonce: payload.message.nonce.slice(2), signature: consentSignature }, headers: { ...headers, 'idempotency-key': 'http-consent' } });
  assert.equal(accepted.res.status, 200); assert.equal(accepted.body.state, 'TERMS_ACCEPTED');
  const logout = await f.request('/auth/logout', { method: 'POST', body: {}, headers }); assert.equal(logout.res.status, 200);
  assert.equal((await f.request('/auth/session', { headers })).res.status, 401);
});

for (const [label, headers] of [
  ['wrong origin', { origin: 'https://evil.example.invalid' }],
  ['wrong host', { host: 'evil.example.invalid' }],
  ['cross site', { 'sec-fetch-site': 'cross-site' }],
]) test(`HTTP rejects ${label} before authenticating`, async t => {
  const f = await serverFixture(t), response = await f.request('/auth/nonce', { method: 'POST',
    body: { wallet: f.alice.address, chainId: f.config.chainId }, headers });
  assert.equal(response.res.status, 403); assert.equal(response.body.code, 'ORIGIN');
});

test('HTTP does not trust proxy headers to bypass HTTPS', async t => {
  const f = await serverFixture(t, {}), response = await f.request('/applications', { headers: { 'x-forwarded-proto': 'https', ...contextHeaders(f.aliceContext) } });
  assert.equal(response.res.status, 403); assert.equal(response.body.code, 'TRANSPORT');
});

test('HTTP blocks missing session, CSRF, other ownership and role escalation', async t => {
  const f = await serverFixture(t), app = f.create();
  assert.equal((await f.request('/applications')).res.status, 401);
  assert.equal((await f.request(`/applications/${app.applicationId}`, { headers: contextHeaders(f.bobContext) })).res.status, 404);
  const headers = contextHeaders(f.aliceContext); delete headers['x-csrf-token'];
  assert.equal((await f.request('/applications', { method: 'POST', body: { policyHash: f.compiled.policyHash }, headers })).res.status, 403);
  const changed = { ...contextHeaders(f.aliceContext), 'x-wallet': f.bob.address };
  assert.equal((await f.request('/applications', { headers: changed })).body.code, 'WALLET_CONTEXT_CHANGED');
});

test('HTTP rejects malformed, duplicate cookies and oversized JSON without echoing inputs', async t => {
  const f = await serverFixture(t);
  const duplicate = '__Host-clear-session=' + f.aliceContext.token + '; __Host-clear-session=' + f.bobContext.token;
  assert.equal((await f.request('/applications', { headers: { ...contextHeaders(f.aliceContext), cookie: duplicate } })).body.code, 'COOKIE');
  for (const body of ['{synthetic-private-marker', JSON.stringify({ padding: 'z'.repeat(65536) })]) {
    const response = await f.request('/auth/nonce', { method: 'POST', body });
    assert.ok([413, 422].includes(response.res.status)); assert.ok(!JSON.stringify(response.body).includes('synthetic-private-marker'));
  }
});

test('funding and wallet replacement endpoints do not exist', async t => {
  const f = await serverFixture(t), app = f.create();
  for (const route of ['funding-intent', 'enroll', 'wallet']) {
    const response = await f.request(`/applications/${app.applicationId}/${route}`, { method: 'POST', body: {}, headers: contextHeaders(f.aliceContext) });
    assert.equal(response.res.status, 404);
  }
});

test('empty-object actions reject arrays/scalars and leave the session/application unchanged', async t => {
  const f = await serverFixture(t), app = f.create(), headers = contextHeaders(f.aliceContext);
  for (const body of ['[]', '1', 'true', 'null']) {
    const logout = await f.request('/auth/logout', { method: 'POST', body, headers });
    assert.equal(logout.res.status, 422); assert.equal(logout.body.code, 'LOGOUT_SCHEMA');
    const challenge = await f.request(`/applications/${app.applicationId}/consent-challenge`, { method: 'POST', body, headers });
    assert.equal(challenge.res.status, 422); assert.equal(challenge.body.code, 'CONSENT_SCHEMA');
  }
  assert.equal(f.service.whoami(f.aliceContext).wallet, f.alice.address);
  assert.equal(f.service.getApplication(f.aliceContext, app.applicationId).state, 'DRAFT');
});
