import { schema as contractSchema } from '../../policy/mvp/schema.mjs';
import { freeze } from '../../policy/values.mjs';
export const EVALUATOR_VERSION = 'clear-mvp-evaluation.1';
const ref = name => ({ $ref: '#/$defs/' + name });
const id = { type: 'string', pattern: '^[a-z][a-z0-9.-]{0,63}$', maxLength: 64 };
const hash = { type: 'string', pattern: '^0x[0-9a-f]{64}$', maxLength: 66 };
const integer = (minimum, maximum) => ({ type: 'integer', minimum, maximum });
const revision = integer(1, 2147483647), seconds = integer(0, 4102444800);
const obj = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const list = (items, maxItems = 32) => ({ type: 'array', items, minItems: 0, maxItems });
const nullable = value => ({ anyOf: [value, { type: 'null' }] });
const scoreRef = obj({ submissionId: id, revision, examCommitment: hash });
const state = { enum: ['MET', 'NOT_MET', 'UNKNOWN', 'MISSING', 'NEEDS_SUPPLEMENT', 'IN_PROGRESS'] };
const observationStatus = { enum: ['OBSERVED', 'MISSING', 'UNKNOWN', 'NEEDS_SUPPLEMENT', 'IN_PROGRESS'] };
const code = { type: 'string', pattern: '^[A-Z][A-Z_]{0,63}$', maxLength: 64 };
const support = { enum: ['CONDITION_AMOUNT', 'PRECHECK_ONLY'] };
const finalization = obj({ state: { enum: ['OPEN', 'FINALIZED_SYNTHETIC'] }, factsRevision: revision,
  selectionRevision: revision, finalizedAt: nullable(seconds) });
export const evaluationSchema = { $defs: { ...contractSchema.$defs,
  ScoreReference: scoreRef,
  EvaluationContext: obj({ evaluatorVersion: { const: EVALUATOR_VERSION }, mode: { const: 'SYNTHETIC' },
    binding: ref('Binding'), decisionId: id, factsRevision: revision, evaluatedAt: seconds,
    sourceBindings: list(obj({ requirementId: id, sourceBinding: ref('SourceBinding') })),
    evidencePins: list(obj({ evidenceId: id, revision, digest: hash })),
    examPins: list(obj({ evidenceId: id, revision, eventAt: seconds, submissionRef: scoreRef })),
    firstScoreRef: nullable(scoreRef), initialSubmissionAt: nullable(seconds),
    finalization }),
  Selection: obj({ tier: nullable(integer(1, 1000)), revision, acknowledged: { type: 'boolean' },
    rule: { enum: ['EXPLICIT_SINGLE_TIER_NO_TOPUP', 'OFFICIAL_OPEN'] } }),
  SyntheticEntitlement: obj({ evaluatorVersion: { const: EVALUATOR_VERSION }, ...contractSchema.$defs.Binding.properties,
    decisionId: id, factsRevision: revision, evidenceSetHash: hash, selectedTier: integer(1, 1000), selectionRevision: revision,
    firstScoreRef: nullable(scoreRef), contextHash: hash, amountRuleHash: hash, amountAtoms: { type: 'string', pattern: '^[1-9][0-9]{0,29}$', maxLength: 30 },
    finalization, evaluatedAt: seconds, digest: hash, allocationImplemented: { const: false }, paymentAllowed: { const: false }, claimAuthority: { const: false } }),
  EvaluationResult: obj({ evaluatorVersion: { const: EVALUATOR_VERSION }, binding: ref('Binding'), decisionId: id,
    factsRevision: revision, evaluatedAt: seconds,
    rules: list(obj({ ruleId: id, requirementId: id, state, reason: code, evidenceId: nullable(id), evidenceRevision: nullable(revision), observationStatus: nullable(observationStatus) }), 64),
    tiers: list(obj({ tier: integer(1, 1000), support, state, routes: list(obj({ routeId: id, ruleIds: list(id, 64), state }), 2),
      quote: obj({ state: { enum: ['CALCULATED_SYNTHETIC', 'AMOUNT_OPEN', 'PRECHECK_ONLY'] },
        amountAtoms: nullable({ type: 'string', pattern: '^[1-9][0-9]{0,29}$', maxLength: 30 }) }) }), 16),
    selection: ref('Selection'), settlement: { enum: ['ON_HOLD', 'NOT_MET', 'PRECHECK_ONLY', 'CANDIDATE_SYNTHETIC', 'FINAL_SYNTHETIC'] },
    reason: code, entitlement: nullable(ref('SyntheticEntitlement')), proofVerified: { const: false }, productEligible: { const: false },
    paymentAllowed: { const: false }, grant: { const: 'HOLD' }, outbox: { const: 'HOLD' }, independentClaim: { const: 'NO_GO' } }),
} };
freeze(evaluationSchema);
