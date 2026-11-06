// No-model-call smoke check of a running D preview server (loopback, container or HTTPS origin).
// Never sends a registered approvalRef, so generate stops at the single-use store before any
// key read or provider dispatch. Prints status/code pairs and public hashes only; never the key.
//
//   CLEAR_SMOKE_ROOT=<repo or /app>             source root providing src/agent-preview/*
//   CLEAR_SMOKE_CONNECT=https://… | http://127.0.0.1:<port>
//   CLEAR_SMOKE_PUBLIC_ORIGIN=https://…          D publicOrigin (sent as Host)
//   CLEAR_SMOKE_SECRET_FILE=<0600 hex64 file>
//   CLEAR_SMOKE_ACTOR='{"institutionId":"…","courseId":"…","operatorId":"…"}'
//   CLEAR_SMOKE_EXPECT='{"bindingHash":"…","limitsHash":"…"}'   (optional)
//   CLEAR_SMOKE_REPLAY_NONCE=<hex32>  (optional) also send a fixed-nonce request twice
import {readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import http from 'node:http';
import https from 'node:https';

const env=process.env,root=env.CLEAR_SMOKE_ROOT??process.cwd();
const load=path=>import(pathToFileURL(join(root,path)).href);
const [{createDPreviewRequest,dPreviewSignature},{hash}]=await Promise.all([
  load('src/agent-preview/d-preview-transport.mjs'),load('src/agent-preview/index.mjs')]);
const stat=statSync(env.CLEAR_SMOKE_SECRET_FILE);
if(!stat.isFile() || (stat.mode&0o077)!==0) throw Error('SMOKE_SECRET_FILE_PERMISSIONS');
const secret=readFileSync(env.CLEAR_SMOKE_SECRET_FILE,'utf8').trim();
const publicOrigin=env.CLEAR_SMOKE_PUBLIC_ORIGIN,connect=new URL(env.CLEAR_SMOKE_CONNECT??publicOrigin);
const actor=JSON.parse(env.CLEAR_SMOKE_ACTOR),expect=env.CLEAR_SMOKE_EXPECT?JSON.parse(env.CLEAR_SMOKE_EXPECT):null;
const sourceText='Python 기초 강의 완료';
const signed=createDPreviewRequest({publicOrigin,connectOrigin:connect.origin,secret});

function raw(path,{body='{}',headers={},method='POST'}={}) {
  const client=connect.protocol==='https:'?https:http;
  return new Promise((resolve,reject)=>{
    // Pin TLS SNI to the connect host. Otherwise Node derives SNI from a test Host header.
    const req=client.request({protocol:connect.protocol,hostname:connect.hostname,port:connect.port,path,method,agent:false,
      ...(connect.protocol==='https:'?{servername:connect.hostname}:{}),
      headers:{host:new URL(publicOrigin).host,'content-type':'application/json',...headers}},res=>{
      const chunks=[];res.on('data',c=>chunks.push(c));
      res.on('end',()=>{let parsed=null;try{parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{}
        resolve({status:res.statusCode,code:parsed?.code??null,body:parsed});});
    });
    req.on('error',reject);req.end(body);
  });
}
function signedHeaders(path,body,nonce=randomBytes(16).toString('hex')) {
  const timestamp=String(Math.floor(Date.now()/1000));
  return {'x-clear-timestamp':timestamp,'x-clear-nonce':nonce,'x-clear-signature':dPreviewSignature(secret,timestamp,nonce,path,Buffer.from(body))};
}
const call=(operation,extra={})=>signed({method:'POST',path:'/v1/preview/'+operation,body:{...actor,sourceText,...extra}},
  {signal:AbortSignal.timeout(20000)});

const results={},prepareBody=JSON.stringify({...actor,sourceText});
results.unauthenticated=await raw('/v1/preview/prepare',{body:prepareBody});
results.wrongHost=await raw('/v1/preview/prepare',{body:prepareBody,headers:{...signedHeaders('/v1/preview/prepare',prepareBody),host:'other.example.invalid'}});
results.browserOrigin=await raw('/v1/preview/prepare',{body:prepareBody,headers:{...signedHeaders('/v1/preview/prepare',prepareBody),origin:publicOrigin}});
results.unknownRoute=await raw('/',{method:'GET',body:''});
const prepared=await call('prepare');
results.prepare={status:prepared.status,code:prepared.body?.code??null,version:prepared.body?.version,
  bindingHash:prepared.body?.bindingHash,limitsHash:prepared.body?.limits?hash(prepared.body.limits):null,
  model:prepared.body?.model,bodyHash:prepared.body?.bodyHash,actualModelCall:prepared.body?.actualModelCall,paymentAllowed:prepared.body?.paymentAllowed};
const unregistered=await call('generate',{approvalRef:'smoke_unregistered_'+randomBytes(6).toString('hex')});
results.generateWithoutApproval={status:unregistered.status,code:unregistered.body?.code??null};
const execute=await call('execute',{draftId:'00000000-0000-4000-8000-000000000000',proposalHash:'0'.repeat(64)});
results.executeWithoutDraft={status:execute.status,code:execute.body?.code??null};
if(env.CLEAR_SMOKE_REPLAY_NONCE) {
  const headers=signedHeaders('/v1/preview/prepare',prepareBody,env.CLEAR_SMOKE_REPLAY_NONCE);
  results.fixedNonceFirst=await raw('/v1/preview/prepare',{body:prepareBody,headers});
  results.fixedNonceSecond=await raw('/v1/preview/prepare',{body:prepareBody,headers});
  for(const k of ['fixedNonceFirst','fixedNonceSecond'])results[k]={status:results[k].status,code:results[k].code};
}
// Behind an HTTPS proxy (Caddy) a foreign Host matches no site and is never forwarded to D:
// no D JSON envelope comes back. Directly (loopback/container) D itself answers HOST_REJECTED.
const wrongHostVia=results.wrongHost.code==='HOST_REJECTED'?'D_HOST_REJECTED'
  :(connect.protocol==='https:'&&results.wrongHost.body===null?'PROXY_NOT_FORWARDED':'UNEXPECTED');
for(const k of ['unauthenticated','wrongHost','browserOrigin','unknownRoute'])results[k]={status:results[k].status,code:results[k].code};
results.wrongHost.via=wrongHostVia;
const checks={
  unauthenticated:results.unauthenticated.status===403&&results.unauthenticated.code==='AUTH_REQUIRED',
  wrongHost:(wrongHostVia==='D_HOST_REJECTED'&&results.wrongHost.status===403)||wrongHostVia==='PROXY_NOT_FORWARDED',
  browserOrigin:results.browserOrigin.status===403&&results.browserOrigin.code==='SERVER_TO_SERVER_ONLY',
  unknownRoute:results.unknownRoute.status===404,
  prepare:results.prepare.status===200&&results.prepare.version==='clear-external-preview-preparation.1'
    &&results.prepare.actualModelCall===false&&results.prepare.paymentAllowed===false
    &&(!expect||(results.prepare.bindingHash===expect.bindingHash&&results.prepare.limitsHash===expect.limitsHash)),
  generateWithoutApproval:results.generateWithoutApproval.status===422&&results.generateWithoutApproval.code==='APPROVAL_REQUIRED_OR_SPENT',
  executeWithoutDraft:results.executeWithoutDraft.status===422&&results.executeWithoutDraft.code==='DRAFT_STALE_OR_UNREVIEWED',
};
console.log(JSON.stringify({results,checks,ok:Object.values(checks).every(Boolean),modelCallAttempted:false},null,2));
if(!Object.values(checks).every(Boolean))process.exitCode=1;
