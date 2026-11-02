// 기수 집계 — 운영자 화면용
//
// 기획서 §9.2 가 운영자 화면에 다섯 영역을 요구한다. 그런데 서버는 **신청
// 한 건**만 준다. 그래서 지금까지 운영자 화면이 거의 다 비어 있었다.
//
// 모양을 여기서 정해 둔다. 오규원이 기수 조회를 만들면 채우기만 하면 된다.
//
// ── 숫자를 어떻게 잡았나 ────────────────────────────────────────────────
//
// 20명 기수에 3명 지급 완료. 나머지는 흐름의 각 단계에 흩어져 있다.
// 합이 20 이 되게 맞췄다 — 집계가 안 맞으면 운영자가 제일 먼저 알아챈다.
//
//   조건 진행 중  12    아직 네 조건을 채우는 중
//   확인 기간      2    조건 충족 + 전액 배정 + 판정 공개
//   재원 대기      2    조건 충족인데 돈이 모자라 대기
//   지급 완료      3
//   미해결 종료    1    이의가 상한 안에 안 풀림
//   ───────────────
//   합           20
//
// 재원도 앞뒤가 맞아야 한다.
//
//   입금 확인   500     학원이 넣은 총액
//   지급 나감   300     3명 × 100
//   현재 잔액   200
//   예약        200     확인 기간 2명 × 100
//   가용          0     200 - 200
//   추가 필요   200     재원 대기 2명 × 100
//
// **가용이 0 이어야 한다.** §8.2 가 "먼저 수락된 A에게 100 TEST를 배정한다"
// 라서, 가용이 남아 있으면 대기 중인 사람에게 즉시 배정된다. 가용이 있는데
// 대기자가 있는 상태는 존재할 수 없다. 처음엔 가용 100 / 대기 2명으로 썼는데
// 앞뒤가 안 맞아 고쳤다.
//
// ── 운영 효과는 셀 수 있는 것만 ─────────────────────────────────────────
//
// §14.1 이 금지한 것을 지킨다 — **자동 처리 건수에 분당 단가를 곱해
// '인건비 절감' 이라고 적지 않는다.** 건수는 세고, 사람 시간은 baseline 이
// 없어서 null 로 둔다. 비교 대상을 재기 전에는 계속 null 이다.

const TEST = (n) => String(n * 1_000_000);

export const COHORT = Object.freeze({
  // 어느 기수인가
  name: 'Python 부트캠프 10기',
  participants: 20,
  startedAt: 1580558400 - 86400 * 70,
  observedAt: 1580558400,

  // ① 기수 현황 — 단계별 건수. 합이 participants 와 같아야 한다.
  stages: Object.freeze([
    Object.freeze({ key: 'IN_PROGRESS', label: '조건 진행 중', count: 12 }),
    Object.freeze({ key: 'CONFIRMING', label: '확인 기간', count: 2 }),
    Object.freeze({ key: 'FUNDING_WAIT', label: '재원 대기', count: 2 }),
    Object.freeze({ key: 'PAID', label: '지급 완료', count: 3 }),
    Object.freeze({ key: 'TERMINATED', label: '미해결 종료', count: 1 }),
  ]),

  // ② 검증 현황 — 도구별. 실패는 **사유까지** 있어야 운영자가 움직일 수 있다.
  tools: Object.freeze([
    Object.freeze({
      label: 'Moodle 활동 완료', ran: 20, ok: 20, failed: 0, reason: null,
    }),
    Object.freeze({
      label: 'Moodle 과제 제출', ran: 20, ok: 19, failed: 1,
      reason: '1건 — 제출 기록이 아직 동기화되지 않음',
    }),
    Object.freeze({
      label: '회고 AI 검사', ran: 15, ok: 14, failed: 1,
      reason: '1건 — 세 항목 중 「문제 해결 과정」을 찾지 못함',
    }),
    Object.freeze({
      label: 'HackerRank + Reclaim', ran: 8, ok: 7, failed: 1,
      reason: '1건 — 증명 계정과 신청 계정이 다름',
    }),
  ]),

  // ③ 재원 현황 — §8.1 의 구분을 그대로
  funding: Object.freeze({
    depositedAtoms: TEST(500),
    balanceAtoms: TEST(200),
    reservedAtoms: TEST(200),
    availableAtoms: TEST(0),
    shortfallAtoms: TEST(200),
    maxExposureAtoms: TEST(2000),   // 20명 × 100. 현재 의무와 다른 값이다
    pendingTopUp: null,             // 충전 거래 조회가 아직 없다
    gasBudgetAtoms: null,           // 가스 후원 예산은 환급 재원과 다른 돈
  }),

  // ④ 이의·정정
  objections: Object.freeze([
    Object.freeze({
      id: 'objection-1',
      byRole: 'COURSE_OPERATOR',
      criterion: '회고',
      note: 'AI 가 「배운 점」으로 본 문장이 과제 설명 인용이라고 봄',
      raisedAt: 1580558400 - 400,
      state: 'REVALIDATING',
    }),
    Object.freeze({
      id: 'objection-2',
      byRole: 'PARTICIPANT',
      criterion: '과제 제출',
      note: '제출했는데 미제출로 나옴',
      raisedAt: 1580558400 - 900,
      state: 'RESOLVED',
      outcome: 'rev 7 → rev 8 · 충족으로 정정',
    }),
  ]),

  // 신청 20건. 운영자가 개개인을 볼 수 있어야 한다.
  //
  // **stage 분포가 위 stages 와 정확히 같아야 한다.** 목록과 집계가 어긋나면
  // 운영자가 둘 중 뭘 믿어야 할지 모른다. 시험에서 세어 본다.
  //
  // met 는 네 조건 중 충족한 개수다. 지급까지 간 사람은 반드시 4 다.
  // note 는 지금 막혀 있는 이유 — 위 tools 의 실패 건수와도 맞춘다.
  //
  // 이름은 가상이다. 실제 수강생이 아니다.
  applicants: Object.freeze([
    // 지급 완료 3
    Object.freeze({ id: 'a-01', name: '김서연', stage: 'PAID', met: 4 }),
    Object.freeze({ id: 'a-02', name: '박지후', stage: 'PAID', met: 4 }),
    Object.freeze({ id: 'a-03', name: '이도윤', stage: 'PAID', met: 4 }),

    // 확인 기간 2 — 아래 pending 과 같은 사람이어야 한다
    Object.freeze({ id: 'a-04', name: '최하은', stage: 'CONFIRMING', met: 4 }),
    Object.freeze({ id: 'a-05', name: '정우진', stage: 'CONFIRMING', met: 4 }),

    // 재원 대기 2
    Object.freeze({ id: 'a-06', name: '강민서', stage: 'FUNDING_WAIT', met: 4, note: '재원 100 TEST 부족' }),
    Object.freeze({ id: 'a-07', name: '윤예준', stage: 'FUNDING_WAIT', met: 4, note: '재원 100 TEST 부족' }),

    // 미해결 종료 1
    Object.freeze({ id: 'a-08', name: '임채원', stage: 'TERMINATED', met: 4, note: '이의가 상한 안에 해결되지 않음' }),

    // 조건 진행 중 12
    Object.freeze({ id: 'a-09', name: '오세훈', stage: 'IN_PROGRESS', met: 3, note: '인증서 시험 미응시' }),
    Object.freeze({ id: 'a-10', name: '한소율', stage: 'IN_PROGRESS', met: 3, note: '인증서만 남음' }),
    Object.freeze({ id: 'a-11', name: '배준서', stage: 'IN_PROGRESS', met: 3, note: '인증서는 땄으나 공증이 아직' }),
    Object.freeze({ id: 'a-12', name: '신아린', stage: 'IN_PROGRESS', met: 3, note: '증명 계정과 신청 계정이 다름' }),
    Object.freeze({ id: 'a-13', name: '조은우', stage: 'IN_PROGRESS', met: 3 }),
    Object.freeze({ id: 'a-14', name: '권나윤', stage: 'IN_PROGRESS', met: 2, note: '회고에서 「문제 해결 과정」을 찾지 못함' }),
    Object.freeze({ id: 'a-15', name: '황시우', stage: 'IN_PROGRESS', met: 2 }),
    Object.freeze({ id: 'a-16', name: '서다인', stage: 'IN_PROGRESS', met: 2 }),
    Object.freeze({ id: 'a-17', name: '문지안', stage: 'IN_PROGRESS', met: 2 }),
    Object.freeze({ id: 'a-18', name: '남지호', stage: 'IN_PROGRESS', met: 1 }),
    Object.freeze({ id: 'a-19', name: '구유나', stage: 'IN_PROGRESS', met: 1 }),
    Object.freeze({ id: 'a-20', name: '천하준', stage: 'IN_PROGRESS', met: 1 }),
  ]),

  // 확인 기간에 들어와 운영자를 기다리는 신청.
  //
  // 운영자 화면은 신청 한 건이 아니라 **반 전체**를 본다. 그런데 운영자가
  // 실제로 누를 일은 이 큐에 있다 — 확인하면 즉시 지급으로 넘어간다.
  // 확인 기간 인원(CONFIRMING)과 수가 같아야 한다.
  pending: Object.freeze([
    Object.freeze({
      applicationId: 'application-7c21ab0e',
      who: '최하은',
      amountAtoms: TEST(100),
      confirmAt: 1580558400 + 95,
      participantConfirmed: true,
      operatorConfirmed: false,
    }),
    Object.freeze({
      applicationId: 'application-3f90dd41',
      who: '정우진',
      amountAtoms: TEST(100),
      confirmAt: 1580558400 + 41,
      participantConfirmed: false,
      operatorConfirmed: false,
    }),
  ]),

  // ⑤ 운영 효과 — 셀 수 있는 것만. 시간은 baseline 이 없어 null 이다.
  metrics: Object.freeze({
    verifiedApplications: 9,
    unattendedApplications: 3,
    humanInterventions: 2,
    failuresRetried: 3,
    humanWorkMs: null,
    humanWorkReductionPercent: null,
  }),
});

/** 단계별 명단. 목록과 집계가 어긋나면 안 된다 */
export const byStage = (key, c = COHORT) => c.applicants.filter((a) => a.stage === key);

/** 단계 합이 참여자 수와 같은지. 어긋나면 집계가 틀린 것이다 */
export const stageTotal = (c = COHORT) => c.stages.reduce((n, s) => n + s.count, 0);
