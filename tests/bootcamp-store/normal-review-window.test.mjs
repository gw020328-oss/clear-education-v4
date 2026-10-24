// Actual SQLite/store/evaluator/procedure; invented source/model and forward-only clocks.
import test from 'node:test';
import assert from 'node:assert/strict';
import {procedureFixture,START} from './procedure-fixture.mjs';
import {createNormalSourceSequence} from '../../tools/bootcamp/normal-source-sequence.mjs';
import {createNormalReviewReaders,requireNormalSourceWindow,REVIEW_WINDOW} from '../../tools/bootcamp/normal-review-window.mjs';
import {normalSourceTarget} from '../../tools/bootcamp/normal-current-view.mjs';
import {waitForNormalReviewConsents,waitForExplicitConsents} from '../../tools/bootcamp/explicit-consents.mjs';
async function fixture(t,{modelDelay=0,sourceDelay=1}={}){
 const windows=new Map(),events=[];let acquired=null,approved=false,models=0,prepared=null,f;
 f=await procedureFixture(t,{authority:{
  async beforeVerify(r){
   if(r.criterionId==='reflection-topics'){assert.equal(approved,true);models++;advance(modelDelay);}
   else if(r.criterionId!=='python-basic-certificate')advance(sourceDelay);
  },
  transform(candidate,r){const cap=windows.get(r.criterionId);candidate.validUntilExclusive=Math.min(cap,candidate.validUntilExclusive);
   candidate.rawLocator.expiresAt=cap;if(r.criterionId==='reflection-topics')candidate.acquiredAt=acquired;},
 }});
 const resolve=f.configuration.resolveSource;
 f.configuration.resolveSource=r=>{const g=resolve(r),cap=windows.get(r.criterionId);
  if(cap!==undefined)g.authExpiresAt=g.rawExpiresAt=g.queryExpiresAt=cap;return g;};f.restart();
 const app=f.create(),controller=new AbortController();t.after(()=>controller.abort());
 function advance(seconds){assert.ok(Number.isSafeInteger(seconds)&&seconds>=0);
  for(let i=0;i<seconds;i++){f.setTime(f.time+1);f.setAuthenticationTime(f.time);}}
 const readers=createNormalReviewReaders({now:()=>f.time}),touch=()=>{readers.observe('PARTICIPANT');readers.observe('OPERATOR');};touch();
 const facade={getApplication:(...a)=>f.store.getApplication(...a),
  issueBridgeRequest(c,a,b,k){events.push('issue:'+b.criterionId);return f.store.issueRequest(c,a,b,k);},
  async prepareBridgeReflection(c,a,b){
   acquired=f.time;const request=f.store.getRequest(c,a,b.requestId).record;
   prepared={packet:{leaseExpiresAtMs:windows.get('reflection-topics')*1000},
    isCurrent:()=>f.time<windows.get('reflection-topics')&&f.store.getRequest(c,a,b.requestId).status==='PENDING'
     &&f.store.getApplication(c,a).revision===request.expectedRevision};
   events.push('prepare:reflection-topics');return prepared;
  },
  collectBridge(c,a,b,k){events.push('collect:'+f.store.getRequest(c,a,b.requestId).record.criterionId);return f.store.collect(c,a,b,k);},
 };
 const sequence=createNormalSourceSequence({store:facade,getContext:()=>f.aliceContext,applicationId:app,sourceWindows:windows,
  startedAt:START,now:()=>f.time,signal:controller.signal,key:f.key,stage:name=>events.push(name),
  waitForReaders:async()=>readers.require(),requireReaders:()=>readers.require()});
 return {f,app,windows,events,sequence,readers,touch,advance,get models(){return models;},get prepared(){return prepared;},
  approve(){approved=true;},sourceTarget:()=>normalSourceTarget(f.store.getApplication(f.aliceContext,app))};
}
async function complete(x,{approvalDelay=20}={}){
 const p=await x.sequence.collect({prepareReflection:true});x.advance(approvalDelay);x.touch();x.approve();
 const result=await x.sequence.collect();assert.equal(result.decision.record.conditionsStatus,'MET');return p;
}
async function wait(t,x,{minimum=REVIEW_WINDOW.openingSeconds}={}){
 const context=x.f.aliceContext;let entered;const heartbeat=new Promise(r=>entered=r),controller=new AbortController();t.after(()=>controller.abort());
 const pending=waitForNormalReviewConsents({store:x.f.store,context,applicationId:x.app,sourceTarget:x.sourceTarget(),minimumWindowSeconds:minimum,
  connection:{async refresh(){}},waitForConsents:args=>waitForExplicitConsents({...args,pollMs:1,stopMarginSeconds:REVIEW_WINDOW.settlementReserveSeconds}),
  heartbeat:()=>entered(),signal:controller.signal,onTarget(){}});
 await Promise.race([heartbeat,pending]);return pending;
}

test('new sequence holds short activity/assignment clocks until the approved exact reflection response',async t=>{
 const x=await fixture(t,{modelDelay:10}),p=await x.sequence.collect({prepareReflection:true});
 assert.equal(x.models,0);assert.equal(x.f.counts().evidence,1);assert.deepEqual([...x.windows.keys()],['python-basic-certificate','reflection-topics']);
 const originalExpiry=p.packet.leaseExpiresAtMs;x.advance(20);x.touch();x.approve();await x.sequence.collect();
 assert.equal(x.models,1);assert.equal(originalExpiry,(START+240)*1000);
 assert.ok(x.events.indexOf('collect:reflection-topics')<x.events.indexOf('issue:activity-complete'));
 assert.ok(x.events.indexOf('collect:activity-complete')<x.events.indexOf('issue:assignment-submitted'));
 const reflection=x.f.store.getApplication(x.f.aliceContext,x.app).evidence.find(e=>e.record.criterionId==='reflection-topics').record;
 assert.equal(reflection.acquiredAt,START);assert.equal(reflection.verifiedAt,START+30);
 assert.equal(reflection.rawLocator.expiresAt,START+240);
 assert.equal(x.windows.get('reflection-topics'),START+240);assert.equal(x.windows.get('activity-complete'),START+270);
 await assert.rejects(x.sequence.collect(),/SINGLE_COLLECTION/);assert.equal(x.models,1);
});

for(const delay of [96,203,240])test('approval delayed '+delay+' seconds cannot spend a model call or restart source acquisition',async t=>{
 const x=await fixture(t);await x.sequence.collect({prepareReflection:true});x.advance(delay);x.touch();x.approve();
 await assert.rejects(x.sequence.collect(),/REVIEW_WINDOW_REQUIRED|PREPARATION_STALE/);assert.equal(x.models,0);
 assert.equal(x.f.counts().evidence,1);assert.equal(x.windows.has('activity-complete'),false);
 await assert.rejects(x.sequence.collect(),/SINGLE_COLLECTION/);assert.equal(x.windows.get('reflection-topics'),START+240);
});

test('two separate store consent commands can spend 120 seconds reviewing the same target within unchanged deadlines',async t=>{
 const x=await fixture(t,{modelDelay:20});await complete(x,{approvalDelay:20});x.advance(8);x.touch();
 assert.ok(requireNormalSourceWindow({store:x.f.store,context:x.f.aliceContext,applicationId:x.app,sourceTarget:x.sourceTarget()})>=REVIEW_WINDOW.openingSeconds);
 x.f.publish(x.app);const before=x.f.view(x.app),pending=wait(t,x);await new Promise(r=>setImmediate(r));
 x.advance(60);x.touch();x.f.consent(x.app);assert.equal(x.f.view(x.app).consent.bothCurrent,false);
 x.advance(60);x.touch();x.f.consent(x.app,x.f.operatorContext);await pending;
 const after=x.f.view(x.app);assert.equal(after.consent.bothCurrent,true);assert.equal(after.consent.records.length,2);
 assert.equal(after.evidence.validUntilExclusive,before.evidence.validUntilExclusive);assert.equal(after.procedure.reviewCapAt,before.procedure.reviewCapAt);
 assert.equal(after.funding.amountAtoms,'100000000');assert.equal(after.applicationId,x.app);
});

test('slow model/E3 preparation can stop review opening instead of advertising a 16-second window',async t=>{
 const x=await fixture(t,{modelDelay:30});await complete(x,{approvalDelay:90});x.advance(4);x.touch();
 assert.throws(()=>requireNormalSourceWindow({store:x.f.store,context:x.f.aliceContext,applicationId:x.app,sourceTarget:x.sourceTarget()}),/REVIEW_WINDOW_REQUIRED/);
 assert.equal(x.models,1);assert.equal(x.f.view(x.app).consent.records.length,0);
 assert.equal(x.windows.get('reflection-topics'),START+240);
});

test('one consent cannot cross the settlement reserve or prepare a right; no extra source/model call occurs',async t=>{
 const x=await fixture(t);await complete(x);x.f.publish(x.app);const pending=wait(t,x);let reachedAuthorization=false;
 const pipeline=pending.then(()=>{reachedAuthorization=true;return x.f.prepare(x.app);});await new Promise(r=>setImmediate(r));
 x.advance(30);x.f.consent(x.app);x.advance(START+240-REVIEW_WINDOW.settlementReserveSeconds-x.f.time);
 await assert.rejects(pipeline,/REVIEW_WINDOW_REQUIRED/);assert.equal(reachedAuthorization,false);assert.equal(x.f.view(x.app).consent.records.length,1);
 assert.equal(x.f.view(x.app).consent.bothCurrent,false);assert.equal(x.models,1);
});

test('changed source/decision invalidates a displayed target and never transfers its first consent',async t=>{
 const x=await fixture(t);await complete(x);x.f.publish(x.app);const old=x.f.view(x.app),pending=wait(t,x);await new Promise(r=>setImmediate(r));
 x.f.consent(x.app);x.advance(1);x.f.change(x.app,'activity-complete',{sourceHash:'0x'+'66'.repeat(32)});
 // Explicit independent fixture-owner source change, never a runner retry/recollection.
 await x.f.accept(x.app,'activity-complete');x.f.publish(x.app);
 assert.notEqual(x.f.view(x.app).decisionHash,old.decisionHash);assert.equal(x.f.view(x.app).consent.bothCurrent,false);
 await assert.rejects(pending,/REVIEW_TARGET_CHANGED|REVIEW_REQUIRED/);assert.equal(x.models,1);
});

test('exact opening boundary accepts 115 seconds and rejects 114 without changing the original source cap',async t=>{
 for(const remaining of [115,114]){
  const x=await fixture(t);await complete(x);x.advance(START+240-remaining-x.f.time);x.touch();
  const call=()=>requireNormalSourceWindow({store:x.f.store,context:x.f.aliceContext,applicationId:x.app,sourceTarget:x.sourceTarget()});
  if(remaining===115)assert.equal(call(),115);else assert.throws(call,/REVIEW_WINDOW_REQUIRED/);
  assert.equal(x.windows.get('reflection-topics'),START+240);
 }
});

test('new-command operating gate cannot invalidate an authenticated exact consent replay',async t=>{
 const f=await procedureFixture(t),app=f.create();await f.complete(app);f.publish(app);
 const body=f.body(app,{value:'AGREE'}),key=f.key();let calls=0;
 const options={beforeNewConsent(view){calls++;assert.equal(view.applicationId,app);assert.equal(view.fullyAllocated,true);}};
 const first=f.store.recordReviewConsent(f.aliceContext,app,body,key,options);assert.equal(calls,1);
 const replay=f.store.recordReviewConsent(f.aliceContext,app,body,key,{beforeNewConsent(){throw Error('OPERATING_WINDOW_CLOSED');}});
 assert.equal(replay.record.operationId,first.record.operationId);assert.equal(calls,1);
 assert.throws(()=>f.store.recordReviewConsent(f.aliceContext,app,f.body(app,{value:'AGREE'}),f.key(),
  {beforeNewConsent(){throw Error('OPERATING_WINDOW_CLOSED');}}),/OPERATING_WINDOW_CLOSED/);
 assert.equal(f.view(app).consent.records.length,1);
});


test('90-second AI approval and 30-second processing leave an 80-second dual review plus reserve in the same 240-second lease',async t=>{
 const x=await fixture(t,{modelDelay:20});await complete(x,{approvalDelay:90});x.advance(8);x.touch();
 assert.equal(x.f.time,START+120);assert.equal(x.models,1);
 assert.equal(requireNormalSourceWindow({store:x.f.store,context:x.f.aliceContext,applicationId:x.app,sourceTarget:x.sourceTarget()}),120);
 x.f.publish(x.app);const pending=wait(t,x);await new Promise(r=>setImmediate(r));
 x.advance(5);x.touch(); // Charge the first displayed read; no new source observation.
 x.advance(40);x.f.consent(x.app);x.advance(40);x.f.consent(x.app,x.f.operatorContext);await pending;
 assert.equal(x.f.view(x.app).consent.bothCurrent,true);assert.equal(x.models,1);assert.equal(x.f.time,START+205);
 assert.equal(x.f.view(x.app).evidence.validUntilExclusive,START+240);assert.equal(240-(x.f.time-START),35);
 x.advance(35);assert.throws(()=>x.f.consent(x.app),/SOURCE|CURRENT|EXPIRED/);assert.equal(x.models,1);
});
