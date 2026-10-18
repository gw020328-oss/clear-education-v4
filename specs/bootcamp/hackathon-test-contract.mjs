// E0 reference vectors ONLY. No source/auth verification, signer, contract, ledger or payment authority.
import {readFileSync} from 'node:fs';
import {freeze,requireRule as check} from '../../src/policy/values.mjs';
import {p0Hash,P0_POLICY} from './p0-contract.mjs';
export const TEST_OPERATIONS=freeze(JSON.parse(readFileSync(new URL('./hackathon-test-operations-v1.json',import.meta.url))));
export const testOperationsHash=()=>p0Hash('HACKATHON-TEST-OPERATIONS',TEST_OPERATIONS);
export function validateTestOperations(p=TEST_OPERATIONS){
 check(p.version==='clear-hackathon-test-operations.1'&&p.decisionRevision===1,'HT_PROFILE');
 check(p.asset.amountAtoms===P0_POLICY.amount.amountAtoms&&p.asset.decimals===P0_POLICY.amount.decimals,'HT_AMOUNT');
 check(p.review.confirmationSeconds===120&&p.review.totalReviewSeconds===600&&p.review.newEvidenceReverificationLimit===1,'HT_TIME_POLICY');
 check(p.review.capMayResetOnNewDecisionOrRetry===false&&p.review.oldDecisionConsentReusable===false,'HT_RESET_OR_CONSENT');
 check(p.acceptedRight.claimExpiry===null&&!p.acceptedRight.automaticExpiryEnabled&&!p.acceptedRight.operatorReclaim&&!p.acceptedRight.newSignatureForClaim,'HT_ACCEPTED_RIGHT');
 check(!p.unacceptedTermination.databaseStaleOrTimerAloneMayRelease&&p.unacceptedTermination.atomicEffects.length===3,'HT_RELEASE');
 check(p.activation.implementationAuthorized&&!p.activation.profileApprovalIsRuntimeReady&&p.activation.testPathMayActivateAfterAcceptance&&!p.activation.productionEnabled,'HT_ACTIVATION');return p;
}
const seconds=v=>check(Number.isSafeInteger(v)&&v>=0,'HT_TIME');
// Input assertions below are synthetic design facts, not authenticated production facts.
export function referenceReviewVector(v){
 seconds(v.now);check(Array.isArray(v.history),'HT_HISTORY');
 if(v.history.length===0)return {kind:'REFERENCE_ONLY',path:'NOT_STARTED',capAt:null};
 const first=v.history[0].firstStartedAt;seconds(first);const capAt=first+TEST_OPERATIONS.review.totalReviewSeconds;
 for(const h of v.history){seconds(h.firstStartedAt);seconds(h.publishedAt);check(h.firstStartedAt===first,'HT_CAP_RESET');check(h.publishedAt>=first,'HT_PUBLICATION');}
 const current=v.history.at(-1),confirmAt=current.publishedAt+TEST_OPERATIONS.review.confirmationSeconds;
 check(Number.isSafeInteger(capAt)&&Number.isSafeInteger(confirmAt),'HT_TIME');
 check(Number.isSafeInteger(v.reverificationCount)&&v.reverificationCount>=0,'HT_REVERIFICATION_COUNT');
 let path='WAITING_FOR_CONFIRMATION';
 const target=c=>c.decisionId===current.decisionId&&c.revision===current.revision&&c.hash===current.hash;
 const consentRoles=new Set(v.consents.filter(target).map(c=>c.role));
 const mutual=consentRoles.has('PARTICIPANT')&&consentRoles.has('COURSE_OPERATOR');
 if(v.now<current.publishedAt)path='NOT_YET_PUBLISHED';
 else if(v.now>=capAt||v.reverificationCount>1||v.newValidError&&v.reverificationCount>=1)path='UNRESOLVED_TERMINATION_CANDIDATE';
 else if(!v.currentMet||!v.sourceCurrent)path='REVERIFICATION_REQUIRED';
 else if(!v.fullyAllocated)path='FUNDING_BLOCKED';
 else if(v.materialUnassessedObjection||v.validUnresolvedObjection)path='OBJECTION_BLOCKED';
 else if(v.newValidError)path='REVERIFICATION_REQUIRED';
 else if(mutual)path='EARLY_CONSENT_CANDIDATE';
 else if(confirmAt<=capAt&&v.now>=confirmAt)path='DEADLINE_CANDIDATE';
 else if(confirmAt>capAt)path='FULL_120_DEADLINE_ROUTE_UNAVAILABLE';
 return {kind:'REFERENCE_ONLY',path,capAt,confirmAt,mutualCurrentConsent:mutual};
}
export function referenceFirstAcceptVector(v){
 const r=referenceReviewVector(v);for(const k of ['authorizationExpiresAt','sourceValidUntilExclusive'])seconds(v[k]);
 return {kind:'REFERENCE_ONLY',eligible:['EARLY_CONSENT_CANDIDATE','DEADLINE_CANDIDATE'].includes(r.path)
  &&v.now<v.authorizationExpiresAt&&v.now<v.sourceValidUntilExclusive&&v.now<r.capAt};
}
export function referenceQueue(rows){
 check(Array.isArray(rows),'HT_QUEUE');const active=rows.filter(r=>r.currentMet&&!r.allocated);
 const applications=new Set(),sequences=new Set();for(const r of active){check(!applications.has(r.applicationId)&&!sequences.has(r.acceptanceSequence),'HT_DUPLICATE_QUEUE');
  check(Number.isSafeInteger(r.acceptanceSequence)&&r.acceptanceSequence>0,'HT_SEQUENCE');applications.add(r.applicationId);sequences.add(r.acceptanceSequence);}
 return [...active].sort((a,b)=>a.acceptanceSequence-b.acceptanceSequence).map(r=>r.applicationId);
}
