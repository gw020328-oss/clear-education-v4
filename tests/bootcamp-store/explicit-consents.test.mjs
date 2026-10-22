import test from 'node:test';
import assert from 'node:assert/strict';
import {procedureFixture,START} from './procedure-fixture.mjs';
import {explicitReviewTarget,assertExplicitConsents,waitForExplicitConsents} from '../../tools/bootcamp/explicit-consents.mjs';
import {executeNormalPayment} from '../../tools/bootcamp/normal-chain.mjs';
async function fixture(t){const f=await procedureFixture(t),app=f.create();await f.complete(app);f.publish(app);return {f,app,
 read:()=>f.view(app),target:explicitReviewTarget(f.view(app))};}
test('registered-source runner refuses implicit TEST role consent before any runtime or transaction access',async()=>{
 let runtime=0;const connection={configuration:{sourceMode:'REGISTERED_TEST_SOURCE'},get runtime(){runtime++;throw Error('UNEXPECTED_RUNTIME');}};
 await assert.rejects(executeNormalPayment({connection}),/BC_NORMAL_EXPLICIT_CONSENTS_REQUIRED/);assert.equal(runtime,0);
});
test('wait only observes separately recorded current participant and operator consents',async t=>{
 const x=await fixture(t),controller=new AbortController();let beats=0;t.after(()=>controller.abort());
 const pending=waitForExplicitConsents({...x,heartbeat:()=>beats++,signal:controller.signal,pollMs:1});
 assert.throws(()=>assertExplicitConsents(x.read(),x.target),/BC_NORMAL_BOTH_CONSENTS_REQUIRED/);
 x.f.consent(x.app);assert.equal(x.read().consent.bothCurrent,false);
 await new Promise(r=>setImmediate(r));x.f.consent(x.app,x.f.operatorContext);await pending;
 assert.equal(x.read().consent.records.length,2);assert.equal(assertExplicitConsents(x.read(),x.target),true);assert.equal(beats,1);
});
test('120 seconds never supplies the missing second consent to this normal route',async t=>{
 const x=await fixture(t);x.f.consent(x.app);x.f.setTime(START+121);
 assert.equal(x.read().procedure.status,'DEADLINE_PREFLIGHT_CANDIDATE');
 assert.throws(()=>assertExplicitConsents(x.read(),x.target),/BC_NORMAL_BOTH_CONSENTS_REQUIRED/);
});
test('expiry and unresolved objection stop the wait without manufacturing a consent',async t=>{
 for(const kind of ['expiry','objection']){
  const x=await fixture(t),controller=new AbortController();let beats=0;t.after(()=>controller.abort());
  const pending=waitForExplicitConsents({...x,heartbeat:()=>beats++,signal:controller.signal,pollMs:1});
  if(kind==='expiry')x.f.setTime(START+301);
  else x.f.store.submitReviewObjection(x.f.aliceContext,x.app,x.f.body(x.app,{reason:'SOURCE_MISMATCH',evidenceId:x.f.store.getApplication(x.f.aliceContext,x.app).evidence[0].record.evidenceId}),x.f.key());
  await assert.rejects(pending,/BC_NORMAL_REVIEW_REQUIRED|BC_NORMAL_REVIEW_BLOCKED/);assert.equal(x.read().consent.records.length,0);assert.equal(beats,1);
 }
});
test('changed publication or allocation target is rejected; an expired lease is never renewed by this helper',async t=>{
 const x=await fixture(t),old=x.target;
 assert.throws(()=>assertExplicitConsents(x.read(),{...old,consentScopeHash:'changed'}),/BC_NORMAL_REVIEW_TARGET_CHANGED/);
 assert.throws(()=>assertExplicitConsents(x.read(),{...old,allocationId:'changed'}),/BC_NORMAL_REVIEW_TARGET_CHANGED/);
 const controller=new AbortController();let beats=0;const pending=waitForExplicitConsents({...x,heartbeat:()=>{beats++;throw Error('BC_E5_GLOBAL_LEASE_BUSY');},signal:controller.signal,pollMs:1});
 await assert.rejects(pending,/BC_E5_GLOBAL_LEASE_BUSY/);assert.equal(beats,1);assert.equal(x.read().consent.records.length,0);
});
test('cancelled wait does not read or consent, and in-flight cancellation stops pending polling',async t=>{
 const early=new AbortController();early.abort();let reads=0;
 await assert.rejects(waitForExplicitConsents({target:{},read:()=>reads++,heartbeat(){},signal:early.signal}),/BC_NORMAL_CONSENT_WAIT_STOPPED/);assert.equal(reads,0);
 const x=await fixture(t),controller=new AbortController(),pending=waitForExplicitConsents({...x,heartbeat(){},signal:controller.signal,pollMs:1});
 controller.abort();await assert.rejects(pending,/BC_NORMAL_CONSENT_WAIT_STOPPED/);assert.equal(x.read().consent.records.length,0);
});
