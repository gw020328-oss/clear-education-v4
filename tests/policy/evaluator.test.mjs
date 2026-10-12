import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSyntheticEligibility as evaluate } from '../../src/eligibility/synthetic-evaluator.mjs';
import { draft, epoch, exam, fixture } from './fixture.mjs';

test('800 AND exactly 4/5 qualifies only as a synthetic result', () => {
  const { compiled, input } = fixture(), result = evaluate(compiled, input);
  assert.equal(result.status, 'ELIGIBLE');
  assert.equal(result.paymentAllowed, false);
  assert.equal(result.dataMode, 'SYNTHETIC');
  assert.equal(result.completedCount, 4);
  assert.equal(result.requiredCount, 5);
  assert.equal(result.seedSnapshotVersion, 'snapshot-1');
  assert.equal(result.examSnapshotVersion, 'snapshot-1');
  assert.equal(result.policyHash, compiled.policyHash);
  assert.equal(result.evaluatorVersion, 'synthetic-eligibility.1');
  assert.deepEqual(result.reasons, []);
});

for (const [score, completed, status] of [[795, 4, 'NOT_YET_MET'], [800, 3, 'NOT_YET_MET'],
  [795, 3, 'NOT_YET_MET'], [800, 4, 'ELIGIBLE'], [990, 5, 'ELIGIBLE']]) {
  test(`AND boundary ${score}, ${completed}/5`, () => {
    const { compiled, input } = fixture();
    input.exams.records = [exam('exam', score)];
    input.learning.records.forEach((row, i) => {
      row.completed = i < completed; row.completedAt = row.completed ? epoch('2020-01-15T00:00:00Z') : null;
    });
    assert.equal(evaluate(compiled, input).status, status);
  });
}

test('79.99 percent is below threshold without rounded percentage arithmetic', () => {
  const policy = draft(); policy.requiredLectureIds = Array.from({ length: 10000 }, (_, i) => 'lecture-' + i);
  const { compiled, input } = fixture(policy);
  input.learning.records.forEach((row, i) => { row.completed = i < 7999; row.completedAt = row.completed ? compiled.policy.learningStart : null; });
  assert.equal(evaluate(compiled, input).status, 'NOT_YET_MET');
  input.learning.records[7999].completed = true;
  input.learning.records[7999].completedAt = compiled.policy.learningStart;
  assert.equal(evaluate(compiled, input).status, 'ELIGIBLE');
});

test('highest single total ignores out-of-period and invalid exams with deterministic ties', () => {
  const { compiled, input } = fixture();
  input.exams.records = [exam('later', 850, '2020-01-20'), exam('b', 850), exam('a', 850),
    exam('before', 990, '2019-12-31'), exam('after', 990, '2020-02-01'), { ...exam('invalid', 990), status: 'INVALID' }];
  const result = evaluate(compiled, input);
  assert.equal(result.selectedExamKey, 'a');
  assert.equal(result.highestScoreAssessed, true);
  input.exams.records.reverse(); input.learning.records.reverse();
  assert.deepEqual(evaluate(compiled, input), result);
});

test('a later lower score does not replace the highest valid total', () => {
  const { compiled, input } = fixture();
  input.exams.records = [exam('earlier', 850, '2020-01-10'), exam('later', 790, '2020-01-20')];
  const result = evaluate(compiled, input);
  assert.equal(result.status, 'ELIGIBLE');
  assert.equal(result.selectedExamKey, 'earlier');
});

for (const date of ['2020-01-01', '2020-01-31']) test(`exam date ${date} is inclusive`, () => {
  const { compiled, input } = fixture(); input.exams.records = [exam('exam', 800, date)];
  assert.equal(evaluate(compiled, input).status, 'ELIGIBLE');
});

for (const date of ['2019-12-31', '2020-02-01']) test(`exam date ${date} is excluded`, () => {
  const { compiled, input } = fixture(); input.exams.records = [exam('exam', 990, date)];
  const result = evaluate(compiled, input);
  assert.equal(result.status, 'NOT_YET_MET'); assert.equal(result.selectedExamKey, null);
  assert.ok(result.reasons.includes('NO_VALID_EXAM_IN_PERIOD'));
});

for (const [boundary, offset, expected] of [['learningStart', 0n, 'ELIGIBLE'], ['learningEnd', 0n, 'ELIGIBLE'],
  ['learningStart', -1n, 'NOT_YET_MET'], ['learningEnd', 1n, 'NOT_YET_MET']]) test(`learning ${boundary} offset ${offset}`, () => {
  const { compiled, input } = fixture(); input.learning.records[0].completedAt = String(BigInt(compiled.policy[boundary]) + offset);
  assert.equal(evaluate(compiled, input).status, expected);
});

test('identical duplicate records count once and nonrequired lectures cannot inflate completion', () => {
  const { compiled, input } = fixture();
  const before = evaluate(compiled, input);
  input.exams.records.push(structuredClone(input.exams.records[0]));
  input.learning.records.push(structuredClone(input.learning.records[0]));
  input.learning.records.push({ lectureId: 'optional', completed: true, completedAt: compiled.policy.learningStart });
  assert.deepEqual(evaluate(compiled, input), before);
  input.learning.records[1] = { ...input.learning.records[1], completed: false, completedAt: null };
  assert.equal(evaluate(compiled, input).status, 'NOT_YET_MET');
});

for (const [label, change, code] of [
  ['incomplete exam list even with 800', i => { i.exams.completeSnapshot = false; }, 'EXAM_INCOMPLETE'],
  ['missing exam response', i => { i.exams = null; }, 'EXAM_SCHEMA'],
  ['incomplete seed', i => { i.learning.completeSnapshot = false; }, 'SEED_INCOMPLETE'],
  ['missing required lecture', i => { i.learning.records.pop(); }, 'SEED_MISSING_REQUIRED'],
  ['string completeness', i => { i.exams.completeSnapshot = 'true'; }, 'EXAM_COMPLETENESS'],
  ['sparse records', i => { i.learning.records = new Array(5); }, 'SEED_RECORDS'],
  ['too many exams', i => { i.exams.records = Array.from({ length: 101 }, () => exam()); }, 'EXAM_RECORDS'],
  ['unknown completion', i => { i.learning.records[0].completed = null; }, 'SEED_COMPLETED'],
  ['missing completion time', i => { i.learning.records[0].completedAt = null; }, 'SEED_COMPLETED_AT'],
  ['false with completion time', i => { i.learning.records[0].completed = false; }, 'SEED_COMPLETED_AT'],
  ['seed correction conflict', i => { i.learning.records.push({ ...i.learning.records[0], completed: false, completedAt: null }); }, 'SEED_CONFLICT'],
  ['seed timestamp conflict', i => { i.learning.records.push({ ...i.learning.records[0], completedAt: '1' }); }, 'SEED_CONFLICT'],
  ['seed observed too early', i => { i.learning.observedAt = '1'; }, 'SEED_OBSERVED_AT'],
  ['exam observed too early', i => { i.exams.observedAt = '1'; }, 'EXAM_OBSERVED_AT'],
  ['exam correction conflict', i => { i.exams.records.push(exam('synthetic-exam-a', 795)); }, 'EXAM_CONFLICT'],
  ['exam invalidation conflict', i => { i.exams.records.push({ ...exam(), status: 'INVALID' }); }, 'EXAM_CONFLICT'],
  ['different registration key', i => { i.exams.records[0].registration.examKey = 'other'; }, 'EXAM_PAIR_MISMATCH'],
  ['different registration date', i => { i.exams.records[0].registration.examDate = '2020-01-16'; }, 'EXAM_PAIR_MISMATCH'],
  ['other exam type', i => { i.exams.records[0].score.examType = 'OTHER'; }, 'EXAM_TYPE'],
  ['score missing', i => { delete i.exams.records[0].score.totalScore; }, 'EXAM_RECORD_SCHEMA'],
  ['string score', i => { i.exams.records[0].score.totalScore = '800'; }, 'EXAM_SCORE'],
  ['fractional score', i => { i.exams.records[0].score.totalScore = 799.99; }, 'EXAM_SCORE'],
  ['excess score', i => { i.exams.records[0].score.totalScore = 995; }, 'EXAM_SCORE'],
  ['LC/RC mix fields', i => { Object.assign(i.exams.records[0].score, { lc: { examKey: 'a', score: 400 }, rc: { examKey: 'b', score: 400 } }); }, 'EXAM_RECORD_SCHEMA'],
  ['source hash mismatch', i => { i.exams.sourcePolicySetHash = '0x' + '00'.repeat(32); }, 'EXAM_SOURCE_POLICY'],
  ['seed version changed', i => { i.learning.snapshotVersion = 'snapshot-2'; }, 'SEED_VERSION_CHANGED'],
  ['seed real mode', i => { i.learning.dataMode = 'REAL_YBM'; }, 'SEED_CONTEXT'],
  ['exam real mode', i => { i.exams.dataMode = 'REAL_YBM'; }, 'EXAM_CONTEXT'],
  ['wrong seed learner', i => { i.learning.learnerId = 'other'; }, 'SEED_CONTEXT'],
  ['wrong exam learner', i => { i.exams.learnerId = 'other'; }, 'EXAM_CONTEXT'],
  ['wrong seed policy', i => { i.learning.policyHash = 'other'; }, 'SEED_CONTEXT'],
  ['wrong exam policy', i => { i.exams.policyHash = 'other'; }, 'EXAM_CONTEXT'],
]) test(`evaluation holds ${label}`, () => {
  const { compiled, input } = fixture(); change(input);
  const result = evaluate(compiled, input);
  assert.equal(result.status, 'ON_HOLD'); assert.ok(result.reasons.includes(code));
  assert.equal(result.paymentAllowed, false);
});

test('two subthreshold totals are never combined into a passing score', () => {
  const { compiled, input } = fixture(); input.exams.records = [exam('a', 795), exam('b', 795)];
  assert.equal(evaluate(compiled, input).status, 'NOT_YET_MET');
});

test('empty complete exam list is not yet met; missing data overrides unmet conditions', () => {
  const { compiled, input } = fixture(); input.exams.records = [];
  assert.equal(evaluate(compiled, input).status, 'NOT_YET_MET');
  input.learning.records = [];
  assert.equal(evaluate(compiled, input).status, 'ON_HOLD');
});

test('corrections require re-evaluation with the new pinned seed version', () => {
  const { compiled, input } = fixture(); const before = evaluate(compiled, input);
  input.learning.snapshotVersion = 'snapshot-2';
  input.learning.records[0] = { ...input.learning.records[0], completed: false, completedAt: null };
  assert.equal(evaluate(compiled, input).status, 'ON_HOLD');
  input.expectedSeedSnapshotVersion = 'snapshot-2';
  const after = evaluate(compiled, input);
  assert.equal(after.status, 'NOT_YET_MET'); assert.equal(after.seedSnapshotVersion, 'snapshot-2');
  assert.equal(before.status, 'ELIGIBLE'); assert.equal(before.seedSnapshotVersion, 'snapshot-1');
});

test('same inputs give identical bytes with no mutation, time or randomness dependency', () => {
  const { compiled, input } = fixture(), before = structuredClone(input);
  const expected = JSON.stringify(evaluate(compiled, input));
  for (let n = 0; n < 20; n++) assert.equal(JSON.stringify(evaluate(compiled, structuredClone(input))), expected);
  assert.deepEqual(input, before);
});

test('altered or deserialized policy cannot bypass validation, including denominator zero', () => {
  const { compiled, input } = fixture();
  const forged = structuredClone(compiled); forged.policy.requiredLectureIds = [];
  assert.throws(() => evaluate(forged, input), { message: 'COMPILED_POLICY_REQUIRED' });
});

test('errors return fixed codes without echoing malformed record content', () => {
  const { compiled, input } = fixture(); input.learning.records[0].completedAt = 'synthetic-private-marker';
  const output = JSON.stringify(evaluate(compiled, input));
  assert.ok(!output.includes('synthetic-private-marker'));
  assert.ok(output.includes('SEED_COMPLETED_AT'));
});
