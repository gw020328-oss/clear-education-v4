// P0 executable contract/reference model only. No cryptographic verifier, authentication, store or payout.
import {readFileSync} from 'node:fs';
import {digest,same} from '../../src/policy/mvp/contract.mjs';
import {exactKeys,freeze,requireRule as check} from '../../src/policy/values.mjs';
export const BOOTCAMP_CONTRACT='clear-bootcamp-records.1';
export const P0_POLICY=freeze(JSON.parse(readFileSync(new URL('./p0-policy.json',import.meta.url))));
export const CAPABILITIES=freeze(['MOODLE_ACTIVITY_COMPLETION.1','MOODLE_ASSIGNMENT_SUBMISSION.1','REFLECTION_REQUIRED_TOPICS.1','HACKERRANK_CERTIFICATE_HOLDING.1']);
export const P0_GATES=freeze({productEligible:false,paymentAllowed:false,grant:'HOLD',outbox:'HOLD',independentClaim:'NO_GO',productionEnabled:false});
export const p0Hash=(kind,value)=>digest('CLEAR-BOOTCAMP-'+kind+'.1',value);
export const p0PolicyHash=policy=>p0Hash('POLICY',policy);
const id=v=>check(typeof v==='string'&&/^[a-z][a-z0-9.-]{0,63}$/.test(v),'BC_ID');
const rev=v=>check(Number.isSafeInteger(v)&&v>=1,'BC_REVISION');
const epoch=v=>check(Number.isSafeInteger(v)&&v>=0,'BC_TIME');
const hash=v=>check(typeof v==='string'&&/^0x[0-9a-f]{64}$/.test(v),'BC_HASH');
const safeGates=v=>check(same(v,P0_GATES),'BC_GATES');
export function validateP0Policy(policy){
 check(policy.version==='clear-python-bootcamp-policy.1'&&policy.logic==='ALL'&&policy.criteria.length===4,'BC_POLICY');
 check(new Set(policy.criteria.map(c=>c.criterionId)).size===4&&same(policy.criteria.map(c=>c.capability),CAPABILITIES),'BC_CAPABILITIES');
 check(policy.amount.symbol==='TEST'&&policy.amount.decimals===6&&policy.amount.displayWhole==='100'
  &&BigInt(policy.amount.amountAtoms)===100n*10n**6n,'BC_AMOUNT');
 const certificate=policy.criteria[3].predicate;
 check(certificate.recognition==='PASSED_CERTIFICATE_PRESENT_AT_FRESH_OBSERVATION'&&certificate.achievementAtRequired===false
  &&certificate.proofTimeMayReplaceAchievementAt===false&&certificate.accountAndCertificateBothRequired===true,'BC_CERTIFICATE_TIME');
 check(policy.criteria[2].predicate.photosRequired===false&&policy.criteria[2].predicate.sentimentOrEffortScoreAllowed===false,'BC_REFLECTION');
 safeGates(policy.gates);return policy;
}
export function validateP0Evidence(e,policy=P0_POLICY){
 exactKeys(e,['version','evidenceId','evidenceRevision','participantId','applicationId','policyHash','criterionId','capability','dataMode','source',
  'acquiredAt','verifiedAt','facts','sourceVersion','sourceHash','runtimeMappingHash','requestHash','verification','condition','rawLocator','previousEvidenceId','gates'],'BC_EVIDENCE');
 check(e.version===BOOTCAMP_CONTRACT,'BC_VERSION');for(const k of ['evidenceId','participantId','applicationId','criterionId'])id(e[k]);rev(e.evidenceRevision);
 check(e.policyHash===p0PolicyHash(policy),'BC_POLICY');const c=policy.criteria.find(c=>c.criterionId===e.criterionId);check(c&&e.capability===c.capability,'BC_CAPABILITY');
 check(['SYNTHETIC_FIXTURE','LOCAL_LMS_RECORD','RECLAIM_SIGNED_RECORD'].includes(e.dataMode),'BC_MODE');
 exactKeys(e.source,['provider','instanceRef','recordRef','accountBindingRef'],'BC_SOURCE');for(const v of Object.values(e.source))id(v);
 for(const k of ['policyHash','sourceHash','runtimeMappingHash','requestHash'])hash(e[k]);id(e.sourceVersion);epoch(e.acquiredAt);epoch(e.verifiedAt);check(e.verifiedAt>=e.acquiredAt,'BC_TIME');
 exactKeys(e.verification,['sourceStatus','participantBinding','requestBinding','integrity','freshness'],'BC_VERIFICATION');
 check(['MOCK_VERIFIED','VERIFIED_LOCAL_API','VERIFIED_ATTESTOR_SIGNATURES','UNAVAILABLE','UNKNOWN'].includes(e.verification.sourceStatus),'BC_SOURCE_STATUS');
 check(e.verification.sourceStatus!=='MOCK_VERIFIED'||e.dataMode==='SYNTHETIC_FIXTURE','BC_MODE');
 if(e.dataMode!=='SYNTHETIC_FIXTURE'){const cert=c.source==='RECLAIM_HACKERRANK';
  check(e.dataMode===(cert?'RECLAIM_SIGNED_RECORD':'LOCAL_LMS_RECORD'),'BC_SOURCE_CAPABILITY');
  if(e.verification.sourceStatus.startsWith('VERIFIED_'))check(e.verification.sourceStatus===(cert?'VERIFIED_ATTESTOR_SIGNATURES':'VERIFIED_LOCAL_API'),'BC_SOURCE_CAPABILITY');
 }
 for(const k of ['participantBinding','requestBinding','integrity','freshness'])check(['VERIFIED','UNKNOWN','INVALID','STALE'].includes(e.verification[k]),'BC_VERIFICATION');
 check(['MET','NOT_MET','MISSING','UNKNOWN'].includes(e.condition),'BC_CONDITION');
 check(e.facts&&Object.getPrototypeOf(e.facts)===Object.prototype&&e.facts.capability===e.capability&&e.facts.targetLogicalId===c.targetLogicalId,'BC_FACTS');
 if(c.capability==='HACKERRANK_CERTIFICATE_HOLDING.1'){
  check(e.facts.certificateName==='Python (Basic)'&&['test_passed','test_failed','UNKNOWN'].includes(e.facts.issuerStatus),'BC_FACTS');
  for(const k of ['accountProofHash','certificateProofHash','sourceUsernameHash','certificateIdHash','claimOwnerHash'])hash(e.facts[k]);
  for(const k of ['accountProofIssuedAt','certificateProofIssuedAt']){epoch(e.facts[k]);check(e.facts[k]<=e.acquiredAt,'BC_TIME');}
  check(e.facts.achievementAt===null||Number.isSafeInteger(e.facts.achievementAt)&&e.facts.achievementAt<=e.acquiredAt,'BC_FACTS');
 }
 exactKeys(e.rawLocator,['recordRef','fieldPath','expiresAt'],'BC_LOCATOR');id(e.rawLocator.recordRef);check(typeof e.rawLocator.fieldPath==='string'&&e.rawLocator.fieldPath.startsWith('/')&&e.rawLocator.fieldPath.length<=256,'BC_LOCATOR');epoch(e.rawLocator.expiresAt);
 check(e.rawLocator.expiresAt>=e.acquiredAt&&e.rawLocator.expiresAt-e.acquiredAt<=policy.privacy.maxRawRetentionSeconds,'BC_RETENTION');
 if(e.previousEvidenceId!==null)id(e.previousEvidenceId);safeGates(e.gates);return e;
}
// Predicate outcomes below are supplied by trusted producers. This model does NOT verify their assertions.
export function referenceP0Decision({policy=P0_POLICY,participantId,applicationId,evidence,decisionId='decision-demo',decisionRevision=1,previousDecisionId=null,recipientRef='recipient-demo-a',courseOperatorRef='course-operator-demo',evaluatedAt,current=true}){
 validateP0Policy(policy);id(participantId);id(applicationId);id(decisionId);id(recipientRef);id(courseOperatorRef);rev(decisionRevision);epoch(evaluatedAt);
 if(previousDecisionId!==null)id(previousDecisionId);check(typeof current==='boolean','BC_CURRENT');
 check(Array.isArray(evidence)&&evidence.length<=32,'BC_EVIDENCE');for(const e of evidence){validateP0Evidence(e,policy);check(e.participantId===participantId&&e.applicationId===applicationId,'BC_PARTICIPANT');}
 const latest=policy.criteria.map(c=>{
  const rows=evidence.filter(e=>e.criterionId===c.criterionId).sort((a,b)=>b.evidenceRevision-a.evidenceRevision);
  check(!rows.length||rows.length===1||rows[0].evidenceRevision!==rows[1].evidenceRevision,'BC_REVISION_CONFLICT');return rows[0]??null;
 });
 const criterionResults=policy.criteria.map((c,i)=>{
  const e=latest[i];let state='UNKNOWN';
  if(e){const verified=['MOCK_VERIFIED','VERIFIED_LOCAL_API','VERIFIED_ATTESTOR_SIGNATURES'].includes(e.verification.sourceStatus)
    &&['participantBinding','requestBinding','integrity','freshness'].every(k=>e.verification[k]==='VERIFIED')&&e.acquiredAt<=evaluatedAt
    &&evaluatedAt-e.acquiredAt<=(c.source==='RECLAIM_HACKERRANK'?policy.time.maxReclaimProofAgeSeconds:policy.time.maxMoodleObservationAgeSeconds)
    &&(c.source!=='RECLAIM_HACKERRANK'||['accountProofIssuedAt','certificateProofIssuedAt'].every(k=>evaluatedAt-e.facts[k]<=policy.time.maxReclaimProofAgeSeconds));
   state=verified?e.condition:'UNKNOWN';}
  return {criterionId:c.criterionId,state,evidenceId:e?.evidenceId??null,evidenceRevision:e?.evidenceRevision??null,sourceHash:e?.sourceHash??null,rawLocator:e?.rawLocator??null};
 });
 const states=criterionResults.map(r=>r.state),conditionsStatus=!current?'STALE':states.includes('NOT_MET')?'NOT_MET':states.every(s=>s==='MET')?'MET':states.includes('MISSING')?'NEEDS_SUPPLEMENT':'UNKNOWN';
 const record={version:BOOTCAMP_CONTRACT,decisionId,decisionRevision,participantId,applicationId,policyHash:p0PolicyHash(policy),
  recipientRef,courseOperatorRef,amountCandidate:{...policy.amount,kind:'DEMO_CANDIDATE_NOT_ENTITLEMENT'},
  evidenceVersions:latest.filter(Boolean).map(e=>({evidenceId:e.evidenceId,evidenceRevision:e.evidenceRevision,sourceHash:e.sourceHash,runtimeMappingHash:e.runtimeMappingHash})),
  criterionResults,conditionsStatus,evaluatedAt,previousDecisionId,current,gates:P0_GATES};
 return freeze({...record,decisionHash:p0Hash('DECISION',record)});
}
export function validateP0Consent(consent,{decision,allocation}){
 exactKeys(consent,['version','consentId','targetDecisionId','targetDecisionRevision','targetDecisionHash','actorRef','actorRole','recordedAt','reason','evidenceRefs'],'BC_CONSENT');
 check(consent.version===BOOTCAMP_CONTRACT,'BC_VERSION');id(consent.consentId);id(consent.actorRef);epoch(consent.recordedAt);
 check(['PARTICIPANT','COURSE_OPERATOR'].includes(consent.actorRole)
  &&consent.actorRef===(consent.actorRole==='PARTICIPANT'?decision.participantId:decision.courseOperatorRef),'BC_ACTOR');
 check(decision.current&&decision.conditionsStatus==='MET'&&consent.targetDecisionId===decision.decisionId
  &&consent.targetDecisionRevision===decision.decisionRevision&&consent.targetDecisionHash===decision.decisionHash,'BC_DECISION_TARGET');
 check(allocation?.status==='FULLY_ALLOCATED'&&allocation.amountAtoms===P0_POLICY.amount.amountAtoms&&allocation.applicationId===decision.applicationId&&allocation.targetDecisionHash===decision.decisionHash&&allocation.recipientRef===decision.recipientRef,'BC_ALLOCATION');
 check(consent.recordedAt>=decision.evaluatedAt&&consent.reason==='AGREE_SAME_RESULT'&&Array.isArray(consent.evidenceRefs),'BC_CONSENT');return consent;
}
export function validateP0Objection(request,decision){
 exactKeys(request,['version','requestId','targetDecisionId','targetDecisionRevision','targetDecisionHash','actorRef','recordedAt','reason','evidenceRefs','processingStatus','validityStatus','deadlineExtensionAllowed'],'BC_OBJECTION');
 check(request.version===BOOTCAMP_CONTRACT,'BC_VERSION');id(request.requestId);id(request.actorRef);epoch(request.recordedAt);
 check([decision.participantId,decision.courseOperatorRef].includes(request.actorRef)&&request.recordedAt>=decision.evaluatedAt,'BC_ACTOR');
 check(request.targetDecisionId===decision.decisionId&&request.targetDecisionRevision===decision.decisionRevision&&request.targetDecisionHash===decision.decisionHash,'BC_DECISION_TARGET');
 check(['RECEIVED','IN_REVIEW','RESOLVED','UNRESOLVED','DUPLICATE'].includes(request.processingStatus)
  &&['UNASSESSED','VALIDATED_OBJECTIVE_ERROR','NOT_ESTABLISHED'].includes(request.validityStatus)&&request.deadlineExtensionAllowed===false,'BC_OBJECTION');
 check(request.processingStatus!=='RECEIVED'||request.validityStatus==='UNASSESSED','BC_OBJECTION');
 check(typeof request.reason==='string'&&request.reason.length>0&&request.reason.length<=128&&Array.isArray(request.evidenceRefs),'BC_OBJECTION');return request;
}
export function validateP0PayoutIntent(payout,{decision,allocation}){
 exactKeys(payout,['version','applicationId','targetDecisionId','targetDecisionRevision','targetDecisionHash','recipientRef','amountAtoms','allocationId','idempotencyKey','txState','gates'],'BC_PAYOUT');
 check(payout.version===BOOTCAMP_CONTRACT,'BC_VERSION');id(payout.recipientRef);id(payout.idempotencyKey);id(payout.allocationId);
 check(decision.current&&decision.conditionsStatus==='MET'&&payout.applicationId===decision.applicationId
  &&payout.recipientRef===decision.recipientRef&&payout.targetDecisionId===decision.decisionId&&payout.targetDecisionRevision===decision.decisionRevision&&payout.targetDecisionHash===decision.decisionHash,'BC_DECISION_TARGET');
 check(allocation?.status==='FULLY_ALLOCATED'&&allocation.applicationId===decision.applicationId&&allocation.allocationId===payout.allocationId
  &&allocation.targetDecisionHash===decision.decisionHash&&allocation.recipientRef===decision.recipientRef
  &&allocation.amountAtoms===P0_POLICY.amount.amountAtoms&&payout.amountAtoms===allocation.amountAtoms,'BC_ALLOCATION');
 check(['NOT_SUBMITTED','SUBMITTED','CONFIRMED','FAILED','REORGED','UNKNOWN'].includes(payout.txState),'BC_TX_STATE');safeGates(payout.gates);return payout;
}
