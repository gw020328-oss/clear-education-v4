import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,realpathSync,rmSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {hash,digest} from '../vendor/b-peer/contract.mjs';
import {encodePeer,decodePeer,createPeerReplayStore,ZERO_HASH} from '../vendor/b-peer/peer-transport.mjs';
import {createPeerEngine} from '../peer-engine.mjs';
import {createPeerServer} from '../peer-http.mjs';
import {peerReceipts} from '../peer-receipts.mjs';
import {validateRegistration} from '../peer-release.mjs';
import {openStore} from '../store.mjs';
import {limits} from '../limits.mjs';
import {prepareGeminiStructureRequest} from '../../../src/agent-preview/gemini-preparation.mjs';
import {sourceClauses} from '../../../src/agent-preview/index.mjs';
import http from 'node:http';

const sourceText='Python 기초 강의 완료';
function setup(t,{transport,receipts,mode='OFFLINE_TEST'}={}) {
  const root=realpathSync(mkdtempSync(join(tmpdir(),'clear-peer-runtime-')));
  mkdirSync(join(root,'state'),{mode:0o700});
  let now=Date.now();
  const config={version:'clear-external-preview-config.1',publicOrigin:'https://peer.example.invalid',port:19001,
    institutionId:'demo',courseId:'2',operatorId:'2',dataMode:'DEMO_ACCOUNTS_ONLY',artifactHash:'a'.repeat(64),
    deploymentEpoch:'00000000-0000-4000-8000-000000000001',databasePath:join(root,'state','approval.sqlite'),
    sharedSecretFile:join(root,'key')};
  const pin={keyRef:'key1',sender:'B',receiver:'D',audience:'preview',deploymentEpoch:config.deploymentEpoch,
    origin:config.publicOrigin,maxClockSkewSeconds:0};
  const release={version:'clear-peer-release.1',mode,config,pin,targetRef:'core-page-manual-mark',
    planTarget:'python-intro',maxObservationAgeSeconds:10,receiptContract:'test-receipts'};
  const p=prepareGeminiStructureRequest(sourceText),scopeHash='b'.repeat(64);
  const context={version:'clear-self-preview-context.1',previewContextRef:'c'.repeat(64),
    sourceHash:p.sourceHash,bodyHash:p.bodyHash,model:p.model,expiresAtExclusive:Math.floor(now/1000)+60,
    automaticEligibility:false,paymentAllowed:false};
  context.approvalBindingHash=hash({domain:'CLEAR_SELF_PREVIEW_APPROVAL_1',contextRef:context.previewContextRef,
    scopeHash,sourceHash:p.sourceHash,bodyHash:p.bodyHash,model:p.model,limitsHash:hash(limits),
    artifactHash:config.artifactHash,deploymentEpoch:config.deploymentEpoch,expiresAtExclusive:context.expiresAtExclusive});
  const registration={version:'clear-peer-registration.1',releaseHash:hash(release),scopeHash,context,
    targetRef:release.targetRef,planTarget:release.planTarget,approvalRef:'approval-one'};
  const key=randomBytes(32),store=openStore(config.databasePath);
  const replay=createPeerReplayStore({path:join(root,'state','peer.sqlite'),clock:()=>Math.floor(now/1000)});
  const calls=[];
  const adapter=transport??{execution:'OFFLINE',async request(model,method) {
    calls.push(method);
    return method==='countTokens'?{totalTokens:100}:{candidates:[{finishReason:'STOP',content:{role:'model',
      parts:[{text:JSON.stringify({clauses:sourceClauses(sourceText).map(c=>({quote:c.text,start:c.start,end:c.end,
        status:'SUPPORTED',capability:'MOODLE_ACTIVITY_COMPLETION.1',question:null}))})}]}}]};
  }};
  const testReceipts=receipts??{id:'test-receipts',ready:true,context:v=>({version:'test-context',...v}),
    draft:v=>({version:'test-draft',...v}),review:v=>({version:'test-review',...v}),
    observation:v=>({version:'test-observation',...v})};
  const engine=createPeerEngine({release,registration,key,replay,store,receipts:testReceipts,
    offlineTransport:adapter,clock:()=>now});
  t.after(()=>{engine.close();replay.close();store.close();rmSync(root,{recursive:true,force:true});});
  let seq=0;
  function request(path,value,{proposalHash=ZERO_HASH,...overrides}={}) {
    const body=Buffer.from(JSON.stringify(value));
    const meta={version:'clear-preview-peer.1',kind:'REQUEST',...pin,method:'POST',path,
      requestRef:(++seq).toString(16).padStart(64,'0'),contextRef:context.previewContextRef,
      sourceHash:context.sourceHash,proposalHash,bodyHash:digest(body),issuedAt:Math.floor(now/1000),
      expiresAtExclusive:Math.floor(now/1000)+5,requestHash:ZERO_HASH,status:0,...overrides};
    delete meta.origin;delete meta.maxClockSkewSeconds;
    return encodePeer(meta,body,key);
  }
  const prepare={version:'clear-preview-peer-context-registration.1',context,
    release:{deploymentEpoch:config.deploymentEpoch,artifactHash:config.artifactHash,model:p.model,limitsHash:hash(limits)},
    toolBinding:{tool:'moodle.activity.public',planTarget:release.planTarget,observationTargetRef:release.targetRef},
    modelCapability:'OFFLINE_TEST',observationCapability:'B_VERIFIED_MOODLE',dataMode:'SYNTHETIC_ONLY'};
  const send=async(path,value,options)=>JSON.parse(decodePeer(await engine.handle(path,request(path,value,options)),key).body);
  const approve=()=>store.register({ref:registration.approvalRef,bodyHash:context.bodyHash,
    bindingHash:context.approvalBindingHash,expires:context.expiresAtExclusive*1000},now);
  return {engine,store,replay,release,registration,context,key,calls,request,send,prepare,approve,
    clock:()=>now,advance:ms=>now+=ms};
}
const prepare='/v1/preview/prepare',generate='/v1/preview/generate',review='/v1/preview/execute',result='/v1/preview/observation-result';
test('signed registration creates no approval; approved draft/review/target result and replay over HTTP',async t=>{
  const f=setup(t);
  const server=createPeerServer({engine:f.engine,origin:f.release.config.publicOrigin});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const wire=f.request(prepare,f.prepare);
  async function post(raw) {
    return new Promise((resolve,reject)=>{
      const req=http.request({host:'127.0.0.1',port:server.address().port,path:prepare,method:'POST',
        headers:{host:'peer.example.invalid','content-type':'application/json'}},res=>{
        res.resume();res.on('end',()=>resolve(res.statusCode));
      });req.on('error',reject);req.end(raw);
    });
  }
  assert.equal(await post(wire),200);assert.equal(await post(wire),422);
  await assert.rejects(f.send(prepare,f.prepare));
  await assert.rejects(f.send(generate,{sourceText,approvalRef:'approval-one'}),/APPROVAL_REQUIRED_OR_SPENT/);
  assert.deepEqual(f.calls,[]);
  f.approve();
  const draft=await f.send(generate,{sourceText,approvalRef:'approval-one'});
  assert.equal(draft.actualModelCall,false);assert.equal(draft.modelProvenance,'OFFLINE_TEST_TRANSPORT');
  const proposalHash=draft.input.proposalHash;
  const triple={targetRef:f.release.targetRef,status:'COMPLETE',observedAt:Math.floor(f.clock()/1000)};
  await assert.rejects(f.send(result,triple,{proposalHash}),/PEER_REVIEW/);
  await f.send(review,{draftId:draft.input.draftId,proposalHash},{proposalHash});
  await assert.rejects(f.send(result,{...triple,targetRef:'other'},{proposalHash}),/PEER_OBSERVATION/);
  const receipt=await f.send(result,triple,{proposalHash});
  assert.equal(receipt.modelExecution,'OFFLINE');
  await assert.rejects(f.send(result,triple,{proposalHash}));
  assert.deepEqual(f.calls,['countTokens','generateContent']);
});
test('release/scope/context binding tampering and real receipts reject offline provenance',t=>{
  const f=setup(t);
  for(const change of [{scopeHash:'d'.repeat(64)},{targetRef:'other'},{releaseHash:'e'.repeat(64)},
    {context:{...f.context,expiresAtExclusive:f.context.expiresAtExclusive+1}}]) {
    assert.throws(()=>validateRegistration({...f.registration,...change},f.release,f.clock()));
  }
  assert.throws(()=>peerReceipts.draft({actualModelCall:false,modelProvenance:'OFFLINE_TEST_TRANSPORT'}),/PROVENANCE/);
  assert.throws(()=>peerReceipts.observation({modelExecution:'OFFLINE'}),/PROVENANCE/);
});
test('close during count aborts pending work with spent approval and no later generation',async t=>{
  let entered,release,signal;
  const started=new Promise(resolve=>entered=resolve);
  const calls=[];
  const f=setup(t,{transport:{execution:'OFFLINE',request(model,method,body,s) {
    calls.push(method);signal=s;entered();return new Promise(resolve=>release=resolve);
  }}});
  await f.send(prepare,f.prepare);f.approve();
  const pending=f.send(generate,{sourceText,approvalRef:'approval-one'});
  await started;f.engine.close();
  await assert.rejects(pending);
  assert.equal(signal.aborted,true);release({totalTokens:100});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls,['countTokens']);
  assert.throws(()=>f.store.consume('approval-one',f.context.bodyHash,f.context.approvalBindingHash, f.clock),/APPROVAL_REQUIRED_OR_SPENT/);
});
test('B vendored codec and contract match exact upstream bytes',()=>{
  const provenance=JSON.parse(readFileSync(new URL('../vendor/b-peer/SOURCE.json',import.meta.url)));
  for(const [name,sha] of Object.entries(provenance.files)) {
    const bytes=readFileSync(new URL('../vendor/b-peer/'+name,import.meta.url));
    assert.equal(digest(bytes),sha);
    // Git object evidence is local-only. CI still checks the committed SHA-256.
    if(process.env.CLEAR_VERIFY_B_GIT) assert.deepEqual(bytes,execFileSync('git',['show',provenance.commit+':'+provenance.sourceDirectory+'/'+name]));
  }
});
test('registration and response correlation reject forged source, expired request and extra payload fields',async t=>{
  const f=setup(t);
  await assert.rejects(f.send(prepare,f.prepare,{sourceHash:'f'.repeat(64)}),/PEER_CONTEXT/);
  await assert.rejects(f.send(prepare,{...f.prepare,approval:true}));
  const wire=f.request(prepare,f.prepare);
  f.advance(5000);
  await assert.rejects(f.engine.handle(prepare,wire),/PEER_EXPIRED/);
});
test('failed review response encoding leaves review unavailable',async t=>{
  const f=setup(t,{receipts:{id:'test-receipts',ready:true,context:v=>v,draft:v=>v,
    review(){throw Error('TEST_ENCODE_FAILURE');},observation:v=>v}});
  await f.send(prepare,f.prepare);f.approve();
  const draft=await f.send(generate,{sourceText,approvalRef:'approval-one'});
  const proposalHash=draft.input.proposalHash;
  await assert.rejects(f.send(review,{draftId:draft.input.draftId,proposalHash},{proposalHash}),/TEST_ENCODE_FAILURE/);
  await assert.rejects(f.send(result,{targetRef:f.release.targetRef,status:'COMPLETE',
    observedAt:Math.floor(f.clock()/1000)},{proposalHash}),/PEER_REVIEW/);
});

test('signed prepare requires the exact owner release snapshot before activating context',async t=>{
  const f=setup(t);
  const missing={...f.prepare};delete missing.release;
  await assert.rejects(f.send(prepare,missing));
  for(const change of [
    {artifactHash:'d'.repeat(64)}, {limitsHash:'e'.repeat(64)},
    {deploymentEpoch:'00000000-0000-4000-8000-000000000002'},
    {model:'other-model'}, {unexpected:true}
  ]) await assert.rejects(f.send(prepare,{...f.prepare,release:{...f.prepare.release,...change}}));
  await assert.rejects(f.send(prepare,{...f.prepare,context:{...f.context,model:'other-model'}}),/PEER_RELEASE/);
  await assert.rejects(f.send(prepare,f.prepare,{deploymentEpoch:'00000000-0000-4000-8000-000000000002'}));
  await assert.rejects(f.send(generate,{sourceText,approvalRef:'approval-one'}),/PEER_NOT_REGISTERED/);
  assert.deepEqual(f.calls,[]);
  await f.send(prepare,f.prepare);
  await assert.rejects(f.send(generate,{sourceText,approvalRef:'approval-one'}),/APPROVAL_REQUIRED_OR_SPENT/);
  assert.deepEqual(f.calls,[]);
});
