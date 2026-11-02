// 운영자 — 이번 입력의 AI 승인
//
// 회고를 AI 가 읽기 전에 **운영자가 그 호출 하나를 승인**한다. 유료 호출이고
// 학생 글이 외부 모델로 나가므로, 학원이 건건이 알고 눌러야 한다.
//
// ── 기준 ────────────────────────────────────────────────────────────────
//
// `tools/bootcamp/test-client/driver.js` 의 `approveAi` 를 그대로 따른다.
// 우리가 모양을 정하지 않는다 — 서버가 `session().aiApproval` 로 주는 값을
// 그대로 보내고, 영수증도 그대로 검사한다.
//
//   보내는 것  version / applicationId / bodySha256 / planHash / contextHash
//              runBindingHash / codeHead / model / action / costAcknowledgment
//   받는 것    clear-normal-ai-approval-receipt.1 · status RECORDED
//              runBindingHash 일치 · paymentConsentIncluded === false
//
// `normal-client.mjs` 에 이 메서드가 없다. 그래서 세션 request 로 직접 POST 한다
// (driver.js 도 그렇게 한다). 없는 메서드를 지어내 부르지 않는다.
//
// ── 지키는 것 ───────────────────────────────────────────────────────────
//
// 1. **자동 승인 없음.** 체크 한 번 + 사람 클릭 한 번이라야 보낸다.
// 2. **자동 재승인 없음.** 결과를 모르면(outcome UNKNOWN) 다시 보내지 않는다.
//    유료 호출이라 두 번 나가면 두 번 과금된다.
// 3. **남은 시간은 서버 기준이다.** 서버가 준 창에서 조회 뒤 흐른 시간을 뺀다.
//    브라우저 타이머로 늘리지 않는다.
// 4. 자료가 바뀌면 **체크를 푼다.** 다른 입력을 보고 누른 승인이 되면 안 된다.
// 5. 지급 동의가 아니다. 영수증의 `paymentConsentIncluded === false` 를 확인한다.

import { el, clear } from '../ui/dom.js';
import { item, pairBlock } from './pairs.js';
import { iconChip, monoLabel } from '../ui/brand.js';
import { testActionAvailability } from './review-window.js';

const ACTION_VERSION = 'clear-normal-ai-approval-action.1';
const RECEIPT_VERSION = 'clear-normal-ai-approval-receipt.1';

const STATUS_TEXT = Object.freeze({
  WAITING: '이번 입력의 명시적 승인 대기',
  RECORDED: '승인 기록 완료',
  PARTIAL_STOPPED: '일부만 기록되고 중단됨 · 본부 확인 필요',
  INSUFFICIENT_REVIEW_WINDOW: '검토 시간이 모자라 승인할 수 없음',
});

const ERROR_TEXT = Object.freeze({
  AUTH_REQUIRED: '로그인이 필요합니다.',
  FORBIDDEN: '지정된 승인 지갑이 아닙니다.',
  CSRF: '요청이 거부됐습니다. 다시 로그인해 주세요.',
});

/** 긴 해시는 앞뒤만. 전체 값은 title 에 남긴다 */
const short = (v) => {
  const s = String(v ?? '');
  return s.length > 18 ? `${s.slice(0, 10)}…${s.slice(-6)}` : s;
};

/**
 * 남은 승인 시간(ms).
 *
 * **서버가 준 창에서 조회 뒤 흐른 시간을 뺀다.** 브라우저가 시작 시각을
 * 정하면 탭을 열어 둔 만큼 창이 늘어난다. driver.js 의 aiRemaining 과 같다.
 *
 * @param {object} a    session().aiApproval
 * @param {number} readAtMs  session() 을 부른 시각 (performance.now 계열)
 * @param {number} nowMs
 */
export function approvalRemainingMs(a, readAtMs, nowMs) {
  if (!a || !Number.isFinite(readAtMs) || !Number.isFinite(nowMs)) return -1;
  const age = nowMs - readAtMs;
  if (!(age >= 0)) return -1;
  return a.approvalWindowEndsAtMs - a.observedAtMs - age;
}

/**
 * 버튼 게이트 — **백엔드 것을 그대로 쓴다.**
 *
 * 손으로 옮겨 적었다가 조건 셋을 빠뜨렸다(지정 지갑 대조·승인 권한 설정·
 * 양쪽 화면 준비). 조건이 열 개라 다시 적으면 또 어긋난다.
 * review-window.js 의 testActionAvailability 가 두 버튼의 실제 규칙이고,
 * 거부 사유 문구까지 거기 있다.
 *
 * 우리 상태를 그 함수가 읽는 모양으로 옮기기만 한다.
 */
export function aiGate({
  approval, remainingMs, applicationId, wallet, unknown, acked, busy, recorded, error,
}) {
  return testActionAvailability({
    ended: false,
    busy: busy === true,
    identity: wallet ? { wallet } : null,
    bootstrap: { applicationId, aiApproval: approval ?? null },
    aiApprovalUnknown: unknown === true,
    aiApprovalReceipt: recorded ?? null,
    aiApprovalRemainingMs: remainingMs,
    error: error ?? null,
  }, { ack: acked === true }).ai;
}

/** 같은 입력인지 가리는 열쇠. 바뀌면 체크를 푼다 */
const keyOf = (a) => (a
  ? JSON.stringify([a.applicationId, a.bodySha256, a.planHash, a.contextHash, a.runBindingHash, a.model])
  : null);

/**
 * 체크한 사실을 화면 밖에 둔다.
 *
 * 확인 기간이 흐르는 동안 화면이 1초마다 다시 그려진다. 체크 상태가 이
 * 안에만 있으면 **매초 풀려서 승인 단추를 영영 못 누른다.** 시험 화면도
 * 체크박스를 다시 그리지 않고 열쇠가 바뀔 때만 푸는 식이다.
 *
 * 열쇠(이번 입력)가 바뀌면 지운다 — 다른 입력을 보고 누른 승인이 되면 안 된다.
 */
const ACK = new Map();
const ackOf = (key) => (key !== null && ACK.get(key) === true);
const setAck = (key, v) => {
  if (key === null) return;
  ACK.clear();          // 한 번에 하나만 들고 있는다
  if (v) ACK.set(key, true);
};

/** 결과를 모른다는 사실도 밖에 둔다. 다시 그려도 또 보내면 안 된다 */
const UNKNOWN = new Set();

/**
 * @param {object} options
 * @param {object|null} options.approval   session().aiApproval
 * @param {number} options.remainingMs
 * @param {string} options.applicationId
 * @param {Function|null} options.send   (body, idempotencyKey) => Promise<receipt>
 * @param {Function} options.onDone
 */
export function aiApprovalSection({
  approval, remainingMs, applicationId, wallet = null, send = null, onDone = () => {},
}) {
  const box = el('section.bcx-block.panel', {});
  const key0 = keyOf(approval);
  let busy = false;
  let status = null;
  // 멱등 키는 클릭 한 번에 하나. 같은 클릭의 재확인은 이 키를 다시 쓴다.
  let key = null;

  const run = async () => {
    const a = approval;
    busy = true; status = null; render();
    key ??= `ai-${a.runBindingHash.slice(2, 18)}`;
    try {
      const receipt = await send({
        version: ACTION_VERSION,
        applicationId,
        bodySha256: a.bodySha256,
        planHash: a.planHash,
        contextHash: a.contextHash,
        runBindingHash: a.runBindingHash,
        codeHead: a.codeHead,
        model: a.model,
        action: 'APPROVE_THIS_INPUT_ONCE',
        costAcknowledgment: a.costAcknowledgment,
      }, key);

      // 영수증을 믿지 않고 하나씩 본다. 특히 **지급 동의가 섞이지 않았는지.**
      const good = receipt?.version === RECEIPT_VERSION
        && receipt.applicationId === applicationId
        && receipt.runBindingHash === a.runBindingHash
        && receipt.status === 'RECORDED'
        && receipt.paymentConsentIncluded === false;
      if (!good) throw Object.assign(new Error(''), { code: 'BC_AI_APPROVAL_RESPONSE' });

      status = { kind: 'ok', text: '이번 입력을 승인했습니다. 지급 동의와는 별개입니다.' };
      key = null;
      onDone(receipt);
    } catch (caught) {
      // **결과를 모르면 다시 보내지 않는다.** 유료 호출이다.
      if (caught?.outcome === 'UNKNOWN') UNKNOWN.add(key0);
      status = { kind: 'error', code: caught?.code ?? 'BC_AI_APPROVAL_FAILED', outcome: caught?.outcome ?? null };
    }
    busy = false; render();
  };

  const render = () => {
    clear(box);
    const a = approval;
    const k = keyOf(a);
    const acked = ackOf(k);
    const unknown = UNKNOWN.has(k);

    const shown = a && a.status === 'WAITING' && !(remainingMs >= 0)
      ? { ...a, status: 'INSUFFICIENT_REVIEW_WINDOW' }
      : a;
    const gate = aiGate({
      approval: a, remainingMs, applicationId, wallet, unknown, acked, busy,
      recorded: status?.kind === 'ok' ? true : null,
      error: status?.kind === 'error' ? { code: status.code } : null,
    });
    const left = Math.max(0, Math.floor((remainingMs ?? 0) / 1000));

    box.append(...[
      iconChip('lock'),
      el('h2', { text: 'AI 승인' }),
      el('p.sec-sub', {
        text: '회고를 AI 가 읽기 전에 이번 호출 하나를 승인하셔야 합니다. '
          + '유료 호출이고 학생 글이 모델로 전송됩니다.',
      }),

      ...pairBlock([
        item('상태', shown ? (STATUS_TEXT[shown.status] ?? shown.status) : null),
        item('모델', a?.model),
        item('비용 고지', a?.costAcknowledgment),
        item('지정 승인 지갑', a?.approvalWallet),
        item('남은 승인 시간', a ? `${left}초` : null,
          '서버가 준 시간에서 조회 뒤 흐른 만큼을 뺀 값입니다. 늘어나지 않습니다'),
      ]),

      // 무엇에 서명 아닌 '승인' 을 하는지. 해시를 숨기지 않는다 —
      // 나중에 "그때 그 입력이 맞냐" 를 따질 수 있어야 한다.
      a
        ? el('div.ai-hashes', {}, [
          monoLabel('이번 입력'),
          ...pairBlock([
            item('본문', short(a.bodySha256), a.bodySha256),
            item('계획', short(a.planHash), a.planHash),
            item('문맥', short(a.contextHash), a.contextHash),
            item('실행 결합', short(a.runBindingHash), a.runBindingHash),
            item('코드 기준', short(a.codeHead), a.codeHead),
          ]),
        ])
        : null,

      status?.kind === 'ok' ? el('p.bcx-ok', { text: status.text }) : null,
      status?.kind === 'error'
        ? el('p.bcx-warn', { text: ERROR_TEXT[status.code] ?? status.code })
        : null,
      status?.outcome === 'UNKNOWN'
        ? el('p.bcx-warn', {
          text: '요청이 서버에 닿았는지 알 수 없습니다. 다시 보내면 유료 호출이 두 번 '
            + '나갈 수 있어 자동으로 보내지 않습니다.',
        })
        : null,

      // 체크 → 버튼. 둘 다 사람 손이라야 한다.
      a && a.status === 'WAITING' && !unknown
        ? el('label.ai-ack', {}, [
          el('input', {
            type: 'checkbox',
            checked: acked ? 'checked' : null,
            onChange: (e) => { setAck(k, e.target.checked === true); render(); },
          }),
          el('span', {
            text: '이번 입력과 모델, 비용을 확인했고 이 호출 한 번을 승인합니다.',
          }),
        ])
        : null,

      send
        ? el('button.cc-btn', {
          type: 'button',
          disabled: !gate.enabled ? 'disabled' : null,
          // 사람 클릭만 받는다. 스크립트가 만든 click 은 보내지 않는다.
          onClick: (e) => { if (gate.enabled && e.isTrusted !== false) void run(); },
        }, [el('span', { text: busy ? '보내는 중…' : '이번 입력 승인' })])
        // 여기는 운영자 화면이다. 학원 담당자는 '경로' 라는 말을 읽어도
        // 되는 쪽이라 진단 말투를 그대로 둔다 — 본부에 그대로 전할 수 있다.
        : el('p.bcx-note', {
          'data-why': 'BC_UI_AI_APPROVAL_ROUTE_ABSENT',
          text: '이 서버에는 AI 승인 경로가 아직 없습니다. 본부에 알려 주세요.',
        }),

      // 왜 못 누르는지 — 문구도 백엔드 것을 그대로 쓴다
      gate.reason ? el('p.bcx-note', { text: gate.reason }) : null,

      el('p.bcx-note', {
        text: '원천 확인 서명 · AI 승인 · 지급 동의는 서로 다른 것입니다. '
          + '이 승인은 지급에 동의하는 것이 아닙니다.',
      }),
    ].filter(Boolean));
  };

  render();
  return box;
}
