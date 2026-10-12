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
