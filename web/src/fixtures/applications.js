// 합성 신청 fixture
//
// docs/current/API_CONTRACT.ko.md 의 기본 view 필드와 최종 동의 후 추가 필드를
// 그대로 따른다. 다섯 상태를 각각 하나씩 둔다.
//
// 값은 모두 눈에 보이게 합성이다. 실제 지갑·거래·성적·개인정보를 넣지 않는다.
// 주소와 해시는 반복 패턴으로 만들어 실제 값과 혼동되지 않게 한다.

const hash = (tag) => '0x' + tag.repeat(32).slice(0, 64);
const wallet = (tag) => '0x' + tag.repeat(40).slice(0, 40);

const POLICY_HASH = hash('a1');

/** 공통 기본값 — APPLICATION_ONLY 단계 */
const base = (id, state, extra = {}) => ({
  applicationId: hash(id),
  learner: wallet(id),
  policyHash: POLICY_HASH,
  state,
  consentDigest: null,
  createdAt: '1762000000',
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

export const SYNTHETIC_APPLICATIONS = Object.freeze([
  base('11', 'DRAFT'),

  base('22', 'TERMS_ACCEPTED', {
    consentDigest: hash('d2'),
    consentedAt: '1762003600',
  }),

  base('33', 'CONSENTED', {
    consentDigest: hash('d3'),
    consentedAt: '1762007200',
    ...contractScope(),
  }),

  base('44', 'FUNDING_PENDING', {
    consentDigest: hash('d4'),
    consentedAt: '1762010800',
    ...contractScope(),
  }),

  base('55', 'ENROLLED', {
    consentDigest: hash('d5'),
    consentedAt: '1762014400',
    ...contractScope({
      funded: true,
      fundingEvidence: {
        transactionHash: hash('e5'),
        blockNumber: '1234',
        blockHash: hash('b5'),
      },
    }),
  }),
]);

/** 화면 시나리오 — 주소창에서 바꿔 끼운다 */
export const SCENARIOS = Object.freeze({
  default: { label: '다섯 상태', items: SYNTHETIC_APPLICATIONS, delayMs: 220 },
  empty: { label: '빈 목록', items: [], delayMs: 220 },
  slow: { label: '느린 응답', items: SYNTHETIC_APPLICATIONS, delayMs: 2400 },
  authError: { label: '로그인 필요', items: SYNTHETIC_APPLICATIONS, delayMs: 220, failWith: 'AUTH_REQUIRED' },
  apiError: { label: '요청 실패', items: SYNTHETIC_APPLICATIONS, delayMs: 220, failWith: 'API_REQUEST_FAILED' },
});

export const DEFAULT_SCENARIO = 'default';
