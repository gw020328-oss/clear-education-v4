import {canonical,freeze,requireRule as check} from '../policy/values.mjs';
import {currentSourceWindow} from './procedure-ports.mjs';
import {e4Hash} from './execution-e4-ports.mjs';
export const correctionKinds=['OBSERVE','REPLACE','TERMINATE'];
const ZERO='0x'+'00'.repeat(32);
// A proposed command is data, never authority. Rebuild it from the current
// ledger and the registered chain reader at every signing/sending boundary.
export function executionCorrections({db,heads,source}){
 const decode=r=>r?JSON.parse(r.record):null;
 const rows=(a,kind)=>db.prepare('SELECT record FROM e3_records WHERE application_id=? AND kind=? ORDER BY sequence').all(a,kind).map(decode);
 const opaque=(kind,id)=>{const r=db.prepare('SELECT opaque_id FROM e3_ids WHERE kind=? AND logical_id=?').get(kind,id);check(r,'BC_E3_ID_NOT_REGISTERED');return r.opaque_id;};
 function facts(a,time){
  const d=decode(db.prepare('SELECT record FROM decisions WHERE id=?').get(a.decision_id));
  const assessments=rows(a.id,'OBJECTION_ASSESSMENT'),objections=rows(a.id,'OBJECTION').map(r=>({id:r.id,outcome:assessments.filter(s=>s.objectionId===r.id).at(-1)?.outcome??'UNASSESSED'}));
  const revalidations=rows(a.id,'REVALIDATION'),termination=rows(a.id,'TERMINATION_REQUIRED');
  const met=a.status==='ACTIVE'&&d.conditionsStatus==='MET'&&heads(a).length===4&&heads(a).every(h=>h.valid);
  const src=met?currentSourceWindow(a,heads,source,time,{allowExpired:true}):null;
  return {d,src,met:!!src&&time<src.validUntilExclusive,objections,revalidations,termination,
   unassessed:objections.some(r=>r.outcome==='UNASSESSED'),valid:objections.some(r=>r.outcome==='VALID_UNRESOLVED')};
 }
 function gate(a,time){const f=facts(a,time);check(!f.unassessed&&!f.valid,'BC_E5_OBJECTION_BLOCKED');check(!f.termination.length&&!f.revalidations.some(r=>r.fromDecisionId===f.d.decisionId),'BC_E5_REVALIDATION_BLOCKED');}
 function build(i,a,o,time){
  const c=o.business.application,f=facts(a,time),p=decode(db.prepare('SELECT record FROM e3_procedures WHERE application_id=?').get(a.id));
  check(o.business.applicationId===opaque('APPLICATION',a.id)&&o.business.applicationId===i.chainApplicationId&&c.version===i.expectedChainVersion,'BC_E5B_CHAIN_CURRENT');
  check(['1','2','3'].includes(c.state)&&c.recipient===a.wallet,'BC_E5_CORRECTION_UNACCEPTED');
  check(f.d.decisionId===i.targetDecisionId&&f.d.decisionRevision===i.targetDecisionRevision&&f.d.decisionHash===i.targetDecisionHash,'BC_E5_CURRENT_TARGET');
  let method,args,sourceValidUntilExclusive=null,reviewCapAt=null;
  if(i.kind==='OBSERVE'){
   const observedAt=i.correctionCommand?.args[2]?.observedAt??String(Math.min(time,Number(o.checkpoint.time)));
   check(/^[0-9]+$/.test(observedAt)&&BigInt(observedAt)>=BigInt(c.observedAt)&&BigInt(observedAt)<=BigInt(time),'BC_E5_OBSERVATION_TIME');
   const pending=f.revalidations.some(r=>r.fromDecisionId===f.d.decisionId||opaque('DECISION',r.fromDecisionId)===c.target.decisionId);
   const fields={currentMet:f.met&&c.target.decisionHash===f.d.decisionHash,validObjection:f.valid,unassessedObjection:f.unassessed,
    newValidError:pending||f.termination.length>0,sourceValidUntilExclusive:String(Math.min(Number(c.target.sourceValidUntilExclusive),f.src?.validUntilExclusive??Infinity)),observedAt};
   const receiptHash=e4Hash({applicationId:a.id,decisionId:f.d.decisionId,decisionHash:f.d.decisionHash,objections:f.objections,revalidations:f.revalidations,termination:f.termination,fields});
   method='observeCurrent';args=[i.operationId,i.chainApplicationId,{...fields,receiptHash},i.expectedChainVersion];
  }else if(i.kind==='REPLACE'){
   check(f.met&&!f.unassessed&&!f.termination.length&&!c.unassessedObjection&&!c.terminalError,'BC_E5_REPLACEMENT_BLOCKED');
   check(!o.business.paused&&(!p||time<p.reviewCapAt),'BC_E5_REVIEW_WINDOW');
   const r=rows(a.id,'REGISTRATION_TARGET').at(-1);check(r?.recipientRegistration,'BC_E5_V2_CORRECTION_REQUIRED');check(r&&r.registration.decisionId===f.d.decisionId&&r.sourceCurrentCommitment===f.src.commitment,'BC_E5B_REGISTRATION_REQUIRED');
   const revalidation=f.revalidations.find(r=>opaque('DECISION',r.fromDecisionId)===c.target.decisionId&&r.fromDecisionHash===c.target.decisionHash);
   const mode=revalidation?'1':'0';check(!f.valid&&!c.validObjection&&!c.newValidError||mode==='1','BC_E5_REVALIDATION_BLOCKED');
   check(mode==='0'||c.revalidationCount==='0','BC_E5_REVALIDATION_BLOCKED');
   const target={decisionId:opaque('DECISION',f.d.decisionId),revision:String(f.d.decisionRevision),decisionHash:f.d.decisionHash,sourceValidUntilExclusive:String(f.src.validUntilExclusive),
    acceptanceSequence:c.target.acceptanceSequence,sourceReceiptHash:f.src.commitment};
   check(BigInt(target.revision)>BigInt(c.target.revision)&&target.decisionHash!==c.target.decisionHash,'BC_E5_CURRENT_TARGET');
   method='replaceTarget';args=[i.operationId,i.chainApplicationId,target,mode,i.expectedChainVersion];sourceValidUntilExclusive=f.src.validUntilExclusive;reviewCapAt=p?.reviewCapAt??null;
  }else{
   check(i.kind==='TERMINATE','BC_E5_KIND');const intent=rows(a.id,'TERMINATION_INTENT').at(-1);check(intent&&p,'BC_E5_TERMINATION_REQUIRED');
   const reason=intent.reason==='NEW_VALID_ERROR_AFTER_ONE_REVERIFICATION'?'2':intent.reason==='EXPIRED_EVIDENCE_NOT_REFRESHED_WITHIN_CAP'?'3':'1';
   check(reason==='2'?c.terminalError&&c.revalidationCount==='1':time>=p.reviewCapAt,'BC_E5_TERMINATION_REQUIRED');
   method='terminate';args=[i.operationId,i.chainApplicationId,reason,e4Hash(intent),i.expectedChainVersion];
  }
  return freeze({command:{method,args,applicationId:i.chainApplicationId},sourceCommitment:f.src?.commitment??ZERO,sourceValidUntilExclusive,reviewCapAt,payload:null,productionEnabled:false});
 }
 return {facts,gate,build};
}
