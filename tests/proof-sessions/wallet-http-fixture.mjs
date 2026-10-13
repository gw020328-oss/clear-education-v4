import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { request as httpsRequest } from 'node:https';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './fixture.mjs';
import { createCertificates, loadTls } from '../../src/dev/tls.mjs';
import { createApplicationServer } from '../../src/application/http.mjs';
import { createWalletClient, createSameOriginApi } from '../../src/application/wallet-client.mjs';

export async function browser(t) {
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
  return { ...f, client, provider, session, path, approve: () => client.authorizeProofSession(f.applicationId, session, f.record, { ownerPublicKey: f.owner.signingKey.publicKey }),
    loseResponse() { lose = true; }, onSign(fn) { signingHook = fn; }, get posts() { return posts; }, get signs() { return signs; } };
}
