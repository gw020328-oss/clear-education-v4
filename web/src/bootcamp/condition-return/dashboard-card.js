// 참가자 대시보드(index.html 「환급 조건」)용 조건 카드 — 봉인 student-view.js 의
// conditionCard(row, …) 자리에 한 줄로 끼울 수 있는 렌더러 (마운트 문서 §2 ②).
//
//   progressSection():  view.criteria.map((row) => conditionCard(row, { onOpen, onToggle }))
//                   →   view.criteria.map((row) => dashboardConditionCard(row, { onOpen, onToggle }))
//
// Moodle 탭 카드(cards.js)와 같은 순서 — 해야 하는 일 → 지금 충족 여부 → 판단 이유와 근거 → 다음 행동.
// 다만 대시보드가 주는 건 **view.criteria 한 줄**뿐이다. 복귀 상태(확인 중)·이동할 주소·
// 근거 본문은 없으므로 그 자리는 그리지 않는다. 없는 값을 채우지 않는다.
// 대시보드 문구는 합니다체(verify-screens). Moodle 탭 카드의 해요체와 다르다.

import { el } from '../../ui/dom.js';
import { icon } from '../../ui/brand.js';
import { CRITERIA, displayState, collectionFrom } from '../criteria.js';

/** cards.js TASK 와 같은 할 일. 대시보드는 합니다체라 따로 둔다 */
export const DASHBOARD_TASK = Object.freeze({
  'activity-complete': {
    title: '지정 강의 수강',
    todo: '지정된 강의 페이지를 끝까지 보면 Moodle 에 완료 기록이 남습니다.',
    met: '지정한 강의의 완료 기록을 확인했습니다.',
    unmet: '지정한 강의의 완료 기록이 아직 없습니다.',
  },
  'assignment-submitted': {
    title: '지정 과제 제출',
    todo: '지정된 과제를 Moodle 에 제출하면 제출 기록이 남습니다.',
    met: '지정한 과제의 제출 기록을 확인했습니다.',
    unmet: '지정한 과제의 제출 기록이 아직 없습니다.',
  },
  'reflection-topics': {
    title: '회고 작성',
    todo: '회고 게시판에 수행 내용 · 문제 해결 과정 · 배운 점이 담긴 글을 올립니다. AI 가 세 항목이 있는지만 봅니다.',
    met: '세 항목이 모두 있다고 확인했습니다.',
    unmet: '세 항목이 모두 있는 글을 아직 확인하지 못했습니다.',
  },
  'python-basic-certificate': {
    title: 'HackerRank Python (Basic) 인증',
    todo: 'HackerRank 에서 받은 인증서를 Reclaim 증명으로 확인합니다. 로그인과 동의만 하면 됩니다.',
    met: '인증서 증명을 확인했습니다.',
    unmet: '인증서 증명이 아직 없습니다.',
  },
});

const STATE_TEXT = Object.freeze({
  MET: '충족', UNMET: '미충족', WAITING: '확인 전',
  NEEDS_CHECK: '확인 필요', IN_PROGRESS: '진행 중', UNAVAILABLE: '지원 안 됨',
});

const CARD_ICON = Object.freeze({
  'activity-complete': 'layers',
  'assignment-submitted': 'check',
  'reflection-topics': 'history',
  'python-basic-certificate': 'key',
});

const SOURCE_SHORT = Object.freeze({
  'activity-complete': 'Moodle',
  'assignment-submitted': 'Moodle',
  'reflection-topics': 'Moodle + AI',
  'python-basic-certificate': 'Reclaim 공증',
});

/**
 * 대시보드 줄 하나의 충족 칸. 서버 판정만 본다 — 복귀 상태는 대시보드에 없다.
 * @param {{state:string}} shown displayState(row)
 */
export function dashboardVerdict(shown) {
  const key = shown.state;
  return {
    key,
    label: STATE_TEXT[key] ?? key,
    tone: key === 'MET' ? 'ok' : key === 'UNMET' ? 'bad' : key === 'UNAVAILABLE' ? 'warn' : 'muted',
  };
}

/**
 * @param {object} row  view.criteria 한 줄 (criterionId · state · reasonCode · current · evidenceId · source …)
 * @param {object} o
 * @param {(criterionId:string)=>void} o.onOpen   「자세히」 — 봉인 쪽 조건 상세로
 * @param {((criterionId:string)=>void)|null} [o.onToggle]  시연 조작판의 충족 토글. 없으면 안 그린다
 */
export function dashboardConditionCard(row, { onOpen, onToggle = null }) {
  const id = row.criterionId;
  const meta = CRITERIA[id];
  const task = DASHBOARD_TASK[id] ?? { title: meta?.label ?? id, todo: '', met: null, unmet: null };
  const shown = displayState(row);
  const verdict = dashboardVerdict(shown);
  const met = shown.state === 'MET';
  const c = collectionFrom(row);
  // 이유 한 줄 — 서버가 준 note(reasonCode 번역)가 있으면 그것, 없으면 할 일 기준 문장.
  const why = met ? task.met : (shown.note ?? task.unmet);
  // 지금 사용자가 움직여야 하는 조건. P0 에서는 인증서 하나뿐이다(봉인 카드와 같은 규칙).
  const needsMe = id === 'python-basic-certificate' && !met;

  return el('li.cc.crc-card.crc-card--dashboard', {
    'data-state': met ? 'met' : 'open',
    'data-criterion': id,
    'data-verdict': verdict.key,
    'data-live': onToggle ? 'yes' : null,
    // 봉인 카드와 같다 — 시연 조작판에서는 카드 어디를 눌러도 바뀐다. 안의 버튼은 제 일을 한다.
    onClick: onToggle
      ? (e) => { if (!e.target.closest('button')) onToggle(id); }
      : null,
  }, [
    // 1. 해야 하는 일
    el('span.cc-chip', { 'aria-hidden': 'true' }, [icon(CARD_ICON[id] ?? 'check')]),
    onToggle
      ? el('button.cc-toggle', {
        type: 'button',
        'data-on': met ? 'yes' : 'no',
        onClick: () => onToggle(id),
      }, [el('span', { text: met ? '충족 해제' : '충족으로' })])
      : null,
    el('h3.bcx-task-name', { text: task.title }),
    el('p.cc-sub.crc-todo', { text: task.todo }),

    // 2. 지금 충족 여부 — 크게 한 단어
    el('p.crc-verdict', { 'data-tone': verdict.tone }, [el('strong', { text: verdict.label })]),

    // 3. 판단 이유와 확인 근거
    why ? el('p.crc-why', { text: why }) : null,
    shown.expired ? el('p.cc-note', { text: '예전 충족 기록은 지금 충족으로 다루지 않습니다.' }) : null,
    el('p.crc-source', { text: `확인 출처 · ${c.shortLabel ?? SOURCE_SHORT[id] ?? '미확인'} · 근거 ${c.collected ? '확보' : '없음'}` }),

    // 4. 다음 행동 — 대시보드에는 이동할 주소가 없다. 「자세히」 하나뿐이고, 인증서는 '인증하기'.
    el('div.crc-actions', {}, [
      el('button.cc-btn.crc-go', {
        type: 'button',
        onClick: () => onOpen(id),
      }, [el('span', { text: needsMe ? '인증하기' : '자세히' }), icon('arrowUpRight')]),
    ]),
  ].filter(Boolean));
}
