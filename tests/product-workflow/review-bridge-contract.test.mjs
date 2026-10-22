import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewBridgeExample} from '../../specs/m3/review-bridge-example.mjs';
import {BRIDGE_GATES,OBSERVATION_VERSION,bridgeHash,reviewQueryHash,validateReviewAcquisition,createReviewAcquisition,
 validateReviewProjection,reviewProjectionHash,assertReviewQueryCurrent,assertReviewProjectionCurrent,validateBoundReviewObservation} from '../../src/review-evidence/common/contract.mjs';

test('frozen query/acquisition/projection vector keeps LOCAL facts separate from C2 and all authority false',()=>{
 const f=reviewBridgeExample();validateReviewAcquisition(f.acquisition,f);validateReviewProjection(f.projection,f.context);
 assertReviewQueryCurrent(f.query,reviewQueryHash(f.query),f.nowMs);
 assertReviewProjectionCurrent(f.projection,{context:f.context,currentProjectionHash:reviewProjectionHash(f.projection),nowMs:f.nowMs});
 assert.equal(f.acquisition.observedReaderId,f.query.pin.readerId);assert.equal(f.projection.sourceStatus,'OBSERVED_TARGET');
 assert.equal(f.projection.sourceReceiptHash,bridgeHash('ACQUISITION',f.acquisition));assert.equal(f.projection.usableForAcceptance,false);
 assert.ok(!JSON.stringify(f.acquisition).includes(f.facts.source.body));assert.ok(!JSON.stringify(f.projection).includes(f.sources[1].text));
});
test('reader, pin, source hash and run mismatch fail before acquisition can be issued',()=>{
 const f=reviewBridgeExample();assert.throws(()=>createReviewAcquisition({...f,observedReaderId:999}),/RB_READER/);
 for(const key of ['courseId','authorId']){const facts=structuredClone(f.facts);facts.source[key]++;assert.throws(()=>createReviewAcquisition({...f,facts,observedReaderId:6}),/RB_SOURCE_PIN/);}
 const changed=structuredClone(f.facts);changed.source.body+=' changed';assert.throws(()=>createReviewAcquisition({...f,facts:changed,observedReaderId:6}),/RB_SOURCE_HASH/);
});
test('unavailable source is independent of CHECKED content and carries no historical success receipt',()=>{
 const f=reviewBridgeExample();const r={version:OBSERVATION_VERSION,runContextHash:f.query.runContextHash,sourceProjectionHash:reviewProjectionHash(f.unavailable),
 sourceReceiptHash:null,sourceStatus:'UNAVAILABLE',contentStatus:'CHECKED',outcome:'PRECHECK_REQUIREMENTS_MET',observationResultHash:bridgeHash('MOCK','checked'),current:true,reasons:[],...BRIDGE_GATES};
 validateBoundReviewObservation(r,{context:f.context,projection:f.unavailable});
 assert.throws(()=>validateReviewProjection({...f.unavailable,sourceReceiptHash:f.projection.sourceReceiptHash},f.context),/RB_SOURCE_STATUS/);
});
test('lease boundary, changed projection/generation and injected authority cannot be accepted',()=>{
 const f=reviewBridgeExample();assert.throws(()=>assertReviewQueryCurrent(f.query,reviewQueryHash(f.query),f.query.expiresAtMs),/RB_QUERY_EXPIRED/);
 const current={context:f.context,currentProjectionHash:reviewProjectionHash(f.projection),nowMs:f.nowMs};
 assert.throws(()=>assertReviewProjectionCurrent({...f.projection,sourceGeneration:2},current),/RB_STALE_PROJECTION/);
 assert.throws(()=>assertReviewProjectionCurrent({...f.projection,paymentAllowed:true},current),/RB_GATES/);
 assert.throws(()=>assertReviewProjectionCurrent(f.projection,{...current,nowMs:f.projection.expiresAtMs}),/RB_PROJECTION_EXPIRED/);
});
