import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture,h } from './fixture.mjs';
import { createDocumentManifest,manifestHash,verifyDocumentManifest,createRunContext,toPrecheckContext,runContextHash,validateReviewSummary,snapshotHash,GATES } from '../../src/product-workflow/contract.mjs';
test('same metadata and size with different actual bytes changes the bound run',()=>{
 const f=fixture(),first=createRunContext(f.snapshot,'run-a',1),changed=structuredClone(f.files);changed[0].bytes[23]^=1;
 const manifest=createDocumentManifest(f.submission,changed);assert.notEqual(manifestHash(manifest),first.assetsHash);
 assert.throws(()=>verifyDocumentManifest(f.snapshot.manifest,f.submission,changed),/BYTES_CHANGED/);
 const next=createRunContext({...f.snapshot,manifest},'run-a',1);assert.notEqual(runContextHash(first),runContextHash(next));
});
test('legacy metadata inputHash and ruleVersion mapping remain compatible',()=>{
 const f=fixture(),run=createRunContext(f.snapshot,'run-a',1),c=toPrecheckContext(run);
 assert.equal(c.inputHash,f.snapshot.inputHash);assert.notEqual(c.inputHash,run.assetsHash);assert.equal(c.ruleVersion,f.snapshot.planVersion);assert.equal(c.runId,'run-a');
 assert.deepEqual(c.binding,f.snapshot.binding);assert.equal(GATES.productEligible,false);assert.equal(GATES.userConsentVerified,false);
});
test('scope, policy, source bundle, review plan, revisions, method and retry each change the commitment',()=>{
 const f=fixture(),base=createRunContext(f.snapshot,'run-a',1);
 for(const change of [s=>{s.binding.subjectRef=h('another');},s=>{s.binding.policyHash=h('policy2');},s=>{s.planHash=h('plan2');},
   s=>{s.sourceBundleHash=h('newsource');},s=>{s.workflowRevision++;},s=>{s.submissionRevision++;},s=>{s.routeRevision++;},s=>{s.fieldIds=['other-field'];}]){
  const s=structuredClone(f.snapshot);change(s);assert.notEqual(runContextHash(createRunContext(s,'run-a',1)),runContextHash(base));
 }
 assert.notEqual(runContextHash(createRunContext(f.snapshot,'run-b',2)),runContextHash(base));
});
test('file omission, duplicates, type swaps and metadata length mismatches reject before observation',()=>{
 const f=fixture();assert.throws(()=>createDocumentManifest(f.submission,[]),/FILE_SET/);
 assert.throws(()=>createDocumentManifest(f.submission,[...f.files,...f.files]),/FILE_SET/);
 assert.throws(()=>createDocumentManifest(f.submission,[{...f.files[0],mediaType:'image/jpeg'}]),/MEDIA/);
 const s=structuredClone(f.submission);s.posts[0].images[0].byteLength++;assert.throws(()=>createDocumentManifest(s,f.files),/LIMIT/);
});
test('summary refuses extra authority/raw values and inconsistent checked/hold results',()=>{
 const f=fixture(),c=createRunContext(f.snapshot,'run-a',1),s={version:c.version,runContextHash:runContextHash(c),resultHash:h('result'),reviewStatus:'CHECKED',outcome:'PRECHECK_REQUIREMENTS_MET',reasons:[]};
 validateReviewSummary(s);assert.throws(()=>validateReviewSummary({...s,paymentAllowed:true}),/SUMMARY/);
 assert.throws(()=>validateReviewSummary({...s,reasons:[{fieldId:'image-type',code:'UNREADABLE'}]}),/REASONS/);
 assert.throws(()=>validateReviewSummary({...s,reviewStatus:'MISSING'}),/OUTCOME/);
 assert.throws(()=>validateReviewSummary({...s,resultHash:'raw output'}),/HASH/);
});
test('mode and unknown fields cannot enable live inputs',()=>{
 const f=fixture();assert.throws(()=>snapshotHash({...f.snapshot,mode:'LOCAL_LAB'}),/MODE/);
 assert.throws(()=>snapshotHash({...f.snapshot,sourceVerified:true}),/SNAPSHOT/);
});
