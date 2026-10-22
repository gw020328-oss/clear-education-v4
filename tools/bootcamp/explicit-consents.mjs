// Server-owned read callbacks only. Does not publish, consent, sign, allocate or dispatch.
const check=(ok,code)=>{if(!ok)throw Error(code);};
export function explicitReviewTarget(v){
 check(v?.version==='clear-bootcamp-review-procedure.1'&&v.evidence.current&&v.evidence.conditionsStatus==='MET'
  &&v.funding.matchesCurrentDecision&&v.funding.status==='FULLY_ALLOCATED'&&v.consent.scopeHash
  &&v.procedure.publishedDecisionId===v.decisionId&&v.evidence.criteria.length===4&&v.evidence.criteria.every(r=>r.current&&r.state==='MET')
  &&v.funding.amountAtoms==='100000000'&&v.funding.reservedAtoms==='100000000'
  &&[v.asOf,v.procedure.firstStartedAt,v.procedure.reviewCapAt,v.evidence.validUntilExclusive].every(Number.isSafeInteger),'BC_NORMAL_REVIEW_REQUIRED');
 return Object.freeze({applicationId:v.applicationId,policyHash:v.policyHash,runtimeMappingHash:v.runtimeMappingHash,
  decisionId:v.decisionId,decisionRevision:v.decisionRevision,decisionHash:v.decisionHash,allocationId:v.funding.allocationId,
  consentScopeHash:v.consent.scopeHash,firstStartedAt:v.procedure.firstStartedAt,reviewCapAt:v.procedure.reviewCapAt,
  sourceValidUntilExclusive:v.evidence.validUntilExclusive});
}
export function assertExplicitConsents(v,target,{requireBoth=true}={}){
 const current=explicitReviewTarget(v);
 for(const k of Object.keys(target))check(current[k]===target[k],'BC_NORMAL_REVIEW_TARGET_CHANGED');
 check(!v.objection.blocked&&v.asOf<Math.min(target.reviewCapAt,target.sourceValidUntilExclusive),'BC_NORMAL_REVIEW_BLOCKED');
 check(!requireBoth||v.consent.bothCurrent===true,'BC_NORMAL_BOTH_CONSENTS_REQUIRED');return true;
}
export async function waitForExplicitConsents({target,read,heartbeat,signal,pollMs=250}){
 check(typeof read==='function'&&typeof heartbeat==='function'&&Number.isInteger(pollMs)&&pollMs>=1&&pollMs<=1000,'BC_NORMAL_CONSENT_HOST');
 check(!signal?.aborted,'BC_NORMAL_CONSENT_WAIT_STOPPED');const first=read();assertExplicitConsents(first,target,{requireBoth:false});
 // A wall timeout complements the existing source/review clocks; neither can renew this wait.
 const controller=new AbortController(),combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
 const limit=Math.min(target.reviewCapAt,target.sourceValidUntilExclusive)-first.asOf;
 const timer=setTimeout(()=>controller.abort(),Math.max(1,limit*1000));let nextHeartbeat=first.asOf;
 try{
  for(;;){
   check(!combined.aborted,'BC_NORMAL_CONSENT_WAIT_STOPPED');const v=read();assertExplicitConsents(v,target,{requireBoth:false});
   if(v.consent.bothCurrent){assertExplicitConsents(v,target);return;}
   if(v.asOf>=nextHeartbeat){heartbeat();nextHeartbeat=v.asOf+20;}
   await new Promise((resolve,reject)=>{
    const abort=()=>{clearTimeout(t);combined.removeEventListener('abort',abort);reject(Error('BC_NORMAL_CONSENT_WAIT_STOPPED'));};
    const t=setTimeout(()=>{combined.removeEventListener('abort',abort);resolve();},pollMs);
    combined.addEventListener('abort',abort,{once:true});if(combined.aborted)abort();
   });
  }
 }finally{clearTimeout(timer);}
}
