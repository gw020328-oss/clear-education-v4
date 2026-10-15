import test from 'node:test';
import assert from 'node:assert/strict';
import {workflowFixture,h} from './workflow-fixture.mjs';
import {reviewWorkflowDocument} from '../../src/document-precheck/workflow-adapter.mjs';
import {createRunContext,runContextHash,validateReviewSummary} from '../../src/product-workflow/contract.mjs';
const readable={reviewStatus:'CHECKED',observations:[{fieldId:'image-type',value:'SYNTHETIC_PERSON_NAME',locator:'post/post-a/image/image-a',quote:null}]};
const observer=(observe=()=>structuredClone(readable))=>({execution:'MOCK',modelVersion:'mock-observer.1',observe});
test('CODE binds the issued context and returns only a minimal persisted summary',async()=>{
 const f=workflowFixture(),result=await reviewWorkflowDocument(f);validateReviewSummary(result);
 assert.equal(result.reviewStatus,'CHECKED');assert.equal(result.runContextHash,runContextHash(f.context));
 assert.deepEqual(Object.keys(result).sort(),['version','runContextHash','resultHash','reviewStatus','outcome','reasons'].sort());
});
test('VISION receives exact owned bytes and wipes copies while keeping decode/authority limits',async()=>{
 const f=workflowFixture('VISION'),original=Buffer.from(f.files[0].bytes);let assets;
 const result=await reviewWorkflowDocument(f,observer(request=>{assets=request.assets;assert.deepEqual(request.assets[0].bytes,original);assert.equal(request.assetsHash,f.context.assetsHash);return readable;}));
 assert.equal(result.reviewStatus,'NEEDS_REVIEW');assert.ok(result.reasons.some(r=>r.code==='IMAGE_NOT_DECODED'));
 assert.ok(assets[0].bytes.every(b=>b===0));assert.deepEqual(f.files[0].bytes,original);
 assert.ok(!JSON.stringify(result).includes('SYNTHETIC_PERSON_NAME'));assert.ok(!JSON.stringify(result).includes('post/post-a'));
});
test('same metadata image replacement rejects before observation',async()=>{
 const f=workflowFixture('VISION');f.files[0].bytes[23]^=1;let calls=0;
 await assert.rejects(reviewWorkflowDocument(f,observer(()=>{calls++;return readable;})),/BYTES_CHANGED/);assert.equal(calls,0);
});
test('observer cannot silently replace its byte copy with transformed bytes',async()=>{
 const f=workflowFixture('VISION');let copy;
 await assert.rejects(reviewWorkflowDocument(f,observer(request=>{copy=request.assets[0].bytes;copy[23]^=1;return readable;})),/BYTES_CHANGED/);
 assert.ok(copy.every(b=>b===0));
});
test('policy/rule/plan/display/preview pins and method fields reject caller mismatches',async()=>{
 for(const key of ['ruleHash','planHash','displayHash','reviewManifestHash','previewHash']){
  const f=workflowFixture('VISION'),s=structuredClone(f.snapshot);s[key]=h('changed');f.context=createRunContext(s,'run-a',1);
  await assert.rejects(reviewWorkflowDocument(f,observer()),/POLICY_PIN/);
 }
 const f=workflowFixture('VISION'),s=structuredClone(f.snapshot);s.fieldIds=['invented'];f.context=createRunContext(s,'run-a',1);
 await assert.rejects(reviewWorkflowDocument(f,observer()),/OBSERVATION_PIN/);
});
test('actual or incorrectly versioned observer cannot dispatch',async()=>{
 const f=workflowFixture('VISION');let calls=0;
 for(const adapter of [{execution:'ACTUAL',modelVersion:'mock-observer.1',observe(){calls++;}},{...observer(),modelVersion:'other.1'}])await assert.rejects(reviewWorkflowDocument(f,adapter),/MOCK_REQUIRED/);
 assert.equal(calls,0);
});
test('missing image skips mock and produces supplement summary',async()=>{
 const f=workflowFixture('VISION');f.submission.posts[0].images=[];f.files=[];
 const {createDocumentManifest,submissionHash}=await import('../../src/product-workflow/contract.mjs');
 const s={...structuredClone(f.snapshot),manifest:createDocumentManifest(f.submission,[]),inputHash:submissionHash(f.submission)};f.context=createRunContext(s,'run-a',1);let calls=0;
 const r=await reviewWorkflowDocument(f,observer(()=>{calls++;}));assert.equal(calls,0);assert.equal(r.reviewStatus,'MISSING');assert.equal(r.outcome,'NEEDS_SUPPLEMENT');
});
test('conflict never becomes a checked numeric value or leaks raw signal text',async()=>{
 const f=workflowFixture('VISION'),r=await reviewWorkflowDocument(f,observer(()=>({...readable,questions:[{questionId:'conflict',fieldIds:['image-type'],text:'SYNTHETIC_PRIVATE_QUOTE'}],flags:[{code:'CONFLICT',fieldIds:['image-type']}]})));
 assert.equal(r.reviewStatus,'NEEDS_REVIEW');assert.ok(r.reasons.some(r=>r.code==='CONFLICT'));assert.ok(!JSON.stringify(r).includes('SYNTHETIC_PRIVATE_QUOTE'));
});
test('timeout/cancel wipe owned callback buffers and expose only fixed reason codes',async()=>{
 for(const cancel of [false,true]){
  const f=workflowFixture('VISION'),c=new AbortController();let assets;
  const pending=reviewWorkflowDocument(f,observer(request=>{assets=request.assets;if(cancel)c.abort();return new Promise(()=>{});}),{signal:c.signal,timeoutMs:5});
  const r=await pending;assert.ok(r.reasons.some(r=>r.code===(cancel?'CANCELLED':'TIMED_OUT')));assert.ok(assets[0].bytes.every(b=>b===0));
 }
});
test('context and submission are captured across await; host owns late-result CAS',async()=>{
 const f=workflowFixture('VISION'),originalHash=runContextHash(f.context);f.context=structuredClone(f.context);let resolve;
 const pending=reviewWorkflowDocument(f,observer(()=>new Promise(r=>{resolve=r;})));await Promise.resolve();
 f.context.snapshot.workflowRevision++;f.submission.posts[0].text='changed';resolve(readable);
 const r=await pending;assert.equal(r.runContextHash,originalHash);assert.equal(r.reviewStatus,'NEEDS_REVIEW');
});
test('wall-clock expiry cannot return checked and cleanup still executes',async()=>{
 const f=workflowFixture('VISION');let time=0,assets;
 const r=await reviewWorkflowDocument(f,observer(request=>{assets=request.assets;time=1800000;return readable;}),{nowMs:()=>time});
 assert.ok(r.reasons.some(r=>r.code==='TIMED_OUT'));assert.ok(assets[0].bytes.every(b=>b===0));
});
test('unreadable is distinct from missing and remains an actionable hold',async()=>{
 const f=workflowFixture('VISION'),r=await reviewWorkflowDocument(f,observer(()=>({reviewStatus:'UNREADABLE',observations:[{fieldId:'image-type',value:null,locator:null,quote:null}]})));
 assert.equal(r.reviewStatus,'UNREADABLE');assert.ok(r.reasons.some(r=>r.code==='UNREADABLE'));assert.ok(!r.reasons.some(r=>r.code==='MISSING_INPUT'));
});
test('provider failure exposes no raw message and still clears observer bytes',async()=>{
 const f=workflowFixture('VISION');let bytes;
 const r=await reviewWorkflowDocument(f,observer(request=>{bytes=request.assets[0].bytes;throw new Error('SYNTHETIC_RAW_PROVIDER_SECRET');}));
 assert.equal(r.reviewStatus,'NEEDS_REVIEW');assert.ok(r.reasons.some(r=>r.code==='MODEL_FAILED'));assert.ok(!JSON.stringify(r).includes('SYNTHETIC_RAW_PROVIDER_SECRET'));assert.ok(bytes.every(b=>b===0));
});
test('TEXT_AI keeps exact span validation without adding an image decode hold',async()=>{
 for(const correct of [true,false]){
  const f=workflowFixture('TEXT_AI'),r=await reviewWorkflowDocument(f,observer(()=>({reviewStatus:'CHECKED',observations:[{fieldId:'image-type',value:'RELATED',locator:'post/post-a/text/0/3',quote:correct?'가나다':'invented'}]})));
  assert.equal(r.reviewStatus,correct?'CHECKED':'NEEDS_REVIEW');assert.ok(!r.reasons.some(r=>r.code==='IMAGE_NOT_DECODED'));if(!correct)assert.ok(r.reasons.some(r=>r.code==='MODEL_FAILED'));
 }
});
