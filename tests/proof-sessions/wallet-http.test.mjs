import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { request as httpsRequest } from 'node:https';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './fixture.mjs';
import { createCertificates, loadTls } from '../../src/dev/tls.mjs';
import { createApplicationServer } from '../../src/application/http.mjs';
import { createWalletClient, createSameOriginApi } from '../../src/application/wallet-client.mjs';

async function browser(t) {
  const f = await fixture(t), session = await f.create();
  const server = createApplicationServer(f.app.service, { tls: loadTls(f.app.directory, createCertificates(f.app.directory)) });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const ca = readFileSync(join(f.app.directory, 'ca.pem'));
  let lose = false, posts = 0, signs = 0, signingHook = () => {};
  // Only this test bridge supplies a cookie. Product code uses browser credentials.
  const api = createSameOriginApi({ origin: f.app.config.origin, fetch: (url, options) => new Promise((resolve, reject) => {
    assert.equal(new URL(url).origin, f.app.config.origin);
    const post = options.method === 'POST'; if (post) posts++;
    const req = httpsRequest({ hostname: '127.0.0.1', port: server.address().port, servername: 'localhost', ca, agent: false,
      path: new URL(url).pathname, method: options.method, signal: options.signal,
      headers: { host: 'clear.example.invalid', origin: f.app.config.origin, cookie: '__Host-clear-session=' + f.context.token,
        ...Object.fromEntries(options.headers) },
    }, res => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('error', reject);
      res.on('end', () => {
        if (lose && post) { reject(new Error('synthetic response loss')); return; }
        resolve(new Response(Buffer.concat(chunks), { status: res.statusCode, headers: { 'content-type': res.headers['content-type'] } }));
      });
    });
    req.on('error', reject); req.end(options.body);
  }) });
  const provider = new EventEmitter();
  provider.request = async ({ method, params }) => {
    if (['eth_accounts', 'eth_requestAccounts'].includes(method)) return [f.app.alice.address];
    if (method === 'eth_chainId') return '0x' + f.app.config.chainId.toString(16);
    if (method === 'eth_signTypedData_v4') {
      signs++; await signingHook();
      const typed = JSON.parse(params[1]); delete typed.types.EIP712Domain; return f.sign(typed);
    }
    throw new Error('unexpected RPC');
  };
  const client = createWalletClient({ provider, api, chainId: f.app.config.chainId, clock: () => f.app.time });
  t.after(() => client.dispose()); await client.connect(); await client.resume();
  const path = `/applications/${f.applicationId}/proof-sessions/${session.proofSessionId}`;
  return { ...f, client, session, path, approve: () => client.authorizeProofSession(f.applicationId, session, f.record, { ownerPublicKey: f.owner.signingKey.publicKey }),
    loseResponse() { lose = true; }, onSign(fn) { signingHook = fn; }, get posts() { return posts; }, get signs() { return signs; } };
}

test('wallet helper and HTTPS service consume one durable nonce without accepting proof or enabling collection', async t => {
  const f = await browser(t), result = await f.approve();
  assert.equal(result.state, 'AUTHORIZED'); assert.equal(result.dataMode, 'SYNTHETIC');
  assert.equal(result.collectionEnabled, false); assert.equal(result.proofVerified, false); assert.equal(result.paymentAllowed, false);
  assert.equal((await f.client.request(f.path + '/result')).state, 'NOT_ACCEPTED');
  const rows = f.sql(db => db.prepare('SELECT state,consumed_at,binding_digest FROM proof_sessions').all());
  assert.equal(rows.length, 1); assert.equal(rows[0].state, 'AUTHORIZED'); assert.equal(rows[0].binding_digest, result.bindingDigest);
  assert.equal(f.sql(db => db.prepare('SELECT COUNT(*) AS n FROM proof_results').get().n), 0);
  await assert.rejects(f.approve(), { message: 'PROOF_AUTHORIZATION_STATE' });
  assert.equal(f.signs, 1); assert.equal(f.posts, 1);
});

test('lost HTTPS authorization response recovers by GET without a second signature or POST', async t => {
  const f = await browser(t); f.loseResponse();
  await assert.rejects(f.approve(), { code: 'API_NETWORK', outcome: 'UNKNOWN', nextAction: 'CHECK_RESULT', retryable: false });
  const recovered = await f.client.request(f.path); assert.equal(recovered.state, 'AUTHORIZED');
  await assert.rejects(f.approve(), { message: 'PROOF_AUTHORIZATION_STATE' });
  assert.equal(f.signs, 1); assert.equal(f.posts, 1);
});

test('server cancellation while wallet prompt is open still rejects the signed submission', async t => {
  const f = await browser(t); f.onSign(() => f.cancel(f.session));
  await assert.rejects(f.approve(), { code: 'PROOF_SESSION_CANCELLED', status: 409, outcome: 'HTTP_ERROR', nextAction: 'REFRESH_STATE' });
  assert.equal(f.get(f.session).state, 'CANCELLED'); assert.equal(f.get(f.session).bindingDigest, null);
  assert.equal(f.posts, 1);
});
