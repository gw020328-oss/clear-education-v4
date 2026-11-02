// Same synthetic application/authentication through manual resume and real isolated Geth payment.
// The AI preflight is an invented producer here; durable managed AI dispatch is separately exercised by HTTPS tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {atomicPrivate,readPrivate} from '../../../src/hackathon-test-vault/e5/private-storage.mjs';
import {createNormalSourceSequence} from '../../../tools/bootcamp/normal-source-sequence.mjs';
import {createNormalResumeControl} from '../../../tools/bootcamp/normal-resume-control.mjs';
import {normalPaymentFixture} from './normal-payment-fixture.mjs';
test('same login and HR evidence → explicit reflection resume → V2 consent/payment → receipt-only reconciliation', {timeout:180000},async t=>{
 let failed=false,models=0,hr=0,marker,originalSession,originalApplication;
 const f=await normalPaymentFixture(t,{executionVersion:2,sourceSeconds:600,
  sourceOptions:{async beforeVerify(r){
   if(r.criterionId==='python-basic-certificate')hr++;
   if(r.criterionId==='reflection-topics'){
    if(!failed){failed=true;atomicPrivate(marker,{phase:'FAILED_BEFORE_CLAIM'});throw Error('NORMAL_CURRENT');}models++;
   }
  }},
  async collectOverride({store,user,op,auth,app,key,http,normalUi,now,dir}){
   marker=join(dir,'synthetic-preflight.json');originalSession=user.token;originalApplication=app;
   let failure=null;const windows=new Map();
   const facade={getApplication:(...a)=>store.getApplication(...a),issueBridgeRequest:(...a)=>store.issueRequest(...a),collectBridge:(c,a,b,k)=>store.collect(c,a,b,k,{timeoutMs:30000}),
    async prepareBridgeReflection(c,a,b){const cap=now()+240;return {packet:{leaseExpiresAtMs:cap*1000},isCurrent:()=>now()<cap&&store.getRequest(c,a,b.requestId).status==='PENDING'};}};
   const sequence=createNormalSourceSequence({store:facade,getContext:()=>user,applicationId:app,sourceWindows:windows,
    now,key,stage(){},waitForReaders:async()=>{},requireReaders(){},getReflectionRecovery:()=>({status:'NOT_SENT',resumeAllowed:JSON.parse(readPrivate(marker)).phase==='FAILED_BEFORE_CLAIM'})});
   const control=createNormalResumeControl({applicationId:()=>app,authorize:(c,w)=>auth.authorizeWorkflow(c,w),
    inspect:()=>({...sequence.recovery(),applicationRevision:store.getApplication(user,app).revision}),prepareResume(){sequence.requestResume();}});
   normalUi.assertWritable=path=>{if(failure&&path!=='/bootcamp/v4/applications/'+app+'/resume')throw Error('BC_NORMAL_FAILED_WAITING');};
   normalUi.resume=(...a)=>control.request(...a);
   normalUi.getSession=c=>{const actor=auth.authorizeWorkflow(c,false);return {role:actor.role,failure:control.view()};};
   const prepared=await sequence.collect({prepareReflection:true}),expiry=prepared.packet.leaseExpiresAtMs;
   await assert.rejects(sequence.collect(),/BC_PRODUCER_FAILED/);assert.equal(hr,1);assert.equal(models,0);
   failure=control.open({status:'FAILED_WAITING'});
   const session=await http.request('/bootcamp/v4/session',{actor:op});assert.equal(session.failure.resumeAllowed,true);
   const body={failureRevision:failure.failureRevision,expectedRevision:failure.applicationRevision};
   assert.equal((await http.raw('/bootcamp/v4/applications/'+app+'/resume',{method:'POST',actor:op,body})).status,200);
   assert.notEqual((await http.raw('/bootcamp/v4/applications/'+app+'/resume',{method:'POST',actor:op,body})).status,200);
   assert.equal(control.take(),true);failure=null;await sequence.collect();
   assert.equal(prepared.packet.leaseExpiresAtMs,expiry);assert.equal(user.token,originalSession);assert.equal(hr,1);assert.equal(models,1);
  }});
 assert.equal(f.app,originalApplication);assert.equal(f.user.token,originalSession);
 await f.run();assert.equal(f.report.completed,true);assert.equal(f.report.claim.amountAtoms,'100000000');assert.equal(f.report.claim.duplicateRejected,true);
 const before=f.metrics();f.report.completed=false;delete f.report.claim.checkpoint;
 const receipt=await f.api.paymentReceipt(f.app);assert.equal(receipt.claim.state,'INCLUDED');assert.equal(receipt.balance.measurement,'CANONICAL_TRANSFER_EVENT');
 assert.equal(f.metrics().broadcasts,before.broadcasts);assert.equal(f.metrics().paymentSignatures,before.paymentSignatures);
 assert.equal(hr,1);assert.equal(models,1);assert.equal(f.user.token,originalSession);
});
