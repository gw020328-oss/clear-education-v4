import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,rm,mkdir,readFile,writeFile,chmod,symlink,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {loadE6FreeBundle} from './e6-free-plan.mjs';
import {loadE6PaidEightBundle,prepareE6PaidEightPlan,PAID_COST_ACK,PAID_EIGHT_MODEL,EXISTING_PAID_KEY_SOURCE,jsonSha} from './e6-paid-eight-plan.mjs';
import {validateE6PaidEightClearance,runE6PaidEight,withE6PaidEightStore} from './e6-paid-eight-runner.mjs';
import {createExistingPaidEightTransport,readPaidEightApproval} from './e6-paid-eight-source.mjs';
function setup(){
  const bundle=structuredClone(loadE6PaidEightBundle()),p=bundle.plan,codeState={head:'a'.repeat(40),clean:true},day='2026-10-19';
  const approval={version:'clear-e6-paid-eight-user-approval.1',scope:'E6_EXISTING_PAID_KEY_EIGHT_GENERATIONS',approvedOn:day,
    codeHead:codeState.head,planHash:p.planHash,authorization:{kind:'OFFLINE_TEST_ONLY',evidenceSha256:'b'.repeat(64)},
    maxGenerationCalls:8,maxCountCalls:0,automaticRetries:0,continuations:0,keySourceFallbacks:0,modelFallbacks:0,freeFallbacks:0,
    keySourceId:EXISTING_PAID_KEY_SOURCE,costAcknowledgment:PAID_COST_ACK,
    pricingReview:{reviewedOn:day,inputNanoUsdPerToken:'300',outputIncludingThinkingNanoUsdPerToken:'2500',
      officialSource:p.officialPricingSource,evidenceSha256:'c'.repeat(64),basis:'OFFLINE_TEST_ONLY'},
    pins:{codeHead:codeState.head,planHash:p.planHash,corpusSha256:p.corpusSha256,goldSha256:p.goldSha256,requestsSha256:p.requestsSha256}};
  let spent=false,time=0,factories=0;const snapshots=[],calls=[];
  const store={async claim(){assert.equal(spent,false,'spent');spent=true;},async checkpoint(r){snapshots.push(structuredClone(r));}};
  const response=id=>({modelVersion:PAID_EIGHT_MODEL,usageMetadata:{promptTokenCount:100,candidatesTokenCount:100,thoughtsTokenCount:0,totalTokenCount:200},
    candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({topics:bundle.gold.cases.find(c=>c.caseId===id).topics.map(t=>({
      topicId:t.topicId,state:t.state,evidence:t.quote?{sourceId:bundle.corpus.sourceId,quote:t.quote}:null}))})}]}}]});
  const transport={execution:'MOCK',async request(model,method,body){
    assert.equal(model,PAID_EIGHT_MODEL);assert.equal(method,'generateContent');assert.equal(snapshots.at(-1).status,'DISPATCH_RESERVED');
    assert.equal(snapshots.at(-1).generationCalls,calls.length+1);calls.push(time);
    const id=JSON.parse(body.contents[0].parts[0].text).caseId;assert.deepEqual(body,bundle.requests.find(r=>r.caseId===id).body);return response(id);
  }};
  const cfg={bundle,approval,codeState,day,store,transportFactory:scope=>{factories++;assert.deepEqual(scope,{keySourceId:EXISTING_PAID_KEY_SOURCE});return transport;},
    nowMs:()=>time,wait:async ms=>{time+=ms;}};
  return {cfg,transport,response,calls,snapshots,factories:()=>factories,setTime:n=>time=n};
}
async function temp(action){const d=await realpath(await mkdtemp(join(tmpdir(),'clear-paid8-offline-')));try{return await action(d);}finally{await rm(d,{recursive:true,force:true});}}
test('separate paid estimate manifest, identical safe provider bodies/corpus/gold, no verified cash cap',()=>{
  const p=loadE6PaidEightBundle(),f=loadE6FreeBundle();assert.deepEqual(p,prepareE6PaidEightPlan());
  assert.deepEqual(p.corpus,f.corpus);assert.deepEqual(p.gold,f.gold);assert.notEqual(p.plan.planHash,f.plan.planHash);
  assert.notEqual(p.plan.requestsSha256,f.plan.requestsSha256);
  p.requests.forEach((r,i)=>{assert.deepEqual(r.body,f.requests[i].body);assert.equal(r.bodySha256,f.requests[i].bodySha256);
    assert.ok(r.utf8Bytes<=8192);assert.equal('maxInputTokens' in r,false);assert.equal('temperature' in r.body.generationConfig,false);assert.equal('candidateCount' in r.body.generationConfig,false);});
  assert.equal(p.plan.cost.scenarioNanoUsd,String(24000n*300n+8192n*2500n));
  assert.equal(p.plan.cost.inputTokenCountMeasured,false);assert.equal(p.plan.cost.combinedThinkingCapVerified,false);
  assert.equal(p.plan.cost.providerHardCashCapVerified,false);assert.equal(p.plan.limits.countCalls,0);
});
test('fake8 generation/count0: checkpoint before transport, pacing, observed estimate separate from scenario',async()=>{
  const s=setup(),r=await runE6PaidEight(s.cfg);assert.equal(r.generationCalls,8);assert.equal(r.countCalls,0);assert.equal(s.calls.length,8);
  assert.deepEqual(r.aggregate,{cases:8,passed:8,needsImprovement:0,falseHolds:0});assert.equal(r.cost.knownCompletedUsageEstimateNanoUsd,'2240000');
  assert.equal(r.cost.scenarioNanoUsd,'27680000');assert.equal(r.cost.invoiceVerified,false);
  for(let i=1;i<8;i++)assert.ok(s.calls[i]-s.calls[i-1]>=60000);
  for(const forbidden of ['quote','리스트','apiKey','rawObservation','usageMetadata'])assert.equal(JSON.stringify(s.snapshots).includes(forbidden),false);
  await assert.rejects(runE6PaidEight(s.cfg),/spent/);assert.equal(s.calls.length,8);
});
test('no/boolean/old/Free/hard-cash-cap approval never reaches key source',async()=>{
  for(const change of [c=>c.approval=null,c=>c.approval={approved:true},c=>c.approval.scope='E6_PYTHON_FREE_TEXT_8_ONLY',
    c=>c.approval.version='clear-e6-python-user-approval.1',c=>c.approval.costAcknowledgment='HARD_CASH_CAP_VERIFIED',
    c=>c.approval.costAcknowledgment=null,c=>c.approval.budgetNanoUsd='50000000',c=>c.approval.aiStudioBillingTier='Free',
    c=>c.approval.keySourceId='clear-e6-python-free-only-file.1',c=>c.approval.keySourceFallbacks=1,
    c=>c.approval.modelFallbacks=1,c=>c.approval.freeFallbacks=1,c=>c.approval.maxCountCalls=1,c=>c.approval.maxGenerationCalls=9,
    c=>c.approval.automaticRetries=1,c=>c.approval.continuations=1,c=>c.approval.authorization.evidenceSha256=null,
    c=>c.approval.pricingReview=null,c=>c.approval.pricingReview.reviewedOn='2026-10-18',c=>c.approval.pricingReview.inputNanoUsdPerToken='301']){
    const s=setup();change(s.cfg);await assert.rejects(runE6PaidEight(s.cfg),/E6_PAID8_APPROVAL/);assert.equal(s.factories(),0);assert.equal(s.snapshots.length,0);
  }
});
test('template and offline evidence do not authorize ACTUAL; pure guard needs direct new paid-eight scope',async()=>{
  const s=setup(),t=JSON.parse(await readFile(new URL('./e6-paid-eight-control-template.json',import.meta.url),'utf8'));
  assert.throws(()=>validateE6PaidEightClearance({...s.cfg,execution:'ACTUAL'}),/APPROVAL/);
  await assert.rejects(runE6PaidEight({...s.cfg,approval:t.approval}),/APPROVAL/);
  s.cfg.approval.authorization.kind='DIRECT_HUMAN_NEW_PAID_EIGHT_E6';
  s.cfg.approval.pricingReview.basis='PUBLIC_PRICE_REVIEW_NOT_BILLING_AUTHENTICATION';validateE6PaidEightClearance({...s.cfg,execution:'ACTUAL'});
  assert.equal(s.factories(),0);
});
test('day/head/clean/request/gold/plan tampering blocks before key',async()=>{
  for(const change of [c=>c.codeState.clean=false,c=>c.codeState.head='d'.repeat(40),c=>c.approval.approvedOn='2026-10-18',
    c=>c.approval.pins.requestsSha256='d'.repeat(64),c=>c.bundle.plan.cost.providerHardCashCapVerified=true,
    c=>c.bundle.requests[0].body.extra='x',c=>c.bundle.corpus.cases[0].text+='x',c=>c.bundle.gold.cases[0].topics[0].state='MISSING']){
    const s=setup();change(s.cfg);await assert.rejects(runE6PaidEight(s.cfg),/E6_PAID8_(PLAN_PIN|APPROVAL)/);assert.equal(s.factories(),0);
  }
});
test('revoked approval/head/day after reservation prevents key access; pacing cancellation keeps NOT_RUN',async()=>{
  for(const kind of ['approval','head','day']){
    const s=setup();let n=0;
    if(kind==='approval')s.cfg.currentApprovalHash=()=>++n<3?jsonSha(s.cfg.approval):null;
    if(kind==='head')s.cfg.currentCodeState=()=>++n<3?s.cfg.codeState:{head:'c'.repeat(40),clean:true};
    if(kind==='day')s.cfg.currentDay=()=>++n<3?s.cfg.day:'2026-10-20';
    const r=await runE6PaidEight(s.cfg);assert.equal(r.generationCalls,1);assert.equal(s.factories(),0);assert.equal(r.attempts[0].code,'E6_PAID8_CURRENT');
  }
  const s=setup();s.cfg.wait=async()=>s.cfg.codeState.clean=false;const r=await runE6PaidEight(s.cfg);
  assert.equal(s.calls.length,1);assert.equal(r.attempts.filter(a=>a.status==='NOT_RUN').length,7);
});
test('checkpoint failures are not retried; no dispatch before durable reserve',async()=>{
  for(const at of [1,2,4]){
    const s=setup();let n=0;const save=s.cfg.store.checkpoint;s.cfg.store.checkpoint=async r=>{if(++n===at)throw Error('private IO');await save(r);};
    await assert.rejects(runE6PaidEight(s.cfg),/CHECKPOINT_FAILED/);assert.equal(n,at);assert.equal(s.calls.length,at===4?1:0);
    await assert.rejects(runE6PaidEight(s.cfg),/spent/);
  }
});
test('429/error/missing key stop once with unknown cost and remaining NOT_RUN, no fallback',async()=>{
  for(const code of ['GEMINI_RATE_LIMIT','GEMINI_KEY_MISSING','private provider response']){
    const s=setup();let calls=0;s.transport.request=async()=>{calls++;throw Error(code);};const r=await runE6PaidEight(s.cfg);
    assert.equal(calls,1);assert.equal(r.generationCalls,1);assert.equal(r.attempts.filter(a=>a.status==='NOT_RUN').length,7);
    assert.equal(r.cost.measurement,'N/A_PENDING_OR_UNKNOWN_USAGE');assert.equal(JSON.stringify(r).includes('private provider response'),false);
  }
});
test('unknown thinking usage is null/N/A and cannot be reported as zero or actual billing',async()=>{
  const s=setup();s.transport.request=async()=>{const r=s.response('PY01');delete r.usageMetadata.thoughtsTokenCount;return r;};
  const r=await runE6PaidEight(s.cfg);assert.equal(r.attempts[0].tokens.thoughtsTokenCount,null);assert.equal(r.attempts[0].code,'E6_PAID8_USAGE_UNKNOWN');
  assert.equal(r.cost.measurement,'N/A_PENDING_OR_UNKNOWN_USAGE');assert.equal(r.cost.invoiceVerified,false);
});
test('observed estimate may ALREADY exceed $0.05: stop later calls, never label it hard cap',async()=>{
  const s=setup();s.transport.request=async()=>{const r=s.response('PY01');r.usageMetadata.promptTokenCount=200000;r.usageMetadata.totalTokenCount=200100;return r;};
  const r=await runE6PaidEight(s.cfg);assert.equal(r.generationCalls,1);assert.equal(r.attempts[0].code,'E6_PAID8_OBSERVED_COST_STOP');
  assert.equal(r.cost.knownCompletedUsageEstimateNanoUsd,'60250000');assert.equal(r.cost.mode,'REQUEST_LIMITED_ESTIMATE_NOT_HARD_CASH_CAP');
  assert.equal(r.attempts[1].status,'NOT_RUN');
});
test('observed input/output over scenario, malformed output or wrong model stops',async()=>{
  for(const change of [r=>{r.usageMetadata.promptTokenCount=3001;r.usageMetadata.totalTokenCount=3101;},
    r=>{r.usageMetadata.thoughtsTokenCount=1000;r.usageMetadata.totalTokenCount=1200;},r=>r.modelVersion='other',
    r=>r.candidates[0].finishReason='MAX_TOKENS',r=>r.candidates[0].content.parts[0].text='private raw text']){
    const s=setup();s.transport.request=async()=>{const r=s.response('PY01');change(r);return r;};const r=await runE6PaidEight(s.cfg);
    assert.equal(r.status,'UNKNOWN_STOPPED');assert.equal(r.generationCalls,1);assert.equal(r.attempts[1].status,'NOT_RUN');
    assert.equal(JSON.stringify(r).includes('private raw text'),false);assert.equal(r.paymentAuthority,false);assert.equal(r.usableForAcceptance,false);
  }
});
test('timeout reserves once, ignores late result and never retries',async()=>{
  const s=setup();let finish;s.transport.request=()=>new Promise(r=>finish=r);const r=await runE6PaidEight({...s.cfg,timeoutMs:5});
  const saved=JSON.stringify(s.snapshots);finish(s.response('PY01'));await Promise.resolve();assert.equal(JSON.stringify(s.snapshots),saved);
  assert.equal(r.attempts[0].code,'E6_PAID8_TIMEOUT');assert.equal(r.generationCalls,1);
});
test('explicit existing env provider is lazy and rejects other source/model/count before reader',async()=>{
  let keyReads=0,fetches=0;const opts={readExistingKey:()=>{keyReads++;return undefined;},fetchImpl:async()=>{fetches++;}};
  const scope={keySourceId:EXISTING_PAID_KEY_SOURCE},t=createExistingPaidEightTransport(scope,opts);assert.equal(keyReads,0);
  for(const [m,method] of [[PAID_EIGHT_MODEL,'countTokens'],['other','generateContent']])await assert.rejects(t.request(m,method,{},new AbortController().signal),/KEY_SOURCE/);
  const wrong=createExistingPaidEightTransport({keySourceId:'clear-e6-python-free-only-file.1'},opts);
  await assert.rejects(wrong.request(PAID_EIGHT_MODEL,'generateContent',{},new AbortController().signal),/KEY_SOURCE/);assert.equal(keyReads,0);
  await assert.rejects(t.request(PAID_EIGHT_MODEL,'generateContent',{},new AbortController().signal),/GEMINI_KEY_MISSING/);
  assert.equal(keyReads,1);assert.equal(fetches,0);
});
test('mocked HTTPS uses injected synthetic existing-source key only in header; no real env read',async()=>{
  let reads=0;const key='offline_existing_source_only';const t=createExistingPaidEightTransport({keySourceId:EXISTING_PAID_KEY_SOURCE},
    {readExistingKey:()=>{reads++;return key;},fetchImpl:async(url,options)=>{
      assert.equal(url,`https://generativelanguage.googleapis.com/v1beta/models/${PAID_EIGHT_MODEL}:generateContent`);
      assert.equal(url.includes(key),false);assert.equal(options.headers['x-goog-api-key'],key);return new Response('{}');}});
  assert.equal(reads,0);await t.request(PAID_EIGHT_MODEL,'generateContent',{},new AbortController().signal);assert.equal(reads,1);
});
test('new approval file reader checks only temporary fake metadata and rejects permissive/symlink files',()=>temp(async d=>{
  const s=setup(),path=join(d,'approval.json');await writeFile(path,JSON.stringify(s.cfg.approval),{mode:0o600});
  assert.deepEqual(await readPaidEightApproval(d),s.cfg.approval);await chmod(path,0o644);await assert.rejects(readPaidEightApproval(d),/APPROVAL_FILE/);
  await rm(path);await writeFile(join(d,'other'),JSON.stringify(s.cfg.approval),{mode:0o600});await symlink(join(d,'other'),path);
  await assert.rejects(readPaidEightApproval(d),/APPROVAL_FILE/);
}));
test('new paid-eight journal is exclusive/single-use and mode0600',()=>temp(async d=>{
  let enter,release;const entered=new Promise(r=>enter=r),hold=new Promise(r=>release=r);
  const first=withE6PaidEightStore(d,async s=>{await s.claim({offline:true});await s.checkpoint({offline:true});enter();await hold;});await entered;
  await assert.rejects(withE6PaidEightStore(d,async()=>{}),/BUSY/);release();await first;
  await assert.rejects(withE6PaidEightStore(d,s=>s.claim({offline:true})),/SPENT/);
  for(const f of ['spent.paid-eight.v1.lock','summary.paid-eight.v1.json'])assert.equal((await stat(join(d,f))).mode&0o777,0o600);
}));
test('disk checkpoint failure preserves new spent marker; replaced lease retained',()=>temp(async d=>{
  const s=setup();await mkdir(join(d,'summary.paid-eight.v1.json'));
  await assert.rejects(withE6PaidEightStore(d,store=>runE6PaidEight({...s.cfg,store})),/CHECKPOINT_FAILED/);assert.equal(s.factories(),0);
  await assert.rejects(withE6PaidEightStore(d,store=>store.claim({offline:true})),/SPENT/);
  await assert.rejects(withE6PaidEightStore(d,async()=>{await writeFile(join(d,'execution.paid-eight.v1.lock'),JSON.stringify({token:'replacement'}));}),/LEASE_OWNERSHIP/);
}));
test('hard-kill retains new paid-eight lock and marker, with no old ledger access',()=>temp(async d=>{
  const url=new URL('./e6-paid-eight-runner.mjs',import.meta.url).href;
  const code=`import {withE6PaidEightStore} from ${JSON.stringify(url)};await withE6PaidEightStore(process.argv[1],async s=>{await s.claim({offline:true});process.send('ready');await new Promise(()=>setInterval(()=>{},1000));});`;
  const child=spawn(process.execPath,['--input-type=module','-e',code,d],{stdio:['ignore','ignore','ignore','ipc']});
  try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('offline child timeout')),5000);child.once('message',()=>{clearTimeout(timer);resolve();});child.once('error',e=>{clearTimeout(timer);reject(e);});});
    const exited=once(child,'exit');child.kill('SIGKILL');await exited;
    assert.equal(JSON.parse(await readFile(join(d,'execution.paid-eight.v1.lock'),'utf8')).version,'clear-e6-paid-eight-lease.1');
    assert.equal(JSON.parse(await readFile(join(d,'spent.paid-eight.v1.lock'),'utf8')).version,'clear-e6-paid-eight-single-run.1');
    await assert.rejects(withE6PaidEightStore(d,async()=>{}),/BUSY/);
  }finally{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}
}));
