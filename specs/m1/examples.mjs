// Reviewed synthetic configuration examples. These do not finalize academy terms.
import { CONTRACT_VERSION, digest } from '../../src/policy/mvp/contract.mjs';
import { compileMvpPolicy } from '../../src/policy/mvp/compiler.mjs';
export const T = 1898521200; // 2030-03-01 00:00 KST
const day = 86400;
const period = (from, until) => ({ from, until, boundaries: '[from,until)', timeZone: 'Asia/Seoul' });
export function exampleDraft(name = 'ybm') {
  const siwon = name === 'siwon', third = name === 'third';
  if (!['ybm', 'siwon', 'third'].includes(name)) throw new Error('EXAMPLE_PROFILE');
  const productId = third ? 'third-synthetic-700' : name + '-750-demo', institutionId = 'synthetic-' + name;
  const days = siwon ? 100 : third ? 14 : 90, threshold = siwon ? 6000 : third ? 8000 : 9000;
  const source = { sourceId: name + '-synthetic-terms', institutionId, productId, cohortId: 'demo-2030',
    capturedAt: T, origin: 'SYNTHETIC_ASSUMPTION', rawHash: digest('CLEAR-MVP-EXAMPLE-TERMS', { name, days, threshold }),
    normalizedHash: null, normalizerVersion: null, applicability: 'SYNTHETIC_ONLY',
    locators: ['S-1/S-2/S-3 synthetic agreement', 'S-8 synthetic selection and amount', 'Synthetic baseline 730 days; target 750', 'Synthetic third profile'] };
  const sources = [source];
  if (!third) sources.push({ sourceId: name + '-snapshot-20261014', institutionId, productId, cohortId: null,
    capturedAt: 1791945020, origin: 'OFFICIAL_SNAPSHOT',
    rawHash: '0x' + (siwon ? '093c3e3f2f12cf46cd3c048ff837fb01a30c58f8b6e575faef58fd405dbff651' : '98133f30b03d1ac7ebcd125caa321527beeae9e08af8fc27137139c258b26b18'),
    normalizedHash: null, normalizerVersion: null, applicability: 'OPEN',
    locators: [siwon ? 'M0 O-S4..O-S8; HTML 3667-3755' : 'M0 O-Y1..O-Y4; HTML 2024-2222'] });
  const refs = sources.map(s => ({ sourceId: s.sourceId, locator: s.locators[0] }));
  const requirements = [], rules = [];
  function req(requirementId, kind, coverage, p, fields) {
    requirements.push({ requirementId, kind, coverage, period: p, maxAgeSeconds: 86400,
      trustProfile: 'synthetic-fixture-verifier.1', requiredFields: fields });
  }
  function rule(ruleId, requirementId, predicate, unit, value = null, n = null) {
    rules.push({ ruleId, requirementId, predicate, unit, threshold: value, days: n,
      basis: 'SYNTHETIC_ASSUMPTION', sourceRefs: structuredClone(refs), questionIds: [] });
  }
  req('score', 'EXAM', 'EXISTENTIAL', period(T, T + days * day), ['score']);
  req('learning', 'LEARNING', 'COMPLETE_PERIOD', period(T, T + days * day), ['daily-summary']);
  req('review', 'REVIEW', 'NOT_REQUIRED', null, ['accepted-review']);
  rule('review-accepted', 'review', 'BOOLEAN', 'BOOLEAN');
  rule('daily-learning', 'learning', siwon ? 'DAILY_PROGRESS' : 'DAILY_TIME', 'BPS', threshold, days);
  const route = (routeId, allRuleIds) => ({ routeId, allRuleIds });
  const tier = (n, alternatives, support = 'CONDITION_AMOUNT') => ({ tier: n, support, alternatives });
  let tiers;
  if (siwon) {
    req('history', 'BASELINE', 'COMPLETE_PERIOD', period(T - 730 * day, T), ['baseline-max-score']);
    req('blog', 'BLOG', 'COMPLETE_PERIOD', period(T, T + days * day), ['blog-source-verified']);
    rule('score-below-750', 'score', 'SCORE_LT', 'SCORE', 750);
    rule('score-750', 'score', 'SCORE_GTE', 'SCORE', 750);
    rule('score-850', 'score', 'SCORE_GTE', 'SCORE', 850);
    rule('score-990', 'score', 'SCORE_EQ', 'SCORE', 990);
    rule('baseline-below-750', 'history', 'BASELINE_LT', 'SCORE', 750);
    rule('blog-verified', 'blog', 'BOOLEAN', 'BOOLEAN');
    tiers = [tier(50, [route('below-target', ['score-below-750'])]),
      tier(100, [route('attendance', ['daily-learning']), route('achievement', ['score-750', 'baseline-below-750'])]),
      tier(200, [route('attendance-score-750', ['daily-learning', 'score-750', 'baseline-below-750'])]),
      tier(300, [route('attendance-score-850', ['daily-learning', 'score-850', 'baseline-below-750'])]),
      tier(400, [route('challenge-precheck', ['daily-learning', 'score-990', 'baseline-below-750', 'blog-verified'])], 'PRECHECK_ONLY')];
  } else {
    req('mock', 'MOCK_TEST', 'NOT_REQUIRED', null, ['completed']);
    rule('mock-completed', 'mock', 'BOOLEAN', 'BOOLEAN');
    rule('score-target', 'score', 'SCORE_GTE', 'SCORE', third ? 700 : 750);
    tiers = [tier(third ? 75 : 100, [route('single-route', ['daily-learning', 'score-target'])])];
  }
  const allowedActivityIds = Array.from({ length: days }, (_, i) => 'lesson-' + (i + 1));
  return { contractVersion: CONTRACT_VERSION, mode: 'SYNTHETIC', policyVersion: 'm1-' + name + '-demo.1',
    productId, institutionId, cohortId: 'demo-2030', ruleVersion: 'clear-mvp-rules.1', sources, questions: [], requirements, rules,
    commonRuleIds: siwon ? ['review-accepted'] : ['review-accepted', 'mock-completed'], tiers,
    capabilities: { profileVersion: name + '-demo-capabilities.1', conditionAmountTiers: siwon ? [50, 100, 200, 300] : [third ? 75 : 100],
      precheckOnlyTiers: siwon ? [400] : [], excludedTiers: [500] },
    learningRules: [{ requirementId: 'learning', metric: siwon ? 'OFFICIAL_PROGRESS' : 'EFFECTIVE_TIME_RATIO',
      thresholdBps: threshold, days, allowedActivityIds, activitySetHash: digest('CLEAR-MVP-ACTIVITIES', allowedActivityIds),
      metricRuleVersion: 'synthetic-metric.1', dateAttributionRuleVersion: 'synthetic-finish-kst.1', uniqueDay: true,
      lectureReuse: 'FORBIDDEN', normalCloseRequired: true, speedPolicy: siwon ? 'PROVIDER_COMPLIANT' : 'NOT_REQUIRED', deliveryMode: 'STREAMING_ONLY' }],
    amount: siwon ? { kind: 'SIWON_DEMO', inputs: { basis: 'SYNTHETIC_ASSUMPTION', token: 'TEST', decimals: 6,
      paidAtoms: '100000000', bookAtoms: '10000000', deviceAtoms: '0', fixedFeeAtoms: '2000000', examCreditAtoms: '0',
      taxBps: 2200, capAtoms: '300000000', rounding: 'FLOOR_ONCE_DEMO', formulaVersion: 'siwon-demo-amount.1' } }
      : { kind: 'FIXED_SYNTHETIC_NET', basis: 'SYNTHETIC_ASSUMPTION', token: 'TEST', decimals: 6, netAtoms: third ? '42000000' : '100000000' },
    deadlines: { evidenceFrom: T, evidenceUntil: T + days * day, supplementUntil: T + (days + 1) * day,
      finalizeUntil: T + (days + 2) * day, allocationUntil: T + (days + 3) * day, claimUntil: T + (days + 10) * day, minClaimWindowSeconds: 7 * day },
    selection: { officialRule: 'OPEN', syntheticRule: 'EXPLICIT_SINGLE_TIER_NO_TOPUP' } };
}
export function compileExample(name) {
  const draft = exampleDraft(name);
  return compileMvpPolicy(draft, { sources: structuredClone(draft.sources), capabilities: structuredClone(draft.capabilities) });
}
export function exampleBinding(compiled) {
  const p = compiled.policy;
  return { applicationId: digest('SYNTHETIC-APPLICATION', p.productId), subjectRef: digest('SYNTHETIC-SUBJECT', 'student'),
    subjectBindingId: 'synthetic-binding', bindingRevision: 1, recipientRef: 'synthetic-recipient', instanceId: 'synthetic-instance',
    policyHash: compiled.policyHash, policyVersion: p.policyVersion, productId: p.productId, cohortId: p.cohortId };
}
export const exampleSourceBinding = () => ({ institutionId: 'synthetic-lab', providerInstanceId: 'synthetic-provider',
  courseId: 'synthetic-course', sourceAccountRef: 'opaque-synthetic-account', accountBindingId: 'synthetic-account-binding', accountBindingVersion: 'binding.1' });
