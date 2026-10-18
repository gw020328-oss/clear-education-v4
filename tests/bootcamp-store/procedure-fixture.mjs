import {storeFixture,START} from './fixture.mjs';
import {P0_POLICY,p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
export {START};
export async function procedureFixture(t,{fault=()=>{},defaultPorts=false,authority={}}={}){
 const f=await storeFixture(t,{authority}),allocations=new Map(),epochs=new Map(),objectionAssessments=new Map(),revalidationAssessments=new Map();
 let allocationNumber=0,lastPublication=null,full=true,nonceNumber=1,signerActive=true,chainStatus='UNACCEPTED',chainRight=null,hook=()=>{};
 const auth={version:'clear-bootcamp-procedure-authorization-port.1',execution:'SYNTHETIC_PORT_FIXTURE',snapshotId:'authorization-snapshot',
  domain:{name:'ClearBootcampTestPayment',version:'3',chainId:'431709',verifyingContract:'0x'+'22'.repeat(20),salt:p0Hash('E3-FIXTURE','instance')},
  signerKeyId:p0Hash('E3-FIXTURE','key'),signerActive:true,authorizationEpoch:'1',nonce:p0Hash('E3-FIXTURE','nonce-1'),nonceAvailable:true,expiresAt:START+5000};
 const funding=context=>{
  hook('funding');if(!allocations.has(context.applicationId))allocations.set(context.applicationId,'allocation-'+(++allocationNumber));
  if(!epochs.has(context.decisionId))epochs.set(context.decisionId,String(lastPublication?Number(lastPublication.authorizationEpoch)+1:1));
  const allocationId=allocations.get(context.applicationId),authorizationEpoch=epochs.get(context.decisionId),allocationVersion=authorizationEpoch;
  const replacement=lastPublication&&lastPublication.decisionId!==context.decisionId?{
   version:'clear-bootcamp-allocation-replacement-receipt.1',allocationId,fromDecisionId:lastPublication.decisionId,fromDecisionHash:lastPublication.decisionHash,
   fromAuthorizationEpoch:lastPublication.authorizationEpoch,toDecisionId:context.decisionId,toDecisionHash:context.decisionHash,toAuthorizationEpoch:authorizationEpoch,
   fromAllocationVersion:lastPublication.allocationVersion,toAllocationVersion:allocationVersion,receiptHash:p0Hash('E3-REPLACEMENT',{old:lastPublication.decisionId,new:context.decisionId})}:null;
  auth.authorizationEpoch=authorizationEpoch;
  return {version:'clear-bootcamp-procedure-funding-port.1',execution:'SYNTHETIC_PORT_FIXTURE',snapshotId:'funding-'+allocationId,
   status:full?'FULLY_ALLOCATED':'WAITING_FUNDS',...context,allocationId:full?allocationId:null,obligationId:'obligation-'+context.applicationId,
   recipient:f.alice.address.toLowerCase(),token:'0x'+'33'.repeat(20),amountAtoms:'100000000',tokenDecimals:'6',reservedAtoms:full?'100000000':'0',allocationVersion,authorizationEpoch,replacement:full?replacement:null,
   queue:full?null:{position:2,shortfallAtoms:'50000000'}};
 };
 const chain=({applicationId})=>({version:'clear-bootcamp-procedure-chain-port.1',execution:'SYNTHETIC_PORT_FIXTURE',snapshotId:'chain-snapshot',applicationId,
  status:chainStatus,allocationId:chainRight?.allocationId??null,decisionId:chainRight?.decisionId??null,recipient:chainRight?.recipient??null,token:chainRight?.token??null,
  amountAtoms:chainRight?.amountAtoms??null,claimState:chainStatus==='ACCEPTED'?'UNCLAIMED':null,transactionState:chainStatus==='ACCEPTED'?'FINALIZED':null,
  transactionHash:chainStatus==='ACCEPTED'?p0Hash('E3-FIXTURE','accept-tx'):null,blockRef:chainStatus==='ACCEPTED'?'block-fixture':null,canonical:true});
 f.configuration.operatorBindings=[{wallet:f.operator.address,courseOperatorRef:'course-operator-demo'}];
 f.configuration.procedurePorts=defaultPorts?null:{execution:'SYNTHETIC_PORT_FIXTURE',funding,chain,
  registration:context=>({version:'clear-bootcamp-procedure-registration-port.1',execution:'SYNTHETIC_PORT_FIXTURE',registrationId:'registration-host-fixture',
   applicationId:context.applicationId,decisionId:context.decisionId,decisionRevision:context.decisionRevision,decisionHash:context.decisionHash,
   allocationId:allocations.get(context.applicationId),obligationId:'obligation-'+context.applicationId,recipient:f.alice.address.toLowerCase(),token:'0x'+'33'.repeat(20),amountAtoms:'100000000',tokenDecimals:'6',domain:auth.domain}),
  authorization(){hook('authorization');return {...auth,signerActive};},
  objectionAssessment:({assessmentId})=>objectionAssessments.get(assessmentId),revalidationAssessment:({assessmentId})=>revalidationAssessments.get(assessmentId)};
 f.configuration.fault=fault;f.restart();
 const view=(a,context=f.aliceContext)=>f.store.getProcedure(context,a);
 const body=(a,extra={},context=f.aliceContext)=>{const v=view(a,context);return {expectedRevision:v.applicationRevision,expectedLedgerSequence:v.ledgerSequence,
  targetDecisionId:v.decisionId,targetDecisionRevision:v.decisionRevision,targetDecisionHash:v.decisionHash,...extra};};
 const publish=(a,context=f.aliceContext)=>{
  const result=f.store.publishReview(context,a,body(a,{},context),f.key()),v=view(a,context);
  lastPublication={allocationId:v.funding.allocationId,decisionId:v.decisionId,decisionHash:v.decisionHash,authorizationEpoch:epochs.get(v.decisionId),allocationVersion:epochs.get(v.decisionId),recipient:f.alice.address.toLowerCase(),token:'0x'+'33'.repeat(20),amountAtoms:'100000000'};
  return result;
 };
 return {...f,get store(){return f.store;},get time(){return f.time;},view,body,publish,auth,allocations,objectionAssessments,revalidationAssessments,
  async complete(a){for(const c of P0_POLICY.criteria)await f.accept(a,c.criterionId);},
  async refreshEvidence(a,time){f.setTime(time);for(const c of P0_POLICY.criteria){f.change(a,c.criterionId,{sourceHash:p0Hash('E3-SOURCE',{time,c:c.criterionId}),
    sourceReceiptHash:p0Hash('E3-RECEIPT',{time,c:c.criterionId}),leaseId:'lease-'+time,authExpiresAt:time+4000,queryExpiresAt:time+4000,rawExpiresAt:time+1800});}
   for(const c of P0_POLICY.criteria)await f.accept(a,c.criterionId);},
  consent(a,context=f.aliceContext,value='AGREE'){return f.store.recordReviewConsent(context,a,body(a,{value},context),f.key());},
  prepare(a){return f.store.prepareReviewAuthorization(f.aliceContext,a,body(a),f.key());},
  setFull(value){full=value;},setSigner(value){signerActive=value;},newNonce(){auth.nonce=p0Hash('E3-FIXTURE','nonce-'+(++nonceNumber));},
  setAccepted(){chainStatus='ACCEPTED';chainRight=lastPublication;},setHook(value){hook=value;},
  registerAssessment(a,kind,extra={}){const v=view(a),e=f.store.getApplication(f.aliceContext,a).evidence[0].record.evidenceId;
   const assessmentId='assessment-fixture-'+(objectionAssessments.size+revalidationAssessments.size+1),value={version:'clear-bootcamp-procedure-assessment.1',execution:'SYNTHETIC_PORT_FIXTURE',
    assessmentId,applicationId:a,basisEvidenceIds:[e],receiptHash:p0Hash('E3-ASSESSMENT',assessmentId),...extra};
   if(kind==='revalidation'){Object.assign(value,{fromDecisionId:v.procedure.publishedDecisionId,fromDecisionHash:lastPublication?.decisionId===v.decisionId?v.decisionHash:f.store.getDecision(f.aliceContext,a,v.procedure.publishedDecisionId).record.decisionHash,kind:'NEW_EVIDENCE'},extra);revalidationAssessments.set(assessmentId,value);}
   else{Object.assign(value,{decisionId:v.decisionId,decisionHash:v.decisionHash},extra);objectionAssessments.set(assessmentId,value);}return assessmentId;
  },
 };
}
