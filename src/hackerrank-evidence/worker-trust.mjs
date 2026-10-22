import {loadAttestorTrust} from '../ybm-collector/trust.mjs';
import {workerRecipe} from './recipes.mjs';
import {check,freeze,isAddress,isId,epoch,EvidenceError} from './values.mjs';
export const WORKER_REVIEW_REF='clear-c2-managed-transcript-20261022';
// Trusted-host assembly only. Signers must come from the independent public
// registry, not from a claim or browser. No runtime file/default is activated.
export function managedWorkerTrust({signers,audience,privacyKeyId,now}={}){
 check(isId(audience)&&isId(privacyKeyId)&&epoch(now)&&now>=30,'WORKER_TRUST_INPUT');
 check(Array.isArray(signers)&&signers.length>0&&signers.length<=16&&signers.every(isAddress)&&new Set(signers).size===signers.length,'TRUST_SIGNERS');
 return freeze({version:'clear-hackerrank-trust.1',status:'REVIEWED',dataMode:'RECLAIM_SIGNED_RECORD',approvalRef:WORKER_REVIEW_REF,
  sourceReview:'TRUSTED_WORKER_TRANSCRIPT_REVIEWED',contextReview:'SIGNED_REQUEST_CONTEXT_REQUIRED',
  audience,privacyKeyId,notBefore:now-30,expiresAt:now+1800,signers:[...signers].sort(),epochs:[1],recipe:workerRecipe()});
}
// Called by an authorized locked host before opening the managed browser.
// No driver/clock/registry injection exists on this live helper.
export async function loadManagedHackerRankTrust({audience,privacyKeyId,signal}={}){
 check(process.env.CLEAR_LOCKED==='1','LOCKED_LAUNCHER_REQUIRED');
 check(isId(audience)&&isId(privacyKeyId),'WORKER_TRUST_INPUT');
 check(!signal?.aborted,'COLLECTOR_CANCELLED');
 try{
  const signers=await loadAttestorTrust({signal});check(!signal?.aborted,'COLLECTOR_CANCELLED');
  return managedWorkerTrust({signers,audience,privacyKeyId,now:Math.floor(Date.now()/1000)});
 }catch(error){throw new EvidenceError(error instanceof EvidenceError?error.code:signal?.aborted?'COLLECTOR_CANCELLED':'ATTESTOR_TRUST_UNAVAILABLE');}
}
