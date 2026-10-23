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
    // 참가자가 맨 처음 봐야 하는 것. cohortId 는 기계용이라 쓸 수 없다.
    productName: '합성 데모 환급반',
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
    productName: '시원스쿨 시작이반 750점반',
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
            + '환급률이 바뀔 수 있습니다.'),
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
            + '환급률이 바뀔 수 있습니다.'),
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
            + '환급률이 바뀔 수 있습니다.'),
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
            + '환급률이 바뀔 수 있습니다.'),
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
            + '환급률이 바뀔 수 있습니다.'),
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
    productName: 'YBM 750+ 환급코스',
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
        // 인정 기간을 단정하지 않는다. 안내문에 「수강시작일 이후 응시」와
        // 「수료 후 정기 토익」이 함께 있어 운영자 검토에서 보류 중이다.
        // 학생 화면만 한쪽으로 확정하면 두 화면이 다른 결론을 보여준다.
        cond('exam750', 'EXAM', '시험', '750점', '이상',
          'TOEIC_LR 총점 · 어느 시험이 인정되는지는 확인 중입니다 — 안내문에 '
          + '「수강시작일 이후 응시」와 「수료 후」가 함께 적혀 있습니다.'),
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

// ── 메타코드 데이터 엔지니어 부트캠프 ─────────────────────────────────────
//
// 어학원을 접고 소규모 환급형 부트캠프로 타겟을 옮겼다(docs/pivot 참조).
// ㈜메타코드에이치 — 직원 10명, 기수당 15~22명, 비국비 자비 부담.
//
// 앞의 두 반과 구조가 다르다.
//
//   환급률 구간이 하나다.      전액환급 하나뿐. 50%/100%/200% 같은 구간이 없다.
//   경로가 하나다.             OR 이 없고 조건 전부가 AND 다.
//   조건이 열 개다.            안내문이 "위 환급 기준 미달 시 환급가능
//                              대상자에서 제외됩니다" 라고 못박았다.
//
// 그래서 tier 하나 · path 하나 · items 열 개가 된다. 구조를 단순하게 쓰는
// 것이 아니라 이 상품이 실제로 그렇다.
//
// 안내문에 없는 값은 가정하고 주석에 적는다. 가정한 것과 안내문에 있는 것을
// 섞으면 나중에 무엇이 근거였는지 알 수 없다.
//
//   PG사 수수료율   안내문에 "PG사 수수료 공제 후" 라고만 있고 요율이 없다.
//                   3% 로 가정한다. F3 운영자 화면에서는 HELD 로 비워 두고
//                   운영자에게 묻는다 — 같은 값의 두 단계다.
//   판정 주차        배너는 "15주 집중 과정" 인데 출석 조건은 "1~10주차" 다.
//                   수강 완료 조건은 주차 수가 아예 없다. 10주차로 가정하고,
//                   이 어긋남도 F3 에서 묻는다.
//   횟수            Live 스터디·퀴즈·작업형 과제·플랫폼 후기의 횟수가
//                   안내문에 없다. 데모 가정값이며 각 조건 detail 에 적었다.
//
// examType·minScore 는 어학원 전용 필드다. 이 반에는 시험이 없어 의미가
// 없지만 어댑터가 요구해서 남겨 둔다(스키마 변경 요청 목록에 올렸다).

// 2026-09-18 09:00 KST 개강 · 10주차 종료 2026-11-27 · 수료 후 신청
const MC_START = 1789689600;        // 2026-09-18 09:00 KST
const MC_WEEK10_END = 1795737600;   // 2026-11-27 09:00 KST
const MC_SUBMIT_AT = 1798761600;    // 2027-01-01 09:00 KST

/**
 * 메타코드 환급액.
 *
 *   안내문 — "환급 대상 금액은 실결제금액에서 PG사 수수료 공제 후,
 *             제세공과금 22% 공제한 금액이 환불되며"
 *
 * 시원스쿨과 식의 모양이 같다. 다만 가산(응시료)이 없고 환급률도 하나다.
 * PG 수수료는 요율이 안내문에 없어 uncertain 으로 둔다 — 시원스쿨의
 * '약 3%' 와 같은 처리다.
 *
 * 환급이 "최초 결제 시 사용한 동일한 결제 수단으로 처리" 되므로 실제로는
 * 카드 결제 취소다. 그래서 PG 수수료가 공제된다. CLEAR 는 이것을 지갑
 * 즉시 송금으로 바꾼다.
 */
const MC_PAY = 2490000;
const MC_PG_BPS = 300;                                  // 3% — 가정
const MC_PG_FEE = MC_PAY * MC_PG_BPS / 10000;           // 74,700
const MC_BASE = MC_PAY - MC_PG_FEE;                     // 2,415,300
const MC_TAX = Math.floor(MC_BASE * 22 / 100);          // 531,366
const MC_NET = MC_BASE - MC_TAX;                        // 1,883,934

export const METACODE_POLICY = Object.freeze({
  compilerVersion: 'course-policy-synthetic.1',
  policyHash: hash('d4'),
  requiredLectureIdsHash: hash('8e'),
  publishable: false,
  policy: Object.freeze({
    schemaVersion: 4,
    cohortId: 'metacode-de-2609',
    productName: '메타코드 데이터 엔지니어 부트캠프',
    policyVersion: '1',
    dataMode: 'SYNTHETIC',
    // 이 반에는 시험이 없다. 어학원 전용 레거시 필드를 어댑터가 요구해서
    // 남겨 둘 뿐, 조건 어디에도 쓰이지 않는다.
    examType: 'TOEIC_LR',
    minScore: 0,
    minCompletionBps: 10000,

    examDateStart: '2026-09-18',
    examDateEnd: '2026-11-27',

    learningStart: String(MC_START),
    learningEnd: String(MC_WEEK10_END),
    // 주차별 강의. 조건 5 가 "해당 주차 내 100% 수강 완료" 를 요구하므로
    // 강의 목록이 아니라 주차가 판정 단위다.
    requiredLectureIds: Object.freeze([
      'mc-w01', 'mc-w02', 'mc-w03', 'mc-w04', 'mc-w05',
      'mc-w06', 'mc-w07', 'mc-w08', 'mc-w09', 'mc-w10',
    ]),
    completionRuleVersion: 'seed-required-completed-in-period.1',

    enrollmentStart: '1788220800',
    enrollmentUntil: String(MC_START),
    normalSubmitFrom: String(MC_WEEK10_END),
    normalSubmitAt: String(MC_SUBMIT_AT),
    supplementEndAt: String(MC_SUBMIT_AT + 259200),
    claimUntil: String(MC_SUBMIT_AT + 864000),

    // 실수령 1,883,934원 = 1,883,934 TEST (1 TEST = 1원)
    amount: '1883934000000',
    tokenDecimals: 6,
    sourcePolicySetHash: hash('2c'),
    privacyNoticeVersion: 'privacy-notice-1',

    // 구간 하나 · 경로 하나 · 조건 열 개가 전부 AND.
    // 안내문: "위 환급 기준 미달 시 환급가능 대상자에서 제외됩니다."
    conditionTiers: Object.freeze([
      tier('full', '전액', [
        path(null, [
          cond('liveStudy', 'LEARNING', '현직자 Live 스터디', '3회', '전부 참석',
            '열리는 세션에 모두 참석해야 합니다 · 안내문에 횟수가 없어 3회로 가정했습니다.'),
          cond('liveTask', 'LEARNING', '스터디 과제', '전부', '제출',
            'Live 스터디에 딸린 과제 · 제출률 100%'),
          cond('quiz', 'MOCK_TEST', '퀴즈', '10회 전부 제출', '정답률 80% 이상',
            '제출률과 정답률을 둘 다 넘겨야 합니다 · 점수는 학원 채점 결과를 그대로 '
            + '가져옵니다 · 안내문에 횟수가 없어 10회로 가정했습니다.'),
          // 학원이 이미 채점한 과제다. CLEAR 가 LLM 으로 다시 채점하면 학원 기준과
          // 다른 지급 기준이 생긴다 — 89점이 학원에서는 미달인데 우리 쪽에서 통과하는
          // 일이 벌어진다. 원천 점수를 읽어 임계값과 비교할 뿐이다.
          cond('practical', 'MOCK_TEST', '작업형 과제', '5회 전부 제출', '정답률 90% 이상',
            '퀴즈보다 기준이 높습니다 · 점수는 **학원이 매긴 채점 결과**를 그대로 '
            + '가져옵니다. CLEAR 가 다시 채점하지 않습니다 · 퀴즈와 통틀어 점수 미달 '
            + '1회는 면제됩니다 · 안내문에 횟수가 없어 5회로 가정했습니다.'),
          // 열 개 중 유일하게 기한이 붙은 조건이다. 그 주에 열린 강의를
          // 그 주 안에 끝내야 하고, 다음 주에 몰아 들으면 인정되지 않는다.
          cond('weekly', 'LEARNING', '주차별 수강', '10주차', '해당 주차 내 완료',
            '그 주에 열린 강의를 그 주 안에 끝내야 합니다. 밀려서 나중에 몰아 들으면 '
            + '인정되지 않습니다 · 과정은 15주인데 안내문이 판정 주차를 밝히지 않아 '
            + '출석과 같은 10주차로 가정했습니다.'),
          cond('platformReview', 'REVIEW', '플랫폼 후기', '3회', '작성',
            '과정 중 메타코드 사이트에 씁니다 · 안내문은 "지정된 횟수" 라고만 적어 '
            + '3회로 가정했습니다.'),
          cond('attendance', 'LEARNING', '출석', '9회', '이상 (10회 중)',
            '주 1회 출석체크 · 금요일 21시 또는 토요일 9시 30분 중 하나에 참여하면 '
            + '인정됩니다 · 1회까지 빠질 수 있고, 천재지변은 서류를 내면 인정됩니다.'),
          cond('survey', 'REVIEW', '만족도 조사', '수료 후', '제출', null),
          cond('boardReview', 'REVIEW', '메타코드 게시판 후기', '수료 후', '작성',
            '환급 후기를 메타코드 후기 게시판에 씁니다.'),
          // 외부 플랫폼이라 학원도 API 로 못 가져온다. 참가자가 본인 계정으로
          // 로그인해 공증한다(zkTLS). 서류를 내는 것이 아니다.
          //
          // 공증이 증명하는 것과 증명하지 못하는 것을 섞으면 안 된다.
          // zkTLS 는 '이 응답이 그 서버에서 왔다' 를 증명한다. 그것이 곧
          // '이 사람이 썼다' 나 '이 시각에 썼다' 는 아니다 —
          // 작성자는 계정을 빌릴 수 있고, 게시 시각은 플랫폼이 적은 값이다.
          cond('blogReview', 'BLOG', '개인 블로그 후기', '수료 후', '작성',
            '본인 계정으로 로그인해 글이 게시된 것을 확인합니다. 파일을 내지 않습니다 · '
            + '확인되는 것은 「그 글이 그 주소에 있다」와 「로그인한 계정으로 그 글이 '
            + '보인다」 두 가지입니다. 누가 썼는지와 실제 작성 시각은 이 방법으로 '
            + '증명되지 않습니다.',
            'SELF_LOGIN'),
        ]),
      ], won(
        { label: '수강료 전액 환급 (실결제금액 2,490,000원)', amount: MC_PAY },
        [],
        [
          // 안내문에 요율이 없다. 3% 는 시연용 가정이며 확정값이 아니다.
          { label: 'PG사 수수료 3%', amount: MC_PG_FEE, uncertain: true, demoAssumption: true },
          { label: '제세공과금 22%', amount: MC_TAX },
        ],
        MC_NET,
        '안내문 — 실결제금액에서 PG사 수수료 공제 후, 제세공과금 22% 공제한 금액이 '
          + '환불됩니다. PG 요율은 안내문에 없어 3%로 가정한 값입니다.',
      )),
    ]),
  }),
});

/**
 * 안내문에 없어 우리가 정한 값.
 *
 * 조건 detail 에 자연어로만 적어 두면 사람은 읽어도 기계는 구분하지 못한다.
 * 어느 숫자가 안내문에서 온 것이고 어느 숫자가 시연 가정인지 섞이면, 나중에
 * 실제 정책을 만들 때 가정값이 그대로 상용 상수가 된다.
 *
 * 서버가 실제 정책을 주게 되면 이 목록은 비어야 한다. 비어 있지 않다는 것은
 * 아직 확인하지 못한 값이 남아 있다는 뜻이다.
 */
export const METACODE_DEMO_ASSUMPTIONS = Object.freeze([
  Object.freeze({
    id: 'pgFeeRate', target: 'payout.deductions[0]',
    label: 'PG사 수수료율', value: '3%',
    why: '안내문은 "PG사 수수료 공제 후" 라고만 적고 요율을 밝히지 않았습니다.',
  }),
  Object.freeze({
    id: 'judgeWeeks', target: 'conditions.weekly',
    label: '수강 완료 판정 주차', value: '1~10주차',
    why: '과정은 15주인데 출석 조건만 1~10주차로 적혀 있고, 수강 완료는 주차 범위가 '
      + '없습니다. 출석과 같은 범위로 맞췄습니다.',
  }),
  Object.freeze({
    id: 'liveStudyCount', target: 'conditions.liveStudy',
    label: 'Live 스터디 횟수', value: '3회',
    why: '안내문에 횟수가 없습니다. 참석률 100% 를 요구할 만한 규모로 잡았습니다.',
  }),
  Object.freeze({
    id: 'quizCount', target: 'conditions.quiz',
    label: '퀴즈 횟수', value: '10회',
    why: '안내문에 횟수가 없습니다. 주 1회로 잡았습니다.',
  }),
  Object.freeze({
    id: 'practicalCount', target: 'conditions.practical',
    label: '작업형 과제 횟수', value: '5회',
    why: '안내문에 횟수가 없습니다.',
  }),
  Object.freeze({
    id: 'platformReviewCount', target: 'conditions.platformReview',
    label: '플랫폼 후기 횟수', value: '3회',
    why: '안내문이 "지정된 횟수" 라고만 적었습니다.',
  }),
  Object.freeze({
    id: 'waiverScope', target: 'conditions.practical',
    label: '점수 미달 면제 범위', value: '퀴즈·작업형 과제 통틀어 1회',
    why: '안내문의 "과제 점수 미달 1회 면제" 가 각 조건마다인지 통틀어인지 '
      + '밝히지 않았습니다.',
  }),
]);

export const POLICIES = Object.freeze({
  [SYNTHETIC_POLICY.policyHash]: SYNTHETIC_POLICY,
  [ALTERNATIVE_POLICY.policyHash]: ALTERNATIVE_POLICY,
  [YBM_POLICY.policyHash]: YBM_POLICY,
  [METACODE_POLICY.policyHash]: METACODE_POLICY,
});
