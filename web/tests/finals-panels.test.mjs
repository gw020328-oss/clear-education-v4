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
  PREVIEW_PAYLOAD, METRICS_INPUT, METRICS_SUMMARY, PRESETS,
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

function* walk(node) { yield node; for (const c of node.children ?? []) yield* walk(c); }

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

// ── 읽기 제안 — 학원 말투를 모듈이 아는 문장으로 ─────────────────────────
//
// structureSynthetic 은 문구가 정확히 같을 때만 읽는다. 15개 표현 중 5개만
// 통과했고 백엔드가 지시한 ① 예문 "지정 강의 완료" 도 못 읽었다. 그래서
// 모듈에 넘기기 전에 규칙으로 읽기 제안을 만들고 사람이 확인한다.
//
// 여기서 지키는 것 셋.
//   1  읽은 것은 **모듈이 실제로 받아들이는** 정규 문장이어야 한다
//   2  우리 조건이 아닌 것(출석률·수강률)은 읽지 않고 **이유**를 적는다
//   3  정규 문장을 다시 넣으면 **그대로** 나와야 한다 — 쉼표가 찢기면 안 된다

import { proposeReading, CANONICAL } from '../src/bootcamp/finals-panels/normalize.js';

test('정규 문장 네 개는 실제 모듈이 전부 읽는다', () => {
  for (const [cap, sentence] of Object.entries(CANONICAL)) {
    const d = structureSynthetic(sentence);
    assert.equal(d.status, 'READY', cap + ': 모듈이 정규 문장을 못 읽는다');
    assert.equal(d.conditions[0]?.capability, cap, cap + ': 다른 조건으로 읽혔다');
  }
});

test('학원 말투를 네 조건으로 읽고, 읽은 것은 모듈을 통과한다', () => {
  const cases = [
    ['지정 강의 완료', 'MOODLE_ACTIVITY_COMPLETION.1'],
    ['무들 강의 다 들어야 함', 'MOODLE_ACTIVITY_COMPLETION.1'],
    ['강의 전부 수강', 'MOODLE_ACTIVITY_COMPLETION.1'],
    ['과제 내야 함', 'MOODLE_ASSIGNMENT_SUBMISSION.1'],
    ['숙제 제출', 'MOODLE_ASSIGNMENT_SUBMISSION.1'],
    ['회고 작성', 'REFLECTION_REQUIRED_TOPICS.1'],
    ['회고 세 항목 써야 함', 'REFLECTION_REQUIRED_TOPICS.1'],
    ['해커랭크 파이썬 자격증', 'HACKERRANK_CERTIFICATE_HOLDING.1'],
    ['HackerRank 인증', 'HACKERRANK_CERTIFICATE_HOLDING.1'],
  ];
  for (const [text, cap] of cases) {
    const p = proposeReading(text);
    assert.equal(p.clauses[0].capability, cap, text);
    // 읽은 정규 문장은 모듈이 실제로 받아들여야 한다
    const d = structureSynthetic(p.canonicalText);
    assert.equal(d.status, 'READY', text + ': 정규 문장이 모듈을 못 통과');
    assert.equal(d.conditions[0].capability, cap, text + ': 모듈이 다른 조건으로 읽음');
  }
});

test('출석률·수강률은 읽지 않고 이유를 적는다', () => {
  for (const [text, part] of [
    ['출석률 90% 이상', '출석률은'],
    ['수강률 80% 이상', '수강률'],
    ['강의 출석 100%', '출석률은'],
  ]) {
    const p = proposeReading(text);
    assert.equal(p.readable, 0, text + ': 읽어 버렸다');
    assert.equal(p.unreadable, 1, text);
    assert.ok(p.clauses[0].note?.includes(part), text + ': 이유가 없다 — ' + p.clauses[0].note);
  }
});

test('정규 문장을 넣으면 그대로 나온다 — 회고의 쉼표가 찢기지 않는다', () => {
  const canon = Object.values(CANONICAL).join('; ');
  const p = proposeReading(canon);
  assert.equal(p.clauses.length, 4, '조항 수가 다르다 — 쉼표에서 찢겼다');
  assert.equal(p.canonicalText, canon);
  assert.equal(p.complete, true);
});

test('캐주얼한 한 문장이 네 조건으로 읽혀 ③ 예문과 같은 정규 문장이 된다', () => {
  const p = proposeReading('강의 다 듣고, 숙제 내고, 회고 쓰고, 해커랭크 파이썬 자격증 있어야 함');
  assert.equal(p.readable, 4);
  assert.equal(p.complete, true);
  assert.equal(p.canonicalText, PRESETS[2].source, '③ 예문과 다르다');
});

test('같은 조건이 두 번 나오면 한 번만 넘긴다', () => {
  const p = proposeReading('과제 제출; 숙제 내기');
  assert.equal(p.readable, 1);
  assert.equal(p.duplicates.length, 1);
  assert.equal(p.canonicalText, CANONICAL['MOODLE_ASSIGNMENT_SUBMISSION.1']);
});

test('화면이 못 읽은 조항을 못 읽음으로 두고 지어내지 않는다', () => {
  const restore = installDom();
  try {
    const a = createAdapter({ mode: DATA_MODE.SYNTHETIC, fixture: () => null });
    const panel = aiComparePanel({ adapter: a, source: '숙제 제출; 출석률 90% 이상' });
    const text = panel.node.textContent;

    assert.ok(text.includes('읽기 제안'), '제안 블록이 없다');
    assert.ok(text.includes('모델 아님'), '규칙 기반이라고 적지 않았다');
    assert.ok(text.includes('과제 제출'), '읽은 조항을 안 보여줬다');
    assert.ok(text.includes('1개 조건을 찾았습니다 — 맞나요?'), '찾은 개수를 묻지 않는다');
    assert.ok(text.includes('자동 검증 미지원 — 정책 확정 전 처리 필요 · 1개'), '출석률 조항을 숨겼다');
    assert.ok(text.includes('출석률은'), '못 읽은 이유를 안 적었다');
    assert.ok(text.includes('읽은 것만 구조화'), '일부만 읽었는데 버튼이 그 사실을 안 적는다');
    assert.ok(!text.includes('강의 활동 완료'), '출석률을 활동 완료로 지어냈다');
  } finally { restore(); }
});

test('학원 원문과 정규 문장이 다르면 ① 절에 둘 다 보인다', () => {
  const restore = installDom();
  try {
    const a = createAdapter({
      mode: DATA_MODE.SYNTHETIC,
      fixture: (input) => PRESETS.find((p) => p.source === input)?.payload ?? null,
    });
    const casual = '강의 다 듣고, 숙제 내고, 회고 쓰고, 해커랭크 파이썬 자격증 있어야 함';
    const panel = aiComparePanel({ adapter: a, source: casual });
    const btn = [...walk(panel.node)].find((n) => n.tagName === 'BUTTON' && n.textContent.includes('이대로 구조화'));
    assert.ok(btn, '이대로 구조화 버튼이 없다');
    for (const fn of btn.handlers.click ?? []) fn({});
    const text = panel.node.textContent;

    assert.ok(text.includes('"강의 다 듣고"'), '학원 원문이 사라졌다');
    assert.ok(text.includes('정규 문장으로'), '정규 문장 대응을 안 보여줬다');
    assert.ok(text.includes('Moodle 활동 완료'), '정규 문장이 없다');
  } finally { restore(); }
});

test('못 읽을 말이 읽힌 조항 안에 삼켜지지 않는다', () => {
  // 처음 버전이 "출석률 90% 이상, 해커랭크 …" 를 한 조항으로 붙여
  // 출석률을 HackerRank 안에 숨겼다. 못 읽은 것은 **보여야** 한다.
  const p = proposeReading('숙제 내고, 출석률 90% 이상, 해커랭크 파이썬 자격증 있어야 함');
  assert.equal(p.clauses.length, 3, '쉼표에서 안 잘렸다');
  assert.equal(p.readable, 2);
  assert.equal(p.unreadable, 1);
  const hr = p.clauses.find((c) => c.capability === 'HACKERRANK_CERTIFICATE_HOLDING.1');
  assert.ok(hr && !hr.original.includes('출석률'), '출석률이 HackerRank 조항에 삼켜졌다');
  const no = p.clauses.find((c) => !c.capability);
  assert.ok(no.original.includes('출석률') && no.note?.includes('출석률은'));
});

test('출석률이 강의와 한 조항에 있어도 활동 완료로 읽지 않는다', () => {
  const p = proposeReading('강의 출석률 90% 이상이면 완료');
  assert.equal(p.readable, 0, '출석률 조항을 활동 완료로 읽었다');
  assert.ok(p.clauses[0].note?.includes('출석률은'));
});

// ── 15조합 fixture · 정규 순서 · 운영자 직접 보완 · 제안자 교체 ──────────

import { COMBOS } from '../src/bootcamp/finals-panels/fixtures.js';
import { applyOverrides, emptyProposal } from '../src/bootcamp/finals-panels/normalize.js';

test('15조합 fixture 는 실제 모듈이 지금 내놓는 값과 같다', () => {
  const keys = Object.keys(COMBOS);
  assert.equal(keys.length, 15, '조합 수가 15가 아니다');
  for (const source of keys) {
    const draft = structureSynthetic(source);
    const plan = buildPlan(draft);
    const result = executePublicDemo(plan, draft);
    const fx = JSON.parse(JSON.stringify(COMBOS[source].payload));
    assert.deepEqual(fx.draft, draft, source + ': draft 어긋남');
    assert.deepEqual(fx.plan, plan, source + ': plan 어긋남');
    assert.deepEqual(fx.result, result, source + ': result 어긋남');
  }
});

test('운영자가 어떤 순서로 써도 모듈에는 정규 순서로 넘긴다', () => {
  const p = proposeReading('숙제 내고, 강의 다 들어야 함');
  assert.equal(p.clauses[0].capability, 'MOODLE_ASSIGNMENT_SUBMISSION.1', '화면 순서는 운영자 순서여야 한다');
  assert.equal(p.canonicalText, 'Moodle 활동 완료; Moodle 과제 제출', '정규 순서가 아니다');
  assert.ok(COMBOS[p.canonicalText], '정규 순서 문장이 15조합에 없다');
});

test('못 읽은 조항을 운영자가 직접 지정하면 읽은 것으로 넘긴다', () => {
  const base = proposeReading('강의 완료; 이상한 문장 하나');
  assert.equal(base.readable, 1);
  const no = base.clauses.find((c) => !c.capability);
  const over = new Map([[`${no.index}:${no.original}`, 'MOODLE_ASSIGNMENT_SUBMISSION.1']]);
  const p = applyOverrides(base, over);
  assert.equal(p.readable, 2);
  const fixed = p.clauses.find((c) => c.original === no.original);
  assert.equal(fixed.source, 'operator');
  assert.ok(fixed.note.includes('운영자가 직접'));
  assert.equal(p.canonicalText, 'Moodle 활동 완료; Moodle 과제 제출');
});

test('출석률 조항은 운영자도 조건으로 지정할 수 없다 — 조건 아님만 된다', () => {
  const base = proposeReading('출석률 90% 이상');
  const c = base.clauses[0];
  const key = `${c.index}:${c.original}`;
  const tried = applyOverrides(base, new Map([[key, 'MOODLE_ACTIVITY_COMPLETION.1']]));
  assert.equal(tried.readable, 0, '출석률을 활동 완료로 바꿔 넣었다');
  const held = applyOverrides(base, new Map([[key, 'NOT_A_CONDITION']]));
  assert.equal(held.clauses[0].source, 'operator');
  assert.ok(held.clauses[0].note.includes('조건이 아니라고'));
});

test('운영자 지정이 이미 읽은 조건과 겹치면 한 번만 넘긴다', () => {
  const base = proposeReading('숙제 제출; 알 수 없는 조항');
  const no = base.clauses.find((c) => !c.capability);
  const p = applyOverrides(base, new Map([[`${no.index}:${no.original}`, 'MOODLE_ASSIGNMENT_SUBMISSION.1']]));
  assert.equal(p.readable, 1);
  assert.equal(p.duplicates.length, 1);
});

test('원문이 바뀌면 옛 지정은 다른 문장에 붙지 않는다', () => {
  const a = proposeReading('알 수 없는 조항');
  const key = `${a.clauses[0].index}:${a.clauses[0].original}`;
  const over = new Map([[key, 'REFLECTION_REQUIRED_TOPICS.1']]);
  assert.equal(applyOverrides(a, over).readable, 1);
  const b = proposeReading('전혀 다른 조항');
  assert.equal(applyOverrides(b, over).readable, 0, '옛 지정이 새 문장에 붙었다');
});

test('빈 제안은 아무것도 넘기지 않는다', () => {
  const e = emptyProposal();
  assert.equal(e.readable, 0);
  assert.equal(e.canonicalText, '');
  assert.equal(e.complete, false);
});

test('화면이 못 읽은 조항에 직접 지정 상자를 붙이고 제안 출처를 적는다', () => {
  const restore = installDom();
  try {
    const a = createAdapter({ mode: DATA_MODE.SYNTHETIC, fixture: () => null });
    const panel = aiComparePanel({ adapter: a, source: '강의 완료; 이상한 문장 하나' });
    const text = panel.node.textContent;
    assert.ok(text.includes('프론트 규칙 기반 · 모델 아님'), '제안 출처가 없다');
    assert.ok(text.includes('직접 지정'), '직접 지정 상자가 없다');
    const selects = [...walk(panel.node)].filter((n) => n.tagName === 'SELECT');
    assert.equal(selects.length, 1, '못 읽은 조항 하나에만 상자가 붙어야 한다');
    // 출석률 조항은 경고 줄로만 보이고 지정 상자가 없다 — 조건으로 바꿀 길이 없어야 한다
    const p2 = aiComparePanel({ adapter: a, source: '출석률 90% 이상' });
    assert.ok(p2.node.textContent.includes('자동 검증 미지원 — 정책 확정 전 처리 필요 · 1개'), '출석률 경고가 없다');
    const opts = [...walk(p2.node)].filter((n) => n.tagName === 'OPTION').map((n) => n.textContent);
    assert.equal(opts.length, 0, '출석률 조항에 선택지가 열려 있다: ' + opts.join(', '));
  } finally { restore(); }
});

test('제안자를 갈아끼우면 출처 표시가 따라 바뀌고 확인 화면은 그대로다', () => {
  const restore = installDom();
  try {
    const a = createAdapter({ mode: DATA_MODE.SYNTHETIC, fixture: () => null });
    const gemini = { id: 'gemini', label: 'Gemini 제안 · 승인된 호출', propose: proposeReading };
    const panel = aiComparePanel({ adapter: a, source: '숙제 제출', proposer: gemini });
    const text = panel.node.textContent;
    assert.ok(text.includes('Gemini 제안 · 승인된 호출'), '제안자 라벨이 안 바뀌었다');
    assert.ok(!text.includes('모델 아님'), '규칙 라벨이 남아 있다');
    assert.ok(text.includes('읽기 제안') && text.includes('과제 제출'), '확인 화면이 사라졌다');
  } finally { restore(); }
});

// ── 실제 메타코드 안내문 ─────────────────────────────────────────────────

import { REAL_NOTICE } from '../src/bootcamp/finals-panels/fixtures.js';

test('실제 안내문에서 우리 조건 셋을 찾고 HackerRank 는 찾지 않는다', () => {
  const p = proposeReading(REAL_NOTICE);
  const caps = p.kept.map((c) => c.capability);
  assert.deepEqual(caps, [
    'MOODLE_ACTIVITY_COMPLETION.1', 'MOODLE_ASSIGNMENT_SUBMISSION.1', 'REFLECTION_REQUIRED_TOPICS.1',
  ], '찾은 조건이 다르다: ' + caps.join(', '));
  assert.ok(!caps.includes('HACKERRANK_CERTIFICATE_HOLDING.1'), '안내문에 없는 HackerRank 를 지어냈다');
  // 셋의 정규 문장은 15조합 안에 있어야 합성 모드에서 실제 결과가 나온다
  assert.ok(COMBOS[p.canonicalText], '정규 문장이 15조합에 없다');
});

test('실제 안내문의 못 하는 조건 넷을 전부 짚는다', () => {
  const p = proposeReading(REAL_NOTICE);
  const flagged = p.clauses.filter((c) => c.notOurs).map((c) => c.original);
  const expect = ['정답률', '출석률', '참석률', '(선택)'];
  for (const word of expect) {
    assert.ok(flagged.some((o) => o.includes(word)), word + ' 조항을 못 하는 조건으로 짚지 않았다 — ' + flagged.join(' | '));
  }
  // 인터뷰 줄을 후기(회고)로 오인하지 않는다
  const interview = p.clauses.find((c) => c.original.includes('인터뷰'));
  assert.equal(interview.capability, null, '(선택) 인터뷰를 회고로 읽었다');
});

test('제목 줄은 조항이 아니고, 괄호 안 쉼표에서 찢기지 않는다', () => {
  const p = proposeReading(REAL_NOTICE);
  assert.ok(!p.clauses.some((c) => c.original === '[환급 기준]'), '제목 줄이 조항으로 잡혔다');
  assert.ok(!p.clauses.some((c) => /^1회 면제/.test(c.original)), '괄호 안 쉼표에서 찢겼다');
  assert.ok(!p.clauses.some((c) => /^제세공과금/.test(c.original)), '금액 문장이 쉼표에서 찢겼다');
  assert.ok(!p.clauses.some((c) => /^-\s/.test(c.original)), '글머리표가 남았다');
});

test('화면은 찾은 조건만 펴고 나머지는 접는다', () => {
  const restore = installDom();
  try {
    const a = createAdapter({ mode: DATA_MODE.SYNTHETIC, fixture: (i) => COMBOS[i]?.payload ?? null });
    const panel = aiComparePanel({ adapter: a, source: REAL_NOTICE });
    const text = panel.node.textContent;
    assert.ok(text.includes('3개 조건을 찾았습니다 — 맞나요?'), '찾은 개수를 묻지 않는다 — ' + text.slice(0, 300));
    assert.ok(text.includes('자동 검증 미지원 — 정책 확정 전 처리 필요 · 4개'), '못 하는 조건 경고가 없다');
    const details = [...walk(panel.node)].find((n) => n.tagName === 'DETAILS');
    assert.ok(details, '읽지 않은 문장이 접혀 있지 않다');
    assert.ok(details.textContent.includes('만족도'), '만족도 줄이 접힌 쪽에 없다');
    // 찾은 목록에는 못 읽은 문장이 섞이면 안 된다
    const foundList = [...walk(panel.node)].find((n) => n.className === 'fp-proposal-list');
    assert.ok(!foundList.textContent.includes('만족도'), '찾은 목록에 못 읽은 문장이 섞였다');
  } finally { restore(); }
});

// ── ③ 도구 선택 근거와 도구별 실행 상태 ──────────────────────────────────

import { runStateOf } from '../src/bootcamp/finals-panels/ai-compare.js';

test('③ 도구 카드마다 읽는 조건과 "모델이 고른 것이 아니다" 가 적힌다', async () => {
  const restore = installDom();
  try {
    const a = createAdapter({ mode: DATA_MODE.SYNTHETIC, fixture: (i) => COMBOS[i]?.payload ?? null });
    const panel = aiComparePanel({ adapter: a, source: PRESETS[2].source });
    await a.request(PRESETS[2].source);
    const text = panel.node.textContent;
    const n = (text.match(/모델이 고른 것이 아닙니다/g) ?? []).length;
    assert.equal(n, 4, '도구 넷마다 선택 근거가 있어야 한다: ' + n);
    assert.ok(text.includes('HackerRank 인증서 검사') && text.includes('읽는 조건'));
  } finally { restore(); }
});

test('③ 과 ④ 사이에 도구별 실행 상태가 있고, 합성 결과가 오면 전부 완료다', async () => {
  const restore = installDom();
  try {
    const a = createAdapter({ mode: DATA_MODE.SYNTHETIC, fixture: (i) => COMBOS[i]?.payload ?? null });
    const panel = aiComparePanel({ adapter: a, source: PRESETS[1].source });
    await a.request(PRESETS[1].source);
    const titles = [...walk(panel.node)].filter((n) => n.className === 'fp-sec-title').map((n) => n.textContent);
    const i3 = titles.findIndex((t) => t.startsWith('③'));
    const iRun = titles.indexOf('도구별 실행 상태');
    const i4 = titles.findIndex((t) => t.startsWith('④'));
    assert.ok(i3 >= 0 && iRun > i3 && i4 > iRun, '순서가 ③ → 실행 상태 → ④ 여야 한다: ' + titles.join(' | '));
    const runs = [...walk(panel.node)].filter((n) => n.className === 'fp-run');
    assert.equal(runs.length, 3, '② 예문은 도구 셋');
    for (const r of runs) assert.equal(r.attributes['data-run'], 'done');
    assert.ok(panel.node.textContent.includes('도구 선택(③)과 실행은 다른 단계입니다'));
  } finally { restore(); }
});

test('실행 상태는 관측이 없을 때 이유를 가른다 — 계획 보류는 실패가 아니다', () => {
  assert.equal(runStateOf({ state: STATE.SUCCESS, check: { ok: true }, obs: { state: 'MET_IN_PUBLIC_FIXTURE' }, stale: false }).key, 'done');
  assert.equal(runStateOf({ state: STATE.STALE, check: { ok: true }, obs: {}, stale: true }).key, 'stale');
  assert.equal(runStateOf({ state: STATE.SUCCESS, check: { ok: false, errors: ['x'] }, obs: null, stale: false }).key, 'blocked');
  assert.equal(runStateOf({ state: STATE.LOADING, check: null, obs: null, stale: false }).key, 'running');
  assert.equal(runStateOf({ state: STATE.ERROR, check: null, obs: null, stale: false }).key, 'failed');
  assert.equal(runStateOf({ state: STATE.IDLE, check: null, obs: null, stale: false }).key, 'pending');
});

// ── 자동 검증 미지원이 남으면 전체 정책을 실행 가능으로 보지 않는다 (본부 11/4) ──

test('미지원 조건이 남은 채 구조화하면 결과가 성공이어도 전체 정책 실행 가능으로 보이지 않는다', async () => {
  const restore = installDom();
  try {
    const a = createAdapter({ mode: DATA_MODE.SYNTHETIC, fixture: (i) => COMBOS[i]?.payload ?? null });
    const panel = aiComparePanel({ adapter: a, source: '숙제 제출; 출석률 90% 이상' });
    assert.ok(panel.node.textContent.includes('자동 검증 미지원 — 정책 확정 전 처리 필요 · 1개'));
    const btn = [...walk(panel.node)].find((n) => n.tagName === 'BUTTON' && n.textContent.includes('읽은 것만 구조화'));
    for (const fn of btn.handlers.click ?? []) fn({});
    await settle();
    assert.equal(a.current.state, STATE.SUCCESS, '지원 조건 하나는 정상 구조화돼야 한다');
    const text = panel.node.textContent;
    assert.ok(text.includes('실행 가능으로 보지 않습니다'), '미지원이 남았는데 차단 문구가 없다');
    assert.ok(text.includes('지원 조건만 쪼갰습니다'), '성공 배너가 전체 성공처럼 읽힌다');
    assert.ok(!text.includes('지원 문법 안에서 모두 쪼갰습니다'));

    // 미지원이 없으면 차단 문구도 없다
    const clean = aiComparePanel({ adapter: createAdapter({ mode: DATA_MODE.SYNTHETIC, fixture: (i) => COMBOS[i]?.payload ?? null }), source: PRESETS[0].source });
    const b2 = [...walk(clean.node)].find((n) => n.tagName === 'BUTTON' && n.textContent.includes('이대로 구조화'));
    for (const fn of b2.handlers.click ?? []) fn({});
    await settle();
    assert.ok(!clean.node.textContent.includes('실행 가능으로 보지 않습니다'));
    assert.ok(clean.node.textContent.includes('지원 문법 안에서 모두 쪼갰습니다'));
  } finally { restore(); }
});

// ── 오규원 PR #160 리뷰 1·2번 ─────────────────────────────────────────────

test('초기 안내문이 있고 제안자가 비동기여도 첫 화면이 깨지지 않는다 (리뷰 1)', async () => {
  const restore = installDom();
  try {
    const a = createAdapter({ mode: DATA_MODE.SYNTHETIC, fixture: (i) => COMBOS[i]?.payload ?? null });
    const slow = { id: 'gemini', label: 'Gemini 제안 · 시험용', propose: async (t) => proposeReading(t) };
    let panel;
    assert.doesNotThrow(() => { panel = aiComparePanel({ adapter: a, source: PRESETS[0].source, proposer: slow }); });
    assert.ok(panel.node.textContent.includes('제안을 만드는 중'), '비동기 제안 대기 표시가 없다');
    await settle();
    assert.ok(panel.node.textContent.includes('2개 조건을 찾았습니다'), '비동기 제안 결과가 안 들어왔다');
  } finally { restore(); }
});

test('입력을 고치면 진행 중이던 요청의 늦은 응답은 버려진다 (리뷰 2)', async () => {
  let release;
  const slow = new Promise((r) => { release = r; });
  const a = createAdapter({ mode: DATA_MODE.ACTUAL, run: async () => slow });
  const p = a.request('첫 입력');
  assert.equal(a.current.state, STATE.LOADING);
  a.markStale('고친 입력');
  assert.equal(a.current.state, STATE.IDLE, '아직 결과가 없으니 idle 이어야 한다');
  release(COMBOS[PRESETS[0].source].payload);
  await p;
  assert.equal(a.current.payload, null, '늦은 응답이 새 입력의 결과처럼 들어왔다');
  assert.equal(a.current.state, STATE.IDLE);
  // 새 요청은 정상으로 돈다
  const b = createAdapter({ mode: DATA_MODE.ACTUAL, run: async (i) => COMBOS[i]?.payload ?? null });
  await b.request(PRESETS[0].source);
  assert.equal(b.current.state, STATE.SUCCESS);
});

// ── 원문 칸 타이핑 — 글자마다 다시 그리지 않는다 ──────────────────────────

test('원문을 치는 동안은 화면을 다시 그리지 않고, 손을 뗀 뒤 한 번만 제안을 갱신한다', async () => {
  const restore = installDom();
  try {
    const a = createAdapter({ mode: DATA_MODE.SYNTHETIC, fixture: (i) => COMBOS[i]?.payload ?? null });
    const panel = aiComparePanel({ adapter: a, source: '' });
    const ta = () => [...walk(panel.node)].find((n) => n.tagName === 'TEXTAREA');
    const first = ta();
    // 한글 조합 시작 → 글자 입력 → 아직 같은 요소여야 한다
    for (const fn of first.handlers.compositionstart ?? []) fn({});
    for (const fn of first.handlers.input ?? []) fn({ target: { value: '숙' } });
    for (const fn of first.handlers.input ?? []) fn({ target: { value: '숙제' } });
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(ta(), first, '조합 중에 textarea 가 새 요소로 바뀌었다');
    assert.ok(!panel.node.textContent.includes('1개 조건을 찾았습니다'), '조합 중에 제안을 갱신했다');
    // 조합 끝 → 잠시 뒤 한 번 갱신
    for (const fn of first.handlers.input ?? []) fn({ target: { value: '숙제 제출' } });
    for (const fn of first.handlers.compositionend ?? []) fn({});
    await new Promise((r) => setTimeout(r, 350));
    assert.ok(panel.node.textContent.includes('1개 조건을 찾았습니다'), '손을 뗀 뒤 제안이 갱신되지 않았다');
    assert.equal(ta().value, '숙제 제출', '다시 그린 칸에 글이 그대로 있어야 한다');
  } finally { restore(); }
});

// ── 쉼표 없이 붙여 쓴 한 문장에서 조건 여럿 ─────────────────────────────

test('"강의수강 후기적기 과제제출" 처럼 붙여 써도 셋을 다 찾는다', () => {
  const p = proposeReading('강의수강 후기적기 과제제출');
  assert.deepEqual(p.kept.map((c) => c.capability), [
    'MOODLE_ACTIVITY_COMPLETION.1', 'MOODLE_ASSIGNMENT_SUBMISSION.1', 'REFLECTION_REQUIRED_TOPICS.1',
  ], '찾은 조건: ' + p.kept.map((c) => c.capability).join(', '));
  assert.ok(COMBOS[p.canonicalText], '정규 문장이 15조합에 없다');
  // 같은 원문이 세 줄로 보이지만 index 는 겹치지 않는다
  assert.deepEqual(p.clauses.map((c) => c.index), [0, 1, 2]);
  // 후기 '적기' 가 회고로 읽힌다. (선택) 인터뷰는 여전히 아니다
  assert.equal(proposeReading('후기 적어 주세요').kept[0]?.capability, 'REFLECTION_REQUIRED_TOPICS.1');
  assert.equal(proposeReading('(선택) 수료 후기 인터뷰 촬영').kept.length, 0);
  // 실제 안내문은 여전히 셋만 — 한 줄에서 둘이 겹쳐 잡히지 않는다
  assert.equal(proposeReading(REAL_NOTICE).kept.length, 3);
});

// ── PR #164 리뷰 1 · 원문을 고친 직후 실행해도 이전 조건을 보내지 않는다 ─────────

const runBtn = (node) => [...walk(node)].find((n) => n.tagName === 'BUTTON' && String(n.className).includes('fp-btn'));
const press = (n) => { for (const fn of n.handlers.click ?? []) fn({}); };
const typeInto = (ta, value) => { for (const fn of ta.handlers.input ?? []) fn({ target: { value } }); };
const textarea = (node) => [...walk(node)].find((n) => n.tagName === 'TEXTAREA');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('원문을 고치고 250ms 안에 「이대로 구조화」 를 눌러도 이전 조건이 나가지 않는다 (PR #164 리뷰 1)', async () => {
  const restore = installDom();
  try {
    const sent = [];
    const a = createAdapter({ mode: DATA_MODE.SYNTHETIC, fixture: (i) => { sent.push(i); return COMBOS[i]?.payload ?? null; } });
    const panel = aiComparePanel({ adapter: a, source: '강의 수강' });
    const before = runBtn(panel.node);
    assert.equal(before.textContent.trim(), '이대로 구조화');
    typeInto(textarea(panel.node), '과제 제출');
    // 화면은 아직 다시 그리지 않았지만 이 버튼은 그 자리에서 잠겼다
    assert.equal(before.attributes.disabled, 'disabled', '입력 직후 실행 버튼이 잠기지 않았다');
    assert.equal(before.textContent.trim(), '원문 반영 중…');
    press(before);
    assert.deepEqual(sent, [], '입력 직후 이전 원문의 조건이 전송됐다');
    // 새 원문의 제안이 준비되면 그 조건으로만 나간다
    await wait(350);
    const after = runBtn(panel.node);
    assert.equal(after.textContent.trim(), '이대로 구조화');
    press(after);
    assert.deepEqual(sent, ['Moodle 과제 제출']);
  } finally { restore(); }
});

test('한글 조합이 시작되면 이미 예약된 갱신이 원문 칸을 다시 그리지 않고, 그동안 실행도 막힌다', async () => {
  const restore = installDom();
  try {
    const sent = [];
    const a = createAdapter({ mode: DATA_MODE.SYNTHETIC, fixture: (i) => { sent.push(i); return COMBOS[i]?.payload ?? null; } });
    const panel = aiComparePanel({ adapter: a, source: '강의 수강' });
    const ta = textarea(panel.node);
    typeInto(ta, '강의 수강 ');            // 조합 없이 한 글자 — 갱신이 예약된다
    for (const fn of ta.handlers.compositionstart ?? []) fn({});
    typeInto(ta, '강의 수강 과');          // 예약된 갱신이 돌 시간이 지나도
    await wait(320);
    assert.equal(textarea(panel.node), ta, '조합 중에 예약된 타이머가 원문 칸을 다시 그렸다');
    press(runBtn(panel.node));
    assert.deepEqual(sent, [], '조합 중에 이전 제안으로 실행됐다');
    typeInto(ta, '강의 수강 과제 제출');
    for (const fn of ta.handlers.compositionend ?? []) fn({});
    await wait(350);
    assert.ok(panel.node.textContent.includes('2개 조건을 찾았습니다'), '조합이 끝난 뒤 제안이 갱신되지 않았다');
    assert.equal(textarea(panel.node).value, '강의 수강 과제 제출');
    press(runBtn(panel.node));
    assert.deepEqual(sent, ['Moodle 활동 완료; Moodle 과제 제출']);
  } finally { restore(); }
});

test('이전 원문의 비동기 제안이 늦게 와도 새 입력에 반영되지 않는다', async () => {
  const restore = installDom();
  try {
    const pending = new Map();
    const proposer = {
      id: 'gemini', label: 'Gemini 제안 · 시험용',
      propose: (t) => new Promise((resolve) => { pending.set(t, () => resolve(proposeReading(t))); }),
    };
    const sent = [];
    const a = createAdapter({ mode: DATA_MODE.SYNTHETIC, fixture: (i) => { sent.push(i); return COMBOS[i]?.payload ?? null; } });
    const panel = aiComparePanel({ adapter: a, source: '강의 수강', proposer });
    typeInto(textarea(panel.node), '과제 제출');
    pending.get('강의 수강')();           // 이전 원문의 제안이 늦게 도착
    await settle();
    press(runBtn(panel.node));
    assert.deepEqual(sent, [], '늦게 온 이전 제안으로 실행됐다');
    await wait(350);                       // 새 원문의 제안을 요청한다(아직 안 옴)
    const foundRows = [...walk(panel.node)].filter((n) => n.attributes?.['data-read'] === 'yes');
    assert.equal(foundRows.length, 0, '늦게 온 이전 제안이 화면에 들어왔다');
    assert.ok(panel.node.textContent.includes('제안을 만드는 중'));
    press(runBtn(panel.node));
    assert.deepEqual(sent, [], '새 제안이 오기 전에 실행됐다');
    pending.get('과제 제출')();
    await settle();
    press(runBtn(panel.node));
    assert.deepEqual(sent, ['Moodle 과제 제출']);
  } finally { restore(); }
});

test('원문을 고치는 순간 진행 중이던 구조화 요청의 응답은 버려진다', async () => {
  const restore = installDom();
  try {
    let release;
    const a = createAdapter({ mode: DATA_MODE.ACTUAL, run: () => new Promise((r) => { release = r; }) });
    const panel = aiComparePanel({ adapter: a, source: '강의 수강' });
    press(runBtn(panel.node));
    assert.equal(a.current.state, STATE.LOADING);
    typeInto(textarea(panel.node), '과제 제출');
    assert.notEqual(a.current.state, STATE.LOADING, '입력 직후에도 이전 요청이 진행 중으로 남았다');
    release(COMBOS['Moodle 활동 완료'].payload);
    await settle();
    assert.equal(a.current.payload, null, '이전 원문의 응답이 새 입력의 결과로 들어왔다');
    await wait(320);                       // 예약된 갱신까지 끝난 뒤에도 그대로
    assert.equal(a.current.payload, null);
    assert.equal(runBtn(panel.node).textContent.trim(), '이대로 구조화');
  } finally { restore(); }
});

// ── PR #164 리뷰 2 · 대안·대체 조건을 '모두 필요' 로 바꾸지 않는다 ─────────────

test('「또는」·「대신」 조항은 자동 변환을 보류하고, 복수 필수 조건은 그대로 셋으로 읽는다 (PR #164 리뷰 2)', () => {
  const alt = proposeReading('강의 수강 또는 과제 제출');
  assert.equal(alt.readable, 0, '대안 조건을 필수 조건으로 바꿨다: ' + alt.canonicalText);
  assert.equal(alt.complete, false);
  assert.equal(alt.held, 1);
  assert.equal(alt.clauses[0].relation, 'ALTERNATIVE');
  assert.equal(alt.clauses[0].original, '강의 수강 또는 과제 제출');
  assert.deepEqual(new Set(alt.clauses[0].mentions), new Set(['MOODLE_ACTIVITY_COMPLETION.1', 'MOODLE_ASSIGNMENT_SUBMISSION.1']));
  assert.match(alt.clauses[0].note, /모두 필요/);

  const sub = proposeReading('과제 제출 대신 후기 작성');
  assert.equal(sub.readable, 0, '대체 조건을 필수 조건으로 바꿨다: ' + sub.canonicalText);
  assert.equal(sub.complete, false);
  assert.equal(sub.clauses[0].relation, 'SUBSTITUTE');
  assert.deepEqual(new Set(sub.clauses[0].mentions), new Set(['MOODLE_ASSIGNMENT_SUBMISSION.1', 'REFLECTION_REQUIRED_TOPICS.1']));

  const all = proposeReading('강의수강 후기적기 과제제출');
  assert.deepEqual(all.kept.map((c) => c.capability), [
    'MOODLE_ACTIVITY_COMPLETION.1', 'MOODLE_ASSIGNMENT_SUBMISSION.1', 'REFLECTION_REQUIRED_TOPICS.1',
  ]);
  assert.equal(all.complete, true);
  assert.equal(all.held, 0);
});

test('대안 관계는 쉼표로 나뉘어도 보류하고, 다른 조항을 읽었다고 전체를 읽었다고 하지 않는다', () => {
  // 쉼표에서 나눴다면 두 조각이 각각 필수로 읽혔을 것이다
  const comma = proposeReading('강의를 듣거나, 과제를 제출');
  assert.equal(comma.readable, 0);
  assert.equal(comma.held, 1);
  // 보류 조항 + 정상 조항 — 정상 조항만 읽고 complete 는 아니다
  const mixed = proposeReading('강의 수강 또는 과제 제출. 회고 작성');
  assert.deepEqual(mixed.kept.map((c) => c.capability), ['REFLECTION_REQUIRED_TOPICS.1']);
  assert.equal(mixed.complete, false, '보류 조항이 있는데 전체를 읽었다고 했다');
  // 조건이 하나뿐인 '또는' 은 관계가 아니다 — 그대로 읽는다
  const one = proposeReading('과제 제출 또는 업로드');
  assert.equal(one.readable, 1);
  assert.equal(one.complete, true);
  // '하나' 의 '나' 는 대안이 아니다
  assert.equal(proposeReading('과제 하나 제출하고 강의 수강').readable, 2);
  // 운영자 지정으로도 보류 조항을 한 조건으로 덮지 않는다
  const key = `${alt0().index}:${alt0().original}`;
  const tried = applyOverrides(proposeReading('강의 수강 또는 과제 제출'), new Map([[key, 'MOODLE_ACTIVITY_COMPLETION.1']]));
  assert.equal(tried.readable, 0);
  assert.equal(tried.complete, false);
  function alt0() { return proposeReading('강의 수강 또는 과제 제출').clauses[0]; }
});

test('화면이 보류 조항의 원문과 이유를 남기고, 나머지만 구조화해도 전체 정책 실행 가능으로 보이지 않는다', async () => {
  const restore = installDom();
  try {
    const sent = [];
    const a = createAdapter({ mode: DATA_MODE.SYNTHETIC, fixture: (i) => { sent.push(i); return COMBOS[i]?.payload ?? null; } });
    const panel = aiComparePanel({ adapter: a, source: '강의 수강 또는 과제 제출. 회고 작성' });
    let text = panel.node.textContent;
    assert.ok(text.includes('자동 변환 보류 — 조건 관계 확인 필요 · 1개'));
    assert.ok(text.includes('"강의 수강 또는 과제 제출"'), '보류 조항의 원문이 없다');
    assert.ok(text.includes('모두 필요'), '보류 이유가 없다');
    assert.ok(text.includes('문장에 보인 조건:'));
    const btn = runBtn(panel.node);
    assert.equal(btn.textContent.trim(), '읽은 것만 구조화', '보류 조항이 있는데 「이대로 구조화」 로 보인다');
    press(btn);
    await settle();
    assert.deepEqual(sent, ['회고에 수행 내용, 문제해결 과정, 배운 점 포함'], '보류 조항이 함께 넘어갔다');
    assert.equal(a.current.state, STATE.SUCCESS);
    text = panel.node.textContent;
    assert.ok(text.includes('조건 관계(또는·대신) 확인이 필요한 조항 1개'), '차단 문구에 보류 조항이 없다');
    assert.ok(text.includes('실행 가능으로 보지 않습니다'));
    assert.ok(!text.includes('지원 문법 안에서 모두 쪼갰습니다'), '성공 배너가 전체 성공처럼 읽힌다');

    // 보류 조항만 있으면 실행할 것이 없다
    const only = aiComparePanel({ adapter: createAdapter({ mode: DATA_MODE.SYNTHETIC, fixture: () => null }), source: '과제 제출 대신 후기 작성' });
    assert.equal(runBtn(only.node).attributes.disabled, 'disabled');
    assert.ok(only.node.textContent.includes('조건 사이의 관계를 확인해야 해서'));
  } finally { restore(); }
});

// ── Gemini 제안자 자리 — 명시적 생성 · 출처 배지 · 서버 보류 (오규원 11/5) ──────

import { OFFLINE_GEMINI_PROPOSER } from '../src/bootcamp/finals-panels/gemini-fixture.js';

const geminiPanel = (source) => {
  const a = createAdapter({ mode: DATA_MODE.SYNTHETIC, fixture: (i) => COMBOS[i]?.payload ?? null });
  return { a, panel: aiComparePanel({ adapter: a, source, proposer: OFFLINE_GEMINI_PROPOSER }) };
};
const byRole = (node, role) => [...walk(node)].find((n) => n.attributes?.['data-role'] === role);
const clickOn = (btn) => { for (const fn of btn.handlers.click ?? []) fn({}); };

test('Gemini 제안자는 첫 화면·입력에서 부르지 않고 「제안 생성」 을 눌러야 돈다', async () => {
  const restore = installDom();
  try {
    const { panel } = geminiPanel(PRESETS[0].source);
    await settle();
    let text = panel.node.textContent;
    assert.ok(!text.includes('개 조건을 찾았습니다'), '버튼 전에 제안이 생겼다');
    assert.ok(text.includes('「제안 생성」 을 눌러야 호출'), '생성 전 배지가 없다');
    const gen = byRole(panel.node, 'generate');
    assert.ok(gen, '제안 생성 버튼이 없다');
    assert.equal(gen.attributes.disabled, undefined);
    clickOn(gen);
    await settle();
    text = panel.node.textContent;
    assert.ok(text.includes('2개 조건을 찾았습니다'), '생성 뒤 제안이 없다: ' + text.slice(0, 200));
    assert.ok(text.includes('Gemini 오프라인 응답 대역 · 실제 호출 아님'), '출처 배지가 대역임을 안 적었다');
    assert.ok(!text.includes('Gemini 실제 호출'), '실제 호출이라고 적었다');
  } finally { restore(); }
});

test('Gemini 제안은 표시 전용 — 구조화 버튼은 잠기고 규칙·fixture 실행기로 넘어가지 않는다', async () => {
  const restore = installDom();
  try {
    const { a, panel } = geminiPanel(PRESETS[0].source);
    clickOn(byRole(panel.node, 'generate'));
    await settle();
    const run = [...walk(panel.node)].find((n) => n.tagName === 'BUTTON' && n.textContent.includes('표시 전용'));
    assert.ok(run, '표시 전용 버튼이 없다');
    assert.equal(run.attributes.disabled, 'disabled');
    clickOn(run);
    await settle();
    assert.equal(a.current.state, STATE.IDLE, '서버 제안이 실행기로 넘어갔다');
    assert.ok(panel.node.textContent.includes('실행은 CLEAR 서버가 중계하는 경로가 붙은 뒤'));
  } finally { restore(); }
});

test('원문을 고치면 Gemini 제안은 비워지고 자동으로 다시 부르지 않는다', async () => {
  const restore = installDom();
  try {
    const { panel } = geminiPanel(PRESETS[0].source);
    clickOn(byRole(panel.node, 'generate'));
    await settle();
    assert.ok(panel.node.textContent.includes('2개 조건을 찾았습니다'));
    const ta = [...walk(panel.node)].find((n) => n.tagName === 'TEXTAREA');
    for (const fn of ta.handlers.input ?? []) fn({ target: { value: PRESETS[0].source + '; 회고 작성' } });
    await new Promise((r) => setTimeout(r, 400));
    await settle();
    const text = panel.node.textContent;
    assert.ok(!text.includes('개 조건을 찾았습니다'), '고친 뒤에도 이전 제안이 남아 있다');
    assert.ok(text.includes('「제안 생성」 을 눌러야 호출'), '자동으로 다시 불렀거나 배지가 안 돌아왔다');
  } finally { restore(); }
});

test('서버가 보류한 조항은 사유를 보이고 직접 지정 상자가 없다 — 한 문장 여러 조건', async () => {
  const restore = installDom();
  try {
    const { panel } = geminiPanel('강의수강 후기적기 과제제출');
    clickOn(byRole(panel.node, 'generate'));
    await settle();
    const text = panel.node.textContent;
    assert.ok(text.includes('자동 변환 보류'), '보류 묶음이 없다');
    assert.ok(text.includes('서버 보류 사유: MULTIPLE_CONDITIONS'), '서버 보류 사유가 없다: ' + text.slice(0, 300));
    assert.ok(!text.includes('개 조건을 찾았습니다'), '보류인데 조건을 찾았다고 했다');
    assert.equal([...walk(panel.node)].filter((n) => n.tagName === 'SELECT').length, 0, '서버 보류 조항에 직접 지정 상자가 열렸다');
    // 규칙 제안자였다면 셋을 찾았을 문장이다 — 서버 계약에선 쪼개지 않는다
    assert.equal(proposeReading('강의수강 후기적기 과제제출').kept.length, 3);
  } finally { restore(); }
});

// ── A 칸은 실행 결과가 아니라 **제안**을 따라간다 ─────────────────────────────
//
// Gemini·서버 중계 모드는 표시 전용이라 실행이 없다. 그래도 운영자는 찾은 조건마다
// Moodle 항목을 지정해 봐야 하므로, 강좌 연결 칸은 B 가 찾은 조건 종류를 따라간다.
// 글자마다 다시 그려도 종류 목록이 같으면 다시 알리지 않는다(운영자 선택이 지워지니까).

test('onProposal: 찾은 조건 종류가 바뀔 때만 알리고, 나중에 끼워도(setOnProposal) 바로 한 번 알린다', async () => {
  const restore = installDom();
  try {
    const seen = [];
    const adapter = createAdapter({ mode: DATA_MODE.SYNTHETIC, fixture: (input) => COMBOS[input]?.payload ?? null, run: null });
    const panel = aiComparePanel({ adapter, source: PRESETS[0].source, presets: [], onProposal: (caps) => seen.push(caps) });
    await settle();
    assert.ok(seen.length >= 1, '처음 그릴 때 한 번 알려야 한다');
    assert.deepEqual(seen.at(-1), ['MOODLE_ACTIVITY_COMPLETION.1', 'MOODLE_ASSIGNMENT_SUBMISSION.1'], '① 예문은 활동+과제');
    const n = seen.length;
    panel.render(); panel.render();
    assert.equal(seen.length, n, '같은 목록이면 다시 알리지 않는다');

    const late = [];
    panel.setOnProposal((caps) => late.push(caps));
    assert.deepEqual(late, [['MOODLE_ACTIVITY_COMPLETION.1', 'MOODLE_ASSIGNMENT_SUBMISSION.1']], '나중에 끼우면 지금 목록을 바로 한 번');

    // Gemini 대역(표시 전용)에서도 제안 생성 뒤 알린다 — 실행이 없어도 A 칸이 선다
    const gem = [];
    const g = aiComparePanel({ adapter, source: PRESETS[0].source, presets: [], proposer: OFFLINE_GEMINI_PROPOSER, onProposal: (caps) => gem.push(caps) });
    await settle();
    assert.deepEqual(gem.at(-1), [], '생성 전엔 빈 목록');
    g.generate();
    await settle();
    assert.deepEqual(gem.at(-1), ['MOODLE_ACTIVITY_COMPLETION.1', 'MOODLE_ASSIGNMENT_SUBMISSION.1'], '생성 뒤 찾은 종류');
  } finally { restore(); }
});

// ── 실제 모드에는 대역을 끼우지 않는다 ───────────────────────────────────────
//
// ?mode=ACTUAL&proposer=gemini 에서 오프라인 대역이 "2개 조건을 찾았습니다" 를 내면
// 실제 모드가 합성으로 떨어진 것이다(11/5 화면 재현). 자리만 같고 누르면 미연결이다.

import { mountFinalsPreview, UNCONNECTED_MODEL_PROPOSER } from '../src/bootcamp/finals-panels/preview.js';

test('실제 모드 + Gemini/운영자 중계 자리: 「제안 생성」 을 눌러도 보내지 않고 미연결 결과 상자만 보인다', async () => {
  const restore = installDom();
  try {
    for (const proposer of ['gemini', 'operator']) {
      const root = document.createElement('div');
      mountFinalsPreview(root, { mode: DATA_MODE.ACTUAL, proposer });
      await settle();
      const gen = [...walk(root)].find((n) => n.attributes?.['data-role'] === 'generate');
      assert.ok(gen, proposer + ': 「제안 생성」 자리가 있어야 한다');
      for (const f of gen.handlers.click ?? []) f({ preventDefault() {} });
      await settle();
      const box = [...walk(root)].find((n) => n.attributes?.['data-role'] === 'relay-outcome');
      assert.ok(box, proposer + ': 미연결 결과 상자가 없다');
      assert.equal(box.attributes['data-outcome'], 'FAILED');
      const text = root.textContent;
      assert.ok(!/개 조건을 찾았습니다/.test(text), proposer + ': 실제 모드에서 대역 결과가 나왔다');
      assert.ok(/보내지 않/.test(text), proposer + ': 보내지 않았다는 말이 없다');
      assert.ok(!/오프라인 응답 대역/.test(text), proposer + ': 실제 모드에 대역 배지가 보인다');
    }
    assert.equal(UNCONNECTED_MODEL_PROPOSER.explicit, true);
  } finally { restore(); }
});
