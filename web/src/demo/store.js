// 시연 월드 보관소 — 두 화면이 같은 상태를 본다
//
// 참가자 화면과 운영자 화면을 **창 두 개에 띄워 놓고** 발표한다. 한쪽에서
// 조건을 채우면 다른 쪽 집계가 그 자리에서 바뀌어야 "연동된다" 는 말이 된다.
//
// 같은 origin 의 창끼리는 BroadcastChannel 로 바로 전달되고, 새로고침해도
// 남도록 localStorage 에 함께 적는다. 둘 다 바깥으로 나가지 않으므로 CSP
// (connect-src 'self') 에 걸리지 않는다 — 외부 요청이 아니다.
//
// ── 저장이 안 될 수도 있다 ─────────────────────────────────────────────
//
// 시크릿 창이나 사이트 데이터가 막힌 브라우저에서는 localStorage 읽기·쓰기가
// 그냥 던진다. 발표 노트북이 그럴 수 있으므로 **전부 try/catch 로 감싸고,
// 저장이 안 돼도 화면은 그대로 돈다.** 저장은 편의지 조건이 아니다.

import { initialState, derive, worldNow, tick, reset } from './world.js';

const KEY = 'clear.demo.world.1';
/** world.js 의 initialState().v 와 같아야 한다 */
const SHAPE = 3;
const CHANNEL = 'clear.demo.world';

let state = load() ?? initialState();
let channel = null;
let timer = null;
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // 모양이 바뀌면 옛 저장분을 쓰지 않는다. 섞이면 **없는 칸을 읽다가
    // 화면이 통째로 빈 채로 멈춘다.** 조용히 틀리는 게 아니라 터진다.
    return parsed?.v === SHAPE && Array.isArray(parsed.students) ? parsed : null;
  } catch { return null; }
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* 저장은 편의다 */ }
}

function bus() {
  if (channel !== null) return channel;
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (e) => {
      if (!e.data || e.data.v !== SHAPE) return;
      state = e.data;
      notify();
    };
  } catch { channel = false; }
  return channel;
}

/**
 * @param {boolean} clockOnly  시계만 흘렀고 상태는 그대로다.
 *
 * 듣는 쪽이 이걸 보고 **다시 그릴 범위를 줄인다.** 1초마다 전부 다시 그리면
 * 열어 둔 선택 목록이 닫히고 스크롤이 맨 위로 튄다.
 */
function notify(clockOnly = false) {
  for (const fn of listeners) fn({ clockOnly });
}

/** 다른 창에도 알린다. 저장도 같이 한다 */
function commit(next) {
  if (next === state) return;
  state = next;
  save();
  const ch = bus();
  if (ch) { try { ch.postMessage(state); } catch { /* 한 창만 돌아도 된다 */ } }
  notify();
}

/**
 * 1초마다 시계를 본다. §8.3 기한 경로가 저절로 돌아야 하기 때문이다.
 *
 * 바뀐 게 없으면 commit 이 아무것도 안 한다 — 매초 다시 그리면 누르려던
 * 버튼이 발밑에서 사라진다. 다만 확인 기간의 남은 시간은 계속 줄어야 하므로,
 * 확인 기간에 들어와 있는 신청이 있을 때만 그릴 거리를 만든다.
 */
function startClock() {
  if (timer !== null) return;
  timer = setInterval(() => {
    const before = state;
    const next = tick(state);
    if (next !== before) { commit(next); return; }
    // 시계는 늘 알린다. 듣는 쪽이 조작판 글자만 갈지, 화면을 다시 그릴지
    // 정한다 — 카운트다운이 하나도 없는 화면까지 매초 다시 그릴 필요는 없다.
    notify(true);
  }, 1000);
}

export const world = {
  get state() { return state; },
  now: () => worldNow(state),
  derive: () => derive(state),

  /** @param {Function} fn 상태가 바뀌면 부른다. 끊는 함수를 돌려준다 */
  subscribe(fn) {
    listeners.add(fn);
    startClock();
    // **여기서 채널을 연다.** 전에는 commit() 안에서만 열었는데, 그러면
    // 받기만 하는 창은 한 번도 commit 하지 않아 채널이 없었다 — 운영자
    // 화면을 띄워 놓고 학생 화면에서 조작하면 아무 일도 안 일어났다.
    bus();
    return () => listeners.delete(fn);
  },

  /** @param {Function} fn (state) => state. 같은 state 를 돌려주면 아무 일도 없다 */
  apply(fn) { commit(fn(state)); },

  /** @param {'cohort'|'empty'} kind */
  reset(kind) { commit(reset(kind)); },
};
