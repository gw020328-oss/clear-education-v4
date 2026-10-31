// 시연 월드 — 기수 하나를 실제로 굴린다
//
// 지금까지 화면은 **고정된 fixture 네 장**이었다. 상황을 바꾸려면 주소를
// 바꿔야 했고, 학생 화면과 운영자 화면은 서로 남이었다. 학생이 조건을 채워도
// 운영자 화면의 숫자는 그대로였다.
//
// 여기서는 상태를 하나만 둔다. 학생이 조건을 채우면 운영자 화면의 단계 집계와
// 대기 큐가 같이 움직이고, 운영자가 금고를 충전하면 재원 대기 중이던 학생
// 화면이 확인 기간으로 넘어간다. **백엔드가 할 계산을 여기서 흉내 낸다.**
//
// ── 왜 서버 모양 그대로 내보내나 ────────────────────────────────────────
//
// viewFor() 가 돌려주는 것은 서버의 normal-view 와 **같은 모양**이다. 화면
// 코드는 이게 월드에서 왔는지 서버에서 왔는지 모른다. 오규원이 조회를 붙이면
// 이 모듈만 빠지고 화면은 한 줄도 안 바뀐다.
//
// ── 규칙은 기획서를 따른다 ──────────────────────────────────────────────
//
//   §8.2  조건을 채운 순서대로 배정한다. 가용액이 전액을 못 덮으면 대기.
//         대기 순서는 버튼 누른 시각이 아니라 판정이 수락된 순서다.
//   §8.3  확인 절차 시작 조건 = 조건 충족 + 전액 배정 + 판정 공개.
//         양측이 확인하면 즉시(조기 경로), 아니면 120초 뒤에 지급(기한 경로).
//         확인은 거부권이 아니다 — 안 눌러도 기한이 지나면 지급된다.
//   §8.4  판정이 바뀌면 예약이 풀리고 받아 둔 확인도 무효가 된다.
//
// ── 진짜가 아니다 ───────────────────────────────────────────────────────
//
// 체인도 LMS 도 붙어 있지 않다. 2020 시계를 그대로 쓰는 것도 그래서다 —
// 오늘 날짜로 바꾸면 진짜 기록처럼 보인다. 시계는 흐르되 연도는 2020 이다.
//
// **서버가 살아 있으면 이 모듈은 돌지 않는다.** main.js 가 진짜 판정이 오면
// 그것을 그린다. 진짜 데이터 위에 시연 조작판을 얹으면 그건 시연이 아니라
// 기록을 갈아끼우는 것이다.

/** 1인 지급액. agreedPayment.amountAtoms 와 같아야 한다 */
export const AMOUNT = 100_000_000;        // 100 TEST (decimals 6)
export const CONFIRM_SECONDS = 120;       // §8.3 확인 기간
export const CAP_SECONDS = 600;           // §8.3 전체 상한
// 신고가 들어온 뒤 서버가 거치는 단계. **사용자가 재검증을 요청하는 게
// 아니다** — 신고를 접수하면 서버가 평가·원천 재수집·실질 재검증을 한다.
//
//   오규원 10-28: "review-revalidations 는 '버튼을 누르면 AI를 다시 실행'
//   하는 요청 API가 아니야. … 사용자의 이의/다시 확인 요청과 서버가 수행하는
//   평가·원천 재수집·실질 재검증을 분리."
export const INTAKE_SECONDS = 15;         // 접수 → 처리 대기
export const REVALIDATION_SECONDS = 60;   // 접수 → 결과
// 시연 시계. 2026-11-06 12:00 KST — 본선 당일이다.
//
// 전에는 백엔드 fixture 와 같은 2020-02-01 이었다. 맞춰 두면 편했지만,
// **화면에 2019~2020년 날짜가 깔린다.** 2026년 시연에서 그걸 보면
// 버그로 읽힌다. 고정된 fixture 4장(`src/fixtures/bootcamp.js`)은 백엔드가
// 준 값이라 그대로 두고, **우리가 만드는 시연 월드만** 옮긴다.
export const CLOCK_BASE = 1793934000;

export const CRITERIA = Object.freeze([
  'activity-complete',
  'assignment-submitted',
  'reflection-topics',
  'python-basic-certificate',
]);

export const CRITERION_LABEL = Object.freeze({
  'activity-complete': '강의 수강',
  'assignment-submitted': '과제 제출',
  'reflection-topics': '회고',
  'python-basic-certificate': 'HackerRank 인증서',
});

// 다섯 단계다. '보완 필요'(판정 MISSING)는 빼 뒀다 — 원천을 못 읽는 오류는
// 지금 단계에서 다루지 않기로 했다. 조건 하나하나의 표시 상태(§9.3 의 여섯
// 가지)는 그대로다. 여기는 **기수에서 사람이 어디 있나**만 본다.
export const STAGE_LABEL = Object.freeze({
  IN_PROGRESS: '조건 진행 중',
  CONFIRMING: '확인 기간',
  FUNDING_WAIT: '재원 대기',
  PAID: '지급 완료',
  TERMINATED: '미해결 종료',
});

// 단계 차례. 운영자 화면의 칩과 집계가 이 순서를 따른다.
export const STAGE_ORDER = Object.freeze([
  'IN_PROGRESS', 'CONFIRMING', 'FUNDING_WAIT', 'PAID', 'TERMINATED',
]);

// ── 처음 상태 ───────────────────────────────────────────────────────────
//
// 지금 운영자 화면이 보여 주던 10기 그대로다. 입금 500, 지급 300, 예약 200,
// 가용 0, 부족 200 — 숫자가 저절로 그렇게 나오는지 시험에서 확인한다.
//
// 이름은 가상이다. 실제 수강생이 아니다.

const ALL = CRITERIA.slice();
const SOME = (n) => CRITERIA.slice(0, n);

const seed = (id, name, met, extra = {}) => ({
  id,
  name,
  met: met.slice(),
  note: null,
  acceptedAt: null,
  confirm: { participant: false, operator: false },
  paidAt: null,
  terminated: null,
  objection: null,          // 지금 열려 있는 신고
  objectionLog: [],         // 끝난 신고들 — 결과를 화면에 남긴다
  revalidationUsed: 0,      // 재검증은 같은 지급 건에 1회뿐이다
  // 운영자가 이번 입력의 AI 호출을 승인했나. 회고는 이게 있어야 판정된다.
  aiApprovedAt: null,
  ...extra,
});

function initialStudents() {
  const t = CLOCK_BASE;
  // 회고가 이미 충족인 사람은 그 AI 호출이 이미 승인·실행된 사람이다.
  // 승인 없이 회고 판정만 있는 상태는 서버에서 나올 수 없다.
  const approved = (st) => (st.met.includes('reflection-topics')
    ? { ...st, aiApprovedAt: (st.acceptedAt ?? t) - 60 } : st);
  return [
    // 지급 완료 3 — 일찍 채웠고 이미 나갔다
    seed('a-01', '김서연', ALL, { acceptedAt: t - 900, paidAt: t - 700, confirm: { participant: true, operator: true } }),
    seed('a-02', '박지후', ALL, { acceptedAt: t - 880, paidAt: t - 690, confirm: { participant: true, operator: true } }),
    seed('a-03', '이도윤', ALL, { acceptedAt: t - 860, paidAt: t - 680, confirm: { participant: true, operator: true } }),

    // 확인 기간 2 — 참가자만 확인한 사람과 아무도 확인 안 한 사람
    seed('a-04', '최하은', ALL, { acceptedAt: t - 25, confirm: { participant: true, operator: false } }),
    seed('a-05', '정우진', ALL, { acceptedAt: t - 79 }),

    // 재원 대기 2 — 조건은 다 채웠는데 가용액이 없다
    seed('a-06', '강민서', ALL, { acceptedAt: t - 20 }),
    seed('a-07', '윤예준', ALL, { acceptedAt: t - 15 }),

    // 미해결 종료 1
    seed('a-08', '임채원', ALL, { acceptedAt: t - 500, terminated: 'UNRESOLVED_OBJECTION' }),

    // 조건 진행 중 12
    // **막힌 이유는 못 채운 조건과 맞아야 한다.** 3/4 인 사람은 인증서만
    // 남았으므로 회고 얘기를 적으면 안 된다 — 화면이 자기 말을 뒤집는다.
    seed('a-09', '오세훈', SOME(3), { note: '인증서 시험 미응시' }),
    seed('a-10', '한소율', SOME(3), { note: '인증서만 남음' }),
    seed('a-11', '배준서', SOME(3), { note: '인증서는 땄으나 공증이 아직' }),
    seed('a-12', '신아린', SOME(3), { note: '증명 계정과 신청 계정이 다름' }),
    seed('a-13', '조은우', SOME(3)),
    // 2/4 — 회고와 인증서가 남았다
    seed('a-14', '권나윤', SOME(2), { note: '회고에서 「문제 해결 과정」을 찾지 못함' }),
    seed('a-15', '황시우', SOME(2)),
    seed('a-16', '서다인', SOME(2)),
    seed('a-17', '문지안', SOME(2)),
    seed('a-18', '남지호', SOME(1)),
    seed('a-19', '구유나', SOME(1)),
    seed('a-20', '천하준', SOME(1)),
  ].map(approved);
}

/**
 * 기수가 막 시작한 상태.
 *
 * 금고가 비어 있고 아무도 조건을 다 못 채웠다. 발표를 **학원이 돈을 넣는
 * 데서부터** 시작하고 싶을 때 쓴다 — 충전이 왜 필요한지가 화면에 저절로
 * 드러난다. 중간 상태에서 시작하면 그 단계가 이미 지나가 있어 보이지 않는다.
 */
export function emptyState() {
  const base = initialState();
  return {
    ...base,
    depositedAtoms: 0,
    paidAtoms: 0,
    me: 'a-01',
    // **전원 0/4 다.** 한때 0~3개로 흩어 뒀는데, '기수 시작' 을 눌렀더니
    // 이미 조건을 채운 사람이 섞여 있어서 어디서부터가 시연인지 알 수 없었다.
    // 아무것도 없는 데서 시작해야 충전도 조건도 눈앞에서 일어난다.
    students: base.students.map((st) => ({
      ...st,
      met: [],
      acceptedAt: null,
      confirm: { participant: false, operator: false },
      paidAt: null,
      terminated: null,
      objection: null,
      note: null,
    })),
  };
}

export function initialState() {
  return {
    // **학생 모양을 바꾸면 이 번호를 올린다.** 안 올리면 옛 저장본이 그대로
    // 되살아나 없는 칸을 읽다가 화면 전체가 빈 채로 멈춘다. 실제로 한 번
    // 그랬다 — objectionLog 를 더하고 번호를 안 올려서 터졌다.
    v: 4,
    clockBase: CLOCK_BASE,
    startedAtMs: Date.now(),
    depositedAtoms: AMOUNT * 5,          // 500 TEST
    paidAtoms: AMOUNT * 3,               // 이미 나간 3명
    students: initialStudents(),
    me: 'a-10',                          // 참가자 화면에서 보고 있는 사람
  };
}

// ── 파생 ────────────────────────────────────────────────────────────────

/**
 * 지금 몇 시인가. 2020 시계가 실제 시간만큼 흐른다.
 *
 * 멈춰 두면 확인 기간이 "2분 0초 남음" 에서 얼어붙어 고장난 화면이 된다.
 * 흐르게 두면 기한 경로(§8.3)가 저절로 돌아 발표에서 보여 줄 것이 생긴다.
 */
export function worldNow(state) {
  return Math.floor(state.clockBase + (Date.now() - state.startedAtMs) / 1000);
}

/**
 * 배정을 다시 계산한다. §8.2 — 수락된 순서대로, 전액이 덮이는 사람까지만.
 *
 * 쪼개서 주지 않는다. 50 이 남았다고 100 짜리 한 명에게 50 을 배정하면
 * 그 사람은 받지도 못하면서 다음 사람의 몫까지 묶는다.
 */
export function derive(state, now = worldNow(state)) {
  const balance = state.depositedAtoms - state.paidAtoms;

  const eligible = state.students
    .filter((s) => !s.paidAt && !s.terminated
      && s.met.length === CRITERIA.length && s.acceptedAt !== null)
    .sort((a, b) => a.acceptedAt - b.acceptedAt);

  let left = balance;
  const reserved = new Set();
  const queue = new Map();            // id → { position, shortfallAtoms }
  let position = 0;
  let shortfall = 0;

  for (const s of eligible) {
    if (left >= AMOUNT) { reserved.add(s.id); left -= AMOUNT; continue; }
    position += 1;
    // 맨 앞 대기자는 남은 잔돈만큼 덜 모자라다
    const need = AMOUNT - (position === 1 ? left : 0);
    shortfall += need;
    queue.set(s.id, { position, shortfallAtoms: String(need) });
  }

  const stageOf = (s) => {
    if (s.paidAt) return 'PAID';
    if (s.terminated) return 'TERMINATED';
    if (reserved.has(s.id)) return 'CONFIRMING';
    if (queue.has(s.id)) return 'FUNDING_WAIT';
    return 'IN_PROGRESS';
  };

  const rows = state.students.map((s) => ({
    ...s,
    // §8.3 기한 경로는 "자격·재원·**오류 신고**를 다시 검사한 뒤" 진행한다.
    // 열린 이의가 있으면 확인 기간이 끝나도 나가지 않는다.
    blocked: Boolean(s.objection && !s.paidAt),
    stage: stageOf(s),
    metCount: s.met.length,
    queue: queue.get(s.id) ?? null,
    confirmAt: reserved.has(s.id) ? s.acceptedAt + CONFIRM_SECONDS : null,
    // 전체 상한은 **최초 절차 시작**부터다. 확인 기간에 들어갔는지와 별개로
    // 조건을 다 채워 수락된 순간부터 흐른다. 아직 수락 전이면 절차가 없으니
    // 상한도 없다 — 그때 건 이의는 지급을 막을 것도, 끝낼 것도 없다.
    capAt: s.acceptedAt !== null ? s.acceptedAt + CAP_SECONDS : null,
    // 신고를 넣으면 서버가 돌고, 이 시각에 결과가 나온다
    revalidationAt: s.objection ? s.objection.raisedAt + REVALIDATION_SECONDS : null,
    // 지금 어느 단계인가. 사용자가 한 일(접수)과 서버가 하는 일(재검증)을
    // 나눠서 보여줘야 "내가 재검증을 썼다" 로 읽히지 않는다.
    objectionPhase: !s.objection ? null
      : now < s.objection.raisedAt + INTAKE_SECONDS ? 'RECEIVED' : 'ASSESSING',
    aiApproved: s.aiApprovedAt !== null,
  }));

  const count = (k) => rows.filter((r) => r.stage === k).length;

  return {
    now,
    rows,
    byId: new Map(rows.map((r) => [r.id, r])),
    funding: {
      depositedAtoms: String(state.depositedAtoms),
      paidAtoms: String(state.paidAtoms),
      balanceAtoms: String(balance),
      reservedAtoms: String(reserved.size * AMOUNT),
      availableAtoms: String(Math.max(0, left)),
      shortfallAtoms: String(shortfall),
      maxExposureAtoms: String(state.students.length * AMOUNT),
    },
    stages: STAGE_ORDER.map((key) => ({ key, label: STAGE_LABEL[key], count: count(key) })),
  };
}

// ── 바꾸기 ──────────────────────────────────────────────────────────────
//
// 전부 state 를 새로 만들어 돌려준다. 제자리에서 고치면 두 창을 맞추기 어렵다.

const replace = (state, id, patch) => ({
  ...state,
  students: state.students.map((s) => (s.id === id ? { ...s, ...patch } : s)),
});

/**
 * 조건 하나를 켜고 끈다.
 *
 * 네 개가 다 차면 그 순간이 **판정 수락 시각**이다(§8.2 의 대기 순서 기준).
 * 하나라도 풀리면 수락이 취소되고 예약도 확인도 함께 무효가 된다(§8.4) —
 * 조건이 바뀌었는데 예전 확인으로 돈이 나가면 안 된다.
 *
 * 이미 지급된 사람은 손대지 않는다. 체인에 나간 거래는 되돌릴 수 없다.
 */
export function toggleCriterion(state, id, criterionId, now = worldNow(state)) {
  const s = state.students.find((x) => x.id === id);
  if (!s || s.paidAt) return state;
  // **회고는 AI 가 읽어야 판정된다. AI 는 운영자 승인 뒤에만 돈다.**
  // 승인 없이 회고가 충족이 되는 상태는 서버에서 나올 수 없다.
  if (criterionId === 'reflection-topics' && !s.met.includes(criterionId) && !s.aiApprovedAt) {
    return state;
  }

  const has = s.met.includes(criterionId);
  const met = has ? s.met.filter((c) => c !== criterionId)
    : CRITERIA.filter((c) => s.met.includes(c) || c === criterionId);

  const full = met.length === CRITERIA.length;
  return replace(state, id, {
    // 이의를 건 그 조건의 판정이 바뀌면 다툴 것이 없어진다 — 정정된 것이다
    ...(s.objection?.criterion === criterionId ? clearObjection(s, now) : {}),
    met,
    // 다 채운 순간을 기록한다. 이미 수락돼 있으면 순서를 바꾸지 않는다.
    acceptedAt: full ? (s.acceptedAt ?? now) : null,
    confirm: full ? s.confirm : { participant: false, operator: false },
    note: full ? null : s.note,
  });
}

/** 금고 충전. 운영자가 실제로 하는 일이라 제품 버튼이다 */
export function deposit(state, atoms) {
  return { ...state, depositedAtoms: Math.max(0, state.depositedAtoms + atoms) };
}

/**
 * 확인 — 참가자나 운영자가 누른다.
 *
 * 확인 기간에 들어와 있지 않으면 아무 일도 없다. §8.3 의 시작 조건을 아직
 * 못 채운 신청에 확인을 받아 두면, 나중에 조건이 바뀌어도 그 확인이 살아 있는
 * 것처럼 보인다.
 */
export function confirm(state, id, who, now = worldNow(state)) {
  const d = derive(state, now);
  const row = d.byId.get(id);
  if (!row || row.stage !== 'CONFIRMING') return state;
  // 열린 이의가 있으면 양측이 확인해도 나가지 않는다
  if (row.blocked) return replace(state, id, { confirm: { ...row.confirm, [who]: true } });

  const next = { ...row.confirm, [who]: true };
  // 양측이 같은 판정에 확인하면 기다리지 않는다 — 조기 경로
  if (next.participant && next.operator) return pay(state, id, now, next);
  return replace(state, id, { confirm: next });
}

/** 지급. 잔액에서 빠지고 되돌릴 수 없다 */
function pay(state, id, now, confirmState = null) {
  return {
    ...replace(state, id, {
      paidAt: now,
      ...(confirmState ? { confirm: confirmState } : {}),
    }),
    paidAtoms: state.paidAtoms + AMOUNT,
  };
}

/**
 * 시간이 지나 할 일이 생겼는지 본다. 1초마다 불린다.
 *
 * §8.3 기한 경로 — 확인 기간이 끝나면 **확인을 안 받았어도** 지급한다.
 * 확인은 빨리 가는 길이지 거부권이 아니다. 막으려면 오류를 제기해야 한다.
 *
 * 바뀐 게 없으면 같은 state 를 그대로 돌려준다. 안 그러면 1초마다 화면이
 * 다시 그려져 누르던 버튼이 발밑에서 사라진다.
 */
export function tick(state, now = worldNow(state)) {
  const rows = derive(state, now).rows;

  // 신고가 걸린 건을 먼저 본다. 지급보다 먼저 보지 않으면 결론이 나기 전에
  // 돈이 나간다.
  //
  //   재검증이 상한 안에 끝나면  → 결과대로 (유지면 기각, 지급 재개)
  //   상한이 먼저 오면           → 미해결 종료 (멘토 §3)
  //
  // 상한 직전에 신고하면 재검증이 못 끝난다. 그게 '미해결' 의 본뜻이다 —
  // 사람이 안 눌러서가 아니라 **답이 안 나와서** 끝나는 것이다.
  for (const r of rows) {
    if (!r.blocked || r.revalidationAt === null) continue;
    const cap = r.capAt ?? Infinity;
    if (r.revalidationAt <= cap) {
      if (now >= r.revalidationAt) return dismissObjection(state, r.id, now);
    } else if (now >= cap) {
      return replace(state, r.id, { terminated: 'UNRESOLVED_OBJECTION' });
    }
  }

  const due = rows.filter((r) => r.stage === 'CONFIRMING' && !r.blocked
    && r.confirmAt !== null && now >= r.confirmAt);
  if (due.length === 0) return state;

  // 한 번에 한 명씩 — 지급이 잔액을 줄이므로 다음 사람 배정이 달라진다
  return pay(state, due[0].id, now);
}

/**
 * 오류 신고.
 *
 * **회고에만 둔다.** 출석·과제·인증서는 Moodle 과 Reclaim 이 기계로 읽은
 * 기록이라, 틀렸다면 그건 판단이 아니라 동기화 문제다. 사람이 다퉈서
 * 뒤집을 값이 아니다. 회고만 AI 가 해석하므로 거기만 다툴 거리가 있다.
 *
 * 열려 있는 동안 그 신청의 지급이 멈춘다. 전체 상한(600초) 안에 안 풀리면
 * 미해결 종료다 — 조건 미충족과 다른 상태다(멘토 §3).
 */
export function raiseObjection(state, id, reason, now = worldNow(state), by = 'PARTICIPANT') {
  const s = state.students.find((x) => x.id === id);
  if (!s || s.paidAt || s.terminated || s.objection) return state;
  // 실질 재검증은 같은 지급 건에 1회다. **이건 서버 쪽 예산이지 사용자가
  // 쓰는 티켓이 아니다.** 이미 한 번 다시 본 건은 또 받지 않는다 —
  // 받아 두고 아무것도 안 하면 신고가 무한 지연 수단이 된다.
  if (s.revalidationUsed >= 1) return state;
  return replace(state, id, {
    objection: { criterion: 'reflection-topics', reason, raisedAt: now, by },
  });
}

/**
 * 재검증이 끝났다. **판정이 그대로면 신고를 기각하고 지급을 재개한다.**
 *
 * 전에는 "아무도 안 풀면 미해결 종료" 였다. 그러면 운영자가 신고만 하고
 * 가만히 있어도 지급이 막힌다 — 반려 단추를 두지 않기로 한 설계가 무의미해진다.
 * §8.3 이 "확인은 거부권이 아니다" 라고 한 것과 같은 이유로, **신고도
 * 거부권이 아니다.** 신고는 재검증을 한 번 돌릴 권리이고, 결과가 유지면
 * 원래 판정대로 간다.
 */
function dismissObjection(state, id, now) {
  const s = state.students.find((x) => x.id === id);
  if (!s?.objection) return state;
  return replace(state, id, {
    objection: null,
    revalidationUsed: s.revalidationUsed + 1,
    objectionLog: [...s.objectionLog, { ...s.objection, resolvedAt: now, outcome: 'DISMISSED' }],
  });
}

/** 판정이 바뀌면 다툴 것이 없어진다. 신고는 **정정**으로 끝난다 */
function clearObjection(student, now) {
  if (!student.objection) return {};
  return {
    objection: null,
    revalidationUsed: student.revalidationUsed + 1,
    objectionLog: [...student.objectionLog,
      { ...student.objection, resolvedAt: now, outcome: 'CORRECTED' }],
  };
}

/** 미해결 종료. 멘토 §3 — 조건 미충족과 다른 상태다 */
export function terminate(state, id) {
  const s = state.students.find((x) => x.id === id);
  if (!s || s.paidAt) return state;
  return replace(state, id, s.terminated
    ? { terminated: null }
    : { terminated: 'UNRESOLVED_OBJECTION' });
}


/**
 * 이번 입력의 AI 호출을 승인한다.
 *
 * 유료 호출이라 운영자가 건건이 누른다. 승인해도 **회고 판정이 저절로
 * 나지는 않는다** — 월드에는 AI 가 없다. 승인은 회고를 판정할 수 있게
 * 열어 줄 뿐이고, 판정은 조건 카드로 넣는다.
 */
export function approveAi(state, id, now = worldNow(state)) {
  const s = state.students.find((x) => x.id === id);
  if (!s || s.aiApprovedAt) return state;
  return replace(state, id, { aiApprovedAt: now });
}

/** 참가자 화면에서 누구를 보고 있나 */
export function lookAt(state, id) {
  return state.students.some((s) => s.id === id) ? { ...state, me: id } : state;
}

/** 시계를 건너뛴다. 확인 기간이 끝나는 걸 기다리지 않고 보여 줄 때 */
export function skip(state, seconds) {
  return { ...state, startedAtMs: state.startedAtMs - seconds * 1000 };
}

/**
 * 다음에 무슨 일이 일어나는 시각까지 건너뛴다.
 *
 * 확인 기간이 끝나 지급되는 것(120초)과 오류 신고가 상한을 넘겨 종료되는
 * 것(600초)을 발표에서 보여 주려면 실제로 그만큼 기다려야 한다. 30초씩
 * 스무 번 누르는 대신 한 번에 간다.
 *
 * 기다릴 일이 없으면 아무것도 하지 않는다.
 */
export function skipToNext(state, now = worldNow(state)) {
  const times = derive(state, now).rows.flatMap((r) => [
    r.stage === 'CONFIRMING' && !r.blocked ? r.confirmAt : null,
    // 신고가 걸린 건은 재검증 결과가 먼저 나오고, 그게 상한보다 늦으면 종료다
    r.blocked ? Math.min(r.revalidationAt ?? Infinity, r.capAt ?? Infinity) : null,
  ]).filter((t) => t !== null && Number.isFinite(t) && t > now);
  if (times.length === 0) return state;
  // 1초를 더 간다 — 정확히 그 시각이면 아직 '남음 0초' 로 보인다
  return skip(state, Math.min(...times) - now + 1);
}

/**
 * 처음으로 되돌린다. 발표 도중 한 번 더 보여 줘야 할 때.
 *
 * 시계도 같이 되돌아간다 — 안 그러면 확인 기간이 이미 끝난 채로 시작한다.
 */
export function reset(kind = 'cohort') {
  return kind === 'empty' ? emptyState() : initialState();
}

/**
 * 다음에 무슨 일이 일어나는 시각. 없으면 null.
 *
 * 조작판이 단추에 남은 시간을 적는 데 쓴다. "다음 기한까지" 만 적어 두면
 * 무엇을 건너뛰는지 알 수 없다.
 */
export function nextDeadline(state, now = worldNow(state)) {
  const times = derive(state, now).rows.flatMap((r) => {
    if (r.stage === 'CONFIRMING' && !r.blocked) {
      return [{ at: r.confirmAt, who: r.name, what: '확인 기간 종료' }];
    }
    if (!r.blocked) return [];
    // 재검증이 상한 안에 끝나면 결과가, 아니면 종료가 다음 사건이다
    const rev = r.revalidationAt ?? Infinity;
    const cap = r.capAt ?? Infinity;
    return rev <= cap
      ? [{ at: rev, who: r.name, what: '재검증 결과' }]
      : (Number.isFinite(cap) ? [{ at: cap, who: r.name, what: '전체 상한' }] : []);
  }).filter((x) => Number.isFinite(x.at) && x.at > now);
  if (times.length === 0) return null;
  return times.reduce((a, b) => (a.at <= b.at ? a : b));
}
