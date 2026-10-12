import { id } from 'ethers';
import { compileSyntheticPolicy, COMPLETION_RULE_VERSION } from '../../src/policy/compiler.mjs';

// Invented calendar, amount, source policy and identifiers. No approved real
// course, YBM record, wallet or deployment is represented by this fixture.
export const epoch = value => String(Date.parse(value) / 1000);
export function draft() {
  return { schemaVersion: 4, cohortId: 'synthetic-cohort', policyVersion: '1', dataMode: 'SYNTHETIC',
    examType: 'TOEIC_LR', minScore: 800, minCompletionBps: 8000,
    examDateStart: '2020-01-01', examDateEnd: '2020-01-31',
    learningStart: epoch('2020-01-01T00:00:00+09:00'), learningEnd: epoch('2020-01-31T23:59:59+09:00'),
    requiredLectureIds: ['lecture-e', 'lecture-c', 'lecture-a', 'lecture-d', 'lecture-b'],
    completionRuleVersion: COMPLETION_RULE_VERSION,
    enrollmentStart: epoch('2020-02-01T00:00:00Z'), enrollmentUntil: epoch('2020-02-02T00:00:00Z'),
    normalSubmitFrom: epoch('2020-02-02T00:00:00Z'), normalSubmitAt: epoch('2020-02-05T00:00:00Z'),
    amount: '50000000', tokenDecimals: 6, sourcePolicySetHash: id('SYNTHETIC_SOURCE_ONLY'), privacyNoticeVersion: 'fixture-1' };
}
export function exam(examKey = 'synthetic-exam-a', totalScore = 800, examDate = '2020-01-15') {
  const identity = { examKey, examType: 'TOEIC_LR', examDate };
  return { status: 'VALID', registration: { ...identity }, score: { ...identity, totalScore } };
}
export function fixture(policyDraft = draft()) {
  const compiled = compileSyntheticPolicy(policyDraft);
  const shared = { dataMode: 'SYNTHETIC', policyHash: compiled.policyHash, learnerId: 'synthetic-learner',
    snapshotVersion: 'snapshot-1', observedAt: epoch('2020-02-03T00:00:00Z'), completeSnapshot: true };
  const input = { learnerId: shared.learnerId, expectedSeedSnapshotVersion: 'snapshot-1',
    exams: { ...shared, sourcePolicySetHash: compiled.policy.sourcePolicySetHash, records: [exam()] },
    learning: { ...shared, records: compiled.policy.requiredLectureIds.map((lectureId, i) => ({ lectureId,
      completed: i < 4, completedAt: i < 4 ? epoch('2020-01-15T00:00:00Z') : null })) } };
  return { compiled, input };
}
