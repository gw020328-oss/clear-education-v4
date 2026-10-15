import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarLabels, evaluationCases, clockCases } from './cases.mjs';

test('long history vectors are explicitly synthetic and never product or payment evidence', () => {
  const ids = new Set();
  for (const c of evaluationCases) {
    assert.ok(!ids.has(c.id)); ids.add(c.id);
    assert.equal(c.mode, 'SYNTHETIC'); assert.equal(c.authority, 'TEST_VECTOR_ONLY');
    for (const key of ['officialPolicyConfirmed', 'productConnected', 'paymentAuthorized']) assert.equal(c[key], false);
    assert.ok(Number.isInteger(c.periodDays) && c.periodDays >= 1 && c.periodDays <= 366);
    assert.ok(['PASS', 'NOT_MET', 'ON_HOLD', 'IN_PROGRESS', 'NOT_REQUIRED'].includes(c.expected.learningStatus));
    assert.ok(c.expected.reason.length > 0);
  }
});

test('the same source facts have separate policy expectations; a third profile is not a brand branch', () => {
  const a = evaluationCases.find(c => c.id === 'same-facts-threshold-85');
  const b = evaluationCases.find(c => c.id === 'same-facts-threshold-90');
  assert.deepEqual(a.history, b.history); assert.deepEqual(a.source, b.source);
  assert.notEqual(a.assumptions.timeThresholdBps, b.assumptions.timeThresholdBps);
  assert.equal(a.expected.learningStatus, 'PASS'); assert.equal(b.expected.learningStatus, 'NOT_MET');
  const third = evaluationCases.find(c => c.id === 'third-profile-seven-days-70-percent');
  assert.equal(third.history.length, 7); assert.equal(third.assumptions.timeThresholdBps, 7000);
  const unknown = evaluationCases.find(c => c.id === 'low-threshold-does-not-invent-progress');
  assert.equal(unknown.history[0].providerProgressBps, null);
  assert.equal(unknown.expected.learningStatus, 'ON_HOLD');
});

test('baseline calendar labels cross year and leap-day boundaries without duplicated dates', () => {
  for (const [id, expectedEnd] of [
    ['time-90-days-exact-threshold', '2027-01-11'], ['progress-100-days-exact-60-percent', '2027-01-21'],
  ]) {
    const c = evaluationCases.find(c => c.id === id);
    assert.equal(c.history.length, c.periodDays);
    assert.equal(new Set(c.history.map(r => r.date)).size, c.periodDays);
    assert.equal(c.history[0].date, '2026-10-14'); assert.equal(c.history.at(-1).date, expectedEnd);
    assert.ok(c.history.every(r => Date.parse(r.closedAt) <= Date.parse(c.asOf)));
  }
  assert.deepEqual(calendarLabels('2028-02-28', 3), ['2028-02-28', '2028-02-29', '2028-03-01']);
});

test('three midnight vectors use the KST finish day rather than the UTC date', () => {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
  for (const c of clockCases) assert.equal(formatter.format(new Date(c.instant)), c.expectedKstDate);
});

test('review targets keep unavailable, confirmed absence, future and optional route distinct', () => {
  const find = id => evaluationCases.find(c => c.id === id);
  assert.equal(find('time-explicit-no-record').expected.learningStatus, 'NOT_MET');
  assert.equal(find('time-unavailable-not-absence').expected.learningStatus, 'ON_HOLD');
  assert.equal(find('time-future-days-in-progress').expected.learningStatus, 'IN_PROGRESS');
  assert.equal(find('time-today-unfinished-before-cutoff').expected.learningStatus, 'IN_PROGRESS');
  assert.equal(find('score-route-learning-not-required').expected.learningStatus, 'NOT_REQUIRED');
  const local = find('time-local-api-shaped-short-history');
  assert.equal(local.source.currentRevision, null); assert.equal(local.expected.learningStatus, 'ON_HOLD');
});
