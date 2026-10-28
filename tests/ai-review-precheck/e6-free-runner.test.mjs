import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,rm,writeFile,readFile,chmod,mkdir,symlink,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {loadE6FreeBundle,prepareE6FreePlan,validateFreeRequestBytes,FREE_KEY_SOURCE,FREE_MODEL,jsonSha} from './e6-free-plan.mjs';
import {validateE6FreeClearance,runE6Free,withE6FreeStore} from './e6-free-runner.mjs';
import {createFreeCredentialReader,createFreeTransport,readFreeControls} from './e6-free-credential.mjs';
function setup(){
  const bundle=structuredClone(loadE6FreeBundle()),p=bundle.plan,day='2026-10-19',codeState={head:'a'.repeat(40),clean:true};
  const approval={version:'clear-e6-free-user-approval.1',scope:'E6_PYTHON_FREE_TEXT_8_ONLY',approvedOn:day,
    codeHead:codeState.head,planHash:p.planHash,authorization:{kind:'OFFLINE_TEST_ONLY',evidenceSha256:'b'.repeat(64)},
    maxGenerationCalls:8,maxCountCalls:0,automaticRetries:0,continuations:0,paidFallbacks:0,modelFallbacks:0,
    keySourceId:FREE_KEY_SOURCE,projectScopeSha256:'c'.repeat(64),dataUseAcknowledgment:'PUBLIC_SYNTHETIC_TEXT_PRODUCT_IMPROVEMENT_ALLOWED',
    pins:{codeHead:codeState.head,planHash:p.planHash,corpusSha256:p.corpusSha256,goldSha256:p.goldSha256,requestsSha256:p.requestsSha256}};
  const projectConfirmation={version:'clear-e6-free-project-confirmation.1',basis:'OFFLINE_TEST_ONLY',evidenceSha256:'d'.repeat(64),
    reviewedOn:day,codeHead:codeState.head,planHash:p.planHash,keySourceId:FREE_KEY_SOURCE,projectScopeSha256:approval.projectScopeSha256,
    aiStudioBillingTier:'Free',billingAccountLinked:false,googleCloudBillingEnabled:false,keyBelongsToConfirmedProject:true,
    rateLimits:{model:FREE_MODEL,rpm:1,availableRpd:8,tpm:10000}};
  let spent=false,factories=0,time=0;const calls=[],checkpoints=[],waits=[];
  const store={async claim(){assert.equal(spent,false,'spent');spent=true;},async checkpoint(r){checkpoints.push(structuredClone(r));}};
  const response=id=>({modelVersion:FREE_MODEL,usageMetadata:{promptTokenCount:100,candidatesTokenCount:100,thoughtsTokenCount:0,totalTokenCount:200},
    candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({topics:bundle.gold.cases.find(g=>g.caseId===id).topics.map(t=>({
      topicId:t.topicId,state:t.state,evidence:t.quote?{sourceId:bundle.corpus.sourceId,quote:t.quote}:null}))})}]}}]});
  const transport={execution:'MOCK',async request(model,method,body){
    assert.equal(model,FREE_MODEL);assert.equal(method,'generateContent');
    const latest=checkpoints.at(-1);assert.equal(latest.status,'DISPATCH_RESERVED');assert.equal(latest.generationCalls,calls.length+1);
    assert.equal(latest.countCalls,0);const id=JSON.parse(body.contents[0].parts[0].text).caseId;
    assert.deepEqual(body,bundle.requests.find(r=>r.caseId===id).body);calls.push({time,method});return response(id);
  }};
  const cfg={bundle,approval,projectConfirmation,codeState,day,store,transportFactory:scope=>{
    factories++;assert.deepEqual(scope,{keySourceId:FREE_KEY_SOURCE,projectScopeSha256:approval.projectScopeSha256});return transport;},
    nowMs:()=>time,wait:async ms=>{waits.push(ms);time+=ms;}};
  return {cfg,transport,response,checkpoints,calls,waits,factories:()=>factories,setTime:n=>time=n};
}
async function temp(action){const d=await realpath(await mkdtemp(join(tmpdir(),'clear-free-offline-')));try{return await action(d);}finally{await rm(d,{recursive:true,force:true});}}
test('new committed free plan preserves exact corpus/gold, removes parameters, strict UTF8 byte caps',()=>{
  const b=loadE6FreeBundle();assert.deepEqual(b,prepareE6FreePlan());
  assert.equal(b.plan.corpusSha256,'1a304a596a15fedcda846ed721b87d0a6daa418fa019ecebe2f55443e7a8b951');
  assert.equal(b.plan.goldSha256,'4f13f00b884d9360e6526fac2e80147466bfd17c8410509a18f6f72cd825e83a');
  assert.notEqual(b.plan.planHash,b.plan.parentPaidPlanHash);assert.equal(b.plan.limits.countCalls,0);
  for(const r of b.requests){assert.equal('temperature' in r.body.generationConfig,false);assert.equal('candidateCount' in r.body.generationConfig,false);
    assert.equal('countTokensBody' in r,false);assert.equal(r.utf8Bytes,Buffer.byteLength(JSON.stringify(r.body)));assert.equal('maxInputTokens' in r,false);}
  const tooLong=structuredClone(b);tooLong.corpus.cases[0].text='가'.repeat(700);assert.throws(()=>validateFreeRequestBytes(tooLong),/SOURCE_BYTES/);
  const wire=structuredClone(b);wire.requests[0].body.extra='가'.repeat(3000);assert.throws(()=>validateFreeRequestBytes(wire),/REQUEST_BYTES/);
  assert.equal(b.plan.combinedOutputThinkingBillingCap,'UNVERIFIED_NOT_A_CASH_GUARD');
});
test('fake 8 generation / count0, durable reservations, sequential pacing and raw-free report',async()=>{
  const s=setup(),r=await runE6Free(s.cfg);assert.equal(r.generationCalls,8);assert.equal(r.countCalls,0);assert.equal(s.calls.length,8);
  assert.deepEqual(r.aggregate,{cases:8,passed:8,needsImprovement:0,falseHolds:0});assert.equal(r.paymentAuthority,false);assert.equal(r.usableForAcceptance,false);
  for(let i=1;i<8;i++)assert.ok(s.calls[i].time-s.calls[i-1].time>=60000);
  assert.ok(s.waits.every(n=>n<=1000));
  const text=JSON.stringify(s.checkpoints);
  for(const raw of ['quote','리스트','목록','apiKey','rawObservation','usageMetadata','generationConfig'])assert.equal(text.includes(raw),false,raw);
  await assert.rejects(runE6Free(s.cfg),/spent/);assert.equal(s.calls.length,8);
});
test('missing, paid, boolean-only or old approval blocks before store/transport/credential',async()=>{
  for(const change of [c=>c.approval=null,c=>c.approval={approved:true},c=>c.approval.scope='E6_PYTHON_TEXT_ONLY',
    c=>c.approval.version='clear-e6-python-user-approval.1',c=>c.approval.approvedOn='2026-10-16',
    c=>c.approval.authorization.evidenceSha256=null,c=>c.approval.paidFallbacks=1,c=>c.approval.maxCountCalls=1,
    c=>c.approval.maxGenerationCalls=9,c=>c.approval.continuations=1,c=>c.approval.modelFallbacks=1,
    c=>c.approval.keySourceId='GEMINI_API_KEY',c=>c.approval.dataUseAcknowledgment=null]){
    const s=setup();change(s.cfg);await assert.rejects(runE6Free(s.cfg),/E6_FREE_APPROVAL/);
    assert.equal(s.factories(),0);assert.equal(s.checkpoints.length,0);
  }
});
test('linked billing, wrong project/key source, missing UI review or quota blocks all dispatch',async()=>{
  for(const change of [c=>c.projectConfirmation=null,c=>c.projectConfirmation.aiStudioBillingTier='Paid',
    c=>c.projectConfirmation.billingAccountLinked=true,c=>c.projectConfirmation.googleCloudBillingEnabled=true,
    c=>c.projectConfirmation.projectScopeSha256='e'.repeat(64),c=>c.projectConfirmation.keySourceId='paid',
    c=>c.projectConfirmation.keyBelongsToConfirmedProject=false,c=>c.projectConfirmation.reviewedOn='2026-10-18',
    c=>c.projectConfirmation.evidenceSha256=null,c=>c.projectConfirmation.rateLimits.rpm=0,
    c=>c.projectConfirmation.rateLimits.availableRpd=7,c=>c.projectConfirmation.rateLimits.model='other']){
    const s=setup();change(s.cfg);await assert.rejects(runE6Free(s.cfg),/E6_FREE_PROJECT_CONFIRMATION/);assert.equal(s.factories(),0);
  }
});
test('ACTUAL rejects offline records; pure guard validates scope without authenticating Google billing',()=>{
  const s=setup();assert.throws(()=>validateE6FreeClearance({...s.cfg,execution:'ACTUAL'}),/E6_FREE_APPROVAL/);
  s.cfg.approval.authorization.kind='DIRECT_HUMAN_NEW_FREE_E6';
  assert.throws(()=>validateE6FreeClearance({...s.cfg,execution:'ACTUAL'}),/PROJECT_CONFIRMATION/);
  s.cfg.projectConfirmation.basis='HUMAN_UI_REVIEW_NOT_API_AUTHENTICATION';validateE6FreeClearance({...s.cfg,execution:'ACTUAL'});
  assert.equal(s.factories(),0);
});
test('blocked public templates are not approval records',async()=>{
  const templates=JSON.parse(await readFile(new URL('./e6-free-control-templates.json',import.meta.url),'utf8')),s=setup();
  await assert.rejects(runE6Free({...s.cfg,approval:templates.approval,projectConfirmation:templates.projectConfirmation}),/E6_FREE_APPROVAL/);
  assert.equal(s.factories(),0);
});
test('dirty/different head, plan/request/gold/corpus mutations refuse exact pins',async()=>{
  for(const change of [c=>c.codeState.clean=false,c=>c.codeState.head='f'.repeat(40),c=>c.approval.pins.requestsSha256='e'.repeat(64),
    c=>c.bundle.plan.limits.countCalls=1,c=>c.bundle.requests[0].body.generationConfig.temperature=0,
    c=>c.bundle.corpus.cases[0].text+='x',c=>c.bundle.gold.cases[0].topics[0].state='MISSING']){
    const s=setup();change(s.cfg);await assert.rejects(runE6Free(s.cfg),/E6_FREE_(APPROVAL|PLAN_PIN)/);assert.equal(s.factories(),0);
  }
});
test('head/day/confirmation revocation after reserve prevents even first credential access',async()=>{
  for(const kind of ['head','day','controls']){
    const s=setup();let checks=0;
    if(kind==='head')s.cfg.currentCodeState=()=>++checks<3?s.cfg.codeState:{head:'f'.repeat(40),clean:true};
    if(kind==='day')s.cfg.currentDay=()=>++checks<3?s.cfg.day:'2026-10-20';
    if(kind==='controls')s.cfg.currentControlHashes=()=>++checks<3?{approvalHash:jsonSha(s.cfg.approval),projectConfirmationHash:jsonSha(s.cfg.projectConfirmation)}:null;
    const r=await runE6Free(s.cfg);assert.equal(r.generationCalls,1);assert.equal(s.factories(),0);assert.equal(r.attempts[0].code,'E6_FREE_CURRENT');
    assert.equal(r.attempts.filter(a=>a.status==='NOT_RUN').length,7);
  }
});
test('pacing cancellation or clock rollback stops without reserving second request',{timeout:5000},async()=>{
  for(const mode of ['revoke','clock']){
    const s=setup();s.cfg.wait=async()=>{if(mode==='clock')s.setTime(-1);else s.cfg.codeState.clean=false;};
    const r=await runE6Free(s.cfg);assert.equal(s.calls.length,1);assert.equal(r.generationCalls,1);
    assert.equal(r.attempts[1].dispatchReserved,false);assert.equal(r.attempts.filter(a=>a.status==='NOT_RUN').length,7);
  }
});
test('checkpoint failure is never retried and sends no unreserved request',async()=>{
  for(const write of [1,2,4]){
    const s=setup();let n=0;const save=s.cfg.store.checkpoint;
    s.cfg.store.checkpoint=async r=>{n++;if(n===write)throw Error('private disk failure');await save(r);};
    await assert.rejects(runE6Free(s.cfg),/E6_FREE_CHECKPOINT_FAILED/);assert.equal(n,write);
    assert.equal(s.calls.length,write===4?1:0);await assert.rejects(runE6Free(s.cfg),/spent/);
  }
});
test('429/HTTP/unknown failure stops once, retains call, leaves remaining cases NOT_RUN',async()=>{
  for(const code of ['GEMINI_RATE_LIMIT','GEMINI_HTTP_FAILURE','private provider text']){
    const s=setup();let calls=0;s.transport.request=async()=>{calls++;throw Error(code);};
    const r=await runE6Free(s.cfg);assert.equal(calls,1);assert.equal(r.generationCalls,1);assert.equal(r.countCalls,0);
    assert.equal(r.attempts.filter(a=>a.status==='NOT_RUN').length,7);assert.equal(r.attempts[0].dispatchReserved,true);
    assert.equal(JSON.stringify(r).includes('private provider text'),false);await assert.rejects(runE6Free(s.cfg),/spent/);
  }
});
test('timeout ignores late response and preserves one-shot reservation',async()=>{
  const s=setup();let finish;s.transport.request=()=>new Promise(r=>finish=r);
  const r=await runE6Free({...s.cfg,timeoutMs:5}),snap=JSON.stringify(s.checkpoints);finish(s.response('PY01'));await Promise.resolve();
  assert.equal(r.attempts[0].code,'E6_FREE_TIMEOUT');assert.equal(JSON.stringify(s.checkpoints),snap);assert.equal(r.generationCalls,1);
});
test('missing thinking/usage is N/A, not zero or exact charge measurement',async()=>{
  const s=setup();s.transport.request=async()=>{const r=s.response('PY01');delete r.usageMetadata.thoughtsTokenCount;return r;};
  const r=await runE6Free(s.cfg);assert.equal(r.attempts[0].tokens.thoughtsTokenCount,null);
  assert.equal(r.attempts[0].tokenMeasurement,'N/A_INCOMPLETE_USAGE');assert.equal(r.attempts[0].code,'E6_FREE_USAGE_UNKNOWN');
  assert.equal(r.cost.actualCharges,'N/A_NOT_INDEPENDENTLY_VERIFIED');assert.equal(r.attempts[1].status,'NOT_RUN');
});
test('output/model/schema/usage anomalies stop with raw-free fixed errors',async()=>{
  for(const change of [r=>r.usageMetadata.thoughtsTokenCount=2000,r=>r.modelVersion='other',r=>r.candidates[0].finishReason='MAX_TOKENS',
    r=>r.candidates[0].content.parts[0].text='private raw text',r=>r.candidates[0].content.parts[0].text='{"topics":[],"paymentAuthority":true}',
    r=>r.usageMetadata.totalTokenCount=1]){
    const s=setup();s.transport.request=async()=>{const r=s.response('PY01');change(r);return r;};
    const r=await runE6Free(s.cfg);assert.equal(r.status,'UNKNOWN_STOPPED');assert.equal(r.generationCalls,1);
    assert.equal(JSON.stringify(r).includes('private raw text'),false);assert.equal(r.paymentAuthority,false);
  }
});
test('semantic false holds counted without becoming authority or raw persisted text',async()=>{
  const s=setup(),old=s.transport.request;s.transport.request=async(...args)=>{const r=await old(...args),text=r.candidates[0].content.parts[0];
    const raw=JSON.parse(text.text);raw.topics[0]={topicId:'work-performed',state:'MISSING',evidence:null};text.text=JSON.stringify(raw);return r;};
  const r=await runE6Free(s.cfg);assert.deepEqual(r.aggregate,{cases:8,passed:0,needsImprovement:8,falseHolds:5});
});
test('dedicated reader construction checks no key; transport rejects count/model before reader',()=>temp(async d=>{
  const reader=createFreeCredentialReader(join(d,'nonexistent'));assert.equal(typeof reader,'function');let keyReads=0,fetches=0;
  const t=createFreeTransport({keySourceId:FREE_KEY_SOURCE,projectScopeSha256:'c'.repeat(64)},
    {credentialReader:async()=>{keyReads++;throw Error('E6_FREE_CREDENTIAL_INVALID');},fetchImpl:async()=>{fetches++;}});
  for(const [model,method] of [[FREE_MODEL,'countTokens'],['other','generateContent']])await assert.rejects(t.request(model,method,{},new AbortController().signal),/CREDENTIAL_INVALID/);
  assert.equal(keyReads,0);assert.equal(fetches,0);
  await assert.rejects(t.request(FREE_MODEL,'generateContent',{},new AbortController().signal),/CREDENTIAL_INVALID/);
  assert.equal(keyReads,1);assert.equal(fetches,0); // No inherited paid-key fallback.
}));
test('synthetic private slot binds source/scope, requires owner-only file, never follows symlink',()=>temp(async d=>{
  const file=join(d,'credential.json'),scope={keySourceId:FREE_KEY_SOURCE,projectScopeSha256:'c'.repeat(64)};
  const credential={version:'clear-e6-free-credential.1',...scope,apiKey:'offline_synthetic_only_credential'};
  await writeFile(file,JSON.stringify(credential),{mode:0o600});const reader=createFreeCredentialReader(d);
  assert.equal(await reader(scope),credential.apiKey);
  await assert.rejects(reader({...scope,projectScopeSha256:'d'.repeat(64)}),/CREDENTIAL_INVALID/);
  await chmod(file,0o644);await assert.rejects(reader(scope),/CREDENTIAL_INVALID/);await chmod(file,0o600);
  await rm(file);await writeFile(join(d,'target'),JSON.stringify(credential),{mode:0o600});await symlink(join(d,'target'),file);
  await assert.rejects(reader(scope),/CREDENTIAL_INVALID/);
}));
test('mocked HTTPS receives only dedicated synthetic key in header, no real network',async()=>{
  let reads=0,requests=0;const key='offline_synthetic_only_credential',scope={keySourceId:FREE_KEY_SOURCE,projectScopeSha256:'c'.repeat(64)};
  const t=createFreeTransport(scope,{credentialReader:async passed=>{reads++;assert.deepEqual(passed,scope);return key;},
    fetchImpl:async(url,options)=>{requests++;assert.equal(url,`https://generativelanguage.googleapis.com/v1beta/models/${FREE_MODEL}:generateContent`);
      assert.equal(options.headers['x-goog-api-key'],key);assert.equal(url.includes(key),false);assert.equal(options.redirect,'error');
      return new Response(JSON.stringify({offline:true}),{status:200});}});
  assert.equal(reads,0);assert.deepEqual(await t.request(FREE_MODEL,'generateContent',{},new AbortController().signal),{offline:true});
  assert.equal(reads,1);assert.equal(requests,1);
});
test('private controls reader reads only fake records, requires owner-only regular files',()=>temp(async d=>{
  const s=setup();for(const [file,value] of [['approval.json',s.cfg.approval],['project-confirmation.json',s.cfg.projectConfirmation]])
    await writeFile(join(d,file),JSON.stringify(value),{mode:0o600});
  const records=await readFreeControls(d);assert.deepEqual(records.approval,s.cfg.approval);
  await chmod(join(d,'approval.json'),0o644);await assert.rejects(readFreeControls(d),/CONTROL_INVALID/);
}));
test('free disk store is exclusive, single use after success/failure, private permissions',()=>temp(async d=>{
  let enter,release;const entered=new Promise(r=>enter=r),hold=new Promise(r=>release=r);
  const running=withE6FreeStore(d,async s=>{await s.claim({offline:true});await s.checkpoint({offline:true});enter();await hold;});
  await entered;await assert.rejects(withE6FreeStore(d,async()=>{}),/FREE_BUSY/);release();await running;
  await assert.rejects(withE6FreeStore(d,s=>s.claim({offline:true})),/FREE_SPENT/);
  for(const f of ['spent.free.v1.lock','summary.free.v1.json'])assert.equal((await stat(join(d,f))).mode&0o777,0o600);
}));
test('real disk failure preserves spent marker without key factory; insecure store blocked',()=>temp(async d=>{
  await mkdir(join(d,'summary.free.v1.json'));const s=setup();
  await assert.rejects(withE6FreeStore(d,store=>runE6Free({...s.cfg,store})),/FREE_CHECKPOINT_FAILED/);assert.equal(s.factories(),0);
  await assert.rejects(withE6FreeStore(d,store=>store.claim({offline:true})),/FREE_SPENT/);
  await chmod(d,0o755);await assert.rejects(withE6FreeStore(d,async()=>{}),/E6_FREE_STORE/);
}));
test('replaced free lease refuses checkpoint and retains replacement for offline recovery',()=>temp(async d=>{
  await assert.rejects(withE6FreeStore(d,async s=>{
    await s.claim({offline:true});await writeFile(join(d,'execution.free.v1.lock'),JSON.stringify({token:'offline-replacement'}));
    await assert.rejects(s.checkpoint({offline:true}),/FREE_CHECKPOINT_FAILED/);
  }),/E6_FREE_LEASE_OWNERSHIP/);
  assert.equal(JSON.parse(await readFile(join(d,'execution.free.v1.lock'),'utf8')).token,'offline-replacement');
}));
test('free hard-kill lease/marker retained, no automatic recovery or paid journal access',()=>temp(async d=>{
  const url=new URL('./e6-free-runner.mjs',import.meta.url).href;
  const code=`import {withE6FreeStore} from ${JSON.stringify(url)};await withE6FreeStore(process.argv[1],async s=>{await s.claim({offline:true});process.send('ready');await new Promise(()=>setInterval(()=>{},1000));});`;
  const child=spawn(process.execPath,['--input-type=module','-e',code,d],{stdio:['ignore','ignore','ignore','ipc']});
  try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('offline child timeout')),5000);
    child.once('message',()=>{clearTimeout(timer);resolve();});child.once('error',e=>{clearTimeout(timer);reject(e);});});
    const exited=once(child,'exit');child.kill('SIGKILL');await exited;
    assert.equal(JSON.parse(await readFile(join(d,'execution.free.v1.lock'),'utf8')).version,'clear-e6-free-lease.1');
    assert.equal(JSON.parse(await readFile(join(d,'spent.free.v1.lock'),'utf8')).version,'clear-e6-free-single-run.1');
    await assert.rejects(withE6FreeStore(d,async()=>{}),/FREE_BUSY/);
  }finally{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}
}));
