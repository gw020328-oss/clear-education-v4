import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalMoodleClient } from '../../src/learning-evidence/moodle-mvp/local-http.mjs';

const token='a'.repeat(32); // Invented test canary, never a Moodle credential.
const response=value=>new Response(JSON.stringify(JSON.stringify(value)));
const create=options=>createLocalMoodleClient({baseUrl:'http://127.0.0.1:18765',courseId:2,tokenProvider:()=>token,...options});
test('loopback URL/function/method are fixed; token stays in POST body with no cookies/redirects',async()=>{
  const calls=[],c=create({fetchImpl:async(url,options)=>{calls.push([url,options]);return response({profile:'clear-local-moodle.1'});}});
  await c.identity();await c.readManifest('r1');await c.readPage('r1','page-0');await c.close();
  assert.equal(calls.length,3);
  for(const [url,o] of calls){assert.equal(url,'http://127.0.0.1:18765/webservice/rest/server.php');assert.ok(!url.includes(token));
    assert.equal(o.method,'POST');assert.equal(o.body.get('wstoken'),token);assert.equal(o.credentials,'omit');assert.equal(o.redirect,'error');assert.equal(o.cache,'no-store');}
  assert.deepEqual(calls.map(c=>c[1].body.get('wsfunction')),['local_clearapi_identity','local_clearapi_manifest','local_clearapi_page']);
  assert.equal(c.exchange,undefined);await assert.rejects(c.identity(),/LOCAL_CANCELLED/);
});
for(const baseUrl of ['https://127.0.0.1:18765','http://localhost:18765','http://127.0.0.1:18765/?token=x','http://example.invalid','http://user:pass@127.0.0.1:18765']){
  test('external or altered URL cannot enter local-only transport: '+baseUrl,()=>assert.throws(()=>create({baseUrl}),/LOCAL_CLIENT_CONFIG/));
}
test('unknown revision/page are rejected before the client can issue a request',()=>{
  const c=create({fetchImpl:()=>{throw Error('UNEXPECTED_FETCH');}});assert.throws(()=>c.readManifest('r0'),/LOCAL_REVISION/);
  assert.throws(()=>c.readPage('r1','https://example.invalid'),/LOCAL_PAGE/);
});
for(const [name,value,expected] of [
  ['invalidtoken',{errorcode:'invalidtoken',exception:'ignored'},'LOCAL_AUTH_REJECTED'],
  ['access',{errorcode:'accessexception',exception:'SYNTHETIC_PRIVATE_TEXT'},'LOCAL_ACCESS_REJECTED'],
  ['revision',null,'LOCAL_REVISION_CHANGED'],
]){
  test('safe fixed code for '+name,async()=>{
    const c=create({fetchImpl:async()=>name==='revision'?response({error:'REVISION_CHANGED'}):new Response(JSON.stringify(value))});
    await assert.rejects(c.identity(),e=>e.message===expected&&!e.message.includes('SYNTHETIC_PRIVATE'));await c.close();
  });
}
test('oversized and malformed responses have no provider text in errors',async()=>{
  for(const bytes of ['x'.repeat(262145),'SYNTHETIC_PRIVATE_NOT_JSON']){
    const c=create({fetchImpl:async()=>new Response(bytes)});await assert.rejects(c.identity(),e=>e.message.startsWith('LOCAL_')&&!e.message.includes('SYNTHETIC_PRIVATE'));await c.close();
  }
});
test('token provider failures and non-Error network failures do not leak secrets',async()=>{
  const a=create({tokenProvider:()=>{throw Error('SYNTHETIC_SECRET');}});await assert.rejects(a.identity(),/LOCAL_AUTH_UNAVAILABLE/);await a.close();
  const b=create({fetchImpl:async()=>{throw null;}});await assert.rejects(b.identity(),/LOCAL_SOURCE_UNAVAILABLE/);await b.close();
});
test('abort cancels read; timeout is bounded and distinguishable from a source failure',async()=>{
  const mock=async(url,{signal})=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('TEST_TIMEOUT_GUARD')),100);
    signal.addEventListener('abort',()=>{clearTimeout(timer);reject(signal.reason);},{once:true});
    if(signal.aborted){clearTimeout(timer);reject(signal.reason);}
  });
  const a=create({fetchImpl:mock,timeoutMs:5});await assert.rejects(a.identity(),/LOCAL_TIMEOUT/);await a.close();
  const ctrl=new AbortController(),b=create({fetchImpl:mock});const pending=b.identity(ctrl.signal);ctrl.abort();await assert.rejects(pending,/LOCAL_CANCELLED/);await b.close();
});

test('a stalled token provider is bounded, and cancellation never starts a late fetch',async()=>{
  const keepAlive=setTimeout(()=>{},200);
  try {
    const a=create({timeoutMs:5,tokenProvider:()=>new Promise(()=>{}),fetchImpl:()=>assert.fail('late fetch')});
    await assert.rejects(a.identity(),/LOCAL_TIMEOUT/);await a.close();
    let complete;const b=create({tokenProvider:()=>new Promise(r=>{complete=r;}),fetchImpl:()=>assert.fail('late fetch')});
    const pending=b.identity();await Promise.resolve();await b.close();await assert.rejects(pending,/LOCAL_CANCELLED/);
    complete(token);await Promise.resolve();
  } finally {clearTimeout(keepAlive);}
});
