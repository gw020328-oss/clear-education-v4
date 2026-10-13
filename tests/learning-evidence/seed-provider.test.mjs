import test from 'node:test';
import assert from 'node:assert/strict';
import { seedFixture } from './seed-fixture.mjs';
import { compileSyntheticPolicy } from '../../src/policy/compiler.mjs';
import { draft } from '../policy/fixture.mjs';
import { evaluateSyntheticEligibility } from '../../src/eligibility/synthetic-evaluator.mjs';
import { collectSyntheticLearningEvidence } from '../../src/learning-evidence/synthetic-adapter.mjs';
const evaluate = (f, r) => evaluateSyntheticEligibility(f.compiled, { learnerId: f.trusted.learnerId,
  expectedSeedSnapshotVersion: f.trusted.snapshotVersion, exams: f.exams, learning: r.snapshot });

test('seed provider reuses B3 collection and feeds unchanged 800 AND 80% evaluator', async () => {
  const f = seedFixture(), r = await f.run();
  assert.equal(r.status, 'COMPLETE_SYNTHETIC'); assert.equal(evaluate(f, r).status, 'ELIGIBLE');
  assert.equal(evaluate(f, r).completedCount, 4); assert.equal(evaluate(f, r).requiredCount, 5);
  assert.deepEqual(f.calls.map(c => c[0]), ['read', 'read', 'close']);
  for (const k of ['liveSupported', 'collectionEnabled', 'proofVerified', 'paymentAllowed']) assert.equal(r[k], false);
  assert.deepEqual(Object.keys(r.snapshot.records[0]).sort(), ['lectureId', 'completed', 'completedAt'].sort());
  assert.ok(!JSON.stringify(r.snapshot).includes('institutionId')); assert.ok(!JSON.stringify(f.calls).includes('token'));
  f.exams.records[0].score.totalScore = 795; assert.equal(evaluate(f, r).status, 'NOT_YET_MET');
});

for (const mode of ['empty', 'duplicate-activity', 'duplicate-lecture', 'unknown-lecture', 'missing', 'policy', 'real', 'mapping', 'extra-token']) {
  test('trusted binding rejects ' + mode + ' before acquisition', () => {
    const f = seedFixture(), b = f.binding;
    if (mode === 'empty') b.activities = [];
    if (mode === 'duplicate-activity') b.activities[1].activityId = b.activities[0].activityId;
    if (mode === 'duplicate-lecture') b.activities[1].lectureId = b.activities[0].lectureId;
    if (mode === 'unknown-lecture') b.activities[0].lectureId = 'not-required';
    if (mode === 'missing') b.activities.pop();
    if (mode === 'policy') b.policyHash = '0x' + '00'.repeat(32);
    if (mode === 'real') b.dataMode = 'REAL';
    if (mode === 'mapping') b.completionMappingVersion = 'moodle-unreviewed';
    if (mode === 'extra-token') b.token = 'synthetic-secret-marker';
    assert.throws(f.provider); assert.equal(f.calls.length, 0);
  });
}

for (const [field, value] of [
  ['institutionId', 'other'], ['providerId', 'other'], ['courseId', 'other'], ['subjectRef', '0x' + '00'.repeat(32)],
  ['activitySetVersion', 'required-2'], ['sourceRevision', 'revision-2'], ['completeness', 'PARTIAL'], ['completeness', 'UNKNOWN'],
  ['correctionState', 'CORRECTED'], ['correctionState', 'UNKNOWN'], ['profile', 'moodle-live'], ['dataMode', 'REAL'],
  ['learningStart', '1'], ['learningEnd', '1'], ['coverageStart', '9999999999'], ['coverageEnd', '1'],
]) test('source mismatch or uncertainty is held: ' + field + '=' + value, async () => {
  const f = seedFixture(); f.input[field] = value;
  assert.throws(f.project);
  const r = await f.run(); assert.equal(r.status, 'ON_HOLD'); assert.equal(r.snapshot, null);
  assert.equal(r.reason, 'LEARNING_SOURCE_UNAVAILABLE'); assert.equal(f.calls.at(-1)[0], 'close');
});

for (const mode of ['missing', 'duplicate', 'unknown-activity', 'manual', 'override', 'unknown-override', 'untracked', 'unknown-state',
  'failed', 'missing-time', 'modified-only', 'false-with-time', 'future', 'future-modified', 'extra-token']) {
  test('unsafe activity cannot become completion: ' + mode, async () => {
    const f = seedFixture(), r = f.input.records[0];
    if (mode === 'missing') f.input.records.pop();
    if (mode === 'duplicate') f.input.records[1] = { ...r };
    if (mode === 'unknown-activity') r.activityId = 'unknown';
    if (mode === 'manual') r.tracking = 'MANUAL';
    if (mode === 'override') r.overridden = true;
    if (mode === 'unknown-override') r.overridden = null;
    if (mode === 'untracked') r.tracking = 'NONE';
    if (mode === 'unknown-state') r.state = 'UNKNOWN';
    if (mode === 'failed') r.state = 'FAIL';
    if (mode === 'missing-time') r.completedAt = null;
    if (mode === 'modified-only') { r.stateChangedAt = r.completedAt; r.completedAt = null; }
    if (mode === 'false-with-time') r.state = 'INCOMPLETE';
    if (mode === 'future') r.completedAt = String(BigInt(f.now()) + 1n);
    if (mode === 'future-modified') r.stateChangedAt = String(BigInt(f.now()) + 1n);
    if (mode === 'extra-token') r.token = 'synthetic-secret-marker';
    assert.throws(f.project);
    const result = await f.run(); assert.equal(result.status, 'ON_HOLD'); assert.equal(result.snapshot, null);
    assert.equal(result.paymentAllowed, false); assert.ok(!JSON.stringify(result).includes('synthetic-secret-marker'));
  });
}

test('incomplete state with known modification time remains incomplete; pass and boundary times retain policy meaning', async () => {
  const f = seedFixture(), rows = f.input.records, p = f.compiled.policy;
  rows[0].state = 'PASS'; rows[0].completedAt = p.learningEnd; rows[4].stateChangedAt = p.learningEnd;
  f.repin(); assert.equal(evaluate(f, await f.run()).completedCount, 4);
  rows[0].completedAt = String(BigInt(p.learningStart) - 1n); f.repin();
  const result = evaluate(f, await f.run()); assert.equal(result.completedCount, 3); assert.equal(result.status, 'NOT_YET_MET');
});

test('record/mapping order is irrelevant; projection is detached and immutable', () => {
  const f = seedFixture(), before = f.project();
  f.input.records.reverse(); f.binding.activities.reverse(); assert.deepEqual(f.project(), before);
  assert.ok(Object.isFrozen(before.pages[0].records[0]));
  f.input.records[0].state = 'UNKNOWN'; assert.equal(before.pages[0].records[0].completed, true);
});

for (const field of ['institutionId', 'courseId', 'activitySetVersion', 'sourceRevision']) test('changed trusted scope cannot reuse the old evidence pin: ' + field, async () => {
  const f = seedFixture(); f.binding[field] = f.input[field] = 'changed';
  const r = await f.run(); assert.equal(r.reason, 'LEARNING_VERSION_CHANGED'); assert.equal(r.snapshot, null);
});

for (const mode of ['revision', 'completion', 'state-time', 'course']) test('second acquisition detects correction before returning an evaluator input: ' + mode, async () => {
  const f = seedFixture(), read = f.source.readSnapshot; let n = 0;
  f.source.readSnapshot = (...args) => {
    if (++n === 2) {
      if (mode === 'revision') f.input.sourceRevision = 'revision-2';
      if (mode === 'completion') f.input.records[0].completedAt = f.compiled.policy.learningEnd;
      if (mode === 'state-time') f.input.records[0].stateChangedAt = f.compiled.policy.learningEnd;
      if (mode === 'course') f.input.courseId = 'other';
    }
    return read(...args);
  };
  const r = await f.run(); assert.equal(r.status, 'ON_HOLD'); assert.equal(r.snapshot, null);
  assert.equal(f.calls.at(-1)[0], 'close');
});

for (const mode of ['first-read', 'second-read', 'close', 'timeout', 'cancel', 'pre-abort']) test('provider failure/late data is held and resources close: ' + mode, async () => {
  const f = seedFixture(), c = new AbortController(); let n = 0, finish, entered, closed = 0;
  const waiting = new Promise(resolve => { entered = resolve; });
  f.source.readSnapshot = async () => {
    n++;
    if (mode === 'first-read' || (mode === 'second-read' && n === 2)) throw new Error('synthetic-secret-marker');
    if (['timeout', 'cancel'].includes(mode)) { entered(); return new Promise(resolve => { finish = resolve; }); }
    return structuredClone(f.input);
  };
  f.source.close = () => { closed++; if (mode === 'close') throw new Error('synthetic-secret-marker'); };
  const provider = f.provider(); if (mode === 'pre-abort') c.abort();
  const pending = collectSyntheticLearningEvidence(f.compiled, f.trusted, provider, { now: f.now, signal: c.signal,
    timeoutMs: mode === 'timeout' ? 20 : 1000 });
  if (mode === 'cancel') { await waiting; c.abort(); }
  const r = await pending; assert.equal(r.status, 'ON_HOLD'); assert.equal(r.snapshot, null); assert.equal(closed, 1);
  assert.ok(!JSON.stringify(r).includes('synthetic-secret-marker'));
  if (mode === 'pre-abort') assert.equal(n, 0);
  if (finish) { finish(structuredClone(f.input)); await new Promise(resolve => setImmediate(resolve)); }
  await assert.rejects(provider.readPage({ pageId: 'seed-0' }), /SEED_PROVIDER_CLOSED/);
});

test('provider paginates the fixed projection without altering the denominator', async () => {
  const policy = draft(); policy.requiredLectureIds = Array.from({ length: 101 }, (_, i) => 'lecture-' + i);
  const f = seedFixture({ compiled: compileSyntheticPolicy(policy) }), bundle = f.project();
  assert.equal(bundle.pages.length, 2); assert.equal(bundle.pages[0].records.length, 100);
  assert.equal(bundle.pages[1].records.length, 1);
  const r = await f.run(); assert.equal(r.status, 'COMPLETE_SYNTHETIC'); assert.equal(r.snapshot.records.length, 101);
  assert.equal(evaluate(f, r).status, 'NOT_YET_MET'); assert.equal(evaluate(f, r).requiredCount, 101);
});

test('application/learner mismatch cannot reach source acquisition', async () => {
  for (const field of ['applicationId', 'learnerId']) {
    const f = seedFixture(); f.trusted[field] = field === 'applicationId' ? '0x' + '00'.repeat(32) : 'other-learner';
    const r = await f.run(); assert.equal(r.status, 'ON_HOLD'); assert.equal(r.snapshot, null);
    assert.deepEqual(f.calls.map(c => c[0]), ['close']);
  }
});

test('same version activity remapping changes the pin; mutation after provider creation cannot replace its binding', async () => {
  const f = seedFixture(), provider = f.provider();
  [f.binding.activities[0].activityId, f.binding.activities[1].activityId] =
    [f.binding.activities[1].activityId, f.binding.activities[0].activityId];
  assert.equal((await f.run()).reason, 'LEARNING_VERSION_CHANGED');
  const r = await collectSyntheticLearningEvidence(f.compiled, f.trusted, provider, { now: f.now });
  assert.equal(r.status, 'COMPLETE_SYNTHETIC');
});

test('expiry during seed cleanup cannot yield a stale successful snapshot', async () => {
  const f = seedFixture(); f.source.close = () => f.setTime(BigInt(f.now()) + 301n);
  const r = await f.run(); assert.equal(r.status, 'ON_HOLD'); assert.equal(r.reason, 'LEARNING_STALE');
  assert.equal(r.snapshot, null);
});
