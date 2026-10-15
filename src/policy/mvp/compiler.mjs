import { freeze, requireRule as check } from '../values.mjs';
import { quoteBenefitAmount } from '../benefit-amount.mjs';
import { validateContract, digest, same, unique, validPeriod } from './contract.mjs';
export const COMPILER_VERSION = 'clear-mvp-compiler.1';
const compiled = new WeakSet();
const kinds = { SCORE_LT: ['EXAM', 'SCORE'], SCORE_GTE: ['EXAM', 'SCORE'], SCORE_EQ: ['EXAM', 'SCORE'],
  BASELINE_LT: ['BASELINE', 'SCORE'], DAILY_TIME: ['LEARNING', 'BPS'], DAILY_PROGRESS: ['LEARNING', 'BPS'] };

// Caller-owned source/capability pins are SYNTHETIC configuration, not attestations.
// No publication, runtime consent, evidence acceptance or payment authority.
export function compileMvpPolicy(input, { sources, capabilities }) {
  validateContract('PolicyDraft', input);
  const p = structuredClone(input);
  check(p.mode === 'SYNTHETIC', 'MVP_OFFICIAL_BLOCKED');
  check(same(capabilities, p.capabilities), 'MVP_CAPABILITY_PIN');
  const cap = p.capabilities;
  unique([...cap.conditionAmountTiers, ...cap.precheckOnlyTiers, ...cap.excludedTiers]);
  unique(p.sources.map(s => s.sourceId));
  for (const s of p.sources) {
    validateContract('Source', s);
    const pinned = sources.find(v => v.sourceId === s.sourceId);
    check(pinned && same(s, pinned), 'MVP_SOURCE_PIN');
    check(s.productId === p.productId && s.institutionId === p.institutionId && (s.cohortId === null || s.cohortId === p.cohortId), 'MVP_SOURCE_SCOPE');
    check((s.normalizedHash === null) === (s.normalizerVersion === null), 'MVP_NORMALIZER');
    unique(s.locators);
    check(s.origin === 'SYNTHETIC_ASSUMPTION' ? s.applicability === 'SYNTHETIC_ONLY' : s.applicability === 'OPEN', 'MVP_SOURCE_SCOPE');
  }
  const usedSources = new Set();
  const refs = xs => {
    unique(xs.map(x => x.sourceId + ':' + x.locator));
    for (const x of xs) {
      const s = p.sources.find(s => s.sourceId === x.sourceId);
      check(s?.locators.includes(x.locator), 'MVP_SOURCE_LOCATOR'); usedSources.add(s.sourceId);
    }
  };
  unique(p.questions.map(q => q.questionId));
  for (const q of p.questions) {
    refs(q.sourceRefs);
    check(q.status === 'RESOLVED_SYNTHETIC' && q.resolution !== null, 'MVP_QUESTION_OPEN');
  }
  const reqs = new Map(p.requirements.map(r => [r.requirementId, r]));
  check(reqs.size === p.requirements.length, 'MVP_DUPLICATE');
  for (const r of p.requirements) {
    unique(r.requiredFields); validPeriod(r.period);
    check(r.coverage !== 'COMPLETE_PERIOD' || r.period !== null, 'MVP_COVERAGE');
    if (['BASELINE', 'LEARNING'].includes(r.kind)) check(r.coverage === 'COMPLETE_PERIOD', 'MVP_COVERAGE');
  }
  unique(p.rules.map(r => r.ruleId));
  for (const r of p.rules) {
    const req = reqs.get(r.requirementId); check(req, 'MVP_REQUIREMENT'); refs(r.sourceRefs); unique(r.questionIds);
    check(r.basis === 'SYNTHETIC_ASSUMPTION', 'MVP_RULE_OPEN');
    check(r.sourceRefs.some(x => p.sources.find(s => s.sourceId === x.sourceId).origin === 'SYNTHETIC_ASSUMPTION'), 'MVP_RULE_BASIS');
    check(r.questionIds.every(id => p.questions.some(q => q.questionId === id && q.status === 'RESOLVED_SYNTHETIC')), 'MVP_QUESTION_OPEN');
    if (r.predicate === 'BOOLEAN') check(['MOCK_TEST', 'REVIEW', 'BLOG'].includes(req.kind) && r.unit === 'BOOLEAN' && r.threshold === null && r.days === null, 'MVP_RULE_TYPE');
    else {
      const [kind, unit] = kinds[r.predicate];
      check(req.kind === kind && r.unit === unit && r.threshold !== null, 'MVP_RULE_TYPE');
      check(unit === 'BPS' ? r.days !== null : r.threshold <= 990 && r.days === null, 'MVP_RULE_TYPE');
    }
  }
  check(p.requirements.every(req => p.rules.some(r => r.requirementId === req.requirementId)), 'MVP_UNUSED_REQUIREMENT');
  const ruleIds = new Set(p.rules.map(r => r.ruleId)), used = new Set(p.commonRuleIds);
  unique(p.commonRuleIds); check(p.commonRuleIds.every(id => ruleIds.has(id)), 'MVP_RULE_REF');
  unique(p.tiers.map(t => t.tier)); unique(p.tiers.flatMap(t => t.alternatives.map(a => a.routeId)));
  for (const t of p.tiers) {
    check((t.support === 'PRECHECK_ONLY' ? cap.precheckOnlyTiers : cap.conditionAmountTiers).includes(t.tier)
      && !cap.excludedTiers.includes(t.tier), 'MVP_TIER_CAPABILITY');
    for (const a of t.alternatives) {
      unique([...p.commonRuleIds, ...a.allRuleIds]);
      check(a.allRuleIds.every(id => ruleIds.has(id)), 'MVP_RULE_REF'); a.allRuleIds.forEach(id => used.add(id));
    }
  }
  check(used.size === ruleIds.size, 'MVP_UNUSED_RULE');
  check(usedSources.size === p.sources.length, 'MVP_UNUSED_SOURCE');
  unique(p.learningRules.map(l => l.requirementId));
  for (const l of p.learningRules) {
    unique(l.allowedActivityIds); check(digest('CLEAR-MVP-ACTIVITIES', l.allowedActivityIds) === l.activitySetHash, 'MVP_ACTIVITY_HASH');
    const rules = p.rules.filter(r => r.requirementId === l.requirementId);
    check(rules.length === 1 && rules[0].predicate === (l.metric === 'EFFECTIVE_TIME_RATIO' ? 'DAILY_TIME' : 'DAILY_PROGRESS')
      && rules[0].threshold === l.thresholdBps && rules[0].days === l.days, 'MVP_LEARNING_RULE');
    check(l.metric !== 'OFFICIAL_PROGRESS' || l.speedPolicy === 'PROVIDER_COMPLIANT', 'MVP_LEARNING_SEMANTICS');
    const period = reqs.get(l.requirementId).period;
    check(period && period.until - period.from === l.days * 86400 && period.from % 86400 === 54000, 'MVP_LEARNING_PERIOD');
  }
  check(p.requirements.filter(r => r.kind === 'LEARNING').every(r => p.learningRules.some(l => l.requirementId === r.requirementId)), 'MVP_LEARNING_RULE');
  const d = p.deadlines;
  check(d.evidenceFrom < d.evidenceUntil && d.evidenceUntil <= d.supplementUntil && d.supplementUntil < d.finalizeUntil
    && d.finalizeUntil <= d.allocationUntil && d.claimUntil >= d.allocationUntil + d.minClaimWindowSeconds, 'MVP_DEADLINES');
  check(p.requirements.every(r => !r.period || r.period.until <= d.supplementUntil), 'MVP_PERIOD');
  if (p.amount.kind === 'FIXED_SYNTHETIC_NET') check(p.amount.netAtoms === null || BigInt(p.amount.netAtoms) > 0n, 'MVP_AMOUNT');
  else {
    // Arithmetic operator registry contains the reviewed M0 demo formula only.
    for (const t of p.tiers.filter(t => t.support === 'CONDITION_AMOUNT')) {
      const [state] = quoteBenefitAmount(t.tier, p.amount.inputs); check(state !== 'INVALID_AMOUNT', 'MVP_AMOUNT');
    }
  }
  const ruleHashes = Object.fromEntries(p.rules.map(r => [r.ruleId, digest('CLEAR-MVP-RULE', {
    rule: r, requirement: reqs.get(r.requirementId), learningRule: p.learningRules.find(l => l.requirementId === r.requirementId) ?? null,
  })]));
  const result = freeze({ contractVersion: p.contractVersion, compilerVersion: COMPILER_VERSION, policy: p,
    policyHash: digest('CLEAR-MVP-POLICY', { compilerVersion: COMPILER_VERSION, policy: p }),
    sourceSetHash: digest('CLEAR-MVP-SOURCES', p.sources), ruleHashes, publishable: false, paymentAllowed: false });
  compiled.add(result); return result;
}
export function requireMvpPolicy(value) { check(compiled.has(value), 'MVP_COMPILED_REQUIRED'); return value.policy; }
export function quoteMvpAmount(compiled, tier) {
  const p = requireMvpPolicy(compiled), t = p.tiers.find(t => t.tier === tier);
  check(t, 'MVP_TIER_CAPABILITY');
  if (t.support === 'PRECHECK_ONLY') return { state: 'PRECHECK_ONLY', amountAtoms: null };
  if (p.amount.kind === 'SIWON_DEMO') { const [state, amountAtoms] = quoteBenefitAmount(tier, p.amount.inputs); return { state, amountAtoms }; }
  return { state: p.amount.netAtoms === null ? 'AMOUNT_OPEN' : 'CALCULATED_SYNTHETIC', amountAtoms: p.amount.netAtoms };
}
