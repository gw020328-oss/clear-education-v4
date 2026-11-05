// 운영자 제안자 — 서버 중계 계약 · E 변환기 · 화면 결과 구분
//
// 응답은 별도 환경(기존 인증 + B 중계 + D 정확본, 오프라인 모델 전송)에서 녹화한 HTTP
// 응답을 fetch 자리에서 재생한다. 그 위의 transport.js · operator-proposer.js ·
// operator-proposal.js · condition-proposal-v21.js · ai-compare.js 는 실제 코드다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { createAdapter, DATA_MODE } from '../src/bootcamp/finals-panels/adapter.js';
import { aiComparePanel } from '../src/bootcamp/finals-panels/ai-compare.js';
import { BootcampError, createBootcampTransport } from '../src/bootcamp/transport.js';
import { createOperatorProposer, failureOutcome, OUTCOME, CALL } from '../src/bootcamp/finals-panels/operator-proposer.js';
import { createReplayFetch, createReplayOperatorProposer } from '../src/bootcamp/finals-panels/operator-relay-standin.js';
import { OPERATOR_RELAY_REPLAY as REPLAY } from '../src/bootcamp/finals-panels/operator-relay-replay.js';
import { PRESETS } from '../src/bootcamp/finals-panels/fixtures.js';

const TEXT = Object.freeze({
  approval: '과제를 제출하세요 (승인 전 시연)', dFailure: '강의를 완료하세요 (D 오류 시연)',
  expired: '과제를 제출하세요 (만료 시연)', lost: '강의를 완료하세요 (응답 유실 시연)',
  alternative: '강의 수강 또는 과제 제출', multiple: '강의수강 후기적기 과제제출',
});

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
const settle = async () => { for (let i = 0; i < 40; i += 1) await new Promise((r) => setTimeout(r, 0)); };
const byRole = (node, role) => [...walk(node)].find((n) => n.attributes?.['data-role'] === role);
const clickOn = (btn) => { for (const fn of btn.handlers.click ?? []) fn({}); };
const type = (panel, value) => {
  const ta = [...walk(panel.node)].find((n) => n.tagName === 'TEXTAREA');
  for (const fn of ta.handlers.input ?? []) fn({ target: { value } });
};

/** 녹화 재생 fetch 를 세는 운영자 제안자 + 패널 */
function operatorPanel(source, { fetchImpl } = {}) {
  const calls = [];
  const replay = createReplayFetch();
  const counted = async (url, init) => { calls.push(new URL(url).pathname); return (fetchImpl ?? replay)(url, init); };
  const request = createBootcampTransport({ origin: 'https://replay.clear.invalid', fetchImpl: counted });
  const proposer = createOperatorProposer({ request, appContextRef: () => 'operator-test' });
  const a = createAdapter({ mode: DATA_MODE.SYNTHETIC, fixture: () => null });
  return { calls, proposer, a, panel: aiComparePanel({ adapter: a, source, proposer }) };
}

test('설치한 변환기는 E 공유본과 같은 바이트다 — 어댑터는 import 경로 한 줄만 다르다', () => {
  const sha = (p) => createHash('sha256').update(readFileSync(new URL(p, import.meta.url))).digest('hex');
  assert.equal(sha('../src/bootcamp/finals-panels/condition-proposal-v21.js'), 'f9f416c891e5911507e804423104cba24ac7a6064884125df8fbb657d18d141d');
  const adapter = readFileSync(new URL('../src/bootcamp/finals-panels/operator-proposal.js', import.meta.url), 'utf8');
  const original = adapter.replace("from './condition-proposal-v21.js';", "from './condition-proposal.v2.1.candidate.mjs';");
  assert.equal(createHash('sha256').update(original).digest('hex'), 'e7a4d235e3d9c3f29c8d576e78dc57b9e5e9d5da7c2f76fcb68914bfdb0d8344');
});

test('녹화는 실제 D 정확본·오프라인 모델 전송에서 나온 응답이다', () => {
  assert.equal(REPLAY.dSide, 'D_REAL');
  assert.equal(REPLAY.modelTransport, 'OFFLINE');
  for (const e of Object.values(REPLAY.entries)) {
    if (e.generate?.body?.generated) assert.equal(e.generate.body.generated.actualModelCall, false);
  }
  assert.ok(!/csrf|cookie|__Host|secret/i.test(JSON.stringify(REPLAY)));
});

test('「제안 생성」 을 눌러야만 요청이 나간다 — 첫 화면·입력·예문 선택은 보내지 않는다', async () => {
  const restore = installDom();
  try {
    const { calls, panel } = operatorPanel(PRESETS[0].source);
    await settle();
    assert.deepEqual(calls, []);
    type(panel, PRESETS[1].source);
    await new Promise((r) => setTimeout(r, 300)); await settle();
    assert.deepEqual(calls, [], '입력만으로 보냈다');
    clickOn(byRole(panel.node, 'generate'));
    await settle();
    assert.deepEqual(calls, ['/bootcamp/preview/prepare', '/bootcamp/preview/generate']);
    const text = panel.node.textContent;
    assert.ok(text.includes('3개 조건을 찾았습니다'), text.slice(0, 300));
    assert.ok(text.includes('Gemini 오프라인 응답 대역 · 실제 호출 아님'));
    assert.ok(text.includes('실제 모델 호출 없음'), '모델 호출 상태가 없다');
    assert.ok(text.includes('표시 전용(DISPLAY_ONLY)'));
    const run = [...walk(panel.node)].find((n) => n.tagName === 'BUTTON' && n.textContent.includes('표시 전용'));
    assert.equal(run.attributes.disabled, 'disabled');
  } finally { restore(); }
});

test('원문을 고치면 이전 제안을 비우고, 진행 중이던 응답은 늦게 와도 쓰지 않는다', async () => {
  const restore = installDom();
  try {
    let release;
    const gate = new Promise((r) => { release = r; });
    const replay = createReplayFetch();
    const slow = async (url, init) => { if (url.endsWith('/generate')) await gate; return replay(url, init); };
    const { panel, calls } = operatorPanel(PRESETS[0].source, { fetchImpl: slow });
    clickOn(byRole(panel.node, 'generate'));
    await settle();
    assert.deepEqual(calls, ['/bootcamp/preview/prepare', '/bootcamp/preview/generate']);
    type(panel, PRESETS[0].source + ' ');
    release();
    await new Promise((r) => setTimeout(r, 300)); await settle();
    const text = panel.node.textContent;
    assert.ok(!text.includes('개 조건을 찾았습니다'), '고친 뒤 이전 응답이 반영됐다');
    assert.ok(text.includes('아직 제안을 만들지 않았습니다'));
    assert.equal(calls.length, 2, '자동으로 다시 보냈다');
  } finally { restore(); }
});

test('서버 보류는 사유와 함께 보이고 직접 지정으로 풀 수 없다', async () => {
  const restore = installDom();
  try {
    for (const [source, kind] of [[TEXT.alternative, 'ALTERNATIVE'], [TEXT.multiple, 'MULTIPLE_CONDITIONS']]) {
      const { panel } = operatorPanel(source);
      clickOn(byRole(panel.node, 'generate'));
      await settle();
      const text = panel.node.textContent;
      assert.ok(text.includes('자동 변환 보류'), text.slice(0, 300));
      assert.ok(text.includes(`서버 보류 사유: ${kind}`), text.slice(0, 400));
      assert.ok(text.includes('1개 조항 — 전체 실행 불가'));
      assert.equal([...walk(panel.node)].filter((n) => n.tagName === 'SELECT').length, 0);
    }
  } finally { restore(); }
});

test('승인 전 · D 오류 · 만료 · 응답 유실이 서로 다른 결과로 보인다', async () => {
  const restore = installDom();
  try {
    const cases = [
      [TEXT.approval, 'APPROVAL_REQUIRED', ['직접 승인 필요', '생성 요청을 보내지 않음', '승인 대상 bodyHash', 'US$0.0063488'], 1],
      [TEXT.dFailure, 'FAILED', ['제안 생성 실패', '모델 호출 여부 미확인', 'GEMINI_HTTP_FAILURE · HTTP 422', 'D 서비스 HTTP 오류'], 2],
      [TEXT.expired, 'EXPIRED', ['만료 — 이 원문으로 다시 생성', 'PREVIEW_STALE · HTTP 409', '모델 호출 여부 미확인'], 2],
      [TEXT.lost, 'UNKNOWN', ['결과 미확인', '자동 재시도하지 않습니다', '모델 호출 여부 미확인'], 2],
    ];
    for (const [source, kind, phrases, sent] of cases) {
      const { panel, calls } = operatorPanel(source);
      clickOn(byRole(panel.node, 'generate'));
      await settle();
      const box = byRole(panel.node, 'relay-outcome');
      assert.ok(box, `${kind}: 결과 상자가 없다`);
      assert.equal(box.attributes['data-outcome'], kind);
      for (const p of phrases) assert.ok(box.textContent.includes(p), `${kind}: "${p}" 없음 — ${box.textContent.slice(0, 300)}`);
      assert.ok(!panel.node.textContent.includes('개 조건을 찾았습니다'), `${kind}: 실패를 제안처럼 보였다`);
      assert.equal(calls.length, sent, `${kind}: 요청 수`);
    }
  } finally { restore(); }
});

test('받은 제안도 유효 시각이 지나면 만료로 바뀐다', async () => {
  const restore = installDom();
  const realNow = Date.now;
  try {
    const { panel } = operatorPanel(PRESETS[0].source);
    clickOn(byRole(panel.node, 'generate'));
    await settle();
    assert.ok(panel.node.textContent.includes('2개 조건을 찾았습니다'));
    const later = realNow() + 16 * 60 * 1000;
    Date.now = () => later;
    panel.render();
    const box = byRole(panel.node, 'relay-outcome');
    assert.equal(box?.attributes['data-outcome'], 'EXPIRED');
    assert.ok(!panel.node.textContent.includes('개 조건을 찾았습니다'));
  } finally { Date.now = realNow; restore(); }
});

test('실패 분류 — RELAY 와 D_HTTP 를 섞지 않고, 모르는 호출 상태를 지어내지 않는다', () => {
  const relay = (code, status = 409) => new BootcampError('BC_TRANSPORT_HTTP', { outcome: 'HTTP_ERROR', status, previewFailure: { kind: 'RELAY', code } });
  const dHttp = (code, status) => new BootcampError('BC_TRANSPORT_HTTP', { outcome: status >= 500 ? 'UNKNOWN' : 'HTTP_ERROR', status, previewFailure: { kind: 'D_HTTP', status, code } });
  assert.equal(failureOutcome('generate', relay('APPROVAL_REQUIRED')).call, CALL.NOT_SENT);
  assert.equal(failureOutcome('generate', relay('PREVIEW_STALE')).kind, OUTCOME.EXPIRED);
  assert.equal(failureOutcome('generate', relay('PREVIEW_ALREADY_USED')).call, CALL.UNKNOWN);
  assert.equal(failureOutcome('prepare', relay('PREVIEW_REJECTED', 400)).call, CALL.NONE_PREPARE);
  const d = failureOutcome('generate', dHttp('GEMINI_RATE_LIMIT', 422));
  assert.deepEqual([d.kind, d.source, d.call, d.httpStatus], [OUTCOME.FAILED, 'D_HTTP', CALL.UNKNOWN, 422]);
  // D 의 5xx 도 D 가 답한 오류다 — 응답 유실(UNKNOWN)로 섞지 않는다
  assert.equal(failureOutcome('generate', dHttp('OBSERVATION_ADAPTER_NOT_ACCEPTED', 503)).kind, OUTCOME.FAILED);
  assert.equal(failureOutcome('generate', dHttp('APPROVAL_EXPIRED', 422)).kind, OUTCOME.EXPIRED);
  assert.equal(failureOutcome('generate', new BootcampError('BC_TRANSPORT_FAILED', { outcome: 'UNKNOWN' })).kind, OUTCOME.UNKNOWN);
  assert.equal(failureOutcome('generate', new BootcampError('BC_TRANSPORT_CANCELLED', { outcome: 'NOT_SENT' })).call, CALL.NOT_SENT);
});

test('transport 는 중계 실패에서 종류·코드만 꺼낸다 — 다른 경로 본문은 넘기지 않는다', async () => {
  const reply = (status, body) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const call = async (status, body) => {
    const request = createBootcampTransport({ origin: 'https://x.invalid', fetchImpl: reply(status, body) });
    try { await request('/bootcamp/preview/generate', { method: 'POST', body: {} }); } catch (e) { return e; }
    throw new Error('no error');
  };
  const relay = await call(409, { version: 'clear-operator-preview.1', stage: 'FAILED', failure: { kind: 'RELAY', code: 'PREVIEW_STALE' }, extra: 'x' });
  assert.deepEqual(relay.previewFailure, { kind: 'RELAY', code: 'PREVIEW_STALE' });
  const d = await call(422, { version: 'clear-operator-preview.1', stage: 'FAILED', contextRef: 'c', revision: 1,
    failure: { kind: 'D_HTTP', status: 422, error: { version: 'clear-external-preview-error.1', code: 'GEMINI_HTTP_FAILURE', paymentAllowed: false } } });
  assert.deepEqual(d.previewFailure, { kind: 'D_HTTP', status: 422, code: 'GEMINI_HTTP_FAILURE' });
  assert.equal((await call(409, { error: 'BC_VIEW_STALE', detail: 'raw' })).previewFailure, null);
  assert.equal((await call(409, { version: 'clear-operator-preview.1', stage: 'FAILED', failure: { kind: 'RELAY', code: 'lower case' } })).previewFailure, null);
});

test('미리보기 페이지의 녹화 재생 제안자는 대역이라고 적는다', () => {
  const p = createReplayOperatorProposer();
  assert.equal(p.explicit, true);
  assert.ok(p.label.includes('녹화 재생(대역)'));
});

// ── 재생성 중 이전 결과 제거 (PR #168 독립 리뷰) ─────────────────────
//
// 같은 원문으로 다시 생성하고 두 번째 응답을 기다리는 동안 이전 조건·
// proposal-facts·이전 출처 배지가 남아 있었다.

function gatedPanel(source) {
  const replay = createReplayFetch();
  const gates = [];
  let hold = false;
  const fetchImpl = async (url, init) => {
    if (hold && url.endsWith('/generate')) await new Promise((r) => gates.push(r));
    return replay(url, init);
  };
  const made = operatorPanel(source, { fetchImpl });
  return { ...made, holdNext: () => { hold = true; }, release: () => { hold = false; gates.splice(0).forEach((r) => r()); } };
}

test('재생성을 시작하면 이전 조건·결과 정보·출처 배지를 내리고 최신 결과만 보인다', async () => {
  const restore = installDom();
  try {
    const g = gatedPanel(PRESETS[0].source);
    clickOn(byRole(g.panel.node, 'generate')); await settle();
    assert.ok(g.panel.node.textContent.includes('2개 조건을 찾았습니다'));
    assert.ok(byRole(g.panel.node, 'proposal-facts'));
    g.holdNext();
    clickOn(byRole(g.panel.node, 'generate')); await settle();
    const waiting = g.panel.node.textContent;
    assert.ok(!waiting.includes('2개 조건을 찾았습니다'), '재생성 중 이전 조건이 남았다');
    assert.equal(byRole(g.panel.node, 'proposal-facts'), undefined, '재생성 중 이전 결과 정보가 남았다');
    assert.ok(!waiting.includes('Gemini 오프라인 응답 대역 · 실제 호출 아님'), '재생성 중 이전 출처 배지가 남았다');
    assert.ok(!waiting.includes('조건을 찾지 못했습니다') && !waiting.includes('직접 지정'), '대기 중 조건 없음·직접 지정으로 이끈다');
    assert.ok(waiting.includes('이번 제안을 만드는 중입니다'));
    const run = [...walk(g.panel.node)].find((n) => n.tagName === 'BUTTON' && n.attributes?.['data-role'] === undefined && n.textContent.includes('만드는 중'));
    assert.equal(run?.attributes.disabled, 'disabled', '재생성 중 실행이 열려 있다');
    g.release(); await settle();
    assert.ok(g.panel.node.textContent.includes('2개 조건을 찾았습니다'));
    assert.ok(byRole(g.panel.node, 'proposal-facts'));
  } finally { restore(); }
});

test('결과 상자가 있던 뒤 재생성해도 이전 상자는 내려가고, 대기 중 입력을 바꾸면 늦은 응답은 버린다', async () => {
  const restore = installDom();
  try {
    const g = gatedPanel(TEXT.dFailure);
    clickOn(byRole(g.panel.node, 'generate')); await settle();
    assert.equal(byRole(g.panel.node, 'relay-outcome')?.attributes['data-outcome'], 'FAILED');
    g.holdNext();
    clickOn(byRole(g.panel.node, 'generate')); await settle();
    assert.equal(byRole(g.panel.node, 'relay-outcome'), undefined, '재생성 중 이전 결과 상자가 남았다');
    type(g.panel, PRESETS[0].source);
    await new Promise((r) => setTimeout(r, 300));
    g.release(); await settle();
    assert.equal(byRole(g.panel.node, 'relay-outcome'), undefined, '입력을 바꾼 뒤 늦은 응답이 반영됐다');
    assert.ok(g.panel.node.textContent.includes('아직 제안을 만들지 않았습니다'));
  } finally { restore(); }
});

test('상자는 하나만 — 제안자 예외는 생성 실패 상자, 정상 계약의 실패는 결과 상자', async () => {
  const restore = installDom();
  try {
    // 정상 계약으로 받은 D 오류: 결과 상자만
    const d = operatorPanel(TEXT.dFailure);
    clickOn(byRole(d.panel.node, 'generate')); await settle();
    assert.equal(byRole(d.panel.node, 'relay-outcome')?.attributes['data-outcome'], 'FAILED');
    assert.equal(byRole(d.panel.node, 'proposal-failed'), undefined);
    // 제안자 내부 예외(여기서는 화면 문맥 읽기 실패): 생성 실패 상자만, 원시 오류 없음
    const request = createBootcampTransport({ origin: 'https://replay.clear.invalid', fetchImpl: createReplayFetch() });
    const broken = createOperatorProposer({ request, appContextRef: () => { throw new Error('secret-context sk-live-1'); } });
    const a = createAdapter({ mode: DATA_MODE.SYNTHETIC, fixture: () => null });
    const panel = aiComparePanel({ adapter: a, source: PRESETS[0].source, proposer: broken });
    clickOn(byRole(panel.node, 'generate')); await settle();
    assert.ok(byRole(panel.node, 'proposal-failed'), '예외가 생성 실패로 보이지 않는다');
    assert.equal(byRole(panel.node, 'relay-outcome'), undefined, '상자가 겹쳤다');
    assert.ok(!panel.node.textContent.includes('sk-live') && !panel.node.textContent.includes('secret-context'));
    assert.ok(!panel.node.textContent.includes('조건을 찾지 못했습니다'));
  } finally { restore(); }
});
