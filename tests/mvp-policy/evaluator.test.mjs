import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateMvpEligibility as evaluate, validateEvaluationResult } from '../../src/eligibility/mvp/evaluator.mjs';
import { compileMvpPolicy } from '../../src/policy/mvp/compiler.mjs';
import { digest } from '../../src/policy/mvp/contract.mjs';
import { exampleDraft, T } from '../../specs/m1/examples.mjs';
import { evaluationExample, repinExample } from '../../specs/m2/examples.mjs';
const record = (input, id) => input.evidence.find(e => e.requirementId === id);
const tier = (out, n) => out.tiers.find(t => t.tier === n);
const rule = (out, id) => out.rules.find(r => r.ruleId === id);
const run = (v, pin = true) => { if (pin) repinExample(v.input); const out = evaluate(v.compiled, v.input); validateEvaluationResult(out); return out; };
function fact(input, req, state, assurance = 'VERIFIED_SYNTHETIC') {
  const e = record(input, req); e.authenticity = assurance === 'VERIFIED_SYNTHETIC' ? assurance : 'UNKNOWN';
  for (const o of e.observations) {
    if (state === 'MET' || state === 'NOT_MET') {
      o.status = 'OBSERVED';
      if (o.unit === 'BOOLEAN') o.value = state === 'MET';
      else if (o.unit === 'BPS' && state === 'NOT_MET') o.days--;
      else if (req === 'history') o.value = state === 'MET' ? 700 : 850;
    } else { o.status = state; o.value = null; o.days = null; }
  }
}
test('normal YBM and third profile finalize only synthetic candidates with immutable outputs', () => {
  for (const name of ['ybm', 'third']) {
    const v = evaluationExample(name), before = structuredClone(v.input), out = run(v);
    assert.equal(out.settlement, 'FINAL_SYNTHETIC'); assert.equal(out.entitlement.amountAtoms, name === 'third' ? '42000000' : '100000000');
    assert.equal(out.productEligible, false); assert.equal(out.paymentAllowed, false); assert.equal(out.proofVerified, false);
    assert.equal(out.entitlement.claimAuthority, false); assert.equal(out.grant, 'HOLD'); assert.equal(out.independentClaim, 'NO_GO');
    assert.ok(Object.isFrozen(out.entitlement)); assert.deepEqual(v.input, before); assert.equal(Object.isFrozen(v.input.context.finalization), false);
    assert.equal(v.compiled.policy.requirements.some(r => r.kind === 'BASELINE'), false);
  }
});
test('M0 benefit condition and quote examples remain compatible with executable evaluation', () => {
  const cases = JSON.parse(readFileSync(new URL('../../specs/m0/benefits.json', import.meta.url))).cases;
  for (const c of cases) {
    const d = exampleDraft('siwon'); d.amount.inputs = c.amountInputs;
    let compiled;
    try { compiled = compileMvpPolicy(d, { sources: d.sources, capabilities: d.capabilities }); }
    catch (e) { assert.equal(e.message, 'MVP_AMOUNT'); assert.equal(c.expected.quoteState, 'INVALID_AMOUNT'); continue; }
    const v = evaluationExample('siwon', { score: c.score ?? 745, tier: c.selection.tier ?? 50, compiled });
    fact(v.input, 'review', c.review.status, c.review.assurance); fact(v.input, 'learning', c.attendance.status, c.attendance.assurance);
    fact(v.input, 'history', c.history.status, c.history.assurance);
    if (c.score === null || c.scoreAssurance !== 'VERIFIED_SYNTHETIC') for (const o of record(v.input, 'score').observations) { o.status = 'UNKNOWN'; o.value = null; }
    const out = run(v);
    if (c.bindingVerified && c.periodAndDeadlineVerified && JSON.stringify(c.firstScoreRef) === JSON.stringify(c.evaluatedScoreRef))
      assert.deepEqual(Object.fromEntries(out.tiers.map(t => ['t' + t.tier, t.state])), c.expected.conditions, c.caseId);
    // M2 adds correction/finality context; the M0 condition/quote vectors stay intact.
    if (c.selection.tier !== null) assert.equal(tier(out, c.selection.tier).quote.amountAtoms, c.expected.quoteAtoms, c.caseId);
  }
});
test('Siwon boundaries and attendance OR achievement+baseline do not demand unrelated history', () => {
  const attendance = evaluationExample('siwon', { score: 745, tier: 100 }); fact(attendance.input, 'history', 'UNKNOWN');
  let out = run(attendance); assert.equal(out.settlement, 'FINAL_SYNTHETIC'); assert.equal(tier(out, 100).routes[0].state, 'MET');
  const scorePath = evaluationExample('siwon', { score: 750, tier: 100 }); fact(scorePath.input, 'learning', 'NOT_MET');
  out = run(scorePath); assert.equal(out.settlement, 'FINAL_SYNTHETIC'); assert.equal(tier(out, 100).routes[1].state, 'MET');
  for (const [score, tierNo, expected] of [[745, 50, 'MET'], [750, 50, 'NOT_MET'], [745, 200, 'NOT_MET'], [750, 200, 'MET'], [845, 300, 'NOT_MET'], [850, 300, 'MET']]) {
    out = run(evaluationExample('siwon', { score, tier: tierNo })); assert.equal(tier(out, tierNo).state, expected);
  }
});
test('partial/unknown baseline and currently UNKNOWN history receipts cannot pass a score route', () => {
  for (const edit of [e => { e.completeness = 'UNKNOWN'; }, e => { e.completeness = 'PARTIAL'; }, e => { e.subject = 'UNKNOWN'; },
    e => { e.authenticity = 'UNKNOWN'; }, e => { e.sourceRevision = null; }, e => { e.correction = 'UNKNOWN'; }, e => { e.coveredPeriod.from++; },
    e => { e.mode = 'LOCAL_LAB'; }, e => { e.mode = 'INSTITUTION'; }]) {
    const v = evaluationExample('siwon', { score: 850, tier: 300 }); edit(record(v.input, 'history'));
    const out = run(v); assert.equal(rule(out, 'baseline-below-750').state, 'UNKNOWN'); assert.equal(out.settlement, 'ON_HOLD');
    assert.equal(out.entitlement, null); assert.equal(out.productEligible, false);
  }
});
test('NO_RECORD needs full pinned synthetic coverage; UNAVAILABLE is never absence', () => {
  const v = evaluationExample('siwon'); const e = record(v.input, 'history'); e.sourceStatus = 'NO_RECORD'; e.observations = [];
  let out = run(v); assert.equal(rule(out, 'baseline-below-750').reason, 'NO_RECORD_SYNTHETIC'); assert.equal(tier(out, 200).state, 'MET');
  e.completeness = 'UNKNOWN'; out = run(v); assert.equal(rule(out, 'baseline-below-750').state, 'UNKNOWN');
  e.completeness = 'COMPLETE_SYNTHETIC'; e.sourceStatus = 'UNAVAILABLE'; out = run(v);
  assert.equal(rule(out, 'baseline-below-750').state, 'UNKNOWN');
});
test('missing, unavailable, supplement, unknown and future days remain distinct', () => {
  for (const [status, expected] of [['MISSING', 'MISSING'], ['NEEDS_SUPPLEMENT', 'NEEDS_SUPPLEMENT'], ['UNKNOWN', 'UNKNOWN'], ['IN_PROGRESS', 'IN_PROGRESS']]) {
    const v = evaluationExample(); fact(v.input, 'learning', status); assert.equal(rule(run(v), 'daily-learning').state, expected);
  }
  const missing = evaluationExample(); missing.input.evidence = missing.input.evidence.filter(e => e.requirementId !== 'learning');
  assert.equal(rule(run(missing), 'daily-learning').reason, 'EVIDENCE_MISSING');
  const future = evaluationExample(); future.input.context.evaluatedAt = future.compiled.policy.requirements[1].period.until - 1;
  record(future.input, 'learning').acceptedAt = future.input.context.evaluatedAt;
  record(future.input, 'learning').collectedAt = future.input.context.evaluatedAt - 1;
  assert.equal(rule(run(future), 'daily-learning').state, 'IN_PROGRESS');
  const noSource = evaluationExample(); record(noSource.input, 'learning').sourceStatus = 'UNAVAILABLE';
  assert.equal(rule(run(noSource), 'daily-learning').state, 'UNKNOWN');
});
test('OR is NOT_MET only when every route is definitely false; unknown higher tiers block finalization', () => {
  const v = evaluationExample('siwon', { score: 745, tier: 100 }); fact(v.input, 'learning', 'NOT_MET');
  assert.equal(tier(run(v), 100).state, 'NOT_MET');
  fact(v.input, 'learning', 'UNKNOWN'); assert.equal(tier(run(v), 100).state, 'UNKNOWN');
  const lower = evaluationExample('siwon', { score: 850, tier: 100 }); fact(lower.input, 'learning', 'UNKNOWN');
  assert.equal(tier(run(lower), 100).state, 'MET'); assert.equal(run(lower).reason, 'HIGHER_TIER_UNKNOWN');
  const challenge = evaluationExample('siwon', { score: 990, tier: 300 });
  assert.equal(run(challenge).reason, 'HIGHER_TIER_UNKNOWN');
  challenge.input.selection.tier = 400; assert.equal(run(challenge).settlement, 'PRECHECK_ONLY'); assert.equal(run(challenge).entitlement, null);
  challenge.input.selection.tier = 500; assert.throws(() => run(challenge), { message: 'MVP_TIER_CAPABILITY' });
});
test('consumer regression: future days never hide unknown, missing or supplement observations', () => {
  for (const status of ['UNKNOWN', 'MISSING', 'NEEDS_SUPPLEMENT', 'IN_PROGRESS', 'ABSENT']) {
    const v = evaluationExample('third'), e = record(v.input, 'learning');
    const now = v.compiled.policy.requirements.find(r => r.kind === 'LEARNING').period.from + 3600;
    v.input.context.evaluatedAt = now; e.collectedAt = now - 10; e.acceptedAt = now - 9;
    if (status === 'ABSENT') e.observations = [];
    else fact(v.input, 'learning', status);
    const r = rule(run(v), 'daily-learning');
    assert.equal(r.state, status === 'ABSENT' ? 'MISSING' : status);
    assert.notEqual(r.reason, 'FUTURE_DAYS');
  }
});
test('all binding fields, source account, evidence revision and rule hash are pinned', () => {
  for (const key of ['applicationId', 'subjectRef', 'subjectBindingId', 'bindingRevision', 'recipientRef', 'instanceId', 'policyHash', 'policyVersion', 'productId', 'cohortId']) {
    const v = evaluationExample(), e = record(v.input, 'score'); e.binding[key] = typeof e.binding[key] === 'number' ? 2 : key.endsWith('Hash') || ['applicationId', 'subjectRef'].includes(key) ? digest('OTHER', key) : 'other-ref';
    assert.throws(() => run(v), { message: 'MVP_EVIDENCE_BINDING' }, key);
  }
  const source = evaluationExample(); record(source.input, 'score').sourceBinding.sourceAccountRef = 'other-account';
  assert.throws(() => run(source), { message: 'MVP_SOURCE_BINDING' });
  const changed = evaluationExample(); record(changed.input, 'score').revision++;
  assert.throws(() => run(changed, false), { message: 'MVP_EVIDENCE_PIN' });
  const r = evaluationExample(); record(r.input, 'score').observations[0].ruleHash = digest('OTHER', 'rule');
  assert.throws(() => run(r), { message: 'MVP_OBSERVATION_BINDING' });
  const wrongPolicy = evaluationExample(); wrongPolicy.input.context.binding.policyVersion = 'other-policy';
  assert.throws(() => run(wrongPolicy), { message: 'MVP_POLICY_BINDING' });
});
test('new higher score cannot replace pinned first submission or accepted exam identity', () => {
  const v = evaluationExample('siwon'); v.input.context.examPins[0].submissionRef.submissionId = 'replacement-score';
  assert.equal(run(v).reason, 'FIRST_SCORE_MISMATCH');
  v.input.context.examPins[0].submissionRef = { ...v.input.context.firstScoreRef, revision: 2 };
  assert.equal(run(v).reason, 'FIRST_SCORE_MISMATCH');
  v.input.context.firstScoreRef = null; assert.equal(run(v).reason, 'FIRST_SCORE_MISMATCH');
});
test('score event and submission half-open boundaries, acquisition freshness and future times', () => {
  for (const [offset, expected] of [[0, 'MET'], [-1, 'UNKNOWN']]) {
    const v = evaluationExample(); v.input.context.examPins[0].eventAt = T + offset; assert.equal(rule(run(v), 'score-target').state, expected);
  }
  const end = evaluationExample(); end.input.context.examPins[0].eventAt = end.compiled.policy.requirements[0].period.until;
  assert.equal(rule(run(end), 'score-target').state, 'UNKNOWN');
  for (const delta of [0, -1]) {
    const v = evaluationExample(), e = record(v.input, 'review'); e.acceptedAt = v.compiled.policy.deadlines.supplementUntil + delta; e.collectedAt = e.acceptedAt - 1;
    assert.equal(rule(run(v), 'review-accepted').state, delta === 0 ? 'UNKNOWN' : 'MET');
  }
  const stale = evaluationExample(); record(stale.input, 'review').collectedAt -= 86401;
  assert.equal(rule(run(stale), 'review-accepted').reason, 'ACQUISITION_TIME');
  const acceptedLongAgo = evaluationExample('siwon'); assert.equal(rule(run(acceptedLongAgo), 'baseline-below-750').state, 'MET');
});
test('selection, correction finality, input revisions and amount remain separate', () => {
  const v = evaluationExample(); v.input.selection.tier = null; assert.equal(run(v).reason, 'SELECTION_OPEN');
  v.input.selection.tier = 100; v.input.context.finalization.state = 'OPEN'; assert.equal(run(v).settlement, 'CANDIDATE_SYNTHETIC');
  v.input.context.finalization.state = 'FINALIZED_SYNTHETIC'; v.input.context.factsRevision++;
  assert.equal(run(v).reason, 'FINALIZATION_REVISION');
  v.input.context.finalization.factsRevision = 2; v.input.selection.revision++;
  assert.equal(run(v).reason, 'FINALIZATION_REVISION');
  v.input.context.finalization.selectionRevision = 2; assert.equal(run(v).settlement, 'FINAL_SYNTHETIC');
  v.input.selection.rule = 'OFFICIAL_OPEN'; assert.equal(run(v).reason, 'SELECTION_OPEN');
  const amount = evaluationExample('siwon'), d = exampleDraft('siwon'); d.amount.inputs.basis = 'OFFICIAL_OPEN';
  const compiled = compileMvpPolicy(d, { sources: d.sources, capabilities: d.capabilities });
  amount.compiled = compiled; amount.input.context.binding.policyHash = compiled.policyHash;
  for (const e of amount.input.evidence) { e.binding.policyHash = compiled.policyHash; for (const o of e.observations) o.ruleHash = compiled.ruleHashes[o.ruleId]; }
  assert.equal(run(amount).reason, 'AMOUNT_OPEN'); assert.equal(run(amount).entitlement, null);
});
test('initial submission and correction/finalization boundaries reject retroactive completion', () => {
  const v = evaluationExample(); v.input.context.initialSubmissionAt = null; assert.equal(run(v).reason, 'INITIAL_SUBMISSION_MISSING');
  v.input.context.initialSubmissionAt = v.compiled.policy.deadlines.evidenceUntil; assert.equal(run(v).reason, 'INITIAL_SUBMISSION_PERIOD');
  v.input.context.initialSubmissionAt--; assert.equal(run(v).settlement, 'FINAL_SYNTHETIC');
  v.input.context.evaluatedAt = v.compiled.policy.deadlines.finalizeUntil; assert.equal(run(v).reason, 'FINALIZATION_PERIOD');
  v.input.context.evaluatedAt--; assert.equal(run(v).settlement, 'FINAL_SYNTHETIC');
  v.input.context.finalization.finalizedAt = v.compiled.policy.deadlines.supplementUntil - 1; assert.equal(run(v).reason, 'FINALIZATION_PERIOD');
});
test('malformed observation values/units and duplicate revisions cannot become valid facts', () => {
  for (const edit of [o => { o.value = '750'; }, o => { o.value = 750.5; }, o => { o.value = 991; }, o => { o.unit = 'BOOLEAN'; }]) {
    const v = evaluationExample(); edit(record(v.input, 'score').observations[0]); assert.throws(() => run(v));
  }
  const duplicate = evaluationExample(); duplicate.input.evidence.push(structuredClone(duplicate.input.evidence[0]));
  assert.throws(() => run(duplicate), { message: 'MVP_DUPLICATE' });
  const days = evaluationExample(); record(days.input, 'learning').observations[0].days++;
  assert.throws(() => run(days), { message: 'MVP_OBSERVATION_VALUE' });
});
test('entitlement commits to full context and evidence revisions without mutating inputs', () => {
  const v = evaluationExample(), a = run(v), before = structuredClone(v.input);
  assert.equal(run(v).entitlement.digest, a.entitlement.digest); assert.deepEqual(v.input, before);
  v.input.context.examPins[0].eventAt++;
  assert.notEqual(run(v).entitlement.digest, a.entitlement.digest);
  const b = run(v); record(v.input, 'review').revision++;
  assert.notEqual(run(v).entitlement.digest, b.entitlement.digest);
});
test('a snapshot collected before period end cannot become complete just by waiting', () => {
  const v = evaluationExample(), e = record(v.input, 'learning');
  const end = v.compiled.policy.requirements.find(r => r.kind === 'LEARNING').period.until;
  e.collectedAt = end - 2; e.acceptedAt = end - 1;
  v.input.context.evaluatedAt = end - 1;
  assert.equal(rule(run(v), 'daily-learning').state, 'IN_PROGRESS');
  v.input.context.evaluatedAt = v.compiled.policy.deadlines.supplementUntil;
  let out = run(v);
  assert.equal(rule(out, 'daily-learning').reason, 'COVERAGE_UNKNOWN'); assert.equal(out.entitlement, null);
  e.collectedAt = end; e.acceptedAt = end + 1;
  out = run(v); assert.equal(out.settlement, 'FINAL_SYNTHETIC');
  const history = evaluationExample('siwon', { score: 850, tier: 300 }), h = record(history.input, 'history');
  h.sourceStatus = 'NO_RECORD'; h.observations = []; h.collectedAt = T - 1; h.acceptedAt = T;
  out = run(history);
  assert.equal(rule(out, 'baseline-below-750').reason, 'COVERAGE_UNKNOWN'); assert.equal(out.entitlement, null);
});
test('different thresholds cannot read conflicting scores from the same pinned exam', () => {
  const v = evaluationExample('siwon', { score: 745, tier: 50 }), e = record(v.input, 'score');
  e.observations.find(o => o.ruleId === 'score-750').value = 850;
  assert.throws(() => run(v), { message: 'MVP_SCORE_CONFLICT' });
  e.observations.find(o => o.ruleId === 'score-750').value = 745;
  assert.equal(tier(run(v), 50).state, 'MET');
});
