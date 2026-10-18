import {fixture as base} from '../document-precheck/fixture.mjs';
import {exampleBinding} from '../../specs/m1/examples.mjs';
import {prepareReviewPolicy,compileBoundReviewPolicy,createReviewPreview} from '../../src/document-precheck/bound-policy.mjs';
import {createDocumentManifest,createRunContext,submissionHash,runContextHash,WORKFLOW_VERSION} from '../../src/product-workflow/contract.mjs';
import {digest} from '../../src/policy/mvp/contract.mjs';
export const h = v=>digest('REVIEW-SYNTHETIC-EVALUATION',v);

// All thresholds and field names below are synthetic evaluation assumptions.
// No academy-specific photo/character/date requirement is asserted.
export function fixture({method='TEXT_AI',text='합성반 수업 후기입니다.',open=false,images=false,kind='REVIEW'}={}) {
  const f=base('third',kind), draft=structuredClone(f.compiled.policy);
  const plan=structuredClone(f.plan);
  plan.checks.push({...structuredClone(plan.checks[0]),checkId:'bytes',kind:'BYTE_COUNT',
    basis:open?'OPEN':'SYNTHETIC_ASSUMPTION',options:{minimum:10,encoding:open?null:'UTF8',space:'INCLUDE',normalization:'NONE'}});
  const sourceBlocks=draft.sources.flatMap(s=>s.locators.map(locator=>({sourceId:s.sourceId,locator,
    text:'SYNTHETIC ONLY: minimum four codepoints and ten UTF-8 bytes; observe literal course label. No sentiment rule.'})));
  const observationPlans=['TEXT_AI','VISION'].map(method=>({ruleId:plan.ruleId,method,fieldIds:['course-label'],promptVersion:'clear-document-observe.1'}));
  const prepared=prepareReviewPolicy({draft,plans:[plan],sourceBlocks,observationPlans});
  const policy=compileBoundReviewPolicy(prepared,{approvedManifestHash:prepared.manifestHash,sourcePins:structuredClone(prepared.policy.sources),
    capabilityPins:structuredClone(draft.capabilities),sourceBlockPin:prepared.sourceBlocksDigest});
  const binding=exampleBinding(policy.compiled),p=policy.planBindings[0],preview=createReviewPreview(policy,binding);
  const submission=structuredClone(f.submission); submission.posts[0].text=text;
  // Deliberately signature-only header; NOT a decoded image or a Vision corpus.
  const bytes=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000100','hex');
  submission.posts[0].images=images?[{imageId:'image-a',byteLength:bytes.length,width:1,height:1}]:[];
  const files=images?[{postId:'post-a',imageId:'image-a',mediaType:'image/png',bytes}]:[];
  const snapshot={version:WORKFLOW_VERSION,mode:'SYNTHETIC',binding,workflowRevision:1,agreementHash:h('not-real-consent'),
    ruleId:plan.ruleId,requirementId:plan.requirementId,ruleHash:policy.compiled.ruleHashes[plan.ruleId],planVersion:p.planVersion,planHash:p.planHash,
    displayHash:p.displayHash,reviewManifestHash:policy.manifestHash,previewHash:preview.previewHash,sourceBundleHash:h('source'),sourceBundleRevision:1,
    submissionId:submission.submissionId,submissionRevision:1,routeRevision:1,inputHash:submissionHash(submission),manifest:createDocumentManifest(submission,files),
    method,fieldIds:method==='CODE'?[]:['course-label'],promptVersion:'clear-document-observe.1',modelVersion:'mock-review.1'};
  const input={context:createRunContext(snapshot,'run-a',1),policy,submission,files,sourceFacts:null};
  return input;
}
export function rebind(input,changes={},runId='run-b') {
  const snapshot={...structuredClone(input.context.snapshot),...changes,inputHash:submissionHash(input.submission),
    submissionRevision:input.submission.revision,routeRevision:input.submission.routeRevision,manifest:createDocumentManifest(input.submission,input.files)};
  input.context=createRunContext(snapshot,runId,2); return input;
}
export function facts(input,value='합성반',state='AVAILABLE') {
  return {version:'clear-review-source-fixture.1',execution:'FIXTURE',runContextHash:runContextHash(input.context),
    sourceBundleHash:input.context.snapshot.sourceBundleHash,sourceBundleRevision:input.context.snapshot.sourceBundleRevision,
    sourceRunId:'source-run-a',fields:[{fieldId:'course-label',state,value:state==='AVAILABLE'?value:null}]};
}
export function mock(input,{value='합성반',status='CHECKED',flags=[],questions=[],extra={}}={}) {
  let calls=0;
  return {execution:'MOCK',modelVersion:'mock-review.1',get calls(){return calls;},
    async observe(request){calls++; const vision=request.method==='VISION';
      return {reviewStatus:status,observations:[{fieldId:'course-label',value,
        locator:value===null?null:vision?'post/post-a/image/image-a':'post/post-a/text/0/3',quote:value===null||vision?null:input.submission.posts[0].text.slice(0,3)}],
        questions,flags,...extra};
    }};
}
