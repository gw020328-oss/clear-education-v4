// Offline consistency/privacy checks of the stopped run, never a model replay.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const r=JSON.parse(readFileSync(new URL('./e6-paid-eight-actual-20261019.json',import.meta.url),'utf8'));
test('stopped actual run distinguishes reservation, real fetch, HTTP and scorable cases',()=>{
  assert.equal(r.executedCodeHead,'9aa155ce5c23a9bc4e8c81a191b57491362f0a05');
  assert.equal(r.status,'UNKNOWN_STOPPED');assert.equal(r.stop.code,'E6_PAID8_USAGE_UNKNOWN');
  assert.deepEqual([r.callCounts.preDispatchGenerationReservations,r.callCounts.actualFetchInvocations,r.callCounts.http2xxResponses],[1,1,1]);
  assert.equal(r.callCounts.countTokensCalls,0);assert.equal(r.callCounts.retries,0);assert.equal(r.callCounts.fallbacks,0);
  assert.deepEqual(r.notRunCaseIds,['PY02','PY03','PY04','PY05','PY06','PY07','PY08']);
  assert.equal(r.quality.scorableCases,0);assert.equal(r.quality.scoredTopics,0);assert.equal(r.quality.plannedTopics,24);
  assert.equal(r.quality.falseHolds,null);assert.equal(r.quality.falseHoldRate,null);assert.equal(r.quality.topicAccuracy,null);
  assert.equal(r.quality.groundingAssessed,0);assert.equal(r.quality.assessedNormalControls,0);
});
test('missing thoughts stays unknown despite prompt+candidate equalling reported total',()=>{
  const t=r.attempts[0].tokens;assert.equal(t.thoughtsTokenCount,null);
  assert.equal(t.promptTokenCount+t.candidatesTokenCount,t.totalTokenCount);
  assert.deepEqual(r.stop.missingUsageFields,['thoughtsTokenCount']);
  assert.equal(r.cost.knownPromptAndCandidatePortionNanoUsd,String(BigInt(t.promptTokenCount)*300n+BigInt(t.candidatesTokenCount)*2500n));
  assert.equal(r.cost.completeIncludingThinkingEstimateNanoUsd,null);assert.equal(r.cost.actualInvoiceUsd,null);
  assert.equal(r.cost.invoiceVerified,false);assert.equal(r.cost.providerHardCashCapVerified,false);
});
test('public result retains no source/quote/raw response/credentials and grants no authority',()=>{
  const forbidden=new Set(['text','quote','gold','rawResponse','rawObservation','body','headers','apiKey','projectId','errorMessage','sourceText']);
  const walk=v=>{if(v&&typeof v==='object')for(const [k,value] of Object.entries(v)){assert.equal(forbidden.has(k),false,k);walk(value);}};walk(r);
  assert.equal(r.privacy.rawResponseRetained,false);assert.equal(r.privacy.keyOrProjectIdRetained,false);
  assert.equal(r.privacy.actualMoodleRecords,0);assert.equal(r.privacy.actualHackerRankRecords,0);
  assert.equal(r.usableForAcceptance,false);assert.equal(r.paymentAuthority,false);assert.equal(r.paymentAllowed,false);
});
