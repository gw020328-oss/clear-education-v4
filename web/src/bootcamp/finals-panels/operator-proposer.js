// 운영자 제안자 — CLEAR 서버 중계(POST /bootcamp/preview/*)로 Gemini 제안을 받는다.
//
// ai-compare 의 명시적 제안자 자리에 끼운다(PR #167). 지키는 것.
//
//   · 「제안 생성」 을 눌렀을 때만 보낸다. 입력이 바뀌면 invalidate() 로 세대를 올리고
//     진행 중 요청을 끊는다. 늦게 온 응답은 쓰지 않는다
//   · 브라우저는 원문과 서버가 준 contextRef·revision·bodyHash 만 보낸다. 운영자·강좌·
//     승인 ref·모델·실행 방식은 서버가 정한다. D 의 서버 간 비밀은 브라우저에 없다
//   · 승인은 서버가 결합한다. prepare 가 REQUIRED 면 generate 를 보내지 않는다
//   · 성공 응답은 E 변환기(operator-proposal.js → condition-proposal-v21.js)로만 화면 제안이
//     된다. 결과는 DISPLAY_ONLY 다 — 실행 버튼을 열지 않는다
//   · 실패는 성공 제안으로 바꾸지 않는다. RELAY 와 D_HTTP 를 섞지 않고, 모델 호출 여부를
//     모르면 '미확인' 이라고 쓴다. D_HTTP 를 '호출 없음' 으로 지어내지 않는다
//
// request 포트는 기존 지갑 세션의 request(path, {method, body, signal}) 다
// (wallet-session.js → transport.js). 쿠키·CSRF 는 그쪽이 붙인다.

import { toOperatorPanel } from './operator-proposal.js';
import { callLabel } from './condition-proposal-v21.js';

export const OPERATOR_PREVIEW_VERSION = 'clear-operator-preview.1';
const PATH = Object.freeze({
  prepare: '/bootcamp/preview/prepare',
  generate: '/bootcamp/preview/generate',
});
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HEX = /^[a-f0-9]{64}$/;

/** 화면에 보일 결과의 갈래. 넷을 섞지 않는다 */
export const OUTCOME = Object.freeze({
  PROPOSED: 'PROPOSED',                 // 제안 수신(보류 조항은 제안 안에서 따로 보인다)
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED', // 이 원문에 대한 직접 승인이 아직 없다
  EXPIRED: 'EXPIRED',                   // 중계 문맥·승인·초안 기한이 지났다
  FAILED: 'FAILED',                     // 서버가 거절·실패로 답했다
  UNKNOWN: 'UNKNOWN',                   // 보냈지만 응답을 받지 못했다
});

/** 모델 호출 상태. 아는 것만 말한다 */
export const CALL = Object.freeze({
  NONE_PREPARE: '모델 호출 없음 · 준비 단계에서 멈춤',
  NOT_SENT: '생성 요청을 보내지 않음',
  UNKNOWN: '모델 호출 여부 미확인',
});

const EXPIRED_RELAY = new Set(['PREVIEW_EXPIRED', 'PREVIEW_STALE']);
const EXPIRED_D = new Set(['APPROVAL_EXPIRED', 'DRAFT_STALE_OR_UNREVIEWED']);

/** 운영자에게 보일 짧은 설명. 코드 이름은 따로 같이 보인다 */
const CODE_TEXT = Object.freeze({
  APPROVAL_REQUIRED: '이 원문에 대한 직접 승인이 결합돼 있지 않습니다.',
  PREVIEW_EXPIRED: '중계 문맥의 유효 시간이 지났습니다.',
  PREVIEW_STALE: '이 제안 문맥은 더 이상 유효하지 않습니다(새 원문 준비·로그아웃·권한 변경·만료).',
  PREVIEW_ALREADY_USED: '이미 쓴 승인 또는 문맥입니다. 같은 승인을 다시 쓰지 않습니다.',
  PREVIEW_FORBIDDEN: '이 화면을 쓸 권한이 없습니다.',
  PREVIEW_AUTH_REQUIRED: '운영자 로그인이 필요합니다.',
  PREVIEW_REJECTED: '서버가 요청을 거절했습니다. 운영자·강좌 범위나 배포 설정을 확인해 주세요.',
  PREVIEW_UNAVAILABLE: '중계가 아직 설정되지 않았습니다.',
  PREVIEW_DISPLAY_ONLY: '이 연결은 표시 전용입니다.',
  APPROVAL_REQUIRED_OR_SPENT: 'D 가 승인을 찾지 못했거나 이미 쓴 승인입니다.',
  APPROVAL_EXPIRED: '승인 기한이 지났습니다.',
  GEMINI_HTTP_FAILURE: '모델 제공자 요청이 실패했습니다.',
  GEMINI_NETWORK_FAILURE: '모델 제공자에 닿지 못했습니다.',
  GEMINI_RATE_LIMIT: '모델 제공자 한도에 걸렸습니다.',
  GEMINI_BILLING_ERROR: '모델 제공자 결제 오류입니다.',
  INPUT_TOKEN_LIMIT: '원문이 입력 한도를 넘었습니다.',
});

/**
 * 실패를 화면 결과로. phase 는 'prepare' | 'generate' | 'reply'.
 * @returns {{kind:string, phase:string, code:string, source:string, httpStatus:number|null, call:string, text:string}}
 */
export function failureOutcome(phase, error) {
  const pf = error?.previewFailure ?? null;
  if (pf?.kind === 'RELAY') {
    const kind = pf.code === 'APPROVAL_REQUIRED' ? OUTCOME.APPROVAL_REQUIRED
      : EXPIRED_RELAY.has(pf.code) ? OUTCOME.EXPIRED : OUTCOME.FAILED;
    // prepare 는 모델을 부르지 않는다. generate 의 APPROVAL_REQUIRED 는 D 로 보내기 전 검사다.
    const call = phase === 'prepare' ? CALL.NONE_PREPARE
      : pf.code === 'APPROVAL_REQUIRED' ? CALL.NOT_SENT : CALL.UNKNOWN;
    return Object.freeze({ kind, phase, code: pf.code, source: 'RELAY', httpStatus: error.status ?? null, call,
      text: CODE_TEXT[pf.code] ?? '중계가 요청을 처리하지 않았습니다.' });
  }
  if (pf?.kind === 'D_HTTP') {
    const kind = EXPIRED_D.has(pf.code) ? OUTCOME.EXPIRED : OUTCOME.FAILED;
    // D HTTP 오류에는 호출 상태가 없다. 준비 단계만 확실히 '호출 없음' 이다.
    return Object.freeze({ kind, phase, code: pf.code, source: 'D_HTTP', httpStatus: pf.status, call: phase === 'prepare' ? CALL.NONE_PREPARE : CALL.UNKNOWN,
      text: CODE_TEXT[pf.code] ?? 'D 가 오류로 답했습니다.' });
  }
  const outcome = error?.outcome ?? null;
  if (outcome === 'UNKNOWN' || outcome === 'READ_FAILED') {
    return Object.freeze({ kind: OUTCOME.UNKNOWN, phase, code: error?.code ?? 'UNKNOWN', source: 'TRANSPORT', httpStatus: error?.status ?? null,
      call: phase === 'prepare' ? CALL.NONE_PREPARE : CALL.UNKNOWN,
      text: '요청은 보냈지만 결과를 받지 못했습니다. 같은 승인으로 자동 재시도하지 않습니다.' });
  }
  if (outcome === 'NOT_SENT') {
    return Object.freeze({ kind: OUTCOME.FAILED, phase, code: error?.code ?? 'NOT_SENT', source: 'TRANSPORT', httpStatus: null,
      call: phase === 'prepare' ? CALL.NONE_PREPARE : CALL.NOT_SENT, text: '요청을 보내지 못했습니다.' });
  }
  return Object.freeze({ kind: OUTCOME.FAILED, phase, code: error?.code ?? 'REJECTED', source: phase === 'reply' ? 'CLIENT_CHECK' : 'TRANSPORT',
    httpStatus: error?.status ?? null, call: phase === 'prepare' ? CALL.NONE_PREPARE : CALL.UNKNOWN,
    text: phase === 'reply' ? '서버 응답이 변환기 검사를 통과하지 못했습니다. 표시하지 않습니다.' : '요청이 실패했습니다.' });
}

/** 제안이 없는 결과. ai-compare 는 clauses 가 빈 제안 + outcome 으로 그린다 */
const outcomeOnly = (outcome) => Object.freeze({
  clauses: [], kept: [], readable: 0, unreadable: 0, held: 0, duplicates: [],
  canonicalText: '', complete: false, outcome,
});

function preparedOk(p, text) {
  return p?.version === OPERATOR_PREVIEW_VERSION && p.stage === 'PREPARED'
    && p.scope === 'PRECONFIGURATION_ONLY' && p.automaticEligibility === false && p.paymentAllowed === false
    && UUID.test(p.contextRef ?? '') && Number.isSafeInteger(p.revision) && p.revision > 0
    && HEX.test(p.bodyHash ?? '') && HEX.test(p.sourceHash ?? '') && Number.isSafeInteger(p.expiresAt)
    && ['REQUIRED', 'RECORDED'].includes(p.approvalState) && typeof text === 'string';
}

/**
 * @param {object} options
 * @param {(path:string, options:object) => Promise<object>} options.request  지갑 세션의 request
 * @param {() => string} options.appContextRef  지금 로그인·강좌 문맥의 화면 쪽 불투명 ID
 * @param {() => number} [options.clock]
 * @param {string} [options.label]  출처 배지(응답 전)
 */
export function createOperatorProposer({ request, appContextRef, clock = () => Date.now(), label } = {}) {
  if (typeof request !== 'function' || typeof appContextRef !== 'function') throw new Error('OPERATOR_PROPOSER_PORTS');
  let generation = 0;
  let inflight = null;
  let pin = null; // 채택한 제안의 8키 스냅숏

  const invalidate = () => {
    generation += 1;
    pin = null;
    inflight?.abort();
    inflight = null;
  };

  async function propose(text) {
    const gen = generation;
    inflight?.abort();
    const controller = new AbortController();
    inflight = controller;
    const current = () => gen === generation && !controller.signal.aborted;
    const signal = controller.signal;
    let prepared;
    try {
      prepared = await request(PATH.prepare, { method: 'POST', body: { version: OPERATOR_PREVIEW_VERSION, sourceText: text }, signal });
    } catch (error) {
      return outcomeOnly(failureOutcome('prepare', error));
    }
    if (!current()) return outcomeOnly({ kind: OUTCOME.EXPIRED, phase: 'prepare', code: 'INPUT_CHANGED', source: 'CLIENT', httpStatus: null, call: CALL.NONE_PREPARE, text: '원문이 바뀌어 이 응답을 쓰지 않습니다.' });
    if (!preparedOk(prepared, text)) {
      return outcomeOnly(failureOutcome('reply', { code: 'PREPARED_REPLY_INVALID' }));
    }
    const facts = Object.freeze({
      bodyHash: prepared.bodyHash, sourceHash: prepared.sourceHash, model: prepared.model,
      limits: prepared.limits ?? null, expiresAt: prepared.expiresAt,
    });
    if (prepared.approvalState !== 'RECORDED') {
      // 승인 없이 generate 를 보내지 않는다. 서버가 결합할 수 있게 원문·bodyHash 를 보인다.
      return outcomeOnly(Object.freeze({ kind: OUTCOME.APPROVAL_REQUIRED, phase: 'prepare', code: 'APPROVAL_REQUIRED', source: 'RELAY',
        httpStatus: 200, call: CALL.NOT_SENT, text: CODE_TEXT.APPROVAL_REQUIRED, prepared: facts }));
    }
    const expected = {
      appContextRef: appContextRef(), contextRef: prepared.contextRef, revision: prepared.revision, generation: gen,
      sourceText: text, bodyHash: prepared.bodyHash, sourceHash: prepared.sourceHash,
    };
    let reply;
    try {
      reply = await request(PATH.generate, {
        method: 'POST',
        body: { version: OPERATOR_PREVIEW_VERSION, contextRef: prepared.contextRef, revision: prepared.revision, bodyHash: prepared.bodyHash },
        signal,
      });
    } catch (error) {
      return outcomeOnly({ ...failureOutcome('generate', error), prepared: facts });
    }
    if (!current()) return outcomeOnly({ kind: OUTCOME.EXPIRED, phase: 'generate', code: 'INPUT_CHANGED', source: 'CLIENT', httpStatus: null, call: CALL.UNKNOWN, text: '원문이 바뀌어 이 응답을 쓰지 않습니다.' });
    // 채택: 이 요청의 prepare 결과(문맥·revision·bodyHash·sourceHash)와 맞을 때만 proposalHash 를 고정한다.
    const g = reply?.generated;
    if (reply?.contextRef !== expected.contextRef || reply?.revision !== expected.revision
      || g?.bodyHash !== expected.bodyHash || g?.proposal?.sourceHash !== expected.sourceHash || !HEX.test(g?.proposal?.proposalHash ?? '')) {
      return outcomeOnly(failureOutcome('reply', { code: 'OPERATOR_REPLY_PIN' }));
    }
    const adopted = Object.freeze({ ...expected, proposalHash: g.proposal.proposalHash });
    pin = adopted;
    try {
      const panel = await toOperatorPanel(reply, {
        expected: adopted,
        // 지금 화면 상태. 로그인 문맥이 바뀌었거나 입력 세대가 올라갔으면 어긋난다.
        readCurrent: () => (pin ? { ...pin, generation, appContextRef: appContextRef() } : { ...adopted, generation: -1 }),
        assertCurrent: () => { if (gen !== generation || controller.signal.aborted) throw new Error('OPERATOR_INPUT_CHANGED'); },
        clock,
      });
      const actual = panel.provenance.actualModelCall;
      return Object.freeze({
        ...panel,
        outcome: Object.freeze({ kind: OUTCOME.PROPOSED, phase: 'generate', code: null, source: 'RELAY', httpStatus: 200,
          call: callLabel(actual), text: null, prepared: facts,
          modelExecution: panel.provenance.modelCall.execution }),
      });
    } catch (error) {
      if (gen !== generation) return outcomeOnly({ kind: OUTCOME.EXPIRED, phase: 'reply', code: 'INPUT_CHANGED', source: 'CLIENT', httpStatus: null, call: CALL.UNKNOWN, text: '원문이 바뀌어 이 응답을 쓰지 않습니다.' });
      const code = error?.code ?? 'OPERATOR_REPLY_INVALID';
      return outcomeOnly(code === 'OPERATOR_EXPIRED' || code === 'EXPIRED'
        ? { kind: OUTCOME.EXPIRED, phase: 'reply', code, source: 'CLIENT_CHECK', httpStatus: 200, call: CALL.UNKNOWN, text: '응답이 도착했을 때 이미 유효 시간이 지났습니다.' }
        : failureOutcome('reply', { code }));
    } finally {
      if (inflight === controller) inflight = null;
    }
  }

  return Object.freeze({
    id: 'operator-relay',
    kind: 'model',
    explicit: true,
    label: label ?? 'Gemini 제안 · CLEAR 서버 중계',
    idleLabel: `${label ?? 'Gemini 제안 · CLEAR 서버 중계'} · 아직 생성 전`,
    generateLabel: '제안 생성 (서버 중계)',
    displayOnlyButton: '표시 전용 · 실행 계약 DISPLAY_ONLY',
    displayOnlyNote: '서버 중계로 받은 제안입니다. 이 연결의 실행 계약은 표시 전용(DISPLAY_ONLY)이라 여기서 실행하지 않습니다. '
      + '서버가 보류한 조항은 직접 지정으로 풀 수 없고, 원문을 고쳐 다시 생성해야 합니다.',
    idleNote: '입력할 때마다 보내지 않습니다. 「제안 생성」 을 눌러야 CLEAR 서버가 운영자 로그인·강좌 범위를 확인하고 한 번 중계합니다. '
      + '원문을 고치면 이전 제안·승인 결합은 쓰지 않습니다.',
    propose,
    invalidate,
  });
}
