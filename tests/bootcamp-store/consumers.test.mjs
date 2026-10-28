import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {fixture as hrFixture,resign,actors} from '../hackerrank-evidence/fixture.mjs';
import {requestMessage} from '../../src/hackerrank-evidence/request.mjs';
import {hash as hrHash} from '../../src/hackerrank-evidence/values.mjs';
import {createReclaimConsumer,createMemoryLease} from '../../src/bootcamp/reclaim-consumer.mjs';
import {createMoodleConsumer} from '../../src/bootcamp/moodle-consumer.mjs';
import {BOOTCAMP_MOODLE_SOURCE} from '../../src/review-evidence/moodle/bootcamp.mjs';
import {bootcampP0Example} from '../../specs/bootcamp/p0-example.mjs';
import {P0_POLICY,p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
import {storeFixture,START} from './fixture.mjs';

const bound=(f,a,c)=>f.store.issueBridgeRequest(f.aliceContext,a,{criterionId:c,expectedRevision:f.view(a).revision},f.key());
const collect=(f,a,r,key=f.key())=>f.store.collectBridge(f.aliceContext,a,{requestId:r.record.target.requestId,expectedRevision:r.record.applicationRevision},key);
async function reclaimFixture(t,{mutate=async()=>{},fault=()=>{}}={}){
 const f=await storeFixture(t),trustPatch={notBefore:START-100,expiresAt:START+4000},base=await hrFixture({clock:()=>f.time,trustPatch});
 const pins={audience:base.config.audience,trustConfigHash:hrHash('TRUST',base.config),recipeHash:hrHash('RECIPE',base.config.recipe),
  expectedClaimOwner:actors.owner.address.toLowerCase(),selectedCertificateId:null,dataMode:'SYNTHETIC_FIXTURE'};
 const state={available:true,authExpiresAt:START+3000,rawExpiresAt:START+1800,queryExpiresAt:START+3000};let disposed=0,lastInput,lastLease;
 const make=()=>createReclaimConsumer({verifier:base.verifier,pins:()=>pins,resolveLease:()=>state,now:()=>f.time,
  collectLease:async(expected,{signal,isAuthorized})=>{
    const h=await hrFixture({clock:()=>f.time,trustPatch,requestPatch:expected});
    h.input.envelope.signature=await f.alice.signMessage(requestMessage(expected));
    for(const role of ['account','certificate'])h.input.proofs[role]=await resign(h.input.proofs[role],c=>{c.timestampS=f.time;});
    await mutate(h.input,expected,lastInput);lastInput=structuredClone(h.input);
    lastLease=createMemoryLease(h.input,{expiresAt:Math.min(expected.expiresAt,state.rawExpiresAt),now:()=>f.time,
      isCurrent:()=>state.available&&!signal.aborted&&isAuthorized()===true
        &&f.time<Math.min(state.authExpiresAt,state.rawExpiresAt,state.queryExpiresAt),onDispose:()=>{disposed++;}});return lastLease;
  }});
 let consumer=make();f.configuration.producers={'python-basic-certificate':consumer};f.configuration.resolveSource=consumer.resolveSource;f.configuration.fault=fault;f.restart();
 return {...f,state,pins,get store(){return f.store;},get time(){return f.time;},get consumer(){return consumer;},get disposed(){return disposed;},get raw(){return lastLease;},
  newConsumer(){consumer=make();return consumer;},
  reset(){consumer=make();f.configuration.producers={'python-basic-certificate':consumer};f.configuration.resolveSource=consumer.resolveSource;f.restart();}};
}
test('P1 actual verifier + participant EOA + two signed contexts compose into one atomic ledger acceptance',async t=>{
 const f=await reclaimFixture(t),a=f.create();assert.throws(()=>f.request(a,'python-basic-certificate'),/BC_REQUEST_VERSION/);
 const r=bound(f,a,'python-basic-certificate'),issued=f.store.getRequest(f.aliceContext,a,r.record.target.requestId,{bridge:true});
 assert.throws(()=>f.store.getRequest(f.aliceContext,a,r.record.target.requestId),/BC_REQUEST_VERSION/);
 const op=await collect(f,a,r),e=f.store.getEvidence(f.aliceContext,a,op.record.target.evidenceId).record;
 assert.equal(e.evidenceId,issued.record.plannedEvidenceId);assert.equal(e.facts.issuerStatus,'test_passed');assert.equal(e.dataMode,'SYNTHETIC_FIXTURE');
 const db=new DatabaseSync(join(f.directory,'bootcamp.sqlite'),{readOnly:true});t.after(()=>db.close());
 const reference=JSON.parse(db.prepare('SELECT record FROM r2_bridges WHERE evidence_id=?').get(e.evidenceId).record);
 assert.equal(reference.version,'clear-bootcamp-producer-bridge.2');assert.equal(reference.ledgerRequestHash,e.requestHash);
 assert.notEqual(reference.producerRequestHash,reference.ledgerRequestHash);assert.notEqual(reference.producerNonceHash,reference.ledgerNonceHash);
 const manifest=f.store.getDecisionEvidence(f.aliceContext,a).manifest,explanation=manifest.criteria.find(c=>c.criterionId==='python-basic-certificate');
 assert.equal(explanation.evidenceId,e.evidenceId);assert.equal(explanation.reference.status,'RECORDED');
 for(const k of ['receiptHash','proofBundleHash','trustConfigHash','recipeHash','producerRequestHash'])assert.equal(explanation.reference.value[k],reference[k]);
 assert.equal(explanation.checks.accountProofHash,e.facts.accountProofHash);assert.equal(explanation.checks.certificateProofHash,e.facts.certificateProofHash);
 assert.equal('expectedClaimOwnerHash' in explanation.reference.value,false);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM evidence').get().n,1);assert.equal(f.store.getRequest(f.aliceContext,a,r.record.target.requestId,{bridge:true}).status,'CONSUMED');
 assert.equal(f.store.getOperationsProjection(f.aliceContext,a).payment.state,'BLOCKED');
});
test('unconfigured real trust never requests raw material and cannot issue bound collection',async t=>{
 const f=await storeFixture(t),consumer=createReclaimConsumer();f.configuration.producers={'python-basic-certificate':consumer};f.configuration.resolveSource=consumer.resolveSource;f.restart();
 assert.equal(consumer.status(),'UNCONFIGURED_BLOCKED');const a=f.create();assert.throws(()=>bound(f,a,'python-basic-certificate'),/BC_SOURCE_UNKNOWN/);assert.equal(f.counts().evidence,0);
});
for(const which of ['participant','signed-context','proof-pair','old-request'])test(`P1 consumer rejects ${which} without accepting nonce/evidence`,async t=>{
 let calls=0;const f=await reclaimFixture(t,{mutate:async(input,expected,last)=>{
  calls++;
  if(which==='participant')input.envelope.signature=await actors.other.signMessage(requestMessage(expected));
  if(which==='signed-context')input.proofs.account=await resign(input.proofs.account,c=>{const ctx=JSON.parse(c.context);ctx.clearRequestHash=p0Hash('WRONG','context');c.context=JSON.stringify(ctx);});
  if(which==='proof-pair')delete input.proofs.certificate;
  if(which==='old-request'&&calls===2){input.envelope=last.envelope;input.proofs=last.proofs;}
 }}),a=f.create();if(which==='old-request')await collect(f,a,bound(f,a,'python-basic-certificate'));
 const r=bound(f,a,'python-basic-certificate'),before=f.counts().evidence;await assert.rejects(collect(f,a,r),/BC_PRODUCER_FAILED|BC_REVISION_CONFLICT|BC_REQUEST/);
 assert.equal(f.counts().evidence,before);assert.notEqual(f.store.getRequest(f.aliceContext,a,r.record.target.requestId,{bridge:true}).status,'CONSUMED');assert.ok(f.disposed>0);
});
test('P1 original candidate identity cannot be JSON-restored; raw lease revoke and new process generation cannot revive current',async t=>{
 const f=await reclaimFixture(t),a=f.create(),r=bound(f,a,'python-basic-certificate'),issued=f.store.getRequest(f.aliceContext,a,r.record.target.requestId,{bridge:true}).record;
 const candidate=await f.consumer.verify(issued,{signal:new AbortController().signal});
 assert.equal(f.consumer.recheck(candidate,issued),true);assert.throws(()=>f.consumer.recheck(structuredClone(candidate),issued),/BC_HR_CANDIDATE/);
 const op=await collect(f,a,r);f.state.available=false;assert.equal(f.store.getEvidence(f.aliceContext,a,op.record.target.evidenceId).current,false);
 assert.throws(()=>f.raw.read(),/BC_PRIVATE_RAW_UNAVAILABLE/);f.state.available=true;f.reset();assert.equal(f.store.getEvidence(f.aliceContext,a,op.record.target.evidenceId).current,false);
});
test('P1 bridge attachment rolls back with nonce/evidence on injected failure, then reverified retry succeeds',async t=>{
 let fail=true;const f=await reclaimFixture(t,{fault:s=>{if(fail&&s==='after-decision')throw Error('BRIDGE_FAULT');}}),a=f.create(),r=bound(f,a,'python-basic-certificate');
 await assert.rejects(collect(f,a,r),/BRIDGE_FAULT/);const db=new DatabaseSync(join(f.directory,'bootcamp.sqlite'),{readOnly:true});t.after(()=>db.close());
 assert.equal(db.prepare('SELECT COUNT(*) n FROM r2_bridges').get().n,0);assert.equal(f.counts().evidence,0);
 assert.equal(f.store.getRequest(f.aliceContext,a,r.record.target.requestId,{bridge:true}).status,'PENDING');fail=false;await collect(f,a,r);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM r2_bridges').get().n,1);
});
test('raw lease expiry/clock reversal is latched and disposer runs once',()=>{
 let time=10,disposed=0;const lease=createMemoryLease({body:'invented-source'},{expiresAt:20,now:()=>time,onDispose:()=>{disposed++;}});
 assert.equal(lease.isCurrent(),true);time=9;assert.equal(lease.isCurrent(),false);time=10;
 assert.throws(()=>lease.read(),/BC_PRIVATE_RAW_UNAVAILABLE/);lease.dispose();assert.equal(disposed,1);
 const expired=createMemoryLease({body:'invented-source'},{expiresAt:20,now:()=>time});time=20;assert.equal(expired.isCurrent(),false);
});
test('P1 pin changes dispose old raw; a fresh nonce can reverify without reviving the old snapshot',async t=>{
 const f=await reclaimFixture(t),a=f.create(),old=await collect(f,a,bound(f,a,'python-basic-certificate'));
 f.pins.expectedClaimOwner=actors.other.address.toLowerCase();assert.equal(f.store.getEvidence(f.aliceContext,a,old.record.target.evidenceId).current,false);
 assert.throws(()=>f.raw.read(),/BC_PRIVATE_RAW_UNAVAILABLE/);await collect(f,a,bound(f,a,'python-basic-certificate'));
 assert.equal(f.view(a).evidence[0].record.evidenceRevision,2);assert.equal(f.store.getEvidence(f.aliceContext,a,old.record.target.evidenceId).current,false);
});

function moodleComposition(f,{fixtureOnly=true,change=()=>{},reviewHook=async()=>{}}={}){
 const example=bootcampP0Example(),state={available:true,authExpiresAt:START+3000,rawExpiresAt:START+1800,queryExpiresAt:START+3000};
 const make=c=>createMoodleConsumer({criterionId:c.criterionId,fixtureOnly,resolveLease:()=>state,now:()=>f.time,
  resolvePin:r=>({environmentRef:'offline-bootcamp',runRef:'offline-run',sourceVersion:BOOTCAMP_MOODLE_SOURCE,apiVersion:'2024100715',fixtureReportHash:p0Hash('PUBLIC-OFFLINE-FIXTURE','r2-composition'),courseId:2,
    participantMapping:{participantId:r.participantId,applicationId:r.applicationId,moodleUserId:6,accountBindingRef:'synthetic-account',revision:1},
    target:{targetLogicalId:c.targetLogicalId,cmId:c.criterionId==='activity-complete'?3:c.criterionId==='assignment-submitted'?4:5,
      instanceId:c.criterionId==='activity-complete'?8:c.criterionId==='assignment-submitted'?9:10,module:c.criterionId==='activity-complete'?'page':c.criterionId==='assignment-submitted'?'assign':'forum',selectedPostId:c.criterionId==='reflection-topics'?41:null},
    completionSetupReceiptHash:c.criterionId==='activity-complete'?p0Hash('SYNTHETIC-SETUP','automatic-rule'):null}),
  offlineClientFor:r=>({execution:'OFFLINE_SYNTHETIC_FIXTURE',async call(method){
    const completion={state:1,timecompleted:START-10,overrideby:null,hascompletion:true,isautomatic:true,istrackeduser:true,uservisible:true,
      details:[{rulename:'completionview',rulevalue:{status:1,description:'View'}}]};
    const responses={core_webservice_get_site_info:{userid:6,version:'2024100715'},core_course_get_contents:[{id:0,modules:[
      {id:3,instance:8,modname:'page',completion:2,completiondata:completion},{id:4,instance:9,modname:'assign',completion:0},{id:5,instance:10,modname:'forum',completion:0}]}],
      core_completion_get_activities_completion_status:{statuses:[{...completion,cmid:3,instance:8,modname:'page',tracking:2}],warnings:[]},
      mod_assign_get_assignments:{courses:[{id:2,assignments:[{id:9,cmid:4,course:2,teamsubmission:0,timemodified:START-20}]}],warnings:[]},
      mod_assign_get_submission_status:{lastattempt:{submissionsenabled:true,submission:{id:20,userid:6,groupid:0,assignment:9,attemptnumber:0,status:'submitted',timecreated:START-20,timemodified:START-10}},warnings:[]},
      mod_forum_get_forums_by_courses:[{id:10,course:2}],mod_forum_get_forum_discussions:{discussions:[{id:41,discussion:42,userid:6}],warnings:[]},
      mod_forum_get_discussion_post:{post:{id:41,discussionid:42,author:{id:6},subject:'Synthetic reflection',message:'<p>'+example.reflection.text+'</p>',messageformat:1,
        timecreated:START-20,timemodified:START-10,capabilities:{view:true},isdeleted:false,isprivatereply:false},warnings:[]}};
    change(responses,r);return structuredClone(responses[method]);
  }}),
  observationAdapter:context=>({execution:'MOCK',modelVersion:context.modelVersion,async observe(){await reviewHook();return {topics:Object.entries(example.reflection.topicQuotes).map(([topicId,quote])=>({topicId,state:'PRESENT',evidence:{sourceId:context.sourceId,quote}}))};}}),
 });
 const consumers=Object.fromEntries(P0_POLICY.criteria.slice(0,3).map(c=>[c.criterionId,make(c)]));
 return {consumers,state,resolveSource:r=>consumers[r.criterionId]?.resolveSource(r)??null};
}
test('Moodle completion/SUBMITTED and original-body AI reflection compose through actual offline producer modules',async t=>{
 const f=await storeFixture(t),m=moodleComposition(f);f.configuration.producers=m.consumers;f.configuration.resolveSource=m.resolveSource;f.restart();const a=f.create();
 for(const c of P0_POLICY.criteria.slice(0,3))await collect(f,a,bound(f,a,c.criterionId));
 const v=f.view(a);assert.equal(v.evidence.length,3);assert.equal(v.decision.record.conditionsStatus,'UNKNOWN');
 assert.ok(v.evidence.every(e=>e.record.condition==='MET'&&e.record.dataMode==='SYNTHETIC_FIXTURE'));
 const reflection=v.evidence.find(e=>e.record.criterionId==='reflection-topics').record;assert.ok(reflection.facts.topics.every(t=>t.originalEvidenceLocator.quoteHash));
 const manifest=f.store.getDecisionEvidence(f.aliceContext,a).manifest;
 for(const row of manifest.criteria.slice(0,3)){assert.equal(row.reference.status,'RECORDED');assert.ok(row.source.sourceHash);assert.equal(row.source.acquiredAt,f.time);}
 assert.ok(manifest.criteria[2].reference.value.observationHash);assert.equal(manifest.criteria[2].checks.modelVersion.status,'UNAVAILABLE');
 assert.deepEqual(manifest.criteria[2].checks.topics.map(t=>t.state),reflection.facts.topics.map(t=>t.state));
 m.state.available=false;assert.ok(f.view(a).evidence.every(e=>!e.current));m.state.available=true;assert.ok(f.view(a).evidence.every(e=>!e.current));
});
test('Moodle/AI source expiry during review disposes raw and rejects late receipt; default mapping remains blocked',async t=>{
 const f=await storeFixture(t);let m=moodleComposition(f,{fixtureOnly:false});f.configuration.producers=m.consumers;f.configuration.resolveSource=m.resolveSource;f.restart();
 let a=f.create();assert.throws(()=>bound(f,a,'activity-complete'),/BC_SOURCE_UNKNOWN/);
 m=moodleComposition(f,{reviewHook:async()=>{m.state.available=false;}});f.configuration.producers=m.consumers;f.configuration.resolveSource=m.resolveSource;f.restart();a=f.create();
 const r=bound(f,a,'reflection-topics');await assert.rejects(collect(f,a,r),/BC_PRODUCER_FAILED|BC_REQUEST|BC_REVISION_CONFLICT/);assert.equal(f.counts().evidence,0);
});
test('Moodle wrong author and DRAFT retain producer semantics without turning absence into MET',async t=>{
 const f=await storeFixture(t),m=moodleComposition(f,{change:data=>{data.mod_assign_get_submission_status.lastattempt.submission.status='draft';data.mod_forum_get_discussion_post.post.author.id=99;}});
 f.configuration.producers=m.consumers;f.configuration.resolveSource=m.resolveSource;f.restart();const a=f.create();await collect(f,a,bound(f,a,'assignment-submitted'));
 assert.equal(f.view(a).decision.record.conditionsStatus,'NOT_MET');await assert.rejects(collect(f,a,bound(f,a,'reflection-topics')),/BC_PRODUCER_FAILED|BC_REQUEST|BC_REVISION_CONFLICT/);assert.equal(f.counts().evidence,1);
});
test('all four real producer implementations compose synthetic inputs into the same ledger ALL decision; restart loses raw authority',async t=>{
 const f=await reclaimFixture(t),m=moodleComposition(f),hr=f.newConsumer();
 let consumers={...m.consumers,'python-basic-certificate':hr};f.configuration.producers=consumers;f.configuration.resolveSource=r=>consumers[r.criterionId]?.resolveSource(r)??null;f.restart();
 const a=f.create();for(const c of P0_POLICY.criteria)await collect(f,a,bound(f,a,c.criterionId));
 const before=f.view(a);assert.equal(before.decision.record.conditionsStatus,'MET');assert.equal(before.evidence.length,4);assert.equal(before.gates.paymentAllowed,false);
 const m2=moodleComposition(f),hr2=f.newConsumer();consumers={...m2.consumers,'python-basic-certificate':hr2};f.configuration.producers=consumers;f.restart();
 const after=f.view(a);assert.equal(after.decision.record.conditionsStatus,'UNKNOWN');assert.ok(after.evidence.every(e=>!e.current));
 assert.deepEqual(after.evidence.map(e=>e.record.evidenceId).sort(),before.evidence.map(e=>e.record.evidenceId).sort());
});
for(const reason of ['close','expiry','authExpiresAt','rawExpiresAt','queryExpiresAt','revoke'])test(`retained Moodle candidate denies original body after ${reason}`,async t=>{
 const f=await storeFixture(t),m=moodleComposition(f);f.configuration.producers=m.consumers;f.configuration.resolveSource=m.resolveSource;f.restart();
 const a=f.create(),r=bound(f,a,'reflection-topics'),request=f.store.getRequest(f.aliceContext,a,r.record.target.requestId,{bridge:true}).record;
 const producer=m.consumers['reflection-topics'],candidate=await producer.verify(request,{signal:new AbortController().signal});
 assert.equal(typeof candidate.originalBody,'string');
 if(reason==='close')producer.close();else if(reason==='expiry')f.setTime(START+300);
 else if(reason==='revoke')m.state.available=false;else m.state[reason]=START;
 assert.throws(()=>candidate.originalBody,/BC_PRIVATE_RAW_UNAVAILABLE/);
 m.state.available=true;for(const key of ['authExpiresAt','rawExpiresAt','queryExpiresAt'])m.state[key]=START+4000;
 assert.throws(()=>candidate.originalBody,/BC_PRIVATE_RAW_UNAVAILABLE/);
});
for(const reason of ['logout','replacement','cancel'])test(`accepted Moodle raw owner rejects ${reason} while historical evidence stays immutable`,async t=>{
 const f=await storeFixture(t),m=moodleComposition(f);let candidate;
 const producer=m.consumers['reflection-topics'],verify=producer.verify.bind(producer);
 producer.verify=async(...args)=>{candidate=await verify(...args);return candidate;};
 f.configuration.producers=m.consumers;f.configuration.resolveSource=m.resolveSource;f.restart();
 const a=f.create(),op=await collect(f,a,bound(f,a,'reflection-topics')),before=f.store.getEvidence(f.aliceContext,a,op.record.target.evidenceId).record;
 assert.equal(typeof candidate.originalBody,'string');
 if(reason==='logout')f.service.logout(f.aliceContext);
 if(reason==='replacement')bound(f,a,'reflection-topics');
 if(reason==='cancel')f.store.cancel(f.aliceContext,a,{expectedRevision:f.view(a).revision},f.key());
 assert.throws(()=>candidate.originalBody,/BC_PRIVATE_RAW_UNAVAILABLE/);
 const context=reason==='logout'?await f.login(f.alice):f.aliceContext;
 const after=f.store.getEvidence(context,a,op.record.target.evidenceId);assert.deepEqual(after.record,before);assert.equal(after.current,false);
});
test('Moodle stops further source calls after logout during a producer await',async t=>{
 const f=await storeFixture(t);let calls=0,armed=false;
 const m=moodleComposition(f,{change:()=>{calls++;if(armed){armed=false;f.service.logout(f.aliceContext);}}});
 f.configuration.producers=m.consumers;f.configuration.resolveSource=m.resolveSource;f.restart();const a=f.create(),r=bound(f,a,'reflection-topics');armed=true;
 await assert.rejects(collect(f,a,r),/AUTH_REQUIRED|BC_PRODUCER_FAILED/);assert.equal(calls,1);assert.equal(f.counts().evidence,0);
});
