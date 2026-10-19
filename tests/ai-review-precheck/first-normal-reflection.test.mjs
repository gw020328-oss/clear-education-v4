import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {bootcampFixture,reflectionMock} from './bootcamp-fixture.mjs';
import {E6_OPERATIONS_HASH,createE6LeasedReflectionSession} from '../../src/document-precheck/review/e6-leased-reflection.mjs';
import {NORMAL_REFLECTION_MODEL,NORMAL_REFLECTION_SCHEMA,NORMAL_REFLECTION_COST_ACK,createFixedNormalReflectionAdapter} from '../../src/document-precheck/review/fixed-normal-reflection.mjs';
import {E6_QUALITY_SCHEMA} from './e6-quality-plan.mjs';
import {prepareFirstNormalReflectionPacket,runFirstNormalReflection} from './first-normal-reflection-entry.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function fixture(options={}){
 const f=bootcampFixture(options),messageFormat=options.messageFormat??2;f.context.modelVersion=NORMAL_REFLECTION_MODEL;
 const state={context:f.context,decisionRef:null,messageFormat,operationsProfileHash:E6_OPERATIONS_HASH,rawAvailable:true,leaseExpiresAtMs:f.context.expiresAtMs};
 const packet=prepareFirstNormalReflectionPacket({context:f.context,text:f.text,decisionRef:null,messageFormat,leaseExpiresAtMs:state.leaseExpiresAtMs});
 const codeState={head:'a'.repeat(40),clean:true},day='2026-10-19';
 // Offline authorization fixture, not a real human approval or a private active file.
 const approval={version:'clear-e6-paid-wire-v3-user-approval.3',scope:'FIRST_NORMAL_REFLECTION_ONE',approvedOn:day,codeHead:codeState.head,
  planHash:packet.planHash,contextHash:packet.contextHash,authorization:{kind:'DIRECT_HUMAN_FRESH_NORMAL_ONE',evidenceSha256:'b'.repeat(64)},
  maxGenerationCalls:1,maxCountCalls:0,automaticRetries:0,continuations:0,keySourceFallbacks:0,modelFallbacks:0,freeFallbacks:0,
  keySourceId:'clear-e6-existing-server-gemini-env.1',costAcknowledgment:NORMAL_REFLECTION_COST_ACK,
  pricingReview:{reviewedOn:day,officialSource:'https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite',inputNanoUsdPerToken:'300',
  outputIncludingThinkingNanoUsdPerToken:'2500',basis:'PUBLIC_PRICE_REVIEW_NOT_BILLING_AUTHENTICATION',evidenceSha256:'c'.repeat(64)}};
 let reads=0,releases=0,fetches=0,keys=0,spent=false;const snapshots=[];
 const lease={isCurrent:()=>state.rawAvailable,async readBody(){reads++;return f.text;},release(){releases++;}};
 const store={async claim(){assert.equal(spent,false);spent=true;},async checkpoint(x){snapshots.push(structuredClone(x));}};
 const output=()=>reflectionMock(f).observe();
 const transportOptions={keyReader:()=>{keys++;return 'offline-normal-test-only';},fetchImpl:async(url,opts)=>{
  fetches++;assert.ok(snapshots.some(x=>x.status==='DISPATCH_RESERVED'));assert.equal(opts.method,'POST');assert.ok(url.endsWith('/gemini-3.5-flash-lite:generateContent'));
  return new Response(JSON.stringify({modelVersion:NORMAL_REFLECTION_MODEL,usageMetadata:{promptTokenCount:300,candidatesTokenCount:200,totalTokenCount:500,serviceTier:'standard'},
   candidates:[{finishReason:'STOP',content:{role:'model',parts:[{text:JSON.stringify(await output())}]}}]}));}};
 const args={packet,approval,codeState,day,currentCodeState:()=>codeState,currentDay:()=>day,currentApprovalHash:()=>hash(approval),
  resolveCurrent:()=>state,context:f.context,decisionRef:null,messageFormat,lease,nowMs:()=>f.clock.value,store,transportOptions};
 return {f,state,args,packet,approval,store,snapshots,lease,output,counts:()=>({reads,releases,fetches,keys})};
}
test('same schema/profile, async original lease, one simulated ACTUAL path and v1 observation with original spans',async()=>{
 const x=fixture();assert.deepEqual(NORMAL_REFLECTION_SCHEMA,E6_QUALITY_SCHEMA);
 const r=await runFirstNormalReflection(x.args);assert.equal(r.view.observation.version,'clear-bootcamp-reflection-observation.1');
 assert.equal(r.view.observation.execution,'ACTUAL');assert.equal(r.view.observation.contentStatus,'CHECKED');assert.equal(r.view.observation.verifiedEvidenceCondition,'UNKNOWN');
 assert.ok(r.view.observation.topics.every(t=>t.originalEvidenceLocator?.quoteHash));assert.deepEqual(x.counts(),{reads:1,releases:1,fetches:1,keys:1});
 assert.equal(r.report.generationCalls,1);assert.equal(r.report.countCalls,0);assert.equal(r.report.cost.status,'CONDITIONAL_BOUND');
 for(const word of ['quote"','offline-normal-test-only',x.f.text])assert.equal(JSON.stringify(x.snapshots).includes(word),false);
 x.state.rawAvailable=false;assert.equal(r.consume().current,false);r.close();assert.equal(x.counts().releases,1);
 await assert.rejects(runFirstNormalReflection(x.args),/false|spent/);assert.equal(x.counts().fetches,1);
});
test('no approval, old eight-run approval, input/policy/current mutation and fake ACTUAL adapter cannot read key or dispatch',async()=>{
 for(const change of [x=>x.args.day=undefined,x=>x.args.approval=null,x=>x.approval.scope='E6_PAID_WIRE_V3_FRESH_EIGHT',x=>x.approval.maxGenerationCalls=8,
  x=>x.approval.authorization.kind='OFFLINE_TEST_ONLY',x=>x.args.context={...x.f.context,evidenceRevision:2}]){
  const x=fixture();change(x);await assert.rejects(runFirstNormalReflection(x.args));assert.equal(x.counts().keys,0);assert.equal(x.counts().reads,0);
 }
 const x=fixture(),session=createE6LeasedReflectionSession(()=>x.state,{nowMs:()=>x.f.clock.value});
 await assert.rejects(session.review({context:x.f.context,decisionRef:null,messageFormat:2,lease:x.lease},{execution:'ACTUAL',modelVersion:NORMAL_REFLECTION_MODEL,observe:x.output}),/E6_MOCK_REQUIRED/);
 assert.equal(x.counts().reads,0);
});
test('source revoked during async getter consumes run but no model, no authority is manufactured',async()=>{
 const x=fixture();x.lease.readBody=async()=>{x.state.rawAvailable=false;return x.f.text;};const r=await runFirstNormalReflection(x.args);
 assert.equal(r.view.current,false);assert.equal(x.counts().keys,0);assert.equal(x.counts().fetches,0);assert.equal(r.report.generationCalls,0);
 await assert.rejects(runFirstNormalReflection(x.args));assert.equal(x.counts().fetches,0);
});
test('UNCERTAIN remains HOLD; unknown usage preserves valid topics without another request',async()=>{
 const x=fixture();x.args.transportOptions.fetchImpl=async()=>new Response(JSON.stringify({modelVersion:NORMAL_REFLECTION_MODEL,
  candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({topics:(await x.output()).topics.map(t=>t.topicId==='problem-solving-process'?{...t,state:'UNCERTAIN',evidence:null}:t)})}]}}]}));
 const r=await runFirstNormalReflection(x.args);assert.equal(r.report.generationCalls,1);assert.equal(r.report.cost.status,'UNKNOWN');
 assert.equal(r.view.observation.topics[1].state,'UNCERTAIN');assert.equal(r.view.observation.topics[1].originalEvidenceLocator,null);
 assert.equal(r.view.observation.contentStatus,'UNCERTAIN');assert.equal(r.view.observation.verifiedEvidenceCondition,'UNKNOWN');r.close();
});
test('pre-dispatch checkpoint failure or approval revocation prevents key access and cannot retry',async()=>{
 for(const revoked of [false,true]){
  const x=fixture();let n=0;const save=x.store.checkpoint;x.store.checkpoint=async r=>{n++;if(!revoked)throw Error('private storage');await save(r);x.args.currentApprovalHash=()=>null;};
  if(revoked)x.args.currentApprovalHash=()=>null;
  await assert.rejects(runFirstNormalReflection(x.args));assert.equal(x.counts().keys,0);assert.equal(x.counts().fetches,0);
 }
});

test('HTML remains original UTF16 and approval cannot change after reservation before key read',async()=>{
 const base=bootcampFixture(),html='<p>'+base.text+'</p>',x=fixture({text:html,messageFormat:1});
 const r=await runFirstNormalReflection(x.args);assert.equal(r.view.observation.contentStatus,'CHECKED');
 assert.equal(r.view.observation.topics[0].originalEvidenceLocator.start,3);r.close();
 const y=fixture(),save=y.store.checkpoint;y.store.checkpoint=async record=>{await save(record);y.approval.authorization.evidenceSha256='d'.repeat(64);};
 const stopped=await runFirstNormalReflection(y.args);assert.equal(stopped.report.generationCalls,0);assert.equal(y.counts().keys,0);
 assert.notEqual(stopped.view.observation?.contentStatus,'CHECKED');stopped.close();
});
test('timeout never inspects a late actual response or appends a late checkpoint',async()=>{
 const x=fixture();let finish;x.args.transportOptions.fetchImpl=()=>new Promise(r=>{finish=r;});
 const r=await runFirstNormalReflection({...x.args,timeoutMs:5});const saved=JSON.stringify(x.snapshots);
 assert.equal(r.report.generationCalls,1);assert.equal(r.view.observation.topics[0].reasonCode,'TIMED_OUT');r.close();
 finish(new Response(JSON.stringify({modelVersion:NORMAL_REFLECTION_MODEL,candidates:[{finishReason:'STOP',content:{parts:[{text:'private late response'}]}}]})));
 await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));assert.equal(JSON.stringify(x.snapshots),saved);
});

test('cancel while async source getter ignores abort returns without reading any late body or key',async()=>{
 const x=fixture(),controller=new AbortController();let finish,started;
 const ready=new Promise(r=>started=r);x.lease.readBody=()=>{started();return new Promise(r=>finish=r);};
 const pending=runFirstNormalReflection({...x.args,signal:controller.signal});await ready;controller.abort();
 const r=await pending;assert.equal(r.view.current,false);assert.equal(x.counts().keys,0);assert.equal(x.counts().fetches,0);
 assert.equal(x.counts().releases,1);finish(x.f.text);await new Promise(resolve=>setImmediate(resolve));assert.equal(x.counts().keys,0);r.close();
});
