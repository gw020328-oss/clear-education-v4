// PROPOSAL ONLY. Intended destination: web/src/bootcamp/finals-panels/condition-proposal.js
// Convert an ALREADY GENERATED server reply. No fetch, approval consumption, model call or executor.
const fail = code => { throw Object.assign(Error(code), {code}); };
const check = (value, code='PROPOSAL_INVALID') => { if (!value) fail(code); };
const frozen = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
};
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const tools = Object.freeze({
  'MOODLE_ACTIVITY_COMPLETION.1':'moodle.activity.public',
  'MOODLE_ASSIGNMENT_SUBMISSION.1':'moodle.assignment.public',
  'REFLECTION_REQUIRED_TOPICS.1':'reflection.topics.public',
  'HACKERRANK_CERTIFICATE_HOLDING.1':'hackerrank.certificate.public',
});
const shaSource = async sourceText => {
  // Same string serialization as clear-core hash(sourceText); UTF-16 offsets stay JS string offsets.
  const bytes = new TextEncoder().encode(JSON.stringify(sourceText));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('');
};
export async function toPanelProposal(sourceText, generated, {expectedBodyHash, now, executionContract='DISPLAY_ONLY'} = {}) {
  check(typeof sourceText === 'string' && sourceText.length > 0 && sourceText.length <= 4096 && sourceText.isWellFormed());
  check(Number.isSafeInteger(now), 'PROPOSAL_CLOCK_REQUIRED');
  check(['DISPLAY_ONLY','D_SINGLE_ACTIVITY_OFFLINE.1'].includes(executionContract));
  check(generated?.version === 'clear-external-preview-draft.1');
  check(hex(expectedBodyHash) && generated.bodyHash === expectedBodyHash, 'PROPOSAL_BODY_BINDING');
  check(typeof generated.draftId === 'string' && /^[a-f0-9-]{36}$/.test(generated.draftId));
  check(Number.isSafeInteger(generated.expiresAt) && generated.expiresAt > now, 'EXPIRED');
  const p = generated.proposal, call = generated.modelCall;
  check(p?.version === 'clear-condition-proposal.1' && p.executionMode === 'MODEL_PROPOSAL');
  check(p.scope === 'PRECONFIGURATION_ONLY' && p.automaticEligibility === false && p.paymentAllowed === false);
  check(generated.automaticEligibility === false && generated.paymentAllowed === false);
  check(p.toolSelection === 'MODEL_CLASSIFIES_CAPABILITY_CODE_MAPS_TOOL');
  check(hex(p.proposalHash) && hex(p.draftHash) && p.sourceHash === await shaSource(sourceText), 'PROPOSAL_SOURCE_BINDING');
  check(['OPERATOR_REVIEW_REQUIRED','NEEDS_CLARIFICATION','UNSUPPORTED'].includes(p.status));
  check(call?.succeeded === true && call.replied === true && call.errorCode === null);
  check(['ACTUAL','OFFLINE_TEST_TRANSPORT'].includes(call.execution));
  check(call.bodyHash === expectedBodyHash && generated.actualModelCall === (call.execution === 'ACTUAL'));
  // Full server clause coverage, in order. Do not use the frontend's sentence rewriting/splitting rules.
  const spans = [...sourceText.matchAll(/[^;\n]+/gu)].flatMap(match => {
    const quote = match[0].trim();
    if (!quote) return [];
    const start = match.index + match[0].indexOf(quote);
    return [{quote,start,end:start+quote.length}];
  });
  check(Array.isArray(p.clauses) && p.clauses.length === spans.length && spans.length > 0 && spans.length <= 16);
  const seen = new Set();
  const clauses = p.clauses.map((c, index) => {
    const span = spans[index];
    check(c.clauseId === `clause-${index+1}` && c.quote === span.quote && c.start === span.start && c.end === span.end, 'PROPOSAL_SOURCE_SPAN');
    check(['SUPPORTED','NEEDS_CLARIFICATION','UNSUPPORTED'].includes(c.status));
    const supported = c.status === 'SUPPORTED';
    if (supported) {
      check(Object.hasOwn(tools,c.capability) && c.tool === tools[c.capability] && c.question === null && c.serverGuard === null);
      check(!seen.has(c.capability)); seen.add(c.capability);
    } else check(c.capability === null && c.tool === null && typeof c.question === 'string' && c.question.trim().length > 0);
    return {
      index, clauseId:c.clauseId, original:c.quote, start:c.start, end:c.end,
      capability:supported ? c.capability : null,
      // Legacy panel display marker only. This is the exact quote, NOT a rewritten canonical sentence.
      canonical:supported ? c.quote : null,
      note:c.question, source:call.execution === 'ACTUAL' ? 'Gemini 실제 응답' : '오프라인 모델 응답 대역',
      held:c.status === 'NEEDS_CLARIFICATION', notOurs:c.status === 'UNSUPPORTED',
      serverGuard:c.serverGuard ? structuredClone(c.serverGuard) : null,
    };
  });
  const held = clauses.filter(c => !c.canonical).length;
  const status = clauses.some(c => c.notOurs) ? 'UNSUPPORTED' : held ? 'NEEDS_CLARIFICATION' : 'OPERATOR_REVIEW_REQUIRED';
  check(p.status === status && p.heldClauses === held && p.operatorCanApprove === (held === 0));
  const kept = clauses.filter(c => c.canonical);
  const executionAccepted = executionContract === 'D_SINGLE_ACTIVITY_OFFLINE.1'
    && clauses.length === 1 && clauses[0].capability === 'MOODLE_ACTIVITY_COMPLETION.1';
  return frozen({
    clauses, kept, readable:kept.length, unreadable:held, held, duplicates:[],
    canonicalText:sourceText, // Compatibility key only. Server mode never sends this to a rule/fixture executor.
    complete:held === 0, operatorCanApprove:p.operatorCanApprove,
    canExecute:p.operatorCanApprove && held === 0 && executionAccepted,
    serverBinding:{kind:'SERVER_MODEL_PROPOSAL',sourceText,draftId:generated.draftId,
      proposalHash:p.proposalHash,sourceHash:p.sourceHash,bodyHash:generated.bodyHash,expiresAt:generated.expiresAt},
    provenance:{modelCall:structuredClone(call), actualModelCall:generated.actualModelCall},
  });
}
