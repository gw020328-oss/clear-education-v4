import test from 'node:test';
import assert from 'node:assert/strict';
import {registeredFixture} from './fixtures/registered-preview-fixture.mjs';

const enabled=!!process.env.CLEAR_D_REGISTERED_WORKTREE;
const check=(name,fn)=>test(name,{skip:!enabled},fn);
async function draft(x){
  assert.equal((await x.request('/preview/prepare',x.input)).status,200);
  assert.deepEqual(x.approvals(),[]);x.approve();
  const d=await x.request('/preview/generate',x.generate);assert.equal(d.status,200);return x.draftInput(d.body);
}
check('actual D runtime startup + signed prepare creates no grant; no-grant generation never reaches provider',async t=>{
  // Observe attempted credential access without returning or reading its value.
  // Even a future grant-guard regression cannot make this test call a provider.
  const environment=process.env,fetch=globalThis.fetch;
  let keyReads=0,providerCalls=0;
  const onRuntimeStart=()=>{process.env=new Proxy(environment,{get(target,name){
    if(name==='GEMINI_API_KEY'){keyReads++;return undefined;}
    return Reflect.get(target,name);
  }});
  globalThis.fetch=()=>{providerCalls++;throw Error('ACTUAL_PROVIDER_DISABLED_IN_TEST');};};
  t.after(()=>{process.env=environment;globalThis.fetch=fetch;});
  const x=await registeredFixture(t,{actual:true,onRuntimeStart});
  assert.equal((await x.request('/preview/ownerRegistration',x.input)).status,404);
  for(const extra of [{release:x.release},{scopeHash:'f'.repeat(64)},{subjectRef:'other'},{courseRef:'other'}])
    assert.equal((await x.request('/preview/prepare',{...x.input,...extra})).status,422);
  assert.equal(x.trace.length,0);
  const prepared=await x.request('/preview/prepare',x.input);
  assert.equal(prepared.status,200);assert.equal(prepared.body.version,'clear-preview-context-receipt.1');
  assert.deepEqual(x.approvals(),[]);
  assert.equal((await x.request('/preview/generate',x.generate)).status,422);
  assert.deepEqual(x.approvals(),[]);
  assert.equal((await x.request('/preview/generate',x.generate)).status,422);
  assert.equal(x.trace.filter(v=>v.path.endsWith('/generate')).length,1);
  assert.equal(keyReads,0);assert.equal(providerCalls,0);
});
check('explicit OFFLINE runtime runs signed prepare, separate grant, validated draft/review/observation through B HTTPS',async t=>{
  const x=await registeredFixture(t),input=await draft(x);
  assert.deepEqual(x.calls,['countTokens','generateContent']);
  assert.equal(x.approvals()[0].consumed,1);
  assert.equal((await x.request('/preview/observe',input)).status,422);
  assert.equal((await x.request('/preview/review',input)).status,200);
  const result=await x.request('/preview/observe',input);
  assert.equal(result.status,200);assert.equal(result.body.version,'clear-preview-test-observation-receipt.1');
  assert.equal(result.body.modelProvenance,'OFFLINE_TEST_TRANSPORT');assert.equal(result.body.observation.status,'COMPLETE');
  assert.deepEqual(Object.keys(x.trace.at(-1).payload).sort(),['observedAt','status','targetRef']);
  assert.equal((await x.request('/preview/observe',input)).status,422);
});
check('current owner release change rejects prepare before peer dispatch',async t=>{
  const x=await registeredFixture(t);x.changeRelease({artifactHash:'c'.repeat(64)});
  assert.equal((await x.request('/preview/prepare',x.input)).status,422);assert.equal(x.trace.length,0);assert.deepEqual(x.approvals(),[]);
});
check('D refuses a signed but mismatched registration.release; B stays unusable with no grant',async t=>{
  const x=await registeredFixture(t,{tamper:{request:(path,value)=>path.endsWith('/prepare')?{...value,release:{...value.release,limitsHash:'c'.repeat(64)}}:null}});
  assert.equal((await x.request('/preview/prepare',x.input)).status,422);
  assert.equal((await x.request('/preview/generate',x.generate)).status,422);
  assert.equal(x.trace.length,1);assert.deepEqual(x.approvals(),[]);
});
check('mismatched signed prepare receipt is terminal and cannot authorize generation',async t=>{
  const x=await registeredFixture(t,{tamper:{response:(phase,value)=>phase==='prepare'?{...value,previewContextRef:'other-context'}:null}});
  assert.equal((await x.request('/preview/prepare',x.input)).status,422);
  assert.equal((await x.request('/preview/generate',x.generate)).status,422);assert.deepEqual(x.approvals(),[]);
});
for(const [name,change] of [
  ['proposal hash',v=>({...v,input:{...v.input,proposalHash:'f'.repeat(64)}})],
  ['actual provenance in a mock profile',v=>({...v,version:'clear-preview-peer-draft.1',actualModelCall:true,modelProvenance:'ACTUAL_GEMINI_HTTP'})]
])check('B rejects '+name+' after single-use grant consumption',async t=>{
  const x=await registeredFixture(t,{tamper:{response:(phase,value)=>phase==='generate'?change(value):null}});
  assert.equal((await x.request('/preview/prepare',x.input)).status,200);x.approve();
  assert.equal((await x.request('/preview/generate',x.generate)).status,422);assert.equal(x.approvals()[0].consumed,1);
  assert.equal((await x.request('/preview/generate',x.generate)).status,422);assert.deepEqual(x.calls,['countTokens','generateContent']);
});
check('failed model request leaves grant spent and context terminal',async t=>{
  const x=await registeredFixture(t,{failModel:true});assert.equal((await x.request('/preview/prepare',x.input)).status,200);x.approve();
  assert.equal((await x.request('/preview/generate',x.generate)).status,422);assert.equal(x.approvals()[0].consumed,1);
  assert.equal((await x.request('/preview/generate',x.generate)).status,422);assert.deepEqual(x.calls,['countTokens']);
});
check('wrong review receipt cannot set local reviewed state or dispatch observations',async t=>{
  const x=await registeredFixture(t,{tamper:{response:(phase,value)=>phase==='execute'?{...value,proposalHash:'f'.repeat(64)}:null}}),input=await draft(x);
  assert.equal((await x.request('/preview/review',input)).status,422);
  assert.throws(()=>x.contexts.reviewedScope(x.f.context,input),/CONTEXT_REVIEW_OR_BUSY/);
  const count=x.trace.length;assert.equal((await x.request('/preview/observe',input)).status,422);assert.equal(x.trace.length,count);
  assert.equal(x.approvals()[0].consumed,1);
});
for(const field of ['subjectRef','courseRef'])check('current C '+field+' mismatch prevents D result delivery',async t=>{
  const x=await registeredFixture(t),input=await draft(x);
  assert.equal((await x.request('/preview/review',input)).status,200);
  const original=x.f.state.query;x.f.state.query=async(...args)=>({...await original(...args),[field]:'different-source'});
  assert.equal((await x.request('/preview/observe',input)).status,422);
  assert.equal(x.trace.some(v=>v.path.endsWith('/observation-result')),false);assert.equal(x.approvals()[0].consumed,1);
});
check('signed observation receipt mismatch is rejected with no retry or refreshed observation',async t=>{
  const x=await registeredFixture(t,{tamper:{response:(phase,value)=>phase==='observation-result'?{...value,observation:{...value.observation,targetRef:'other'}}:null}}),input=await draft(x);
  assert.equal((await x.request('/preview/review',input)).status,200);
  assert.equal((await x.request('/preview/observe',input)).status,422);
  const count=x.trace.length;assert.equal((await x.request('/preview/observe',input)).status,422);assert.equal(x.trace.length,count);
});
test('installed C full .3 to explicitly OFFLINE registered D runtime preserves native COMPLETE',
  {skip:!enabled||!process.env.CLEAR_C_PEER_WORKTREE},async t=>{
  const x=await registeredFixture(t,{installed:true}),input=await draft(x);
  assert.equal((await x.request('/preview/review',input)).status,200);
  const result=await x.request('/preview/observe',input);assert.equal(result.status,200);
  assert.equal(result.body.observation.status,'COMPLETE');assert.equal(result.body.observation.targetRef,'core-page-manual-mark');
  assert.equal(result.body.modelProvenance,'OFFLINE_TEST_TRANSPORT');assert.equal(result.body.paymentAllowed,false);
});
check('browser source and approval substitutions cannot spend the owner grant',async t=>{
  const x=await registeredFixture(t);assert.equal((await x.request('/preview/prepare',x.input)).status,200);x.approve();
  for(const change of [{sourceText:'다른 강좌 완료'},{approvalRef:'another-approval'}])
    assert.equal((await x.request('/preview/generate',{...x.generate,...change})).status,422);
  assert.equal(x.approvals()[0].consumed,0);assert.deepEqual(x.calls,[]);
  assert.equal((await x.request('/preview/generate',x.generate)).status,200);assert.equal(x.approvals()[0].consumed,1);
});
