import {canonical,freeze,requireRule as check} from '../policy/values.mjs';
import {currentSourceWindow} from './procedure-ports.mjs';
import {verifyRecipientRegistration} from './recipient-registration.mjs';
import {executionCorrections,correctionKinds} from './execution-corrections.mjs';
import {e4Hash} from './execution-e4-ports.mjs';
const ZERO='0x'+'00'.repeat(32);
export function executionCommands({db,current,heads,source}){
 const corrections=executionCorrections({db,heads,source});
 const decode=row=>row?JSON.parse(row.record):null;
 const record=(a,kind)=>decode(db.prepare('SELECT record FROM e3_records WHERE application_id=? AND kind=? ORDER BY sequence DESC LIMIT 1').get(a,kind));
 const opaque=(kind,logical)=>{const r=db.prepare('SELECT opaque_id FROM e3_ids WHERE kind=? AND logical_id=?').get(kind,logical);check(r,'BC_E3_ID_NOT_REGISTERED');return r.opaque_id;};
 function registrationSignature(a,r,time=null){
  const signed=record(a.id,'RECIPIENT_REGISTRATION');check(signed&&r.recipientRegistration,'BC_RECIPIENT_REGISTRATION_REQUIRED');
  let verified;try{verified=verifyRecipientRegistration(r.recipientRegistration,signed.signature,{applicationOwner:a.wallet,nowSeconds:time??r.recordedAt,sourceValidUntilExclusive:r.sourceValidUntilExclusive});}catch{check(false,'BC_RECIPIENT_REGISTRATION_SIGNATURE');}
  check(verified.applicationId===opaque('APPLICATION',a.id)&&verified.digest===signed.digest,'BC_RECIPIENT_REGISTRATION_TARGET');
  return [r.recipientRegistration.message,signed.signature];
 }
 function inspect(i,a,o,runtime,time){
  if(correctionKinds.includes(i.kind)){const facts=corrections.build(i,a,o,time);check(canonical(facts.command)===canonical(i.correctionCommand)&&e4Hash(facts.command)===i.payloadHash&&i.caller===(i.kind==='TERMINATE'?runtime.roles.terminator:runtime.roles.registrar),'BC_E5_EXACT_COMMAND');return facts;}
  corrections.gate(a,time);
  if(['PREPARE','ACCEPT'].includes(i.kind))return current.inspect(i,a,o,runtime,time);
  const c=o.business.application,d=decode(db.prepare('SELECT record FROM decisions WHERE id=?').get(a.decision_id));
  check(a.status==='ACTIVE'&&d.conditionsStatus==='MET'&&i.targetDecisionId===d.decisionId&&i.targetDecisionHash===d.decisionHash&&i.targetDecisionRevision===d.decisionRevision,'BC_E5B_CURRENT_TARGET');
  check(i.chainApplicationId===opaque('APPLICATION',a.id)&&o.business.applicationId===i.chainApplicationId&&c.version===i.expectedChainVersion,'BC_E5B_CHAIN_CURRENT');
  const src=currentSourceWindow(a,heads,source,time),registration=record(a.id,'REGISTRATION_TARGET');
  const pub=decode(db.prepare('SELECT record FROM e3_publications WHERE application_id=? ORDER BY sequence DESC LIMIT 1').get(a.id));
  const p=decode(db.prepare('SELECT record FROM e3_procedures WHERE application_id=?').get(a.id));
  check(!o.business.paused&&!c.terminalError,'BC_E5B_CHAIN_AUTHORITY');
  let command,reviewCapAt=p?.reviewCapAt??null;
  if(i.kind==='REGISTER'){
   check(c.state==='0'&&registration&&registration.sourceCurrentCommitment===src.commitment&&registration.registration.decisionId===d.decisionId,'BC_E5B_REGISTRATION_REQUIRED');
   const target={decisionId:opaque('DECISION',d.decisionId),revision:String(d.decisionRevision),decisionHash:d.decisionHash,
    sourceValidUntilExclusive:String(src.validUntilExclusive),acceptanceSequence:registration.recipientRegistration?'0':String(registration.decisionAcceptanceSequence),sourceReceiptHash:src.commitment};
   command={method:'registerCurrentMet',args:[i.operationId,i.chainApplicationId,a.wallet,target,...(registration.recipientRegistration?registrationSignature(a,registration,time):[])],applicationId:i.chainApplicationId};
  }else{
   check(c.target.decisionId===opaque('DECISION',d.decisionId)&&c.target.decisionHash===d.decisionHash&&c.target.revision===String(d.decisionRevision)
    &&c.recipient===a.wallet&&c.currentMet&&!c.validObjection&&!c.unassessedObjection&&!c.newValidError,'BC_E5B_CHAIN_CURRENT');
   check(Number(c.target.sourceValidUntilExclusive)>=src.validUntilExclusive,'BC_E5B_SOURCE_EXTENSION');
   if(i.kind==='ALLOCATE'){
    check(registration&&c.state==='1'&&o.business.nextAllocatable===i.chainApplicationId&&BigInt(o.business.accounting.A)>=100000000n,'BC_E5B_FULL_ALLOCATION_REQUIRED');
    command={method:'allocate',args:[i.operationId,i.chainApplicationId,opaque('ALLOCATION',registration.registration.allocationId),i.expectedChainVersion],applicationId:i.chainApplicationId};
   }else{
    check(pub&&p&&pub.decisionId===d.decisionId&&pub.decisionHash===d.decisionHash&&c.allocationId===opaque('ALLOCATION',pub.allocationId)
     &&pub.recipient===a.wallet&&pub.token===runtime.tokenAddress&&time<p.reviewCapAt,'BC_E5B_PUBLICATION_REQUIRED');
    check(BigInt(c.allocatedAt)<=BigInt(pub.publishedAt)&&BigInt(c.targetRecordedAt)<=BigInt(pub.publishedAt),'BC_E5B_PUBLICATION_ORDER');
    if(i.kind==='START_REVIEW'){
     check(c.state==='2'&&(c.firstStartedAt==='0'?p.firstStartedAt===pub.publishedAt:c.firstStartedAt===String(p.firstStartedAt))&&p.reviewCapAt===p.firstStartedAt+600,'BC_E5B_REVIEW_STATE');
     command={method:'startReview',args:[i.operationId,i.chainApplicationId,opaque('PROCEDURE',p.procedureId),String(pub.publishedAt),i.expectedChainVersion],applicationId:i.chainApplicationId};
    }else if(i.kind==='BIND_CONSENTS'){
     check(c.state==='3'&&c.procedureId===opaque('PROCEDURE',p.procedureId)&&c.firstStartedAt===String(p.firstStartedAt)&&c.publishedAt===String(pub.publishedAt),'BC_E5B_REVIEW_STATE');
     const set=current.consents(a,pub,'1');command={method:'bindConsents',args:[i.operationId,i.chainApplicationId,set.hash,set.both,i.expectedChainVersion],applicationId:i.chainApplicationId};
    }else throw Error('BC_E5B_COMMAND_NOT_IMPLEMENTED');
   }
  }
  check(i.caller===runtime.roles.registrar&&i.payloadHash===e4Hash(command),'BC_E5_EXACT_COMMAND');
  return freeze({command,sourceCommitment:src.commitment,sourceValidUntilExclusive:src.validUntilExclusive,reviewCapAt,payload:null,productionEnabled:false});
 }
 function command(i,{verifyHash=true}={}){
  // The immutable request is reconstructed from owner records and subsequently
  // compared with current facts; no arbitrary method/args callback is accepted.
  const a=db.prepare('SELECT * FROM applications WHERE id=?').get(i.applicationId);check(a,'BC_NOT_FOUND');
  if(correctionKinds.includes(i.kind)){check(i.correctionCommand&&e4Hash(i.correctionCommand)===i.payloadHash,'BC_E5_EXACT_COMMAND');return i.correctionCommand;}
  const prepared=i.preparationId?decode(db.prepare('SELECT record FROM e3_prepared WHERE id=? AND application_id=?').get(i.preparationId,a.id)):null;
  if(['PREPARE','ACCEPT'].includes(i.kind)){check(prepared,'BC_E5_CURRENT_PREPARATION_REQUIRED');return {method:i.kind==='PREPARE'?'prepareUnsigned':'accept',args:[i.operationId,prepared.payload.message,i.expectedChainVersion],applicationId:i.chainApplicationId};}
  const d=decode(db.prepare('SELECT record FROM decisions WHERE id=?').get(a.decision_id)),r=record(a.id,'REGISTRATION_TARGET');
  const pub=decode(db.prepare('SELECT record FROM e3_publications WHERE application_id=? ORDER BY sequence DESC LIMIT 1').get(a.id));
  const p=decode(db.prepare('SELECT record FROM e3_procedures WHERE application_id=?').get(a.id));
  let method,args;
  if(i.kind==='REGISTER'){check(r,'BC_E5B_REGISTRATION_REQUIRED');method='registerCurrentMet';args=[i.operationId,i.chainApplicationId,a.wallet,{decisionId:i.chainDecisionId,revision:String(d.decisionRevision),decisionHash:d.decisionHash,sourceValidUntilExclusive:String(r.sourceValidUntilExclusive),acceptanceSequence:r.recipientRegistration?'0':String(r.decisionAcceptanceSequence),sourceReceiptHash:r.sourceCurrentCommitment},...(r.recipientRegistration?registrationSignature(a,r):[])];}
  else if(i.kind==='ALLOCATE'){check(r,'BC_E5B_REGISTRATION_REQUIRED');method='allocate';args=[i.operationId,i.chainApplicationId,opaque('ALLOCATION',r.registration.allocationId),i.expectedChainVersion];}
  else if(i.kind==='START_REVIEW'){check(p&&pub,'BC_E5B_PUBLICATION_REQUIRED');method='startReview';args=[i.operationId,i.chainApplicationId,opaque('PROCEDURE',p.procedureId),String(pub.publishedAt),i.expectedChainVersion];}
  else if(i.kind==='BIND_CONSENTS'){check(pub,'BC_E5B_PUBLICATION_REQUIRED');const set=current.consents(a,pub,'1');method='bindConsents';args=[i.operationId,i.chainApplicationId,set.hash,set.both,i.expectedChainVersion];}
  else throw Error('BC_E5B_COMMAND_NOT_IMPLEMENTED');
  const result={method,args,applicationId:i.chainApplicationId};if(verifyHash)check(e4Hash(result)===i.payloadHash,'BC_E5_EXACT_COMMAND');return result;
 }
 return {inspect,command};
}
