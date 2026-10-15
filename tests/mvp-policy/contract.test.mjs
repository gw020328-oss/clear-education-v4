import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileMvpPolicy, quoteMvpAmount, requireMvpPolicy } from '../../src/policy/mvp/compiler.mjs';
import { validateContract, validateShape, digest, DOCUMENT_LIMITS } from '../../src/policy/mvp/contract.mjs';
import { validateLearningFactsShape } from '../../src/policy/mvp/learning-contract.mjs';
import { exampleDraft, compileExample, exampleBinding } from '../../specs/m1/examples.mjs';
const compile = d => compileMvpPolicy(d, { sources: structuredClone(d.sources), capabilities: structuredClone(d.capabilities) });
const reject = (edit, code, profile = 'siwon') => {
  const d = exampleDraft(profile); edit(d); assert.throws(() => compile(d), { message: code });
};
test('same compiler runs the two profiles and a third configuration without brand branches', () => {
  for (const name of ['ybm', 'siwon', 'third']) {
    const c = compileExample(name); assert.equal(c.publishable, false); assert.equal(c.paymentAllowed, false);
    assert.ok(Object.isFrozen(c.policy.rules[0])); assert.equal(requireMvpPolicy(c), c.policy);
    validateContract('Binding', exampleBinding(c));
  }
  assert.equal(quoteMvpAmount(compileExample('third'), 75).amountAtoms, '42000000');
  assert.equal(compileExample('third').policy.rules.find(r => r.ruleId === 'score-target').threshold, 700);
  assert.equal(compileExample('third').policy.learningRules[0].days, 14);
});
test('deterministic domain-separated hash binds policy, source and learning semantics', () => {
  const a = exampleDraft('ybm'), c = compile(a), reversed = Object.fromEntries(Object.entries(a).reverse());
  assert.equal(c.policyHash, compile(reversed).policyHash);
  a.learningRules[0].metricRuleVersion = 'synthetic-metric.2'; assert.notEqual(c.policyHash, compile(a).policyHash);
  assert.notEqual(c.ruleHashes['daily-learning'], compile(a).ruleHashes['daily-learning']);
  a.sources[0].rawHash = digest('CHANGED', 'source'); assert.notEqual(c.policyHash, compile(a).policyHash);
  assert.throws(() => requireMvpPolicy(structuredClone(c)), { message: 'MVP_COMPILED_REQUIRED' });
});
test('source and capability pins are independent of a candidate draft', () => {
  const d = exampleDraft('siwon'), sources = structuredClone(d.sources), capabilities = structuredClone(d.capabilities);
  d.sources[0].rawHash = digest('FORGED', 'source');
  assert.throws(() => compileMvpPolicy(d, { sources, capabilities }), { message: 'MVP_SOURCE_PIN' });
  d.sources = sources; d.capabilities.conditionAmountTiers.push(400);
  assert.throws(() => compileMvpPolicy(d, { sources, capabilities }), { message: 'MVP_CAPABILITY_PIN' });
});
test('reviewed profile layout preserves attendance OR score+baseline and restricted tiers', () => {
  const p = compileExample('siwon').policy;
  assert.deepEqual(p.tiers[1].alternatives.map(a => a.allRuleIds), [['daily-learning'], ['score-750', 'baseline-below-750']]);
  assert.deepEqual(p.tiers[0].alternatives[0].allRuleIds, ['score-below-750']);
  assert.equal(quoteMvpAmount(compileExample('siwon'), 400).state, 'PRECHECK_ONLY');
  reject(d => { d.tiers[4].support = 'CONDITION_AMOUNT'; }, 'MVP_TIER_CAPABILITY');
  reject(d => { d.tiers[4].tier = 500; }, 'MVP_TIER_CAPABILITY');
});
test('M0 integer formula is reused; OPEN and null amounts remain unresolved', () => {
  const c = compileExample('siwon');
  assert.deepEqual([50, 100, 200, 300].map(t => quoteMvpAmount(c, t).amountAtoms), ['33540000', '68640000', '138840000', '209040000']);
  const d = exampleDraft('siwon'); d.amount.inputs.basis = 'OFFICIAL_OPEN';
  assert.equal(quoteMvpAmount(compile(d), 100).state, 'AMOUNT_OPEN');
  d.amount.inputs.basis = 'SYNTHETIC_ASSUMPTION'; d.amount.inputs.bookAtoms = null;
  assert.equal(quoteMvpAmount(compile(d), 100).state, 'AMOUNT_OPEN');
  reject(d => { d.amount.inputs.bookAtoms = '101000000'; }, 'MVP_AMOUNT');
  reject(d => { d.amount.inputs.paidAtoms = 100.5; }, 'MVP_SCHEMA');
});
test('official mode, unresolved rule/question and unsupported predicates fail closed', () => {
  reject(d => { d.mode = 'OFFICIAL_DRAFT'; }, 'MVP_OFFICIAL_BLOCKED');
  reject(d => { d.rules[0].basis = 'OFFICIAL_OPEN'; }, 'MVP_RULE_OPEN');
  reject(d => { d.rules[0].predicate = 'EXECUTE_CODE'; }, 'MVP_SCHEMA');
  reject(d => { d.questions.push({ questionId: 'open-question', field: 'review', text: 'Which byte encoding?', status: 'OPEN', resolution: null, sourceRefs: d.rules[0].sourceRefs }); }, 'MVP_QUESTION_OPEN');
});
test('wrong refs, duplicate/unused branches and extra fields are rejected', () => {
  reject(d => { d.rules[0].sourceRefs[0].locator = 'invented'; }, 'MVP_SOURCE_LOCATOR');
  reject(d => { d.rules[0].requirementId = 'absent'; }, 'MVP_REQUIREMENT');
  reject(d => { d.tiers[0].alternatives[0].allRuleIds.push(d.commonRuleIds[0]); }, 'MVP_DUPLICATE');
  reject(d => { d.tiers[0].alternatives[0].allRuleIds = ['absent']; }, 'MVP_RULE_REF');
  reject(d => { d.tiers[0].alternatives[0].allRuleIds = []; }, 'MVP_SCHEMA');
  reject(d => { d.paymentAllowed = true; }, 'MVP_SCHEMA');
});
test('unit, threshold, days, period, normalizer, source scope and activity pins are checked', () => {
  reject(d => { d.rules[0].unit = 'SCORE'; }, 'MVP_RULE_TYPE');
  reject(d => { d.rules.find(r => r.ruleId === 'score-750').threshold = 1000; }, 'MVP_RULE_TYPE');
  reject(d => { d.learningRules[0].days = 99; }, 'MVP_LEARNING_RULE');
  reject(d => { d.requirements[1].period.from++; }, 'MVP_LEARNING_PERIOD');
  reject(d => { d.requirements[0].period.until = d.requirements[0].period.from; }, 'MVP_PERIOD');
  reject(d => { d.requirements[0].period = null; }, 'MVP_COVERAGE');
  reject(d => { d.requirements[0].coverage = 'NOT_REQUIRED'; }, 'MVP_COVERAGE');
  reject(d => { d.sources[0].normalizerVersion = 'normalizer.1'; }, 'MVP_NORMALIZER');
  reject(d => { d.sources[0].productId = 'other-product'; }, 'MVP_SOURCE_SCOPE');
  reject(d => { d.learningRules[0].allowedActivityIds.pop(); }, 'MVP_ACTIVITY_HASH');
  reject(d => { d.deadlines.claimUntil--; }, 'MVP_DEADLINES');
  reject(d => { d.learningRules[0].speedPolicy = 'NOT_REQUIRED'; }, 'MVP_LEARNING_SEMANTICS');
});
test('Moodle preparation schema is consumable without promoting unknown telemetry', () => {
  const v = JSON.parse(readFileSync(new URL('../../specs/m1/learning-example.json', import.meta.url)));
  validateLearningFactsShape(v);
  assert.equal(v.snapshot.sourceCompleteness, 'UNKNOWN'); assert.equal(v.records[0].providerProgressBps, null);
  assert.equal(v.trust.humanAttentionProven, false); assert.equal(v.trust.paymentAuthorized, false);
  const bad = structuredClone(v); bad.snapshot.observedAt = 1791944100;
  assert.throws(() => validateLearningFactsShape(bad), { message: 'MVP_SCHEMA' });
  v.trust.paymentAuthorized = true; assert.throws(() => validateLearningFactsShape(v), { message: 'MVP_SCHEMA' });
  assert.equal(DOCUMENT_LIMITS.maxPosts, 14); assert.equal(DOCUMENT_LIMITS.maxImagesPerPost, 8);
  assert.equal(DOCUMENT_LIMITS.externalTransferAllowed, false);
});
test('shape validator refuses unsupported validation vocabulary and sparse arrays', () => {
  assert.throws(() => validateShape('x', { type: 'string', format: 'email' }), { message: 'MVP_SCHEMA_KEYWORD' });
  reject(d => { delete d.rules[0]; }, 'MVP_SCHEMA');
});
