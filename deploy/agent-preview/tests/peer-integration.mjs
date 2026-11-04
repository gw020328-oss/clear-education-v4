import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import {createOfflinePeer} from './offline-peer.mjs';
import {bindingHash,validateConfig} from '../config.mjs';
import {openStore} from '../store.mjs';
import {limits} from '../limits.mjs';
import {createService} from '../service.mjs';

const peerHead='3d6c3ff7e8252575155d553247cacab2b699026f';
assert.ok(process.env.CLEAR_B_PEER_WORKTREE,'set CLEAR_B_PEER_WORKTREE to the B checkout');
const root=resolve(process.env.CLEAR_B_PEER_WORKTREE);
const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
assert.equal(git('rev-parse','HEAD'),peerHead);
assert.equal(git('status','--porcelain','--untracked-files=all','--','.',':(exclude)node_modules'),'');
const load=path=>import(pathToFileURL(join(root,path)));
const [protocol,{createPreviewContexts,PREVIEW_CONTEXT_VERSION},{studentFixture},{prepareGeminiStructureRequest},
  {sourceClauses},{hash}]=await Promise.all([
  load('src/agent-preview/moodle-binding/peer-transport.mjs'),
  load('src/agent-preview/moodle-binding/preview-context.mjs'),
  load('tests/agent-preview/fixtures/binding-student-fixture.mjs'),
  load('src/agent-preview/gemini-preparation.mjs'),
  load('src/agent-preview/index.mjs'),
  load('src/agent-preview/moodle-binding/contract.mjs')
]);
const sourceText='Moodle에서 첫 학습 활동을 마쳐야 한다';
const paths=['/v1/preview/generate','/v1/preview/observation-result'];
const bytes=value=>Buffer.from(JSON.stringify(value));

test('exact B student context, signed draft and reviewed observation over isolated D HTTP',async t=>{
  const f=await studentFixture(t);
  const attempt=f.start(),preview=await f.preview(attempt);
  await f.complete(attempt,preview);
  const clock=()=>f.state.wall;
  const config=validateConfig({version:'clear-external-preview-config.1',publicOrigin:'https://127.0.0.1',port:8080,
    institutionId:'synthetic',courseId:'2',operatorId:'2',dataMode:'DEMO_ACCOUNTS_ONLY',
    artifactHash:'a'.repeat(64),deploymentEpoch:'00000000-0000-4000-8000-000000000001',
    databasePath:join(f.root,'d-approvals.sqlite'),sharedSecretFile:join(f.root,'unused')});
  const contexts=createPreviewContexts({authentication:f.auth,student:f.student,coordinator:f.runtime,
    applicationId:f.registry.applicationId,targetRef:'page-manual',issuerEpoch:f.policy.issuerEpoch,
    deployment:()=>({deploymentEpoch:config.deploymentEpoch,artifactHash:config.artifactHash,
      model:'gemini-3.5-flash-lite',limitsHash:hash(limits),validUntil:2000}),
    prepareModel:prepareGeminiStructureRequest,timePolicy:f.config.timePolicy,clock});
  t.after(()=>contexts.close());
  assert.throws(()=>contexts.issue({}, {version:PREVIEW_CONTEXT_VERSION,sourceText}));
  const issued=contexts.issue(f.context,{version:PREVIEW_CONTEXT_VERSION,sourceText});
  const store=openStore(config.databasePath);
  t.after(()=>store.close());
  assert.throws(()=>createService({config,store,clock:()=>clock()*1000,offlinePeerContext:issued}),/OFFLINE_PEER_CONTEXT/);
  const approve=(ref,binding)=>store.register({ref,bodyHash:issued.bodyHash,bindingHash:binding,
    expires:issued.expiresAtExclusive*1000},clock()*1000);
  approve('v0-approval',bindingHash(config));
  approve('b-peer-approval',issued.approvalBindingHash);
  const rows=sourceClauses(sourceText).map(c=>({quote:c.text,start:c.start,end:c.end,status:'SUPPORTED',
    capability:'MOODLE_ACTIVITY_COMPLETION.1',question:null}));
  const modelCalls=[];
  const modelTransport={execution:'OFFLINE',async request(model,method) {
    modelCalls.push(method);
    return method==='countTokens'?{totalTokens:100}:{candidates:[{finishReason:'STOP',
      content:{role:'model',parts:[{text:JSON.stringify({clauses:rows})}]}}]};
  }};
  const pins=paths.map(path=>({keyRef:'synthetic-key',sender:'B',receiver:'D',audience:'synthetic-preview',
    deploymentEpoch:config.deploymentEpoch,path,origin:'https://127.0.0.1',maxClockSkewSeconds:0}));
  const key=randomBytes(32);
  const replay=label=>{
    const dir=join(f.root,label);
    mkdirSync(dir,{mode:0o700});
    const db=protocol.createPeerReplayStore({path:join(dir,'replay.sqlite'),clock});
    t.after(()=>db.close());
    return db;
  };
  const fixture=createOfflinePeer({protocol,pins,key,replay:replay('d-peer'),context:issued,targetRef:'page-manual',
    timePolicy:f.config.timePolicy,config,store,modelTransport,clock});
  const port=await fixture.listen();
  t.after(()=>fixture.close());
  const requests=[];
  const fetchImpl=(url,{method,body,headers,signal})=>new Promise((resolve,reject)=>{
    const {origin,pathname}=new URL(url);
    assert.equal(origin,'https://127.0.0.1');
    assert.ok(paths.includes(pathname));
    requests.push({pathname,body:Buffer.from(body)});
    const req=http.request({host:'127.0.0.1',port,path:pathname,method,
      headers:{...headers,host:'127.0.0.1'},signal},res=>{
      const chunks=[];
      res.on('data',chunk=>chunks.push(chunk));
      res.on('error',reject);
      res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,
        headers:{'content-type':res.headers['content-type']}})));
    });
    req.on('error',reject);
    req.end(body);
  });
  const bReplay=replay('b-peer');
  const [generate,deliver]=pins.map(pin=>{
    const transport=protocol.createPeerTransport({pin,key,replay:bReplay,clock,activation:'OFFLINE_TEST',fetchImpl});
    t.after(()=>transport.close());
    return transport;
  });
  const correlation={contextRef:issued.previewContextRef,sourceHash:issued.sourceHash,proposalHash:protocol.ZERO_HASH,
    expiresAtExclusive:issued.expiresAtExclusive};
  await assert.rejects(generate.query(bytes({sourceText,approvalRef:'v0-approval'}),correlation),/PEER_HTTP/);
  await assert.rejects(generate.query(bytes({sourceText:'다른 원문',approvalRef:'b-peer-approval'}),correlation),/PEER_HTTP/);
  assert.deepEqual(modelCalls,[]);
  const {input,proposal}=JSON.parse(await generate.query(bytes({sourceText,approvalRef:'b-peer-approval'}),correlation));
  assert.deepEqual(modelCalls,['countTokens','generateContent']);
  assert.deepEqual(proposal,{sourceText,rows});
  assert.equal(input.approvalBindingHash,issued.approvalBindingHash);
  assert.throws(()=>store.consume('b-peer-approval',issued.bodyHash,issued.approvalBindingHash,()=>clock()*1000),
    /APPROVAL_REQUIRED_OR_SPENT/);
  assert.throws(()=>contexts.acceptVerifiedDraft(f.context,input,{...proposal,rows:[]}));
  contexts.acceptVerifiedDraft(f.context,input,proposal);
  const review={previewContextRef:input.previewContextRef,draftId:input.draftId,proposalHash:input.proposalHash};
  const request={version:PREVIEW_CONTEXT_VERSION,...review};
  const triple={targetRef:'page-manual',status:'COMPLETE',observedAt:clock()};
  const afterDraft={...correlation,proposalHash:input.proposalHash};
  await assert.rejects(contexts.observe(f.context,request),/CONTEXT_REVIEW_OR_BUSY/);
  await assert.rejects(deliver.query(bytes(triple),afterDraft),/PEER_HTTP/);
  contexts.review(f.context,request);
  fixture.confirmReview(review);
  for(const [payload,correlation] of [
    [triple,{...afterDraft,proposalHash:'f'.repeat(64)}],
    [triple,{...afterDraft,contextRef:'wrong-context'}],
    [triple,{...afterDraft,sourceHash:'f'.repeat(64)}],
    [{...triple,targetRef:'other-page'},afterDraft],
    [{...triple,observedAt:clock()-10},afterDraft],
    [{...triple,observedAt:clock()*1000},afterDraft],
    [{...triple,studentRef:'injected'},afterDraft]
  ]) await assert.rejects(deliver.query(bytes(payload),correlation),/PEER_HTTP/);
  const observed=await contexts.observe(f.context,request);
  assert.throws(()=>contexts.deliverObservation(f.context,review,{...observed},deliver),/CONTEXT_DELIVERY_EXPIRED/);
  const receipt=JSON.parse(await contexts.deliverObservation(f.context,review,observed,deliver));
  assert.deepEqual(receipt,{version:'clear-offline-observation-receipt.1',observation:triple,
    provenance:'OFFLINE_TEST',automaticEligibility:false,paymentAllowed:false});
  const last=requests.at(-1);
  const replayed=await fetchImpl('https://127.0.0.1'+last.pathname,{method:'POST',body:last.body,
    headers:{'content-type':'application/json'}});
  assert.equal(replayed.status,422);
  assert.throws(()=>contexts.deliverObservation(f.context,review,observed,deliver),/CONTEXT_DELIVERY_EXPIRED/);
  await assert.rejects(deliver.query(bytes(triple),afterDraft),/PEER_HTTP/);
  assert.deepEqual(modelCalls,['countTokens','generateContent']);
});

test('peer wire deadline during countTokens prevents generation and leaves approval spent',async t=>{
  let now=1000000;
  const prepared=prepareGeminiStructureRequest(sourceText);
  const config={institutionId:'synthetic',courseId:'2',operatorId:'2'};
  const context={version:PREVIEW_CONTEXT_VERSION,previewContextRef:'a'.repeat(64),sourceHash:prepared.sourceHash,
    bodyHash:prepared.bodyHash,model:prepared.model,approvalBindingHash:'b'.repeat(64),
    expiresAtExclusive:1060,automaticEligibility:false,paymentAllowed:false};
  const store=openStore(':memory:');
  const calls=[];
  const service=createService({config,store,offlinePeerContext:context,clock:()=>now,
    modelTransport:{execution:'OFFLINE',async request(model,method) {
      calls.push(method);
      now=1005000;
      return {totalTokens:100};
    }}});
  t.after(()=>{service.close();store.close();});
  store.register({ref:'fixture-approval',bodyHash:context.bodyHash,bindingHash:context.approvalBindingHash,
    expires:context.expiresAtExclusive*1000},now);
  await assert.rejects(service.generate({...config,sourceText,approvalRef:'fixture-approval'},
    {offlinePeerDeadline:1005000}),/APPROVAL_EXPIRED/);
  assert.deepEqual(calls,['countTokens']);
  assert.throws(()=>store.consume('fixture-approval',context.bodyHash,context.approvalBindingHash,()=>now),
    /APPROVAL_REQUIRED_OR_SPENT/);
});
