import { createServer } from 'node:https';
import { Transaction } from 'ethers';
import { createApplicationHandler } from '../application/http.mjs';
import { check } from './files.mjs';
import { openEnvironment, publicConfig } from './environment.mjs';
import { loadPublicAssets } from './public-assets.mjs';

const methods = new Set(['eth_chainId', 'net_version', 'web3_clientVersion', 'eth_blockNumber', 'eth_getBalance',
  'eth_getTransactionCount', 'eth_getCode', 'eth_call', 'eth_estimateGas', 'eth_gasPrice', 'eth_maxPriorityFeePerGas',
  'eth_feeHistory', 'eth_getBlockByNumber', 'eth_getBlockByHash', 'eth_getTransactionByHash',
  'eth_getTransactionReceipt', 'eth_getLogs', 'eth_sendRawTransaction']);
function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body));
}
async function body(req) {
  check(req.headers['content-type'] === 'application/json', 'DEV_RPC_CONTENT_TYPE');
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; check(size <= 65536, 'DEV_RPC_BODY_SIZE'); chunks.push(chunk); }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
}
async function rpc(raw, request, chainId) {
  const id = request && (typeof request.id === 'string' || Number.isSafeInteger(request.id)) ? request.id : null;
  const error = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
  if (!request || Array.isArray(request) || request.jsonrpc !== '2.0' || id === null
    || !Array.isArray(request.params) || Object.keys(request).some(k => !['jsonrpc', 'id', 'method', 'params'].includes(k))) return error(-32600, 'Invalid request');
  if (!methods.has(request.method)) return error(-32601, 'Method not allowed');
  try {
    if (request.method === 'eth_sendRawTransaction') {
      check(request.params.length === 1 && typeof request.params[0] === 'string', 'DEV_RPC_TRANSACTION');
      const tx = Transaction.from(request.params[0]);
      check(tx.isSigned() && tx.chainId === BigInt(chainId), 'DEV_RPC_TRANSACTION');
    }
    return { jsonrpc: '2.0', id, result: await raw.request({ method: request.method, params: request.params }) };
  } catch { return error(-32000, 'Synthetic RPC request failed'); }
}

export async function startEnvironment({ directory, webRoot }) {
  const files = loadPublicAssets(webRoot), env = await openEnvironment(directory);
  const api = createApplicationHandler(env.service), expected = new URL(env.config.origin);
  let inFlight = 0;
  const server = createServer({ ...env.tls, requestTimeout: 10000, headersTimeout: 10000, maxHeaderSize: 8192 }, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    const path = req.url;
    // The API handler retains its stricter Origin/CSRF/session checks.
    if (/^\/(auth|policies|applications|runtimes)(?:\/|\?|$)/.test(path)) return api(req, res);
    try {
      check(req.socket.encrypted && req.headers.host === expected.host, 'DEV_ORIGIN');
      check(!req.headers.origin || req.headers.origin === env.config.origin, 'DEV_ORIGIN');
      check(!req.headers['sec-fetch-site'] || ['same-origin', 'none'].includes(req.headers['sec-fetch-site']), 'DEV_ORIGIN');
      if (path === '/rpc') {
        if (req.method !== 'POST') return json(res, 405, { code: 'METHOD' });
        if (inFlight >= 8) return json(res, 429, { code: 'BUSY' });
        inFlight++;
        try {
          const input = await body(req);
          if (Array.isArray(input)) {
            check(input.length > 0 && input.length <= 20, 'DEV_RPC_BATCH');
            const output = [];
            for (const item of input) output.push(await rpc(env.raw, item, env.config.chainId));
            return json(res, 200, output);
          }
          return json(res, 200, await rpc(env.raw, input, env.config.chainId));
        } finally { inFlight--; }
      }
      if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { code: 'METHOD' });
      if (path === '/__dev/config') return json(res, 200, publicConfig(env.config));
      // Exact compiled-file paths; SPA fallback is confined to /ui/ routes.
      const assetPath = path.split('?')[0];
      const asset = files.get(assetPath) ?? (/^\/ui\/[a-zA-Z0-9/_-]*$/.test(assetPath) ? files.get('/') : undefined);
      if (!asset) return json(res, 404, { code: 'NOT_FOUND' });
      res.writeHead(200, { 'Content-Type': asset.type }); res.end(req.method === 'HEAD' ? undefined : asset.body);
    } catch (error) {
      json(res, error.message === 'DEV_ORIGIN' ? 403 : 400, { code: error.message === 'DEV_ORIGIN' ? 'ORIGIN' : 'DEV_REQUEST' });
    }
  });
  server.maxConnections = 32;
  const pending = new Set();
  // Drain asynchronous handlers before closing the chain and database.
  const handler = server.listeners('request')[0];
  server.removeListener('request', handler);
  server.on('request', (req, res) => {
    const task = Promise.resolve(handler(req, res)); pending.add(task);
    task.catch(() => { if (!res.headersSent) json(res, 500, { code: 'INTERNAL_ERROR' }); else res.destroy(); })
      .finally(() => pending.delete(task));
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(Number(expected.port), '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
    });
  } catch (error) { await env.close(); throw error; }
  let closing;
  return { config: publicConfig(env.config),
    close() {
      return closing ??= (async () => {
        const stopped = new Promise(resolve => server.close(resolve));
        server.closeAllConnections();
        await stopped; await Promise.allSettled([...pending]); await env.close();
      })();
    } };
}
