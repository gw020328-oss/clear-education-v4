// Offline correlation audit for the public C3 fixture. Not an Evidence importer,
// source verifier, authorization check, payment predicate or production endpoint.
import { digest, same, validateContract } from '../../src/policy/mvp/contract.mjs';
import { validateEvaluationResult } from '../../src/eligibility/mvp/evaluator.mjs';
import { requireRule as check } from '../../src/policy/values.mjs';

export function inspectDecisionTrace(record, expected) {
  check(record?.current === true && record.historicalResult === null && record.result, 'TRACE_NOT_CURRENT');
  const { snapshot: s, result: r } = record;
  check(s?.context && Array.isArray(s.evidence), 'TRACE_SNAPSHOT');
  validateContract('Binding', expected.binding);
  validateEvaluationResult(r);
  check(record.applicationId === expected.binding.applicationId
    && same(s.context.binding, expected.binding) && same(r.binding, expected.binding)
    && s.policyHash === expected.binding.policyHash, 'TRACE_BINDING');
  check(record.workflowRevision === expected.workflowRevision
    && r.factsRevision === expected.factsRevision && s.context.factsRevision === expected.factsRevision
    && s.selection.revision === expected.selectionRevision && same(s.selection, r.selection)
    && s.c1AcknowledgmentHash === expected.c1AcknowledgmentHash, 'TRACE_REVISION');
  check(record.decisionId === r.decisionId && record.recordId === r.decisionId
    && s.context.decisionId === r.decisionId, 'TRACE_DECISION');
  check(digest('CLEAR-EVALUATION-SNAPSHOT.1', s) === record.snapshotHash
    && digest('CLEAR-EVALUATION-RESULT.1', r) === record.resultHash, 'TRACE_DIGEST');
  check(s.context.mode === 'SYNTHETIC' && record.dataMode === 'SYNTHETIC', 'TRACE_SYNTHETIC_ONLY');
  for (const value of [record, r]) {
    check(value.paymentAllowed === false && value.productEligible === false
      && value.grant === 'HOLD' && value.outbox === 'HOLD' && value.independentClaim === 'NO_GO', 'TRACE_GATES');
  }
  const evidence = new Map();
  check(s.evidence.length <= 32 && Array.isArray(s.context.evidencePins)
    && s.context.evidencePins.length === s.evidence.length, 'TRACE_PIN_COUNT');
  check(new Set(s.context.evidencePins.map(p => p.evidenceId)).size === s.evidence.length, 'TRACE_DUPLICATE_PIN');
  for (const e of s.evidence) {
    validateContract('Evidence', e);
    check(e.mode === 'SYNTHETIC', 'TRACE_SYNTHETIC_ONLY');
    check(!evidence.has(e.evidenceId), 'TRACE_DUPLICATE_EVIDENCE');
    check(same(e.binding, expected.binding), 'TRACE_EVIDENCE_BINDING');
    const pin = s.context.evidencePins.find(p => p.evidenceId === e.evidenceId);
    check(pin?.revision === e.revision && pin.digest === digest('CLEAR-MVP-EVIDENCE', e), 'TRACE_EVIDENCE_PIN');
    const sources = s.context.sourceBindings.filter(b => b.requirementId === e.requirementId);
    check(sources.length === 1 && same(sources[0].sourceBinding, e.sourceBinding), 'TRACE_SOURCE_BINDING');
    evidence.set(e.evidenceId, e);
  }
  for (const rule of r.rules) {
    if (rule.evidenceId === null) {
      check(rule.evidenceRevision === null && rule.state !== 'MET', 'TRACE_RULE_REFERENCE');
      continue;
    }
    const e = evidence.get(rule.evidenceId);
    check(e && e.revision === rule.evidenceRevision && e.requirementId === rule.requirementId, 'TRACE_RULE_REFERENCE');
  }
  return {
    kind: 'OFFLINE_SYNTHETIC_TRACE_AUDIT', consistent: true,
    evidenceCount: evidence.size, ruleCount: r.rules.length,
    workflowRevision: record.workflowRevision, factsRevision: r.factsRevision,
    selectionRevision: r.selection.revision,
    // Deliberately no source IDs, subjects, wallets, payloads or model text in output.
    sourceVerified: false, liveFreshnessVerified: false, authorizationVerified: false,
    completeAuditTrail: false, paymentAllowed: false,
    missing: ['AUTHENTICATED_LIVE_HEAD', 'ACTUAL_PROVIDER_RECEIPTS', 'CHANGE_ACTOR_AND_REASON',
      'AUTHORIZED_EVIDENCE_AVAILABILITY', 'CLAIM_PROOF_AND_FUNDING_POLICY'],
  };
}
