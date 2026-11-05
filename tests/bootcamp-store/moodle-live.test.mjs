import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveMoodleConsumer} from '../../src/bootcamp/moodle-live-consumer.mjs';
import {createBootcampStore} from '../../src/bootcamp/store.mjs';
import {createNormalUiSession} from '../../src/bootcamp/ui-session.mjs';
import {storeFixture,START} from './fixture.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
async function fixture(t,{afterRead=()=>{},configure=()=>{}}={}){
 const f=await storeFixture(t,{store:{mode:'ISOLATED_LIVE_TEST',producers:{},resolveSource:()=>null}}),state={available:true,authExpiresAt:START+240,rawExpiresAt:START+240,queryExpiresAt:START+240};let calls=0;
 const pin=r=>({environmentRef:'test-owned-moodle',runRef:'test-run',sourceVersion:'moodle-4.5.15-215f4438',apiVersion:'2024100715',fixtureReportHash:p0Hash('TEST','report'),courseId:2,participantMapping:{participantId:r.participantId,applicationId:r.applicationId,moodleUserId:3,accountBindingRef:'test-user3',revision:1},target:{targetLogicalId:'python-intro-activity',cmId:3,instanceId:1,module:'page',selectedPostId:null},completionSetupReceiptHash:p0Hash('TEST','setup')});
 // Explicit fake network used only to test the dedicated consumer and CAS.
 const withReader=async fn=>fn({async call(method){calls++;const completion={state:1,timecompleted:START-1,overrideby:null,hascompletion:true,isautomatic:true,istrackeduser:true,uservisible:true,details:[{rulename:'completionview',rulevalue:{status:1}}]};
  const result={core_webservice_get_site_info:{userid:3,version:'2024100715'},core_course_get_contents:[{id:0,modules:[{id:3,instance:1,modname:'page',completion:2,completiondata:completion}]}],core_completion_get_activities_completion_status:{statuses:[{...completion,cmid:3,instance:1,modname:'page',tracking:2}],warnings:[]}}[method];await afterRead(state,calls);return structuredClone(result);}});
 const consumer=createLiveMoodleConsumer({criterionId:'activity-complete',withReader,resolvePin:pin,resolveLease:()=>state,now:()=>f.time});
 f.configuration.producers={'activity-complete':consumer};f.configuration.resolveSource=consumer.resolveSource;await configure(f);f.restart();
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

test('activity return queues one fresh Moodle read and records only the pinned page evidence',async t=>{
 const {createNormalActivityReturn}=await import('../../tools/bootcamp/normal-activity-return.mjs');
 const {commandFixture}=await import('./moodle-command-fixture.mjs');
 const f=await fixture(t),controller=new AbortController();
 const commands=await commandFixture({authentication:f.service,
  contexts:{PARTICIPANT:f.aliceContext,COURSE_OPERATOR:f.operatorContext}});
 const ui=createNormalUiSession({authentication:f.service,participantWallet:f.aliceContext.wallet.toLowerCase(),
  operatorWallet:f.operatorContext.wallet.toLowerCase(),getApplication:(context,id)=>f.store.getApplication(context,id),
  now:()=>f.time,commandScope:commands.scope});
 ui.bindParticipant(f.aliceContext,f.app,{dataMode:'RECLAIM_SIGNED_RECORD'});
 t.after(()=>{controller.abort();commands.owner.close();ui.close();});
 const refresh=createNormalActivityReturn({store:f.store,
  mapping:{courseId:2,targets:{activity:{cmId:3,module:'page'}}},origin:'https://127.0.0.1:9477',
  startedAt:START,now:()=>f.time,signal:controller.signal,sourceWindows:new Map(),
  commandScope:commands.scope,authorize:(context,write)=>{
   const actor=f.service.authorizeWorkflow(context,write);commands.scope.assertContext(context);return actor;
  },getBinding:()=>({app:f.app,user:f.aliceContext}),validateParticipant:()=>ui.participant(),key:f.key});
 const before=f.view(f.app);
 const body={criterionId:'activity-complete',expectedRevision:before.revision};
 const post=async(role,key,data=body)=>{
  const input=await commands.grant({method:'POST',path:'/bootcamp/v4/applications/'+f.app+'/source-refresh',body:data,idempotencyKey:key},role);
  return commands.scope.run(input,()=>refresh.queue(input.context,f.app,data,key));
 };
 assert.equal(refresh.targets(f.operatorContext,f.app),null);
 assert.deepEqual(refresh.targets(f.aliceContext,f.app).targets.map(x=>x.cmId),[3]);
 assert.equal(f.view(f.app).evidence.length,0);
 assert.equal(f.calls,0);
 await assert.rejects(post('COURSE_OPERATOR','operator'),/FORBIDDEN/);
 await assert.rejects(post('PARTICIPANT','wrong-source',{...body,criterionId:'reflection-topics'}),/BC_ACTIVITY_BODY/);
 assert.equal(f.calls,0);
 const queued=await post('PARTICIPANT','activity');
 assert.equal(queued.status,'QUEUED');
 commands.advance(6); // Consumed HTTP grant expired; original intent is still connected.
 await new Promise(r=>setImmediate(r));
 const after=f.view(f.app);
 assert.equal(after.evidence.length,1);
 assert.equal(after.evidence[0].current,true);
 assert.equal(after.evidence[0].record.condition,'MET');
 assert.equal(after.evidence[0].record.criterionId,'activity-complete');
 assert.equal(after.decision.record.conditionsStatus,'UNKNOWN');
 assert.notEqual(after.decision.record.decisionId,before.decision.record.decisionId);
 const calls=f.calls;
 await assert.rejects(post('PARTICIPANT','activity'),/MOODLE_COMMAND_UNAVAILABLE/);
 await assert.rejects(post('PARTICIPANT','stale-revision'),/BC_REVISION_CONFLICT/);
 assert.equal(f.calls,calls);
});

test('activity return blocks a job after the original Moodle intent ends',async t=>{
 const {createNormalActivityReturn}=await import('../../tools/bootcamp/normal-activity-return.mjs');
 const {commandFixture}=await import('./moodle-command-fixture.mjs');
 const f=await fixture(t),controller=new AbortController();
 const commands=await commandFixture({authentication:f.service,
  contexts:{PARTICIPANT:f.aliceContext,COURSE_OPERATOR:f.operatorContext}});
 t.after(()=>{controller.abort();commands.owner.close();});
 const refresh=createNormalActivityReturn({store:f.store,
  mapping:{courseId:2,targets:{activity:{cmId:3,module:'page'}}},origin:'https://127.0.0.1:9477',
  startedAt:START,now:()=>f.time,signal:controller.signal,sourceWindows:new Map(),
  commandScope:commands.scope,authorize:(context,write)=>{
   const actor=f.service.authorizeWorkflow(context,write);commands.scope.assertContext(context);return actor;
  },getBinding:()=>({app:f.app,user:f.aliceContext}),key:f.key});
 const before=f.view(f.app);
 const body={criterionId:'activity-complete',expectedRevision:before.revision};
 const post=async(role,key,data=body)=>{
  const input=await commands.grant({method:'POST',path:'/bootcamp/v4/applications/'+f.app+'/source-refresh',body:data,idempotencyKey:key},role);
  return commands.scope.run(input,()=>refresh.queue(input.context,f.app,data,key));
 };
 assert.equal(refresh.targets(f.operatorContext,f.app),null);
 assert.deepEqual(refresh.targets(f.aliceContext,f.app).targets.map(x=>x.cmId),[3]);
 assert.equal(f.view(f.app).evidence.length,0);
 assert.equal(f.calls,0);
 await assert.rejects(post('COURSE_OPERATOR','operator'),/FORBIDDEN/);
 await assert.rejects(post('PARTICIPANT','wrong-source',{...body,criterionId:'reflection-topics'}),/BC_ACTIVITY_BODY/);
 assert.equal(f.calls,0);
 const queued=await post('PARTICIPANT','activity');
 assert.equal(queued.status,'QUEUED');
 const ended=await commands.end('PARTICIPANT');
 await assert.rejects(post('PARTICIPANT','after-ended'),/MOODLE_COMMAND_UNAVAILABLE/);
 assert.equal(f.service.authorizeWorkflow(f.aliceContext,true).role,'participant');
 await new Promise(r=>setImmediate(r));
 assert.equal(ended.status,'UNAVAILABLE');
 assert.equal(f.calls,0);
 assert.equal(f.counts().requests,0);
 assert.equal(f.counts().evidence,0,'ending original Moodle authority must block queued evidence acceptance');
});

for (const stage of ['source-read','final-acceptance']) test('activity return loses original intent during '+stage,async t=>{
 const {createNormalActivityReturn}=await import('../../tools/bootcamp/normal-activity-return.mjs');
 const {commandFixture}=await import('./moodle-command-fixture.mjs');
 let commands,ended=false;
 const f=await fixture(t,{afterRead:async(_,calls)=>{
  if(stage==='source-read'&&calls===2){await commands.end('PARTICIPANT');ended=true;}
 },configure:async f=>{
  commands=await commandFixture({authentication:f.service,
   contexts:{PARTICIPANT:f.aliceContext,COURSE_OPERATOR:f.operatorContext}});
  // Production authentication/scope wiring, including the final DB fence.
  f.configuration.commandScope=commands.scope;
  f.configuration.authentication={...f.service,authorizeWorkflow(c,w){
   const actor=f.service.authorizeWorkflow(c,w);commands.scope.assertContext(c);return actor;
  }};
  f.configuration.fault=point=>{
   if(stage==='final-acceptance'&&point==='after-evidence'){commands.owner.close();ended=true;}
  };
 }}),controller=new AbortController();
 t.after(()=>{controller.abort();commands.owner.close();});
 let finish;
 const failed=new Promise(resolve=>{finish=resolve;});
 const refresh=createNormalActivityReturn({store:f.store,
  mapping:{courseId:2,targets:{activity:{cmId:3,module:'page'}}},origin:'https://127.0.0.1:9477',
  startedAt:START,now:()=>f.time,signal:controller.signal,sourceWindows:new Map(),
  commandScope:commands.scope,authorize:f.configuration.authentication.authorizeWorkflow,
  getBinding:()=>({app:f.app,user:f.aliceContext}),key:f.key,observeFailure:finish});
 const body={criterionId:'activity-complete',expectedRevision:f.view(f.app).revision};
 const input=await commands.grant({method:'POST',path:'/bootcamp/v4/applications/'+f.app+'/source-refresh',body,idempotencyKey:'ended-activity'});
 assert.equal((await commands.scope.run(input,()=>refresh.queue(input.context,f.app,body,'ended-activity'))).status,'QUEUED');
 await failed;
 assert.equal(ended,true);
 assert.equal(f.counts().evidence,0);
 assert.equal(f.view(f.app).evidence.length,0);
 assert.equal(f.counts().requests,1);
 const {DatabaseSync}=await import('node:sqlite'),{join}=await import('node:path');
 const db=new DatabaseSync(join(f.directory,'bootcamp.sqlite'),{readOnly:true});
 try{assert.equal(db.prepare('SELECT status FROM requests').get().status,'PENDING');}finally{db.close();}
 if(stage==='source-read')assert.equal(f.calls,2);
 else assert.ok(f.calls>=15);
});
