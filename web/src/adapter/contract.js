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
  // 조건이 지금 어디까지 왔는가. 정책이 아니라 신청에 붙는다 —
  // 정책은 '무엇을 충족해야 하는가' 이고 이쪽은 '이 수강생이 어디까지 왔는가' 다.
  'conditionProgress',
]);

/** 조건 진행 상태. 화면이 아는 것만 받는다 */
const PROGRESS_STATES = Object.freeze([
  'MET', 'UNMET', 'IN_PROGRESS', 'WAITING', 'NEEDS_CHECK', 'UNAVAILABLE',
]);

/**
 * 진행 상황의 모양만 본다.
 *
 * 모르는 상태가 오면 화면이 '아직 확인 안 됨' 으로 떨어뜨려 그린다. 충족한
 * 것을 안 했다고 보여주게 되므로 여기서 먼저 깨뜨린다.
 */
function checkConditionProgress(progress) {
  if (progress === null || typeof progress !== 'object' || Array.isArray(progress)) {
    return ['conditionProgress 가 객체가 아니다'];
  }
  const problems = [];
  for (const [id, entry] of Object.entries(progress)) {
    const at = `conditionProgress.${id}`;
    if (entry === null || typeof entry !== 'object') { problems.push(`${at} 가 객체가 아니다`); continue; }
    if (!PROGRESS_STATES.includes(entry.state)) {
      problems.push(`${at}.state 가 ${PROGRESS_STATES.join('/')} 가 아니다`);
    }
    for (const field of ['value', 'note', 'at']) {
      if (entry[field] !== undefined && typeof entry[field] !== 'string') {
        problems.push(`${at}.${field} 가 문자열이 아니다`);
      }
    }
  }
  return problems;
}

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
// 서버 스키마의 Requirement.kind 와 같은 목록이다(src/policy/mvp/schema.mjs)
const EVIDENCE_KINDS = Object.freeze([
  'EXAM', 'BASELINE', 'LEARNING', 'MOCK_TEST', 'REVIEW', 'BLOG',
]);
/** 그 조건을 어떻게 확인하는가. 화면이 아는 코드만 받는다 — 모르는 코드가
    오면 확인 방법 없이 그려져서 참가자가 할 일을 못 본다 */
const VERIFY_KINDS = Object.freeze([
  'SELF_LOGIN', 'SELF_LOGIN_SHARED', 'AUTO', 'SUBMIT',
]);

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
      if (item.verify !== undefined && item.verify !== null
        && !VERIFY_KINDS.includes(item.verify)) {
        problems.push(`${where}.verify 가 ${VERIFY_KINDS.join('/')} 가 아니다`);
      }
    });
    // 경로마다 금액이 다를 수 있다. 붙어 있으면 산수를 본다.
    if (group.payout) problems.push(...checkPayoutAmounts(group.payout, `${at}.payout`));
  });
  // 경로가 여럿이면 어느 경로인지 알아볼 이름이 있어야 한다.
  if (groups.length > 1) {
    groups.forEach((group, gi) => {
      if (!group?.label) problems.push(`policy.conditionGroups[${gi}].label 이 없다 — 경로가 여럿이다`);
    });
  }
  return problems;
}

/**
 * 받을 금액과 보낼 토큰이 맞는가.
 *
 * 시연은 1 TEST 를 1원으로 둔다. 둘이 어긋나면 화면이 말한 금액과 계약이
 * 보내는 양이 달라지고, 그건 이 제품이 없애려는 바로 그 문제다.
 * 공제 합계가 안 맞는 경우도 같이 본다 — 산수가 틀린 내역을 보여주면
 * 참가자가 실수령을 잘못 안다.
 */
function checkPayoutAmounts(money, where = 'policy.payoutBreakdown') {
  if (!money) return [`${where} 가 없다`];
  const problems = [];
  const { net } = money;
  const gross = money.gross?.amount;
  const sum = (list) => (list ?? []).reduce((acc, x) => acc + (x?.amount ?? 0), 0);
  // 환급금은 공제만 되는 것이 아니다. 응시료처럼 더해지는 항목이 있고
  // 그 가산분에도 세금이 붙는다. 가산을 빼먹으면 산수가 맞지 않는다.
  const added = sum(money.additions);
  const taken = sum(money.deductions);
  if (!Number.isInteger(gross) || !Number.isInteger(net)) {
    return [`${where} 의 금액이 정수가 아니다`];
  }
  if (gross + added - taken !== net) {
    problems.push(`${where} 의 내역이 맞지 않는다 — ${gross} + ${added} − ${taken} ≠ ${net}`);
  }
  // 가산이 없으면 실수령이 표시 금액을 넘을 수 없다. 넘는다면 공제가
  // 음수이거나 내역이 잘못된 것이다.
  if (added === 0 && net > gross) problems.push(`${where} 의 실수령이 표시 금액보다 크다`);
  return problems;
}

/**
 * 한 구간에서 받을 수 있는 가장 큰 실수령.
 *
 * 금액은 구간에 붙기도 하고 경로마다 붙기도 한다. 어느 쪽이든 예치는 그
 * 구간에서 나갈 수 있는 최대 금액을 감당해야 한다.
 */
function tierTopNet(tier) {
  const nets = [
    tier?.payout?.net,
    ...(tier?.groups ?? []).map((group) => group?.payout?.net),
  ].filter(Number.isInteger);
  return nets.length ? Math.max(...nets) : null;
}

/**
 * 1 TEST = 1원 환산이 맞는가.
 *
 * 시연에서 토큰 수량과 원화 금액을 잇는 규칙일 뿐, **얼마를 예치할지를
 * 정하는 검사가 아니다.** 예치율·보관율은 아직 정해지지 않았다.
 */
function checkTokenMatchesNet(net, p, message) {
  if (!Number.isInteger(net)) return [];
  const expected = String(BigInt(net) * 10n ** BigInt(p.tokenDecimals ?? 0));
  return String(p.amount) === expected ? []
    : [`${message} — amount 가 ${expected} 여야 한다`];
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
  // 구간은 판정 때 갈리므로 전부 한 계약 안에 있고, 예치는 그중 가장
  // 높은 경로를 감당해야 한다.
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
        problems.push(...checkConditionGroups(tier.groups).map((m) => m.replace('policy.conditionGroups', `${at}.groups`)));
        // 금액은 구간에 붙거나 경로마다 붙는다. 둘 다 없으면 화면이 그
        // 구간의 금액을 말할 수 없고, 일부 경로에만 있으면 나머지 경로가
        // 금액 없이 그려진다.
        if (tier.payout) {
          problems.push(...checkPayoutAmounts(tier.payout, `${at}.payout`));
        } else if (!(tier.groups ?? []).every((group) => group?.payout)) {
          problems.push(`${at} 에 금액이 없다 — 구간에 payout 이 있거나 모든 경로에 있어야 한다`);
        }
      });
      // 구간 순서가 뒤집히면 어느 구간이 더 높은지 화면이 잘못 말한다.
      // 비교 기준은 그 구간에서 나갈 수 있는 최대 금액이다.
      for (let i = 1; i < tiers.length; i += 1) {
        const prev = tierTopNet(tiers[i - 1]), now = tierTopNet(tiers[i]);
        if (Number.isInteger(prev) && Number.isInteger(now) && now <= prev) {
          problems.push(`구간이 오름차순이 아니다 — ${tiers[i].rate} 가 ${tiers[i - 1].rate} 보다 크지 않다`);
        }
      }
      // 예치액을 여기서 강제하지 않는다.
      //
      // 전에는 '가장 높은 구간의 실수령과 같아야 한다' 고 막았는데, 그것은
      // 예치율을 화면이 정하는 것이었다. 얼마를 미리 확보할지는 아직
      // 정해지지 않았고(OPEN), 400% 를 뺀다고 곧바로 300% 전액 예치로
      // 확정되는 것도 아니다.
      //
      // 약정 금액 · 확보된 재원 · 신청별 배정액 · 지급 가능 여부는 서로
      // 다른 값이다. 서버가 주는 것을 그대로 보여주고, 받지 못한 것은
      // '확인 전' 이라고 적는다.
    }
  }
  if ('payoutBreakdown' in p) {
    problems.push(...checkPayoutAmounts(p.payoutBreakdown));
    problems.push(...checkTokenMatchesNet(p.payoutBreakdown.net, p, '실수령과 토큰 수량의 환산이 맞지 않는다'));
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

  if ('conditionProgress' in view) problems.push(...checkConditionProgress(view.conditionProgress));

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

// ── 운영자 검토 (F3) ───────────────────────────────────────────────────────
//
// src/ai-policy/field-review.mjs 의 reviewFields() 출력에 맞춘다.
// 화면이 여기서 기대하는 것은 하나다 — **AI 가 못 뽑은 값은 비어 있어야 한다.**
// 보류된 값이 채워진 채로 오면 운영자가 확인 없이 승인하게 되고, 그게 이
// 제품이 없애려는 문제다.

const FIELD_STATES = Object.freeze(['OBSERVED', 'HELD', 'UNOBSERVED']);

/** 보류 사유 표기. field-review.mjs 가 'QUESTION:0'·'FLAG:0'·'NO_VALUE' 로 적는다 */
const isReason = (value) =>
  typeof value === 'string' && /^(QUESTION|FLAG):\d+$/.test(value) === false
    ? value === 'NO_VALUE'
    : typeof value === 'string';

export function checkReviewView(view) {
  const problems = [];
  if (view === null || typeof view !== 'object') return ['검토가 객체가 아니다'];

  for (const field of ['version', 'reviewId', 'title', 'blocks', 'fields', 'questions', 'flags', 'provenance', 'status', 'publishable']) {
    if (!(field in view)) problems.push(`${field} 가 빠졌다`);
  }
  // 승인 전에는 게시할 수 없다. 화면이 이 값을 바꿔 읽지 않는다.
  if (view.publishable !== false) problems.push('publishable 이 false 가 아니다');
  if (!['NEEDS_REVIEW', 'OBSERVED_ONLY'].includes(view.status)) {
    problems.push(`status 가 ${view.status} 다`);
  }

  const locators = new Set((view.blocks ?? []).map((block) => block?.locator));
  if (!Array.isArray(view.blocks) || view.blocks.length === 0) problems.push('blocks 가 비었다');
  (view.blocks ?? []).forEach((block, i) => {
    for (const key of ['locator', 'text']) {
      if (typeof block?.[key] !== 'string' || block[key] === '') problems.push(`blocks[${i}].${key} 가 없다`);
    }
  });

  if (!Array.isArray(view.fields) || view.fields.length === 0) problems.push('fields 가 비었다');
  const seen = new Set();
  (view.fields ?? []).forEach((field, i) => {
    const at = `fields[${i}]`;
    if (field === null || typeof field !== 'object') { problems.push(`${at} 가 객체가 아니다`); return; }
    for (const key of ['fieldId', 'label']) {
      if (typeof field[key] !== 'string' || field[key] === '') problems.push(`${at}.${key} 가 없다`);
    }
    if (seen.has(field.fieldId)) problems.push(`${at}.fieldId 가 중복이다`);
    seen.add(field.fieldId);
    if (!FIELD_STATES.includes(field.state)) problems.push(`${at}.state 가 ${FIELD_STATES.join('/')} 가 아니다`);
    if (field.value !== null && typeof field.value !== 'string') problems.push(`${at}.value 가 문자열도 null 도 아니다`);
    // 여기가 요지다. 보류·미관측인데 값이 들어 있으면 운영자가 확인 없이
    // 승인하게 된다.
    if (field.state !== 'OBSERVED' && field.value !== null) {
      problems.push(`${at} 는 ${field.state} 인데 값이 들어 있다 — 보류된 값은 비어 있어야 한다`);
    }
    if (field.state === 'OBSERVED' && field.value === null) {
      problems.push(`${at} 는 OBSERVED 인데 값이 없다`);
    }
    // 값이 있으면 안내문 어디서 나왔는지 가리켜야 한다. 멘토가 평가지표로
    // 꼽은 '원문 인용 위치 매핑' 이 이것이다.
    if (field.value !== null && !locators.has(field.location)) {
      problems.push(`${at}.location 이 blocks 에 없다 — 값이 어디서 왔는지 가리키지 못한다`);
    }
    if (!Array.isArray(field.reasons)) problems.push(`${at}.reasons 가 배열이 아니다`);
    if (field.state === 'OBSERVED' && (field.reasons ?? []).length > 0) {
      problems.push(`${at} 는 OBSERVED 인데 보류 사유가 있다`);
    }
    if (field.state !== 'OBSERVED' && (field.reasons ?? []).length === 0) {
      problems.push(`${at} 는 ${field.state} 인데 사유가 없다`);
    }
    (field.reasons ?? []).forEach((reason, ri) => {
      if (!isReason(reason)) problems.push(`${at}.reasons[${ri}] 모양이 아니다`);
    });
  });

  const ids = new Set(seen);
  (view.questions ?? []).forEach((question, i) => {
    const at = `questions[${i}]`;
    for (const key of ['questionId', 'text']) {
      if (typeof question?.[key] !== 'string' || question[key] === '') problems.push(`${at}.${key} 가 없다`);
    }
    if (!Array.isArray(question?.fieldIds) || question.fieldIds.length === 0) {
      problems.push(`${at}.fieldIds 가 비었다`);
    }
    for (const id of question?.fieldIds ?? []) {
      if (!ids.has(id)) problems.push(`${at} 가 없는 값 ${id} 를 가리킨다`);
    }
  });

  (view.flags ?? []).forEach((flag, i) => {
    if (typeof flag?.code !== 'string' || flag.code === '') problems.push(`flags[${i}].code 가 없다`);
    for (const id of flag?.fieldIds ?? []) {
      if (!ids.has(id)) problems.push(`flags[${i}] 가 없는 값 ${id} 를 가리킨다`);
    }
  });

  // AI 가 관측한 값은 보류되어도 버리지 않는다. 운영자가 판단할 재료다.
  const observed = new Set((view.provenance ?? []).map((row) => row?.fieldId));
  for (const id of ids) {
    if (!observed.has(id)) problems.push(`provenance 에 ${id} 가 없다 — 관측 기록이 빠졌다`);
  }

  // 보류가 하나라도 있으면 검토가 필요하다고 말해야 한다.
  const held = (view.fields ?? []).some((field) => field?.state !== 'OBSERVED');
  if (held && view.status !== 'NEEDS_REVIEW') problems.push('보류된 값이 있는데 status 가 NEEDS_REVIEW 가 아니다');

  return problems;
}
