import {array,exactKeys,freeze,requireRule as check} from '../../policy/values.mjs';
import {bytesDigest,runContextHash,verifyDocumentManifest} from '../../product-workflow/contract.mjs';
import {BRIDGE_GATES,OBSERVATION_VERSION,bridgeHash,checkMs,validateReviewProjection,reviewProjectionHash,
  assertReviewProjectionCurrent,validateBoundReviewObservation} from '../../review-evidence/common/contract.mjs';
import {createReviewPrecheckSession} from './review.mjs';

// The host owns registry, acquisition, normalization and lease issuance. This
// consumer never authenticates a receipt, reparses Moodle HTML or opens a store.
export function validateLocalReviewSources({context,submission,files,projection,sources}){
  validateReviewProjection(projection,context);
  verifyDocumentManifest(context.snapshot.manifest,submission,files);
  array(sources,2,'LOCAL_REVIEW_SOURCES');
  check(sources.length===2&&new Set(sources.map(s=>s?.sourceId)).size===2,'LOCAL_REVIEW_SOURCES');
  const post=submission.posts.find(p=>p.postId===projection.submissionRef.postId);
  check(post,'LOCAL_REVIEW_POST');
  for(const ref of projection.submittedSources){
    const source=sources.find(s=>s.sourceId===ref.sourceId);
    exactKeys(source,['sourceId','kind','text'],'LOCAL_REVIEW_SOURCE');
    check(source.kind==='TEXT'&&typeof source.text==='string'&&source.text.isWellFormed()
      &&source.text===post[ref.part]&&bytesDigest(Buffer.from(source.text,'utf8'))===ref.sha256,'LOCAL_REVIEW_ORIGINAL_SOURCE');
  }
  return true;
}

// Transient diagnostic helper; do not persist its values/quotes. Existing C2
// TEXT_AI spans are checked against ORIGINAL submission text, never Moodle's
// normalized HTML. IMAGE_ASSET is a file reference, not a visual region claim.
export function groundLocalReviewObservations(input,observations){
  validateLocalReviewSources(input);
  const {context,submission,projection}=input;
  array(observations,32,'LOCAL_REVIEW_OBSERVATIONS');
  check(new Set(observations.map(o=>o?.fieldId)).size===observations.length,'LOCAL_REVIEW_OBSERVATIONS');
  return freeze(observations.map(o=>{
    exactKeys(o,['fieldId','value','locator','quote'],'LOCAL_REVIEW_OBSERVATION');
    check(context.snapshot.fieldIds.includes(o.fieldId),'LOCAL_REVIEW_FIELD');
    if(o.value===null){
      check(o.locator===null&&o.quote===null,'LOCAL_REVIEW_NO_EVIDENCE');
      return {fieldId:o.fieldId,candidateValue:null,evidence:null,locationStatus:'NO_LEGIBLE_EVIDENCE'};
    }
    check(typeof o.value==='string'&&o.value.length>0&&o.value.length<=240,'LOCAL_REVIEW_VALUE');
    if(context.snapshot.method==='TEXT_AI'){
      const ref=projection.submittedSources.find(r=>r.part==='text'),post=submission.posts.find(p=>p.postId===ref.postId);
      const prefix='post/'+post.postId+'/text/';
      check(typeof o.locator==='string'&&o.locator.startsWith(prefix),'LOCAL_REVIEW_LOCATION');
      const parts=o.locator.slice(prefix.length).split('/');
      check(parts.length===2&&parts.every(p=>/^(0|[1-9][0-9]*)$/.test(p)),'LOCAL_REVIEW_LOCATION');
      const [start,end]=parts.map(Number);
      check(Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start<end&&end<=post.text.length
        &&typeof o.quote==='string'&&o.quote.length>0&&post.text.slice(start,end)===o.quote,'LOCAL_REVIEW_QUOTE');
      return {fieldId:o.fieldId,candidateValue:o.value,locationStatus:'ORIGINAL_SUBMISSION_UTF16',
        evidence:{kind:'TEXT_SPAN',sourceId:ref.sourceId,postId:ref.postId,part:'text',sha256:ref.sha256,start,end,quote:o.quote}};
    }
    check(context.snapshot.method==='VISION'&&o.quote===null,'LOCAL_REVIEW_METHOD');
    const file=context.snapshot.manifest.files.find(f=>o.locator==='post/'+f.postId+'/image/'+f.imageId);
    check(file,'LOCAL_REVIEW_IMAGE');
    return {fieldId:o.fieldId,candidateValue:o.value,locationStatus:'ASSET_BOUND_CONTENT_UNVERIFIED',
      evidence:{kind:'IMAGE_ASSET',postId:file.postId,imageId:file.imageId,sha256:file.sha256,assetsHash:context.assetsHash}};
  }));
}

function reasonsFor(items){
  const reasons=[...new Map(items.map(r=>[r.fieldId+':'+r.code,r])).values()];
  if(reasons.length<=32)return reasons;
  return [{fieldId:null,code:'NEEDS_SUPPLEMENT'},...['CONFLICT','SOURCE_UNVERIFIED','IMAGE_NOT_DECODED']
    .filter(code=>reasons.some(r=>r.code===code)).map(code=>({fieldId:null,code}))];
}

// resolveCurrent() -> {context,projection}, trusted and synchronous. Every
// consume rechecks it; this is in-process freshness, NOT a DB CAS or auth lease.
export function createLocalReviewProjectionSession(resolveCurrent,{nowMs=()=>Date.now()}={}){
  check(typeof resolveCurrent==='function'&&typeof nowMs==='function','LOCAL_REVIEW_RESOLVER');
  const receipts=new WeakMap();let generation=0,clockFloor=0;
  const clock=()=>{const n=nowMs();checkMs(n);check(n>=clockFloor,'LOCAL_REVIEW_CLOCK');clockFloor=n;return n;};
  const latest=()=>{try{
    const {context,projection}=resolveCurrent();
    const value={context:structuredClone(context),projection:structuredClone(projection)};
    validateReviewProjection(value.projection,value.context);return value;
  }catch{check(false,'LOCAL_REVIEW_CURRENT_UNAVAILABLE');}};
  const fresh=(context,projection)=>{
    const current=latest();
    check(runContextHash(current.context)===runContextHash(context),'LOCAL_REVIEW_STALE_CONTEXT');
    return assertReviewProjectionCurrent(projection,{context,currentProjectionHash:reviewProjectionHash(current.projection),nowMs:clock()});
  };
  const engine=createReviewPrecheckSession(()=>({context:latest().context,sourceFacts:null}));
  const make=(context,projection,contentStatus,reasons,result)=>{
    const current=contentStatus!=='STALE';
    const r={version:OBSERVATION_VERSION,runContextHash:runContextHash(context),sourceProjectionHash:reviewProjectionHash(projection),
      sourceReceiptHash:projection.sourceReceiptHash,sourceStatus:projection.sourceStatus,contentStatus,
      outcome:!current?'UNDETERMINED':contentStatus==='CHECKED'?'PRECHECK_REQUIREMENTS_MET':contentStatus==='MISSING'?'NEEDS_SUPPLEMENT':'UNDETERMINED',
      observationResultHash:bridgeHash('BOUND-AI-RESULT',{runContextHash:runContextHash(context),sourceProjectionHash:reviewProjectionHash(projection),result}),
      current,reasons:reasonsFor(reasons),...BRIDGE_GATES};
    validateBoundReviewObservation(r,{context,projection});return freeze(r);
  };
  const stale=(context,projection)=>make(context,projection,'STALE',[{fieldId:null,code:'STALE_CONTEXT'}],{status:'STALE'});
  const isCurrent=receipt=>{
    const entry=receipts.get(receipt);
    if(!entry?.current||entry.generation!==generation)return false;
    try{fresh(entry.context,entry.projection);return true;}catch{entry.current=false;return false;}
  };
  return {
    async review(input,adapter,{signal,timeoutMs=1000}={}){
      const context=structuredClone(input.context),projection=structuredClone(input.projection),
        submission=structuredClone(input.submission),sources=structuredClone(input.sources);
      const captured={context,policy:input.policy,submission,files:input.files,projection,sources};
      validateLocalReviewSources(captured);fresh(context,projection);
      check(Number.isInteger(timeoutMs)&&timeoutMs>=1&&timeoutMs<=30000,'LOCAL_REVIEW_TIMEOUT');
      const ticket=++generation,remaining=projection.expiresAtMs-clock();check(remaining>0,'LOCAL_REVIEW_EXPIRED');
      const issue=receipt=>{receipts.set(receipt,{context,projection,generation:ticket,current:receipt.current});return receipt;};
      let observed=null;
      const wrapped=adapter&&{...adapter,async observe(request,options){
        fresh(context,projection);
        check(ticket===generation&&!options.signal?.aborted,'LOCAL_REVIEW_DISPATCH_REVOKED');
        const output=await adapter.observe(request,options);observed=structuredClone(output);return structuredClone(observed);
      }};
      try{
        let result;
        try{result=await engine.review(captured,wrapped,{signal,timeoutMs:Math.min(timeoutMs,remaining),nowMs:clock});}
        catch(error){
          if(!['LOCAL_REVIEW_CURRENT_UNAVAILABLE','LOCAL_REVIEW_CLOCK','REVIEW_STALE_INPUT'].includes(error.message))throw error;
          return issue(stale(context,projection));
        }
        try{fresh(context,projection);}catch{return issue(stale(context,projection));}
        if(ticket!==generation||!result.current)return issue(stale(context,projection));
        const accepted=observed?.observations&&!result.reasons.some(r=>['MODEL_FAILED','CANCELLED','TIMED_OUT'].includes(r.code));
        const grounding=accepted?groundLocalReviewObservations(captured,observed.observations):[];
        const reasons=result.reasons.map(r=>({...r,code:r.code==='STALE'?'STALE_CONTEXT':r.code}));
        if(projection.sourceStatus==='UNAVAILABLE')reasons.push({fieldId:null,code:'SOURCE_UNVERIFIED'});
        // A malformed/missing output never acquires invented detail. Raw values
        // participate only in this transient hash, not in the returned record.
        let receipt=make(context,projection,result.status,reasons,{result,grounding});
        try{fresh(context,projection);}catch{return issue(stale(context,projection));}
        if(ticket!==generation)return issue(stale(context,projection));
        if(signal?.aborted)receipt=make(context,projection,'NEEDS_REVIEW',[...reasons,{fieldId:null,code:'CANCELLED'}],{result,grounding,cancelled:true});
        return issue(receipt);
      }finally{observed=null;}
    },
    isCurrent,
    consume(receipt){
      const entry=receipts.get(receipt);check(entry,'LOCAL_REVIEW_RECEIPT_REQUIRED');
      if(isCurrent(receipt))return receipt;
      entry.current=false;const result=stale(entry.context,entry.projection);receipts.set(result,{...entry,current:false});return result;
    },
  };
}
