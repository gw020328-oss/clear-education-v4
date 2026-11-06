import test from 'node:test';
import assert from 'node:assert/strict';
import {createService} from '../service.mjs';
import {openStore} from '../store.mjs';
import {validateConfig,bindingHash} from '../config.mjs';
import {sourceClauses} from '../../../src/agent-preview/index.mjs';
import {prepareGeminiStructureRequest} from '../../../src/agent-preview/gemini-preparation.mjs';

const sourceText='Moodle에서 첫 학습 활동을 마쳐야 한다';
const config=validateConfig({version:'clear-external-preview-config.1',publicOrigin:'https://preview.example.invalid',port:18991,
  institutionId:'clear-demo',courseId:'2',operatorId:'2',dataMode:'DEMO_ACCOUNTS_ONLY',artifactHash:'c'.repeat(64),
  deploymentEpoch:'00000000-0000-4000-8000-000000000001',databasePath:'/tmp/unused-preview.sqlite',sharedSecretFile:'/tmp/unused-secret'});
const body={institutionId:'clear-demo',courseId:'2',operatorId:'2',sourceText};
const reply=()=>({candidates:[{finishReason:'STOP',content:{role:'model',parts:[{text:JSON.stringify({clauses:sourceClauses(sourceText).map(c=>({
  quote:c.text,start:c.start,end:c.end,status:'SUPPORTED',capability:'MOODLE_ACTIVITY_COMPLETION.1',question:null}))})}]}}]});
const observed=()=>({targetRef:'synthetic-page',status:'COMPLETE',observedAt:Math.floor(Date.now()/1000)});
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function fixture(t,options={}) {
  const store=openStore(':memory:'),timers=new Map();let seq=0;
  store.register({ref:'approval-1',bodyHash:prepareGeminiStructureRequest(sourceText).bodyHash,bindingHash:bindingHash(config),expires:Date.now()+60000});
  const service=createService({config,store,modelTransport:{execution:'OFFLINE',async request(model,method){return method==='countTokens'?{totalTokens:500}:reply();}},
    setOperationTimer(fn,ms){const id=++seq;timers.set(id,{fn,ms});return id;},clearOperationTimer(id){timers.delete(id);},...options});
  t.after(()=>{service.close();store.close();});
  return {store,service,timers};
}
async function promptlyRejected(pending,pattern){
  let timer;try {await Promise.race([assert.rejects(pending,pattern),new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(Error('pending work did not terminate')),500);
  })]);}finally{clearTimeout(timer);}
}
for(const phase of ['countTokens','generateContent'])test(`close during ${phase} aborts immediately, never publishes or retries`,async t=>{
  const wait=deferred(),entered=deferred(),calls=[];let signal;
  const f=fixture(t,{modelTransport:{execution:'OFFLINE',request(model,method,body,s){calls.push(method);
    if(method===phase){signal=s;entered.resolve();return wait.promise;}return Promise.resolve({totalTokens:500});}}});
  const pending=f.service.generate({...body,approvalRef:'approval-1'});await entered.promise;
  f.service.close();assert.equal(signal?.aborted,true);
  await promptlyRejected(pending,/SERVICE_CLOSED/);assert.equal(f.timers.size,0);
  wait.resolve(phase==='countTokens'?{totalTokens:500}:reply());await new Promise(r=>setImmediate(r));
  assert.deepEqual(calls,phase==='countTokens'?['countTokens']:['countTokens','generateContent']);
  assert.throws(()=>f.store.consume('approval-1',prepareGeminiStructureRequest(sourceText).bodyHash,bindingHash(config)),/APPROVAL_REQUIRED_OR_SPENT/);
});
test('close during observe aborts immediately; late success cannot escape',async t=>{
  const wait=deferred();let signal;
  const f=fixture(t,{observationAdapter:{execution:'OFFLINE_TEST',observe(input,options){signal=options?.signal;return wait.promise;}}});
  const generated=await f.service.generate({...body,approvalRef:'approval-1'});
  const pending=f.service.execute({...body,draftId:generated.draftId,proposalHash:generated.draft.proposalHash});
  f.service.close();assert.equal(signal?.aborted,true);await promptlyRejected(pending,/SERVICE_CLOSED/);
  wait.resolve(observed());await new Promise(r=>setImmediate(r));assert.equal(f.timers.size,0);
});
test('draft TTL cancels a nonsettling observer and clears its operation timers',async t=>{
  let expire,signal,now=Date.now();const wait=deferred();
  const f=fixture(t,{clock:()=>now,setTimer(fn){expire=fn;return 1;},clearTimer(){},
    observationAdapter:{execution:'OFFLINE_TEST',observe(input,options){signal=options?.signal;return wait.promise;}}});
  const generated=await f.service.generate({...body,approvalRef:'approval-1'});
  const pending=f.service.execute({...body,draftId:generated.draftId,proposalHash:generated.draft.proposalHash});
  now=generated.expiresAt;expire();assert.equal(signal?.aborted,true);
  await promptlyRejected(pending,/DRAFT_STALE_OR_UNREVIEWED/);assert.equal(f.timers.size,0);
  wait.reject(Error('late observer failure'));await new Promise(r=>setImmediate(r));
});
test('approval expiry while generation is pending aborts and cannot return a draft',async t=>{
  const wait=deferred(),entered=deferred();let signal;
  const f=fixture(t,{modelTransport:{execution:'OFFLINE',request(model,method,body,s){
    if(method==='countTokens')return Promise.resolve({totalTokens:500});signal=s;entered.resolve();return wait.promise;}}});
  const pending=f.service.generate({...body,approvalRef:'approval-1'});await entered.promise;
  [...f.timers.values()].find(timer=>timer.ms>45000).fn();
  assert.equal(signal?.aborted,true);await promptlyRejected(pending,/APPROVAL_EXPIRED/);assert.equal(f.timers.size,0);
  wait.resolve(reply());
});
test('post-await approval expiry is checked even if the timer has not fired',async t=>{
  let now=Date.now();const f=fixture(t,{clock:()=>now,modelTransport:{execution:'OFFLINE',async request(model,method){
    if(method==='countTokens')return {totalTokens:500};now+=120000;return reply();}}});
  await assert.rejects(f.service.generate({...body,approvalRef:'approval-1'}),/APPROVAL_EXPIRED/);
});
test('request abort and operation timeout stop pending dispatch without a following call',async t=>{
  for(const reason of ['request','timeout']) {
    const wait=deferred(),calls=[];let signal;const controller=new AbortController();
    const f=fixture(t,{modelTransport:{execution:'OFFLINE',request(model,method,body,s){calls.push(method);signal=s;return wait.promise;}}});
    const pending=f.service.generate({...body,approvalRef:'approval-1'},{signal:controller.signal});
    if(reason==='request')controller.abort();else [...f.timers.values()].find(timer=>timer.ms===45000).fn();
    assert.equal(signal?.aborted,true);await promptlyRejected(pending,reason==='request'?/REQUEST_ABORTED/:/OPERATION_TIMEOUT/);
    wait.resolve({totalTokens:500});await new Promise(r=>setImmediate(r));assert.deepEqual(calls,['countTokens']);assert.equal(f.timers.size,0);
  }
});

test('host invocation diagnostics separate approval, count-only, unknown generation and rejected reply',async t=>{
  // ACTUAL labels are simulated by in-process transports without credentials or network.
  for(const phase of ['approval','count-failed','count-limit','generate-failed','invalid-reply','success']) {
    const calls=[];
    const f=fixture(t,{modelTransport:{execution:'ACTUAL',async request(model,method){
      calls.push(method);
      if(phase==='count-failed'||phase==='generate-failed'&&method==='generateContent')throw Error('private provider failure');
      if(method==='countTokens')return {totalTokens:phase==='count-limit'?4097:100};
      return phase==='invalid-reply'?{candidates:[]}:reply();
    }}});
    if(phase==='success') {
      const result=await f.service.generate({...body,approvalRef:'approval-1'});
      assert.equal(result.actualModelCall,true);assert.equal(result.modelCall.replied,true);
      assert.ok(Object.isFrozen(result.modelCall.methods.generateContent));
      continue;
    }
    const approvalRef=phase==='approval'?'missing-approval':'approval-1';
    let diagnostic;
    await assert.rejects(f.service.generate({...body,approvalRef}),error=>{diagnostic=error;return true;});
    const call=diagnostic.modelCall;
    assert.equal(call.attempted,true);assert.equal(call.succeeded,false);
    assert.equal(call.execution,'ACTUAL');assert.ok(Object.isFrozen(call.methods.generateContent));
    assert.equal(call.errorCode.includes('private'),false);
    assert.equal(call.methods.countTokens.invoked,phase!=='approval');
    assert.equal(call.methods.countTokens.replied,!['approval','count-failed'].includes(phase));
    assert.equal(call.methods.generateContent.invoked,['generate-failed','invalid-reply'].includes(phase));
    assert.equal(call.replied,phase==='invalid-reply');
    assert.equal(diagnostic.actualModelCall,phase==='generate-failed'?null:phase==='invalid-reply');
    assert.equal(calls.length,phase==='approval'?0:['count-failed','count-limit'].includes(phase)?1:2);
    if(phase!=='approval')assert.throws(()=>f.store.consume('approval-1',prepareGeminiStructureRequest(sourceText).bodyHash,bindingHash(config)),/APPROVAL_REQUIRED_OR_SPENT/);
  }
});

test('late generation reply cannot change frozen failure diagnostics or publish a draft',async t=>{
  for(const reason of ['abort','expiry','close']) {
    const wait=deferred(),entered=deferred(),controller=new AbortController();
    let now=Date.now(),draftTimers=0;
    const f=fixture(t,{clock:()=>now,setTimer(){draftTimers++;return 1;},clearTimer(){},
      modelTransport:{execution:'ACTUAL',request(model,method){
        if(method==='countTokens')return Promise.resolve({totalTokens:100});
        entered.resolve();return wait.promise;
      }}});
    const pending=f.service.generate({...body,approvalRef:'approval-1'},{signal:controller.signal});
    await entered.promise;
    if(reason==='abort')controller.abort();
    if(reason==='close')f.service.close();
    if(reason==='expiry') {now+=120000;[...f.timers.values()].find(timer=>timer.ms>45000).fn();}
    let failure;
    await assert.rejects(pending,error=>{failure=error;return true;});
    assert.equal(failure.actualModelCall,null);assert.equal(failure.modelCall.replied,false);
    const before=JSON.stringify(failure.modelCall);
    wait.resolve(reply());await new Promise(resolve=>setImmediate(resolve));
    assert.equal(JSON.stringify(failure.modelCall),before);
    assert.equal(draftTimers,0);
  }
});

test('expiry after durable consume makes zero transport invocations and keeps approval spent',async t=>{
  const now=Date.now(),calls=[];let samples=0;
  const f=fixture(t,{clock:()=>++samples<=2?now:now+120000,
    modelTransport:{execution:'ACTUAL',request(model,method){calls.push(method);throw Error('unexpected dispatch');}}});
  await assert.rejects(f.service.generate({...body,approvalRef:'approval-1'}),error=>{
    assert.equal(error.message,'APPROVAL_EXPIRED');
    assert.equal(error.actualModelCall,false);
    assert.deepEqual(error.modelCall.methods,{countTokens:{invoked:false,replied:false},generateContent:{invoked:false,replied:false}});
    return true;
  });
  assert.deepEqual(calls,[]);
  assert.throws(()=>f.store.consume('approval-1',prepareGeminiStructureRequest(sourceText).bodyHash,bindingHash(config),()=>now),/APPROVAL_REQUIRED_OR_SPENT/);
});

test('reused or pre-existing error diagnostics preserve identity and the first frozen snapshot',async t=>{
  const shared=Object.assign(Error('GEMINI_NETWORK_FAILURE'),{code:'GEMINI_NETWORK_FAILURE'});
  let invocation=0;
  const f=fixture(t,{modelTransport:{execution:'ACTUAL',request(model,method){
    if(invocation===1&&method==='countTokens')return Promise.resolve({totalTokens:100});
    throw shared;
  }}});
  await assert.rejects(f.service.generate({...body,approvalRef:'approval-1'}),error=>error===shared);
  const snapshot=shared.modelCall,serialized=JSON.stringify(snapshot);
  assert.ok(Object.isFrozen(snapshot));assert.ok(Object.isFrozen(snapshot.methods.countTokens));
  assert.equal(snapshot.methods.generateContent.invoked,false);
  invocation=1;
  f.store.register({ref:'approval-2',bodyHash:prepareGeminiStructureRequest(sourceText).bodyHash,
    bindingHash:bindingHash(config),expires:Date.now()+60000});
  await assert.rejects(f.service.generate({...body,approvalRef:'approval-2'}),error=>{
    assert.equal(error,shared);assert.equal(error.code,'GEMINI_NETWORK_FAILURE');
    assert.equal(error.modelCall,snapshot);assert.equal(JSON.stringify(error.modelCall),serialized);
    // This is still the first failure's snapshot, not this generation attempt.
    assert.equal(error.actualModelCall,false);
    return true;
  });
  for(const ref of ['approval-1','approval-2'])assert.throws(()=>f.store.consume(ref,
    prepareGeminiStructureRequest(sourceText).bodyHash,bindingHash(config)),/APPROVAL_REQUIRED_OR_SPENT/);

  const errors=[Object.preventExtensions(Error('GEMINI_NETWORK_FAILURE')),
    Object.freeze(Error('GEMINI_NETWORK_FAILURE'))];
  for(const field of ['modelCall','actualModelCall']) {
    const error=Error('GEMINI_NETWORK_FAILURE');
    Object.defineProperty(error,field,{value:Object.freeze({existing:true})});errors.push(error);
  }
  const accessor=Error('GEMINI_NETWORK_FAILURE');
  Object.defineProperty(accessor,'code',{get(){throw Error('diagnostic getter failed');}});errors.push(accessor);
  const trap=new Proxy(Error('GEMINI_NETWORK_FAILURE'),{defineProperty(){throw Error('attachment failed');}});errors.push(trap);
  for(const original of errors) {
    const before=Object.getOwnPropertyDescriptors(original);
    const other=fixture(t,{modelTransport:{execution:'ACTUAL',request(){throw original;}}});
    await assert.rejects(other.service.generate({...body,approvalRef:'approval-1'}),error=>error===original);
    assert.deepEqual(Object.getOwnPropertyDescriptors(original),before);
  }
});
