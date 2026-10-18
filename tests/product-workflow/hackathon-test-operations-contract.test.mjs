import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TEST_OPERATIONS as p,validateTestOperations,testOperationsHash,referenceReviewVector as review,referenceFirstAcceptVector as accept,referenceQueue} from '../../specs/bootcamp/hackathon-test-contract.mjs';
import {referenceFunding,frozenFileSha256} from '../../specs/bootcamp/r2-reference.mjs';
const target={decisionId:'decision-orchid',revision:1,hash:'0x'+'1'.repeat(64)};
const f=()=>({now:1120,history:[{...target,firstStartedAt:1000,publishedAt:1000}],currentMet:true,fullyAllocated:true,sourceCurrent:true,
 consents:[],materialUnassessedObjection:false,validUnresolvedObjection:false,reverificationCount:0,newValidError:false,authorizationExpiresAt:1500,sourceValidUntilExclusive:1300});
const consents=t=>['PARTICIPANT','COURSE_OPERATOR'].map(role=>({...t,role}));
test('new TEST approval preserves base policy and separates activation from production',()=>{
 validateTestOperations();assert.match(testOperationsHash(),/^0x[0-9a-f]{64}$/);assert.equal(p.base.v1WireAndHashesUnchanged,true);
 assert.equal(p.activation.existingV1GatesUnchanged,true);assert.equal(p.activation.productionEnabled,false);
 assert.equal(p.activation.testPathMayActivateAfterAcceptance,true);assert.equal(p.activation.profileApprovalIsRuntimeReady,false);
 const inputs=JSON.parse(readFileSync(new URL('../../specs/bootcamp/hackathon-test-inputs.json',import.meta.url)));
 for(const [file,sha] of Object.entries(inputs.baseFrozenFiles))assert.equal(frozenFileSha256(file),sha,file);
 assert.deepEqual(inputs.files.map(f=>f.priority),[1,2,3]);assert.equal(inputs.files[0].scope,'DECISION_REVISION_1');
 assert.equal(p.activation.stageScopedTestHarnessesBeforeFullRuntime,true);
});
test('120-second deadline boundary is inclusive and early consent may skip waiting',()=>{
 assert.equal(review({...f(),now:1119}).path,'WAITING_FOR_CONFIRMATION');assert.equal(review(f()).path,'DEADLINE_CANDIDATE');
 assert.equal(review({...f(),now:1010,consents:consents(target)}).path,'EARLY_CONSENT_CANDIDATE');
});
test('600-second cap is exclusive even for an authorization signed earlier',()=>{
 const v={...f(),now:1599,authorizationExpiresAt:1700,sourceValidUntilExclusive:1700};assert.equal(accept(v).eligible,true);
 assert.equal(accept({...v,now:1600}).eligible,false);assert.equal(review({...v,now:1600}).path,'UNRESOLVED_TERMINATION_CANDIDATE');
});
test('funding wait before first publication does not start or expire the review cap',()=>{
 assert.deepEqual(review({...f(),now:9000,history:[],fullyAllocated:false}),{kind:'REFERENCE_ONLY',path:'NOT_STARTED',capAt:null});
});
test('correction uses new consents or its full 120 seconds without resetting original cap',()=>{
 const current={decisionId:'decision-corrected',revision:2,hash:'0x'+'2'.repeat(64)};
 const v={...f(),now:1450,history:[...f().history,{...current,firstStartedAt:1000,publishedAt:1400}],consents:consents(target),reverificationCount:1};
 assert.equal(review(v).path,'WAITING_FOR_CONFIRMATION');assert.equal(review({...v,now:1520}).path,'DEADLINE_CANDIDATE');
 assert.equal(review({...v,consents:consents(current)}).path,'EARLY_CONSENT_CANDIDATE');
 assert.throws(()=>review({...v,history:[v.history[0],{...v.history[1],firstStartedAt:1400}]}),/HT_CAP_RESET/);
});
test('late correction cannot use a shortened deadline but may obtain fresh mutual consent before cap',()=>{
 const current={decisionId:'decision-late',revision:2,hash:'0x'+'3'.repeat(64)};
 const v={...f(),now:1590,history:[...f().history,{...current,firstStartedAt:1000,publishedAt:1550}],reverificationCount:1};
 assert.equal(review(v).path,'FULL_120_DEADLINE_ROUTE_UNAVAILABLE');assert.equal(review({...v,consents:consents(current)}).path,'EARLY_CONSENT_CANDIDATE');
});
test('material unassessed or unresolved objection blocks both consent and deadline routes',()=>{
 for(const k of ['materialUnassessedObjection','validUnresolvedObjection'])for(const c of [[],consents(target)])assert.equal(review({...f(),[k]:true,consents:c}).path,'OBJECTION_BLOCKED');
});
test('new valid error after one revalidation is unresolved, while retry keeps cap and budget',()=>{
 assert.equal(review({...f(),newValidError:true,reverificationCount:1}).path,'UNRESOLVED_TERMINATION_CANDIDATE');
 assert.equal(review({...f(),newValidError:true}).path,'REVERIFICATION_REQUIRED');
 assert.equal(review(f()).capAt,review(structuredClone(f())).capAt);
 assert.equal(review({...f(),sourceCurrent:false,reverificationCount:1}).path,'REVERIFICATION_REQUIRED');
});
test('actual expiry and source invalidation can block earlier than the review cap',()=>{
 assert.equal(accept(f()).eligible,true);assert.equal(accept({...f(),sourceValidUntilExclusive:1120}).eligible,false);
 assert.equal(accept({...f(),authorizationExpiresAt:1120}).eligible,false);assert.equal(accept({...f(),sourceCurrent:false,consents:consents(target)}).eligible,false);
});
test('current MET ledger sequence controls unallocated queue, not click time or old revision',()=>{
 const rows=[{applicationId:'app-a',acceptanceSequence:5,currentMet:false,allocated:false},{applicationId:'app-a',acceptanceSequence:20,currentMet:true,allocated:false},
  {applicationId:'app-b',acceptanceSequence:10,currentMet:true,allocated:false},{applicationId:'app-c',acceptanceSequence:1,currentMet:true,allocated:true}];
 assert.deepEqual(referenceQueue(rows),['app-b','app-a']);assert.throws(()=>referenceQueue([...rows,{...rows[1],acceptanceSequence:21}]),/HT_DUPLICATE_QUEUE/);
});
test('150 plus 50 TEST example protects first 100 reservation and does not imply automatic payout',()=>{
 const obligations=['a','b'].map(s=>({obligationId:'obligation-'+s,applicationRef:'application-'+s,recipientRef:'recipient-'+s,decisionHash:target.hash,amountAtoms:'100000000'}));
 const allocations=[{...obligations[0],allocationId:'allocation-a'}],input={confirmedBalanceAtoms:'150000000',obligations,allocations};
 const before=referenceFunding(input),after=referenceFunding({...input,confirmedBalanceAtoms:'200000000'});
 assert.equal(before.shortfallAtoms,'50000000');assert.equal(before.reservedAtoms,'100000000');assert.equal(before.globalPause,false);
 assert.equal(after.shortfallAtoms,'0');assert.equal(after.reservedAtoms,'100000000');assert.deepEqual(after.affectedQueue,['obligation-b']);
});
test('unaccepted close needs atomic contract effects while accepted claim has no TEST expiry or reclaim',()=>{
 assert.equal(p.unacceptedTermination.databaseStaleOrTimerAloneMayRelease,false);assert.equal(p.unacceptedTermination.contractMustCheck.includes('NOT_ACCEPTED'),true);
 assert.equal(p.unacceptedTermination.atomicEffects.includes('INVALIDATE_OLD_AUTHORIZATION_EPOCH_OR_STATE'),true);
 assert.equal(p.acceptedRight.claimExpiry,null);assert.equal(p.acceptedRight.operatorReclaim,false);assert.equal(p.acceptedRight.laterKeyOrEpochChangeMayFreezeClaim,false);
});
