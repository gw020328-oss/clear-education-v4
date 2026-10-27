import {freeze,requireRule as check} from '../policy/values.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
import {compiled,id,epoch} from './model.mjs';

export const DECISION_EVIDENCE_VERSION='clear-bootcamp-decision-evidence.1';
const unavailable=()=>({status:'UNAVAILABLE',value:null});
const stored=value=>value===null||value===undefined?unavailable():{status:'RECORDED',value};
const select=(record,keys)=>Object.fromEntries(keys.map(k=>[k,record[k]??null]));
const fields=['/source/state','/source/submission','/source/body','/certificate/status'];
const verificationKeys=['sourceStatus','participantBinding','requestBinding','integrity','freshness'];

// Constructor-only DB access. No source/producer/raw/AI/execution ports are used.
// Do not reuse the ordinary access helper: its refresh/tick write new decisions.
export function createDecisionEvidenceReader({db,authentication,operatorBindings,now}){
 const row=(sql,...args)=>db.prepare(sql).get(...args);
 const decode=r=>r?JSON.parse(r.record):null;
 const actor=context=>{
  const s=authentication.authorizeWorkflow(context,false);
  check(['participant','operator'].includes(s?.role)&&/^0x[0-9a-fA-F]{40}$/.test(s.wallet),'FORBIDDEN');
  return {role:s.role,wallet:s.wallet.toLowerCase()};
 };
 const scope=(s,a,bindings)=>check(s.role==='participant'?s.wallet===a.wallet:
  bindings.some(b=>b.wallet===s.wallet&&b.courseOperatorRef===a.course_operator_ref),'FORBIDDEN');
 return {getDecisionEvidence(context,applicationId,decisionId){
  id(applicationId);if(decisionId!==undefined)id(decisionId);
  // A synchronous read transaction gives one consistent append-only snapshot.
  // Authentication and mutable course bindings are checked again before return.
  const firstBindings=operatorBindings(),initial=actor(context);
  db.exec('BEGIN');
  try{
   const a=row('SELECT * FROM applications WHERE id=?',applicationId);check(a,'BC_NOT_FOUND');scope(initial,a,firstBindings);
   const time=epoch(now()),floor=row('SELECT floor FROM clock WHERE id=1')?.floor;
   check(floor===undefined||time>=floor,'BC_CLOCK_REVERSED');
   const decisionRow=row('SELECT * FROM decisions WHERE id=? AND application_id=?',decisionId??a.decision_id,a.id),d=decode(decisionRow);check(d,'BC_NOT_FOUND');
   check(d.decisionId===decisionRow.id&&d.applicationId===a.id&&d.decisionRevision===decisionRow.revision,'BC_DECISION_TARGET');
   const availability=[];
   const criteria=compiled.policy.criteria.map(c=>{
    const r=d.criterionResults.find(r=>r.criterionId===c.criterionId);
    check(r,'BC_DECISION_TARGET');
    const e=r.evidenceId?decode(row('SELECT record FROM evidence WHERE id=? AND application_id=? AND criterion_id=?',r.evidenceId,a.id,c.criterionId)):null;
    if(e)check(e.evidenceId===r.evidenceId&&e.applicationId===a.id&&e.criterionId===c.criterionId&&e.evidenceRevision===r.evidenceRevision&&e.sourceHash===r.sourceHash&&e.policyHash===d.policyHash
     &&d.evidenceVersions.some(v=>v.evidenceId===e.evidenceId&&v.evidenceRevision===e.evidenceRevision&&v.sourceHash===e.sourceHash&&v.runtimeMappingHash===e.runtimeMappingHash),'BC_DECISION_TARGET');
    const h=e?row('SELECT * FROM evidence_heads WHERE application_id=? AND criterion_id=?',a.id,c.criterionId):null;
    const b=e?decode(row('SELECT record FROM r2_bridges WHERE evidence_id=?',e.evidenceId)):null;
    if(b)check(b.ledgerRequestHash===e.requestHash,'BC_DECISION_TARGET');
    const events=e?db.prepare('SELECT record FROM events WHERE application_id=?').all(a.id).map(decode).filter(v=>v.target===e.evidenceId):[];
    const deleted=events.some(v=>v.reason==='DELETED'),sameHead=!!e&&h?.evidence_id===e.evidenceId;
    const expired=!!e&&(time<e.verifiedAt||time-e.acquiredAt>(c.source==='RECLAIM_HACKERRANK'?900:300)
     ||time>=e.rawLocator.expiresAt||(sameHead&&time>=h.valid_until)||(b?.validUntilExclusive!==undefined&&time>=b.validUntilExclusive)
     ||c.source==='RECLAIM_HACKERRANK'&&['accountProofIssuedAt','certificateProofIssuedAt'].some(k=>time-e.facts[k]>900));
    availability.push({criterionId:c.criterionId,evidenceId:r.evidenceId,
     status:!r.evidenceId?'MISSING':!e?'UNAVAILABLE':deleted?'DELETED':expired?'EXPIRED':!sameHead?'SUPERSEDED':!h.valid?'INVALIDATED':a.status!=='ACTIVE'?'APPLICATION_INACTIVE':'VALID_AS_RECORDED',
     sourceCurrentness:'UNKNOWN',sourceValidUntilExclusive:sameHead?h.valid_until:b?.validUntilExclusive??null,
     original:{status:deleted?'DELETED':expired?'EXPIRED':'UNAVAILABLE',httpAvailable:false,expiresAt:e?.rawLocator.expiresAt??null}});
    if(!e)return {criterionId:c.criterionId,state:r.state,evidenceId:r.evidenceId,evidenceRevision:r.evidenceRevision,metadataStatus:r.evidenceId?'UNAVAILABLE':'MISSING',source:null,verification:null,reference:unavailable(),checks:null};
    // Only an evidence opaque ID and fixed logical field are exposed. Source
    // account/instance/record IDs, raw locations, owner hashes and text stay private.
    const reference=b?stored({version:b.version,receiptHash:b.receiptHash,producerRequestHash:b.producerRequestHash,
     ...(c.source==='RECLAIM_HACKERRANK'?select(b,['proofBundleHash','trustConfigHash','recipeHash','validUntilExclusive']):select(b,['observationHash']))}):unavailable();
    const f=e.facts;
    const checks=c.criterionId==='activity-complete'?select(f,['completionState','completionMode','completionRuleHash','sourceCompletedAt']):
     c.criterionId==='assignment-submitted'?select(f,['submissionState','sourceSubmittedAt']):
     c.criterionId==='reflection-topics'?{originalBodyHash:f.originalBodyHash,observationRunId:f.observationRunId,
      profileHash:stored(f.observationProfileHash),rubricVersion:unavailable(),modelVersion:unavailable(),promptVersion:unavailable(),
      topics:f.topics.map(t=>({topicId:t.topicId,state:t.state,location:t.originalEvidenceLocator?{
       evidenceId:e.evidenceId,field:'/source/body',start:t.originalEvidenceLocator.start,end:t.originalEvidenceLocator.end,
       unit:'UTF16_CODE_UNIT',quoteHash:t.originalEvidenceLocator.quoteHash}:null}))}:
     select(f,['certificateName','issuerStatus','accountProofHash','certificateProofHash','accountProofIssuedAt','certificateProofIssuedAt','achievementAt']);
    return {criterionId:c.criterionId,state:r.state,evidenceId:e.evidenceId,evidenceRevision:e.evidenceRevision,metadataStatus:'RECORDED',
     source:{kind:c.source,dataMode:e.dataMode,sourceHash:e.sourceHash,acquiredAt:e.acquiredAt,verifiedAt:e.verifiedAt,
      runtimeMappingHash:e.runtimeMappingHash,requestHash:e.requestHash,location:{evidenceId:e.evidenceId,field:fields.includes(e.rawLocator.fieldPath)?e.rawLocator.fieldPath:null}},
     verification:select(e.verification,verificationKeys),reference,checks};
   });
   const manifest={version:'clear-bootcamp-evidence-manifest.1',applicationId:a.id,decision:{decisionId:d.decisionId,decisionRevision:d.decisionRevision,
    decisionHash:d.decisionHash,policyHash:d.policyHash,policyVersion:unavailable(),evaluatedAt:d.evaluatedAt,conditionsStatus:d.conditionsStatus},criteria};
   const value=freeze({version:DECISION_EVIDENCE_VERSION,applicationId:a.id,role:initial.role==='operator'?'COURSE_OPERATOR':'PARTICIPANT',observedAt:time,
    currentDecision:{decisionId:a.decision_id,applicationActive:a.status==='ACTIVE',matchesRequestedDecision:a.decision_id===d.decisionId},
    manifest,manifestHash:p0Hash('EVIDENCE-MANIFEST',manifest),availability,
    limitations:{hashProvesSourceTruth:false,independentReverificationAvailable:false,liveSourceChecked:false,originalTextHttpAvailable:false,usableForPayment:false}});
   const finalTime=epoch(now());check(finalTime>=time,'BC_CLOCK_REVERSED');check(finalTime===time,'BC_VIEW_STALE');
   const finalBindings=operatorBindings(),final=actor(context);
   check(final.role===initial.role&&final.wallet===initial.wallet,'BC_COMMIT_AUTHORITY');scope(final,a,finalBindings);
   db.exec('COMMIT');return value;
  }catch(error){db.exec('ROLLBACK');throw error;}
 }};
}
