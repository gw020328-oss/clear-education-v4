import {createSourceDiagnostics,observeSource} from '../../src/hackerrank-evidence/diagnostics.mjs';
// Offline only: invented identities, isolated SQLite and the real UI signature broker.
// No browser, source cookies, proof collector, chain or model is opened.
import test from 'node:test';
import assert from 'node:assert/strict';
import {storeFixture,START} from './fixture.mjs';
import {DEFAULT_MAPPING_HASH} from '../../src/bootcamp/store.mjs';
import {createNormalUiSession} from '../../src/bootcamp/ui-session.mjs';
import {createLiveReclaimConsumer,LIVE_WORKER_RECIPE_HASH} from '../../src/bootcamp/reclaim-live-consumer.mjs';
import {resolveNormalSourceLease} from '../../tools/bootcamp/live-context.mjs';
import {requestMessage} from '../../src/hackerrank-evidence/request.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';

async function fixture(t,{legacy=false,diagnostics,storeNow}={}){
 let f,ui,applicationId,participantId,closed=false,entered,signatures=0,nestedTransaction=false;
 const sourceWindows=new Map(),pins={audience:'offline-normal-source',trustConfigHash:p0Hash('OFFLINE','trust'),recipeHash:LIVE_WORKER_RECIPE_HASH,
  expectedClaimOwner:'0x'+'11'.repeat(20),selectedCertificateId:null,dataMode:'RECLAIM_SIGNED_RECORD'};
 const reached=new Promise(resolve=>{entered=resolve;});
 const binding=()=>({authentication:f.service,context:f.aliceContext,closed,participantWallet:f.alice.address.toLowerCase(),applicationId,participantId,
  runtimeMappingHash:DEFAULT_MAPPING_HASH,sourceWindows,startedAt:START,time:f.time});
 const resolveLease=r=>{
  if(legacy)try{ui.participant();}catch(e){
   // Recognize a fixed SQLite diagnostic in synthetic data; never report raw error text.
   nestedTransaction=e.code==='ERR_SQLITE_ERROR'&&e.message==='cannot start a transaction within a transaction';return null;
  }
  return resolveNormalSourceLease(r,binding());
 };
 const producer=createLiveReclaimConsumer({pins:()=>pins,resolveLease,now:()=>f.time,async collectLease(expected,{signal}){
  const pending=ui.requestSignature(expected,requestMessage(expected),{signal});entered();
  await pending;signatures++;observeSource(diagnostics,'ACCOUNT_COOKIE_READ','FAILED',Error('COLLECTOR_COOKIES'));throw Error('OFFLINE_STOP_BEFORE_PROOF');
 }});
 f=await storeFixture(t,{store:{mode:'ISOLATED_LIVE_TEST',producers:{'python-basic-certificate':producer},resolveSource:r=>producer.resolveSource(r),...(storeNow?{now:storeNow}:{})}});
 ui=createNormalUiSession({authentication:f.service,participantWallet:f.alice.address.toLowerCase(),operatorWallet:f.operator.address.toLowerCase(),
  getApplication:(c,a)=>f.store.getApplication(c,a),now:()=>f.time,diagnostics});t.after(()=>ui.close());
 applicationId=f.create();participantId=f.view(applicationId).participantId;ui.bindParticipant(f.aliceContext,applicationId,pins);
 const issue=()=>{sourceWindows.set('python-basic-certificate',START+900);return f.store.issueBridgeRequest(f.aliceContext,applicationId,
  {criterionId:'python-basic-certificate',expectedRevision:f.view(applicationId).revision},f.key());};
 return {f,ui,applicationId,sourceWindows,binding,resolveLease,issue,reached,close:()=>{closed=true;},get nestedTransaction(){return nestedTransaction;},get signatures(){return signatures;}};
}

test('former source resolver re-enters the app transaction and leaves no issued request',async t=>{
 const x=await fixture(t,{legacy:true});assert.throws(x.issue,/BC_SOURCE_UNKNOWN/);
 assert.equal(x.nestedTransaction,true);assert.equal(x.f.counts().requests,0);assert.equal(x.f.view(x.applicationId).revision,1);
 assert.throws(()=>x.ui.pendingSignature(x.f.aliceContext),/BC_UI_SIGNATURE_NOT_PENDING/);
});

test('bound app issues the HR request and exposes pending approval before any proof or signature',async t=>{
 const x=await fixture(t);const r=x.issue(),controller=new AbortController();
 const collection=x.f.store.collectBridge(x.f.aliceContext,x.applicationId,{requestId:r.record.target.requestId,expectedRevision:r.record.applicationRevision},x.f.key(),{signal:controller.signal,timeoutMs:30000});
 const stopped=assert.rejects(collection,/BC_PRODUCER_FAILED/);
 try{
  await x.reached;const approval=x.ui.pendingSignature(x.f.aliceContext);
  assert.equal(approval.purpose,'HACKERRANK_EVIDENCE_OBSERVATION_NOT_PAYMENT_AUTHORIZATION');
  assert.equal(x.f.counts().requests,1);assert.equal(x.f.counts().evidence,0);assert.equal(x.signatures,0);
  assert.throws(()=>x.ui.pendingSignature(x.f.operatorContext),/FORBIDDEN/);
 }finally{controller.abort();await stopped;}
});

test('source lease resolver retains bound identity, logout, close and exclusive expiry checks',async t=>{
 const x=await fixture(t),b=x.binding(),r={applicationId:b.applicationId,participantId:b.participantId,participantWallet:b.participantWallet,
  runtimeMappingHash:b.runtimeMappingHash,criterionId:'python-basic-certificate'};
 x.sourceWindows.set(r.criterionId,START+900);assert.equal(x.resolveLease(r).available,true);
 for(const patch of [{applicationId:'application-other'},{participantId:'participant-other'},{participantWallet:x.f.bob.address.toLowerCase()},{runtimeMappingHash:p0Hash('OFFLINE','other')}])
  assert.equal(x.resolveLease({...r,...patch}),null);
 assert.equal(resolveNormalSourceLease(r,{...x.binding(),context:x.f.operatorContext}),null);
 assert.equal(resolveNormalSourceLease(r,{...x.binding(),context:x.f.bobContext}),null);
 assert.equal(x.resolveLease({...r,criterionId:'reflection-topics'}).available,false);
 x.sourceWindows.set('reflection-topics',START+240);
 assert.equal(resolveNormalSourceLease({...r,criterionId:'reflection-topics'},{...x.binding(),time:START+240}).available,false);
 assert.equal(resolveNormalSourceLease(r,{...x.binding(),time:START+900}).available,false);
 assert.equal(resolveNormalSourceLease(r,{...x.binding(),closed:true}),null);
 x.f.service.logout(x.f.aliceContext);assert.equal(x.resolveLease(r),null);
});

test('logout while awaiting source approval rejects the request without accepting evidence',async t=>{
 const x=await fixture(t),r=x.issue();
 const collection=x.f.store.collectBridge(x.f.aliceContext,x.applicationId,{requestId:r.record.target.requestId,expectedRevision:r.record.applicationRevision},x.f.key(),{timeoutMs:30000});
 const stopped=assert.rejects(collection,/AUTH_REQUIRED|BC_PRODUCER_FAILED/);
 await x.reached;x.f.service.logout(x.f.aliceContext);await stopped;
 assert.equal(x.f.counts().evidence,0);assert.equal(x.signatures,0);
});

test('application cancellation still invalidates pending source approval after the resolver fix',async t=>{
 const x=await fixture(t),r=x.issue();
 const collection=x.f.store.collectBridge(x.f.aliceContext,x.applicationId,{requestId:r.record.target.requestId,expectedRevision:r.record.applicationRevision},x.f.key(),{timeoutMs:30000});
 const stopped=assert.rejects(collection,/BC_ACCEPTANCE_DISABLED/);
 await x.reached;x.f.store.cancel(x.f.aliceContext,x.applicationId,{expectedRevision:x.f.view(x.applicationId).revision},x.f.key());
 assert.throws(()=>x.ui.pendingSignature(x.f.aliceContext),/BC_UI_APPLICATION_CHANGED/);await stopped;
 assert.equal(x.f.counts().evidence,0);assert.equal(x.signatures,0);
});

test('only an explicit fixture signature advances past pending; no proof is fabricated',async t=>{
 const x=await fixture(t),r=x.issue();
 const collection=x.f.store.collectBridge(x.f.aliceContext,x.applicationId,{requestId:r.record.target.requestId,expectedRevision:r.record.applicationRevision},x.f.key(),{timeoutMs:30000});
 const stopped=assert.rejects(collection,/BC_PRODUCER_FAILED/);
 await x.reached;const q=x.ui.pendingSignature(x.f.aliceContext),signature=await x.f.alice.signMessage(q.message);
 x.ui.submitSignature(x.f.aliceContext,{approvalId:q.approvalId,signature});await stopped;
 assert.equal(x.signatures,1);assert.equal(x.f.counts().evidence,0);
 assert.throws(()=>x.ui.submitSignature(x.f.aliceContext,{approvalId:q.approvalId,signature}),/BC_UI_SIGNATURE_NOT_PENDING/);
});

test('lower source failure survives store normalization with signature accepted and evidence/payment absent',async t=>{
 let saved;const diagnostics=createSourceDiagnostics({persist:v=>{saved=v;}}),x=await fixture(t,{diagnostics}),r=x.issue();
 const collection=x.f.store.collectBridge(x.f.aliceContext,x.applicationId,{requestId:r.record.target.requestId,expectedRevision:r.record.applicationRevision},x.f.key(),{timeoutMs:30000});
 const stopped=assert.rejects(collection,/BC_PRODUCER_FAILED/);await x.reached;
 const q=x.ui.pendingSignature(x.f.aliceContext);x.ui.submitSignature(x.f.aliceContext,{approvalId:q.approvalId,signature:await x.f.alice.signMessage(q.message)});await stopped;
 assert.equal(saved.signatureAcceptance,'ACCEPTED');assert.equal(saved.firstFailure.stage,'ACCOUNT_COOKIE_READ');assert.equal(saved.firstFailure.code,'COLLECTOR_COOKIES');
 assert.equal(saved.stages.PAIR_OFFICIAL_VERIFY.state,'NOT_OBSERVED');assert.equal(x.f.counts().evidence,0);assert.equal(x.signatures,1);
});


test('real source collection remains pending across a store read conflict and human delay, then consumes only an explicit fresh signature',async t=>{
 t.mock.timers.enable({apis:['setInterval','setTimeout']});
 const diagnostics=createSourceDiagnostics({persist(){}});let x,armed=false,ticks=0;
 x=await fixture(t,{diagnostics,storeNow:()=>{if(armed&&++ticks===2){x.f.setTime(x.f.time+1);armed=false;}return x?x.f.time:START;}});
 const r=x.issue(),collection=x.f.store.collectBridge(x.f.aliceContext,x.applicationId,
  {requestId:r.record.target.requestId,expectedRevision:r.record.applicationRevision},x.f.key(),{timeoutMs:300000});
 let finished=false;const stopped=assert.rejects(collection,/BC_PRODUCER_FAILED/).then(()=>{finished=true;});await x.reached;
 const approval=x.ui.pendingSignature(x.f.aliceContext);x.f.setTime(START+46);armed=true;
 assert.throws(()=>x.ui.participant(),/BC_VIEW_STALE/);await Promise.resolve();await Promise.resolve();assert.equal(finished,false);
 x.f.setTime(START+166);t.mock.timers.tick(120000);assert.equal(x.signatures,0);assert.equal(x.f.counts().evidence,0);
 assert.equal(diagnostics.snapshot().signatureAcceptance,'UNKNOWN');assert.equal(x.ui.pendingSignature(x.f.aliceContext).approvalId,approval.approvalId);
 x.ui.submitSignature(x.f.aliceContext,{approvalId:approval.approvalId,signature:await x.f.alice.signMessage(approval.message)});await stopped;
 assert.equal(x.signatures,1);assert.equal(x.f.counts().evidence,0);assert.equal(diagnostics.snapshot().signatureAcceptance,'ACCEPTED');
 assert.equal(diagnostics.snapshot().stages.PAIR_OFFICIAL_VERIFY.state,'NOT_OBSERVED');
});
