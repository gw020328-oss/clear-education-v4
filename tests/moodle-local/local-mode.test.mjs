import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyFixture, repin } from '../moodle-mvp/fixture.mjs';
import { exampleDraft } from '../../specs/m1/examples.mjs';
import { compileMvpPolicy } from '../../src/policy/mvp/compiler.mjs';
import { assessMvpDailyLearning, assessLocalLabDailyLearning } from '../../src/learning-evidence/moodle-mvp/daily.mjs';

// Fabricated UNIT_EXAMPLE values, not an actual local API execution report.
function fixture(){
  const p=exampleDraft('third');p.learningRules[0].metricRuleVersion='local-clearwatch-effective-ms.1';
  p.learningRules[0].dateAttributionRuleVersion='local-clearwatch-finish-kst.1';
  const compiled=compileMvpPolicy(p,{sources:structuredClone(p.sources),capabilities:structuredClone(p.capabilities)}),f=dailyFixture('third',compiled);
  f.facts.dataMode='LOCAL_LMS_RECORD';f.facts.trust.assurance='SERVER_BOUNDED_CLIENT_TELEMETRY';
  f.facts.binding.bindingAssurance='SOURCE_ACCOUNT_CONTROL_VERIFIED';f.trusted.rawBinding=structuredClone(f.facts.binding);
  f.facts.inventory.capabilities.officialProgress=false;f.facts.inventory.capabilities.speedCompliance=false;
  f.trusted.inventory=structuredClone(f.facts.inventory);
  f.trusted.verification={authenticity:'LOCAL_API_AUTHENTICATED',subject:'LOCAL_TEST_ACCOUNT_BOUND',semantics:'LOCAL_LAB_MEANING',
    completeness:'LOCAL_CURRENT_EXPORT_COMPLETE',correction:'CURRENT'};
  for(const r of f.facts.records){r.providerProgressBps=null;r.progressRuleVersion=null;r.speedCompliance='UNKNOWN';}
  f.trusted.observationLowerBound=Number(f.facts.snapshot.observedAt);
  repin(f);f.local=()=>assessLocalLabDailyLearning(compiled,'daily-learning',f.trusted,f.facts,f.now);return f;
}
test('local entry uses the shared core without relabelling facts as synthetic or granting payment',()=>{
  const f=fixture(),before=structuredClone(f.facts),r=f.local();assert.equal(r.learningStatus,'PASS');assert.equal(r.mode,'LOCAL_LAB');
  assert.equal(r.paymentAllowed,false);assert.equal(r.productConnected,false);assert.equal(r.humanAttentionProven,false);assert.deepEqual(f.facts,before);
});
test('synthetic entry rejects local facts; local entry rejects synthetic facts',()=>{
  const f=fixture();assert.equal(assessMvpDailyLearning(f.compiled,'daily-learning',f.trusted,f.facts,f.now).learningStatus,'ON_HOLD');
  const s=dailyFixture();assert.equal(assessLocalLabDailyLearning(s.compiled,'daily-learning',s.trusted,s.facts,s.now).learningStatus,'ON_HOLD');
});
test('a source declaration cannot substitute for independent local auth/account verification',()=>{
  const f=fixture();f.trusted.verification.subject='UNKNOWN';assert.equal(f.local().reason,'LEARNING_SOURCE_UNVERIFIED');
});
test('using common synthetic VERIFIED flags cannot promote local input',()=>{
  const f=fixture();f.trusted.verification.authenticity='VERIFIED_SYNTHETIC';assert.equal(f.local().learningStatus,'ON_HOLD');
});
test('local progress/speed remain unknown, and missing time cannot be filled from coverage',()=>{
  const f=fixture();assert.ok(f.facts.records.every(r=>r.providerProgressBps===null&&r.speedCompliance==='UNKNOWN'));
  f.facts.records[0].effectiveMs=null;repin(f);assert.equal(f.local().learningStatus,'ON_HOLD');
});

for(const missing of [false,true])test('local SQL snapshot before midnight cannot finalize from rounded upper bound: '+missing,()=>{
  const f=fixture(),end=Number(f.facts.snapshot.periodEndExclusive),last=f.facts.records.at(-1);
  Object.assign(f.facts.snapshot,{observedAt:String(end),coverageEndExclusive:String(end-1),validUntil:String(end+300)});
  // A valid close inside the final fractional second must not be called future.
  last.closedAtMs=String(end*1000-300);
  if(missing)last.sourceRecordStatus='NO_RECORD';
  f.trusted.observationLowerBound=end-1;f.now=end+60;repin(f);
  assert.equal(f.local().learningStatus,'IN_PROGRESS');
  f.now=end+120;assert.equal(f.local().learningStatus,'IN_PROGRESS');
  // Only a new source observation covering the boundary can finalize.
  f.trusted.observationLowerBound=end;f.facts.snapshot.coverageEndExclusive=String(end);repin(f);
  assert.equal(f.local().learningStatus,missing?'NOT_MET':'PASS');
});
test('local coverage cannot extend beyond its observation upper bound',()=>{
  const f=fixture(),end=Number(f.facts.snapshot.periodEndExclusive);
  f.facts.snapshot.observedAt=String(end-1);repin(f);
  assert.equal(f.local().reason,'LEARNING_COVERAGE');
});

test('long local source processing cannot renew freshness from the upper bound',()=>{
  const f=fixture(),end=Number(f.facts.snapshot.periodEndExclusive);
  f.trusted.observationLowerBound=end;
  f.now=end+86401;f.facts.snapshot.observedAt=String(f.now);f.facts.snapshot.validUntil=String(f.now+300);repin(f);
  assert.equal(f.local().reason,'LEARNING_STALE');
});
