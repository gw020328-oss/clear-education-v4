import test from 'node:test';
import assert from 'node:assert/strict';
import {localFixture} from './local-fixture.mjs';
import {mock,h} from './fixture.mjs';
import {reviewBridgeExample} from '../../specs/m3/review-bridge-example.mjs';
import {BRIDGE_GATES,PLAIN_NORMALIZER,reviewProjectionHash,validateBoundReviewObservation} from '../../src/review-evidence/common/contract.mjs';
import {bytesDigest} from '../../src/product-workflow/contract.mjs';
import {createLocalReviewProjectionSession,validateLocalReviewSources,groundLocalReviewObservations} from '../../src/document-precheck/review/local-projection.mjs';
const session=f=>createLocalReviewProjectionSession(()=>f,{nowMs:()=>f.clock.value});
const deferred=f=>{let release;const a=mock(f),observe=a.observe;
  a.observe=async request=>{const output=await observe(request);await new Promise(resolve=>{release=resolve;});return output;};
  return {a,ready:async()=>{while(!release)await new Promise(resolve=>setImmediate(resolve));},release:()=>release()};};

test('common fixed vector original sources validate without treating wire plan pins as an executable policy',()=>{
  assert.equal(validateLocalReviewSources(reviewBridgeExample()),true);
});
test('real bound-policy mock review returns exact minimal common DTO with LOCAL source pins',async()=>{
  const f=localFixture();let rawReads=0;
  const current={context:f.context,projection:f.projection};
  Object.defineProperty(current,'raw',{enumerable:true,get(){rawReads++;throw Error('raw must not be read by current resolver');}});
  const s=createLocalReviewProjectionSession(()=>current,{nowMs:()=>f.clock.value}),r=await s.review(f,mock(f));
  validateBoundReviewObservation(r,f);assert.equal(r.version,'clear-review-bound-observation.1');
  assert.equal(r.contentStatus,'CHECKED');assert.equal(r.sourceStatus,'OBSERVED_TARGET');assert.equal(r.sourceProjectionHash,reviewProjectionHash(f.projection));
  assert.equal(r.sourceReceiptHash,f.projection.sourceReceiptHash);assert.equal(s.consume(r),r);
  assert.equal(rawReads,0);
  assert.equal(JSON.stringify(r).includes('합성반'),false);assert.equal(Object.hasOwn(r,'grounding'),false);
  for(const [key,value] of Object.entries(BRIDGE_GATES))assert.equal(r[key],value);
});
test('UNAVAILABLE source and CHECKED content coexist without a historical receipt or source authentication',async()=>{
  const f=localFixture({unavailable:true}),r=await session(f).review(f,mock(f));
  assert.equal(r.contentStatus,'CHECKED');assert.equal(r.outcome,'PRECHECK_REQUIREMENTS_MET');assert.equal(r.sourceStatus,'UNAVAILABLE');
  assert.equal(r.sourceReceiptHash,null);assert.ok(r.reasons.some(x=>x.code==='SOURCE_UNVERIFIED'));assert.equal(r.identityVerified,false);
});
test('missing/unreadable/conflict/open content remains distinct from source state',async()=>{
  const cases=[['MISSING',{text:''},null],['UNREADABLE',{}, {value:null,status:'UNREADABLE'}],
    ['NEEDS_REVIEW',{}, {flags:[{code:'CONFLICT',fieldIds:['course-label']}]}],['POLICY_OPEN',{open:true},null]];
  for(const [status,options,output] of cases){
    const f=localFixture(options),a=mock(f,output??{}),r=await session(f).review(f,a);
    assert.equal(r.contentStatus,status);assert.equal(r.sourceStatus,'OBSERVED_TARGET');
    if(status==='MISSING'||status==='POLICY_OPEN')assert.equal(a.calls,0);
    if(status==='NEEDS_REVIEW')assert.ok(r.reasons.some(x=>x.code==='CONFLICT'));
  }
});
test('sourceReceipt/registry/query/generation/attempt/normalizer/hash substitutions fail against trusted host before dispatch',async()=>{
  const mutations=[p=>p.sourceReceiptHash=h('other-receipt'),p=>p.sourceRevision=h('other-revision'),p=>p.registryHash=h('registry'),
    p=>p.queryHash=h('query'),p=>p.sourceGeneration++,p=>p.attempt++,p=>p.sourceRunId='other-source-run',
    p=>p.normalization.version=PLAIN_NORMALIZER,p=>p.normalization.rawBodyHash=h('raw'),p=>p.normalization.normalizedContentHash=h('normalized')];
  for(const mutate of mutations){
    const f=localFixture(),trusted={context:f.context,projection:structuredClone(f.projection)},a=mock(f);mutate(f.projection);
    const s=createLocalReviewProjectionSession(()=>trusted,{nowMs:()=>f.clock.value});
    await assert.rejects(()=>s.review(f,a),/RB_STALE_PROJECTION/);assert.equal(a.calls,0);
  }
});
test('raw title/text source binding rejects extra IDs, bytes mismatch, wrong part and normalized replacement',async()=>{
  const mutations=[f=>f.sources[1].text+=' changed',f=>f.sources[0].text=f.sources[1].text,
    f=>f.sources.push({...f.sources[0],sourceId:'extra'}),f=>f.sources[1].sourceId='wrong-id',
    f=>f.projection.submittedSources[1].sha256=h('wrong-bytes'),f=>f.projection.submittedSources[1].locationBasis='NORMALIZED_UTF16'];
  for(const mutate of mutations){const f=localFixture(),a=mock(f);mutate(f);await assert.rejects(()=>session(f).review(f,a));assert.equal(a.calls,0);}
  const f=localFixture({text:'😀e\u0301 합성 후기입니다.'});f.sources[1].text=f.sources[1].text.normalize('NFC');
  f.projection.submittedSources[1].sha256=bytesDigest(Buffer.from(f.sources[1].text));
  assert.throws(()=>validateLocalReviewSources(f),/LOCAL_REVIEW_ORIGINAL_SOURCE/);
});
test('original UTF-16 quote/offset is preserved; normalized Moodle quote cannot be substituted',()=>{
  const f=localFixture({text:'😀e\u0301 합성 후기입니다.'}),o={fieldId:'course-label',value:'candidate',locator:'post/post-a/text/2/4',quote:'e\u0301'};
  const trace=groundLocalReviewObservations(f,[o])[0];
  assert.equal(trace.evidence.start,2);assert.equal(trace.evidence.end,4);assert.equal(trace.evidence.sourceId,'c2-body');
  assert.equal(trace.evidence.sha256,f.projection.submittedSources.find(x=>x.part==='text').sha256);
  assert.equal(trace.evidence.quote,'e\u0301');assert.equal(trace.locationStatus,'ORIGINAL_SUBMISSION_UTF16');
  assert.throws(()=>groundLocalReviewObservations(f,[{...o,quote:'é'}]),/LOCAL_REVIEW_QUOTE/);
  assert.throws(()=>groundLocalReviewObservations(f,[{...o,locator:'post/post-a/text/2/3'}]),/LOCAL_REVIEW_QUOTE/);
  const absent=groundLocalReviewObservations(f,[{...o,value:null,quote:null,locator:null}])[0];
  assert.equal(absent.evidence,null);assert.equal(absent.locationStatus,'NO_LEGIBLE_EVIDENCE');
});
test('image asset is bound to C2 manifest but never an internal row/region or text source alias',async()=>{
  const f=localFixture({method:'VISION',images:true}),a=mock(f),response=await a.observe({method:'VISION'});
  const trace=groundLocalReviewObservations(f,response.observations)[0];
  assert.equal(trace.evidence.kind,'IMAGE_ASSET');assert.equal(trace.evidence.assetsHash,f.context.assetsHash);
  assert.equal(trace.evidence.sha256,f.context.snapshot.manifest.files[0].sha256);assert.equal(Object.hasOwn(trace.evidence,'row'),false);
  const bound=mock(f),observe=bound.observe;let copies;
  bound.observe=request=>{copies=request.assets.map(a=>a.bytes);return observe(request);};
  const r=await session(f).review(f,bound);assert.equal(r.contentStatus,'NEEDS_REVIEW');assert.ok(r.reasons.some(x=>x.code==='IMAGE_NOT_DECODED'));
  assert.ok(copies.every(bytes=>bytes.every(b=>b===0)));assert.ok(f.files[0].bytes.some(b=>b!==0));
  f.files[0].bytes[20]^=1;const b=mock(f);await assert.rejects(()=>session(f).review(f,b),/WORKFLOW_BYTES_CHANGED/);assert.equal(b.calls,0);
});
test('expired projection and unavailable-with-old-receipt are rejected before dispatch',async()=>{
  const f=localFixture(),a=mock(f);f.clock.value=f.projection.expiresAtMs;
  await assert.rejects(()=>session(f).review(f,a),/RB_PROJECTION_EXPIRED/);assert.equal(a.calls,0);
  const g=localFixture({unavailable:true}),b=mock(g);g.projection.sourceReceiptHash=h('old-receipt');
  await assert.rejects(()=>session(g).review(g,b),/RB_SOURCE_STATUS/);assert.equal(b.calls,0);
});
test('source refresh/normalizer/registry/query/receipt changes during observation make late results STALE',async()=>{
  const changes=[p=>p.sourceGeneration++,p=>p.attempt++,p=>p.registryHash=h('new-registry'),p=>p.queryHash=h('new-query'),
    p=>p.sourceReceiptHash=h('new-receipt'),p=>p.normalization.rawBodyHash=h('new-raw'),p=>p.normalization.version=PLAIN_NORMALIZER,
    p=>Object.assign(p,{sourceStatus:'UNAVAILABLE',sourceReceiptHash:null,sourceRevision:null,normalization:null,sourceGeneration:2})];
  for(const mutate of changes){
    const f=localFixture(),s=session(f),d=deferred(f),pending=s.review(f,d.a);await d.ready();mutate(f.projection);d.release();
    const r=await pending;assert.equal(r.contentStatus,'STALE');assert.equal(r.current,false);assert.equal(s.isCurrent(r),false);
    assert.equal(s.consume(r).contentStatus,'STALE');
  }
});
test('supplemented latest result survives late prior submission/run reply',async()=>{
  let current=localFixture();const s=createLocalReviewProjectionSession(()=>current,{nowMs:()=>current.clock.value});
  const old=current,d=deferred(old),pending=s.review(old,d.a);await d.ready();
  current=localFixture({revision:2,runId:'latest-run',unavailable:true});const latest=await s.review(current,mock(current));d.release();
  const prior=await pending;assert.equal(prior.contentStatus,'STALE');assert.equal(s.isCurrent(prior),false);
  assert.equal(s.isCurrent(latest),true);assert.equal(s.consume(latest),latest);assert.equal(latest.sourceStatus,'UNAVAILABLE');assert.equal(latest.contentStatus,'CHECKED');
});
test('consume rechecks source failure, expiry and irreversible stale receipt; clones/replayed run refused',async()=>{
  const f=localFixture(),s=session(f),r=await s.review(f,mock(f));
  assert.throws(()=>s.consume(structuredClone(r)),/LOCAL_REVIEW_RECEIPT_REQUIRED/);
  await assert.rejects(()=>s.review(f,mock(f)),/REVIEW_RUN_REUSE/);
  const old=structuredClone(f.projection);Object.assign(f.projection,{sourceStatus:'UNAVAILABLE',sourceReceiptHash:null,sourceRevision:null,normalization:null,sourceGeneration:2});
  assert.equal(s.consume(r).contentStatus,'STALE');f.projection=old;assert.equal(s.isCurrent(r),false);
  const g=localFixture(),t=session(g),q=await t.review(g,mock(g));g.clock.value=g.projection.expiresAtMs;
  assert.equal(t.consume(q).contentStatus,'STALE');
});
test('expiry while awaiting mock and trusted host revocation do not return current success',async()=>{
  const f=localFixture(),s=session(f),d=deferred(f),pending=s.review(f,d.a);await d.ready();f.clock.value=f.projection.expiresAtMs;d.release();
  assert.equal((await pending).contentStatus,'STALE');
  const g=localFixture();let revoked=false;
  const t=createLocalReviewProjectionSession(()=>{if(revoked)throw Error('do not expose host detail');return g;},{nowMs:()=>g.clock.value});
  const r=await t.review(g,mock(g));revoked=true;assert.equal(t.consume(r).contentStatus,'STALE');
});
test('cancel/timeout/model invalid output remain fixed reasons without raw output; ACTUAL never dispatched',async()=>{
  const f=localFixture(),c=new AbortController();c.abort();const a=mock(f),r=await session(f).review(f,a,{signal:c.signal});
  assert.equal(a.calls,0);assert.equal(r.contentStatus,'NEEDS_REVIEW');assert.ok(r.reasons.some(x=>x.code==='CANCELLED'));
  const g=localFixture(),b=mock(g);b.observe=()=>new Promise(()=>{});
  const timed=await session(g).review(g,b,{timeoutMs:5});assert.ok(timed.reasons.some(x=>x.code==='TIMED_OUT'));
  const hInput=localFixture(),bad=mock(hInput,{extra:{paymentAllowed:true}}),invalid=await session(hInput).review(hInput,bad);
  assert.ok(invalid.reasons.some(x=>x.code==='MODEL_FAILED'));assert.equal(invalid.paymentAllowed,false);
  const j=localFixture(),paid=mock(j);paid.execution='ACTUAL';await assert.rejects(()=>session(j).review(j,paid),/AI_WORKFLOW_MOCK_REQUIRED/);assert.equal(paid.calls,0);
});
test('FIXTURE projection is never reinterpreted as LOCAL and policy sourceBundle stays independent',async()=>{
  const f=localFixture();f.projection.version='clear-review-source-fixture.1';const a=mock(f);
  await assert.rejects(()=>session(f).review(f,a),/RB_RUN/);assert.equal(a.calls,0);
  const g=localFixture();assert.notEqual(g.context.snapshot.sourceBundleHash,g.projection.sourceReceiptHash);
  const r=await session(g).review(g,mock(g));assert.equal(r.sourceReceiptHash,g.projection.sourceReceiptHash);
});
test('freshness is checked again immediately before dispatch; clock reversal and in-flight cancellation fail safely',async()=>{
  const f=localFixture(),a=mock(f);let reads=0;
  const s=createLocalReviewProjectionSession(()=>{if(++reads===3)f.clock.value=f.projection.expiresAtMs;return f;},{nowMs:()=>f.clock.value});
  const expired=await s.review(f,a);assert.equal(expired.contentStatus,'STALE');assert.equal(a.calls,0);
  const g=localFixture(),t=session(g),r=await t.review(g,mock(g));g.clock.value--;
  assert.equal(t.consume(r).contentStatus,'STALE');
  const j=localFixture(),u=session(j),d=deferred(j),controller=new AbortController(),pending=u.review(j,d.a,{signal:controller.signal});
  await d.ready();controller.abort();const cancelled=await pending;d.release();
  assert.equal(cancelled.contentStatus,'NEEDS_REVIEW');assert.ok(cancelled.reasons.some(r=>r.code==='CANCELLED'));
});
