import test from 'node:test';
import assert from 'node:assert/strict';
import {procedureFixture,START} from './procedure-fixture.mjs';
import {requireNormalReviewWindow} from '../../tools/bootcamp/normal-review-window.mjs';

test('a consent clock advance validates and commits the original write once',async t=>{
 let f,armed=false,writes=0,gateCalls=0,gateTime;
 f=await procedureFixture(t,{fault(point){if(armed&&point==='e3-after-consent'){writes++;f.setTime(f.time+1);}}});
 const app=f.create();await f.complete(app);f.publish(app);f.setTime(START+200);
 const body=f.body(app,{value:'AGREE'}),key=f.key(),before=f.counts();armed=true;
 const result=f.store.recordReviewConsent(f.aliceContext,app,body,key,{beforeNewConsent(view){gateCalls++;gateTime=view.asOf;}});
 const view=f.view(app);assert.equal(view.consent.records.length,1);assert.equal(writes,1);assert.equal(gateCalls,1);
 assert.equal(gateTime,START+201);assert.equal(f.counts().commands,before.commands+1);assert.equal(view.evidence.validUntilExclusive,START+300);
 assert.equal(view.consent.bothCurrent,false);
 const replay=f.store.recordReviewConsent(f.aliceContext,app,body,key,{beforeNewConsent(){assert.fail('replay never reopens consent');}});
 assert.equal(replay.record.operationId,result.record.operationId);assert.equal(writes,1);assert.equal(f.view(app).consent.records.length,1);
});

for(const change of ['expiry','review-cap','source-change','funding-change','logout','clock-reversal','owner-window'])test('consent commit rejects '+change+' and rolls back its only write',async t=>{
 let f,armed=false,writes=0;
 f=await procedureFixture(t,{fault(point){if(armed&&point==='e3-after-consent'){
  writes++;f.setTime(change==='expiry'?START+300:change==='review-cap'?START+600:change==='clock-reversal'?f.time-1:f.time+1);
  if(change==='source-change')f.change(app,'activity-complete',{rawAvailable:false});
  if(change==='funding-change')f.setFull(false);
  if(change==='logout')f.service.logout(f.aliceContext);
 }}});
 const app=f.create();await f.complete(app);f.publish(app);
 if(change==='review-cap'){await f.refreshEvidence(app,START+500);f.publish(app);f.setTime(START+550);}
 else f.setTime(change==='owner-window'?START+269:START+200);
 const body=f.body(app,{value:'AGREE'}),before=f.counts();armed=true;
 assert.throws(()=>f.store.recordReviewConsent(f.aliceContext,app,body,f.key(),{beforeNewConsent(view){
  requireNormalReviewWindow(Math.min(view.validUntilExclusive,view.reviewCapAt),view.asOf,31);
 }}),/BC_|AUTH_REQUIRED/);
 assert.equal(writes,1);assert.equal(f.counts().commands,before.commands);
 // Operator can inspect rollback even after participant logout/clock reversal.
 f.setTime(Math.max(f.time,START+201));assert.equal(f.view(app,f.operatorContext).consent.records.length,0);
});

for(const repeats of [1,2])test('final consent validation clock crossings '+repeats+' never repeat the write',async t=>{
 let f,armed=false,writes=0,checks=0;
 f=await procedureFixture(t,{fault(point){if(armed&&point==='e3-after-consent')writes++;}});
 const app=f.create();await f.complete(app);f.publish(app);f.setTime(START+200);
 const body=f.body(app,{value:'AGREE'}),before=f.counts();armed=true;
 const submit=()=>f.store.recordReviewConsent(f.aliceContext,app,body,f.key(),{beforeNewConsent(){if(++checks<=repeats)f.setTime(f.time+1);}});
 if(repeats===1)submit();else assert.throws(submit,/BC_VIEW_STALE/);
 assert.equal(checks,2);assert.equal(writes,1);assert.equal(f.counts().commands,before.commands+(repeats===1?1:0));
 assert.equal(f.view(app).consent.records.length,repeats===1?1:0);
});

test('owner validation cannot change funding/source after the original observations',async t=>{
 const f=await procedureFixture(t),app=f.create();await f.complete(app);f.publish(app);f.setTime(START+200);
 const body=f.body(app,{value:'AGREE'});
 assert.throws(()=>f.store.recordReviewConsent(f.aliceContext,app,body,f.key(),{beforeNewConsent(){f.setFull(false);}}),/BC_E3_PORT_CHANGED/);
 assert.equal(f.view(app).consent.records.length,0);
});
