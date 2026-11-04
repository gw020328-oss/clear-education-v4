import assert from 'node:assert/strict';
import {createServer} from 'node:https';
import {request as httpRequest} from 'node:http';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {studentFixture} from './binding-student-fixture.mjs';
import {createCertificates,loadTls} from '../../../src/dev/tls.mjs';
import {availablePort,tlsRequest} from '../../../specs/m3/http-demo.mjs';
import {createPreviewAuthenticationHandler} from '../../../src/application/http.mjs';
import {createPreviewDevelopmentHandler} from '../../../src/product-workflow/http-development.mjs';
import {createPreviewContexts,PREVIEW_CONTEXT_VERSION as version} from '../../../src/agent-preview/moodle-binding/preview-context.mjs';
import {createRegisteredPreviewService} from '../../../src/agent-preview/moodle-binding/preview-registered.mjs';
import {createLocalObservationBridge} from '../../../src/agent-preview/moodle-binding/preview-local.mjs';
import * as protocol from '../../../src/agent-preview/moodle-binding/peer-transport.mjs';
import {hash,canonical} from '../../../src/agent-preview/moodle-binding/contract.mjs';
import {prepareGeminiStructureRequest} from '../../../src/agent-preview/gemini-preparation.mjs';
import {sourceClauses} from '../../../src/agent-preview/index.mjs';
import {loadInstalledMoodle} from './installed-moodle-peer.mjs';

export const sourceText='Python 기초 강의 완료';
export const dHead='ff0bef2c57312ddbf7006c295dbc583e3938a822';
const paths=['prepare','generate','execute','observation-result'].map(v=>'/v1/preview/'+v);
const toolBinding={tool:'moodle.activity.public',planTarget:'python-intro',observationTargetRef:'core-page-manual-mark'};
async function loadD(){
  const root=resolve(process.env.CLEAR_D_REGISTERED_WORKTREE);
  const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
  assert.equal(git('rev-parse','HEAD'),dHead);
  assert.equal(git('status','--porcelain','--untracked-files=all','--','.',':(exclude)node_modules'),'');
  const modules=await Promise.all(['peer-engine','peer-http','peer-runtime','peer-receipts','peer-release','store','limits'].map(name=>import(pathToFileURL(join(root,'deploy/agent-preview',name+'.mjs')))));
  return Object.assign({},...modules);
}
export async function registeredFixture(t,{actual=false,installed=false,tamper,failModel=false,onRuntimeStart}={}){
  const d=await loadD(),c=installed?loadInstalledMoodle():null;
  const origin=`https://127.0.0.1:${await availablePort()}`;
  const f=await studentFixture(t,{origin,clock:()=>Math.floor(Date.now()/1000),sourceProfile:c?.profile??{targetRef:toolBinding.observationTargetRef}});
  const cleanup=[];t.after(async()=>{for(const fn of cleanup.reverse())await fn();});
  const tlsRoot=join(f.root,'tls');mkdirSync(tlsRoot,{mode:0o700});
  const tls=loadTls(tlsRoot,createCertificates(tlsRoot)),ca=readFileSync(join(tlsRoot,'ca.pem'));
  let handler=createPreviewAuthenticationHandler(f.auth);
  const browser=createServer(tls,(req,res)=>handler(req,res));
  await new Promise(resolve=>browser.listen(Number(new URL(origin).port),'127.0.0.1',resolve));
  cleanup.push(()=>new Promise(resolve=>{browser.close(resolve);browser.closeAllConnections();}));
  const browserRequest=tlsRequest(origin,ca);
  const nonce=await browserRequest('/auth/nonce',{method:'POST',body:{wallet:f.alice.address,chainId:31337}});
  const login=await browserRequest('/auth/verify',{method:'POST',headers:{cookie:nonce.headers['set-cookie'][0].split(';')[0]},
    body:{nonce:nonce.body.nonce,signature:await f.alice.signMessage(nonce.body.message)}});
  assert.equal(login.status,200);
  const cookie=login.headers['set-cookie'].find(v=>v.startsWith('__Host-clear-preview-session=')).split(';')[0];
  Object.assign(f.context,{token:cookie.split('=')[1],csrf:login.body.csrf});
  const headers={cookie,'x-wallet':f.alice.address,'x-chain-id':'31337','x-csrf-token':f.context.csrf};
  const request=(path,body)=>browserRequest(path,{method:'POST',headers,body});
  const confirmationExpiry=f.state.wall+290,confirmedAt=f.state.wall-1;
  f.state.query=c?c.confirmation:async request=>{
    const value=f.respond(request);
    return {...value,...(value.confirmedAt?{confirmedAt}:{}),expiresAtExclusive:confirmationExpiry,
      ...(value.observations?{observations:value.observations.map(v=>({...v,targetRef:toolBinding.observationTargetRef}))}:{})};
  };
  const attempt=f.start();
  if(c){await assert.rejects(f.preview(attempt),/C_CONFIRMATION_SETUP_REQUIRED/);await c.provision();}
  await f.complete(attempt,await f.preview(attempt));
  const trace=[],calls=[],key=randomBytes(32);
  const replay=name=>{const r=protocol.createPeerReplayStore({path:join(f.root,name+'.sqlite'),clock:()=>f.state.wall});cleanup.push(()=>r.close());return r;};
  let observations={read:(_scope,operation)=>operation()};
  if(c){const transport=c.transport({replay:replay('c-client'),trace});cleanup.push(()=>transport.close());
    observations=createLocalObservationBridge({mode:'LOCAL_SYNTHETIC_ONLY',transport});f.config.verifier=observations.verifier;f.reopen();}
  const dPort=await availablePort(),proxyPort=actual?await availablePort():dPort;
  const config={version:'clear-external-preview-config.1',publicOrigin:`https://127.0.0.1:${proxyPort}`,port:dPort,
    institutionId:'synthetic',courseId:'2',operatorId:'2',dataMode:'DEMO_ACCOUNTS_ONLY',artifactHash:'a'.repeat(64),
    deploymentEpoch:'00000000-0000-4000-8000-000000000001',databasePath:join(f.root,'approvals.sqlite'),sharedSecretFile:join(f.root,'peer-key')};
  const pin={keyRef:'synthetic-key',sender:'B',receiver:'D',audience:'registered-preview',deploymentEpoch:config.deploymentEpoch,
    origin:config.publicOrigin,maxClockSkewSeconds:0};
  const release={version:'clear-peer-release.1',mode:actual?'ACTUAL_GEMINI':'OFFLINE_TEST',config,pin,
    targetRef:toolBinding.observationTargetRef,planTarget:toolBinding.planTarget,maxObservationAgeSeconds:10,
    receiptContract:actual?d.peerReceipts.id:'clear-b-test-receipts-v1'};
  d.validateRelease(release);
  let deployment={deploymentEpoch:config.deploymentEpoch,artifactHash:config.artifactHash,model:'gemini-3.5-flash-lite',limitsHash:hash(d.limits),validUntil:f.policy.validUntil};
  const contexts=createPreviewContexts({authentication:f.auth,student:f.student,coordinator:f.runtime,applicationId:f.registry.applicationId,
    targetRef:toolBinding.observationTargetRef,issuerEpoch:f.policy.issuerEpoch,deployment:()=>deployment,
    prepareModel:prepareGeminiStructureRequest,timePolicy:f.config.timePolicy,clock:()=>f.state.wall});
  const transports=await Promise.all(paths.map(async path=>{
    const transport=await protocol.createLocalSyntheticPeerTransport({mode:'LOCAL_SYNTHETIC_ONLY',pin:{...pin,path},key,ca,
      replay:replay('b-'+path.split('/').at(-1)),clock:()=>f.state.wall});cleanup.push(()=>transport.close());
    return {...transport,async query(body,correlation,options){
      trace.push({path,payload:JSON.parse(body),correlation});
      const next=tamper?.request?.(path,JSON.parse(body));
      return transport.query(next?Buffer.from(canonical(next)):body,correlation,options);
    }};
  }));
  const owner={modelMode:release.mode,releaseHash:hash(release),release:{deploymentEpoch:deployment.deploymentEpoch,
    artifactHash:deployment.artifactHash,model:deployment.model,limitsHash:deployment.limitsHash},toolBinding,approvalRef:'fixture-approval-one'};
  const service=createRegisteredPreviewService({mode:'LOCAL_SYNTHETIC_ONLY',owner,contexts,prepare:transports[0],generation:transports[1],
    review:transports[2],delivery:transports[3],observations});cleanup.push(()=>service.close());
  handler=await createPreviewDevelopmentHandler({enabled:true,authentication:f.auth,contexts:service});
  const issued=await request('/preview/context',{version,sourceText});assert.equal(issued.status,200);
  const input={version,previewContextRef:issued.body.previewContextRef};
  const registration=service.ownerRegistration(f.context,input);
  d.validateRegistration(registration,release,Date.now());
  let store;
  if(actual){
    const releaseFile=join(f.root,'release.json'),registrationFile=join(f.root,'registration.json');
    for(const [path,value] of [[releaseFile,release],[registrationFile,registration]])writeFileSync(path,JSON.stringify(value),{mode:0o600});
    writeFileSync(config.sharedSecretFile,key.toString('hex'),{mode:0o600});
    const previous=process.env.CLEAR_PEER_REGISTRATION;process.env.CLEAR_PEER_REGISTRATION=registrationFile;
    onRuntimeStart?.();
    let runtime;try{runtime=await d.startPeerRuntime(releaseFile);}finally{if(previous===undefined)delete process.env.CLEAR_PEER_REGISTRATION;else process.env.CLEAR_PEER_REGISTRATION=previous;}
    cleanup.push(()=>runtime.stop());
    const proxy=createServer(tls,(req,res)=>{
      const upstream=httpRequest({host:'127.0.0.1',port:dPort,path:req.url,method:req.method,headers:req.headers},reply=>{
        res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);
      });upstream.on('error',()=>res.destroy());res.once('close',()=>upstream.destroy());req.pipe(upstream);
    });
    await new Promise(resolve=>proxy.listen(proxyPort,'127.0.0.1',resolve));cleanup.push(()=>new Promise(resolve=>{proxy.close(resolve);proxy.closeAllConnections();}));
  }else{
    store=d.openStore(config.databasePath);cleanup.push(()=>store.close());
    const wrap=(phase,value)=>tamper?.response?.(phase,value)??value;
    const receipts={id:release.receiptContract,ready:true,
      context:v=>wrap('prepare',{version:'clear-preview-test-context-receipt.1',...v}),
      draft:v=>wrap('generate',{version:'clear-preview-test-peer-draft.1',...v}),
      review:v=>wrap('execute',{version:'clear-preview-test-review-receipt.1',...v}),
      observation:({observation})=>wrap('observation-result',{version:'clear-preview-test-observation-receipt.1',observation,
        modelProvenance:'OFFLINE_TEST_TRANSPORT',observationProvenance:'B_VERIFIED_MOODLE',dataMode:'SYNTHETIC_ONLY',automaticEligibility:false,paymentAllowed:false})};
    const engine=d.createPeerEngine({release,registration,key,replay:replay('d'),store,receipts,offlineTransport:{execution:'OFFLINE',async request(_model,method){
      calls.push(method);if(failModel)throw Error('TEST_MODEL_FAILURE');
      const rows=sourceClauses(sourceText).map(c=>({quote:c.text,start:c.start,end:c.end,status:'SUPPORTED',capability:'MOODLE_ACTIVITY_COMPLETION.1',question:null}));
      return method==='countTokens'?{totalTokens:100}:{candidates:[{finishReason:'STOP',content:{role:'model',parts:[{text:JSON.stringify({clauses:rows})}]}}]};
    }}});cleanup.push(()=>engine.close());
    const server=d.createPeerServer({engine,origin:config.publicOrigin,tls});
    await new Promise(resolve=>server.listen(dPort,'127.0.0.1',resolve));cleanup.push(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  }
  const approvals=()=>{const db=new DatabaseSync(config.databasePath,{readOnly:true});try{return db.prepare('SELECT ref,consumed FROM approvals').all();}finally{db.close();}};
  const approve=()=>{assert.ok(!actual,'NO_ACTUAL_MODEL_GRANT_IN_TEST');store.register({ref:owner.approvalRef,bodyHash:issued.body.bodyHash,
    bindingHash:issued.body.approvalBindingHash,expires:issued.body.expiresAtExclusive*1000});};
  const generate={...input,sourceText,approvalRef:owner.approvalRef};
  const draftInput=draft=>({...input,draftId:draft.input.draftId,proposalHash:draft.input.proposalHash});
  return {f,request,issued:issued.body,input,generate,draftInput,approve,approvals,calls,trace,contexts,service,registration,release,
    changeRelease:delta=>deployment={...deployment,...delta}};
}
