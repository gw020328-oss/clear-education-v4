// 참가자 대시보드용 조건 카드 렌더러 — 봉인 student-view.js 의 conditionCard 자리에
// 한 줄로 끼울 dashboardConditionCard(row, { onOpen, onToggle }) (마운트 문서 §2 ②).
//
//   · 서버 판정(view.criteria 한 줄)만으로 그린다. 복귀 상태·이동 주소·근거 본문은 없으므로 안 그린다
//   · 순서: 해야 할 일 → 충족 여부(큰 한 단어) → 이유·출처 → 버튼
//   · 대시보드 문구는 합니다체

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dashboardConditionCard, dashboardVerdict, DASHBOARD_TASK } from '../src/bootcamp/condition-return/dashboard-card.js';
import { displayState } from '../src/bootcamp/criteria.js';
import { bootcampView } from '../src/fixtures/bootcamp.js';

// ── 최소 DOM (condition-return.test.mjs 와 같다) ─────────────────────────

function installDom() {
  class Node {
    constructor(tag) {
      this.tagName = String(tag).toUpperCase();
      this.children = []; this.attributes = {}; this.className = ''; this.handlers = {}; this._text = '';
    }

    get firstChild() { return this.children[0] ?? null; }

    set textContent(v) { this._text = String(v); this.children = []; }

    get textContent() { return this._text + this.children.map((c) => c.textContent ?? '').join(' '); }

    setAttribute(n, v) { this.attributes[n] = String(v); }

    getAttribute(n) { return this.attributes[n] ?? null; }

    addEventListener(t, f) { (this.handlers[t] ??= []).push(f); }

    click() { for (const f of this.handlers.click ?? []) f({ target: this }); }

    closest(sel) { return sel === 'button' && this.tagName === 'BUTTON' ? this : null; }

    append(...n) { this.children.push(...n); }

    removeChild(n) { this.children = this.children.filter((c) => c !== n); }
  }
  globalThis.document = {
    createElement: (t) => new Node(t),
    createElementNS: (_n, t) => new Node(t),
    createTextNode: (t) => ({ textContent: String(t), children: [] }),
  };
  return () => { delete globalThis.document; };
}

function* walk(node) { yield node; for (const c of node.children ?? []) yield* walk(c); }
const find = (root, fn) => [...walk(root)].filter((n) => n.tagName && fn(n));
const cls = (n, c) => (n.className ?? '').split(' ').includes(c);
const text = (n) => n.textContent.replace(/\s+/g, ' ').trim();
const verdictOf = (node) => text(find(node, (n) => cls(n, 'crc-verdict'))[0]);
const whyOf = (node) => text(find(node, (n) => cls(n, 'crc-why'))[0] ?? { textContent: '' });
const buttons = (node) => find(node, (n) => n.tagName === 'BUTTON');

const row = (criterionId, state, extra = {}) => ({
  criterionId, state, current: true,
  evidenceId: state === 'MET' || state === 'NOT_MET' ? `evidence-${criterionId}-1` : null,
  evidenceRevision: state === 'MET' || state === 'NOT_MET' ? 1 : null,
  reasonCode: null, expiresAt: null,
  source: { kind: 'MOODLE_ACTIVITY_COMPLETION', hostMode: 'SYNTHETIC_TEST_SOURCE', actualSourceVerification: null },
  originalEvidence: null,
  ...extra,
});

const render = (r, opts = {}) => {
  const restore = installDom();
  try { return dashboardConditionCard(r, { onOpen: () => {}, ...opts }); } finally { restore(); }
};

// ── 충족 여부 한 단어 — 서버 판정 그대로 ─────────────────────────────────

test('충족한 줄은 "충족" 을 크게 쓰고, 할 일 기준 이유와 출처·근거 확보를 적는다', () => {
  const node = render(row('activity-complete', 'MET'));
  assert.equal(node.attributes['data-state'], 'met');
  assert.equal(node.attributes['data-verdict'], 'MET');
  assert.equal(verdictOf(node), '충족');
  assert.equal(whyOf(node), DASHBOARD_TASK['activity-complete'].met);
  assert.match(text(node), /확인 출처 · Moodle · 근거 확보/);
});

test('확인된 미충족은 "미충족" 과 서버 reasonCode 의 번역을 이유로 쓴다', () => {
  const node = render(row('assignment-submitted', 'NOT_MET', { reasonCode: 'TARGET_COUNT_NOT_REACHED' }));
  assert.equal(node.attributes['data-state'], 'open');
  assert.equal(verdictOf(node), '미충족');
  assert.equal(whyOf(node), '필요한 횟수에 못 미칩니다.');
});

test('이유 코드가 없는 미충족은 할 일 기준 문장으로 이유를 채운다 — 비워 두지 않는다', () => {
  const node = render(row('assignment-submitted', 'NOT_MET'));
  assert.equal(whyOf(node), DASHBOARD_TASK['assignment-submitted'].unmet);
});

test('근거 없음(MISSING)은 "확인 필요", 아직 모름(UNKNOWN)은 "확인 전" — 미충족과 섞지 않는다', () => {
  const missing = render(row('reflection-topics', 'MISSING', { reasonCode: 'EVIDENCE_MISSING' }));
  assert.equal(verdictOf(missing), '확인 필요');
  assert.match(whyOf(missing), /필요한 근거가 없습니다/);
  assert.match(text(missing), /근거 없음/);

  const unknown = render(row('python-basic-certificate', 'UNKNOWN', { source: { kind: 'RECLAIM_HACKERRANK', hostMode: null, actualSourceVerification: null } }));
  assert.equal(verdictOf(unknown), '확인 전');
  assert.match(whyOf(unknown), /아직 확인하지 못했습니다/);
  assert.match(text(unknown), /Reclaim 공증/);
});

test('예전엔 충족했지만 현재성이 없으면(current=false) "확인 필요" 이고 지금 충족으로 다루지 않는다', () => {
  const node = render(row('activity-complete', 'MET', { current: false }));
  assert.equal(node.attributes['data-state'], 'open');
  assert.equal(verdictOf(node), '확인 필요');
  assert.match(whyOf(node), /예전에 충족했지만 지금 다시 확인해야 합니다/);
  assert.match(text(node), /예전 충족 기록은 지금 충족으로 다루지 않습니다/);
});

test('계약에 없는 상태 값은 "지원 안 됨" 으로 막고 성공으로 바꾸지 않는다', () => {
  const node = render(row('activity-complete', 'WEIRD'));
  assert.equal(verdictOf(node), '지원 안 됨');
  assert.equal(node.attributes['data-state'], 'open');
  assert.equal(dashboardVerdict(displayState(row('activity-complete', 'WEIRD'))).tone, 'warn');
});

// ── 버튼 — 대시보드에는 이동 주소가 없다 ─────────────────────────────────

test('버튼은 「자세히」 하나이고 onOpen(criterionId) 를 부른다. 인증서 미충족만 「인증하기」', () => {
  const opened = [];
  const restore = installDom();
  try {
    const a = dashboardConditionCard(row('activity-complete', 'MET'), { onOpen: (id) => opened.push(id) });
    const go = find(a, (n) => cls(n, 'crc-go'))[0];
    assert.equal(go.tagName, 'BUTTON');
    assert.equal(text(go), '자세히');
    go.click();
    assert.deepEqual(opened, ['activity-complete']);
    // 떠나기 버튼(강의 보기 등)·「다시 확인」 은 그리지 않는다 — 대시보드에 주소·복귀 추적이 없다
    assert.equal(buttons(a).length, 1);
    assert.doesNotMatch(text(a), /강의 보기|다시 확인|확인 중/);

    const cert = dashboardConditionCard(row('python-basic-certificate', 'UNKNOWN'), { onOpen: () => {} });
    assert.equal(text(find(cert, (n) => cls(n, 'crc-go'))[0]), '인증하기');
    const certMet = dashboardConditionCard(row('python-basic-certificate', 'MET'), { onOpen: () => {} });
    assert.equal(text(find(certMet, (n) => cls(n, 'crc-go'))[0]), '자세히');
  } finally { restore(); }
});

test('onToggle 이 있으면(라이브 조작판) 토글 버튼을 두고 카드 어디를 눌러도 바뀐다. 없으면 토글이 없다', () => {
  const toggled = [];
  const restore = installDom();
  try {
    const live = dashboardConditionCard(row('activity-complete', 'MET'), { onOpen: () => {}, onToggle: (id) => toggled.push(id) });
    assert.equal(live.attributes['data-live'], 'yes');
    const toggle = find(live, (n) => cls(n, 'cc-toggle'))[0];
    assert.equal(text(toggle), '충족 해제');
    live.click();   // 카드 자체
    toggle.click(); // 토글 버튼
    assert.deepEqual(toggled, ['activity-complete', 'activity-complete']);

    const plain = dashboardConditionCard(row('activity-complete', 'MET'), { onOpen: () => {} });
    assert.equal(plain.attributes['data-live'], undefined);
    assert.equal(find(plain, (n) => cls(n, 'cc-toggle')).length, 0);
  } finally { restore(); }
});

// ── 순서와 문체 ──────────────────────────────────────────────────────────

test('카드 순서는 해야 할 일 → 충족 여부 → 이유·출처 → 버튼이다', () => {
  const node = render(row('assignment-submitted', 'NOT_MET', { reasonCode: 'TARGET_COUNT_NOT_REACHED' }));
  const at = (c) => node.children.findIndex((n) => cls(n, c));
  assert.ok(at('bcx-task-name') < at('crc-todo'), '제목 다음 할 일');
  assert.ok(at('crc-todo') < at('crc-verdict'), '할 일 다음 충족 칸');
  assert.ok(at('crc-verdict') < at('crc-why'), '충족 칸 다음 이유');
  assert.ok(at('crc-why') < at('crc-source'), '이유 다음 출처');
  assert.ok(at('crc-source') < at('crc-actions'), '출처 다음 버튼');
});

test('대시보드 카드 문구는 합니다체다 — 해요체 서술문이 없다 (verify-screens 규칙)', () => {
  const states = [['activity-complete', 'MET'], ['assignment-submitted', 'NOT_MET'], ['reflection-topics', 'MISSING'],
    ['python-basic-certificate', 'UNKNOWN'], ['activity-complete', 'MET', { current: false }]];
  for (const [id, state, extra] of states) {
    const t = text(render(row(id, state, extra ?? {})));
    assert.doesNotMatch(t, /(어요|예요|에요)/, `${id}/${state}: ${t}`);
  }
  for (const task of Object.values(DASHBOARD_TASK)) {
    for (const s of [task.todo, task.met, task.unmet]) assert.doesNotMatch(s, /(어요|예요|에요)/, s);
  }
});

// ── 실제 fixture 줄로도 그려진다 ─────────────────────────────────────────

test('bootcampView 의 criteria 네 줄을 그대로 넘겨도 카드 네 장이 그려진다 (progressSection 교체 모양)', () => {
  const restore = installDom();
  try {
    for (const caseId of ['inProgress', 'paid']) {
      const view = bootcampView(caseId, 'participant');
      const cards = view.criteria.map((r) => dashboardConditionCard(r, { onOpen: () => {} }));
      assert.equal(cards.length, 4);
      const met = cards.filter((c) => c.attributes['data-state'] === 'met').length;
      assert.equal(met, view.criteria.filter((r) => displayState(r).state === 'MET').length);
      for (const c of cards) assert.ok(verdictOf(c).length > 0, '충족 칸이 비지 않는다');
    }
  } finally { restore(); }
});
