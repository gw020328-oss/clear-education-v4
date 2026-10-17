// Public synthetic consumption vector. No source/AI implementation or credentials.
import {reviewSourceFixture} from './review-source-binding-fixture.mjs';
import {bytesDigest} from '../../src/product-workflow/contract.mjs';
import {BRIDGE_GATES,PROJECTION_VERSION,HTML_NORMALIZER,bridgeHash,createReviewQuery,reviewQueryHash,
 createReviewAcquisition,reviewAcquisitionHash,moodleSourceRevision,validateReviewProjection} from '../../src/review-evidence/common/contract.mjs';
export function reviewBridgeExample(){
 const f=reviewSourceFixture(),{context,submission,files,registry}=f.input,time=f.input.facts.observed.startedAt;
 registry.normalizer=HTML_NORMALIZER;
 const pin={instanceRef:registry.locator.instanceRef,courseId:registry.locator.courseId,forumId:registry.locator.forumId,
  postId:registry.locator.id,authorId:registry.locator.authorId,readerId:registry.readerId,sourceBinding:registry.sourceBinding,contextHash:f.input.facts.runContextHash};
 const query=createReviewQuery({context,registryHash:bridgeHash('REGISTRY',registry),pin,sourceRunId:'bridge-source-read',sourceGeneration:1,
  attempt:1,issuedAtMs:time,expiresAtMs:time+60000});
 const facts=structuredClone(f.input.facts);facts.source.messageFormat=1;
 facts.source.body='<p>'+submission.posts[0].text.replace('\n','<br>')+'</p>';facts.sourceRevision=moodleSourceRevision(facts.source);
 const acquisition=createReviewAcquisition({facts,query,observedReaderId:pin.readerId}),post=submission.posts[0];
 const sources=[{sourceId:'c2-title',kind:'TEXT',text:post.title},{sourceId:'c2-body',kind:'TEXT',text:post.text}];
 const projection={version:PROJECTION_VERSION,dataScope:'ISOLATED_SYNTHETIC_ACCOUNT',runContextHash:query.runContextHash,
  queryHash:reviewQueryHash(query),registryHash:query.registryHash,sourceRunId:query.sourceRunId,sourceGeneration:query.sourceGeneration,attempt:query.attempt,
  sourceStatus:'OBSERVED_TARGET',sourceReceiptHash:reviewAcquisitionHash(acquisition),sourceRevision:facts.sourceRevision,
  normalization:{version:HTML_NORMALIZER,rawBodyHash:bytesDigest(Buffer.from(facts.source.body)),
   normalizedContentHash:bridgeHash('NORMALIZED-CONTENT',{version:HTML_NORMALIZER,title:post.title,body:post.text}),coverage:'TITLE_BODY_ONLY'},
  submissionRef:{submissionId:context.snapshot.submissionId,submissionRevision:context.snapshot.submissionRevision,routeRevision:context.snapshot.routeRevision,
   inputHash:context.snapshot.inputHash,assetsHash:context.assetsHash,postId:post.postId},
  submittedSources:sources.map((v,i)=>({sourceId:v.sourceId,postId:post.postId,part:i?'text':'title',kind:'TEXT',sha256:bytesDigest(Buffer.from(v.text)),locationBasis:'ORIGINAL_SUBMISSION_UTF16'})),
  observedAtMs:facts.observed.finishedAt,expiresAtMs:query.expiresAtMs,...BRIDGE_GATES};
 validateReviewProjection(projection,context);
 const unavailable={...structuredClone(projection),sourceStatus:'UNAVAILABLE',sourceReceiptHash:null,sourceRevision:null,normalization:null};
 validateReviewProjection(unavailable,context);
 return {context,submission,files,registry,query,facts,acquisition,projection,unavailable,sources,nowMs:time+1000};
}
