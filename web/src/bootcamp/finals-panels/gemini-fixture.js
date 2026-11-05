// Gemini 제안자 — **오프라인 응답 대역**. 실제 Gemini 호출이 아니다.
//
// 서버(B 의 condition-structuring)가 돌려주는 `clear-external-preview-draft.1` 응답을
// 흉내 내서 E 세션 변환기(condition-proposal.js 의 toPanelProposal)에 넣는다. 목적은
// 화면이 Gemini 제안을 어떻게 보여 주는지 미리 맞춰 보는 것뿐이다.
//
//   · 서버 계약대로 **한 조항 = 한 조건**. 원문을 쪼개거나 고쳐 보내지 않는다.
//   · 한 조항에 조건이 여럿이면 서버가 하듯 NEEDS_CLARIFICATION(MULTIPLE_CONDITIONS).
//   · 자동 검증 미지원(출석률 등)은 UNSUPPORTED. 조건이 안 보이는 문장도 UNSUPPORTED.
//   · 응답의 modelCall.execution 은 OFFLINE_TEST_TRANSPORT, actualModelCall:false.
//     화면 배지가 "오프라인 응답 대역 · 실제 호출 아님" 으로 보인다.
//
// 조항별 분류에 프론트 규칙(normalize.js)을 **대역 안에서만** 빌려 쓴다. 이건 서버가
// Gemini 로 할 일을 흉내 내는 것이지, 규칙 제안자를 Gemini 라고 부르는 게 아니다.
// 실제 연결 때 이 파일은 CLEAR 서버 중계 응답으로 대체된다.

import { proposeReading } from './normalize.js';
import { toPanelProposal } from './condition-proposal.js';

/** 시험 전송의 고정 bodyHash. 실제 값은 서버가 준다 */
export const OFFLINE_BODY_HASH = 'b'.repeat(64);

const TOOLS = Object.freeze({
  'MOODLE_ACTIVITY_COMPLETION.1': 'moodle.activity.public',
  'MOODLE_ASSIGNMENT_SUBMISSION.1': 'moodle.assignment.public',
  'REFLECTION_REQUIRED_TOPICS.1': 'reflection.topics.public',
  'HACKERRANK_CERTIFICATE_HOLDING.1': 'hackerrank.certificate.public',
});

/** 변환기와 같은 직렬화로 sourceHash 를 만든다 (clear-core 의 hash(sourceText)) */
export async function sha256Json(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
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
  const notOurs = p.clauses.some((c) => c.notOurs);
  if (notOurs) return { status: 'UNSUPPORTED', question: '자동 검증 미지원 — 정책 확정 전 처리 필요' };
  if (p.clauses.some((c) => c.held)) {
    return { status: 'NEEDS_CLARIFICATION', question: '조건 사이 관계(또는·대신)를 확인해 주세요', guard: { kinds: [p.clauses.find((c) => c.held).relation ?? 'ALTERNATIVE'], modelStatus: 'SUPPORTED', modelCapability: caps[0] ?? null } };
  }
  if (caps.length > 1) {
    return { status: 'NEEDS_CLARIFICATION', question: '한 조항에 조건이 여럿입니다. 조항을 명시적으로 나누세요', guard: { kinds: ['MULTIPLE_CONDITIONS'], modelStatus: 'SUPPORTED', modelCapability: caps[0] } };
  }
  if (caps.length === 1) {
    if (seen.has(caps[0])) return { status: 'NEEDS_CLARIFICATION', question: '앞 조항과 같은 조건입니다', guard: { kinds: ['DUPLICATE'], modelStatus: 'SUPPORTED', modelCapability: caps[0] } };
    seen.add(caps[0]);
    return { status: 'SUPPORTED', capability: caps[0] };
  }
  return { status: 'UNSUPPORTED', question: '지원하는 조건 문장이 아닙니다' };
}

/**
 * `clear-external-preview-draft.1` 모양의 대역 응답을 만든다.
 * @param {string} sourceText
 * @param {{now?:number, ttlMs?:number}} [o]
 */
export async function offlineGeminiReply(sourceText, { now = Date.now(), ttlMs = 10 * 60 * 1000 } = {}) {
  const seen = new Set();
  const clauses = serverSpans(sourceText).map((span, i) => {
    const c = classify(span.quote, seen);
    const supported = c.status === 'SUPPORTED';
    return {
      clauseId: `clause-${i + 1}`, quote: span.quote, start: span.start, end: span.end,
      status: c.status,
      capability: supported ? c.capability : null,
      tool: supported ? TOOLS[c.capability] : null,
      question: supported ? null : c.question,
      serverGuard: supported ? null : (c.guard ?? null),
    };
  });
  const held = clauses.filter((c) => c.status !== 'SUPPORTED').length;
  const status = clauses.some((c) => c.status === 'UNSUPPORTED') ? 'UNSUPPORTED' : held ? 'NEEDS_CLARIFICATION' : 'OPERATOR_REVIEW_REQUIRED';
  const sourceHash = await sha256Json(sourceText);
  return {
    version: 'clear-external-preview-draft.1',
    draftId: '01234567-89ab-4cde-8fab-0123456789ab',
    expiresAt: now + ttlMs,
    bodyHash: OFFLINE_BODY_HASH,
    actualModelCall: false,
    automaticEligibility: false,
    paymentAllowed: false,
    modelCall: { succeeded: true, replied: true, errorCode: null, execution: 'OFFLINE_TEST_TRANSPORT', bodyHash: OFFLINE_BODY_HASH },
    proposal: {
      version: 'clear-condition-proposal.1', executionMode: 'MODEL_PROPOSAL', scope: 'PRECONFIGURATION_ONLY',
      automaticEligibility: false, paymentAllowed: false, toolSelection: 'MODEL_CLASSIFIES_CAPABILITY_CODE_MAPS_TOOL',
      sourceHash, proposalHash: 'c'.repeat(64), draftHash: 'd'.repeat(64),
      status, heldClauses: held, operatorCanApprove: held === 0, clauses,
    },
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
  propose: async (text) => toPanelProposal(text, await offlineGeminiReply(text), { expectedBodyHash: OFFLINE_BODY_HASH, now: Date.now() }),
});
