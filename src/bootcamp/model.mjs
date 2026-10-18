import {createHash} from 'node:crypto';
import {exactKeys,freeze,hash32,requireRule as check} from '../policy/values.mjs';
import {same} from '../policy/mvp/contract.mjs';
import {P0_POLICY,P0_GATES,BOOTCAMP_CONTRACT,p0Hash,p0PolicyHash,validateP0Evidence} from '../../specs/bootcamp/p0-contract.mjs';

export const id=v=>{check(typeof v==='string'&&/^[a-z][a-z0-9.-]{0,63}$/.test(v),'BC_ID');return v;};
export const epoch=v=>{check(Number.isSafeInteger(v)&&v>=0,'BC_TIME');return v;};
export const revision=v=>{check(Number.isSafeInteger(v)&&v>=1,'BC_REVISION');return v;};
export const hash=v=>hash32(v,'BC_HASH');
export const bytesHash=v=>'0x'+createHash('sha256').update(v).digest('hex');
export function compileBootcampPolicy(policy=P0_POLICY){
  // Deliberately closed capability version: no score/daily/boolean lowering.
  check(same(policy,P0_POLICY),'BC_UNSUPPORTED_POLICY');
  return freeze({policy:structuredClone(policy),policyHash:p0PolicyHash(policy)});
}
export const compiled=compileBootcampPolicy();
export const criterion=id=>{const c=compiled.policy.criteria.find(c=>c.criterionId===id);check(c,'BC_CRITERION');return c;};
export function validateGuard(g){
  exactKeys(g,['source','sourceVersion','sourceHash','sourceReceiptHash','runtimeMappingHash','trustHash','leaseId',
    'authExpiresAt','rawExpiresAt','queryExpiresAt','rawAvailable'],'BC_SOURCE_GUARD');
  exactKeys(g.source,['provider','instanceRef','recordRef','accountBindingRef'],'BC_SOURCE_GUARD');
  Object.values(g.source).forEach(id);id(g.sourceVersion);id(g.leaseId);
  for(const k of ['sourceHash','sourceReceiptHash','runtimeMappingHash','trustHash'])hash(g[k]);
  for(const k of ['authExpiresAt','rawExpiresAt','queryExpiresAt'])epoch(g[k]);
  check(typeof g.rawAvailable==='boolean','BC_SOURCE_GUARD');return g;
}
export const guardExpiry=g=>Math.min(g.authExpiresAt,g.rawExpiresAt,g.queryExpiresAt);
export const guardHash=g=>p0Hash('SOURCE-GUARD',validateGuard(g));
const optionalTime=(v,acquired)=>check(v===null||Number.isSafeInteger(v)&&v>=0&&v<=acquired,'BC_SOURCE_TIME');

// Source authenticity belongs to the registered in-process producer, not these
// typed predicates. This first store release accepts synthetic producers only.
export function predicate(c,f,{acquiredAt,originalBody,source}){
  const base=['capability','targetLogicalId'];
  check(f?.capability===c.capability&&f.targetLogicalId===c.targetLogicalId,'BC_FACTS');
  if(c.capability==='MOODLE_ACTIVITY_COMPLETION.1'){
    exactKeys(f,[...base,'completionState','completionMode','completionRuleHash','sourceCompletedAt'],'BC_FACTS');
    check(['COMPLETED','INCOMPLETE','UNKNOWN'].includes(f.completionState)&&['AUTOMATIC','MANUAL','UNKNOWN'].includes(f.completionMode),'BC_FACTS');
    check(f.completionRuleHash===null||typeof hash(f.completionRuleHash)==='string','BC_FACTS');optionalTime(f.sourceCompletedAt,acquiredAt);
    return f.completionMode!=='AUTOMATIC'||f.completionRuleHash===null||f.completionState==='UNKNOWN'?'UNKNOWN':f.completionState==='COMPLETED'?'MET':'NOT_MET';
  }
  if(c.capability==='MOODLE_ASSIGNMENT_SUBMISSION.1'){
    exactKeys(f,[...base,'submissionState','sourceSubmittedAt'],'BC_FACTS');
    check(['SUBMITTED','DRAFT','NOT_SUBMITTED','UNKNOWN'].includes(f.submissionState),'BC_FACTS');optionalTime(f.sourceSubmittedAt,acquiredAt);
    return f.submissionState==='UNKNOWN'?'UNKNOWN':f.submissionState==='SUBMITTED'?'MET':'NOT_MET';
  }
  if(c.capability==='REFLECTION_REQUIRED_TOPICS.1'){
    exactKeys(f,[...base,'originalBodyHash','topics','observationRunId','observationProfileHash'],'BC_FACTS');
    hash(f.originalBodyHash);hash(f.observationProfileHash);id(f.observationRunId);
    check(typeof originalBody==='string'&&originalBody.isWellFormed()&&originalBody.length<=32000
      &&bytesHash(Buffer.from(originalBody,'utf8'))===f.originalBodyHash,'BC_ORIGINAL_BODY');
    check(Array.isArray(f.topics)&&f.topics.length===3&&new Set(f.topics.map(t=>t.topicId)).size===3,'BC_TOPICS');
    for(const t of f.topics){
      exactKeys(t,['topicId','state','originalEvidenceLocator'],'BC_TOPICS');
      check(c.predicate.topics.includes(t.topicId)&&['PRESENT','MISSING','UNCERTAIN','CONFLICT'].includes(t.state),'BC_TOPICS');
      if(t.state!=='PRESENT'){check(t.originalEvidenceLocator===null,'BC_TOPIC_LOCATOR');continue;}
      const l=t.originalEvidenceLocator;exactKeys(l,['sourceId','start','end','quoteHash'],'BC_TOPIC_LOCATOR');hash(l.quoteHash);
      check(l.sourceId===source.recordRef&&Number.isSafeInteger(l.start)&&Number.isSafeInteger(l.end)
        &&l.start>=0&&l.end>l.start&&l.end<=originalBody.length,'BC_TOPIC_LOCATOR');
      const quote=originalBody.slice(l.start,l.end);
      check(quote.isWellFormed()&&bytesHash(Buffer.from(quote,'utf8'))===l.quoteHash,'BC_TOPIC_QUOTE');
    }
    const states=f.topics.map(t=>t.state);
    return states.some(s=>['UNCERTAIN','CONFLICT'].includes(s))?'UNKNOWN':states.includes('MISSING')?'MISSING':'MET';
  }
  exactKeys(f,[...base,'certificateName','issuerStatus','accountProofHash','certificateProofHash','sourceUsernameHash',
    'certificateIdHash','claimOwnerHash','accountProofIssuedAt','certificateProofIssuedAt','achievementAt'],'BC_FACTS');
  check(f.certificateName==='Python (Basic)'&&['test_passed','test_failed','UNKNOWN'].includes(f.issuerStatus),'BC_FACTS');
  for(const k of ['accountProofHash','certificateProofHash','sourceUsernameHash','certificateIdHash','claimOwnerHash'])hash(f[k]);
  for(const k of ['accountProofIssuedAt','certificateProofIssuedAt']){epoch(f[k]);check(f[k]<=acquiredAt,'BC_SOURCE_TIME');}
  optionalTime(f.achievementAt,acquiredAt);
  return f.issuerStatus==='UNKNOWN'?'UNKNOWN':f.issuerStatus==='test_passed'?'MET':'NOT_MET';
}
export function validateCandidate(candidate,request,guard,now){
  exactKeys(candidate,['requestHash','nonceHash','proofBundleHash','source','sourceVersion','sourceHash','acquiredAt',
    'verifiedAt','validUntilExclusive','facts','rawLocator','originalBody'],'BC_CANDIDATE');
  check(candidate.requestHash===request.requestHash&&candidate.nonceHash===request.nonceHash,'BC_REQUEST_BINDING');
  hash(candidate.proofBundleHash);epoch(candidate.acquiredAt);epoch(candidate.verifiedAt);epoch(candidate.validUntilExclusive);
  check(candidate.acquiredAt>=request.issuedAt&&candidate.acquiredAt<=candidate.verifiedAt&&candidate.verifiedAt<=now,'BC_SOURCE_TIME');
  check(same(candidate.source,guard.source)&&candidate.sourceVersion===guard.sourceVersion&&candidate.sourceHash===guard.sourceHash,'BC_SOURCE_CHANGED');
  const c=criterion(request.criterionId),age=c.source==='RECLAIM_HACKERRANK'?900:300;
  check(now-candidate.acquiredAt<=age&&now<candidate.validUntilExclusive&&candidate.validUntilExclusive<=request.expiresAt,'BC_CANDIDATE_EXPIRED');
  if(c.source==='RECLAIM_HACKERRANK')for(const k of ['accountProofIssuedAt','certificateProofIssuedAt'])
    check(Number.isSafeInteger(candidate.facts[k])&&now-candidate.facts[k]<=900,'BC_PROOF_EXPIRED');
  exactKeys(candidate.rawLocator,['recordRef','fieldPath','expiresAt'],'BC_LOCATOR');id(candidate.rawLocator.recordRef);
  check(candidate.rawLocator.recordRef===guard.source.recordRef&&['/source/state','/source/submission','/source/body','/certificate/status'].includes(candidate.rawLocator.fieldPath),'BC_LOCATOR');
  epoch(candidate.rawLocator.expiresAt);
  check(now<candidate.rawLocator.expiresAt&&candidate.rawLocator.expiresAt<=Math.min(guardExpiry(guard),candidate.acquiredAt+1800),'BC_RAW_EXPIRED');
  check(c.capability==='REFLECTION_REQUIRED_TOPICS.1'||candidate.originalBody===null,'BC_RAW_INPUT');
  return predicate(c,candidate.facts,{acquiredAt:candidate.acquiredAt,originalBody:candidate.originalBody,source:candidate.source});
}
export function evidenceRecord(candidate,request,{evidenceId,evidenceRevision,previousEvidenceId,condition}){
  return freeze(validateP0Evidence({version:BOOTCAMP_CONTRACT,evidenceId,evidenceRevision,participantId:request.participantId,
    applicationId:request.applicationId,policyHash:request.policyHash,criterionId:request.criterionId,capability:criterion(request.criterionId).capability,
    dataMode:'SYNTHETIC_FIXTURE',source:structuredClone(candidate.source),acquiredAt:candidate.acquiredAt,verifiedAt:candidate.verifiedAt,
    facts:structuredClone(candidate.facts),sourceVersion:candidate.sourceVersion,sourceHash:candidate.sourceHash,
    runtimeMappingHash:request.runtimeMappingHash,requestHash:request.requestHash,
    verification:{sourceStatus:'MOCK_VERIFIED',participantBinding:'VERIFIED',requestBinding:'VERIFIED',integrity:'VERIFIED',freshness:'VERIFIED'},
    condition,rawLocator:structuredClone(candidate.rawLocator),previousEvidenceId,gates:P0_GATES}));
}
export function decisionRecord(app,heads,{decisionId,decisionRevision,previousDecisionId,evaluatedAt}){
  const criterionResults=compiled.policy.criteria.map(c=>{
    const h=heads.find(h=>h.evidence.criterionId===c.criterionId),e=h?.evidence;
    return {criterionId:c.criterionId,state:h?.valid?e.condition:'UNKNOWN',evidenceId:e?.evidenceId??null,
      evidenceRevision:e?.evidenceRevision??null,sourceHash:e?.sourceHash??null,rawLocator:e?.rawLocator??null};
  });
  const states=criterionResults.map(r=>r.state);
  const record={version:BOOTCAMP_CONTRACT,decisionId,decisionRevision,participantId:app.participant_id,applicationId:app.id,
    policyHash:app.policy_hash,recipientRef:app.recipient_ref,courseOperatorRef:app.course_operator_ref,
    amountCandidate:{...compiled.policy.amount,kind:'DEMO_CANDIDATE_NOT_ENTITLEMENT'},
    evidenceVersions:heads.map(({evidence:e})=>({evidenceId:e.evidenceId,evidenceRevision:e.evidenceRevision,sourceHash:e.sourceHash,runtimeMappingHash:e.runtimeMappingHash})),
    criterionResults,conditionsStatus:states.includes('NOT_MET')?'NOT_MET':states.every(s=>s==='MET')?'MET':states.includes('MISSING')?'NEEDS_SUPPLEMENT':'UNKNOWN',
    evaluatedAt,previousDecisionId,current:true,gates:P0_GATES};
  return freeze({...record,decisionHash:p0Hash('DECISION',record)});
}
