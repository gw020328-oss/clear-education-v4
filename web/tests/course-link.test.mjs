// 운영자 강좌 연결 화면 — 서버가 준 항목만, 저장은 설정일 뿐
//
// 여기서 막으려는 것 다섯.
//
//   1  **프론트가 만든 항목이 Moodle 목록처럼** 보이는 것 — 선택지는 서버 목록의 부분집합
//   2  목록이 바뀌어 사라진 항목이 **저장된 것처럼 조용히 남는** 것
//   3  저장 중 **두 번 눌러 두 번 저장**되는 것, 저장 결과가 정책 확정처럼 읽히는 것
//   4  실제 모드가 합성 목록으로 떨어지는 것
//   5  B 가 찾지 않은 조건의 칸이 뜨는 것 — 칸은 조건 목록을 따라간다

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createAdapter, STATE, DATA_MODE } from '../src/bootcamp/finals-panels/adapter.js';
import {
  courseLinkPanel, SLOTS, slotsFor, missingSlots, draftFrom,
} from '../src/bootcamp/finals-panels/course-link.js';
import { LINK_SCENARIOS, linkFixture, saveFixture } from '../src/bootcamp/finals-panels/course-link-fixtures.js';

// ── 최소 DOM ────────────────────────────────────────────────────────────

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

    addEventListener(t, f) { (this.handlers[t] ??= []).push(f); }

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

const settle = async () => { for (let i = 0; i < 20; i += 1) await new Promise((r) => setTimeout(r, 0)); };

const mount = async (id, {
  mode = DATA_MODE.SYNTHETIC, saveRun = null, loadRun = null, conditions = null,
} = {}) => {
  const load = createAdapter({ mode, fixture: linkFixture, run: loadRun });
  const save = createAdapter({ mode, fixture: saveFixture, run: saveRun });
  const panel = courseLinkPanel({
    load, save, scenario: id, conditions,
    scenarios: LINK_SCENARIOS.map(({ id: i, label }) => ({ id: i, label })),
  });
  await load.request(id);
  return { load, save, panel };
};

const selects = (node) => [...walk(node)].filter((n) => n.tagName === 'SELECT');
const checks = (node) => [...walk(node)].filter((n) => n.tagName === 'INPUT' && n.attributes.type === 'checkbox');
const saveButton = (node) => [...walk(node)].find((n) => n.tagName === 'BUTTON' && n.attributes['data-role'] === 'save');
const click = (btn) => { for (const fn of btn.handlers.click ?? []) fn({}); };
const changeSelect = (sel, value) => { for (const fn of sel.handlers.change ?? []) fn({ target: { value } }); };
const tick = (cb, checked) => { for (const fn of cb.handlers.change ?? []) fn({ target: { checked } }); };
const DISABLED = 'disabled';

const IDS = ['saved', 'unset', 'stale-list', 'empty', 'not-connected', 'save-fails'];
const FULL = { activity: [2101, 2102], assignment: 2105, reflection: 2107 };

// ── 1 · 선택지는 서버 목록의 부분집합 ───────────────────────────────────

test('시나리오 여섯이 있고 fixture 는 서버 DTO 처럼 보이는 이름이 아니다', () => {
  assert.deepEqual(LINK_SCENARIOS.map((s) => s.id), IDS);
  for (const id of IDS) assert.equal(linkFixture(id).kind, 'clear-operator-course-link-view.1');
  assert.equal(linkFixture('없음'), null);
});

test('수강 활동은 체크박스 여러 개, 과제·회고는 선택 상자 하나 — 전부 서버 목록의 맞는 종류만', async () => {
  const restore = installDom();
  try {
    const { panel } = await mount('saved');
    const d = linkFixture('saved');
    const have = new Map(d.items.map((i) => [String(i.cmId), i.module]));

    const boxes = checks(panel.node);
    assert.equal(boxes.length, 2, '강의 페이지 둘이 체크박스로 떠야 한다');
    for (const b of boxes) {
      assert.ok(have.has(b.value), `서버 목록에 없는 항목 ${b.value}`);
      assert.ok(SLOTS[0].modules.includes(have.get(b.value)), '활동 칸에 다른 종류가 섞였다');
    }
    const sels = selects(panel.node);
    assert.equal(sels.length, 2, '과제·회고 두 칸이 선택 상자여야 한다');
    sels.forEach((sel, i) => {
      const slot = SLOTS[i + 1];
      const opts = sel.children.filter((o) => o.tagName === 'OPTION' && o.value !== '');
      assert.ok(opts.length > 0, slot.key + ' 칸에 후보가 없다');
      for (const o of opts) {
        assert.ok(have.has(o.value), `서버 목록에 없는 항목 ${o.value}`);
        assert.ok(slot.modules.includes(have.get(o.value)), `${slot.key} 칸에 다른 종류가 섞였다`);
      }
    });
    // 퀴즈는 어느 칸에도 없다
    assert.ok(!panel.node.textContent.includes('퀴즈'), '퀴즈가 어딘가 칸에 떴다');
  } finally { restore(); }
});

// ── 2 · 저장된 설정과 바뀐 목록 ─────────────────────────────────────────

test('저장된 설정이 있으면 초안이 그걸로 채워지고 저장 버튼은 잠긴다', async () => {
  const restore = installDom();
  try {
    const { panel } = await mount('saved');
    assert.deepEqual(panel.draft, FULL);
    assert.equal(saveButton(panel.node).attributes.disabled, DISABLED, '바뀐 것이 없는데 저장이 열려 있다');
    const text = panel.node.textContent;
    assert.ok(text.includes('저장된 설정과 같습니다'));
    assert.ok(text.includes('저장된 설정 map-3'));
    assert.ok(text.includes('고른 2개를 모두 완료해야 합니다'), '여러 활동의 뜻(모두 완료)을 안 적었다');
    assert.ok(text.includes('실제 연결은 먼저 활동 하나로'), '실제 연결은 활동 하나부터라는 본부 결정을 숨겼다');
  } finally { restore(); }
});

test('목록에서 사라진 항목은 초안에서 비우고 경고한다 — 조용히 남기지 않는다', async () => {
  const restore = installDom();
  try {
    const d = linkFixture('stale-list');
    assert.deepEqual(missingSlots(d), ['assignment']);
    assert.deepEqual(draftFrom(d), { activity: [2101, 2102], assignment: null, reflection: 2107 });
    const { panel } = await mount('stale-list');
    const text = panel.node.textContent;
    assert.ok(text.includes('과제 항목이 지금 목록에 없습니다'), '사라진 항목 경고가 없다');
    assert.equal(saveButton(panel.node).attributes.disabled, DISABLED, '한 칸이 비었는데 저장이 열려 있다');
    assert.ok(text.includes('3칸을 모두 골라야'));
  } finally { restore(); }
});

test('항목이 없거나 플러그인이 안 붙었으면 고를 칸을 열지 않는다', async () => {
  const restore = installDom();
  try {
    const empty = await mount('empty');
    assert.ok(empty.panel.node.textContent.includes('이 강좌에 항목이 없습니다'));
    assert.equal(checks(empty.panel.node).length, 0);
    for (const sel of selects(empty.panel.node)) assert.equal(sel.attributes.disabled, DISABLED);
    assert.equal(saveButton(empty.panel.node).attributes.disabled, DISABLED);

    const nc = await mount('not-connected');
    assert.equal(selects(nc.panel.node).length + checks(nc.panel.node).length, 0, '연결 안 됐는데 칸이 열렸다');
    assert.equal(saveButton(nc.panel.node), undefined, '연결 안 됐는데 저장 버튼이 있다');
    assert.ok(nc.panel.node.textContent.includes('연결된 강좌가 없습니다'));
    assert.ok(nc.panel.node.textContent.includes('연결 안 됨'));
  } finally { restore(); }
});

// ── 3 · 저장 ────────────────────────────────────────────────────────────

test('칸을 다 고르면 저장이 열리고, 저장 결과는 설정일 뿐 정책 확정이 아니라고 적는다', async () => {
  const restore = installDom();
  try {
    const { save, panel } = await mount('unset');
    assert.equal(saveButton(panel.node).attributes.disabled, DISABLED);
    tick(checks(panel.node)[0], true);
    tick(checks(panel.node)[1], true);
    const [b, c] = selects(panel.node);
    changeSelect(b, '2105'); changeSelect(c, '2107');
    assert.deepEqual(panel.draft, FULL);
    assert.ok(panel.node.textContent.includes('저장 전'), '바뀐 칸 표시가 없다');
    const btn = saveButton(panel.node);
    assert.equal(btn.attributes.disabled, undefined, '다 골랐는데 저장이 잠겨 있다');
    click(btn);
    await settle();
    assert.equal(save.current.state, STATE.SUCCESS);
    assert.deepEqual(save.current.input.mapping, FULL);
    assert.deepEqual(save.current.input.conditions, SLOTS.map((s) => s.capability));
    assert.equal(save.current.input.basedOnItemsRevision, 'items-7', '어떤 목록 기준으로 저장했는지 안 보냈다');
    const text = panel.node.textContent;
    assert.ok(text.includes('저장됐습니다 · 설정 map-4'));
    assert.ok(text.includes('지급 정책 확정이나 환급 승인이 아니'), '저장이 정책 확정처럼 읽힌다');
    assert.ok(!/환급 승인됨|정책 확정됨/.test(text));
    assert.equal(saveButton(panel.node).attributes.disabled, DISABLED, '저장 뒤에는 다시 잠겨야 한다');
  } finally { restore(); }
});

test('저장이 실패하면 이유를 적고 고른 것은 그대로 둔다', async () => {
  const restore = installDom();
  try {
    const { save, panel } = await mount('save-fails');
    tick(checks(panel.node)[0], true);
    const [b, c] = selects(panel.node);
    changeSelect(b, '2106'); changeSelect(c, '2107');
    click(saveButton(panel.node));
    await settle();
    assert.equal(save.current.state, STATE.ERROR);
    assert.ok(panel.node.textContent.includes('저장 실패 · 서버가 저장을 거부했습니다'));
    assert.deepEqual(panel.draft, { activity: [2101], assignment: 2106, reflection: 2107 }, '실패했는데 초안이 날아갔다');
    assert.equal(saveButton(panel.node).attributes.disabled, undefined, '다시 저장할 수 있어야 한다');
  } finally { restore(); }
});

test('저장 중에는 두 번 눌러도 한 번만 보내고, 칸도 잠긴다', async () => {
  const restore = installDom();
  try {
    let calls = 0; let release;
    const slow = new Promise((r) => { release = r; });
    const { panel } = await mount('unset', {
      mode: DATA_MODE.ACTUAL,
      loadRun: async (id) => linkFixture(id),
      saveRun: async () => { calls += 1; return slow; },
    });
    tick(checks(panel.node)[0], true);
    const [b, c] = selects(panel.node);
    changeSelect(b, '2105'); changeSelect(c, '2107');
    click(saveButton(panel.node));
    await settle();
    assert.ok(panel.node.textContent.includes('저장 중…'));
    for (const n of [...selects(panel.node), ...checks(panel.node)]) assert.equal(n.attributes.disabled, DISABLED, '저장 중인데 칸이 열려 있다');
    click(saveButton(panel.node));
    await settle();
    assert.equal(calls, 1, '저장 중에 두 번 보냈다');
    release(saveFixture({ scenario: 'unset', mapping: panel.draft, basedOnItemsRevision: 'items-7' }));
    await settle();
    assert.ok(panel.node.textContent.includes('저장됐습니다'));
  } finally { restore(); }
});

// ── 4 · 실제 모드 ───────────────────────────────────────────────────────

test('실제 모드에 연결 경로가 없으면 합성 강좌·항목이 하나도 보이지 않는다', async () => {
  const restore = installDom();
  try {
    const load = createAdapter({ mode: DATA_MODE.ACTUAL, fixture: linkFixture, run: null });
    const save = createAdapter({ mode: DATA_MODE.ACTUAL, fixture: saveFixture, run: null });
    const panel = courseLinkPanel({ load, save, scenario: 'saved' });
    assert.ok(panel.node.textContent.includes('실제 — 미연결'));
    await load.request('saved');
    const text = panel.node.textContent;
    assert.ok(text.includes('실제 강좌 연결 경로가 아직 없습니다'));
    assert.ok(!text.includes('파이썬 입문'), '합성 강좌가 보인다');
    assert.ok(!text.includes('회고 게시판'), '합성 항목이 보인다');
    assert.equal(selects(panel.node).length + checks(panel.node).length, 0);
  } finally { restore(); }
});

test('시나리오를 바꾸면 이전 저장 결과와 초안이 넘어오지 않는다', async () => {
  const restore = installDom();
  try {
    const { save, panel } = await mount('unset');
    tick(checks(panel.node)[0], true);
    const [b, c] = selects(panel.node);
    changeSelect(b, '2105'); changeSelect(c, '2107');
    click(saveButton(panel.node));
    await settle();
    assert.ok(panel.node.textContent.includes('저장됐습니다'));
    const chip = [...walk(panel.node)].find((n) => n.tagName === 'BUTTON' && n.textContent.includes('저장된 설정 있음'));
    click(chip);
    await settle();
    assert.equal(panel.picked, 'saved');
    assert.equal(save.current.state, STATE.IDLE, '이전 저장 결과가 남아 있다');
    assert.deepEqual(panel.draft, FULL);
    assert.ok(!panel.node.textContent.includes('저장됐습니다 · 설정 map-4'));
  } finally { restore(); }
});

// ── 5 · 칸은 B 가 찾은 조건을 따라간다 ───────────────────────────────────

test('B 가 찾은 조건만큼만 칸이 뜨고, HackerRank 는 Moodle 칸이 없다', async () => {
  assert.deepEqual(slotsFor(null).map((s) => s.key), ['activity', 'assignment', 'reflection']);
  assert.deepEqual(slotsFor(['MOODLE_ACTIVITY_COMPLETION.1', 'MOODLE_ASSIGNMENT_SUBMISSION.1']).map((s) => s.key), ['activity', 'assignment']);
  assert.deepEqual(slotsFor(['HACKERRANK_CERTIFICATE_HOLDING.1']), []);

  const restore = installDom();
  try {
    const two = ['MOODLE_ACTIVITY_COMPLETION.1', 'MOODLE_ASSIGNMENT_SUBMISSION.1'];
    const { save, panel } = await mount('unset', { conditions: two });
    assert.deepEqual(panel.activeSlots, ['activity', 'assignment']);
    assert.equal(selects(panel.node).length, 1, '회고 칸이 떠 있다');
    assert.ok(panel.node.textContent.includes('조건 2개'));
    tick(checks(panel.node)[1], true);
    changeSelect(selects(panel.node)[0], '2105');
    assert.equal(saveButton(panel.node).attributes.disabled, undefined, '두 칸 다 골랐는데 잠겨 있다');
    click(saveButton(panel.node));
    await settle();
    assert.deepEqual(save.current.input.mapping, { activity: [2102], assignment: 2105 }, '안 뜬 칸이 저장에 섞였다');
    assert.deepEqual(save.current.input.conditions, two);

    // B 가 결과를 바꾸면 칸이 따라 바뀐다. 고른 것은 남는다
    panel.setConditions(['MOODLE_ACTIVITY_COMPLETION.1', 'MOODLE_ASSIGNMENT_SUBMISSION.1', 'REFLECTION_REQUIRED_TOPICS.1', 'HACKERRANK_CERTIFICATE_HOLDING.1']);
    assert.deepEqual(panel.activeSlots, ['activity', 'assignment', 'reflection']);
    assert.ok(panel.node.textContent.includes('조건 3개'));
    assert.ok(panel.node.textContent.includes('Moodle 에서 읽지 않는 조건'), 'HackerRank 가 빠진 이유를 안 적었다');
    assert.deepEqual(panel.draft.activity, [2102]);

    panel.setConditions(['HACKERRANK_CERTIFICATE_HOLDING.1']);
    assert.ok(panel.node.textContent.includes('Moodle 에서 읽을 항목이 없습니다'));
    assert.equal(saveButton(panel.node).attributes.disabled, DISABLED);
  } finally { restore(); }
});
