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
  await new Promise(r=>setImmediate(r));
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
test('async owner refresh survives human waits beyond the five-second snapshot without extending business windows',async t=>{
 const x=await fixture(t);let until=START+5,refreshes=0;
 x.f.setHook(()=>{if(x.f.time>=until)throw Error('BC_E3_REGISTERED_SNAPSHOT_EXPIRED');});
 const read=async()=>{x.f.store.getOperationsProjection(x.f.aliceContext,x.app);await new Promise(r=>setImmediate(r));until=x.f.time+5;refreshes++;return x.read();};
 const controller=new AbortController();t.after(()=>controller.abort());const pending=waitForExplicitConsents({target:x.target,read,heartbeat(){},signal:controller.signal,pollMs:1});
 await new Promise(r=>setImmediate(r));x.f.setTime(START+6);assert.throws(x.read,/BC_E3_REGISTERED_SNAPSHOT_EXPIRED/);
 await read();x.f.consent(x.app);x.f.setTime(START+12);assert.throws(x.read,/BC_E3_REGISTERED_SNAPSHOT_EXPIRED/);
 await read();x.f.consent(x.app,x.f.operatorContext);await pending;
 assert.ok(refreshes>=3);assert.equal(assertExplicitConsents(x.read(),x.target),true);
 assert.equal(x.read().procedure.reviewCapAt,x.target.reviewCapAt);assert.equal(x.read().evidence.validUntilExclusive,x.target.sourceValidUntilExclusive);
});
test('async refreshed views still reject original source expiry or a changed target',async t=>{
 for(const kind of ['expiry','target']){
  const x=await fixture(t);let calls=0;
  const read=async()=>{await new Promise(r=>setImmediate(r));if(++calls===2&&kind==='expiry')x.f.setTime(START+301);const v=structuredClone(x.read());if(calls===2&&kind==='target')v.consent.scopeHash='different-scope';return v;};
  await assert.rejects(waitForExplicitConsents({target:x.target,read,heartbeat(){},pollMs:1}),/BC_NORMAL_REVIEW_REQUIRED|BC_NORMAL_REVIEW_BLOCKED|BC_NORMAL_REVIEW_TARGET_CHANGED/);
  assert.equal(x.read().consent.records.length,0);
 }
});
test('cancelling an in-flight owner read stops immediately and ignores its later result',async t=>{
 const x=await fixture(t),controller=new AbortController();let finish,entered;
 const started=new Promise(r=>entered=r),read=()=>new Promise(r=>{finish=r;entered();});
 const pending=waitForExplicitConsents({target:x.target,read,heartbeat(){assert.fail('no heartbeat after abort');},signal:controller.signal,pollMs:1});
 await started;controller.abort();await assert.rejects(pending,/BC_NORMAL_CONSENT_WAIT_STOPPED/);
 finish(x.read());await new Promise(r=>setImmediate(r));assert.equal(x.read().consent.records.length,0);
});
test('revocation discovered after an awaited refresh cannot become consent authority',async t=>{
 const x=await fixture(t),read=async()=>{await new Promise(r=>setImmediate(r));x.f.service.logout(x.f.aliceContext);return x.read();};
 await assert.rejects(waitForExplicitConsents({target:x.target,read,heartbeat(){assert.fail('revoked');},pollMs:1}),/AUTH_REQUIRED/);
 assert.equal(x.f.store.getProcedure(x.f.operatorContext,x.app).consent.records.length,0);
});
