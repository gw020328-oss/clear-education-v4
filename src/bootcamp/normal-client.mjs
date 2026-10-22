// Browser-safe display adapter. Existing v2/v3 responses and consent commands retain their meanings.
export const NORMAL_VIEW_VERSION='clear-bootcamp-normal-view.1';
export const NORMAL_HOST_VERSION='clear-bootcamp-frontend-host.1';
const criteria=[['activity-complete','MOODLE_ACTIVITY_COMPLETION'],['assignment-submitted','MOODLE_ASSIGNMENT_SUBMISSION'],
 ['reflection-topics','MOODLE_REFLECTION_AI'],['python-basic-certificate','RECLAIM_HACKERRANK']];
const check=(ok,code='BC_NORMAL_RESPONSE')=>{if(!ok)throw Error(code);};
const id=v=>{check(typeof v==='string'&&/^[a-z][a-z0-9.-]{0,63}$/.test(v),'BC_NORMAL_ID');return v;};
const copy=v=>v===undefined?null:structuredClone(v);
const target=p=>({expectedRevision:p.applicationRevision,expectedLedgerSequence:p.ledgerSequence,
 targetDecisionId:p.decisionId,targetDecisionRevision:p.decisionRevision,targetDecisionHash:p.decisionHash});
const stable=p=>JSON.stringify(Object.fromEntries(Object.entries(p).filter(([k])=>k!=='asOf')));
export function normalView({procedure:p,operations:o,host}){
 check(host?.version===NORMAL_HOST_VERSION&&['SYNTHETIC_TEST_SOURCE','REGISTERED_TEST_SOURCE'].includes(host.sourceMode));
 check(p?.version==='clear-bootcamp-review-procedure.1'&&o?.version==='clear-bootcamp-operations-projection.2');
 check(host.procedureHttpVersion===p.version&&host.operationsHttpVersion===o.version&&p.policyHash===host.policyHash);
 check(Array.isArray(p.evidence?.criteria)&&Array.isArray(o.evidence?.criteria)
  &&['MET','NOT_MET','NEEDS_SUPPLEMENT','UNKNOWN'].includes(p.evidence.conditionsStatus));
 check(['PARTICIPANT','COURSE_OPERATOR'].includes(p.role)&&typeof o.current==='boolean');
 for(const k of ['applicationId','policyHash','runtimeMappingHash','decisionId','decisionRevision','decisionHash','ledgerSequence'])check(p[k]===o[k],'BC_NORMAL_STALE');
 check((p.role==='COURSE_OPERATOR'?'OPERATOR':p.role)===o.role&&p.evidence.conditionsStatus===o.evidence.conditionsStatus,'BC_NORMAL_STALE');
 const rows=criteria.map(([criterionId,source])=>{
  const a=p.evidence.criteria.find(r=>r.criterionId===criterionId),b=o.evidence.criteria.find(r=>r.criterionId===criterionId);
  check(a&&b&&a.state===b.state&&a.evidenceId===b.evidenceId,'BC_NORMAL_STALE');
  check(['MET','NOT_MET','MISSING','UNKNOWN'].includes(a.state)&&typeof a.current==='boolean');
  return {criterionId,state:a.state,current:a.current,evidenceId:a.evidenceId,evidenceRevision:b.evidenceRevision??null,
   reasonCode:b.reasonCode??null,expiresAt:b.expiresAt??null,source:{kind:source,hostMode:host.sourceMode,
    actualSourceVerification:null},originalEvidence:{authorized:a.originalEvidenceAccessible,httpAvailable:false}};
 });
 check(p.evidence.criteria.length===4&&o.evidence.criteria.length===4);
 return {version:NORMAL_VIEW_VERSION,displayOnly:true,applicationId:p.applicationId,policyHash:p.policyHash,
  runtimeMappingHash:p.runtimeMappingHash,role:p.role,target:target(p),observedAt:p.asOf,
  decision:{id:p.decisionId,revision:p.decisionRevision,hash:p.decisionHash,current:o.current,evidenceCurrent:p.evidence.current,conditionsStatus:p.evidence.conditionsStatus},
  criteria:rows,agreedPayment:{amountAtoms:'100000000',symbol:'TEST',decimals:6},funding:copy(p.funding),
  procedure:copy(p.procedure),consent:copy(p.consent),objection:{blocked:p.objection.blocked},
  payment:{acceptedRight:copy(p.chain.acceptedRight),transactionState:p.chain.transactionState,transactionHash:p.chain.transactionHash,
   blockRef:p.chain.blockRef,claimState:p.chain.acceptedRight?.claimState??null,receivedAtoms:null,canonicalTransferVerified:null,
   receiptHttpAvailable:host.executionReceiptHttpImplemented===true},sourceMode:host.sourceMode};
}
export function createNormalBootcampClient({request}){
 check(typeof request==='function','BC_NORMAL_CONFIG');
 const base=a=>'/bootcamp/v3/applications/'+id(a);
 const operation=(v,a)=>{check(v?.version==='clear-bootcamp-procedure-operation.1'&&v.record?.applicationId===a&&typeof v.current==='boolean'&&v.usableForPayment===false);return v;};
 const sourceBase=a=>'/bootcamp/v4/applications/'+id(a);
 const approval=(r,a)=>{check(r&&id(r.approvalId)&&/^0x[0-9a-f]{64}$/.test(r.requestHash)&&Number.isSafeInteger(r.expiresAt)
  &&r.purpose==='HACKERRANK_EVIDENCE_OBSERVATION_NOT_PAYMENT_AUTHORIZATION'
  &&typeof r.message==='string'&&r.message.startsWith('CLEAR HackerRank evidence observation approval; not a payment authorization.\n'),'BC_NORMAL_SOURCE_APPROVAL');return {...r,applicationId:a};};
 return Object.freeze({
  async bindSourceSession(applicationId,{signal}={}){
   const r=await request(sourceBase(applicationId)+'/source-session',{method:'POST',body:{},signal});
   check(r?.applicationId===applicationId&&r.paymentAuthorization===false,'BC_NORMAL_SOURCE_SESSION');return r;
  },
  async pendingSourceSignature(applicationId,{signal}={}){return approval(await request(sourceBase(applicationId)+'/source-signature',{signal}),applicationId);},
  async submitSourceSignature(applicationId,requestView,signature,{signal}={}){
   check(requestView?.applicationId===applicationId&&typeof signature==='string'&&/^0x[0-9a-fA-F]{130}$/.test(signature),'BC_NORMAL_SOURCE_APPROVAL');approval(requestView,applicationId);
   const r=await request(sourceBase(applicationId)+'/source-signature',{method:'POST',body:{approvalId:requestView.approvalId,signature},signal});
   check(r?.approvalId===requestView.approvalId&&r.requestHash===requestView.requestHash&&r.status==='PARTICIPANT_SIGNATURE_ACCEPTED'&&r.paymentAuthorization===false,'BC_NORMAL_SOURCE_APPROVAL');return r;
  },
  async paymentReceipt(applicationId,{signal}={}){
   const r=await request(sourceBase(applicationId)+'/payment-receipt',{signal});
   check(r?.version==='clear-bootcamp-normal-payment-receipt.1'&&r.applicationId===applicationId&&['PARTICIPANT','OPERATOR'].includes(r.role)
    &&r.expectedPayment?.amountAtoms==='100000000'&&r.expectedPayment?.symbol==='TEST'&&r.expectedPayment?.decimals===6
    &&['NOT_OBSERVED','READBACK_UNAVAILABLE','INCLUDED'].includes(r.claim?.state),'BC_NORMAL_RECEIPT');
   if(r.claim.state==='INCLUDED')check(r.claim.canonical===true&&r.claim.finalized===false
    &&r.claim.transferAmountAtoms==='100000000'&&r.balance.receivedAtoms==='100000000'&&r.balance.exactExpectedAmountVerified===true,'BC_NORMAL_RECEIPT');
   else check(r.claim.canonical===null&&r.claim.finalized===null&&r.claim.transferAmountAtoms===null&&r.balance?.receivedAtoms===null&&r.balance?.exactExpectedAmountVerified===null,'BC_NORMAL_RECEIPT');
   return r;
  },
  async view(applicationId,{signal}={}){
   const host=await request('/__dev/config',{signal});
   const before=await request(base(applicationId)+'/procedure',{signal});
   const operations=await request('/bootcamp/v2/applications/'+id(applicationId)+'/operations',{signal});
   const after=await request(base(applicationId)+'/procedure',{signal});
   check(before.applicationId===applicationId&&after.applicationId===applicationId&&stable(before)===stable(after),'BC_NORMAL_STALE');
   return normalView({procedure:after,operations,host});
  },
  async consent(applicationId,view,value,{idempotencyKey,signal}={}){
   check(view?.version===NORMAL_VIEW_VERSION&&view.applicationId===applicationId&&['AGREE','WITHDRAW'].includes(value),'BC_NORMAL_TARGET');
   const v=operation(await request(base(applicationId)+'/review-consents',{method:'POST',body:{...view.target,value},idempotencyKey:id(idempotencyKey),signal}),applicationId);
   check(v.record.target.decisionId===view.target.targetDecisionId,'BC_NORMAL_TARGET');return v;
  },
  async operation(applicationId,operationId,{signal}={}){const v=operation(await request(base(applicationId)+'/procedure-operations/'+id(operationId),{signal}),applicationId);check(v.record.operationId===operationId);return v;},
 });
}
