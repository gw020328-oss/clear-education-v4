// 쓰기 패널 — 원천 서명 · 양측 동의 · 지급 결과
//
// 이슈 #106 의 3·4·5단계. 셋 다 서버에 쓰거나 지갑 서명을 요구한다.
//
// 배치는 재설계 시안을 따른다 — 카드로 두르지 않고 구분선과 여백으로 나눈다.
// quiet 를 주면 '지금은 할 수 없음' 을 패널 안에서 다시 말하지 않는다. 화면
// 맨 위에서 한 번 말했는데 패널마다 반복하면 문제가 여럿인 것처럼 읽힌다.
//
// 공통으로 지키는 것
//
//   사용자 버튼에서만 시작한다. 자동 서명·자동 동의·자동 재시도 없음
//   서버가 준 문구를 그대로 보여준다. 우리가 문장을 만들지 않는다
//   POST 결과를 모르면(outcome UNKNOWN) 다시 보내지 않고 같은 키로 확인한다
//
// 마지막 줄이 중요하다. 동의를 두 번 보내면 서버가 멱등 키로 막아 주지만,
// 화면이 '실패했습니다' 라고 하고 사용자가 다시 누르면 다른 키가 만들어진다.
// 그래서 키는 클릭 한 번에 하나고, 같은 클릭의 재확인은 그 키를 다시 쓴다.

import { el, clear } from '../ui/dom.js';
import { seoulText } from '../ui/policy-view.js';
import { item, pairBlock } from './pairs.js';

/** 멱등 키. 서버 id 규칙(^[a-z][a-z0-9.-]{0,63}$)을 지킨다 */
function newKey(prefix) {
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}-${rand}`;
}

const ERROR_TEXT = Object.freeze({
  NORMAL_HOST_NOT_ACTIVATED: '서버가 아직 켜지지 않았습니다.',
  BC_NORMAL_PROCEDURE_NOT_READY: '확인 절차가 아직 준비되지 않았습니다.',
  BC_VIEW_STALE: '판정이 바뀌었습니다. 다시 불러온 뒤 확인해 주세요.',
  BC_DECISION_TARGET: '확인 대상이 지금 판정과 다릅니다. 다시 불러와 주세요.',
  BC_IDEMPOTENCY_CONFLICT: '같은 요청 번호로 다른 내용을 보냈습니다.',
  BC_UI_SIGNATURE_EXPIRED: '서명 요청 시간이 지났습니다. 다시 받아 주세요.',
  BC_UI_SIGNATURE_CANCELLED: '서명 요청이 취소됐습니다.',
  BC_UI_SIGNATURE_NOT_PENDING: '기다리는 서명 요청이 없습니다.',
  BC_UI_SIGNATURE_REQUEST_USED: '이미 사용한 서명 요청입니다.',
  BC_UI_PARTICIPANT_REQUIRED: '참가자만 할 수 있습니다.',
  BC_UI_OBJECTION_TOO_LATE: '이미 지급이 끝난 신청입니다. 오류를 접수할 수 없습니다.',
  BC_UI_PROCEDURE_ENDED: '이미 종료된 절차입니다. 오류를 접수할 수 없습니다.',
  BC_UI_OBJECTION_EXISTS: '이미 접수된 오류 신고가 있습니다. 재검증 결과를 기다려 주세요.',
  BC_UI_REVALIDATION_EXHAUSTED: '재검증을 이미 사용했습니다. 같은 지급 건에 한 번뿐입니다.',
  BC_UI_ALREADY_BOUND: '이미 연결된 신청입니다.',
  BC_WALLET_REJECTED: '지갑에서 서명을 거절했습니다.',
  BC_WALLET_CONTEXT_CHANGED: '지갑 계정이나 네트워크가 바뀌었습니다. 다시 로그인해 주세요.',
  AUTH_REQUIRED: '로그인이 필요합니다.',
  FORBIDDEN: '권한이 없습니다.',

  // 아래는 2026-10-29 오프라인 검사에서 찾은 구멍이다. 여기에 없는 코드는
  // errorText 가 **코드 문자열을 그대로** 화면에 적는다. 조회가 실패하거나
  // 인증이 취소·만료되는 길은 전부 이 표를 지나가므로, 참가자가 조금만
  // 어긋나도 'BC_TRANSPORT_HTTP' 를 보게 돼 있었다.
  // 그래서 서버가 보내는 코드(BOOTCAMP_CODES)와 지갑·transport 가 던지는 코드를
  // 전부 덮는다. tests/offline.test.mjs 가 빠진 것이 있으면 실패시킨다.

  // 인증·권한
  AUTH_CHALLENGE: '로그인 문구가 더 이상 유효하지 않습니다. 다시 로그인해 주세요.',
  SIGNATURE: '서명을 확인할 수 없습니다. 다시 시도해 주세요.',
  CSRF: '세션이 만료됐습니다. 다시 로그인해 주세요.',
  ORIGIN: '요청을 보낼 수 없는 주소입니다.',
  AUTH_RATE_LIMIT: '로그인 시도가 많습니다. 잠시 뒤 다시 시도해 주세요.',
  WALLET_CONTEXT_CHANGED: '지갑 계정이나 네트워크가 바뀌었습니다. 다시 로그인해 주세요.',

  // 대상·결합
  BC_NOT_FOUND: '찾을 수 없습니다. 다시 불러와 주세요.',
  BC_LIVE_SINGLE_APPLICATION: '이 기수에서는 신청을 하나만 둘 수 있습니다.',
  BC_UI_CONTEXT_CHANGED: '신청 정보가 바뀌었습니다. 다시 불러와 주세요.',
  BC_UI_CONTEXT_UNAVAILABLE: '신청 정보를 읽지 못했습니다. 다시 불러와 주세요.',
  BC_E3_REGISTERED_SNAPSHOT_EXPIRED: '등록 정보가 만료됐습니다. 다시 불러와 주세요.',
  BC_E3_REVIEW_CLOSED: '확인 기간이 끝났습니다.',

  // 서버에 닿는 길. 코드 자체는 진단용이라 사람 말로 바꿔 적는다.
  BC_TRANSPORT_HTTP: '서버가 요청을 처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
  BC_TRANSPORT_TIMEOUT: '서버 응답이 오지 않았습니다. 잠시 뒤 다시 시도해 주세요.',
  BC_TRANSPORT_FAILED: '서버에 연결하지 못했습니다. 연결을 확인해 주세요.',
  BC_TRANSPORT_CANCELLED: '요청을 중단했습니다.',
  BC_TRANSPORT_RESPONSE: '서버 응답을 읽지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
  // 이 셋은 **우리 쪽 설정 문제**다. 사용자가 다시 눌러도 달라지지 않으므로
  // 다시 시도하라고 적지 않는다.
  BC_TRANSPORT_ORIGIN: '화면 설정에 문제가 있습니다. 운영자에게 알려 주세요.',
  BC_TRANSPORT_CONFIG: '화면 설정에 문제가 있습니다. 운영자에게 알려 주세요.',
  BC_TRANSPORT_ROUTE: '화면 설정에 문제가 있습니다. 운영자에게 알려 주세요.',

  // 지갑·호스트
  BC_WALLET_MISSING: '지갑을 찾지 못했습니다. 연결을 확인해 주세요.',
  BC_WALLET_FAILED: '지갑에서 응답을 받지 못했습니다. 다시 시도해 주세요.',
  BC_HOST_NOT_ACTIVE: '서버가 아직 켜지지 않았습니다.',
  BC_HOST_CONFIG: '서버가 보낸 설정을 쓸 수 없습니다. 운영자에게 알려 주세요.',
  BC_AUTH_CHALLENGE: '로그인 문구가 만료됐습니다. 다시 로그인해 주세요.',
  BC_AUTH_SESSION: '로그인을 마치지 못했습니다. 다시 로그인해 주세요.',
  BC_SESSION_ALREADY: '이미 로그인돼 있습니다.',
  BC_SIGN_MESSAGE: '서명할 문구가 올바르지 않습니다.',
});

/** 코드를 사람 말로. 표에 없으면 코드가 그대로 나가므로 시험이 빠짐을 막는다 */
export const errorText = (code) => ERROR_TEXT[code] ?? code;

/** outcome 이 UNKNOWN 이면 '실패' 라고 적으면 안 된다. 서버에 닿았을 수도 있다 */
function outcomeNote(error) {
  if (error.outcome !== 'UNKNOWN') return null;
  return el('p.bcx-warn', {
    text: '요청이 서버에 닿았는지 알 수 없습니다. 다시 보내지 말고 "결과 확인"으로 '
      + '같은 요청이 처리됐는지 먼저 확인해 주세요.',
  });
}

/** 결과 줄 — 성공·오류·미확인 */
function resultLines(status) {
  if (!status) return [];
  if (status.kind === 'ok') return [el('p.bcx-ok', { text: status.text })];
  if (status.kind === 'error') {
    return [el('p.bcx-warn', { text: errorText(status.error.code) }), outcomeNote(status.error)].filter(Boolean);
  }
  return [];
}

function actionButton({ label, busy, onClick }) {
  return el('button.bcx-btn', {
    type: 'button',
    disabled: busy ? 'disabled' : null,
    onClick,
  }, [el('span', { text: label })]);
}

// ── 3단계 · HackerRank 원천 확인 서명 ────────────────────────────────────

export function sourceSignaturePanel({
  view, api = null, blocked = null, sign = null, onDone = () => {}, quiet = false, inline = false,
}) {
  // inline 이면 조건 줄 안에 들어간다. 그 줄이 이미 'HackerRank 인증서' 라고
  // 말하고 있으므로 제목을 또 달지 않는다.
  const box = el(inline ? 'div.bcx-rowaction' : 'section.bcx-panel', {});
  let approval = null;
  let status = null;
  let busy = false;

  // **세 경로와 지갑 서명이 다 있어야 누를 수 있다.**
  //
  // 전에는 api 가 있기만 하면 버튼을 그렸다. 그래서 서명 경로가 없는 연결
  // (시연 월드)에서도 '서명 문구 받기' 가 떴고, 누르면 아무 일도 안 일어난
  // 채 빈 경고 한 줄만 남았다. 다른 패널들처럼 경로를 먼저 확인한다.
  const supported = typeof api?.bindSourceSession === 'function'
    && typeof api?.pendingSourceSignature === 'function'
    && typeof api?.submitSourceSignature === 'function'
    && typeof sign === 'function';

  const run = async (fn) => {
    busy = true; status = null; render();
    try { await fn(); } catch (error) { status = { kind: 'error', error }; }
    busy = false; render();
  };

  const fetchApproval = () => run(async () => {
    await api.bindSourceSession(view.applicationId).catch((error) => {
      // 이미 결합돼 있으면 그대로 진행한다. 새 신청을 만들지 않는다.
      if (error.code !== 'BC_UI_ALREADY_BOUND') throw error;
    });
    approval = await api.pendingSourceSignature(view.applicationId);
  });

  const submit = () => run(async () => {
    const signature = await sign(approval.message);
    await api.submitSourceSignature(view.applicationId, approval, signature);
    status = { kind: 'ok', text: '서명을 받았습니다. 인증서를 확인하고 있습니다.' };
    approval = null;
    onDone();
  });

  const render = () => {
    clear(box);
    box.append(...[
      inline ? null : el('h2', { text: 'HackerRank 인증서 확인' }),
      el('p.bcx-note', {
        text: '인증서를 확인하려면 본인 지갑으로 서명해 주셔야 합니다. '
          + '이 서명은 인증서 확인용이며, 지급에 동의하는 것이 아닙니다.',
      }),
      approval
        ? el('div.bcx-message', {}, [
          el('p.bcx-message-tag', { text: '서버가 보낸 문구 — 이대로 서명합니다' }),
          el('pre.bcx-message-body', { text: approval.message }),
          el('p.bcx-note', { text: `만료 ${seoulText(approval.expiresAt)}` }),
        ])
        : null,
      ...resultLines(status),
      // quiet 면 막힌 이유를 다시 말하지 않는다. 맨 위에 이미 있다.
      blocked
        ? (quiet ? null : el('p.bcx-blocked', {}, [el('span', { text: blocked })]))
        : supported
          ? actionButton({
            label: approval ? '지갑으로 서명하기' : '서명 문구 받기',
            busy,
            onClick: approval ? submit : fetchApproval,
          })
          : el('p.bcx-note', {
            'data-why': 'BC_UI_SOURCE_SIGNATURE_ROUTE_ABSENT',
            text: '인증서 확인이 아직 열리지 않았습니다. 준비되면 여기에서 바로 하실 수 있습니다.',
          }),
    ].filter(Boolean));
  };

  render();
  return box;
}

// ── 4단계 · 양측 명시 동의 ──────────────────────────────────────────────

const ROLE = Object.freeze({ PARTICIPANT: '참가자', COURSE_OPERATOR: '운영자' });

export function consentPanel({ view, api = null, blocked = null, onDone = () => {}, quiet = false }) {
  const box = el('section.bcx-panel', {});
  let status = null;
  let busy = false;
  // 클릭 한 번에 키 하나. 같은 클릭의 재확인은 이 키를 다시 쓴다.
  let pendingKey = null;

  const myRole = view.role === 'COURSE_OPERATOR' ? 'COURSE_OPERATOR' : 'PARTICIPANT';
  const records = view.consent?.records ?? [];
  const required = view.consent?.requiredRoles ?? [];
  const done = new Set(records.map((r) => r.actorRole));
  const already = done.has(myRole);

  const run = async (fn) => {
    busy = true; render();
    try { await fn(); } catch (error) { status = { kind: 'error', error }; }
    busy = false; render();
  };

  const agree = () => {
    pendingKey = pendingKey ?? newKey('consent');
    run(async () => {
      // 보내기 직전에 최신 판정을 다시 읽는다. 띄워 둔 사이에 바뀌었을 수 있다.
      const fresh = await api.view(view.applicationId);
      if (fresh.target.targetDecisionId !== view.target.targetDecisionId
        || fresh.target.targetDecisionRevision !== view.target.targetDecisionRevision) {
        // 자동으로 새 판정에 동의하지 않는다. 사용자가 다시 보고 결정한다.
        status = { kind: 'stale' };
        pendingKey = null;
        return;
      }
      await api.consent(view.applicationId, fresh, 'AGREE', { idempotencyKey: pendingKey });
      status = { kind: 'ok', text: '확인했습니다. 지급 절차로 넘어갑니다.' };
      pendingKey = null;
      onDone();
    });
  };

  // 같은 키로 조회만 한다. 다시 보내지 않는다.
  const confirm = () => run(async () => {
    await api.operation(view.applicationId, pendingKey);
    status = { kind: 'ok', text: '앞서 보낸 확인이 처리된 것을 확인했습니다.' };
    pendingKey = null;
    onDone();
  });

  const render = () => {
    clear(box);
    const unknownResult = status?.kind === 'error' && status.error.outcome === 'UNKNOWN';

    box.append(...[
      // 현황과 버튼을 한 자리에 둔다. 떨어뜨려 두면 누가 남았는지 보고
      // 다시 위로 올라가 눌러야 한다.
      el('ul.bcx-roles', {}, required.map((role) => el('li', {
        'data-done': done.has(role) ? 'yes' : 'no',
      }, [
        el('span', { text: ROLE[role] ?? role }),
        el('span.bcx-rolestate', { text: done.has(role) ? '확인 완료' : '대기' }),
      ]))),
      el('p.bcx-note', {
        text: '판정이 바뀌면 이 확인은 쓰이지 않고 다시 확인하셔야 합니다.',
      }),
      // bothCurrent 는 '둘 다 지금 판정에 동의했는가' 다. 기록이 둘이어도
      // 판정이 바뀌었으면 false 다. 그 구분을 화면이 지워서는 안 된다.
      view.consent?.bothCurrent === false && records.length > 0
        ? el('p.bcx-warn', {
          text: '확인 기록은 있지만 지금 판정 기준으로는 아직 양쪽 확인이 아닙니다.',
        })
        : null,
      status?.kind === 'stale'
        ? el('p.bcx-warn', {
          text: '보내는 사이에 판정이 바뀌었습니다. 보내지 않았습니다. '
            + '새 판정을 확인한 뒤 다시 눌러 주세요.',
        })
        : null,
      ...resultLines(status),
      already
        ? null
        : blocked
          ? (quiet ? null : el('p.bcx-blocked', {}, [el('span', { text: blocked })]))
          : api
            ? actionButton({
              label: unknownResult ? '결과 확인' : '바로 받기',
              busy,
              onClick: unknownResult ? confirm : agree,
            })
            : null,
    ].filter(Boolean));
  };

  render();
  return box;
}

// ── 5단계 · 지급 결과 ───────────────────────────────────────────────────

const CLAIM = Object.freeze({
  NOT_OBSERVED: '아직 관측되지 않음',
  READBACK_UNAVAILABLE: '체인에서 다시 읽지 못함',
  INCLUDED: '블록에 들어감 (확정 전)',
  FINALIZED: '최종 확정됨',
});

/** 거래 제출 상태. 영어 코드를 화면에 그대로 내보내지 않는다 */
const TX = Object.freeze({
  NOT_SUBMITTED: '아직 보내지 않음',
  SUBMITTED: '보냄',
  FAILED: '실패',
  REPLACED: '다른 거래로 바뀜',
});

/**
 * 지급 결과.
 *
 * 거래가 블록에 들어갔다고 받은 것이 아니고, INCLUDED 라고 최종 확정도 아니다.
 * 약정·배정은 화면 위쪽에서 이미 그리므로 여기서는 거래와 수령만 본다.
 */
export function paymentPanel({ view, api = null, blocked = null, quiet = false }) {
  const box = el('section.bcx-panel', {});
  let current = null;
  let status = null;
  let busy = false;

  const load = async () => {
    busy = true; status = null; render();
    try { current = await api.paymentReceipt(view.applicationId); }
    catch (error) { status = { kind: 'error', error }; }
    busy = false; render();
  };

  const render = () => {
    clear(box);
    const pay = view.payment;
    const claim = current?.claim ?? null;
    const balance = current?.balance ?? null;
    const d = view.agreedPayment.decimals;
    const s = view.agreedPayment.symbol;
    const claimState = claim?.state ?? pay?.claimState ?? null;
    const receivedAtoms = balance?.receivedAtoms ?? pay?.receivedAtoms ?? null;
    const exactVerified = balance?.exactExpectedAmountVerified ?? pay?.canonicalTransferVerified ?? null;

    box.append(...[
      ...pairBlock([
        item('수락된 지급권리', pay?.acceptedRight ? '있음' : null),
        item('거래 상태', pay?.transactionState ? (TX[pay.transactionState] ?? pay.transactionState) : null),
        item('청구 상태', claimState ? (CLAIM[claimState] ?? claimState) : null),
        // 실제 수령은 별도 확인이다. 거래가 올라간 것과 받은 것은 다르다.
        // 조회 결과가 있으면 그걸 쓰고, 없으면 판정에 실려 온 값을 쓴다.
        item('실제 수령액', receivedAtoms === null || receivedAtoms === undefined
          ? null
          : `${(Number(receivedAtoms) / 10 ** d).toLocaleString('ko-KR')} ${s}`),
        item('정확한 금액 확인', exactVerified === true ? '확인됨'
          : exactVerified === false ? '확인되지 않음' : null),
      ], { missingLabel: '지급 쪽에서 아직 못 받은 값' }),
      // finalized=false 를 최종 확정으로 표현하지 않는다.
      claimState === 'INCLUDED'
        ? el('p.bcx-warn', {
          text: '거래가 블록에 들어갔지만 아직 최종 확정은 아닙니다. '
            + '체인이 재구성되면 바뀔 수 있습니다.',
        })
        : null,
      pay?.acceptedRight && view.decision.current === false
        ? el('p.bcx-note', {
          text: '수락 당시의 지급권리와 지금 판정은 다른 값입니다. 판정이 바뀌어도 '
            + '이미 수락된 권리는 사라지지 않습니다.',
        })
        : null,
      ...resultLines(status),
      !pay?.receiptHttpAvailable
        ? el('p.bcx-note', { text: '지급 결과 조회가 이 서버에 아직 없습니다.' })
        : blocked
          ? (quiet ? null : el('p.bcx-blocked', {}, [el('span', { text: blocked })]))
          : api
            ? actionButton({ label: '수령 결과 확인', busy, onClick: load })
            : null,
    ].filter(Boolean));
  };

  render();
  return box;
}

// ── 오류 제기 ───────────────────────────────────────────────────────────
//
// §9.1 확인 기간의 주된 행동은 "동의 **또는 구체적 오류 제기**" 다.
// 동의만 있고 반대할 길이 없으면, 판정이 틀렸을 때 학생이 할 수 있는 게 없다.
//
// 가볍게 누를 버튼이 아니다. §8.3 에서 "구체적 근거가 있으나 미평가인 이의" 는
// **지급을 막는다.** 그래서 한 번에 보내지 않고 사유를 적게 한 뒤 보낸다.
//
// 서버 경로가 아직 없을 수 있다. 없으면 버튼 대신 왜 못 하는지 적는다.

/**
 * 쓰다 만 오류 신고를 화면 밖에 둔다.
 *
 * 라이브 월드에서는 확인 기간이 흐르는 동안 **1초마다 화면을 다시 그린다.**
 * 열어 둔 상태와 쓰던 글이 패널 안에만 있으면 매초 사라져서 한 줄도 못 쓴다.
 * 신청마다 하나씩 들고 있다가 다시 그릴 때 돌려준다.
 */
const DRAFT = new Map();
const draftOf = (id) => {
  if (!DRAFT.has(id)) DRAFT.set(id, { open: false, reason: '', status: null });
  return DRAFT.get(id);
};

export function objectionPanel({ view, api = null, blocked = null, onDone = () => {} }) {
  const box = el('section.bcx-panel', {});
  const draft = draftOf(view.applicationId);
  // 결과 줄도 밖에 둔다. 접수했다는 말이 1초 뒤에 사라지면 보낸 줄 모른다.
  let busy = false;
  let key = null;

  const supported = typeof api?.objection === 'function';

  const send = async () => {
    const reason = draft.reason;
    if (reason.trim().length < 5) {
      draft.status = { kind: 'local', text: '무엇이 틀렸는지 한 줄이라도 적어 주세요.' };
      render();
      return;
    }
    busy = true; draft.status = null; render();
    // 멱등 키는 클릭 한 번에 하나. 다시 눌러도 같은 키를 쓴다.
    key ??= newKey('objection');
    try {
      await api.objection(view.applicationId, view, reason.trim(), { idempotencyKey: key });
      draft.status = { kind: 'ok', text: '오류를 접수했습니다. 재검증이 끝날 때까지 지급이 멈춥니다.' };
      draft.open = false; draft.reason = ''; key = null;
      onDone();
    } catch (error) { draft.status = { kind: 'error', error }; }
    busy = false; render();
  };

  const render = () => {
    clear(box);
    if (!supported) {
      box.append(el('p.bcx-note', {
        // 오규원 지침(10-28): "'경로 없음' 은 개발 진단으로 유지하되 참가자
        // 화면에는 이해하기 쉬운 안내를 사용하는 게 좋아."
        //
        // 그래서 사람 말로 적고, 개발 진단은 data 속성으로 남긴다.
        // 화면에 안 보이지만 검사와 개발자 도구에서는 보인다.
        'data-why': 'BC_UI_OBJECTION_ROUTE_ABSENT',
        text: '판정이 틀렸다고 보시면 알려 주실 수 있습니다. '
          + '이 기능은 아직 열리지 않았습니다. 준비되면 여기에 버튼이 생깁니다.',
      }));
      return;
    }

    box.append(...[
      el('p.bcx-note', {
        // 학생이 '재검증을 쓴다' 로 읽히지 않게 쓴다. 학생이 하는 건
        // 신고 접수뿐이고, 다시 보는 건 CLEAR 다.
        text: '판정이 틀렸다고 보시면 알려 주세요. 접수되면 CLEAR 가 기록을 '
          + '다시 가져와 한 번 더 확인합니다. 판정이 그대로면 원래대로 진행되고, '
          + '바뀌면 바뀐 대로 진행됩니다. 다시 확인은 한 건에 한 번입니다.',
      }),
      draft.open
        ? el('textarea.bcx-input', {
          rows: 3,
          placeholder: '어느 조건이 어떻게 틀렸는지 적어 주세요',
          value: draft.reason,
          // change 는 칸을 떠날 때만 온다. 다시 그리는 사이에 글을 잃지
          // 않으려면 글자마다 받아 둬야 한다.
          onInput: (event) => { draft.reason = event.target.value; },
        })
        : null,
      ...resultLines(draft.status),
      draft.status?.kind === 'local' ? el('p.bcx-warn', { text: draft.status.text }) : null,
      blocked
        ? null
        : actionButton({
          label: draft.open ? '오류 보내기' : '오류 알리기',
          busy,
          onClick: draft.open ? send : () => { draft.open = true; render(); },
        }),
    ].filter(Boolean));
  };

  render();
  return box;
}

// ── 재검증 요청 ─────────────────────────────────────────────────────────
//
// §9.1 판단 이력의 행동이 "오류 추적·재검증 요청" 이다.
// **지급 건당 1회뿐이다**(§8.3). 그래서 남은 횟수를 먼저 보여주고, 다 썼으면
// 버튼을 내린다. 눌러 보고 거절당하는 것보다 낫다.

export function revalidationPanel({ view, api = null, blocked = null, onDone = () => {} }) {
  const box = el('section.bcx-panel', {});
  let status = null;
  let busy = false;
  let key = null;

  const supported = typeof api?.revalidation === 'function';
  const used = view.procedure?.revalidationCount ?? 0;
  const limit = view.procedure?.revalidationLimit ?? null;
  const left = limit === null ? null : limit - used;

  const send = async () => {
    busy = true; status = null; render();
    key ??= newKey('revalidation');
    try {
      await api.revalidation(view.applicationId, view, { idempotencyKey: key });
      status = { kind: 'ok', text: '재검증을 요청했습니다. 새 근거로 다시 확인합니다.' };
      key = null;
      onDone();
    } catch (error) { status = { kind: 'error', error }; }
    busy = false; render();
  };

  const render = () => {
    clear(box);
    box.append(...[
      el('p.bcx-note', {
        text: left === null
          ? '새 근거로 다시 보는 것은 지급 건당 한 번입니다.'
          : left > 0
            ? `새 근거가 생겼으면 다시 봐 달라고 요청하실 수 있습니다. ${left}번 남았습니다.`
            : '재검증을 이미 쓰셨습니다. 같은 지급 건에서는 더 쓸 수 없습니다.',
      }),
      ...resultLines(status),
      !supported
        ? el('p.bcx-note', {
          'data-why': 'BC_UI_REVALIDATION_ROUTE_ABSENT',
          text: '다시 봐 달라고 요청하는 기능은 아직 열리지 않았습니다.',
        })
        : blocked || left === 0
          ? null
          : actionButton({ label: '재검증 요청', busy, onClick: send }),
    ].filter(Boolean));
  };

  render();
  return box;
}
