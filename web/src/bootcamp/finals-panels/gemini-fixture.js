// Gemini 제안자 — **오프라인 응답 대역**. 실제 Gemini 호출이 아니다.
//
// 서버(B 의 condition-structuring)가 돌려주는 native `clear-condition-structuring.2`
// 성공 패킷을 흉내 내서 E 세션 변환기 v2.1(condition-proposal.js 의 toPanelProposal)에
// 넣는다. 목적은 화면이 Gemini 제안을 어떻게 보여 주는지 미리 맞춰 보는 것뿐이다.
//
//   · 서버 계약대로 **한 조항 = 한 조건**. 원문을 쪼개거나 고쳐 보내지 않는다.
//   · 한 조항에 조건이 여럿이면 서버가 하듯 NEEDS_CLARIFICATION(MULTIPLE_CONDITIONS).
//   · 자동 검증 미지원(출석률 등)은 UNSUPPORTED. 조건이 안 보이는 문장도 UNSUPPORTED.
//   · modelCall.execution 은 OFFLINE_TEST_TRANSPORT, actualModelCall:false.
//     화면 배지가 "오프라인 응답 대역 · 실제 호출 아님" 으로 보인다.
//   · 실패 대역(FAILING_GEMINI_PROPOSER)은 actualModelCall:**null** — "전송 여부 미확인".
//     null 을 false 로 바꾸지 않는다(오규원 11/5).
//
// 조항별 분류에 프론트 규칙(normalize.js)을 **대역 안에서만** 빌려 쓴다. 이건 서버가
// Gemini 로 할 일을 흉내 내는 것이지, 규칙 제안자를 Gemini 라고 부르는 게 아니다.
// 실제 연결 때 이 파일은 CLEAR 서버 중계 응답으로 대체된다.

import { proposeReading } from './normalize.js';
import { toPanelProposal, failureView } from './condition-proposal.js';

/** 시험 전송의 고정 bodyHash. 실제 값은 서버가 준다 */
export const OFFLINE_BODY_HASH = 'b'.repeat(64);
export const OFFLINE_MODEL = 'gemini-3.5-flash-lite';

const TOOLS = Object.freeze({
  'MOODLE_ACTIVITY_COMPLETION.1': 'moodle.activity.public',
  'MOODLE_ASSIGNMENT_SUBMISSION.1': 'moodle.assignment.public',
  'REFLECTION_REQUIRED_TOPICS.1': 'reflection.topics.public',
  'HACKERRANK_CERTIFICATE_HOLDING.1': 'hackerrank.certificate.public',
});
const TARGETS = Object.freeze({
  'MOODLE_ACTIVITY_COMPLETION.1': 'python-intro',
  'MOODLE_ASSIGNMENT_SUBMISSION.1': 'python-assignment',
  'REFLECTION_REQUIRED_TOPICS.1': 'python-reflection',
  'HACKERRANK_CERTIFICATE_HOLDING.1': 'python-basic',
});

const hexOf = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

/** 변환기와 같은 직렬화 — clear-core 의 hash(sourceText) */
export async function sha256Json(value) {
  return hexOf(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))));
}

/** 변환기의 digest 와 같은 정규화(키 정렬) 지문 — proposalHash · draftHash 용 */
const canonical = (v) => (Array.isArray(v) ? v.map(canonical)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v);
export async function digestCanonical(value) {
  return hexOf(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(value)))));
}

/** 서버와 같은 조항 나누기 — `;` 와 줄바꿈. 변환기가 같은 규칙으로 대조한다 */
export function serverSpans(sourceText) {
  return [...sourceText.matchAll(/[^;\n]+/gu)].flatMap((m) => {
    const quote = m[0].trim();
    if (!quote) return [];
    const start = m.index + m[0].indexOf(quote);
    return [{ quote, start, end: start + quote.length }];
  });
}

/** 조항 하나를 서버처럼 분류한다. 대역용 — 규칙을 빌려 쓴다 */
function classify(quote, seen) {
  const p = proposeReading(quote);
  const caps = p.kept.map((c) => c.capability);
  if (p.clauses.some((c) => c.notOurs)) {
    return { status: 'UNSUPPORTED', reason: 'UNSUPPORTED', question: '자동 검증 미지원 — 정책 확정 전 처리 필요', guard: { kinds: ['UNSUPPORTED_MEASURE'], modelStatus: 'UNSUPPORTED', modelCapability: null } };
  }
  const heldClause = p.clauses.find((c) => c.held);
  if (heldClause) {
    return { status: 'NEEDS_CLARIFICATION', reason: 'NEEDS_CLARIFICATION', question: '조건 사이 관계(또는·대신)를 확인해 주세요', guard: { kinds: [heldClause.relation ?? 'ALTERNATIVE'], modelStatus: 'SUPPORTED', modelCapability: caps[0] ?? heldClause.mentions?.[0] ?? null } };
  }
  if (caps.length > 1) {
    return { status: 'NEEDS_CLARIFICATION', reason: 'NEEDS_CLARIFICATION', question: '한 조항에 조건이 여럿입니다. 조항을 명시적으로 나누세요', guard: { kinds: ['MULTIPLE_CONDITIONS'], modelStatus: 'SUPPORTED', modelCapability: caps[0] } };
  }
  if (caps.length === 1) {
    if (seen.has(caps[0])) return { status: 'NEEDS_CLARIFICATION', reason: 'NEEDS_CLARIFICATION', question: '앞 조항과 같은 조건입니다', guard: { kinds: ['DUPLICATE'], modelStatus: 'SUPPORTED', modelCapability: caps[0] } };
    seen.add(caps[0]);
    return { status: 'SUPPORTED', capability: caps[0] };
  }
  return { status: 'UNSUPPORTED', reason: 'UNSUPPORTED', question: '지원하는 조건 문장이 아닙니다', guard: null };
}

/**
 * native `clear-condition-structuring.2` 성공 패킷과 변환기 context 를 만든다.
 * 변환기가 검사하는 지문(sourceHash · proposalHash · draftHash · guards)을 같은 식으로 계산한다.
 */
export async function offlineGeminiPacket(sourceText, { now = Date.now(), ttlMs = 10 * 60 * 1000 } = {}) {
  const seen = new Set();
  const spans = serverSpans(sourceText);
  const rows = spans.map((span, i) => ({ span, id: `clause-${i + 1}`, c: classify(span.quote, seen) }));

  const modelRows = rows.map(({ span, c }) => ({
    quote: span.quote, start: span.start, end: span.end,
    // 모델이 본 상태. 서버 보류(guard)가 있어도 모델 행은 모델이 말한 그대로다.
    status: c.guard?.modelStatus ?? c.status,
    capability: c.guard?.modelStatus === 'SUPPORTED' ? c.guard.modelCapability : (c.capability ?? null),
    question: c.status === 'SUPPORTED' ? null : (c.guard?.modelStatus === 'SUPPORTED' ? null : c.question),
  }));
  const clauses = rows.map(({ span, id }) => ({ id, start: span.start, end: span.end, text: span.quote }));
  const conditions = rows.filter(({ c }) => c.status === 'SUPPORTED')
    .map(({ id, c }, i) => ({ id: `condition-${i + 1}`, clauseId: id, capability: c.capability, target: TARGETS[c.capability] }));
  const questions = rows.filter(({ c }) => c.status !== 'SUPPORTED')
    .map(({ id, c }) => ({ clauseId: id, reason: c.reason, question: c.question }));
  const guards = rows.filter(({ c }) => c.guard)
    .map(({ id, c }) => ({ clauseId: id, kinds: c.guard.kinds, modelStatus: c.guard.modelStatus, modelCapability: c.guard.modelCapability }));
  const heldCount = questions.length;
  const status = rows.some(({ c }) => c.status === 'UNSUPPORTED') ? 'UNSUPPORTED' : heldCount ? 'NEEDS_CLARIFICATION' : 'OPERATOR_REVIEW_REQUIRED';

  const sourceHash = await sha256Json(sourceText);
  const proposalHash = await digestCanonical({ sourceText, rows: modelRows });
  const draftBody = {
    version: 'clear-preview-model-draft.2', executionMode: 'MODEL_PROPOSAL',
    sourceText, sourceHash, proposalHash, modelRows, clauses, conditions, questions, guards, status,
  };
  const draftHash = await digestCanonical(draftBody);
  const draft = { ...draftBody, draftHash };

  const proposalClauses = rows.map(({ span, id, c }) => {
    const supported = c.status === 'SUPPORTED';
    return {
      clauseId: id, quote: span.quote, start: span.start, end: span.end,
      status: c.status,
      capability: supported ? c.capability : null,
      tool: supported ? TOOLS[c.capability] : null,
      question: supported ? null : c.question,
      serverGuard: supported ? null : (c.guard ? { kinds: c.guard.kinds, modelStatus: c.guard.modelStatus, modelCapability: c.guard.modelCapability } : null),
    };
  });
  const proposal = {
    scope: 'PRECONFIGURATION_ONLY', automaticEligibility: false, paymentAllowed: false,
    version: 'clear-condition-proposal.1', executionMode: 'MODEL_PROPOSAL',
    sourceHash, proposalHash, draftHash, status, toolSelection: 'MODEL_CLASSIFIES_CAPABILITY_CODE_MAPS_TOOL',
    clauses: proposalClauses, operatorCanApprove: heldCount === 0, heldClauses: heldCount,
  };
  const packet = {
    version: 'clear-condition-structuring.2', stage: 'PROPOSED', fallback: 'NONE',
    scope: 'PRECONFIGURATION_ONLY', automaticEligibility: false, paymentAllowed: false,
    actualModelCall: false,
    modelCall: { attempted: true, replied: true, succeeded: true, errorCode: null, execution: 'OFFLINE_TEST_TRANSPORT', model: OFFLINE_MODEL, bodyHash: OFFLINE_BODY_HASH },
    draft, proposal,
  };
  const context = {
    expectedBodyHash: OFFLINE_BODY_HASH, expectedProposalHash: proposalHash, now,
    draftId: '01234567-89ab-4cde-8fab-0123456789ab', expiresAt: now + ttlMs,
  };
  return { packet, context };
}

/** 실패 대역 — 전송은 됐는데 답을 못 받아 실제 호출 여부를 모르는 경우(null) */
export function offlineGeminiFailure({ errorCode = 'GEMINI_NETWORK_FAILURE', execution = 'ACTUAL' } = {}) {
  const attempted = true; const replied = false;
  const actualModelCall = execution !== 'ACTUAL' ? false : errorCode === 'APPROVAL_REQUIRED_OR_SPENT' ? false : null;
  return {
    version: 'clear-condition-structuring.2', stage: 'MODEL_CALL_FAILED', fallback: 'NONE',
    proposal: null, draft: null, actualModelCall,
    modelCall: { attempted, replied, succeeded: false, errorCode, execution },
  };
}

/**
 * 화면에 끼우는 제안자. `explicit:true` — 입력할 때마다 부르지 않고 「제안 생성」 을
 * 눌러야 한 번 돈다. 실제 연결 때는 propose 만 CLEAR 서버 중계 호출로 바뀐다.
 */
export const OFFLINE_GEMINI_PROPOSER = Object.freeze({
  id: 'gemini-offline',
  kind: 'model',
  explicit: true,
  label: 'Gemini 제안 · 오프라인 응답 대역 · 실제 호출 아님',
  idleLabel: 'Gemini 제안 · 「제안 생성」 을 눌러야 호출',
  propose: async (text) => {
    const { packet, context } = await offlineGeminiPacket(text);
    return toPanelProposal(text, packet, context);
  },
});

/** 실패 시연용 제안자 — 서버가 "보냈는데 답이 없다" 고 답한 경우. 전송 여부 미확인(null) */
export const FAILING_GEMINI_PROPOSER = Object.freeze({
  id: 'gemini-offline-failure',
  kind: 'model',
  explicit: true,
  label: 'Gemini 제안 · 실패 대역',
  idleLabel: 'Gemini 제안 · 「제안 생성」 을 눌러야 호출 (실패 시연)',
  propose: async () => failureView(offlineGeminiFailure()),
});
