// 로그인은 됐는데 판정을 못 읽었을 때의 화면
//
// 전에는 이 자리가 **없었다.** 조회가 실패하면 화면이 합성 월드로 떨어져
// 학생 20명과 조작판을 띄웠다. 로그인한 사람에게 남의 가짜 기록을 자기 것으로
// 보여주는 것이라, 아무것도 안 그리는 쪽이 차라리 낫다.
//
// 여기서는 **무슨 일이 있었는지 적고 다시 읽을 길만 준다.** 숫자를 지어내지
// 않는다.

import { el, clear } from '../ui/dom.js';
import { errorText, actionButton } from './panels.js';
import { viewStatusOf } from './mode.js';

const TITLE = Object.freeze({
  LOADING: '기록을 불러오고 있습니다',
  NOT_READY: '확인 절차가 아직 준비되지 않았습니다',
  FAILED: '기록을 불러오지 못했습니다',
});

const BODY = Object.freeze({
  LOADING: '잠시만 기다려 주세요.',
  NOT_READY: '학습 기록을 모으고 판정을 붙이는 중입니다. 준비되면 여기에서 바로 보실 수 있습니다.',
  FAILED: '잠시 뒤 다시 시도해 주세요. 계속 안 되면 운영자에게 알려 주세요.',
});

/**
 * @param {object} options
 * @param {object} options.conn      연결 상태
 * @param {Function} options.onRetry 다시 읽기
 */
export function viewStatusView({ conn, onRetry = () => {} }) {
  const box = el('section.bcx', {});
  const kind = viewStatusOf(conn?.viewError ?? null);

  const render = () => {
    clear(box);
    box.append(...[
      el('div.band.band--card', {}, [el('div.band-inner', {}, [
        el('section.bcx-block.panel', {}, [
          el('h2', { text: TITLE[kind] }),
          el('p.sec-sub', { text: BODY[kind] }),

          // 서버가 보낸 이유가 있으면 사람 말로 한 줄 적는다. 코드를 그대로
          // 내보내지 않는다.
          kind === 'FAILED' && conn?.viewError?.code
            ? el('p.bcx-warn', { text: errorText(conn.viewError.code) })
            : null,

          // **여기서 보이는 숫자는 없다.** 조건 개수도 금액도 적지 않는다 —
          // 서버가 주지 않은 값을 그리면 그게 합성으로 떨어지는 것과 같다.
          el('p.bcx-note', {
            text: '로그인된 상태입니다. 아래를 눌러 다시 읽어 보세요.',
          }),

          actionButton({ label: '다시 읽기', busy: Boolean(conn?.busy), onClick: onRetry }),
        ]),
      ])]),
    ].filter(Boolean));
  };

  render();
  return box;
}
