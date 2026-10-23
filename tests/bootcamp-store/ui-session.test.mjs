import {createSourceDiagnostics} from '../../src/hackerrank-evidence/diagnostics.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {storeFixture,START} from './fixture.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
import {requestMessage} from '../../src/hackerrank-evidence/request.mjs';
import {createNormalUiSession} from '../../src/bootcamp/ui-session.mjs';
async function fixture(t,diagnostics){
 const f=await storeFixture(t),applicationId=f.create(),v=f.view(applicationId),H=x=>p0Hash('OFFLINE-UI-APPROVAL',x);
 const pins={audience:'offline-ui-only',trustConfigHash:H('trust'),recipeHash:H('recipe'),expectedClaimOwner:'0x'+'11'.repeat(20),selectedCertificateId:null,dataMode:'RECLAIM_SIGNED_RECORD'};
 const ui=createNormalUiSession({authentication:f.service,participantWallet:f.alice.address.toLowerCase(),operatorWallet:f.operator.address.toLowerCase(),
  getApplication:(context,a)=>f.store.getApplication(context,a),now:()=>f.time,diagnostics});t.after(()=>ui.close());
 ui.bindParticipant(f.aliceContext,applicationId,pins);
 const expected={version:'clear-hackerrank-request.1',...pins,applicationId,participantId:v.participantId,participantWallet:f.alice.address.toLowerCase(),
  criterionId:'python-basic-certificate',policyHash:v.policyHash,runtimeMappingHash:v.runtimeMappingHash,nonce:H('nonce'),issuedAt:START,expiresAt:START+240};delete expected.dataMode;
 const message=requestMessage(expected);
 return {f,ui,pins,expected,message,start:options=>ui.requestSignature(expected,message,options)};
}
test('browser-owned signature for the exact evidence request completes once without a server wallet',async t=>{
 const x=await fixture(t),pending=x.start(),view=x.ui.pendingSignature(x.f.aliceContext);
 assert.equal(view.message,x.message);assert.equal(view.paymentAuthorization,undefined);assert.ok(view.purpose.includes('NOT_PAYMENT_AUTHORIZATION'));
 assert.equal(JSON.stringify(view).includes(x.f.aliceContext.token),false);assert.equal(JSON.stringify(view).includes(x.f.alice.privateKey),false);
 const signature=await x.f.alice.signMessage(view.message),receipt=x.ui.submitSignature(x.f.aliceContext,{approvalId:view.approvalId,signature});
 assert.equal(await pending,signature);assert.equal(receipt.paymentAuthorization,false);
 assert.throws(()=>x.ui.submitSignature(x.f.aliceContext,{approvalId:view.approvalId,signature}),/BC_UI_SIGNATURE_NOT_PENDING/);
 await assert.rejects(x.start(),/BC_UI_SIGNATURE_REQUEST_USED/);
});
test('operator, another participant, and a different session cannot sign for the bound source context',async t=>{
 const x=await fixture(t),pending=x.start();pending.catch(()=>{});const view=x.ui.pendingSignature(x.f.aliceContext);
 for(const c of [x.f.operatorContext,x.f.bobContext])assert.throws(()=>x.ui.pendingSignature(c),/FORBIDDEN/);
 const otherSession=await x.f.login(x.f.alice),signature=await x.f.alice.signMessage(x.message);
 assert.throws(()=>x.ui.submitSignature(otherSession,{approvalId:view.approvalId,signature}),/BC_UI_CONTEXT_CHANGED/);
 const wrong=await x.f.bob.signMessage(x.message);assert.throws(()=>x.ui.submitSignature(x.f.aliceContext,{approvalId:view.approvalId,signature:wrong}),/BC_UI_SIGNATURE/);
 x.ui.submitSignature(x.f.aliceContext,{approvalId:view.approvalId,signature});assert.equal(await pending,signature);
});
test('request/app/wallet/source/message substitution is refused before publishing an approval',async t=>{
 for(const [key,value]of [['applicationId','another-application'],['participantWallet','0x'+'22'.repeat(20)],['runtimeMappingHash',p0Hash('OFFLINE','other')],
  ['expectedClaimOwner','0x'+'33'.repeat(20)],['recipeHash',p0Hash('OFFLINE','recipe')]]){
  const x=await fixture(t),expected={...x.expected,[key]:value};await assert.rejects(x.ui.requestSignature(expected,requestMessage(expected)),/BC_UI_SIGNATURE_TARGET|BC_UI_SIGNATURE_SOURCE/);
  assert.throws(()=>x.ui.pendingSignature(x.f.aliceContext),/BC_UI_SIGNATURE_NOT_PENDING/);
 }
 const x=await fixture(t);await assert.rejects(x.ui.requestSignature(x.expected,'arbitrary message'),/BC_UI_SIGNATURE_MESSAGE/);
});
test('logout cancels the pending request and a later session cannot revive it',async t=>{
 const x=await fixture(t),pending=x.start();pending.catch(()=>{});x.f.service.logout(x.f.aliceContext);
 assert.throws(()=>x.ui.pendingSignature(x.f.aliceContext),/AUTH_REQUIRED/);await assert.rejects(pending,/BC_UI_CONTEXT_UNAVAILABLE/);
 const next=await x.f.login(x.f.alice);assert.throws(()=>x.ui.pendingSignature(next),/AUTH_REQUIRED/);
});
test('exclusive expiry, cancellation and close reject pending signing without extending the request',async t=>{
 for(const kind of ['expiry','cancel','close']){
  const x=await fixture(t),controller=new AbortController(),pending=x.start({signal:controller.signal});pending.catch(()=>{});
  if(kind==='expiry'){x.f.setTime(START+240);assert.throws(()=>x.ui.pendingSignature(x.f.aliceContext),/BC_UI_SIGNATURE_EXPIRED/);}
  if(kind==='cancel')controller.abort();if(kind==='close')x.ui.close();
  await assert.rejects(pending,/BC_UI_SIGNATURE_EXPIRED|BC_UI_SIGNATURE_CANCELLED|BC_UI_CLOSED/);
 }
});
test('browser cannot supply a replacement message, context or server signing fallback',async t=>{
 const x=await fixture(t),pending=x.start();pending.catch(()=>{});const view=x.ui.pendingSignature(x.f.aliceContext),signature=await x.f.alice.signMessage(x.message);
 assert.throws(()=>x.ui.submitSignature(x.f.aliceContext,{approvalId:view.approvalId,signature,message:'replacement'}),/BC_UI_SIGNATURE_BODY/);
 assert.equal(x.ui.signMessage,undefined);x.ui.close();await assert.rejects(pending,/BC_UI_CLOSED/);
});

test('revoking the source session cancels signing even when no browser request follows logout',async t=>{
 const x=await fixture(t),pending=x.start();pending.catch(()=>{});x.f.service.logout(x.f.aliceContext);
 await assert.rejects(pending,/BC_UI_CONTEXT_UNAVAILABLE/);
 assert.throws(()=>x.ui.pendingSignature(x.f.aliceContext),/AUTH_REQUIRED/);
});

test('server signature acceptance is observed only after exact verification, independently of wallet completion',async t=>{
 const d=createSourceDiagnostics({persist(){}}),x=await fixture(t,d),pending=x.start(),q=x.ui.pendingSignature(x.f.aliceContext);
 assert.equal(d.snapshot().signatureAcceptance,'UNKNOWN');
 const wrong=await x.f.bob.signMessage(q.message);
 assert.throws(()=>x.ui.submitSignature(x.f.aliceContext,{approvalId:q.approvalId,signature:wrong}),/BC_UI_SIGNATURE/);
 assert.equal(d.snapshot().signatureAcceptance,'UNKNOWN');
 const signature=await x.f.alice.signMessage(q.message);x.ui.submitSignature(x.f.aliceContext,{approvalId:q.approvalId,signature});assert.equal(await pending,signature);
 assert.equal(d.snapshot().signatureAcceptance,'ACCEPTED');
 const output=JSON.stringify(d.snapshot());for(const secret of [signature,q.message,x.f.aliceContext.token,x.f.alice.privateKey])assert.equal(output.includes(secret),false);
});
test('diagnostic write failure preserves the broker result and does not sign twice',async t=>{
 const d=createSourceDiagnostics({persist(){throw Error('SYNTHETIC_DISK_FAILURE');}}),x=await fixture(t,d),pending=x.start(),q=x.ui.pendingSignature(x.f.aliceContext);
 const signature=await x.f.alice.signMessage(q.message),receipt=x.ui.submitSignature(x.f.aliceContext,{approvalId:q.approvalId,signature});
 assert.equal(receipt.status,'PARTICIPANT_SIGNATURE_ACCEPTED');assert.equal(await pending,signature);assert.equal(d.snapshot().persistence,'INCOMPLETE');
 assert.throws(()=>x.ui.submitSignature(x.f.aliceContext,{approvalId:q.approvalId,signature}),/BC_UI_SIGNATURE_NOT_PENDING/);
});
