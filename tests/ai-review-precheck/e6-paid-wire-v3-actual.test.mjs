// Offline arithmetic/retention checks of the actual numeric report, not a response replay.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const r=JSON.parse(readFileSync(new URL('./e6-paid-wire-v3-actual-20261019.json',import.meta.url)));
test('actual eight finish once with explicit quality and false-hold denominators, not all cases pass',()=>{
 assert.equal(r.executedCodeHead,'636817f679e009a6ad3194b7c549606cd24d112f');assert.equal(r.status,'FINISHED');assert.equal(r.recordedAfterExecution,true);
 assert.deepEqual([r.callCounts.cliExecutions,r.callCounts.preDispatchGenerationReservations,r.callCounts.actualFetchInvocations,r.callCounts.http2xxResponses],[1,8,8,8]);
 for(const k of ['countTokensCalls','modelListCalls','retries','continuations','fallbacks','pendingRequests'])assert.equal(r.callCounts[k],0);
 assert.equal(r.quality.scorableCases,8);assert.equal(r.quality.passed,7);assert.equal(r.quality.needsImprovement,1);assert.deepEqual(r.quality.needsImprovementCaseIds,['PY05']);
 assert.equal(r.quality.scoredTopics,24);assert.equal(r.quality.correctTopicStates,23);assert.equal(r.quality.topicAccuracy,23/24);
 assert.equal(r.quality.expectedPresentTopicsAssessed,21);assert.equal(r.quality.groundedPresentTopics,21);
 assert.equal(r.quality.falseHoldTopics,0);assert.equal(r.quality.assessedNormalControlTopics,15);assert.equal(r.quality.falseHoldCases,0);assert.equal(r.quality.assessedNormalControls,5);
 const finding=r.quality.semanticFindings[0];assert.equal(finding.caseId,'PY05');assert.equal(finding.topicId,'problem-solving-process');
 assert.equal(finding.expectedState,'UNCERTAIN');assert.equal(finding.retainedActualState,null);assert.equal(finding.rawErrorCodeArrayRetained,false);
 assert.equal(r.quality.wireSuccessDoesNotResolveSemanticMismatch,true);
 assert.equal(r.attempts.find(a=>a.caseId==='PY05').quality.assessment.errors,2);assert.equal(r.stop.triggered,false);assert.deepEqual(r.stop.notRunCaseIds,[]);
 const assessed=r.attempts.map(a=>a.quality.assessment);assert.equal(assessed.reduce((n,a)=>n+a.correctTopicStates,0),r.quality.correctTopicStates);
});
test('reported and derived tokens stay separate; conditional cost and pacing arithmetic reconcile',()=>{
 const sum=k=>r.attempts.reduce((n,a)=>n+a.usage.rawUsage[k],0);
 assert.equal(sum('promptTokenCount'),2585);assert.equal(sum('candidatesTokenCount'),1633);assert.equal(sum('totalTokenCount'),4218);
 assert.equal(r.tokens.reportedPromptTokenSum,2585);assert.equal(r.tokens.reportedCandidateTokenSum,1633);assert.equal(r.tokens.reportedTotalTokenSum,4218);
 assert.equal(r.tokens.separatelyReportedThoughtsTokenSum,null);assert.equal(r.tokens.thoughtsUnreportedCases,8);
 for(const a of r.attempts){assert.equal(a.usage.rawUsage.thoughtsTokenCount,null);assert.equal(a.usage.reportedServiceTier,'standard');
  assert.equal(a.usage.derived.individualThoughtsReported,false);assert.equal(a.usage.derived.combinedGeneratedUpperBoundTokens,a.usage.rawUsage.totalTokenCount-a.usage.rawUsage.promptTokenCount);}
 assert.equal(r.tokens.derivedCombinedGeneratedUpperBoundTokenSum,1633);assert.equal(r.tokens.derivedNonCandidateResidualTokenSum,0);
 assert.equal(r.cost.knownCompletedUsageEstimateNanoUsd,String(2585n*300n+1633n*2500n));assert.equal(r.cost.conditionalGenerationEstimateUsd,'0.004858');
 assert.equal(r.cost.unknownUsageReservedCalls,0);assert.equal(r.cost.actualInvoiceUsd,null);assert.equal(r.cost.invoiceVerified,false);assert.equal(r.cost.providerHardCashCapVerified,false);
 const gaps=r.timing.dispatchEpochMs.slice(1).map((v,i)=>v-r.timing.dispatchEpochMs[i]);assert.deepEqual(gaps,r.timing.observedDispatchIntervalsMs);
 assert.equal(Math.min(...gaps),r.timing.minimumObservedIntervalMs);assert.ok(gaps.every(ms=>ms>=60000));
});
test('previous failures and Mac failure stay unresolved; public report holds no raw answer or authority',()=>{
 for(const file of r.previousSeparateStoppedRuns.resultFiles){const old=JSON.parse(readFileSync(new URL(file,import.meta.url)));assert.equal(old.status,'UNKNOWN_STOPPED');assert.equal(old.quality.scorableCases,0);}
 assert.equal(r.cumulativeTheseThreeObservedRuns.actualFetchInvocations,10);assert.equal(r.cumulativeTheseThreeObservedRuns.scorableCases,8);
 assert.equal(r.cumulativeTheseThreeObservedRuns.completeAllRunEstimateUsd,null);assert.equal(r.macCi.originalFailureResolved,false);assert.equal(r.macCi.rerunSuccessDoesNotResolveOriginal,true);
 const forbidden=new Set(['text','quote','gold','body','headers','apiKey','projectId','rawResponse','sourceText','thoughtSignature']);
 function walk(v){if(v&&typeof v==='object')for(const [k,value] of Object.entries(v)){assert.equal(forbidden.has(k),false,k);walk(value);}}walk(r);
 assert.equal(r.privacy.rawResponseRetained,false);assert.equal(r.privacy.keyOrProjectIdRetained,false);assert.equal(r.quality.independentHoldout,false);
 for(const k of ['usableForAcceptance','paymentAuthority','paymentAllowed'])assert.equal(r[k],false);
});
