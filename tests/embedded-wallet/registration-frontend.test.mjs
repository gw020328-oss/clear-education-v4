// Real product HTTPS mount, handler, store and CAS. Invented actors/chain observation only.
// No browser/Privy SDK, external login, paid model or chain transaction.
import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {request as httpsRequest} from 'node:https';
import {mkdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {id} from 'ethers';
import {procedureFixture} from '../bootcamp-store/procedure-fixture.mjs';
import {createCertificates,loadTls} from '../../src/dev/tls.mjs';
import {createBootcampFrontendServer} from '../../tools/bootcamp/frontend-server.mjs';
import {readRecipientRegistration} from '../../src/bootcamp/recipient-registration-ui.mjs';
import {createProductSession,registrationFailure} from '../../src/embedded-wallet/product-session.mjs';
import {requireRule as check} from '../../src/policy/values.mjs';
async function fixture(t){
 const f=await procedureFixture(t),reg=f.configuration.procedurePorts.registration;f.auth.domain.chainId=String(f.config.chainId);
 f.configuration.procedurePorts.registration=(...args)=>({...reg(...args),version:'clear-bootcamp-procedure-registration-port.2'});f.restart();
 const app=f.create();await f.complete(app);f.store.registerCurrentMetForE4(f.aliceContext,app,f.body(app),f.key());
 const initial=f.store.getRecipientRegistration(f.aliceContext,app),p=initial.payload;
 let block=10,patch={},chainPatch={},proofs=0,walletCalls=0,posts=0,lost=false,walletHook=()=>{};const events=[];
 const store={...f.store,getRecipientRegistration(c,a){return {...f.store.getRecipientRegistration(c,a),...patch};}};
 const connection={async refresh(){block++;},recipientRegistrationState(){return {chainStatus:'NOT_REGISTERED',canonical:true,finalized:false,checkpoint:{number:String(block),hash:id('block-'+block),time:String(f.time)},registrationSequence:null,recipient:null,chainApplicationId:p.message.applicationId,...chainPatch};},
  async verifyRecipientRegistrationCheckpoint(a,checkpoint){proofs++;assert.equal(a,app);check(checkpoint.hash===id('block-'+checkpoint.number)&&BigInt(checkpoint.number)<=BigInt(block),'BC_RECIPIENT_REGISTRATION_CHAIN');}};
 const bootstrap={version:'clear-bootcamp-normal-session.1',role:'PARTICIPANT',applicationId:app,policyHash:p.message.policyHash,runtimeMappingHash:p.message.runtimeMappingHash,sourceMode:'REGISTERED_TEST_SOURCE',receiptRequired:true,expectedPayment:{recipient:f.alice.address.toLowerCase()},
  signingContext:{source:{applicationId:app,policyHash:p.message.policyHash,runtimeMappingHash:p.message.runtimeMappingHash},registration:{applicationId:app,instanceId:p.domain.salt,verifyingContract:p.domain.verifyingContract,policyHash:p.message.policyHash,runtimeMappingHash:p.message.runtimeMappingHash,participant:f.alice.address}}};
 const normalUi={getSession(c){f.service.authorizeWorkflow(c,false);return structuredClone(bootstrap);},
  getRecipientRegistration:(context,applicationId,checkpoint)=>readRecipientRegistration({store,connection,context,applicationId,checkpoint,authorize:(c,w)=>f.service.authorizeWorkflow(c,w)})};
 const dir=join(f.directory,'registration-frontend-tls');mkdirSync(dir,{mode:0o700});const fingerprint=createCertificates(dir);
 const host=createBootcampFrontendServer({authentication:f.service,store,tls:loadTls(dir,fingerprint),sourceMode:'REGISTERED_TEST_SOURCE',chainId:f.config.chainId,normalUi});
 host.server.listen(0,'127.0.0.1');await once(host.server,'listening');t.after(async()=>{host.server.closeAllConnections();await new Promise(r=>host.server.close(r));await host.drain();});
 const origin='https://127.0.0.1:'+host.server.address().port,base='/bootcamp/v3/applications/'+app,ca=readFileSync(join(dir,'ca.pem'));
 const raw=(path,{method='GET',body,idempotencyKey,actor=f.aliceContext,headers={}}={})=>new Promise((resolve,reject)=>{
  if(path.startsWith(base+'/recipient-registration')){if(method==='POST'){posts++;events.push('SUBMIT');}else events.push(path.includes('?')?'ANCHORED_READ':'PLAIN_READ');}
  const req=httpsRequest({hostname:'127.0.0.1',servername:'localhost',port:host.server.address().port,path,method,ca,
   headers:{host:new URL(f.config.origin).host,origin:f.config.origin,cookie:'__Host-clear-session='+actor.token,'x-wallet':actor.wallet,'x-chain-id':String(actor.chainId),'x-csrf-token':actor.csrf,'content-type':'application/json',...(idempotencyKey?{'idempotency-key':idempotencyKey}:{}),...headers}},res=>{
    const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks))}));});req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));
 });
 const request=async(path,options)=>{const r=await raw(path,options);if(options?.method==='POST'&&lost)throw Object.assign(Error('TRANSPORT'),{outcome:'UNKNOWN'});if(r.status!==200)throw Object.assign(Error(r.body.error),{status:r.status});return r.body;};
 t.mock.method(Date,'now',()=>f.time*1000);
 const product=createProductSession({session:{assertSession:async()=>f.service.authorizeWorkflow(f.aliceContext,false),request},
  wallet:{pin:{address:f.alice.address,chainId:f.config.chainId},async typed(payload){walletCalls++;events.push('WALLET');await walletHook();return f.alice.signTypedData(payload.domain,payload.types,payload.message);}},
  config:{appId:'synthetic00001',origin,redirectUri:origin+'/onboarding',phase:'ACTIVE_LOCAL_TEST',chainId:f.config.chainId,rpcUrl:'http://127.0.0.1:19999',instanceId:p.domain.salt}});
 return {f,app,base,product,raw,request,initial,events,stats:()=>({proofs,walletCalls,posts}),patch:v=>{patch=v;},chain:v=>{chainPatch=v;},duringWallet:fn=>{walletHook=fn;},loseReply:()=>{lost=true;}};
}
test('product HTTPS completes plain read, anchored pre-read, one wallet request, anchored post-read and one submit',async t=>{
 const x=await fixture(t),packet=await x.product.readRegistration();const before=x.f.counts();
 const result=await x.product.submitRegistration(packet);
 assert.equal(result.record.target.signatureAccepted,true);assert.deepEqual(x.stats(),{proofs:2,walletCalls:1,posts:1});
 assert.deepEqual(x.events,['PLAIN_READ','ANCHORED_READ','WALLET','ANCHORED_READ','SUBMIT']);
 assert.equal(x.f.store.getRecipientRegistration(x.f.aliceContext,x.app).status,'SIGNED');assert.notDeepEqual(x.f.counts(),before);
 await assert.rejects(x.product.submitRegistration(packet),/REGISTRATION_REVIEW_REQUIRED/);
 const signed=await x.product.readRegistration();await assert.rejects(x.product.submitRegistration(signed),/REGISTRATION_REVIEW/);assert.equal(x.stats().walletCalls,1);
});
test('product HTTPS narrowly admits checkpoint syntax and retains lower parser and canonical checks',async t=>{
 const x=await fixture(t),packet=await x.product.readRegistration(),path=x.base+'/recipient-registration',encoded=encodeURIComponent(JSON.stringify(packet.checkpoint));
 for(const suffix of ['?x=1','?checkpoint=','?checkpoint='+encoded+'&checkpoint='+encoded,'?checkpoint='+encoded+'&x=1','?checkpoint='+encoded+'#x','?checkpoint='+('a'.repeat(769)),'/?checkpoint='+encoded])
  assert.equal((await x.raw(path+suffix)).status,404,suffix);
 for(const resource of ['procedure','operations','review-chain','decision-evidence','review-consents'])assert.equal((await x.raw(x.base+'/'+resource+'?checkpoint='+encoded)).status,404,resource);
 assert.equal((await x.raw(path+'?checkpoint='+encoded,{method:'POST',body:{}})).status,404);
 for(const value of [null,{},[],{...packet.checkpoint,extra:true},{...packet.checkpoint,number:'-1'},{...packet.checkpoint,hash:'bad'},'bad']){
  const r=await x.raw(path+'?checkpoint='+encodeURIComponent(JSON.stringify(value)));assert.equal(r.status,409);assert.equal(r.body.error,'BC_RECIPIENT_REGISTRATION_CHECKPOINT');
 }
 const bad=await x.raw(path+'?checkpoint='+encodeURIComponent(JSON.stringify({...packet.checkpoint,hash:id('unknown-block')})));assert.equal(bad.status,409);assert.equal(bad.body.error,'BC_RECIPIENT_REGISTRATION_CHAIN');
 assert.equal((await x.raw(path+'?checkpoint='+encoded,{actor:x.f.bobContext})).status,403);
 assert.equal((await x.raw(path+'?checkpoint='+encoded,{headers:{cookie:''}})).status,401);
 assert.equal(x.stats().walletCalls,0);assert.equal(x.stats().posts,1); // rejected POST never reaches the store
 assert.equal(x.f.store.getRecipientRegistration(x.f.aliceContext,x.app).signatureAccepted,false);
});
for(const phase of ['before','during'])for(const field of ['recipient','payload','deadline','decision'])test('product HTTPS preserves '+field+' binding '+phase+' wallet request',async t=>{
 const x=await fixture(t),packet=await x.product.readRegistration(),payload=structuredClone(packet.payload);
 if(field==='recipient')payload.message.recipient=x.f.bob.address;
 if(field==='payload')payload.message.nonce=id('changed-nonce');
 if(field==='deadline')payload.message.deadline=String(Number(payload.message.deadline)+1);
 const mutate=()=>x.patch(field==='decision'?{decisionRevision:packet.decisionRevision+1}:{payload});
 if(phase==='before')mutate();else x.duringWallet(mutate);
 await assert.rejects(x.product.submitRegistration(packet),error=>{assert.equal(error.message,'REGISTRATION_STALE');assert.equal(error.registrationStage,phase==='before'?'PRE_SIGN_READ':'POST_SIGN_READ');return true;});
 assert.equal(x.stats().walletCalls,phase==='before'?0:1);assert.equal(x.stats().posts,0);
});
test('product HTTPS refuses unknown/registered canonical state before wallet and uncertain POST never signs again',async t=>{
 const x=await fixture(t);let packet;for(const state of [{chainStatus:'UNKNOWN'},{chainStatus:'INCLUDED'},{canonical:false}]){x.chain({});packet=await x.product.readRegistration();x.chain(state);await assert.rejects(x.product.submitRegistration(packet),/REGISTRATION_CHAIN/);assert.equal(x.stats().walletCalls,0);}
 x.chain({});packet=await x.product.readRegistration();x.loseReply();await assert.rejects(x.product.submitRegistration(packet),/TRANSPORT/);
 assert.equal(x.product.registrationUnknown,true);assert.equal(x.stats().walletCalls,1);assert.equal(x.stats().posts,1);
 await assert.rejects(x.product.readRegistration(),/REGISTRATION_RESULT_UNKNOWN/);await assert.rejects(x.product.submitRegistration(packet));assert.equal(x.stats().walletCalls,1);
});
test('fixed diagnostic preserves missing product route code without exposing arbitrary exception',()=>{
 assert.deepEqual(registrationFailure(Object.assign(Error('BC_NOT_FOUND'),{registrationStage:'PRE_SIGN_READ'}),{submit:true}),{stage:'PRE_SIGN_READ',code:'BC_NOT_FOUND'});
 assert.deepEqual(registrationFailure(Object.assign(Error('token=private signature=private'),{registrationStage:'PRE_SIGN_READ'}),{submit:true}),{stage:'PRE_SIGN_READ',code:'REGISTRATION_FAILED'});
});

test('product HTTPS keeps original expired deadline closed without wallet request',async t=>{
 const x=await fixture(t),packet=await x.product.readRegistration();x.f.setTime(Number(packet.payload.message.deadline));
 await assert.rejects(x.product.submitRegistration(packet),/REGISTRATION_STALE|REGISTRATION_EXPIRED/);assert.equal(x.stats().walletCalls,0);assert.equal(x.stats().posts,0);
});
