import {validateEvidence,AMOUNT} from '../../../stage6/lib/evidence.mjs';
import {getAddress} from 'ethers';
export function runtimeGate(input){
 const errors=[];let plan=null;
 try{
  const need=(c,k)=>{if(!c)throw Error(k);};
  need(input&&input.dataKind==='SYNTHETIC_RUNTIME_FIXTURE','NO_VERIFIED_RUNTIME');
  const {policySpec:p,trusted:t,evidence:e,observation:o,registrationAt:r,timeZone}=input;
  need(p?.kind==='NATIVE_FIXED_FOUR'&&p.amount===AMOUNT.toString()&&p.unit==='TEST'&&JSON.stringify(p.submissionIds)==='[0,1,2,3]'&&p.exceptions==='NONE','POLICY_NOT_COMPILABLE');
  need(timeZone==='UTC'&&Number.isSafeInteger(r),'TIME_BINDING');
  need(p.completionOffset===86400&&p.claimOffset===172800,'UNSUPPORTED_RELATIVE_TIME');
  need(t.terms.start===r&&t.terms.due===r+p.completionOffset&&t.terms.claimUntil===r+p.claimOffset,'DEADLINE_BINDING');
  need(o?.provenance==='SYNTHETIC_OBSERVATION'&&o.issuerOnboarded===true,'ISSUER_NOT_VERIFIED');
  need(o.chainId===t.domain.chainId&&o.contract===t.domain.verifyingContract,'CHAIN_BINDING');
  need(o.token===t.terms.token&&o.termsHash===t.termsHash,'DEPLOYMENT_BINDING');
  need(o.enrolled===true&&o.settled===false,'NOT_CLAIMABLE');
  need(o.acceptedAt===e.acceptance.acceptedAt&&o.acceptedAt===r,'ACCEPTANCE_BINDING');
  need(BigInt(o.totalReserved)>=AMOUNT&&BigInt(o.tokenBalance)>=BigInt(o.totalReserved),'UNDERFUNDED');
  const verified=validateEvidence(e,t,input.recipient,o.now);
  need(getAddress(input.recipient)===getAddress(o.enrolledRecipient),'RECIPIENT_BINDING');
  need(verified.consentDigest===o.consentDigest,'CONSENT_BINDING');
  plan={courseId:t.terms.courseId,amount:t.terms.amount,recipient:verified.recipient,issuer:t.terms.issuer,start:t.terms.start,due:t.terms.due,claimUntil:t.terms.claimUntil,chainId:t.domain.chainId,contract:t.domain.verifyingContract,termsHash:t.termsHash,submissionIds:e.submissions.map(x=>x.receipt.session)};
 }catch(e){errors.push(e.code??e.message??'RUNTIME_INVALID');}
 return {runtimeExecutable:errors.length===0,errors,plan,scope:'Synthetic observations and real local signature verification only; no RPC, deployment or payment.'};
}
