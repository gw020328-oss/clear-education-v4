import {fixture,h,rebind} from './fixture.mjs';
import {reviewBridgeExample} from '../../specs/m3/review-bridge-example.mjs';
import {bytesDigest,runContextHash} from '../../src/product-workflow/contract.mjs';
import {BRIDGE_GATES,PROJECTION_VERSION,HTML_NORMALIZER,bridgeHash,createReviewQuery,reviewQueryHash,validateReviewProjection} from '../../src/review-evidence/common/contract.mjs';

// Mock host projection only. No registry/normalizer/API implementation or claim
// that these synthetic receipt/hash pins were issued by a real Moodle read.
export function localFixture(options={}){
  const base=fixture(options);
  if(options.revision){base.submission.revision=options.revision;rebind(base,{},options.runId??'run-new');}
  const vector=reviewBridgeExample(),clock={value:vector.nowMs},post=base.submission.posts[0];
  const pin=structuredClone(vector.query.pin);pin.contextHash=runContextHash(base.context);
  pin.sourceBinding={...pin.sourceBinding,institutionId:base.policy.compiled.policy.institutionId,courseId:base.policy.compiled.policy.productId};
  const query=createReviewQuery({context:base.context,registryHash:bridgeHash('MOCK-REGISTRY',{binding:base.context.snapshot.binding,pin}),
    pin,sourceRunId:'local-source-run',sourceGeneration:1,attempt:1,issuedAtMs:clock.value-1000,expiresAtMs:clock.value+59000});
  const sources=[{sourceId:'c2-title',kind:'TEXT',text:post.title},{sourceId:'c2-body',kind:'TEXT',text:post.text}];
  const projection={version:PROJECTION_VERSION,dataScope:'ISOLATED_SYNTHETIC_ACCOUNT',runContextHash:runContextHash(base.context),
    queryHash:reviewQueryHash(query),registryHash:query.registryHash,sourceRunId:query.sourceRunId,sourceGeneration:query.sourceGeneration,attempt:query.attempt,
    sourceStatus:'OBSERVED_TARGET',sourceReceiptHash:h('mock-local-receipt'),sourceRevision:h('mock-local-source-revision'),
    normalization:{version:HTML_NORMALIZER,rawBodyHash:h('mock-source-html'),normalizedContentHash:h('mock-normalized-content'),coverage:'TITLE_BODY_ONLY'},
    submissionRef:{submissionId:base.submission.submissionId,submissionRevision:base.submission.revision,routeRevision:base.submission.routeRevision,
      inputHash:base.context.snapshot.inputHash,assetsHash:base.context.assetsHash,postId:post.postId},
    submittedSources:sources.map((s,i)=>({sourceId:s.sourceId,postId:post.postId,part:i?'text':'title',kind:'TEXT',
      sha256:bytesDigest(Buffer.from(s.text,'utf8')),locationBasis:'ORIGINAL_SUBMISSION_UTF16'})),
    observedAtMs:clock.value-500,expiresAtMs:query.expiresAtMs,...BRIDGE_GATES};
  if(options.unavailable)Object.assign(projection,{sourceStatus:'UNAVAILABLE',sourceReceiptHash:null,sourceRevision:null,normalization:null});
  validateReviewProjection(projection,base.context);
  return {...base,projection,sources,query,clock};
}
