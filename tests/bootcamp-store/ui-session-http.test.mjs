// Offline HTTPS only. Wallets and evidence request are synthetic fixtures; no source or chain runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {request as httpsRequest} from 'node:https';
import {once} from 'node:events';
import {mkdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {procedureFixture,START} from './procedure-fixture.mjs';
import {createCertificates,loadTls} from '../../src/dev/tls.mjs';
import {createBootcampFrontendServer} from '../../tools/bootcamp/frontend-server.mjs';
import {createNormalBootcampClient} from '../../src/bootcamp/normal-client.mjs';
import {createNormalReceiptReader} from '../../src/bootcamp/normal-receipt.mjs';
import {createNormalUiSession} from '../../src/bootcamp/ui-session.mjs';
import {requestMessage} from '../../src/hackerrank-evidence/request.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
async function fixture(t,{withReceipt=false}={}){
 const f=await procedureFixture(t),a=f.create(),v=f.store.getApplication(f.aliceContext,a),H=x=>p0Hash('OFFLINE-UI-HTTP',x);
 const pins={audience:'offline-ui-http',trustConfigHash:H('trust'),recipeHash:H('recipe'),expectedClaimOwner:'0x'+'11'.repeat(20),selectedCertificateId:null,dataMode:'RECLAIM_SIGNED_RECORD'};
 const ui=createNormalUiSession({authentication:f.service,participantWallet:f.alice.address.toLowerCase(),operatorWallet:f.operator.address.toLowerCase(),getApplication:(c,a)=>f.store.getApplication(c,a),now:()=>f.time});
 const normalUi={bindParticipant(c,id){ui.bindParticipant(c,id,pins);return {applicationId:id,paymentAuthorization:false};},
  pendingSignature(c,id){assert.equal(id,a);return ui.pendingSignature(c);},submitSignature(c,id,b){assert.equal(id,a);return ui.submitSignature(c,b);}};
 if(withReceipt)normalUi.getPaymentReceipt=createNormalReceiptReader({authorize:(c,id)=>f.store.getOperationsProjection(c,id),readReport:()=>({applicationId:a,recipient:f.alice.address.toLowerCase(),runtimeMappingHash:v.runtimeMappingHash,sourceMode:'SYNTHETIC_TEST_SOURCE',realSourceVerified:false,stages:[],completed:false}),readCanonicalClaim:async()=>assert.fail('no tx should be read'),runtimeHash:H('runtime'),runtimeMappingHash:v.runtimeMappingHash,policyHash:v.policyHash,recipient:f.alice.address.toLowerCase(),token:'0x'+'12'.repeat(20)});
 const dir=join(f.directory,'ui-tls');mkdirSync(dir,{mode:0o700});const fingerprint=createCertificates(dir);
 const mounted=createBootcampFrontendServer({authentication:f.service,store:f.store,tls:loadTls(dir,fingerprint),sourceMode:'REGISTERED_TEST_SOURCE',chainId:f.config.chainId,normalUi});
 mounted.server.listen(0,'127.0.0.1');await once(mounted.server,'listening');
 t.after(async()=>{mounted.server.closeAllConnections();await new Promise(r=>mounted.server.close(r));await mounted.drain();ui.close();});
 function raw(resource,{context=f.aliceContext,method='GET',body,headers={}}={}){
  return new Promise((resolve,reject)=>{const req=httpsRequest({hostname:'127.0.0.1',servername:'localhost',port:mounted.server.address().port,
   path:`/bootcamp/v4/applications/${a}/${resource}`,method,ca:readFileSync(join(dir,'ca.pem')),headers:Object.fromEntries(Object.entries({host:'clear.example.invalid',origin:f.config.origin,
    cookie:'__Host-clear-session='+context.token,'x-wallet':context.wallet,'x-chain-id':String(context.chainId),'x-csrf-token':context.csrf,
    ...(body===undefined?{}:{'content-type':'application/json'}),...headers}).filter(([,value])=>value!==undefined))},res=>{const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks))}));});
   req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));});
 }
 const expected={version:'clear-hackerrank-request.1',...pins,applicationId:a,participantId:v.participantId,participantWallet:f.alice.address.toLowerCase(),criterionId:'python-basic-certificate',policyHash:v.policyHash,runtimeMappingHash:v.runtimeMappingHash,nonce:H('nonce'),issuedAt:START,expiresAt:START+240};delete expected.dataMode;
 const client=context=>createNormalBootcampClient({request:async(path,options)=>{const r=await raw(path.split('/').at(-1),{...options,context});if(r.status!==200)throw Error(r.body.error);return r.body;}});
 return {f,ui,a,raw,expected,client,mounted};
}
test('HTTPS browser session binds the app, receives only its exact approval and returns its own signature',async t=>{
 const x=await fixture(t);assert.equal((await x.raw('source-session',{method:'POST',body:{}})).status,200);
 const message=requestMessage(x.expected),pending=x.ui.requestSignature(x.expected,message);pending.catch(()=>{});
 const q=await x.raw('source-signature');assert.equal(q.status,200);assert.equal(q.body.message,message);
 assert.equal(JSON.stringify(q.body).includes(x.f.aliceContext.token),false);
 assert.equal((await x.raw('source-signature',{context:x.f.operatorContext})).status,403);
 assert.equal((await x.raw('source-signature',{context:x.f.bobContext})).status,403);
 const signature=await x.f.alice.signMessage(q.body.message),body={approvalId:q.body.approvalId,signature};
 assert.equal((await x.raw('source-signature',{method:'POST',body:{...body,message:'replacement'}})).status,409);
 assert.equal((await x.raw('source-signature',{method:'POST',body,headers:{'x-csrf-token':'wrong'}})).status,403);
 const result=await x.raw('source-signature',{method:'POST',body});assert.equal(result.status,200);assert.equal(result.body.paymentAuthorization,false);assert.equal(await pending,signature);
 assert.equal((await x.raw('source-signature',{method:'POST',body})).status,409);
});
test('HTTPS source binding refuses other roles, origin changes, unknown commands and privileged bodies',async t=>{
 const x=await fixture(t);
 assert.equal((await x.raw('source-session',{method:'POST',body:{},context:x.f.operatorContext})).status,403);
 assert.equal((await x.raw('source-session',{method:'POST',body:{},context:x.f.bobContext})).status,403);
 assert.equal((await x.raw('source-session',{method:'POST',body:{verified:true}})).status,409);
 assert.equal((await x.raw('source-session',{method:'POST',body:{},headers:{origin:'https://other.invalid'}})).status,403);
 assert.equal((await x.raw('source-collection',{method:'POST',body:{}})).status,404);
 assert.equal((await x.raw('claim',{method:'POST',body:{}})).status,404);
 assert.equal((await x.raw('source-session',{method:'POST',body:{}})).status,200);
 const pending=x.ui.requestSignature(x.expected,requestMessage(x.expected));pending.catch(()=>{});x.f.service.logout(x.f.aliceContext);
 assert.equal((await x.raw('source-signature')).status,401);
 // Direct broker check observes revocation too; HTTP preauthorization deliberately rejects before reading it.
 assert.throws(()=>x.ui.pendingSignature(x.f.aliceContext),/AUTH_REQUIRED/);await assert.rejects(pending,/BC_UI_CONTEXT_UNAVAILABLE/);
});

test('optional receipt GET retains existing HTTPS app/role scope and cannot accept caller tx or payment commands',async t=>{
 const x=await fixture(t,{withReceipt:true});assert.equal(x.mounted.config.executionReceiptHttpImplemented,true);
 for(const context of [x.f.aliceContext,x.f.operatorContext]){const r=await x.raw('payment-receipt',{context});assert.equal(r.status,200);assert.equal(r.body.balance.receivedAtoms,null);assert.equal(r.body.claim.state,'NOT_OBSERVED');}
 assert.equal((await x.raw('payment-receipt',{context:x.f.bobContext})).status,403);
 assert.equal((await x.raw('payment-receipt',{method:'POST',body:{txHash:'untrusted'}})).status,404);
 assert.equal((await x.raw('payment-receipt?txHash=untrusted')).status,404);
 assert.equal((await x.client(x.f.aliceContext).paymentReceipt(x.a)).claim.canonical,null);
});
test('browser source client binds and submits only an explicitly returned external wallet signature once',async t=>{
 const x=await fixture(t),client=x.client(x.f.aliceContext);await client.bindSourceSession(x.a);
 const pending=x.ui.requestSignature(x.expected,requestMessage(x.expected));pending.catch(()=>{});
 const view=await client.pendingSourceSignature(x.a);assert.equal(view.applicationId,x.a);
 const signature=await x.f.alice.signMessage(view.message);const r=await client.submitSourceSignature(x.a,view,signature);
 assert.equal(r.paymentAuthorization,false);assert.equal(await pending,signature);
 await assert.rejects(client.submitSourceSignature(x.a,view,signature),/BC_UI_SIGNATURE_NOT_PENDING/);
});

test('browser same-origin GET without Origin follows the existing auth handler rule; missing/cross-site metadata and writes are rejected',async t=>{
 const x=await fixture(t,{withReceipt:true});
 assert.equal((await x.raw('payment-receipt',{headers:{origin:undefined,'sec-fetch-site':'same-origin'}})).status,200);
 for(const headers of [{origin:undefined},{origin:undefined,'sec-fetch-site':'same-site'},{origin:undefined,'sec-fetch-site':'cross-site'}, {'sec-fetch-site':'cross-site'}])
  assert.equal((await x.raw('payment-receipt',{headers})).status,403);
 assert.equal((await x.raw('source-session',{method:'POST',body:{},headers:{origin:undefined,'sec-fetch-site':'same-origin'}})).status,403);
});
