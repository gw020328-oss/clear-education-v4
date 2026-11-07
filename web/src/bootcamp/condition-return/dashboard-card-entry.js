// web/dashboard-card.html 입구 — 참가자 대시보드의 지금 카드(봉인 student-view.js progressSection)와
// 새 렌더러(dashboard-card.js)를 같은 합성 줄로 나란히 그린다. 비교 전용. 서버 없음.

import { el } from '../../ui/dom.js';
import { progressSection } from '../student-view.js';
import { dashboardConditionCard } from './dashboard-card.js';

const SOURCE = Object.freeze({
  'activity-complete': 'MOODLE_ACTIVITY_COMPLETION',
  'assignment-submitted': 'MOODLE_ASSIGNMENT_SUBMISSION',
  'reflection-topics': 'MOODLE_REFLECTION_AI',
  'python-basic-certificate': 'RECLAIM_HACKERRANK',
});

// 네 줄을 서로 다른 서버 상태로 — 충족 / 확인된 미충족(이유 있음) / 근거 없음 / 아직 모름.
// 값은 전부 합성이다. 대시보드가 주는 필드만 쓴다.
const row = (criterionId, state, extra = {}) => ({
  criterionId,
  state,
  current: state === 'MET',
  evidenceId: state === 'MET' ? `evidence-${criterionId}` : null,
  evidenceRevision: state === 'MET' ? 3 : null,
  reasonCode: null,
  expiresAt: null,
  source: { kind: SOURCE[criterionId], hostMode: 'SYNTHETIC_TEST_SOURCE', actualSourceVerification: null },
  originalEvidence: null,
  ...extra,
});

const CRITERIA_ROWS = [
  row('activity-complete', 'MET'),
  row('assignment-submitted', 'NOT_MET', { reasonCode: 'TARGET_COUNT_NOT_REACHED' }),
  row('reflection-topics', 'MISSING', { reasonCode: 'EVIDENCE_MISSING' }),
  row('python-basic-certificate', 'UNKNOWN'),
];

const view = {
  criteria: CRITERIA_ROWS,
  decision: { conditionsStatus: 'NOT_MET', evidenceCurrent: true, revision: 3 },
  observedAt: new Date().toISOString(),
  payment: null,
};

const onOpen = (id) => { console.log('open', id); };

const root = document.querySelector('#dc-root');
const page = el('div.crc-preview', {}, []);
root.append(page);
page.append(
  el('header.crc-preview-top', {}, [
    el('h1', { text: '대시보드 조건 카드 — 지금 / 새 렌더러' }),
    el('p.crc-muted', { text: '같은 합성 판정 네 줄(충족 · 미충족 · 근거 없음 · 확인 전)을 두 방식으로 그립니다. 봉인 파일은 그대로이고, 실제 대시보드는 오규원이 한 줄을 바꾼 뒤 아래 모양이 됩니다.' }),
  ]),
  el('h2.sec-title', { text: '① 지금 — 봉인 student-view.js 의 카드' }),
  progressSection(view, { onOpen }),
  el('h2.sec-title', { text: '② 새 렌더러 — dashboard-card.js' }),
  el('section.cc-section', {}, [
    el('ul.cc-grid.crc-grid', {}, CRITERIA_ROWS.map((r) => dashboardConditionCard(r, { onOpen }))),
  ]),
);
