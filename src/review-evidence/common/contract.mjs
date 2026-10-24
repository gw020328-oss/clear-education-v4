// Frozen internal bridge DTOs. Integrity/correlation only, never source authentication or acceptance.
import {exactKeys,freeze,requireRule as check} from '../../policy/values.mjs';
import {digest,same,validateContract} from '../../policy/mvp/contract.mjs';
import {identifier,revision,hash32,runContextHash,REASON_CODES} from '../../product-workflow/contract.mjs';
export const BRIDGE_VERSION='clear-review-bridge.1';
export const QUERY_VERSION='clear-review-query.1';
export const ACQUISITION_VERSION='clear-review-acquisition.1';
export const PROJECTION_VERSION='clear-review-source-projection.1';
export const OBSERVATION_VERSION='clear-review-bound-observation.1';
export const PLAIN_NORMALIZER='clear-review-plain-nfc-lf.1';
export const HTML_NORMALIZER='clear-review-html-subset.1';
export const BRIDGE_GATES=freeze({realDataAllowed:false,usableForAcceptance:false,identityVerified:false,academyAcceptance:'UNKNOWN',
 automaticEligibility:false,productEligible:false,paymentAllowed:false,grant:'HOLD',outbox:'HOLD',independentClaim:'NO_GO'});
export const bridgeHash=(kind,value)=>digest('CLEAR-REVIEW-BRIDGE-'+kind+'.1',value);
export const checkMs=value=>check(Number.isSafeInteger(value)&&value>=0&&value<=4102444800000,'RB_CLOCK');
const positive=v=>check(Number.isSafeInteger(v)&&v>0,'RB_LOCATOR');
const checkGates=v=>check(Object.entries(BRIDGE_GATES).every(([key,value])=>v[key]===value),'RB_GATES');
export function validateReaderPin(pin,context){
 exactKeys(pin,['instanceRef','courseId','forumId','postId','authorId','readerId','sourceBinding','contextHash'],'RB_PIN');
 identifier(pin.instanceRef);for(const k of ['courseId','forumId','postId','authorId','readerId'])positive(pin[k]);
 validateContract('SourceBinding',pin.sourceBinding);check(pin.contextHash===runContextHash(context),'RB_RUN');return pin;
}
export function validateReviewQuery(q){
 exactKeys(q,['version','runContextHash','registryHash','pin','sourceRunId','sourceGeneration','attempt','issuedAtMs','expiresAtMs'],'RB_QUERY');
 check(q.version===QUERY_VERSION,'RB_VERSION');hash32(q.runContextHash);hash32(q.registryHash);
 identifier(q.sourceRunId);revision(q.sourceGeneration);revision(q.attempt);checkMs(q.issuedAtMs);checkMs(q.expiresAtMs);
 check(q.expiresAtMs>q.issuedAtMs&&q.expiresAtMs-q.issuedAtMs<=300000,'RB_QUERY_LEASE');
 exactKeys(q.pin,['instanceRef','courseId','forumId','postId','authorId','readerId','sourceBinding','contextHash'],'RB_PIN');
 identifier(q.pin.instanceRef);for(const k of ['courseId','forumId','postId','authorId','readerId'])positive(q.pin[k]);validateContract('SourceBinding',q.pin.sourceBinding);
 check(q.pin.contextHash===q.runContextHash,'RB_RUN');return q;
}
export const reviewQueryHash=q=>{validateReviewQuery(q);return bridgeHash('QUERY',q);};
export function createReviewQuery({context,registryHash,pin,sourceRunId,sourceGeneration,attempt,issuedAtMs,expiresAtMs}){
 validateReaderPin(pin,context);
 const q={version:QUERY_VERSION,runContextHash:runContextHash(context),registryHash,pin:structuredClone(pin),
  sourceRunId,sourceGeneration,attempt,issuedAtMs,expiresAtMs};validateReviewQuery(q);return freeze(q);
}
export function assertReviewQueryCurrent(q,currentHash,nowMs){
 hash32(currentHash);checkMs(nowMs);check(reviewQueryHash(q)===currentHash,'RB_STALE_QUERY');
 check(nowMs>=q.issuedAtMs&&nowMs<q.expiresAtMs,'RB_QUERY_EXPIRED');return q;
}
export const acquiredFactsHash=facts=>bridgeHash('FACTS',facts);
export const moodleSourceRevision=source=>digest('CLEAR-MOODLE-REVIEW-FACTS.1',source);
export function validateAcquiredFacts(facts,q){
 validateReviewQuery(q);
 exactKeys(facts,['version','provenance','purpose','context','runContextHash','sourceRevision','observed','source','sourceBinding','accountMappingVerification',
  'submissionContentBinding','usableForAcceptance','visibility','completeness','identityVerified','academyAcceptance','contentTruth','automaticEligibility','paymentAllowed','independentClaim'],'RB_FACTS');
 validateReaderPin(q.pin,facts.context);
 check(facts.version==='clear-local-moodle-review.1'&&facts.provenance==='LOCAL_LMS_RECORD'&&facts.purpose==='READ_ONLY_SOURCE_FACTS'
  &&facts.usableForAcceptance===false&&facts.submissionContentBinding==='NOT_ESTABLISHED'&&facts.identityVerified===false
  &&facts.academyAcceptance==='UNKNOWN'&&facts.contentTruth==='UNKNOWN'&&facts.automaticEligibility===false&&facts.paymentAllowed===false
  &&facts.independentClaim==='NO_GO'&&facts.runContextHash===q.runContextHash&&runContextHash(facts.context)===q.runContextHash,'RB_FACTS');
 const p=q.pin,s=facts.source;
 exactKeys(s,['instanceRef','courseId','forumId','id','discussionId','authorId','subject','body','messageFormat','createdAt','modifiedAt','visible','deleted','privateReply'],'RB_FACTS');
 check(s&&s.instanceRef===p.instanceRef&&s.courseId===p.courseId&&s.forumId===p.forumId&&s.id===p.postId&&s.authorId===p.authorId
  &&same(facts.sourceBinding,p.sourceBinding)&&facts.accountMappingVerification==='HOST_PIN_ONLY','RB_SOURCE_PIN');
 check(s.visible===true&&s.deleted===false&&s.privateReply===false&&facts.visibility==='VISIBLE_TO_AUTHENTICATED_READER'
  &&facts.completeness==='TARGET_ONLY_NON_ATOMIC','RB_VISIBILITY');
 positive(s.discussionId);positive(s.createdAt);positive(s.modifiedAt);check(s.modifiedAt>=s.createdAt,'RB_SOURCE_TIME');
 check([0,1,2,4].includes(s.messageFormat)&&typeof s.subject==='string'&&typeof s.body==='string'
  &&s.subject.isWellFormed()&&s.body.isWellFormed()&&!s.subject.includes('\0')&&!s.body.includes('\0')
  &&s.subject.length<=240&&Buffer.byteLength(s.body)<=131072,'RB_SOURCE_TEXT');
 check(facts.sourceRevision===moodleSourceRevision(s),'RB_SOURCE_HASH');
 exactKeys(facts.observed,['startedAt','finishedAt'],'RB_CLOCK');const {startedAt,finishedAt}=facts.observed;
 checkMs(startedAt);checkMs(finishedAt);
 check(startedAt>=q.issuedAtMs&&finishedAt>=startedAt&&finishedAt-startedAt<=30000&&finishedAt<q.expiresAtMs
  &&s.modifiedAt*1000<=finishedAt,'RB_CLOCK');return facts;
}
export function createReviewAcquisition({facts,query,observedReaderId}){
 validateAcquiredFacts(facts,query);check(observedReaderId===query.pin.readerId,'RB_READER');
 const a={version:ACQUISITION_VERSION,provenance:'LOCAL_LMS_RECORD',dataScope:'ISOLATED_SYNTHETIC_ACCOUNT',queryHash:reviewQueryHash(query),
  runContextHash:query.runContextHash,registryHash:query.registryHash,pinHash:bridgeHash('PIN',query.pin),
  expectedReaderId:query.pin.readerId,observedReaderId,sourceRunId:query.sourceRunId,sourceGeneration:query.sourceGeneration,attempt:query.attempt,
  factsHash:acquiredFactsHash(facts),sourceRevision:facts.sourceRevision,observed:structuredClone(facts.observed),expiresAtMs:query.expiresAtMs,
  consistency:'TWO_READS_NON_ATOMIC',visibility:'AUTHENTICATED_READER_ONLY',...BRIDGE_GATES};return freeze(a);
}
export const reviewAcquisitionHash=a=>bridgeHash('ACQUISITION',a);
export function validateReviewAcquisition(a,{facts,query}){
 exactKeys(a,['version','provenance','dataScope','queryHash','runContextHash','registryHash','pinHash','expectedReaderId','observedReaderId',
  'sourceRunId','sourceGeneration','attempt','factsHash','sourceRevision','observed','expiresAtMs','consistency','visibility',...Object.keys(BRIDGE_GATES)],'RB_ACQUISITION');
 checkGates(a);check(same(a,createReviewAcquisition({facts,query,observedReaderId:a.observedReaderId})),'RB_ACQUISITION');return a;
}
export function validateReviewProjection(p,context){
 exactKeys(p,['version','dataScope','runContextHash','queryHash','registryHash','sourceRunId','sourceGeneration','attempt','sourceStatus',
  'sourceReceiptHash','sourceRevision','normalization','submissionRef','submittedSources','observedAtMs','expiresAtMs',...Object.keys(BRIDGE_GATES)],'RB_PROJECTION');
 checkGates(p);check(p.version===PROJECTION_VERSION&&p.dataScope==='ISOLATED_SYNTHETIC_ACCOUNT'&&p.runContextHash===runContextHash(context),'RB_RUN');
 for(const k of ['queryHash','registryHash'])hash32(p[k]);identifier(p.sourceRunId);revision(p.sourceGeneration);revision(p.attempt);
 checkMs(p.observedAtMs);checkMs(p.expiresAtMs);check(p.expiresAtMs>p.observedAtMs,'RB_QUERY_LEASE');
 const s=context.snapshot,r=p.submissionRef;
 exactKeys(r,['submissionId','submissionRevision','routeRevision','inputHash','assetsHash','postId'],'RB_SUBMISSION');
 check(r.submissionId===s.submissionId&&r.submissionRevision===s.submissionRevision&&r.routeRevision===s.routeRevision
  &&r.inputHash===s.inputHash&&r.assetsHash===context.assetsHash,'RB_SUBMISSION');identifier(r.postId);
 check(Array.isArray(p.submittedSources)&&p.submittedSources.length===2&&new Set(p.submittedSources.map(s=>s.sourceId)).size===2
  &&new Set(p.submittedSources.map(s=>s.part)).size===2,'RB_INPUT_SOURCES');
 for(const v of p.submittedSources){exactKeys(v,['sourceId','postId','part','kind','sha256','locationBasis'],'RB_INPUT_SOURCES');identifier(v.sourceId);hash32(v.sha256);
  check(v.postId===r.postId&&['title','text'].includes(v.part)&&v.kind==='TEXT'&&v.locationBasis==='ORIGINAL_SUBMISSION_UTF16','RB_INPUT_SOURCES');}
 check(['OBSERVED_TARGET','UNAVAILABLE'].includes(p.sourceStatus),'RB_SOURCE_STATUS');
 if(p.sourceStatus==='OBSERVED_TARGET'){
  hash32(p.sourceReceiptHash);hash32(p.sourceRevision);const n=p.normalization;
  exactKeys(n,['version','rawBodyHash','normalizedContentHash','coverage'],'RB_NORMALIZER');
  check([PLAIN_NORMALIZER,HTML_NORMALIZER].includes(n.version)&&n.coverage==='TITLE_BODY_ONLY','RB_NORMALIZER');hash32(n.rawBodyHash);hash32(n.normalizedContentHash);
 }else check(p.sourceReceiptHash===null&&p.sourceRevision===null&&p.normalization===null,'RB_SOURCE_STATUS');
 return p;
}
export const reviewProjectionHash=p=>bridgeHash('PROJECTION',p);
export function assertReviewProjectionCurrent(p,{context,currentProjectionHash,nowMs}){
 validateReviewProjection(p,context);hash32(currentProjectionHash);check(reviewProjectionHash(p)===currentProjectionHash,'RB_STALE_PROJECTION');
 checkMs(nowMs);check(nowMs>=p.observedAtMs&&nowMs<p.expiresAtMs,'RB_PROJECTION_EXPIRED');return p;
}
export function validateBoundReviewObservation(r,{context,projection}){
 validateReviewProjection(projection,context);
 exactKeys(r,['version','runContextHash','sourceProjectionHash','sourceReceiptHash','sourceStatus','contentStatus','outcome','observationResultHash',
  'current','reasons',...Object.keys(BRIDGE_GATES)],'RB_OBSERVATION');checkGates(r);
 check(r.version===OBSERVATION_VERSION&&r.runContextHash===runContextHash(context)&&r.sourceProjectionHash===reviewProjectionHash(projection)
  &&r.sourceReceiptHash===projection.sourceReceiptHash&&r.sourceStatus===projection.sourceStatus,'RB_OBSERVATION_PIN');hash32(r.observationResultHash);
 check(['CHECKED','MISSING','NEEDS_REVIEW','UNREADABLE','POLICY_OPEN','STALE'].includes(r.contentStatus)&&typeof r.current==='boolean'
  &&r.current===(r.contentStatus!=='STALE'),'RB_CONTENT_STATUS');
 check(r.outcome===(!r.current?'UNDETERMINED':r.contentStatus==='CHECKED'?'PRECHECK_REQUIREMENTS_MET':r.contentStatus==='MISSING'?'NEEDS_SUPPLEMENT':'UNDETERMINED'),'RB_CONTENT_STATUS');
 check(Array.isArray(r.reasons)&&r.reasons.length<=32,'RB_REASONS');
 for(const reason of r.reasons){exactKeys(reason,['fieldId','code'],'RB_REASONS');if(reason.fieldId!==null)identifier(reason.fieldId);check(REASON_CODES.includes(reason.code),'RB_REASONS');}
 return r;
}
