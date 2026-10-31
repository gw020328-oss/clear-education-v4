import test from 'node:test';
import assert from 'node:assert/strict';
import { createSameOriginApi } from '../../src/application/api-client.mjs';
import { createSameOriginApi as compatibilityImport } from '../../src/application/wallet-client.mjs';
const origin = 'https://clear.example.invalid';
const requestId = '00000000-0000-4000-8000-000000000000';
const apiFor = (fetch, extra = {}) => createSameOriginApi({ origin, fetch, ...extra });
async function errorOf(pending) { try { await pending; assert.fail('expected rejection'); } catch (error) { assert.equal(error.name, 'ApiRequestError'); return error; } }
const reply = (code, status, extra = {}) => Response.json({ code, requestId, message: 'secret-server-message',
  retryable: true, nextAction: 'https://secret.invalid', ...extra }, { status });

test('old import and fixed HTTP messages remain compatible; successful JSON is unchanged', async () => {
  assert.equal(compatibilityImport, createSameOriginApi);
  let options; const result = await apiFor(async (url, o) => { assert.equal(url, origin + '/applications'); options = o; return Response.json({ state: 'DRAFT' }); })('/applications');
  assert.deepEqual(result, { state: 'DRAFT' });
  assert.equal(options.credentials, 'same-origin'); assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
  const e = await errorOf(apiFor(() => reply('SIGNATURE', 401))('/auth/session'));
  assert.equal(e.message, 'AUTH_REQUIRED'); assert.equal(e.code, 'SIGNATURE'); assert.equal(e.nextAction, 'SIGN_IN_AGAIN');
});

for (const [code, status, action] of [
  ['CSRF', 403, 'SIGN_IN_AGAIN'], ['WALLET_CONTEXT_CHANGED', 403, 'RECONNECT_WALLET'],
  ['PROOF_BROWSER_SESSION', 403, 'REFRESH_STATE'], ['APPLICATION_NOT_FOUND', 404, 'CHECK_REQUEST'],
  ['IDEMPOTENCY_CONFLICT', 409, 'REFRESH_STATE'], ['PRODUCT_RESULT_CONFLICT', 409, 'CHECK_RESULT'],
  ['PROOF_SOURCE_INCOMPLETE', 409, 'WAIT_FOR_SOURCE'], ['PROOF_SESSION_EXPIRED', 410, 'REFRESH_STATE'],
  ['FUNDING_UNCONFIRMED', 422, 'CHECK_RESULT'], ['CHAIN_UNAVAILABLE', 422, 'RETRY_LATER'],
  ['PRODUCT_VERIFIER_BUSY', 429, 'RETRY_LATER'], ['INTERNAL_ERROR', 500, 'RETRY_LATER'],
]) test('allowlisted status/code and fixed recovery: ' + code, async () => {
  const e = await errorOf(apiFor(() => reply(code, status))('/applications'));
  assert.equal(e.code, code); assert.equal(e.status, status); assert.equal(e.message, 'API_REQUEST_FAILED');
  assert.equal(e.nextAction, action); assert.equal(e.requestId, requestId);
  assert.ok(!JSON.stringify(e).includes('secret')); assert.equal(e.cause, undefined);
});

for (const variant of ['unknown', 'wrong-status', 'array', 'null', 'bad-json', 'html', 'bad-id', 'object-code', 'invalid-utf8']) test('untrusted error envelope cannot supply recovery commands: ' + variant, async () => {
  const payload = { code: 'secret-code', requestId: 'secret-id', message: 'secret-message', retryable: true, nextAction: 'PAYOUT' };
  let response = Response.json(payload, { status: 422 });
  if (variant === 'wrong-status') response = reply('PROOF_SOURCE_INCOMPLETE', 422);
  if (variant === 'array') response = Response.json([payload], { status: 422 });
  if (variant === 'null') response = Response.json(null, { status: 422 });
  if (variant === 'bad-json') response = new Response('{secret', { status: 422, headers: { 'content-type': 'application/json' } });
  if (variant === 'html') response = new Response('<h1>secret</h1>', { status: 422, headers: { 'content-type': 'text/html' } });
  if (variant === 'bad-id') response = reply('PRODUCT_VERIFICATION_FAILED', 422, { requestId: 'secret-id' });
  if (variant === 'object-code') response = Response.json({ ...payload, code: { secret: true } }, { status: 422 });
  if (variant === 'invalid-utf8') response = new Response(new Uint8Array([255]), { status: 422, headers: { 'content-type': 'application/json' } });
  const e = await errorOf(apiFor(() => response)('/applications'));
  assert.equal(e.code, variant === 'bad-id' ? 'PRODUCT_VERIFICATION_FAILED' : 'API_REQUEST_FAILED');
  assert.equal(e.retryable, false); assert.equal(e.nextAction, 'CHECK_REQUEST');
  assert.ok(!JSON.stringify(e).includes('secret')); assert.ok(!JSON.stringify(e).includes('PAYOUT'));
});

for (const declared of [false, true]) test('oversized error body is discarded and stream cancelled, declared=' + declared, async () => {
  let cancelled = false, pulls = 0;
  const stream = new ReadableStream({ pull(c) { pulls++; c.enqueue(new Uint8Array(4097)); }, cancel() { cancelled = true; } });
  const headers = { 'content-type': 'application/json', ...(declared ? { 'content-length': '5000' } : {}) };
  const e = await errorOf(apiFor(() => new Response(stream, { status: 409, headers }))('/applications'));
  assert.equal(e.code, 'API_REQUEST_FAILED'); assert.equal(cancelled, true); assert.ok(pulls <= 2);
});

test('exactly 4096 UTF-8 bytes can carry a safe error, 4097 cannot', async () => {
  const base = JSON.stringify({ code: 'PROOF_SOURCE_INCOMPLETE', requestId });
  for (const size of [4096, 4097]) {
    const e = await errorOf(apiFor(() => new Response(base + ' '.repeat(size - base.length), {
      status: 409, headers: { 'content-type': 'application/json; charset=utf-8' },
    }))('/applications'));
    assert.equal(e.code, size === 4096 ? 'PROOF_SOURCE_INCOMPLETE' : 'API_REQUEST_FAILED');
  }
});

for (const method of ['GET', 'POST']) test('network and 5xx errors never auto-retry; ' + method + ' recovery is conservative', async () => {
  for (const status of [null, 503]) {
    let calls = 0;
    const api = apiFor(() => { calls++; if (!status) throw new Error('secret-network-url'); return reply('secret', status); });
    const e = await errorOf(api('/applications', { method, ...(method === 'POST' ? { body: {} } : {}) }));
    assert.equal(calls, 1); assert.equal(e.outcome, 'UNKNOWN'); assert.equal(e.retryable, method === 'GET');
    assert.equal(e.nextAction, method === 'GET' ? 'RETRY_LATER' : 'CHECK_RESULT');
    assert.ok(!JSON.stringify(e).includes('secret')); assert.ok(!e.stack.includes('secret'));
  }
});

for (const phase of ['pre-abort', 'before-fetch', 'fetch', 'body', 'timeout']) test('cancellation and deadline boundary: ' + phase, async () => {
  const controller = new AbortController(); let calls = 0, entered, bodyClosed = false;
  const waiting = new Promise(resolve => { entered = resolve; });
  const api = apiFor(() => {
    calls++; entered();
    if (phase === 'body') return new Response(new ReadableStream({ cancel() { bodyClosed = true; } }), { status: 422, headers: { 'content-type': 'application/json' } });
    return new Promise(() => {});
  }, { timeoutMs: phase === 'timeout' ? 20 : 1000 });
  if (phase === 'pre-abort') controller.abort(new Error('secret-abort-reason'));
  const pending = api('/applications', { method: 'POST', body: {}, signal: controller.signal });
  if (phase === 'before-fetch') controller.abort('secret');
  if (['fetch', 'body'].includes(phase)) { await waiting; await new Promise(resolve => setImmediate(resolve)); controller.abort('secret'); }
  const e = await errorOf(pending), before = ['pre-abort', 'before-fetch'].includes(phase);
  assert.equal(e.code, phase === 'timeout' ? 'API_TIMEOUT' : 'API_ABORTED');
  assert.equal(e.outcome, before ? 'NOT_SENT' : 'UNKNOWN'); assert.equal(calls, before ? 0 : 1);
  assert.equal(e.nextAction, before ? 'NONE' : 'CHECK_RESULT'); assert.equal(e.retryable, false);
  if (phase === 'body') assert.equal(bodyClosed, true);
  assert.ok(!JSON.stringify(e).includes('secret'));
});

test('late fetch result after timeout is discarded and its body closed', async () => {
  let finish, closed = false;
  const e = await errorOf(apiFor(() => new Promise(resolve => { finish = resolve; }), { timeoutMs: 20 })('/applications'));
  assert.equal(e.code, 'API_TIMEOUT'); assert.equal(e.retryable, true);
  finish(new Response(new ReadableStream({ cancel() { closed = true; } })));
  await new Promise(resolve => setImmediate(resolve)); assert.equal(closed, true);
});

test('deadline includes success body and cleared timers cannot abort completed requests', async () => {
  let completedSignal;
  const fast = apiFor((url, options) => { completedSignal = options.signal; return Response.json({ ok: true }); }, { timeoutMs: 20 });
  assert.deepEqual(await fast('/applications'), { ok: true });
  await new Promise(resolve => setTimeout(resolve, 35)); assert.equal(completedSignal.aborted, false);
  let closed = false;
  const e = await errorOf(apiFor(() => new Response(new ReadableStream({ cancel() { closed = true; } })), { timeoutMs: 20 })('/applications', { method: 'POST', body: {} }));
  assert.equal(e.code, 'API_TIMEOUT'); assert.equal(e.nextAction, 'CHECK_RESULT');
  assert.equal(closed, true);
});

test('invalid successful JSON and unexpected redirects never leak raw response errors', async () => {
  for (const response of [new Response('secret-not-json'), { status: 200, ok: true, redirected: true, body: null }]) {
    const e = await errorOf(apiFor(() => response)('/applications', { method: 'POST', body: {} }));
    assert.equal(e.code, 'API_RESPONSE_INVALID'); assert.equal(e.outcome, 'UNKNOWN'); assert.equal(e.nextAction, 'CHECK_RESULT');
    assert.ok(!e.stack.includes('secret'));
  }
});

test('invalid paths, methods, headers and unserializable input never call fetch or expose input', async () => {
  let calls = 0; const api = apiFor(() => { calls++; });
  for (const path of ['https://secret.invalid', '//secret.invalid', '/\\secret.invalid', '/auth#secret', '/auth?secret', '/\nsecret']) {
    assert.equal((await errorOf(api(path))).code, 'API_ORIGIN');
  }
  const circular = {}; circular.self = circular;
  for (const options of [{ method: 'DELETE' }, { body: {} }, { method: 'POST', body: circular },
    { method: 'POST', body: 1n }, { headers: { 'secret\n': 'secret' } }, { signal: {} }]) {
    assert.equal((await errorOf(api('/applications', options))).outcome, 'NOT_SENT');
  }
  assert.equal(calls, 0);
  assert.throws(() => createSameOriginApi({ origin: 'secret-input' }), { message: 'ORIGIN_CONFIG' });
});

test('only the C2 raw deletion route allows DELETE and a lost mutation response requires result lookup',async()=>{
 const path='/mvp/applications/0x'+'11'.repeat(32)+'/submissions/submission-example/raw';let calls=0;
 const api=apiFor(async(url,options)=>{calls++;assert.equal(options.method,'DELETE');throw Error('lost');});
 const error=await errorOf(api(path,{method:'DELETE'}));assert.equal(error.nextAction,'CHECK_RESULT');assert.equal(error.outcome,'UNKNOWN');
 assert.equal((await errorOf(api('/applications',{method:'DELETE'}))).outcome,'NOT_SENT');
 assert.equal((await errorOf(api(path,{method:'DELETE',body:{}}))).outcome,'NOT_SENT');assert.equal(calls,1);
});

for (const [path,method,status,body,expected] of [
 ['/bootcamp/v3/applications/application-fixture/procedure','GET',409,{error:'BC_NORMAL_PROCEDURE_NOT_READY'},'BC_NORMAL_PROCEDURE_NOT_READY'],
 ['/applications','GET',409,{error:'BC_NORMAL_PROCEDURE_NOT_READY'},'API_REQUEST_FAILED'],
 ['/bootcamp/v3/applications/application-fixture/procedure','POST',409,{error:'BC_NORMAL_PROCEDURE_NOT_READY'},'API_REQUEST_FAILED'],
 ['/bootcamp/v3/applications/application-fixture/procedure','GET',500,{error:'BC_NORMAL_PROCEDURE_NOT_READY'},'API_REQUEST_FAILED'],
 ['/bootcamp/v3/applications/application-fixture/procedure','GET',409,{error:'BC_VIEW_STALE'},'API_REQUEST_FAILED'],
 ['/bootcamp/v3/applications/application-fixture/procedure','GET',409,{error:{code:'BC_NORMAL_PROCEDURE_NOT_READY'}},'API_REQUEST_FAILED'],
]) test('normal procedure waiting envelope is scoped: '+JSON.stringify([path,method,status,body]),async()=>{
 let calls=0;const e=await errorOf(apiFor(()=>{calls++;return Response.json({...body,message:'secret',nextAction:'PAY'},{status});})(path,{method}));
 assert.equal(e.code,expected);assert.equal(calls,1);assert.equal(e.message,'API_REQUEST_FAILED');
 assert.ok(!JSON.stringify(e).includes('secret'));assert.ok(!JSON.stringify(e).includes('PAY'));
});
