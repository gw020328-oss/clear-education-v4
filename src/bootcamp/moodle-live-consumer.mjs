import {isFirstNormalReflectionResult,consumeFirstNormalReflection,prepareFirstNormalReflectionPacket} from '../../tests/ai-review-precheck/first-normal-reflection-entry.mjs';
// Dedicated LOCAL API / ACTUAL model TEST path; the offline consumer is unchanged.
import {randomUUID} from 'node:crypto';
import {freeze,requireRule as check} from '../policy/values.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
import {createBootcampMoodleRequest,readBootcampMoodle,bootcampMoodleRequestHash} from '../review-evidence/moodle/bootcamp.mjs';
import {openMoodleSourceSession} from '../review-evidence/moodle/source-session.mjs';
import {REFLECTION_PROFILE_HASH,REFLECTION_PROMPT_VERSION,reflectionContextHash} from '../document-precheck/review/bootcamp-reflection.mjs';
import {E6_OPERATIONS_HASH} from '../document-precheck/review/e6-leased-reflection.mjs';
import {criterion,bytesHash} from './model.mjs';
import {BRIDGE_VERSION,createMemoryLease} from './reclaim-consumer.mjs';
const registered=new WeakSet();
export const isLiveMoodleConsumer=p=>registered.has(p);
export function createLiveMoodleConsumer({criterionId,withReader,resolvePin,resolveLease,reviewReflection,modelVersion,reflectionHost=null,sourceValiditySeconds=null,now=()=>Math.floor(Date.now()/1000)}){
 const c=criterion(criterionId);check(c.source!=='RECLAIM_HACKERRANK'&&[withReader,resolvePin,resolveLease].every(f=>typeof f==='function'),'BC_LIVE_MOODLE_CONFIG');
 check(sourceValiditySeconds===null||sourceValiditySeconds===900,'BC_LIVE_MOODLE_CONFIG');
 const preparations=new Map();
 const generation='lease-'+randomUUID(),entries=new WeakMap(),published=new Map(),owners=new Set();let closed=false;
 const trustHash=p0Hash('LIVE-MOODLE-COMPOSITION',{version:BRIDGE_VERSION,criterionId,modelVersion:criterionId==='reflection-topics'?modelVersion:null,assurance:'HOST_APPROVED_GENERATED_DEMO_ACCOUNT'});
 function resolveSource(r){const pin=resolvePin(r),l=resolveLease(r);let e=published.get(r.applicationId);
  if(closed||!pin||l?.available!==true||now()>=Math.min(l.authExpiresAt,l.rawExpiresAt,l.queryExpiresAt)){e?.raw.dispose();e?.handle.dispose();return null;}
  const pinHash=p0Hash('PIN',pin);if(e&&(!e.raw.isCurrent()||pinHash!==e.pinHash)){e.raw.dispose();e.handle.dispose();published.delete(r.applicationId);e=null;}
  check(pin.participantMapping.applicationId===r.applicationId&&pin.participantMapping.participantId===r.participantId,'BC_LIVE_MOODLE_BINDING');
  return {source:{provider:'local-moodle-api',instanceRef:pin.environmentRef,recordRef:'source-'+p0Hash('SOURCE-REF',r.applicationId+':'+criterionId).slice(2,42),accountBindingRef:pin.participantMapping.accountBindingRef},
   sourceVersion:pin.sourceVersion+(sourceValiditySeconds===900?'.review900':''),sourceHash:e?.sourceHash??p0Hash('UNOBSERVED',r.applicationId),sourceReceiptHash:e?.receiptHash??p0Hash('UNOBSERVED-RECEIPT',r.applicationId),runtimeMappingHash:r.runtimeMappingHash,trustHash,
   leaseId:'lease-'+p0Hash('LIVE-MOODLE-LEASE',{generation,pinHash}).slice(2,50),authExpiresAt:l.authExpiresAt,rawExpiresAt:l.rawExpiresAt,queryExpiresAt:l.queryExpiresAt,rawAvailable:true};
 }
 function checked(candidate,r){const e=entries.get(candidate);check(e&&!closed&&e.requestHash===r.requestHash&&e.raw.isCurrent()&&e.handle.isCurrent()&&p0Hash('PIN',resolvePin(r))===e.pinHash,'BC_LIVE_MOODLE_STALE');
  const preparation=preparations.get(r.requestHash);if(preparation)check(['RUNNING','CONSUMED'].includes(preparation.state)&&p0Hash('REFLECTION-HOST',hostState())===p0Hash('REFLECTION-HOST',preparation.fixed),'BC_LIVE_AI_PREPARATION_CHANGED');
  if(e.review){const v=consumeFirstNormalReflection(e.review);check(v.current&&v.observation?.current&&v.observation.execution==='ACTUAL'&&v.observation.contextHash===e.observationContextHash&&v.observation.context.requestHash===r.requestHash,'BC_LIVE_AI_STALE');}return e;}
 async function* candidateSteps(r,{signal,isAuthorized=()=>false,preparing=false}){
   check(!closed&&r.version==='clear-bootcamp-bound-request.2'&&r.dataMode==='LOCAL_LMS_RECORD'&&r.producerTrustHash===trustHash,'BC_LIVE_MOODLE_REQUEST');
   const pin=structuredClone(resolvePin(r)),l=resolveLease(r),src=resolveSource(r),expiry=Math.min(r.expiresAt,r.issuedAt+(sourceValiditySeconds??(preparing?240:300)),l.authExpiresAt,l.rawExpiresAt,l.queryExpiresAt),pinHash=p0Hash('PIN',pin);
   const q=createBootcampMoodleRequest({version:sourceValiditySeconds===900?'clear-moodle-bootcamp-read.2-review900':'clear-moodle-bootcamp-read.1',pin,context:{participantId:r.participantId,applicationId:r.applicationId,policyHash:r.policyHash,criterionId,capability:c.capability,evidenceId:r.plannedEvidenceId,evidenceRevision:r.plannedEvidenceRevision,runtimeMappingHash:r.runtimeMappingHash,fixtureReportHash:pin.fixtureReportHash,sourceRunId:r.requestId,sourceGeneration:1,attempt:1,issuedAtMs:r.issuedAt*1000,expiresAtMs:expiry*1000}});
   const current=()=>{const x=resolveLease(r);return !closed&&!signal?.aborted&&isAuthorized()===true&&x?.available===true&&now()<Math.min(expiry,x.authExpiresAt,x.rawExpiresAt,x.queryExpiresAt)&&p0Hash('PIN',resolvePin(r))===pinHash;};
   const authority=()=>{check(current(),'BC_LIVE_MOODLE_AUTHORITY');const x=resolveLease(r);return {available:true,requestHash:bootcampMoodleRequestHash(q),pinHash:p0Hash('MOODLE-PIN',pin),sourceEpoch:generation,authExpiresAtMs:x.authExpiresAt*1000,rawExpiresAtMs:x.rawExpiresAt*1000,queryExpiresAtMs:x.queryExpiresAt*1000};};
   let handle,rawLease,review=null,observationContextHash=null;
   try{
    handle=await openMoodleSourceSession({request:q,collect:(request,{signal})=>withReader(client=>readBootcampMoodle({client,request,getCurrentRequest:()=>{authority();return q;},getCurrentContext:()=>{authority();return q.context;},getCurrentPin:()=>{authority();return resolvePin(r);},signal,now:()=>now()*1000})),resolveCurrent:authority,signal,now:()=>now()*1000});
    for(const h of owners)if(!h.isCurrent())owners.delete(h);check(owners.size<32,'BC_RAW_CAPACITY');owners.add(handle);const meta=handle.metadata;let raw=await handle.getRaw({signal});const facts=meta.facts;let acceptedFacts;
    if(criterionId==='activity-complete')acceptedFacts={capability:c.capability,targetLogicalId:c.targetLogicalId,completionState:facts.completionState,completionMode:facts.completionMode,completionRuleHash:facts.completionRuleHash,sourceCompletedAt:facts.sourceCompletedAt};
    else if(criterionId==='assignment-submitted')acceptedFacts={capability:c.capability,targetLogicalId:c.targetLogicalId,submissionState:facts.submissionState,sourceSubmittedAt:facts.sourceSubmittedAt};
    else{
     check(typeof reviewReflection==='function','BC_LIVE_AI_UNCONFIGURED');const context={version:'clear-bootcamp-observation-context.1',dataScope:'ISOLATED_SYNTHETIC_ACCOUNT',participantId:r.participantId,applicationId:r.applicationId,policyHash:r.policyHash,criterionId,capability:c.capability,evidenceId:r.plannedEvidenceId,evidenceRevision:r.plannedEvidenceRevision,sourceId:src.source.recordRef,sourceVersion:pin.sourceVersion+(sourceValiditySeconds===900?'.review900':''),sourceHash:meta.sourceHash,sourceReceiptHash:meta.sourceReceiptHash,runtimeMappingHash:r.runtimeMappingHash,requestHash:r.requestHash,inputHash:bytesHash(Buffer.from(raw.body,'utf8')),normalizerVersion:null,normalizedHash:null,runId:r.requestId,attempt:1,profileHash:REFLECTION_PROFILE_HASH,modelVersion,promptVersion:REFLECTION_PROMPT_VERSION,issuedAtMs:q.context.issuedAtMs,expiresAtMs:expiry*1000,sourceStatus:'OBSERVED_TARGET'};
     const messageFormat=raw.messageFormat,decisionRef=null;
     const resolveCurrent=()=>({context,decisionRef,messageFormat,operationsProfileHash:E6_OPERATIONS_HASH,rawAvailable:current()&&handle.isCurrent(),leaseExpiresAtMs:Math.min(expiry*1000,handle.expiresAtMs??0)});
     raw=null;review=yield {context,decisionRef,messageFormat,resolveCurrent,lease:{isCurrent:()=>current()&&handle.isCurrent(),async readBody({signal:readSignal}={}){const value=await handle.getRaw({signal:readSignal??signal});check(current()&&value.messageFormat===messageFormat&&bytesHash(Buffer.from(value.body,'utf8'))===context.inputHash,'BC_LIVE_AI_INPUT_CHANGED');return value.body;},release(){}},signal,timeoutMs:30000,nowMs:()=>now()*1000};
     check(isFirstNormalReflectionResult(review),'BC_LIVE_AI_RESULT_IDENTITY');const v=consumeFirstNormalReflection(review);check(v.current&&v.observation?.current,'BC_LIVE_AI_STALE');const record=v.observation;observationContextHash=reflectionContextHash(context);check(record?.execution==='ACTUAL'&&record.contextHash===observationContextHash&&reflectionContextHash(record.context)===observationContextHash&&record.context.requestHash===r.requestHash,'BC_LIVE_AI_ACTUAL_REQUIRED');
     acceptedFacts={capability:c.capability,targetLogicalId:c.targetLogicalId,originalBodyHash:record.originalBodyHash,topics:record.topics.map(t=>({topicId:t.topicId,state:t.state,originalEvidenceLocator:t.originalEvidenceLocator})),observationRunId:context.runId,observationProfileHash:context.profileHash};
    }
    // Fresh async source probe occurs before the short synchronous DB acceptance.
    raw=await handle.getRaw({signal});check(current(),'BC_LIVE_MOODLE_AUTHORITY');
    rawLease=createMemoryLease(raw,{expiresAt:expiry,now,isCurrent:()=>current()&&handle.isCurrent(),onDispose:()=>{handle.dispose();review?.close();owners.delete(handle);}});raw=null;
    const e={handle,raw:rawLease,pinHash,requestHash:r.requestHash,sourceHash:meta.sourceHash,receiptHash:meta.sourceReceiptHash,producerRequestHash:meta.requestHash,review,observationContextHash};
    const candidate={requestHash:r.requestHash,nonceHash:r.nonceHash,proofBundleHash:p0Hash('LIVE-MOODLE-COMPOSITION',{receiptHash:meta.sourceReceiptHash,requestHash:r.requestHash}),source:src.source,sourceVersion:pin.sourceVersion+(sourceValiditySeconds===900?'.review900':''),sourceHash:meta.sourceHash,acquiredAt:Math.floor(meta.acquisition.observed.startedAtMs/1000),verifiedAt:now(),validUntilExclusive:expiry,facts:acceptedFacts,rawLocator:{recordRef:src.source.recordRef,fieldPath:criterionId==='reflection-topics'?'/source/body':criterionId==='assignment-submitted'?'/source/submission':'/source/state',expiresAt:expiry}};
    Object.defineProperty(candidate,'originalBody',{enumerable:true,get:()=>criterionId==='reflection-topics'?rawLease.read().body:null});Object.freeze(candidate);
    published.get(r.applicationId)?.raw.dispose();published.set(r.applicationId,e);entries.set(candidate,e);checked(candidate,r);return candidate;
   }catch(error){rawLease?.dispose();handle?.dispose();owners.delete(handle);review?.close();throw error;}
  }
 const hostState=()=>{
  check(typeof reflectionHost?.codeState==='function'&&typeof reflectionHost?.day==='function','BC_LIVE_AI_PREPARATION_HOST');
  const codeState=structuredClone(reflectionHost.codeState()),day=reflectionHost.day();
  check(codeState?.clean===true&&/^[a-f0-9]{40}$/.test(codeState.head??'')&&/^\d{4}-\d{2}-\d{2}$/.test(day??''),'BC_LIVE_AI_PREPARATION_HOST');
  return freeze({codeState,day});
 };
 const producer={execution:'ISOLATED_LIVE_TEST',capability:c.capability,bridgeVersion:BRIDGE_VERSION,dataMode:'LOCAL_LMS_RECORD',resolveSource,
  async prepareReflection(r,{signal,isAuthorized=()=>false}){
   check(criterionId==='reflection-topics'&&!closed&&!preparations.has(r.requestHash)&&preparations.size<32,'BC_LIVE_AI_PREPARATION_REQUEST');
   const fixed=hostState(),controller=new AbortController(),combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
   const entry={requestHash:p0Hash('REFLECTION-PREPARED-REQUEST',r),controller,authorize:isAuthorized,state:'PREPARING',iterator:null,timer:null,args:null,fixed};preparations.set(r.requestHash,entry);
   const dispose=()=>{if(entry.state==='DISPOSED')return;entry.state='DISPOSED';clearTimeout(entry.timer);controller.abort();void entry.iterator?.return().catch(()=>{});};
   entry.dispose=dispose;
   const current=()=>{if(entry.state==='CONSUMED')return false;try{check(!closed&&!combined.aborted&&['WAITING','RUNNING'].includes(entry.state),'BC_LIVE_AI_PREPARATION_STALE');
    check(p0Hash('REFLECTION-HOST',hostState())===p0Hash('REFLECTION-HOST',fixed),'BC_LIVE_AI_PREPARATION_CHANGED');
    const v=entry.args.resolveCurrent();check(v.rawAvailable&&now()*1000<Math.min(entry.packet.leaseExpiresAtMs,v.leaseExpiresAtMs),'BC_LIVE_AI_PREPARATION_STALE');return true;
   }catch{dispose();return false;}};entry.current=current;
   combined.addEventListener('abort',dispose,{once:true});
   try{
    const iterator=candidateSteps(r,{signal:combined,isAuthorized:()=>entry.authorize(),preparing:true});entry.iterator=iterator;
    const step=await iterator.next();check(!step.done&&!combined.aborted&&entry.state==='PREPARING','BC_LIVE_AI_PREPARATION_STALE');entry.args=step.value;
    const text=await entry.args.lease.readBody({signal:combined}),v=entry.args.resolveCurrent();
    entry.packet=prepareFirstNormalReflectionPacket({...entry.args,text,leaseExpiresAtMs:v.leaseExpiresAtMs});entry.state='WAITING';
    const managedRun=reflectionHost.bindManagedRun?.({packet:entry.packet,context:entry.args.context})??null;
    check(current(),'BC_LIVE_AI_PREPARATION_STALE');
    entry.timer=setTimeout(dispose,Math.max(1,entry.packet.leaseExpiresAtMs-now()*1000));entry.timer.unref?.();
    return Object.freeze({packet:entry.packet,codeState:fixed.codeState,day:fixed.day,managedRun,isCurrent:current,dispose});
   }catch(e){dispose();throw e;}
  },
  async verify(r,{signal,isAuthorized=()=>false}){
   const entry=preparations.get(r.requestHash);let iterator,abort,borrowedReview;
   try{
    if(entry){
     check(entry.requestHash===p0Hash('REFLECTION-PREPARED-REQUEST',r),'BC_LIVE_AI_PREPARATION_REQUEST');
     check(entry.state==='WAITING'&&entry.current(),'BC_LIVE_AI_PREPARATION_STALE');entry.state='RUNNING';entry.authorize=isAuthorized;
     abort=()=>entry.dispose();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
     check(entry.current(),'BC_LIVE_AI_PREPARATION_STALE');
     const text=await entry.args.lease.readBody({signal});
     check(bytesHash(Buffer.from(text,'utf8'))===entry.packet.inputHash&&entry.current(),'BC_LIVE_AI_PREPARATION_CHANGED');
     iterator=entry.iterator;
     const review=borrowedReview=await reviewReflection({...entry.args,signal,packet:entry.packet,codeState:entry.fixed.codeState,day:entry.fixed.day,
      currentCodeState:()=>reflectionHost.codeState(),currentDay:()=>reflectionHost.day()});
     check(entry.current(),'BC_LIVE_AI_PREPARATION_STALE');const done=await iterator.next(review);check(done.done,'BC_LIVE_AI_PREPARATION_STATE');
     entry.state='CONSUMED';clearTimeout(entry.timer);return done.value;
    }
    iterator=candidateSteps(r,{signal,isAuthorized});let step=await iterator.next();
    if(!step.done)step=await iterator.next(await reviewReflection(step.value));check(step.done,'BC_LIVE_AI_PREPARATION_STATE');return step.value;
   }catch(e){borrowedReview?.close();entry?.dispose();if(iterator)try{await iterator.throw(e);}catch{}throw e;}
   finally{signal?.removeEventListener('abort',abort);}
  },
  recheck(candidate,r){checked(candidate,r);return true;},
  reference(candidate,r){const e=checked(candidate,r);return freeze({version:BRIDGE_VERSION,producer:'live-moodle-ai-composition.1',ledgerRequestHash:r.requestHash,ledgerNonceHash:r.nonceHash,producerRequestHash:e.producerRequestHash,receiptHash:e.receiptHash,sourceHash:e.sourceHash,sourceDataMode:'LOCAL_LMS_RECORD',execution:'OBSERVED_LOCAL_API',producerUsableForAcceptance:false,observationHash:(e.review?consumeFirstNormalReflection(e.review).observation?.observationHash:null)??null});},
  close(){closed=true;for(const e of preparations.values())e.dispose();preparations.clear();for(const e of published.values())e.raw.dispose();for(const h of owners)h.dispose();owners.clear();published.clear();},
 };
 registered.add(producer);return Object.freeze(producer);
}
