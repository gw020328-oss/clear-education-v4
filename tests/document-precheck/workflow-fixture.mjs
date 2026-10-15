import {fixture as oldFixture} from './fixture.mjs';
import {exampleBinding} from '../../specs/m1/examples.mjs';
import {digest} from '../../src/policy/mvp/contract.mjs';
import {prepareReviewPolicy,compileBoundReviewPolicy,createReviewPreview} from '../../src/document-precheck/bound-policy.mjs';
import {createDocumentManifest,createRunContext,submissionHash,WORKFLOW_VERSION} from '../../src/product-workflow/contract.mjs';
export const h=value=>digest('AI-WORKFLOW-SYNTHETIC',value);
export function workflowFixture(method='CODE'){
 const f=oldFixture(),draft=structuredClone(f.compiled.policy);
 const blocks=draft.sources.flatMap(source=>source.locators.map(locator=>({sourceId:source.sourceId,locator,text:'SYNTHETIC minimum four codepoints.'})));
 const observationPlans=['VISION','TEXT_AI'].map(method=>({ruleId:f.plan.ruleId,method,fieldIds:['image-type'],promptVersion:'clear-document-observe.1'}));
 const prepared=prepareReviewPolicy({draft,plans:[f.plan],sourceBlocks:blocks,observationPlans});
 const policy=compileBoundReviewPolicy(prepared,{approvedManifestHash:prepared.manifestHash,sourcePins:structuredClone(prepared.policy.sources),capabilityPins:structuredClone(draft.capabilities),sourceBlockPin:prepared.sourceBlocksDigest});
 const binding=exampleBinding(policy.compiled),plan=policy.planBindings[0],preview=createReviewPreview(policy,binding);
 const bytes=Buffer.from('89504e470d0a1a0a0000000d494844520000000100000001','hex');
 const submission=structuredClone(f.submission);submission.posts[0].images=[{imageId:'image-a',byteLength:bytes.length,width:1,height:1}];
 const files=[{postId:'post-a',imageId:'image-a',mediaType:'image/png',bytes}];
 const snapshot={version:WORKFLOW_VERSION,mode:'SYNTHETIC',binding,workflowRevision:1,agreementHash:h('synthetic-ack-not-real-consent'),
  ruleId:f.plan.ruleId,requirementId:f.plan.requirementId,ruleHash:policy.compiled.ruleHashes[f.plan.ruleId],planVersion:plan.planVersion,planHash:plan.planHash,displayHash:plan.displayHash,
  reviewManifestHash:policy.manifestHash,previewHash:preview.previewHash,sourceBundleHash:h('source'),sourceBundleRevision:1,
  submissionId:submission.submissionId,submissionRevision:submission.revision,routeRevision:submission.routeRevision,inputHash:submissionHash(submission),
  manifest:createDocumentManifest(submission,files),method,fieldIds:method==='CODE'?[]:['image-type'],promptVersion:'clear-document-observe.1',modelVersion:'mock-observer.1'};
 return {context:createRunContext(snapshot,'run-a',1),policy,submission,files,snapshot};
}
