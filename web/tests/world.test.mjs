// 시연 월드 — 규칙이 기획서대로 도는지
//
// 화면이 아니라 **계산**을 본다. 배정·확인·지급이 어긋나면 두 화면이 서로
// 다른 말을 하게 되고, 그건 화면 시험으로는 안 잡힌다.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AMOUNT, CRITERIA, CONFIRM_SECONDS, CLOCK_BASE,
  initialState, derive, toggleCriterion, deposit, confirm, tick, terminate, lookAt, skip,
} from '../src/demo/world.js';
import { viewFor, cohortOf } from '../src/demo/view.js';

const NOW = CLOCK_BASE;
const T = (atoms) => Number(atoms) / 1_000_000;
const at = (d, id) => d.byId.get(id);

test('처음 상태의 숫자가 서로 맞는다', () => {
  const d = derive(initialState(), NOW);

  // 단계 합 = 참여자 수. 어긋나면 운영자가 제일 먼저 알아챈다.
  assert.equal(d.stages.reduce((n, s) => n + s.count, 0), d.rows.length);
  assert.equal(d.rows.length, 20);

  const f = d.funding;
  assert.equal(T(f.depositedAtoms) - T(f.paidAtoms), T(f.balanceAtoms), '입금 - 지급 ≠ 잔액');
  assert.equal(T(f.balanceAtoms) - T(f.reservedAtoms), T(f.availableAtoms), '잔액 - 예약 ≠ 가용');

  // §8.2 — 가용이 남아 있는데 대기자가 있을 수 없다. 남으면 즉시 배정된다.
  const waiting = d.rows.filter((r) => r.stage === 'FUNDING_WAIT').length;
  assert.ok(waiting === 0 || T(f.availableAtoms) === 0,
    `가용 ${T(f.availableAtoms)} 인데 대기 ${waiting}명`);

  // 예약은 확인 기간에 들어간 사람 수만큼이다
  assert.equal(T(f.reservedAtoms), d.rows.filter((r) => r.stage === 'CONFIRMING').length * 100);
});

test('조건을 다 채우면 수락 시각이 찍히고, 하나 풀면 되돌아간다', () => {
  let s = initialState();
  const id = 'a-10';                                   // 3/4 로 시작
  assert.equal(at(derive(s, NOW), id).metCount, 3);
  assert.equal(at(derive(s, NOW), id).acceptedAt, null);

  s = toggleCriterion(s, id, CRITERIA[3], NOW);
  let row = at(derive(s, NOW), id);
  assert.equal(row.metCount, 4);
  assert.equal(row.acceptedAt, NOW, '다 채운 순간이 수락 시각이다');

  // §8.4 — 판정이 바뀌면 수락이 풀린다
  s = toggleCriterion(s, id, CRITERIA[0], NOW + 5);
  row = at(derive(s, NOW + 5), id);
  assert.equal(row.metCount, 3);
  assert.equal(row.acceptedAt, null);
  assert.equal(row.stage, 'IN_PROGRESS');
});

test('재원이 없으면 대기, 충전하면 수락 순서대로 배정된다', () => {
  let s = initialState();
  let d = derive(s, NOW);

  // 처음엔 가용 0 이라 두 명이 대기 중이다
  const waiters = d.rows.filter((r) => r.stage === 'FUNDING_WAIT').map((r) => r.id);
  assert.deepEqual(waiters, ['a-07', 'a-06'].sort((a, b) =>
    at(d, a).acceptedAt - at(d, b).acceptedAt));
  assert.equal(T(d.funding.shortfallAtoms), 200);

  // 100 만 넣으면 한 명만 넘어간다. 쪼개 주지 않는다.
  s = deposit(s, AMOUNT);
  d = derive(s, NOW);
  assert.equal(d.rows.filter((r) => r.stage === 'CONFIRMING').length, 3);
  assert.equal(d.rows.filter((r) => r.stage === 'FUNDING_WAIT').length, 1);

  // 먼저 수락된 쪽이 먼저다 (a-06 이 a-07 보다 먼저 수락됐다)
  assert.equal(at(d, 'a-06').stage, 'CONFIRMING');
  assert.equal(at(d, 'a-07').stage, 'FUNDING_WAIT');
  assert.equal(at(d, 'a-07').queue.position, 1);
});

test('양측이 확인하면 기다리지 않고 지급된다', () => {
  let s = initialState();
  const id = 'a-05';                                  // 확인 기간, 아무도 확인 안 함
  assert.equal(at(derive(s, NOW), id).stage, 'CONFIRMING');

  s = confirm(s, id, 'participant', NOW);
  assert.equal(at(derive(s, NOW), id).stage, 'CONFIRMING', '한쪽만으로는 안 나간다');

  const paidBefore = derive(s, NOW).funding.paidAtoms;
  s = confirm(s, id, 'operator', NOW);
  const d = derive(s, NOW);
  assert.equal(at(d, id).stage, 'PAID');
  assert.equal(T(d.funding.paidAtoms) - T(paidBefore), 100, '잔액에서 100 이 빠져야 한다');
});

test('확인 기간이 끝나면 확인 없이도 지급된다 — §8.3 기한 경로', () => {
  const s = initialState();
  const id = 'a-05';
  const row = at(derive(s, NOW), id);
  assert.equal(row.confirm.participant, false);
  assert.equal(row.confirm.operator, false);

  // 기한 전에는 아무 일도 없다
  assert.equal(tick(s, row.confirmAt - 1), s);

  const after = tick(s, row.confirmAt);
  assert.equal(at(derive(after, row.confirmAt), id).stage, 'PAID',
    '확인은 빨리 가는 길이지 거부권이 아니다');
});

test('확인 기간이 아니면 확인을 받아 두지 않는다', () => {
  const s = initialState();
  // a-06 은 재원 대기 — §8.3 시작 조건(전액 배정)을 아직 못 채웠다
  assert.equal(at(derive(s, NOW), 'a-06').stage, 'FUNDING_WAIT');
  assert.equal(confirm(s, 'a-06', 'participant', NOW), s);
});

test('지급된 사람은 되돌리지 않는다', () => {
  const s = initialState();
  const id = 'a-01';
  assert.equal(at(derive(s, NOW), id).stage, 'PAID');
  assert.equal(toggleCriterion(s, id, CRITERIA[0], NOW), s, '체인에 나간 거래는 못 되돌린다');
  assert.equal(terminate(s, id), s);
});

test('미해결 종료는 조건 미충족과 다르다 — 멘토 §3', () => {
  const s = initialState();
  const row = at(derive(s, NOW), 'a-08');
  assert.equal(row.stage, 'TERMINATED');
  assert.equal(row.metCount, 4, '조건은 다 채웠다');

  const v = viewFor(row, 'participant', NOW);
  assert.equal(v.decision.conditionsStatus, 'MET');
  assert.equal(v.procedure.terminationReason, 'UNRESOLVED_OBJECTION');
  assert.equal(v.procedure.reservationReleased, true);
  assert.equal(v.funding.status, 'RELEASED');
});

test('단계는 다섯이고, 손으로 찍는 단계는 없다', () => {
  const d = derive(initialState(), NOW);
  assert.deepEqual(d.stages.map((s) => s.key),
    ['IN_PROGRESS', 'CONFIRMING', 'FUNDING_WAIT', 'PAID', 'TERMINATED']);

  // 다섯 모두 **규칙이 만든다.** 조건 수·재원·확인·신고로만 결정되고,
  // 어느 것도 단추 하나로 찍을 수 없다.
  for (const row of d.rows) {
    if (row.paidAt) { assert.equal(row.stage, 'PAID'); continue; }
    if (row.terminated) { assert.equal(row.stage, 'TERMINATED'); continue; }
    if (row.metCount < 4) { assert.equal(row.stage, 'IN_PROGRESS'); continue; }
    assert.ok(['CONFIRMING', 'FUNDING_WAIT'].includes(row.stage), `${row.name}: ${row.stage}`);
  }
});

test('시계를 건너뛰면 기한이 지난 사람이 생긴다', () => {
  const s = initialState();
  const before = derive(s).rows.filter((r) => r.stage === 'CONFIRMING').length;
  assert.ok(before > 0);
  const jumped = skip(s, CONFIRM_SECONDS + 10);
  const due = derive(jumped).rows
    .filter((r) => r.stage === 'CONFIRMING' && derive(jumped).now >= r.confirmAt);
  assert.ok(due.length > 0, '건너뛰었는데 기한이 지난 사람이 없다');
});

// ── 화면이 받는 모양 ────────────────────────────────────────────────────

test('월드가 서버 응답과 같은 모양을 내보낸다', () => {
  const d = derive(initialState(), NOW);

  for (const row of d.rows) {
    for (const role of ['participant', 'operator']) {
      const v = viewFor(row, role, NOW);
      assert.equal(v.version, 'clear-bootcamp-normal-view.1');
      assert.equal(v.criteria.length, CRITERIA.length);
      assert.ok(v.procedure.id, `${row.name}/${role}: procedure.id 가 없다`);
      assert.ok(v.agreedPayment.amountAtoms);
      // 충족한 개수가 판정과 맞아야 한다
      assert.equal(v.criteria.filter((c) => c.state === 'MET').length, row.metCount);
      assert.equal(v.decision.conditionsStatus, row.metCount === 4 ? 'MET' : 'NOT_MET');
    }
  }
});

test('안 한 조건에 내역을 지어내지 않는다', () => {
  const d = derive(initialState(), NOW);
  const v = viewFor(at(d, 'a-18'), 'participant', NOW);     // 1/4
  for (const c of v.criteria.filter((x) => x.state !== 'MET')) {
    assert.equal(c.evidenceId, null);
    assert.equal(c.expiresAt, null);
    assert.equal(c.detail?.progress ?? null, null, '0 으로 채우면 "0개 했음" 으로 읽힌다');
    assert.deepEqual(c.detail?.items ?? [], []);
  }
});

test('지급된 사람만 지급 기록을 갖는다', () => {
  const d = derive(initialState(), NOW);
  for (const row of d.rows) {
    const v = viewFor(row, 'participant', NOW);
    if (row.stage === 'PAID') {
      assert.equal(v.payment.claimState, 'FINALIZED');
      assert.ok(v.payment.receivedAtoms);
    } else {
      assert.equal(v.payment.claimState, null, `${row.name}: 안 받았는데 청구 상태가 있다`);
      assert.equal(v.payment.receivedAtoms, null);
      assert.equal(v.payment.acceptedRight, null);
    }
  }
});

test('확인 기록은 확인한 사람 것만 들어간다', () => {
  const d = derive(initialState(), NOW);
  const v = viewFor(at(d, 'a-04'), 'participant', NOW);     // 참가자만 확인함
  assert.deepEqual(v.consent.records.map((r) => r.actorRole), ['PARTICIPANT']);
  assert.equal(v.consent.bothCurrent, false);

  const none = viewFor(at(d, 'a-05'), 'participant', NOW);
  assert.deepEqual(none.consent.records, []);
});

// ── 운영자가 보는 기수 ──────────────────────────────────────────────────

test('기수 집계가 명단과 맞는다', () => {
  const d = derive(initialState(), NOW);
  const c = cohortOf(d);

  assert.equal(c.applicants.length, c.participants);
  for (const st of c.stages) {
    assert.equal(c.applicants.filter((a) => a.stage === st.key).length, st.count,
      `${st.label}: 집계 ${st.count} ≠ 명단`);
  }
  // 확인 대기 큐 = 확인 기간 명단
  assert.deepEqual(
    c.pending.map((p) => p.who).sort(),
    c.applicants.filter((a) => a.stage === 'CONFIRMING').map((a) => a.name).sort(),
  );
  // 도구 집계는 전원을 확인한다
  for (const t of c.tools) assert.equal(t.ok + t.failed, t.ran);
  // §14.1 — 재지 않은 사람 시간은 계속 비어 있다
  assert.equal(c.metrics.humanWorkMs, null);
  assert.equal(c.metrics.humanWorkReductionPercent, null);
});

test('충전하면 기수 집계가 같이 움직인다', () => {
  let s = initialState();
  const before = cohortOf(derive(s, NOW));
  const n = (c, k) => c.stages.find((x) => x.key === k).count;
  assert.equal(n(before, 'FUNDING_WAIT'), 2);

  s = deposit(s, AMOUNT * 2);
  const after = cohortOf(derive(s, NOW));
  assert.equal(n(after, 'FUNDING_WAIT'), 0);
  assert.equal(n(after, 'CONFIRMING'), n(before, 'CONFIRMING') + 2);
  assert.equal(after.pending.length, n(after, 'CONFIRMING'));
});

test('보고 있는 학생을 바꿀 수 있다', () => {
  const s = lookAt(initialState(), 'a-14');
  assert.equal(s.me, 'a-14');
  assert.equal(lookAt(s, '없는-사람').me, 'a-14', '없는 id 는 무시한다');
});



test('오류 신고가 걸린 학생은 화면이 그 이유를 말한다', async () => {
  const { initialState, raiseObjection, derive, CLOCK_BASE } = await import('../src/demo/world.js');
  const { viewFor, cohortOf } = await import('../src/demo/view.js');
  const NOW = CLOCK_BASE;

  const s = raiseObjection(initialState(), 'a-06', '인용문을 배운 점으로 봤습니다', NOW);
  const d = derive(s, NOW);
  const row = d.byId.get('a-06');

  // 학생 화면 — 재원 대기보다 신고를 먼저 말한다
  const v = viewFor(row, 'participant', NOW);
  assert.equal(v.objection.blocked, true);

  // 운영자 화면 — 신고가 올라오고, 상태가 '재검증 중' 이다
  const c = cohortOf(d);
  const mine = c.objections.find((o) => o.note.includes('강민서'));
  assert.ok(mine);
  assert.equal(mine.state, 'RECEIVED', '막 접수된 건인데 재검증 중이라고 한다');
  assert.equal(mine.byRole, 'PARTICIPANT');

  // 끝난 건은 '재검증 중' 이 아니다. 아직 돌아가는 중인 줄 알면 안 된다.
  const ended = c.objections.find((o) => o.note.includes('임채원'));
  assert.equal(ended.state, 'UNRESOLVED');

  // 명단에도 막힌 이유가 적힌다
  const ap = c.applicants.find((a) => a.id === 'a-06');
  assert.ok(ap.note.includes('신고 접수됨'), ap.note);

  // 시간이 지나면 서버가 일하는 단계로 넘어간다
  const later = derive(raiseObjection(initialState(), 'a-06', '인용문을 배운 점으로 봤습니다', NOW),
    NOW + 30);
  assert.equal(later.byId.get('a-06').objectionPhase, 'ASSESSING');
  assert.ok(cohortOf(later).applicants.find((a) => a.id === 'a-06').note.includes('재검증 진행 중'));
});

test('다음 기한까지 건너뛰면 그 일이 실제로 일어난다', async () => {
  const { initialState, derive, skipToNext, tick, raiseObjection, CLOCK_BASE } =
    await import('../src/demo/world.js');

  // ① 확인 기간이 끝나 지급된다
  let s = skipToNext(initialState(), CLOCK_BASE);
  let d = derive(s);
  const due = d.rows.filter((r) => r.stage === 'CONFIRMING' && d.now >= r.confirmAt);
  assert.ok(due.length > 0, '건너뛰었는데 기한이 안 지났다');
  assert.notEqual(tick(s), s, '기한이 지났는데 지급이 안 된다');

  // ② 가장 가까운 기한으로 간다. 멀리 있는 것을 건너뛰지 않는다.
  const first = Math.min(...derive(initialState(), CLOCK_BASE).rows
    .filter((r) => r.stage === 'CONFIRMING').map((r) => r.confirmAt));
  assert.equal(derive(s).now, first + 1, '가장 가까운 기한이 아니다');

  // ③ 신고가 걸린 신청은 눌러 가다 보면 **재검증이 끝나고 지급까지 간다.**
  //    아무도 안 풀면 종료가 아니다 — 그러면 신고가 거부권이 된다.
  let o = raiseObjection(initialState(), 'a-05', '인용문을 배운 점으로 봤습니다', CLOCK_BASE);
  for (let i = 0; i < 20; i += 1) {
    const next = tick(skipToNext(o));
    if (next === o) break;
    o = next;
    if (derive(o).byId.get('a-05').stage === 'PAID') break;
  }
  const row = derive(o).byId.get('a-05');
  assert.equal(row.stage, 'PAID', `신고가 기각됐어야 하는데 ${row.stage}`);
  assert.equal(row.objectionLog.at(-1).outcome, 'DISMISSED');
});

test('미해결 종료는 손으로 찍을 수 없다 — 규칙이 만든다', async () => {
  const world = await import('../src/demo/world.js');
  // 조작판에서 쓰던 수동 단추를 뺐다. 신고 없이 종료된 신청은 실제 서버에서
  // 나올 수 없으므로, 만들 수 있게 두면 안 되는 상태를 보여 주게 된다.
  const panel = await import('node:fs/promises')
    .then((fs) => fs.readFile(new URL('../src/demo/panel.js', import.meta.url), 'utf8'));
  assert.ok(!panel.includes('terminate'), '조작판에 미해결 종료 단추가 남아 있다');
  // 월드에는 남는다 — fixture 의 임채원이 쓰고, 규칙(tick)이 부른다
  assert.equal(typeof world.terminate, 'function');
});

test('막힌 이유가 못 채운 조건과 어긋나지 않는다', async () => {
  const { initialState, derive, CRITERIA, CLOCK_BASE } = await import('../src/demo/world.js');
  const { cohortOf } = await import('../src/demo/view.js');

  // 이미 충족한 조건을 이유로 적으면 화면이 자기 말을 뒤집는다.
  const 말 = [
    [/회고|문제 해결 과정|배운 점/, 'reflection-topics'],
    [/인증서|공증|증명 계정/, 'python-basic-certificate'],
    [/과제/, 'assignment-submitted'],
    [/수강|출석|활동/, 'activity-complete'],
  ];

  for (const a of cohortOf(derive(initialState(), CLOCK_BASE)).applicants) {
    if (!a.note) continue;
    for (const [re, cid] of 말) {
      if (!re.test(a.note)) continue;
      const c = a.criteria.find((x) => x.id === cid);
      assert.equal(c.met, false,
        `${a.name}: "${a.note}" 라는데 ${cid} 는 충족이다`);
    }
  }

  // 다 채운 사람에게는 막힌 이유가 없다 (재원·신고 사유는 따로 붙는다)
  for (const a of cohortOf(derive(initialState(), CLOCK_BASE)).applicants) {
    if (a.met < CRITERIA.length || !a.note) continue;
    assert.ok(/재원|오류 신고/.test(a.note), `${a.name}: 4/4 인데 "${a.note}"`);
  }
});

test('옛 저장본은 되살리지 않는다', async () => {
  const { initialState } = await import('../src/demo/world.js');
  const fs = await import('node:fs/promises');
  const store = await fs.readFile(new URL('../src/demo/store.js', import.meta.url), 'utf8');

  // 저장본 판 번호가 월드와 같아야 한다. 어긋나면 옛 모양이 되살아나
  // 없는 칸을 읽다가 화면이 통째로 멈춘다 — 실제로 한 번 그랬다.
  const shape = Number(store.match(/const SHAPE = (\d+);/)[1]);
  assert.equal(shape, initialState().v, 'store 의 SHAPE 와 world 의 v 가 다르다');

  // 학생 한 명이 들고 있어야 할 칸. 하나라도 빠지면 판 번호를 올려야 한다.
  const keys = Object.keys(initialState().students[0]).sort();
  assert.deepEqual(keys, [
    'acceptedAt', 'aiApprovedAt', 'confirm', 'id', 'met', 'name', 'note',
    'objection', 'objectionLog', 'paidAt', 'revalidationUsed', 'terminated',
  ].sort(), '학생 모양이 바뀌었다 — initialState().v 와 store 의 SHAPE 를 올렸나?');
});

// ── 운영자 AI 승인 ─────────────────────────────────────────────────────
//
// 유료 호출이고 학생 글이 외부 모델로 나간다. 운영자가 건건이 눌러야 한다.

test('회고는 AI 승인 뒤에만 판정된다', async () => {
  const { initialState, derive, toggleCriterion, approveAi, CLOCK_BASE } =
    await import('../src/demo/world.js');
  const NOW = CLOCK_BASE;
  const at = (s, id) => derive(s, NOW).byId.get(id);

  const s = initialState();
  const 아직 = at(s, 'a-14');                       // 2/4, 회고 미충족
  assert.equal(아직.aiApproved, false);
  assert.equal(toggleCriterion(s, 'a-14', 'reflection-topics', NOW), s,
    '승인 없이 회고가 켜졌다');

  const ok = approveAi(s, 'a-14', NOW);
  assert.equal(at(ok, 'a-14').aiApproved, true);
  assert.equal(derive(toggleCriterion(ok, 'a-14', 'reflection-topics', NOW), NOW)
    .byId.get('a-14').metCount, 3);

  // 이미 회고가 충족인 사람은 승인이 끝난 사람이다.
  // 승인 없이 회고 판정만 있는 상태는 서버에서 나올 수 없다.
  for (const r of derive(s, NOW).rows) {
    if (r.met.includes('reflection-topics')) {
      assert.equal(r.aiApproved, true, `${r.name}: 회고는 충족인데 승인이 없다`);
    }
  }
});

test('승인 자료가 서버 모양과 같다', async () => {
  const { initialState, derive, CLOCK_BASE } = await import('../src/demo/world.js');
  const { aiApprovalOf } = await import('../src/demo/view.js');
  const { aiGate, approvalRemainingMs } = await import('../src/bootcamp/ai-approval.js');

  const WALLET = '0xabc0000000000000000000000000000000000001';
  const row = derive(initialState(), CLOCK_BASE).byId.get('a-14');
  const a = aiApprovalOf(row, CLOCK_BASE, WALLET);

  // driver.js 가 보내는 칸이 다 있어야 한다
  for (const k of ['applicationId', 'bodySha256', 'planHash', 'contextHash',
    'runBindingHash', 'codeHead', 'model', 'costAcknowledgment']) {
    assert.ok(a[k], `${k} 가 없다`);
  }
  assert.equal(a.status, 'WAITING');
  assert.equal(a.permitted, true);

  // 남은 시간은 **조회 뒤 흐른 만큼 줄어든다.** 늘어나지 않는다.
  assert.equal(approvalRemainingMs(a, 1000, 1000), 120_000);
  assert.equal(approvalRemainingMs(a, 1000, 31_000), 90_000);
  assert.ok(approvalRemainingMs(a, 1000, 200_000) < 0);

  // 누를 수 있는 조건 — 게이트는 백엔드 review-window.js 것을 그대로 쓴다
  const gate = (over) => aiGate({
    approval: a, remainingMs: 120_000, applicationId: a.applicationId,
    wallet: WALLET, unknown: false, acked: true, busy: false, ...over,
  });
  assert.equal(gate().enabled, true, gate().reason);
  assert.equal(gate({ acked: false }).code, 'AI_ACK_REQUIRED');
  assert.equal(gate({ unknown: true }).code, 'AI_OUTCOME_UNKNOWN');
  assert.equal(gate({ remainingMs: -1 }).code, 'AI_TIME_INSUFFICIENT');
  assert.equal(gate({ busy: true }).code, 'BUSY');
  assert.equal(gate({ wallet: null }).code, 'LOGIN_REQUIRED');
  // **지정 승인 지갑이 아니면 못 누른다.** 손으로 쓴 게이트가 빠뜨렸던 조건이다.
  assert.equal(gate({ wallet: '0xdead000000000000000000000000000000000000' }).code, 'AI_WRONG_WALLET');
  assert.equal(gate({ approval: { ...a, authorityConfigured: false } }).code, 'AI_AUTHORITY_REQUIRED');
  assert.equal(gate({ approval: { ...a, reviewScreensReady: false } }).code, 'BOTH_READERS_REQUIRED');
  assert.equal(gate({ approval: { ...a, status: 'RECORDED' } }).code, 'AI_RECORDED');
  assert.equal(gate({ approval: null }).code, 'AI_PACKET_WAIT');
  // 거부 사유 문구도 백엔드 것이다 — 우리가 지어내지 않는다
  assert.ok(gate({ acked: false }).reason.includes('확인 체크박스'));
});

test('복사해 온 게이트가 원본과 글자 하나까지 같다', async () => {
  const fs = await import('node:fs/promises');
  // 줄끝(CRLF/LF)은 체크아웃 설정 문제라 비교에서 뺀다. 내용만 본다.
  const CR = String.fromCharCode(13);
  const LF = String.fromCharCode(10);
  const read = async (u) => (await fs.readFile(u, 'utf8')).split(CR + LF).join(LF);
  const mine = await read(new URL('../src/bootcamp/review-window.js', import.meta.url));
  const orig = await read(new URL('../../tools/bootcamp/test-client/review-window.js', import.meta.url));

  const MARK = '//@@ 아래부터 원본';
  assert.ok(mine.includes(MARK), '복사본에 출처 머리말이 없다');
  const body = mine.slice(mine.indexOf(LF + LF, mine.indexOf(MARK)) + 2);
  // 원본이 바뀌면 여기서 터진다. 터지면 다시 복사하고 출처 커밋을 고친다.
  assert.equal(body, orig, 'review-window.js 원본이 바뀌었다 — 다시 복사해야 한다');
});

test('사용자가 한 일과 서버가 하는 일을 나눠서 보여준다', async () => {
  const { initialState, derive, raiseObjection, CLOCK_BASE, INTAKE_SECONDS, REVALIDATION_SECONDS } =
    await import('../src/demo/world.js');
  const { viewFor } = await import('../src/demo/view.js');
  const NOW = CLOCK_BASE;

  // 오규원 10-28: "사용자의 이의/다시 확인 요청과 서버가 수행하는 평가·
  // 원천 재수집·실질 재검증을 분리." 학생이 재검증을 돌린 것처럼 읽히면
  // 안 된다 — 학생은 신고만 하고, 다시 보는 건 서버다.
  const s = raiseObjection(initialState(), 'a-05', '인용문을 배운 점으로 봤습니다', NOW);
  assert.ok(INTAKE_SECONDS < REVALIDATION_SECONDS, '접수가 결과보다 늦다');

  const 접수 = derive(s, NOW + 1).byId.get('a-05');
  assert.equal(접수.objectionPhase, 'RECEIVED');
  const v1 = viewFor(접수, 'participant', NOW + 1);
  assert.equal(v1.objection.phase, 'RECEIVED');

  const 진행 = derive(s, NOW + INTAKE_SECONDS + 1).byId.get('a-05');
  assert.equal(진행.objectionPhase, 'ASSESSING');

  // 두 단계 모두 지급은 멈춰 있다
  assert.equal(접수.blocked, true);
  assert.equal(진행.blocked, true);
});
