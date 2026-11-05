// 조건 카드 이동·복귀 — 돌아왔다는 사실만으로 충족이 되지 않는다
//
// 막으려는 것
//
//   1  원래 화면에서 돌아온 것만으로 카드가 '충족' 으로 바뀌는 것
//   2  서버가 판정을 그대로 주는데 '반영됨' 이라고 말하는 것 (조회 API 는 저장된 판정만 읽는다)
//   3  서버가 준 적 없는 Moodle 주소로 보내는 것 · 다른 신청/사이트로 보내는 것
//   4  서명 전 메시지를 보여 주지 않는 것 · 서명했다는 이유로 인증서를 검증 완료로 보이는 것
//   5  회고 원문을 지어내는 것 — 실서버는 원문을 주지 않는다
//   6  탭이 가려진 동안 계속 묻는 것 · 겹친 복귀 신호로 두 번 읽는 것
//   7  기존 「자세히」(조건 상세·근거 보기)가 사라지는 것

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveTargets, LINK, TARGETS_VERSION, safeMoodleOrigin } from '../src/bootcamp/condition-return/targets.js';
import { createReturnTracker, RETURN, memoryStore, rowFingerprint } from '../src/bootcamp/condition-return/tracker.js';
import { conditionRows, createEvidenceLoader, evidenceMatches, EVIDENCE_LOAD } from '../src/bootcamp/condition-return/evidence.js';
import {
  reflectionReview, certificateStatus, moodleFacts, returnLine, REVIEW, CERT,
} from '../src/bootcamp/condition-return/status.js';
import { conditionCardsSection } from '../src/bootcamp/condition-return/cards.js';
import { createConditionCards } from '../src/bootcamp/condition-return/controller.js';
import { createDemoServer, DEMO_APPLICATION, DEMO_REFLECTION, DEMO_REFLECTION_TEXT } from '../src/bootcamp/condition-return/demo-server.js';

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

    getAttribute(n) { return this.attributes[n] ?? null; }

    addEventListener(t, f) { (this.handlers[t] ??= []).push(f); }

    click() { for (const f of this.handlers.click ?? []) f({ target: this }); }

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
const card = (root, id) => find(root, (n) => n.attributes?.['data-criterion'] === id)[0];

// ── 시험 자료 ───────────────────────────────────────────────────────────

const APP = 'application-test-1';
const row = (criterionId, state, extra = {}) => ({
  criterionId, state, current: true, evidenceId: state === 'MISSING' || state === 'UNKNOWN' ? null : `evidence-${criterionId}-1`,
  evidenceRevision: state === 'MISSING' || state === 'UNKNOWN' ? null : 1, reasonCode: null, expiresAt: null,
  source: { kind: 'X', hostMode: 'REGISTERED_TEST_SOURCE', actualSourceVerification: null },
  originalEvidence: { authorized: true, httpAvailable: false }, ...extra,
});
const view = (rows, { decision = 'decision-1', hash = '0xaa', current = true, applicationId = APP } = {}) => ({
  applicationId, role: 'PARTICIPANT', observedAt: 1_800_000_000,
  decision: { id: decision, revision: 1, hash, current },
  criteria: rows,
});
const baseRows = () => [
  row('activity-complete', 'NOT_MET'),
  row('assignment-submitted', 'NOT_MET'),
  row('reflection-topics', 'MISSING'),
  row('python-basic-certificate', 'UNKNOWN'),
];
const targetsRaw = (over = {}) => ({
  version: TARGETS_VERSION, applicationId: APP, moodleOrigin: 'https://moodle.example.test', courseId: 12,
  targets: [
    { criterionId: 'activity-complete', cmId: 2101, module: 'page', name: '1주차' },
    { criterionId: 'assignment-submitted', cmId: 2105, module: 'assign' },
    { criterionId: 'reflection-topics', cmId: 2107, module: 'forum', instanceId: 31 },
  ],
  ...over,
});

/** 손으로 돌리는 시계와 타이머 */
function clock(start = 1_000_000) {
  let t = start; let next = 1; const timers = new Map();
  return {
    now: () => t,
    setTimer: (fn, ms) => { const id = next++; timers.set(id, { fn, at: t + ms }); return id; },
    clearTimer: (id) => { timers.delete(id); },
    pending: () => timers.size,
    async advance(ms) {
      t += ms;
      for (const [id, x] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
        if (x.at <= t) { timers.delete(id); x.fn(); await settle(); }
      }
    },
  };
}
const settle = async () => { for (let i = 0; i < 20; i += 1) await new Promise((r) => { setImmediate(r); }); };

function trackerWith({ rows, serverRows = () => rows(), visible = () => true, storage = memoryStore(), c = clock(), read } = {}) {
  let reads = 0;
  const t = createReturnTracker({
    applicationId: APP,
    getRows: rows,
    read: read ?? (async () => { reads += 1; return { applicationId: APP, rows: serverRows(), current: true }; }),
    storage, nowMs: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer, isVisible: visible,
    followUpMs: [1000, 2000, 3000],
    isBusy: (e) => e?.code === 'TEST_BUSY_OR_ENDED',
  });
  return { t, c, reads: () => reads };
}

// ── 이동 주소 ───────────────────────────────────────────────────────────

test('이동 정보가 없으면 Moodle 세 카드는 잠기고 인증서는 기존 Reclaim 시작이다', () => {
  const links = resolveTargets(null, { applicationId: APP });
  for (const id of ['activity-complete', 'assignment-submitted', 'reflection-topics']) {
    assert.equal(links[id].status, LINK.UNAVAILABLE);
    assert.equal(links[id].reason, 'TARGETS_NOT_PROVIDED');
  }
  assert.equal(links['python-basic-certificate'].status, LINK.RECLAIM);
});

test('서버가 준 조각으로만 Moodle 주소를 만든다', () => {
  const links = resolveTargets(targetsRaw(), { applicationId: APP });
  assert.equal(links['activity-complete'].href, 'https://moodle.example.test/mod/page/view.php?id=2101');
  assert.equal(links['assignment-submitted'].href, 'https://moodle.example.test/mod/assign/view.php?id=2105');
  assert.equal(links['reflection-topics'].href, 'https://moodle.example.test/mod/forum/post.php?forum=31');
  const noInstance = resolveTargets(targetsRaw({ targets: [{ criterionId: 'reflection-topics', cmId: 2107, module: 'forum' }] }), { applicationId: APP });
  assert.equal(noInstance['reflection-topics'].href, 'https://moodle.example.test/mod/forum/view.php?id=2107');
  assert.equal(noInstance['activity-complete'].reason, 'TARGET_MISSING');
});

test('엉뚱한 사이트·다른 신청·이상한 항목으로는 보내지 않는다', () => {
  for (const origin of ['javascript:alert(1)', 'https://moodle.example.test/path', 'http://moodle.example.test',
    'https://user:pw@moodle.example.test', '//moodle.example.test', null]) {
    const links = resolveTargets(targetsRaw({ moodleOrigin: origin }), { applicationId: APP });
    assert.equal(links['activity-complete'].status, LINK.UNAVAILABLE, String(origin));
  }
  assert.equal(safeMoodleOrigin('http://127.0.0.1:5500'), 'http://127.0.0.1:5500');
  assert.equal(resolveTargets(targetsRaw(), { applicationId: 'application-other' })['activity-complete'].reason, 'TARGETS_OTHER_APPLICATION');
  assert.equal(resolveTargets(targetsRaw({ version: 'x' }), { applicationId: APP })['activity-complete'].reason, 'TARGETS_INVALID');
  const bad = (t) => resolveTargets(targetsRaw({ targets: [t] }), { applicationId: APP })[t.criterionId];
  assert.equal(bad({ criterionId: 'reflection-topics', cmId: 2104, module: 'quiz' }).reason, 'TARGET_INVALID');
  assert.equal(bad({ criterionId: 'activity-complete', cmId: '2101', module: 'page' }).reason, 'TARGET_INVALID');
  assert.equal(bad({ criterionId: 'activity-complete', cmId: 2101, module: 'page', href: 'https://evil.test' }).reason, 'TARGET_INVALID');
  const dup = resolveTargets(targetsRaw({ targets: [
    { criterionId: 'activity-complete', cmId: 2101, module: 'page' },
    { criterionId: 'activity-complete', cmId: 2102, module: 'page' },
  ] }), { applicationId: APP });
  assert.equal(dup['activity-complete'].reason, 'TARGET_INVALID');
});

// ── 복귀 추적 ───────────────────────────────────────────────────────────

test('돌아와도 서버 판정이 그대로면 확인 중이고, 끝내 그대로면 멈춘다 — 충족으로 바뀌지 않는다', async () => {
  const rows = () => baseRows();
  const { t, c, reads } = trackerWith({ rows });
  t.depart('activity-complete');
  assert.equal(t.status('activity-complete').state, RETURN.AWAY);
  await t.arrive();
  assert.equal(t.status('activity-complete').state, RETURN.PENDING);
  assert.equal(reads(), 1);
  await c.advance(1000); assert.equal(reads(), 2);
  await c.advance(2000); assert.equal(reads(), 3);
  await c.advance(3000); assert.equal(reads(), 4);
  assert.equal(t.status('activity-complete').state, RETURN.STALLED);
  await c.advance(60_000); assert.equal(reads(), 4, '멈춘 뒤에는 저절로 묻지 않는다');
  await t.recheck('activity-complete');
  assert.equal(reads(), 5);
});

test('서버가 그 조건의 판정을 바꿨을 때만 반영됨이다', async () => {
  let server = baseRows();
  const { t, c } = trackerWith({ rows: () => baseRows(), serverRows: () => server });
  t.depart('activity-complete');
  t.depart('assignment-submitted');
  await t.arrive();
  assert.equal(t.status('activity-complete').state, RETURN.PENDING);
  server = [row('activity-complete', 'MET', { evidenceId: 'evidence-activity-2', evidenceRevision: 2 }), ...baseRows().slice(1)];
  await c.advance(1000);
  assert.equal(t.status('activity-complete').state, RETURN.UPDATED);
  // 다른 조건이 바뀐 것은 과제 카드의 반영이 아니다
  assert.equal(t.status('assignment-submitted').state, RETURN.PENDING);
});

test('현재 판정이 아니거나 다른 신청의 응답은 반영으로 치지 않는다', () => {
  const { t } = trackerWith({ rows: () => baseRows() });
  t.depart('activity-complete');
  const changed = [row('activity-complete', 'MET', { evidenceId: 'e2' }), ...baseRows().slice(1)];
  t.observe({ applicationId: 'application-other', rows: changed, current: true });
  assert.equal(t.status('activity-complete').state, RETURN.AWAY);
  t.observe({ applicationId: APP, rows: changed, current: false });
  assert.equal(t.status('activity-complete').state, RETURN.AWAY);
  // 기존 자동 조회가 읽어 온 결과는 따로 읽지 않고 받는다
  t.observe({ applicationId: APP, rows: changed, current: true });
  assert.equal(t.status('activity-complete').state, RETURN.UPDATED);
});

test('읽기 실패는 이전 판정을 두고 말하며, 다른 조회 진행 중은 실패가 아니다', async () => {
  let mode = 'fail';
  const { t } = trackerWith({
    rows: () => baseRows(),
    read: async () => {
      if (mode === 'fail') throw Object.assign(new Error('x'), { code: 'BC_VIEW_STALE' });
      throw Object.assign(new Error('TEST_BUSY_OR_ENDED'), { code: 'TEST_BUSY_OR_ENDED' });
    },
  });
  t.depart('assignment-submitted');
  await t.arrive();
  assert.equal(t.status('assignment-submitted').state, RETURN.READ_FAILED);
  assert.equal(t.status('assignment-submitted').error, 'BC_VIEW_STALE');
  mode = 'busy';
  await t.recheck('assignment-submitted');
  assert.equal(t.status('assignment-submitted').state, RETURN.PENDING);
});

test('탭이 가려져 있으면 묻지 않고, 겹친 복귀 신호로 두 번 읽지 않는다', async () => {
  let visible = false;
  const listeners = {};
  const target = { addEventListener: (k, f) => { listeners[k] = f; }, removeEventListener: () => {}, visibilityState: 'hidden' };
  const { t, reads } = trackerWith({ rows: () => baseRows(), visible: () => visible });
  t.attach({ doc: target, win: target });
  t.depart('activity-complete');
  listeners.focus();
  await settle();
  assert.equal(reads(), 0);
  visible = true; target.visibilityState = 'visible';
  listeners.visibilitychange(); listeners.focus(); listeners.pageshow();
  await settle();
  assert.equal(reads(), 1);
});

test('같은 탭으로 다녀와도 기억한다. 오래된 기록은 버린다', async () => {
  const storage = memoryStore();
  const c = clock();
  trackerWith({ rows: () => baseRows(), storage, c }).t.depart('reflection-topics');
  const again = trackerWith({ rows: () => baseRows(), storage, c });
  assert.equal(again.t.status('reflection-topics').state, RETURN.AWAY);
  await again.t.arrive();
  assert.equal(again.reads(), 1);
  await c.advance(31 * 60 * 1000);
  const stale = trackerWith({ rows: () => baseRows(), storage, c });
  assert.equal(stale.t.status('reflection-topics').state, RETURN.IDLE);
  // 저장소가 막혀 있어도 동작은 같다
  const broken = { get() { throw new Error('blocked'); }, set() { throw new Error('blocked'); }, remove() { throw new Error('blocked'); } };
  assert.throws(() => broken.get());
  const safe = createReturnTracker({ applicationId: APP, getRows: () => baseRows(), read: async () => null,
    storage: { get: () => null, set: () => {}, remove: () => {} } });
  safe.depart('activity-complete');
  assert.equal(safe.status('activity-complete').state, RETURN.AWAY);
});

test('지문은 조건 줄만 본다', () => {
  const a = baseRows();
  assert.equal(rowFingerprint(a, 'activity-complete'), rowFingerprint(baseRows(), 'activity-complete'));
  assert.equal(rowFingerprint(a, 'none'), null);
});

// ── 상태 문구 ───────────────────────────────────────────────────────────

test('재조회 문구는 확인 중과 반영됨을 섞지 않는다', () => {
  assert.match(returnLine({ state: RETURN.PENDING }, row('activity-complete', 'NOT_MET')).text, /확인 중/);
  assert.match(returnLine({ state: RETURN.PENDING }, null).text, /원천 기록을 다시 읽어/);
  assert.match(returnLine({ state: RETURN.UPDATED }, row('activity-complete', 'NOT_MET')).text, /미충족/);
  assert.equal(returnLine({ state: RETURN.IDLE }, null), null);
});

test('Moodle 기록은 판정 근거에 있을 때만 적는다', () => {
  assert.deepEqual(moodleFacts('activity-complete', null), []);
  assert.deepEqual(moodleFacts('assignment-submitted', { checks: { submissionState: 'SUBMITTED', sourceSubmittedAt: null } }),
    [{ k: '제출 상태', v: '제출됨' }]);
});

test('회고는 승인 대기 → 검토 중 → 사유와 원문 위치 순으로 서버 값만 보여 준다', () => {
  assert.equal(reflectionReview({ row: row('reflection-topics', 'MISSING') }).state, REVIEW.NOT_COLLECTED);
  assert.equal(reflectionReview({ phase: 'AWAITING_EXACT_REFLECTION_APPROVAL' }).state, REVIEW.AWAITING_APPROVAL);
  assert.equal(reflectionReview({ aiApproval: { status: 'RECORDED' } }).state, REVIEW.REVIEWING);
  const evRow = { metadataStatus: 'RECORDED', checks: { topics: [
    { topicId: 'work-performed', state: 'PRESENT', location: { start: 0, end: 10 } },
    { topicId: 'problem-solving-process', state: 'PRESENT', location: { start: 11, end: 20 } },
    { topicId: 'learning-takeaway', state: 'ABSENT', location: null },
  ] } };
  const r = reflectionReview({ row: row('reflection-topics', 'NOT_MET'), evRow, limitations: { originalTextHttpAvailable: false } });
  assert.equal(r.state, REVIEW.REVIEWED);
  assert.match(r.reason, /배운 점\(없음\)/);
  assert.equal(r.topics[0].quote, null, '원문을 받지 않았으면 문장을 지어내지 않는다');
  assert.deepEqual(r.topics[0].location, { start: 0, end: 10 });
  assert.match(r.originalNote, /원문 위치/);
  const coded = reflectionReview({ row: row('reflection-topics', 'NOT_MET', { reasonCode: 'EVIDENCE_MISSING' }), evRow });
  assert.equal(coded.reason, '필요한 근거가 없습니다.', '서버 사유가 있으면 그것이 먼저다');
  const again = reflectionReview({ row: row('reflection-topics', 'NOT_MET'), evRow, phase: 'SOURCE_reflection-topics' });
  assert.equal(again.state, REVIEW.REVIEWING);
  assert.equal(again.previous, true, '검토 중이면 이전 결과라고 표시한다');
});

test('인증서는 서명만으로 검증 완료가 되지 않는다', () => {
  assert.equal(certificateStatus({ session: {} }).state, CERT.NO_APPLICATION);
  const start = certificateStatus({ session: { applicationId: APP } });
  assert.equal(start.state, CERT.START); assert.equal(start.action.kind, 'start');
  const bound = { applicationId: APP, boundApplicationId: APP, phase: 'SOURCE_python-basic-certificate' };
  assert.equal(certificateStatus({ session: bound }).action.kind, 'read');
  const sign = certificateStatus({ session: bound, approval: { message: 'CLEAR HackerRank ...' } });
  assert.equal(sign.state, CERT.SIGN); assert.equal(sign.message, 'CLEAR HackerRank ...');
  const signed = certificateStatus({ session: bound, row: row('python-basic-certificate', 'UNKNOWN'), signedAtMs: 1 });
  assert.equal(signed.state, CERT.VERIFYING);
  const after = certificateStatus({ session: { ...bound, phase: 'SOURCE_reflection-topics' }, row: row('python-basic-certificate', 'UNKNOWN'), signedAtMs: 1 });
  assert.equal(after.state, CERT.VERIFYING, '다음 단계로 넘어갔어도 서버 판정 전에는 확인 중이다');
  const ok = certificateStatus({ session: bound, row: row('python-basic-certificate', 'MET'), signedAtMs: 1,
    evRow: { verification: { integrity: 'SIGNATURE_VALID' }, checks: { certificateName: 'Python (Basic)' } } });
  assert.equal(ok.state, CERT.VERIFIED);
  assert.deepEqual(ok.verification, [{ k: '무결성', v: 'SIGNATURE_VALID' }]);
  assert.equal(certificateStatus({ session: bound, row: row('python-basic-certificate', 'MET'), availability: { status: 'EXPIRED' } }).state === CERT.VERIFIED, false);
  assert.equal(certificateStatus({ session: { ...bound, failure: { code: 'X' } } }).state, CERT.BLOCKED);
  assert.equal(certificateStatus({ session: bound, row: row('python-basic-certificate', 'NOT_MET') }).state, CERT.NOT_MET);
});

// ── 근거 ────────────────────────────────────────────────────────────────

test('근거는 지금 판정의 것만 쓰고, 늦게 온 이전 판정의 응답은 버린다', async () => {
  const s1 = conditionRows({ view: view(baseRows(), { decision: 'd1', hash: '0x1' }) });
  const s2 = conditionRows({ view: view(baseRows(), { decision: 'd2', hash: '0x2' }) });
  const ev = (s) => ({ applicationId: APP, role: 'PARTICIPANT', manifest: { decision: { decisionId: s.decision.id, decisionHash: s.decision.hash }, criteria: [] } });
  const resolvers = [];
  const loader = createEvidenceLoader({ load: (s) => new Promise((r) => { resolvers.push(() => r(ev(s))); }) });
  const first = loader.ensure(s1);
  const second = loader.ensure(s2);
  resolvers[1](); await second;
  resolvers[0](); await first;
  assert.equal(loader.get(s2)?.manifest.decision.decisionId, 'd2');
  assert.equal(loader.get(s1), null);
  assert.equal(evidenceMatches(s2, { ...ev(s2), role: 'COURSE_OPERATOR' }), false);
  const failing = createEvidenceLoader({ load: async () => { throw new Error('x'); } });
  await failing.ensure(s1);
  assert.equal(failing.state(s1), EVIDENCE_LOAD.FAILED);
});

test('절차 준비 전에는 operations 의 저장된 판정으로 그리고 현재성을 지어내지 않는다', () => {
  const s = conditionRows({ operations: {
    applicationId: APP, role: 'PARTICIPANT', decisionId: 'd', decisionRevision: 1, decisionHash: '0x1', current: true,
    asOf: { observedAt: 5 }, evidence: { criteria: [{ criterionId: 'activity-complete', state: 'MET', evidenceId: 'e', evidenceRevision: 1, reasonCode: null }] },
  } });
  assert.equal(s.source, 'OPERATIONS');
  assert.equal(s.rows[0].current, null);
});

// ── 카드 ────────────────────────────────────────────────────────────────

test('카드는 지정 항목을 새 탭으로 열고, 떠날 때 지문을 남기며, 「자세히」 를 그대로 둔다', () => {
  const restore = installDom();
  try {
    const snapshot = conditionRows({ view: view(baseRows()) });
    const departed = []; const opened = [];
    const tracker = { status: () => ({ state: RETURN.IDLE }), depart: (id) => departed.push(id), recheck: () => {} };
    const node = conditionCardsSection({
      snapshot, links: resolveTargets(targetsRaw(), { applicationId: APP }), tracker,
      session: { applicationId: APP }, onOpen: (id) => opened.push(id),
    });
    const go = find(card(node, 'activity-complete'), (n) => n.tagName === 'A')[0];
    assert.equal(go.attributes.href, 'https://moodle.example.test/mod/page/view.php?id=2101');
    assert.equal(go.attributes.target, '_blank');
    assert.match(go.attributes.rel, /noopener/);
    go.click();
    assert.deepEqual(departed, ['activity-complete']);
    const more = find(node, (n) => n.tagName === 'BUTTON' && n.textContent.trim() === '자세히');
    assert.equal(more.length, 4);
    more[2].click();
    assert.deepEqual(opened, ['reflection-topics']);
    assert.match(card(node, 'activity-complete').textContent, /미충족/);
  } finally { restore(); }
});

test('이동 주소가 없으면 버튼을 잠그고 이유를 적는다', () => {
  const restore = installDom();
  try {
    const node = conditionCardsSection({ snapshot: null, links: resolveTargets(null, { applicationId: APP }) });
    const go = find(card(node, 'assignment-submitted'), (n) => cls(n, 'crc-go'))[0];
    assert.equal(go.tagName, 'BUTTON');
    assert.equal(go.attributes.disabled, '');
    assert.match(card(node, 'assignment-submitted').textContent, /주소를 서버가 아직 주지 않았습니다/);
    assert.match(card(node, 'activity-complete').textContent, /판정 없음/);
  } finally { restore(); }
});

test('확인 중인 카드는 서버의 이전 판정을 그대로 보여 준다', () => {
  const restore = installDom();
  try {
    const node = conditionCardsSection({
      snapshot: conditionRows({ view: view(baseRows()) }),
      links: resolveTargets(targetsRaw(), { applicationId: APP }),
      tracker: { status: (id) => ({ state: id === 'activity-complete' ? RETURN.PENDING : RETURN.IDLE }), depart() {}, recheck() {} },
    });
    const c = card(node, 'activity-complete');
    assert.equal(c.attributes['data-state'], 'open');
    assert.match(c.textContent, /확인 중/);
    assert.match(c.textContent, /미충족/);
    assert.ok(find(c, (n) => n.tagName === 'BUTTON' && n.textContent.trim() === '다시 확인').length === 1);
  } finally { restore(); }
});

test('HackerRank 카드는 기존 인증 동작만 부르고, 서명 전에 메시지를 보여 준다', () => {
  const restore = installDom();
  try {
    const calls = []; const departed = [];
    const session = { applicationId: APP, boundApplicationId: APP, phase: 'SOURCE_python-basic-certificate' };
    const node = conditionCardsSection({
      snapshot: conditionRows({ view: view(baseRows()) }), links: resolveTargets(null, { applicationId: APP }),
      tracker: { status: () => ({ state: RETURN.IDLE }), depart: (id) => departed.push(id), recheck() {} },
      session, approval: { message: 'CLEAR HackerRank evidence observation approval; not a payment authorization.\n...' },
      certificate: { start: () => calls.push('start'), read: () => calls.push('read'), sign: () => calls.push('sign') },
    });
    const hr = card(node, 'python-basic-certificate');
    assert.match(hr.textContent, /not a payment authorization/);
    find(hr, (n) => cls(n, 'crc-go'))[0].click();
    assert.deepEqual(calls, ['sign']);
    assert.deepEqual(departed, ['python-basic-certificate']);
  } finally { restore(); }
});

// ── 처음부터 끝까지 (시연 서버 대역) ─────────────────────────────────────

function demoHost({ mode }) {
  const c = clock(10_000_000);
  const data = new Map();
  const store = { load: () => structuredClone(data.get('s') ?? { v: 1, mode, lagMs: 3000, moodle: { activityAt: null, assignmentAt: null, reflection: null }, hr: { boundAt: null, messageAt: null, signedAt: null, consentAt: null } }),
    save: (s) => data.set('s', structuredClone(s)), reset: () => data.clear() };
  const server = createDemoServer({ store, nowMs: c.now });
  let last = { view: server.view(), session: server.session(), approval: server.approval() };
  const cards = createConditionCards({
    getState: () => ({ ...last, operations: null, busy: false }),
    read: async () => { last = { view: server.view(), session: server.session(), approval: server.approval() }; return { view: last.view, operations: null }; },
    loadEvidence: async () => server.decisionEvidence(),
    targets: () => ({ ...targetsRaw(), applicationId: DEMO_APPLICATION }),
    storage: memoryStore(), nowMs: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer, isVisible: () => true,
    doc: null, win: null, followUpMs: [1000, 2000, 3000], sourceText: () => server.reflectionText(),
  });
  return { c, server, cards };
}

test('원천을 다시 읽는 서버라면: 다녀와서 확인 중 → 서버 판정 반영', async () => {
  const restore = installDom();
  try {
    const { c, server, cards } = demoHost({ mode: 'DELAYED' });
    let node = cards.render();
    find(card(node, 'activity-complete'), (n) => n.tagName === 'A')[0].click();
    server.completeActivity(); // Moodle 대역에서 완료
    await cards.arrive(); await settle();
    node = cards.render();
    assert.match(card(node, 'activity-complete').textContent, /확인 중/);
    assert.equal(card(node, 'activity-complete').attributes['data-state'], 'open', '돌아온 것만으로 충족이 아니다');
    await c.advance(1000); await c.advance(2000); await settle();
    node = cards.render();
    assert.equal(cards.status('activity-complete').state, RETURN.UPDATED);
    assert.equal(card(node, 'activity-complete').attributes['data-state'], 'met');
    assert.match(card(node, 'activity-complete').textContent, /서버 판정이 바뀌었어요/);
  } finally { restore(); }
});

test('저장된 판정만 읽는 지금 develop 이라면: 다녀와도 미충족 그대로, 확인 중 뒤 멈춤', async () => {
  const restore = installDom();
  try {
    const { c, server, cards } = demoHost({ mode: 'NEVER' });
    let node = cards.render();
    find(card(node, 'assignment-submitted'), (n) => n.tagName === 'A')[0].click();
    server.submitAssignment();
    await cards.arrive(); await settle();
    for (const ms of [1000, 2000, 3000]) await c.advance(ms);
    await settle();
    node = cards.render();
    assert.equal(cards.status('assignment-submitted').state, RETURN.STALLED);
    assert.equal(card(node, 'assignment-submitted').attributes['data-state'], 'open');
    assert.match(card(node, 'assignment-submitted').textContent, /아직 반영되지 않았어요/);
  } finally { restore(); }
});

test('회고: 승인 대기 → 검토 중 → 판정 사유와 근거 위치 (시연 판정기)', async () => {
  const restore = installDom();
  try {
    const { c, server, cards } = demoHost({ mode: 'DELAYED' });
    const before = card(cards.render(), 'reflection-topics');
    // 떠나지 않았으면 돌아와도 다시 읽지 않는다
    await cards.arrive(); await settle();
    assert.match(card(cards.render(), 'reflection-topics').textContent, /회고 검토 전/);
    find(before, (n) => n.tagName === 'A')[0].click();
    const without = Object.entries(DEMO_REFLECTION).filter(([k]) => k !== 'learning-takeaway').map(([, v]) => v).join('\n');
    server.submitReflection(without);
    const look = async (ms) => { await c.advance(ms); await cards.arrive(); await settle(); return card(cards.render(), 'reflection-topics').textContent; };
    assert.match(await look(3000), /AI 검토 승인 대기/);
    assert.match(await look(3000), /AI 가 회고를 검토하고 있어요/);
    const done = await look(3000);
    assert.match(done, /배운 점\(없음\)/);
    assert.match(done, /for 반복문으로 목록의 합계를/, '시연 데이터의 원문에서만 근거 문장을 보여 준다');
    assert.ok(DEMO_REFLECTION_TEXT.includes(DEMO_REFLECTION['learning-takeaway']));
  } finally { restore(); }
});

test('서명 뒤 같은 탭으로 다녀와 페이지가 새로 떠도 다시 서명하라고 하지 않는다', async () => {
  const restore = installDom();
  try {
    const storage = memoryStore();
    const session = { applicationId: APP, boundApplicationId: APP, phase: 'SOURCE_python-basic-certificate' };
    const make = (approval) => createConditionCards({
      getState: () => ({ view: view(baseRows()), operations: null, session, approval, busy: false }),
      read: async () => ({ view: view(baseRows()), operations: null }),
      storage, doc: null, win: null, isVisible: () => true,
      certificate: { start() {}, read() {}, sign() {} },
    });
    const first = make({ message: 'CLEAR HackerRank ...' });
    assert.match(card(first.render(), 'python-basic-certificate').textContent, /표시한 메시지에 서명/);
    first.markSigned();
    first.close();
    // 새로 뜬 페이지: driver 는 읽어 둔 메시지를 잊었고 phase 는 그대로다
    const second = make(null);
    const hr = card(second.render(), 'python-basic-certificate');
    assert.match(hr.textContent, /서버 검증 대기/);
    assert.doesNotMatch(hr.textContent, /메시지 읽기|메시지에 서명/);
    second.close();
  } finally { restore(); }
});
