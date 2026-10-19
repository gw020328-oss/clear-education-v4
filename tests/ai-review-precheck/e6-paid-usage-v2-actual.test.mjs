// Numeric stopped-run consistency; no response replay or live API.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>JSON.parse(readFileSync(new URL(name,import.meta.url)));
const r=read('./e6-paid-usage-v2-actual-20261019.json'),old=read('./e6-paid-eight-actual-20261019.json');
test('v2 stopped before scoring, one real fetch, no retry or continuation',()=>{
 assert.equal(r.executedCodeHead,'cafbf3bd087104a34b3c3000885fdcd4674c4e21');
 assert.equal(r.status,'UNKNOWN_STOPPED');assert.equal(r.stop.code,'E6_UV2_SERVICE_TIER');assert.equal(r.stop.beforeContentParse,true);
 assert.deepEqual([r.callCounts.preDispatchGenerationReservations,r.callCounts.actualFetchInvocations,r.callCounts.http2xxResponses],[1,1,1]);
 for(const k of ['countTokensCalls','modelListCalls','retries','fallbacks','pendingRequests'])assert.equal(r.callCounts[k],0);
 assert.equal(r.callCounts.cliExecutions,1);assert.equal(r.quality.scorableCases,0);assert.equal(r.quality.scoredTopics,0);
 for(const k of ['falseHolds','falseHoldRate','topicAccuracy'])assert.equal(r.quality[k],null);
 assert.deepEqual(r.notRunCaseIds,['PY02','PY03','PY04','PY05','PY06','PY07','PY08']);
 assert.ok(r.attempts.slice(1).every(a=>!a.dispatchReserved));
});
test('unknown tier and thinking remain unknown; known portion is neither complete cost nor invoice',()=>{
 const t=r.attempts[0].tokens;assert.equal(t.thoughtsTokenCount,null);
 assert.equal(r.stop.actualServiceTierRetained,false);assert.equal(r.diagnosis.actualReturnedLiteralUnknown,true);
 assert.equal(r.diagnosis.actualReturnedTierNotInferred,true);assert.equal(r.diagnosis.officialStandardLiteral,'standard');
 assert.equal(r.cost.knownPromptAndCandidatePortionNanoUsd,String(BigInt(t.promptTokenCount)*300n+BigInt(t.candidatesTokenCount)*2500n));
 assert.equal(r.cost.completeIncludingThinkingEstimateNanoUsd,null);assert.equal(r.cost.actualInvoiceUsd,null);
 assert.equal(r.cost.invoiceVerified,false);assert.equal(r.cumulativeObservedRuns.actualFetchInvocations,old.callCounts.actualFetchInvocations+r.callCounts.actualFetchInvocations);
 assert.equal(r.cumulativeObservedRuns.knownPromptAndCandidatePortionNanoUsd,String(BigInt(old.cost.knownPromptAndCandidatePortionNanoUsd)+BigInt(r.cost.knownPromptAndCandidatePortionNanoUsd)));
 assert.equal(r.cumulativeObservedRuns.scorableCases,0);
});
test('public result contains no response/source/credential payload and grants no authority',()=>{
 const forbidden=new Set(['text','quote','gold','rawResponse','body','headers','apiKey','projectId','errorMessage','sourceText','serviceTier']);
 function walk(v){if(v&&typeof v==='object')for(const [k,value] of Object.entries(v)){assert.equal(forbidden.has(k),false,k);walk(value);}}walk(r);
 assert.equal(r.privacy.rawResponseRetained,false);assert.equal(r.privacy.keyOrProjectIdRetained,false);
 assert.equal(r.privacy.actualMoodleRecords,0);assert.equal(r.privacy.actualHackerRankRecords,0);
 for(const k of ['usableForAcceptance','paymentAuthority','paymentAllowed'])assert.equal(r[k],false);
});
