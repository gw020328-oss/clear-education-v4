import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpsRequest } from 'node:https';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { studentFixture } from './fixtures/binding-student-fixture.mjs';
import { createCertificates, loadTls } from '../../src/dev/tls.mjs';
import { availablePort, tlsRequest } from '../../specs/m3/http-demo.mjs';
import { createPreviewAuthenticationHandler } from '../../src/application/http.mjs';
import { createPreviewDevelopmentHandler } from '../../src/product-workflow/http-development.mjs';
import { createPreviewContexts, PREVIEW_CONTEXT_VERSION } from '../../src/agent-preview/moodle-binding/preview-context.mjs';
import { createLocalPreviewService, createLocalObservationBridge } from '../../src/agent-preview/moodle-binding/preview-local.mjs';
import * as protocol from '../../src/agent-preview/moodle-binding/peer-transport.mjs';
import { canonical, hash, exact } from '../../src/agent-preview/moodle-binding/contract.mjs';
import { prepareGeminiStructureRequest } from '../../src/agent-preview/gemini-preparation.mjs';
import { sourceClauses, reviewModelProposal } from '../../src/agent-preview/index.mjs';

const mode = 'LOCAL_SYNTHETIC_ONLY';
const sourceText = 'Python 기초 강의 완료';
const toolBinding = {tool:'moodle.activity.public',planTarget:'python-intro',observationTargetRef:'page-manual'};
const version = PREVIEW_CONTEXT_VERSION;
const bodyBytes = value => Buffer.from(canonical(value));

const dHead = 'bf5f41c62be8ff23bd167905e645e4915ab4e01c';
async function loadD() {
  const root = resolve(process.env.CLEAR_D_PEER_WORKTREE);
  const git = (...args) => execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
  assert.equal(git('rev-parse','HEAD'),dHead);
  assert.equal(git('status','--porcelain','--untracked-files=all','--','.',':(exclude)node_modules'),'');
  const load = path => import(pathToFileURL(join(root,'deploy/agent-preview',path)));
  const [peer,config,store,limits] = await Promise.all([load('tests/offline-peer.mjs'),load('config.mjs'),load('store.mjs'),load('limits.mjs')]);
  return {...peer,...config,...store,...limits};
}
async function fixture(t, d = null) {
  const port = await availablePort(), origin = `https://127.0.0.1:${port}`;
  const f = await studentFixture(t, {origin});
  const tlsRoot = join(f.root, 'tls');
  mkdirSync(tlsRoot, {mode:0o700});
  const tls = loadTls(tlsRoot, createCertificates(tlsRoot)), ca = readFileSync(join(tlsRoot, 'ca.pem'));
  const close = [];
  t.after(async () => { for(const dispose of close.reverse()) await dispose(); });
  function replay(name) {
    const store = protocol.createPeerReplayStore({path:join(f.root,name+'.sqlite'),clock:()=>f.state.wall});
    close.push(() => store.close());
    return store;
  }
  let browserHandler = createPreviewAuthenticationHandler(f.auth);
  const browser = createServer(tls, (req,res) => browserHandler(req,res));
  await new Promise(resolve => browser.listen(port,'127.0.0.1',resolve));
  close.push(() => new Promise(resolve => {browser.close(resolve);browser.closeAllConnections();}));
  const browserRequest = tlsRequest(origin,ca);
  const challenge = await browserRequest('/auth/nonce',{method:'POST',body:{wallet:f.alice.address,chainId:31337}});
  const login = await browserRequest('/auth/verify',{method:'POST',headers:{cookie:challenge.headers['set-cookie'][0].split(';')[0]},
    body:{nonce:challenge.body.nonce,signature:await f.alice.signMessage(challenge.body.message)}});
  assert.equal(login.status,200);
  const cookie = login.headers['set-cookie'].find(value=>value.startsWith('__Host-clear-preview-session=')).split(';')[0];
  Object.assign(f.context,{token:cookie.split('=')[1],csrf:login.body.csrf});
  const headers = {cookie,'x-wallet':f.alice.address,'x-chain-id':'31337','x-csrf-token':f.context.csrf};
  const started = f.start(), preview = await f.preview(started);
  await f.complete(started,preview);

  const key = randomBytes(32), trace = [], state = {issued:null,draft:null,reviewed:false,delivered:false,badDraft:false,badSource:false,hang:false,entered:null};
  const endpoints = new Map();
  async function peer(name, paths, dispatch) {
    const serverReplay = replay(name+'-server');
    let pins;
    const server = createServer(tls,async(req,res)=>{
      try {
        const pin = pins.get(req.url);
        assert.ok(pin);
        assert.equal(req.method,'POST');
        assert.equal(req.headers.host,new URL(pin.origin).host);
        assert.equal(req.headers['content-type'],'application/json');
        assert.equal(req.headers.cookie,undefined);
        assert.equal(req.headers.origin,undefined);
        const chunks=[];
        let size=0;
        for await(const chunk of req){size+=chunk.length;assert.ok(size<=32768);chunks.push(chunk);}
        const request=protocol.acceptPeerRequest({wire:Buffer.concat(chunks),key,pin,replay:serverReplay});
        trace.push({peer:name,path:req.url,meta:request.meta,payload:JSON.parse(request.body)});
        const result=await dispatch(req.url,JSON.parse(request.body),request.meta);
        if(res.destroyed)return;
        const wire=protocol.encodePeerResponse({request,body:bodyBytes(result),key,pin,now:f.state.wall,expiresAtExclusive:state.issued.expiresAtExclusive});
        res.writeHead(200,{'content-type':'application/json'}).end(wire);
      }catch{if(!res.destroyed)res.writeHead(422,{'content-type':'application/json'}).end('{"code":"FIXTURE_REJECTED"}');}
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    close.push(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
    const peerOrigin=`https://127.0.0.1:${server.address().port}`;
    pins=new Map(paths.map(path=>[path,{keyRef:'synthetic-'+name,sender:'B',receiver:name,audience:'local-'+name,
      deploymentEpoch:'epoch-1',path,origin:peerOrigin,maxClockSkewSeconds:0}]));
    for(const [path,pin] of pins){
      const transport=await protocol.createLocalSyntheticPeerTransport({mode,pin,key,ca,replay:replay(name+'-client-'+endpoints.size),clock:()=>f.state.wall});
      endpoints.set(path,transport);
      close.push(()=>transport.close());
    }
    return {pins,peerOrigin};
  }
  if(!d) await peer('D',['/v1/preview/generate','/v1/preview/execute','/v1/preview/observation-result'],async(path,body,meta)=>{
    assert.equal(meta.contextRef,state.issued.previewContextRef);
    assert.equal(meta.sourceHash,state.issued.sourceHash);
    if(path==='/v1/preview/generate'){
      exact(body,['sourceText','approvalRef']);assert.equal(body.approvalRef,'fixture-only-approval');
      assert.equal(prepareGeminiStructureRequest(body.sourceText).bodyHash,state.issued.bodyHash);
      const rows=sourceClauses(body.sourceText).map(c=>({quote:c.text,start:c.start,end:c.end,status:'SUPPORTED',capability:state.wrongTool?'HACKERRANK_CERTIFICATE_HOLDING.1':'MOODLE_ACTIVITY_COMPLETION.1',question:null}));
      const draft=reviewModelProposal(body.sourceText,rows);
      state.draft={previewContextRef:state.issued.previewContextRef,draftId:'local-draft',proposalHash:draft.proposalHash,
        sourceHash:state.issued.sourceHash,bodyHash:state.issued.bodyHash,approvalBindingHash:state.issued.approvalBindingHash};
      return {input:state.draft,proposal:{sourceText:body.sourceText,rows:state.badDraft?[]:rows}};
    }
    assert.equal(meta.proposalHash,state.draft.proposalHash);
    if(path==='/v1/preview/execute'){
      exact(body,['draftId','proposalHash']);assert.equal(body.draftId,state.draft.draftId);assert.equal(body.proposalHash,state.draft.proposalHash);
      state.reviewed=true;
      return {version:'clear-offline-review-receipt.1',...body,reviewed:true,paymentAllowed:false};
    }
    assert.ok(state.reviewed&&!state.delivered);
    exact(body,['targetRef','status','observedAt']);assert.equal(body.targetRef,'page-manual');
    state.delivered=true;
    return {version:'clear-offline-observation-receipt.1',observation:body,provenance:'OFFLINE_TEST',automaticEligibility:false,paymentAllowed:false};
  });
  const c=await peer('C',['/observations'],async(_path,body,meta)=>{
    assert.equal(meta.contextRef,state.issued.previewContextRef);
    assert.equal(meta.proposalHash,state.draft.proposalHash);
    if(state.hang){state.entered();return new Promise(()=>{});}
    const result=f.respond(body);
    return state.badSource?{...result,subjectRef:'wrong-subject'}:result;
  });
  const observations=createLocalObservationBridge({mode,transport:endpoints.get('/observations')});
  f.config.verifier=observations.verifier;f.reopen();
  const dConfig = d && d.validateConfig({version:'clear-external-preview-config.1',publicOrigin:'https://127.0.0.1',port:8080,
    institutionId:'synthetic',courseId:'2',operatorId:'2',dataMode:'DEMO_ACCOUNTS_ONLY',artifactHash:'a'.repeat(64),
    deploymentEpoch:'00000000-0000-4000-8000-000000000001',databasePath:join(f.root,'d-approvals.sqlite'),sharedSecretFile:join(f.root,'unused')});
  const contexts=createPreviewContexts({authentication:f.auth,student:f.student,coordinator:f.runtime,applicationId:f.registry.applicationId,
    targetRef:'page-manual',issuerEpoch:f.policy.issuerEpoch,deployment:()=>({deploymentEpoch:dConfig?.deploymentEpoch ?? 'epoch-1',artifactHash:'a'.repeat(64),
      model:'gemini-3.5-flash-lite',limitsHash:d?hash(d.limits):'b'.repeat(64),validUntil:2000}),prepareModel:prepareGeminiStructureRequest,
    timePolicy:f.config.timePolicy,clock:()=>f.state.wall});
  const endpoint = path => ({execution:'LOCAL_SYNTHETIC_HTTPS',query(...args){return endpoints.get(path).query(...args);}});
  const flow=createLocalPreviewService({mode,contexts,observations,toolBinding,generation:endpoint('/v1/preview/generate'),
    review:endpoint('/v1/preview/execute'),delivery:endpoint('/v1/preview/observation-result'),clock:()=>f.state.wall});
  close.push(()=>flow.close());
  browserHandler=await createPreviewDevelopmentHandler({enabled:true,authentication:f.auth,contexts:flow});
  const request=(path,body,extra={})=>browserRequest(path,{method:'POST',body,headers:{...headers,...extra}});
  const issued=await request('/preview/context',{version,sourceText});assert.equal(issued.status,200);state.issued=issued.body;
  if(d) {
    const store=d.openStore(dConfig.databasePath);close.push(()=>store.close());
    store.register({ref:'fixture-only-approval',bodyHash:state.issued.bodyHash,bindingHash:state.issued.approvalBindingHash,
      expires:state.issued.expiresAtExclusive*1000},f.state.wall*1000);
    const rows=sourceClauses(sourceText).map(c=>({quote:c.text,start:c.start,end:c.end,status:'SUPPORTED',capability:'MOODLE_ACTIVITY_COMPLETION.1',question:null}));
    const modelTransport={execution:'OFFLINE',async request(_model,method){
      trace.push({modelMethod:method});
      return method==='countTokens'?{totalTokens:100}:{candidates:[{finishReason:'STOP',content:{role:'model',parts:[{text:JSON.stringify({clauses:rows})}]}}]};
    }};
    const dProtocol={...protocol,acceptPeerRequest(args){
      const accepted=protocol.acceptPeerRequest(args);
      trace.push({peer:'D',path:args.pin.path,meta:accepted.meta,payload:JSON.parse(accepted.body)});return accepted;
    }};
    const server=d.createOfflinePeer({tls,protocol:dProtocol,key,replay:replay('fixed-d-server'),context:state.issued,targetRef:'page-manual',
      timePolicy:f.config.timePolicy,config:dConfig,store,modelTransport,clock:()=>f.state.wall});
    const dPort=await server.listen();close.push(()=>server.close());
    const pins=['/v1/preview/generate','/v1/preview/execute','/v1/preview/observation-result'].map(path=>({keyRef:'synthetic-D',sender:'B',receiver:'D',
      audience:'local-D',deploymentEpoch:dConfig.deploymentEpoch,path,origin:`https://127.0.0.1:${dPort}`,maxClockSkewSeconds:0}));
    server.configurePins(pins);
    for(const pin of pins){
      const transport=await protocol.createLocalSyntheticPeerTransport({mode,pin,key,ca,replay:replay('fixed-d-client-'+endpoints.size),clock:()=>f.state.wall});
      endpoints.set(pin.path,transport);close.push(()=>transport.close());
    }
  }
  const generation={version,previewContextRef:issued.body.previewContextRef,sourceText,approvalRef:'fixture-only-approval'};
  async function ready(){
    const draft=await request('/preview/generate',generation);assert.equal(draft.status,200);state.draft=draft.body.input;assert.deepEqual(draft.body.toolBinding,toolBinding);
    const input={version,previewContextRef:state.issued.previewContextRef,draftId:state.draft.draftId,proposalHash:state.draft.proposalHash};
    assert.equal((await request('/preview/review',input)).status,200);
    return input;
  }
  return {f,state,trace,request,browserRequest,headers,origin,ca,flow,contexts,generation,ready,c,key};
}

test('local synthetic HTTPS verifies browser auth, D AST and review, C full DTO and D triple',async t=>{
  const x=await fixture(t);
  await assert.rejects(x.browserRequest('/auth/session',{headers:x.headers,trusted:false}));
  for(const path of ['/runtimes','/applications','/rpc'])assert.equal((await x.request(path,{})).status,404);
  assert.equal((await x.request('/preview/generate',x.generation,{origin:'https://wrong.invalid'})).status,422);
  assert.equal((await x.request('/preview/generate',{...x.generation,subjectRef:'injected'})).status,422);
  x.state.badDraft=true;
  assert.equal((await x.request('/preview/generate',x.generation)).status,422);
  x.state.badDraft=false;x.state.wrongTool=true;
  assert.equal((await x.request('/preview/generate',x.generation)).status,422);
  x.state.wrongTool=false;
  const input=await x.ready();
  x.state.badSource=true;
  assert.equal((await x.request('/preview/observe',input)).status,422);
  assert.equal(x.trace.filter(item=>item.path==='/v1/preview/observation-result').length,0);
  x.state.badSource=false;
  const response=await x.request('/preview/observe',input);
  assert.equal(response.status,200);
  assert.equal(response.body.provenance,'OFFLINE_TEST');
  assert.deepEqual(response.body.observation,{targetRef:'page-manual',status:'COMPLETE',observedAt:1000});
  const c=x.trace.find(item=>item.peer==='C');
  assert.deepEqual(Object.keys(c.payload).sort(),['bindingScopeHash','confirmationRef','issuerEpoch','requestRef','version']);
  const d=x.trace.find(item=>item.path==='/v1/preview/observation-result');
  assert.deepEqual(Object.keys(d.payload).sort(),['observedAt','status','targetRef']);
  assert.equal((await x.request('/preview/observe',input)).status,422);
  assert.equal((await x.request('/auth/logout',{})).status,200);
  assert.equal((await x.request('/preview/observe',input)).status,422);
});

test('browser disconnect cancels current C lookup and leaves no D delivery',async t=>{
  const x=await fixture(t),input=await x.ready();
  x.state.hang=true;
  const entered=new Promise(resolve=>x.state.entered=resolve);
  const req=httpsRequest(x.origin+'/preview/observe',{method:'POST',ca:x.ca,headers:{...x.headers,origin:x.origin,'content-type':'application/json'}});
  req.on('error',()=>{});req.end(JSON.stringify(input));await entered;
  req.destroy();
  for(let i=0;i<30;i++){
    if(x.f.sql('main',"SELECT state FROM requests WHERE kind='OBSERVE'")[0]?.state==='CANCELLED')break;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.equal(x.f.sql('main',"SELECT state FROM requests WHERE kind='OBSERVE'")[0].state,'CANCELLED');
  assert.equal(x.trace.filter(item=>item.path==='/v1/preview/observation-result').length,0);
});


test('fixed D candidate uses its approval store and service through B browser HTTPS',
  {skip:!process.env.CLEAR_D_PEER_WORKTREE},async t=>{
  const x=await fixture(t,await loadD());
  const input=await x.ready();
  const response=await x.request('/preview/observe',input);
  assert.equal(response.status,200);
  assert.deepEqual(response.body,{version:'clear-offline-observation-receipt.1',
    observation:{targetRef:'page-manual',status:'COMPLETE',observedAt:1000},provenance:'OFFLINE_TEST',automaticEligibility:false,paymentAllowed:false});
  assert.deepEqual(x.trace.filter(v=>v.modelMethod).map(v=>v.modelMethod),['countTokens','generateContent']);
  assert.deepEqual(x.trace.filter(v=>v.peer==='D').map(v=>v.path),['/v1/preview/generate','/v1/preview/execute','/v1/preview/observation-result']);
  assert.equal((await x.request('/preview/observe',input)).status,422);
});
