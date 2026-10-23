// 부트캠프 판정 → 화면 조건 projection
//
// 오규원 답변 Q1 이 요구한 어댑터다. 서버는 세 축을 주고 화면 상태는 여기서 만든다.
//
//   판정      MET / NOT_MET / MISSING / UNKNOWN   + current(현재성) + reasonCode
//   진척도    아직 없다. P0 네 조건은 전부 단발이다
//   수집 상태 reasonCode 와 source 로 읽는다
//        ↓
//   화면      MET / IN_PROGRESS / UNMET / WAITING / NEEDS_CHECK / UNAVAILABLE
//
// 매핑에서 지킬 것 (오규원 Q1 원문)
//
//   NOT_MET 을 항상 최종 탈락으로 바꾸지 않는다
//   UNKNOWN 을 항상 대기로 바꾸지 않는다. 불확실한 이유를 함께 표시한다
//   MISSING 을 단순 대기와 같게 처리하지 않는다. 보완 행동을 표시한다
//   만료된 예전 MET 를 현재 MET 배지로 표시하지 않는다
//   수치를 못 받으면 null·확인 전이다. 0/10 을 만들어 넣지 않는다
//
// 마지막 줄이 왜 중요한가. P0 는 "6회 중 4회" 같은 진척도를 주지 않는다. 화면이
// 보기 좋으라고 0/4 를 그리면, 참가자는 자기가 네 개 중 하나도 못 했다고 읽는다.
// 실제로는 **아직 확인하지 않은 것**이다. 둘은 다르다.

import { EVIDENCE } from '../ui/conditions.js';

/**
 * 네 조건의 사람 이름.
 *
 * criterionId 는 서버가 정한 고정 네 개다(normal-client.mjs 의 criteria).
 * 화면이 이름을 지어내지 않고 여기서만 붙인다.
 */
export const CRITERIA = Object.freeze({
  'activity-complete': Object.freeze({
    kind: 'LEARNING', label: '강의 수강', value: '지정 활동', tail: '완료',
    detail: 'Moodle 이 활동 완료로 표시한 기록을 가져옵니다.',
    source: 'MOODLE_ACTIVITY_COMPLETION',
  }),
  'assignment-submitted': Object.freeze({
    kind: 'LEARNING', label: '과제 제출', value: '지정 과제', tail: '제출 완료',
    // 점수가 아니라 제출 여부다. P0 는 gradingRequired:false 라 채점 결과를 쓰지 않는다.
    detail: '제출 여부만 봅니다. 점수 기준은 이 정책에 없습니다.',
    source: 'MOODLE_ASSIGNMENT_SUBMISSION',
  }),
  'reflection-topics': Object.freeze({
    kind: 'REVIEW', label: '회고', value: '세 항목', tail: '확인',
    detail: '수행 내용 · 문제 해결 과정 · 배운 점이 글에 있는지 AI 가 읽고 확인합니다. '
      + '글을 평가하거나 점수를 매기지 않습니다.',
    source: 'MOODLE_REFLECTION_AI',
  }),
  'python-basic-certificate': Object.freeze({
    kind: 'EXAM', label: 'HackerRank 인증서', value: 'Python (Basic)', tail: '합격',
    detail: '본인 계정으로 로그인해 인증서를 공증합니다. 파일을 내지 않습니다. '
      + '계정이 본인 것인지도 함께 확인합니다.',
    source: 'RECLAIM_HACKERRANK',
  }),
});

/** 서버 reasonCode 를 사람 말로. 모르는 코드는 그대로 보여준다 — 지어내지 않는다 */
const REASON = Object.freeze({
  SOURCE_UNAVAILABLE: '아직 원천 기록을 가져오지 못했습니다.',
  TARGET_COUNT_NOT_REACHED: '필요한 횟수에 못 미칩니다.',
  GRADE_NOT_FINAL: '채점이 확정되지 않았습니다.',
  SOURCE_MISMATCH: '원천 기록과 다릅니다.',
  EVIDENCE_MISSING: '필요한 근거가 없습니다.',
});

export const reasonText = (code) => (code ? REASON[code] ?? code : null);

/**
 * 판정 하나를 화면 상태로.
 *
 * @param {object} row  normalView 의 criteria 한 줄
 * @returns {{state:string, note:string|null, expired:boolean}}
 */
export function displayState(row) {
  const reason = reasonText(row.reasonCode);

  // 만료 먼저 본다. MET 였어도 현재성이 없으면 현재 충족이 아니다.
  // 과거에 충족했다는 사실과 지금 다시 확인해야 한다는 것을 섞으면 안 된다.
  if (row.state === 'MET' && row.current === false) {
    return {
      state: 'NEEDS_CHECK',
      note: '예전에 충족했지만 지금은 다시 확인해야 합니다.' + (reason ? ` ${reason}` : ''),
      expired: true,
    };
  }

  switch (row.state) {
    case 'MET':
      return { state: 'MET', note: null, expired: false };

    // 확인된 미충족. '최종 탈락' 이 아니다 — 복구 가능성은 서버가 따로 준다.
    case 'NOT_MET':
      return { state: 'UNMET', note: reason, expired: false };

    // 보완이 필요한 것. 그냥 기다리면 되는 WAITING 과 다르다.
    case 'MISSING':
      return {
        state: 'NEEDS_CHECK',
        note: reason ?? '필요한 근거가 아직 없습니다. 원천에서 확인해 주세요.',
        expired: false,
      };

    // 불확실. 이유를 반드시 함께 보여준다. 이유를 모르면 그 사실도 말한다.
    case 'UNKNOWN':
      return {
        state: 'WAITING',
        note: reason ?? '아직 확인하지 못했습니다. 이유도 받지 못했습니다.',
        expired: false,
      };

    default:
      // 계약에 없는 값이다. 성공으로 바꾸지 않고 그대로 막는다.
      return { state: 'UNAVAILABLE', note: `알 수 없는 상태입니다 (${row.state}).`, expired: false };
  }
}

/**
 * 부트캠프 view → policy-view 가 받는 '정책' 모양.
 *
 * 조건 구조는 네 개 AND 하나뿐이라 tier 하나 · 경로 하나다.
 * 금액은 agreedPayment 가 주는 100 TEST 고 공제가 없다 — 우리가 계산하지 않는다.
 */
export function policyFrom(view) {
  const items = view.criteria.map((row) => {
    const meta = CRITERIA[row.criterionId];
    return Object.freeze({
      id: row.criterionId,
      kind: meta?.kind ?? 'LEARNING',
      label: meta?.label ?? row.criterionId,
      value: meta?.value ?? null,
      tail: meta?.tail ?? null,
      detail: meta?.detail ?? null,
      evidence: meta?.kind ?? 'LEARNING',
      // 인증서만 본인 로그인이고 나머지는 학원 기록에서 자동으로 온다.
      verify: row.criterionId === 'python-basic-certificate' ? 'SELF_LOGIN' : 'AUTO',
    });
  });

  // payoutBreakdown 을 주지 않는다.
  //
  // 어학원 반은 '안내문 금액(원) − 공제 = 실수령' 을 보여주고, 그 원화를 1 TEST = 1원
  // 으로 환산해 토큰 수량을 적는다. 부트캠프는 **지급 자체가 TEST** 라 환산할 원화가
  // 없다. 그 자리에 breakdown 을 넣으면 화면이 "1 TEST를 1원으로 둡니다" 라고
  // 말하게 되고, 그건 이 정책에서 거짓이다.
  //
  // 약정 100 TEST · 재원 배정 · 거래 제출 · 실제 수령은 서로 다른 값이라
  // 별도 지급 구역에서 넷을 나눠 그린다.
  return Object.freeze({
    compilerVersion: 'bootcamp-normal-view.1',
    policyHash: view.policyHash,
    publishable: false,
    policy: Object.freeze({
      productName: 'Python 부트캠프 (시연용 가상 과정)',
      amount: view.agreedPayment.amountAtoms,
      tokenDecimals: view.agreedPayment.decimals,
      conditionGroups: Object.freeze([
        Object.freeze({ id: 'only', label: null, items: Object.freeze(items), payout: null }),
      ]),
    }),
  });
}

/** 부트캠프 view → policy-view 가 받는 '진행 상태' 맵 */
export function progressFrom(view) {
  const out = {};
  for (const row of view.criteria) {
    const { state, note } = displayState(row);
    out[row.criterionId] = Object.freeze({
      state,
      // 진척도 숫자를 서버가 주지 않는다. 0/4 를 지어내지 않고 비운다.
      value: null,
      note,
    });
  }
  return Object.freeze(out);
}

/** 네 조건 중 몇 개가 현재 충족인가. conditionsStatus 와 따로 센다 */
export const metCount = (view) =>
  view.criteria.filter((row) => row.state === 'MET' && row.current !== false).length;

/** 쓸 수 있는 EVIDENCE 이름인지 — 바뀌면 여기서 먼저 깨진다 */
export const knownEvidence = (kind) => Object.prototype.hasOwnProperty.call(EVIDENCE, kind);
