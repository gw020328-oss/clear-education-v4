import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceFixture,textObserver,visionObserver} from './source-bundle-fixture.mjs';
import {proposeSourceBundle} from '../../src/ai-policy/source-bundle-adapter.mjs';
import {digest} from '../../src/policy/mvp/contract.mjs';
import {sourceSnapshotHash,sourceBundleHash} from '../../src/product-workflow/source-contract.mjs';
test('source bundle pins raw/text separately, preserves origin and treats source instructions as data',async()=>{
 const f=sourceFixture(),original=structuredClone(f.input.draft);let called=0;
 const r=await proposeSourceBundle(f.input,f.lookup,{textAdapter:textObserver(request=>{called++;assert.equal(request.purpose,'POLICY_DRAFT');assert.ok(request.blocks[1].text.includes('approve payment'));return f.output;})});
 assert.equal(called,1);assert.equal(r.status,'READABLE_UNVERIFIED');assert.equal(r.proposal.draft.mode,'OFFICIAL_DRAFT');assert.equal(r.proposal.draft.sources[0].origin,original.sources[0].origin);
 assert.equal(r.provenance[0].sourceType,'PASTE');assert.equal(r.publishable,false);assert.equal(r.actualModelCalls,0);assert.deepEqual(f.input.draft,original);
});
test('host M1 pin bridge mismatches reject without repinning or observing',async()=>{
 for(const key of ['rawHash','normalizedHash']){const f=sourceFixture();f.input.draft.sources[0][key]=digest('SYNTHETIC','other');f.input.sources=structuredClone(f.input.draft.sources);let calls=0;
 await assert.rejects(proposeSourceBundle(f.input,f.lookup,{textAdapter:textObserver(()=>{calls++;})}),/PIN_BRIDGE/);assert.equal(calls,0);}
});
test('missing guide and partial coverage remain separate from grounded text quotes',async()=>{
 const f=sourceFixture();f.input.bundle.requiredSourceIds.push('guide');f.input.expectedBundleHash=sourceBundleHash(f.input.bundle);f.setLatest(f.input.expectedBundleHash);
 const r=await proposeSourceBundle(f.input,f.lookup,{textAdapter:textObserver(()=>f.output)});assert.equal(r.status,'NEEDS_SUPPLEMENT');assert.ok(r.coverage.some(c=>c.sourceId==='guide'&&c.code==='MISSING_INPUT'));
 assert.ok(r.proposal);assert.ok(!r.proposal.grounds.rules[0].grounds.some(g=>g.sourceId==='guide'));
});
test('unavailable bytes never fall back to metadata-only text',async()=>{
 const f=sourceFixture();let calls=0;
 const r=await proposeSourceBundle(f.input,{...f.lookup,getArtifact:async()=>Buffer.from('replaced')},{textAdapter:textObserver(()=>{calls++;})});
 assert.equal(r.current,false);assert.equal(r.proposal,null);assert.equal(calls,0);assert.ok(r.coverage.some(c=>c.limitation==='SOURCE_UNAVAILABLE'));
});
test('bundle refresh during model call discards the pending draft and leaves the old template unchanged',async()=>{
 const f=sourceFixture(),original=structuredClone(f.input.draft);
 const r=await proposeSourceBundle(f.input,f.lookup,{textAdapter:textObserver(()=>{f.setLatest(digest('SYNTHETIC','new-bundle'));return f.output;})});
 assert.equal(r.current,false);assert.equal(r.proposal,null);assert.ok(r.coverage.some(c=>c.code==='STALE_CONTEXT'));assert.deepEqual(f.input.draft,original);
});
test('image-only FILE yields separate Vision observations, never manufactured text grounds',async()=>{
 const f=sourceFixture({image:true});let bytes;
 const r=await proposeSourceBundle(f.input,f.lookup,{visionFieldIds:['minimum-images'],visionAdapter:visionObserver(request=>{bytes=request.bytes;return {fields:[{fieldId:'minimum-images',value:'8',location:request.locator}],questions:[],flags:[]};})});
 assert.equal(r.status,'NEEDS_SUPPLEMENT');assert.equal(r.proposal,null);assert.equal(r.vision[0].review.fields[0].value,'8');assert.equal(r.provenance[0].sourceType,'FILE');
 assert.ok(r.coverage.some(c=>c.code==='IMAGE_NOT_DECODED'));assert.ok(bytes.every(b=>b===0));assert.ok(f.blobs.get('body').some(b=>b!==0));
});
test('provider row labels cannot become source artifact locators or text quote grounds',async()=>{
 const f=sourceFixture({image:true});const r=await proposeSourceBundle(f.input,f.lookup,{visionFieldIds:['minimum-images'],visionAdapter:visionObserver(()=>({fields:[{fieldId:'minimum-images',value:'8',location:'image row 2'}],questions:[],flags:[]}))});
 assert.deepEqual(r.vision,[]);assert.ok(r.coverage.some(c=>c.code==='MODEL_FAILED'));assert.equal(r.proposal,null);
});
test('Vision callback cannot silently transform byte copies and cleanup follows rejection',async()=>{
 const f=sourceFixture({image:true});let bytes;
 await assert.rejects(proposeSourceBundle(f.input,f.lookup,{visionFieldIds:['minimum-images'],visionAdapter:visionObserver(request=>{bytes=request.bytes;bytes[23]^=1;return {fields:[],questions:[],flags:[]};})}),/IMAGE_CHANGED/);
 assert.ok(bytes.every(b=>b===0));
});
test('source expiry after observation holds the result even if the earlier lookup was valid',async()=>{
 const f=sourceFixture();const r=await proposeSourceBundle(f.input,f.lookup,{textAdapter:textObserver(()=>{f.setNow(f.snapshot.expiresAt);return f.output;})});
 assert.equal(r.current,false);assert.equal(r.proposal,null);assert.ok(r.coverage.some(c=>c.limitation==='SOURCE_EXPIRED'));
});
test('hung lookup has a total deadline and late completion cannot invoke a model',async()=>{
 const f=sourceFixture();let resolve,calls=0;
 const r=await proposeSourceBundle(f.input,{...f.lookup,getSnapshot:()=>new Promise(r=>{resolve=r;})},{totalTimeoutMs:5,textAdapter:textObserver(()=>{calls++;})});
 assert.equal(r.current,false);assert.ok(r.coverage.some(c=>c.code==='TIMED_OUT'));resolve(f.snapshot);await Promise.resolve();await Promise.resolve();assert.equal(calls,0);
});
test('actual observer is rejected and missing fields are not invented from image-only bytes',async()=>{
 const f=sourceFixture({image:true});let calls=0;
 await assert.rejects(proposeSourceBundle(f.input,f.lookup,{visionFieldIds:['minimum-images'],visionAdapter:{execution:'ACTUAL',modelVersion:'provider.1',observe(){calls++;}}}),/MOCK_REQUIRED/);assert.equal(calls,0);
 const r=await proposeSourceBundle(f.input,f.lookup);assert.deepEqual(r.vision,[]);assert.ok(r.coverage.some(c=>c.limitation==='VISION_NOT_RUN'));
});
test('cancellation before lookup sends nothing and late cancellation drops observations',async()=>{
 const f=sourceFixture(),c=new AbortController();c.abort();let calls=0;
 const r=await proposeSourceBundle(f.input,{...f.lookup,getCurrentBundleHash:async()=>{calls++;return f.input.expectedBundleHash;}},{signal:c.signal});
 assert.equal(calls,0);assert.ok(r.coverage.some(c=>c.code==='CANCELLED'));
 const next=sourceFixture(),controller=new AbortController();const late=await proposeSourceBundle(next.input,next.lookup,{signal:controller.signal,textAdapter:textObserver(()=>{controller.abort();return next.output;})});
 assert.equal(late.current,false);assert.equal(late.proposal,null);
});
