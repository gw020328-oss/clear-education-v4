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
  const rowsBeforeRef = rowsBefore();
  let current = rowsBeforeRef;
  const { t, c, calls } = tracker({
    refresh: () => (current === rowsBeforeRef ? { status: 'QUEUED', operationId: 'op-1' } : { status: 'RECORDED', operationId: 'op-1' }),
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
  // 바뀐 판정을 이번 요청의 결과로 확정하려고 한 번 더 묻는다(RECORDED 확인). 그 밖엔 없다
  assert.equal(calls.filter((x) => Array.isArray(x)).length, 2, '접수 1 + 확정 확인 1 이어야 한다');
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

test('명령 직전 조회 revision 사용: 호스트 상태가 7이어도 최신 8, 충돌 뒤 수동 복구는 9', async () => {
  let revision = 7;
  let conflict = true;
  const requests = [];
  const t = createReturnTracker({
    applicationId: APP, getRows: rowsBefore, getRevision: () => 7,
    read: async () => ({ applicationId: APP, rows: rowsBefore(), decision: { revision }, current: true }),
    refresh: async (req) => {
      requests.push(req.expectedRevision);
      if (conflict) { revision = 9; throw Object.assign(new Error('REVISION_CONFLICT'), { code: 'REVISION_CONFLICT' }); }
      return { status: 'QUEUED' };
    },
    storage: memoryStore(), setTimer: () => 1, clearTimer: () => {},
  });
  t.depart('activity-complete'); revision = 8;
  await t.arrive();
  assert.deepEqual(requests, [8]);
  assert.equal(t.status('activity-complete').state, RETURN.PENDING);
  conflict = false;
  await t.recheck('activity-complete');
  assert.deepEqual(requests, [8, 9]);
  t.close();
});

test('60초 제한은 수동·복귀·다른 조건 타이머에도 적용하고 만료 뒤 전송한다', async () => {
  const c = clock(); const requests = []; let reads = 0;
  const t = createReturnTracker({
    applicationId: APP, getRows: rowsBefore, getRevision: () => 7,
    read: async () => { reads++; return { applicationId: APP, rows: rowsBefore(), decision: { revision: 8 } }; },
    refresh: async (req) => { requests.push({ ...req, at: c.nowMs() }); return req.criterionId === 'assignment-submitted'
      ? { status: 'QUEUED' } : { status: 'RATE_LIMITED', retryAfterSeconds: 60 }; },
    storage: memoryStore(), ...c, followUpMs: [100, 200, 300],
  });
  t.depart('activity-complete'); await t.arrive();
  await c.tick(1); await t.recheck('activity-complete');
  assert.equal(requests.length, 1);
  t.depart('activity-complete'); await t.arrive();
  assert.equal(requests.length, 1, '다시 이동해도 제한 유지');
  t.depart('assignment-submitted'); await t.arrive();
  await c.tick(100);
  assert.equal(requests.filter(r => r.criterionId === 'activity-complete').length, 1);
  assert.ok(reads > requests.length, '저장 판정 조회는 계속');
  await c.tick(59899); await t.recheck('activity-complete');
  assert.equal(requests.filter(r => r.criterionId === 'activity-complete').length, 2);
  t.close();
});

// ── 조회 대기 중 폐기·교체 (PR #165 최종 리뷰 P2) ───────────────────────
//
// 재확인 요청 직전의 최신 조회(await read()) 동안 추적기가 닫히거나 그 조건의 방문이
// 새 depart/recheck 로 바뀌면, 조회가 끝난 뒤 이전 요청을 보내거나 새 방문을 덮으면 안 된다.

/** 첫 조회(명령 직전 조회)만 손으로 끝내는 추적기. answer() 뒤 조회는 바로 답한다 */
function gated({ refresh = async () => ({ status: 'QUEUED', operationId: 'op' }), revision = 8 } = {}) {
  const reads = []; const requests = []; let open = false;
  const snapshot = () => ({ applicationId: APP, rows: rowsBefore(), decision: { revision }, current: true });
  const t = createReturnTracker({
    applicationId: APP, getRows: rowsBefore, getRevision: () => 7,
    read: () => (open ? Promise.resolve(snapshot()) : new Promise((resolve) => reads.push(() => resolve(snapshot())))),
    refresh: async (req) => { requests.push(req); return refresh(req); },
    storage: memoryStore(), setTimer: () => 1, clearTimer: () => {}, followUpMs: [100, 200, 300],
  });
  const answer = async () => { open = true; while (reads.length) reads.shift()(); await flush(); };
  return { t, reads, requests, answer };
}

test('조회 대기 중 추적기를 닫으면 조회가 끝나도 재확인 요청을 보내지 않는다', async () => {
  const g = gated();
  g.t.depart('activity-complete');
  const pending = g.t.arrive();
  await flush();
  assert.equal(g.reads.length, 1, '명령 직전 조회가 대기 중이어야 한다');
  g.t.close();
  await g.answer();
  await pending;
  assert.equal(g.requests.length, 0, '닫힌 추적기가 재확인 요청을 보냈다');
});

test('조회 대기 중 같은 조건을 다시 떠나면 이전 방문의 요청을 보내지 않고 새 방문을 덮지 않는다', async () => {
  const g = gated();
  g.t.depart('activity-complete');
  const pending = g.t.arrive();
  await flush();
  g.t.depart('activity-complete');            // 새 방문 — 아직 떠나 있다
  await g.answer();
  await pending;
  assert.equal(g.requests.length, 0, '교체된 방문에 이전 요청을 보냈다');
  const s = g.t.status('activity-complete');
  assert.equal(s.state, RETURN.AWAY, '새 방문 상태가 덮였다: ' + s.state);
  assert.equal(s.refresh, null);
  g.t.close();
});

test('응답 대기 중 방문이 바뀌면 그 응답이 새 방문의 상태·요청 결과를 덮지 않는다(제한 시각만 이어 받는다)', async () => {
  let release;
  const g = gated({ refresh: () => new Promise((r) => { release = r; }) });
  g.t.depart('activity-complete');
  const pending = g.t.arrive();
  await flush(); await g.answer();
  assert.equal(g.requests.length, 1);
  g.t.depart('activity-complete');            // 요청은 이미 나갔다. 응답 전에 새 방문
  release({ status: 'RATE_LIMITED', retryAfterSeconds: 60 });
  await flush(); await g.answer(); await pending;
  const s = g.t.status('activity-complete');
  assert.equal(s.state, RETURN.AWAY, '새 방문 상태가 덮였다');
  assert.equal(s.refresh, null, '이전 응답이 새 방문 결과로 적혔다');
  assert.equal(s.needsRefresh, false);
  assert.ok(s.nextAllowedAt > 0, '조건별 제한 시각은 이어 받아야 한다');
  g.t.close();
});

test('조회 대기 중 「다시 확인」 으로 바뀐 방문에도 이전 요청을 보내지 않는다', async () => {
  const g = gated();
  g.t.depart('activity-complete');
  const pending = g.t.arrive();
  await flush();
  void g.t.recheck('activity-complete');
  await g.answer(); await pending;
  assert.equal(g.requests.length, 0, '다시 확인 전 요청이 나갔다');
  g.t.close();
});

test('정상 활성 방문은 최신 조회의 revision 으로 재확인 1건', async () => {
  const g = gated({ revision: 12 });
  g.t.depart('activity-complete');
  const pending = g.t.arrive();
  await flush(); await g.answer(); await pending;
  assert.deepEqual(g.requests, [{ criterionId: 'activity-complete', expectedRevision: 12 }]);
  assert.equal(g.t.status('activity-complete').refresh.status, REFRESH.QUEUED);
  g.t.close();
});

for (const mode of ['depart', 'recheck', 'error']) {
  test(`늦은 최종 조회는 교체된 방문을 덮지 않는다: ${mode}`, async () => {
    const id = 'activity-complete'; const c = clock();
    let rows = rowsBefore(); let release; let reject; let reads = 0; let sends = 0;
    const snapshot = (r) => ({ applicationId: APP, rows: r, decision: { revision: 12 }, current: true });
    const t = createReturnTracker({
      applicationId: APP, getRows: () => rows, storage: memoryStore(), ...c,
      read: () => ++reads === 2 ? new Promise((yes, no) => { release = yes; reject = no; }) : Promise.resolve(snapshot(rows)),
      refresh: async () => { sends++; return { status: 'QUEUED' }; }, followUpMs: [100, 200, 300],
    });
    t.depart(id); const pending = t.arrive(); await flush();
    assert.equal(reads, 2);
    rows = rowsAfter();
    if (mode === 'depart') t.depart(id);
    else for (let i = 0; i < 5; i++) void t.recheck(id);
    const before = t.status(id);
    if (mode === 'error') reject(new Error('OLD_READ_FAILED'));
    else release(snapshot(rowsBefore()));
    await pending;
    assert.deepEqual(t.status(id), before, '이전 조회의 결과·오류가 새 방문을 바꿨다');
    if (mode === 'depart') await t.arrive();
    else await c.tick(100);
    // depart: 기준이 이미 바뀐 줄이라 접수 1 뿐. recheck·error: 기준은 옛 줄이라 접수 1 + 바뀐
    // 판정의 확정 확인 1. 교체된 이전 방문의 요청은 어느 쪽에도 없다
    assert.equal(sends, mode === 'depart' ? 2 : 3, '새 방문 요청만 있어야 한다(이전 방문 것은 없음)');
    t.close();
  });
}

// ── 6 · 늦은 판정 — 이번 요청 처리 전에 바뀐 판정은 확정하지 않는다 ──────────
//
// 회고를 "배운 점 빼고" 올리고 곧바로 고쳐 올린 뒤 돌아오면, 지난 글의 '미충족' 이
// 이번 방문의 요청(접수 직후)과 겹쳐 도착한다. 그걸 "새 판정 확정 · 미충족 · 다시
// 쓰세요" 로 닫으면 고친 글은 다시 읽히지 않는다(2026-11-05 화면에서 재현).

test('늦은 판정: 접수(QUEUED)·제한 중에 바뀐 판정은 PENDING 으로 두고, 재요청이 RECORDED 를 주면 확정한다', async () => {
  let reads = 0;
  const answers = [
    { status: 'QUEUED', operationId: 'op-late-1' },
    { status: 'RATE_LIMITED', operationId: 'op-late-1', retryAfterSeconds: 1 },
    { status: 'RECORDED', operationId: 'op-late-1' },
  ];
  const { t, c, calls } = tracker({
    refresh: () => answers.shift() ?? { status: 'RECORDED', operationId: 'op-late-1' },
    read: async () => (reads++ === 0 ? rowsBefore() : rowsAfter()),
  });
  t.depart('activity-complete');
  await t.arrive(); await flush();
  assert.equal(t.status('activity-complete').state, RETURN.PENDING);

  // 재조회에서 판정이 바뀌어 있지만 요청은 접수 상태 → 같은 회차에 한 번 더 묻는다(제한) → 보류
  await c.tick(100);
  const held = t.status('activity-complete');
  assert.equal(held.state, RETURN.PENDING, '늦은 판정인데 상태가 ' + held.state);
  assert.equal(held.lateChange, true);
  assert.equal(held.refresh.status, REFRESH.RATE_LIMITED);
  assert.equal(calls.filter((x) => Array.isArray(x)).length, 2, '같은 회차에 재요청 한 번');
  const line = returnLine(held, rowsAfter()[0]);
  assert.match(line.text, /바뀌었지만/);
  assert.match(line.text, /지난 요청의 결과일 수 있어/);
  assert.equal(line.recheck, true);

  // 제한(1초)이 지난 뒤: 재요청 → RECORDED → 같은 변화가 이번 요청의 결과로 확정
  await c.tick(1000);
  const done = t.status('activity-complete');
  assert.equal(done.state, RETURN.UPDATED, '기록 뒤에도 상태가 ' + done.state);
  assert.equal(done.sameState, false);
  assert.equal(done.lateChange, false);
  assert.equal(calls.filter((x) => Array.isArray(x)).length, 3);
  assert.match(returnLine(done, rowsAfter()[0]).text, /새 판정 확정/);
});

test('늦은 판정: 같은 회차의 재요청이 바로 RECORDED 면 그 자리에서 확정한다', async () => {
  let reads = 0;
  let n = 0;
  const { t, c, calls } = tracker({
    refresh: () => (n++ === 0 ? { status: 'QUEUED', operationId: 'op-q' } : { status: 'RECORDED', operationId: 'op-q' }),
    read: async () => (reads++ === 0 ? rowsBefore() : rowsAfter()),
  });
  t.depart('activity-complete');
  await t.arrive(); await flush();
  assert.equal(t.status('activity-complete').state, RETURN.UPDATED);
  assert.equal(calls.filter((x) => Array.isArray(x)).length, 2);
  void c;
});

test('돌아오자마자 화면이 먼저 읽은 바뀐 판정(요청 전)도 보류하고, 요청이 기록된 뒤 확정한다', async () => {
  // 같은 탭으로 다녀오면 페이지가 새로 뜨고, 화면의 첫 조회(observe)가 arrive 보다 먼저 온다.
  let n = 0;
  const { t, c } = tracker({
    refresh: () => (n++ === 0 ? { status: 'QUEUED', operationId: 'op-e' } : { status: 'RECORDED', operationId: 'op-e' }),
    read: async () => rowsAfter(),
  });
  t.depart('activity-complete');
  t.observe({ applicationId: APP, rows: rowsAfter(), current: true });
  const early = t.status('activity-complete');
  assert.equal(early.state, RETURN.PENDING, '요청 전 읽기인데 ' + early.state);
  assert.equal(early.lateChange, true);
  await t.arrive(); await flush();
  assert.equal(t.status('activity-complete').state, RETURN.UPDATED, '접수 뒤 확정 확인(RECORDED)이 왔는데 ' + t.status('activity-complete').state);
  void c;
});

test('재확인 경로가 없으면(지금 develop) 바뀐 판정은 전처럼 바로 확정한다 — 기다릴 근거가 없다', async () => {
  const { t } = tracker({ refresh: null, read: async () => rowsAfter() });
  t.depart('activity-complete');
  await t.arrive(); await flush();
  assert.equal(t.status('activity-complete').state, RETURN.UPDATED);
});

test('근거 없는 줄로 바뀐 것(회고 승인 대기·검토 중)은 새 판정이 아니다 — 계속 읽고, 근거가 오면 확정한다', async () => {
  const interim = () => [{ criterionId: 'reflection-topics', state: 'MISSING', current: true, evidenceId: null, evidenceRevision: null, reasonCode: null }];
  const reviewed = () => [row('reflection-topics', 'MET', 2)];
  let reads = 0;
  const { t, c } = tracker({
    rows: () => [row('reflection-topics', 'NOT_MET', 1)],
    refresh: () => ({ status: 'RECORDED', operationId: 'op-r' }),
    read: async () => (reads++ < 3 ? interim() : reviewed()), // 요청 전 조회 1 + 복귀 읽기 1 + 재조회 1 은 중간 단계
  });
  t.depart('reflection-topics');
  await t.arrive(); await flush();
  const mid = t.status('reflection-topics');
  assert.equal(mid.state, RETURN.PENDING, '근거 없는 중간 단계인데 ' + mid.state);
  await c.tick(100);
  assert.equal(t.status('reflection-topics').state, RETURN.PENDING);
  await c.tick(200);
  const done = t.status('reflection-topics');
  assert.equal(done.state, RETURN.UPDATED);
  assert.equal(done.sameState, false);
});

test('늦은 판정이 끝내 확인되지 않으면 STALLED 문구가 "판정은 바뀌었지만 처리 확인 못 함" 을 말한다', async () => {
  let reads = 0;
  const { t, c } = tracker({
    refresh: () => ({ status: 'QUEUED', operationId: 'op-z' }),
    read: async () => (reads++ === 0 ? rowsBefore() : rowsAfter()),
  });
  t.depart('activity-complete');
  await t.arrive(); await flush();
  for (let i = 0; i < 6; i += 1) await c.tick(400);
  const s = t.status('activity-complete');
  assert.equal(s.state, RETURN.STALLED, '상태가 ' + s.state);
  assert.equal(s.lateChange, true);
  assert.match(returnLine(s, rowsAfter()[0]).text, /바뀌었지만/);
  assert.match(returnLine(s, rowsAfter()[0]).text, /다시 확인/);
});


// ── 7 · 카드 버튼을 안 거치고 Moodle 에서 직접 마친 경우 ─────────────────────

test('떠난 기록이 없어도 「다시 확인」 이 새 방문을 만들어 재확인을 요청하고, 바뀐 판정이 기록되면 확정한다', async () => {
  let reads = 0; let n = 0;
  const { t, c, calls } = tracker({
    refresh: () => (n++ === 0 ? { status: 'QUEUED', operationId: 'op-idle' } : { status: 'RECORDED', operationId: 'op-idle' }),
    read: async () => (reads++ < 2 ? rowsBefore() : rowsAfter()),
  });
  assert.equal(t.status('activity-complete').state, RETURN.IDLE);
  await t.recheck('activity-complete'); await flush();
  const s = t.status('activity-complete');
  assert.equal(s.state, RETURN.PENDING, '요청 뒤 읽었는데 ' + s.state);
  assert.equal(s.departed, false);
  assert.equal(s.refresh.status, REFRESH.QUEUED);
  assert.equal(calls.filter((x) => Array.isArray(x)).length, 1);
  await c.tick(100);
  assert.equal(t.status('activity-complete').state, RETURN.UPDATED);
});

test('떠난 기록 없는 미충족 카드는 「다시 확인」 안내가 있고, 충족·HackerRank 는 없다', () => {
  const idle = { state: RETURN.IDLE };
  const unmet = returnLine(idle, row('assignment-submitted', 'NOT_MET'));
  assert.equal(unmet.recheck, true);
  assert.match(unmet.text, /직접 마치셨다면/);
  assert.equal(returnLine(idle, row('assignment-submitted', 'MET')), null);
  assert.equal(returnLine(idle, row('python-basic-certificate', 'UNKNOWN')), null);
  assert.equal(returnLine(null, row('activity-complete', 'NOT_MET'))?.recheck, true);
});
