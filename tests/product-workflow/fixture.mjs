import { exampleBinding,compileExample } from '../../specs/m1/examples.mjs';
import { digest } from '../../src/policy/mvp/contract.mjs';
import { createDocumentManifest,submissionHash,WORKFLOW_VERSION } from '../../src/product-workflow/contract.mjs';
export const h=value=>digest('SYNTHETIC-WORKFLOW-FIXTURE',value);
export function fixture(){
  const compiled=compileExample('third'),binding=exampleBinding(compiled);
  const bytes=Buffer.from('89504e470d0a1a0a0000000d494844520000000100000001','hex'); // Signature-only fake, never a decoded picture.
  const submission={submissionId:'submission-a',revision:1,routeRevision:1,posts:[{postId:'post-a',title:'SYNTHETIC',text:'Example',tags:[],links:[],
    images:[{imageId:'image-a',byteLength:bytes.length,width:1,height:1}]}]};
  const files=[{postId:'post-a',imageId:'image-a',mediaType:'image/png',bytes}];
  const snapshot={version:WORKFLOW_VERSION,mode:'SYNTHETIC',binding,workflowRevision:1,agreementHash:h('synthetic-ack-only'),ruleId:'review-submitted',requirementId:'review',
    ruleHash:h('rule'),planVersion:'synthetic-plan.1',planHash:h('plan'),displayHash:h('display'),reviewManifestHash:h('review-manifest'),previewHash:h('preview'),
    sourceBundleHash:h('source-bundle'),sourceBundleRevision:1,submissionId:submission.submissionId,submissionRevision:1,routeRevision:1,inputHash:submissionHash(submission),
    manifest:createDocumentManifest(submission,files),method:'VISION',fieldIds:['image-type'],promptVersion:'clear-document-observe.1',modelVersion:'mock-observer.1'};
  return {compiled,submission,files,snapshot};
}
