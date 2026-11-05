// Run with --import ./tests/agent-preview-loopback/loopback-only.mjs.
// If CLEAR_D_PREVIEW_ROOT points to an exported D snapshot, the request is also
// checked with D's own auth.mjs authenticate().
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHash, createHmac, randomBytes} from 'node:crypto';
import {createDPreviewRequest} from '../../src/agent-preview/d-preview-transport.mjs';

const secret = randomBytes(32).toString('hex');
const independent = (ts, nonce, path, raw) => createHmac('sha256', secret)
  .update(`${ts}\n${nonce}\nPOST\n${path}\n${createHash('sha256').update(raw).digest('hex')}`).digest('hex');

async function server(t, handler) {
  const s = http.createServer(handler);
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => { s.closeAllConnections(); s.close(r); }));
  return `http://127.0.0.1:${s.address().port}`;
}
const read = req => new Promise(r => { const c = []; req.on('data', x => c.push(x)); req.on('end', () => r(Buffer.concat(c))); });

test('signs the exact bytes it sends, sends no browser headers, returns {status, body}', async t => {
  let seen;
  const origin = await server(t, async (req, res) => {
    const raw = await read(req); seen = {headers: req.headers, raw, url: req.url};
    res.writeHead(422, {'content-type': 'application/json'});
    res.end(JSON.stringify({version: 'clear-external-preview-error.1', code: 'APPROVAL_REQUIRED_OR_SPENT', paymentAllowed: false}));
  });
  const request = createDPreviewRequest({publicOrigin: 'https://d.example.invalid', connectOrigin: origin, secret});
  const body = {institutionId: 'clear-demo', courseId: '2', operatorId: '2', sourceText: '😀 강의', approvalRef: 'approved_1'};
  const reply = await request({method: 'POST', path: '/v1/preview/generate', body}, {signal: new AbortController().signal});
  assert.deepEqual(reply, {status: 422, body: {version: 'clear-external-preview-error.1', code: 'APPROVAL_REQUIRED_OR_SPENT', paymentAllowed: false}});
  assert.equal(seen.url, '/v1/preview/generate'); assert.equal(seen.headers.host, 'd.example.invalid');
  assert.equal(seen.raw.toString(), JSON.stringify(body));
  const h = seen.headers;
  assert.equal(h['x-clear-signature'], independent(h['x-clear-timestamp'], h['x-clear-nonce'], '/v1/preview/generate', seen.raw));
  for (const k of ['cookie', 'origin', 'sec-fetch-site', 'x-csrf-token', 'x-wallet']) assert.equal(h[k], undefined);
  if (process.env.CLEAR_D_PREVIEW_ROOT) {
    const {authenticate} = await import(new URL('deploy/agent-preview/auth.mjs', new URL(process.env.CLEAR_D_PREVIEW_ROOT + '/', 'file:///')).href);
    const nonces = new Set();
    authenticate({headers: h, url: seen.url}, seen.raw, {secret, config: {publicOrigin: 'https://d.example.invalid'},
      store: {nonce(n) { assert.ok(!nonces.has(n)); nonces.add(n); }}, now: Date.now()});
    t.diagnostic('verified with D auth.mjs authenticate()');
  }
});

test('fresh nonce per call, fixed routes only, no redirect, bounded reply, abort', async t => {
  const nonces = [];
  let mode = 'ok';
  const origin = await server(t, async (req, res) => {
    await read(req); nonces.push(req.headers['x-clear-nonce']);
    if (mode === 'redirect') { res.writeHead(302, {location: 'https://elsewhere.invalid/'}); return res.end(); }
    if (mode === 'big') { res.writeHead(200, {'content-type': 'application/json'}); return res.end(JSON.stringify({x: 'y'.repeat(140000)})); }
    if (mode === 'hang') return; // never answers
    res.writeHead(200, {'content-type': 'application/json'}); res.end('{"ok":true}');
  });
  const request = createDPreviewRequest({publicOrigin: 'https://d.example.invalid', connectOrigin: origin, secret});
  const call = (path = '/v1/preview/prepare', signal = new AbortController().signal) => request({method: 'POST', path, body: {a: 1}}, {signal});
  await call(); await call();
  assert.notEqual(nonces[0], nonces[1]);
  assert.throws(() => call('/v1/admin'), /D_TRANSPORT_ROUTE/);
  mode = 'redirect'; await assert.rejects(call(), /D_TRANSPORT_REDIRECT/);
  mode = 'big'; await assert.rejects(call(), /D_TRANSPORT_REPLY_LIMIT/);
  mode = 'hang'; const c = new AbortController(); const pending = call('/v1/preview/prepare', c.signal);
  setTimeout(() => c.abort(Object.assign(Error('REQUEST_ABORTED'), {code: 'REQUEST_ABORTED'})), 50);
  await assert.rejects(pending, /REQUEST_ABORTED/);
  assert.throws(() => createDPreviewRequest({publicOrigin: 'http://d.example.invalid', secret}), /D_TRANSPORT_CONFIG/);
  assert.throws(() => createDPreviewRequest({publicOrigin: 'https://d.example.invalid', connectOrigin: 'http://10.0.0.1:80', secret}), /D_TRANSPORT_CONFIG/);
});
