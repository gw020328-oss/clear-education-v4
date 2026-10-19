// Trusted-host, memory-only correlation adapter. No authentication, network, AI, DB, HTTP or acceptance.
import {exactKeys,freeze,requireRule as check} from '../../policy/values.mjs';
import {requireMvpPolicy} from '../../policy/mvp/compiler.mjs';
import {validateContract,same} from '../../policy/mvp/contract.mjs';
import {identifier,revision,bytesDigest,verifyDocumentManifest,runContextHash} from '../../product-workflow/contract.mjs';
import {BRIDGE_GATES,PROJECTION_VERSION,PLAIN_NORMALIZER,HTML_NORMALIZER,bridgeHash,checkMs,createReviewQuery,reviewQueryHash,
 assertReviewQueryCurrent,validateReviewAcquisition,reviewAcquisitionHash,validateReviewProjection} from './contract.mjs';
import {normalizePlainReviewText,normalizeReviewBody,normalizedReviewContentHash} from './normalizer.mjs';
export function validateBridgeRegistry(registry,{compiled,context}){
 exactKeys(registry,['registryId','revision','status','binding','requirementId','sourceBinding','locator','readerId','postId','normalizer','freshness','audit'],'RB_REGISTRY');
 identifier(registry.registryId);revision(registry.revision);validateContract('SourceBinding',registry.sourceBinding);
 const p=requireMvpPolicy(compiled),s=context.snapshot;runContextHash(context);
 check(p.mode==='SYNTHETIC'&&p.requirements.find(r=>r.requirementId===s.requirementId)?.kind==='REVIEW','RB_GENERAL_REVIEW_ONLY');
 check(p.rules.find(r=>r.ruleId===s.ruleId)?.requirementId===s.requirementId&&s.ruleHash===compiled.ruleHashes[s.ruleId],'RB_POLICY');
 check(s.binding.policyHash===compiled.policyHash&&s.binding.policyVersion===p.policyVersion&&s.binding.productId===p.productId
  &&s.binding.cohortId===p.cohortId,'RB_POLICY');
 check(registry.status==='REVIEWED_SYNTHETIC_MAPPING'&&same(registry.binding,s.binding)&&registry.requirementId===s.requirementId
  &&registry.sourceBinding.institutionId===p.institutionId&&registry.sourceBinding.courseId===p.productId,'RB_MAPPING');
 exactKeys(registry.locator,['instanceRef','courseId','forumId','id','authorId'],'RB_LOCATOR');identifier(registry.locator.instanceRef);
 for(const v of [registry.readerId,...['courseId','forumId','id','authorId'].map(k=>registry.locator[k])])check(Number.isSafeInteger(v)&&v>0,'RB_LOCATOR');
 identifier(registry.postId);check([PLAIN_NORMALIZER,HTML_NORMALIZER].includes(registry.normalizer),'RB_NORMALIZER');
 exactKeys(registry.freshness,['basis','maxAgeMs'],'RB_FRESHNESS');
 check(registry.freshness.basis==='CONTRACT_FIXTURE_ONLY'&&Number.isSafeInteger(registry.freshness.maxAgeMs)
  &&registry.freshness.maxAgeMs>0&&registry.freshness.maxAgeMs<=300000,'RB_FRESHNESS');
 exactKeys(registry.audit,['actorRef','reason','recordedAtMs'],'RB_AUDIT');identifier(registry.audit.actorRef);identifier(registry.audit.reason);checkMs(registry.audit.recordedAtMs);
 return registry;
}
export function createReviewBridgeSession({compiled,context,submission,files,registry,sourceRunId,sourceGeneration,attempt,
 rawExpiresAtMs,authorizationExpiresAtMs,resolveCurrent,now=()=>Date.now()}){
 check(typeof resolveCurrent==='function','RB_CURRENT_REQUIRED');
 const capturedContext=structuredClone(context),capturedRegistry=structuredClone(registry);
 let capturedSubmission=structuredClone(submission),timer,closed=false;const control=new AbortController(),issuedAtMs=now();
 checkMs(issuedAtMs);checkMs(rawExpiresAtMs);checkMs(authorizationExpiresAtMs);
 validateBridgeRegistry(capturedRegistry,{compiled,context:capturedContext});
 check(capturedRegistry.audit.recordedAtMs<=issuedAtMs,'RB_CLOCK');
 verifyDocumentManifest(capturedContext.snapshot.manifest,capturedSubmission,files);
 const s=capturedContext.snapshot;
 check(capturedSubmission.submissionId===s.submissionId&&capturedSubmission.revision===s.submissionRevision&&capturedSubmission.routeRevision===s.routeRevision,'RB_SUBMISSION');
 check(capturedSubmission.posts.length===1&&capturedSubmission.posts[0].postId===capturedRegistry.postId&&files.length===0
  &&capturedSubmission.posts[0].images.length===0&&capturedSubmission.posts[0].tags.length===0&&capturedSubmission.posts[0].links.length===0,'RB_COVERAGE_UNSUPPORTED');
 const pin={instanceRef:capturedRegistry.locator.instanceRef,courseId:capturedRegistry.locator.courseId,forumId:capturedRegistry.locator.forumId,
  postId:capturedRegistry.locator.id,authorId:capturedRegistry.locator.authorId,readerId:capturedRegistry.readerId,
  sourceBinding:capturedRegistry.sourceBinding,contextHash:runContextHash(capturedContext)};
 const registryHash=bridgeHash('REGISTRY',capturedRegistry),expiresAtMs=Math.min(issuedAtMs+capturedRegistry.freshness.maxAgeMs,rawExpiresAtMs,authorizationExpiresAtMs);
 const query=createReviewQuery({context:capturedContext,pin,registryHash,sourceRunId,sourceGeneration,attempt,issuedAtMs,expiresAtMs});
 const close=()=>{if(!closed){closed=true;clearTimeout(timer);capturedSubmission=null;control.abort();}};
 function current(initial=false){
  check(!closed,'RB_CLOSED');try{
   const t=now(),v=resolveCurrent();check(!closed,'RB_CLOSED');checkMs(t);
   check(v?.rawAvailable===true&&v.authorizationValid===true,'RB_ACCESS');checkMs(v.rawExpiresAtMs);checkMs(v.authorizationExpiresAtMs);
   check(t>=issuedAtMs&&t<Math.min(expiresAtMs,v.rawExpiresAtMs,v.authorizationExpiresAtMs),'RB_QUERY_EXPIRED');
   check(runContextHash(v.context)===query.runContextHash&&bridgeHash('REGISTRY',v.registry)===registryHash,'RB_STALE_CONTEXT');
   if(!initial)assertReviewQueryCurrent(query,v.currentQueryHash,t);return t;
  }catch(error){close();throw error;}
 }
 current(true);timer=setTimeout(close,expiresAtMs-issuedAtMs);timer.unref();
 function projection({facts=null,acquisition=null}={}){
  try{
  const observedAtMs=current();let normalization=null;
  if(facts||acquisition){
   validateReviewAcquisition(acquisition,{facts,query});
   const normalized=normalizeReviewBody(facts.source.body,facts.source.messageFormat),title=normalizePlainReviewText(facts.source.subject),post=capturedSubmission.posts[0];
   check(normalized.version===capturedRegistry.normalizer,'RB_NORMALIZER');
   check(title===normalizePlainReviewText(post.title)&&normalized.text===normalizePlainReviewText(post.text),'RB_CONTENT_MISMATCH');
   normalization={version:normalized.version,rawBodyHash:normalized.rawBodyHash,
    normalizedContentHash:normalizedReviewContentHash({version:normalized.version,title,body:normalized.text}),coverage:'TITLE_BODY_ONLY'};
  }
  const post=capturedSubmission.posts[0],sources=[{sourceId:'c2-title',kind:'TEXT',text:post.title},{sourceId:'c2-body',kind:'TEXT',text:post.text}];
  const p={version:PROJECTION_VERSION,dataScope:'ISOLATED_SYNTHETIC_ACCOUNT',runContextHash:query.runContextHash,queryHash:reviewQueryHash(query),registryHash,
   sourceRunId,sourceGeneration,attempt,sourceStatus:facts?'OBSERVED_TARGET':'UNAVAILABLE',sourceReceiptHash:facts?reviewAcquisitionHash(acquisition):null,
   sourceRevision:facts?facts.sourceRevision:null,normalization,
   submissionRef:{submissionId:s.submissionId,submissionRevision:s.submissionRevision,routeRevision:s.routeRevision,inputHash:s.inputHash,assetsHash:capturedContext.assetsHash,postId:post.postId},
   submittedSources:sources.map((v,i)=>({sourceId:v.sourceId,postId:post.postId,part:i?'text':'title',kind:'TEXT',sha256:bytesDigest(Buffer.from(v.text,'utf8')),locationBasis:'ORIGINAL_SUBMISSION_UTF16'})),
   observedAtMs:facts?facts.observed.finishedAt:observedAtMs,expiresAtMs,...BRIDGE_GATES};
  validateReviewProjection(p,capturedContext);current();return freeze({projection:p,sources});
  }catch(error){close();throw error;}
 }
 return Object.freeze({query,signal:control.signal,correlate:projection,unavailable:()=>projection(),close});
}
