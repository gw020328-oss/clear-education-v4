import assert from 'node:assert/strict';
import test from 'node:test';
import { compareReviewWork, recordReview, summarizeOperationalMetrics } from '../../src/operational-metrics/index.mjs';
import { emptyCoverage, event, operationalInput, reviewArm, reviewPairs, scope } from '../../examples/operational-metrics/fixture.mjs';

test('failed attempt remains visible after retry succeeds, with distinct denominators', () => {
  const summary = summarizeOperationalMetrics(operationalInput);
  assert.deepEqual(summary.operations, { logical: 1, attempts: 2, retries: 1, failedAttempts: 1, automatedCompleted: 1 });
  assert.equal(summary.verification.applicationsWithVerifiedConditions, 1);
  assert.equal(summary.interventions.mandatory, 1);
  assert.equal(summary.interventions.exceptions, null);
  assert.equal(summary.time.recordedPersonMs, null);
  assert.equal(summary.time.overallElapsedMs, null);
});

test('rejects foreign application, access, mode, epoch, duplicates and backwards completion', () => {
  for (const key of ['applicationRef', 'accessScopeRef', 'mode', 'epochRef', 'runId', 'source']) {
    const input = structuredClone(operationalInput);
    input.events[0].scope = { ...input.scope, [key]: 'foreign' };
    assert.throws(() => summarizeOperationalMetrics(input), /METRIC_SCOPE_MIX/);
  }
  const { events } = operationalInput;
  assert.throws(() => summarizeOperationalMetrics({ ...operationalInput, events: [events[0], ...events] }), /METRIC_DUPLICATE/);
  assert.throws(() => summarizeOperationalMetrics({ ...operationalInput, events: [events[1], events[0]] }), /METRIC_CLOCK/);
  assert.throws(() => summarizeOperationalMetrics({ ...operationalInput, events: events.slice(2) }), /METRIC_ATTEMPT_SEQUENCE/);
});

test('unions each person separately and excludes waiting', () => {
  const human = personRef => ({ personRef, workKind: 'REVIEW' });
  const summary = summarizeOperationalMetrics({
    ...operationalInput, coverage: { ...emptyCoverage, human: true },
    events: [
      event('one', 'HUMAN', 0, 100, human('a')),
      event('two', 'HUMAN', 25, 125, human('a')),
      event('three', 'HUMAN', 50, 150, human('b')),
      event('four', 'WAIT', 150, 350),
      event('end', 'CASE', 0, 350),
    ],
  });
  assert.equal(summary.time.recordedPersonMs, 225);
  assert.equal(summary.time.recordedWaitingWallMs, 200);
});

test('marks require explicit valid transitions and unfinished recording stays incomplete', () => {
  const options = { scope, personRef: 'a' };
  assert.deepEqual(recordReview({ ...options, marks: [{ action: 'START', atMs: 5 }] }),
    { complete: false, intervals: [] });
  assert.throws(() => recordReview({ ...options, marks: [{ action: 'END', atMs: 5 }] }), /REVIEW_MARK/);
  assert.throws(() => recordReview({ ...options, marks: [
    { action: 'START', atMs: 5 }, { action: 'PAUSE', atMs: 4 },
  ] }), /REVIEW_MARK/);
});

test('comparison requires matched evidence, quality and complete coverage and preserves negative results', () => {
  const { baseline, assisted } = reviewPairs[0];
  assert.equal(compareReviewWork({ baseline, assisted }).humanWorkReductionPercent, 250 / 700 * 100);
  assert.equal(compareReviewWork({ baseline }).reason, 'MISSING_ARM');
  assert.equal(compareReviewWork({ baseline, assisted: { ...assisted, evidenceRef: 'different' } }).reason, 'NOT_COMPARABLE');
  const partial = structuredClone(assisted);
  partial.input.coverage.human = false;
  assert.equal(compareReviewWork({ baseline, assisted: partial }).reason, 'INCOMPLETE_COVERAGE');
  const slower = reviewArm('normal', 'CLEAR_ASSISTED', 900);
  assert.ok(compareReviewWork({ baseline, assisted: slower }).humanWorkReductionPercent < 0);
  const zero = structuredClone(baseline);
  zero.input.events = zero.input.events.filter(row => row.kind === 'CASE');
  assert.equal(compareReviewWork({ baseline: zero, assisted }).reason, 'ZERO_BASELINE');
});
