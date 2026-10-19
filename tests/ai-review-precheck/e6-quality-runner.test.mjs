import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,stat,realpath,chmod,symlink,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {loadE6RunnerBundle,validateE6Clearance,runE6Quality,withE6RunStore,E6_METHOD_SCOPE} from './e6-quality-runner.mjs';

function setup(){
  const bundle=loadE6RunnerBundle(),codeState={head:'a'.repeat(40),clean:true},day='2026-10-19',p=bundle.plan;
  const approval={version:'clear-e6-python-user-approval.1',explicitNewApproval:true,scope:'E6_PYTHON_TEXT_ONLY',
    existingSecureKeyConfigurationConfirmed:true,approvedOn:day,planHash:p.planHash,codeHead:codeState.head,
    authorizationEvidenceSha256:'b'.repeat(64),maxCountCalls:8,maxGenerationCalls:8,automaticRetries:0,
    continuations:0,budgetNanoUsd:'50000000',pins:{codeHead:codeState.head,planHash:p.planHash,
      corpusSha256:p.corpusSha256,goldSha256:p.goldSha256,requestsSha256:p.requestsSha256}};
  const verification={version:'clear-e6-python-cost-verification.1',reviewedOn:day,planHash:p.planHash,codeHead:codeState.head,
    scope:E6_METHOD_SCOPE,service:'PAID_STANDARD',countTokensBilling:'VERIFIED_UPPER_BOUND',
    combinedOutputThinkingCap:'VERIFIED_1024',inputNanoUsdPerToken:'300',outputIncludingThinkingNanoUsdPerToken:'2500',
    countTokensMaxNanoUsdPerCall:'900000',evidenceSha256:'c'.repeat(64),evidenceKind:'OFFLINE_TEST_ONLY'};
  let spent=false,calls=0,factories=0;const checkpoints=[];
  const store={async claim(){assert.equal(spent,false,'one-shot');spent=true;},async checkpoint(r){checkpoints.push(structuredClone(r));}};
  const makeResponse=caseId=>{
    const g=bundle.gold.cases.find(g=>g.caseId===caseId);
    return {modelVersion:p.model,candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({topics:g.topics.map(t=>({
      topicId:t.topicId,state:t.state,evidence:t.quote?{sourceId:bundle.corpus.sourceId,quote:t.quote}:null}))})}]}}],
    usageMetadata:{promptTokenCount:100,candidatesTokenCount:100,thoughtsTokenCount:0,totalTokenCount:200}};
  };
  const transport={execution:'MOCK',async request(model,method,body){
    calls++;const r=checkpoints.at(-1);assert.equal(r.status,'DISPATCH_RESERVED');
    assert.ok(r.countCalls+r.generationCalls>=calls);assert.ok(BigInt(r.reservedNanoUsd)>0n);
    assert.equal(model,p.model);
    const wire=method==='countTokens'?body.generateContentRequest:body;
    const id=JSON.parse(wire.contents[0].parts[0].text).caseId,expected=bundle.requests.find(r=>r.caseId===id);
    assert.deepEqual(body,method==='countTokens'?expected.countTokensBody:expected.body);
    if(method==='countTokens')return {totalTokens:100};
    const caseId=JSON.parse(body.contents[0].parts[0].text).caseId;
    return makeResponse(caseId);
  }};
  const cfg={bundle,approval,verification,codeState,day,store,transportFactory:()=>{factories++;return transport;}};
  return {cfg,checkpoints,transport,makeResponse,counters:()=>({calls,factories})};
}

test('fake-only 8 cases / 16 requests checkpoint first, exact wire, raw-free aggregates',async()=>{
  const s=setup(),r=await runE6Quality(s.cfg);
  assert.deepEqual([r.countCalls,r.generationCalls,r.reservedNanoUsd],[8,8,'34880000']);
  assert.deepEqual(r.aggregate,{cases:8,passed:8,needsImprovement:0,normalControls:5,falseHolds:0});
  assert.equal(s.counters().calls,16);assert.equal(r.execution,'MOCK');
  assert.equal(r.usableForAcceptance,false);assert.equal(r.paymentAuthority,false);
  const serialized=JSON.stringify(s.checkpoints);
  for(const forbidden of ['quote','목록','리스트','usageMetadata','rawObservation','generationConfig','authorizationEvidenceSha256'])
    assert.equal(serialized.includes(forbidden),false,forbidden);
  await assert.rejects(runE6Quality(s.cfg),/one-shot/);assert.equal(s.counters().calls,16);
});

test('absent/new-scope/old approval and dirty or different HEAD block before store/factory',async()=>{
  for(const mutate of [c=>c.approval=null,c=>c.approval.scope='GENERAL_REVIEW_TEXT_IMAGE',
    c=>c.approval.approvedOn='2026-10-16',c=>c.approval.explicitNewApproval=false,
    c=>c.codeState.clean=false,c=>c.codeState.head='d'.repeat(40),c=>c.approval.continuations=1]){
    const s=setup();mutate(s.cfg);await assert.rejects(runE6Quality(s.cfg),/E6_CLEARANCE/);
    assert.deepEqual(s.counters(),{calls:0,factories:0});assert.equal(s.checkpoints.length,0);
  }
});

test('missing or provisional billing, combined cap, rate and evidence all block without transport',async()=>{
  for(const mutate of [c=>c.verification=null,c=>c.verification.countTokensBilling='PROVISIONAL_ALLOWANCE',
    c=>c.verification.combinedOutputThinkingCap='INFERRED_FROM_INTERACTIONS',c=>c.verification.inputNanoUsdPerToken='301',
    c=>c.verification.evidenceSha256=null,c=>c.verification.scope='interactions',
    c=>c.verification.countTokensMaxNanoUsdPerCall=null]){
    const s=setup();mutate(s.cfg);await assert.rejects(runE6Quality(s.cfg),/E6_BILLING_UNKNOWN/);
    assert.equal(s.counters().factories,0);
  }
  const s=setup();s.cfg.verification.countTokensMaxNanoUsdPerCall='3000000';
  await assert.rejects(runE6Quality(s.cfg),/E6_BUDGET/);assert.equal(s.counters().calls,0);
});

test('ACTUAL clearance rejects offline attestations; pure guard never reads a key',()=>{
  const s=setup();assert.throws(()=>validateE6Clearance({...s.cfg,execution:'ACTUAL'}),/E6_BILLING_UNKNOWN/);
  s.cfg.verification.evidenceKind='PRIMARY_ENDPOINT_SPECIFIC';
  assert.equal(validateE6Clearance({...s.cfg,execution:'ACTUAL'}).perGeneration,3460000n);
  assert.deepEqual(s.counters(),{calls:0,factories:0});
});

test('any corpus/gold/request/plan mutation refuses exact pins before factory',async()=>{
  for(const mutate of [c=>c.bundle.corpus.cases[0].text+='changed',c=>c.bundle.gold.cases[0].topics[0].state='MISSING',
    c=>c.bundle.requests[0].body.generationConfig.maxOutputTokens=2048,c=>c.bundle.plan.hardBudgetNanoUsd='90000000',
    c=>c.approval.pins.goldSha256='e'.repeat(64)]){
    const s=setup();mutate(s.cfg);await assert.rejects(runE6Quality(s.cfg),/E6_(PLAN_PIN|CLEARANCE)/);
    assert.equal(s.counters().factories,0);
  }
});

test('failed pre-dispatch checkpoint prevents transport and is never retried',async()=>{
  const s=setup();let writes=0;
  s.cfg.store.checkpoint=async()=>{writes++;if(writes===2)throw Error('E6_CHECKPOINT_FAILED');};
  await assert.rejects(runE6Quality(s.cfg),/E6_CHECKPOINT_FAILED/);
  assert.equal(writes,2);assert.equal(s.counters().factories,0);
});

test('failed generation checkpoint consumes reservation but sends no generation',async()=>{
  const s=setup();let writes=0;const save=s.cfg.store.checkpoint;
  s.cfg.store.checkpoint=async r=>{writes++;if(writes===3)throw Error('simulated IO failure');await save(r);};
  await assert.rejects(runE6Quality(s.cfg),/E6_CHECKPOINT_FAILED/);
  assert.equal(writes,3);assert.equal(s.counters().calls,1);
  await assert.rejects(runE6Quality(s.cfg),/one-shot/);assert.equal(s.counters().calls,1);
});

test('count failure or excessive count retains reservation, stops, refuses retry',async()=>{
  for(const mode of ['error','over']){
    const s=setup();let calls=0;s.transport.request=async()=>{calls++;if(mode==='error')throw Error('private provider body');return {totalTokens:3001};};
    const r=await runE6Quality(s.cfg);
    assert.deepEqual([calls,r.countCalls,r.generationCalls,r.reservedNanoUsd],[1,1,0,'900000']);
    assert.equal(r.status,'UNKNOWN_STOPPED');assert.equal(JSON.stringify(r).includes('private'),false);
    await assert.rejects(runE6Quality(s.cfg),/one-shot/);assert.equal(calls,1);
  }
});

test('generation failure retains both reserves and exposes only fixed error code',async()=>{
  const s=setup();let calls=0;
  s.transport.request=async(_m,method)=>{calls++;if(method==='countTokens')return {totalTokens:100};throw Error('secret response/body');};
  const r=await runE6Quality(s.cfg);
  assert.deepEqual([calls,r.countCalls,r.generationCalls,r.reservedNanoUsd],[2,1,1,'4360000']);
  assert.equal(r.attempts[0].code,'E6_REQUEST_UNKNOWN');assert.equal(JSON.stringify(r).includes('secret'),false);
});

test('timeout stops once even if fake transport ignores abort',async()=>{
  const s=setup();let calls=0;s.transport.request=async()=>{calls++;return new Promise(()=>{});};
  const r=await runE6Quality({...s.cfg,timeoutMs:5});
  assert.equal(calls,1);assert.equal(r.attempts[0].code,'E6_TIMEOUT');assert.equal(r.reservedNanoUsd,'900000');
});

test('HEAD/day changes after checkpoint prevent even the first key/transport access',async()=>{
  for(const kind of ['head','day']){
    const s=setup();let checks=0;
    if(kind==='head')s.cfg.currentCodeState=()=>++checks<3?s.cfg.codeState:{head:'e'.repeat(40),clean:true};
    else s.cfg.currentDay=()=>++checks<3?s.cfg.day:'2026-10-20';
    const r=await runE6Quality(s.cfg);
    assert.equal(r.attempts[0].code,'E6_CODE_PIN');assert.equal(r.reservedNanoUsd,'900000');
    assert.equal(s.counters().factories,0);
  }
});

test('unknown/missing usage, combined cap excess, incomplete/schema/model failures never continue',async()=>{
  for(const mutate of [r=>delete r.usageMetadata.thoughtsTokenCount,r=>r.usageMetadata.candidatesTokenCount=1025,
    r=>r.candidates[0].finishReason='MAX_TOKENS',r=>r.candidates[0].content.parts[0].text='private-not-json',
    r=>r.modelVersion='different-model']){
    const s=setup();let calls=0;s.transport.request=async(_m,method)=>{
      calls++;if(method==='countTokens')return {totalTokens:100};const r=s.makeResponse('PY01');mutate(r);return r;};
    const r=await runE6Quality(s.cfg);assert.equal(calls,2);assert.equal(r.status,'UNKNOWN_STOPPED');
    assert.equal(r.reservedNanoUsd,'4360000');assert.equal(JSON.stringify(r).includes('private-not-json'),false);
  }
});

test('quality false holds counted separately; provider response never grants authority',async()=>{
  const s=setup(),original=s.transport.request;
  s.transport.request=async(...args)=>{const r=await original(...args);if(args[1]==='generateContent'){
    const raw=JSON.parse(r.candidates[0].content.parts[0].text);raw.topics[0]={topicId:'work-performed',state:'MISSING',evidence:null};
    r.candidates[0].content.parts[0].text=JSON.stringify(raw);
  }return r;};
  const r=await runE6Quality(s.cfg);assert.equal(r.aggregate.falseHolds,5);assert.equal(r.aggregate.needsImprovement,8);
  assert.equal(r.paymentAuthority,false);
});

async function temp(action){const d=await realpath(await mkdtemp(join(tmpdir(),'clear-e6-offline-')));try{return await action(d);}finally{await rm(d,{recursive:true,force:true});}}
test('disk lease excludes concurrent invocations and one-shot persists after completion',()=>temp(async d=>{
  let release;const gate=new Promise(r=>release=r);let entered;
  const started=new Promise(r=>entered=r);
  const first=withE6RunStore(d,async store=>{await store.claim({fake:true});await store.checkpoint({synthetic:true});entered();await gate;});
  await started;await assert.rejects(withE6RunStore(d,async()=>{}),/E6_BUSY_OR_RECOVERY_REQUIRED/);release();await first;
  await assert.rejects(withE6RunStore(d,s=>s.claim({fake:true})),/E6_ALREADY_SPENT_OR_RECOVERY_REQUIRED/);
  for(const f of ['spent.v1.lock','summary.v1.json'])assert.equal((await stat(join(d,f))).mode&0o777,0o600);
  assert.deepEqual(JSON.parse(await readFile(join(d,'summary.v1.json'),'utf8')),{synthetic:true});
}));

test('failed invocation remains spent; stale/crash lease requires explicit offline recovery',()=>temp(async d=>{
  await assert.rejects(withE6RunStore(d,async s=>{await s.claim({fake:true});throw Error('fake crash');}),/fake crash/);
  await assert.rejects(withE6RunStore(d,s=>s.claim({fake:true})),/E6_ALREADY_SPENT_OR_RECOVERY_REQUIRED/);
  await writeFile(join(d,'execution.v1.lock'),JSON.stringify({version:'clear-e6-python-lease.1',token:'fake-stale'}),{mode:0o600});
  await assert.rejects(withE6RunStore(d,async()=>{}),/E6_BUSY_OR_RECOVERY_REQUIRED/);
}));

test('lease ownership replacement is retained for recovery',()=>temp(async d=>{
  await assert.rejects(withE6RunStore(d,async()=>{
    await writeFile(join(d,'execution.v1.lock'),JSON.stringify({token:'replacement'}));
  }),/E6_LEASE_OWNERSHIP/);
  assert.equal(JSON.parse(await readFile(join(d,'execution.v1.lock'),'utf8')).token,'replacement');
}));

test('insecure or symlink run directory blocks without changing its permissions',()=>temp(async d=>{
  await chmod(d,0o755);await assert.rejects(withE6RunStore(d,async()=>{}),/E6_STORE_PERMISSIONS/);
  assert.equal((await stat(d)).mode&0o777,0o755);await chmod(d,0o700);
  const target=join(d,'target'),alias=join(d,'alias');await mkdir(target,{mode:0o700});await symlink(target,alias);
  await assert.rejects(withE6RunStore(alias,async()=>{}),/E6_STORE_PERMISSIONS/);
}));

test('real disk checkpoint failure leaves spent marker and never constructs transport',()=>temp(async d=>{
  await mkdir(join(d,'summary.v1.json'),{mode:0o700});const s=setup();
  await assert.rejects(withE6RunStore(d,store=>runE6Quality({...s.cfg,store})),/E6_CHECKPOINT_FAILED/);
  assert.equal(s.counters().factories,0);
  await assert.rejects(withE6RunStore(d,store=>store.claim({fake:true})),/E6_ALREADY_SPENT_OR_RECOVERY_REQUIRED/);
}));

test('hard-killed offline lease owner retains both lease and one-shot marker',()=>temp(async d=>{
  const moduleUrl=new URL('./e6-quality-runner.mjs',import.meta.url).href;
  const script=`import {withE6RunStore} from ${JSON.stringify(moduleUrl)};
    await withE6RunStore(process.argv[1],async s=>{await s.claim({fake:true});process.send('ready');await new Promise(()=>setInterval(()=>{},1000));});`;
  const child=spawn(process.execPath,['--input-type=module','-e',script,d],{stdio:['ignore','ignore','ignore','ipc']});
  try{
    await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('offline child not ready')),5000);
      child.once('message',()=>{clearTimeout(timeout);resolve();});child.once('error',e=>{clearTimeout(timeout);reject(e);});});
    const exited=once(child,'exit');child.kill('SIGKILL');await exited;
    assert.equal(JSON.parse(await readFile(join(d,'execution.v1.lock'),'utf8')).version,'clear-e6-python-lease.1');
    assert.equal(JSON.parse(await readFile(join(d,'spent.v1.lock'),'utf8')).version,'clear-e6-python-single-run.1');
    await assert.rejects(withE6RunStore(d,async()=>{}),/E6_BUSY_OR_RECOVERY_REQUIRED/);
  }finally{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}
}));
