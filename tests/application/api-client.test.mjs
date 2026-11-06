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
 ['/bootcamp/v3/applications/application-fixture/procedure','GET',409,{error:'BC_VIEW_STALE'},'BC_VIEW_STALE'],
 ['/bootcamp/v3/applications/application-fixture/procedure','GET',409,{error:{code:'BC_NORMAL_PROCEDURE_NOT_READY'}},'API_REQUEST_FAILED'],
]) test('normal procedure waiting envelope is scoped: '+JSON.stringify([path,method,status,body]),async()=>{
 let calls=0;const e=await errorOf(apiFor(()=>{calls++;return Response.json({...body,message:'secret',nextAction:'PAY'},{status});})(path,{method}));
 assert.equal(e.code,expected);assert.equal(calls,1);assert.equal(e.message,'API_REQUEST_FAILED');
 assert.ok(!JSON.stringify(e).includes('secret'));assert.ok(!JSON.stringify(e).includes('PAY'));
});

const registration='/bootcamp/v3/applications/application-fixture/recipient-registration';
const checkpoint=encodeURIComponent(JSON.stringify({number:'10',hash:'0x'+'11'.repeat(32),time:'1900000000'}));
test('browser transport allows only bounded single registration checkpoint GET, with no write or foreign query expansion',async()=>{
 let calls=0;const api=apiFor(async url=>{calls++;assert.equal(url,origin+registration+'?checkpoint='+checkpoint);return Response.json({ok:true});});
 assert.deepEqual(await api(registration+'?checkpoint='+checkpoint),{ok:true});
 for(const [path,method] of [[registration+'?x=1','GET'],[registration+'?checkpoint='+checkpoint+'&checkpoint='+checkpoint,'GET'],[registration+'?checkpoint='+checkpoint+'&x=1','GET'],[registration+'?checkpoint=','GET'],[registration+'?checkpoint='+('a'.repeat(769)),'GET'],[registration+'?checkpoint='+checkpoint+'#fragment','GET'],[registration+'?checkpoint='+checkpoint,'POST'],['/bootcamp/v3/applications/application-fixture/procedure?checkpoint='+checkpoint,'GET']]){
  const e=await errorOf(api(path,{method}));assert.equal(e.code,'API_ORIGIN');assert.equal(e.outcome,'NOT_SENT');
 }
 assert.equal(calls,1);
});
for(const [path,status,body,expected] of [
 [registration+'?checkpoint='+checkpoint,404,{error:'BC_NOT_FOUND'},'BC_NOT_FOUND'],
 [registration,409,{error:'BC_RECIPIENT_REGISTRATION_CHAIN'},'BC_RECIPIENT_REGISTRATION_CHAIN'],
 [registration,409,{error:'BC_VIEW_STALE'},'BC_VIEW_STALE'],
 [registration,500,{error:'BC_NOT_FOUND'},'API_REQUEST_FAILED'],
 [registration,409,{error:'secret-body'},'API_REQUEST_FAILED'],
 ['/applications',404,{error:'BC_NOT_FOUND'},'API_REQUEST_FAILED'],
])test('registration browser errors preserve only route/status-scoped fixed codes '+expected+' '+status+' '+path,async()=>{
 const e=await errorOf(apiFor(()=>Response.json({...body,message:'secret-detail'},{status}))(path));
 assert.equal(e.message,'API_REQUEST_FAILED');assert.equal(e.code,expected);assert.ok(!JSON.stringify(e).includes('secret'));
});

for(const [method,path,status,code,expected]of [
 ['GET','/bootcamp/v2/applications/application-one/operations',409,'BC_VIEW_STALE','BC_VIEW_STALE'],
 ['GET','/bootcamp/v3/applications/application-one/procedure',409,'BC_VIEW_STALE','BC_VIEW_STALE'],
 // A consent POST CAS rejection keeps its fixed code (not recorded; covered by the review-consents test below).
 ['POST','/bootcamp/v3/applications/application-one/review-consents',409,'BC_VIEW_STALE','BC_VIEW_STALE'],
 ['GET','/bootcamp/v2/applications/application-one/procedure',409,'BC_VIEW_STALE','API_REQUEST_FAILED'],
 ['GET','/bootcamp/v3/applications/application-one/operations',409,'BC_VIEW_STALE','API_REQUEST_FAILED'],
 ['GET','/bootcamp/v3/applications/application-one/procedure',403,'BC_VIEW_STALE','API_REQUEST_FAILED'],
 ['GET','/bootcamp/v3/applications/application-one/procedure',409,'PRIVATE_UNKNOWN','API_REQUEST_FAILED'],
])test('bootcamp projection conflict is fixed-code, exact-route, GET-only: '+method+' '+path+' '+code+' '+status,async()=>{
 let calls=0;const api=apiFor(()=>{calls++;return Response.json({error:code,detail:'secret-text'},{status})});
 const e=await errorOf(api(path,{method}));assert.equal(e.code,expected);assert.equal(calls,1,'transport never retries');assert.ok(!JSON.stringify(e).includes('secret'));
});

test('only the exact certificate-start POST CAS rejection keeps its fixed code',async()=>{
 const path='/bootcamp/v4/applications/application-one/certificate-start';
 for(const [method,target,status,expected]of [['POST',path,409,'BC_REVISION_CONFLICT'],['GET',path,409,'API_REQUEST_FAILED'],['POST','/applications',409,'API_REQUEST_FAILED'],['POST',path,403,'API_REQUEST_FAILED']]){
  const api=apiFor(()=>Response.json({error:'BC_REVISION_CONFLICT',message:'private'},{status}));
  const e=await errorOf(api(target,{method,...(method==='POST'?{body:{expectedRevision:1},idempotencyKey:'synthetic-one'}:{})}));
  assert.equal(e.code,expected);assert(!JSON.stringify(e).includes('private'));assert.equal(e.retryable,false);
 }
});

test('only the exact review-consents POST CAS rejection keeps BC_VIEW_STALE',async()=>{
 const path='/bootcamp/v3/applications/application-one/review-consents';
 for(const [method,target,status,error,expected]of [['POST',path,409,'BC_VIEW_STALE','BC_VIEW_STALE'],['POST',path,409,'BC_E3_PORT_CHANGED','API_REQUEST_FAILED'],
  ['POST',path,403,'BC_VIEW_STALE','API_REQUEST_FAILED'],['POST','/bootcamp/v3/applications/application-one/publish',409,'BC_VIEW_STALE','API_REQUEST_FAILED']]){
  const api=apiFor(()=>Response.json({error,message:'private'},{status}));
  const e=await errorOf(api(target,{method,body:{expectedRevision:1},idempotencyKey:'synthetic-one'}));
  assert.equal(e.code,expected);assert(!JSON.stringify(e).includes('private'));assert.equal(e.retryable,false);
 }
});

test('operator preview POST failures keep only the failure kind and fixed code, never the body',async()=>{
 const gates={version:'clear-operator-preview.1',automaticEligibility:false,paymentAllowed:false,stage:'FAILED'};
 const d={...gates,contextRef:'ctx-private',failure:{kind:'D_HTTP',status:503,error:{version:'clear-external-preview-error.1',code:'OBSERVATION_ADAPTER_NOT_ACCEPTED',detail:'private'}}};
 const relay={...gates,failure:{kind:'RELAY',code:'PREVIEW_FORBIDDEN'}};
 for(const [path,method,status,body,expected]of [
  ['/bootcamp/preview/execute','POST',503,d,{kind:'D_HTTP',status:503,code:'OBSERVATION_ADAPTER_NOT_ACCEPTED'}],
  ['/bootcamp/preview/prepare','POST',403,relay,{kind:'RELAY',code:'PREVIEW_FORBIDDEN'}],
  ['/bootcamp/preview/generate','POST',409,{...gates,failure:{kind:'RELAY',code:'not fixed'}},null],
  ['/bootcamp/preview/publish','POST',403,relay,null],
  ['/bootcamp/v3/applications/application-one/review-consents','POST',503,d,null]]){
  const e=await errorOf(apiFor(()=>Response.json(body,{status}))(path,{method,body:{a:1},idempotencyKey:'preview-synthetic'}));
  assert.deepEqual(e.previewFailure,expected,path);assert(!JSON.stringify(e).includes('private'));
  assert.equal(e.outcome,status>=500?'UNKNOWN':'HTTP_ERROR','a D 5xx is never read as a definite rejection');
 }
});
