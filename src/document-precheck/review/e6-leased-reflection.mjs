import {readFileSync} from 'node:fs';
import {exactKeys,freeze,requireRule as check} from '../../policy/values.mjs';
import {identifier,revision,hash32} from '../../product-workflow/contract.mjs';
import {p0Hash,P0_GATES} from '../../../specs/bootcamp/p0-contract.mjs';
import {createBootcampReflectionSession,validateReflectionContext,reflectionContextHash} from './bootcamp-reflection.mjs';
import {isFixedNormalReflectionAdapter} from './fixed-normal-reflection.mjs';

const operations=JSON.parse(readFileSync(new URL('../../../specs/bootcamp/hackathon-test-operations-v1.json',import.meta.url)));
check(operations.version==='clear-hackathon-test-operations.1'&&operations.decisionRevision===1&&operations.repositoryPlanRevision===4,'E6_OPERATIONS_PROFILE');
export const E6_OPERATIONS_HASH=p0Hash('HACKATHON-TEST-OPERATIONS',operations);
const codes=['E6_CANCELED','E6_DISPOSED','E6_SOURCE_CHANGED','E6_DECISION_CHANGED','E6_CONTEXT_CHANGED','E6_FORMAT_CHANGED',
  'E6_PROFILE_CHANGED','E6_LEASE_CLOSED','E6_LEASE_EXPIRED','E6_CLOCK','E6_RELEASE_FAILED','E6_INPUT_MISMATCH'];
const decisionHash=ref=>{
  if(ref===null)return p0Hash('E6-DECISION-REF',null);
  exactKeys(ref,['decisionId','decisionRevision','decisionHash'],'E6_DECISION_REF');identifier(ref.decisionId);revision(ref.decisionRevision);hash32(ref.decisionHash);
  return p0Hash('E6-DECISION-REF',ref);
};

// Borrowed raw handle: isCurrent/readBody/release. release drops the borrow; it
// must NOT dispose a shared candidate's owner lease unless ownership transfers.
// Host current metadata is required to reflect that owner's current lease.
export function createE6LeasedReflectionSession(resolveCurrent,{nowMs=()=>Date.now()}={}){
  check(typeof resolveCurrent==='function'&&typeof nowMs==='function','E6_RESOLVER');
  const issued=new WeakMap(),used=new Set();let closed=false,latest=null,floor=0;
  const clock=()=>{const n=nowMs();check(Number.isSafeInteger(n)&&n>=floor,'E6_CLOCK');floor=n;return n;};
  function release(job){
    clearTimeout(job.timer);job.active=false;const handle=job.lease;job.lease=null;
    if(handle)try{handle.release();}catch{job.invalid='E6_RELEASE_FAILED';}
  }
  function invalidate(job,code){
    if(!job)return;job.invalid??=code;job.controller.abort();release(job);
  }
  function arm(job){
    clearTimeout(job.timer);if(!job.active)return;
    job.timer=setTimeout(()=>invalidate(job,'E6_LEASE_EXPIRED'),Math.max(0,job.capMs-clock()));job.timer.unref?.();
  }
  function fresh(job){
    check(!closed,'E6_DISPOSED');check(!job.invalid,job.invalid??'E6_CONTEXT_CHANGED');check(job===latest,'E6_CONTEXT_CHANGED');
    const state=resolveCurrent();
    check(state.operationsProfileHash===E6_OPERATIONS_HASH,'E6_PROFILE_CHANGED');
    check(reflectionContextHash(state.context)===reflectionContextHash(job.context),'E6_CONTEXT_CHANGED');
    check(decisionHash(state.decisionRef)===decisionHash(job.decisionRef),'E6_DECISION_CHANGED');
    check(state.messageFormat===job.messageFormat,'E6_FORMAT_CHANGED');
    check(state.rawAvailable===true,'E6_LEASE_CLOSED');
    check(Number.isSafeInteger(state.leaseExpiresAtMs)&&state.leaseExpiresAtMs>=0,'E6_LEASE_CLOSED');
    if(job.lease)check(job.lease.isCurrent()===true,'E6_LEASE_CLOSED');
    const next=Math.min(job.capMs,state.leaseExpiresAtMs),changed=next!==job.capMs;job.capMs=next;
    const now=clock();check(now>=job.context.issuedAtMs&&now<job.capMs,'E6_LEASE_EXPIRED');if(changed)arm(job);return true;
  }
  function checkCurrent(job){
    try{fresh(job);if(job.receipt&&!job.core.isCurrent(job.receipt)){invalidate(job,'E6_CONTEXT_CHANGED');return false;}return true;}
    catch(e){invalidate(job,codes.includes(e.message)?e.message:'E6_CONTEXT_CHANGED');return false;}
  }
  function view(job){
    let current=checkCurrent(job),observation=job.receipt?job.core.consume(job.receipt):null;
    if(observation&&!observation.current){invalidate(job,'E6_CONTEXT_CHANGED');current=false;}
    if(current&&!checkCurrent(job)){current=false;observation=job.receipt?job.core.consume(job.receipt):null;}
    const data={version:'clear-e6-reflection-lease-view.1',operationsProfileHash:E6_OPERATIONS_HASH,
      contextHash:reflectionContextHash(job.context),decisionRef:job.decisionRef,messageFormat:job.messageFormat,
      locationBasis:'ORIGINAL_REFLECTION_BODY_UTF16',normalizationApplied:false,leaseUntilMs:job.capMs,
      current,code:job.invalid??null,observation,usableForAcceptance:false,realDataAllowed:false,gates:P0_GATES};
    const result=freeze({...data,viewHash:p0Hash('E6-REFLECTION-VIEW',data)});issued.set(result,job);return result;
  }
  return {
    async review({context,decisionRef=null,messageFormat,lease},adapter,{signal,timeoutMs=1000}={}){
      check(!closed,'E6_DISPOSED');validateReflectionContext(context);decisionHash(decisionRef);
      check([1,2].includes(messageFormat),'E6_FORMAT_UNSUPPORTED');
      check((adapter?.execution==='MOCK'||(adapter?.execution==='ACTUAL'&&isFixedNormalReflectionAdapter(adapter)))
        &&adapter.modelVersion===context.modelVersion&&typeof adapter.observe==='function','E6_MOCK_REQUIRED');
      check(lease&&['isCurrent','readBody','release'].every(k=>typeof lease[k]==='function'),'E6_BORROW_REQUIRED');
      check(Number.isInteger(timeoutMs)&&timeoutMs>=1&&timeoutMs<=30000,'E6_TIMEOUT');
      const runKey=context.runId+':'+context.attempt;check(used.size<1024&&!used.has(runKey),'E6_RUN_REUSE');
      invalidate(latest,'E6_CONTEXT_CHANGED');
      const job={context:structuredClone(context),decisionRef:structuredClone(decisionRef),messageFormat,lease,
        capMs:context.expiresAtMs,controller:new AbortController(),active:false,invalid:null,receipt:null};latest=job;used.add(runKey);
      const cancel=()=>invalidate(job,'E6_CANCELED');signal?.addEventListener('abort',cancel,{once:true});
      try{
        fresh(job);if(signal?.aborted)cancel();fresh(job);job.active=true;arm(job);
        job.core=createBootcampReflectionSession(()=>{fresh(job);return {context:job.context,rawAvailable:true};},{nowMs:clock});
        // The original-body owner getter is read once only after live lease checks.
        // No originalBody string is cached in a candidate/view/session entry.
        fresh(job);let text;
        let abortRead;const handle=job.lease;
        try{text=await Promise.race([Promise.resolve().then(()=>{fresh(job);return handle.readBody({signal:job.controller.signal});}),
          new Promise((_,reject)=>{abortRead=()=>reject(Error('E6_LEASE_CLOSED'));job.controller.signal.addEventListener('abort',abortRead,{once:true});})]);}
        catch{check(false,'E6_LEASE_CLOSED');}finally{job.controller.signal.removeEventListener('abort',abortRead);}fresh(job);
        const input={context:job.context,text};
        const observer=adapter.execution==='ACTUAL'?adapter:{...adapter,observe(request,options){fresh(job);return adapter.observe({...request,
          sourceFormat:{messageFormat,locationBasis:'ORIGINAL_REFLECTION_BODY_UTF16',normalizationApplied:false},
          operationsProfileHash:E6_OPERATIONS_HASH,decisionRef:job.decisionRef},options);}};
        job.receipt=await job.core.review(input,observer,{signal:job.controller.signal,timeoutMs:Math.min(timeoutMs,job.capMs-clock())});
      }catch(e){
        invalidate(job,e.message==='REFLECTION_ORIGINAL_INPUT'?'E6_INPUT_MISMATCH':codes.includes(e.message)?e.message:'E6_CONTEXT_CHANGED');
      }finally{signal?.removeEventListener('abort',cancel);release(job);}
      return view(job);
    },
    refresh(){return latest?checkCurrent(latest):!closed;},
    consume(result){const job=issued.get(result);check(job,'E6_VIEW_REQUIRED');return view(job);},
    cancel(){invalidate(latest,'E6_CANCELED');},
    invalidate(code='E6_SOURCE_CHANGED'){check(codes.includes(code),'E6_INVALIDATION_CODE');invalidate(latest,code);},
    dispose(){if(closed)return;closed=true;invalidate(latest,'E6_DISPOSED');},
  };
}
