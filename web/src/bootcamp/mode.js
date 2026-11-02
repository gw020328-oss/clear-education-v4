// 지금 화면이 무엇을 그릴지 고른다
//
// 이 파일이 따로 있는 이유 하나. **실제 세션이 합성 월드로 떨어지면 안 된다.**
//
// 전에는 main.js 가 이렇게 골랐다.
//
//   const live = conn.state === 'LIVE' && liveView !== null;
//   const sim  = !live && pickedCase === 'live';
//
// 그런데 `connection.refresh()` 는 `api.view()` 실패를 삼켜 null 을 돌려줬다.
// 그래서 **로그인한 실제 사용자의 조회가 한 번 실패하면** live 가 false 가 되고
// sim 이 true 가 돼, 합성 학생 20명과 조작판이 켜졌다. 절차가 아직 준비되지
// 않아 판정이 없는 경우도 같았다. 로그인한 사람이 남의 가짜 기록을 자기 것으로
// 보게 되는 길이다 — 2026-11-01 백엔드 리뷰가 짚었다.
//
// 그래서 **로그인 여부와 판정 유무를 분리한다.** 로그인했으면 판정이 없어도
// 실제 세션이고, 화면은 그 사실(조회 실패 · 절차 준비 중)을 적고 다시 읽을
// 길을 준다. 합성은 로그인하지 않았을 때만이다.

export const MODE = Object.freeze({
  /** 서버가 준 판정을 그린다 */
  LIVE: 'LIVE',
  /** 로그인했지만 판정을 못 읽었다. **합성으로 대신하지 않는다** */
  LIVE_NO_VIEW: 'LIVE_NO_VIEW',
  /** 시연 월드. 서버에 로그인하지 않았을 때만 */
  SIM: 'SIM',
  /** 고정 예시 4장 */
  FIXTURE: 'FIXTURE',
});

/**
 * @param {object} options
 * @param {string} options.connState  연결 상태 (LIVE / SIGNED_OUT / NOT_ACTIVE / OFFLINE)
 * @param {object|null} options.liveView  서버가 준 판정
 * @param {string} options.pickedCase     주소에서 고른 상황
 * @param {string} [options.liveCase]     시연 월드를 뜻하는 상황 이름
 */
export function pickMode({ connState, liveView, pickedCase, liveCase = 'live' }) {
  // **로그인했으면 여기서 끝난다.** 아래 합성 갈래로 내려가지 않는다.
  if (connState === 'LIVE') return liveView ? MODE.LIVE : MODE.LIVE_NO_VIEW;
  return pickedCase === liveCase ? MODE.SIM : MODE.FIXTURE;
}

/** 조회를 못 한 이유를 갈래로 나눈다. 준비 중과 오류는 다른 말이다 */
export const NOT_READY_CODES = Object.freeze(new Set([
  'BC_NORMAL_PROCEDURE_NOT_READY', 'NORMAL_HOST_NOT_ACTIVATED',
]));

export const viewStatusOf = (error) => (
  !error ? 'LOADING' : NOT_READY_CODES.has(error.code) ? 'NOT_READY' : 'FAILED'
);
