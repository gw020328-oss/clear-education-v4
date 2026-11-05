// 조건 카드 — 복귀 때 원천 재확인 요청(접수)과 새 판정 확정을 섞지 않는다
//
// 오규원 11/5 과제: "원래 화면으로 이동했거나 돌아왔다는 이유만으로 충족을 표시하면
// 안 돼. 서버가 원천 재확인 요청을 접수한 상태와 새 판정이 확정된 상태도 구분해 줘."
//
// 여기서 막으려는 것
//
//   1  접수(QUEUED)만으로 충족·반영으로 보이는 것
//   2  요청이 실패하거나 경로가 없어도 읽기가 멈추는 것
//   3  UNAVAILABLE 을 '아직 반영 안 됨' 과 같은 말로 보이는 것 — '아직 확인할 수 없음' 이다
//   4  HackerRank 에 Moodle 재확인을 보내는 것
//   5  RATE_LIMITED 의 retryAfter 보다 빨리 다시 묻는 것

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createReturnTracker, RETURN, REFRESH, memoryStore, defaultRefreshFor,
} from '../src/bootcamp/condition-return/tracker.js';
import { returnLine } from '../src/bootcamp/condition-return/status.js';
import { createDemoServer, DEMO_MODES, REFRESH_RATE_LIMIT_MS } from '../src/bootcamp/condition-return/demo-server.js';

const APP = 'application-flow-test';
const row = (criterionId, state, rev = 1) => ({
  criterionId, state, current: true, evidenceId: `${criterionId}-${rev}`, evidenceRevision: rev, reasonCode: null,
});
const rowsBefore = () => [row('activity-complete', 'NOT_MET'), row('python-basic-certificate', 'UNKNOWN')];
const rowsAfter = () => [row('activity-complete', 'MET', 2), row('python-basic-certificate', 'UNKNOWN')];

/** 가짜 시계와 타이머. 재조회 간격을 손으로 돌린다 */
function clock() {
  let now = 1_000_000;
  const timers = [];
  return {
    nowMs: () => now,
    setTimer: (fn, ms) => { const t = { fn, at: now + ms, id: timers.length + 1 }; timers.push(t); return t.id; },
    clearTimer: (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
    async tick(ms) {
      now += ms;
      const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at);
      for (const t of due) { timers.splice(timers.indexOf(t), 1); await t.fn(); }
      await flush();
    },
    pending: () => timers.map((t) => t.at - now),
  };
}
const flush = async () => { for (let i = 0; i < 10; i += 1) await new Promise((r) => setTimeout(r, 0)); };

function tracker({ refresh, read, rows = rowsBefore, followUpMs = [100, 200, 300] }) {
  const c = clock();
  const calls = [];
  const t = createReturnTracker({
    applicationId: APP,
    getRows: rows,
    read: async () => { calls.push('read'); return { applicationId: APP, rows: await read(), current: true }; },
    refresh: refresh ? async (req) => { calls.push(['refresh', req]); return refresh(req); } : null,
    getRevision: () => 7,
    storage: memoryStore(), nowMs: c.nowMs, setTimer: c.setTimer, clearTimer: c.clearTimer, followUpMs,
  });
  return { t, c, calls };
}

// ── 1 · 접수는 판정이 아니다 ─────────────────────────────────────────────

test('돌아오면 재확인을 요청하고, 접수(QUEUED)만으로는 PENDING 이지 UPDATED 가 아니다', async () => {
  let current = rowsBefore();
  const { t, c, calls } = tracker({
    refresh: () => ({ status: 'QUEUED', operationId: 'op-1' }),
    read: async () => current,
  });
  t.depart('activity-complete');
  await t.arrive(); await flush();

  const req = calls.find((x) => Array.isArray(x));
  assert.deepEqual(req[1], { criterionId: 'activity-complete', expectedRevision: 7 }, '요청의 기준은 신청 개정 번호(7)여야 한다 — 조건 근거 번호(1)가 아니다');
  const s = t.status('activity-complete');
  assert.equal(s.state, RETURN.PENDING, '접수만 됐는데 상태가 ' + s.state);
  assert.equal(s.refresh.status, REFRESH.QUEUED);
  assert.equal(s.refresh.operationId, 'op-1');
  const line = returnLine(s, current[0]);
  assert.match(line.text, /접수/);
  assert.match(line.text, /아직 확정되지 않았/);
  assert.ok(!/충족/.test(line.text), '접수 문구에 충족이 섞였다');

  // 서버가 새 판정을 확정하면 그때 UPDATED. 요청은 한 번만 보낸다
  current = rowsAfter();
  await c.tick(100);
  assert.equal(t.status('activity-complete').state, RETURN.UPDATED);
  assert.equal(calls.filter((x) => Array.isArray(x)).length, 1, '접수 뒤에 또 요청했다');
  assert.match(returnLine(t.status('activity-complete'), current[0]).text, /새 판정 확정.*충족/);
});

test('접수됐지만 끝내 바뀌지 않으면 STALLED 문구가 접수 사실과 미확정을 같이 말한다', async () => {
  const { t, c } = tracker({ refresh: () => ({ status: 'QUEUED', operationId: 'op-2' }), read: async () => rowsBefore() });
  t.depart('activity-complete');
  await t.arrive(); await flush();
  for (const ms of [100, 200, 300, 300]) await c.tick(ms);
  const s = t.status('activity-complete');
  assert.equal(s.state, RETURN.STALLED);
  const text = returnLine(s, rowsBefore()[0]).text;
  assert.match(text, /아직 반영되지 않았어요/);
  assert.match(text, /접수됐지만/);
});

// ── 2 · 경로가 없거나 실패해도 읽기는 간다 ───────────────────────────────

test('refresh 포트가 없거나 null 을 돌려주면 지금 develop 과 같다 — 저장된 판정만 읽는다', async () => {
  const a = tracker({ refresh: null, read: async () => rowsBefore() });
  a.t.depart('activity-complete'); await a.t.arrive(); await flush();
  assert.equal(a.t.status('activity-complete').state, RETURN.PENDING);
  assert.equal(a.t.status('activity-complete').refresh ?? null, null);
  assert.match(returnLine(a.t.status('activity-complete'), null).text, /원천 기록을 다시 읽어/);

  const b = tracker({ refresh: () => null, read: async () => rowsBefore() });
  b.t.depart('activity-complete'); await b.t.arrive(); await flush();
  assert.equal(b.t.status('activity-complete').state, RETURN.PENDING);
  assert.equal(b.t.status('activity-complete').refresh ?? null, null, 'null 응답을 결과로 적었다');
  assert.ok(b.calls.includes('read'), '읽기를 안 했다');
});

test('재확인 요청이 던지면 REQUEST_FAILED 로 적고 읽기는 계속한다', async () => {
  const { t, calls } = tracker({ refresh: () => { throw Object.assign(new Error('boom'), { code: 'NETWORK' }); }, read: async () => rowsBefore() });
  t.depart('activity-complete'); await t.arrive(); await flush();
  const s = t.status('activity-complete');
  assert.equal(s.state, RETURN.PENDING);
  assert.equal(s.refresh.status, REFRESH.REQUEST_FAILED);
  assert.equal(s.refresh.error, 'NETWORK');
  assert.ok(calls.includes('read'));
  assert.match(returnLine(s, null).text, /보내지 못했어요/);
});

// ── 3 · UNAVAILABLE 은 '아직 확인할 수 없음' ───────────────────────────────

test('UNAVAILABLE 이면 CANNOT_CHECK 로 두고 더 묻지 않는다. 다시 확인은 남는다', async () => {
  const { t, c, calls } = tracker({ refresh: () => ({ status: 'UNAVAILABLE' }), read: async () => rowsBefore() });
  t.depart('activity-complete'); await t.arrive(); await flush();
  const s = t.status('activity-complete');
  assert.equal(s.state, RETURN.CANNOT_CHECK);
  const line = returnLine(s, rowsBefore()[0]);
  assert.match(line.text, /아직 확인할 수 없어요/);
  assert.ok(!/반영되지 않았/.test(line.text), 'UNAVAILABLE 을 미반영처럼 말했다');
  assert.equal(line.recheck, true);
  assert.deepEqual(c.pending(), [], '불가인데 자동 재조회를 걸었다');
  const reads = calls.filter((x) => x === 'read').length;
  await c.tick(1000);
  assert.equal(calls.filter((x) => x === 'read').length, reads, '불가인데 또 읽었다');
  // 「다시 확인」 은 요청을 다시 보낸다
  await t.recheck('activity-complete'); await flush();
  assert.equal(calls.filter((x) => Array.isArray(x)).length, 2);
});

// ── 4 · HackerRank 는 대상이 아니다 ─────────────────────────────────────────

test('HackerRank 조건에는 Moodle 재확인을 보내지 않는다', async () => {
  assert.equal(defaultRefreshFor('python-basic-certificate'), false);
  assert.equal(defaultRefreshFor('activity-complete'), true);
  const { t, calls } = tracker({ refresh: () => ({ status: 'QUEUED', operationId: 'x' }), read: async () => rowsBefore() });
  t.depart('python-basic-certificate'); await t.arrive(); await flush();
  assert.equal(calls.filter((x) => Array.isArray(x)).length, 0, 'HackerRank 에 재확인 요청을 보냈다');
  assert.equal(t.status('python-basic-certificate').state, RETURN.PENDING);
});

// ── 5 · RATE_LIMITED 는 retryAfter 를 지킨다 ──────────────────────────────

test('RATE_LIMITED 면 retryAfterSeconds 보다 빨리 다시 묻지 않고, 다음 읽기 때 다시 요청한다', async () => {
  let n = 0;
  const { t, c, calls } = tracker({
    refresh: () => (n++ === 0 ? { status: 'RATE_LIMITED', retryAfterSeconds: 2 } : { status: 'QUEUED', operationId: 'op-9' }),
    read: async () => rowsBefore(),
  });
  t.depart('activity-complete'); await t.arrive(); await flush();
  const s = t.status('activity-complete');
  assert.equal(s.state, RETURN.PENDING);
  assert.equal(s.refresh.status, REFRESH.RATE_LIMITED);
  assert.match(returnLine(s, null).text, /2초 뒤/);
  assert.deepEqual(c.pending(), [2000], '다음 읽기가 retryAfter(2초)보다 빠르다: ' + c.pending());
  await c.tick(2000);
  assert.equal(calls.filter((x) => Array.isArray(x)).length, 2, '제한 뒤 다시 요청하지 않았다');
  assert.equal(t.status('activity-complete').refresh.status, REFRESH.QUEUED);
});

// ── 6 · 시연 대역이 네 응답을 낸다 ───────────────────────────────────────

test('시연 서버 대역: 기본 ON_REQUEST 는 요청 없이는 안 바뀌고, 요청 뒤 지연이 지나야 새 판정이 된다', () => {
  let now = 10_000;
  const mem = (() => { let v = null; return { load: () => v ?? undefined, save: (s) => { v = s; }, reset: () => { v = null; } }; })();
  const store = { load: () => mem.load() ?? { v: 1, mode: 'ON_REQUEST', lagMs: 1000, moodle: { activityAt: null, assignmentAt: null, reflection: null }, hr: { boundAt: null, messageAt: null, signedAt: null, consentAt: null }, refresh: {} }, save: mem.save, reset: mem.reset };
  const server = createDemoServer({ store, nowMs: () => now });
  assert.deepEqual(DEMO_MODES, ['ON_REQUEST', 'DELAYED', 'NEVER', 'UNAVAILABLE']);

  server.completeActivity();
  now += 5000;
  assert.equal(server.view().criteria[0].state, 'NOT_MET', '요청 없이 바뀌었다');
  const r1 = server.refresh('activity-complete', 1);
  assert.equal(r1.status, 'QUEUED');
  assert.ok(r1.operationId);
  assert.equal(server.view().criteria[0].state, 'NOT_MET', '접수 즉시 바뀌었다');
  const r2 = server.refresh('activity-complete', 1);
  assert.equal(r2.status, 'RATE_LIMITED');
  assert.ok(r2.retryAfterSeconds >= 1 && r2.retryAfterSeconds <= REFRESH_RATE_LIMIT_MS / 1000);
  now += 1000;
  assert.equal(server.view().criteria[0].state, 'MET', '지연 뒤에도 안 바뀌었다');
  assert.equal(server.refresh('activity-complete', 1).status, 'RECORDED');

  server.setMode('UNAVAILABLE');
  assert.equal(server.refresh('activity-complete', 1).status, 'UNAVAILABLE');
  server.setMode('NEVER');
  assert.equal(server.refresh('activity-complete', 1), null);
  assert.equal(server.refresh('python-basic-certificate', 1), null);
});

// ── 회고 · HackerRank ─────────────────────────────────────────────────────

import { reflectionReview, certificateStatus, REVIEW, CERT } from '../src/bootcamp/condition-return/status.js';

test('회고가 검토 뒤 미충족이면 보충할 항목과 다시 쓸 필요를 바로 말한다', () => {
  const evRow = { metadataStatus: 'RECORDED', checks: { topics: [
    { topicId: 'work-performed', state: 'PRESENT', location: { start: 0, end: 10 } },
    { topicId: 'problem-solving-process', state: 'PRESENT', location: { start: 11, end: 20 } },
    { topicId: 'learning-takeaway', state: 'ABSENT', location: null },
  ] } };
  const unmet = reflectionReview({ row: { criterionId: 'reflection-topics', state: 'NOT_MET', evidenceId: 'e1', reasonCode: null }, evRow });
  assert.equal(unmet.state, REVIEW.REVIEWED);
  assert.equal(unmet.needsRewrite, true);
  assert.deepEqual(unmet.lackingLabels, ['배운 점']);
  assert.match(unmet.reason, /배운 점\(없음\)/);

  const met = reflectionReview({ row: { criterionId: 'reflection-topics', state: 'MET', evidenceId: 'e2' }, evRow: { ...evRow, checks: { topics: evRow.checks.topics.map((t) => ({ ...t, state: 'PRESENT' })) } } });
  assert.equal(met.needsRewrite, false);

  // 검토 중엔 아직 모른다 — 다시 쓰라고 하지 않는다
  const reviewing = reflectionReview({ row: { criterionId: 'reflection-topics', state: 'NOT_MET', evidenceId: 'e1' }, evRow, phase: 'SOURCE_reflection-topics' });
  assert.equal(reviewing.needsRewrite, false);
});

test('HackerRank: 서명 뒤 서버 판정 전이면 「다시 진행」 이 있고, 충족이면 없다', () => {
  const signed = certificateStatus({
    row: { criterionId: 'python-basic-certificate', state: 'UNKNOWN', evidenceId: null, current: true },
    session: { applicationId: 'a', boundApplicationId: 'a', phase: 'SOURCE_python-basic-certificate' },
    signedAtMs: 1,
  });
  assert.equal(signed.state, CERT.VERIFYING);
  assert.equal(signed.action?.kind, 'resume');
  assert.match(signed.title, /검증 중/);
  assert.match(signed.note, /다시 진행/);
  assert.ok(!/다시 서명/.test(signed.action.label));

  const verified = certificateStatus({
    row: { criterionId: 'python-basic-certificate', state: 'MET', evidenceId: 'e', current: true },
    session: { applicationId: 'a', boundApplicationId: 'a', phase: 'AUTHENTICATED' }, signedAtMs: 1,
  });
  assert.equal(verified.state, CERT.VERIFIED);
  assert.equal(verified.action, null);
});

test('시연 대역: 회고를 배운 점 없이 올리면 미충족, 고쳐 올리고 다시 요청하면 충족', () => {
  let now = 50_000;
  let saved = null;
  const store = { load: () => saved ?? { v: 1, mode: 'ON_REQUEST', lagMs: 1000, moodle: { activityAt: null, assignmentAt: null, reflection: null }, hr: { boundAt: null, messageAt: null, signedAt: null, consentAt: null }, refresh: {} }, save: (s) => { saved = s; }, reset: () => { saved = null; } };
  const server = createDemoServer({ store, nowMs: () => now });
  server.submitReflection('for 반복문으로 목록의 합계를 구하는 코드를 작성했습니다.\n빈 목록에서 결과가 달라져 초기값을 0으로 두고 다시 확인했습니다.');
  assert.equal(server.refresh('reflection-topics', null).status, 'QUEUED');
  now += 3100; // 접수 → 승인 대기 → 검토 중 → 검토 완료
  const r1 = server.view().criteria[2];
  assert.equal(r1.state, 'NOT_MET');
  const ev1 = server.decisionEvidence().manifest.criteria[2];
  assert.equal(ev1.checks.topics.find((t) => t.topicId === 'learning-takeaway').state, 'ABSENT');

  server.submitReflection('for 반복문으로 목록의 합계를 구하는 코드를 작성했습니다.\n빈 목록에서 결과가 달라져 초기값을 0으로 두고 다시 확인했습니다.\n초기값과 경계 입력을 함께 점검해야 한다는 점을 배웠습니다.');
  now += 10_000;
  assert.equal(server.view().criteria[2].state, 'NOT_MET', '고쳐 올리기만 하고 요청 전인데 바뀌었다');
  assert.equal(server.refresh('reflection-topics', 1).status, 'QUEUED');
  now += 3100;
  assert.equal(server.view().criteria[2].state, 'MET');
});


// ── 오규원 11/5 답: 재확인 완료 vs 새 판정, 고친 회고는 지난 결과로 ─────────────

test('새 근거가 왔지만 판정 상태가 같으면 "재확인 완료 · 판정 그대로" 이지 "새 판정 확정" 이 아니다', async () => {
  let current = rowsBefore();
  const { t } = tracker({ refresh: () => ({ status: 'RECORDED', operationId: 'op-s' }), read: async () => current });
  t.depart('activity-complete'); await t.arrive(); await flush();
  // 같은 NOT_MET 인데 근거 회차만 2 로 — 서버가 다시 읽어 새 근거를 남겼다
  current = [row('activity-complete', 'NOT_MET', 2), row('python-basic-certificate', 'UNKNOWN')];
  await t.recheck('activity-complete'); await flush();
  const s = t.status('activity-complete');
  assert.equal(s.state, RETURN.UPDATED);
  assert.equal(s.sameState, true);
  const text = returnLine(s, current[0]).text;
  assert.match(text, /재확인 완료/);
  assert.match(text, /판정은 그대로 미충족/);
  assert.ok(!/새 판정 확정/.test(text));
});

test('회고를 고치러 갔다 돌아와 새 판정 전이면 지난 글의 결과라고 적고 다시 쓰라고 하지 않는다', () => {
  const evRow = { metadataStatus: 'RECORDED', checks: { topics: [
    { topicId: 'work-performed', state: 'PRESENT', location: { start: 0, end: 10 } },
    { topicId: 'problem-solving-process', state: 'PRESENT', location: { start: 11, end: 20 } },
    { topicId: 'learning-takeaway', state: 'ABSENT', location: null },
  ] } };
  const row0 = { criterionId: 'reflection-topics', state: 'NOT_MET', evidenceId: 'e1', reasonCode: null };
  const waiting = reflectionReview({ row: row0, evRow, returned: true });
  assert.equal(waiting.previous, true);
  assert.equal(waiting.needsRewrite, false);
  assert.match(waiting.title, /지난 글의 검토 결과/);
  assert.match(waiting.title, /아직 검토 전/);
  const settled = reflectionReview({ row: row0, evRow, returned: false });
  assert.equal(settled.previous, false);
  assert.equal(settled.needsRewrite, true);
});
