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
import {createNormalUiSession} from '../../src/bootcamp/ui-session.mjs';
import {requestMessage} from '../../src/hackerrank-evidence/request.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
async function fixture(t){
 const f=await procedureFixture(t),a=f.create(),v=f.store.getApplication(f.aliceContext,a),H=x=>p0Hash('OFFLINE-UI-HTTP',x);
 const pins={audience:'offline-ui-http',trustConfigHash:H('trust'),recipeHash:H('recipe'),expectedClaimOwner:'0x'+'11'.repeat(20),selectedCertificateId:null,dataMode:'RECLAIM_SIGNED_RECORD'};
 const ui=createNormalUiSession({authentication:f.service,participantWallet:f.alice.address.toLowerCase(),operatorWallet:f.operator.address.toLowerCase(),getApplication:(c,a)=>f.store.getApplication(c,a),now:()=>f.time});
 const normalUi={bindParticipant(c,id){ui.bindParticipant(c,id,pins);return {applicationId:id,paymentAuthorization:false};},
  pendingSignature(c,id){assert.equal(id,a);return ui.pendingSignature(c);},submitSignature(c,id,b){assert.equal(id,a);return ui.submitSignature(c,b);}};
 const dir=join(f.directory,'ui-tls');mkdirSync(dir,{mode:0o700});const fingerprint=createCertificates(dir);
 const mounted=createBootcampFrontendServer({authentication:f.service,store:f.store,tls:loadTls(dir,fingerprint),sourceMode:'REGISTERED_TEST_SOURCE',chainId:f.config.chainId,normalUi});
 mounted.server.listen(0,'127.0.0.1');await once(mounted.server,'listening');
 t.after(async()=>{mounted.server.closeAllConnections();await new Promise(r=>mounted.server.close(r));await mounted.drain();ui.close();});
 function raw(resource,{context=f.aliceContext,method='GET',body,headers={}}={}){
  return new Promise((resolve,reject)=>{const req=httpsRequest({hostname:'127.0.0.1',servername:'localhost',port:mounted.server.address().port,
   path:`/bootcamp/v4/applications/${a}/${resource}`,method,ca:readFileSync(join(dir,'ca.pem')),headers:{host:'clear.example.invalid',origin:f.config.origin,
    cookie:'__Host-clear-session='+context.token,'x-wallet':context.wallet,'x-chain-id':String(context.chainId),'x-csrf-token':context.csrf,
    ...(body===undefined?{}:{'content-type':'application/json'}),...headers}},res=>{const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks))}));});
   req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));});
 }
 const expected={version:'clear-hackerrank-request.1',...pins,applicationId:a,participantId:v.participantId,participantWallet:f.alice.address.toLowerCase(),criterionId:'python-basic-certificate',policyHash:v.policyHash,runtimeMappingHash:v.runtimeMappingHash,nonce:H('nonce'),issuedAt:START,expiresAt:START+240};delete expected.dataMode;
 return {f,ui,a,raw,expected};
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
