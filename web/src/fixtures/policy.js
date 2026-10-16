// 합성 정책 fixture
//
// src/policy/compiler.mjs 의 compileSyntheticPolicy 가 내보내는 모양을 따른다.
// 컴파일러가 강제하는 값은 그대로 지킨다.
//
//   schemaVersion 4 · dataMode SYNTHETIC · examType TOEIC_LR
//   minScore 800 · minCompletionBps 8000 (= 80.00%)
//   supplementEndAt = normalSubmitAt + 259200  (3일)
//   claimUntil      = normalSubmitAt + 864000  (10일)
//   examDateEnd(서울 23:59:59) <= normalSubmitAt
//
// 이 값들은 합성이며 실제 반·수강생·금액이 아니다.
// canonicalJson 은 컴파일러가 정규화해 만드는 값이라 여기서 흉내내지 않는다.

const hash = (tag) => '0x' + tag.repeat(32).slice(0, 64);

// 2026-11-20 09:00 KST
const NORMAL_SUBMIT_AT = 1795132800;

export const SYNTHETIC_POLICY = Object.freeze({
  compilerVersion: 'course-policy-synthetic.1',
  policyHash: hash('a1'),
  requiredLectureIdsHash: hash('7c'),
  publishable: false,
  policy: Object.freeze({
    schemaVersion: 4,
    cohortId: 'demo-cohort-001',
    policyVersion: '1',
    dataMode: 'SYNTHETIC',
    examType: 'TOEIC_LR',

    minScore: 800,
    minCompletionBps: 8000,

    // 시험 인정 기간 — 응시일 기준 달력 날짜
    examDateStart: '2026-09-01',
    examDateEnd: '2026-11-10',

    // 학습 인정 기간 — 유닉스 초 문자열
    learningStart: '1788220800',   // 2026-09-01 09:00 KST
    learningEnd: '1794268800',     // 2026-11-10 09:00 KST
    requiredLectureIds: Object.freeze([
      'lecture-01', 'lecture-02', 'lecture-03', 'lecture-04', 'lecture-05',
      'lecture-06', 'lecture-07', 'lecture-08', 'lecture-09', 'lecture-10',
    ]),
    completionRuleVersion: 'seed-required-completed-in-period.1',

    enrollmentStart: '1788220800',
    enrollmentUntil: '1794268800',
    normalSubmitFrom: '1794268800',
    normalSubmitAt: String(NORMAL_SUBMIT_AT),
    supplementEndAt: String(NORMAL_SUBMIT_AT + 259200),
    claimUntil: String(NORMAL_SUBMIT_AT + 864000),

    // 실수령 156,000원 = 156,000 TEST (1 TEST = 1원)
    amount: '156000000000',
    tokenDecimals: 6,
    sourcePolicySetHash: hash('5e'),
    privacyNoticeVersion: 'privacy-notice-1',

    // 받을 금액의 내역. 합계 하나만 적으면 광고 금액과 실수령이 다른 문제가
    // 안 보인다. 그 차이가 이 제품이 겨냥한 것이다.
    payoutBreakdown: Object.freeze({
      gross: Object.freeze({ label: '수강료 환급액', amount: 200000 }),
      additions: Object.freeze([]),
      deductions: Object.freeze([
        Object.freeze({ label: '제세공과금 22%', amount: 44000 }),
      ]),
      net: 156000,
      basis: null,
    }),
  }),
});

// ── 환급률 구간과 선택 경로가 있는 반 ───────────────────────────────────────
//
// 반마다 조건의 개수도 종류도 묶이는 방식도 다르다. 어떤 반은 환급률이
// 여러 구간이고, 구간마다 조건이 다르다. 그 안에서 또 환급받는 길이 둘일
// 수 있다. 수강생은 계약 시점에 구간도 경로도 고르지 않는다 —
// 하다 보니 채워지는 쪽으로 간다.
//
// 그래서 두 겹을 둔다.
//
//   conditionTiers[]          환급률 구간. 오름차순
//     └ groups[]              그 구간을 충족하는 경로. 둘 이상이면 OR
//         ├ items[]           그 경로의 조건. 서로 AND
//         └ payout            그 경로로 받는 금액 (경로마다 다를 때)
//
// 금액이 구간에만 붙는 반도 있고 경로마다 다른 반도 있다. 시원스쿨 100%
// 가 후자다 — 출석 경로에는 응시료 환급이 없어서 성적 경로보다 약 4만원
// 적다. 그래서 payout 은 구간에도 경로에도 붙을 수 있게 둔다.
//
// 이 모양은 화면이 먼저 만든 제안이다. 서버 정책 스키마에는 아직 없다.
// 다음 두 가지가 선행되어야 실제로 이 정책을 서버가 만들 수 있다.
//
//   1. src/policy/compiler.mjs:19 의 minScore===800 && minCompletionBps===8000
//      고정을 범위 검사로 연다
//   2. 컴파일러와 평가기가 이 구조를 받는다
//      (경로 안은 AND, 경로 중 하나라도 충족하면 그 구간 통과)
//
// 체인에는 조건이 아니라 policyHash 만 들어가므로 조건 구조 자체는 계약을
// 건드리지 않는다. 다만 구간마다 금액이 달라지는 지급은 계약이 받아야 한다 —
// CourseRefundVaultV4.sol:92 의 require(g.amount == config.amount) 를 <= 로
// 열고, _pay 가 grant 금액을 보내고 남은 몫을 sponsor 에게 돌려주면 된다.
//
// 얼마를 미리 예치할지는 **아직 정해지지 않았다.** 화면은 그 결정을 대신
// 내리지 않고, 서버가 준 값과 상태를 그대로 보여준다.
//
// 400% 구간은 싣지 않는다. CLEAR 가 집행하지 않기로 했고(조건 구조화와
// 서류 사전 검토까지만), 안내문에 있다고 해서 화면이 집행을 약속하면 안 된다.

// 2026-12-05 09:00 KST
const ALT_SUBMIT_AT = 1796428800;

/**
 * 조건 하나.
 *
 * verify 는 그 조건을 어떻게 확인하는지다. 주지 않으면 화면이 자료 종류에서
 * 고른다(성적 증명 → 본인 로그인, 학습 기록 → 자동, 제출 서류 → 직접 제출).
 * 예외일 때만 적는다.
 */
const cond = (id, kind, label, value, tail, detail, verify = null) =>
  Object.freeze({ id, kind, label, value, tail, detail, evidence: kind, verify });
/**
 * 그 구간을 충족하는 한 경로. 경로가 하나면 label 은 null.
 *
 * payout 이 경로마다 붙는다. 같은 환급률인데 경로에 따라 받는 돈이 다른
 * 상품이 실제로 있다 — 시원스쿨 100% 는 출석 경로에는 응시료 환급이
 * 없고 성적 경로에는 있어서 4만원가량 차이난다.
 */
const path = (label, items, payout = null) => Object.freeze({
  id: label ? label.replace(/[^가-힣0-9]/g, '') : 'only',
  label,
  items: Object.freeze(items),
  payout,
});
/**
 * 받을 금액의 내역. 합계 하나만 적으면 광고 금액과 실수령의 차이가 안 보인다.
 *
 * additions 는 가산이다. 환급금은 공제만 되는 것이 아니라 응시료처럼
 * 더해지는 항목도 있고, 그 가산분에도 세금이 붙는다.
 * basis 는 안내문이 밝힌 계산식 원문이다 — 우리가 만든 식이 아니라는 것을
 * 참가자가 확인할 수 있어야 한다.
 */
const won = (gross, additions, deductions, net, basis = null) => Object.freeze({
  gross: Object.freeze(gross),
  additions: Object.freeze(additions.map(Object.freeze)),
  deductions: Object.freeze(deductions.map(Object.freeze)),
  net,
  basis,
});

/**
 * 환급률 구간.
 *
 * 구간은 계약 시점에 정해지지 않는다. 수강생이 무엇을 달성했는지에 따라
 * 판정 시점에 갈린다. 그래서 모든 구간이 한 계약 안에 들어가고 화면은
 * 전부 보여준다. 어느 구간이 '계약 밖'인 경우는 없다.
 *
 * 여러 구간을 동시에 충족하면 그중 가장 높은 구간으로 지급한다.
 * 그래서 예치는 가장 높은 구간 기준이어야 한다.
 */
const tier = (id, rate, groups, payout) =>
  Object.freeze({ id, rate, groups: Object.freeze(groups), payout });

/**
 * 시원스쿨 환급액 계산식을 안내문 그대로 옮긴다.
 *
 *   50%        (((결제금액 − 교재비) × 환급비율) − 결제수수료) × 0.78
 *   100% 이상  (((결제금액 − 교재비) × 환급비율) − 결제수수료 + 응시료) × 0.78
 *
 * 세 가지가 이 식에서 나온다.
 *
 *   1. 응시료는 공제가 아니라 가산이다. 그리고 결제수수료를 뺀 뒤에
 *      더해지므로 수수료는 응시료에 붙지 않는다.
 *   2. 제세공과금 22% 는 가산까지 더한 금액에 붙는다. 그래서 응시료
 *      환급분도 세금을 맞는다 — 안내문도 그렇게 적었다.
 *   3. 응시료 환급은 '성적 환급' 에만 붙는다. 출석만으로 받는 경로에는
 *      없다(안내문 2-3: 성적환급+응시료 조건).
 *
 * 확정할 수 없는 값이 둘이다.
 *
 *   결제금액 320,000원 — 안내문에 750점반 가격이 없다. 우리 가정이다.
 *   결제수수료 '약 3%'  — 안내문이 기준을 밝히지 않았다. uncertain 으로 둔다.
 *
 * 교재비는 0원으로 둔다. 안내문은 '혜택 교재가 있을 경우 교재 정가 기준으로
 * 차감', 아이패드 포함 상품은 기기값(113만/69만) 차감이라고 적었다.
 */
const EXAM_FEE = 52500;   // 토익 정기 응시료. YBM 표의 응시료 추가분
                          // 40,950원 ÷ 0.78 로 역산되는 값이다.
const PAY = 320000, BOOK = 0, FEE = 9600;

const siwon = (ratePercent, feeTimes = 0) => {
  const gross = (PAY - BOOK) * ratePercent / 100;
  const exam = EXAM_FEE * feeTimes;
  const base = gross - FEE + exam;
  const tax = Math.floor(base * 22 / 100);
  return won(
    { label: `수강료 환급액 (결제금액 320,000원의 ${ratePercent}%)`, amount: gross },
    exam ? [{
      label: feeTimes > 1 ? `토익 응시료 환급 ${feeTimes}배` : '토익 응시료 환급',
      amount: exam,
    }] : [],
    [
      { label: '결제수수료 약 3%', amount: FEE, uncertain: true },
      { label: '제세공과금 22%', amount: tax },
    ],
    base - tax,
    exam
      ? '안내문 계산식 — ((결제금액 − 교재비) × 환급비율 − 결제수수료 + 응시료) × 0.78'
      : '안내문 계산식 — ((결제금액 − 교재비) × 환급비율 − 결제수수료) × 0.78',
  );
};
export const ALTERNATIVE_POLICY = Object.freeze({
  compilerVersion: 'course-policy-synthetic.1',
  policyHash: hash('b2'),
  requiredLectureIdsHash: hash('9d'),
  publishable: false,
  policy: Object.freeze({
    schemaVersion: 4,
    cohortId: 'demo-cohort-002',
    policyVersion: '1',
    dataMode: 'SYNTHETIC',
    examType: 'TOEIC_LR',

    // 기존 필드는 그대로 둔다. conditionTiers 가 있으면 화면은 그쪽을 쓰고,
    // 없는 화면·도구는 이 값으로 동작한다. 여기 값은 100% 구간의 것이다.
    minScore: 750,
    minCompletionBps: 6000,

    examDateStart: '2026-09-15',
    examDateEnd: '2026-11-25',

    learningStart: '1789516800',
    learningEnd: '1795564800',
    requiredLectureIds: Object.freeze([
      'siwon-01', 'siwon-02', 'siwon-03', 'siwon-04', 'siwon-05',
      'siwon-06', 'siwon-07', 'siwon-08',
    ]),
    completionRuleVersion: 'seed-required-completed-in-period.1',

    enrollmentStart: '1789516800',
    enrollmentUntil: '1795564800',
    normalSubmitFrom: '1795564800',
    normalSubmitAt: String(ALT_SUBMIT_AT),
    supplementEndAt: String(ALT_SUBMIT_AT + 259200),
    claimUntil: String(ALT_SUBMIT_AT + 864000),

    // 계약에 설정된 토큰 수량이다. 1 TEST = 1원 규칙으로 환산한 값일 뿐,
    // **예치율·보관율을 정한 값이 아니다.** 얼마를 미리 확보할지는 아직
    // 정해지지 않았고(OPEN), 그 결정을 화면이 대신 내리지 않는다.
    // 약정 금액 · 확보된 재원 · 신청별 배정액은 서로 다른 값이다.
    amount: '782262000000',
    tokenDecimals: 6,
    sourcePolicySetHash: hash('4f'),
    privacyNoticeVersion: 'privacy-notice-1',

    // 환급률 구간이 여럿인 반. 안내문에 있는 구간을 전부 싣는다.
    // 구간은 계약 시점에 정해지지 않고 판정 때 갈리므로 '계약 밖' 인 구간은
    // 없다. 숨기면 참가자가 원래 그 구간뿐인 줄 알고, 화면이 안내문보다
    // 적게 말하게 된다.
    //
    // 구간 안의 groups 는 그 구간을 충족하는 경로다. 둘 이상이면 OR 이다.
    // 수강생은 계약 시점에 구간도 경로도 고르지 않는다.
    //
    // 금액은 경로에 붙을 수도 있고 구간에 붙을 수도 있다. 100% 처럼 같은
    // 환급률인데 경로에 따라 받는 돈이 다르면 경로마다 붙여야 한다.
    conditionTiers: Object.freeze([
      // 50% 행에는 응시료 환급이 없다. 안내문 표의 행 이름이
      // '수강료 50%환급' 뿐이고 100% 이상만 '+응시료 0원' 이다.
      tier('r50', '50%', [
        path(null, [
          cond('examBelow', 'EXAM', '시험', '목표 점수 미달성', null, '성적표 제출'),
          cond('review', 'REVIEW', '후기', '200byte', '이상',
            '수강시작일 +107일 이내 작성 · 정상적인 후기가 아니라고 판단되면 '
            + '환급률이 바뀔 수 있습니다.', 'AUTO_REVIEWED'),
        ]),
      ], siwon(50)),
      // 100% 는 경로가 둘이고 받는 돈이 다르다. 응시료 환급은 성적 경로의
      // 조건이어서(안내문 2-3) 출석만으로 받는 쪽에는 붙지 않는다.
      // 구간에 금액 하나를 적으면 한쪽이 틀린 금액을 보게 된다.
      tier('r100', '100%', [
        path('경로 1 · 출석', [
          cond('attend100', 'LEARNING', '출석', '100일', '연속',
            '매일 다른 강의로 진도율 60% 이상 수강 · 자정 기준 당일 인정'),
          cond('review', 'REVIEW', '후기', '200byte', '이상',
            '수강시작일 +107일 이내 작성 · 정상적인 후기가 아니라고 판단되면 '
            + '환급률이 바뀔 수 있습니다.', 'AUTO_REVIEWED'),
        ], siwon(100)),
        path('경로 2 · 성적', [
          cond('exam750', 'EXAM', '시험', '750점', '이상',
            'TOEIC_LR 총점 · 수강시작일 +100일 이내 응시분만 인정'),
          // '없다'를 보이는 조건이다. 그러려면 받은 목록이 전부여야 하는데
          // 그 보증이 아직 없다(EXAM_EVIDENCE.ko.md, listComplete=false).
          // 무엇을 근거로 판정하는지만 적고, 확인하지 않은 것을 한계라고
          // 단정해 적지도, 전부라고 말하지도 않는다.
          cond('history2y', 'BASELINE', '과거 이력', '2년 내 750점 미만', null,
            '본인 계정의 성적 조회 결과로 판정합니다.'),
          cond('review', 'REVIEW', '후기', '200byte', '이상',
            '수강시작일 +107일 이내 작성 · 정상적인 후기가 아니라고 판단되면 '
            + '환급률이 바뀔 수 있습니다.', 'AUTO_REVIEWED'),
        ], siwon(100, 1)),
      ], null),
      tier('r200', '200%', [
        path(null, [
          cond('attend100', 'LEARNING', '출석', '100일', '연속', '매일 다른 강의로 진도율 60% 이상'),
          cond('exam750', 'EXAM', '시험', '750점', '이상',
            'TOEIC_LR 총점 · 수강시작일 +100일 이내 응시분만 인정'),
          cond('history2y', 'BASELINE', '과거 이력', '2년 내 750점 미만', null,
            '본인 계정의 성적 조회 결과'),
          cond('review', 'REVIEW', '후기', '200byte', '이상',
            '수강시작일 +107일 이내 작성 · 정상적인 후기가 아니라고 판단되면 '
            + '환급률이 바뀔 수 있습니다.', 'AUTO_REVIEWED'),
        ]),
      ], siwon(200, 1)),
      tier('r300', '300%', [
        path(null, [
          cond('attend100', 'LEARNING', '출석', '100일', '연속', '매일 다른 강의로 진도율 60% 이상'),
          cond('exam850', 'EXAM', '시험', '850점', '이상',
            'TOEIC_LR 총점 · 수강시작일 +100일 이내 응시분만 인정'),
          cond('history2y', 'BASELINE', '과거 이력', '2년 내 750점 미만', null,
            '본인 계정의 성적 조회 결과'),
          cond('review', 'REVIEW', '후기', '200byte', '이상',
            '수강시작일 +107일 이내 작성 · 정상적인 후기가 아니라고 판단되면 '
            + '환급률이 바뀔 수 있습니다.', 'AUTO_REVIEWED'),
        ]),
      ], siwon(300, 1)),
    ]),
  }),
});

// ── YBM 750+ 환급코스 ───────────────────────────────────────────────────────
//
// 안내문에 실제 금액이 적혀 있는 반이다. 가정한 값이 거의 없다.
//
//   수강료 환급액 170,040원 (제세공과금 22% 공제한 금액)
//
// 여기서 역산하면 수강료가 218,000원이다(170,040 ÷ 0.78 = 218,000, 딱 떨어진다).
// 역산이 맞다는 것은 **결제수수료 공제가 없다**는 뜻이기도 하다 — 뺐다면
// 170,040보다 작아야 한다. 시원스쿨은 빼고 YBM 은 안 뺀다.
//
// **응시료 추가 환급도 없다.** 최대500%·박혜원·미친토익 표에는 「토익응시료
// 추가 환급시(원)」 칸이 있는데 750+ 표에만 그 칸이 없다. 토익 응시료 쿠폰
// (안내문 10번)은 결제 직후 주는 50% 할인 쿠폰이고 조건과 무관해서 환급이
// 아니다.
//
// 환급률이 100% 하나뿐이라 구간이 없다. 경로도 하나다(전부 AND).
// 그래서 conditionTiers 가 아니라 conditionGroups 를 쓴다.

const YBM_LEARNING_START = 1788220800;              // 2026-09-01 09:00 KST
const YBM_LEARNING_END = YBM_LEARNING_START + 7776000;  // 수강기간 90일
const YBM_SUBMIT_AT = YBM_LEARNING_END + 2592000;   // 환급 신청은 수강종료 후 30일 이내

export const YBM_POLICY = Object.freeze({
  compilerVersion: 'course-policy-synthetic.1',
  policyHash: hash('c3'),
  requiredLectureIdsHash: hash('8a'),
  publishable: false,
  policy: Object.freeze({
    schemaVersion: 4,
    cohortId: 'ybm-750plus-001',
    policyVersion: '1',
    dataMode: 'SYNTHETIC',
    examType: 'TOEIC_LR',

    minScore: 750,
    // YBM 출석 규칙은 '90일 동안 매일' 이라 날짜 기준이고 강의 개수 기준이
    // 아니다. 아래 두 필드는 현재 컴파일러 모양을 지키려고 두며, 화면은
    // conditionGroups 를 쓴다.
    minCompletionBps: 10000,

    examDateStart: '2026-09-01',
    examDateEnd: '2026-11-30',

    learningStart: String(YBM_LEARNING_START),
    learningEnd: String(YBM_LEARNING_END),
    requiredLectureIds: Object.freeze([
      'ybm-01', 'ybm-02', 'ybm-03', 'ybm-04', 'ybm-05',
      'ybm-06', 'ybm-07', 'ybm-08', 'ybm-09', 'ybm-10',
    ]),
    completionRuleVersion: 'seed-required-completed-in-period.1',

    enrollmentStart: String(YBM_LEARNING_START),
    enrollmentUntil: String(YBM_LEARNING_END),
    normalSubmitFrom: String(YBM_LEARNING_END),
    normalSubmitAt: String(YBM_SUBMIT_AT),
    supplementEndAt: String(YBM_SUBMIT_AT + 259200),
    claimUntil: String(YBM_SUBMIT_AT + 864000),

    // 실수령 170,040원 = 170,040 TEST (1 TEST = 1원)
    amount: '170040000000',
    tokenDecimals: 6,
    sourcePolicySetHash: hash('6b'),
    privacyNoticeVersion: 'privacy-notice-1',

    conditionGroups: Object.freeze([
      path(null, [
        cond('attend90', 'LEARNING', '출석', '90일', '매일 1강 이상 완강',
          '강의 레슨 러닝타임의 90% 이상 수강 · 자정 이전 완료해야 당일 인정'),
        cond('mock1', 'MOCK_TEST', '모의테스트', '1회', '응시 완료',
          '수료 조건 · 코스에 포함된 토익 모의테스트'),
        cond('exam750', 'EXAM', '시험', '750점', '이상',
          'TOEIC_LR 총점 · 수강시작일 이후 응시한 시험만 인정'),
        cond('review', 'REVIEW', '후기', '수강후기', '작성',
          '환급 신청 시 필수 · 신청은 수강종료 후 30일 이내'),
      ]),
    ]),

    payoutBreakdown: won(
      { label: '수강료 환급액 (수강료 218,000원의 100%)', amount: 218000 },
      [],
      [{ label: '제세공과금 22%', amount: 47960 }],
      170040,
      '안내문에 적힌 금액은 170,040원(제세공과금 22% 공제 후)입니다. '
        + '표시 금액 218,000원은 거기서 역산한 값입니다.',
    ),
  }),
});

export const POLICIES = Object.freeze({
  [SYNTHETIC_POLICY.policyHash]: SYNTHETIC_POLICY,
  [ALTERNATIVE_POLICY.policyHash]: ALTERNATIVE_POLICY,
  [YBM_POLICY.policyHash]: YBM_POLICY,
});
