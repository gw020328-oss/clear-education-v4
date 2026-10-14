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

    amount: '50000000',
    tokenDecimals: 6,
    sourcePolicySetHash: hash('5e'),
    privacyNoticeVersion: 'privacy-notice-1',
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
//   conditionTiers[]          환급률 구간. supported 가 CLEAR 집행 구간
//     └ groups[]              그 구간을 충족하는 경로. 둘 이상이면 OR
//         └ items[]           그 경로의 조건. 서로 AND
//
// 이 모양은 화면이 먼저 만든 제안이다. 서버 정책 스키마에는 아직 없다.
// 다음 두 가지가 선행되어야 실제로 이 정책을 서버가 만들 수 있다.
//
//   1. src/policy/compiler.mjs:19 의 minScore===800 && minCompletionBps===8000
//      고정을 범위 검사로 연다
//   2. 컴파일러와 평가기가 이 구조를 받는다
//      (경로 안은 AND, 경로 중 하나라도 충족하면 그 구간 통과)
//
// 체인에는 조건이 아니라 policyHash 만 들어가므로 계약은 바뀌지 않는다.
// 다만 집행 구간은 하나여야 한다 — config.amount 가 금액 하나뿐이라,
// 구간마다 금액이 달라지는 지급은 계약을 다시 써야 한다.

// 2026-12-05 09:00 KST
const ALT_SUBMIT_AT = 1796428800;

/** 조건 하나 */
const cond = (kind, label, value, tail, detail) =>
  Object.freeze({ kind, label, value, tail, detail, evidence: kind });
/** 그 구간을 충족하는 한 경로. 경로가 하나면 label 은 null */
const path = (label, items) => Object.freeze({
  id: label ? label.replace(/[^가-힣0-9]/g, '') : 'only',
  label,
  items: Object.freeze(items),
});
/** 환급률 구간. supported 는 CLEAR 가 이번에 집행하는지 */
const tier = (id, rate, supported, groups, payout = null) =>
  Object.freeze({ id, rate, supported, groups: Object.freeze(groups), payout });

/**
 * 받을 금액의 내역.
 *
 * 합계 하나만 적으면 광고 금액과 실수령이 다른 문제를 못 보여준다.
 * 안내문의 계산식을 그대로 옮긴다.
 *
 *   (결제금액 − 교재비) × 환급비율 − 결제수수료, 그 뒤 × 0.78 (제세공과금 22%)
 *
 * uncertain 은 안내문이 '약 3%' 처럼 확정하지 않은 값이다. 임의로 3% 로
 * 확정하면 금액이 틀리고, 그것이 이 제품이 없애려는 문제다.
 */
const won = (gross, deductions, net) => Object.freeze({
  gross: Object.freeze(gross),
  deductions: Object.freeze(deductions.map(Object.freeze)),
  net,
});

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
    // 없는 화면·도구는 이 값으로 동작한다. 여기 값은 집행 구간(100%)의 것이다.
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

    amount: '30000000',
    tokenDecimals: 6,
    sourcePolicySetHash: hash('4f'),
    privacyNoticeVersion: 'privacy-notice-1',

    // 환급률 구간이 여럿인 반. 안내문에 있는 구간을 전부 싣되, CLEAR 가
    // 집행하는 구간만 supported 로 표시한다. 숨기면 참가자가 원래 그 구간뿐인
    // 줄 알고, 화면이 안내문보다 적게 말하게 된다.
    //
    // 집행하지 않는 이유는 하나다 — 계약의 config.amount 가 금액 하나이고,
    // 구간마다 금액이 달라지는 지급은 계약을 다시 써야 한다.
    //
    // 구간 안의 groups 는 그 구간을 충족하는 경로다. 둘 이상이면 OR 이다.
    // 수강생은 계약 시점에 구간도 경로도 고르지 않는다.
    conditionTiers: Object.freeze([
      tier('r50', '50%', false, [
        path(null, [
          cond('EXAM', '시험', '목표 점수 미달성', null, '성적표 제출'),
          cond('DOCUMENT', '후기', '200byte', '이상', '수강시작일 +107일 이내 작성'),
        ]),
      ]),
      // 결제금액 320,000 · 교재비 0 · 환급비율 100%
      //   (320,000 − 9,600) × 0.78 = 242,112
      tier('r100', '100%', true, [
        path('경로 1 · 출석', [
          cond('LEARNING', '출석', '100일', '연속',
            '매일 다른 강의로 진도율 60% 이상 수강 · 자정 기준 당일 인정'),
          cond('DOCUMENT', '후기', '200byte', '이상', '수강시작일 +107일 이내 작성'),
        ]),
        path('경로 2 · 성적', [
          cond('EXAM', '시험', '750점', '이상', 'TOEIC_LR 총점 · 수강시작일 이후 응시분'),
          // '없다'를 보이는 조건이다. 그러려면 받은 목록이 전부여야 하는데
          // 그 보증이 아직 없다(EXAM_EVIDENCE.ko.md, listComplete=false).
          // 무엇을 근거로 판정하는지만 적고, 확인하지 않은 것을 한계라고
          // 단정해 적지도, 전부라고 말하지도 않는다.
          cond('EXAM', '과거 이력', '2년 내 750점 미만', null,
            '본인 계정의 성적 조회 결과로 판정합니다.'),
          cond('DOCUMENT', '후기', '200byte', '이상', '수강시작일 +107일 이내 작성'),
        ]),
      ], won(
        { label: '수강료 환급액 (결제금액 320,000원의 100%)', amount: 320000 },
        [
          { label: '결제수수료 약 3%', amount: 9600, uncertain: true },
          { label: '제세공과금 22%', amount: 68288 },
        ],
        242112,
      )),
      tier('r200', '200%', false, [
        path(null, [
          cond('LEARNING', '출석', '100일', '연속', '매일 다른 강의로 진도율 60% 이상'),
          cond('EXAM', '시험', '750점', '이상', 'TOEIC_LR 총점'),
          cond('EXAM', '과거 이력', '2년 내 750점 미만', null, '본인 계정의 성적 조회 결과'),
          cond('DOCUMENT', '후기', '200byte', '이상', '수강시작일 +107일 이내 작성'),
        ]),
      ]),
      tier('r300', '300%', false, [
        path(null, [
          cond('LEARNING', '출석', '100일', '연속', '매일 다른 강의로 진도율 60% 이상'),
          cond('EXAM', '시험', '850점', '이상', 'TOEIC_LR 총점'),
          cond('EXAM', '과거 이력', '2년 내 750점 미만', null, '본인 계정의 성적 조회 결과'),
          cond('DOCUMENT', '후기', '200byte', '이상', '수강시작일 +107일 이내 작성'),
        ]),
      ]),
      tier('r400', '400%', false, [
        path(null, [
          cond('LEARNING', '출석', '100일', '연속', '매일 다른 강의로 진도율 60% 이상'),
          cond('EXAM', '시험', '990점', null, 'TOEIC_LR 만점'),
          cond('EXAM', '과거 이력', '2년 내 750점 미만', null, '본인 계정의 성적 조회 결과'),
          cond('DOCUMENT', '후기', '200byte', '이상', '수강시작일 +107일 이내 작성'),
          // 외부 블로그 게시물은 자동으로 확인할 수단이 없다. 지원 여부와
          // 무관하게, 안내문에 있으므로 빠뜨리지 않고 적는다.
          cond('DOCUMENT', '챌린지', '블로그 14회', '연속 포스팅',
            '수강시작일 +100일 내 · 외부 블로그 게시물은 자동 확인 대상이 아닙니다.'),
        ]),
      ]),
    ]),
  }),
});

export const POLICIES = Object.freeze({
  [SYNTHETIC_POLICY.policyHash]: SYNTHETIC_POLICY,
  [ALTERNATIVE_POLICY.policyHash]: ALTERNATIVE_POLICY,
});
