import { array, calendarDate, canonical, decimal, exactKeys, freeze, hash, hash32, identifier, requireRule, timestamp } from './values.mjs';

export const COMPILER_VERSION = 'course-policy-synthetic.1';
export const COMPLETION_RULE_VERSION = 'seed-required-completed-in-period.1';
export const MAX_LECTURES = 10000;
const compiledPolicies = new WeakSet();
const keys = ['schemaVersion', 'cohortId', 'policyVersion', 'dataMode', 'examType',
  'minScore', 'minCompletionBps', 'examDateStart', 'examDateEnd', 'learningStart',
  'learningEnd', 'requiredLectureIds', 'completionRuleVersion', 'enrollmentStart',
  'enrollmentUntil', 'normalSubmitFrom', 'normalSubmitAt', 'amount', 'tokenDecimals',
  'sourcePolicySetHash', 'privacyNoticeVersion'];

// This is a synthetic compilation unit, not a policy publication API. No
// runtime, deployment, wallet consent or production approval is manufactured.
export function compileSyntheticPolicy(draft) {
  exactKeys(draft, keys, 'POLICY_SCHEMA');
  requireRule(draft.schemaVersion === 4 && draft.dataMode === 'SYNTHETIC'
    && draft.examType === 'TOEIC_LR', 'POLICY_PROFILE');
  requireRule(draft.minScore === 800 && draft.minCompletionBps === 8000, 'POLICY_THRESHOLDS');
  requireRule(draft.completionRuleVersion === COMPLETION_RULE_VERSION, 'COMPLETION_RULE_VERSION');
  const policy = { ...draft };
  for (const field of ['cohortId', 'privacyNoticeVersion']) policy[field] = identifier(draft[field], 'POLICY_IDENTIFIER');
  policy.policyVersion = decimal(draft.policyVersion, 'POLICY_VERSION');
  requireRule(BigInt(policy.policyVersion) > 0n, 'POLICY_VERSION');
  for (const field of ['examDateStart', 'examDateEnd']) policy[field] = calendarDate(draft[field], 'POLICY_DATE');
  for (const field of ['learningStart', 'learningEnd', 'enrollmentStart', 'enrollmentUntil', 'normalSubmitFrom', 'normalSubmitAt']) {
    policy[field] = timestamp(draft[field], 'POLICY_TIME');
  }
  requireRule(policy.examDateStart <= policy.examDateEnd
    && BigInt(policy.learningStart) <= BigInt(policy.learningEnd)
    && BigInt(policy.enrollmentStart) <= BigInt(policy.enrollmentUntil)
    && BigInt(policy.enrollmentUntil) <= BigInt(policy.normalSubmitAt)
    && BigInt(policy.normalSubmitFrom) <= BigInt(policy.normalSubmitAt)
    && BigInt(policy.learningEnd) <= BigInt(policy.normalSubmitAt), 'POLICY_PERIOD');
  const examEndInSeoul = BigInt(Date.parse(policy.examDateEnd + 'T23:59:59+09:00') / 1000);
  requireRule(examEndInSeoul <= BigInt(policy.normalSubmitAt), 'POLICY_PERIOD');
  policy.supplementEndAt = timestamp(String(BigInt(policy.normalSubmitAt) + 259200n), 'POLICY_TIME');
  policy.claimUntil = timestamp(String(BigInt(policy.normalSubmitAt) + 864000n), 'POLICY_TIME');
  policy.amount = decimal(draft.amount, 'POLICY_AMOUNT');
  requireRule(BigInt(policy.amount) > 0n, 'POLICY_AMOUNT');
  requireRule(Number.isInteger(draft.tokenDecimals) && draft.tokenDecimals >= 0 && draft.tokenDecimals <= 18, 'TOKEN_DECIMALS');
  policy.sourcePolicySetHash = hash32(draft.sourcePolicySetHash, 'SOURCE_POLICY_HASH');
  array(draft.requiredLectureIds, MAX_LECTURES, 'REQUIRED_LECTURES');
  requireRule(draft.requiredLectureIds.length > 0, 'REQUIRED_LECTURES_EMPTY');
  policy.requiredLectureIds = draft.requiredLectureIds.map(id => identifier(id, 'LECTURE_ID')).sort();
  requireRule(new Set(policy.requiredLectureIds).size === policy.requiredLectureIds.length, 'DUPLICATE_LECTURE');
  const result = freeze({ compilerVersion: COMPILER_VERSION, policy,
    canonicalJson: canonical(policy), policyHash: hash(policy),
    requiredLectureIdsHash: hash(policy.requiredLectureIds), publishable: false });
  compiledPolicies.add(result);
  return result;
}

export function requireCompiledPolicy(compiled) {
  requireRule(compiledPolicies.has(compiled), 'COMPILED_POLICY_REQUIRED');
  return compiled.policy;
}
