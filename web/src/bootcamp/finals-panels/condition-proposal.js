// Gemini 조건 제안 → 화면 제안 변환기 **v2.1**. E 세션 후보(docs/pivot/gemini-proposal-candidate, d696f03)를 그대로 가져왔다.
// native clear-condition-structuring.2 성공(PROPOSED)과 D 성공 envelope clear-external-preview-draft.1(methods 포함)을 받는다.
// 실패는 failureView 로 따로 표시한다. actualModelCall:null 은 "전송 여부 미확인" — false 로 바꾸지 않는다.
// fetch · 승인 소비 · 모델 호출 · 실행기는 없다. 기본 실행 계약 DISPLAY_ONLY.
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
async function panelFromSuccess(sourceText, generated, {expectedBodyHash, now, executionContract='DISPLAY_ONLY'} = {}) {
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


// Successor API: native wrapper .2 uses caller-owned server storage identity; D success .1 stays separate.
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v==='object'
  ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])) : v;
const digest = async v => {
  const bytes=new TextEncoder().encode(JSON.stringify(canonical(v)));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
};
export function callLabel(value) {
  check(value===true || value===false || value===null,'MODEL_CALL_STATE');
  return value===null ? '전송 여부 미확인' : value ? '실제 모델 응답 수신 · 도구 실행과 별개' : '실제 모델 호출 없음';
}
export function failureView(packet) {
  check(packet?.version==='clear-condition-structuring.2','STRUCTURING_VERSION');
  check(['APPROVAL_REQUIRED','MODEL_CALL_FAILED','MODEL_RESPONSE_REJECTED'].includes(packet.stage));
  check(packet.proposal===null && packet.draft===null && packet.fallback==='NONE');
  const c=packet.modelCall;
  check(c && typeof c.attempted==='boolean' && typeof c.replied==='boolean' && c.succeeded===false);
  // Native wrapper default HOST_SUPPLIED is explicit; missing/unknown transport is invalid.
  check(Object.hasOwn(c,'execution') && ['ACTUAL','OFFLINE_TEST_TRANSPORT','HOST_SUPPLIED'].includes(c.execution),'MODEL_CALL_EXECUTION');
  check(!c.replied || c.attempted);
  const expected=c.execution!=='ACTUAL'||!c.attempted ? false : c.replied ? true
    : c.errorCode==='APPROVAL_REQUIRED_OR_SPENT' ? false : null;
  check(packet.actualModelCall===expected,'MODEL_CALL_STATE');
  return frozen({kind:'GENERATION_FAILURE',stage:packet.stage,canExecute:false,proposal:null,
    actualModelCall:expected,label:callLabel(expected),modelCall:structuredClone(c)});
}
async function verifyNative(sourceText, draft, proposal) {
  check(draft?.version==='clear-preview-model-draft.2','MODEL_ROWS_UNAVAILABLE');
  check(draft.sourceText===sourceText && draft.sourceHash===await shaSource(sourceText),'PROPOSAL_SOURCE_BINDING');
  check(Array.isArray(draft.modelRows) && draft.modelRows.length===draft.clauses.length);
  check(await digest({sourceText,rows:draft.modelRows})===draft.proposalHash,'MODEL_ROWS_BINDING');
  const {draftHash,...body}=draft;
  check(await digest(body)===draftHash,'DRAFT_HASH_BINDING');
  check(proposal.draftHash===draftHash && proposal.proposalHash===draft.proposalHash && proposal.status===draft.status);
  for(let i=0;i<draft.clauses.length;i++) {
    const c=draft.clauses[i],row=draft.modelRows[i],p=proposal.clauses[i];
    check(row.quote===c.text && row.start===c.start && row.end===c.end,'MODEL_ROWS_SPAN');
    const condition=draft.conditions.find(x=>x.clauseId===c.id),q=draft.questions.find(x=>x.clauseId===c.id);
    const guard=draft.guards.find(x=>x.clauseId===c.id)??null;
    check(p.clauseId===c.id && p.status===(condition?'SUPPORTED':q?.reason)
      && p.capability===(condition?.capability??null) && p.question===(q?.question??null));
    const expected=guard?{kinds:guard.kinds,modelStatus:guard.modelStatus,modelCapability:guard.modelCapability}:null;
    check(await digest(expected)===await digest(p.serverGuard),'GUARDS_BINDING');
  }
}
export async function toPanelProposal(sourceText, packet, context={}) {
  packet=structuredClone(packet); context=structuredClone(context);
  check(hex(context.expectedProposalHash) && packet?.proposal?.proposalHash===context.expectedProposalHash,'CURRENT_PROPOSAL_PIN');
  check(packet.version==='clear-condition-structuring.2' || packet.version==='clear-external-preview-draft.1','STRUCTURING_VERSION');
  if(packet.version==='clear-condition-structuring.2') {
    check(packet.stage==='PROPOSED' && packet.fallback==='NONE','GENERATION_NOT_SUCCESS');
    check(packet.modelCall?.attempted===true && packet.modelCall.model==='gemini-3.5-flash-lite','MODEL_CALL_STATE');
    await verifyNative(sourceText,packet.draft,packet.proposal);
    const envelope={...packet,version:'clear-external-preview-draft.1',draftId:context.draftId,
      expiresAt:context.expiresAt,bodyHash:packet.modelCall.bodyHash};
    const panel=await panelFromSuccess(sourceText,envelope,context);
    return frozen({...panel,cacheVersion:'clear-panel-model-cache.2',modelRows:structuredClone(packet.draft.modelRows)});
  }
  const c=packet.modelCall;
  check(c?.attempted===true && c.replied===true && c.succeeded===true && c.errorCode===null,'D_CALL_STATE');
  for(const name of ['countTokens','generateContent']) {
    check(c.methods?.[name]?.invoked===true && c.methods[name].replied===true,'D_METHOD_STATE');
  }
  check(c.model===packet.model && c.model==='gemini-3.5-flash-lite','D_MODEL');
  check(packet.modelProvenance===(c.execution==='ACTUAL'?'ACTUAL_GEMINI_HTTP':'OFFLINE_TEST_TRANSPORT'),'D_PROVENANCE');
  await verifyNative(sourceText,packet.draft,packet.proposal);
  const panel=await panelFromSuccess(sourceText,packet,context);
  return frozen({...panel,cacheVersion:'clear-panel-model-cache.2',modelRows:structuredClone(packet.draft.modelRows)});
}
