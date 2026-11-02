// V2 수령 계정 등록
//
// 환급금이 갈 주소를 **체인에 한 번 고정하는** 절차다. 한 번 정하면 서버도
// 바꾸지 못하므로, 참가자가 자기 지갑으로 직접 서명해야 한다.
//
// 전에는 `api.registerRecipient(applicationId)` 하나를 불렀다. 그런 메서드는
// **없었다** — 우리가 이름을 지어냈고, 실제 클라이언트에는 그 이름이 없으니
// 버튼을 눌러도 조용히 아무 일도 일어나지 않았다(2026-11-01 리뷰).
//
// 실제 절차는 넷이다.
//
//   1  조회    recipientRegistration(app) → packet
//   2  확인    대상 신청 · 정책 · 판정 · 수령 주소 · 기한을 사람이 본다
//   3  서명    packet.payload 를 **EIP-712 typed data** 로 서명한다
//   4  제출    submitRecipientRegistration(app, packet, signature) → 재조회
//
// 3이 중요하다. `personal_sign` 으로 만든 서명은 서버의 `verifyTypedData` 를
// 통과하지 못한다. 그래서 `conn.sign` 이 아니라 `conn.signTypedData` 를 쓴다.
//
// 또 하나. **서명이 수락된 것과 체인에 등록된 것은 다르다.** 제출이 성공해도
// 서버는 `chainStatus: 'NOT_OBSERVED'` 를 준다. 그걸 '등록 완료' 로 적으면
// 학생은 끝난 줄 알고, 실제로는 아직 아무 데도 안 올라가 있다.

import { el, clear } from '../ui/dom.js';
import { seoulText } from '../ui/policy-view.js';
import { item, pairBlock } from './pairs.js';
import { actionButton, resultLines, newKey } from './panels.js';

/**
 * 조회 → 서명 → 제출 → 재조회를 한 번에.
 *
 * 온보딩의 '수령 계정 등록' 단추와 아래 패널이 **같은 절차**를 써야 한다.
 * 두 벌로 두면 한쪽만 고치게 된다.
 *
 * 서명할 수 있는 상태가 아니면 **서명하지 않고 받은 자료를 그대로 돌려준다.**
 * 화면이 그 단계를 보고 무엇을 할지 정한다.
 */
export async function runRecipientRegistration({
  api, signTypedData, applicationId, idempotencyKey,
}) {
  const packet = await api.recipientRegistration(applicationId);
  if (packet?.status !== 'AWAITING_SIGNATURE') return packet;
  const signature = await signTypedData(packet.payload);
  await api.submitRecipientRegistration(applicationId, packet, signature, { idempotencyKey });
  // 제출 결과를 우리가 단정하지 않고 다시 읽는다.
  return await api.recipientRegistration(applicationId);
}

/** 서버가 주는 등록 단계. 영어를 그대로 내보내지 않는다 */
const STATUS = Object.freeze({
  NOT_READY: '아직 준비되지 않음',
  AWAITING_SIGNATURE: '서명 대기',
  SIGNED: '서명 제출됨',
  STALE: '판정이 바뀜',
  EXPIRED: '기한 지남',
});

/** 체인 반영 상태. 서명 수락과 **다른 축**이다 */
const CHAIN = Object.freeze({
  NOT_OBSERVED: '아직 관측되지 않음',
  INCLUDED: '블록에 들어감 (확정 전)',
  FINALIZED: '최종 확정됨',
});

/** 단계마다 무엇을 하면 되는지 */
const WHAT_NOW = Object.freeze({
  NOT_READY: '조건을 모두 충족하면 등록 자료가 만들어집니다.',
  AWAITING_SIGNATURE: '아래 내용을 확인하시고 지갑으로 서명해 주세요. '
    + '이 서명은 받을 주소를 고정하는 것이며, 지급에 동의하는 것이 아닙니다.',
  SIGNED: '서명이 접수됐습니다. 체인에 올라가면 아래 상태가 바뀝니다.',
  STALE: '판정이 바뀌어 이 등록 자료는 쓸 수 없습니다. 다시 불러와 주세요.',
  EXPIRED: '서명 기한이 지났습니다. 다시 불러와 주세요.',
});

/**
 * @param {object} options
 * @param {object} options.view                  서버 판정
 * @param {object|null} options.api              normal-client
 * @param {Function|null} options.signTypedData  conn.signTypedData
 * @param {string|null} options.blocked          지금 할 수 없는 이유
 * @param {Function} options.onDone              끝나면 화면을 다시 읽는다
 */
export function recipientPanel({
  view, api = null, signTypedData = null, blocked = null, onDone = () => {}, quiet = false,
}) {
  const box = el('section.bcx-panel', {});
  let packet = null;
  let status = null;
  let busy = false;
  // 클릭 한 번에 키 하나. 같은 클릭의 재확인은 이 키를 다시 쓴다.
  let pendingKey = null;

  // 조회와 제출이 다 있어야 누를 수 있다. 하나라도 없으면 왜 못 하는지 적는다.
  const supported = typeof api?.recipientRegistration === 'function'
    && typeof api?.submitRecipientRegistration === 'function'
    && typeof signTypedData === 'function';

  const run = async (fn) => {
    busy = true; render();
    try { await fn(); } catch (error) { status = { kind: 'error', error }; }
    busy = false; render();
  };

  const load = () => run(async () => {
    status = null;
    packet = await api.recipientRegistration(view.applicationId);
  });

  const signAndSubmit = () => {
    pendingKey = pendingKey ?? newKey('recipient');
    run(async () => {
      status = null;
      // 서버가 준 자료를 그대로 서명한다. 우리가 도메인·타입을 만들지 않는다.
      const signature = await signTypedData(packet.payload);
      await api.submitRecipientRegistration(
        view.applicationId, packet, signature, { idempotencyKey: pendingKey },
      );
      // 제출 결과를 우리가 단정하지 않고 **다시 읽는다.**
      packet = await api.recipientRegistration(view.applicationId);
      status = { kind: 'ok', text: '서명을 접수했습니다.' };
      pendingKey = null;
      onDone();
    });
  };

  // 결과를 모를 때는 **다시 보내지 않고 조회만** 한다.
  const confirm = () => run(async () => {
    packet = await api.recipientRegistration(view.applicationId);
    status = packet?.signatureAccepted
      ? { kind: 'ok', text: '앞서 보낸 서명이 접수된 것을 확인했습니다.' }
      : { kind: 'ok', text: '아직 접수되지 않았습니다. 다시 서명해 주세요.' };
    if (packet?.signatureAccepted) pendingKey = null;
    onDone();
  });

  const render = () => {
    clear(box);
    const unknownResult = status?.kind === 'error' && status.error.outcome === 'UNKNOWN';
    const message = packet?.payload?.message ?? null;
    const state = packet?.status ?? null;

    box.append(...[
      el('p.bcx-note', {
        text: '환급금은 여기 등록한 주소로만 갑니다. 한 번 등록하면 서버도 바꾸지 못합니다.',
      }),

      state ? el('p.bcx-note', { text: WHAT_NOW[state] ?? '' }) : null,

      // 사람이 무엇에 서명하는지 보고 정한다. 해시만 보여주고 서명하라고 하면
      // 그건 확인이 아니다.
      ...(packet
        ? pairBlock([
          item('대상 신청', packet.applicationId),
          item('판정', packet.decisionId
            ? `${packet.decisionId} · ${packet.decisionRevision}차` : null),
          item('정책', message?.policyHash ?? null),
          item('실행 대조', message?.runtimeMappingHash ?? null),
          item('받을 주소', message?.recipient ?? null,
            '이 주소로만 지급됩니다. 바꿀 수 없습니다'),
          item('서명 기한', message?.deadline ? seoulText(Number(message.deadline)) : null),
          item('등록 단계', state ? (STATUS[state] ?? state) : null),
          // **서명 수락과 체인 등록은 다른 축이다.** 한 줄로 합치지 않는다.
          item('서명 수락', packet.signatureAccepted === true ? '접수됨'
            : packet.signatureAccepted === false ? '아직 없음' : null),
          item('체인 반영', packet.chainStatus
            ? (CHAIN[packet.chainStatus] ?? packet.chainStatus) : null),
          item('calldata 공개', packet.calldataPublic === true ? '공개'
            : packet.calldataPublic === false ? '비공개' : null),
        ], { missingLabel: '등록 쪽에서 아직 못 받은 값' })
        : []),

      // 서명이 수락돼도 체인에 올라간 것은 아니다. 그 구분을 지우지 않는다.
      packet?.signatureAccepted && packet.chainStatus === 'NOT_OBSERVED'
        ? el('p.bcx-warn', {
          text: '서명은 접수됐지만 체인에서는 아직 확인되지 않았습니다. '
            + '등록이 끝난 것으로 보지 마세요.',
        })
        : null,

      ...resultLines(status),

      blocked
        ? (quiet ? null : el('p.bcx-blocked', {}, [el('span', { text: blocked })]))
        : !supported
          ? el('p.bcx-note', {
            'data-why': 'BC_UI_RECIPIENT_REGISTRATION_ROUTE_ABSENT',
            text: '수령 계정 등록이 이 서버에 아직 열리지 않았습니다.',
          })
          : unknownResult
            ? actionButton({ label: '결과 확인', busy, onClick: confirm })
            : state === 'AWAITING_SIGNATURE'
              ? actionButton({ label: '지갑으로 서명하기', busy, onClick: signAndSubmit })
              : actionButton({ label: packet ? '다시 불러오기' : '등록 자료 불러오기', busy, onClick: load }),
    ].filter(Boolean));
  };

  render();
  return box;
}
