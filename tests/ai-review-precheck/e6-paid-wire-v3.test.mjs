import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,rm,mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fixtureV3} from './e6-wire-v3-fixture.mjs';
import {runE6PaidWireV3,validateE6PaidWireV3Clearance,withE6PaidWireV3Store} from './e6-paid-wire-v3-runner.mjs';
import {loadE6PaidUsageV2Bundle} from './e6-paid-usage-v2-plan.mjs';
import {prepareE6PaidWireV3Plan,jsonSha} from './e6-paid-wire-v3-plan.mjs';
async function temp(action){const d=await realpath(await mkdtemp(join(tmpdir(),'clear-wire3-offline-')));try{return await action(d);}finally{await rm(d,{recursive:true,force:true});}}
test('fresh v3 plan pins evidence/fixture/implementation; provider requests and data unchanged; no cash cap',()=>{
 const s=fixtureV3(),old=loadE6PaidUsageV2Bundle();assert.deepEqual(s.cfg.bundle,prepareE6PaidWireV3Plan());
 assert.equal(s.cfg.bundle.plan.previousActualFetches,2);assert.equal(s.cfg.bundle.plan.resumePreviousRun,false);
 assert.notEqual(s.cfg.bundle.plan.planHash,old.plan.planHash);assert.notEqual(s.cfg.bundle.plan.usagePolicyHash,old.plan.usagePolicyHash);
 assert.equal(s.cfg.bundle.plan.cost.scenarioNanoUsd,'27680000');assert.equal(s.cfg.bundle.plan.cost.providerHardCashCapVerified,false);
 assert.deepEqual(s.cfg.bundle.corpus,old.corpus);assert.deepEqual(s.cfg.bundle.gold,old.gold);
 s.cfg.bundle.requests.forEach((r,i)=>{assert.deepEqual(r.body,old.requests[i].body);assert.equal(r.bodySha256,old.requests[i].bodySha256);});
});
test('fake8/count0 with actual REST spelling, durable reserve first, pacing, complete aggregate denominators',async()=>{
 const s=fixtureV3(),request=s.transport.request;s.transport.request=async(...args)=>{
  assert.equal(s.snapshots.at(-1).status,'DISPATCH_RESERVED');assert.equal(s.snapshots.at(-1).generationCalls,s.calls.length+1);return request(...args);};
 const r=await runE6PaidWireV3(s.cfg);assert.equal(r.status,'FINISHED');assert.equal(r.generationCalls,8);assert.equal(r.countCalls,0);
 assert.equal(r.aggregate.scorableCases,8);assert.equal(r.aggregate.scoredTopics,24);assert.equal(r.aggregate.correctTopicStates,24);
 assert.equal(r.aggregate.topicAccuracy,1);assert.equal(r.aggregate.assessedNormalControls,5);assert.equal(r.aggregate.falseHolds,0);
 assert.equal(r.aggregate.expectedPresentTopicsAssessed,21);assert.equal(r.aggregate.groundedPresentTopics,21);assert.equal(r.aggregate.notRun,0);
 assert.equal(r.cost.knownCompletedUsageEstimateNanoUsd,'3453600');assert.equal(r.cost.unknownUsageReservedCalls,0);
 for(let i=1;i<8;i++)assert.ok(s.calls[i]-s.calls[i-1]>=60000);
 for(const text of ['quote','synthetic-recitation','syntheticAux','b2ZmbGluZQ','never persist','headers','apiKey'])assert.equal(JSON.stringify(s.snapshots).includes(text),false);
 await assert.rejects(runE6PaidWireV3(s.cfg),/spent/);assert.equal(s.calls.length,8);
});
test('no/old/v2/boolean/extra-scope/count/retry/price approval blocks before source or checkpoint',async()=>{
 for(const change of [c=>c.approval=null,c=>c.approval={approved:true},c=>c.approval.version='clear-e6-paid-usage-v2-user-approval.2',
 c=>c.approval.scope='E6_PAID_USAGE_V2_FRESH_EIGHT',c=>c.approval.maxCountCalls=1,c=>c.approval.maxGenerationCalls=9,c=>c.approval.automaticRetries=1,
 c=>c.approval.continuations=1,c=>c.approval.modelFallbacks=1,c=>c.approval.keySourceFallbacks=1,c=>c.approval.freeFallbacks=1,
 c=>c.approval.costAcknowledgment='HARD_CAP',c=>c.approval.authorization.evidenceSha256=null,c=>c.approval.pricingReview=null,
 c=>c.approval.pricingReview.reviewedOn='2026-10-18',c=>c.approval.pricingReview.inputNanoUsdPerToken='301',c=>c.approval.extra=true]){
  const s=fixtureV3();change(s.cfg);await assert.rejects(runE6PaidWireV3(s.cfg),/APPROVAL/);assert.equal(s.factories(),0);assert.equal(s.snapshots.length,0);
 }
});
test('ACTUAL requires new direct evidence and same-day public review, offline template cannot authorize',async()=>{
 const s=fixtureV3();assert.throws(()=>validateE6PaidWireV3Clearance({...s.cfg,execution:'ACTUAL'}),/APPROVAL/);
 const t=JSON.parse(await readFile(new URL('./e6-paid-wire-v3-control-template.json',import.meta.url)));
 await assert.rejects(runE6PaidWireV3({...s.cfg,approval:t.approval}),/APPROVAL/);
 s.cfg.approval.authorization.kind='DIRECT_HUMAN_NEW_PAID_WIRE_V3_FRESH_EIGHT';s.cfg.approval.pricingReview.basis='PUBLIC_PRICE_REVIEW_NOT_BILLING_AUTHENTICATION';
 validateE6PaidWireV3Clearance({...s.cfg,execution:'ACTUAL'});assert.equal(s.factories(),0);
});
test('head/day/clean/request/gold/policy/evidence plan mutation blocks before dispatch',async()=>{
 for(const change of [c=>c.codeState.head='d'.repeat(40),c=>c.codeState.clean=false,c=>c.approval.approvedOn='2026-10-18',
 c=>c.approval.pins.usagePolicyHash='0x'+'d'.repeat(64),c=>c.bundle.plan.usagePolicy.evidenceSha256='d'.repeat(64),
 c=>c.bundle.requests[0].body.tools=[],c=>c.bundle.gold.cases[0].topics[0].state='MISSING',c=>c.bundle.corpus.cases[0].text+='x']){
  const s=fixtureV3();change(s.cfg);await assert.rejects(runE6PaidWireV3(s.cfg),/APPROVAL|PLAN_PIN/);assert.equal(s.factories(),0);
 }
});
test('approval/head/day change after reserve blocks before source; cancellation during pacing leaves seven NOT_RUN',async()=>{
 for(const kind of ['approval','head','day']){
  const s=fixtureV3();let n=0;if(kind==='approval')s.cfg.currentApprovalHash=()=>++n<3?jsonSha(s.cfg.approval):null;
  if(kind==='head')s.cfg.currentCodeState=()=>++n<3?s.cfg.codeState:{head:'d'.repeat(40),clean:true};
  if(kind==='day')s.cfg.currentDay=()=>++n<3?s.cfg.day:'2026-10-20';
  const r=await runE6PaidWireV3(s.cfg);assert.equal(r.generationCalls,1);assert.equal(s.factories(),0);assert.equal(r.aggregate.scorableCases,0);
 }
 const s=fixtureV3();s.cfg.wait=async()=>s.cfg.codeState.clean=false;const r=await runE6PaidWireV3(s.cfg);
 assert.equal(s.calls.length,1);assert.equal(r.aggregate.notRun,7);assert.equal(r.aggregate.scorableCases,1);
});
test('durable checkpoint failure stops without retry and leaves run spent',async()=>{
 for(const at of [1,2,4]){
  const s=fixtureV3();let n=0;const save=s.cfg.store.checkpoint;s.cfg.store.checkpoint=async r=>{if(++n===at)throw Error('private IO');await save(r);};
  await assert.rejects(runE6PaidWireV3(s.cfg),/CHECKPOINT_FAILED/);assert.equal(n,at);assert.equal(s.calls.length,at===4?1:0);
  await assert.rejects(runE6PaidWireV3(s.cfg),/spent/);
 }
});
test('429/transport/missing key are one reservation with unknown cost and no fabricated quality',async()=>{
 for(const code of ['GEMINI_RATE_LIMIT','GEMINI_KEY_MISSING','private provider error']){
  const s=fixtureV3();let calls=0;s.transport.request=async()=>{calls++;throw Error(code);};const r=await runE6PaidWireV3(s.cfg);
  assert.equal(calls,1);assert.equal(r.generationCalls,1);assert.equal(r.aggregate.scorableCases,0);assert.equal(r.aggregate.falseHolds,null);
  assert.equal(r.cost.unknownUsageReservedCalls,1);assert.equal(r.cost.measurement,'N/A_PENDING_OR_UNKNOWN_USAGE');assert.equal(JSON.stringify(r).includes('private provider error'),false);
 }
});
test('timeout ignores late response, no retry and no later mutation',async()=>{
 const s=fixtureV3();let finish;s.transport.request=()=>new Promise(r=>finish=r);const r=await runE6PaidWireV3({...s.cfg,timeoutMs:5});
 const saved=JSON.stringify(s.snapshots);finish(s.response());await Promise.resolve();assert.equal(JSON.stringify(s.snapshots),saved);
 assert.equal(r.generationCalls,1);assert.equal(r.aggregate.scorableCases,0);assert.equal(r.attempts[0].code,'E6_WV3_TIMEOUT');
});
test('usage failure after a paid response retains partial quality, stops all later dispatch, N/A cost remains explicit',async()=>{
 for(const change of [r=>delete r.usageMetadata.totalTokenCount,r=>r.usageMetadata.serviceTier='priority',
 r=>r.usageMetadata.serviceTier='private unknown tier',r=>r.usageMetadata.cachedContentTokenCount=1,r=>r.candidates[0].groundingMetadata={webSearchQueries:['x']}]){
  const s=fixtureV3();let calls=0;s.transport.request=async()=>{calls++;const r=s.response();change(r);return r;};const r=await runE6PaidWireV3(s.cfg);
  assert.equal(calls,1);assert.equal(r.status,'PARTIAL_STOPPED');assert.equal(r.attempts[0].quality.status,'PASS');
  assert.equal(r.aggregate.scorableCases,1);assert.equal(r.aggregate.scoredTopics,3);assert.equal(r.aggregate.topicAccuracy,1);
  assert.equal(r.aggregate.notRun,7);assert.equal(r.cost.measurement,'N/A_PENDING_OR_UNKNOWN_USAGE');assert.equal(r.cost.unknownUsageReservedCalls,1);
  assert.equal(JSON.stringify(r).includes('private unknown tier'),false);assert.equal(r.attempts[1].dispatchReserved,false);
 }
});
test('known usage with bad JSON/truncated text stops with cost estimate and no invented score',async()=>{
 for(const change of [r=>r.candidates[0].content.parts[0].text='private malformed text',r=>r.candidates[0].finishReason='MAX_TOKENS']){
  const s=fixtureV3();s.transport.request=async()=>{const r=s.response();change(r);return r;};const r=await runE6PaidWireV3(s.cfg);
  assert.equal(r.status,'PARTIAL_STOPPED');assert.equal(r.aggregate.scorableCases,0);assert.equal(r.aggregate.topicAccuracy,null);
  assert.equal(r.cost.knownCompletedUsageEstimateNanoUsd,'431700');assert.equal(r.cost.unknownUsageReservedCalls,0);
  assert.equal(JSON.stringify(r).includes('private malformed text'),false);
 }
});
test('post-response cost/input/generated stops retain valid current quality and cannot enforce in-flight cash cap',async()=>{
 for(const [p,c,code] of [[200000,135,'COST_STOP'],[3001,135,'INPUT_STOP'],[314,1025,'OUTPUT']]){
  const s=fixtureV3();s.transport.request=async()=>{const r=s.response();r.usageMetadata={promptTokenCount:p,candidatesTokenCount:c,totalTokenCount:p+c,serviceTier:'standard'};return r;};
  const r=await runE6PaidWireV3(s.cfg);assert.equal(r.generationCalls,1);assert.equal(r.status,'PARTIAL_STOPPED');assert.equal(r.aggregate.scorableCases,1);
  assert.ok(r.attempts[0].stopCode.endsWith(code));assert.equal(r.cost.providerHardCashCapVerified,false);assert.equal(r.cost.invoiceVerified,false);
 }
});
test('new paid-eight journal is exclusive/single-use and mode0600',()=>temp(async d=>{
  let enter,release;const entered=new Promise(r=>enter=r),hold=new Promise(r=>release=r);
  const first=withE6PaidWireV3Store(d,async s=>{await s.claim({offline:true});await s.checkpoint({offline:true});enter();await hold;});await entered;
  await assert.rejects(withE6PaidWireV3Store(d,async()=>{}),/BUSY/);release();await first;
  await assert.rejects(withE6PaidWireV3Store(d,s=>s.claim({offline:true})),/SPENT/);
  for(const f of ['spent.paid-wire.v3.lock','summary.paid-wire.v3.json'])assert.equal((await stat(join(d,f))).mode&0o777,0o600);
}));
test('disk checkpoint failure preserves new spent marker; replaced lease retained',()=>temp(async d=>{
  const s=fixtureV3();await mkdir(join(d,'summary.paid-wire.v3.json'));
  await assert.rejects(withE6PaidWireV3Store(d,store=>runE6PaidWireV3({...s.cfg,store})),/CHECKPOINT_FAILED/);assert.equal(s.factories(),0);
  await assert.rejects(withE6PaidWireV3Store(d,store=>store.claim({offline:true})),/SPENT/);
  await assert.rejects(withE6PaidWireV3Store(d,async()=>{await writeFile(join(d,'execution.paid-wire.v3.lock'),JSON.stringify({token:'replacement'}));}),/LEASE_OWNERSHIP/);
}));
test('hard-kill retains new paid-eight lock and marker, with no old ledger access',()=>temp(async d=>{
  const url=new URL('./e6-paid-wire-v3-runner.mjs',import.meta.url).href;
  const code=`import {withE6PaidWireV3Store} from ${JSON.stringify(url)};await withE6PaidWireV3Store(process.argv[1],async s=>{await s.claim({offline:true});process.send('ready');await new Promise(()=>setInterval(()=>{},1000));});`;
  const child=spawn(process.execPath,['--input-type=module','-e',code,d],{stdio:['ignore','ignore','ignore','ipc']});
  try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('offline child timeout')),5000);child.once('message',()=>{clearTimeout(timer);resolve();});child.once('error',e=>{clearTimeout(timer);reject(e);});});
    const exited=once(child,'exit');child.kill('SIGKILL');await exited;
    assert.equal(JSON.parse(await readFile(join(d,'execution.paid-wire.v3.lock'),'utf8')).version,'clear-e6-paid-wire-v3-lease.3');
    assert.equal(JSON.parse(await readFile(join(d,'spent.paid-wire.v3.lock'),'utf8')).version,'clear-e6-paid-wire-v3-single-run.3');
    await assert.rejects(withE6PaidWireV3Store(d,async()=>{}),/BUSY/);
  }finally{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}
}));


test('later unknown usage retains prior known subset and both partial scores with explicit denominators',async()=>{
 const s=fixtureV3(),request=s.transport.request;s.transport.request=async(...args)=>{const r=await request(...args);
  if(s.calls.length===2)delete r.usageMetadata.totalTokenCount;return r;};
 const r=await runE6PaidWireV3(s.cfg);assert.equal(r.generationCalls,2);assert.equal(r.status,'PARTIAL_STOPPED');
 assert.equal(r.aggregate.scorableCases,2);assert.equal(r.aggregate.scoredTopics,6);assert.equal(r.aggregate.notRun,6);
 assert.equal(r.cost.knownCompletedUsageEstimateNanoUsd,'431700');assert.equal(r.cost.unknownUsageReservedCalls,1);
 assert.equal(r.cost.measurement,'N/A_PENDING_OR_UNKNOWN_USAGE');assert.equal(r.cost.invoiceVerified,false);
});
