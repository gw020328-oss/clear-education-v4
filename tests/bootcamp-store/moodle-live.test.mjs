import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveMoodleConsumer} from '../../src/bootcamp/moodle-live-consumer.mjs';
import {createBootcampStore} from '../../src/bootcamp/store.mjs';
import {storeFixture,START} from './fixture.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
async function fixture(t,{afterRead=()=>{}}={}){
 const f=await storeFixture(t,{store:{mode:'ISOLATED_LIVE_TEST',producers:{},resolveSource:()=>null}}),state={available:true,authExpiresAt:START+240,rawExpiresAt:START+240,queryExpiresAt:START+240};let calls=0;
 const pin=r=>({environmentRef:'test-owned-moodle',runRef:'test-run',sourceVersion:'moodle-4.5.15-215f4438',apiVersion:'2024100715',fixtureReportHash:p0Hash('TEST','report'),courseId:2,participantMapping:{participantId:r.participantId,applicationId:r.applicationId,moodleUserId:3,accountBindingRef:'test-user3',revision:1},target:{targetLogicalId:'python-intro-activity',cmId:3,instanceId:1,module:'page',selectedPostId:null},completionSetupReceiptHash:p0Hash('TEST','setup')});
 // Explicit fake network used only to test the dedicated consumer and CAS.
 const withReader=async fn=>fn({async call(method){calls++;const completion={state:1,timecompleted:START-1,overrideby:null,hascompletion:true,isautomatic:true,istrackeduser:true,uservisible:true,details:[{rulename:'completionview',rulevalue:{status:1}}]};
  const result={core_webservice_get_site_info:{userid:3,version:'2024100715'},core_course_get_contents:[{id:0,modules:[{id:3,instance:1,modname:'page',completion:2,completiondata:completion}]}],core_completion_get_activities_completion_status:{statuses:[{...completion,cmid:3,instance:1,modname:'page',tracking:2}],warnings:[]}}[method];afterRead(state,calls);return structuredClone(result);}});
 const consumer=createLiveMoodleConsumer({criterionId:'activity-complete',withReader,resolvePin:pin,resolveLease:()=>state,now:()=>f.time});
 f.configuration.producers={'activity-complete':consumer};f.configuration.resolveSource=consumer.resolveSource;f.restart();
 const app=f.create(),issue=()=>f.store.issueBridgeRequest(f.aliceContext,app,{criterionId:'activity-complete',expectedRevision:f.view(app).revision},f.key());
 return {...f,get store(){return f.store;},app,consumer,state,issue,get calls(){return calls;},collect:r=>f.store.collectBridge(f.aliceContext,app,{requestId:r.record.target.requestId,expectedRevision:r.record.applicationRevision},f.key())};
}
test('dedicated registered local consumer records LOCAL_LMS provenance, consumes once, and leaves missing criteria UNKNOWN (fake network)',async t=>{
 const f=await fixture(t),r=f.issue(),request=f.store.getRequest(f.aliceContext,f.app,r.record.target.requestId,{bridge:true}).record;
 assert.equal(request.dataMode,'LOCAL_LMS_RECORD');const done=await f.collect(r),e=f.store.getEvidence(f.aliceContext,f.app,done.record.target.evidenceId).record;
 assert.equal(e.dataMode,'LOCAL_LMS_RECORD');assert.equal(e.verification.sourceStatus,'VERIFIED_LOCAL_API');assert.equal(e.condition,'MET');assert.equal(f.view(f.app).decision.record.conditionsStatus,'UNKNOWN');
 assert.ok(f.calls>=15);await assert.rejects(f.collect(r),/BC_REVISION_CONFLICT|BC_REQUEST_NOT_PENDING/);assert.equal(f.counts().evidence,1);
 f.state.available=false;assert.equal(f.view(f.app).evidence[0].current,false);f.state.available=true;assert.equal(f.view(f.app).evidence[0].current,false);
});
test('plain copied producer brand is not a live constructor capability',async t=>{
 const f=await fixture(t);assert.throws(()=>createBootcampStore({...f.configuration,producers:{'activity-complete':{...f.consumer}}}),/BC_PRODUCER/);
});
test('lease loss during fresh probe rejects without evidence or request consumption',async t=>{
 const f=await fixture(t,{afterRead:(s,n)=>{if(n===12)s.available=false;}}),r=f.issue();await assert.rejects(f.collect(r),/BC_PRODUCER_FAILED|BC_SOURCE|BC_REQUEST|BC_REVISION/);assert.equal(f.counts().evidence,0);
});
