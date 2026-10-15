// Read-only research projection of the real M1 policy graph. NOT a verifier,
// evaluator, authority, receipt acceptor, or live-capability registration API.
import { requireMvpPolicy, quoteMvpAmount } from '../../src/policy/mvp/compiler.mjs';
const boundaries = Object.freeze({
  EXAM: ['PRIVATE_SOURCE_PREDICATE_NOT_DEPLOYED', 'SOURCE_BOUND_STABLE_NULLIFIER_NOT_DEPLOYED', 'FRESH_OFFICIAL_PROOF_ONCHAIN_NOT_TESTED'],
  BASELINE: ['SOURCE_ACCOUNT_PERIOD_COVERAGE_UNKNOWN', 'AUTHENTICATED_ABSENCE_UNKNOWN', 'PRIVATE_HISTORY_VERIFIER_UNIMPLEMENTED'],
  LEARNING: ['LMS_INSTITUTION_ACCOUNT_BINDING_UNVERIFIED', 'LMS_FACTS_ONCHAIN_VERIFIER_UNIMPLEMENTED', 'LMS_OPERATOR_TRUST_REMAINS'],
  REVIEW: ['REVIEW_SOURCE_AUTHORITY_UNRESOLVED', 'PRECHECK_IS_NOT_SOURCE_EVIDENCE'],
  MOCK_TEST: ['MOCK_COMPLETION_SOURCE_UNINTEGRATED'],
  BLOG: ['BLOG_PUBLICATION_AUTHOR_CONTINUITY_UNVERIFIED', 'PRECHECK_IS_NOT_SOURCE_EVIDENCE'],
});
const freeze = x => { if (x && typeof x === 'object') { Object.values(x).forEach(freeze); Object.freeze(x); } return x; };
export function describeClaimBoundary(compiled, tier) {
  const p = requireMvpPolicy(compiled), selected = p.tiers.find(t => t.tier === tier);
  if (!selected) throw Error('UNSUPPORTED_TIER');
  const routes = selected.alternatives.map(route => ({
    routeId: route.routeId,
    // Keep common ALL outside alternative ANY; never omit review/mock just
    // because a score proof exists. Do not demand other OR branches' facts.
    predicates: [...p.commonRuleIds, ...route.allRuleIds].map(ruleId => {
      const rule = p.rules.find(r => r.ruleId === ruleId);
      const req = p.requirements.find(r => r.requirementId === rule.requirementId);
      if (!boundaries[req.kind]) throw Error('UNRECOGNIZED_EVIDENCE_KIND');
      return { ruleId, ruleHash: compiled.ruleHashes[ruleId], requirementId: req.requirementId,
        kind: req.kind, coverage: req.coverage, period: req.period ? {...req.period} : null,
        predicate: rule.predicate, threshold: rule.threshold,
        blockers: [...boundaries[req.kind]], onchainFactVerifier: 'NOT_IMPLEMENTED' };
    }),
  }));
  return freeze({ scope: 'RESEARCH_ONLY_SYNTHETIC_POLICY_GRAPH', policyHash: compiled.policyHash,
    tier, support: selected.support, quote: quoteMvpAmount(compiled, tier), routes,
    amountAuthority: 'SYNTHETIC_QUOTE_NOT_CLAIM_AUTHORITY', selectionAuthority: 'NOT_ONCHAIN_VERIFIED',
    fundingPolicy: 'OPEN', independentClaim: 'NO_GO', claimAuthority: false, paymentAllowed: false,
    // No proof/receipt/AI result input can turn this inventory into authorization.
    globalBlockers: ['POLICY_EXECUTION_ONCHAIN_UNBOUND', 'SOURCE_SUBJECT_BINDING_UNVERIFIED',
      'FIRST_SUBMISSION_SELECTION_FINALITY_UNPROVEN_ONCHAIN', 'COMMON_SPENT_REGISTRY_UNIMPLEMENTED',
      'INDEPENDENT_NEW_EVIDENCE_COLLECTION_UNIMPLEMENTED'] });
}
