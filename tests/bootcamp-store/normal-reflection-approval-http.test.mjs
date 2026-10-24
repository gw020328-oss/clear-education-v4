import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {once} from 'node:events';
import {request} from 'node:https';
import {normalApprovalFixture} from './normal-approval-fixture.mjs';
import {createCertificates,loadTls} from '../../src/dev/tls.mjs';
import {createBootcampFrontendServer} from '../../tools/bootcamp/frontend-server.mjs';

async function fixture(t){
 const x=await normalApprovalFixture(t),dir=join(x.f.directory,'tls');mkdirSync(dir,{mode:0o700});const fp=createCertificates(dir);
 const normalUi={getSession(context){const a=x.f.service.authorizeWorkflow(context,false);x.readers.observe(a.role.toUpperCase());
   const view=x.f.store.getOperationsProjection(context,x.app);return {version:'clear-bootcamp-normal-session.1',role:a.role.toUpperCase(),applicationId:x.app,
    policyHash:view.policyHash,runtimeMappingHash:view.runtimeMappingHash,sourceMode:'REGISTERED_TEST_SOURCE',receiptRequired:true,
    aiApproval:x.control.brief(context)};},approveReflection:(...args)=>x.control.approve(...args)};
 const mounted=createBootcampFrontendServer({authentication:x.f.service,store:x.f.store,tls:loadTls(dir,fp),sourceMode:'REGISTERED_TEST_SOURCE',
  chainId:x.f.config.chainId,normalUi});mounted.server.listen(0,'127.0.0.1');await once(mounted.server,'listening');
 t.after(async()=>{mounted.server.closeAllConnections();await new Promise(r=>mounted.server.close(r));await mounted.drain();});
 function browser(wallet){
  const cookies=new Map();let csrf=null;
  const raw=(path,{method='GET',body,headers={}}={})=>new Promise((resolve,reject)=>{
   const req=request({hostname:'127.0.0.1',servername:'localhost',port:mounted.server.address().port,ca:readFileSync(join(dir,'ca.pem')),path,method,
    headers:{host:'clear.example.invalid',origin:x.f.config.origin,'sec-fetch-site':'same-origin','content-type':'application/json',
     'x-wallet':wallet.address,'x-chain-id':String(x.f.config.chainId),...(csrf?{'x-csrf-token':csrf}:{}),
     cookie:[...cookies].map(([k,v])=>k+'='+v).join('; '),...headers}},res=>{
    for(const c of res.headers['set-cookie']??[]){const [k,v]=c.split(';')[0].split('=');if(v)cookies.set(k,v);else cookies.delete(k);}
    const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks))}));
   });req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));
  });
  return {raw,async login(){const q=await raw('/auth/nonce',{method:'POST',body:{wallet:wallet.address,chainId:x.f.config.chainId}});
   assert.equal(q.status,200);const a=await raw('/auth/verify',{method:'POST',body:{nonce:q.body.nonce,signature:await wallet.signMessage(q.body.message)}});
   assert.equal(a.status,200);csrf=a.body.csrf;}};
 }
 return {...x,browser};
}

test('actual HTTPS auth/origin/CSRF/role gates protect the sole exact approval write',async t=>{
 const x=await fixture(t),participant=x.browser(x.f.alice),approver=x.browser(x.f.operator);
 await participant.login();await approver.login();
 const p=await participant.raw('/bootcamp/v4/session'),a=await approver.raw('/bootcamp/v4/session');
 assert.equal(p.status,200);assert.equal(a.status,200);assert.equal(p.body.aiApproval.permitted,false);assert.equal(a.body.aiApproval.permitted,true);
 assert.equal(JSON.stringify(a.body).includes(x.source.text),false);
 const path='/bootcamp/v4/applications/'+x.app+'/reflection-approval',body=x.body(),headers={'idempotency-key':'test-ai-explicit'};
 assert.equal((await participant.raw(path,{method:'POST',body,headers})).status,403);
 for(const patch of [{origin:'https://foreign.invalid'},{'sec-fetch-site':'cross-site'},{'x-csrf-token':'0'.repeat(64)},
  {'x-wallet':x.f.alice.address}]){
  const r=await approver.raw(path,{method:'POST',body,headers:{...headers,...patch}});assert.equal(r.status,403);
 }
 assert.equal(existsSync(join(x.directory,'approval.json')),false);assert.deepEqual(x.counts(),{fetches:0,keys:0});
 assert.equal((await approver.raw('/bootcamp/v4/applications/other-app/reflection-approval',{method:'POST',body,headers})).status,409);
 const r=await approver.raw(path,{method:'POST',body,headers});assert.equal(r.status,200);assert.equal(r.body.paymentConsentIncluded,false);
 assert.deepEqual(x.counts(),{fetches:0,keys:0});assert.equal(existsSync(join(x.directory,'ai-reflection/spent.paid-wire.v3.lock')),false);
 const duplicate=await approver.raw(path,{method:'POST',body,headers});assert.equal(duplicate.status,409);assert.match(duplicate.body.error,/ALREADY_RECORDED/);
 const result=await x.run();assert.equal(result.report.status,'RECEIVED_CURRENT');result.close();assert.deepEqual(x.counts(),{fetches:1,keys:1});
});

test('GET, extra request fields and expired approval cannot become a paid command',async t=>{
 const x=await fixture(t),approver=x.browser(x.f.operator);await approver.login();
 const path='/bootcamp/v4/applications/'+x.app+'/reflection-approval',body=x.body(),headers={'idempotency-key':'test-ai-reject'};
 assert.equal((await approver.raw(path)).status,404);
 assert.equal((await approver.raw(path,{method:'POST',body:{...body,wallet:x.config.operatorWallet},headers})).status,409);
 x.advance(56);x.touch();const result=await approver.raw(path,{method:'POST',body,headers});assert.equal(result.status,409);assert.match(result.body.error,/REVIEW_WINDOW_REQUIRED/);
 assert.equal(existsSync(join(x.directory,'approval.json')),false);assert.deepEqual(x.counts(),{fetches:0,keys:0});
});
