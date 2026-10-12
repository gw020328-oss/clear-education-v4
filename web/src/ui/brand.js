// 머리말과 공통 표식
//
// 제품이 파는 것은 '먼저 고정하고 아무도 못 바꾼다' 하나다. 화면도 광고가 아니라
// 증서처럼 읽혀야 한다. 그래서 글로우·느낌표·혜택 강조 대신 봉인·자물쇠·원장
// 표식을 쓴다. 조건 값 같은 사실만 크게 둔다.

import { el } from './dom.js';

const svg = (d, size = 14) => {
  const ns = 'http://www.w3.org/2000/svg';
  const node = document.createElementNS(ns, 'svg');
  node.setAttribute('viewBox', '0 0 24 24');
  node.setAttribute('width', String(size));
  node.setAttribute('height', String(size));
  node.setAttribute('fill', 'none');
  node.setAttribute('stroke', 'currentColor');
  node.setAttribute('stroke-width', '2');
  node.setAttribute('stroke-linecap', 'round');
  node.setAttribute('stroke-linejoin', 'round');
  node.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d);
  node.append(path);
  return node;
};

export const lockIcon = (size) => svg('M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z', size);
export const checkIcon = (size) => svg('M20 6 9 17l-5-5', size);

/** 머리말 — 제품이 무엇을 보장하는지 한 줄로 */
export const brandHeader = () => el('header.head', {}, [
  el('div.brand', {}, [
    el('span.brand-mark', { 'aria-hidden': 'true' }, [lockIcon(16)]),
    el('h1', { text: 'CLEAR' }),
    el('span.brand-sub', { text: '참가자 신청' }),
  ]),
  el('p.tagline', { text: '조건을 먼저 고정하고, 기록이 증명합니다.' }),
]);

/** 고정됨 봉인 — 바꿀 수 없다는 사실을 시각으로 한 번 더 */
export const sealBadge = (text) => el('span.seal', {}, [
  el('span.seal-icon', { 'aria-hidden': 'true' }, [lockIcon(12)]),
  el('span', { text }),
]);
