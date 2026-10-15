import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyFixture, repin } from './fixture.mjs';
import { evaluationExample, repinExample } from '../../specs/m2/examples.mjs';
import { evaluateMvpEligibility } from '../../src/eligibility/mvp/evaluator.mjs';

// Test-only authority: existing synthetic Evidence pins are deliberately updated
// here. This is not a receipt importer or a VERIFIED source/Evidence converter.
function bridge(f, observation) {
  const fixture = evaluationExample('third', { compiled: f.compiled });
  const evidence = fixture.input.evidence.find(e => e.requirementId === 'learning');
  evidence.observations = [observation]; evidence.payloadHash = f.trusted.factsHash;
  evidence.sourceRevision = f.trusted.sourceRevision;
  evidence.collectedAt = f.now; evidence.acceptedAt = f.now + 1;
  for (const k of ['authenticity', 'subject', 'semantics', 'completeness', 'correction']) evidence[k] = f.trusted.verification[k];
  return { fixture, evidence, run: () => evaluateMvpEligibility(f.compiled, repinExample(fixture.input)) };
}

test('actual L1 aggregate is consumed by M2 using the same compiled module instance', () => {
  const f = dailyFixture('third'), daily = f.run(), b = bridge(f, daily.observation), result = b.run();
  assert.equal(result.rules.find(r => r.ruleId === 'daily-learning').state, 'MET');
  assert.equal(result.settlement, 'FINAL_SYNTHETIC'); assert.equal(result.productEligible, false);
  assert.equal(result.paymentAllowed, false); assert.equal(result.grant, 'HOLD'); assert.equal(result.independentClaim, 'NO_GO');
});
test('known zero qualified days is OBSERVED 0/0 and M2 condition failure', () => {
  const f = dailyFixture(); for (const r of f.facts.records) r.sourceRecordStatus = 'NO_RECORD'; repin(f);
  const daily = f.run(); assert.equal(daily.observation.value, 0); assert.equal(daily.observation.days, 0);
  const b = bridge(f, daily.observation), result = b.run();
  assert.equal(result.rules.find(r => r.ruleId === 'daily-learning').state, 'NOT_MET'); assert.equal(result.settlement, 'NOT_MET');
});
test('missing source meaning remains UNKNOWN in M2 rather than an observed zero', () => {
  const f = dailyFixture(); f.facts.records[0].effectiveMs = null; repin(f);
  const daily = f.run(); assert.equal(daily.observation.status, 'UNKNOWN');
  const result = bridge(f, daily.observation).run();
  assert.equal(result.rules.find(r => r.ruleId === 'daily-learning').state, 'UNKNOWN'); assert.equal(result.entitlement, null);
});
test('source verifier UNKNOWN is never promoted just because a daily result is available', () => {
  const f = dailyFixture(); f.trusted.verification.authenticity = 'UNKNOWN';
  const result = bridge(f, f.run().observation).run();
  assert.equal(result.rules.find(r => r.ruleId === 'daily-learning').reason, 'SOURCE_UNVERIFIED'); assert.equal(result.entitlement, null);
});
test('partial current-period coverage is held by M2 even when L1 reports IN_PROGRESS', () => {
  const f = dailyFixture(), from = f.compiled.policy.requirements.find(r => r.requirementId === 'learning').period.from;
  f.now = from + 3600; f.facts.snapshot.observedAt = String(f.now); f.facts.snapshot.validUntil = String(f.now + 300);
  f.facts.snapshot.coverageEndExclusive = String(f.now);
  for (const r of f.facts.records) r.sourceRecordStatus = 'NO_RECORD'; repin(f);
  const daily = f.run(); assert.equal(daily.observation.status, 'IN_PROGRESS');
  const b = bridge(f, daily.observation); b.evidence.completeness = 'PARTIAL';
  b.evidence.coveredPeriod.until = f.now;
  const result = b.run(); assert.equal(result.rules.find(r => r.ruleId === 'daily-learning').reason, 'COVERAGE_UNKNOWN');
  assert.equal(result.entitlement, null);
});

test('current period does not hide UNKNOWN observation behind FUTURE_DAYS (M2 38b18cd)', () => {
  const f = dailyFixture(), b = bridge(f, { ...f.run().observation, status: 'UNKNOWN', value: null, days: null });
  const from = f.compiled.policy.requirements.find(r => r.requirementId === 'learning').period.from;
  b.fixture.input.context.evaluatedAt = from + 3600;
  b.evidence.collectedAt = from + 3590; b.evidence.acceptedAt = from + 3591;
  const result = b.run(), r = result.rules.find(r => r.ruleId === 'daily-learning');
  assert.equal(r.state, 'UNKNOWN'); assert.equal(r.reason, 'SEMANTICS_UNKNOWN'); assert.equal(result.entitlement, null);
});
