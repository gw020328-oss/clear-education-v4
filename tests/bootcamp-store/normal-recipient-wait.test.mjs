// Real SQLite/authentication, invented source/signatures; no external source or paid AI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {RuleError} from '../../src/policy/values.mjs';
import {executionErrorSummary} from '../../src/bootcamp/execution-diagnostics.mjs';
import {createNormalUiSession} from '../../src/bootcamp/ui-session.mjs';
import {procedureFixture,START} from './procedure-fixture.mjs';
import {normalSourceTarget} from '../../tools/bootcamp/normal-current-view.mjs';
import {waitForNormalRecipientRegistration,createNormalRecipientWaitCheckpoint} from '../../tools/bootcamp/normal-recipient-wait.mjs';
import {createNormalReviewReaders,waitForNormalPaymentReview} from '../../tools/bootcamp/normal-review-window.mjs';
import {createNormalResumeControl} from '../../tools/bootcamp/normal-resume-control.mjs';
async function setup(t){
 const f=await procedureFixture(t),old=f.configuration.procedurePorts.registration;
 let clock=()=>f.time,armed=false,ticks=0,boundary=()=>f.setTime(f.time+1);
 f.configuration.procedurePorts.registration=(...a)=>({...old(...a),version:'clear-bootcamp-procedure-registration-port.2'});
 f.configuration.now=()=>{if(armed&&++ticks===2){armed=false;boundary();}return clock();};f.restart();
 const app=f.create();await f.complete(app);const target=normalSourceTarget(f.store.getApplication(f.aliceContext,app));
 const registration=f.store.registerCurrentMetForE4(f.aliceContext,app,f.body(app),f.key());
 const intake=f.store.inspectRegistrationForE4(f.aliceContext,app,registration.record.target.registrationTargetId);
 const ui=createNormalUiSession({authentication:f.service,participantWallet:f.alice.address.toLowerCase(),operatorWallet:f.operator.address.toLowerCase(),getApplication:(c,a)=>f.store.getApplication(c,a),now:()=>clock()});
 ui.bindParticipant(f.aliceContext,app,{dataMode:'RECLAIM_SIGNED_RECORD'});t.after(()=>ui.close());
 const packet=()=>f.store.getRecipientRegistration(f.aliceContext,app),deadlineMs=Number(packet().payload.message.deadline)*1000;
 let metrics={keyAccesses:0,paymentSignatures:0,transactionSignatures:0,broadcasts:0},envelopes=[],chain='NOT_REGISTERED',authCurrent=true,codeCurrent=true,refreshes=0;
 const report={stages:[],completed:false};const connection={metrics:()=>metrics,failureState:()=>({envelopes}),async refresh(){refreshes++;},recipientRegistrationState:()=>({canonical:true,chainStatus:chain})};
 const checkpoint=createNormalRecipientWaitCheckpoint({store:f.store,connection,user:f.aliceContext,app,target,intake,report,nowMs:()=>clock()*1000,
  assertCurrent(){assert.ok(codeCurrent&&authCurrent);ui.participant();}});
 const sign=async()=>{const p=packet(),sig=await f.alice.signTypedData(p.payload.domain,p.payload.types,p.payload.message);f.store.submitRecipientRegistration(f.aliceContext,app,f.body(app,{registrationTargetId:p.registrationTargetId,signature:sig}),f.key());};
 return {f,app,ui,packet,intake,target,deadlineMs,checkpoint,sign,report,get refreshes(){return refreshes;},
  arm(){armed=true;ticks=0;},wallClock(){const base=Math.floor(Date.now()/1000);clock=()=>START+Math.floor(Date.now()/1000)-base;boundary=()=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1001-Date.now()%1000);},
  mutate(kind){if(kind==='logout')f.service.logout(f.aliceContext);if(kind==='source')f.change(app,'activity-complete',{rawAvailable:false});if(kind==='expiry')f.setTime(deadlineMs/1000);if(kind==='code')codeCurrent=false;if(kind==='envelope')envelopes=[{state:'UNKNOWN',count:1}];if(kind==='broadcast')metrics.broadcasts=1;if(kind==='key')metrics.keyAccesses=1;if(kind==='chain')chain='INCLUDED';if(kind==='stages')report.stages.push({kind:'REGISTER'});if(kind==='claim')report.claim={txHash:'invented'};},
 };
}
for(const site of ['deadline','participant','registration'])test('real projection second-boundary at '+site+' reproduces raw failure, bounded read completes without writes',async t=>{
 const x=await setup(t);await x.sign();const original=JSON.stringify(x.packet());
 x.arm();assert.throws(()=>site==='participant'?x.ui.participant():x.packet(),e=>e instanceof RuleError&&e.message==='BC_VIEW_STALE');
 let injected=false,reads=0;
 await waitForNormalRecipientRegistration({deadlineMs:x.deadlineMs,nowMs:()=>x.f.time*1000,
  participant(){if(site==='participant'&&!injected){injected=true;x.arm();}return x.ui.participant();},
  registration(){reads++;if(!injected&&(site==='deadline'||site==='registration'&&reads===2)){injected=true;x.arm();}return x.packet();}});
 assert.equal(injected,true);assert.equal(x.packet().registrationTargetId,JSON.parse(original).registrationTargetId);assert.equal(x.packet().payload.message.deadline,String(x.deadlineMs/1000));assert.equal(x.packet().signatureAccepted,true);
});
test('real wall-clock rollover in recipient projection completes one bounded reread',async t=>{
 const x=await setup(t);await x.sign();x.wallClock();x.arm();const before=Date.now();
 await waitForNormalRecipientRegistration({deadlineMs:x.deadlineMs,nowMs:()=>START*1000+(Date.now()-before),participant:()=>x.ui.participant(),registration:x.packet});
 assert.ok(Math.floor(Date.now()/1000)>Math.floor(before/1000));assert.equal(x.packet().signatureAccepted,true);
});
for(const site of ['deadline','participant','registration'])test('persistent '+site+' conflict preserves fixed failure location and performs at most two reads',async t=>{
 const x=await setup(t);let calls=0,reads=0;
 await assert.rejects(waitForNormalRecipientRegistration({deadlineMs:x.deadlineMs,nowMs:()=>x.f.time*1000,
  participant(){if(site==='participant'){calls++;throw new RuleError('BC_VIEW_STALE');}return x.ui.participant();},
  registration(){reads++;if(site==='deadline'||site==='registration'&&reads>1){calls++;throw new RuleError('BC_VIEW_STALE');}return x.packet();}}),e=>{
   assert.equal(calls,2);assert.equal(executionErrorSummary(e).failurePhase,{deadline:'RECIPIENT_DEADLINE_READ',participant:'RECIPIENT_POLL_AUTH',registration:'RECIPIENT_POLL_REGISTRATION'}[site]);return true;
  });
});
const pause=x=>x.checkpoint.pause(Object.assign(new RuleError('BC_VIEW_STALE'),{failurePhase:'RECIPIENT_POLL_AUTH'}));
test('operator queues original recipient checkpoint once; existing signature and original target/deadline survive',async t=>{
 const x=await setup(t),old=x.packet();pause(x);const control=createNormalResumeControl({applicationId:()=>x.app,authorize:(c,w)=>x.f.service.authorizeWorkflow(c,w),inspect:()=>x.checkpoint.inspect(),prepareResume:()=>x.checkpoint.requestResume()});
 control.open({status:'FAILED_WAITING'});const v=control.view(),body={failureRevision:v.failureRevision,expectedRevision:v.applicationRevision};
 assert.throws(()=>control.request(x.f.aliceContext,x.app,body),/FORBIDDEN/);assert.throws(()=>control.request(x.f.operatorContext,x.app,{...body,expectedRevision:999}),/STALE/);
 control.request(x.f.operatorContext,x.app,body);assert.throws(()=>control.request(x.f.operatorContext,x.app,body),/BLOCKED/);assert.equal(control.take(),true);assert.equal(control.take(),false);
 await x.sign();await x.checkpoint.resume();assert.equal(x.refreshes,1);assert.equal(x.packet().registrationTargetId,old.registrationTargetId);assert.deepEqual(x.packet().payload,old.payload);assert.equal(x.packet().status,'SIGNED');
 await assert.rejects(x.checkpoint.resume(),/BLOCKED/);x.checkpoint.close();assert.equal(x.checkpoint.inspect().resumeAllowed,false);
});
for(const kind of ['logout','source','expiry','code','envelope','broadcast','key','stages','claim'])test('recipient checkpoint rejects '+kind+' without registration or dispatch',async t=>{
 const x=await setup(t);pause(x);assert.equal(x.checkpoint.inspect().resumeAllowed,true);x.mutate(kind);assert.equal(x.checkpoint.inspect().resumeAllowed,false);assert.throws(()=>x.checkpoint.requestResume(),/BLOCKED/);assert.equal(x.refreshes,0);
});
test('canonical registered chain after queue blocks the suspended wait before any payment continuation',async t=>{
 const x=await setup(t);pause(x);x.checkpoint.requestResume();x.mutate('chain');await assert.rejects(x.checkpoint.resume(),/BLOCKED/);
});
test('lookalike, unknown, other stages and lost checkpoint never authorize payment resume',async t=>{
 const x=await setup(t);for(const e of [Error('BC_VIEW_STALE'),new RuleError('BC_VIEW_STALE'),Object.assign(new RuleError('BC_VIEW_STALE'),{failurePhase:'CLAIM_SEND'}),Error('BC_NORMAL_RECEIPT_PENDING')]){x.checkpoint.pause(e);assert.equal(x.checkpoint.inspect().resumeAllowed,false);}
});
for(const kind of ['logout','source','expiry','code','envelope','broadcast'])test('recipient queue never freezes authority: '+kind+' after approval still rejects',async t=>{
 const x=await setup(t);pause(x);x.checkpoint.requestResume();x.mutate(kind);await assert.rejects(x.checkpoint.resume());assert.equal(x.report.stages.length,0);
});
test('a replaced decision or registration target cannot resume an old checkpoint',async t=>{
 const x=await setup(t);pause(x);await x.f.refreshEvidence(x.app,START+1);assert.equal(x.checkpoint.inspect().resumeAllowed,false);
});

async function reviewSetup(t){
 const x=await setup(t);await x.sign();
 const readers=createNormalReviewReaders({now:()=>x.f.time});
 const touch=()=>{readers.observe('PARTICIPANT');readers.observe('OPERATOR');};
 touch();x.f.setTime(x.f.time+6);
 const args={store:x.f.store,context:x.f.aliceContext,applicationId:x.app,sourceTarget:x.target,
  registration:x.intake.record,assertCurrent:()=>x.ui.participant(),requireReaders:()=>readers.require(),pollMs:1,timeoutMs:1000};
 return {x,readers,touch,args};
}
test('post-signature reader delay waits for both fresh reads and preserves the signed packet without writes',async t=>{
 const {x,readers,touch,args}=await reviewSetup(t),before=x.packet(),counts=x.f.counts();let refreshes=0;
 await waitForNormalPaymentReview({...args,connection:{async refresh(){
  refreshes++;if(refreshes===1)readers.observe('PARTICIPANT');if(refreshes===3)touch();
 }}});
 assert.equal(refreshes,3);assert.deepEqual(x.packet(),before);assert.deepEqual(x.f.counts(),counts);
 assert.equal(readers.ready(),true);x.f.setTime(x.f.time+6);assert.equal(readers.ready(),false);
});
for(const kind of ['logout','source','expiry','target'])test('post-signature wait rejects '+kind+' even when both readers return',async t=>{
 const {x,touch,args}=await reviewSetup(t);let reads=0;
 await assert.rejects(waitForNormalPaymentReview({...args,connection:{async refresh(){
  if(++reads===2){if(kind==='target')await x.f.refreshEvidence(x.app,START+7);else x.mutate(kind);touch();}
 }}}));
 assert.equal(reads,2);assert.equal(x.report.stages.length,0);
});
test('post-signature wait revalidates authority after asynchronous refresh',async t=>{
 const {touch,args}=await reviewSetup(t);let current=true;
 await assert.rejects(waitForNormalPaymentReview({...args,assertCurrent(){if(!current)throw new RuleError('AUTH_REQUIRED');},
  connection:{async refresh(){current=false;touch();}}}),/AUTH_REQUIRED/);
});
test('post-signature wait is bounded and cancellation never returns permission',async t=>{
 const {args}=await reviewSetup(t);
 await assert.rejects(waitForNormalPaymentReview({...args,timeoutMs:10,connection:{async refresh(){}}}),/REVIEW_SCREENS_REQUIRED/);
 const controller=new AbortController();
 await assert.rejects(waitForNormalPaymentReview({...args,signal:controller.signal,connection:{async refresh(){controller.abort();}}}),/NORMAL_HOST_CANCELLED/);
});
test('post-signature wait propagates unrelated reader errors immediately',async t=>{
 const {args}=await reviewSetup(t);let reads=0;const failure=new RuleError('AUTH_REQUIRED');
 await assert.rejects(waitForNormalPaymentReview({...args,connection:{async refresh(){reads++;}},requireReaders(){throw failure;}}),e=>e===failure);
 assert.equal(reads,1);
});
test('readers becoming ready after the bounded RPC wait cannot authorize continuation',async t=>{
 const {touch,args}=await reviewSetup(t);
 await assert.rejects(waitForNormalPaymentReview({...args,timeoutMs:10,connection:{async refresh(){
  await new Promise(resolve=>setTimeout(resolve,15));touch();
 }}}),/REVIEW_SCREENS_REQUIRED/);
});
