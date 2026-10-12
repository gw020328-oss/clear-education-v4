// 신청 데이터 어댑터 계약
//
// 화면은 이 인터페이스만 사용한다. 합성 어댑터와 후속 실제 HTTP 어댑터(F1)가
// 같은 모양을 지키므로 화면을 고치지 않고 교체할 수 있다.
//
//   listApplications() -> Promise<ApplicationView[]>
//   getApplication(id) -> Promise<ApplicationView>
//   describe()         -> { mode, label, note }
//
// 오류는 Error 로 던지고 code 는 아래 ADAPTER_ERROR 둘로 한정한다.
// src/application/wallet-client.mjs 의 createSameOriginApi 가 401 을
// AUTH_REQUIRED, 나머지를 API_REQUEST_FAILED 로 축약하므로 화면도 그 둘만 다룬다.
// 서버 본문·URL·지갑 오류 문구를 화면으로 전달하지 않는다.

export const ADAPTER_ERROR = Object.freeze({
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  API_REQUEST_FAILED: 'API_REQUEST_FAILED',
});

export class AdapterError extends Error {
  constructor(code) {
    super(code);
    this.name = 'AdapterError';
    this.code = ADAPTER_ERROR[code] ?? ADAPTER_ERROR.API_REQUEST_FAILED;
  }
}

// docs/current/API_CONTRACT.ko.md 의 기본 view 필드.
// 최종 동의 후에만 붙는 필드는 OPTIONAL_VIEW_FIELDS 에 둔다.
export const BASE_VIEW_FIELDS = Object.freeze([
  'applicationId', 'learner', 'policyHash', 'state', 'consentDigest',
  'createdAt', 'consentedAt', 'consentScope', 'contractConsentRequired',
  'funded', 'paymentAllowed', 'dataMode',
]);

export const OPTIONAL_VIEW_FIELDS = Object.freeze([
  'finalConsentDigest', 'runtimeConfigHash', 'fundingEvidence',
]);

export const APPLICATION_STATES = Object.freeze([
  'DRAFT', 'TERMS_ACCEPTED', 'CONSENTED', 'FUNDING_PENDING', 'ENROLLED',
]);

/** 0x + 소문자 hex 64자리 — 정책 해시·신청 ID 형식 */
export const isHash32 = (value) => typeof value === 'string' && /^0x[0-9a-f]{64}$/.test(value);
/** 0x + hex 40자리 — 지갑 주소 */
export const isAddress = (value) => typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value);

/**
 * 어댑터가 돌려준 view 가 계약과 맞는지 본다.
 * 화면이 없는 필드를 추측하거나 미래 상태를 만들어 쓰지 않도록 여기서 먼저 막는다.
 * @returns {string[]} 문제 목록. 빈 배열이면 통과
 */
export function checkApplicationView(view) {
  const problems = [];
  if (view === null || typeof view !== 'object') return ['view 가 객체가 아니다'];

  for (const field of BASE_VIEW_FIELDS) {
    if (!(field in view)) problems.push(`${field} 가 빠졌다`);
  }
  for (const key of Object.keys(view)) {
    if (!BASE_VIEW_FIELDS.includes(key) && !OPTIONAL_VIEW_FIELDS.includes(key)) {
      problems.push(`${key} 는 계약에 없는 필드다`);
    }
  }

  if (!isHash32(view.applicationId)) problems.push('applicationId 형식이 0x+소문자 hex 64자리가 아니다');
  if (!isHash32(view.policyHash)) problems.push('policyHash 형식이 0x+소문자 hex 64자리가 아니다');
  if (!isAddress(view.learner)) problems.push('learner 가 지갑 주소 형식이 아니다');
  if (!APPLICATION_STATES.includes(view.state)) problems.push(`state 가 ${view.state} 다`);

  // 시각은 문자열이다 (service.mjs 가 String() 으로 내보낸다)
  if (typeof view.createdAt !== 'string') problems.push('createdAt 이 문자열이 아니다');
  if (view.consentedAt !== null && typeof view.consentedAt !== 'string') {
    problems.push('consentedAt 이 null 도 문자열도 아니다');
  }

  // 지급은 이 단계에서 항상 막혀 있다. 화면 편의로 풀지 않는다.
  if (view.paymentAllowed !== false) problems.push('paymentAllowed 가 false 가 아니다');
  if (view.dataMode !== 'SYNTHETIC') problems.push('dataMode 가 SYNTHETIC 이 아니다');

  // funded 는 확인된 ENROLLED 에서만 true
  if (view.funded === true && view.state !== 'ENROLLED') {
    problems.push('ENROLLED 가 아닌데 funded 가 true 다');
  }

  if ('fundingEvidence' in view && view.fundingEvidence !== null) {
    const e = view.fundingEvidence;
    if (e === null || typeof e !== 'object') problems.push('fundingEvidence 가 객체가 아니다');
    else {
      for (const field of ['transactionHash', 'blockNumber', 'blockHash']) {
        if (!(field in e)) problems.push(`fundingEvidence.${field} 가 빠졌다`);
      }
      if (typeof e.blockNumber !== 'string') problems.push('fundingEvidence.blockNumber 가 문자열이 아니다');
    }
  }

  if (view.consentScope === 'CONTRACT' && view.contractConsentRequired !== false) {
    problems.push('consentScope 가 CONTRACT 인데 contractConsentRequired 가 false 가 아니다');
  }
  if (view.consentScope === 'APPLICATION_ONLY' && view.contractConsentRequired !== true) {
    problems.push('consentScope 가 APPLICATION_ONLY 인데 contractConsentRequired 가 true 가 아니다');
  }
  return problems;
}
