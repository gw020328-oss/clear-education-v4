// 값 목록 — 받은 것만 줄로 그린다
//
// 앞서는 빈 값마다 "아직 몰라요" 한 줄씩 그렸다. 서버가 아직 안 붙어서 그게
// 열세 줄이 됐고, 화면이 **고장난 것처럼** 보였다.
//
// 숫자를 지어내는 것과 빈 줄을 늘어놓는 것은 둘 다 나쁘다. 가운데를 간다.
//
//   값이 있으면        줄로 그린다
//   값이 없으면        줄을 그리지 않는다
//   없는 게 있으면     구역 끝에 **한 줄**로 모아 말한다
//
// 그래야 받은 값이 눈에 들어오고, 못 받은 것도 숨기지 않는다.
//
// 예외가 하나 있다. 비어 있다는 사실 자체가 설계인 값은 `always` 로 표시해
// 빈 채로 남긴다 — 수령 계정이 그렇다. 로그인 계정과 다를 수 있어서 일부러
// 비워 둔 것이고, 조용히 사라지면 "아직 안 만들었네" 로 읽힌다.

import { el } from '../ui/dom.js';

/**
 * 값 한 줄.
 *
 * @param {string} label
 * @param {string|null} value
 * @param {string|null} [note]   값 옆 보조 설명
 * @param {object} [options]
 * @param {boolean} [options.always]  값이 없어도 줄을 남긴다
 */
export const item = (label, value, note = null, options = {}) =>
  Object.freeze({ label, value: value ?? null, note, always: options.always === true });

function row(entry) {
  return el('div.bcx-pair', {}, [
    el('dt', { text: entry.label }),
    el('dd', {}, [
      entry.value === null
        ? el('span.bcx-unknown', { text: '아직 몰라요' })
        : el('span', { text: entry.value }),
      entry.note ? el('span.bcx-pair-note', { text: entry.note }) : null,
    ].filter(Boolean)),
  ]);
}

/**
 * 값 목록을 그린다.
 *
 * @param {Array} items  item() 들. null 은 건너뛴다
 * @param {object} [options]
 * @param {string} [options.missingLabel]  못 받은 값 줄의 머리말
 * @returns {Array<Node>}  dl 하나와, 필요하면 요약 한 줄
 */
export function pairBlock(items, { missingLabel = '아직 못 받은 값' } = {}) {
  const all = items.filter(Boolean);
  const shown = all.filter((entry) => entry.value !== null || entry.always);
  const hidden = all.filter((entry) => entry.value === null && !entry.always);

  return [
    shown.length > 0 ? el('dl.bcx-pairs', {}, shown.map(row)) : null,
    hidden.length > 0
      ? el('p.bcx-note', { text: `${missingLabel} — ${hidden.map((e) => e.label).join(' · ')}` })
      : null,
  ].filter(Boolean);
}
