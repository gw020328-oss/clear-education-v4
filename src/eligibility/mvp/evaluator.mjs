import { freeze, requireRule as check, array } from '../../policy/values.mjs';
import { validateContract, validateShape, digest, same, unique } from '../../policy/mvp/contract.mjs';
import { requireMvpPolicy, quoteMvpAmount } from '../../policy/mvp/compiler.mjs';
import { EVALUATOR_VERSION, evaluationSchema } from './schema.mjs';
export { EVALUATOR_VERSION } from './schema.mjs';
export const validateEvaluationResult = value => validateShape(value, evaluationSchema.$defs.EvaluationResult, evaluationSchema);
const pending = ['UNKNOWN', 'NEEDS_SUPPLEMENT', 'MISSING', 'IN_PROGRESS'];
const all = states => states.includes('NOT_MET') ? 'NOT_MET' : pending.find(s => states.includes(s)) ?? 'MET';
const any = states => states.includes('MET') ? 'MET' : pending.find(s => states.includes(s)) ?? 'NOT_MET';
const result = (state, reason, evidence = null, observationStatus = null) => ({ state, reason,
  evidenceId: evidence?.evidenceId ?? null, evidenceRevision: evidence?.revision ?? null, observationStatus });

// Pure evaluation of caller-pinned synthetic facts, with NO receipt import,
// source verification, ledger mutation, actual eligibility or payment authority.
export function evaluateMvpEligibility(compiled, { context, evidence, selection }) {
  const p = requireMvpPolicy(compiled);
  validateShape(context, evaluationSchema.$defs.EvaluationContext, evaluationSchema);
  validateShape(selection, evaluationSchema.$defs.Selection, evaluationSchema);
  check(same(Object.fromEntries(['policyHash', 'policyVersion', 'productId', 'cohortId'].map(k => [k, context.binding[k]])),
    { policyHash: compiled.policyHash, policyVersion: p.policyVersion, productId: p.productId, cohortId: p.cohortId }), 'MVP_POLICY_BINDING');
  array(evidence, 32, 'MVP_EVIDENCE_LIST');
  for (const e of evidence) validateContract('Evidence', e);
  unique(evidence.map(e => e.evidenceId)); unique(evidence.map(e => e.requirementId));
  unique(context.evidencePins.map(e => e.evidenceId)); unique(context.examPins.map(e => e.evidenceId));
  unique(context.sourceBindings.map(e => e.requirementId));
  check(context.sourceBindings.every(b => p.requirements.some(r => r.requirementId === b.requirementId)), 'MVP_REQUIREMENT');
  for (const e of evidence) {
    check(same(e.binding, context.binding), 'MVP_EVIDENCE_BINDING');
    const req = p.requirements.find(r => r.requirementId === e.requirementId); check(req, 'MVP_REQUIREMENT');
    const pin = context.evidencePins.find(v => v.evidenceId === e.evidenceId);
    check(pin && pin.revision === e.revision && pin.digest === digest('CLEAR-MVP-EVIDENCE', e), 'MVP_EVIDENCE_PIN');
    const sb = context.sourceBindings.find(v => v.requirementId === e.requirementId);
    check(sb && same(sb.sourceBinding, e.sourceBinding), 'MVP_SOURCE_BINDING');
    unique(e.observations.map(o => o.ruleId));
    for (const o of e.observations) {
      const r = p.rules.find(r => r.ruleId === o.ruleId);
      check(r && r.requirementId === e.requirementId && o.ruleHash === compiled.ruleHashes[o.ruleId], 'MVP_OBSERVATION_BINDING');
      check(o.unit === r.unit, 'MVP_OBSERVATION_UNIT');
      if (o.status === 'OBSERVED' && !(e.sourceStatus === 'NO_RECORD' && req.kind === 'BASELINE')) {
        check(o.unit === 'BOOLEAN' ? typeof o.value === 'boolean' && o.days === null
          : Number.isSafeInteger(o.value) && (o.unit === 'SCORE' ? o.value <= 990 && o.days === null
            : o.days !== null && o.days <= r.days), 'MVP_OBSERVATION_VALUE');
      } else check(o.value === null && o.days === null, 'MVP_OBSERVATION_VALUE');
    }
  }
  let firstScoreMismatch = false;
  const rules = p.rules.map(r => {
    const req = p.requirements.find(v => v.requirementId === r.requirementId), e = evidence.find(v => v.requirementId === r.requirementId);
    let evaluated;
    const state = (s, code) => result(s, code, e, e?.observations.find(o => o.ruleId === r.ruleId)?.status ?? null);
    if (!e) evaluated = state('MISSING', 'EVIDENCE_MISSING');
    else if (e.mode !== 'SYNTHETIC' || e.authenticity !== 'VERIFIED_SYNTHETIC' || e.subject !== 'VERIFIED_SYNTHETIC'
      || e.semantics !== 'VERIFIED_SYNTHETIC' || e.trustProfile !== req.trustProfile) evaluated = state('UNKNOWN', 'SOURCE_UNVERIFIED');
    else if (e.correction !== 'CURRENT' || e.sourceRevision === null) evaluated = state('UNKNOWN', 'SOURCE_REVISION_UNKNOWN');
    else if (!['PRESENT', 'NO_RECORD'].includes(e.sourceStatus)) evaluated = state('UNKNOWN', 'SOURCE_UNAVAILABLE');
    else if (e.collectedAt > e.acceptedAt || e.acceptedAt > context.evaluatedAt || e.acceptedAt - e.collectedAt > req.maxAgeSeconds)
      evaluated = state('UNKNOWN', 'ACQUISITION_TIME');
    else if (e.acceptedAt < p.deadlines.evidenceFrom || e.acceptedAt >= p.deadlines.supplementUntil)
      evaluated = state('UNKNOWN', 'SUBMISSION_PERIOD');
    else if (req.coverage === 'COMPLETE_PERIOD' && (e.completeness !== 'COMPLETE_SYNTHETIC' || !same(e.coveredPeriod, req.period)))
      evaluated = state('UNKNOWN', 'COVERAGE_UNKNOWN');
    else {
      const o = e.observations.find(o => o.ruleId === r.ruleId);
      const exam = req.kind === 'EXAM' ? context.examPins.find(v => v.evidenceId === e.evidenceId && v.revision === e.revision) : null;
      if (req.kind === 'EXAM' && (!exam || !context.firstScoreRef || !same(exam.submissionRef, context.firstScoreRef))) {
        firstScoreMismatch = true; evaluated = state('UNKNOWN', 'FIRST_SCORE_MISMATCH');
      } else if (exam && req.period && (exam.eventAt < req.period.from || exam.eventAt >= req.period.until || exam.eventAt > e.collectedAt))
        evaluated = state('UNKNOWN', 'EXAM_PERIOD');
      else if (req.kind === 'LEARNING' && context.evaluatedAt < req.period.until) evaluated = state('IN_PROGRESS', 'FUTURE_DAYS');
      else if (e.sourceStatus === 'NO_RECORD') evaluated = req.kind === 'BASELINE' && e.completeness === 'COMPLETE_SYNTHETIC'
        ? state('MET', 'NO_RECORD_SYNTHETIC') : state('UNKNOWN', 'ABSENCE_UNCONFIRMED');
      else if (!o) evaluated = state('MISSING', 'OBSERVATION_MISSING');
      else if (o.status !== 'OBSERVED') evaluated = state(o.status, o.status === 'UNKNOWN' ? 'SEMANTICS_UNKNOWN' : o.status);
      else if (req.kind === 'BLOG') evaluated = state('UNKNOWN', 'BLOG_SOURCE_UNVERIFIED'); // precheck observation is never publication proof
      else {
        const met = r.predicate === 'BOOLEAN' ? o.value : r.predicate === 'SCORE_LT' || r.predicate === 'BASELINE_LT' ? o.value < r.threshold
          : r.predicate === 'SCORE_EQ' ? o.value === r.threshold : r.unit === 'BPS' ? o.value >= r.threshold && o.days === r.days : o.value >= r.threshold;
        evaluated = state(met ? 'MET' : 'NOT_MET', met ? 'NONE' : 'CONDITION_NOT_MET');
      }
    }
    return { ruleId: r.ruleId, requirementId: r.requirementId, ...evaluated };
  });
  const ruleState = id => rules.find(r => r.ruleId === id).state;
  const tiers = p.tiers.map(t => {
    const routes = t.alternatives.map(a => ({ routeId: a.routeId, ruleIds: [...p.commonRuleIds, ...a.allRuleIds],
      state: all([...p.commonRuleIds, ...a.allRuleIds].map(ruleState)) }));
    return { tier: t.tier, support: t.support, state: any(routes.map(a => a.state)), routes, quote: quoteMvpAmount(compiled, t.tier) };
  });
  let settlement = 'ON_HOLD', reason = 'SELECTION_OPEN', entitlement = null;
  const selected = tiers.find(t => t.tier === selection.tier), now = context.evaluatedAt, f = context.finalization, d = p.deadlines;
  if (selection.tier !== null) check(selected, 'MVP_TIER_CAPABILITY');
  if (selected?.support === 'PRECHECK_ONLY') { settlement = 'PRECHECK_ONLY'; reason = 'PRECHECK_ONLY'; }
  else if (selection.rule === p.selection.syntheticRule && selection.acknowledged && selected) {
    if (firstScoreMismatch) reason = 'FIRST_SCORE_MISMATCH';
    else if (selected.state === 'NOT_MET') { settlement = 'NOT_MET'; reason = 'CONDITION_NOT_MET'; }
    else if (selected.state !== 'MET') reason = 'EVIDENCE_' + selected.state;
    else if (tiers.some(t => t.tier > selected.tier && (pending.includes(t.state) || t.support === 'PRECHECK_ONLY' && t.state !== 'NOT_MET')))
      reason = 'HIGHER_TIER_UNKNOWN';
    else if (selected.quote.state !== 'CALCULATED_SYNTHETIC') reason = selected.quote.state;
    else if (context.initialSubmissionAt === null) reason = 'INITIAL_SUBMISSION_MISSING';
    else if (context.initialSubmissionAt < d.evidenceFrom || context.initialSubmissionAt >= d.evidenceUntil || context.initialSubmissionAt > now) reason = 'INITIAL_SUBMISSION_PERIOD';
    else if (f.state !== 'FINALIZED_SYNTHETIC' || now < d.supplementUntil) { settlement = 'CANDIDATE_SYNTHETIC'; reason = 'CORRECTION_OPEN'; }
    else if (f.factsRevision !== context.factsRevision || f.selectionRevision !== selection.revision) reason = 'FINALIZATION_REVISION';
    else if (f.finalizedAt === null || f.finalizedAt < d.supplementUntil || f.finalizedAt > now || now >= d.finalizeUntil) reason = 'FINALIZATION_PERIOD';
    else {
      settlement = 'FINAL_SYNTHETIC'; reason = 'NONE';
      const bound = { evaluatorVersion: EVALUATOR_VERSION, ...context.binding, decisionId: context.decisionId,
        factsRevision: context.factsRevision, evidenceSetHash: digest('CLEAR-MVP-EVIDENCE-SET', evidence.slice().sort((a, b) => a.evidenceId < b.evidenceId ? -1 : 1)),
        selectedTier: selection.tier, selectionRevision: selection.revision, firstScoreRef: structuredClone(context.firstScoreRef),
        contextHash: digest('CLEAR-MVP-CONTEXT', context),
        amountRuleHash: digest('CLEAR-MVP-AMOUNT', p.amount), amountAtoms: selected.quote.amountAtoms,
        finalization: structuredClone(f), evaluatedAt: now };
      entitlement = { ...bound, digest: digest('CLEAR-MVP-ENTITLEMENT', bound), allocationImplemented: false, paymentAllowed: false, claimAuthority: false };
    }
  }
  return freeze({ evaluatorVersion: EVALUATOR_VERSION, binding: structuredClone(context.binding), decisionId: context.decisionId,
    factsRevision: context.factsRevision, evaluatedAt: now, rules, tiers, selection: structuredClone(selection), settlement, reason, entitlement,
    proofVerified: false, productEligible: false, paymentAllowed: false, grant: 'HOLD', outbox: 'HOLD', independentClaim: 'NO_GO' });
}
