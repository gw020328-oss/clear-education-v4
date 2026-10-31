import {normalFailureState} from '../../tools/bootcamp/normal-failure-wait.mjs';
import {requireRule} from '../../src/policy/values.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,existsSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {once} from 'node:events';
import {request} from 'node:https';
import {normalApprovalFixture} from './normal-approval-fixture.mjs';
import {createCertificates,loadTls} from '../../src/dev/tls.mjs';
import {createBootcampFrontendServer} from '../../tools/bootcamp/frontend-server.mjs';

async function fixture(t){
 const x=await normalApprovalFixture(t),dir=join(x.f.directory,'tls');mkdirSync(dir,{mode:0o700});const fp=createCertificates(dir);
 let failure=null;const normalUi={assertWritable(){requireRule(!failure,'BC_NORMAL_FAILED_WAITING');},getSession(context){const a=x.f.service.authorizeWorkflow(context,false);x.readers.observe(a.role.toUpperCase());
   const view=x.f.store.getOperationsProjection(context,x.app);return {version:'clear-bootcamp-normal-session.1',role:a.role.toUpperCase(),applicationId:x.app,
    policyHash:view.policyHash,runtimeMappingHash:view.runtimeMappingHash,sourceMode:'REGISTERED_TEST_SOURCE',receiptRequired:true,
    failure,aiApproval:failure?null:x.control.brief(context)};},approveReflection:(...args)=>x.control.approve(...args)};
 const web=join(dir,'web');mkdirSync(web);writeFileSync(join(web,'index.html'),'<h1>failure fixture</h1>');
 const mounted=createBootcampFrontendServer({authentication:x.f.service,store:x.f.store,tls:loadTls(dir,fp),sourceMode:'REGISTERED_TEST_SOURCE',
  chainId:x.f.config.chainId,normalUi,webRoot:web});mounted.server.listen(0,'127.0.0.1');await once(mounted.server,'listening');
 t.after(async()=>{mounted.server.closeAllConnections();await new Promise(r=>mounted.server.close(r));await mounted.drain();});
 function browser(wallet){
  const cookies=new Map();let csrf=null;
  const raw=(path,{method='GET',body,headers={}}={})=>new Promise((resolve,reject)=>{
   const req=request({hostname:'127.0.0.1',servername:'localhost',port:mounted.server.address().port,ca:readFileSync(join(dir,'ca.pem')),path,method,
    headers:{host:'clear.example.invalid',origin:x.f.config.origin,'sec-fetch-site':'same-origin','content-type':'application/json',
     'x-wallet':wallet.address,'x-chain-id':String(x.f.config.chainId),...(csrf?{'x-csrf-token':csrf}:{}),
     cookie:[...cookies].map(([k,v])=>k+'='+v).join('; '),...headers}},res=>{
    for(const c of res.headers['set-cookie']??[]){const [k,v]=c.split(';')[0].split('=');if(v)cookies.set(k,v);else cookies.delete(k);}
    const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve({status:res.statusCode,body:(()=>{const text=Buffer.concat(chunks).toString();try{return JSON.parse(text);}catch{return text;}})()}));
   });req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));
  });
  return {raw,async login(){const q=await raw('/auth/nonce',{method:'POST',body:{wallet:wallet.address,chainId:x.f.config.chainId}});
   assert.equal(q.status,200);const a=await raw('/auth/verify',{method:'POST',body:{nonce:q.body.nonce,signature:await wallet.signMessage(q.body.message)}});
   assert.equal(a.status,200);csrf=a.body.csrf;}};
 }
 return {...x,browser,fail(error,phase,paymentStarted=false){failure=normalFailureState(error,{phase,paymentStarted});},close:async()=>{mounted.server.closeAllConnections();await new Promise(r=>mounted.server.close(r));}};
}


for(const [phase,code,payment] of [['SOURCE_reflection-topics','BC_PRODUCER_FAILED',false],['SOURCE_reflection-topics','NORMAL_MODEL_STOPPED',false],['PAYMENT','BC_NORMAL_RECEIPT_PENDING',true]])test('HTTPS failure wait preserves authenticated reads and blocks all writes: '+code,async t=>{
 const x=await fixture(t),user=x.browser(x.f.alice),operator=x.browser(x.f.operator);await user.login();await operator.login();
 x.fail(Error(code),phase,payment);assert.equal((await user.raw('/')).status,200);
 for(const browser of [user,operator]){const r=await browser.raw('/bootcamp/v4/session');assert.equal(r.status,200);assert.equal(r.body.failure.status,'FAILED_WAITING');assert.equal(r.body.failure.retryAllowed,false);assert.equal(r.body.failure.outcome,'UNKNOWN');assert.equal(r.body.aiApproval,null);}
 for(const path of ['/bootcamp/v1/applications','/bootcamp/v4/applications/'+x.app+'/reflection-approval','/bootcamp/v3/applications/'+x.app+'/review-consents','/bootcamp/v3/applications/'+x.app+'/recipient-registration','/bootcamp/v4/applications/'+x.app+'/source-signature']){
  const r=await (path==='/bootcamp/v1/applications'?user:operator).raw(path,{method:'POST',body:{},headers:{'idempotency-key':'blocked-write'}});assert.equal(r.status,409);assert.equal(r.body.error,'BC_NORMAL_FAILED_WAITING');
 }
 assert.equal((await operator.raw('/bootcamp/v4/session',{headers:{'x-wallet':x.f.alice.address}})).status,403);
 assert.deepEqual(x.counts(),{fetches:0,keys:0});
 x.f.setAuthenticationTime(9999999999);assert.notEqual((await user.raw('/bootcamp/v4/session')).status,200);
});
test('security, infrastructure and opaque failures are not recoverable waits',()=>{
 for(const code of ['FORBIDDEN','ERR_SQLITE_ERROR','PRIVATE_SECRET','NORMAL_RUN_CHANGED'])assert.equal(normalFailureState(Error(code),{}),null);
 for(const code of ['NORMAL_RUN_CHANGED','ERR_SQLITE_ERROR','FORBIDDEN']){
  assert.equal(normalFailureState(Error('BC_PRODUCER_FAILED'),{collectionFailure:{code}}),null);
  assert.equal(normalFailureState(Error('BC_PRODUCER_FAILED'),{collectionFailure:{code:'UNCLASSIFIED',causes:[{code}]}}),null);
  assert.equal(normalFailureState(Error('BC_PRODUCER_FAILED',{cause:Error(code)})),null);
 }
});

test('one synthetic AI dispatch followed by failure cannot be replayed through retained HTTP',async t=>{
 const x=await fixture(t),operator=x.browser(x.f.operator);await operator.login();
 const path='/bootcamp/v4/applications/'+x.app+'/reflection-approval';
 assert.equal((await operator.raw(path,{method:'POST',body:x.body(),headers:{'idempotency-key':'one-ai'}})).status,200);
 const result=await x.run();result.close();assert.deepEqual(x.counts(),{fetches:1,keys:1});
 x.fail(Error('NORMAL_MODEL_STOPPED'),'SOURCE_reflection-topics');
 assert.equal((await operator.raw('/bootcamp/v4/session')).body.failure.outcome,'UNKNOWN');
 assert.equal((await operator.raw(path,{method:'POST',body:{},headers:{'idempotency-key':'one-ai'}})).status,409);
 assert.deepEqual(x.counts(),{fetches:1,keys:1});
 await x.close();await assert.rejects(operator.raw('/bootcamp/v4/session'));
});
