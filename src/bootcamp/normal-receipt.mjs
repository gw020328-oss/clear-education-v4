// Read-only owner composition. No tx hash, recipient, amount, proof or verified flag comes from HTTP.
import {freeze,requireRule as check,canonical} from '../policy/values.mjs';
const H=x=>typeof x==='string'&&/^0x[0-9a-f]{64}$/.test(x);
const A=x=>typeof x==='string'&&/^0x[0-9a-f]{40}$/.test(x)&&x!=='0x'+'00'.repeat(20);
const same=(a,b)=>canonical(a)===canonical(b);
export const NORMAL_RECEIPT_VERSION='clear-bootcamp-normal-payment-receipt.1';
export function createNormalReceiptReader({authorize,readReport,readCanonicalClaim,runtimeHash,runtimeMappingHash,policyHash,recipient,token}){
 check([authorize,readReport,readCanonicalClaim].every(x=>typeof x==='function')&&[runtimeHash,runtimeMappingHash,policyHash].every(H)
  &&A(recipient)&&A(token)&&recipient!==token,'BC_RECEIPT_CONFIG');
 const access=(context,applicationId)=>{
  const v=authorize(context,applicationId);check(v.applicationId===applicationId&&v.policyHash===policyHash&&v.runtimeMappingHash===runtimeMappingHash
   &&['PARTICIPANT','OPERATOR'].includes(v.role),'BC_RECEIPT_SCOPE');return v;
 };
 return async(context,applicationId)=>{
  const view=access(context,applicationId),r=structuredClone(readReport());
  check(r.applicationId===applicationId&&r.recipient===recipient&&r.runtimeMappingHash===runtimeMappingHash,'BC_RECEIPT_APPLICATION');
  const accepted=r.stages?.find(x=>x.kind==='ACCEPT'),claim=r.claim,target=r.reviewTarget;
  const value={version:NORMAL_RECEIPT_VERSION,applicationId,policyHash,runtimeMappingHash,role:view.role,
   currentDecision:{decisionId:view.decisionId,decisionRevision:view.decisionRevision,decisionHash:view.decisionHash},
   acceptedTarget:target?Object.fromEntries(['decisionId','decisionRevision','decisionHash','allocationId'].map(k=>[k,target[k]])):null,
   expectedPayment:{recipient,token,amountAtoms:'100000000',symbol:'TEST',decimals:6},
   accept:{state:accepted&&H(accepted.txHash)?'RECORDED_INCLUDED':'NOT_OBSERVED',transactionHash:accepted&&H(accepted.txHash)?accepted.txHash:null,recordedCheckpoint:accepted?.checkpoint??null,canonicalNow:null},
   claim:{state:claim&&H(claim.txHash)?'READBACK_UNAVAILABLE':'NOT_OBSERVED',transactionHash:claim&&H(claim.txHash)?claim.txHash:null,checkpoint:null,canonical:null,finalized:null,transferAmountAtoms:null},
   balance:{receivedAtoms:null,exactExpectedAmountVerified:null,measurement:'NOT_AVAILABLE'},
   source:{mode:r.sourceMode,actualSourceVerification:r.realSourceVerified===true},productionEnabled:false};
  // A submitted transaction or an accepted right alone is never a received payment.
  if(r.completed===true&&claim?.amountAtoms==='100000000'&&H(claim.txHash)&&H(r.chainApplicationId)&&accepted&&target
   &&target.applicationId===applicationId&&target.policyHash===policyHash&&target.runtimeMappingHash===runtimeMappingHash){
   let receipt;try{receipt=await readCanonicalClaim({applicationId:r.chainApplicationId,txHash:claim.txHash});}catch{}
   let valid=false;try{
    const o=receipt.observation,a=o.business.application,right=o.business.right;
    valid=receipt.version==='clear-e5b-direct-claim-receipt.1'&&receipt.status==='INCLUDED'&&receipt.runtimeHash===runtimeHash&&o.runtimeHash===runtimeHash
     &&receipt.applicationId===r.chainApplicationId&&o.business.applicationId===r.chainApplicationId&&receipt.txHash===claim.txHash
     &&receipt.recipient===recipient&&receipt.token===token&&receipt.amountAtoms==='100000000'&&receipt.finalized===false
     &&a.state==='6'&&a.recipient===recipient&&right.recipient===recipient&&right.token===token&&right.amountAtoms==='100000000'
     &&right.allocationId===receipt.allocationId&&right.authorizationDigest===receipt.authorizationDigest
     &&a.target.decisionHash===target.decisionHash&&a.target.revision===String(target.decisionRevision)
     &&same(receipt.checkpoint,claim.checkpoint)&&same(o.checkpoint,receipt.checkpoint);
   }catch{}
   if(valid){
    value.claim={state:'INCLUDED',transactionHash:claim.txHash,checkpoint:structuredClone(receipt.checkpoint),canonical:true,finalized:false,transferAmountAtoms:'100000000'};
    value.balance={receivedAtoms:'100000000',exactExpectedAmountVerified:true,measurement:'OWNER_RUN_BALANCE_DELTA_AT_CLAIM'};
   }
  }
  // Reauthorize after any asynchronous read. Accepted target is independent of a newer current decision.
  const final=access(context,applicationId);check(final.role===view.role,'BC_RECEIPT_SCOPE');
  value.currentDecision={decisionId:final.decisionId,decisionRevision:final.decisionRevision,decisionHash:final.decisionHash};return freeze(value);
 };
}
