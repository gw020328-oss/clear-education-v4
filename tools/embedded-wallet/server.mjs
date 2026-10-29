import {createServer as httpsServer} from 'node:https';
import {createServer as httpServer} from 'node:http';
import {randomBytes, randomInt} from 'node:crypto';
import {readFileSync, readdirSync} from 'node:fs';
import ganache from 'ganache';
import {validateConfig, embeddedCsp} from '../../src/embedded-wallet/config.mjs';
import {createApplicationService} from '../../src/application/service.mjs';
import {createApplicationHandler} from '../../src/application/http.mjs';

// Separate address-discovery and opt-in auth-check listener. Product routes,
// collector, server signer, funding and transaction submission stay unmounted.
export async function createOnboardingServer({origin, rpcPort, appId = null, tls, buildDirectory, authRoles = null, authDirectory}) {
  if (authRoles && authRoles.operatorWalletKind !== 'metamask') throw Error('EXPLICIT_METAMASK_OPERATOR_REQUIRED');
  const instanceId = '0x' + randomBytes(32).toString('hex');
  const chainId = randomInt(1_000_000_000, 2_000_000_000);
  const config = validateConfig({origin, rpcUrl: `http://127.0.0.1:${rpcPort}`, appId,
    redirectUri: origin + '/onboarding', phase: authRoles ? 'AUTH_LOCAL_TEST' : 'ONBOARDING_ONLY', instanceId, chainId});
  const assets = new Map();
  for (const file of readdirSync(buildDirectory)) {
    if (/^[a-zA-Z0-9_-]+\.(js|css)$/.test(file)) assets.set('/assets/' + file, {
      body: readFileSync(buildDirectory + '/' + file), type: file.endsWith('.css') ? 'text/css' : 'text/javascript'});
  }
  if (!assets.has('/assets/onboarding.js') || !assets.has('/assets/operator.js')) throw Error('EMBEDDED_BUILD_REQUIRED');
  // An opt-in, separate auth diagnostic store. The existing auth handler alone
  // is mounted behind four exact routes; no application/workflow is exposed.
  const auth = authRoles ? createApplicationService({directory: authDirectory, origin, chainId, instanceId,
    participants: [authRoles.participant], operators: [authRoles.operator]}) : null;
  const authHandler = auth && createApplicationHandler(auth, {cookieNamespace: `embedded-check-${new URL(origin).port}`});
  const provider = ganache.provider({chain: {chainId}, wallet: {totalAccounts: 0}, logging: {quiet: true}});
  const rpc = httpServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const rpcOrigin = req.headers.origin;
    // MetaMask's extension/backend validates a custom RPC outside page fetch.
    // Allow only loopback, exact Host, no Origin or the known extension origin.
    // Methods remain read-only; arbitrary web origins are still rejected.
    const allowed = req.headers.host === `127.0.0.1:${rpcPort}` && [undefined, origin, 'chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn'].includes(rpcOrigin)
      && ['127.0.0.1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    if (!allowed) { res.writeHead(403); res.end(); return; }
    if (rpcOrigin) res.setHeader('Access-Control-Allow-Origin', rpcOrigin);
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'POST'); res.setHeader('Access-Control-Allow-Headers', 'content-type');
      res.writeHead(204); res.end(); return;
    }
    try {
      if (req.method !== 'POST' || req.url !== '/' || !/^application\/json(?:;|$)/.test(req.headers['content-type'] ?? '')) throw Error();
      let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 4096) throw Error(); }
      const q = JSON.parse(body);
      if (q.jsonrpc !== '2.0' || !['eth_chainId', 'eth_getCode', 'eth_blockNumber', 'eth_getBalance'].includes(q.method)
        || !Array.isArray(q.params)) throw Error();
      const result = await provider.request({method: q.method, params: q.params});
      res.writeHead(200, {'Content-Type': 'application/json'}); res.end(JSON.stringify({jsonrpc: '2.0', id: q.id, result}));
    } catch { res.writeHead(400, {'Content-Type': 'application/json'}); res.end('{"error":"ONBOARDING_RPC_READ_ONLY"}'); }
  });
  rpc.requestTimeout = 5000; rpc.maxConnections = 16;
  const server = httpsServer({...tls, requestTimeout: 5000, maxHeaderSize: 8192}, (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Content-Type-Options', 'nosniff');
    const nonce = randomBytes(24).toString('base64'); res.setHeader('Content-Security-Policy', embeddedCsp(nonce, config.rpcUrl));
    let url;
    try { url = new URL(req.url, origin); }
    catch { res.writeHead(400); res.end('URL'); return; }
    const document = req.method === 'GET' && ['/onboarding','/operator'].includes(url.pathname);
    // OAuth returns by top-level cross-site navigation; assets/config do not.
    const valid = url.origin === origin && req.headers.host === new URL(origin).host && req.socket.encrypted
      && ['127.0.0.1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
      && (!req.headers.origin || req.headers.origin === origin)
      && (!req.headers['sec-fetch-site'] || ['none','same-origin'].includes(req.headers['sec-fetch-site'])
        || document && req.headers['sec-fetch-mode'] === 'navigate' && req.headers['sec-fetch-dest'] === 'document');
    if (!valid) { res.writeHead(403); res.end('ORIGIN'); return; }
    if (authHandler && ((req.method === 'POST' && ['/auth/nonce','/auth/verify','/auth/logout'].includes(req.url))
      || req.method === 'GET' && req.url === '/auth/session')) {
      void authHandler(req, res); return;
    }
    if (document) {
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
      res.end(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="sc-nonce" content="${nonce}"><title>${url.pathname === '/operator' ? 'CLEAR 운영자 MetaMask 준비' : 'CLEAR 참가자 내장 지갑 준비'}</title><link rel="stylesheet" href="/assets/style.css"></head><body><div id="root"></div><script type="module" nonce="${nonce}" src="/assets/${url.pathname === '/operator' ? 'operator' : 'onboarding'}.js"></script></body></html>`); return;
    }
    if (req.method === 'GET' && req.url === '/__embedded/config') {
      res.writeHead(200, {'Content-Type': 'application/json'}); res.end(JSON.stringify(config)); return;
    }
    const asset = assets.get(req.url);
    if (req.method === 'GET' && asset) { res.writeHead(200, {'Content-Type': asset.type}); res.end(asset.body); return; }
    res.writeHead(404, {'Content-Type': 'application/json'}); res.end('{"error":"ONBOARDING_ONLY"}');
  });
  server.maxConnections = 32;
  const listen = (s, port) => new Promise((resolve, reject) => { s.once('error', reject); s.listen(port, '127.0.0.1', resolve); });
  const close = s => new Promise(resolve => { s.closeAllConnections(); s.close(resolve); });
  try {
    // Finish Ganache initialization before an early shutdown can disconnect it.
    await provider.request({method: 'eth_chainId', params: []});
    await listen(rpc, rpcPort); await listen(server, Number(new URL(origin).port));
  }
  catch (error) { await close(rpc); await provider.disconnect(); auth?.close(); throw error; }
  return {config, server, rpc, async close() { await Promise.all([close(server), close(rpc)]); await provider.disconnect(); auth?.close(); }};
}
