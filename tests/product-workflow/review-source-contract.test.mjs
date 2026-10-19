import test from 'node:test';
import assert from 'node:assert/strict';
import {digest} from '../../src/policy/mvp/contract.mjs';
import {createRunContext,createDocumentManifest,submissionHash} from '../../src/product-workflow/contract.mjs';
import {reviewSourceFixture} from '../../specs/m3/review-source-binding-fixture.mjs';
import {normalizeReviewText,assertCurrentCorrelation,sourceReceiptHash} from '../../specs/m3/review-source-binding.mjs';

for(const profile of ['ybm','siwon'])test('contract-only '+profile+' local facts bind exact C2 bytes and a separate receipt',()=>{
 const f=reviewSourceFixture(profile),p=f.propose(),out=assertCurrentCorrelation(p,f.current(p));
 assert.equal(out.usableForAcceptance,false);assert.equal(out.paymentAllowed,false);assert.equal(p.receipt.identityVerified,false);
 assert.equal(p.receipt.academyAcceptance,'UNKNOWN');assert.equal(p.receipt.provenance,'LOCAL_LMS_RECORD');
 assert.equal(p.submissionRef.inputHash,f.input.context.snapshot.inputHash);assert.ok(Object.isFrozen(p.receipt));
 const text=JSON.stringify(p);assert.ok(!text.includes(f.input.facts.source.body));assert.ok(!text.includes(f.input.submission.posts[0].title));
});
test('matching normalization preserves spaces, NBSP and original inputHash; rejects unsupported markup',()=>{
 assert.equal(normalizeReviewText('e\u0301\r\n  X\u00a0'),'é\n  X\u00a0');
 assert.notEqual(normalizeReviewText(' X '),normalizeReviewText('X'));
 for(const format of [0,1,4])assert.throws(()=>normalizeReviewText('<p>X</p>',format),/RS_NORMALIZATION_UNSUPPORTED/);
 for(const text of ['\ud800','a\0b'])assert.throws(()=>normalizeReviewText(text),/RS_TEXT/);
});
for(const [name,change,error] of [
 ['body changed in same source second',f=>{f.input.facts.source.body+=' changed';f.input.facts.sourceRevision=digest('CLEAR-MOODLE-REVIEW-FACTS.1',f.input.facts.source);f.seal();},'RS_CONTENT_MISMATCH'],
 ['other author',f=>{f.input.facts.source.authorId++;f.seal();},'RS_LOCATOR'],
 ['other course',f=>{f.input.facts.source.courseId++;f.seal();},'RS_LOCATOR'],
 ['untrusted mapping',f=>{f.input.registry.status='UNREVIEWED';f.seal();},'RS_MAPPING'],
 ['reader pin changed',f=>{f.input.registry.readerId++;},'RS_ACQUISITION'],
 ['deleted placeholder',f=>{f.input.facts.source.deleted=true;f.seal();},'RS_VISIBILITY'],
 ['hidden target',f=>{f.input.facts.source.visible=false;f.seal();},'RS_VISIBILITY'],
 ['missing-page claim',f=>{f.input.facts.completeness='COMPLETE';f.seal();},'RS_VISIBILITY'],
 ['tampered source digest',f=>{f.input.facts.sourceRevision='0x'+'1'.repeat(64);f.seal();},'RS_SOURCE_HASH'],
 ['invented authority',f=>{f.input.facts.usableForAcceptance=true;f.seal();},'RS_FACTS'],
 ['source receipt expired',f=>{f.input.nowMs=f.input.facts.observed.startedAt+60000;},'RS_EXPIRED'],
 ['raw lease expired',f=>{f.input.rawExpiresAtMs=f.input.nowMs;},'RS_EXPIRED'],
 ['clock reversal',f=>{f.input.nowMs=f.input.facts.observed.startedAt;},'RS_CLOCK'],
])test(name,()=>{const f=reviewSourceFixture();change(f);assert.throws(()=>f.propose(),new RegExp(error));});
test('HTML is fail-closed even when its tags appear to match submitted text',()=>{
 const f=reviewSourceFixture();f.input.facts.source.messageFormat=1;f.input.facts.sourceRevision=digest('CLEAR-MOODLE-REVIEW-FACTS.1',f.input.facts.source);f.seal();
 assert.throws(()=>f.propose(),/RS_NORMALIZATION_UNSUPPORTED/);
});
test('in-process pin cannot stand for a reader acquisition receipt',()=>{
 const f=reviewSourceFixture();delete f.input.acquisition;assert.throws(()=>f.propose(),/RS_ACQUISITION/);
});
test('new source query generation, mapping or C2 run makes the old proposal stale',()=>{
 const f=reviewSourceFixture(),p=f.propose(),current=f.current(p);
 assert.throws(()=>assertCurrentCorrelation(p,{...current,sourceGeneration:2}),/RS_STALE_SOURCE/);
 const registry=structuredClone(current.registry);registry.revision++;
 assert.throws(()=>assertCurrentCorrelation(p,{...current,registry}),/RS_STALE_MAPPING/);
 const context=createRunContext(current.context.snapshot,'new-run',2);
 assert.throws(()=>assertCurrentCorrelation(p,{...current,context}),/RS_STALE_RUN/);
 assert.throws(()=>assertCurrentCorrelation(p,{...current,rawAvailable:false}),/RS_EXPIRED/);
});
test('supplemented revision stays latest; old result cannot overwrite it',()=>{
 const f=reviewSourceFixture(),old=f.propose(),s=structuredClone(f.input.context.snapshot);
 f.input.submission.revision++;f.input.submission.routeRevision++;
 s.workflowRevision++;s.submissionRevision++;s.routeRevision++;s.inputHash=submissionHash(f.input.submission);s.manifest=createDocumentManifest(f.input.submission,[]);
 f.input.context=createRunContext(s,'supplement-run',2);f.input.facts.context=f.input.context;f.input.facts.runContextHash=digest('CLEAR-WORKFLOW-RUN.1',f.input.context);f.input.sourceGeneration++;f.seal();
 const latest=f.propose();assertCurrentCorrelation(latest,f.current(latest));
 assert.throws(()=>assertCurrentCorrelation(old,f.current(latest)),/RS_STALE_RUN/);
});
test('receipt mutation is detected and is never promoted to eligibility',()=>{
 const f=reviewSourceFixture(),p=structuredClone(f.propose()),current=f.current(p);p.receipt.rawBodyHash='0x'+'2'.repeat(64);
 assert.throws(()=>assertCurrentCorrelation(p,current),/RS_RECEIPT_HASH/);
 p.sourceReceiptHash=sourceReceiptHash(p.receipt);assert.throws(()=>assertCurrentCorrelation(p,current),/RS_STALE_SOURCE/);
});
test('original C2 bytes/hash and SYNTHETIC mode cannot be replaced by normalized LOCAL content',()=>{
 const f=reviewSourceFixture();f.input.submission.posts[0].text+=' ';f.seal();
 assert.throws(()=>f.propose(),/WORKFLOW_BYTES_CHANGED/);
 const local=structuredClone(reviewSourceFixture().input.context);local.snapshot.mode='LOCAL_LMS_RECORD';
 assert.throws(()=>createRunContext(local.snapshot,'local-run',1),/WORKFLOW_MODE/);
});
