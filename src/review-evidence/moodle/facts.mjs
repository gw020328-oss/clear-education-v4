import {readForumTarget} from './forum-target.mjs';
import {digest,validateContract} from '../../policy/mvp/contract.mjs';
import {validateRunContext,runContextHash} from '../../product-workflow/contract.mjs';
const hash=v=>digest('CLEAR-MOODLE-REVIEW-FACTS.1',v);
const positive=x=>Number.isSafeInteger(x)&&x>0;
const freeze=x=>{if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;};
const check=(x,code)=>{if(!x)throw Error(code);};
// Caller-owned host pins, not authenticated by this module. No ledger/AI/eligibility.
export async function readReviewFacts({client,context,pin,getCurrentContext,getCurrentPin,signal,now=()=>Date.now()}){
 const c=structuredClone(context),p=structuredClone(pin);validateRunContext(c);const contextHash=runContextHash(c);
 check(typeof getCurrentContext==='function'&&typeof getCurrentPin==='function','REVIEW_CURRENT_REQUIRED');
 check(p&&[p.courseId,p.forumId,p.postId,p.authorId,p.readerId].every(positive)&&typeof p.instanceRef==='string'&&p.instanceRef.length>0&&p.instanceRef.length<=128,'REVIEW_PIN');
 validateContract('SourceBinding',p.sourceBinding);
 check(p.contextHash===contextHash,'REVIEW_ACCOUNT_MAPPING');
 const startedAt=now();check(Number.isSafeInteger(startedAt)&&startedAt>=0,'REVIEW_CLOCK');
 const call=(m,a)=>client.call(m,a,signal);
 const identity=await call('core_webservice_get_site_info',{});check(identity?.userid===p.readerId,'REVIEW_READER_MISMATCH');
 const source=await readForumTarget(call,p);
 const finishedAt=now();check(Number.isSafeInteger(finishedAt)&&finishedAt>=startedAt&&finishedAt-startedAt<=30000,'REVIEW_CLOCK');
 check(!signal?.aborted,'REVIEW_CANCELLED');
 check(runContextHash(await getCurrentContext())===contextHash,'REVIEW_STALE_RUN');
 check(hash(await getCurrentPin())===hash(p),'REVIEW_STALE_MAPPING');
 check(!signal?.aborted,'REVIEW_CANCELLED');
 return freeze({version:'clear-local-moodle-review.1',provenance:'LOCAL_LMS_RECORD',purpose:'READ_ONLY_SOURCE_FACTS',
  context:c,runContextHash:contextHash,sourceRevision:hash(source),observed:{startedAt,finishedAt},source,
  sourceBinding:p.sourceBinding,accountMappingVerification:'HOST_PIN_ONLY',
  submissionContentBinding:'NOT_ESTABLISHED',usableForAcceptance:false,visibility:'VISIBLE_TO_AUTHENTICATED_READER',completeness:'TARGET_ONLY_NON_ATOMIC',identityVerified:false,
  academyAcceptance:'UNKNOWN',contentTruth:'UNKNOWN',automaticEligibility:false,paymentAllowed:false,independentClaim:'NO_GO'});
}
