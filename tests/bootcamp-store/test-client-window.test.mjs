import test from 'node:test';
import assert from 'node:assert/strict';
import {normalApprovalFixture} from './normal-approval-fixture.mjs';
import {createTestDriver,createTestAutoReader} from '../../tools/bootcamp/test-client/driver.js';
import {createNormalBootcampClient} from '../../src/bootcamp/normal-client.mjs';
import {displayedReviewWindow,testActionAvailability} from '../../tools/bootcamp/test-client/review-window.js';
async function fixture(t,{lose=false}={}){
 const x=await normalApprovalFixture(t);let posts=0,wall=x.f.time*1000,elapsed=1000,readsFailed=false,readConflict=false;
 const view=x.f.store.getApplication(x.f.aliceContext,x.app);
 const host={version:'clear-bootcamp-frontend-host.1',phase:'ACTIVE_LOCAL_TEST',sourceMode:'REGISTERED_TEST_SOURCE',productionEnabled:false,
  origin:x.f.config.origin,chainId:x.f.config.chainId,policyHash:view.policyHash};
 const session={publicRead:async()=>host,login:async()=>({wallet:x.config.operatorWallet,role:'operator'}),
  async request(path,options={}){
   if(readConflict){readConflict=false;throw Object.assign(Error('BC_VIEW_STALE'),{code:'BC_VIEW_STALE'});}
   if(readsFailed&&(options.method??'GET')==='GET')throw Object.assign(Error('TEST_REQUEST_FAILED'),{code:'TEST_REQUEST_FAILED',outcome:'NOT_SENT'});
   if(path==='/__dev/config')return host;
   if(path==='/bootcamp/v4/session')return {version:'clear-bootcamp-normal-session.1',role:'OPERATOR',applicationId:x.app,
    policyHash:view.policyHash,runtimeMappingHash:view.runtimeMappingHash,sourceMode:'REGISTERED_TEST_SOURCE',receiptRequired:true,
    aiApproval:x.control.brief(x.actor)};
   if(path.endsWith('/reflection-approval')){posts++;const result=x.control.approve(x.actor,x.app,options.body,options.idempotencyKey);
    if(lose)throw Object.assign(Error('TEST_REQUEST_FAILED'),{code:'TEST_REQUEST_FAILED',outcome:'UNKNOWN'});return result;}
   if(path.endsWith('/procedure'))throw Object.assign(Error('BC_NORMAL_PROCEDURE_NOT_READY'),{code:'BC_NORMAL_PROCEDURE_NOT_READY'});
   if(path.endsWith('/operations'))return x.f.store.getOperationsProjection(x.actor,x.app);
   assert.fail(path);
  },end:async()=>{},
 };
 const driver=createTestDriver({session,createNormalClient:createNormalBootcampClient,now:()=>wall,elapsedNow:()=>elapsed});
 await driver.config();await driver.login();return {...x,driver,failNextRead:()=>{readConflict=true;},failReads:()=>{readsFailed=true;},get posts(){return posts;},setWall:v=>wall=v,advanceElapsed:ms=>elapsed+=ms};
}
test('automatic AI brief reads never approve; the displayed exact human action writes once',async t=>{
 const x=await fixture(t);let next;const reader=createTestAutoReader({driver:x.driver,setTimer:fn=>{next=fn;return fn;},clearTimer:()=>{next=null;}});t.after(()=>reader.close());
 reader.sync();await next();assert.equal(x.posts,0);assert.deepEqual(x.counts(),{fetches:0,keys:0});
 const shown=x.driver.snapshot().bootstrap.aiApproval;assert.equal(shown.runBindingHash,x.binding.bindingHash);
 await x.driver.approveAi();assert.equal(x.posts,1);assert.equal(x.driver.snapshot().aiApprovalReceipt.paymentConsentIncluded,false);
 await assert.rejects(x.driver.approveAi(),/TEST_AI_APPROVAL_NOT_READY/);assert.equal(x.posts,1);
 assert.deepEqual(x.counts(),{fetches:0,keys:0});
});
test('a lost approval reply is never replayed by a reader or another click',async t=>{
 const x=await fixture(t,{lose:true});await assert.rejects(x.driver.approveAi(),e=>e.outcome==='UNKNOWN');
 let scheduled=false;const reader=createTestAutoReader({driver:x.driver,setTimer:()=>{scheduled=true;return 1;},clearTimer:()=>{scheduled=false;}});t.after(()=>reader.close());
 reader.sync();assert.equal(scheduled,false);assert.equal(x.posts,1);await x.driver.refresh();
 assert.equal(x.driver.snapshot().bootstrap.aiApproval.status,'RECORDED');
 await assert.rejects(x.driver.approveAi(),/TEST_AI_APPROVAL_NOT_READY/);assert.equal(x.posts,1);
});
test('browser wall-clock changes do not renew the source or AI approval countdown',async t=>{
 const x=await fixture(t),before=x.driver.snapshot().aiApprovalRemainingMs,expiry=x.packet.leaseExpiresAtMs;
 x.setWall(1);assert.equal(x.driver.snapshot().aiApprovalRemainingMs,before);
 x.advanceElapsed(1000);assert.equal(x.driver.snapshot().aiApprovalRemainingMs,before-1000);
 x.advanceElapsed(-2000);await assert.rejects(x.driver.approveAi(),/TEST_AI_APPROVAL_NOT_READY/);assert.equal(x.posts,0);
 assert.equal(x.packet.leaseExpiresAtMs,expiry);
});
test('display budget uses the actual source cap and charges reads/timer age without changing observedAt',()=>{
 const v={observedAt:1000,sourceValidUntilExclusive:1100,procedure:{reviewCapAt:1600},criteria:Array(4).fill({expiresAt:9999})};
 assert.equal(displayedReviewWindow(v,{nowMs:5000,readStartedAtMs:4000}).remainingMs,99000);
 assert.equal(displayedReviewWindow(v,{nowMs:7000,readStartedAtMs:4000}).remainingMs,97000);
 assert.equal(v.observedAt,1000);assert.equal(v.sourceValidUntilExclusive,1100);
 assert.equal(displayedReviewWindow(v,{nowMs:3000,readStartedAtMs:4000}),null);
});


test('failed server observation removes the old WAITING packet and blocks another approval click',async t=>{
 const x=await fixture(t);assert.equal(x.driver.snapshot().bootstrap.aiApproval.status,'WAITING');
 x.failReads();await assert.rejects(x.driver.readLive(),/TEST_REQUEST_FAILED/);
 const s=x.driver.snapshot();assert.equal(s.bootstrap.aiApproval,null);
 assert.equal(testActionAvailability(s,{ack:true}).ai.code,'STATE_UNAVAILABLE');
 await assert.rejects(x.driver.approveAi(),/TEST_AI_APPROVAL_NOT_READY/);assert.equal(x.posts,0);
});

test('button explanations use the actual blocking gates, including fresh acknowledgement and unknown outcomes',()=>{
 const wallet='0x'+'11'.repeat(20),a={status:'WAITING',authorityConfigured:true,approvalWallet:wallet,reviewScreensReady:true,permitted:true};
 const s={identity:{wallet},bootstrap:{applicationId:'application-test',phase:'AWAITING_AUTHENTICATED_APP_CONSENTS',aiApproval:a},
  aiApprovalRemainingMs:5000,canAgree:true,view:{objection:{blocked:false}},reviewWindow:{remainingMs:110000}};
 const check=(change,which,code,options={ack:true})=>{const x=testActionAvailability({...s,...change},options)[which];assert.equal(x.code,code);assert.equal(x.enabled,code==='READY');assert.ok(x.reason.length>10);};
 check({},'ai','READY');check({},'ai','AI_ACK_REQUIRED',{ack:false});
 for(const [flag,code]of [['ended','ENDED'],['busy','BUSY']]){check({[flag]:true},'ai',code);check({[flag]:true},'consent',code);}
 check({identity:null},'ai','LOGIN_REQUIRED');check({error:{code:'TEST_REQUEST_FAILED'}},'ai','STATE_UNAVAILABLE');
 const ai=(fields,code,options)=>check({bootstrap:{...s.bootstrap,aiApproval:{...a,...fields}}},'ai',code,options);
 ai({authorityConfigured:false},'AI_AUTHORITY_REQUIRED');ai({approvalWallet:'0x'+'22'.repeat(20)},'AI_WRONG_WALLET');
 ai({reviewScreensReady:false},'BOTH_READERS_REQUIRED',{ack:true,readerEnabled:false});
 ai({status:'INSUFFICIENT_REVIEW_WINDOW'},'AI_TIME_INSUFFICIENT');check({aiApprovalRemainingMs:-1},'ai','AI_TIME_INSUFFICIENT');
 ai({status:'PARTIAL_STOPPED'},'AI_PARTIAL_STOPPED');ai({status:'RECORDED'},'AI_RECORDED');ai({permitted:false},'AI_NOT_PERMITTED');
 check({bootstrap:{...s.bootstrap,aiApproval:null}},'ai','AI_PACKET_WAIT');
 check({aiApprovalUnknown:true,error:{outcome:'UNKNOWN'}},'ai','AI_OUTCOME_UNKNOWN');
 check({},'consent','READY');check({consentReplayPending:true,error:{outcome:'UNKNOWN'}},'consent','CONSENT_OUTCOME_UNKNOWN');
 check({consentTargetChanged:true},'consent','CONSENT_TARGET_CHANGED');check({reviewStopped:true},'consent','CONSENT_REVIEW_STOPPED');
 check({bootstrap:{...s.bootstrap,phase:'SOURCE_ACTIVITY'}},'consent','CONSENT_PREPARATION_WAIT');
 check({view:null},'consent','CONSENT_VIEW_REQUIRED');check({view:{objection:{blocked:true}}},'consent','CONSENT_OBJECTION');
 check({reviewWindow:{remainingMs:30000}},'consent','CONSENT_TIME_INSUFFICIENT');check({canAgree:false},'consent','CONSENT_TARGET_NOT_READY');
});


test('a successful fresh read clears a retryable observation error but requires fresh packet acknowledgement',async t=>{
 const x=await fixture(t);x.failNextRead();await assert.rejects(x.driver.readLive(),/BC_VIEW_STALE/);
 assert.equal(x.driver.snapshot().bootstrap.aiApproval,null);await x.driver.readLive();const s=x.driver.snapshot();
 assert.equal(s.error,null);assert.equal(s.bootstrap.aiApproval.status,'WAITING');
 assert.equal(testActionAvailability(s,{ack:false}).ai.code,'AI_ACK_REQUIRED');assert.equal(x.posts,0);
});
