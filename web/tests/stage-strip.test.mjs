// 상단 단계 띠 — 상태 분기만 본다 (오규원 11/6 수정 요청 1·2·3)
//
//   1  종료·차단·판정 아님을 양측 확인보다 먼저 본다. 미해결 종료는 조건 미충족과 구분한다
//   2  '조회 중' 과 '재확인 요청 접수' 를 tracker 의 실제 refresh 상태로 구분한다
//   3  회고: 없음(ABSENT/MISSING)과 불확실(UNCERTAIN)을 나누고, 실제 연결 전엔 "다시 검토를 요청" 이라 하지 않는다

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { participantStage, conditionsLine, STAGE } from '../src/bootcamp/condition-return/stage-strip.js';
import { bootcampView } from '../src/fixtures/bootcamp.js';

const LIVE = { state: 'LIVE' };

// ── 1 · 종료·차단 우선 ───────────────────────────────────────────────────

test('미해결 종료(UNRESOLVED_OBJECTION)는 "운영자 확인 대기" 가 아니라 종료라고 말하고, 조건 미충족과 구분한다', () => {
  const view = bootcampView('unresolved', 'participant');
  const s = participantStage({ view, conn: LIVE });
  assert.equal(s.stage, STAGE.CONFIRM, '조건은 다 채운 종료라 양측 확인 단계 자리에서 종료를 말한다');
  assert.match(s.line.text, /확인 절차가 종료/);
  assert.match(s.line.text, /오류 신고가 정해진 시간 안에 해결되지 않았습니다/);
  assert.match(s.line.text, /미충족으로 확정된 것은 아닙니다/);
  assert.doesNotMatch(s.line.text, /운영자 확인 대기|지급 처리를 기다립니다|기다리면/);
  assert.equal(s.action, null);
});

test('조건을 못 채운 채 종료되면 조건 확인 단계에서 종료를 말하고 충족 수를 적는다', () => {
  const base = bootcampView('inProgress', 'participant');
  const view = { ...base, procedure: { ...base.procedure, terminationReason: 'EVIDENCE_INVALIDATED' } };
  const s = participantStage({ view, conn: LIVE });
  assert.equal(s.stage, STAGE.CONDITIONS);
  assert.match(s.line.text, /근거가 무효가 되었습니다/);
  assert.match(s.line.text, /3\/4/);
});

test('오류 신고가 걸려 있으면 양측 확인보다 먼저 말하고, 지급이 진행되지 않는다고 적는다', () => {
  const base = bootcampView('paid', 'participant');
  const view = { ...base, payment: { ...base.payment, claimState: null, receivedAtoms: null }, objection: { blocked: true, phase: 'RECEIVED' } };
  const s = participantStage({ view, conn: LIVE });
  assert.match(s.line.text, /오류 신고를 접수했습니다/);
  assert.match(s.line.text, /지급이 진행되지 않습니다/);
  assert.doesNotMatch(s.line.text, /운영자 확인 대기/);
});

test('지금 판정이 아니면(current=false) 진행하지 않는다고만 말한다', () => {
  const base = bootcampView('shortfall', 'participant');
  const view = { ...base, decision: { ...base.decision, current: false } };
  assert.match(participantStage({ view, conn: LIVE }).line.text, /지금 판정이 아닙니다/);
});

test('지급 완료 · 양측 확인 · 조건 진행은 기존 fixture 대로 갈린다', () => {
  assert.equal(participantStage({ view: bootcampView('paid', 'participant'), conn: LIVE }).stage, STAGE.PAID);
  assert.match(participantStage({ view: bootcampView('paid', 'participant'), conn: LIVE }).line.text, /100 TEST를 받았습니다/);
  const p = participantStage({ view: bootcampView('inProgress', 'participant'), conn: LIVE });
  assert.equal(p.stage, STAGE.CONDITIONS);
  assert.match(p.line.text, /4개 조건 중 3개/);
  assert.doesNotMatch(p.line.text, /먼저/);
  const f = participantStage({ view: bootcampView('shortfall', 'participant'), conn: LIVE });
  assert.match(f.line.text, /환급 재원이 확보되면/);
  const out = participantStage({ view: bootcampView('inProgress', 'participant'), conn: { state: 'SIGNED_OUT' }, onSignIn: () => {} });
  assert.equal(out.stage, STAGE.CONNECT);
  assert.equal(out.action?.label, '로그인');
});

test('띠 문구는 대시보드 문체 규칙(합니다체)을 따른다 — 해요체 서술문 없음', () => {
  const texts = [];
  for (const id of ['inProgress', 'paid', 'shortfall', 'unresolved']) texts.push(participantStage({ view: bootcampView(id, 'participant'), conn: LIVE }).line.text);
  for (const t of [conditionsLine({ met: 2, lacking: ['회고 작성'] }), conditionsLine({ met: 4 }), conditionsLine({ refresh: { queued: 1 } }), conditionsLine({ refresh: { reading: 1 } })]) texts.push(t.text);
  for (const t of texts) assert.doesNotMatch(t, /(어요|예요|에요)/, t);
});

// ── 2 · 조회 중 / 접수 / 제한 / 실패 ─────────────────────────────────────

test('재확인 요청 접수(QUEUED)일 때만 "접수했습니다", 요청 없이 읽는 중이면 "최신 판정을 확인하고 있습니다"', () => {
  assert.match(conditionsLine({ met: 2, refresh: { queued: 1, reading: 0 } }).text, /재확인 요청을 접수했습니다/);
  const reading = conditionsLine({ met: 2, refresh: { queued: 0, reading: 1 } });
  assert.match(reading.text, /최신 판정을 확인하고 있습니다/);
  assert.doesNotMatch(reading.text, /접수/);
  assert.match(conditionsLine({ met: 2, refresh: { rateLimited: 1 } }).text, /방금 보내서 잠시 뒤 다시 요청합니다/);
  assert.match(conditionsLine({ met: 2, refresh: { failed: 1 } }).text, /보내지 못했습니다/);
  assert.match(conditionsLine({ met: 2, lacking: ['회고 작성'], refresh: { unavailable: 1 } }).text, /재확인을 지원하지 않습니다/);
  assert.match(conditionsLine({ met: 2, fetchFailed: true }).text, /판정을 읽지 못한 조건/);
});

// ── 3 · 회고: 없음 / 불확실 / 실제 연결 전 안내 ───────────────────────────

test('회고 블록은 없음(ABSENT)과 불확실(UNCERTAIN)을 나누고, 실제 모드에선 "다시 검토를 요청" 이라 하지 않는다', async () => {
  // 작은 DOM 대역
  class Node { constructor(t) { this.tagName = String(t).toUpperCase(); this.children = []; this.attributes = {}; this.className = ''; this._text = ''; }
    set textContent(v) { this._text = String(v); this.children = []; }
    get textContent() { return this._text + this.children.map((c) => c.textContent ?? '').join(' '); }
    setAttribute(k, v) { this.attributes[k] = String(v); } addEventListener() {} append(...n) { this.children.push(...n); } }
  globalThis.document = { createElement: (t) => new Node(t), createElementNS: (_, t) => new Node(t), createTextNode: (t) => ({ textContent: String(t), children: [] }) };
  try {
    const { reflectionReview } = await import('../src/bootcamp/condition-return/status.js');
    const { reflectionBlock } = await import('../src/bootcamp/condition-return/cards.js');
    const row = { criterionId: 'reflection-topics', state: 'NOT_MET', evidenceId: 'e1', reasonCode: null };
    const ev = (states) => ({ metadataStatus: 'RECORDED', checks: { topics: [
      { topicId: 'work-performed', state: 'PRESENT', location: { start: 0, end: 5 } },
      { topicId: 'problem-solving-process', state: states[0], location: null },
      { topicId: 'learning-takeaway', state: states[1], location: null },
    ] } });
    const link = { status: 'LINKED', name: '회고 게시판', href: 'https://moodle.example.test/mod/forum/post.php?forum=31', where: '회고 작성 화면' };

    const absent = reflectionBlock(reflectionReview({ row, evRow: ev(['ABSENT', 'PRESENT']) }), link, { demo: false }).textContent;
    assert.match(absent, /문제 해결 과정 내용이 부족해요/);
    assert.match(absent, /보완 방법/);
    assert.match(absent, /저장된 판정을 다시 읽어요/, '실제 모드는 저장된 판정을 다시 읽는다고 말한다');
    assert.doesNotMatch(absent, /다시 검토를 요청/);

    const demo = reflectionBlock(reflectionReview({ row, evRow: ev(['ABSENT', 'PRESENT']) }), link, { demo: true }).textContent;
    assert.match(demo, /다시 검토를 요청/);

    const uncertain = reflectionBlock(reflectionReview({ row, evRow: ev(['UNCERTAIN', 'PRESENT']) }), link, { demo: false }).textContent;
    assert.match(uncertain, /판단하기 어려워요/);
    assert.doesNotMatch(uncertain, /내용이 부족해요/);
    assert.doesNotMatch(uncertain, /보완 방법/, '불확실뿐이면 다시 쓰라고 단정하지 않는다');
    assert.match(uncertain, /판단하기 어려운 내용/);
    assert.match(uncertain, /없다는 뜻은 아니에요/);
  } finally { delete globalThis.document; }
});
