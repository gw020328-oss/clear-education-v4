// Public invented records only. Does not import unmerged PR71/72 or their labs.
import {compileExample,exampleBinding} from '../m1/examples.mjs';
import {digest} from '../../src/policy/mvp/contract.mjs';
import {createRunContext,createDocumentManifest,submissionHash,WORKFLOW_VERSION} from '../../src/product-workflow/contract.mjs';
import {NORMALIZER,acquisitionPinHash,proposeReviewCorrelation} from './review-source-binding.mjs';
const h=value=>digest('SYNTHETIC-REVIEW-CONTRACT',value);
export function reviewSourceFixture(profile='ybm'){
 const compiled=compileExample(profile),binding=exampleBinding(compiled),time=1792112400000;
 const submission={submissionId:'review-submission',revision:1,routeRevision:1,
  posts:[{postId:'review-post',title:'SYNTHETIC 후기',text:'배운 내용을 복습했습니다.\n다음 수업도 확인했습니다.',tags:[],links:[],images:[]}]};
 const files=[],manifest=createDocumentManifest(submission,files);
 const snapshot={version:WORKFLOW_VERSION,mode:'SYNTHETIC',binding,workflowRevision:4,agreementHash:h('ack'),
  requirementId:'review',ruleId:'review-accepted',ruleHash:compiled.ruleHashes['review-accepted'],planVersion:'synthetic-review-plan.1',
  planHash:h('plan'),displayHash:h('display'),reviewManifestHash:h('manifest'),previewHash:h('preview'),
  sourceBundleHash:compiled.sourceSetHash,sourceBundleRevision:1,submissionId:submission.submissionId,submissionRevision:1,routeRevision:1,
  inputHash:submissionHash(submission),manifest,method:'TEXT_AI',fieldIds:['content'],promptVersion:'clear-document-observe.1',modelVersion:'mock-observer.1'};
 const context=createRunContext(snapshot,'review-run',1);
 const registry={registryId:'synthetic-review-map',revision:1,status:'REVIEWED_SYNTHETIC_MAPPING',binding,requirementId:'review',
  sourceBinding:{institutionId:compiled.policy.institutionId,providerInstanceId:'synthetic-moodle',courseId:compiled.policy.productId,
   sourceAccountRef:'synthetic-author',accountBindingId:'synthetic-account-map',accountBindingVersion:'mapping.1'},
  locator:{instanceRef:'synthetic-moodle',courseId:2,forumId:3,id:4,authorId:5},readerId:6,postId:'review-post',normalizer:NORMALIZER,
  freshness:{basis:'CONTRACT_FIXTURE_ONLY',maxAgeMs:60000},audit:{actorRef:'synthetic-host',reason:'synthetic-map-review',recordedAtMs:time-1000}};
 const source={...registry.locator,discussionId:7,subject:submission.posts[0].title,body:submission.posts[0].text.replace('\n','\r\n'),
  messageFormat:2,createdAt:Math.floor(time/1000)-30,modifiedAt:Math.floor(time/1000)-10,visible:true,deleted:false,privateReply:false};
 const facts={version:'clear-local-moodle-review.1',provenance:'LOCAL_LMS_RECORD',purpose:'READ_ONLY_SOURCE_FACTS',context,
  runContextHash:digest('CLEAR-WORKFLOW-RUN.1',context),sourceRevision:digest('CLEAR-MOODLE-REVIEW-FACTS.1',source),
  observed:{startedAt:time,finishedAt:time+500},source,sourceBinding:registry.sourceBinding,accountMappingVerification:'HOST_PIN_ONLY',
  submissionContentBinding:'NOT_ESTABLISHED',usableForAcceptance:false,visibility:'VISIBLE_TO_AUTHENTICATED_READER',
  completeness:'TARGET_ONLY_NON_ATOMIC',identityVerified:false,academyAcceptance:'UNKNOWN',contentTruth:'UNKNOWN',automaticEligibility:false,paymentAllowed:false,independentClaim:'NO_GO'};
 const input={compiled,context,submission,files,registry,facts,sourceRunId:'source-read',sourceGeneration:1,nowMs:time+1000,rawExpiresAtMs:time+1800000};
 function seal(){input.acquisition={execution:'CONTRACT_FIXTURE',pinHash:acquisitionPinHash(input.context,input.registry),
  factsHash:digest('CLEAR-REVIEW-ACQUIRED-FACTS-PROPOSAL.1',input.facts)};return input;}
 seal();
 return {input,seal,propose:()=>proposeReviewCorrelation(input),current:proposal=>({context:input.context,registry:input.registry,
  receiptHash:proposal.sourceReceiptHash,sourceGeneration:input.sourceGeneration,rawAvailable:true,nowMs:input.nowMs})};
}
