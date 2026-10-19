import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deriveUsageV2,safeRawUsage,USAGE_V2_POLICY_HASH} from './e6-usage-compat-v2.mjs';
import {loadE6PaidEightBundle} from './e6-paid-eight-plan.mjs';
const body=loadE6PaidEightBundle().requests[0].body;
function response(u={promptTokenCount:314,candidatesTokenCount:135,totalTokenCount:449}){
 return {modelVersion:'gemini-3.5-flash-lite',usageMetadata:u,candidates:[{content:{role:'model',parts:[{text:'{}'}]}}]};
}
test('314/135/unreported/449: raw null, conditional derived 135, never reported thoughts zero',()=>{
 for(const explicitNull of [false,true]){
  const r=response();if(explicitNull)r.usageMetadata.thoughtsTokenCount=null;
  const before=JSON.stringify(r),u=deriveUsageV2(body,r);assert.equal(JSON.stringify(r),before);
  assert.equal(u.rawUsage.thoughtsTokenCount,null);assert.equal(u.derived.combinedGeneratedUpperBoundTokens,135);
  assert.equal(u.derived.individualThoughtsReported,false);assert.equal(u.conditionalGenerationEstimateNanoUsd,'431700');
  assert.equal(u.thoughtsFieldPresence,explicitNull?'EXPLICIT_NULL':'OMITTED');assert.equal(u.policyHash,USAGE_V2_POLICY_HASH);
  assert.equal(u.invoiceVerified,false);assert.equal(u.providerHardCashCapVerified,false);
 }
});
test('positive residual charged as output without asserting missing thoughts=zero',()=>{
 const r=response();r.usageMetadata.totalTokenCount=454;const u=deriveUsageV2(body,r);
 assert.equal(u.derived.combinedGeneratedUpperBoundTokens,140);assert.equal(u.derived.nonCandidateResidualTokens,5);
 assert.equal(u.rawUsage.thoughtsTokenCount,null);assert.equal(u.conditionalGenerationEstimateNanoUsd,'444200');
 r.usageMetadata.thoughtsTokenCount=5;assert.equal(deriveUsageV2(body,r).derived.individualThoughtsReported,true);
 r.usageMetadata.thoughtsTokenCount=0;assert.throws(()=>deriveUsageV2(body,r),/THOUGHTS_INCONSISTENT/);
});
test('missing, negative, fractional, boolean, string and unsafe counters block',()=>{
 for(const k of ['promptTokenCount','candidatesTokenCount','totalTokenCount'])for(const v of [undefined,null,-1,1.5,true,'449',NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){
  const r=response();r.usageMetadata[k]=v;assert.throws(()=>deriveUsageV2(body,r),/COUNTER_REQUIRED/);
 }
 for(const v of [undefined,-1,0.5,false,'0',NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){
  const r=response();r.usageMetadata.thoughtsTokenCount=v;assert.throws(()=>deriveUsageV2(body,r),/COUNTER_INVALID/);
 }
 const r=response();r.usageMetadata.totalTokenCount=448;assert.throws(()=>deriveUsageV2(body,r),/TOTAL_INCONSISTENT/);
 const huge=response({promptTokenCount:Number.MAX_SAFE_INTEGER,candidatesTokenCount:1,totalTokenCount:Number.MAX_SAFE_INTEGER});
 assert.throws(()=>deriveUsageV2(body,huge),/TOTAL_INCONSISTENT/); // BigInt sum does not silently round.
 assert.deepEqual(safeRawUsage({thoughtsTokenCount:-1}),{promptTokenCount:null,candidatesTokenCount:null,thoughtsTokenCount:null,totalTokenCount:null});
});
test('tool/cache fields, unknown usage, unexpected tier and nontext modality block',()=>{
 for(const [key,val] of [['cachedContentTokenCount',1],['toolUsePromptTokenCount',1],['cachedContentTokenCount',false],
 ['cacheTokensDetails',[{modality:'TEXT',tokenCount:0}]],['toolUsePromptTokensDetails',[{}]],['serviceTier','PRIORITY'],['extra',0],
 ['promptTokensDetails',[{modality:'IMAGE',tokenCount:314}]],['candidatesTokensDetails',[{modality:'TEXT',tokenCount:134}]],
 ['promptTokensDetails',{}],['promptTokensDetails',[{modality:'TEXT',tokenCount:314,extra:0}]]]){
  const r=response();r.usageMetadata[key]=val;assert.throws(()=>deriveUsageV2(body,r),/E6_UV2_/);
 }
 const r=response();Object.assign(r.usageMetadata,{cachedContentTokenCount:0,toolUsePromptTokenCount:0,serviceTier:'STANDARD',
 promptTokensDetails:[{modality:'TEXT',tokenCount:314}],candidatesTokensDetails:[{modality:'TEXT',tokenCount:135}]});
 assert.equal(deriveUsageV2(body,r).conditionalGenerationEstimateNanoUsd,'431700');
});
test('request and response features outside pinned single-text scope block',()=>{
 for(const change of [b=>b.tools=[],b=>b.cachedContent='x',b=>b.contents[0].parts.push({inlineData:{}}),
 b=>b.contents[0].extra=true,b=>b.generationConfig.thinkingConfig.extra=true]){
  const b=structuredClone(body);change(b);assert.throws(()=>deriveUsageV2(b,response()),/REQUEST_SCOPE/);
 }
 for(const change of [r=>r.modelVersion='other',r=>r.candidates.push(r.candidates[0]),r=>r.candidates[0].groundingMetadata={},
 r=>r.candidates[0].content.parts=[{functionCall:{}}],r=>r.candidates[0].content.parts=[{inlineData:{}}],
 r=>r.candidates[0].content.parts[0].thought=true,r=>r.candidates[0].content.extra='x']){
  const r=response();change(r);assert.throws(()=>deriveUsageV2(body,r),/E6_UV2_/);
 }
});
test('old failed actual record remains unscored; v2 does not retroactively apply',()=>{
 const a=JSON.parse(readFileSync(new URL('./e6-paid-eight-actual-20261019.json',import.meta.url)));
 assert.equal(JSON.stringify(a).includes('E6_PAID8_USAGE_UNKNOWN'),true);
 assert.equal(JSON.stringify(a).includes('DERIVED_TOTAL_BOUND'),false);
});
