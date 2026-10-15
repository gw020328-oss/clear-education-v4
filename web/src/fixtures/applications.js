// 합성 신청 fixture
//
// docs/current/API_CONTRACT.ko.md 의 기본 view 필드와 최종 동의 후 추가 필드를
// 그대로 따른다.
//
// 참가자는 '한 반에 신청 하나'다. 계약의 enrollments 가 applicationId 당 한 번만
// 등록되게 막고, 서버도 같은 정책에 중복 신청을 만들지 않는다. 그래서 목록에
// 서로 다른 지갑 다섯 건을 늘어놓지 않는다. 같은 신청이 다섯 단계를 거치는 것을
// 시나리오로 바꿔 보여준다.
//
// 값은 모두 눈에 보이게 합성이다. 실제 지갑·거래·성적·개인정보를 넣지 않는다.

const hash = (tag) => '0x' + tag.repeat(32).slice(0, 64);

const LEARNER = '0x' + '7a'.repeat(20);
const APPLICATION_ID = hash('31');
const POLICY_HASH = hash('a1');
/** 선택 경로가 있는 반. fixtures/policy.js 의 ALTERNATIVE_POLICY 와 같은 값 */
const ALT_POLICY_HASH = hash('b2');
/** YBM 750+ 환급코스. fixtures/policy.js 의 YBM_POLICY 와 같은 값 */
const YBM_POLICY_HASH = hash('c3');

/** APPLICATION_ONLY 단계 공통 */
const base = (state, extra = {}) => ({
  applicationId: APPLICATION_ID,
  learner: LEARNER,
  policyHash: POLICY_HASH,
  state,
  consentDigest: null,
  createdAt: '1788224400',
  consentedAt: null,
  consentScope: 'APPLICATION_ONLY',
  contractConsentRequired: true,
  funded: false,
  paymentAllowed: false,
  dataMode: 'SYNTHETIC',
  ...extra,
});

/** 최종 동의 이후 — scope 가 CONTRACT 로 바뀌고 세 필드가 붙는다 */
const contractScope = (extra = {}) => ({
  consentScope: 'CONTRACT',
  contractConsentRequired: false,
  finalConsentDigest: hash('f1'),
  runtimeConfigHash: hash('c4'),
  fundingEvidence: null,
  ...extra,
});

const AT_DRAFT = base('DRAFT');

const AT_TERMS = base('TERMS_ACCEPTED', {
  consentDigest: hash('d2'),
  consentedAt: '1788228000',
});

const AT_CONSENTED = base('CONSENTED', {
  consentDigest: hash('d2'),
  consentedAt: '1788228000',
  ...contractScope(),
});

const AT_FUNDING = base('FUNDING_PENDING', {
  consentDigest: hash('d2'),
  consentedAt: '1788228000',
  ...contractScope(),
});

const AT_ENROLLED = base('ENROLLED', {
  consentDigest: hash('d2'),
  consentedAt: '1788228000',
  ...contractScope({
    funded: true,
    fundingEvidence: {
      transactionHash: hash('e5'),
      blockNumber: '482915',
      blockHash: hash('b5'),
    },
  }),
});

/**
 * 조건이 지금 어디까지 왔는가.
 *
 * 정책이 '무엇을 충족해야 하는가' 라면 이쪽은 '이 수강생이 어디까지 왔는가' 다.
 * 조건 id 로 맞춘다. 같은 id 가 여러 구간에 나오면 한 번에 다 채워진다 —
 * 출석 100일은 한 번 해내면 200%·300%·400% 어디에나 걸리는 하나의 사실이다.
 *
 * 화면은 이 값을 만들지 않는다. 서버가 판정해서 준 것만 그린다.
 */

// YBM — 수강 중. 출석이 쌓이는 중이고 시험은 아직이다.
const YBM_PROGRESS = Object.freeze({
  attend90: Object.freeze({
    state: 'IN_PROGRESS', value: '87일 / 90일',
    note: '3일 남았습니다. 하루라도 빠지면 수료 조건을 채우지 못합니다.',
  }),
  mock1: Object.freeze({ state: 'MET', value: '1회 응시', at: '1793404800' }),
  exam750: Object.freeze({
    state: 'WAITING',
    note: '수강종료 후 응시한 성적을 본인 계정으로 불러오면 확인됩니다.',
  }),
  review: Object.freeze({ state: 'WAITING' }),
});

// 시원스쿨 — 수강이 끝나고 성적이 들어왔다. 780점이라 750은 넘고 850은 못 넘는다.
// 같은 점수 하나가 구간마다 다르게 걸리는 것을 보여주는 자리다.
const ALT_PROGRESS = Object.freeze({
  attend100: Object.freeze({ state: 'MET', value: '100일 / 100일', at: '1795564800' }),
  exam750: Object.freeze({ state: 'MET', value: '780점', at: '1795392000' }),
  exam850: Object.freeze({ state: 'UNMET', value: '780점', note: '850점에 70점 모자랍니다.' }),
  exam990: Object.freeze({ state: 'UNMET', value: '780점' }),
  examBelow: Object.freeze({
    state: 'UNMET', value: '780점',
    note: '목표 점수를 넘겨서 이 구간에는 해당하지 않습니다.',
  }),
  history2y: Object.freeze({ state: 'MET', value: '2년 내 750점 이상 없음', at: '1795392000' }),
  review: Object.freeze({ state: 'MET', value: '412byte', at: '1795651200' }),
  challenge14: Object.freeze({
    state: 'UNMET', value: '9회 / 14회',
    note: '연속 포스팅이 끊겨 처음부터 다시 세어야 합니다.',
  }),
});

/** 다섯 단계를 한 번에 보고 싶을 때만 쓰는 검토용 묶음 */
export const SYNTHETIC_APPLICATIONS = Object.freeze([
  AT_DRAFT, AT_TERMS, AT_CONSENTED, AT_FUNDING, AT_ENROLLED,
]);

export const DEMO_APPLICATION_ID = APPLICATION_ID;

/** 화면 상황 — 주소창 ?scenario= 또는 화면 위 선택 상자로 바꾼다 */
export const SCENARIOS = Object.freeze({
  stage1: { label: '1단계 — 신청 생성 (내 차례)', items: [AT_DRAFT], delayMs: 200, runtimeReady: false },
  stage2: { label: '2단계 — 조건 동의 (금고 연결 전)', items: [AT_TERMS], delayMs: 200, runtimeReady: false },
  stage2r: { label: '2단계 — 금고 연결됨 (내 차례)', items: [AT_TERMS], delayMs: 200, runtimeReady: true },
  stage3: { label: '3단계 — 최종 동의 저장', items: [AT_CONSENTED], delayMs: 200, runtimeReady: true },
  stage4: { label: '4단계 — 예치 준비', items: [AT_FUNDING], delayMs: 200, runtimeReady: true },
  stage5: { label: '5단계 — 예치 확인 (완료)', items: [AT_ENROLLED], delayMs: 200, runtimeReady: true },
  // 같은 화면에 다른 반의 정책을 넣어 본다. 화면 코드는 그대로고 정책만
  // 바뀐다 — 조건의 개수도 종류도 묶이는 방식도 반이 정한다.
  //
  // 두 반 다 실제 안내문에서 가져온 값이다. 시원스쿨은 환급률 구간이 다섯이고
  // 100% 는 경로가 둘이다. YBM 은 환급률이 하나고 조건 넷이 전부 AND 다.
  ybm: {
    label: 'YBM 750+ 환급코스',
    items: [{ ...AT_CONSENTED, policyHash: YBM_POLICY_HASH }],
    delayMs: 200,
    runtimeReady: true,
  },
  altPath: {
    label: '시원스쿨 시작이반 750점반',
    items: [{ ...AT_CONSENTED, policyHash: ALT_POLICY_HASH }],
    delayMs: 200,
    runtimeReady: true,
  },
  // 예치가 끝나고 조건이 쌓이는 중. 조건마다 확인 방법이 다른 것이
  // 실제로 어떻게 보이는지는 여기서만 보인다.
  ybmProgress: {
    label: 'YBM 750+ 환급코스 — 수강 중',
    items: [{ ...AT_ENROLLED, policyHash: YBM_POLICY_HASH, conditionProgress: YBM_PROGRESS }],
    delayMs: 200,
    runtimeReady: true,
  },
  // 성적 하나가 구간마다 다르게 걸린다 — 780점은 750을 넘고 850은 못 넘는다.
  altProgress: {
    label: '시원스쿨 시작이반 750점반 — 성적 확인됨',
    items: [{ ...AT_ENROLLED, policyHash: ALT_POLICY_HASH, conditionProgress: ALT_PROGRESS }],
    delayMs: 200,
    runtimeReady: true,
  },
  empty: { label: '신청 없음', items: [], delayMs: 200 },
  slow: { label: '느린 응답', items: [AT_ENROLLED], delayMs: 2400 },
  authError: { label: '로그인 필요', items: [AT_ENROLLED], delayMs: 200, failWith: 'AUTH_REQUIRED' },
  apiError: { label: '요청 실패', items: [AT_ENROLLED], delayMs: 200, failWith: 'API_REQUEST_FAILED' },
});

// 기본은 YBM 반의 3단계다. 앞뒤 단계가 모두 보이고, 실제 안내문에서 온
// 반이라 화면이 지어낸 값을 보여주지 않는다.
// 다른 상황은 주소의 ?scenario= 로 본다 — README 의 표를 참고한다.
export const DEFAULT_SCENARIO = 'ybm';
