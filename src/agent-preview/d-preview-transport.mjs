// Server-to-server request port for B's createOperatorDPort({request}).
//
// Implements the client side of D's existing HMAC contract
// (deploy/agent-preview/auth.mjs: HMAC-SHA256 over
// "timestamp\nnonce\nPOST\npath\nsha256(rawBody)"). The exact bytes that are
// signed are the bytes that are sent. Fresh nonce per call, no retry, no
// redirect, bounded response, caller abort. No CLEAR cookie, Origin, CSRF or
// browser header is ever forwarded; D rejects them.
//
// The shared secret is read by the server owner and never leaves this closure.
import {createHash, createHmac, randomBytes} from 'node:crypto';
import http from 'node:http';
import https from 'node:https';

const PATHS = new Set(['/v1/preview/prepare', '/v1/preview/generate', '/v1/preview/execute']);
const MAX_REPLY_BYTES = 131072;
const fail = code => { throw Object.assign(new Error(code), {code}); };
const check = (ok, code) => { if (!ok) fail(code); };

/** Same formula as D auth.mjs signature(). */
export function dPreviewSignature(secret, timestamp, nonce, path, rawBody) {
  return createHmac('sha256', secret)
    .update(`${timestamp}\n${nonce}\nPOST\n${path}\n${createHash('sha256').update(rawBody).digest('hex')}`)
    .digest('hex');
}

/**
 * @param {object} options
 * @param {string} options.publicOrigin  D config.publicOrigin (https). Sent as Host.
 * @param {string} options.connectOrigin where the bytes go. Equal to publicOrigin in a
 *   deployment; a loopback http origin only for a local separate environment.
 * @param {string} options.secret        D shared secret (hex, >=32 bytes)
 * @param {object} [options.ca]          extra CA for https connectOrigin
 */
export function createDPreviewRequest({publicOrigin, connectOrigin = publicOrigin, secret, ca,
  clock = Date.now, nonce = () => randomBytes(16).toString('hex'), timeoutMs = 50000} = {}) {
  const pub = new URL(publicOrigin), target = new URL(connectOrigin);
  check(pub.protocol === 'https:' && pub.origin === publicOrigin && !pub.username && !pub.password, 'D_TRANSPORT_CONFIG');
  const loopbackHttp = target.protocol === 'http:' && target.hostname === '127.0.0.1';
  check((target.protocol === 'https:' || loopbackHttp) && target.origin === connectOrigin
    && !target.username && !target.password, 'D_TRANSPORT_CONFIG');
  check(typeof secret === 'string' && /^[a-f0-9]{64,128}$/.test(secret), 'D_TRANSPORT_CONFIG');
  const client = target.protocol === 'https:' ? https : http;

  return function request(command, {signal} = {}) {
    check(command && command.method === 'POST' && PATHS.has(command.path), 'D_TRANSPORT_ROUTE');
    check(signal instanceof AbortSignal, 'D_TRANSPORT_SIGNAL');
    signal.throwIfAborted();
    const raw = Buffer.from(JSON.stringify(command.body), 'utf8');
    check(raw.length <= 16384, 'D_TRANSPORT_BODY');
    const timestamp = String(Math.floor(clock() / 1000)), n = nonce();
    check(/^[0-9]{10}$/.test(timestamp) && /^[a-f0-9]{32}$/.test(n), 'D_TRANSPORT_NONCE');
    const headers = {
      host: pub.host, 'content-type': 'application/json', 'content-length': String(raw.length),
      'x-clear-timestamp': timestamp, 'x-clear-nonce': n,
      'x-clear-signature': dPreviewSignature(secret, timestamp, n, command.path, raw),
    };
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (ok, value) => { if (settled) return; settled = true; signal.removeEventListener('abort', abort); clearTimeout(timer); (ok ? resolve : reject)(value); };
      const req = client.request({protocol: target.protocol, hostname: target.hostname, port: target.port,
        path: command.path, method: 'POST', headers, ...(ca ? {ca} : {}), agent: false}, res => {
        // Never follow or accept a redirect; never read an unbounded reply.
        if (res.statusCode >= 300 && res.statusCode < 400) { res.destroy(); return done(false, Object.assign(new Error('D_TRANSPORT_REDIRECT'), {code: 'D_TRANSPORT_REDIRECT'})); }
        const chunks = []; let size = 0;
        res.on('data', chunk => {
          size += chunk.length;
          if (size > MAX_REPLY_BYTES) { res.destroy(); done(false, Object.assign(new Error('D_TRANSPORT_REPLY_LIMIT'), {code: 'D_TRANSPORT_REPLY_LIMIT'})); return; }
          chunks.push(chunk);
        });
        res.on('end', () => {
          try {
            check(/^application\/json(?:;|$)/i.test(res.headers['content-type'] ?? ''), 'D_TRANSPORT_REPLY');
            const body = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(Buffer.concat(chunks)));
            done(true, {status: res.statusCode, body});
          } catch { done(false, Object.assign(new Error('D_TRANSPORT_REPLY'), {code: 'D_TRANSPORT_REPLY'})); }
        });
        res.on('error', () => done(false, Object.assign(new Error('D_TRANSPORT_FAILED'), {code: 'D_TRANSPORT_FAILED'})));
      });
      const abort = () => { req.destroy(); done(false, signal.reason ?? Object.assign(new Error('D_TRANSPORT_ABORTED'), {code: 'D_TRANSPORT_ABORTED'})); };
      const timer = setTimeout(() => { req.destroy(); done(false, Object.assign(new Error('D_TRANSPORT_TIMEOUT'), {code: 'D_TRANSPORT_TIMEOUT'})); }, timeoutMs);
      timer.unref?.();
      signal.addEventListener('abort', abort, {once: true});
      req.on('error', () => done(false, Object.assign(new Error('D_TRANSPORT_FAILED'), {code: 'D_TRANSPORT_FAILED'})));
      req.end(raw);
    });
  };
}
