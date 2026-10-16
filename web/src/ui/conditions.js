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
// 종류 이름은 서버 스키마를 따른다(src/policy/mvp/schema.mjs 의 Requirement.kind).
// 화면이 따로 만들면 나중에 둘을 맞추는 일이 생긴다.
//
// 종류는 여섯인데 보여줄 이름은 넷이다. 'MOCK_TEST' 를 '모의테스트' 라고
// 적으면 바로 옆 조건 이름과 같은 말이 두 번 나온다.
export const EVIDENCE = Object.freeze({
  EXAM: '성적 증명',
  // 과거에 목표 점수를 못 넘겼다는 기록. 같은 성적 조회에서 함께 나온다.
  BASELINE: '성적 증명',
  LEARNING: '학습 기록',
  MOCK_TEST: '학습 기록',
  // 학원 시스템 안에 남는 기록. 수강후기가 여기다 — 참가자가 내는 것이
  // 아니라 학원 사이트에 쓴 글이라, 출석과 같은 경로로 가져온다.
  REVIEW: '학원 기록',
  // 학원 밖에 있어서 참가자가 주소를 내야 하는 것. 개인 블로그 챌린지가 여기다.
  BLOG: '제출 서류',
  NONE: null,
});

/**
 * 그 조건을 어떻게 확인하는가.
 *
 * 조건마다 참가자가 할 일이 다르다. 성적은 본인이 로그인해야 하고, 출석은
 * 아무것도 안 해도 되고, 후기는 직접 낸다. 조건 목록에 '아직 확인 안 됨'
 * 만 붙여 두면 참가자는 자기가 뭘 해야 하는지 알 수 없다.
 *
 * actor 는 '참가자가 직접 움직여야 하는가' 다. 화면에서 그 줄을 눈에 띄게
 * 만드는 데 쓴다.
 *
 * 문구는 우리 시스템이 어떻게 확인하는지를 말하므로 반이 아니라 여기에
 * 둔다. 정책은 코드만 주고, 그 코드가 무슨 뜻인지는 화면이 안다.
 */
export const VERIFY = Object.freeze({
  SELF_LOGIN: Object.freeze({
    tag: '본인 로그인',
    actor: true,
    note: '참가자가 본인 계정으로 로그인합니다. 점수를 입력받지 않고 '
      + '로그인한 화면에서 증명이 만들어집니다.',
  }),
  SELF_LOGIN_SHARED: Object.freeze({
    tag: '함께 확인',
    actor: false,
    note: '위 성적 조회와 같은 로그인에서 함께 확인됩니다. 따로 할 일은 없습니다.',
  }),
  AUTO: Object.freeze({
    tag: '자동',
    actor: false,
    note: '학원 시스템 기록으로 자동 확인합니다. 참가자가 따로 낼 것은 없습니다.',
  }),
  // 가져오는 것은 자동이지만 내용이 쓸 만한지는 사람이 본다. 시원스쿨
  // 안내문이 '정상적인 수강후기가 아니라 판단되면 환급율이 변경' 이라고
  // 적어 둔 자리다. 자동이라고만 하면 사람 판단이 끼는 것을 숨기게 된다.
  AUTO_REVIEWED: Object.freeze({
    tag: '자동 + 검수',
    actor: false,
    note: '학원 시스템 기록으로 자동 확인합니다. 다만 내용이 정상인지는 사람이 판단합니다.',
  }),
  SUBMIT: Object.freeze({
    tag: '직접 제출',
    actor: true,
    note: '참가자가 작성한 글의 주소를 냅니다.',
  }),
});

/**
 * 정책이 확인 방법을 주지 않으면 자료 종류에서 고른다.
 *
 * 자료가 어디에 있느냐로 갈린다 — 성적 증명은 외부 사이트라 본인 로그인
 * (zkTLS), 학습 기록과 학원 기록은 학원 시스템 안이라 자동 수집, 제출 서류는
 * 학원 밖이라 직접 제출. 예외가 생기면 정책이 verify 로 덮어쓴다.
 */
const VERIFY_BY_KIND = Object.freeze({
  EXAM: 'SELF_LOGIN',
  // 과거 이력은 성적 조회와 같은 로그인에서 나온다. 종류가 따로 있으니
  // 조건마다 적어 줄 필요가 없다.
  BASELINE: 'SELF_LOGIN_SHARED',
  LEARNING: 'AUTO',
  MOCK_TEST: 'AUTO',
  REVIEW: 'AUTO',
  BLOG: 'SUBMIT',
});

/** 그 조건의 확인 방법. 모르면 null 이고, 화면은 없는 설명을 지어내지 않는다 */
export const verifyOf = (item) =>
  VERIFY[item.verify ?? VERIFY_BY_KIND[item.kind]] ?? null;

/**
 * 그 조건이 지금 어디까지 왔는가.
 *
 * 이 값은 정책이 아니라 신청에서 온다. 정책은 '무엇을 충족해야 하는가' 이고,
 * 신청은 '이 수강생이 어디까지 왔는가' 다. 둘을 조건 id 로 맞춘다.
 *
 * 화면은 이 상태를 **만들지 않는다**. 서버가 준 것만 그린다. 판정은 서버가
 * 하고 화면은 받은 것을 보여줄 뿐이라, 여기에 계산이 들어가면 화면이
 * 판정하는 것이 되어 이 제품이 없애려는 문제를 우리가 만든다.
 */
export const PROGRESS = Object.freeze({
  MET: Object.freeze({ label: '충족', tone: 'met', mark: '✓' }),
  UNMET: Object.freeze({ label: '미충족', tone: 'unmet', mark: '✕' }),
  IN_PROGRESS: Object.freeze({ label: '진행 중', tone: 'doing', mark: '•' }),
  WAITING: Object.freeze({ label: '아직 확인 안 됨', tone: 'wait', mark: '?' }),
  UNAVAILABLE: Object.freeze({ label: '확인 불가', tone: 'unmet', mark: '!' }),
});

/** 상태를 모르면 '아직 확인 안 됨' 이다. 없는 결과를 지어내지 않는다 */
export const progressOf = (item) => {
  const found = item.progress ? PROGRESS[item.progress.state] : null;
  return found ? { ...found, ...item.progress } : { ...PROGRESS.WAITING, state: 'WAITING' };
};

/**
 * 한 경로에서 충족한 조건 수.
 *
 * 세는 것이지 판정이 아니다. '3 / 4 충족' 은 서버가 준 상태를 더한 값이고,
 * 그 구간을 통과했는지는 말하지 않는다 — 통과 여부는 서버가 정한다.
 */
export const metCount = (group) => ({
  met: group.items.filter((item) => item.progress?.state === 'MET').length,
  total: group.items.length,
});

/** 진행 상황이 하나라도 들어와 있는가. 없으면 세는 자리를 아예 두지 않는다 */
export const hasProgress = (view) =>
  view.groups.some((group) => group.items.some((item) => item.progress));

/**
 * 컴파일된 정책을 화면이 그릴 모양으로 바꾼다.
 *
 * groups 가 둘 이상이면 그중 하나만 충족하면 되는 선택 경로다.
 * 현재 컴파일러는 경로 개념이 없으므로 언제나 한 그룹이다.
 *
 * @param {object} compiled  checkPolicyView 를 통과한 정책
 * @returns {{groups: object[], payout: object}}
 */
const groupsOf = (groups, p, rate = null, progress = null) => (groups ?? []).map((group) => ({
  id: group.id,
  label: group.label ?? null,
  items: (group.items ?? []).map((item) => ({
    ...item,
    evidence: EVIDENCE[item.evidence] ?? null,
    // 같은 조건이 여러 구간에 나오면 진행 상황도 같이 따라붙는다. 출석
    // 100일은 한 번 해내면 200%·300%·400% 어디에나 걸리는 하나의 사실이다.
    progress: progress?.[item.id] ?? null,
  })),
  // 같은 환급률인데 경로에 따라 받는 돈이 다른 반이 있다. 그럴 때는
  // 금액이 경로에 붙는다. 구간에 하나만 적으면 한쪽이 틀린 금액을 본다.
  payout: group.payout ? payoutFrom(p, { rate, payout: group.payout }) : null,
}));

/**
 * @param {object} compiled   checkPolicyView 를 통과한 정책
 * @param {object} [progress] 신청의 conditionProgress — 조건 id 로 맞춘다
 */
export function conditionsFrom(compiled, progress = null) {
  const p = compiled.policy;

  // 환급률 구간이 여럿인 반. 구간은 계약 시점에 정해지지 않고, 수강생이
  // 무엇을 달성했는지에 따라 판정 시점에 갈린다. 모든 구간이 한 계약 안에
  // 있으므로 '계약 밖' 인 구간은 없다.
  //
  // 여럿을 동시에 충족하면 그중 가장 높은 구간으로 지급한다. 그래서 예치는
  // 가장 높은 구간 기준이고, 정책의 amount 가 그 값이다.
  if (Array.isArray(p.conditionTiers) && p.conditionTiers.length > 0) {
    const tiers = p.conditionTiers.map((tier) => ({
      id: tier.id,
      rate: tier.rate,
      groups: groupsOf(tier.groups, p, tier.rate, progress),
      // 금액이 경로마다 다르면 구간에는 금액이 없다. 그 경우 구간 하나의
      // 금액을 말할 수 없으므로 null 이고, 화면이 경로 안에서 그린다.
      payout: tier.payout ? payoutFrom(p, tier) : null,
    }));
    // 기본으로 보여줄 구간은 가장 낮은 것이다. 가장 높은 구간을 먼저 띄우면
    // 받을 금액이 그것인 양 읽힌다.
    return { tiers, groups: tiers[0].groups, payout: tiers[0].payout };
  }

  // 정책이 조건 그룹을 직접 주면 그대로 쓴다. 그룹 안은 AND, 그룹끼리는 OR 다.
  // 주지 않으면 아래에서 기존 필드로 한 그룹을 만든다.
  if (Array.isArray(p.conditionGroups) && p.conditionGroups.length > 0) {
    return { tiers: null, groups: groupsOf(p.conditionGroups, p, null, progress), payout: payoutFrom(p) };
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

  return {
    tiers: null,
    groups: [{
      id: 'only',
      label: null,
      items: items.map((item) => ({ ...item, progress: progress?.[item.id] ?? null })),
      payout: null,
    }],
    payout: payoutFrom(p),
  };
}

/**
 * 금액이 경로마다 붙어 있는가.
 *
 * 같은 환급률인데 경로에 따라 받는 돈이 다르면, 금액을 구간 아래에 한 번
 * 그릴 수 없다. 경로 안에 각각 그려야 한다.
 */
export const hasPathPayouts = (view) =>
  view.groups.length > 0 && view.groups.every((group) => group.payout);

/** 환급률 구간이 여럿인가. 하나뿐이면 구간을 넘겨볼 이유가 없다 */
export const hasTiers = (model) => Array.isArray(model.tiers) && model.tiers.length > 1;

/**
 * 받을 금액 한 묶음.
 *
 * 구간에 붙기도 하고 경로에 붙기도 한다. 시원스쿨 100% 는 출석 경로에
 * 응시료 환급이 없어서 성적 경로보다 적다 — 그래서 경로마다 따로 만든다.
 *
 * @param {object} p      정책
 * @param {object} [tier] { rate, payout } — 구간이든 경로든 같은 모양
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
    // 구간이 여럿이면 금고에 예치된 양은 가장 높은 구간 기준이다.
    // 이 구간의 지급액과 다르므로, 구간마다 토큰 수량을 따로 계산한다.
    token: money ? `${amountText(String(BigInt(money.net) * 10n ** BigInt(p.tokenDecimals)), p.tokenDecimals)} TEST` : token,
    // 시연에서는 1 TEST 를 1원으로 둔다. 임의 수량을 적으면 금액이 와닿지
    // 않고, 'N TEST = M원' 이라고 주장하면 그것부터 거짓이 된다.
    // 규칙을 밝히면 주장이 아니라 설계가 된다.
    // '실제 지급은 이 금액' 이라고 적으면 안 된다. 결제금액·수수료가 우리가
    // 세운 시연 가정이라 안내문이 확정한 금액이 아니고, 확보된 재원과
    // 신청별 배정액은 또 다른 값이다. 셋을 섞으면 화면이 확정되지 않은
    // 금액을 약속하게 된다.
    note: money
      ? '시연 가정에 따른 계산 예시입니다. 안내문이 확정한 금액이 아닙니다. '
        + '합성 데모에서는 1 TEST를 1원으로 두고 무가치 TEST 토큰으로 대신 보냅니다.'
      : '무가치 시험 단위입니다. 실제 수강료나 현금 환불이 아닙니다. '
        + '상용에서는 이 자리에 학원이 약속한 실제 환급액이 들어갑니다.',
    // 약정/계산 금액과 확보된 재원은 다른 값이다. 받지 못한 것은 받지
    // 못했다고 적는다.
    funding: '확보된 재원과 이 신청에 배정된 금액은 아직 확인 전입니다.',
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
