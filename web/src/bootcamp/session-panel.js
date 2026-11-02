// 연결·로그인 줄
//
// 네 상태를 구분해서 보여준다. 여기를 하나로 뭉치면 "안 돼요"만 남고
// 사용자는 **자기가 할 일이 있는지 없는지**를 모른다.
//
//   OFFLINE      서버가 없다       — 할 일 없음. 아래는 합성 예시
//   NOT_ACTIVE   준비 중이다       — 할 일 없음. 기다린다
//   SIGNED_OUT   로그인하면 된다   — **버튼이 나오는 유일한 상태**
//   LIVE         로그인됨          — 주소와 로그아웃
//
// 로그인은 버튼에서만 시작한다. 화면을 여는 것만으로 지갑 창이 뜨면,
// 사용자는 자기가 뭘 승인하는지 모른 채 창을 보게 된다.

import { el } from '../ui/dom.js';

const STATE_TEXT = Object.freeze({
  OFFLINE: '서버 없음',
  NOT_ACTIVE: '서버 준비 중',
  SIGNED_OUT: '로그인 필요',
  LIVE: '연결됨',
});

const ERROR_TEXT = Object.freeze({
  BC_WALLET_MISSING: '이 브라우저에 지갑이 없습니다.',
  BC_WALLET_REJECTED: '지갑에서 서명을 거절하셨습니다.',
  BC_WALLET_FAILED: '지갑이 응답하지 않았습니다.',
  BC_WALLET_CONTEXT_CHANGED: '도중에 지갑 계정이나 네트워크가 바뀌었습니다. 다시 해주세요.',
  BC_AUTH_CHALLENGE: '서버가 보낸 로그인 문구를 쓸 수 없습니다.',
  BC_AUTH_SESSION: '로그인은 됐는데 세션을 받지 못했습니다.',
  BC_HOST_NOT_ACTIVE: '서버가 아직 준비되지 않았습니다.',
  BC_HOST_CONFIG: '서버가 알려준 설정이 예상과 다릅니다.',
  BC_CLIENT_UNAVAILABLE: '서버에서 클라이언트 모듈을 받지 못했습니다.',
  BC_CLIENT_SHAPE: '서버 클라이언트 모듈의 모양이 예상과 다릅니다.',
  BC_CLIENT_ORIGIN: '다른 주소의 모듈은 불러오지 않습니다.',
  AUTH_REQUIRED: '로그인이 필요합니다.',
});

/** 짧은 주소. 전체는 title 로 남긴다 */
const shortAddress = (value) => (typeof value === 'string' && value.length > 12
  ? `${value.slice(0, 6)}…${value.slice(-4)}`
  : value);

/**
 * @param {object} conn      createConnection() 의 snapshot
 * @param {Function} onSignIn
 * @param {Function} onSignOut
 */
export function sessionPanel({ conn, onSignIn, onSignOut }) {
  // OFFLINE · NOT_ACTIVE 는 **백엔드를 아직 안 붙인 우리 사정**이지
  // 학생이 알 일이 아니다. 그 상태에서는 화면 위의 '백엔드 합성 예시' 배너가
  // 이미 같은 말을 하고 있으므로 여기서는 아무것도 그리지 않는다.
  //
  // 오류가 있으면 그때는 보여준다 — 붙이는 사람이 봐야 한다.
  if (conn.state === 'OFFLINE' || conn.state === 'NOT_ACTIVE') {
    return conn.error ? errorBlock(conn.error) : null;
  }

  const rows = [
    el('span.bcx-conn-tag', { text: STATE_TEXT[conn.state] ?? conn.state }),
  ];

  if (conn.state === 'SIGNED_OUT') {
    rows.push(el('span', { text: '로그인하시면 내 기록을 불러옵니다.' }));
    rows.push(el('button.bcx-btn', {
      type: 'button',
      disabled: conn.busy ? 'disabled' : null,
      onClick: onSignIn,
    }, [el('span', { text: conn.busy ? '여는 중…' : '로그인' })]));
  } else if (conn.state === 'LIVE') {
    rows.push(el('span', {
      title: conn.address ?? '',
      text: `${shortAddress(conn.address)} 으로 로그인`,
    }));
    rows.push(el('button.bcx-btn.bcx-btn-quiet', {
      type: 'button',
      disabled: conn.busy ? 'disabled' : null,
      onClick: onSignOut,
    }, [el('span', { text: '로그아웃' })]));
  }

  const panel = el('div.bcx-conn', { 'data-state': conn.state }, rows);
  if (!conn.error) return panel;
  return el('div', {}, [panel, errorBlock(conn.error)]);
}

/**
 * 오류는 숨기지 않는다.
 *
 * BC_CLIENT_SHAPE 의 detail 은 백엔드를 붙일 때 무엇이 어긋났는지 알려주는
 * 유일한 단서다. 그대로 보여준다.
 */
function errorBlock(error) {
  return el('div', {}, [
    el('p.bcx-warn', { text: ERROR_TEXT[error.code] ?? error.code }),
    error.detail ? el('pre.bcx-message-body', { text: String(error.detail) }) : null,
  ].filter(Boolean));
}
