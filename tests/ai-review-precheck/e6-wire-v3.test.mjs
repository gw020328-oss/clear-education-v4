import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixtureV3} from './e6-wire-v3-fixture.mjs';
import {receivedTextV3,deriveUsageV3,assessReceivedResponseV3} from './e6-wire-v3.mjs';
const assess=(s,response)=>assessReceivedResponseV3({response,corpusCase:s.cfg.bundle.corpus.cases[0],goldCase:s.cfg.bundle.gold.cases[0],sourceId:s.cfg.bundle.corpus.sourceId});
test('documented REST fixture: lowercase tier, uppercase TEXT/STOP, optional metadata is neither tool use nor evidence',async()=>{
 const s=fixtureV3(),response=s.response(),before=JSON.stringify(response),a=await assess(s,response);
 assert.equal(JSON.stringify(response),before);assert.equal(a.quality.status,'PASS');assert.equal(a.nextDispatchAllowed,true);
 assert.equal(a.usage.rawUsage.thoughtsTokenCount,null);assert.equal(a.usage.derived.combinedGeneratedUpperBoundTokens,135);
 assert.equal(a.usage.conditionalGenerationEstimateNanoUsd,'431700');assert.equal(a.quality.assessment.scoredTopics,3);
 assert.equal(a.quality.assessment.correctTopicStates,3);assert.equal(a.quality.assessment.groundedPresentTopics,3);
 for(const text of ['synthetic-recitation','optional status','syntheticAux','b2ZmbGluZQ','quote','never persist'])assert.equal(JSON.stringify(a).includes(text),false);
});
test('standard, documented default and omitted/null tier accepted without billing authentication',()=>{
 const s=fixtureV3();for(const value of ['standard','unspecified',null,undefined]){
  const r=s.response();if(value===undefined)delete r.usageMetadata.serviceTier;else r.usageMetadata.serviceTier=value;
  assert.equal(deriveUsageV3(r).status,'CONDITIONAL_BOUND');assert.equal(deriveUsageV3(r).invoiceVerified,false);
 }
});
test('flex, priority, unknown, uppercase mock spelling and numeric tier stop next but retain valid received-text score',async()=>{
 const s=fixtureV3();for(const tier of ['flex','priority','unknown','STANDARD',1,false]){
  const r=s.response();r.usageMetadata.serviceTier=tier;const a=await assess(s,r);
  assert.equal(a.nextDispatchAllowed,false);assert.equal(a.quality.status,'PASS');assert.equal(a.quality.assessment.scoredTopics,3);
  assert.equal(a.usage.code,'E6_WV3_SERVICE_TIER');assert.equal(a.usage.conditionalGenerationEstimateNanoUsd,null);
 }
});
test('missing thoughts remains null; positive residual charged; explicit inconsistent thoughts blocks next only',async()=>{
 const s=fixtureV3(),r=s.response();r.usageMetadata.totalTokenCount=454;
 const d=deriveUsageV3(r);assert.equal(d.rawUsage.thoughtsTokenCount,null);assert.equal(d.derived.nonCandidateResidualTokens,5);
 assert.equal(d.conditionalGenerationEstimateNanoUsd,'444200');r.usageMetadata.thoughtsTokenCount=5;assert.equal(deriveUsageV3(r).derived.individualThoughtsReported,true);
 r.usageMetadata.thoughtsTokenCount=0;const a=await assess(s,r);assert.equal(a.usage.code,'E6_WV3_THOUGHTS_TOTAL');assert.equal(a.quality.status,'PASS');
});
test('invalid/missing/overflow/negative/fractional/string counts and total mismatch stop with partial quality retained',async()=>{
 const s=fixtureV3();for(const k of ['promptTokenCount','candidatesTokenCount','totalTokenCount'])for(const value of [null,undefined,-1,0.5,Number.MAX_SAFE_INTEGER+1,Infinity,'449',true]){
  const r=s.response();r.usageMetadata[k]=value;const a=await assess(s,r);assert.equal(a.quality.status,'PASS');assert.equal(a.nextDispatchAllowed,false);
 }
 const r=s.response();r.usageMetadata.totalTokenCount=448;assert.throws(()=>deriveUsageV3(r),/TOTAL/);
});
test('zero-only tool/cache details are harmless; positive/invalid details or unknown billing fields stop next',async()=>{
 const s=fixtureV3(),r=s.response();r.usageMetadata.cacheTokensDetails=[{modality:'TEXT',tokenCount:0}];r.usageMetadata.toolUsePromptTokensDetails=[{modality:'TEXT',tokenCount:0}];
 assert.equal(deriveUsageV3(r).status,'CONDITIONAL_BOUND');
 for(const change of [u=>u.cachedContentTokenCount=1,u=>u.toolUsePromptTokenCount=1,u=>u.toolUsePromptTokensDetails=[{modality:'TEXT',tokenCount:1}],
  u=>u.candidatesTokensDetails=[{modality:'IMAGE',tokenCount:135}],u=>u.promptTokensDetails=[{modality:'text',tokenCount:314}],
  u=>u.promptTokensDetails=[{modality:'TEXT',tokenCount:313}],u=>u.newBillingTokens=5]){
  const response=s.response();change(response.usageMetadata);const a=await assess(s,response);assert.equal(a.nextDispatchAllowed,false);assert.equal(a.quality.status,'PASS');
 }
});
test('optional empty metadata/default block reason/nulls accepted; populated grounding/url or unknown wire field stops next only',async()=>{
 const s=fixtureV3();for(const change of [r=>{r.candidates[0].groundingMetadata={};r.candidates[0].urlContextMetadata={};},
  r=>{r.candidates[0].content.role=null;r.candidates[0].content.parts[0].thought=null;r.candidates[0].content.parts[0].thoughtSignature=null;},
  r=>{r.promptFeedback=null;r.candidates[0].safetyRatings=null;r.usageMetadata.promptTokensDetails=[];}]){
  const r=s.response();change(r);assert.equal((await assess(s,r)).nextDispatchAllowed,true);
 }
 for(const change of [r=>r.candidates[0].groundingMetadata={webSearchQueries:['synthetic search']},r=>r.candidates[0].urlContextMetadata={urlMetadata:[{}]},
  r=>r.candidates[0].groundingMetadata={searchEntryPoint:{sdkBlob:'opaque'}},r=>r.candidates[0].groundingMetadata={googleMapsWidgetContextToken:'opaque'},r=>r.candidates[0].groundingMetadata={imageSearchQueries:['x']},r=>r.candidates[0].groundingMetadata={unknown:[]},r=>r.newField={},r=>r.candidates[0].newField={},r=>r.candidates[0].continuationToken='opaque']){
  const r=s.response();change(r);const a=await assess(s,r);assert.equal(a.quality.status,'PASS');assert.equal(a.nextDispatchAllowed,false);
 }
});
test('malformed JSON/schema, truncated finish, wrong role, thought content, mixed media/tool or blocked response cannot score',async()=>{
 const s=fixtureV3();for(const change of [r=>r.candidates[0].content.parts[0].text='private raw sentinel',r=>r.candidates[0].content.parts[0].text='{"topics":[]}',
  r=>r.candidates[0].finishReason='MAX_TOKENS',r=>r.candidates[0].content.role='user',r=>r.candidates[0].content.parts[0].thought=true,
  r=>r.candidates[0].content.parts.push({inlineData:{data:'private sentinel'}}),r=>r.candidates[0].content.parts.push({functionCall:{name:'x'}}),
  r=>r.promptFeedback.blockReason='SAFETY',r=>r.candidates[0].safetyRatings=[{blocked:true}],r=>r.candidates[0].safetyRatings=[{blocked:'false'}],
  r=>r.modelVersion='other',r=>r.candidates.push(r.candidates[0])]){
  const r=s.response();change(r);const a=await assess(s,r);assert.equal(a.quality.status,'UNSCORABLE');assert.equal(a.quality.assessment,null);
  assert.equal(a.nextDispatchAllowed,false);assert.equal(JSON.stringify(a).includes('private'),false);
 }
 const r=s.response();r.candidates[0].content.parts[0].text='not json';assert.equal((await assess(s,r)).usage.status,'CONDITIONAL_BOUND');
 const truncated=s.response();truncated.candidates[0].finishReason='MAX_TOKENS';assert.equal((await assess(s,truncated)).usage.status,'CONDITIONAL_BOUND');
});
test('citation/opaque auxiliary metadata cannot repair false evidence or grant authority',async()=>{
 const s=fixtureV3(),r=s.response(),raw=JSON.parse(receivedTextV3(r));raw.topics[0].evidence.quote='not in original source';
 r.candidates[0].content.parts[0].text=JSON.stringify(raw);const a=await assess(s,r);
 assert.equal(a.quality.status,'NEEDS_IMPROVEMENT');assert.ok(a.quality.assessment.groundedPresentTopics<3);
 for(const k of ['usableForAcceptance','paymentAuthority','paymentAllowed'])assert.equal(a[k],false);
});
test('two earlier actual records remain stopped/unscored; synthetic wire fixture never claims capture',()=>{
 for(const file of ['./e6-paid-eight-actual-20261019.json','./e6-paid-usage-v2-actual-20261019.json']){
  const r=JSON.parse(readFileSync(new URL(file,import.meta.url)));assert.equal(r.status,'UNKNOWN_STOPPED');assert.equal(r.quality.scorableCases,0);
 }
 const e=JSON.parse(readFileSync(new URL('./e6-wire-evidence-v3.json',import.meta.url)));assert.match(e.fixtureKind,/NOT_PROVIDER_CAPTURE/);
});

test('documented text speech and nonvideo processing metadata is discarded; populated audio/video hints stop next without losing text',async()=>{
 const s=fixtureV3();assert.equal((await assess(s,s.response())).nextDispatchAllowed,true);
 for(const [key,val] of [['audioTranscription',{text:'private transcription'}],['videoMetadata',{fps:30}],['mediaResolution',{level:'MEDIA_RESOLUTION_HIGH'}]]){
  const r=s.response();r.candidates[0].content.parts[0][key]=val;const a=await assess(s,r);
  assert.equal(a.quality.status,'PASS');assert.equal(a.nextDispatchAllowed,false);assert.equal(a.usage.code,'E6_WV3_MEDIA_METADATA');
  assert.equal(JSON.stringify(a).includes('private transcription'),false);
 }
});
