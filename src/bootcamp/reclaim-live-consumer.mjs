// Receipt-only bridge: raw proof, cookies and attestor owner keys stay with P1.
import {randomUUID} from 'node:crypto';
import {freeze,exactKeys,requireRule as check} from '../policy/values.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
import {requestHash as p1RequestHash} from '../hackerrank-evidence/request.mjs';
import {hash as p1Hash} from '../hackerrank-evidence/values.mjs';
import {WORKER_RECIPE_VERSION,workerRecipe} from '../hackerrank-evidence/recipes.mjs';
import {readHackerRankCollectorLease} from '../hackerrank-evidence/collector.mjs';
import {BRIDGE_VERSION} from './reclaim-consumer.mjs';
import {hash,id} from './model.mjs';
export const LIVE_WORKER_RECIPE_HASH=p1Hash('RECIPE',workerRecipe());
export function assertLiveWorkerReceipt(receipt,pins){
 check(pins.recipeHash===LIVE_WORKER_RECIPE_HASH&&receipt.sourceVersion===WORKER_RECIPE_VERSION&&receipt.recipeHash===LIVE_WORKER_RECIPE_HASH
  &&receipt.verification?.structureValidation==='TRUSTED_WORKER'&&receipt.verification?.disclosedFieldValidation==='ATTESTOR'
  &&receipt.verification?.independentStructureProof===false,'BC_LIVE_HR_WORKER_REQUIRED');
}
const consumers=new WeakSet();
export const isLiveReclaimConsumer=value=>consumers.has(value);
export function translateLiveReclaimRequest(r,p){
 check(r.version==='clear-bootcamp-bound-request.2'&&r.producerVersion===BRIDGE_VERSION&&r.dataMode==='RECLAIM_SIGNED_RECORD','BC_LIVE_HR_REQUEST');
 exactKeys(p,['audience','trustConfigHash','recipeHash','expectedClaimOwner','selectedCertificateId','dataMode'],'BC_LIVE_HR_PINS');
 check(p.dataMode==='RECLAIM_SIGNED_RECORD'&&r.producerTrustHash===p.trustConfigHash,'BC_LIVE_HR_TRUST');hash(p.recipeHash);hash(p.trustConfigHash);id(p.audience);
 return freeze({version:'clear-hackerrank-request.1',audience:p.audience,participantId:r.participantId,participantWallet:r.participantWallet,applicationId:r.applicationId,
  criterionId:r.criterionId,policyHash:r.policyHash,runtimeMappingHash:r.runtimeMappingHash,trustConfigHash:p.trustConfigHash,recipeHash:p.recipeHash,expectedClaimOwner:p.expectedClaimOwner,
  nonce:r.nonceHash,issuedAt:r.issuedAt,expiresAt:r.expiresAt,selectedCertificateId:p.selectedCertificateId});
}
export function createLiveReclaimConsumer({pins=()=>null,collectLease,resolveLease=()=>null,now=()=>Math.floor(Date.now()/1000)}={}){
 const issued=new WeakMap(),published=new Map(),owned=new Set(),generation='lease-'+randomUUID();let closed=false;
 const currentPins=()=>{const p=pins();return p?.dataMode==='RECLAIM_SIGNED_RECORD'?structuredClone(p):null;};
 function guard(r){const p=currentPins(),l=resolveLease(r);check(!closed&&p&&l?.available===true&&now()<Math.min(l.authExpiresAt,l.rawExpiresAt,l.queryExpiresAt),'BC_LIVE_HR_AUTHORITY');return {p,l};}
 function resolveSource(r){let e=published.get(r.applicationId);let p,l;
  try{({p,l}=guard(r));if(e){readHackerRankCollectorLease(e.lease);check(e.isAuthorized()===true&&p0Hash('P1-PINS',p)===e.pinsHash,'BC_LIVE_HR_AUTHORITY');}}
  catch{e?.lease.dispose();published.delete(r.applicationId);return null;}
  return {source:e?.candidate.source??{provider:'reclaim-hackerrank',instanceRef:p.audience,recordRef:'unobserved-certificate',accountBindingRef:'unobserved-account'},
   sourceVersion:e?.candidate.sourceVersion??'unobserved.1',sourceHash:e?.candidate.sourceHash??p0Hash('UNOBSERVED-SOURCE',r.applicationId),sourceReceiptHash:e?.candidate.receiptHash??p0Hash('UNOBSERVED-RECEIPT',r.applicationId),
   runtimeMappingHash:r.runtimeMappingHash,trustHash:p.trustConfigHash,leaseId:'lease-'+p0Hash('LIVE-P1-LEASE',{generation,pinsHash:p0Hash('P1-PINS',p)}).slice(2,50),authExpiresAt:l.authExpiresAt,rawExpiresAt:l.rawExpiresAt,queryExpiresAt:l.queryExpiresAt,rawAvailable:true};
 }
 function checked(candidate,r){const e=issued.get(candidate);check(e&&!closed&&e.requestHash===r.requestHash,'BC_LIVE_HR_CANDIDATE');const {p}=guard(r);
  check(e.isAuthorized()===true&&e.pinsHash===p0Hash('P1-PINS',p),'BC_LIVE_HR_AUTHORITY');
  const {candidate:receipt,binding}=readHackerRankCollectorLease(e.lease);
  check(receipt===e.receipt&&receipt.dataMode==='RECLAIM_SIGNED_RECORD'&&receipt.status==='VERIFIED_CANDIDATE','BC_LIVE_HR_RESULT_IDENTITY');assertLiveWorkerReceipt(receipt,p);
  check(binding.requestHash===p1RequestHash(e.expected)&&binding.nonceHash===p1Hash('NONCE',r.nonceHash)&&binding.trustConfigHash===p.trustConfigHash
   &&binding.applicationId===r.applicationId&&binding.participantId===r.participantId&&binding.participantWallet===r.participantWallet
   &&binding.proofBundleHash===candidate.proofBundleHash&&binding.receiptHash===receipt.receiptHash&&binding.durableConsumptionPerformed===false&&now()<binding.validUntilExclusive,'BC_LIVE_HR_BINDING');
  return {e,binding};
 }
 const consumer={execution:'ISOLATED_LIVE_TEST',dataMode:'RECLAIM_SIGNED_RECORD',capability:'HACKERRANK_CERTIFICATE_HOLDING.1',bridgeVersion:BRIDGE_VERSION,resolveSource,
  status:()=>!closed&&currentPins()?'REGISTERED_TRUST_ONLY':'UNCONFIGURED_BLOCKED',
  async verify(r,{signal,isAuthorized=()=>false}){
   const {p,l}=guard(r);check(typeof collectLease==='function'&&isAuthorized()===true,'BC_LIVE_HR_UNCONFIGURED');const expected=translateLiveReclaimRequest(r,p);let lease;
   try{
    lease=await collectLease(expected,{signal,isAuthorized});check(!signal?.aborted&&isAuthorized()===true,'BC_LIVE_HR_AUTHORITY');
    const {candidate:receipt}=readHackerRankCollectorLease(lease);check(receipt.dataMode==='RECLAIM_SIGNED_RECORD'&&receipt.status==='VERIFIED_CANDIDATE','BC_LIVE_HR_SOURCE_REJECTED');assertLiveWorkerReceipt(receipt,p);
    check(receipt.binding.requestHash===p1RequestHash(expected)&&receipt.binding.nonceHash===p1Hash('NONCE',r.nonceHash),'BC_LIVE_HR_BINDING');
    for(const h of owned)try{readHackerRankCollectorLease(h);}catch{owned.delete(h);}check(owned.size<32,'BC_RAW_CAPACITY');owned.add(lease);
    const expiresAt=Math.min(r.expiresAt,l.authExpiresAt,l.rawExpiresAt,l.queryExpiresAt,receipt.validUntilExclusive,receipt.acquiredAt+1800);
    const candidate=freeze({requestHash:r.requestHash,nonceHash:r.nonceHash,proofBundleHash:receipt.proofBundleHash,source:structuredClone(receipt.source),sourceVersion:receipt.sourceVersion,sourceHash:receipt.sourceHash,
     acquiredAt:receipt.acquiredAt,verifiedAt:receipt.verifiedAt,validUntilExclusive:expiresAt,facts:structuredClone(receipt.facts),rawLocator:{recordRef:receipt.source.recordRef,fieldPath:'/certificate/status',expiresAt},originalBody:null});
    const entry={lease,receipt,candidate,expected,isAuthorized,pinsHash:p0Hash('P1-PINS',p),requestHash:r.requestHash};published.get(r.applicationId)?.lease.dispose();published.set(r.applicationId,entry);issued.set(candidate,entry);checked(candidate,r);return candidate;
   }catch(error){lease?.dispose();owned.delete(lease);throw error;}
  },
  recheck(candidate,r){checked(candidate,r);return true;},
  reference(candidate,r){const {e,binding:g}=checked(candidate,r);return freeze({version:BRIDGE_VERSION,producer:'hackerrank-adapter.1',ledgerRequestHash:r.requestHash,ledgerNonceHash:r.nonceHash,producerRequestHash:g.requestHash,producerNonceHash:g.nonceHash,
   proofBundleHash:g.proofBundleHash,receiptHash:g.receiptHash,trustConfigHash:g.trustConfigHash,expectedClaimOwnerHash:e.receipt.binding.expectedClaimOwnerHash,recipeHash:e.receipt.recipeHash,validUntilExclusive:g.validUntilExclusive});},
  close(){closed=true;for(const h of owned)h.dispose();owned.clear();published.clear();},
 };
 consumers.add(consumer);return Object.freeze(consumer);
}
