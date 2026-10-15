import { evaluateMvpEligibility } from '../../src/eligibility/mvp/evaluator.mjs';
import { evaluationExample, repinExample } from './examples.mjs';
const scenarios = [
  ['ybm-normal', 'ybm', {}, () => {}],
  ['siwon-attendance-history-not-needed', 'siwon', { score: 745, tier: 100 }, v => { v.input.evidence.find(e => e.requirementId === 'history').completeness = 'UNKNOWN'; }],
  ['siwon-source-history-unknown', 'siwon', { score: 850, tier: 300 }, v => { v.input.evidence.find(e => e.requirementId === 'history').completeness = 'UNKNOWN'; }],
  ['siwon-400-precheck-only', 'siwon', { score: 990, tier: 400 }, () => {}],
  ['third-config-only', 'third', {}, () => {}],
];
console.log(JSON.stringify({ mode: 'SYNTHETIC', actualSourceVerification: false, paymentAllowed: false,
  scenarios: scenarios.map(([id, profile, options, edit]) => {
    const v = evaluationExample(profile, options); edit(v); repinExample(v.input);
    const out = evaluateMvpEligibility(v.compiled, v.input);
    return { id, policyHash: v.compiled.policyHash, selectedTier: out.selection.tier, settlement: out.settlement,
      reason: out.reason, amountQuote: out.tiers.find(t => t.tier === out.selection.tier).quote,
      productEligible: out.productEligible, paymentAllowed: out.paymentAllowed };
  }) }, null, 2));
