// 본선 패널 — 어댑터와 두 화면
//
// 여기서 막으려는 것 넷.
//
//   1  **fixture 가 실제 모듈과 어긋나는 것.** 합성 자료를 손으로 적어 두면
//      모듈이 바뀌어도 화면은 멀쩡해 보인다. 저장소의 실제 모듈을 import 해서
//      모양을 대조한다 — PR #128 리뷰에서 배운 것과 같은 이유다
//   2  **실제 모드가 합성으로 떨어지는 것.** 지난주 학생 화면에서 겪었다
//   3  **늦게 온 응답이 최신 입력 결과를 덮는 것**
//   4  **비교 기준 없이 절감률을 적는 것**

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createAdapter, STATE, DATA_MODE } from '../src/bootcamp/finals-panels/adapter.js';
import { aiComparePanel, CAPABILITY_LABEL } from '../src/bootcamp/finals-panels/ai-compare.js';
import { opsMetricsPanel } from '../src/bootcamp/finals-panels/ops-metrics.js';
import {
  PREVIEW_SOURCE, PREVIEW_DRAFT, PREVIEW_PLAN, PREVIEW_RESULT,
  PREVIEW_PAYLOAD, METRICS_INPUT, METRICS_SUMMARY,
} from '../src/bootcamp/finals-panels/fixtures.js';

// 저장소의 **실제 모듈**. web/ 밖이지만 시험이라 괜찮다.
import { structureSynthetic, buildPlan, executePublicDemo } from '../../src/agent-preview/index.mjs';
import { summarizeOperationalMetrics } from '../../src/operational-metrics/index.mjs';

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

const settle = async () => { for (let i = 0; i < 20; i += 1) await new Promise((r) => setTimeout(r, 0)); };

// ── 1 · fixture 가 실제 모듈과 같은가 ───────────────────────────────────

test('fixture 는 실제 agent-preview 모듈이 지금 내놓는 값과 같다', () => {
  const draft = structureSynthetic(PREVIEW_SOURCE);
  assert.deepEqual(JSON.parse(JSON.stringify(PREVIEW_DRAFT)), draft, 'draft 가 어긋났다');

  const plan = buildPlan(draft);
  assert.deepEqual(JSON.parse(JSON.stringify(PREVIEW_PLAN)), plan, 'plan 이 어긋났다');

  const result = executePublicDemo(plan, draft);
  assert.deepEqual(JSON.parse(JSON.stringify(PREVIEW_RESULT)), result, 'result 가 어긋났다');
});

test('fixture 는 실제 operational-metrics 모듈과 같다', () => {
  const summary = summarizeOperationalMetrics(JSON.parse(JSON.stringify(METRICS_INPUT)));
  assert.deepEqual(JSON.parse(JSON.stringify(METRICS_SUMMARY)), summary, 'summary 가 어긋났다');
});

test('네 기능에 빠짐없이 한글 라벨이 있다', () => {
  const missing = PREVIEW_DRAFT.conditions
    .map((c) => c.capability)
    .filter((cap) => !CAPABILITY_LABEL[cap]);
  assert.deepEqual(missing, [], '한글 라벨이 없는 capability');
});

// ── 2 · 실제 모드가 합성으로 떨어지지 않는가 ────────────────────────────

test('실제 모드는 연결이 없으면 미연결로 남고 fixture 를 쓰지 않는다', async () => {
  const a = createAdapter({ mode: DATA_MODE.ACTUAL, fixture: PREVIEW_PAYLOAD, run: null });
  const after = await a.request('아무 원문');

  assert.equal(after.state, STATE.ERROR);
  assert.equal(after.error.code, 'ACTUAL_NOT_CONNECTED');
  assert.equal(after.payload, null, '실제 모드인데 합성 자료를 그렸다');
  assert.equal(after.actualUnavailable, true);
});

test('실제 모드 화면이 합성 값을 한 글자도 그리지 않는다', () => {
  const restore = installDom();
  try {
    const a = createAdapter({ mode: DATA_MODE.ACTUAL, fixture: PREVIEW_PAYLOAD, run: null });
    const panel = aiComparePanel({ adapter: a, source: PREVIEW_SOURCE });
    void a.request(PREVIEW_SOURCE);
    const text = panel.node.textContent;

    assert.ok(text.includes('연결되지 않았습니다'), '미연결을 적지 않았다');
    // 합성 쪽에서만 나오는 값들이 새면 안 된다
    assert.ok(!text.includes('공개 합성자료에서 충족'), '합성 관측이 샜다');
    assert.ok(!text.includes(PREVIEW_RESULT.sourceHash.slice(0, 10)), '합성 지문이 샜다');
  } finally { restore(); }
});

test('합성 모드는 합성이라고 눈에 띄게 적는다', () => {
  const restore = installDom();
  try {
    const a = createAdapter({ mode: DATA_MODE.SYNTHETIC, fixture: PREVIEW_PAYLOAD });
    const panel = aiComparePanel({ adapter: a, source: PREVIEW_SOURCE });
    void a.request(PREVIEW_SOURCE);
    assert.ok(panel.node.textContent.includes('합성 자료'), '합성 표시가 없다');
  } finally { restore(); }
});

// ── 3 · 늦게 온 응답 ────────────────────────────────────────────────────

test('늦게 도착한 응답이 최신 입력의 결과를 덮지 않는다', async () => {
  let release = null;
  const slow = new Promise((r) => { release = () => r({ status: 'READY', mark: '느린 것' }); });
  let first = true;
  const a = createAdapter({
    mode: DATA_MODE.ACTUAL,
    run: async () => {
      if (first) { first = false; return slow; }
      return { status: 'READY', mark: '빠른 것' };
    },
  });

  const slowRun = a.request('첫 입력');     // 아직 안 끝난다
  await a.request('둘째 입력');             // 먼저 끝난다
  assert.equal(a.current.payload.mark, '빠른 것');

  release();
  await slowRun;
  await settle();

  assert.equal(a.current.payload.mark, '빠른 것', '늦게 온 응답이 최신 결과를 덮었다');
});

test('입력이 바뀌면 이전 결과를 stale 로 적는다', async () => {
  const a = createAdapter({ mode: DATA_MODE.SYNTHETIC, fixture: PREVIEW_PAYLOAD });
  await a.request(PREVIEW_SOURCE);
  assert.equal(a.current.state, STATE.SUCCESS);

  a.markStale('바뀐 원문');
  assert.equal(a.current.state, STATE.STALE);

  // 아직 아무 결과도 없었다면 stale 이 아니라 idle 이다
  const fresh = createAdapter({ mode: DATA_MODE.SYNTHETIC, fixture: PREVIEW_PAYLOAD });
  fresh.markStale('무엇이든');
  assert.equal(fresh.current.state, STATE.IDLE);
});

test('지원하지 않는 문장은 보류하고 부분 실행하지 않는다', () => {
  const draft = structureSynthetic('이 반은 분위기가 좋아야 합니다');
  assert.equal(draft.status, 'UNSUPPORTED');
  assert.equal(draft.conditions.length, 0, '지원 밖인데 조건을 만들었다');
  assert.ok(draft.questions.length > 0, '질문으로 남기지 않았다');
});

// ── 4 · 절감률 ──────────────────────────────────────────────────────────

test('비교 기준이 없으면 절감률은 N/A 다', () => {
  const restore = installDom();
  try {
    const a = createAdapter({ mode: DATA_MODE.SYNTHETIC, fixture: METRICS_SUMMARY });
    const panel = opsMetricsPanel({ adapter: a });
    void a.request();
    const text = panel.node.textContent;

    assert.ok(text.includes('N/A'), '절감률을 N/A 로 적지 않았다');
    assert.ok(text.includes('비교 기록이 없어'), '왜 못 세는지 적지 않았다');
    assert.ok(!/\d+\s*%/.test(text), '비교 기준 없이 비율을 적었다 — ' + text.slice(0, 200));
  } finally { restore(); }
});

test('비교 기준이 있을 때만 절감률을 적는다', () => {
  const restore = installDom();
  try {
    const a = createAdapter({
      mode: DATA_MODE.SYNTHETIC,
      fixture: { ...METRICS_SUMMARY, baselineComparable: true, humanWorkReductionPercent: 42 },
    });
    const panel = opsMetricsPanel({ adapter: a });
    void a.request();
    assert.ok(panel.node.textContent.includes('42%'));
  } finally { restore(); }
});

test('의무 확인과 예외 검토를 자동 처리로 세지 않는다', () => {
  const restore = installDom();
  try {
    const a = createAdapter({ mode: DATA_MODE.SYNTHETIC, fixture: METRICS_SUMMARY });
    const panel = opsMetricsPanel({ adapter: a });
    void a.request();
    const text = panel.node.textContent;
    assert.ok(text.includes('의무 확인'), '의무 확인을 따로 적지 않았다');
    assert.ok(text.includes('사람이 반드시 하는 일'), '자동이 아니라고 적지 않았다');
  } finally { restore(); }
});

test('완전성이 확인되지 않은 범위를 기록된 이벤트 기준이라고 적는다', () => {
  const restore = installDom();
  try {
    const a = createAdapter({ mode: DATA_MODE.SYNTHETIC, fixture: METRICS_SUMMARY });
    const panel = opsMetricsPanel({ adapter: a });
    void a.request();
    // fixture 의 coverage 에 false 가 있다 — 그러면 반드시 적어야 한다
    const partial = Object.values(METRICS_SUMMARY.coverage).some((v) => v !== true);
    assert.equal(partial, true, 'fixture 전제가 바뀌었다');
    assert.ok(panel.node.textContent.includes('기록된 이벤트 기준'));
  } finally { restore(); }
});

test('안 준 값을 0 으로 적지 않는다', () => {
  const restore = installDom();
  try {
    const a = createAdapter({
      mode: DATA_MODE.SYNTHETIC,
      fixture: { ...METRICS_SUMMARY, time: {} },
    });
    const panel = opsMetricsPanel({ adapter: a });
    void a.request();
    const text = panel.node.textContent;
    assert.ok(text.includes('확인 전'), '없는 값을 없다고 적지 않았다');
    assert.ok(!/전체 경과\s*0/.test(text), '없는 값을 0 으로 적었다');
  } finally { restore(); }
});
