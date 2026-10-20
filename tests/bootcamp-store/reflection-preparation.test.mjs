import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveMoodleConsumer} from '../../src/bootcamp/moodle-live-consumer.mjs';
import {storeFixture,START} from './fixture.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
import {runFirstNormalReflection} from '../ai-review-precheck/first-normal-reflection-entry.mjs';
import {reflectionContextHash} from '../../src/document-precheck/review/bootcamp-reflection.mjs';

// All source responses are invented. No network, model/key/journal or real identity is used.
async function fixture(t){
 const f=await storeFixture(t,{store:{mode:'ISOLATED_LIVE_TEST',producers:{},resolveSource:()=>null}});
 const state={available:true,authExpiresAt:START+240,rawExpiresAt:START+240,queryExpiresAt:START+240};
 let review=async()=>{throw Error('OFFLINE_CALLBACK_STOP');};
 let code={head:'a'.repeat(40),clean:true},day='2026-10-20',body='<p>Synthetic work, checked input, learned loops.</p>',format=1,calls=0,aiCalls=0,seen,hook=async()=>{};
 const pin=r=>({environmentRef:'offline-preparation',runRef:'offline-run',sourceVersion:'moodle-4.5.15-215f4438',apiVersion:'2024100715',fixtureReportHash:p0Hash('TEST','report'),courseId:2,
  participantMapping:{participantId:r.participantId,applicationId:r.applicationId,moodleUserId:3,accountBindingRef:'offline-user3',revision:1},
  target:{targetLogicalId:'python-reflection',cmId:5,instanceId:10,module:'forum',selectedPostId:41},completionSetupReceiptHash:null});
 const withReader=async fn=>fn({async call(method){calls++;await hook(method);
  const responses={core_webservice_get_site_info:{userid:3,version:'2024100715'},core_course_get_contents:[{id:0,modules:[{id:5,instance:10,modname:'forum',completion:0}]}],
   mod_forum_get_forums_by_courses:[{id:10,course:2}],mod_forum_get_forum_discussions:{discussions:[{id:41,discussion:42,userid:3}],warnings:[]},
   mod_forum_get_discussion_post:{post:{id:41,discussionid:42,author:{id:3},subject:'Invented reflection',message:body,messageformat:format,
    timecreated:START-50,timemodified:START-10,capabilities:{view:true},isdeleted:false,isprivatereply:false},warnings:[]}};
  assert.ok(method in responses,'unexpected network method');return structuredClone(responses[method]);}});
 const consumer=createLiveMoodleConsumer({criterionId:'reflection-topics',withReader,resolvePin:pin,resolveLease:()=>state,modelVersion:'gemini-3.5-flash-lite',now:()=>f.time,
  reflectionHost:{codeState(){assert.equal(this.marker,true);return code;},day(){assert.equal(this.marker,true);return day;},marker:true},reviewReflection:async args=>{aiCalls++;seen=args;return review(args);}});
 f.configuration.producers={'reflection-topics':consumer};f.configuration.resolveSource=consumer.resolveSource;f.restart();
 const app=f.create(),issue=()=>f.store.issueBridgeRequest(f.aliceContext,app,{criterionId:'reflection-topics',expectedRevision:f.view(app).revision},f.key());
 const request=issue(),requestBody={requestId:request.record.target.requestId,expectedRevision:request.record.applicationRevision};
 return {f,state,consumer,app,requestBody,issue,get calls(){return calls;},get aiCalls(){return aiCalls;},get seen(){return seen;},
  setReview:v=>review=v,setCode:v=>code=v,setDay:v=>day=v,setBody:v=>body=v,setFormat:v=>format=v,setHook:v=>hook=v,
  prepare:options=>f.store.prepareBridgeReflection(f.aliceContext,app,requestBody,options),
  collect:()=>f.store.collectBridge(f.aliceContext,app,requestBody,f.key(),{timeoutMs:30000}),
  status:()=>f.store.getRequest(f.aliceContext,app,requestBody.requestId,{bridge:true}).status};
}
test('packet preparation returns no raw or model result; approval wait precedes execution timer and preserves exact packet',async t=>{
 const x=await fixture(t),p=await x.prepare(),count=x.calls;
 assert.equal(x.aiCalls,0);assert.equal(x.status(),'PENDING');assert.equal(x.f.counts().evidence,0);assert.equal(p.isCurrent(),true);
 assert.equal(p.packet.leaseExpiresAtMs,(START+240)*1000);assert.equal(Object.isFrozen(p.packet),true);
 assert.equal(JSON.stringify(p).includes('Synthetic work'),false);assert.equal(Object.hasOwn(p,'lease'),false);
 x.f.setTime(START+31);assert.equal(p.isCurrent(),true);assert.equal(x.calls,count);
 await assert.rejects(x.collect(),/BC_PRODUCER_FAILED/);assert.equal(x.aiCalls,1);assert.ok(x.calls>count);
 assert.equal(x.seen.packet,p.packet);assert.equal(reflectionContextHash(x.seen.context),p.packet.contextHash);
 assert.equal(x.seen.context.requestHash,x.f.store.getRequest(x.f.aliceContext,x.app,x.requestBody.requestId,{bridge:true}).record.requestHash);
 assert.deepEqual(x.seen.codeState,p.codeState);assert.equal(x.seen.day,p.day);
 assert.deepEqual(x.seen.currentCodeState(),p.codeState);assert.equal(x.seen.currentDay(),p.day);assert.equal(x.seen.timeoutMs,30000);
 assert.equal(x.seen.context.expiresAtMs,(START+240)*1000);assert.equal(x.f.counts().evidence,0);assert.equal(x.status(),'PENDING');
 await assert.rejects(x.collect(),/BC_PRODUCER_FAILED/);assert.equal(x.aiCalls,1);await assert.rejects(x.prepare(),/BC_LIVE_AI_PREPARATION_REQUEST/);
});
for(const kind of ['expiry','auth','raw','query','code','dirty','day','request','cancel','dispose','body','format'])test('pending '+kind+' invalidates without calling AI or consuming nonce',async t=>{
 const x=await fixture(t),p=await x.prepare();
 if(kind==='expiry')x.f.setTime(START+240);
 if(kind==='auth')x.state.authExpiresAt=START;
 if(kind==='raw')x.state.rawExpiresAt=START;
 if(kind==='query')x.state.queryExpiresAt=START;
 if(kind==='code')x.setCode({head:'b'.repeat(40),clean:true});
 if(kind==='dirty')x.setCode({head:'a'.repeat(40),clean:false});
 if(kind==='day')x.setDay('2026-10-21');
 if(kind==='request')x.issue();
 if(kind==='cancel')x.f.store.cancel(x.f.aliceContext,x.app,{expectedRevision:x.f.view(x.app).revision},x.f.key());
 if(kind==='dispose')p.dispose();
 if(kind==='body')x.setBody('<p>Changed while waiting.</p>');
 if(kind==='format')x.setFormat(2);
 await assert.rejects(x.collect());assert.equal(x.aiCalls,0);assert.equal(x.f.counts().evidence,0);
 assert.equal(p.isCurrent(),false);assert.notEqual(x.status(),'CONSUMED');
});
test('logout invalidates preparation and cannot revive after authentication recovery',async t=>{
 const x=await fixture(t),p=await x.prepare(),authorize=x.f.service.authorizeWorkflow;
 x.f.service.authorizeWorkflow=()=>{throw Error('FORBIDDEN');};assert.equal(p.isCurrent(),false);
 x.f.service.authorizeWorkflow=authorize;await assert.rejects(x.collect());assert.equal(x.aiCalls,0);
});
test('cancelled slow preparation cannot register a late packet; execution cannot fall back to recollection',async t=>{
 const x=await fixture(t),controller=new AbortController();let release,entered;
 const ready=new Promise(r=>entered=r);x.setHook(async()=>{entered();await new Promise(r=>release=r);});
 const pending=x.prepare({signal:controller.signal,timeoutMs:10});await ready;controller.abort();
 // The test reader deliberately ignores abort. The owner must still reject its eventual result.
 release();await assert.rejects(pending);x.setHook(async()=>{});await assert.rejects(x.collect());
 assert.equal(x.aiCalls,0);assert.equal(x.f.counts().evidence,0);
});
test('execution without new exact approval is rejected by the actual entry before model dispatch',async t=>{
 const x=await fixture(t);await x.prepare();let reason;
 x.setReview(async args=>{try{return await runFirstNormalReflection({...args,approval:{codeHead:args.codeState.head},currentApprovalHash:()=>null});}catch(e){reason=e.message;throw e;}});
 await assert.rejects(x.collect());assert.equal(reason,'NORMAL_APPROVAL_REQUIRED');assert.equal(x.f.counts().evidence,0);
});
test('forged ACTUAL result cannot turn a prepared source into accepted evidence',async t=>{
 const x=await fixture(t);await x.prepare();x.setReview(async()=>({view:{current:true},consume:()=>({current:true}),close(){}}));
 await assert.rejects(x.collect());assert.equal(x.f.counts().evidence,0);assert.equal(x.status(),'PENDING');
 await assert.rejects(x.collect());assert.equal(x.aiCalls,1);
});
test('source lifetime never expands when host lease grows during approval wait',async t=>{
 const x=await fixture(t),p=await x.prepare();x.state.authExpiresAt=x.state.rawExpiresAt=x.state.queryExpiresAt=START+900;
 assert.equal(p.packet.leaseExpiresAtMs,(START+240)*1000);x.f.setTime(START+240);assert.equal(p.isCurrent(),false);
 await assert.rejects(x.collect());assert.equal(x.aiCalls,0);
});
test('wrong participant cannot prepare or consume another participant source',async t=>{
 const x=await fixture(t);await assert.rejects(x.f.store.prepareBridgeReflection(x.f.bobContext,x.app,x.requestBody));
 assert.equal(x.calls,0);const p=await x.prepare();
 await assert.rejects(x.f.store.collectBridge(x.f.bobContext,x.app,x.requestBody,x.f.key()));assert.equal(x.aiCalls,0);assert.equal(p.isCurrent(),true);
});
test('preparation network deadline disposes even when the source callback returns late',async t=>{
 const x=await fixture(t);let release,entered;const ready=new Promise(r=>entered=r);
 x.setHook(async()=>{entered();await new Promise(r=>release=r);});
 const pending=x.prepare({timeoutMs:5});await ready;await assert.rejects(pending,/BC_PRODUCER_TIMEOUT/);
 release();await new Promise(r=>setImmediate(r));x.setHook(async()=>{});
 await assert.rejects(x.collect());assert.equal(x.aiCalls,0);assert.equal(x.f.counts().evidence,0);
});
