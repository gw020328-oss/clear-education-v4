import test from 'node:test';
import assert from 'node:assert/strict';
import {normalApprovalFixture} from './normal-approval-fixture.mjs';
import {createTestDriver,createTestAutoReader} from '../../tools/bootcamp/test-client/driver.js';
import {createNormalBootcampClient} from '../../src/bootcamp/normal-client.mjs';
import {displayedReviewWindow} from '../../tools/bootcamp/test-client/review-window.js';
async function fixture(t,{lose=false}={}){
 const x=await normalApprovalFixture(t);let posts=0,wall=x.f.time*1000,elapsed=1000;
 const view=x.f.store.getApplication(x.f.aliceContext,x.app);
 const host={version:'clear-bootcamp-frontend-host.1',phase:'ACTIVE_LOCAL_TEST',sourceMode:'REGISTERED_TEST_SOURCE',productionEnabled:false,
  origin:x.f.config.origin,chainId:x.f.config.chainId,policyHash:view.policyHash};
 const session={publicRead:async()=>host,login:async()=>({wallet:x.config.operatorWallet,role:'operator'}),
  async request(path,options={}){
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
 await driver.config();await driver.login();return {...x,driver,get posts(){return posts;},setWall:v=>wall=v,advanceElapsed:ms=>elapsed+=ms};
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
