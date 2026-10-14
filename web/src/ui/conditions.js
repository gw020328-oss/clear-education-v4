// 정책 → 화면이 그릴 조건 목록
//
// 왜 변환 층을 두는가.
//
// 화면이 policy.minScore 와 policy.minCompletionBps 를 직접 읽어 '시험'·'이수'
// 두 줄을 그리고 있었다. 반이 하나이고 조건이 늘 둘일 때만 맞는 구조다.
//
// 지금 목표는 안내문을 넣으면 그 반에 맞는 조건이 나오는 공통 모듈이다.
// 반마다 조건의 개수도, 종류도, 묶이는 방식도 다르다.
//
//   YBM 750+        출석 AND 모의시험 AND 성적 AND 후기
//   시원스쿨 750점반  (출석 AND 후기) 또는 (성적 AND 과거 이력 AND 후기)
//
// 그래서 화면은 '조건 목록'만 알고, 정책을 그 목록으로 바꾸는 일은 여기서 한다.
// 정책 스키마가 조건 목록을 직접 주게 되면 이 파일의 변환만 바꾸면 된다.
//
// 지금 변환은 현재 컴파일러가 내보내는 모양(minScore AND minCompletionBps)만
// 다룬다. 서버가 주지 않는 조건을 화면이 지어내지 않는다.

import { bpsText, amountText, seoulText } from './policy-view.js';

/** 조건 하나가 어떤 자료로 확인되는가. 경로마다 필요 자료가 다른 것이 요지다 */
export const EVIDENCE = Object.freeze({
  EXAM: '성적 증명',
  LEARNING: '학습 기록',
  DOCUMENT: '제출 서류',
  NONE: null,
});

/**
 * 컴파일된 정책을 화면이 그릴 모양으로 바꾼다.
 *
 * groups 가 둘 이상이면 그중 하나만 충족하면 되는 선택 경로다.
 * 현재 컴파일러는 경로 개념이 없으므로 언제나 한 그룹이다.
 *
 * @param {object} compiled  checkPolicyView 를 통과한 정책
 * @returns {{groups: object[], payout: object}}
 */
const groupsOf = (groups) => (groups ?? []).map((group) => ({
  id: group.id,
  label: group.label ?? null,
  items: (group.items ?? []).map((item) => ({
    ...item,
    evidence: EVIDENCE[item.evidence] ?? null,
  })),
}));

export function conditionsFrom(compiled) {
  const p = compiled.policy;

  // 환급률 구간이 여럿인 반. 구간마다 조건이 다르고, 수강생은 계약 시점에
  // 어느 구간으로 갈지 고르지 않는다. 하다 보니 채워지는 구간으로 간다.
  // 그래서 구간은 '고르는 것'이 아니라 '읽는 것'으로 그린다.
  //
  // 안내문에 있는 구간을 전부 싣되, CLEAR 가 집행하는 구간을 표시한다.
  // 숨기면 참가자가 원래 그 구간뿐인 줄 안다. 집행하지 않는 구간은
  // 금액을 적지 않는다 — 정책의 amount 는 집행 구간의 값 하나뿐이다.
  if (Array.isArray(p.conditionTiers) && p.conditionTiers.length > 0) {
    return {
      tiers: p.conditionTiers.map((tier) => ({
        id: tier.id,
        rate: tier.rate,
        note: tier.note ?? null,
        supported: tier.supported === true,
        groups: groupsOf(tier.groups),
        payout: tier.supported === true ? payoutFrom(p, tier) : null,
      })),
      groups: groupsOf(p.conditionTiers.find((t) => t.supported)?.groups),
      payout: payoutFrom(p),
    };
  }

  // 정책이 조건 그룹을 직접 주면 그대로 쓴다. 그룹 안은 AND, 그룹끼리는 OR 다.
  // 주지 않으면 아래에서 기존 필드로 한 그룹을 만든다.
  if (Array.isArray(p.conditionGroups) && p.conditionGroups.length > 0) {
    return { tiers: null, groups: groupsOf(p.conditionGroups), payout: payoutFrom(p) };
  }

  const items = [];
  if (p.minScore !== undefined) {
    items.push({
      kind: 'EXAM',
      label: '시험',
      value: `${p.minScore}점`,
      tail: '이상',
      detail: `${p.examType} 총점 · 응시 인정 기간 ${p.examDateStart} ~ ${p.examDateEnd} (응시일 기준)`,
      evidence: EVIDENCE.EXAM,
    });
  }
  if (p.minCompletionBps !== undefined) {
    items.push({
      kind: 'LEARNING',
      label: '이수',
      value: bpsText(p.minCompletionBps),
      tail: '이상 완료',
      detail: `필수 강의 ${p.requiredLectureIds.length}개 기준 · `
        + `인정 기간 ${seoulText(p.learningStart)} ~ ${seoulText(p.learningEnd)}`,
      evidence: EVIDENCE.LEARNING,
    });
  }

  return { tiers: null, groups: [{ id: 'only', label: null, items }], payout: payoutFrom(p) };
}

/** 환급률 구간이 여럿인가. 하나뿐이면 구간을 넘겨볼 이유가 없다 */
export const hasTiers = (model) => Array.isArray(model.tiers) && model.tiers.length > 1;

/**
 * 지급은 경로와 무관하게 하나다.
 *
 * 경로가 갈려도 금액이 같으므로 계약의 config.amount 하나로 유지된다.
 * 경로마다 금액이 다른 상품(차등 환급)은 이번 범위가 아니다.
 */
function payoutFrom(p, tier) {
  const token = `${amountText(p.amount, p.tokenDecimals)} TEST`;
  // 안내문이 말하는 금액은 원화다. 공제를 빼면 실제로 받는 돈이 달라지고,
  // 그 차이가 이 제품이 겨냥한 문제다(광고 금액 ≠ 실수령). 그래서 표시
  // 금액·공제·실수령을 따로 적는다.
  //
  // 합성 데모의 지급은 TEST 토큰이다. 원화와 환산하지 않는다 —
  // 'N TEST = M원' 이라고 적으면 그것부터 거짓이 된다. 별개 사실로 나란히 둔다.
  const money = tier?.payout ?? p.payoutBreakdown ?? null;
  return {
    label: '지급',
    rate: tier?.rate ?? null,
    money,
    token,
    note: money
      ? '합성 데모에서는 이 금액 대신 무가치 TEST 토큰을 지급합니다.'
      : '무가치 시험 단위입니다. 실제 수강료나 현금 환불이 아닙니다. '
        + '상용에서는 이 자리에 학원이 약속한 실제 환급액이 들어갑니다.',
  };
}

/** 원 단위 금액. 부동소수점을 쓰지 않고 자리수만 끊는다 */
export function wonText(value) {
  const digits = String(value);
  if (!/^-?\d+$/.test(digits)) return digits;
  const sign = digits.startsWith('-') ? '-' : '';
  const body = sign ? digits.slice(1) : digits;
  return sign + body.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '원';
}

/** 선택 경로가 있는가. 한 그룹뿐이면 'AND 하나'이므로 머리글이 달라진다 */
export const hasAlternatives = (model) => model.groups.length > 1;

/** 그룹 안의 조건 수. 머리글 문구를 정하는 데 쓴다 */
export const countItems = (model) =>
  model.groups.reduce((sum, group) => sum + group.items.length, 0);
