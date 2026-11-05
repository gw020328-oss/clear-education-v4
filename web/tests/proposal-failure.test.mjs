// 제안 생성 실패 — '조건 없음' 과 구분 (PR #167 검토 1건)
//
// 제안자가 실패하면 예전에는 빈 제안으로 바꿔 "조건을 찾지 못했습니다 · 직접 지정"
// 으로 보였다. 통신 오류를 원문 탓으로 보이게 하고, 직접 지정·실행으로 이어질 수 있었다.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createAdapter, STATE, DATA_MODE } from '../src/bootcamp/finals-panels/adapter.js';
import { aiComparePanel } from '../src/bootcamp/finals-panels/ai-compare.js';
import { COMBOS, PRESETS } from '../src/bootcamp/finals-panels/fixtures.js';
import { OFFLINE_GEMINI_PROPOSER } from '../src/bootcamp/finals-panels/gemini-fixture.js';

function installDom() {
  class Node {
    constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.attributes = {}; this.className = ''; this.handlers = {}; this._text = ''; }
    get firstChild() { return this.children[0] ?? null; }
    set textContent(v) { this._text = String(v); this.children = []; }
    get textContent() { return this._text + this.children.map((c) => c.textContent ?? '').join(' '); }
    setAttribute(n, v) { this.attributes[n] = String(v); }
    addEventListener(t, f) { (this.handlers[t] ??= []).push(f); }
    append(...n) { this.children.push(...n); }
    removeChild(n) { this.children = this.children.filter((c) => c !== n); }
  }
  globalThis.document = {
    createElement: (t) => new Node(t), createElementNS: (_n, t) => new Node(t),
    createTextNode: (t) => ({ textContent: String(t), children: [] }),
  };
  return () => { delete globalThis.document; };
}
function* walk(node) { yield node; for (const c of node.children ?? []) yield* walk(c); }
const settle = async () => { for (let i = 0; i < 20; i += 1) await new Promise((r) => setTimeout(r, 0)); };
const byRole = (node, role) => [...walk(node)].find((n) => n.attributes?.['data-role'] === role);
const clickOn = (btn) => { for (const fn of btn.handlers.click ?? []) fn({}); };
const type = async (panel, value) => {
  const ta = [...walk(panel.node)].find((n) => n.tagName === 'TEXTAREA');
  for (const fn of ta.handlers.input ?? []) fn({ target: { value } });
  await new Promise((r) => setTimeout(r, 300)); await settle();
};

// 화면에 나오면 안 되는 것 — 원시 오류·서버 본문·비밀값
const RAW = 'TypeError: fetch failed sk-live-0123456789 {"token":"abc","stack":"at secret.js:1"}';
const rawError = () => Object.assign(new Error(RAW), { body: '{"secret":"x"}', status: 502 });

/** 호출마다 직접 끝내는 명시적 제안자. 성공 값은 오프라인 대역의 실제 변환 결과 */
function controlled({ explicit = true } = {}) {
  const calls = [];
  const proposer = {
    id: 'gemini', kind: 'model', explicit, label: 'Gemini 제안 · 시험용', idleLabel: 'Gemini 제안 · 「제안 생성」 을 눌러야 호출',
    propose: (text) => new Promise((resolve, reject) => calls.push({ text, resolve, reject })),
  };
  const succeed = async (call) => call.resolve(await OFFLINE_GEMINI_PROPOSER.propose(call.text));
  return { calls, proposer, succeed };
}
const panelWith = (proposer, source = PRESETS[0].source) => {
  const a = createAdapter({ mode: DATA_MODE.SYNTHETIC, fixture: (i) => COMBOS[i]?.payload ?? null });
  return { a, panel: aiComparePanel({ adapter: a, source, proposer, presets: PRESETS }) };
};

/** 실패 화면의 공통 조건 */
function assertFailureShown(panel, a) {
  const text = panel.node.textContent;
  const box = byRole(panel.node, 'proposal-failed');
  assert.ok(box, '실패 상자가 없다: ' + text.slice(0, 300));
  assert.ok(box.textContent.includes('제안을 생성하지 못했습니다'));
  assert.ok(byRole(panel.node, 'retry'), '다시 시도 버튼이 없다');
  assert.ok(!text.includes('조건을 찾지 못했습니다'), '실패를 조건 없음으로 보였다');
  assert.ok(!text.includes('직접 지정'), '실패 뒤 직접 지정으로 이끈다');
  assert.ok(!text.includes('자동 검증 미지원'), '실패를 미지원 조건으로 보였다');
  assert.ok(!text.includes('개 조건을 찾았습니다'), '실패인데 조건을 찾았다고 했다');
  assert.ok(!text.includes('오프라인 응답 대역 · 실제 호출 아님'), '이전 제안의 출처 배지가 남았다');
  for (const leak of ['TypeError', 'sk-live', 'token', 'stack', 'secret', '502']) assert.ok(!text.includes(leak), `원시 오류가 보인다: ${leak}`);
  assert.equal([...walk(panel.node)].filter((n) => n.tagName === 'SELECT').length, 0, '직접 지정 상자가 열렸다');
  const run = [...walk(panel.node)].find((n) => n.tagName === 'BUTTON' && n.textContent.includes('제안 생성 실패'));
  assert.ok(run, '실행 버튼이 실패를 말하지 않는다');
  assert.equal(run.attributes.disabled, 'disabled');
  clickOn(run);
  assert.equal(a.current.state, STATE.IDLE, '실패 뒤 실행으로 넘어갔다');
}

test('첫 생성 실패 — 조건 없음이 아니라 생성 실패로 보이고 다시 시도만 열린다', async () => {
  const restore = installDom();
  try {
    const c = controlled(); const { a, panel } = panelWith(c.proposer);
    clickOn(byRole(panel.node, 'generate'));
    await settle();
    assert.equal(c.calls.length, 1);
    c.calls[0].reject(rawError());
    await settle();
    assertFailureShown(panel, a);
  } finally { restore(); }
});

test('성공 후 재생성 실패 — 이전 제안을 이번 결과처럼 남기지 않는다', async () => {
  const restore = installDom();
  try {
    const c = controlled(); const { a, panel } = panelWith(c.proposer);
    clickOn(byRole(panel.node, 'generate')); await settle();
    await c.succeed(c.calls[0]); await settle();
    assert.ok(panel.node.textContent.includes('2개 조건을 찾았습니다'));
    clickOn(byRole(panel.node, 'generate')); await settle();
    // 기다리는 동안에도 이전 제안을 이번 결과처럼 보이지 않는다
    assert.ok(!panel.node.textContent.includes('2개 조건을 찾았습니다'), '재생성 중 이전 제안이 남았다');
    assert.ok(panel.node.textContent.includes('이번 제안을 만드는 중입니다'));
    c.calls[1].reject(rawError()); await settle();
    assertFailureShown(panel, a);
  } finally { restore(); }
});

test('입력 변경 후 이전 요청 실패 — 늦게 온 실패가 새 입력·최신 결과를 덮지 않는다', async () => {
  const restore = installDom();
  try {
    const c = controlled(); const { panel } = panelWith(c.proposer);
    clickOn(byRole(panel.node, 'generate')); await settle();
    await type(panel, PRESETS[1].source);
    c.calls[0].reject(rawError()); await settle();
    assert.equal(byRole(panel.node, 'proposal-failed'), undefined, '이전 원문의 실패가 새 입력에 붙었다');
    assert.ok(panel.node.textContent.includes('「제안 생성」 을 눌러야 호출'));
    // 새 원문으로 생성 → 성공. 그 뒤 더 늦은 실패가 와도 최신 결과는 그대로다.
    clickOn(byRole(panel.node, 'generate')); await settle();
    await c.succeed(c.calls[1]); await settle();
    assert.ok(panel.node.textContent.includes('3개 조건을 찾았습니다'));
    c.calls[0].reject(rawError()); await settle();
    assert.ok(panel.node.textContent.includes('3개 조건을 찾았습니다'), '늦은 실패가 최신 결과를 덮었다');
    assert.equal(byRole(panel.node, 'proposal-failed'), undefined);
  } finally { restore(); }
});

test('실패 후 재시도 성공 — 실패 표시가 걷히고 이번 결과만 보인다', async () => {
  const restore = installDom();
  try {
    const c = controlled(); const { panel } = panelWith(c.proposer);
    clickOn(byRole(panel.node, 'generate')); await settle();
    c.calls[0].reject(rawError()); await settle();
    clickOn(byRole(panel.node, 'retry')); await settle();
    assert.equal(c.calls.length, 2, '다시 시도가 요청을 보내지 않았다');
    assert.equal(c.calls[1].text, PRESETS[0].source);
    await c.succeed(c.calls[1]); await settle();
    const text = panel.node.textContent;
    assert.equal(byRole(panel.node, 'proposal-failed'), undefined);
    assert.ok(text.includes('2개 조건을 찾았습니다'));
    assert.ok(text.includes('Gemini 오프라인 응답 대역 · 실제 호출 아님'));
    // 서버 제안의 표시 전용 잠금은 그대로
    const run = [...walk(panel.node)].find((n) => n.tagName === 'BUTTON' && n.textContent.includes('표시 전용'));
    assert.equal(run.attributes.disabled, 'disabled');
  } finally { restore(); }
});

test('동기 예외와 제안 모양이 아닌 값도 실패로 다룬다', async () => {
  const restore = installDom();
  try {
    const throwing = { id: 'gemini', kind: 'model', explicit: true, label: '시험', propose: () => { throw rawError(); } };
    const t = panelWith(throwing);
    clickOn(byRole(t.panel.node, 'generate')); await settle();
    assertFailureShown(t.panel, t.a);
    const bogus = { id: 'gemini', kind: 'model', explicit: true, label: '시험', propose: async () => undefined };
    const b = panelWith(bogus);
    clickOn(byRole(b.panel.node, 'generate')); await settle();
    assertFailureShown(b.panel, b.a);
  } finally { restore(); }
});

test('입력마다 부르는 제안자도 실패하면 예문 실행으로 넘어가지 않는다', async () => {
  const restore = installDom();
  try {
    // 동기로 던지는 비명시적 제안자: 첫 화면부터 실패
    const sync = { id: 'gemini', kind: 'model', label: '시험', propose: () => { throw rawError(); } };
    const s = panelWith(sync); await settle();
    assertFailureShown(s.panel, s.a);
    const chip = [...walk(s.panel.node)].find((n) => n.tagName === 'BUTTON' && n.textContent.includes(PRESETS[1].label));
    clickOn(chip); await settle();
    assert.equal(s.a.current.state, STATE.IDLE, '실패한 제안으로 예문을 실행했다');
    // 비동기 거절: 예문을 누른 뒤 거절되면 예약된 실행을 하지 않는다
    const c = controlled({ explicit: false });
    const x = panelWith(c.proposer); await settle();
    const chip2 = [...walk(x.panel.node)].find((n) => n.tagName === 'BUTTON' && n.textContent.includes(PRESETS[1].label));
    clickOn(chip2); await settle();
    for (const call of c.calls) call.reject(rawError());
    await settle();
    assert.equal(x.a.current.state, STATE.IDLE, '실패 뒤 예약 실행이 돌았다');
    assertFailureShown(x.panel, x.a);
  } finally { restore(); }
});

// ── 잘못된 제안 값 (PR #167 독립 리뷰) ───────────────────────────────
//
// 예전 검사는 clauses 가 배열인지만 봤다. { clauses: [null] } 은 통과한 뒤 그리다가
// TypeError 로 깨졌다(동기: 클릭 처리 중 예외, 비동기: 미처리 rejection).

const fields = { readable: 0, complete: false, canonicalText: '', duplicates: [] };
const INVALID = [
  ['clauses:[null]', { clauses: [null] }],
  ['빈 조항 객체', { clauses: [{}], ...fields }],
  ['조항 canonical 이 숫자', { clauses: [{ index: 0, original: 'x', canonical: 5 }], ...fields }],
  ['serverGuard.kinds 가 문자열', { clauses: [{ index: 0, original: 'x', canonical: null, serverGuard: { kinds: 'ALTERNATIVE' } }], ...fields }],
  ['mentions 에 null', { clauses: [{ index: 0, original: 'x', canonical: null, held: true, mentions: [null] }], ...fields }],
  ['readable 이 문자열', { clauses: [], ...fields, readable: '1' }],
  ['canonicalText 없음', { clauses: [], readable: 0, complete: false, duplicates: [] }],
  ['duplicates 없음', { clauses: [], readable: 0, complete: false, canonicalText: '' }],
  ['배열', []],
  ['문자열', 'proposal'],
];

test('잘못된 제안 값은 동기·Promise 반환 모두 고정 생성 실패로 — 예외·미처리 rejection 없음', async () => {
  const restore = installDom();
  try {
    for (const [name, value] of INVALID) {
      for (const mode of ['sync', 'async']) {
        const proposer = { id: 'gemini', kind: 'model', explicit: true, label: '시험',
          propose: mode === 'sync' ? () => structuredClone(value) : async () => structuredClone(value) };
        const { a, panel } = panelWith(proposer);
        assert.doesNotThrow(() => clickOn(byRole(panel.node, 'generate')), `${name}/${mode}: 클릭 중 예외`);
        await settle();
        try { assertFailureShown(panel, a); } catch (e) { e.message = `${name}/${mode}: ${e.message}`; throw e; }
      }
    }
    // 입력마다 부르는 제안자가 첫 화면에서 잘못된 값을 줘도 같다
    const eager = { id: 'gemini', kind: 'model', label: '시험', propose: () => ({ clauses: [null] }) };
    let made;
    assert.doesNotThrow(() => { made = panelWith(eager); });
    assertFailureShown(made.panel, made.a);
  } finally { restore(); }
});

test('잘못된 값 뒤 재시도 성공 — 실패 상자가 걷히고 이번 제안만 보인다', async () => {
  const restore = installDom();
  try {
    let n = 0;
    const proposer = { id: 'gemini', kind: 'model', explicit: true, label: '시험',
      propose: async (t) => (++n === 1 ? { clauses: [null] } : OFFLINE_GEMINI_PROPOSER.propose(t)) };
    const { panel } = panelWith(proposer);
    clickOn(byRole(panel.node, 'generate')); await settle();
    assert.ok(byRole(panel.node, 'proposal-failed'));
    clickOn(byRole(panel.node, 'retry')); await settle();
    assert.equal(byRole(panel.node, 'proposal-failed'), undefined);
    assert.ok(panel.node.textContent.includes('2개 조건을 찾았습니다'));
  } finally { restore(); }
});

test('정상 제안·서버 보류·표시 전용 잠금은 그대로 받는다', async () => {
  const restore = installDom();
  try {
    const ok = panelWith(OFFLINE_GEMINI_PROPOSER);
    clickOn(byRole(ok.panel.node, 'generate')); await settle();
    assert.ok(ok.panel.node.textContent.includes('2개 조건을 찾았습니다'));
    const run = [...walk(ok.panel.node)].find((n) => n.tagName === 'BUTTON' && n.textContent.includes('표시 전용'));
    assert.equal(run.attributes.disabled, 'disabled');
    const held = panelWith(OFFLINE_GEMINI_PROPOSER, '강의수강 후기적기 과제제출');
    clickOn(byRole(held.panel.node, 'generate')); await settle();
    assert.equal(byRole(held.panel.node, 'proposal-failed'), undefined);
    assert.ok(held.panel.node.textContent.includes('서버 보류 사유: MULTIPLE_CONDITIONS'));
    assert.equal([...walk(held.panel.node)].filter((n) => n.tagName === 'SELECT').length, 0);
  } finally { restore(); }
});
