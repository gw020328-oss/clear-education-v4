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

test('지급 권리가 수락된 뒤 검토 상한이 지나 REVIEW_CAP_UNRESOLVED 가 남아도 종료가 아니라 지급 단계를 말한다 (오규원 11/6 밤)', () => {
  const base = bootcampView('paid', 'participant');
  // 로컬 체인: CLAIMED + 영수증 INCLUDED, 최종 확정 전. A 는 procedure.terminationReason 을 남긴다.
  const view = {
    ...base,
    payment: { ...base.payment, claimState: 'INCLUDED', receivedAtoms: null },
    procedure: { ...base.procedure, status: 'ACCEPTED_RIGHT_PRESERVED', terminationReason: 'REVIEW_CAP_UNRESOLVED' },
  };
  const s = participantStage({ view, conn: LIVE });
  assert.equal(s.stage, STAGE.CONFIRM);
  assert.match(s.line.text, /지급 거래를 보냈습니다. 블록체인에서 완료를 확인하고 있습니다/);
  assert.doesNotMatch(s.line.text, /종료|운영자에게 문의/);
  // 같은 사유라도 지급 권리가 없으면 종료를 말하고, 사유 문구가 사전에 있다
  const noRight = { ...view, payment: { ...view.payment, acceptedRight: null, claimState: null, transactionState: null } };
  const e = participantStage({ view: noRight, conn: LIVE });
  assert.match(e.line.text, /확인 절차가 종료되었습니다 · 검토 기한 안에 결론이 나지 않았습니다/);
  // 지급 완료는 여전히 FINALIZED + 수령액일 때만
  const fin = { ...view, payment: { ...base.payment } };
  assert.equal(participantStage({ view: fin, conn: LIVE }).stage, STAGE.PAID);
});

test('예외는 REVIEW_CAP_UNRESOLVED + 권리 보존에 한정 — 다른 종료·이의·연결 오류는 지급 권리가 있어도 먼저 보인다', () => {
  const base = bootcampView('paid', 'participant');
  const inFlight = { ...base.payment, claimState: 'INCLUDED', receivedAtoms: null };   // acceptedRight 는 그대로
  const withProc = (status, terminationReason, extra = {}) => ({
    ...base, ...extra, payment: inFlight, procedure: { ...base.procedure, status, terminationReason },
  });
  // 1) 같은 사유라도 절차 상태가 권리 보존이 아니면 종료
  assert.match(participantStage({ view: withProc('CONTRACT_TERMINATED', 'REVIEW_CAP_UNRESOLVED'), conn: LIVE }).line.text, /확인 절차가 종료되었습니다 · 검토 기한 안에/);
  // 2) 권리 보존 상태라도 다른 종료 사유는 종료
  for (const [reason, text] of [['UNRESOLVED_OBJECTION', /오류 신고가 정해진 시간 안에/], ['REVALIDATION_EXHAUSTED', /재검증 횟수를 다 썼는데/], ['EVIDENCE_INVALIDATED', /근거가 무효가/]]) {
    const s = participantStage({ view: withProc('ACCEPTED_RIGHT_PRESERVED', reason), conn: LIVE });
    assert.match(s.line.text, /확인 절차가 종료되었습니다/, reason);
    assert.match(s.line.text, text, reason);
    assert.doesNotMatch(s.line.text, /지급 거래를 보냈습니다/, reason);
  }
  // 3) 이의가 걸려 있으면 지급 권리가 있어도 이의가 먼저
  const obj = withProc('ACCEPTED_RIGHT_PRESERVED', 'REVIEW_CAP_UNRESOLVED', { objection: { blocked: true, phase: 'RECEIVED' } });
  assert.match(participantStage({ view: obj, conn: LIVE }).line.text, /오류 신고를 접수했습니다/);
  // 4) 연결이 끊겼으면 무엇보다 먼저 연결 단계
  const out = participantStage({ view: withProc('ACCEPTED_RIGHT_PRESERVED', 'REVIEW_CAP_UNRESOLVED'), conn: { state: 'SIGNED_OUT' }, onSignIn: () => {} });
  assert.equal(out.stage, STAGE.CONNECT);
  // 5) 지금 판정이 아니면 그것이 먼저
  const stale = { ...withProc('ACCEPTED_RIGHT_PRESERVED', 'REVIEW_CAP_UNRESOLVED'), decision: { ...base.decision, current: false } };
  assert.match(participantStage({ view: stale, conn: LIVE }).line.text, /지금 판정이 아닙니다/);
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
    // 오규원 11/6 보완: 불확실 안내도 실제 모드에선 "다시 검토" 를 약속하지 않고 저장된 판정을 다시 확인한다고 말한다
    assert.doesNotMatch(uncertain, /다시 검토/, '실제 모드 UNCERTAIN 안내에 "다시 검토해요" 가 남지 않는다');
    assert.match(uncertain, /재검증 경로가 연결되기 전/);
    assert.match(uncertain, /저장된 판정을 다시 확인해요/);
    const uncertainDemo = reflectionBlock(reflectionReview({ row, evRow: ev(['UNCERTAIN', 'PRESENT']) }), link, { demo: true }).textContent;
    assert.match(uncertainDemo, /다시 올리시면 다시 검토를 요청해요/, '시연에서는 재검토 요청이라고 말한다');
  } finally { delete globalThis.document; }
});

// ── 4 · 지급 완료 합성 화면 표시 (오규원 11/6 밤) ───────────────────────────

test('지급 요약은 합성 원천이면 "합성 예시 · 실제 실행 결과 아님" 을 머리글에 적고, 실제 원천이면 적지 않는다', async () => {
  class Node { constructor(t) { this.tagName = String(t).toUpperCase(); this.children = []; this.attributes = {}; this.className = ''; this._text = ''; }
    set textContent(v) { this._text = String(v); this.children = []; }
    get textContent() { return this._text + this.children.map((c) => c.textContent ?? '').join(' '); }
    setAttribute(k, v) { this.attributes[k] = String(v); } addEventListener() {} append(...n) { this.children.push(...n); } }
  globalThis.document = { createElement: (t) => new Node(t), createElementNS: (_, t) => new Node(t), createTextNode: (t) => ({ textContent: String(t), children: [] }) };
  try {
    const { payoutSummary } = await import('../src/bootcamp/panels.js');
    const paid = bootcampView('paid', 'participant');
    const syn = payoutSummary({ view: paid, recipient: '0xabc' });
    assert.equal(syn.attributes['data-synthetic'], 'yes');
    assert.match(syn.textContent, /합성 예시 · 실제 실행 결과 아님/);
    const realRows = paid.criteria.map((r) => ({ ...r, source: { ...r.source, hostMode: 'MOODLE_NATIVE' } }));
    const real = payoutSummary({ view: { ...paid, sourceMode: 'MOODLE_NATIVE', criteria: realRows }, recipient: '0xabc' });
    assert.equal(real.attributes['data-synthetic'], undefined);
    assert.doesNotMatch(real.textContent, /합성 예시/);
    assert.match(real.textContent, /지급 완료 · 로컬 시연용 TEST 토큰/);
    // 처리 중(INCLUDED)에서는 합성이든 아니든 그리지 않는다
    assert.equal(payoutSummary({ view: { ...paid, payment: { ...paid.payment, claimState: 'INCLUDED', receivedAtoms: null } } }), null);
  } finally { delete globalThis.document; }
});
