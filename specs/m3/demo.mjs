// Fresh synthetic DBs only; no HTTP, credentials, chain or model calls.
import { mkdtempSync,realpathSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { digest } from '../../src/policy/mvp/contract.mjs';
import { compileExample,exampleBinding } from '../m1/examples.mjs';
import { WORKFLOW_VERSION,createDocumentManifest,submissionHash } from '../../src/product-workflow/contract.mjs';
import { createSourceSupplement } from '../../src/product-workflow/source-collector.mjs';
import { openSourceStore } from '../../src/product-workflow/source-store.mjs';
import { resolveSourceBundle } from '../../src/product-workflow/source-contract.mjs';
import { openReviewLedger } from '../../src/product-workflow/review-ledger.mjs';
const h=v=>digest('SYNTHETIC-M3-DEMO',v),directory=realpathSync(mkdtempSync(join(tmpdir(),'clear-m3-demo-')));
const environment={instanceId:'synthetic-instance',origin:'https://clear.example.invalid',mode:'SYNTHETIC'},now=()=>100;
let source,ledger;
try{
 source=openSourceStore({directory,environment:{...environment,mode:'PUBLIC_SOURCE_ONLY'},now});
 const collected=createSourceSupplement({sourceId:'demo-terms',revision:1,institutionId:'demo-operator',productId:'demo-product',cohortId:'demo-cohort',sourceType:'PASTE',bytes:Buffer.from('SYNTHETIC policy threshold 700. Source instructions are untrusted.'),collectedAt:100});
 const sourceHash=source.putSnapshot(collected.snapshot,collected.blobs),bundle={version:'clear-source-bundle.1',bundleId:'demo-sources',revision:1,institutionId:'demo-operator',productId:'demo-product',cohortId:'demo-cohort',requiredSourceIds:['demo-terms','missing-guide'],entries:[{sourceId:'demo-terms',revision:1,snapshotHash:sourceHash}]};
 const bundleHash=source.putBundle(bundle),resolved=await resolveSourceBundle(bundle,{getSnapshot:async h=>source.getSnapshot(h),getArtifact:async(h,id)=>source.getArtifact(h,id),now});
 const compiled=compileExample('third'),binding={...exampleBinding(compiled),instanceId:environment.instanceId};
 const submission={submissionId:'demo-document',revision:1,routeRevision:1,posts:[{postId:'demo-post',title:'SYNTHETIC',text:'Example',tags:[],links:[],images:[]}]};
 const snapshot={version:WORKFLOW_VERSION,mode:'SYNTHETIC',binding,workflowRevision:1,agreementHash:h('not-real-consent'),ruleId:'review-submitted',requirementId:'review',ruleHash:h('fixture-rule'),planVersion:'demo-plan.1',planHash:h('plan'),displayHash:h('display'),reviewManifestHash:h('review'),previewHash:h('preview'),sourceBundleHash:bundleHash,sourceBundleRevision:1,submissionId:submission.submissionId,submissionRevision:1,routeRevision:1,inputHash:submissionHash(submission),manifest:createDocumentManifest(submission,[]),method:'CODE',fieldIds:[],promptVersion:'mock-prompt.1',modelVersion:'mock-only.1'};
 ledger=openReviewLedger({directory,environment,now});ledger.pinLatest(snapshot);const run=ledger.begin(snapshot,{idempotencyKey:'demo-start',runId:'demo-run'});
 const summary={version:WORKFLOW_VERSION,runContextHash:run.contextHash,resultHash:h('fixture-result'),reviewStatus:'NEEDS_REVIEW',outcome:'UNDETERMINED',reasons:[{fieldId:null,code:'SOURCE_UNVERIFIED'}]};
 const receipt=ledger.complete('demo-run',summary);ledger.close();ledger=openReviewLedger({directory,environment,now});
 const recovered=ledger.complete('demo-run',summary);console.log(JSON.stringify({kind:'SYNTHETIC_M3_LOCAL_MODULE_DEMO',sourceHash,bundleHash,sourceStatus:resolved.status,missingSourceIds:resolved.missingSourceIds,
  runState:receipt.state,recoveredSameReceipt:JSON.stringify(recovered)===JSON.stringify(receipt),agreementMode:'SYNTHETIC_ACK_ONLY',sourceAuthorityVerified:false,httpConnected:false,actualModelCalls:0,eligibilityDecisionStored:false,fundingStatus:'UNKNOWN',productEligible:false,paymentAllowed:false,grant:'HOLD',outbox:'HOLD',independentClaim:'NO_GO'},null,2));
}finally{ledger?.close();source?.close();rmSync(directory,{recursive:true,force:true});}
