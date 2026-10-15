import { digest } from '../../src/policy/mvp/contract.mjs';
import { compileExample, exampleBinding, exampleSourceBinding, T } from '../m1/examples.mjs';
import { EVALUATOR_VERSION } from '../../src/eligibility/mvp/schema.mjs';
export function repinExample(input) {
  input.context.evidencePins = input.evidence.map(e => ({ evidenceId: e.evidenceId, revision: e.revision, digest: digest('CLEAR-MVP-EVIDENCE', e) }));
  return input;
}
// Test caller is the synthetic authority. This is not an adapter for live receipts.
export function evaluationExample(name = 'ybm', options = {}) {
  const compiled = options.compiled ?? compileExample(name), p = compiled.policy, binding = exampleBinding(compiled);
  const score = options.score ?? (name === 'third' ? 700 : 750), selectionTier = options.tier ?? (name === 'siwon' ? 200 : p.tiers[0].tier);
  const firstScoreRef = { submissionId: 'first-score', revision: 1, examCommitment: digest('SYNTHETIC-EXAM', 'first') };
  const context = { evaluatorVersion: EVALUATOR_VERSION, mode: 'SYNTHETIC', binding, decisionId: 'synthetic-decision', factsRevision: 1,
    evaluatedAt: p.deadlines.supplementUntil, sourceBindings: p.requirements.map(r => ({ requirementId: r.requirementId, sourceBinding: exampleSourceBinding() })),
    evidencePins: [], examPins: [], firstScoreRef: p.requirements.some(r => r.kind === 'EXAM') ? firstScoreRef : null,
    initialSubmissionAt: p.deadlines.evidenceUntil - 1,
    finalization: { state: 'FINALIZED_SYNTHETIC', factsRevision: 1, selectionRevision: 1, finalizedAt: p.deadlines.supplementUntil } };
  const evidence = p.requirements.map(req => {
    const collectedAt = req.kind === 'BASELINE' ? T + 60 : req.kind === 'LEARNING' ? req.period.until : p.deadlines.evidenceUntil - 10;
    const e = { contractVersion: p.contractVersion, mode: 'SYNTHETIC', binding: structuredClone(binding), evidenceId: 'evidence-' + req.requirementId,
      revision: 1, requirementId: req.requirementId, sourceBinding: exampleSourceBinding(), sourceRevision: 'source-revision.1',
      payloadHash: digest('SYNTHETIC-PAYLOAD', req.requirementId), trustProfile: req.trustProfile, collectedAt, acceptedAt: collectedAt + 1,
      coveredPeriod: structuredClone(req.period), sourceStatus: 'PRESENT', authenticity: 'VERIFIED_SYNTHETIC', subject: 'VERIFIED_SYNTHETIC',
      completeness: req.coverage === 'COMPLETE_PERIOD' ? 'COMPLETE_SYNTHETIC' : 'NOT_REQUIRED', semantics: 'VERIFIED_SYNTHETIC', correction: 'CURRENT',
      observations: p.rules.filter(r => r.requirementId === req.requirementId).map(r => ({ ruleId: r.ruleId, ruleHash: compiled.ruleHashes[r.ruleId],
        status: 'OBSERVED', unit: r.unit, value: r.unit === 'SCORE' ? req.kind === 'BASELINE' ? 700 : score : r.unit === 'BOOLEAN' ? true : r.threshold,
        days: r.days })) };
    if (req.kind === 'EXAM') context.examPins.push({ evidenceId: e.evidenceId, revision: e.revision, eventAt: T + 86400, submissionRef: structuredClone(firstScoreRef) });
    return e;
  });
  return { compiled, input: repinExample({ context, evidence, selection: { tier: selectionTier, revision: 1, acknowledged: true, rule: p.selection.syntheticRule } }) };
}
