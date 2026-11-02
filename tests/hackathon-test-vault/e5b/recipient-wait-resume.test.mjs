// One fresh Geth realm and synthetic identities/evidence/model. No retained actual run is opened.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {dirname,join} from 'node:path';
import {RuleError} from '../../../src/policy/values.mjs';
import {normalPaymentFixture} from './normal-payment-fixture.mjs';
import {createNormalResumeControl} from '../../../tools/bootcamp/normal-resume-control.mjs';
import {waitForNormalRecipientRegistration} from '../../../tools/bootcamp/normal-recipient-wait.mjs';
test('V2 same registration checkpoint resumes once after bounded read conflict, never repeats evidence or funding', {timeout:180000},async t=>{
 let waits=0,resumes=0,collections=0,ai=0,firstTarget,deadline;
 const f=await normalPaymentFixture(t,{executionVersion:2,wallClock:true,sourceSeconds:600,
  sourceOptions:{beforeVerify(r){collections++;if(r.criterionId==='reflection-topics')ai++;}},
  async recipientWait({deadlineMs,registrationTargetId,store,user,app,defaultWait}){
   waits++;if(waits===1){firstTarget=registrationTargetId;deadline=deadlineMs;
    return waitForNormalRecipientRegistration({deadlineMs,participant:()=>user,registration(){throw new RuleError('BC_VIEW_STALE');}});
   }
   assert.equal(registrationTargetId,firstTarget);assert.equal(deadlineMs,deadline);await defaultWait();
   await waitForNormalRecipientRegistration({deadlineMs,participant:()=>user,registration:()=>store.getRecipientRegistration(user,app)});
  },
  async onRecipientWaitFailure({error,checkpoint,auth,user,op,app,report}){
   resumes++;assert.equal(error.failurePhase,'RECIPIENT_DEADLINE_READ');assert.equal(report.paymentFailure.step,'WAIT_RECIPIENT_SIGNATURE');
   assert.deepEqual(report.paymentFailure.metrics,{keyAccesses:0,paymentSignatures:0,transactionSignatures:0,broadcasts:0});assert.deepEqual(report.paymentFailure.native,{envelopes:[]});
   const c=createNormalResumeControl({applicationId:()=>app,authorize:(a,w)=>auth.authorizeWorkflow(a,w),inspect:()=>checkpoint.inspect(),prepareResume:()=>checkpoint.requestResume()});
   c.open({status:'FAILED_WAITING'});const v=c.view(),body={failureRevision:v.failureRevision,expectedRevision:v.applicationRevision};assert.equal(v.recoveryStatus,'RECIPIENT_WAIT_NOT_SENT');
   assert.throws(()=>c.request(user,app,body),/FORBIDDEN/);c.request(op,app,body);assert.throws(()=>c.request(op,app,body),/BLOCKED/);assert.equal(c.take(),true);return true;
  }});
 await f.run();assert.equal(resumes,1);assert.equal(waits,2);assert.equal(collections,4);assert.equal(ai,1);
 assert.equal(f.report.completed,true);assert.equal(f.report.recipientWaitFailure.failurePhase,'RECIPIENT_DEADLINE_READ');assert.equal(f.report.paymentFailure,undefined);
 assert.equal(f.report.claim.amountAtoms,'100000000');assert.equal(f.report.claim.duplicateRejected,true);assert.equal(f.metrics().broadcasts,6);
 const db=new DatabaseSync(join(dirname(f.reportPath),'offline-bind-store/bootcamp.sqlite'),{readOnly:true});try{
  assert.equal(db.prepare("SELECT count(*) n FROM e3_records WHERE kind='REGISTRATION_TARGET'").get().n,1);
  assert.equal(db.prepare("SELECT count(*) n FROM e3_records WHERE kind='RECIPIENT_REGISTRATION'").get().n,1);
  assert.equal(db.prepare('SELECT count(*) n FROM evidence').get().n,4);
 }finally{db.close();}
});
