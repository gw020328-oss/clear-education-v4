import {exactKeys,canonical,freeze,requireRule as check} from '../policy/values.mjs';
import {P0_GATES,p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
import {PROFILE_ID,PROFILE_COMMIT,PROFILE_HASH} from '../bootcamp-authorization/test-schema-v3.mjs';
import {createTestDraftInspector,testDeadlineHash,testDeadlineRecord} from '../bootcamp-authorization/test-encoding-v3.mjs';
import {recipientRegistration,verifyRecipientRegistration} from './recipient-registration.mjs';
import {id,hash,revision} from './model.mjs';
import {procedureLedger,procedureId} from './procedure-ledger.mjs';
import {createProcedurePorts,currentSourceWindow,sameSnapshot,snapshotHash} from './procedure-ports.mjs';

const VERSION='clear-bootcamp-review-procedure.1';
const role=s=>s.role==='participant'?'PARTICIPANT':'COURSE_OPERATOR';
const targetKeys=['expectedRevision','expectedLedgerSequence','targetDecisionId','targetDecisionRevision','targetDecisionHash'];
export function createProcedure({db,transaction,ledger,access,heads,source,replay,command,operatorBindings,mode,ports:configuration,fault}){
 const l=procedureLedger(db,ledger),ports=createProcedurePorts(configuration,mode);
 const decision=a=>JSON.parse(db.prepare('SELECT record FROM decisions WHERE id=?').get(a.decision_id).record);
 const acceptance=d=>db.prepare('SELECT sequence FROM r2_decisions WHERE decision_id=?').get(d.decisionId).sequence;
 const records=(a,kind)=>l.rows(a.id,kind).map(r=>r.record);
 const publication=a=>l.publications(a.id).at(-1)??null;
 const actorCommitment=(a,s)=>p0Hash('E3-APP-ACTOR',{applicationId:a.id,role:role(s),wallet:s.wallet});
 function observe(observers,read){const value=read();observers.push(()=>check(sameSnapshot(value,read()),'BC_E3_PORT_CHANGED'));return value;}
 function state(a,time,observers){
  const d=decision(a),p=l.getProcedure(a.id),pub=publication(a),chain=observe(observers,()=>ports.chain(a));
  const accepted=chain.status==='ACCEPTED';
  if(accepted){const historical=l.publications(a.id).find(x=>x.allocationId===chain.allocationId&&x.decisionId===chain.decisionId);
   check(historical&&historical.recipient===chain.recipient&&historical.token===chain.token,'BC_E3_UNREGISTERED_RIGHT');}
  const funding=accepted?{implementation:'NOT_IMPLEMENTED',snapshotId:null}:observe(observers,()=>ports.funding(a,d,acceptance(d)));
  const checkpoint=records(a,'E4_CHECKPOINT').at(-1);
  if(funding.status==='FULLY_ALLOCATED'&&checkpoint){
   check(funding.allocationId===checkpoint.allocationId&&funding.obligationId===checkpoint.obligationId
    &&BigInt(funding.allocationVersion)>=BigInt(checkpoint.allocationVersion)&&BigInt(funding.authorizationEpoch)>=BigInt(checkpoint.authorizationEpoch),'BC_E3_CHECKPOINT_REGRESSION');
   if(funding.decisionId!==checkpoint.decisionId||funding.decisionHash!==checkpoint.decisionHash){const r=funding.replacement;
    check(r&&r.fromDecisionId===checkpoint.decisionId&&r.fromDecisionHash===checkpoint.decisionHash
     &&BigInt(r.fromAuthorizationEpoch)>=BigInt(checkpoint.authorizationEpoch)&&BigInt(r.fromAllocationVersion)>=BigInt(checkpoint.allocationVersion),'BC_E3_CHECKPOINT_TARGET');}
  }
  const count=records(a,'REVALIDATION').length;
  const assessments=records(a,'OBJECTION_ASSESSMENT');
  const objections=records(a,'OBJECTION').map(r=>({...r,assessment:assessments.filter(x=>x.objectionId===r.id).at(-1)??null}));
  const unresolved=objections.some(r=>['UNASSESSED','VALID_UNRESOLVED'].includes(r.assessment?.outcome??'UNASSESSED'));
  const scope=operatorBindings();
  const consents=l.rows(a.id,'CONSENT').filter(r=>pub&&pub.decisionId===d.decisionId&&r.record.scopeHash===pub.consentScopeHash);
  const last=new Map();for(const row of consents)last.set(row.record.actorRole,row);
  const active=[...last.values()].filter(r=>r.record.value==='AGREE'&&(r.record.actorRole==='PARTICIPANT'?r.actor_wallet===a.wallet:
   scope.some(b=>b.wallet===r.actor_wallet&&b.courseOperatorRef===a.course_operator_ref))).map(r=>r.record);
  const both=active.some(r=>r.actorRole==='PARTICIPANT')&&active.some(r=>r.actorRole==='COURSE_OPERATOR');
  const current=!!pub&&pub.decisionId===d.decisionId&&pub.decisionRevision===d.decisionRevision&&pub.decisionHash===d.decisionHash;
  const ledgerMet=a.status==='ACTIVE'&&d.conditionsStatus==='MET'&&heads(a).length===4&&heads(a).every(h=>h.valid);
  const sourceState=ledgerMet?observe(observers,()=>currentSourceWindow(a,heads,source,time,{allowExpired:true})):null;
  const met=ledgerMet&&time<sourceState.validUntilExclusive;
  const fullCurrent=funding.status==='FULLY_ALLOCATED'&&funding.decisionId===d.decisionId&&funding.decisionRevision===d.decisionRevision&&funding.decisionHash===d.decisionHash
   &&funding.acceptanceSequence===acceptance(d);
  const termination=records(a,'TERMINATION_REQUIRED').at(-1)??null;
  const revalidationPending=records(a,'REVALIDATION').some(r=>r.fromDecisionId===d.decisionId);
  let status='NOT_STARTED';
  if(accepted)status='ACCEPTED_RIGHT_PRESERVED';
  else if(chain.status==='TERMINATED')status='CONTRACT_TERMINATED';
  else if(p&&(time>=p.reviewCapAt||termination))status='UNRESOLVED_TERMINATION_REQUIRED';
  else if(p&&a.status!=='ACTIVE')status='INVALIDATED_WAIT_FOR_TERMINATION_CONDITION';
  else if(!met)status='SOURCE_REVERIFICATION_REQUIRED';
  else if(revalidationPending)status='REVALIDATION_REQUIRED';
  else if(!fullCurrent)status=p?'FULL_ALLOCATION_REQUIRED':'FUNDING_WAIT';
  else if(!p)status='READY_TO_PUBLISH';
  else if(!current)status='CURRENT_DECISION_PUBLICATION_REQUIRED';
  else if(funding.allocationId!==pub.allocationId)status='FULL_ALLOCATION_REQUIRED';
  else if(unresolved)status='OBJECTION_BLOCKED';
  else if(both)status='EARLY_CONSENT_PREFLIGHT_CANDIDATE';
  else if(pub.confirmAt<p.reviewCapAt&&time>=pub.confirmAt)status='DEADLINE_PREFLIGHT_CANDIDATE';
  else if(pub.confirmAt>=p.reviewCapAt)status='FULL_120_ROUTE_UNAVAILABLE';
  else status='WAITING_CONFIRMATION';
  return {a,d,p,pub,chain,funding,count,objections,active,both,current,met,sourceState,fullCurrent,unresolved,termination,revalidationPending,status};
 }
 function consentSet(st,route){
  // Auth nonce, issuedAt/expiresAt and final deadline hash are intentionally not
  // in the consent scope. The final .3 window can commit to this set, not vice versa.
  const data={version:'clear-bootcamp-app-consent-set.1',variant:route==='1'?'MUTUAL_CURRENT_APP_CONSENT':'DEADLINE_CURRENT_APP_CONSENT_SET',
   scopeHash:st.pub.consentScopeHash,consents:st.active.map(r=>({id:r.id,actorRole:r.actorRole,actorCommitment:r.actorCommitment,scopeHash:r.scopeHash,recordedAt:r.recordedAt}))
    .sort((a,b)=>a.actorRole<b.actorRole?-1:a.actorRole>b.actorRole?1:0),
   objectionVariant:st.objections.length?'ASSESSED_RECORDS':'NO_OBJECTIONS',
   objections:st.objections.map(r=>({id:r.id,status:r.assessment?.outcome??'UNASSESSED',assessmentId:r.assessment?.id??null,receiptHash:r.assessment?.receiptHash??null})).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)};
  if(route==='1')check(st.both,'BC_E3_MUTUAL_CONSENT_REQUIRED');
  return freeze({record:data,hash:p0Hash('E3-APP-CONSENT-SET',data)});
 }
 function checkTarget(a,body){
  revision(body.expectedRevision);revision(body.targetDecisionRevision);id(body.targetDecisionId);hash(body.targetDecisionHash);
  check(Number.isSafeInteger(body.expectedLedgerSequence)&&body.expectedLedgerSequence>=0,'BC_LEDGER_SEQUENCE');
  check(a.revision===body.expectedRevision&&ledger.sequence()===body.expectedLedgerSequence,'BC_VIEW_STALE');const d=decision(a);
  check(d.decisionId===body.targetDecisionId&&d.decisionRevision===body.targetDecisionRevision&&d.decisionHash===body.targetDecisionHash,'BC_DECISION_TARGET');
 }
 function run(context,applicationId,body,key,name,extras,fn){
  exactKeys(body,[...targetKeys,...extras],'BC_E3_COMMAND_BODY');const observers=[];let attempt;
  try{return access(context,applicationId,true,(a,s,time)=>{
   // A clock-only registration rollback must reacquire every port observation.
   observers.length=0;
   const route='e3-'+name+':'+a.id,prior=replay(s.wallet,route,key,body);if(prior)return operation(a,prior,time);
   checkTarget(a,body);attempt={applicationId:a.id,decision:decision(a),operationId:'operation-'+p0Hash('E3-OPERATION',{applicationId:a.id,route,key,actor:actorCommitment(a,s)}).slice(2,50),start:ledger.stamp()};
   const st=state(a,time,observers);const target=fn(st,s,time,observers);
   if(st.funding.status==='FULLY_ALLOCATED'){
    const checkpoint={version:'clear-bootcamp-e3-observed-funding-checkpoint.1',id:procedureId('checkpoint'),allocationId:st.funding.allocationId,obligationId:st.funding.obligationId,
     allocationVersion:st.funding.allocationVersion,authorizationEpoch:st.funding.authorizationEpoch,decisionId:st.funding.decisionId,decisionHash:st.funding.decisionHash,
     snapshotHash:snapshotHash(st.funding),observedAt:time,execution:st.funding.execution};
    l.record(a.id,'E4_CHECKPOINT',p0Hash('E3-FUNDING-CHECKPOINT',{applicationId:a.id,snapshotHash:checkpoint.snapshotHash}),checkpoint);
   }
   fault('e3-before-command');
   const saved=command(a,s.wallet,route,key,body,{decisionId:st.d.decisionId,...target},time,{...attempt,extraEvent:'AUTO_OPERATION_COMPLETED'});fault('e3-after-command');
   return operation(a,saved,time);
  },(_a,_s,time)=>observers.forEach(f=>f(time)),{retryClockBoundary:name==='register-target',consentCommitClock:name==='consent'||name==='recipient-registration'});}catch(error){
   if(attempt)transaction(()=>ledger.emit({...attempt,eventType:'OPERATION_FAILED'}));throw error;
  }
 }
 function operation(a,r,time){
  const p=l.getProcedure(a.id),pub=publication(a);
  return freeze({version:'clear-bootcamp-procedure-operation.1',record:{operationId:r.operationId,applicationId:a.id,target:r.target,committedAt:r.committedAt},
   current:a.status==='ACTIVE'&&a.decision_id===r.target.decisionId&&(!p||time<p.reviewCapAt)&&(!r.target.publicationId||r.target.publicationId===pub?.publicationId),
   usableForPayment:false,gates:P0_GATES});
 }
 function published(st){check(st.p&&st.current&&st.met&&st.fullCurrent&&st.funding.allocationId===st.pub.allocationId&&BigInt(st.funding.allocationVersion)>=BigInt(st.pub.allocationVersion),'BC_E3_CURRENT_PUBLICATION_REQUIRED');}
 function active(st,time){check(st.chain.status==='UNACCEPTED'&&st.p&&time<st.p.reviewCapAt&&!st.termination&&st.a.status==='ACTIVE','BC_E3_REVIEW_CLOSED');}
 function sourceObservation(st,time,observers){return observe(observers,()=>currentSourceWindow(st.a,heads,source,time));}
 function evidenceIds(a,ids){for(const evidenceId of ids)check(db.prepare('SELECT 1 FROM evidence WHERE id=? AND application_id=?').get(evidenceId,a.id),'BC_E3_ASSESSMENT_EVIDENCE');}
 function terminationReason(st,time){return st.termination?.reason??(st.p&&time>=st.p.reviewCapAt?
  heads(st.a).some(h=>!h.valid&&h.reason==='EXPIRED')?'EXPIRED_EVIDENCE_NOT_REFRESHED_WITHIN_CAP':'REVIEW_CAP_UNRESOLVED':null);}
 function view(st,s,time){
  const {a,d,p,pub}=st;const eligible=['EARLY_CONSENT_PREFLIGHT_CANDIDATE','DEADLINE_PREFLIGHT_CANDIDATE'].includes(st.status);
  return freeze({version:VERSION,profileHash:PROFILE_HASH,role:role(s),applicationId:a.id,applicationRevision:a.revision,ledgerSequence:ledger.sequence(),
   policyHash:a.policy_hash,runtimeMappingHash:a.mapping_hash,decisionId:d.decisionId,decisionRevision:d.decisionRevision,decisionHash:d.decisionHash,
   evidence:{conditionsStatus:d.conditionsStatus,current:st.met,validUntilExclusive:st.sourceState?.validUntilExclusive??null,criteria:d.criterionResults.map(r=>({criterionId:r.criterionId,state:r.state,evidenceId:r.evidenceId,
    current:!!heads(a).find(h=>h.criterion_id===r.criterionId)?.valid,originalEvidenceAccessible:s.role==='participant'&&!!heads(a).find(h=>h.criterion_id===r.criterionId)?.valid}))},
   procedure:{id:p?.procedureId??null,status:st.status,firstStartedAt:p?.firstStartedAt??null,reviewCapAt:p?.reviewCapAt??null,
    publishedDecisionId:pub?.decisionId??null,publishedAt:pub?.publishedAt??null,confirmAt:pub?.confirmAt??null,
    deadlineRouteAvailable:!!p&&!!pub&&pub.confirmAt<p.reviewCapAt,revalidationCount:st.count,revalidationLimit:1,
    terminationReason:terminationReason(st,time),invalidationReason:a.status!=='ACTIVE'?'APPLICATION_CANCELLED':null,reservationReleased:false,epochInvalidated:false},
   consent:{scopeHash:pub?.consentScopeHash??null,bothCurrent:st.both,records:st.active,requiredRoles:['PARTICIPANT','COURSE_OPERATOR'],onchainWalletSignaturesVerified:false},
   objection:{blocked:st.unresolved,records:st.objections,assessmentAuthority:configuration?'SYNTHETIC_PORT_FIXTURE':'NOT_IMPLEMENTED',deadlineExtended:false},
   funding:{implementation:st.funding.execution??'NOT_IMPLEMENTED',snapshotId:st.funding.snapshotId,status:st.funding.status??null,
    allocationId:st.funding.allocationId??null,targetDecisionId:st.funding.decisionId??null,matchesCurrentDecision:st.fullCurrent,
    queue:st.funding.queue??null,amountAtoms:st.funding.amountAtoms??null,reservedAtoms:st.funding.reservedAtoms??null},
   chain:{implementation:st.chain.execution??'NOT_IMPLEMENTED',status:st.chain.status??null,acceptedRight:st.chain.status==='ACCEPTED'?{
    state:'FIXED_RIGHT_PRESERVED',claimState:st.chain.claimState,recipientRef:a.recipient_ref,amountAtoms:st.chain.amountAtoms,
    claimExpiresAt:null,requiresCurrentSource:false,requiresCurrentSigner:false,requiresNewSignature:false}:null,
    transactionState:st.chain.transactionState??null,transactionHash:st.chain.transactionHash??null,blockRef:st.chain.blockRef??null},
   execution:{status:eligible?'UNSIGNED_PREFLIGHT_CANDIDATE':'BLOCKED',signerActivated:false,outboxImplemented:false,paymentAuthority:false,productionEnabled:false},
   asOf:time,metrics:ledger.metrics(a.id),gates:P0_GATES});
 }
 function draft(st,time,observers){
  active(st,time);published(st);check(!st.revalidationPending,'BC_E3_REVALIDATION_REQUIRED');check(!st.unresolved,'BC_E3_OBJECTION_BLOCKED');
  const route=st.both?'1':'2';if(route==='2')check(time>=st.pub.confirmAt&&st.pub.confirmAt<st.p.reviewCapAt,'BC_E3_CONFIRMATION_WINDOW');
  const src=sourceObservation(st,time,observers),auth=observe(observers,()=>ports.authorization(st.a));
  check(auth.authorizationEpoch===st.funding.authorizationEpoch,'BC_E3_EPOCH_MISMATCH');
  const registration=records(st.a,'REGISTRATION_TARGET').filter(r=>r.registration.decisionId===st.d.decisionId).at(-1);
  if(registration)check(sameSnapshot(registration.registration.domain,auth.domain),'BC_E3_REGISTRATION_DOMAIN');
  const target={applicationId:st.a.id,decisionId:st.d.decisionId,allocationId:st.pub.allocationId,procedureId:st.p.procedureId};
  const kinds={applicationId:'APPLICATION',decisionId:'DECISION',allocationId:'ALLOCATION',procedureId:'PROCEDURE'};
  const registrations=Object.entries(kinds).map(([field,kind])=>({kind,logicalId:target[field],opaqueId:l.opaque(kind,target[field])}));
  const set=consentSet(st,route),message={...Object.fromEntries(Object.keys(kinds).map(f=>[f,l.opaque(kinds[f],target[f])])),policyHash:st.a.policy_hash,runtimeMappingHash:st.a.mapping_hash,
   decisionRevision:String(st.d.decisionRevision),decisionHash:st.d.decisionHash,recipient:st.pub.recipient,token:st.pub.token,amountAtoms:'100000000',consentSetHash:set.hash,
   deadlinePolicyHash:'',eligibilityRoute:route,nonce:auth.nonce,issuedAt:String(time),expiresAt:String(Math.min(st.p.reviewCapAt,src.validUntilExclusive,auth.expiresAt)),
   signerKeyId:auth.signerKeyId,authorizationEpoch:auth.authorizationEpoch,operationsPolicyHash:PROFILE_HASH,firstReviewStartedAt:String(st.p.firstStartedAt),
   decisionPublishedAt:String(st.pub.publishedAt),sourceValidUntilExclusive:String(src.validUntilExclusive),revalidationCount:String(st.count)};
  message.deadlinePolicyHash=testDeadlineHash(message);
  const snapshot={version:'clear-bootcamp-test-unsigned-snapshot.1',provenance:mode==='ISOLATED_LIVE_TEST'?'REGISTERED_TEST_SOURCE':'SYNTHETIC_EXAMPLE',profilePin:{profileId:PROFILE_ID,sourceCommit:PROFILE_COMMIT,profileHash:PROFILE_HASH},
   registrations,logicalTarget:target,tokenDecimals:'6',domain:auth.domain,message,deadlineRecord:testDeadlineRecord(message)};
  const payload={logicalTarget:target,domain:auth.domain,message};
  const current={status:'RESERVED',...Object.fromEntries(['applicationId','procedureId','firstReviewStartedAt','decisionPublishedAt','decisionId','decisionRevision','decisionHash','runtimeMappingHash','allocationId','recipient','token','amountAtoms',
   'authorizationEpoch','signerKeyId','revalidationCount','policyHash','operationsPolicyHash','consentSetHash','deadlinePolicyHash','nonce'].map(k=>[k,message[k]])),
   domain:auth.domain,signerActive:auth.signerActive,nonceAvailable:auth.nonceAvailable,reservedBalanceAtoms:st.funding.reservedAtoms,currentDecision:st.met,
   bothPartiesConsent:st.both,unresolvedValidObjection:st.objections.some(r=>r.assessment?.outcome==='VALID_UNRESOLVED'),unassessedSubstantiveObjection:st.objections.some(r=>!r.assessment),
   sourceWindow:src.window,currentDecisionStatus:st.d.conditionsStatus,fullAllocation:true,newValidError:!!st.termination};
  const inspection=createTestDraftInspector(snapshot,mode==='ISOLATED_LIVE_TEST'?{}:{clock:()=>time}).inspect(payload,current);
  check(inspection.status==='UNSIGNED_PREFLIGHT_ONLY','BC_E3_PREFLIGHT_'+(inspection.code??'REJECTED'));
  return freeze({snapshot,payload,current,inspection,consentSet:set.record,sourceCommitment:src.commitment,
   fundingSnapshotHash:snapshotHash(st.funding),authorizationSnapshotHash:snapshotHash(auth),chainSnapshotHash:snapshotHash(st.chain)});
 }
 return {
  // Bootstrap is an authenticated internal command, never an HTTP endpoint.
  // It issues IDs before allocation, without creating procedure/time/consents.
  registerCurrentMetForE4(context,a,body,key){return run(context,a,body,key,'register-target',[],(st,s,time,observers)=>{
   check(st.met&&st.chain.status==='UNACCEPTED','BC_E3_CURRENT_MET_REQUIRED');const src=sourceObservation(st,time,observers);
   const registration=observe(observers,()=>ports.registration(st.a,st.d,acceptance(st.d)));
   for(const row of db.prepare("SELECT record FROM e3_records WHERE kind='REGISTRATION_TARGET' AND application_id!=?").all(a)){
    const other=JSON.parse(row.record);check(other.registration.allocationId!==registration.allocationId,'BC_E3_ALLOCATION_OWNER');}
   const prior=records(st.a,'REGISTRATION_TARGET').at(-1);
   if(prior)check(prior.registration.allocationId===registration.allocationId&&prior.registration.obligationId===registration.obligationId
    &&prior.registration.recipient===registration.recipient&&prior.registration.token===registration.token&&sameSnapshot(prior.registration.domain,registration.domain),'BC_E3_REGISTRATION_IMMUTABLE');
   const v2=registration.version==='clear-bootcamp-procedure-registration-port.2';
   check(!prior||!!prior.recipientRegistration===v2,'BC_E3_REGISTRATION_IMMUTABLE');
   const recipientPacket=v2?(prior?.recipientRegistration??recipientRegistration({
    ...registration.domain,instanceId:registration.domain.salt,policyHash:st.a.policy_hash,runtimeMappingHash:st.a.mapping_hash,
    participant:st.a.wallet,applicationSalt:l.opaque('REGISTRATION_SALT',a,true),nonce:l.opaque('REGISTRATION_NONCE',a,true),deadline:src.validUntilExclusive})):null;
   const target={applicationId:l.opaque('APPLICATION',a,true,recipientPacket?.message.applicationId??null),decisionId:l.opaque('DECISION',st.d.decisionId,true),allocationId:l.opaque('ALLOCATION',registration.allocationId,true)};
   const record=l.record(a,'REGISTRATION_TARGET',p0Hash('E3-REGISTRATION-TARGET',{applicationId:a,decisionId:st.d.decisionId,source:src.commitment,registration:snapshotHash(registration)}),{
    version:'clear-bootcamp-e4-registration-target.1',id:procedureId('registration'),registration,opaqueTarget:target,...(v2?{recipientRegistration:recipientPacket,recipientSessionHash:prior?.recipientSessionHash??p0Hash('RECIPIENT-SESSION',{token:context.token,wallet:st.a.wallet,chainId:context.chainId})}:{}),policyHash:st.a.policy_hash,runtimeMappingHash:st.a.mapping_hash,
    decisionAcceptanceSequence:acceptance(st.d),sourceWindow:src.window,sourceValidUntilExclusive:src.validUntilExclusive,sourceCurrentCommitment:src.commitment,
    profileHash:PROFILE_HASH,recordedAt:time,procedureStarted:false,allocationConfirmed:false,paymentAuthority:false});
   return {registrationTargetId:record.id};
  });},
  getRecipientRegistration(context,a){return access(context,a,false,(app,s,time)=>{
   const r=records(app,'REGISTRATION_TARGET').at(-1),signed=records(app,'RECIPIENT_REGISTRATION').at(-1);
   const d=decision(app),base={version:'clear-bootcamp-recipient-registration.1',applicationId:a,role:role(s),
    applicationRevision:app.revision,ledgerSequence:ledger.sequence(),decisionId:d.decisionId,decisionRevision:d.decisionRevision,decisionHash:d.decisionHash,
    chainStatus:'NOT_OBSERVED',signatureAccepted:!!signed,observedAt:time,calldataPublic:true,purpose:'REGISTER_FIXED_RECIPIENT'};
   if(!r?.recipientRegistration)return freeze({...base,status:'NOT_READY',registrationTargetId:null,payload:null,digest:null});
   const sessionMatches=s.role!=='participant'||r.recipientSessionHash===p0Hash('RECIPIENT-SESSION',{token:context.token,wallet:app.wallet,chainId:context.chainId});
   const current=sessionMatches&&app.status==='ACTIVE'&&d.conditionsStatus==='MET'&&d.decisionId===r.registration.decisionId;
   const expired=time>=Number(r.recipientRegistration.message.deadline);
   return freeze({...base,status:!current?'STALE':expired?'EXPIRED':signed?'SIGNED':'AWAITING_SIGNATURE',registrationTargetId:r.id,
    payload:r.recipientRegistration,digest:signed?.digest??null});
  });},
  submitRecipientRegistration(context,a,body,key){return run(context,a,body,key,'recipient-registration',['registrationTargetId','signature'],(st,s,time,observers)=>{
   check(s.role==='participant'&&s.wallet===st.a.wallet,'FORBIDDEN');
   check(st.met&&st.chain.status==='UNACCEPTED','BC_E3_CURRENT_MET_REQUIRED');
   const r=records(st.a,'REGISTRATION_TARGET').at(-1);check(r?.recipientRegistration&&r.id===body.registrationTargetId&&r.registration.decisionId===st.d.decisionId,'BC_RECIPIENT_REGISTRATION_TARGET');
   check(r.recipientSessionHash===p0Hash('RECIPIENT-SESSION',{token:context.token,wallet:st.a.wallet,chainId:context.chainId}),'BC_RECIPIENT_REGISTRATION_SESSION');
   check(typeof body.signature==='string'&&/^0x[0-9a-fA-F]{130}$/.test(body.signature),'BC_RECIPIENT_REGISTRATION_SIGNATURE');
   const prior=records(st.a,'RECIPIENT_REGISTRATION').at(-1);check(!prior,'BC_RECIPIENT_REGISTRATION_ALREADY_SIGNED');
   const validate=at=>{
    const src=currentSourceWindow(st.a,heads,source,at);check(src.commitment===r.sourceCurrentCommitment,'BC_RECIPIENT_REGISTRATION_SOURCE');
    let verified;try{verified=verifyRecipientRegistration(r.recipientRegistration,body.signature,{applicationOwner:st.a.wallet,nowSeconds:at,sourceValidUntilExclusive:src.validUntilExclusive});}
    catch{check(false,'BC_RECIPIENT_REGISTRATION_SIGNATURE');}
    check(verified.applicationId===l.opaque('APPLICATION',a),'BC_E3_ID_BINDING');return verified;
   };
   const verified=validate(time);observers.push(validate);
   const row=l.record(a,'RECIPIENT_REGISTRATION',p0Hash('E3-RECIPIENT-REGISTRATION',a),{
    id:procedureId('recipient-registration'),version:'clear-bootcamp-recipient-registration-signature.1',registrationTargetId:r.id,
    digest:verified.digest,signature:body.signature,recordedAt:time},s.wallet);
   return {recipientRegistrationId:row.id,digest:verified.digest,signatureAccepted:true,chainStatus:'NOT_OBSERVED'};
  });},
  inspectRegistrationForE4(context,a,registrationTargetId,expected=null){id(registrationTargetId);const observers=[];return access(context,a,false,(app,s,time)=>{
   if(expected){exactKeys(expected,['expectedRevision','expectedLedgerSequence','expectedSnapshotHash'],'BC_E3_INTERNAL_CAS');
    check(app.revision===expected.expectedRevision&&ledger.sequence()===expected.expectedLedgerSequence,'BC_VIEW_STALE');}
   const record=records(app,'REGISTRATION_TARGET').find(r=>r.id===registrationTargetId);check(record,'BC_NOT_FOUND');const st=state(app,time,observers);
   check(st.met&&st.chain.status==='UNACCEPTED','BC_E3_CURRENT_MET_REQUIRED');const src=sourceObservation(st,time,observers);
   const registration=observe(observers,()=>ports.registration(app,st.d,acceptance(st.d)));
   check(sameSnapshot(record.registration,registration)&&record.sourceCurrentCommitment===src.commitment,'BC_E3_REGISTRATION_STALE');
   for(const [field,kind]of [['applicationId','APPLICATION'],['decisionId','DECISION'],['allocationId','ALLOCATION']])check(record.opaqueTarget[field]===l.opaque(kind,registration[field]),'BC_E3_REGISTRATION_STALE');
   const currentSnapshotHash=p0Hash('E3-CURRENT-REGISTRATION',{record,applicationRevision:app.revision,ledgerSequence:ledger.sequence(),source:src.commitment});
   if(expected)check(expected.expectedSnapshotHash===currentSnapshotHash,'BC_E3_REGISTRATION_STALE');
   return freeze({version:'clear-bootcamp-e4-registration-intake.1',record,currentSnapshotHash,applicationRevision:app.revision,ledgerSequence:ledger.sequence(),
    procedureStarted:false,allocationConfirmed:false,paymentAuthority:false});
  },()=>observers.forEach(f=>f()));},
  getProcedure(context,a){const observers=[];return access(context,a,false,(app,s,time)=>view(state(app,time,observers),s,time),()=>observers.forEach(f=>f()));},
  publishReview(context,a,body,key){return run(context,a,body,key,'publish',[],(st,s,time,observers)=>{
   check(st.met&&st.fullCurrent&&st.chain.status==='UNACCEPTED','BC_E3_FULL_ALLOCATION_REQUIRED');const src=sourceObservation(st,time,observers);
   const registered=records(st.a,'REGISTRATION_TARGET');
   if(registered.length){const r=registered.filter(r=>r.registration.decisionId===st.d.decisionId).at(-1),current=observe(observers,()=>ports.registration(st.a,st.d,acceptance(st.d)));
    check(r&&sameSnapshot(r.registration,current)&&r.sourceCurrentCommitment===src.commitment&&r.registration.allocationId===st.funding.allocationId
     &&r.registration.obligationId===st.funding.obligationId&&r.registration.token===st.funding.token,'BC_E3_REGISTRATION_STALE');}
   if(st.p)active(st,time);let p=st.p;
   if(!p){p={version:VERSION,procedureId:procedureId('procedure'),applicationId:a,firstStartedAt:time,reviewCapAt:time+600,profileHash:PROFILE_HASH,
    obligationId:st.funding.obligationId};l.create(a,p);fault('e3-after-procedure');}
   check(p.obligationId===st.funding.obligationId,'BC_E3_OBLIGATION_CHANGED');
   const old=l.publications(a).find(r=>r.decisionId===st.d.decisionId);
   if(old){check(old.allocationId===st.funding.allocationId&&BigInt(st.funding.allocationVersion)>=BigInt(old.allocationVersion),'BC_E3_ALLOCATION_CHANGED');return {procedureId:p.procedureId,publicationId:old.publicationId};}
   if(st.pub){const replacement=st.funding.replacement;
    check(replacement?.allocationId===st.pub.allocationId&&st.pub.allocationId===st.funding.allocationId&&replacement.fromDecisionId===st.pub.decisionId
     &&replacement.fromDecisionHash===st.pub.decisionHash&&BigInt(replacement.fromAuthorizationEpoch)>=BigInt(st.pub.authorizationEpoch)&&BigInt(replacement.fromAllocationVersion)>=BigInt(st.pub.allocationVersion),
     'BC_E3_REPLACEMENT_REQUIRED');}
   const pub={version:'clear-bootcamp-review-publication.1',publicationId:procedureId('publication'),procedureId:p.procedureId,decisionId:st.d.decisionId,
    decisionRevision:st.d.decisionRevision,decisionHash:st.d.decisionHash,publishedAt:time,confirmAt:time+120,allocationId:st.funding.allocationId,
    recipient:st.funding.recipient,token:st.funding.token,amountAtoms:'100000000',allocationVersion:st.funding.allocationVersion,authorizationEpoch:st.funding.authorizationEpoch,consentScopeHash:null};
   for(const [kind,logical]of [['APPLICATION',a],['PROCEDURE',p.procedureId],['DECISION',pub.decisionId],['ALLOCATION',pub.allocationId]])l.opaque(kind,logical,true);
   const scope={version:'clear-bootcamp-app-consent-scope.1',operationsPolicyHash:PROFILE_HASH,applicationId:l.opaque('APPLICATION',a),procedureId:l.opaque('PROCEDURE',p.procedureId),
    policyHash:st.a.policy_hash,runtimeMappingHash:st.a.mapping_hash,decisionId:l.opaque('DECISION',pub.decisionId),decisionRevision:String(pub.decisionRevision),decisionHash:pub.decisionHash,
    recipient:pub.recipient,token:pub.token,amountAtoms:pub.amountAtoms,allocationId:l.opaque('ALLOCATION',pub.allocationId),allocationVersion:pub.allocationVersion,
    firstReviewStartedAt:p.firstStartedAt,reviewCapAt:p.reviewCapAt,decisionPublishedAt:time,confirmAt:pub.confirmAt};
   pub.consentScopeHash=p0Hash('E3-APP-CONSENT-SCOPE',scope);pub.consentScope=scope;l.publish(a,pub);fault('e3-after-publication');
   return {procedureId:p.procedureId,publicationId:pub.publicationId};
  });},
  recordReviewConsent(context,a,body,key,{beforeNewConsent}={}){return run(context,a,body,key,'consent',['value'],(st,s,time,observers)=>{
   check(['AGREE','WITHDRAW'].includes(body.value),'BC_E3_CONSENT_VALUE');active(st,time);published(st);sourceObservation(st,time,observers);
   // Validate the original source/review caps and pure owner operating gate at
   // commit time, before this one provisional consent becomes durable. Exact
   // replay never registers this check. A clock-only final read may check again.
   observers.unshift(asOf=>{
    active(st,asOf);
    check(sameSnapshot(st.sourceState,currentSourceWindow(st.a,heads,source,asOf)),'BC_E3_PORT_CHANGED');
    beforeNewConsent?.(Object.freeze({asOf,applicationId:a,applicationRevision:st.a.revision,
    decisionId:st.d.decisionId,decisionRevision:st.d.decisionRevision,decisionHash:st.d.decisionHash,
    scopeHash:st.pub.consentScopeHash,validUntilExclusive:st.sourceState.validUntilExclusive,reviewCapAt:st.p.reviewCapAt,
    fullyAllocated:st.fullCurrent,amountAtoms:st.funding.amountAtoms,reservedAtoms:st.funding.reservedAtoms,objectionBlocked:st.unresolved}));
   });
   const commitment=actorCommitment(st.a,s),prior=records(st.a,'CONSENT').filter(r=>r.scopeHash===st.pub.consentScopeHash&&r.actorCommitment===commitment).at(-1);
   const record=prior?.value===body.value?prior:l.record(a,'CONSENT',p0Hash('E3-CONSENT-COMMAND',{scope:st.pub.consentScopeHash,actor:commitment,value:body.value,prior:prior?.id??null}),{
    version:'clear-bootcamp-review-consent.1',id:procedureId('consent'),procedureId:st.p.procedureId,scopeHash:st.pub.consentScopeHash,
    decisionId:st.d.decisionId,actorRole:role(s),actorCommitment:commitment,value:body.value,recordedAt:time},s.wallet);
   fault('e3-after-consent');return {procedureId:st.p.procedureId,publicationId:st.pub.publicationId,actionId:record.id};
  });},
  submitReviewObjection(context,a,body,key){return run(context,a,body,key,'objection',['reason','evidenceId'],(st,s,time)=>{
   active(st,time);check(st.pub,'BC_E3_CURRENT_PUBLICATION_REQUIRED');
   check(['SOURCE_MISMATCH','EVIDENCE_MISSING','DECISION_TARGET_ERROR','UNRESOLVED_QUESTION'].includes(body.reason),'BC_E3_REASON');id(body.evidenceId);evidenceIds(st.a,[body.evidenceId]);
   const record=l.record(a,'OBJECTION',p0Hash('E3-OBJECTION',{procedureId:st.p.procedureId,decisionId:st.d.decisionId,reason:body.reason,evidenceId:body.evidenceId,actor:actorCommitment(st.a,s)}),{
    version:'clear-bootcamp-review-objection.1',id:procedureId('objection'),procedureId:st.p.procedureId,decisionId:st.d.decisionId,decisionHash:st.d.decisionHash,
    reason:body.reason,evidenceId:body.evidenceId,actorRole:role(s),actorCommitment:actorCommitment(st.a,s),recordedAt:time,status:'RECEIVED',validity:'UNASSESSED',substantive:true});
   return {procedureId:st.p.procedureId,actionId:record.id};
  });},
  assessReviewObjection(context,a,body,key){return run(context,a,body,key,'assess-objection',['assessmentId','objectionId'],(st,s,time,observers)=>{
   active(st,time);id(body.assessmentId);id(body.objectionId);const objection=st.objections.find(r=>r.id===body.objectionId);check(objection,'BC_NOT_FOUND');
   const read=()=>ports.assessment('objectionAssessment',{applicationId:a,assessmentId:body.assessmentId,objectionId:body.objectionId});const value=observe(observers,read);
   exactKeys(value,['version','execution','assessmentId','applicationId','objectionId','decisionId','decisionHash','outcome','basisEvidenceIds','receiptHash'],'BC_E3_ASSESSMENT');
   check(value.objectionId===objection.id&&value.decisionId===st.d.decisionId&&value.decisionHash===st.d.decisionHash
    &&['DUPLICATE','IRRELEVANT','VALID_UNRESOLVED','RESOLVED'].includes(value.outcome),'BC_E3_ASSESSMENT');evidenceIds(st.a,value.basisEvidenceIds);
   const prior=records(st.a,'OBJECTION_ASSESSMENT').find(r=>r.assessmentId===value.assessmentId);if(prior)check(prior.objectionId===objection.id&&prior.receiptHash===value.receiptHash,'BC_E3_ASSESSMENT_REPLAY');
   const record=l.record(a,'OBJECTION_ASSESSMENT',p0Hash('E3-ASSESSMENT-ID',value.assessmentId),{...value,id:procedureId('assessment'),recordedAt:time});
   return {procedureId:st.p.procedureId,actionId:record.id};
  });},
  recordReviewRevalidation(context,a,body,key){return run(context,a,body,key,'revalidate',['assessmentId'],(st,s,time,observers)=>{
   active(st,time);id(body.assessmentId);const value=observe(observers,()=>ports.assessment('revalidationAssessment',{applicationId:a,assessmentId:body.assessmentId}));
   exactKeys(value,['version','execution','assessmentId','applicationId','fromDecisionId','fromDecisionHash','kind','basisEvidenceIds','receiptHash'],'BC_E3_ASSESSMENT');
   check(st.pub&&value.fromDecisionId===st.pub.decisionId&&value.fromDecisionHash===st.pub.decisionHash&&['NEW_EVIDENCE','OBJECTIVE_ERROR'].includes(value.kind),'BC_E3_ASSESSMENT');evidenceIds(st.a,value.basisEvidenceIds);
   const existing=[...records(st.a,'REVALIDATION'),...records(st.a,'TERMINATION_REQUIRED')].find(r=>r.assessmentId===value.assessmentId);
   if(existing){check(existing.receiptHash===value.receiptHash,'BC_E3_ASSESSMENT_REPLAY');return {procedureId:st.p.procedureId,actionId:existing.id};}
   const kind=st.count>=1?'TERMINATION_REQUIRED':'REVALIDATION';
   const record=l.record(a,kind,p0Hash('E3-REVALIDATION-ID',value.assessmentId),{...value,id:procedureId('revalidation'),recordedAt:time,
    procedureId:st.p.procedureId,reason:st.count>=1?'NEW_VALID_ERROR_AFTER_ONE_REVERIFICATION':null,result:st.count>=1?'UNRESOLVED_TERMINATION_REQUIRED':'REVALIDATION_RECORDED',
    requiresNewDecision:true,reservationReleased:false,epochInvalidated:false});fault('e3-after-revalidation');return {procedureId:st.p.procedureId,actionId:record.id};
  });},
  prepareReviewAuthorization(context,a,body,key){return run(context,a,body,key,'prepare',[],(st,s,time,observers)=>{
   const value=draft(st,time,observers),nonceKey=p0Hash('E3-PREPARED-NONCE',{domain:value.payload.domain,nonce:value.payload.message.nonce});
   const record=l.prepare(a,nonceKey,{version:'clear-bootcamp-prepared-test-target.1',preparationId:procedureId('preparation'),...value,recordedAt:time,
    authority:'UNSIGNED_PREFLIGHT_ONLY',nonceConsumed:false,signerActivated:false});fault('e3-after-prepared');
   return {procedureId:st.p.procedureId,publicationId:st.pub.publicationId,preparationId:record.preparationId};
  });},
  requestReviewTermination(context,a,body,key){return run(context,a,body,key,'termination-intent',[],(st,s,time)=>{
   check(st.status==='UNRESOLVED_TERMINATION_REQUIRED'&&st.chain.status==='UNACCEPTED'&&st.funding.status==='FULLY_ALLOCATED','BC_E3_TERMINATION_NOT_READY');
   const sourceHeadCommitment=p0Hash('E3-SOURCE-HEADS',heads(st.a).map(h=>({evidenceId:h.evidence_id,valid:h.valid,reason:h.reason,guard:h.guard})));
   const record=l.record(a,'TERMINATION_INTENT',p0Hash('E3-TERMINATION-INTENT',{procedureId:st.p.procedureId,sourceHeadCommitment,funding:snapshotHash(st.funding),chain:snapshotHash(st.chain)}),{
    version:'clear-bootcamp-unaccepted-termination-intent.1',id:procedureId('termination'),applicationId:a,procedureId:st.p.procedureId,profileHash:PROFILE_HASH,
    firstStartedAt:st.p.firstStartedAt,reviewCapAt:st.p.reviewCapAt,reason:terminationReason(st,time),
    allocationId:st.funding.allocationId,obligationId:st.funding.obligationId,allocationVersion:st.funding.allocationVersion,authorizationEpoch:st.funding.authorizationEpoch,
    allocatedDecisionId:st.funding.decisionId,allocatedDecisionHash:st.funding.decisionHash,currentDecisionId:st.d.decisionId,currentDecisionHash:st.d.decisionHash,
    sourceHeadCommitment,
    fundingSnapshotHash:snapshotHash(st.funding),chainSnapshotHash:snapshotHash(st.chain),recordedAt:time,
    requiredAtomicEffects:['CHECK_UNACCEPTED_AND_AUTHORIZED_CONDITION','INVALIDATE_OLD_AUTHORIZATION_EPOCH','RELEASE_RESERVATION_AND_TRANSITION_OBLIGATION'],
    contractExecuted:false,reservationReleased:false,epochInvalidated:false,authority:'E4_CONTRACT_CHECK_REQUIRED'});
   return {procedureId:st.p.procedureId,terminationIntentId:record.id};
  });},
  inspectTerminationForE4(context,a,intentId){id(intentId);const observers=[];return access(context,a,false,(app,s,time)=>{
   const intent=records(app,'TERMINATION_INTENT').find(r=>r.id===intentId);check(intent,'BC_NOT_FOUND');const st=state(app,time,observers);
   check(st.status==='UNRESOLVED_TERMINATION_REQUIRED'&&st.chain.status==='UNACCEPTED'&&st.funding.status==='FULLY_ALLOCATED','BC_E3_TERMINATION_NOT_READY');
   const sourceHeadCommitment=p0Hash('E3-SOURCE-HEADS',heads(app).map(h=>({evidenceId:h.evidence_id,valid:h.valid,reason:h.reason,guard:h.guard})));
   check(intent.fundingSnapshotHash===snapshotHash(st.funding)&&intent.chainSnapshotHash===snapshotHash(st.chain)&&intent.sourceHeadCommitment===sourceHeadCommitment,'BC_E3_TERMINATION_STALE');
   return freeze({version:'clear-bootcamp-e4-termination-intake.1',intent,ledgerSequence:ledger.sequence(),applicationRevision:app.revision,
    contractMustRecheck:true,reservationReleased:false,epochInvalidated:false,paymentAuthority:false});
  },()=>observers.forEach(f=>f()));},
  getProcedureOperation(context,a,operationId){id(operationId);return access(context,a,false,(app,s,time)=>{
   const row=db.prepare("SELECT record FROM commands WHERE id=? AND application_id=? AND route LIKE 'e3-%'").get(operationId,a);check(row,'BC_NOT_FOUND');return operation(app,JSON.parse(row.record),time);
  });},
  // Internal E4 read, deliberately absent from HTTP. Rebuild from current facts;
  // the stored unsigned target never becomes signing authority on its own.
  inspectPreparedForE4(context,a,preparationId,expected=null){id(preparationId);const observers=[];return access(context,a,false,(app,s,time)=>{
   if(expected){exactKeys(expected,['expectedRevision','expectedLedgerSequence','expectedSnapshotHash'],'BC_E3_INTERNAL_CAS');
    check(app.revision===expected.expectedRevision&&ledger.sequence()===expected.expectedLedgerSequence,'BC_VIEW_STALE');hash(expected.expectedSnapshotHash);}
   const record=l.prepared(a,preparationId);check(record,'BC_NOT_FOUND');const st=state(app,time,observers);
   if(st.chain.status==='ACCEPTED')return freeze({status:'NOT_APPLICABLE_ACCEPTED_RIGHT',paymentAuthority:false,acceptedRight:view(st,s,time).chain.acceptedRight});
   const rebuilt=draft(st,Number(record.payload.message.issuedAt),observers);
   check(canonical(rebuilt.payload)===canonical(record.payload),'BC_E3_PREPARATION_STALE');
   const current={...rebuilt.current};const inspection=createTestDraftInspector(record.snapshot,{clock:()=>time}).inspect(record.payload,current);
   check(inspection.status==='UNSIGNED_PREFLIGHT_ONLY','BC_E3_PREPARATION_STALE');
   const currentSnapshotHash=p0Hash('E3-CURRENT-E4-INTAKE',{applicationRevision:app.revision,ledgerSequence:ledger.sequence(),source:rebuilt.sourceCommitment,
    funding:rebuilt.fundingSnapshotHash,authorization:rebuilt.authorizationSnapshotHash,chain:rebuilt.chainSnapshotHash,consentSetHash:record.payload.message.consentSetHash,deadlinePolicyHash:record.payload.message.deadlinePolicyHash});
   if(expected)check(expected.expectedSnapshotHash===currentSnapshotHash,'BC_E3_PREPARATION_STALE');
   return freeze({version:'clear-bootcamp-e4-target-intake.1',status:inspection.status,ledgerSequence:ledger.sequence(),applicationRevision:app.revision,
    preparationId,currentSnapshotHash,payload:record.payload,snapshot:record.snapshot,currentServerState:current,consentSet:record.consentSet,sourceCurrentCommitment:rebuilt.sourceCommitment,
    serverSnapshotHashes:{funding:rebuilt.fundingSnapshotHash,authorizationPort:rebuilt.authorizationSnapshotHash,chain:rebuilt.chainSnapshotHash},inspection,paymentAuthority:false,gates:P0_GATES});
  },()=>observers.forEach(f=>f()));},
 };
}
