// E5-B reads the real E3 ledger, with explicitly synthetic TEST sources. It
// never calls the old SYNTHETIC_PORT_FIXTURE chain/funding/authorization ports.
import {canonical,freeze,requireRule as check} from '../policy/values.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
import {PROFILE_HASH} from '../bootcamp-authorization/test-schema-v3.mjs';
import {createTestDraftInspector,hashTestUnsignedPayload} from '../bootcamp-authorization/test-encoding-v3.mjs';
import {currentSourceWindow} from './procedure-ports.mjs';
import {e4Hash} from './execution-e4-ports.mjs';

const ZERO='0x'+'00'.repeat(32);
export function createExecutionCurrent({db,heads,source,operatorBindings}){
 const decode=r=>r?JSON.parse(r.record):null;
 const one=(sql,...args)=>decode(db.prepare(sql).get(...args));
 const rows=(a,kind)=>db.prepare('SELECT * FROM e3_records WHERE application_id=? AND kind=? ORDER BY sequence').all(a,kind).map(r=>({...r,record:decode(r)}));
 const opaque=(kind,logical)=>{const r=db.prepare('SELECT opaque_id FROM e3_ids WHERE kind=? AND logical_id=?').get(kind,logical);check(r,'BC_E3_ID_NOT_REGISTERED');return r.opaque_id;};
 function consents(a,pub,route){
  const operators=operatorBindings(),last=new Map();
  for(const row of rows(a.id,'CONSENT').filter(r=>r.record.scopeHash===pub.consentScopeHash))last.set(row.record.actorRole,row);
  const active=[...last.values()].filter(r=>r.record.value==='AGREE'&&(r.record.actorRole==='PARTICIPANT'?r.actor_wallet===a.wallet:
   operators.some(b=>b.wallet===r.actor_wallet&&b.courseOperatorRef===a.course_operator_ref))).map(r=>r.record);
  const assessments=rows(a.id,'OBJECTION_ASSESSMENT').map(r=>r.record);
  const objections=rows(a.id,'OBJECTION').map(({record:r})=>({...r,assessment:assessments.filter(x=>x.objectionId===r.id).at(-1)??null}));
  check(!objections.some(r=>['UNASSESSED','VALID_UNRESOLVED'].includes(r.assessment?.outcome??'UNASSESSED')),'BC_E5_OBJECTION_BLOCKED');
  const both=active.some(r=>r.actorRole==='PARTICIPANT')&&active.some(r=>r.actorRole==='COURSE_OPERATOR');
  if(route==='1')check(both,'BC_E5_MUTUAL_CONSENT_REQUIRED');
  const record={version:'clear-bootcamp-app-consent-set.1',variant:route==='1'?'MUTUAL_CURRENT_APP_CONSENT':'DEADLINE_CURRENT_APP_CONSENT_SET',
   scopeHash:pub.consentScopeHash,consents:active.map(r=>({id:r.id,actorRole:r.actorRole,actorCommitment:r.actorCommitment,scopeHash:r.scopeHash,recordedAt:r.recordedAt}))
    .sort((a,b)=>a.actorRole<b.actorRole?-1:a.actorRole>b.actorRole?1:0),objectionVariant:objections.length?'ASSESSED_RECORDS':'NO_OBJECTIONS',
   objections:objections.map(r=>({id:r.id,status:r.assessment?.outcome??'UNASSESSED',assessmentId:r.assessment?.id??null,receiptHash:r.assessment?.receiptHash??null})).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)};
  return {record,hash:p0Hash('E3-APP-CONSENT-SET',record),both};
 }
 function right(a,observation,runtime){
  const b=observation.business,c=b.application,r=b.right;
  check(['5','6'].includes(c.state)&&b.applicationId===opaque('APPLICATION',a.id),'BC_E5_ACCEPTED_RIGHT_REQUIRED');
  const publications=db.prepare('SELECT record FROM e3_publications WHERE application_id=? ORDER BY sequence').all(a.id).map(decode);
  const pub=publications.find(p=>opaque('ALLOCATION',p.allocationId)===r.allocationId&&opaque('DECISION',p.decisionId)===c.target.decisionId&&p.decisionHash===c.target.decisionHash);
  check(pub&&r.recipient===pub.recipient&&r.recipient===a.wallet&&r.token===pub.token&&r.token===runtime.tokenAddress&&r.amountAtoms==='100000000'
   &&c.allocationId===r.allocationId&&c.recipient===r.recipient&&r.authorizationDigest!==ZERO&&r.nonce!==ZERO&&BigInt(r.acceptedAt)>0n,'BC_E5_UNREGISTERED_RIGHT');
  check(c.state==='6'?BigInt(r.settledAt)>0n:r.settledAt==='0','BC_E5_RIGHT_STATE');
  check(BigInt(r.acceptedAt)<=BigInt(observation.checkpoint.time)&&(c.state!=='6'||BigInt(r.settledAt)>=BigInt(r.acceptedAt)&&BigInt(r.settledAt)<=BigInt(observation.checkpoint.time)),'BC_E5_RIGHT_STATE');
  // Reading a stored right is intentionally independent of current E3 source,
  // consent, operator, key, pause, auth epoch and the first-accept window.
  return freeze({status:c.state==='6'?'SETTLED':'ACCEPTED',right:r,requiresCurrentSource:false,requiresCurrentSigner:false,
   requiresNewPaymentSignature:false,claimExpiresAt:null,claimOperationId:null,settlementJob:'NOT_IMPLEMENTED'});
 }
 function inspect(i,a,observation,runtime,time){
  check(['PREPARE','ACCEPT'].includes(i.kind),'BC_E5_COMMAND_ADAPTER_PENDING');
  const b=observation.business,c=b.application;
  check(b.applicationId===i.chainApplicationId&&i.chainApplicationId===opaque('APPLICATION',a.id),'BC_E5_CURRENT_TARGET');
  check(!['5','6'].includes(c.state),'BC_E5_FIRST_ACCEPT_ONLY');
  const d=one('SELECT record FROM decisions WHERE id=?',a.decision_id),p=one('SELECT record FROM e3_procedures WHERE application_id=?',a.id);
  const pub=one('SELECT record FROM e3_publications WHERE application_id=? ORDER BY sequence DESC LIMIT 1',a.id);
  const prepared=one('SELECT record FROM e3_prepared WHERE application_id=? AND id=?',a.id,i.preparationId);
  check(a.status==='ACTIVE'&&d.conditionsStatus==='MET'&&p&&pub&&prepared,'BC_E5_CURRENT_PREPARATION_REQUIRED');
  check(d.decisionId===i.targetDecisionId&&d.decisionHash===i.targetDecisionHash&&d.decisionRevision===i.targetDecisionRevision
   &&pub.decisionId===d.decisionId&&pub.decisionRevision===d.decisionRevision&&pub.decisionHash===d.decisionHash,'BC_E5_CURRENT_TARGET');
  check(time<p.reviewCapAt&&p.reviewCapAt===p.firstStartedAt+600&&pub.confirmAt===pub.publishedAt+120,'BC_E5_REVIEW_WINDOW');
  const revalidations=rows(a.id,'REVALIDATION').map(r=>r.record);
  check(revalidations.length<=1&&!revalidations.some(r=>r.fromDecisionId===d.decisionId)&&rows(a.id,'TERMINATION_REQUIRED').length===0,'BC_E5_REVALIDATION_BLOCKED');
  const payload=prepared.payload,m=payload.message,src=currentSourceWindow(a,heads,source,time),set=consents(a,pub,m.eligibilityRoute);
  check(src.commitment===prepared.sourceCommitment&&String(src.validUntilExclusive)===m.sourceValidUntilExclusive,'BC_E5_SOURCE_CHANGED');
  check(canonical(set.record)===canonical(prepared.consentSet)&&set.hash===m.consentSetHash,'BC_E5_CONSENT_CHANGED');
  const logical={applicationId:a.id,decisionId:d.decisionId,allocationId:pub.allocationId,procedureId:p.procedureId};
  check(canonical(payload.logicalTarget)===canonical(logical),'BC_E5_CURRENT_TARGET');
  const expected={applicationId:opaque('APPLICATION',a.id),decisionId:opaque('DECISION',d.decisionId),allocationId:opaque('ALLOCATION',pub.allocationId),procedureId:opaque('PROCEDURE',p.procedureId),
   decisionHash:d.decisionHash,decisionRevision:String(d.decisionRevision),policyHash:a.policy_hash,runtimeMappingHash:a.mapping_hash,
   recipient:pub.recipient,token:pub.token,amountAtoms:'100000000',firstReviewStartedAt:String(p.firstStartedAt),decisionPublishedAt:String(pub.publishedAt),
   revalidationCount:String(revalidations.length),consentSetHash:set.hash,operationsPolicyHash:PROFILE_HASH};
  for(const [k,v]of Object.entries(expected))check(m[k]===v,'BC_E5_CURRENT_TARGET');
  check(canonical(payload.domain)===canonical(runtime.domain)&&runtime.tokenAddress===m.token&&runtime.signerKeyId===m.signerKeyId,'BC_E5_CURRENT_RUNTIME');
  check(c.state==='3'&&c.version===i.expectedChainVersion&&c.epoch===m.authorizationEpoch,'BC_E5_CHAIN_CURRENT');
  check(c.target.decisionId===m.decisionId&&c.target.revision===m.decisionRevision&&c.target.decisionHash===m.decisionHash
   &&c.target.sourceValidUntilExclusive===m.sourceValidUntilExclusive&&c.recipient===m.recipient&&c.allocationId===m.allocationId
   &&c.procedureId===m.procedureId&&c.firstStartedAt===m.firstReviewStartedAt&&c.publishedAt===m.decisionPublishedAt
   &&c.revalidationCount===m.revalidationCount&&c.consentSetHash===m.consentSetHash,'BC_E5_CHAIN_CURRENT');
  check(BigInt(c.allocatedAt)<=BigInt(m.decisionPublishedAt)&&BigInt(c.targetRecordedAt)<=BigInt(m.decisionPublishedAt),'BC_E5_RECOVERY_BLOCKED');
  check(!b.paused&&!b.keyRevoked&&!b.nonceUsed&&b.nonce===m.nonce&&c.currentMet&&!c.validObjection&&!c.unassessedObjection&&!c.newValidError&&!c.terminalError,'BC_E5_CHAIN_AUTHORITY');
  check(m.eligibilityRoute!=='1'||c.mutualConsent,'BC_E5_CHAIN_CONSENT');
  const digest=hashTestUnsignedPayload({domain:payload.domain,message:m}).digest;
  check(i.authorizationDigest===digest,'BC_E5_AUTHORIZATION_DIGEST');
  if(i.kind==='PREPARE')check(c.preparedDigest===ZERO,'BC_E5_ALREADY_PREPARED');
  else check(c.preparedDigest===digest&&c.preparedNonce===m.nonce&&c.deadlinePolicyHash===m.deadlinePolicyHash,'BC_E5_PREPARED_BINDING');
  const current={status:'RESERVED',...expected,domain:runtime.domain,authorizationEpoch:c.epoch,signerKeyId:runtime.signerKeyId,signerActive:!b.keyRevoked,
   nonceAvailable:!b.nonceUsed,reservedBalanceAtoms:b.accounting.R,currentDecision:true,bothPartiesConsent:set.both,unresolvedValidObjection:false,
   unassessedSubstantiveObjection:false,sourceWindow:src.window,deadlinePolicyHash:m.deadlinePolicyHash,nonce:m.nonce,currentDecisionStatus:d.conditionsStatus,fullAllocation:true,newValidError:false};
  // This is the frozen synthetic-source E2 snapshot, not a relabelled E4 chain
  // observation. All current values above came from DB or the registered reader.
  for(const at of prepared.snapshot.provenance==='SYNTHETIC_EXAMPLE'?[time,Number(observation.checkpoint.time)]:[null]){
   const result=createTestDraftInspector(prepared.snapshot,at===null?{}:{clock:()=>at}).inspect(payload,current);
   check(result.status==='UNSIGNED_PREFLIGHT_ONLY','BC_E5_CURRENT_'+(result.code??'REJECTED'));
  }
  const method=i.kind==='PREPARE'?'prepareUnsigned':'accept',command={method,args:[i.operationId,m,i.expectedChainVersion],applicationId:i.chainApplicationId};
  check(i.caller===(i.kind==='PREPARE'?runtime.roles.registrar:runtime.roles.relayer)&&i.payloadHash===e4Hash(command),'BC_E5_EXACT_COMMAND');
  return freeze({version:'clear-bootcamp-e3-execution-current.1',sourceMode:prepared.snapshot.provenance==='SYNTHETIC_EXAMPLE'?'SYNTHETIC_TEST_SOURCE':'REGISTERED_TEST_SOURCE',command,authorizationDigest:digest,
   sourceCommitment:src.commitment,sourceValidUntilExclusive:src.validUntilExclusive,reviewCapAt:p.reviewCapAt,consentSetHash:set.hash,
   preparationId:i.preparationId,payload,productionEnabled:false});
 }
 return {inspect,right,consents};
}
