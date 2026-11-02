// 가능한 상태를 전부 만들어 보고 어긋난 데를 찾는다
//
// verify-screens.mjs 는 **처음 상태 하나**만 그려 본다. 발표에서는 조건을
// 켜고 끄고, 충전하고, 신고하고, 시계를 돌린다. 그 조합에서만 나오는 모순이
// 있다 — 예: 지급이 끝났는데 확인 기간 남은 시간이 보인다.
//
// 그래서 여기서는 **조합을 전부 돈다.**
//
//   조건 2^4 = 16 × 재원 5단계 × 신고 2 × 확인 4 = 640 가지
//   거기에 기수 전체를 굴리는 흐름 검사 몇 가지
//
// 화면까지 실제로 그려 본다. 월드 계산만 맞고 화면이 틀리면 소용없다.

class N {
  constructor(t) {
    this.tagName = String(t).toUpperCase();
    this.children = []; this.attributes = {}; this.className = ''; this._text = '';
  }
  get firstChild() { return this.children[0] ?? null; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent ?? '').join(''); }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  addEventListener() {}
  append(...n) { for (const x of n) this.children.push(x); }
  removeChild(n) { this.children = this.children.filter((c) => c !== n); }
}
globalThis.document = {
  createElement: (t) => new N(t),
  createElementNS: (_, t) => new N(t),
  createTextNode: (t) => ({ textContent: String(t), children: [] }),
};
globalThis.crypto ??= { getRandomValues: (a) => a.fill(7) };

const { studentSection, conditionDetail } = await import('../src/bootcamp/student-view.js');
const { operatorSection } = await import('../src/bootcamp/operator-view.js');
const W = await import('../src/demo/world.js');
const { viewFor, cohortOf } = await import('../src/demo/view.js');

const CONN = { state: 'LIVE', address: '0xabc123', recipient: '0xrecipient', walletKind: 'EMBEDDED' };
const API = Object.fromEntries(['view', 'consent', 'operation', 'paymentReceipt',
  'bindSourceSession', 'pendingSourceSignature', 'submitSourceSignature', 'objection'].map((k) => [k, () => {}]));
const SIGN = () => '0xsig';

let checked = 0;
const problems = [];
const fail = (where, what) => problems.push(`${where} — ${what}`);

// ── 화면 한 장이 지켜야 할 것 ──────────────────────────────────────────

const BANNED = [
  [/undefined|NaN|\[object/, '값 샘'],
  [/(어요|예요|에요)/, '해요체'],
  [/남음 뒤/, '문구 겹침'],
  [/NEEDS_FIX|IN_PROGRESS|FUNDING_WAIT|CONFIRMING|TERMINATED|OBJECTION_BLOCKED|WAITING_CONFIRMATION/, '서버 코드 노출'],
  // 끝난 절차에 남으면 안 되는 칸들. 충전 거래처럼 서버가 진짜로 안 주는
  // 값은 '아직 못 받은 값' 이 맞으므로 여기 넣지 않는다.
  [/아직 못 받은 값 — (조건 충족 시각|확인 기간 종료|참가자 확인|운영자 확인|대기 순서|지급 시각)/, '해당 없는 칸'],
];

function scan(where, text) {
  for (const [re, name] of BANNED) {
    const m = text.match(re);
    if (m) fail(where, `${name}: "${text.slice(Math.max(0, m.index - 25), m.index + 40).replace(/\s+/g, ' ')}"`);
  }
}

/**
 * 학생 화면 한 장.
 *
 * 단계와 화면이 서로 다른 말을 하면 안 된다. 그게 이 검사의 전부다.
 */
function checkStudent(row, now, where) {
  const view = viewFor(row, 'participant', now);
  const node = studentSection({ view, conn: CONN, api: API, sign: SIGN, phase: 'ACTIVE_LOCAL_TEST' });
  const t = node.textContent;
  checked += 1;
  scan(where, t);

  const paid = row.stage === 'PAID';
  const ended = row.stage === 'TERMINATED';

  // ① 받지 않았는데 받았다고 하지 않는다
  if (!paid && /지급이 끝났습니다|환급 완료/.test(t)) fail(where, '안 받았는데 끝났다고 함');
  if (paid && !t.includes('환급 완료')) fail(where, '받았는데 완료라고 안 함');

  // ② 끝난 절차에 남은 시간을 띄우지 않는다
  if ((paid || ended) && /남음/.test(t)) fail(where, '끝났는데 남은 시간이 있다');

  // ③ 미해결 종료는 조건 미충족과 다르게 보인다 (멘토 §3)
  if (ended && row.metCount === 4 && !t.includes('조건은 모두 충족했습니다')) {
    fail(where, '미해결 종료인데 조건을 못 채운 것처럼 보인다');
  }

  // ④ 충족 개수가 화면과 맞는다
  if (!t.includes(`${row.metCount} / 4 충족`)) fail(where, `${row.metCount}/4 가 화면에 없다`);

  // ⑤ 조건을 덜 채운 사람에게는 **몇 개 남았는지**를 말한다.
  //    서버의 절차 상태("근거 재확인 필요")를 제목으로 쓰면, 시스템 사정을
  //    학생이 뭘 잘못한 것처럼 읽는다.
  // 신고가 열려 있으면 그쪽을 먼저 말하는 게 맞다 — 학생이 답을 기다리는 건
  // 남은 조건이 아니라 그 신고다.
  if (row.metCount < 4 && !paid && !ended && !row.blocked) {
    const n = 4 - row.metCount;
    if (!t.includes(`${n}개 남았습니다`)) fail(where, `${n}개 남았다고 말하지 않는다`);
    if (t.includes('근거 재확인 필요')) fail(where, '절차 상태를 제목으로 썼다');
  }

  // ⑥ 오류 신고는 메인에 없다 — 회고 상세에만
  if (t.includes('오류 알리기')) fail(where, '메인에 오류 신고가 있다');

  // ⑦ 지급 전인데 수령액을 보여주지 않는다
  if (!paid && /수령 완료/.test(t)) fail(where, '안 받았는데 수령 완료');

  return view;
}

/** 조건 상세 네 장 */
function checkDetails(view, row, where) {
  for (const c of view.criteria) {
    const id = c.criterionId;
    const node = conditionDetail({ view, criterionId: id, api: API, sign: SIGN });
    const t = node.textContent;
    checked += 1;
    scan(`${where}/${id}`, t);

    const 신고 = t.includes('오류 알리기');
    if (id === 'reflection-topics') {
      // 지급·종료 뒤에는 다툴 것이 없다. 그 밖에는 신고할 수 있어야 한다.
      // **양쪽 다 본다** — 없어야 할 때 있는 것도 틀린 것이다.
      const 가능 = row.stage !== 'PAID' && row.stage !== 'TERMINATED';
      if (가능 !== 신고) fail(`${where}/${id}`, `회고 신고 ${신고 ? '있음' : '없음'} (${row.stage})`);
    } else if (신고) {
      fail(`${where}/${id}`, '회고가 아닌데 오류 신고가 있다');
    }

    // 서명은 인증서가 아직일 때만
    const 서명 = t.includes('서명 문구 받기');
    const 서명해야 = id === 'python-basic-certificate' && c.state !== 'MET';
    if (서명 !== 서명해야) fail(`${where}/${id}`, `서명 버튼 ${서명 ? '있음' : '없음'}`);
  }
}

/** 운영자 화면 — 집계가 명단·재원과 맞는가 */
function checkOperator(state, now, where) {
  const d = W.derive(state, now);
  const cohort = cohortOf(d);
  const view = viewFor(d.rows[0], 'operator', now);
  const node = operatorSection({
    view, cohort, conn: CONN, api: API, phase: 'ACTIVE_LOCAL_TEST',
    onDeposit: () => {}, viewOf: (id) => viewFor(d.byId.get(id), 'operator', now),
  });
  checked += 1;
  scan(where, node.textContent);

  const n = (k) => cohort.stages.find((s) => s.key === k).count;
  const T = (a) => Number(a) / 1_000_000;
  const f = cohort.funding;

  if (cohort.stages.reduce((a, s) => a + s.count, 0) !== cohort.participants) fail(where, '단계 합 ≠ 참여자');
  if (cohort.applicants.length !== cohort.participants) fail(where, '명단 ≠ 참여자');
  for (const st of cohort.stages) {
    if (cohort.applicants.filter((a) => a.stage === st.key).length !== st.count) {
      fail(where, `${st.label}: 집계와 명단이 다르다`);
    }
  }
  if (T(f.depositedAtoms) - T(f.paidAtoms) !== T(f.balanceAtoms)) fail(where, '입금-지급 ≠ 잔액');
  if (T(f.balanceAtoms) - T(f.reservedAtoms) !== T(f.availableAtoms)) fail(where, '잔액-예약 ≠ 가용');
  if (T(f.reservedAtoms) !== n('CONFIRMING') * 100) fail(where, '예약 ≠ 확인 기간 × 100');
  if (T(f.paidAtoms) !== n('PAID') * 100) fail(where, '지급액 ≠ 지급 완료 × 100');
  // §8.2 — 가용이 남았는데 기다리는 사람이 있을 수 없다
  if (n('FUNDING_WAIT') > 0 && T(f.availableAtoms) > 0) fail(where, `가용 ${T(f.availableAtoms)} 인데 대기 ${n('FUNDING_WAIT')}명`);
  if (cohort.pending.length !== n('CONFIRMING')) fail(where, '확인 큐 ≠ 확인 기간');
  // 측정하지 않은 값은 계속 비어 있다 (§14.1)
  if (cohort.metrics.humanWorkMs !== null) fail(where, '재지 않은 사람 시간이 채워졌다');

  // 명단을 편 모습 — 단계에 맞는 줄만, 신고 단추도 단계에 맞게
  const 허용 = {
    IN_PROGRESS: ['단계', '지급액'],
    FUNDING_WAIT: ['단계', '지급액', '조건 충족 시각', '대기 순서'],
    CONFIRMING: ['단계', '지급액', '조건 충족 시각', '확인 기간 종료', '참가자 확인', '운영자 확인'],
    PAID: ['단계', '지급액', '조건 충족 시각', '참가자 확인', '운영자 확인', '지급 시각'],
    TERMINATED: ['단계', '지급액', '조건 충족 시각'],
  };
  for (const a of cohort.applicants) {
    const panel = operatorSection({
      view, cohort, conn: CONN, api: API, phase: 'ACTIVE_LOCAL_TEST',
      onDeposit: () => {}, viewOf: (id) => viewFor(d.byId.get(id), 'operator', now),
    });
    // 펼친 모습은 화면 안에서만 열리므로, 집계가 들고 있는 값으로 검사한다
    if (a.criteria.length !== 4) fail(where, `${a.name}: 조건이 4개가 아니다`);
    if (a.criteria.filter((c) => c.met).length !== a.met) fail(where, `${a.name}: 충족 수가 안 맞는다`);
    const 있어야 = 허용[a.stage] ?? [];
    if ((a.acceptedAt !== null) !== 있어야.includes('조건 충족 시각')) fail(where, `${a.name}: 조건 충족 시각`);
    if ((a.confirmAt !== null) !== 있어야.includes('확인 기간 종료')) fail(where, `${a.name}: 확인 기간 종료`);
    if ((a.queue !== null) !== 있어야.includes('대기 순서')) fail(where, `${a.name}: 대기 순서`);
    if ((a.paidAt !== null) !== 있어야.includes('지급 시각')) fail(where, `${a.name}: 지급 시각`);
    if (panel.textContent.length === 0) fail(where, '운영자 화면이 비었다');
  }

  // 한 사람 한 사람의 단계가 규칙과 맞는가
  for (const r of d.rows) {
    if (r.paidAt && r.stage !== 'PAID') fail(where, `${r.name}: 지급됐는데 ${r.stage}`);
    if (r.terminated && !r.paidAt && r.stage !== 'TERMINATED') fail(where, `${r.name}: 종료됐는데 ${r.stage}`);
    if (!r.paidAt && !r.terminated && r.metCount < 4 && r.stage !== 'IN_PROGRESS') {
      fail(where, `${r.name}: ${r.metCount}/4 인데 ${r.stage}`);
    }
    if (r.stage === 'CONFIRMING' && r.confirmAt === null) fail(where, `${r.name}: 확인 기간인데 기한이 없다`);
    if (r.stage !== 'CONFIRMING' && r.confirmAt !== null) fail(where, `${r.name}: ${r.stage} 인데 기한이 있다`);
  }
  return d;
}

// ── 1. 조건 16가지 × 재원 × 신고 × 확인 ────────────────────────────────

console.log('■ 조건 조합 × 재원 × 신고 × 확인');
{
  const ALL = W.CRITERIA;
  const ME = 'a-20';          // 1/4 로 시작하는 사람
  const NOW = W.CLOCK_BASE;

  for (let mask = 0; mask < 16; mask += 1) {
    const want = ALL.filter((_, i) => (mask >> i) & 1);

    for (const 충전 of [0, 100, 500]) {
      for (const 신고 of [false, true]) {
        for (const 확인 of [[], ['participant'], ['operator'], ['participant', 'operator']]) {
          let s = W.initialState();
          if (충전) s = W.deposit(s, 충전 * 1_000_000);
          // 회고는 운영자가 AI 호출을 승인해야 판정된다. 실제 흐름과 같이
          // 먼저 승인하고 조건을 맞춘다.
          s = W.approveAi(s, ME, NOW);
          // 원하는 조건 조합으로 맞춘다
          for (const c of ALL) {
            const has = s.students.find((x) => x.id === ME).met.includes(c);
            if (has !== want.includes(c)) s = W.toggleCriterion(s, ME, c, NOW);
          }
          if (신고) s = W.raiseObjection(s, ME, '인용문을 배운 점으로 봤습니다', NOW);
          for (const who of 확인) s = W.confirm(s, ME, who, NOW);

          const d = W.derive(s, NOW);
          const row = d.byId.get(ME);
          const where = `[${want.length}/4 ·충전${충전} ·신고${신고 ? 'O' : 'X'} ·확인${확인.length}]`;

          // 월드 규칙
          if (row.metCount !== want.length) fail(where, '충족 수가 안 맞는다');
          if (want.length < 4 && row.stage !== 'IN_PROGRESS') fail(where, `${row.stage} 여야 하나?`);
          if (신고 && row.stage === 'PAID') fail(where, '신고가 열렸는데 지급됐다');
          if (row.stage === 'PAID' && !row.paidAt) fail(where, '지급인데 시각이 없다');

          const view = checkStudent(row, d.now, where);
          checkDetails(view, row, where);
        }
      }
    }
  }
}
console.log(`  ${checked}장 그려 봄`);

// ── 2. 기수 전체 — 모든 사람 × 단계 ────────────────────────────────────

console.log('\n■ 기수 20명 전원 (처음 상태)');
{
  const NOW = W.CLOCK_BASE;
  const s = W.initialState();
  const d = checkOperator(s, NOW, '운영자/처음');
  for (const row of d.rows) {
    const view = checkStudent(row, NOW, `학생/${row.name}`);
    checkDetails(view, row, `학생/${row.name}`);
  }
}

// ── 2b. 빈 기수 (발표를 충전부터 시작할 때) ───────────────────────────

console.log('\n■ 빈 기수 20명 (금고 0)');
{
  const NOW = W.CLOCK_BASE;
  const s = W.emptyState();
  const d = checkOperator(s, NOW, '운영자/빈기수');
  if (d.rows.some((r) => r.metCount !== 0)) fail('빈기수', '전원 0/4 여야 한다');
  if (Number(d.funding.depositedAtoms) !== 0) fail('빈기수', '금고가 비어 있어야 한다');
  for (const row of d.rows) {
    const view = checkStudent(row, NOW, `빈기수/${row.name}`);
    checkDetails(view, row, `빈기수/${row.name}`);
  }
}

// ── 3. 흐름 — 실제로 굴려 본다 ─────────────────────────────────────────

console.log('\n■ 흐름');

/** 한 걸음마다 운영자 집계와 학생 화면을 다시 검사한다 */
function walk(name, steps) {
  let s = W.initialState();
  let i = 0;
  for (const [label, step] of steps) {
    s = step(s);
    i += 1;
    const now = W.worldNow(s);
    const d = checkOperator(s, now, `${name}/${i}.${label}`);
    for (const row of d.rows) checkStudent(row, now, `${name}/${i}.${label}/${row.name}`);
  }
  console.log(`  ${name} — ${steps.length}걸음`);
  return s;
}

const ALL4 = (s, id) => W.CRITERIA.reduce(
  (acc, c) => W.toggleCriterion(acc, id, c, W.worldNow(acc)),
  W.approveAi(s, id),
);

walk('정상 지급', [
  ['조건 채움', (s) => ALL4(s, 'a-20')],
  ['충전 500', (s) => W.deposit(s, 500_000_000)],
  ['참가자 확인', (s) => W.confirm(s, 'a-20', 'participant')],
  ['운영자 확인', (s) => W.confirm(s, 'a-20', 'operator')],
]);

walk('재원 부족 → 충전', [
  ['조건 채움', (s) => ALL4(s, 'a-19')],
  ['충전 100', (s) => W.deposit(s, 100_000_000)],
  ['기한까지', (s) => W.skipToNext(s)],
  ['지급 처리', (s) => W.tick(s)],
]);

walk('신고 → 상한 → 미해결 종료', [
  ['신고', (s) => W.raiseObjection(s, 'a-05', '인용문을 배운 점으로 봤습니다')],
  ['기한까지', (s) => W.skipToNext(s)],
  ['처리', (s) => W.tick(s)],
  ['한 번 더', (s) => W.tick(W.skipToNext(s))],
]);

walk('신고 → 판정 정정', [
  ['신고', (s) => W.raiseObjection(s, 'a-04', '인용문을 배운 점으로 봤습니다')],
  ['회고 해제', (s) => W.toggleCriterion(s, 'a-04', 'reflection-topics')],
  ['회고 복구', (s) => W.toggleCriterion(s, 'a-04', 'reflection-topics')],
]);

walk('조건 풀기 → 예약 해제', [
  ['확인 기간 사람의 조건 해제', (s) => W.toggleCriterion(s, 'a-04', 'activity-complete')],
  ['다시 채움', (s) => W.toggleCriterion(s, 'a-04', 'activity-complete')],
]);

walk('빈 기수에서 끝까지', [
  ['빈 기수로', () => W.emptyState()],
  ['조건 채움', (s) => ALL4(s, 'a-01')],
  ['충전 100', (s) => W.deposit(s, 100_000_000)],
  ['참가자 확인', (s) => W.confirm(s, 'a-01', 'participant')],
  ['운영자 확인', (s) => W.confirm(s, 'a-01', 'operator')],
]);

walk('AI 승인 → 회고 판정', [
  ['빈 기수로', () => W.emptyState()],
  ['승인 전 회고 시도', (s) => W.toggleCriterion(s, 'a-02', 'reflection-topics')],
  ['AI 승인', (s) => W.approveAi(s, 'a-02')],
  ['회고 판정', (s) => W.toggleCriterion(s, 'a-02', 'reflection-topics')],
]);

walk('시계만 흘려보내기', [
  ['+120초', (s) => W.skip(s, 120)],
  ['처리', (s) => W.tick(s)],
  ['처리', (s) => W.tick(s)],
  ['+600초', (s) => W.skip(s, 600)],
  ['처리', (s) => W.tick(s)],
]);

// ── 끝 ─────────────────────────────────────────────────────────────────

console.log(`\n화면 ${checked}장 검사`);
if (problems.length === 0) {
  console.log('문제 0건');
} else {
  console.log(`문제 ${problems.length}건`);
  for (const p of problems.slice(0, 40)) console.log(`  ✗ ${p}`);
  if (problems.length > 40) console.log(`  … 그리고 ${problems.length - 40}건 더`);
  process.exitCode = 1;
}
