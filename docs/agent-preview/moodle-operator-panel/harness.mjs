// 시험 하네스 — A 의 mountCourseWallet 대역. 실제 CLEAR 운영자 세션·native 명령 범위가 아니다.
import { createBootcampTransport } from './web/src/bootcamp/transport.js';
import { createReplayFetch } from './web/src/bootcamp/finals-panels/operator-relay-standin.js';

const params = new URL(location.href).searchParams;
const port = params.get('port') ?? 'none';
const auth = params.get('auth') !== '0';
document.querySelector('#harness-mode').textContent = `모드: previewRequest=${port === 'replay' ? '녹화 재생 대역' : '없음'}, CLEAR 운영자 인증=${auth ? '연결' : '미연결'}`;

const view = (over) => ({ version: 'clear-moodle-wallet-view.1', role: 'operator', phase: 'CONNECTED', busy: false,
  providers: [{ providerId: 'metamask' }], choices: [{ choiceId: 'wallet-1', address: '0x' + '1'.repeat(40) }],
  selectedChoiceId: 'wallet-1', networkReady: true, authenticated: true, allowedActions: ['sign-out'], error: null, ...over });
const idle = () => view({ phase: 'IDLE', choices: [], selectedChoiceId: null, networkReady: false, authenticated: false, allowedActions: ['connect-metamask'] });

let emit = null;
const replay = createBootcampTransport({ origin: 'https://replay.clear.invalid', fetchImpl: createReplayFetch() });
function mountCourseWallet({ onState }) {
  emit = onState;
  queueMicrotask(() => onState(auth ? view({}) : idle()));
  return Object.freeze({
    async dispatch() {}, async destroy() {},
    ...(port === 'replay' ? { previewRequest: (path, options) => replay(path, options) } : {}),
  });
}
document.querySelector('#logout').addEventListener('click', () => emit?.(idle()));
document.querySelector('#wallet').addEventListener('click', () => emit?.(view({ choices: [{ choiceId: 'wallet-2', address: '0x' + '2'.repeat(40) }], selectedChoiceId: 'wallet-2' })));

const wallet = window.__amd['local_clearbridge/course_native_wallet'];
const config = { appId: 'x', origin: location.origin, redirectUri: location.origin + '/', phase: 'ACTIVE_LOCAL_TEST', chainId: 1,
  rpcUrl: 'http://127.0.0.1:1/', instanceId: 'x', surface: 'MOODLE_NATIVE', role: 'operator', courseId: 2, sesskey: 'abcdefghij' };
wallet.compose({ element: document.querySelector('[data-clear-wallet-ui]'), config, mountCourseWallet, validateNativeWorkflowCommand: (x) => x });

// ?demo= — 화면 캡처용 자동 입력·클릭. 녹화 재생 대역에 있는 원문만 쓴다.
const DEMO = {
  success: 'Moodle 활동 완료; Moodle 과제 제출',
  held: '강의 수강 또는 과제 제출',
  approval: '과제를 제출하세요 (승인 전 시연)',
  failed: '강의를 완료하세요 (D 오류 시연)',
  expired: '과제를 제출하세요 (만료 시연)',
  unknown: '강의를 완료하세요 (응답 유실 시연)',
};
const demo = DEMO[params.get('demo')];
if (demo) {
  setTimeout(() => {
    const ta = document.querySelector('[data-clear-operator-conditions] textarea');
    if (!ta) return;
    ta.value = demo; ta.dispatchEvent(new Event('input', { bubbles: true }));
    setTimeout(() => {
      document.querySelector('[data-clear-operator-conditions] [data-role="generate"]')?.click();
      setTimeout(() => document.querySelector('[data-clear-operator-conditions]').scrollIntoView(), 600);
    }, 400);
  }, 300);
}
