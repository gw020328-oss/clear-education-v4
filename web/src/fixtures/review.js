// 운영자 검토 fixture — AI가 안내문에서 뽑은 결과
//
// src/ai-policy/field-review.mjs 의 reviewFields() 가 내보내는 모양을 따른다.
// 그 파일을 직접 돌려 만든 값이 아니라 코드를 읽고 맞춘 값이다(이 저장소의
// src/ 는 ethers 등을 설치해야 돌아간다). 모양이 어긋나면 checkReviewView 가
// 먼저 깨뜨린다.
//
//   fields[]      운영자가 승인할 값. 질문이나 flag 가 걸리면 value 가 비고
//                 state 가 HELD 가 된다 — AI 가 본 값을 그대로 쓰지 않는다
//   questions[]   사람에게 묻는 것. fieldIds 로 어느 값을 붙잡는지 가리킨다
//   flags[]       충돌·불확실 표시
//   provenance[]  AI 가 관측한 값. 보류되어도 버리지 않고 따로 남긴다
//   publishable   승인 전에는 늘 false
//
// field-review.mjs 의 주석이 요지를 말한다 —
//   "No NLP/regex guessing of question meaning. Any unresolved signal holds
//    its explicit fields."
// 질문이 하나라도 열려 있으면 그 값을 비운다. AI 가 지어내지 못하게 막는 것이고,
// 운영자 화면이 보여줘야 하는 것도 바로 그 빈칸이다.

const VERSION = 'clear-field-review.1';

/** 안내문 한 덩이. locator 로 값과 원문을 잇는다 */
const block = (locator, text) => Object.freeze({ locator, text });

/** 운영자가 채울 값 하나 */
const field = (fieldId, label, unit, value, location, state, reasons) =>
  Object.freeze({ fieldId, label, unit, value, location, state, reasons: Object.freeze(reasons) });

/**
 * 검토 한 건.
 *
 * reviewFields() 의 출력에 화면이 쓰는 것만 더했다 — 어느 반인지(title),
 * 안내문 원문(blocks), 값의 사람 이름(label·unit). 서버가 이것들을 주게 되면
 * 여기 변환만 바꾸면 된다.
 */
const review = ({ id, title, source, blocks, fields, questions, flags, provenance }) => Object.freeze({
  version: VERSION,
  reviewId: id,
  title,
  source,
  blocks: Object.freeze(blocks),
  fields: Object.freeze(fields),
  questions: Object.freeze(questions.map(Object.freeze)),
  flags: Object.freeze(flags.map(Object.freeze)),
  provenance: Object.freeze(provenance.map(Object.freeze)),
  // 보류된 값이 하나라도 있으면 검토가 필요하다. 값이 다 관측되어도
  // 승인 전에는 게시할 수 없다 — publishable 은 늘 false 다.
  status: fields.some((f) => f.state !== 'OBSERVED') ? 'NEEDS_REVIEW' : 'OBSERVED_ONLY',
  publishable: false,
  automaticEligibility: false,
  paymentAllowed: false,
});

// ── 시원스쿨 시작이반 750점반 ──────────────────────────────────────────────
//
// 안내문에 있는 것은 뽑히고, 없는 것은 비어 있다. 응시료가 그 예다 —
// 계산식에 '+응시료' 라고만 적혀 있고 금액이 어디에도 없다. AI 가 지어내면
// 금액이 틀리고, 그게 이 제품이 없애려는 문제다.

export const SIWON_REVIEW = review({
  id: 'siwon-750-466',
  title: '시원스쿨 시작이반 750점반 (466기)',
  source: '시작이 반 토익 환급반 유의사항',
  blocks: [
    block('L18', '*출석 미션 : 수강시작일로부터 연속 100일'),
    block('L19', '*수강후기 작성기간/환급 또는 연장 신청기간 : 수강시작일로부터 107일 이내'),
    block('L27', '수강료 100%+응시료 0원 — 1) 출석 100일 + 수강후기 Or 2) 성적표(750점이상) + 2년 이내 목표 점수 미달성(혹은 첫토익) 내역 + 수강후기'),
    block('L52', '1) 모든 환급금은 최종 환급액에 기준 22%의 제세공과금이 부과되며, 본인 부담입니다.'),
    block('L53', '2) 모든 환급금에 약 3%의 결제 수수료가 차감됩니다'),
    block('L56', '- 100% 이상 성적 환급+응시료 : (((결제금액-교재비)*환급비율)-결제수수료+응시료)*0.78'),
  ],
  fields: [
    field('targetScore', '목표 점수', '점', '750', 'L27', 'OBSERVED', []),
    field('attendDays', '출석 일수', '일', '100', 'L18', 'OBSERVED', []),
    field('claimWindowDays', '신청 기한', '일', '107', 'L19', 'OBSERVED', []),
    field('taxBps', '제세공과금', 'bps', '2200', 'L52', 'OBSERVED', []),
    // 안내문이 '약 3%' 라고만 쓴다. 숫자를 확정하면 금액이 틀린다.
    field('feeRate', '결제수수료', '%', null, 'L53', 'HELD', ['FLAG:0']),
    // 계산식에 자리는 있는데 금액이 안내문 어디에도 없다.
    field('examCredit', '응시료', '원', null, 'L56', 'HELD', ['QUESTION:0']),
    // 결제금액은 안내문이 아니라 상품 페이지에 있다. 관측 자체가 없다.
    field('paidAmount', '결제금액', '원', null, null, 'UNOBSERVED', ['NO_VALUE']),
  ],
  questions: [
    {
      questionId: 'exam-credit-amount',
      fieldIds: ['examCredit'],
      text: '계산식에 +응시료 가 있으나 안내문에 금액이 없습니다. 얼마입니까?',
    },
  ],
  flags: [
    { code: 'UNCERTAIN', fieldIds: ['feeRate'] },
  ],
  provenance: [
    { fieldId: 'targetScore', observedValue: '750', location: 'L27' },
    { fieldId: 'attendDays', observedValue: '100', location: 'L18' },
    { fieldId: 'claimWindowDays', observedValue: '107', location: 'L19' },
    { fieldId: 'taxBps', observedValue: '2200', location: 'L52' },
    // 보류되어도 AI 가 본 값은 버리지 않는다. 운영자가 판단할 재료다.
    { fieldId: 'feeRate', observedValue: '3', location: 'L53' },
    { fieldId: 'examCredit', observedValue: null, location: 'L56' },
    { fieldId: 'paidAmount', observedValue: null, location: null },
  ],
});

// ── YBM 750+ 환급코스 ──────────────────────────────────────────────────────
//
// 이쪽은 안내문에 금액이 표로 적혀 있어 보류가 적다. 같은 화면이 반에 따라
// 다르게 그려지는 것을 보이는 자리다.

export const YBM_REVIEW = review({
  id: 'ybm-750plus-001',
  title: 'YBM 750+ 환급코스',
  source: '토익 환급코스 유의사항',
  blocks: [
    block('L31', '[조건 1] 수강기간 90일 동안 매일 출석하여 1강 이상 완강 (강의 레슨 총 러닝타임의 90% 이상 수강시 인정)'),
    block('L32', '[조건 2] 토익 모의테스트 1회 응시 완료'),
    block('L40', '- 환급 신청은 수강종료 후 30일 이내에 가능합니다.'),
    block('L77', '[750+ 환급코스] 100% | 출석+모의테스트 응시+750점 이상 | 170,040'),
    block('L78', '- 수료 후 정기 토익 시험 점수에서 750점 이상 달성 시 수강료를 100% 환급해 드립니다. (제세공과금 22% 공제한 금액)'),
  ],
  fields: [
    field('targetScore', '목표 점수', '점', '750', 'L77', 'OBSERVED', []),
    field('attendDays', '출석 일수', '일', '90', 'L31', 'OBSERVED', []),
    field('claimWindowDays', '신청 기한', '일', '30', 'L40', 'OBSERVED', []),
    field('taxBps', '제세공과금', 'bps', '2200', 'L78', 'OBSERVED', []),
    field('netAmount', '실수령', '원', '170040', 'L77', 'OBSERVED', []),
    // 안내문은 세후 금액만 준다. 세전 수강료는 역산해야 나오는데,
    // 역산은 AI 가 아니라 사람이 확인할 일이다.
    field('paidAmount', '수강료', '원', null, 'L77', 'HELD', ['QUESTION:0']),
  ],
  questions: [
    {
      questionId: 'gross-from-net',
      fieldIds: ['paidAmount'],
      text: '안내문은 세후 170,040원만 적습니다. 세전 수강료를 역산해도 됩니까?',
    },
  ],
  flags: [],
  provenance: [
    { fieldId: 'targetScore', observedValue: '750', location: 'L77' },
    { fieldId: 'attendDays', observedValue: '90', location: 'L31' },
    { fieldId: 'claimWindowDays', observedValue: '30', location: 'L40' },
    { fieldId: 'taxBps', observedValue: '2200', location: 'L78' },
    { fieldId: 'netAmount', observedValue: '170040', location: 'L77' },
    { fieldId: 'paidAmount', observedValue: null, location: 'L77' },
  ],
});

export const REVIEWS = Object.freeze({
  [SIWON_REVIEW.reviewId]: SIWON_REVIEW,
  [YBM_REVIEW.reviewId]: YBM_REVIEW,
});

/** 화면이 기본으로 여는 검토. 보류가 있는 쪽이라야 할 일이 보인다 */
export const DEFAULT_REVIEW_ID = SIWON_REVIEW.reviewId;
