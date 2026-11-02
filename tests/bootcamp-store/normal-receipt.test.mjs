// Synthetic owner-port contract tests. No RPC, real source, model or payment is executed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {procedureFixture,START} from './procedure-fixture.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
import {createNormalReceiptReader} from '../../src/bootcamp/normal-receipt.mjs';
import {createNormalBootcampClient} from '../../src/bootcamp/normal-client.mjs';
const H=x=>p0Hash('OFFLINE-RECEIPT',x);
async function fixture(t){
 const f=await procedureFixture(t),a=f.create();await f.complete(a);const v=f.store.getOperationsProjection(f.aliceContext,a),recipient=f.alice.address.toLowerCase(),token='0x'+'12'.repeat(20),runtimeHash=H('runtime'),checkpoint={hash:H('block'),number:'12',time:String(START+2)};
 const report={applicationId:a,recipient,runtimeMappingHash:v.runtimeMappingHash,chainApplicationId:H('chain-app'),sourceMode:'SYNTHETIC_TEST_SOURCE',realSourceVerified:false,
  reviewTarget:{applicationId:a,policyHash:v.policyHash,runtimeMappingHash:v.runtimeMappingHash,decisionId:v.decisionId,decisionRevision:v.decisionRevision,decisionHash:v.decisionHash,allocationId:'allocation-offline'},
  stages:[{kind:'ACCEPT',txHash:H('accept-tx'),checkpoint:{hash:H('accept-block'),number:'10',time:String(START)}}],claim:{txHash:H('claim-tx'),checkpoint,amountAtoms:'100000000',duplicateRejected:true},completed:true};
 const receipt={version:'clear-e5b-direct-claim-receipt.1',runtimeHash,applicationId:report.chainApplicationId,txHash:report.claim.txHash,status:'INCLUDED',checkpoint,recipient,token,amountAtoms:'100000000',finalized:false,allocationId:H('allocation'),authorizationDigest:H('digest'),
  observation:{runtimeHash,checkpoint,business:{applicationId:report.chainApplicationId,application:{state:'6',recipient,target:{decisionHash:v.decisionHash,revision:String(v.decisionRevision)}},right:{recipient,token,amountAtoms:'100000000',allocationId:H('allocation'),authorizationDigest:H('digest')}}}};
 let calls=0,onRead=async()=>structuredClone(receipt);
 const read=createNormalReceiptReader({authorize:(c,id)=>f.store.getOperationsProjection(c,id),readReport:()=>report,readCanonicalClaim:async q=>{
  calls++;assert.deepEqual(q,{applicationId:report.chainApplicationId,txHash:report.claim.txHash});return onRead();},runtimeHash,runtimeMappingHash:v.runtimeMappingHash,policyHash:v.policyHash,recipient,token});
 return {f,a,read,report,receipt,recipient,token,calls:()=>calls,setRead:fn=>{onRead=fn;}};
}
test('canonical receipt and measured exact delta expose fixed recipient 100 TEST separately from accept and finality',async t=>{
 const x=await fixture(t),r=await x.read(x.f.aliceContext,x.a),operator=await x.read(x.f.operatorContext,x.a);
 assert.equal(r.claim.state,'INCLUDED');assert.equal(r.claim.canonical,true);assert.equal(r.claim.finalized,false);assert.equal(r.balance.receivedAtoms,'100000000');
 assert.equal(r.balance.measurement,'OWNER_RUN_BALANCE_DELTA_AT_CLAIM');assert.equal(r.expectedPayment.recipient,x.recipient);assert.equal(r.expectedPayment.token,x.token);
 assert.notEqual(r.accept.transactionHash,r.claim.transactionHash);assert.equal(r.accept.canonicalNow,null);assert.equal(r.source.actualSourceVerification,false);
 assert.deepEqual(r.acceptedTarget,operator.acceptedTarget);assert.equal(operator.role,'OPERATOR');assert.equal(JSON.stringify(r).includes(x.f.aliceContext.token),false);
});
test('submitted state performs canonical readback; absent or unknown receipt never promotes amount',async t=>{
 const x=await fixture(t);x.report.completed=false;x.setRead(async()=>null);let r=await x.read(x.f.aliceContext,x.a);
 assert.equal(r.claim.state,'READBACK_UNAVAILABLE');assert.equal(r.balance.receivedAtoms,null);assert.equal(r.claim.canonical,null);assert.equal(x.calls(),1);
 delete x.report.claim;r=await x.read(x.f.aliceContext,x.a);assert.equal(r.accept.state,'RECORDED_INCLUDED');assert.equal(r.claim.state,'NOT_OBSERVED');assert.equal(r.balance.receivedAtoms,null);
});
test('unknown, reorged, unavailable or mismatched canonical reads remain null without retry or promotion',async t=>{
 const x=await fixture(t);
 for(const kind of ['unknown','reorg','throw','recipient','token','amount','checkpoint','decision','finalized']){
  x.setRead(async()=>{if(kind==='throw')throw Error('OFFLINE_UNAVAILABLE');const c=structuredClone(x.receipt);
   if(kind==='unknown'||kind==='reorg')return {status:kind.toUpperCase()};
   if(kind==='recipient')c.recipient=x.token;if(kind==='token')c.token=x.recipient;if(kind==='amount')c.amountAtoms='99999999';
   if(kind==='checkpoint')c.checkpoint.hash=H('other-block');if(kind==='decision')c.observation.business.application.target.decisionHash=H('other-target');if(kind==='finalized')c.finalized=true;return c;});
  const r=await x.read(x.f.aliceContext,x.a);assert.equal(r.claim.state,'READBACK_UNAVAILABLE',kind);assert.equal(r.balance.receivedAtoms,null,kind);assert.equal(r.claim.canonical,null,kind);
 }
 assert.equal(x.calls(),9);
});
test('receipt access is application scoped and reauthorizes after awaited readback',async t=>{
 const x=await fixture(t);await assert.rejects(x.read(x.f.bobContext,x.a),/FORBIDDEN/);assert.equal(x.calls(),0);
 x.setRead(async()=>{x.f.service.logout(x.f.aliceContext);return x.receipt;});await assert.rejects(x.read(x.f.aliceContext,x.a),/AUTH_REQUIRED/);
});
test('source expiry and a newer current decision preserve the separately recorded accepted target',async t=>{
 const x=await fixture(t),old=x.report.reviewTarget.decisionHash;x.f.setTime(START+400);
 const r=await x.read(x.f.operatorContext,x.a);assert.equal(r.acceptedTarget.decisionHash,old);assert.equal(r.balance.receivedAtoms,'100000000');
 assert.notEqual(r.currentDecision.decisionHash,old);assert.equal(r.claim.canonical,true);
});
test('browser receipt adapter rejects tx-only promotion and preserves unknown amounts',async t=>{
 const x=await fixture(t);x.report.completed=false;x.setRead(async()=>null);let response=await x.read(x.f.aliceContext,x.a);
 const client=createNormalBootcampClient({request:async(path,options)=>{assert.equal(path,`/bootcamp/v4/applications/${x.a}/payment-receipt`);assert.notEqual(options?.method,'POST');return response;}});
 assert.equal((await client.paymentReceipt(x.a)).balance.receivedAtoms,null);
 response=structuredClone(response);response.balance.receivedAtoms='100000000';await assert.rejects(client.paymentReceipt(x.a),/BC_NORMAL_RECEIPT/);
 x.report.completed=true;x.setRead(async()=>x.receipt);response=await x.read(x.f.aliceContext,x.a);assert.equal((await client.paymentReceipt(x.a)).claim.canonical,true);
});

test('lost claim receipt reply reconciles exact canonical transfer without resending or claiming measured delta',async t=>{
 const x=await fixture(t);x.report.completed=false;x.report.claim={txHash:x.receipt.txHash,status:'SUBMITTED_UNKNOWN'};
 const first=await x.read(x.f.aliceContext,x.a),second=await x.read(x.f.operatorContext,x.a);
 assert.equal(first.claim.state,'INCLUDED');assert.equal(first.balance.measurement,'CANONICAL_TRANSFER_EVENT');
 assert.equal(second.balance.receivedAtoms,'100000000');assert.equal(x.calls(),2);assert.equal(x.report.completed,false);
});
