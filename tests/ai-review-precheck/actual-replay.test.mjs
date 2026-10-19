import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessActualReview} from './assess-actual.mjs';
const report=JSON.parse(readFileSync(new URL('./actual-evaluation-20261016.json',import.meta.url)));
const corpus=JSON.parse(readFileSync(new URL('./evaluation-corpus.json',import.meta.url)));
test('actual synthetic responses replay offline without hiding missing reasons or location gaps',()=>{
  assert.equal(report.execution,'ACTUAL');assert.equal(report.attempts.length,8);
  assert.equal(report.usage.countCalls,8);assert.equal(report.usage.generationCalls,8);
  assert.ok(BigInt(report.usage.reservedNanoUsd)<=50000000n);
  const quality=report.attempts.map(a=>{
    const c=corpus.cases.find(c=>c.caseId===a.caseId);
    const q=assessActualReview(a,{fields:{'course-label':c.expected},requiredFlags:c.flags,sourceFixture:c.sourceFixture},
      {normal:['RT01','RT02','RV01'].includes(c.caseId),vision:c.task==='VISION'});
    assert.deepEqual(q,a.offlineQuality);assert.equal(a.result.paymentAllowed,false);return q;
  });
  assert.equal(quality.filter(q=>q.literalMatches).length,8);
  assert.equal(quality.filter(q=>q.falseHold).length,0);
  assert.equal(quality.filter(q=>q.missingReasonCodes.length).length,3);
  assert.equal(quality.filter(q=>q.locationStatus==='LOCATION_NOT_GROUNDED').length,4);
  assert.equal(report.attempts.find(a=>a.caseId==='RV04').sourceComparison.reviewed,'CONFLICT');
});
