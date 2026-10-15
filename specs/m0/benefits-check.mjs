import { quoteBenefitAmount } from '../../src/policy/benefit-amount.mjs';
// Offline conformance arithmetic for fixed examples, not a production rule/settlement engine.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
export function checkBenefits({ schema, shape, canonical, ensure, source }) {
  const data = JSON.parse(readFileSync(new URL('./benefits.json', import.meta.url), 'utf8'));
  const hash = value => '0x' + createHash('sha256').update(value).digest('hex');
  const eq = (a, b) => canonical(a) === canonical(b);
  const p = data.policy;
  shape(p, schema.$defs.BenefitPolicy);
  ensure(p.sourceId === source.sourceId && p.sourceHash === source.rawHash, 'SOURCE', p.sourceId);
  ensure(data.policyHash === hash('CLEAR-M0-BENEFITS\n' + canonical(p)), 'POLICY_HASH', p.policyId);
  ensure(eq(p.tiers.map(t => t.ratePercent), [50, 100, 200, 300, 400]), 'TIERS', 'unique supported rates');
  ensure(eq(p.tiers.map(t => t.support), ['CONDITION_AMOUNT', 'CONDITION_AMOUNT', 'CONDITION_AMOUNT', 'CONDITION_AMOUNT', 'PRECHECK_ONLY']), 'TIERS', 'support');
  const M = 'MET', N = 'NOT_MET', U = 'UNKNOWN', I = 'IN_PROGRESS';
  const all = xs => xs.includes(N) ? N : xs.includes(U) ? U : xs.includes(I) ? I : M;
  const any = xs => xs.includes(M) ? M : xs.includes(U) ? U : xs.includes(I) ? I : N;
  const fact = f => f.assurance === 'VERIFIED_SYNTHETIC' ? f.status : U;
  const sameScore = c => eq(c.firstScoreRef, c.evaluatedScoreRef) && (c.score === null || c.firstScoreRef !== null);
  function conditions(c) {
    if (!c.bindingVerified || !c.periodAndDeadlineVerified || !sameScore(c)) return Object.fromEntries(p.tiers.map(t => ['t' + t.ratePercent, U]));
    return Object.fromEntries(p.tiers.map(t => ['t' + t.ratePercent, all([fact(c.review), any(t.alternatives.map(r => {
      const checks = [];
      if (r.attendanceRequired) checks.push(fact(c.attendance));
      if (r.historyRequired) checks.push(fact(c.history));
      if (r.blogRequired) checks.push(U); // Image content NEVER establishes blog origin/completeness.
      if (r.scoreOperator !== 'NONE') checks.push(c.score === null || c.scoreAssurance !== 'VERIFIED_SYNTHETIC' ? U
        : (r.scoreOperator === 'LT' ? c.score < r.scoreThreshold : r.scoreOperator === 'EQ' ? c.score === r.scoreThreshold : c.score >= r.scoreThreshold) ? M : N);
      return all(checks);
    }))]) ]));
  }
  const quote = c => quoteBenefitAmount(c.selection.tier, c.amountInputs);
  function settlement(c, states, qs) {
    const selected = c.selection.tier;
    if (!sameScore(c)) return ['ON_HOLD', 'FIRST_SCORE_MISMATCH'];
    if (selected === 400) return ['PRECHECK_ONLY', 'PRECHECK_ONLY'];
    if (selected === null || !c.selection.acknowledged || c.selection.rule === 'OFFICIAL_OPEN') return ['ON_HOLD', 'SELECTION_OPEN'];
    if (states['t' + selected] === N) return ['NOT_MET', 'CONDITION_NOT_MET'];
    if (states['t' + selected] !== M) return ['ON_HOLD', 'SOURCE_UNVERIFIED'];
    if (p.tiers.some(t => t.ratePercent > selected && [U, I].includes(states['t' + t.ratePercent]))) return ['ON_HOLD', 'HIGHER_TIER_UNKNOWN'];
    if (qs !== 'CALCULATED_SYNTHETIC') return ['ON_HOLD', qs];
    return ['FINAL_SYNTHETIC', 'NONE'];
  }
  function bound(c) {
    for (const [key, value] of Object.entries(data.binding)) ensure(c[key] === value, 'BINDING', key);
    ensure(c.policyHash === data.policyHash && c.policyVersion === p.policyVersion, 'BINDING', 'policy');
  }
  function checkCase(c) {
    shape(c, schema.$defs.BenefitCase); bound(c);
    const states = conditions(c), [qs, amount] = quote(c), [state, reason] = settlement(c, states, qs);
    ensure(eq(c.expected.conditions, states), 'CONDITIONS', c.caseId);
    ensure(c.expected.quoteState === qs && c.expected.quoteAtoms === amount, 'AMOUNT', c.caseId);
    ensure(c.expected.settlement === state && c.expected.reason === reason, 'SETTLEMENT', c.caseId);
    if (state !== 'FINAL_SYNTHETIC') ensure(c.expected.entitlement === null, 'ENTITLEMENT', c.caseId);
    else {
      const expected = { ...data.binding, decisionId: 'decision-' + c.caseId, factsRevision: c.factsRevision,
        selectedTier: c.selection.tier, selectionRevision: c.selection.revision, firstScoreRef: c.firstScoreRef,
        factsHash: hash(canonical(Object.fromEntries(['factsRevision', 'score', 'scoreAssurance', 'firstScoreRef', 'evaluatedScoreRef', 'review', 'attendance', 'history', 'bindingVerified', 'periodAndDeadlineVerified'].map(k => [k, c[k]])))),
        amountRuleVersion: c.amountInputs.formulaVersion, amountInputsHash: hash(canonical(c.amountInputs)), entitlementAtoms: amount };
      expected.settlementHash = hash('CLEAR-M0-ENTITLEMENT\n' + canonical(expected));
      Object.assign(expected, { reservedAtoms: '0', paidAtoms: '0', allocationImplemented: false, paymentAllowed: false });
      ensure(eq(c.expected.entitlement, expected), 'ENTITLEMENT', c.caseId);
    }
  }
  function checkBlog(b) {
    shape(b, schema.$defs.ChallengePrecheck); bound(b);
    const dates = b.observations.filter(o => o.fieldId.startsWith('post-date-'));
    const missing = !b.observations.some(o => o.fieldId === 'blog-url' && o.readStatus === 'READABLE')
      || dates.length !== 14 || dates.some(o => o.value === null || o.readStatus !== 'READABLE');
    const mismatch = new Set(dates.map(o => o.value)).size !== dates.length;
    for (const o of b.observations) {
      ensure(o.readStatus !== 'READABLE' || (o.value !== null && o.page !== null && o.bbox !== null), 'OBSERVATION', o.fieldId);
      ensure(o.readStatus === 'READABLE' || o.value === null, 'OBSERVATION', o.fieldId);
      if (o.bbox) ensure(o.bbox[0] < o.bbox[2] && o.bbox[1] < o.bbox[3], 'OBSERVATION', o.fieldId);
    }
    ensure(b.reasons.includes('GUIDE_UNAVAILABLE'), 'BLOG', b.submissionId);
    ensure(b.outcome === (missing || mismatch ? 'NEEDS_SUPPLEMENT' : 'UNDETERMINED'), 'BLOG', b.submissionId);
    if (missing) ensure(b.reasons.includes('MISSING_FIELD'), 'BLOG', b.submissionId);
    if (mismatch) ensure(b.reasons.includes('MISMATCH'), 'BLOG', b.submissionId);
  }
  data.cases.forEach(checkCase);
  data.blogPrechecks.forEach(b => checkBlog(b.value));
  for (const test of data.rejectCases) {
    const found = data.cases.find(c => c.caseId === test.base), blog = data.blogPrechecks.find(b => b.id === test.base);
    const mutated = structuredClone(found ?? blog?.value);
    ensure(mutated, 'REFERENCES', test.base);
    let target = mutated;
    for (const key of test.path.slice(0, -1)) target = target[key];
    target[test.path.at(-1)] = test.value;
    assert.throws(() => found ? checkCase(mutated) : checkBlog(mutated), error => error.code === test.error, test.base);
  }
  console.log(`M0 benefit examples PASS: ${data.cases.length} condition/amount cases, ${data.blogPrechecks.length} blog prechecks, ${data.rejectCases.length} rejected mutations.`);
}
