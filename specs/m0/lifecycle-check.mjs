import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createSyntheticExamLifecycle,lifecycleDigest} from '../../src/exam-evidence/lifecycle.mjs';
export function checkLifecycle({schema,shape}) {
 const fixture=JSON.parse(readFileSync(new URL('./lifecycle.json',import.meta.url)));
 for(const expected of fixture.scenarios) {
  let time=fixture.registeredAt;
  const policy=structuredClone(fixture.policy),binding=structuredClone(fixture.binding);
  if(expected.id==='history-not-required') policy.baselineRequired=false;
  shape(policy,schema.$defs.LifecyclePolicy);shape(binding,schema.$defs.LifecycleBinding);
  const flow=createSyntheticExamLifecycle({policy,binding,clock:()=>time});
  shape(flow.registration(),schema.$defs.LifecycleRegistration);
  const accept=(purpose,rows)=>{
   const session=flow.openSession(purpose,{sessionId:purpose==='BASELINE_HISTORY'?'example-baseline':'example-achievement',
    nonce:purpose==='BASELINE_HISTORY'?'example-baseline-nonce':'example-achievement-nonce'});
   shape(session,schema.$defs.LifecycleSession);
   const {createdAt,acceptUntil,...context}=session;
   const input={...context,sourceTrustProfile:policy.sourceTrustProfile,sourceDigest:lifecycleDigest({purpose,example:expected.id}),
    collectedAt:time,signatureVerifiedSynthetic:true,accountBoundSynthetic:true,coverage:'COMPLETE_SYNTHETIC',emptyMeaning:'UNKNOWN',rows};
   if(purpose==='BASELINE_HISTORY' && expected.id==='empty-unconfirmed') input.rows=[];
   if(purpose==='BASELINE_HISTORY' && expected.id==='whole-table-only') input.coverage='UNKNOWN';
   shape(input,schema.$defs.LifecycleSubmission);
   const receipt=flow.accept(input);shape(receipt,schema.$defs.LifecycleReceipt);return receipt;
  };
  const baseline=['baseline-missing','history-not-required'].includes(expected.id)?null:accept('BASELINE_HISTORY',fixture.baselineRows);
  time+=91*86400;
  const achievement=accept('ACHIEVEMENT',fixture.achievementRows);
  if(expected.id==='retained-baseline') time=fixture.registeredAt+3*366*86400;
  const result=flow.evaluate({baseline,achievement});shape(result,schema.$defs.LifecycleEvaluation);
  for(const key of ['baselineStatus','achievementStatus','status']) assert.equal(result[key],expected[key],expected.id+':'+key);
  assert.equal(result.productEligible,false);assert.equal(result.paymentAllowed,false);
 }
 console.log(`M0 lifecycle examples PASS: ${fixture.scenarios.length} two-stage scenarios; no live proof, storage or eligibility authority.`);
}
