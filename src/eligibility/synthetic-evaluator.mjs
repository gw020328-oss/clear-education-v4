import { MAX_LECTURES, requireCompiledPolicy } from '../policy/compiler.mjs';
import { RuleError, array, calendarDate, canonical, exactKeys, freeze, identifier, requireRule, timestamp } from '../policy/values.mjs';

export const EVALUATOR_VERSION = 'synthetic-eligibility.1';
const MAX_EXAMS = 100;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function snapshot(value, context, kind) {
  const extra = kind === 'EXAM' ? ['sourcePolicySetHash'] : [];
  exactKeys(value, ['dataMode', 'policyHash', 'learnerId', 'snapshotVersion', 'observedAt', 'completeSnapshot', 'records', ...extra], kind + '_SCHEMA');
  requireRule(value.dataMode === 'SYNTHETIC' && value.policyHash === context.compiled.policyHash
    && identifier(value.learnerId, kind + '_LEARNER') === context.learnerId, kind + '_CONTEXT');
  const snapshotVersion = identifier(value.snapshotVersion, kind + '_VERSION');
  timestamp(value.observedAt, kind + '_OBSERVED_AT');
  requireRule(typeof value.completeSnapshot === 'boolean', kind + '_COMPLETENESS');
  requireRule(value.completeSnapshot, kind + '_INCOMPLETE');
  array(value.records, kind === 'EXAM' ? MAX_EXAMS : MAX_LECTURES * 2, kind + '_RECORDS');
  return snapshotVersion;
}

function examIdentity(value, withScore) {
  exactKeys(value, ['examKey', 'examType', 'examDate', ...(withScore ? ['totalScore'] : [])], 'EXAM_RECORD_SCHEMA');
  const identity = { examKey: identifier(value.examKey, 'EXAM_KEY'),
    examType: value.examType, examDate: calendarDate(value.examDate, 'EXAM_DATE') };
  requireRule(identity.examType === 'TOEIC_LR', 'EXAM_TYPE');
  if (withScore) requireRule(Number.isInteger(value.totalScore) && value.totalScore >= 10
    && value.totalScore <= 990 && value.totalScore % 5 === 0, 'EXAM_SCORE');
  return identity;
}

function assessExams(input, context) {
  const version = snapshot(input, context, 'EXAM'), policy = context.compiled.policy;
  requireRule(input.sourcePolicySetHash === policy.sourcePolicySetHash, 'EXAM_SOURCE_POLICY');
  const unique = new Map();
  for (const row of input.records) {
    exactKeys(row, ['status', 'registration', 'score'], 'EXAM_RECORD_SCHEMA');
    requireRule(['VALID', 'INVALID'].includes(row.status), 'EXAM_STATUS');
    const registration = examIdentity(row.registration, false), score = examIdentity(row.score, true);
    requireRule(canonical(registration) === canonical(score), 'EXAM_PAIR_MISMATCH');
    requireRule(BigInt(Date.parse(score.examDate + 'T00:00:00+09:00') / 1000) <= BigInt(input.observedAt), 'EXAM_OBSERVED_AT');
    const record = { ...score, totalScore: row.score.totalScore, status: row.status };
    const previous = unique.get(score.examKey);
    requireRule(!previous || canonical(previous) === canonical(record), 'EXAM_CONFLICT');
    unique.set(score.examKey, record);
  }
  const candidates = [...unique.values()].filter(row => row.status === 'VALID'
    && row.examDate >= policy.examDateStart && row.examDate <= policy.examDateEnd);
  // A tie selects the earliest exam date, then the NFC opaque exam key.
  candidates.sort((a, b) => b.totalScore - a.totalScore || compare(a.examDate, b.examDate) || compare(a.examKey, b.examKey));
  const selected = candidates[0];
  return { version, met: Boolean(selected && selected.totalScore >= policy.minScore),
    selectedExamKey: selected?.examKey ?? null, highestScoreAssessed: true,
    reason: selected ? (selected.totalScore >= policy.minScore ? null : 'SCORE_BELOW_THRESHOLD') : 'NO_VALID_EXAM_IN_PERIOD' };
}

function assessLearning(input, context) {
  const version = snapshot(input, context, 'SEED'), policy = context.compiled.policy;
  requireRule(version === context.expectedSeedSnapshotVersion, 'SEED_VERSION_CHANGED');
  const required = new Set(policy.requiredLectureIds), unique = new Map();
  for (const row of input.records) {
    exactKeys(row, ['lectureId', 'completed', 'completedAt'], 'SEED_RECORD_SCHEMA');
    const lectureId = identifier(row.lectureId, 'SEED_LECTURE');
    requireRule(typeof row.completed === 'boolean', 'SEED_COMPLETED');
    if (row.completed) {
      timestamp(row.completedAt, 'SEED_COMPLETED_AT');
      requireRule(BigInt(row.completedAt) <= BigInt(input.observedAt), 'SEED_OBSERVED_AT');
    } else requireRule(row.completedAt === null, 'SEED_COMPLETED_AT');
    if (!required.has(lectureId)) continue;
    const record = { lectureId, completed: row.completed, completedAt: row.completedAt };
    const previous = unique.get(lectureId);
    requireRule(!previous || canonical(previous) === canonical(record), 'SEED_CONFLICT');
    unique.set(lectureId, record);
  }
  requireRule(required.size > 0, 'SEED_ZERO_DENOMINATOR');
  requireRule([...required].every(id => unique.has(id)), 'SEED_MISSING_REQUIRED');
  const completedCount = [...unique.values()].filter(row => row.completed
    && BigInt(row.completedAt) >= BigInt(policy.learningStart)
    && BigInt(row.completedAt) <= BigInt(policy.learningEnd)).length;
  const met = BigInt(completedCount) * 10000n >= BigInt(required.size) * BigInt(policy.minCompletionBps);
  return { version, met, completedCount, requiredCount: required.size, reason: met ? null : 'LEARNING_BELOW_THRESHOLD' };
}

function attempt(fn) {
  try { return fn(); }
  catch (error) {
    if (!(error instanceof RuleError)) throw error;
    return { held: true, reason: error.message, met: null, version: null };
  }
}

// Internal synthetic inputs only. A caller-supplied VALID/completeSnapshot is
// not a verified proof. There is intentionally no live adapter or payment path.
export function evaluateSyntheticEligibility(compiled, input) {
  const policy = requireCompiledPolicy(compiled);
  exactKeys(input, ['learnerId', 'expectedSeedSnapshotVersion', 'exams', 'learning'], 'EVALUATION_SCHEMA');
  const context = { compiled, learnerId: identifier(input.learnerId, 'LEARNER_ID'),
    expectedSeedSnapshotVersion: identifier(input.expectedSeedSnapshotVersion, 'SEED_VERSION') };
  const exam = attempt(() => assessExams(input.exams, context));
  const learning = attempt(() => assessLearning(input.learning, context));
  const held = exam.held || learning.held;
  return freeze({ evaluatorVersion: EVALUATOR_VERSION, policyHash: compiled.policyHash,
    policyVersion: policy.policyVersion, dataMode: 'SYNTHETIC', paymentAllowed: false,
    status: held ? 'ON_HOLD' : exam.met && learning.met ? 'ELIGIBLE' : 'NOT_YET_MET',
    reasons: [exam.reason, learning.reason].filter(Boolean).sort(),
    examSnapshotVersion: exam.version, seedSnapshotVersion: learning.version,
    highestScoreAssessed: exam.highestScoreAssessed ?? false,
    selectedExamKey: exam.selectedExamKey ?? null, scoreMet: exam.met, learningMet: learning.met,
    completedCount: learning.completedCount ?? null, requiredCount: policy.requiredLectureIds.length });
}
