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
