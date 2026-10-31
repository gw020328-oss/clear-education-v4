// 첫 진입 — 계정 만들기
//
// Moodle 에서 [환급 신청] 을 누르고 넘어온 학생이 처음 보는 화면이다.
// 아직 CLEAR 는 이 사람이 누군지 모르고, 돈 보낼 주소도 모른다.
//
// ── 세 걸음 ─────────────────────────────────────────────────────────────
//
//   1 계정 연결       내장 지갑 SDK 가 지갑을 만들거나 다시 꺼낸다 (학생만)
//   2 로그인 확인      /auth/nonce → personal_sign → /auth/verify (SIWE)
//   3 수령 계정 등록   내 주소를 체인에 박는다. relayer 가 제출해 가스 0
//
// 3번이 금창섭 멘토 회신 §2 다.
//
//   "컨트랙트가 보는 것은 서버의 지급 승인뿐이어서 승인에 다른 주소가 들어가도
//    컨트랙트는 알 수 없습니다. 참가자가 신청할 때 자기 지갑으로 서명해
//    수령인을 체인에 등록해 두면, 서버 승인이 그 주소와 다를 때 컨트랙트가
//    거부할 수 있습니다."
//
// 그래서 2번과 3번을 합칠 수 없다. 2번은 서버가 보는 서명이고 3번은 컨트랙트가
// 보는 서명이다. 둘 다 학생에게는 '확인' 한 번씩이다.
//
// ── 지갑이라는 말을 쓰지 않는다 ─────────────────────────────────────────
//
// **B안(내장 지갑)으로 확정됐다** (2026-10-29 팀 결정). 학생은 지갑을 만든
// 적도 본 적도 없다. 화면에 '지갑' 이라고 쓰면 없는 것을 찾게 된다.
// '계정' 으로 쓰고, 지갑이라는 말은 **운영자에게만** 쓴다 — 운영자는 학원이
// 이미 쓰는 브라우저 지갑(MetaMask 류)을 연결하기로 했다(2026-10-29).
//
// ── 백엔드는 A안 전제다 ─────────────────────────────────────────────────
//
// 오규원 문서·코드는 브라우저 확장 지갑을 전제한다
// (`FUNDING_RELAYER.ko.md` "embedded wallet … 도입하지 않는다", SIWE 로그인,
// `eth_signTypedData_v4`). 알면서 B안으로 가기로 했다.
//
// **그래도 백엔드를 고칠 일은 아마 없다.** Privy·Web3Auth 류는 EIP-1193
// provider 를 그대로 내놓는다. `personal_sign` 과 `eth_signTypedData_v4` 가
// 되므로 SIWE 도 수령인 등록도 그대로 돈다. connect.js 의 pickProvider() 가
// `window.clearWallet` 을 먼저 찾으니 SDK 를 거기 올리면 끼워진다.
//
// **진짜 막는 것은 CSP 하나다** — `script-src 'self'; connect-src 'self'` 가
// SDK 스크립트도 SDK 가 자기 서버로 보내는 호출도 막는다. 오규원과 상의할 일.

import { el, clear } from '../ui/dom.js';
import { clearLogo, icon, pillButton, statusPill } from '../ui/brand.js';

const PARTICIPANT_STEPS = Object.freeze([
  {
    title: '계정 연결',
    body: '로그인하면 환급금 받을 계정이 자동으로 만들어집니다. 따로 설치할 것은 없습니다.',
    done: '연결됨',
  },
  {
    title: '로그인 확인',
    body: 'CLEAR 가 본인인지 확인합니다. 수수료는 들지 않습니다.',
    done: '확인됨',
  },
  {
    title: '수령 계정 등록',
    body: '환급금을 받을 주소를 기록합니다. 한 번만 하면 되고, '
      + '이후에는 이 주소로만 지급됩니다.',
    done: '등록됨',
  },
]);

/**
 * 운영자는 걸음이 둘이다.
 *
 * 돈을 **받는** 쪽이 아니라 **넣는** 쪽이라 수령 계정이 없다.
 *
 * ── 운영자는 브라우저 지갑을 쓴다 (2026-10-29 결정) ───────────────────
 *
 * 학생만 내장 지갑이고 **운영자는 MetaMask 같은 지갑 확장**이다.
 *
 * 기술로는 운영자도 내장 지갑이 된다 — 내장 지갑도 EIP-1193 provider 를
 * 내놓고 `eth_sendTransaction` 을 지원한다(Privy 문서 확인). 그런데도 안
 * 쓰기로 한 이유는 둘이다.
 *
 *   1 **학원 금고 키를 SDK 계정에 두게 된다.** 학생 환급금 100 TEST 와 달리
 *     기수 전체 재원이 걸린다. SDK 계정을 잃으면 그 돈에 접근을 잃는다.
 *   2 갓 만든 내장 지갑은 잔고가 0이라 TEST 와 가스를 따로 넣어 줘야 한다.
 *     학원이 이미 쓰는 지갑을 연결하는 쪽이 단순하다.
 *
 * 그래서 **운영자 화면은 설치가 필요하다고 분명히 적는다.** 학생 화면의
 * "따로 설치할 것은 없습니다" 와 정반대다. 둘을 같은 문구로 쓰면 둘 중
 * 하나는 거짓말이 된다.
 */
const OPERATOR_STEPS = Object.freeze([
  {
    title: '지갑 연결',
    body: '기수 금고에 재원을 넣을 지갑이 필요합니다. MetaMask 같은 지갑 확장을 '
      + '브라우저에 설치하고 연결해 주세요.',
    done: '연결됨',
  },
  {
    title: '로그인 확인',
    body: 'CLEAR 가 운영자인지 확인합니다.',
    done: '확인됨',
  },
]);

/** 지금 몇 번째 걸음인가. 0 = 아직 시작 전 */
function stepOf(conn, steps) {
  const connected = conn?.state === 'LIVE' || conn?.demo;
  if (!connected) return 0;
  if (steps.length === 2) return 2;
  return conn.recipient ? 3 : 2;
}

/**
 * 지갑 쪽 안내.
 *
 * **서버가 살아 있을 때만** 말이 된다. 서버가 없으면 어차피 로컬에서
 * 흐름만 보는 것이라, 지갑이 없다고 알려 봐야 할 수 있는 일이 없다 —
 * 버튼은 눌리는데 "연결할 수 없습니다" 가 떠 있으면 화면이 모순된다.
 */
const WALLET_NOTE = Object.freeze({
  // 학생은 **내장 지갑만** 쓴다. 지갑 확장이 깔려 있어도 그쪽으로 가지
  // 않는다 — 수령 계정은 한 번만 등록하고 바꿀 수 없는데, 그 주소가
  // "브라우저에 뭐가 깔려 있느냐" 로 갈리면 안 된다.
  participant: {
    EMBEDDED: null,
    // 학생 경로에서는 나올 수 없다. pickProvider 가 브라우저 지갑을 안 집는다.
    BROWSER: null,
    // 시험용으로 브라우저 지갑을 쓰는 중. **숨기지 않는다.**
    //
    // 전에는 "이 주소는 쓰이지 않습니다" 라고 적었다. 2026-10-29 백엔드
    // 지적으로 고쳤다 — **틀린 말이었다.** 시험에 연결하면 신청·서명·TEST
    // 수령에 이 주소가 **실제로 쓰인다.** "안 쓰인다" 고 적으면 학생이
    // 아무 주소나 연결해도 된다고 읽는다.
    //
    // 문구는 백엔드가 준 것을 그대로 쓴다.
    TEST_BROWSER: '시험용 브라우저 지갑으로 연결했습니다. 이번 시험의 신청과 '
      + 'TEST 수령에는 이 주소가 사용됩니다. 실제 서비스의 내장 지갑 계정과는 별개입니다.',
    NONE: '환급 계정을 만드는 기능이 이 서버에 아직 준비되지 않았습니다.',
  },
  operator: {
    EMBEDDED: null,
    BROWSER: '지갑 확장으로 연결합니다.',
    NONE: '이 브라우저에 연결할 수 있는 지갑이 없습니다. '
      + 'MetaMask 같은 지갑 확장을 설치한 뒤 다시 시도해 주세요.',
  },
});

function stepRow(step, index, { current }) {
  const state = index < current ? 'done' : index === current ? 'now' : 'next';

  return el('li.ob-step', { 'data-state': state }, [
    el('span.ob-num', { 'aria-hidden': 'true' }, [
      state === 'done' ? icon('check') : el('span', { text: String(index + 1) }),
    ]),
    el('div.ob-main', {}, [
      el('p.ob-title', { text: step.title }),
      el('p.ob-body', { text: step.body }),
    ]),
    el('span.ob-state', { text: state === 'done' ? step.done : state === 'now' ? '지금' : '' }),
  ]);
}

/**
 * @param {object} options
 * @param {object} options.conn      createConnection() 의 snapshot
 * @param {Function} options.onStart 계정 연결 + 로그인
 * @param {Function} options.onRegister 수령 계정 등록
 * @param {Function} options.onTestWallet 시험용 브라우저 지갑으로 전환
 */
export function onboardingView({
  conn, role = 'participant', onStart = () => {}, onRegister = () => {},
  onTestWallet = () => {},
}) {
  const box = el('section.ob', {});
  const operator = role === 'operator';
  const steps = operator ? OPERATOR_STEPS : PARTICIPANT_STEPS;
  const current = stepOf(conn, steps);
  // 서버에 붙어 있을 때만 지갑 안내가 의미가 있다
  const live = conn?.state === 'SIGNED_OUT' || conn?.state === 'LIVE';
  const kindNote = live
    ? WALLET_NOTE[operator ? 'operator' : 'participant'][conn?.walletKind ?? 'NONE']
    : null;
  const done = current >= steps.length;

  const action = current === 0
    ? pillButton({
      label: conn?.busy ? '여는 중…' : operator ? '지갑 연결하기' : '계정 만들고 시작하기',
      onClick: onStart,
      disabled: conn?.busy,
      iconName: 'arrowUpRight',
    })
    : (!operator && current === 2)
      ? pillButton({
        label: conn?.busy ? '등록 중…' : '수령 계정 등록하기',
        onClick: onRegister,
        disabled: conn?.busy,
        iconName: 'key',
      })
      : null;

  clear(box);
  box.append(...[
    el('div.ob-card', {}, [
      el('div.ob-head', {}, [
        clearLogo({ className: 'ob-logo' }),
        statusPill(operator ? '운영자 계정 연결' : '환급 신청 시작', null),
      ]),
      el('h1.ob-title-main', { text: operator ? 'Python 부트캠프 · 운영자' : 'Python 부트캠프' }),
      el('p.ob-lead', {
        text: operator
          ? '운영자로 들어가려면 지갑을 한 번 연결해야 합니다.'
          : '환급을 받으려면 계정을 한 번 연결해야 합니다. 세 걸음이고, 수수료는 들지 않습니다.',
      }),

      el('ol.ob-steps', {}, steps.map((step, i) => stepRow(step, i, { current }))),

      action ? el('div.ob-actions', {}, [action]) : null,

      // 내장 지갑 SDK 가 없어 학생이 로그인조차 못 하는 동안, 백엔드 통합
      // 시험을 돌릴 수 있게 열어 둔 길. **저절로 켜지지 않는다.**
      //
      //   오규원 10-28: "현재 경로로 먼저 통합을 검증하는 것과 내장 지갑
      //   목표를 폐기하는 것은 다른 결정이야."
      !operator && conn?.canTestWallet
        ? el('div.ob-test', {}, [
          el('p.bcx-note', {
            text: '환급 계정을 만드는 기능이 아직 준비되지 않았습니다. '
              + '백엔드 연결을 시험하시려면 브라우저 지갑으로 대신 들어가실 수 있습니다.',
          }),
          el('button.dp-btn.dp-btn--ghost.ob-test-btn', {
            type: 'button',
            onClick: onTestWallet,
          }, [el('span', { text: '시험용 브라우저 지갑으로 연결' })]),
        ])
        : null,

      // 합성이라는 사실은 바닥 한 줄로 충분하다. 화면마다 '가짜입니다' 를
      // 붙이면 제품이 아니라 공사장으로 보인다. 백엔드가 붙으면 이 흐름이
      // 그대로 진짜가 되므로, 지금 화면도 진짜처럼 보여야 맞다.
      kindNote ? el('p.bcx-note', { text: kindNote }) : null,

      conn?.error
        ? el('p.bcx-warn', { text: conn.error.detail ?? conn.error.code })
        : null,

      // 수수료를 누가 내는지. 역할마다 답이 다르다 —
      // 학생은 한 푼도 안 내고, 충전 거래는 보내는 쪽이 낸다.
      //
      // **'운영자가 직접 보내는 거래' 라고 적지 않는다.** CLEAR 운영자 로그인
      // 역할과 계약의 depositor 권한은 별개고(10-29 B1), 충전은 단순 송금이
      // 아니라 approve → fund 다.
      el('p.ob-foot', {
        text: operator
          ? '환급 지급 수수료는 CLEAR 가 부담합니다. 기수 금고 충전은 예치자가 보내는 거래라 수수료가 듭니다.'
          : '거래 수수료는 CLEAR 가 부담합니다. 학생은 온체인 거래를 보내지 않습니다.',
      }),
    ]),
  ]);
  return box;
}
