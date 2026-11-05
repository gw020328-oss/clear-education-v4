// Moodle 운영자 화면의 조건 초안 패널 — 마운트와 연결부
//
// 강좌 CLEAR 설정(configure.php)에서 운영자가
//   조건 원문 → 「제안 생성」 → 조건·원문 근거·선택 도구·보류 사유·출처·호출 여부
// 를 보게 한다. 새 해석기나 새 화면을 만들지 않고 기존 ai-compare 패널과
// operator-proposer(서버 중계 계약)를 그대로 붙인다.
//
// 지키는 것
//   · Moodle 로그인만으로 CLEAR 운영자 인증으로 보지 않는다. 바깥(A 의 native 핸들)이
//     CLEAR 운영자 세션·강좌 범위·native 명령 범위를 거친 previewRequest 를 주고, 연결이
//     CONNECTED·authenticated·operator·같은 강좌일 때만 패널을 연다. 아니면 '미연결'.
//   · 브라우저에 D HMAC·API 키·승인 ref 를 두지 않는다. 여기는 원문과 서버가 준
//     contextRef·revision·bodyHash 만 보낸다(operator-proposer).
//   · 로그아웃·지갑/세션 변경·강좌 변경·화면 종료면 진행 중 요청과 결과를 버리고
//     새로 그린다. 늦은 응답은 쓰지 않는다.
//   · 녹화 응답·합성 결과로 자동 대체하지 않는다. 포트가 없으면 미연결로 닫는다.
//   · 표시 전용이다. 도구 실행·지급을 열지 않는다. 학생 지급 정책(고정 네 조건)과 무관하다.

import { el, clear } from '../../ui/dom.js';
import { createAdapter, DATA_MODE } from './adapter.js';
import { aiComparePanel, PROPOSAL_PHASE } from './ai-compare.js';
import { createOperatorProposer } from './operator-proposer.js';

export const MOUNT_PHASE = Object.freeze({ UNCONNECTED: 'UNCONNECTED', ...PROPOSAL_PHASE });

/** 상태 줄 문구. 미연결 / 생성 전 / 생성 중 / 승인 필요 / 성공 / 서버 보류 / 생성 실패 / 만료 / 결과 미확인 */
export const PHASE_TEXT = Object.freeze({
  UNCONNECTED: '미연결',
  IDLE: '생성 전',
  GENERATING: '생성 중',
  APPROVAL_REQUIRED: '승인 필요',
  SUCCESS: '성공',
  SERVER_HELD: '서버 보류',
  FAILED: '생성 실패',
  EXPIRED: '만료',
  UNKNOWN: '결과 미확인',
});

/** 미연결 이유. 무엇이 빠졌는지 운영자와 A/C 가 알 수 있게 */
const UNCONNECTED_TEXT = Object.freeze({
  NO_PREVIEW_PORT: '이 Moodle 설치에는 운영자 조건 미리보기 중계가 아직 연결되지 않았습니다.',
  NOT_SIGNED_IN: 'CLEAR 운영자 연결(지갑 로그인)이 필요합니다. Moodle 로그인만으로는 CLEAR 운영자 인증이 아닙니다.',
  OTHER_COURSE: '연결된 CLEAR 운영자 범위가 이 강좌가 아닙니다.',
  CLOSED: '화면이 닫혔습니다.',
});

const OPAQUE = /^[A-Za-z0-9_.:-]{1,96}$/;

/** 지금 연결로 패널을 열 수 있나. 열 수 없으면 이유 코드 */
function connectionOf(readConnection, previewRequest, courseId) {
  if (typeof previewRequest !== 'function') return { ok: false, reason: 'NO_PREVIEW_PORT' };
  let c = null;
  try {
    c = readConnection();
    if (c && typeof c.then === 'function') {
      Promise.resolve(c).catch(() => {});
      c = null; // This port is synchronous; never adopt an async snapshot.
    }
  } catch { c = null; }
  if (!c || c.status !== 'CONNECTED' || c.authenticated !== true || c.role !== 'operator'
    || typeof c.sessionRef !== 'string' || !OPAQUE.test(c.sessionRef)) return { ok: false, reason: 'NOT_SIGNED_IN' };
  if (c.courseId !== courseId) return { ok: false, reason: 'OTHER_COURSE' };
  return { ok: true, key: `moodle-course-${courseId}:${c.sessionRef}` };
}

/**
 * @param {HTMLElement} root  configure.php 의 [data-clear-operator-conditions] 칸
 * @param {object} ports
 * @param {number} ports.courseId  이 페이지의 Moodle 강좌 id
 * @param {() => ({status:string, authenticated:boolean, role:string, courseId:number, sessionRef:string}|null)} ports.readConnection
 *   지금 CLEAR 운영자 연결. A 의 native 핸들 상태에서 만든다. sessionRef 는 세션·지갑이 바뀌면 바뀌는 불투명 값
 * @param {(listener: () => void) => (() => void)} [ports.subscribe]  연결 변화 알림(로그아웃·지갑·세션·강좌)
 * @param {((path: string, options: {method: 'POST', body: object, signal: AbortSignal}) => Promise<object>) | null} [ports.previewRequest]
 *   /bootcamp/preview/{prepare,generate} 를 기존 CLEAR 운영자 세션·CSRF·강좌 범위·native 명령 범위로 보내는 포트.
 *   실패는 transport.js BootcampError 모양(outcome·status·previewFailure)으로 던진다. 없으면 미연결
 * @param {(phase: string) => void} [ports.onPhase]  상태가 바뀔 때(시험·바깥 표시용)
 */
export function mountOperatorConditionPanel(root, {
  courseId, readConnection = () => null, subscribe = null, previewRequest = null, onPhase = () => {},
} = {}) {
  if (!root || !Number.isSafeInteger(courseId) || courseId <= 0) throw new Error('OPERATOR_CONDITIONS_MOUNT');
  let closed = false;
  let key = null;          // 지금 열린 연결. 바뀌면 패널을 버리고 새로 연다
  let proposer = null;
  let phase = null;
  const statusLine = el('p.fp-note', { 'data-role': 'operator-conditions-phase' });
  const body = el('div', {});

  const setPhase = (next) => {
    if (closed || next === phase) return;
    phase = next;
    statusLine.setAttribute('data-phase', next);
    statusLine.textContent = `상태: ${PHASE_TEXT[next] ?? next}`;
    try { onPhase(next); } catch { /* 바깥 표시 실패가 패널을 깨지 않는다 */ }
  };

  const drop = () => {
    // 진행 중 요청을 끊고 채택 지문을 버린다. 늦은 응답은 세대가 달라 쓰이지 않는다.
    proposer?.invalidate();
    proposer = null;
    key = null;
    clear(body);
  };

  const showUnconnected = (reason) => {
    drop();
    body.append(el('div.fp-proposal-warn', { 'data-role': 'operator-conditions-unconnected', 'data-reason': reason }, [
      el('p.fp-proposal-ask', { text: '조건 초안 제안을 쓸 수 없습니다 — 미연결' }),
      el('p.fp-proposal-note', { text: UNCONNECTED_TEXT[reason] ?? UNCONNECTED_TEXT.NO_PREVIEW_PORT }),
      el('p.fp-note', { text: '합성 응답이나 녹화 응답으로 대신하지 않습니다. 제안 생성 요청도 보내지 않습니다.' }),
    ]));
    setPhase(MOUNT_PHASE.UNCONNECTED);
  };

  const open = (nextKey) => {
    drop();
    key = nextKey;
    const current = key;
    // Re-read authority hints at each async boundary, even without notifications.
    const assertConnection = (sent = false) => {
      const c = connectionOf(readConnection, previewRequest, courseId);
      if (!closed && key === current && c.ok && c.key === current) return;
      if (!closed && key === current) {
        if (c.ok) open(c.key); else showUnconnected(c.reason);
      }
      throw Object.assign(new Error('OPERATOR_CONTEXT_CHANGED'), {
        code: 'OPERATOR_CONTEXT_CHANGED', outcome: sent ? 'UNKNOWN' : 'NOT_SENT',
      });
    };
    const request = async (path, options) => {
      assertConnection();
      try { return await previewRequest(path, options); }
      finally { assertConnection(true); }
    };
    const inner = createOperatorProposer({ request,
      appContextRef: () => { assertConnection(true); return current; },
      label: 'Gemini 제안 · CLEAR 서버 중계' });
    proposer = Object.freeze({...inner, async propose(...args) {
      const result = await inner.propose(...args);
      assertConnection(true); // Includes conversion's crypto awaits, before panel adoption.
      return result;
    }});
    const adapter = createAdapter({ mode: DATA_MODE.ACTUAL, run: null });
    const panel = aiComparePanel({
      adapter, source: '', presets: [], proposer,
      onStatus: (s) => { if (key === current) setPhase(s.phase); },
    });
    body.append(panel.node);
  };

  const sync = () => {
    if (closed) return;
    const c = connectionOf(readConnection, previewRequest, courseId);
    if (!c.ok) { showUnconnected(c.reason); return; }
    if (c.key !== key) open(c.key);
  };

  root.append(
    el('section.fp', { 'aria-label': '개설 전 조건 초안' }, [
      el('p.fp-sub', {
        text: '조건 원문을 넣고 「제안 생성」 을 누르면 CLEAR 서버가 운영자·강좌 범위를 확인한 뒤 Gemini 제안을 받아 '
          + '조건·원문 근거·선택 도구·보류 사유를 보여 줍니다. 표시 전용이며 학생 지급 정책(고정 네 조건)은 바뀌지 않습니다.',
      }),
      el('p.fp-note', { 'data-role': 'operator-conditions-one-line', text: '현재는 조건 하나당 한 줄로 입력해 주세요. 쉼표나 문장으로 여러 조건을 이어 쓰면 서버가 보류합니다.' }),
      el('p.fp-note', { text: '예) 강의 활동을 완료하세요 ⏎ 과제를 제출하세요 ⏎ 회고에 수행 내용, 문제해결 과정, 배운 점을 포함하세요' }),
      statusLine,
      body,
    ]),
  );

  const unsubscribe = typeof subscribe === 'function' ? subscribe(sync) : null;
  sync();

  return Object.freeze({
    /** 화면 종료(pagehide) — 진행 중 요청·결과를 버린다 */
    destroy() {
      if (closed) return;
      closed = true;
      try { unsubscribe?.(); } catch { /* 이미 떨어졌다 */ }
      drop();
      body.append(el('p.fp-note', { text: UNCONNECTED_TEXT.CLOSED }));
    },
    phase: () => phase,
    /** 연결 상태를 다시 읽는다(바깥이 알림 없이 바꾼 경우) */
    refresh: sync,
  });
}
