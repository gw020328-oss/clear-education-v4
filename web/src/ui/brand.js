// 로고와 상단 바
//
// 로고는 팀 원본 그대로다 — CLEAR_최종로고.svg (545×164).
// 두 색이 들어 있고, 그게 화면 전체 팔레트의 출처다.
//
//   #17343E  에이전트 윤곽과 글자 → currentColor 로 둔다. 어두운 화면에서도 보여야 한다
//   #008D77  체크와 화살표       → 고정. 이건 브랜드 색이라 테마 따라 바꾸지 않는다
//
// <img> 로 불러오지 않고 인라인으로 그린다. 요청이 하나 줄고, 잉크 쪽을
// currentColor 로 둘 수 있어 밝은 화면·어두운 화면에서 모두 읽힌다.
//
// 제품이 파는 것은 '먼저 고정하고 아무도 못 바꾼다' 하나다. 화면도 광고가
// 아니라 증서처럼 읽혀야 해서 글로우·느낌표 대신 사실만 크게 둔다.

import { el } from './dom.js';

const NS = 'http://www.w3.org/2000/svg';

/** 원본 path 들. 색만 두 갈래로 나눠 둔다 */
const INK = Object.freeze([
  'M113 34H68C45 34 28 51 28 74V91C28 114 45 131 68 131H113',
]);
const EYES = 'M60 64V71M88 64V71';
const MARK = Object.freeze([
  'M61 96L77 108L111 80H137',
  'M126 68L140 80L126 92',
]);
const WORD = Object.freeze([
  'M232 55C225 47 217 44 209 44C194 44 186 59 186 79C186 100 194 114 209 114C218 114 226 111 232 104',
  'M259 45V113H294',
  'M358 45H321V113H358M321 79H351',
  'M380 113L404 45L428 113M389 90H419',
  'M451 113V45H473C489 45 496 51 496 62C496 73 489 80 473 80H451M473 80L499 113',
]);

function path(d, { stroke, width }) {
  const node = document.createElementNS(NS, 'path');
  node.setAttribute('d', d);
  node.setAttribute('fill', 'none');
  node.setAttribute('stroke', stroke);
  node.setAttribute('stroke-width', String(width));
  node.setAttribute('stroke-linecap', 'round');
  node.setAttribute('stroke-linejoin', 'round');
  return node;
}

/**
 * CLEAR 로고.
 *
 * @param {object} [options]
 * @param {boolean} [options.symbolOnly]  심볼만. 좁은 자리와 큰 배경 장식에 쓴다
 * @param {string} [options.className]
 */
export function clearLogo({ symbolOnly = false, className = 'nav-logo' } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', symbolOnly ? '14 20 140 125' : '14 20 517 125');
  svg.setAttribute('class', className);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'CLEAR');

  for (const d of INK) svg.append(path(d, { stroke: 'currentColor', width: 15 }));
  svg.append(path(EYES, { stroke: 'currentColor', width: 9 }));
  // 체크와 화살표는 브랜드 색 고정. 로고의 의미가 여기 있다 — 확인하고 내보낸다.
  for (const d of MARK) svg.append(path(d, { stroke: '#008D77', width: 12 }));
  if (!symbolOnly) for (const d of WORD) svg.append(path(d, { stroke: 'currentColor', width: 12 }));
  return svg;
}

/**
 * 고정 상단 바.
 *
 * 레퍼런스처럼 왼쪽에 로고, 오른쪽에 알약 버튼 하나. 가운데 메뉴는 두지
 * 않는다 — 신청 화면은 한 장이고 갈 곳이 없다. 없는 메뉴를 그리면 눌러 보고
 * 아무 일도 안 일어난다.
 *
 * @param {object} [options]
 * @param {string} [options.who]      로고 옆 한 마디. 누가 보는 화면인가
 * @param {Node} [options.action]     오른쪽 버튼. 보통 로그인
 */
export const navBar = ({ who = null, action = null } = {}) => el('header.nav', {}, [
  el('div.nav-brand', {}, [
    clearLogo({}),
    who ? el('span.nav-who', { text: who }) : null,
  ].filter(Boolean)),
  action,
]);

/** 바탕 세로 격자. 레퍼런스의 고정 그리드 */
export const gridLines = () => el('div.gridlines', { 'aria-hidden': 'true' }, [
  el('i'), el('i'), el('i'), el('i'),
]);

/** 상태 알약 — 점 하나와 짧은 말 */
export const statusPill = (text, tone = null) => el('span.statuspill', { 'data-tone': tone }, [
  el('span.dot', { 'aria-hidden': 'true' }),
  el('span', { text }),
]);

/** 알약 버튼 */
export const pillButton = ({ label, onClick, disabled = false, ghost = false, iconName = null }) =>
  el(ghost ? 'button.pill-btn.ghost' : 'button.pill-btn', {
    type: 'button',
    disabled: disabled ? 'disabled' : null,
    onClick,
  }, [iconName ? icon(iconName) : null, el('span', { text: label })].filter(Boolean));

/** 대문자 모노 라벨 */
export const monoLabel = (text) => el('p.mono-label', { text });

/**
 * 숫자 띠. 레퍼런스 맨 아래 네 칸.
 *
 * @param {Array<{label:string, value:string|null, small?:boolean}>} items
 */
export const ticker = (items) => el('dl.ticker', {}, items.filter(Boolean).map((cell) => el('div', {}, [
  el('dt', { text: cell.label }),
  el(cell.small ? 'dd.sm' : 'dd', { text: cell.value ?? '—' }),
])));


// ── 아이콘 ──────────────────────────────────────────────────────────────
//
// 레퍼런스는 iconify CDN 으로 lucide 를 불러온다. 우리는 script-src 'self' 라
// 못 받으므로, **그 HTML 안에 이미 펼쳐져 있던 path 를 그대로** 들고 왔다.
// lucide 는 ISC 라 이렇게 써도 된다.

const ICONS = Object.freeze({
  wallet: [
    'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1',
    'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4',
  ],
  arrowUpRight: ['M7 7h10v10M7 17L17 7'],
  lock: ['M7 11V7a5 5 0 0 1 10 0v4', 'M5 11h14v10H5z'],
  key: [
    'm15.5 7.5l2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4m2-2l-9.6 9.6',
    'M13 10a5.5 5.5 0 1 1-7.78 7.78A5.5 5.5 0 0 1 13 10z',
  ],
  layers: [
    'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z',
    'M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12',
    'M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17',
  ],
  check: ['M20 6L9 17l-5-5'],
  history: ['M3 3v5h5', 'M3.05 13A9 9 0 1 0 6 5.3L3 8', 'M12 7v5l4 2'],
});

/** @param {keyof ICONS} name */
export function icon(name, { className = 'icon' } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ICONS[name] ?? []) svg.append(path(d, { stroke: 'currentColor', width: 2 }));
  return svg;
}

/** 카드 머리의 동그란 아이콘 자리. 레퍼런스의 w-10 h-10 rounded-full */
export const iconChip = (name) => el('span.icon-chip', { 'aria-hidden': 'true' }, [icon(name)]);

/** 히어로 뒤 점선 원 둘. 레퍼런스의 120초 회전 장치 */
export const heroRings = () => el('div.hero-rings', { 'aria-hidden': 'true' }, [el('i'), el('i')]);

/** 옛 머리말. 어학원 보존 화면이 아직 쓴다 */
const lockPath = 'M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z';

export function lockIcon(size = 14) {
  const node = document.createElementNS(NS, 'svg');
  node.setAttribute('viewBox', '0 0 24 24');
  node.setAttribute('width', String(size));
  node.setAttribute('height', String(size));
  node.setAttribute('aria-hidden', 'true');
  node.append(path(lockPath, { stroke: 'currentColor', width: 2 }));
  return node;
}

export const brandHeader = ({ who = '참가자 신청', tagline } = {}) => el('header.head', {}, [
  el('div.brand', {}, [
    el('span.brand-mark', { 'aria-hidden': 'true' }, [lockIcon(16)]),
    el('h1', { text: 'CLEAR' }),
    el('span.brand-sub', { text: who }),
  ]),
  el('p.tagline', { text: tagline ?? '조건을 먼저 고정하고, 기록이 증명합니다.' }),
]);

/** 고정됨 봉인 — 바꿀 수 없다는 사실을 시각으로 한 번 더 */
export const sealBadge = (text) => el('span.seal', {}, [
  el('span.seal-icon', { 'aria-hidden': 'true' }, [lockIcon(12)]),
  el('span', { text }),
]);

// ── 파이프라인 비주얼 ────────────────────────────────────────────────────
//
// 레퍼런스 둘 다 헤드라인 **옆에 제품 그림**이 있다. 1번은 로봇 사진, 2번은
// 노드 그래프 목업. 그게 없으면 화면이 신청서처럼 보인다 — 실제로 지금까지
// 우리 화면이 그랬다.
//
// 사진을 가져다 쓸 수는 없다(CSP img-src 'self', 그리고 남의 사진이다).
// 대신 **우리가 실제로 하는 일**을 그린다.
//
//   조건 4개  →  AI 판독  →  스마트컨트랙트  →  참가자 지갑
//
// 레퍼런스 2 의 .node-line 처럼 점선이 흐르게 해서 "지금 돌고 있다" 를 보인다.
// 장식이지만 지어낸 수치는 하나도 없다 — 단계 이름뿐이다.

const STAGES = Object.freeze([
  { label: '조건 4개', sub: 'Moodle · HackerRank' },
  { label: 'AI 판독', sub: '회고 검사 · Reclaim 공증' },
  { label: '스마트컨트랙트', sub: '전액 배정 · 권리 수락' },
  { label: '참가자 지갑', sub: '가스비 0' },
]);

function pipelineSvg({ activeUpto = 4 } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 300 220');
  svg.setAttribute('class', 'pipe-svg');
  svg.setAttribute('aria-hidden', 'true');

  const y = (i) => 30 + i * 52;

  // 세로 연결선 — 흐르는 점선
  for (let i = 0; i < STAGES.length - 1; i += 1) {
    const line = document.createElementNS(NS, 'path');
    line.setAttribute('d', `M26 ${y(i) + 12} L26 ${y(i + 1) - 12}`);
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', i < activeUpto - 1 ? '#008D77' : 'currentColor');
    line.setAttribute('stroke-width', '1.5');
    line.setAttribute('class', i < activeUpto - 1 ? 'pipe-line live' : 'pipe-line');
    svg.append(line);
  }

  STAGES.forEach((stage, i) => {
    const done = i < activeUpto;
    const ring = document.createElementNS(NS, 'circle');
    ring.setAttribute('cx', '26');
    ring.setAttribute('cy', String(y(i)));
    ring.setAttribute('r', '9');
    ring.setAttribute('fill', 'var(--card)');
    ring.setAttribute('stroke', done ? '#008D77' : 'currentColor');
    ring.setAttribute('stroke-width', '2');
    svg.append(ring);

    if (done) {
      const tick = document.createElementNS(NS, 'path');
      tick.setAttribute('d', `M21.5 ${y(i)} l3 3 6 -6`);
      tick.setAttribute('fill', 'none');
      tick.setAttribute('stroke', '#008D77');
      tick.setAttribute('stroke-width', '2');
      tick.setAttribute('stroke-linecap', 'round');
      tick.setAttribute('stroke-linejoin', 'round');
      svg.append(tick);
    }

    const name = document.createElementNS(NS, 'text');
    name.setAttribute('x', '48');
    name.setAttribute('y', String(y(i) - 1));
    name.setAttribute('class', 'pipe-name');
    name.textContent = stage.label;
    svg.append(name);

    const sub = document.createElementNS(NS, 'text');
    sub.setAttribute('x', '48');
    sub.setAttribute('y', String(y(i) + 13));
    sub.setAttribute('class', 'pipe-sub');
    sub.textContent = stage.sub;
    svg.append(sub);
  });

  return svg;
}

/**
 * 히어로 오른쪽 카드.
 *
 * @param {object} [options]
 * @param {number} [options.activeUpto]  어디까지 왔나 (0~4)
 * @param {string} [options.caption]     카드 아래 한 줄
 */
export function pipelineCard({ activeUpto = 4, caption = null } = {}) {
  return el('div.pipe-card', {}, [
    el('div.pipe-top', { 'aria-hidden': 'true' }),
    el('div.pipe-head', {}, [
      el('span.pipe-tag', { text: 'CLEAR PIPELINE' }),
      el('span.statuspill', { 'data-tone': activeUpto >= 4 ? 'ok' : 'wait' }, [
        el('span.dot', { 'aria-hidden': 'true' }),
        el('span', { text: activeUpto >= 4 ? '완료' : '진행 중' }),
      ]),
    ]),
    pipelineSvg({ activeUpto }),
    caption ? el('p.pipe-caption', { text: caption }) : null,
  ].filter(Boolean));
}

// ── 조건 카드 그림 ───────────────────────────────────────────────────────
//
// 참고 사진은 카드마다 사진을 깔고 그 위에 흰 알약 라벨을 띄우는 구성이다.
// 구성은 그대로 쓰되 **사진은 안 쓴다.**
//
// 우리한테는 쓸 사진이 없다. 남의 스톡 사진을 붙이면 내용과 무관한 장식이
// 되고, CSP 가 img-src 'self' 라 외부에서 못 받기도 한다. 대신 조건마다
// **그 조건이 무슨 일인지** 보이는 그림을 그린다.

function scene(children, { tone = 'plain' } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 160 200');
  svg.setAttribute('class', 'cc-art');
  svg.setAttribute('data-tone', tone);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  for (const node of children) svg.append(node);
  return svg;
}

const rect = (x, y, w, h, r, attrs = {}) => {
  const n = document.createElementNS(NS, 'rect');
  n.setAttribute('x', x); n.setAttribute('y', y);
  n.setAttribute('width', w); n.setAttribute('height', h);
  n.setAttribute('rx', r);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

const line = (d, attrs = {}) => {
  const n = document.createElementNS(NS, 'path');
  n.setAttribute('d', d);
  n.setAttribute('fill', 'none');
  n.setAttribute('stroke', 'currentColor');
  n.setAttribute('stroke-width', '2.5');
  n.setAttribute('stroke-linecap', 'round');
  n.setAttribute('stroke-linejoin', 'round');
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

const ART = Object.freeze({
  // 강의 수강 — 재생 버튼과 진도
  'activity-complete': () => scene([
    rect(30, 52, 100, 62, 8, { fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5' }),
    line('M72 72 L92 83 L72 94 Z', { fill: 'currentColor', stroke: 'none' }),
    rect(30, 128, 100, 5, 3, { fill: 'currentColor', opacity: '0.18', stroke: 'none' }),
    rect(30, 128, 76, 5, 3, { fill: '#008D77', stroke: 'none' }),
    rect(30, 145, 62, 5, 3, { fill: 'currentColor', opacity: '0.18', stroke: 'none' }),
  ]),
  // 과제 제출 — 문서와 올림 화살표
  'assignment-submitted': () => scene([
    line('M46 44 h46 l22 22 v90 a6 6 0 0 1 -6 6 H46 a6 6 0 0 1 -6 -6 V50 a6 6 0 0 1 6 -6 Z'),
    line('M92 44 v22 h22'),
    line('M80 134 V98 M68 110 l12 -12 l12 12', { stroke: '#008D77' }),
  ]),
  // 회고 — 세 항목에 체크
  'reflection-topics': () => scene([
    ...[0, 1, 2].map((i) => line(`M44 ${66 + i * 34} l7 7 l13 -14`, { stroke: '#008D77' })),
    ...[0, 1, 2].map((i) => rect(76, 62 + i * 34, 44, 6, 3,
      { fill: 'currentColor', opacity: '0.2', stroke: 'none' })),
  ]),
  // 인증서 — 배지와 리본
  'python-basic-certificate': () => scene([
    line('M80 40 a34 34 0 1 1 -0.1 0 Z'),
    line('M66 74 l10 10 l20 -22', { stroke: '#008D77' }),
    line('M62 106 l-10 48 l28 -14 l28 14 l-10 -48'),
  ]),
});

/** 조건 하나의 그림. 모르는 조건이면 비운다 — 아무거나 그리지 않는다 */
export const conditionArt = (criterionId) => (ART[criterionId] ? ART[criterionId]() : null);

// ── 배경 글자 ────────────────────────────────────────────────────────────
//
// 레퍼런스는 26vw 짜리 글자를 뒤에 깔았다. 그대로 쓰면 **잘린다** —
// vw 는 창 기준인데 우리 본문은 1180px 로 묶여 있어서, 창이 넓을수록
// 글자가 본문 밖으로 삐져나간다.
//
// SVG 로 그리면 viewBox 가 컨테이너 폭에 맞춰 늘어나므로 어떤 창에서도
// 정확히 들어맞는다. textLength 로 폭을 못 박아 글꼴이 늦게 와도 안 흔들린다.

export function ghostWord(text = 'CLEAR') {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 1000 220');
  svg.setAttribute('class', 'ghost');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  const node = document.createElementNS(NS, 'text');
  node.setAttribute('x', '500');
  node.setAttribute('y', '172');
  node.setAttribute('text-anchor', 'middle');
  node.setAttribute('textLength', '980');
  node.setAttribute('lengthAdjust', 'spacingAndGlyphs');
  node.setAttribute('font-size', '220');
  node.setAttribute('font-weight', '800');
  node.setAttribute('fill', 'currentColor');
  node.textContent = text;
  svg.append(node);
  return svg;
}

// ── 바닥 ─────────────────────────────────────────────────────────────────
//
// 레퍼런스 푸터는 세 칸이다 — 로고 / 저작권 / 상태 점.
// 합성 데모라는 사실을 오른쪽 상태 칸이 말한다. 경고 상자로 띄우지 않고
// 여기 두면, 숨기지 않으면서도 화면을 가리지 않는다.

export const siteFooter = ({ note = '시연 환경 · 무가치 TEST 토큰' } = {}) =>
  el('div.foot-row', {}, [
    el('div.foot-brand', {}, [clearLogo({ className: 'foot-logo' })]),
    el('p.foot-copy', { text: `© ${new Date().getFullYear()} CLEAR · 5팀 환급킬러` }),
    el('p.foot-state', {}, [
      el('span.dot', { 'aria-hidden': 'true' }),
      el('span', { text: note }),
    ]),
  ]);
