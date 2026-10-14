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

// src/policy/compiler.mjs 의 compileSyntheticPolicy 가 내보내는 모양.
// 화면은 이 중 조건에 해당하는 값만 읽는다.
export const POLICY_FIELDS = Object.freeze([
  'schemaVersion', 'cohortId', 'policyVersion', 'dataMode', 'examType',
  'minScore', 'minCompletionBps', 'examDateStart', 'examDateEnd',
  'learningStart', 'learningEnd', 'requiredLectureIds', 'completionRuleVersion',
  'enrollmentStart', 'enrollmentUntil', 'normalSubmitFrom', 'normalSubmitAt',
  'amount', 'tokenDecimals', 'sourcePolicySetHash', 'privacyNoticeVersion',
  // 컴파일러가 normalSubmitAt 에서 파생한다 (+3일, +10일)
  'supplementEndAt', 'claimUntil',
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
/** 조건을 무엇으로 확인하는가. 경로마다 필요 자료가 달라지는 것이 요지다 */
const EVIDENCE_KINDS = Object.freeze(['EXAM', 'LEARNING', 'DOCUMENT']);

/**
 * 조건 그룹의 모양만 본다.
 *
 * 빈 그룹이나 빈 조건을 통과시키면 화면이 '충족할 것이 없는 경로'를 그리고,
 * 참가자는 아무것도 안 해도 되는 것처럼 읽는다.
 */
function checkConditionGroups(groups) {
  const problems = [];
  if (!Array.isArray(groups) || groups.length === 0) {
    return ['policy.conditionGroups 가 비었다'];
  }
  const seen = new Set();
  groups.forEach((group, gi) => {
    const at = `policy.conditionGroups[${gi}]`;
    if (group === null || typeof group !== 'object') { problems.push(`${at} 가 객체가 아니다`); return; }
    if (typeof group.id !== 'string' || group.id === '') problems.push(`${at}.id 가 없다`);
    if (seen.has(group.id)) problems.push(`${at}.id 가 중복이다`);
    seen.add(group.id);
    if (!Array.isArray(group.items) || group.items.length === 0) {
      problems.push(`${at}.items 가 비었다`);
      return;
    }
    group.items.forEach((item, ii) => {
      const where = `${at}.items[${ii}]`;
      if (item === null || typeof item !== 'object') { problems.push(`${where} 가 객체가 아니다`); return; }
      for (const field of ['label', 'value']) {
        if (typeof item[field] !== 'string' || item[field] === '') problems.push(`${where}.${field} 가 없다`);
      }
      if (item.evidence !== undefined && item.evidence !== null
        && !EVIDENCE_KINDS.includes(item.evidence)) {
        problems.push(`${where}.evidence 가 ${EVIDENCE_KINDS.join('/')} 가 아니다`);
      }
    });
  });
  // 경로가 여럿이면 어느 경로인지 알아볼 이름이 있어야 한다.
  if (groups.length > 1) {
    groups.forEach((group, gi) => {
      if (!group?.label) problems.push(`policy.conditionGroups[${gi}].label 이 없다 — 경로가 여럿이다`);
    });
  }
  return problems;
}

export function checkPolicyView(compiled) {
  const problems = [];
  if (compiled === null || typeof compiled !== 'object') return ['정책이 객체가 아니다'];

  for (const field of ['compilerVersion', 'policy', 'policyHash', 'requiredLectureIdsHash', 'publishable']) {
    if (!(field in compiled)) problems.push(`${field} 가 빠졌다`);
  }
  if (!isHash32(compiled.policyHash)) problems.push('policyHash 형식이 아니다');
  // 이 단계의 정책은 게시 가능하지 않다. 화면 편의로 바꾸지 않는다.
  if (compiled.publishable !== false) problems.push('publishable 이 false 가 아니다');

  const p = compiled.policy;
  if (p === null || typeof p !== 'object') return [...problems, 'policy 가 객체가 아니다'];
  for (const field of POLICY_FIELDS) {
    if (!(field in p)) problems.push(`policy.${field} 가 빠졌다`);
  }
  if (p.dataMode !== 'SYNTHETIC') problems.push('policy.dataMode 가 SYNTHETIC 이 아니다');
  if (p.schemaVersion !== 4) problems.push('policy.schemaVersion 이 4 가 아니다');
  if (p.examType !== 'TOEIC_LR') problems.push('policy.examType 이 TOEIC_LR 이 아니다');
  if (!Array.isArray(p.requiredLectureIds) || p.requiredLectureIds.length === 0) {
    problems.push('policy.requiredLectureIds 가 비었다');
  }
  // 금액은 문자열이다. 부동소수점으로 다루지 않는다.
  if (typeof p.amount !== 'string') problems.push('policy.amount 가 문자열이 아니다');

  // conditionGroups 는 선택 필드다. 그룹 안은 AND, 그룹끼리는 OR 이고,
  // 반마다 환급받는 길이 여럿일 수 있어서 둔다. 없으면 기존처럼 동작한다.
  // 있으면 모양만 본다 — 내용(값·문구)은 정책이 정하고 화면은 그대로 그린다.
  if ('conditionGroups' in p) problems.push(...checkConditionGroups(p.conditionGroups));

  // conditionTiers 도 선택 필드다. 환급률 구간이 여럿인 반에서 쓴다.
  // 집행하는 구간이 정확히 하나여야 한다 — 정책의 amount 가 하나뿐이라
  // 집행 구간이 둘이면 어느 금액을 지급하는지 화면이 말할 수 없다.
  if ('conditionTiers' in p) {
    const tiers = p.conditionTiers;
    if (!Array.isArray(tiers) || tiers.length === 0) {
      problems.push('policy.conditionTiers 가 비었다');
    } else {
      const ids = new Set();
      tiers.forEach((tier, ti) => {
        const at = `policy.conditionTiers[${ti}]`;
        if (tier === null || typeof tier !== 'object') { problems.push(`${at} 가 객체가 아니다`); return; }
        if (typeof tier.id !== 'string' || tier.id === '') problems.push(`${at}.id 가 없다`);
        if (ids.has(tier.id)) problems.push(`${at}.id 가 중복이다`);
        ids.add(tier.id);
        if (typeof tier.rate !== 'string' || tier.rate === '') problems.push(`${at}.rate 가 없다`);
        if (typeof tier.supported !== 'boolean') problems.push(`${at}.supported 가 boolean 이 아니다`);
        problems.push(...checkConditionGroups(tier.groups).map((m) => m.replace('policy.conditionGroups', `${at}.groups`)));
      });
      const supported = tiers.filter((t) => t?.supported === true).length;
      if (supported !== 1) problems.push(`집행하는 구간이 ${supported}개다 — 정확히 하나여야 한다`);
    }
  }

  // 컴파일러가 강제하는 기간 순서를 화면에서도 확인한다
  const n = (v) => BigInt(v);
  if (p.examDateStart > p.examDateEnd) problems.push('시험 인정 기간의 시작이 종료보다 늦다');
  if (n(p.learningEnd) > n(p.normalSubmitAt)) problems.push('학습 종료가 정상 제출 마감보다 늦다');
  if (n(p.enrollmentUntil) > n(p.normalSubmitAt)) problems.push('등록 마감이 정상 제출 마감보다 늦다');
  if (n(p.supplementEndAt) !== n(p.normalSubmitAt) + 259200n) problems.push('보완 종료가 제출 마감 +3일이 아니다');
  if (n(p.claimUntil) !== n(p.normalSubmitAt) + 864000n) problems.push('최종 청구가 제출 마감 +10일이 아니다');
  return problems;
}

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
