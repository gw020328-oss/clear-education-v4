import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {validateConfig,bindingHash} from '../config.mjs';
import {openStore} from '../store.mjs';
import {createService} from '../service.mjs';
import {createServer} from '../server.mjs';
import {signature} from '../auth.mjs';
import {sourceClauses} from '../../../src/agent-preview/index.mjs';
import {prepareGeminiStructureRequest} from '../../../src/agent-preview/gemini-preparation.mjs';

const sourceText='Moodle에서 첫 학습 활동을 마쳐야 한다';
const config=validateConfig({version:'clear-external-preview-config.1',publicOrigin:'https://preview.example.invalid',port:18991,
  institutionId:'clear-demo',courseId:'2',operatorId:'2',dataMode:'DEMO_ACCOUNTS_ONLY',databasePath:'/tmp/unused-preview.sqlite',sharedSecretFile:'/tmp/unused-secret'});
const body={institutionId:'clear-demo',courseId:'2',operatorId:'2',sourceText};
function modelReply(text=sourceText) {
  return {candidates:[{finishReason:'STOP',content:{role:'model',parts:[{text:JSON.stringify({clauses:sourceClauses(text).map(c=>({
    quote:c.text,start:c.start,end:c.end,status:'SUPPORTED',capability:'MOODLE_ACTIVITY_COMPLETION.1',question:null}))})}]}}]};
}
async function fixture(t,{adapter=null,transport=null,path=':memory:'}={}) {
  const store=openStore(path),calls=[],secret=randomBytes(32).toString('hex');
  const modelTransport=transport??{execution:'OFFLINE',async request(model,method){calls.push(method);return method==='countTokens'?{totalTokens:500}:modelReply();}};
  const service=createService({config,store,modelTransport,observationAdapter:adapter});
  const server=createServer({config,store,secret,service});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));service.close();store.close();});
  function approve(ref='approved-input-1') {store.register({ref,bodyHash:prepareGeminiStructureRequest(sourceText).bodyHash,bindingHash:bindingHash(config),expires:Date.now()+60000});return ref;}
  function request(path,value,extra={}) {
    const raw=typeof value==='string'?value:JSON.stringify(value),timestamp=String(Math.floor(Date.now()/1000)),nonce=randomBytes(16).toString('hex');
    const headers={'host':'preview.example.invalid','content-type':'application/json','x-clear-timestamp':timestamp,'x-clear-nonce':nonce,
      'x-clear-signature':signature(secret,timestamp,nonce,path,raw),...extra};
    return new Promise((resolve,reject)=>{
      const req=http.request({host:'127.0.0.1',port:server.address().port,path,method:'POST',headers},res=>{
        const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:JSON.parse(Buffer.concat(chunks))}));});
      req.on('error',reject);req.end(raw);
    });
  }
  return {request,approve,calls,store,service,secret};
}
test('prepare returns exact binding and zero model calls; no cookies or CORS',async t=>{
  const f=await fixture(t),r=await f.request('/v1/preview/prepare',body);
  assert.equal(r.status,200);assert.equal(r.body.actualModelCall,false);assert.equal(r.body.paymentAllowed,false);
  assert.equal(r.body.bodyHash,prepareGeminiStructureRequest(sourceText).bodyHash);assert.deepEqual(f.calls,[]);
  assert.equal(r.headers['set-cookie'],undefined);assert.equal(r.headers['access-control-allow-origin'],undefined);
});
test('unauthenticated, cross-origin, cookies, alternate host and actor scope rejected without provider call',async t=>{
  const f=await fixture(t);
  for(const headers of [{'x-clear-signature':'0'.repeat(64)},{origin:'https://evil.invalid'},{cookie:'session=fake'},{host:'evil.invalid'},{'sec-fetch-site':'same-origin'}]) {
    const r=await f.request('/v1/preview/prepare',body,headers);assert.equal(r.status,403);
  }
  assert.equal((await f.request('/v1/preview/prepare',{...body,operatorId:'99'})).body.code,'ACTOR_SCOPE');
  assert.equal((await f.request('/v1/preview/prepare',{...body,courseId:'99'})).body.code,'ACTOR_SCOPE');
  assert.deepEqual(f.calls,[]);
});
test('timestamp expiry and signed request replay are rejected',async t=>{
  const f=await fixture(t),path='/v1/preview/prepare',raw=JSON.stringify(body),timestamp=String(Math.floor(Date.now()/1000)),nonce=randomBytes(16).toString('hex');
  const headers={'x-clear-timestamp':timestamp,'x-clear-nonce':nonce,'x-clear-signature':signature(f.secret,timestamp,nonce,path,raw)};
  assert.equal((await f.request(path,raw,headers)).status,200);
  assert.equal((await f.request(path,raw,headers)).body.code,'REQUEST_REPLAY');
  assert.equal((await f.request(path,body,{'x-clear-timestamp':'1000000000'})).body.code,'AUTH_REQUIRED');
});
test('no approval and changed input do not dispatch; approved input is spent exactly once',async t=>{
  const f=await fixture(t),path='/v1/preview/generate';
  assert.equal((await f.request(path,{...body,approvalRef:'missing-ref'})).body.code,'APPROVAL_REQUIRED_OR_SPENT');
  const approvalRef=f.approve();
  assert.equal((await f.request(path,{...body,sourceText:'Moodle 과제 제출',approvalRef})).body.code,'APPROVAL_REQUIRED_OR_SPENT');
  const r=await f.request(path,{...body,approvalRef});assert.equal(r.status,200);
  assert.equal(r.body.modelProvenance,'OFFLINE_TEST_TRANSPORT');assert.equal(r.body.actualModelCall,false);
  assert.equal(r.body.draft.status,'OPERATOR_REVIEW_REQUIRED');
  assert.equal((await f.request(path,{...body,approvalRef})).body.code,'APPROVAL_REQUIRED_OR_SPENT');
  assert.deepEqual(f.calls,['countTokens','generateContent']);
});
test('durable grant and nonce reject reuse after reopening; different instance cannot consume',()=>{
  const dir=mkdtempSync(join(tmpdir(),'clear-preview-test-')),path=join(dir,'state.sqlite');
  try {
    let store=openStore(path);const p=prepareGeminiStructureRequest(sourceText),binding=bindingHash(config),now=Date.now();
    store.register({ref:'persistent-approval',bodyHash:p.bodyHash,bindingHash:binding,expires:now+60000},now);
    assert.throws(()=>store.consume('persistent-approval',p.bodyHash,'0'.repeat(64),now),/APPROVAL_REQUIRED/);
    store.consume('persistent-approval',p.bodyHash,binding,now);store.nonce('a'.repeat(32),now);store.close();
    store=openStore(path);
    assert.throws(()=>store.consume('persistent-approval',p.bodyHash,binding,now),/APPROVAL_REQUIRED/);
    assert.throws(()=>store.nonce('a'.repeat(32),now),/REQUEST_REPLAY/);store.close();
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('provider failure spends approval and does not leak provider error',async t=>{
  const calls=[],f=await fixture(t,{transport:{execution:'OFFLINE',async request(model,method){calls.push(method);throw Error('secret-provider-data');}}});
  const request={...body,approvalRef:f.approve()};
  assert.equal((await f.request('/v1/preview/generate',request)).body.code,'REQUEST_REJECTED');
  assert.equal((await f.request('/v1/preview/generate',request)).body.code,'APPROVAL_REQUIRED_OR_SPENT');
  assert.deepEqual(calls,['countTokens']);
});
test('input budget stops generation and approval remains spent',async t=>{
  const calls=[],f=await fixture(t,{transport:{execution:'OFFLINE',async request(model,method){calls.push(method);return {totalTokens:4097};}}});
  const r=await f.request('/v1/preview/generate',{...body,approvalRef:f.approve()});
  assert.equal(r.body.code,'INPUT_TOKEN_LIMIT');assert.deepEqual(calls,['countTokens']);
});
test('actual adapter absent fails closed after explicit review; stale text and review hash rejected',async t=>{
  const f=await fixture(t),r=await f.request('/v1/preview/generate',{...body,approvalRef:f.approve()});
  const execute={...body,draftId:r.body.draftId,proposalHash:r.body.draft.proposalHash};
  assert.equal((await f.request('/v1/preview/execute',{...execute,sourceText:'Moodle 활동 완료'})).body.code,'DRAFT_STALE_OR_UNREVIEWED');
  assert.equal((await f.request('/v1/preview/execute',{...execute,proposalHash:'0'.repeat(64)})).body.code,'DRAFT_STALE_OR_UNREVIEWED');
  const result=await f.request('/v1/preview/execute',execute);
  assert.equal(result.status,503);assert.equal(result.body.code,'OBSERVATION_ADAPTER_NOT_ACCEPTED');
});
test('offline adapter is labeled offline and never grants eligibility',async t=>{
  let observed=0;const f=await fixture(t,{adapter:{execution:'OFFLINE_TEST',async observe(){observed++;return {targetRef:'demo-page',status:'OBSERVED',observedAt:Date.now()};}}});
  const r=await f.request('/v1/preview/generate',{...body,approvalRef:f.approve()});
  const result=await f.request('/v1/preview/execute',{...body,draftId:r.body.draftId,proposalHash:r.body.draft.proposalHash});
  assert.equal(result.status,200);assert.equal(observed,1);assert.equal(result.body.observation.executionMode,'OFFLINE_TEST_ADAPTER');
  assert.equal(result.body.plan.executionMode,'PUBLIC_SYNTHETIC');assert.equal(result.body.paymentAllowed,false);
  assert.equal(result.body.observation.eligibility,'NOT_EVALUATED');
});
test('injected actual adapter cannot bypass pending integration acceptance',async t=>{
  let called=false;const f=await fixture(t,{adapter:{execution:'ACTUAL',observe(){called=true;}}});
  const r=await f.request('/v1/preview/generate',{...body,approvalRef:f.approve()});
  assert.equal((await f.request('/v1/preview/execute',{...body,draftId:r.body.draftId,proposalHash:r.body.draft.proposalHash})).status,503);
  assert.equal(called,false);
});
test('unknown keys, duplicate fields, large body and unknown routes rejected',async t=>{
  const f=await fixture(t);
  assert.equal((await f.request('/v1/preview/prepare',{...body,url:'http://internal.invalid'})).body.code,'INVALID_FIELDS');
  assert.equal((await f.request('/v1/preview/prepare','{"institutionId":"a","institutionId":"b"}')).status,422);
  assert.equal((await f.request('/v1/preview/prepare','x'.repeat(16385))).status,413);
  assert.equal((await f.request('/rpc',{})).status,404);
  assert.equal((await f.request('/admin',{})).status,404);
  assert.deepEqual(f.calls,[]);
});
test('remote profile never accepts HTTP public origin, arbitrary private source or real accounts mode',()=>{
  assert.throws(()=>validateConfig({...config,publicOrigin:'http://example.invalid'}),/CONFIG_PUBLIC/);
  assert.throws(()=>validateConfig({...config,dataMode:'PRODUCTION'}),/CONFIG_MODE/);
  assert.throws(()=>validateConfig({...config,moodleOrigin:'http://169.254.169.254'}),/INVALID_FIELDS/);
});
