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
  empty: { label: '신청 없음', items: [], delayMs: 200 },
  slow: { label: '느린 응답', items: [AT_ENROLLED], delayMs: 2400 },
  authError: { label: '로그인 필요', items: [AT_ENROLLED], delayMs: 200, failWith: 'AUTH_REQUIRED' },
  apiError: { label: '요청 실패', items: [AT_ENROLLED], delayMs: 200, failWith: 'API_REQUEST_FAILED' },
});

export const DEFAULT_SCENARIO = 'stage1';
