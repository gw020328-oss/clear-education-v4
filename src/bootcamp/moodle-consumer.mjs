import {randomUUID} from 'node:crypto';
import {freeze,requireRule as check} from '../policy/values.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
import {createBootcampMoodleRequest,readBootcampMoodle,validateBootcampMoodleResult,bootcampMoodleRequestHash} from '../review-evidence/moodle/bootcamp.mjs';
import {createBootcampReflectionSession,REFLECTION_PROFILE_HASH,REFLECTION_PROMPT_VERSION} from '../document-precheck/review/bootcamp-reflection.mjs';
import {criterion,bytesHash} from './model.mjs';
import {BRIDGE_VERSION,createMemoryLease} from './reclaim-consumer.mjs';

// Capture only the owner, never a second persistent copy of its original text.
function leasedCandidate(metadata,lease,hasBody){
  const candidate={...freeze(metadata)};
  Object.defineProperty(candidate,'originalBody',{enumerable:true,get:()=>hasBody?lease.read().source.body:null});
  return Object.freeze(candidate);
}

// Offline composition only. A real/local client has no fixture execution brand
// and cannot be used here. Producer receipts keep their original assurance.
export function createMoodleConsumer({criterionId,fixtureOnly=false,offlineClientFor,resolvePin=()=>null,resolveLease=()=>null,
  observationAdapter,now=()=>Math.floor(Date.now()/1000)}={}){
  const c=criterion(criterionId);check(c.source!=='RECLAIM_HACKERRANK','BC_MOODLE_CAPABILITY');
  const generation='lease-'+randomUUID(),entries=new WeakMap(),published=new Map(),leases=new Set();let closed=false;
  const trustHash=p0Hash('OFFLINE-COMPOSITION-TRUST',{version:BRIDGE_VERSION,criterionId,producer:'moodle-p2-and-mock-reflection'});
  function resolveSource(context){
    let e=published.get(context.applicationId);const lease=resolveLease(context),pin=resolvePin(context);
    if(closed||!fixtureOnly||!pin||lease?.available!==true||now()>=Math.min(lease.authExpiresAt,lease.rawExpiresAt,lease.queryExpiresAt)){e?.lease.dispose();return null;}
    const pinHash=p0Hash('PIN',pin);if(e&&e.pinHash!==pinHash)e.lease.dispose();
    if(e&&!e.lease.isCurrent()){published.delete(context.applicationId);leases.delete(e.lease);e=undefined;}const rawAvailable=true;
    return {source:{provider:'offline-moodle-composition',instanceRef:'synthetic-fixture',recordRef:'source-'+p0Hash('SOURCE-REF',context.applicationId+':'+criterionId).slice(2,42),accountBindingRef:'synthetic-account'},
      sourceVersion:pin.sourceVersion,sourceHash:e?.sourceHash??p0Hash('UNOBSERVED',context.applicationId),
      sourceReceiptHash:e?.receiptHash??p0Hash('UNOBSERVED-RECEIPT',context.applicationId),runtimeMappingHash:context.runtimeMappingHash,
      trustHash,leaseId:'lease-'+p0Hash('MOODLE-LEASE',{generation,pinHash}).slice(2,50),authExpiresAt:lease.authExpiresAt,rawExpiresAt:lease.rawExpiresAt,queryExpiresAt:lease.queryExpiresAt,rawAvailable};
  }
  function checked(candidate,r){
    const e=entries.get(candidate);check(!closed&&e&&e.requestHash===r.requestHash&&e.lease.isCurrent(),'BC_MOODLE_RAW_STALE');
    check(p0Hash('PIN',resolvePin(r))===e.pinHash,'BC_MOODLE_MAPPING_STALE');
    validateBootcampMoodleResult(e.lease.read(),{request:e.request,expectedReceiptHash:e.receiptHash,nowMs:now()*1000});
    if(e.review)check(e.review.session.isCurrent(e.review.receipt),'BC_REFLECTION_STALE');return e;
  }
  return {execution:'SYNTHETIC_FIXTURE',capability:c.capability,bridgeVersion:BRIDGE_VERSION,resolveSource,
    async verify(r,{signal,isAuthorized=()=>true}){
      check(fixtureOnly&&!closed&&r.version==='clear-bootcamp-bound-request.2','BC_MOODLE_REAL_BLOCKED');
      const pin=structuredClone(resolvePin(r)),leaseContext=resolveLease(r),source=resolveSource(r);check(source&&r.producerTrustHash===trustHash,'BC_MOODLE_UNAVAILABLE');
      check(isAuthorized()===true,'BC_MOODLE_AUTHORITY');
      const client=offlineClientFor(r);check(client?.execution==='OFFLINE_SYNTHETIC_FIXTURE','BC_MOODLE_OFFLINE_REQUIRED');
      const request=createBootcampMoodleRequest({pin,context:{participantId:r.participantId,applicationId:r.applicationId,policyHash:r.policyHash,criterionId,
        capability:c.capability,evidenceId:r.plannedEvidenceId,evidenceRevision:r.plannedEvidenceRevision,runtimeMappingHash:r.runtimeMappingHash,
        fixtureReportHash:pin.fixtureReportHash,sourceRunId:r.requestId,sourceGeneration:1,attempt:1,issuedAtMs:r.issuedAt*1000,
        expiresAtMs:Math.min(r.expiresAt,r.issuedAt+300)*1000}});
      const authority=()=>{
        const current=resolveLease(r);
        check(!closed&&!signal?.aborted&&current?.available===true
          &&now()<Math.min(r.expiresAt,current.authExpiresAt,current.rawExpiresAt,current.queryExpiresAt)
          &&p0Hash('PIN',resolvePin(r))===p0Hash('PIN',pin)&&isAuthorized()===true,'BC_MOODLE_AUTHORITY');
      };
      const guardedClient={async call(...args){authority();const value=await client.call(...args);authority();return value;}};
      let lease,entry;
      try{
        const result=await readBootcampMoodle({client:guardedClient,request,getCurrentRequest:()=>{authority();return request;},getCurrentContext:()=>request.context,
          getCurrentPin:()=>resolvePin(r),signal,now:()=>now()*1000});
        check(!closed&&!signal?.aborted&&isAuthorized()===true,'BC_CANCELLED');
        const expiry=Math.min(Math.floor(request.context.expiresAtMs/1000),leaseContext.authExpiresAt,leaseContext.rawExpiresAt,leaseContext.queryExpiresAt);
        entry={request,requestHash:r.requestHash,receiptHash:result.receiptHash,pinHash:p0Hash('PIN',pin),review:null};
        for(const old of leases)if(!old.isCurrent())leases.delete(old);check(leases.size<32,'BC_RAW_CAPACITY');
        lease=createMemoryLease(result,{expiresAt:expiry,now,isCurrent:()=>{
          const current=resolveLease(r);
          return !closed&&!signal?.aborted&&current?.available===true
            &&now()<Math.min(current.authExpiresAt,current.rawExpiresAt,current.queryExpiresAt)
            &&p0Hash('PIN',resolvePin(r))===entry.pinHash&&isAuthorized()===true;
        },
          onDispose:()=>{if(entry.review)entry.review.current=false;}});entry.lease=lease;leases.add(lease);
        let facts,originalBody=null;
        if(criterionId==='activity-complete')facts={capability:c.capability,targetLogicalId:c.targetLogicalId,completionState:result.facts.completionState,
          completionMode:result.facts.completionMode,completionRuleHash:result.facts.completionRuleHash,sourceCompletedAt:result.facts.sourceCompletedAt};
        else if(criterionId==='assignment-submitted')facts={capability:c.capability,targetLogicalId:c.targetLogicalId,
          submissionState:result.facts.submissionState,sourceSubmittedAt:result.facts.sourceSubmittedAt};
        else{
          originalBody=result.source.body;const context={version:'clear-bootcamp-observation-context.1',dataScope:'ISOLATED_SYNTHETIC_ACCOUNT',
            participantId:r.participantId,applicationId:r.applicationId,policyHash:r.policyHash,criterionId,capability:c.capability,
            evidenceId:r.plannedEvidenceId,evidenceRevision:r.plannedEvidenceRevision,sourceId:source.source.recordRef,sourceVersion:pin.sourceVersion,
            sourceHash:result.acquisition.sourceHash,sourceReceiptHash:result.receiptHash,runtimeMappingHash:r.runtimeMappingHash,requestHash:r.requestHash,
            inputHash:bytesHash(Buffer.from(originalBody,'utf8')),normalizerVersion:null,normalizedHash:null,runId:r.requestId,attempt:1,
            profileHash:REFLECTION_PROFILE_HASH,modelVersion:'mock-bootcamp-reflection.1',promptVersion:REFLECTION_PROMPT_VERSION,
            issuedAtMs:request.context.issuedAtMs,expiresAtMs:expiry*1000,sourceStatus:'OBSERVED_TARGET'};
          const session=createBootcampReflectionSession(()=>({rawAvailable:lease.isCurrent(),context}),{nowMs:()=>now()*1000});
          const receipt=await session.review({context,text:originalBody},observationAdapter(context),{signal});
          check(session.isCurrent(receipt),'BC_REFLECTION_STALE');entry.review={session,receipt};
          facts={capability:c.capability,targetLogicalId:c.targetLogicalId,originalBodyHash:receipt.originalBodyHash,
            topics:receipt.topics.map(t=>({topicId:t.topicId,state:t.state,originalEvidenceLocator:t.originalEvidenceLocator})),
            observationRunId:context.runId,observationProfileHash:context.profileHash};
        }
        const candidate=leasedCandidate({requestHash:r.requestHash,nonceHash:r.nonceHash,proofBundleHash:p0Hash('OFFLINE-COMPOSITION',{receiptHash:result.receiptHash,requestHash:r.requestHash}),
          source:source.source,sourceVersion:pin.sourceVersion,sourceHash:result.acquisition.sourceHash,
          acquiredAt:Math.floor(result.acquisition.observed.startedAtMs/1000),verifiedAt:now(),validUntilExclusive:expiry,facts,
          rawLocator:{recordRef:source.source.recordRef,fieldPath:criterionId==='reflection-topics'?'/source/body':criterionId==='assignment-submitted'?'/source/submission':'/source/state',expiresAt:expiry}},lease,criterionId==='reflection-topics');
        const prior=published.get(r.applicationId);prior?.lease.dispose();if(prior)leases.delete(prior.lease);
        published.set(r.applicationId,{lease,sourceHash:result.acquisition.sourceHash,receiptHash:result.receiptHash,pinHash:entry.pinHash});entries.set(candidate,entry);checked(candidate,r);return candidate;
      }catch(error){lease?.dispose();if(lease)leases.delete(lease);throw error;}
    },
    recheck(candidate,r){checked(candidate,r);return true;},
    reference(candidate,r){const e=checked(candidate,r);return freeze({version:BRIDGE_VERSION,producer:'offline-moodle-ai-composition.2',ledgerRequestHash:r.requestHash,
      ledgerNonceHash:r.nonceHash,producerRequestHash:bootcampMoodleRequestHash(e.request),receiptHash:e.receiptHash,sourceHash:candidate.sourceHash,
      sourceDataMode:'LOCAL_LMS_RECORD',execution:'OFFLINE_SYNTHETIC_FIXTURE',producerUsableForAcceptance:false,observationHash:e.review?.receipt.observationHash??null});},
    close(){closed=true;for(const l of leases)l.dispose();leases.clear();published.clear();},
  };
}
