// 참가자 진입 화면 — 연결 상태만 말하고, 끝난 것처럼 말하지 않는다
//
// 여기서 막으려는 것 넷.
//
//   1  Moodle 에서 왔다는 이유로 **CLEAR 로그인·수령인 등록이 끝난 것처럼** 보이는 것
//   2  주소의 강좌/학생 번호가 **연결 판단에 끼는** 것 — 표시만 해야 한다
//   3  실제 모드가 합성 시나리오로 떨어지는 것
//   4  세션 만료·잘못된 강좌에서 **기존 화면으로 가는 길이 열려 있는** 것

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createAdapter, STATE, DATA_MODE } from '../src/bootcamp/finals-panels/adapter.js';
import {
  participantEntryPanel, entryGuide, canProceed,
} from '../src/bootcamp/finals-panels/participant-entry.js';
import { ENTRY_SCENARIOS, entryFixture } from '../src/bootcamp/finals-panels/entry-fixtures.js';

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

const mount = (id, mode = DATA_MODE.SYNTHETIC) => {
  const a = createAdapter({ mode, fixture: entryFixture, run: null });
  const panel = participantEntryPanel({
    adapter: a, scenario: id, scenarios: ENTRY_SCENARIOS.map(({ id: i, label }) => ({ id: i, label })),
  });
  return { a, panel };
};

const SCENARIO_IDS = ['linked', 'pending', 'failed', 'wrong-course', 'expired', 'no-application'];

// ── 1 · 시나리오와 안내 ─────────────────────────────────────────────────

test('시나리오 여섯 개가 다 있고, 기존 화면으로 가도 되는 것은 정상 연결 하나뿐이다', () => {
  assert.deepEqual(ENTRY_SCENARIOS.map((s) => s.id), SCENARIO_IDS);
  for (const id of SCENARIO_IDS) {
    const d = entryFixture(id);
    assert.ok(d, id + ' fixture 가 없다');
    assert.equal(d.kind, 'clear-participant-entry-view.1', '서버 DTO 처럼 보이는 이름이면 안 된다');
    assert.ok(entryGuide(d), id + ' 안내가 없다');
    assert.equal(canProceed(d), id === 'linked', id + ' 의 진행 가능 여부가 틀렸다');
  }
  assert.equal(entryFixture('없는-시나리오'), null, '모르는 시나리오를 지어냈다');
});

test('안내는 막고 있는 것 하나만 말하고, 만료는 다시 확인을 권하지 않는다', () => {
  assert.equal(entryGuide(entryFixture('expired')).retry, false, '만료인데 다시 확인을 권했다');
  assert.ok(entryGuide(entryFixture('expired')).text.includes('「환급 확인」을 다시'));
  assert.equal(entryGuide(entryFixture('pending')).tone, 'wait');
  assert.ok(entryGuide(entryFixture('wrong-course')).title.includes('연결돼 있지 않습니다'));
  assert.ok(entryGuide(entryFixture('failed')).text.includes('다시 로그인'));
  assert.ok(entryGuide(entryFixture('no-application')).title.includes('신청이 없습니다'));
  assert.equal(entryGuide(null), null);
});

// ── 2 · 주소 번호는 판단에 끼지 않는다 ───────────────────────────────────

test('주소의 강좌/학생 번호를 바꿔도 연결 판단은 서버 결과만 따른다', () => {
  const linked = entryFixture('linked');
  const spoofed = { ...linked, origin: { ...linked.origin, displayedCourseId: '9999', displayedUserId: '1' } };
  assert.equal(canProceed(spoofed), true, '표시 번호가 판단을 바꿨다');

  const sameIdsNotLinked = {
    ...linked,
    links: { ...linked.links, self: { status: 'NOT_LINKED', note: null } },
  };
  assert.equal(canProceed(sameIdsNotLinked), false, '번호가 같다고 연결된 것으로 봤다');
  assert.equal(entryGuide(sameIdsNotLinked).retry, true);
});

// ── 3 · 화면 ────────────────────────────────────────────────────────────

test('정상 연결 화면은 기존 화면 링크를 열고, 다음이 수령인 등록이라고 적는다', async () => {
  const restore = installDom();
  try {
    const { a, panel } = mount('linked');
    await a.request('linked');
    const text = panel.node.textContent;
    assert.ok(text.includes('연결이 확인됐습니다'));
    assert.ok(text.includes('합성 시나리오'), '합성 표시가 없다');
    const link = [...walk(panel.node)].find((n) => n.tagName === 'A');
    assert.ok(link, '기존 화면 링크가 없다');
    assert.equal(link.attributes.href, './index.html');
    assert.ok(link.textContent.includes('수령인 등록으로'));
    assert.ok(text.includes('다음은 수령인 등록입니다'));
    assert.ok(text.includes('주소의 번호는 표시용'), '번호가 인증 근거가 아니라는 말이 없다');
  } finally { restore(); }
});

test('로그인 뒤 화면이라 로그인·지갑만 완료이고, 수령인 등록·동의·지급은 어느 시나리오에서도 완료가 아니다', async () => {
  const restore = installDom();
  try {
    for (const id of SCENARIO_IDS) {
      const { a, panel } = mount(id);
      await a.request(id);
      const states = [...walk(panel.node)]
        .filter((n) => n.className === 'fp-step-state').map((n) => n.textContent);
      assert.equal(states.length, 6, id + ': 단계 여섯이 다 있어야 한다');
      assert.equal(states[0], '완료', id + ': 로그인 뒤 화면인데 로그인이 완료가 아니다');
      assert.equal(states[2], '아직', id + ': 수령인 등록은 본인 서명이라 아직이어야 한다');
      assert.ok(!states.slice(2).includes('완료'), id + ': 끝난 것처럼 적은 단계가 있다 — ' + states.join(', '));
      assert.ok(panel.node.textContent.includes('수령인 등록이 끝난 것으로 표시하지 않습니다'));
    }
  } finally { restore(); }
});

test('만료·잘못된 강좌·실패에서는 기존 화면으로 가는 링크가 없다', async () => {
  const restore = installDom();
  try {
    for (const id of ['expired', 'wrong-course', 'failed', 'pending', 'no-application']) {
      const { a, panel } = mount(id);
      await a.request(id);
      const link = [...walk(panel.node)].find((n) => n.tagName === 'A');
      assert.equal(link, undefined, id + ': 링크가 열려 있다');
      const blocked = [...walk(panel.node)].find((n) => n.attributes['aria-disabled'] === 'true');
      assert.ok(blocked, id + ': 막힌 버튼이 없다');
      const retry = [...walk(panel.node)].find((n) => n.tagName === 'BUTTON' && n.textContent.includes('다시 확인'));
      assert.equal(Boolean(retry), id !== 'expired', id + ': 다시 확인 버튼 유무가 틀렸다');
    }
  } finally { restore(); }
});

test('시나리오를 바꾸면 이전 결과는 stale 을 거쳐 새 결과로 바뀐다', async () => {
  const restore = installDom();
  try {
    const { a, panel } = mount('linked');
    await a.request('linked');
    assert.ok(panel.node.textContent.includes('연결이 확인됐습니다'));
    const chip = [...walk(panel.node)].find((n) => n.tagName === 'BUTTON' && n.textContent.includes('세션 만료'));
    for (const fn of chip.handlers.click ?? []) fn({});
    await settle();
    assert.equal(panel.picked, 'expired');
    assert.equal(a.current.state, STATE.SUCCESS);
    assert.ok(panel.node.textContent.includes('세션이 만료됐습니다'));
    assert.ok(!panel.node.textContent.includes('연결이 확인됐습니다'), '이전 결과가 남아 있다');
  } finally { restore(); }
});

// ── 4 · 실제 모드는 합성으로 떨어지지 않는다 ─────────────────────────────

test('실제 모드에 연결 경로가 없으면 미연결로 남고 합성 강좌가 보이지 않는다', async () => {
  const restore = installDom();
  try {
    const { a, panel } = mount('linked', DATA_MODE.ACTUAL);
    assert.ok(panel.node.textContent.includes('실제 — 미연결'));
    await a.request('linked');
    const text = panel.node.textContent;
    assert.equal(a.current.state, STATE.ERROR);
    assert.ok(text.includes('실제 연결 확인 경로가 아직 없습니다'));
    assert.ok(!text.includes('파이썬 입문'), '실제 모드에 합성 강좌가 보인다');
    assert.ok(!text.includes('연결이 확인됐습니다'), '실제 모드에 합성 안내가 보인다');
  } finally { restore(); }
});

test('실제 모드에서 늦게 온 응답은 최신 시나리오 결과를 덮지 않는다', async () => {
  const restore = installDom();
  try {
    let release;
    const slow = new Promise((r) => { release = r; });
    const a = createAdapter({
      mode: DATA_MODE.ACTUAL,
      run: async (id) => (id === 'first' ? slow : entryFixture('expired')),
    });
    const panel = participantEntryPanel({ adapter: a });
    const p1 = a.request('first');
    await a.request('second');
    release(entryFixture('linked'));
    await p1;
    assert.equal(a.current.state, STATE.SUCCESS);
    assert.ok(panel.node.textContent.includes('세션이 만료됐습니다'), '늦은 응답이 최신 결과를 덮었다');
    assert.ok(!panel.node.textContent.includes('연결이 확인됐습니다'));
  } finally { restore(); }
});
