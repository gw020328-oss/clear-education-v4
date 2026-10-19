import {randomUUID} from 'node:crypto';
import {freeze,exactKeys,requireRule as check} from '../policy/values.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
import {requestHash as p1RequestHash} from '../hackerrank-evidence/request.mjs';
import {hash as p1Hash} from '../hackerrank-evidence/values.mjs';
import {epoch,hash,id} from './model.mjs';

export const BRIDGE_VERSION='clear-bootcamp-producer-bridge.2';
// Explicit translation: the unpredictable ledger nonce commitment becomes the
// P1 challenge. Their nonce/request hashes have different domains and are linked
// in a separate acceptance reference; v1 records are never relabelled.
export function translateReclaimRequest(r,p){
  check(r.version==='clear-bootcamp-bound-request.2'&&r.producerVersion===BRIDGE_VERSION,'BC_HR_REQUEST_VERSION');
  exactKeys(p,['audience','trustConfigHash','recipeHash','expectedClaimOwner','selectedCertificateId','dataMode'],'BC_HR_PINS');
  check(p.dataMode==='SYNTHETIC_FIXTURE'&&r.dataMode==='SYNTHETIC_FIXTURE','BC_HR_REAL_BLOCKED');
  check(r.producerTrustHash===p.trustConfigHash,'BC_HR_TRUST_CHANGED');hash(p.recipeHash);hash(p.trustConfigHash);hash(r.nonceHash);id(p.audience);
  return freeze({version:'clear-hackerrank-request.1',audience:p.audience,participantId:r.participantId,participantWallet:r.participantWallet,
    applicationId:r.applicationId,criterionId:r.criterionId,policyHash:r.policyHash,runtimeMappingHash:r.runtimeMappingHash,
    trustConfigHash:p.trustConfigHash,recipeHash:p.recipeHash,expectedClaimOwner:p.expectedClaimOwner,nonce:r.nonceHash,
    issuedAt:r.issuedAt,expiresAt:r.expiresAt,selectedCertificateId:p.selectedCertificateId});
}
export function createMemoryLease(value,{expiresAt,now=()=>Math.floor(Date.now()/1000),isCurrent=()=>true,onDispose=()=>{}}){
  epoch(expiresAt);let owned=value,disposed=false,floor=epoch(now());
  const dispose=()=>{if(disposed)return;disposed=true;owned=undefined;clearTimeout(timer);onDispose();};
  const current=()=>{if(disposed)return false;try{const time=epoch(now());if(time<floor||time>=expiresAt||!isCurrent()){dispose();return false;}floor=time;return true;}catch{dispose();return false;}};
  const timer=setTimeout(dispose,Math.min(2147483647,Math.max(0,expiresAt-now())*1000));timer.unref();
  return Object.freeze({version:'clear-bootcamp-memory-lease.2',expiresAt,isCurrent:current,dispose,
    read(){check(current(),'BC_PRIVATE_RAW_UNAVAILABLE');return owned;}});
}
// Only an injected producer-owned verifier and collector can supply proof input.
// No SDK dependency or raw proof intake is added to product HTTP.
export function createReclaimConsumer({verifier,pins=()=>null,collectLease,resolveLease=()=>null,now=()=>Math.floor(Date.now()/1000)}={}){
  const issued=new WeakMap(),published=new Map(),leases=new Set(),generation='lease-'+randomUUID();let closed=false;
  const key=r=>r.applicationId+':'+r.criterionId;
  const currentPins=()=>{const p=pins();if(!p||p.dataMode!=='SYNTHETIC_FIXTURE')return null;return structuredClone(p);};
  function resolveSource(context){
    let current=published.get(key(context));const p=currentPins(),l=resolveLease(context);
    if(closed||!p||!l||l.available!==true||now()>=Math.min(l.authExpiresAt,l.rawExpiresAt,l.queryExpiresAt)){current?.lease.dispose();return null;}
    const pinsHash=p0Hash('P1-PINS',p);if(current&&(current.pinsHash!==pinsHash||current.isAuthorized()!==true))current.lease.dispose();
    if(current&&!current.lease.isCurrent()){published.delete(key(context));leases.delete(current.lease);current=undefined;}
    const rawAvailable=true; // an unobserved preflight is distinct from any accepted source snapshot
    return {source:current?.receipt.source??{provider:'reclaim-hackerrank',instanceRef:p.audience,recordRef:'unobserved-certificate',accountBindingRef:'unobserved-account'},
      sourceVersion:current?.receipt.sourceVersion??'unobserved.1',sourceHash:current?.receipt.sourceHash??p0Hash('UNOBSERVED-SOURCE',context.applicationId),
      sourceReceiptHash:current?.receipt.receiptHash??p0Hash('UNOBSERVED-RECEIPT',context.applicationId),runtimeMappingHash:context.runtimeMappingHash,
      trustHash:p.trustConfigHash,leaseId:'lease-'+p0Hash('P1-LEASE',{generation,pinsHash}).slice(2,50),authExpiresAt:l.authExpiresAt,rawExpiresAt:l.rawExpiresAt,queryExpiresAt:l.queryExpiresAt,rawAvailable};
  }
  function checked(candidate,r){
    const entry=issued.get(candidate),p=currentPins();check(!closed&&entry&&p,'BC_HR_CANDIDATE');
    const l=resolveLease(r);
    if(!l||l.available!==true||!(now()<Math.min(l.authExpiresAt,l.rawExpiresAt,l.queryExpiresAt))
      ||entry.isAuthorized()!==true||p0Hash('P1-PINS',p)!==entry.pinsHash)entry.lease.dispose();
    check(entry.ledgerHash===r.requestHash&&p0Hash('P1-PINS',p)===entry.pinsHash&&entry.lease.isCurrent(),'BC_HR_CONTEXT_CHANGED');
    const g=verifier.recheck(entry.receipt,entry.expected);
    check(g.requestHash===p1RequestHash(entry.expected)&&g.nonceHash===p1Hash('NONCE',r.nonceHash)&&g.proofBundleHash===candidate.proofBundleHash
      &&g.durableConsumptionPerformed===false&&now()<g.validUntilExclusive,'BC_HR_RECHECK');return {entry,guard:g};
  }
  return {
    execution:'SYNTHETIC_FIXTURE',capability:'HACKERRANK_CERTIFICATE_HOLDING.1',bridgeVersion:BRIDGE_VERSION,resolveSource,
    status(){return currentPins()&&!closed?'SYNTHETIC_ONLY':'UNCONFIGURED_BLOCKED';},
    async verify(r,{signal,isAuthorized=()=>true}){
      const p=currentPins();check(p&&!closed&&typeof verifier?.verify==='function'&&typeof collectLease==='function','BC_HR_TRUST_BLOCKED');
      const expected=translateReclaimRequest(r,p);let lease;
      try{
        check(isAuthorized()===true,'BC_HR_AUTHORITY');
        lease=await collectLease(expected,{signal,isAuthorized});check(lease?.version==='clear-bootcamp-memory-lease.2'&&typeof lease.dispose==='function','BC_HR_RAW_LEASE');
        for(const old of leases)if(!old.isCurrent())leases.delete(old);check(leases.size<32,'BC_RAW_CAPACITY');
        leases.add(lease);check(!closed&&!signal?.aborted&&isAuthorized()===true,'BC_CANCELLED');
        const receipt=await verifier.verify(lease.read(),expected);
        check(!closed&&!signal?.aborted&&receipt.status==='VERIFIED_CANDIDATE'&&receipt.dataMode==='SYNTHETIC_FIXTURE','BC_HR_SOURCE_REJECTED');
        check(receipt.binding.requestHash===p1RequestHash(expected)&&receipt.binding.nonceHash===p1Hash('NONCE',r.nonceHash),'BC_HR_REQUEST_BINDING');
        const l=resolveLease(r);check(l&&lease.isCurrent(),'BC_PRIVATE_RAW_UNAVAILABLE');
        const expiresAt=Math.min(lease.expiresAt,l.authExpiresAt,l.rawExpiresAt,l.queryExpiresAt,receipt.acquiredAt+1800);
        const candidate=freeze({requestHash:r.requestHash,nonceHash:r.nonceHash,proofBundleHash:receipt.proofBundleHash,
          source:structuredClone(receipt.source),sourceVersion:receipt.sourceVersion,sourceHash:receipt.sourceHash,acquiredAt:receipt.acquiredAt,verifiedAt:receipt.verifiedAt,
          validUntilExclusive:Math.min(receipt.validUntilExclusive,expiresAt),facts:structuredClone(receipt.facts),
          rawLocator:{recordRef:receipt.source.recordRef,fieldPath:'/certificate/status',expiresAt},originalBody:null});
        const prior=published.get(key(r));prior?.lease.dispose();if(prior)leases.delete(prior.lease);published.set(key(r),{receipt,lease,isAuthorized,pinsHash:p0Hash('P1-PINS',p)});
        issued.set(candidate,{receipt,expected,lease,isAuthorized,ledgerHash:r.requestHash,pinsHash:p0Hash('P1-PINS',p)});checked(candidate,r);return candidate;
      }catch(error){lease?.dispose();if(lease)leases.delete(lease);throw error;}
    },
    recheck(candidate,r){checked(candidate,r);return true;},
    reference(candidate,r){const {entry,guard}=checked(candidate,r);return freeze({version:BRIDGE_VERSION,producer:'hackerrank-adapter.1',
      ledgerRequestHash:r.requestHash,ledgerNonceHash:r.nonceHash,producerRequestHash:guard.requestHash,producerNonceHash:guard.nonceHash,
      proofBundleHash:guard.proofBundleHash,receiptHash:guard.receiptHash,trustConfigHash:guard.trustConfigHash,
      expectedClaimOwnerHash:entry.receipt.binding.expectedClaimOwnerHash,recipeHash:entry.receipt.recipeHash,validUntilExclusive:guard.validUntilExclusive});},
    close(){closed=true;for(const lease of leases)lease.dispose();leases.clear();published.clear();},
  };
}
