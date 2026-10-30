// 시연 상황 둘 — 조건은 똑같이 다 달성, 재원만 다르다
//
//   paid       재원이 있어서 100 TEST 지급까지 끝남
//   shortfall  재원이 50 TEST 모자라 대기열에 있음
//
// ── 왜 조건을 둘 다 '전부 충족' 으로 두나 ──────────────────────────────
//
// 변수를 하나만 다르게 해야 비교가 된다. 조건도 다르고 재원도 다르면, 멈춘
// 이유가 조건 때문인지 돈 때문인지 화면만 봐서는 알 수 없다. 둘 다 조건은
// 다 채운 상태로 두면 **돈 하나만** 달라진다.
//
// 그게 이 제품이 더 하는 일이기도 하다. 조건을 다 채웠는데 못 받는 상황에서
// "왜 못 받는지"와 "몇 번째로 기다리는지"를 숨기지 않는 것.
//
// ── 왜 우리가 만드나 ───────────────────────────────────────────────────
//
// 백엔드가 준 fixture 두 개는 둘 다 쓰기 어렵다.
//
//   missing                    조건 0개 + 재원 부족 — 변수가 둘이다
//   waitingForOperatorConsent  조건 4개 + 전액 확보 + 양측 확인 중 — 끝이 없다
//
// 기획서 §13.1 주시연은 "정상 환급 한 건"이고 그 끝 그림이 없다.
// §13.2 의 "150 TEST 에서 두 명" 부족 시연도 한 건짜리 fixture 에는 없다.
//
// ── 어디까지가 백엔드 것인가 ───────────────────────────────────────────
//
// 모양을 새로 짓지 않는다. `waitingForOperatorConsent` 를 **그대로 복사해**
// 해당 필드만 덮는다. 서버 응답 모양이 바뀌면 여기도 같이 깨져서 알아챈다.
// 덮는 값은 전부 서버가 실제로 주는 필드다.
//
// ── 이건 합성이다 ──────────────────────────────────────────────────────
//
// 실제 지급 기록이 아니다. 화면이 두 결말을 어떻게 그리는지 보려고 만든 값이고,
// 화면 위 '백엔드 합성 예시' 배너가 그 사실을 말한다. 원본과 같은 2020년
// 시계를 쓴다 — 오늘 날짜로 바꾸면 진짜처럼 보인다.

import { BOOTCAMP_FIXTURES } from './bootcamp.js';

/**
 * 회고 조건에 AI 가 찾은 근거 문장을 붙인다.
 *
 * 금창섭 멘토 §2·§4 가 요구한 것이다.
 *
 *   "AI 판단: 맞았는지를 기술적으로 증명할 방법은 없습니다. 대신 AI가 어느
 *    문장을 근거로 무엇을 판단했는지, 어떤 모델과 정책 버전을 썼는지를
 *    학원과 참가자 양쪽에 보여 주고 …"
 *
 *   "회고에서 어떤 근거 문장을 찾아 어떻게 판단했는지를 화면으로 보여 주면,
 *    심사위원의 'AI가 무엇을 하느냐'는 질문에 바로 답할 수 있습니다."
 *
 * **서버는 아직 이 필드를 주지 않는다.** 모양을 여기서 정해 두면 오규원이
 * 채우기만 하면 된다. 화면은 필드가 있을 때만 그린다.
 *
 * 글은 합성이다. 실제 학생 회고가 아니다.
 */
const REFLECTION_TEXT = '이번 주에는 로그인 API 를 Flask 로 구현했다. '
  + '처음에는 토큰이 자꾸 만료돼서 요청이 401 로 떨어졌는데, '
  + '로그를 찍어 보니 서버 시간과 토큰 발급 시간이 9시간 차이가 나 있었다. '
  + 'UTC 로 통일해서 해결했다. '
  + '세션과 토큰이 어떻게 다른지 이번에 처음 제대로 알게 됐다.';

const AI_EVIDENCE = Object.freeze({
  model: 'gemini-2.0-flash',
  policyVersion: 'reflection-rubric.1',
  checkedAt: 1580558300,
  sourceText: REFLECTION_TEXT,
  // 루브릭 세 항목. offset 은 sourceText 안의 위치라 화면이 밑줄을 칠 수 있다.
  findings: Object.freeze([
    Object.freeze({
      topic: '수행 내용',
      met: true,
      quote: '이번 주에는 로그인 API 를 Flask 로 구현했다.',
      offset: 0,
    }),
    Object.freeze({
      topic: '문제 해결 과정',
      met: true,
      quote: '로그를 찍어 보니 서버 시간과 토큰 발급 시간이 9시간 차이가 나 있었다.',
      offset: REFLECTION_TEXT.indexOf('로그를 찍어'),
    }),
    Object.freeze({
      topic: '배운 점',
      met: true,
      quote: '세션과 토큰이 어떻게 다른지 이번에 처음 제대로 알게 됐다.',
      offset: REFLECTION_TEXT.indexOf('세션과 토큰이'),
    }),
  ]),
});

/**
 * 조건별 내역.
 *
 * 지금 서버가 주는 criteria 한 줄에는 **판정과 메타데이터뿐**이다 —
 * state / evidenceId / reasonCode / expiresAt / source. 그래서 상세 화면이
 * "충족" 이라고만 하고 끝났다. 학생이 알고 싶은 건 "내가 뭘 했길래" 다.
 *
 * 모양을 여기서 정해 둔다. 오규원이 채우면 화면이 그대로 그린다.
 *
 *   progress  { done, total, unit }   §9.3 — 미확인이면 null, 0 으로 만들지 않는다
 *   items     [{ label, at, state }]  실제로 확인된 것들
 *   facts     [{ k, v }]              목록이 아닌 단일 값들
 *
 * 날짜는 원본과 같은 2020 시계를 쓴다.
 */
const WEEK = 86400 * 7;
const BASE_AT = 1580558400 - WEEK * 10;

const DETAIL = Object.freeze({
  'activity-complete': Object.freeze({
    progress: Object.freeze({ done: 10, total: 10, unit: '개' }),
    items: Object.freeze([
      Object.freeze({ label: '1주차 · 변수와 자료형', at: BASE_AT, state: 'DONE' }),
      Object.freeze({ label: '2주차 · 조건문과 반복문', at: BASE_AT + WEEK, state: 'DONE' }),
      Object.freeze({ label: '3주차 · 함수와 모듈', at: BASE_AT + WEEK * 2, state: 'DONE' }),
      Object.freeze({ label: '4주차 · 파일 입출력', at: BASE_AT + WEEK * 3, state: 'DONE' }),
    ]),
    more: 6,
  }),
  'assignment-submitted': Object.freeze({
    progress: Object.freeze({ done: 5, total: 5, unit: '개' }),
    items: Object.freeze([
      Object.freeze({ label: '과제 1 · 계산기 만들기', at: BASE_AT + WEEK, state: 'SUBMITTED' }),
      Object.freeze({ label: '과제 2 · 파일 정리 스크립트', at: BASE_AT + WEEK * 3, state: 'SUBMITTED' }),
      Object.freeze({ label: '과제 3 · 간단한 크롤러', at: BASE_AT + WEEK * 5, state: 'SUBMITTED' }),
    ]),
    more: 2,
    // P0 는 gradingRequired:false 라 점수를 쓰지 않는다. 그 사실을 적는다.
    facts: Object.freeze([
      Object.freeze({ k: '채점 결과', v: '이 정책에서는 쓰지 않음' }),
    ]),
  }),
  // ── 인증서는 증명이 **둘**이다 ──────────────────────────────────────
  //
  // `PYTHON_BOOTCAMP_P0.ko.md` 가 정한 설계다. 공개 인증서 페이지는 로그인
  // 없이 열리고 이름만 보이므로, 그것 하나로는 **신청자 소유를 확정하지
  // 않는다.** 로그인해야 보이는 대시보드 증명(계정 통제)과 공개 인증서
  // 증명을 **같은 signed username·claim owner 로 묶어야** 한다.
  //
  //   "P1은 private account/dashboard 통제 증명과 공개 certificate 증명
  //    둘 다 검증해야 한다. 공개 인증서 하나만으로 신청자 소유를 확정하지
  //    않는다. … unsigned wrapper hash 만 붙여 VERIFIED 로 표시하지 않는다."
  //
  // 전에는 '증명 식별값' 한 줄이었다. 증명이 둘인데 하나로 적으면 화면이
  // 설계를 잘못 전한다.
  'python-basic-certificate': Object.freeze({
    progress: null,
    items: Object.freeze([]),
    facts: Object.freeze([
      Object.freeze({ k: '인증서', v: 'Python (Basic)' }),
      Object.freeze({ k: '발급처', v: 'HackerRank' }),
      Object.freeze({ k: '① 계정 통제 증명', v: 'Reclaim zkTLS · 0x4e1f…a37c' }),
      Object.freeze({ k: '② 인증서 증명', v: 'Reclaim zkTLS · 0x8b2c…d019' }),
      Object.freeze({ k: '두 증명 결합', v: '같은 계정 이름 · 같은 수령 주소' }),
    ]),
  }),
});

/** 조건마다 내역을 붙인다 */
const withDetail = (criteria) => Object.freeze(criteria.map((row) => (
  DETAIL[row.criterionId] ? Object.freeze({ ...row, detail: DETAIL[row.criterionId] }) : row
)));

/** 회고 조건에만 AI 근거를 붙인다 */
export const withAiEvidence = (criteria) => Object.freeze(withDetail(criteria).map((row) => (
  row.criterionId === 'reflection-topics'
    ? Object.freeze({ ...row, aiEvidence: AI_EVIDENCE })
    : row
)));

/** 운영자 동의가 들어오고 절차가 끝난 뒤의 값 */
function paid(view) {
  const decisionId = view.decision.id;
  const now = view.observedAt + 95;   // 확인 기간 120초 안에 양측 동의가 끝났다

  return Object.freeze({
    ...view,
    observedAt: now,
    criteria: withAiEvidence(view.criteria),

    procedure: Object.freeze({
      ...view.procedure,
      // 양측이 같은 판정에 동의해 120초를 기다리지 않고 조기 경로로 갔다
      status: 'ACCEPTED_RIGHT_PRESERVED',
    }),

    consent: Object.freeze({
      ...view.consent,
      bothCurrent: true,
      records: Object.freeze([
        ...view.consent.records,
        Object.freeze({
          ...view.consent.records[0],
          id: 'consent-6a1f80c4-3e52-4d19-bb77-0c2e9af41d35',
          actorRole: 'COURSE_OPERATOR',
          actorCommitment: '0x3b8e1d47a0c95f26bb4471e8d0a2c6f35719e84b2dd0f6a1cc3e95b70f28d41a',
          recordedAt: now - 5,
          decisionId,
        }),
      ]),
    }),

    // 여기가 핵심이다. 네 값이 서로 다르다는 것을 화면이 보여줘야 한다.
    //
    //   acceptedRight   컨트랙트가 권리를 수락했다 (수령인·금액 고정)
    //   transactionState  거래를 제출했다
    //   claimState      블록에 들어가고 최종 확정까지 됐다
    //   receivedAtoms   실제로 받은 양 — 앞의 셋과 같다는 보장이 없어 따로 읽는다
    payment: Object.freeze({
      acceptedRight: Object.freeze({
        recipientFixed: true,
        amountAtoms: view.agreedPayment.amountAtoms,
        acceptedAt: now - 3,
      }),
      transactionState: 'SUBMITTED',
      transactionHash: '0x5d41402abc4b2a76b9719d911017c592f0b4e8a1cc3e95b70f28d41a3b8e1d47',
      blockRef: Object.freeze({ number: 1428, hash: '0x7f1c9ab2' }),
      claimState: 'FINALIZED',
      receivedAtoms: view.agreedPayment.amountAtoms,
      canonicalTransferVerified: true,
      receiptHttpAvailable: true,
    }),
  });
}

/**
 * 조건은 다 채웠는데 재원이 50 TEST 모자란 상태.
 *
 * §8.3 의 확인 절차 **시작 조건**이 "현재 조건 충족 + 개별 지급액 전액 배정 +
 * 해당 판정 공개" 다. 전액 배정이 안 됐으니 양측 확인은 아직 시작하지 않는다 —
 * 그래서 동의 기록도 없고 확인 기간도 없다. 화면에 운영자 동의가 뜨면 안 된다.
 */
function shortfall(view) {
  return Object.freeze({
    ...view,
    criteria: withAiEvidence(view.criteria),

    procedure: Object.freeze({
      ...view.procedure,
      status: 'FUNDING_WAIT',
      // 아직 판정을 공개하지 않았으므로 기한도 없다
      publishedAt: null,
      confirmAt: null,
      deadlineRouteAvailable: false,
    }),

    funding: Object.freeze({
      ...view.funding,
      status: 'WAITING_FUNDS',
      reservedAtoms: '0',
      // §8.2 — A 에게 100 을 배정하고 남은 50 으로는 B 의 100 을 못 채운다.
      // 대기 순서는 버튼 누른 시각이 아니라 판정이 서버에 수락된 순서다.
      queue: Object.freeze({ position: 2, shortfallAtoms: '50000000' }),
    }),

    consent: Object.freeze({
      ...view.consent,
      bothCurrent: false,
      records: Object.freeze([]),
    }),
  });
}

/**
 * 진행 중 — 세 조건은 됐고 HackerRank 인증만 남았다.
 *
 * paid 와 shortfall 은 둘 다 조건이 4/4 다. 그래서 **학생이 뭔가 누를 화면이
 * 하나도 없었다.** 발표에서 "참가자가 직접 인증한다" 를 보여줄 자리가 없다.
 *
 * 여기가 그 자리다. 조건 상세로 들어가면 Reclaim 인증 버튼이 있다.
 */
function inProgress(view) {
  return Object.freeze({
    ...view,
    criteria: Object.freeze(withAiEvidence(view.criteria).map((row) => (
      row.criterionId === 'python-basic-certificate'
        ? Object.freeze({
          ...row,
          state: 'MISSING',
          evidenceId: null,
          evidenceRevision: null,
          reasonCode: 'EVIDENCE_MISSING',
          expiresAt: null,
          // 아직 안 했으니 내역도 비운다. 지어내지 않는다.
          detail: Object.freeze({
            progress: null,
            items: Object.freeze([]),
            facts: Object.freeze([
              Object.freeze({ k: '필요한 인증서', v: 'HackerRank Python (Basic)' }),
              Object.freeze({ k: '확인 방법', v: '본인 계정 로그인 후 Reclaim 공증' }),
            ]),
          }),
        })
        : row
    ))),
    decision: Object.freeze({ ...view.decision, conditionsStatus: 'NOT_MET' }),
    procedure: Object.freeze({
      ...view.procedure,
      status: 'SOURCE_REVERIFICATION_REQUIRED',
      publishedAt: null,
      confirmAt: null,
      deadlineRouteAvailable: false,
    }),
    consent: Object.freeze({ ...view.consent, bothCurrent: false, records: Object.freeze([]) }),
    payment: Object.freeze({
      acceptedRight: null,
      transactionState: null,
      transactionHash: null,
      blockRef: null,
      claimState: null,
      receivedAtoms: null,
      canonicalTransferVerified: null,
      receiptHttpAvailable: false,
    }),
  });
}

/**
 * 미해결 종료 — 조건은 다 채웠는데 이의가 상한 안에 안 풀렸다.
 *
 * 금창섭 멘토 §3 이 화면에서 구분하라고 한 상태다.
 *
 *   "최종 검토자가 없는 구조에서는 조건을 채웠지만 확인이 끝나지 않은 경우가
 *    생기는데, 이를 거절과 같은 상태로 보이게 하면 참가자 입장에서 오해가
 *    생깁니다."
 *
 * 조건 미충족과 **완전히 다른 일**이다. 학생은 할 걸 다 했다.
 */
function unresolved(view) {
  return Object.freeze({
    ...view,
    criteria: withAiEvidence(view.criteria),
    procedure: Object.freeze({
      ...view.procedure,
      status: 'CONTRACT_TERMINATED',
      terminationReason: 'UNRESOLVED_OBJECTION',
      // §8.4 — 수락 전에 끝났으므로 옛 승인은 무효, 예약은 풀린다
      reservationReleased: true,
      deadlineRouteAvailable: false,
    }),
    funding: Object.freeze({
      ...view.funding,
      status: 'RELEASED',
      reservedAtoms: '0',
    }),
    objection: Object.freeze({ blocked: true }),
    payment: Object.freeze({
      acceptedRight: null,
      transactionState: null,
      transactionHash: null,
      blockRef: null,
      claimState: null,
      receivedAtoms: null,
      canonicalTransferVerified: null,
      receiptHttpAvailable: false,
    }),
  });
}

let cache = null;

function build() {
  if (cache) return cache;
  const base = BOOTCAMP_FIXTURES.cases.waitingForOperatorConsent;
  cache = Object.freeze({
    paid: Object.freeze({ participant: paid(base.participant), operator: paid(base.operator) }),
    shortfall: Object.freeze({
      participant: shortfall(base.participant),
      operator: shortfall(base.operator),
    }),
    inProgress: Object.freeze({
      participant: inProgress(base.participant),
      operator: inProgress(base.operator),
    }),
    unresolved: Object.freeze({
      participant: unresolved(base.participant),
      operator: unresolved(base.operator),
    }),
  });
  return cache;
}

/**
 * @param {'paid'|'shortfall'|'inProgress'} caseId
 * @param {'participant'|'operator'} role
 */
export function demoCase(caseId, role) {
  return build()[caseId]?.[role] ?? null;
}
