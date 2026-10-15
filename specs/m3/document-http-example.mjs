// Server-only, public SYNTHETIC fixtures. No production upload or authority.
import { readFileSync } from 'node:fs';
import { exampleDraft } from '../m1/examples.mjs';
import { createSourceSupplement } from '../../src/product-workflow/source-collector.mjs';
import { prepareReviewPolicy,compileBoundReviewPolicy } from '../../src/document-precheck/bound-policy.mjs';
import { sourceSnapshotHash,sourceBundleHash } from '../../src/product-workflow/source-contract.mjs';
export const DOCUMENT_FIXTURE_EPOCH=Date.parse('2026-10-15T00:00:00Z')/1000;
export function prepareDocumentExample(){
 const draft=exampleDraft('third');draft.policyVersion='student-document-demo.2';
 const source=createSourceSupplement({sourceId:draft.sources[0].sourceId,revision:1,institutionId:draft.institutionId,productId:draft.productId,cohortId:draft.cohortId,
  sourceType:'PASTE',mediaType:'text/plain',bytes:Buffer.from('SYNTHETIC review: minimum four codepoints.'),collectedAt:DOCUMENT_FIXTURE_EPOCH});
 const locator='artifact/text/line/1';draft.sources=[{...draft.sources[0],capturedAt:DOCUMENT_FIXTURE_EPOCH,rawHash:source.snapshot.artifacts.find(a=>a.role==='RESPONSE_BODY').sha256,
  normalizedHash:source.snapshot.artifacts.find(a=>a.role==='EXTRACTED_TEXT').sha256,normalizerVersion:source.snapshot.extractionVersion,locators:[locator]}];
 draft.rules.forEach(r=>{r.sourceRefs=[{sourceId:draft.sources[0].sourceId,locator}];});
 const rule=draft.rules.find(r=>r.requirementId==='review');
 const plan={version:'document-demo-plan.1',requirementId:'review',ruleId:rule.ruleId,checks:[{checkId:'length',kind:'CHAR_COUNT',scope:'POST',basis:'SYNTHETIC_ASSUMPTION',questionId:null,
  sourceRefs:structuredClone(rule.sourceRefs),options:{minimum:4,unit:'CODEPOINTS',space:'INCLUDE',normalization:'NONE'}}]};
 const prepared=prepareReviewPolicy({draft,plans:[plan],sourceBlocks:[{sourceId:draft.sources[0].sourceId,locator,text:'SYNTHETIC review: minimum four codepoints.'}],
  observationPlans:['TEXT_AI','VISION'].map(method=>({ruleId:rule.ruleId,method,fieldIds:['content'],promptVersion:'clear-document-observe.1'}))});
 const bundle={version:'clear-source-bundle.1',bundleId:'document-demo-source',revision:1,institutionId:draft.institutionId,productId:draft.productId,cohortId:draft.cohortId,
  requiredSourceIds:[draft.sources[0].sourceId],entries:[{sourceId:draft.sources[0].sourceId,revision:1,snapshotHash:sourceSnapshotHash(source.snapshot)}]};
 return {prepared,source,bundle};
}
export function documentHttpExample(){
 const {prepared,source,bundle}=prepareDocumentExample();
 const authority=JSON.parse(readFileSync(new URL('./document-http-pins.json',import.meta.url),'utf8'));
 const policy=compileBoundReviewPolicy(prepared,authority);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ZkAAAAASUVORK5CYII=','base64');
 const fixtures=['ready-text','missing','image','unreadable','conflict'].map(fixtureId=>{
  const image=['image','unreadable'].includes(fixtureId),text=fixtureId==='missing'?'':`SYNTHETIC ${fixtureId} document.`;
  return {fixtureId,posts:[{postId:'post-a',title:'SYNTHETIC',text,tags:[],links:[],images:image?[{imageId:'image-a',byteLength:png.length,width:1,height:1}]:[]}],
   files:image?[{postId:'post-a',imageId:'image-a',mediaType:'image/png',bytes:Buffer.from(png)}]:[]};
 });
 return {policy,source,bundle,sourceBundleHash:sourceBundleHash(bundle),fixtures,
  studentPolicies:[{policyId:'student-third-demo',revision:2,draft:prepared.policy,sources:authority.sourcePins,capabilities:authority.capabilityPins}],
  adapter:{execution:'MOCK',modelVersion:'mock-document.1',observe(request){
   const text=request.submission.posts[0]?.text??'',unreadable=text.includes('unreadable'),conflict=text.includes('conflict');
   const observation={fieldId:'content',value:unreadable?null:'RELATED',locator:unreadable?null:request.method==='VISION'?'post/post-a/image/image-a':'post/post-a/text/0/3',quote:unreadable||request.method==='VISION'?null:'SYN'};
   return {reviewStatus:unreadable?'UNREADABLE':'CHECKED',observations:[observation],questions:[],flags:conflict?[{code:'CONFLICT',fieldIds:['content']}]:[]};
  }},
 };
}
