import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { request as httpsRequest } from 'node:https';
import { Wallet } from 'ethers';
import { initializeEnvironment } from '../../src/dev/environment.mjs';

export async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve)); return port;
}
export async function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'clear-dev-test-'))), directory = join(root, 'environment');
  const cleanup = [];
  t.after(async () => { try { for (const fn of cleanup.reverse()) await fn(); } finally { rmSync(root, { recursive: true, force: true }); } });
  const config = await initializeEnvironment({ directory, port: await freePort() });
  return { root, directory, config, cleanup, ...client(directory, config) };
}

export function client(directory, config) {
  // Only keys freshly generated for this test are read, never an existing wallet.
  const keys = JSON.parse(readFileSync(join(directory, 'wallets.json')));
  const wallets = Object.fromEntries(Object.entries(keys).map(([role, key]) => [role, new Wallet(key)]));
  const ca = readFileSync(join(directory, 'ca.pem'));
  function request(path, { method = 'GET', body, headers = {}, trusted = true } = {}) {
    return new Promise((resolve, reject) => {
      const req = httpsRequest(config.origin + path, { method, agent: false, servername: 'localhost', ...(trusted ? { ca } : {}),
        headers: { origin: config.origin, ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers } }, res => {
        const chunks = []; res.on('data', c => chunks.push(c)); res.on('error', reject);
        res.on('end', () => { const text = Buffer.concat(chunks).toString(); let body;
          try { body = JSON.parse(text); } catch { body = text; }
          resolve({ status: res.statusCode, headers: res.headers, body }); });
      });
      req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
    });
  }
  async function login(wallet) {
    const c = await request('/auth/nonce', { method: 'POST', body: { wallet: wallet.address, chainId: config.chainId } });
    const r = await request('/auth/verify', { method: 'POST', body: { nonce: c.body.nonce, signature: await wallet.signMessage(c.body.message) },
      headers: { cookie: c.headers['set-cookie'][0].split(';')[0] } });
    return { response: r, headers: { cookie: r.headers['set-cookie'].find(c => c.startsWith('__Host-clear-session=')).split(';')[0],
      'x-wallet': wallet.address, 'x-chain-id': String(config.chainId), 'x-csrf-token': r.body.csrf } };
  }
  let sequence = 0;
  async function rpc(method, params = []) {
    const r = await request('/rpc', { method: 'POST', body: { jsonrpc: '2.0', id: ++sequence, method, params } });
    if (r.body.error) throw new Error(r.body.error.message); return r.body.result;
  }
  return { wallets, request, login, rpc };
}
