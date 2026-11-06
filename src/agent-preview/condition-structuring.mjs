// Server-side condition structuring: Gemini proposal → server review → operator
// review → registered-tool plan → plan validation → public synthetic execution.
//
// No listener and no network client here. The host route (e.g. the draft
// deploy/agent-preview service) supplies `claimAndDispatch`, which owns operator
// authentication, the per-input approval bound to the exact bodyHash, durable
// single-use consumption and the existing Gemini transport.
//
// What this module guarantees on top of the existing core:
//   - A failed or rejected model call is reported as such. It never falls back to
//     the rule-based draft and is never labelled a model success.
//   - The model only classifies each clause into a capability. Code maps the
//     capability to the registered tool manifest; the model never picks tools.
//   - Clauses whose relation cannot be expressed as one required condition
//     (alternative, substitution, negation, threshold, ...) stay NEEDS_CLARIFICATION
//     or UNSUPPORTED with their original quote (core reviewModelProposal guard).
//   - Execution is the existing PUBLIC_SYNTHETIC demo. It is labelled as public
//     fixture reads, not a Moodle query or Reclaim verification.
import {buildPlan, executePublicDemo, hash, reviewModelProposal, sourceClauses, TOOL_MANIFEST, validatePlan} from './index.mjs';
import {prepareGeminiStructureRequest} from './gemini-preparation.mjs';
import {requestGeminiPreview} from './gemini-response.mjs';

export const STRUCTURING_VERSION = 'clear-condition-structuring.2';
/** How tools are chosen in the current implementation. */
export const TOOL_SELECTION = 'MODEL_CLASSIFIES_CAPABILITY_CODE_MAPS_TOOL';

const gates = Object.freeze({scope: 'PRECONFIGURATION_ONLY', automaticEligibility: false, paymentAllowed: false});
const toolFor = capability => TOOL_MANIFEST.find(entry => entry.capability === capability) ?? null;
const RESPONSE_REJECTED = /^(?:GEMINI_REQUEST_BINDING|GEMINI_CANDIDATES|GEMINI_RESPONSE_PARTS|GEMINI_RESPONSE_SCHEMA|MODEL_[A-Z_]+|DTO_JSON_[A-Z_]+|SIGNED_JSON(?:_LIMIT)?|DUPLICATE_OR_UNSAFE_JSON_KEY|SOURCE_INVALID|CLAUSE_LIMIT)$/;
// Diagnostic codes that may leave this boundary. Anything else is reported generically.
const SAFE_FAILURE = /^(?:GEMINI_[A-Z_]+|APPROVAL_[A-Z_]+|INPUT_TOKEN_LIMIT|OPERATION_TIMEOUT|REQUEST_ABORTED|BUSY)$/;
const codeOf = error => String(error?.code ?? error?.message ?? '');

/** Review packet for the exact request. No model call, no key read. */
export function prepareStructuring(sourceText) {
  const prepared = prepareGeminiStructureRequest(sourceText);
  return Object.freeze({
    ...gates, version: STRUCTURING_VERSION, stage: 'PREPARED', actualModelCall: false,
    model: prepared.model, sourceHash: prepared.sourceHash, bodyHash: prepared.bodyHash,
    clauses: sourceClauses(sourceText).map(({id, start, end, text}) => ({clauseId: id, start, end, quote: text})),
    limits: {maxGenerationCalls: prepared.maxGenerationCalls, automaticRetries: prepared.automaticRetries,
      maxOutputTokens: prepared.body.generationConfig.maxOutputTokens},
    requiredBeforeDispatch: prepared.requiredBeforeDispatch,
  });
}

/**
 * Frontend DTO for a reviewed model draft. One row per source clause, in order,
 * with the exact quote and UTF-16 span. `tool` is the code-mapped tool for a
 * supported row; held rows keep the model's capability only in `serverGuard`.
 */
export function proposalDto(draft) {
  const guardOf = id => (draft.guards ?? []).find(g => g.clauseId === id) ?? null;
  const clauses = draft.clauses.map(c => {
    const condition = draft.conditions.find(x => x.clauseId === c.id) ?? null;
    const question = draft.questions.find(x => x.clauseId === c.id) ?? null;
    const guard = guardOf(c.id);
    return {
      clauseId: c.id, quote: c.text, start: c.start, end: c.end,
      status: condition ? 'SUPPORTED' : question.reason,
      capability: condition?.capability ?? null,
      tool: condition ? toolFor(condition.capability).tool : null,
      question: question?.question ?? null,
      serverGuard: guard ? {kinds: [...guard.kinds], modelStatus: guard.modelStatus, modelCapability: guard.modelCapability} : null,
    };
  });
  return Object.freeze({
    ...gates, version: 'clear-condition-proposal.1', executionMode: draft.executionMode,
    sourceHash: draft.sourceHash, proposalHash: draft.proposalHash, draftHash: draft.draftHash,
    status: draft.status, toolSelection: TOOL_SELECTION, clauses,
    // Ready for an operator decision only when every clause is one supported condition.
    operatorCanApprove: draft.status === 'OPERATOR_REVIEW_REQUIRED' || draft.status === 'READY',
    heldClauses: clauses.filter(c => c.status !== 'SUPPORTED').length,
  });
}

/** Original model rows, never effective/held rows. Legacy drafts need a fresh proposal. */
export function rowsFromDraft(draft) {
  if (draft.version !== 'clear-preview-model-draft.2' || !Array.isArray(draft.modelRows)) {
    throw Object.assign(new Error('MODEL_ROWS_UNAVAILABLE'), {code: 'MODEL_ROWS_UNAVAILABLE'});
  }
  if (hash({sourceText: draft.sourceText, rows: draft.modelRows}) !== draft.proposalHash) {
    throw Object.assign(new Error('MODEL_ROWS_BINDING'), {code: 'MODEL_ROWS_BINDING'});
  }
  return draft.modelRows.map(row => ({...row}));
}

/**
 * Ask Gemini through the host port. Result `stage`:
 *   PROPOSED                 model replied, reply passed the strict schema/AST checks
 *   APPROVAL_REQUIRED        no host approval/port — nothing dispatched
 *   MODEL_CALL_FAILED        host consumption, transport, HTTP or abort failure
 *   MODEL_RESPONSE_REJECTED  a reply arrived but failed span/coverage/schema checks
 * There is no rule-based fallback in any branch.
 *
 * @param {string} sourceText  operator's original notice text
 * @param {{approvalRef:string, claimAndDispatch:Function, signal?:AbortSignal, transportExecution?:string}} host
 */
export async function structureWithGemini(sourceText, {approvalRef, claimAndDispatch, signal, transportExecution = 'HOST_SUPPLIED'} = {}) {
  const prepared = prepareGeminiStructureRequest(sourceText);
  const call = {attempted: false, replied: false, execution: transportExecution, model: prepared.model, bodyHash: prepared.bodyHash};
  const port = typeof claimAndDispatch === 'function' ? async wire => {
    call.attempted = true;
    const reply = await claimAndDispatch(wire);
    call.replied = true;
    return reply;
  } : claimAndDispatch;
  const failed = (stage, error) => Object.freeze({
    // Host entry proves neither consumption nor dispatch. The host's reserved
    // APPROVAL_REQUIRED_OR_SPENT code means rejection before provider dispatch.
    // Other failures without a reply cannot establish dispatch: null = unknown.
    ...gates, version: STRUCTURING_VERSION, stage,
    actualModelCall: transportExecution !== 'ACTUAL' || !call.attempted ? false : call.replied ? true
      : codeOf(error) === 'APPROVAL_REQUIRED_OR_SPENT' ? false : null,
    modelCall: {...call, succeeded: false, errorCode: SAFE_FAILURE.test(codeOf(error)) || RESPONSE_REJECTED.test(codeOf(error)) ? codeOf(error) : 'MODEL_CALL_FAILED'},
    fallback: 'NONE', proposal: null, draft: null,
  });
  try {
    const {draft, provenance} = await requestGeminiPreview(sourceText, {approvalRef, claimAndDispatch: port, signal});
    return Object.freeze({
      ...gates, version: STRUCTURING_VERSION, stage: 'PROPOSED', actualModelCall: transportExecution === 'ACTUAL',
      modelCall: {...call, succeeded: true, provenance, errorCode: null},
      fallback: 'NONE', proposal: proposalDto(draft), draft,
    });
  } catch (error) {
    if (codeOf(error) === 'GEMINI_HOST_APPROVAL_REQUIRED') return failed('APPROVAL_REQUIRED', error);
    if (call.replied && RESPONSE_REJECTED.test(codeOf(error))) return failed('MODEL_RESPONSE_REJECTED', error);
    return failed('MODEL_CALL_FAILED', error);
  }
}

/**
 * Operator approved the shown proposal (reviewedHash = proposal.proposalHash).
 * Re-review the stored rows against the current source, then map to registered
 * tools and validate. Throws DRAFT_NOT_READY for held, unsupported or unreviewed
 * drafts, and MODEL_SOURCE_SPAN / MODEL_CLAUSE_COVERAGE if the source changed.
 */
export function planReviewedProposal({sourceText, rows, reviewedHash}) {
  const draft = reviewModelProposal(sourceText, rows, reviewedHash);
  const plan = buildPlan(draft);
  const validation = validatePlan(plan, draft);
  if (!validation.ok) throw Object.assign(new Error(validation.errors[0]), {code: validation.errors[0]});
  return {draft, plan, validation};
}

/** Plan + validation + the existing public synthetic executor, with provenance labels. */
export function executeReviewedProposal({sourceText, rows, reviewedHash, actualModelCall = false}) {
  const {draft, plan, validation} = planReviewedProposal({sourceText, rows, reviewedHash});
  const result = executePublicDemo(plan, draft);
  return Object.freeze({
    ...gates, version: 'clear-condition-structuring-result.1',
    proposalHash: draft.proposalHash, sourceHash: draft.sourceHash, planHash: plan.planHash,
    toolSelection: TOOL_SELECTION,
    steps: plan.steps.map(step => ({stepId: step.id, conditionId: step.conditionId,
      capability: draft.conditions.find(c => c.id === step.conditionId).capability,
      tool: step.tool, version: step.version, selectedBy: 'CODE_TOOL_MANIFEST'})),
    validation: {ok: validation.ok, errors: [...validation.errors]},
    // Model provenance and tool provenance are separate facts.
    actualModelCall,
    execution: {executionMode: result.executionMode, toolSource: 'PUBLIC_FIXTURE', actualMoodleQuery: false,
      actualReclaimVerification: false, calls: [...result.calls],
      observations: result.observations.map(o => ({stepId: o.stepId, tool: o.tool, state: o.state,
        authenticity: o.authenticity, signatureVerified: o.signatureVerified, recordHash: o.recordHash}))},
    resultHash: hash({planHash: plan.planHash, calls: result.calls}),
  });
}
