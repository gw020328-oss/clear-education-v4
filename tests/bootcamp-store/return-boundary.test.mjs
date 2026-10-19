import test from 'node:test';
import assert from 'node:assert/strict';
import {storeFixture,START} from './fixture.mjs';

for(const path of ['summary','evidence','decision','operation','v2','metrics','pagination'])test(`final ${path} read rejects logout inside source refresh and preserves invalidation`,async t=>{
 const f=await storeFixture(t);f.configuration.operatorBindings=[{wallet:f.operator.address,courseOperatorRef:'course-operator-demo'}];
 let armed=false;f.configuration.resolveSource=r=>{const g=f.resolveSource(r);if(armed){armed=false;
   f.service.logout(path==='pagination'?f.operatorContext:f.aliceContext);g.rawAvailable=false;}return g;};f.restart();
 const a=f.create(),op=await f.accept(a),d=f.view(a).decision.record;
 const read={summary:()=>f.view(a),evidence:()=>f.store.getEvidence(f.aliceContext,a,op.record.target.evidenceId),
  decision:()=>f.store.getDecision(f.aliceContext,a,d.decisionId),operation:()=>f.store.getOperation(f.aliceContext,a,op.record.operationId),
  v2:()=>f.store.getOperationsProjection(f.aliceContext,a),metrics:()=>f.store.getMetricEvents(f.aliceContext,a),pagination:()=>f.store.listOperations(f.operatorContext)}[path];
 armed=true;assert.throws(read,/AUTH_REQUIRED|BC_COMMIT_AUTHORITY/);
 const context=await f.login(f.alice);assert.equal(f.store.getEvidence(context,a,op.record.target.evidenceId).current,false);
});
for(const path of ['v2','pagination'])test(`final ${path} rejects same-wallet role and course scope removal`,async t=>{
 const f=await storeFixture(t);let role='operator',bindings=[{wallet:f.operator.address,courseOperatorRef:'course-operator-demo'}],mutation=null;
 f.configuration.operatorBindings=bindings;f.configuration.resolveOperatorBindings=()=>bindings;
 f.configuration.authentication={origin:f.service.origin,authorizeWorkflow(c,w){const s=f.service.authorizeWorkflow(c,w);return c===f.operatorContext?{...s,role}:s;}};
 f.configuration.resolveSource=r=>{const g=f.resolveSource(r);if(mutation){const m=mutation;mutation=null;m();}return g;};f.restart();
 const a=f.create();await f.accept(a);const read=()=>path==='v2'?f.store.getOperationsProjection(f.operatorContext,a):f.store.listOperations(f.operatorContext);
 mutation=()=>{role='participant';};assert.throws(read,/FORBIDDEN|BC_COMMIT_AUTHORITY/);
 role='operator';mutation=()=>{bindings=[];};assert.throws(read,/FORBIDDEN|BC_COMMIT_AUTHORITY/);
});
for(const path of ['summary','v2','pagination'])test(`final ${path} rejects clock expiry occurring during refresh`,async t=>{
 const f=await storeFixture(t);f.configuration.operatorBindings=[{wallet:f.operator.address,courseOperatorRef:'course-operator-demo'}];let armed=false;
 f.configuration.resolveSource=r=>{const g=f.resolveSource(r);if(armed){armed=false;f.setTime(START+301);}return g;};f.restart();
 const a=f.create(),op=await f.accept(a);armed=true;
 assert.throws(()=>path==='summary'?f.view(a):path==='v2'?f.store.getOperationsProjection(f.aliceContext,a):f.store.listOperations(f.operatorContext),/BC_VIEW_STALE|BC_COMMIT_CONTEXT/);
 assert.equal(f.store.getEvidence(f.aliceContext,a,op.record.target.evidenceId).current,false);
});
test('logout between collect preparation and producer microtask prevents producer entry',async t=>{
 let called=0;const f=await storeFixture(t,{authority:{beforeVerify:async()=>{called++;}}}),a=f.create(),r=f.request(a);
 const pending=f.store.collect(f.aliceContext,a,{requestId:r.record.target.requestId,expectedRevision:r.record.applicationRevision},f.key());
 f.service.logout(f.aliceContext);await assert.rejects(pending,/AUTH_REQUIRED|BC_PRODUCER_FAILED/);assert.equal(called,0);
});
test('final action recheck rolls back intent but commits the newly invalidated head',async t=>{
 const f=await storeFixture(t);let armed=false,calls=0;
 f.configuration.resolveSource=r=>{const g=f.resolveSource(r);if(armed&&++calls===2){g.rawAvailable=false;f.service.logout(f.aliceContext);}return g;};f.restart();
 const a=f.create(),accepted=await f.accept(a),v=f.store.getOperationsProjection(f.aliceContext,a),revision=f.view(a).revision,before=f.counts().commands;
 armed=true;assert.throws(()=>f.store.requestConsent(f.aliceContext,a,{expectedRevision:revision,expectedLedgerSequence:v.ledgerSequence,
  targetDecisionId:v.decisionId,targetDecisionRevision:v.decisionRevision,targetDecisionHash:v.decisionHash,reason:'AGREE_SAME_RESULT'},f.key()),/BC_VIEW_STALE|AUTH_REQUIRED/);
 const context=await f.login(f.alice);assert.equal(f.store.getEvidence(context,a,accepted.record.target.evidenceId).current,false);
 assert.equal(f.counts().commands,before);assert.equal(f.store.getOperationsProjection(context,a).consent.intents.length,0);
});
test('create replay cannot return a private projection after refresh logs out the caller',async t=>{
 const f=await storeFixture(t);let armed=false;
 f.configuration.resolveSource=r=>{const g=f.resolveSource(r);if(armed){armed=false;g.rawAvailable=false;f.service.logout(f.aliceContext);}return g;};f.restart();
 const key=f.key(),created=f.store.createApplication(f.aliceContext,{},key),a=created.record.applicationId,op=await f.accept(a);armed=true;
 assert.throws(()=>f.store.createApplication(f.aliceContext,{},key),/AUTH_REQUIRED/);
 const context=await f.login(f.alice);assert.equal(f.store.getEvidence(context,a,op.record.target.evidenceId).current,false);
});
for(const path of ['v2','pagination'])test(`last ${path} source callback cannot revoke authority after final authentication`,async t=>{
 const f=await storeFixture(t);let armed=false,calls=0;
 f.configuration.operatorBindings=[{wallet:f.operator.address,courseOperatorRef:'course-operator-demo'}];
 f.configuration.resolveSource=r=>{const g=f.resolveSource(r);if(armed&&++calls===2)f.service.logout(f.operatorContext);return g;};f.restart();
 const a=f.create();await f.accept(a);armed=true;
 assert.throws(()=>path==='v2'?f.store.getOperationsProjection(f.operatorContext,a):f.store.listOperations(f.operatorContext),/AUTH_REQUIRED/);
 assert.ok(calls>=2); // the revocation happened in the final source refresh
});
