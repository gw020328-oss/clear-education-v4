// 쓰기 패널 — 원천 서명 · 양측 동의 · 지급 결과
//
// 이슈 #106 의 3·4·5단계. 셋 다 서버에 쓰거나 지갑 서명을 요구한다.
//
// 공통으로 지키는 것
//
//   사용자 버튼에서만 시작한다. 자동 서명·자동 동의·자동 재시도 없음
//   서버가 준 문구를 그대로 보여준다. 우리가 문장을 만들지 않는다
//   호스트가 활성화되기 전에는 버튼을 막고 이유를 적는다
//   POST 결과를 모르면(outcome UNKNOWN) 다시 보내지 않고 **같은 키로 확인**한다
//
// 마지막 줄이 중요하다. 동의를 두 번 보내면 서버가 멱등 키로 막아 주지만,
// 화면이 "실패했습니다" 라고 하고 사용자가 다시 누르면 **다른 키**가 만들어진다.
// 그래서 키는 클릭 한 번에 하나고, 같은 클릭의 재확인은 그 키를 다시 쓴다.

import { el, clear } from '../ui/dom.js';
import { seoulText } from '../ui/policy-view.js';

/** 멱등 키. 서버 id 규칙(^[a-z][a-z0-9.-]{0,63}$)을 지킨다 */
function newKey(prefix) {
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}-${rand}`;
}

/** 서버 오류 코드를 사람 말로. 모르는 코드는 코드 그대로 보여준다 */
const ERROR_TEXT = Object.freeze({
  NORMAL_HOST_NOT_ACTIVATED: '서버가 아직 켜지지 않았습니다.',
  BC_NORMAL_PROCEDURE_NOT_READY: '검토 절차가 아직 준비되지 않았습니다.',
  BC_VIEW_STALE: '판정이 바뀌었습니다. 다시 조회한 뒤 확인해 주세요.',
  BC_DECISION_TARGET: '동의 대상이 현재 판정과 다릅니다. 다시 조회해 주세요.',
  BC_IDEMPOTENCY_CONFLICT: '같은 키로 다른 내용을 보냈습니다.',
  BC_UI_SIGNATURE_EXPIRED: '서명 요청이 만료됐습니다. 다시 받아 주세요.',
  BC_UI_SIGNATURE_CANCELLED: '서명 요청이 취소됐습니다.',
  BC_UI_SIGNATURE_NOT_PENDING: '기다리는 서명 요청이 없습니다.',
  BC_UI_SIGNATURE_REQUEST_USED: '이미 쓴 서명 요청입니다.',
  BC_UI_PARTICIPANT_REQUIRED: '참가자만 할 수 있습니다.',
  BC_UI_ALREADY_BOUND: '이미 결합된 신청입니다.',
  BC_WALLET_REJECTED: '지갑에서 서명을 거절했습니다.',
  BC_WALLET_CONTEXT_CHANGED: '지갑 계정이나 체인이 바뀌었습니다. 다시 로그인해 주세요.',
  AUTH_REQUIRED: '로그인이 필요합니다.',
  FORBIDDEN: '권한이 없습니다.',
});

const errorText = (code) => ERROR_TEXT[code] ?? code;

/**
 * 결과 줄.
 *
 * outcome 이 UNKNOWN 이면 '실패' 라고 적으면 안 된다. 서버에 닿았을 수도 있다.
 */
function outcomeNote(error) {
  if (error.outcome !== 'UNKNOWN') return null;
  return el('p.bc-warn', {
    text: '요청이 서버에 닿았는지 알 수 없습니다. 다시 보내지 말고 "결과 확인"으로 '
      + '같은 요청이 처리됐는지 먼저 확인해 주세요.',
  });
}

function actionBox({ title, body, button, disabledReason, state }) {
  return el('div.bc-action', { 'data-state': state ?? 'idle' }, [
    el('h4', { text: title }),
    ...(Array.isArray(body) ? body : [body]).filter(Boolean),
    disabledReason
      ? el('p.bc-blocked', {}, [
        el('span.bc-blocked-tag', { text: '지금은 할 수 없음' }),
        el('span', { text: disabledReason }),
      ])
      : null,
    button ?? null,
  ].filter(Boolean));
}

// ── 3단계 · HackerRank 원천 확인 서명 ────────────────────────────────────

/**
 * @param {object} options
 * @param {object} options.view
 * @param {object|null} options.api       normal-client. 없으면 fixture 모드
 * @param {string|null} options.blocked   막혀 있으면 그 이유
 * @param {(msg:string)=>Promise<string>} [options.sign]  personal_sign
 */
export function sourceSignaturePanel({ view, api = null, blocked = null, sign = null, onDone = () => {} }) {
  const box = el('section.bc-sign', {});
  let approval = null;   // 서버가 준 승인 요청
  let status = null;     // 마지막 결과
  let busy = false;

  // 운영자는 참가자 대신 서명할 수 없다. 화면에서도 아예 열지 않는다.
  const notParticipant = view.role !== 'PARTICIPANT';

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
    const result = await api.submitSourceSignature(view.applicationId, approval, signature);
    status = { kind: 'ok', result };
    approval = null;
    onDone();
  });

  const render = () => {
    clear(box);
    const reason = notParticipant
      ? '운영자는 참가자를 대신해 서명할 수 없습니다. 참가자 본인이 자기 화면에서 합니다.'
      : blocked;

    box.append(actionBox({
      title: 'HackerRank 인증서 확인 서명',
      state: busy ? 'busy' : status?.kind,
      body: [
        el('p', {
          text: '인증서를 확인하려면 본인 지갑으로 서명이 필요합니다. '
            + '이 서명은 인증서 확인용이며 지급에 동의하는 것이 아닙니다.',
        }),
        approval
          ? el('div.bc-message', {}, [
            el('p.bc-message-tag', { text: '서버가 보낸 서명 문구 — 이대로 서명합니다' }),
            // 서버 문구를 그대로 보여준다. 줄바꿈을 지키려고 pre 를 쓴다.
            el('pre.bc-message-body', { text: approval.message }),
            el('p.muted', {
              text: `만료 ${seoulText(approval.expiresAt)} · 승인 ${approval.approvalId}`,
            }),
          ])
          : null,
        status?.kind === 'ok'
          ? el('p.bc-ok', { text: '서명이 접수됐습니다. 인증서 확인이 진행됩니다.' })
          : null,
        status?.kind === 'error'
          ? el('div', {}, [
            el('p.bc-warn', { text: errorText(status.error.code) }),
            outcomeNote(status.error),
          ].filter(Boolean))
          : null,
      ],
      disabledReason: reason,
      button: reason || !api
        ? null
        : el('button.bc-btn', {
          type: 'button',
          disabled: busy ? 'disabled' : null,
          onClick: approval ? submit : fetchApproval,
        }, [el('span', { text: approval ? '지갑으로 서명하기' : '서명 문구 받기' })]),
    }));
  };

  render();
  return box;
}

// ── 4단계 · 양측 명시 동의 ──────────────────────────────────────────────

export function consentPanel({ view, api = null, blocked = null, onDone = () => {} }) {
  const box = el('section.bc-agree', {});
  let status = null;
  let busy = false;
  // 클릭 한 번에 키 하나. 같은 클릭의 재확인은 이 키를 다시 쓴다.
  let pendingKey = null;

  const myRole = view.role === 'COURSE_OPERATOR' ? 'COURSE_OPERATOR' : 'PARTICIPANT';
  const already = (view.consent?.records ?? []).some((r) => r.actorRole === myRole);

  const agree = () => {
    pendingKey = pendingKey ?? newKey('consent');
    run(async () => {
      // 보내기 직전에 최신 판정을 다시 읽는다. 화면에 띄워 둔 사이에 바뀌었을 수 있다.
      const fresh = await api.view(view.applicationId);
      if (fresh.target.targetDecisionId !== view.target.targetDecisionId
        || fresh.target.targetDecisionRevision !== view.target.targetDecisionRevision) {
        // 자동으로 새 판정에 동의하지 않는다. 사용자가 다시 보고 결정한다.
        status = { kind: 'stale' };
        pendingKey = null;
        return;
      }
      const result = await api.consent(view.applicationId, fresh, 'AGREE', { idempotencyKey: pendingKey });
      status = { kind: 'ok', result };
      pendingKey = null;
      onDone();
    });
  };

  const confirm = () => run(async () => {
    // 같은 키로 조회만 한다. 다시 보내지 않는다.
    const result = await api.operation(view.applicationId, pendingKey);
    status = { kind: 'ok', result };
    pendingKey = null;
    onDone();
  });

  const run = async (fn) => {
    busy = true; render();
    try { await fn(); } catch (error) { status = { kind: 'error', error }; }
    busy = false; render();
  };

  const render = () => {
    clear(box);
    const unknownResult = status?.kind === 'error' && status.error.outcome === 'UNKNOWN';

    box.append(actionBox({
      title: '이 판정에 동의',
      state: busy ? 'busy' : status?.kind,
      body: [
        el('p', {
          text: '지금 보이는 판정에 동의합니다. 상대도 같은 판정에 동의하면 지급 절차로 넘어갑니다. '
            + '판정이 바뀌면 이 동의는 쓰이지 않고 다시 동의해야 합니다.',
        }),
        el('p.muted', { text: `대상 판정 ${view.target.targetDecisionId} · rev ${view.target.targetDecisionRevision}` }),
        already ? el('p.bc-ok', { text: '이미 동의했습니다.' }) : null,
        status?.kind === 'stale'
          ? el('p.bc-warn', {
            text: '보내는 사이에 판정이 바뀌었습니다. 동의를 보내지 않았습니다. '
              + '새 판정을 확인한 뒤 다시 동의해 주세요.',
          })
          : null,
        status?.kind === 'ok' ? el('p.bc-ok', { text: '동의가 기록됐습니다.' }) : null,
        status?.kind === 'error'
          ? el('div', {}, [
            el('p.bc-warn', { text: errorText(status.error.code) }),
            outcomeNote(status.error),
          ].filter(Boolean))
          : null,
      ],
      disabledReason: blocked,
      button: blocked || !api || already
        ? null
        : el('button.bc-btn', {
          type: 'button',
          disabled: busy ? 'disabled' : null,
          onClick: unknownResult ? confirm : agree,
        }, [el('span', { text: unknownResult ? '결과 확인' : '동의합니다' })]),
    }));
  };

  render();
  return box;
}

// ── 5단계 · 지급 결과 ───────────────────────────────────────────────────

const CLAIM = Object.freeze({
  NOT_OBSERVED: '아직 관측되지 않음',
  READBACK_UNAVAILABLE: '체인에서 다시 읽지 못함',
  INCLUDED: '블록에 포함됨',
});

function row(label, value, note = null) {
  return el('div.pair', {}, [
    el('dt', { text: label }),
    el('dd', {}, [
      value === null || value === undefined
        ? el('span.bc-unknown', { text: '확인 전' })
        : el('span', { text: value }),
      note ? el('span.muted', { text: ` ${note}` }) : null,
    ].filter(Boolean)),
  ]);
}

/**
 * 지급 결과.
 *
 * 넷을 섞으면 안 된다 —
 *   약정 금액        정책이 약속한 액수
 *   재원 배정        이 신청 몫으로 잡힌 액수
 *   거래 제출/포함    체인에 올라갔는가
 *   실제 수령        정확히 그 액수가 들어왔는가
 *
 * 거래가 블록에 들어갔다고 받은 것이 아니고, INCLUDED 라고 최종 확정도 아니다.
 */
export function paymentPanel({ view, receipt = null, api = null, blocked = null }) {
  const box = el('section.bc-payment', {});
  let current = receipt;
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

    box.append(el('div.sec-head', {}, [el('h3', { text: '지급' })]));
    box.append(el('dl.pairs', {}, [
      row('약정 금액', `${Number(view.agreedPayment.amountAtoms) / 10 ** view.agreedPayment.decimals} ${view.agreedPayment.symbol}`),
      row('수락된 지급권리', pay?.acceptedRight ? '있음' : null),
      row('거래 상태', pay?.transactionState ?? null),
      row('거래 해시', pay?.transactionHash ?? null),
      row('청구 상태', claim ? (CLAIM[claim.state] ?? claim.state) : (pay?.claimState ?? null)),
      // 실제 수령은 별도 확인이다. 거래가 올라간 것과 받은 것은 다르다.
      row('실제 수령액', balance?.receivedAtoms
        ? `${Number(balance.receivedAtoms) / 10 ** view.agreedPayment.decimals} ${view.agreedPayment.symbol}`
        : null),
      row('정확한 금액 확인', balance?.exactExpectedAmountVerified === true ? '확인됨' : null),
    ]));

    if (claim?.state === 'INCLUDED') {
      // finalized=false 를 최종 확정으로 표현하지 않는다.
      box.append(el('p.bc-warn', {
        text: '거래가 블록에 포함됐지만 아직 최종 확정(finalized)은 아닙니다. '
          + '재구성으로 바뀔 수 있습니다.',
      }));
    }
    if (pay?.acceptedRight && view.decision.current === false) {
      box.append(el('p.muted', {
        text: '수락 당시의 지급권리와 현재 판정은 다른 값입니다. 판정이 바뀌어도 '
          + '이미 수락된 권리는 사라지지 않습니다.',
      }));
    }
    if (status?.kind === 'error') {
      box.append(el('p.bc-warn', { text: errorText(status.error.code) }));
    }
    if (!pay?.receiptHttpAvailable) {
      box.append(el('p.muted', { text: '지급 결과 조회가 이 서버에 아직 설치되지 않았습니다.' }));
    } else if (blocked) {
      box.append(el('p.bc-blocked', {}, [
        el('span.bc-blocked-tag', { text: '지금은 할 수 없음' }),
        el('span', { text: blocked }),
      ]));
    } else if (api) {
      box.append(el('button.bc-btn', {
        type: 'button',
        disabled: busy ? 'disabled' : null,
        onClick: load,
      }, [el('span', { text: '수령 결과 확인' })]));
    }
  };

  render();
  return box;
}
