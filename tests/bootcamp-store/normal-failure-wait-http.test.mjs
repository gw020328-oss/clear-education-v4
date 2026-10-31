import {createNormalResumeControl} from '../../tools/bootcamp/normal-resume-control.mjs';
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

async function fixture(t,{resume=false}={}){
 const x=await normalApprovalFixture(t),dir=join(x.f.directory,'tls');mkdirSync(dir,{mode:0o700});const fp=createCertificates(dir);
 let failure=null;
 const resumeControl=resume?createNormalResumeControl({applicationId:()=>x.app,authorize:(c,w)=>x.f.service.authorizeWorkflow(c,w),
  inspect(){const recovery=x.capability.recovery();return {...recovery,applicationRevision:x.f.view(x.app).revision,resumeAllowed:recovery.resumeAllowed&&x.prepared.isCurrent()};},
  prepareResume(){x.capability.authorizeResume();}}):null;
 const normalUi={...(resumeControl?{resume:(...a)=>resumeControl.request(...a)}:{}),assertWritable(path){requireRule(!failure||resumeControl&&path==='/bootcamp/v4/applications/'+x.app+'/resume','BC_NORMAL_FAILED_WAITING');},getSession(context){const a=x.f.service.authorizeWorkflow(context,false);x.readers.observe(a.role.toUpperCase());
   const view=x.f.store.getOperationsProjection(context,x.app);return {version:'clear-bootcamp-normal-session.1',role:a.role.toUpperCase(),applicationId:x.app,
    policyHash:view.policyHash,runtimeMappingHash:view.runtimeMappingHash,sourceMode:'REGISTERED_TEST_SOURCE',receiptRequired:true,
    failure:resumeControl?.view()??failure,aiApproval:failure?null:x.control.brief(context)};},approveReflection:(...args)=>x.control.approve(...args)};
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
 return {...x,browser,fail(error,phase,paymentStarted=false){failure=normalFailureState(error,{phase,paymentStarted});resumeControl?.open(failure);},takeResume(){const ready=resumeControl.take();if(ready)failure=null;return ready;},close:async()=>{mounted.server.closeAllConnections();await new Promise(r=>mounted.server.close(r));}};
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


test('same HTTPS sessions resume only durable pre-claim failure, then one AI result without another SIWE',async t=>{
 const x=await fixture(t,{resume:true}),operator=x.browser(x.f.operator),participant=x.browser(x.f.alice);
 await operator.login();await participant.login();
 assert.equal((await operator.raw('/bootcamp/v4/applications/'+x.app+'/reflection-approval',{method:'POST',body:x.body(),headers:{'idempotency-key':'one-exact'}})).status,200);
 const expires=x.packet.leaseExpiresAtMs;x.setApprovalCurrent(false);
 await assert.rejects(x.run(),/NORMAL_CURRENT/);assert.equal(x.capability.recovery().status,'NOT_SENT');assert.deepEqual(x.counts(),{keys:0,fetches:0});
 x.fail(Error('BC_PRODUCER_FAILED'),'SOURCE_reflection-topics');x.setApprovalCurrent(true);
 const failure=(await operator.raw('/bootcamp/v4/session')).body.failure;
 const path='/bootcamp/v4/applications/'+x.app+'/resume',body={failureRevision:failure.failureRevision,expectedRevision:failure.applicationRevision};
 assert.equal((await participant.raw(path,{method:'POST',body})).status,403);
 assert.equal((await operator.raw(path,{method:'POST',body:{...body,failureRevision:0}})).status,409);
 const attempts=await Promise.all([operator.raw(path,{method:'POST',body}),operator.raw(path,{method:'POST',body})]);
 assert.deepEqual(attempts.map(r=>r.status).sort(),[200,409]);assert.equal(x.takeResume(),true);assert.equal(x.takeResume(),false);
 const result=await x.run();assert.equal(result.report.status,'RECEIVED_CURRENT');assert.deepEqual(x.counts(),{keys:1,fetches:1});result.close();
 assert.equal(x.packet.leaseExpiresAtMs,expires);assert.equal((await participant.raw('/bootcamp/v4/session')).status,200);
 await assert.rejects(x.run(),/NORMAL_RESUME_BLOCKED/);assert.deepEqual(x.counts(),{keys:1,fetches:1});
});
for(const kind of ['auth','evidence','revision','unknown'])test('resume rejects '+kind+' without another provider dispatch',async t=>{
 const x=await fixture(t,{resume:true}),operator=x.browser(x.f.operator);await operator.login();
 x.control.approve(x.actor,x.app,x.body(),'exact-one');x.setApprovalCurrent(false);await assert.rejects(x.run(),/NORMAL_CURRENT/);x.setApprovalCurrent(true);
 x.fail(Error('BC_PRODUCER_FAILED'),'SOURCE_reflection-topics');const failure=(await operator.raw('/bootcamp/v4/session')).body.failure;
 const body={failureRevision:failure.failureRevision,expectedRevision:failure.applicationRevision};
 if(kind==='auth')x.f.setAuthenticationTime(9999999999);
 if(kind==='evidence')x.state.rawAvailable=false;
 if(kind==='revision')body.expectedRevision++;
 if(kind==='unknown'){x.capability.authorizeResume();x.setUnknown();const result=await x.run();result.close();assert.equal(x.capability.recovery().status,'UNKNOWN');}
 const r=await operator.raw('/bootcamp/v4/applications/'+x.app+'/resume',{method:'POST',body});assert.notEqual(r.status,200);
 assert.equal(x.takeResume(),false);assert.equal(x.counts().fetches,kind==='unknown'?1:0);
});
