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
      + '글을 평가하거나 점수를 매기지는 않습니다.',
    source: 'MOODLE_REFLECTION_AI',
  }),
  'python-basic-certificate': Object.freeze({
    kind: 'EXAM', label: 'HackerRank 인증서', value: 'Python (Basic)', tail: '합격',
    // 증명이 둘이라는 사실을 설명에도 넣는다. 공개 인증서 페이지는 누구나
    // 열 수 있어서, 그것 하나로는 **그 인증서가 신청자 것인지** 알 수 없다.
    detail: '증명을 둘 받습니다. 로그인한 화면으로 그 계정이 본인 것임을, '
      + '인증서 페이지로 합격 사실을 각각 공증하고 둘을 같은 계정으로 묶습니다. '
      + '파일은 제출하지 않습니다.',
    source: 'RECLAIM_HACKERRANK',
  }),
});

/** 서버 reasonCode 를 사람 말로. 모르는 코드는 그대로 보여준다 — 지어내지 않는다 */
const REASON = Object.freeze({
  SOURCE_UNAVAILABLE: '아직 원천 기록을 가져오지 못했습니다.',
  // 운영자는 학생의 원본 근거를 그대로 볼 권한이 없다. 판정 결과만 본다.
  ROLE_RAW_ACCESS_NOT_GRANTED: '이 역할에는 원본 근거를 볼 권한이 없습니다. 판정 결과만 표시합니다.',
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
      note: '예전에 충족했지만 지금 다시 확인해야 합니다.' + (reason ? ` ${reason}` : ''),
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
        note: reason ?? '필요한 근거가 아직 없습니다. 원래 사이트에서 확인해 주세요.',
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

// ── §9.3 수집 축 ────────────────────────────────────────────────────────
//
// 기획서 §9.3 은 판정과 **별개로** 수집 상태와 보완 가능성을 요구한다.
// 판정만 보면 "아직 확인 못 함"과 "연동이 안 되는 항목"이 같은 WAITING 으로
// 뭉개진다. 둘은 학생이 할 일이 다르다 — 앞은 기다리면 되고 뒤는 기다려도 안 된다.
//
// 다만 서버가 주는 필드만 쓴다. fixture 가 주는 것은 이것뿐이다.
//
//   source.kind                      어느 원천인가
//   source.hostMode                  실제 원천인가 시험용인가
//   source.actualSourceVerification  실제 원천 검증 결과 (지금 전부 null)
//   originalEvidence.authorized      내가 그 근거를 볼 권한이 있나
//   originalEvidence.httpAvailable   원문을 지금 조회할 수 있나
//   evidenceId                       근거가 잡혔나

/** 원천 이름. 모르는 kind 는 그대로 보여준다 */
const SOURCE = Object.freeze({
  MOODLE_ACTIVITY_COMPLETION: 'Moodle 활동 완료 기록',
  MOODLE_ASSIGNMENT_SUBMISSION: 'Moodle 과제 제출 기록',
  MOODLE_REFLECTION_AI: 'Moodle 회고 글 + 텍스트 AI',
  RECLAIM_HACKERRANK: 'HackerRank + Reclaim 공증',
});

export const sourceLabel = (kind) => (kind ? SOURCE[kind] ?? kind : null);

/**
 * 카드 안에서 쓰는 짧은 이름.
 *
 * 전체 이름('HackerRank + Reclaim 공증')은 좁은 카드에서 두 줄이 되고,
 * 그 카드만 아래 줄이 밀려 네 카드의 줄이 어긋난다. 카드에서는 **어디서
 * 오는가**만 알면 되고, 무엇을 어떻게 가져오는지는 상세 화면에 있다.
 */
const SOURCE_SHORT = Object.freeze({
  MOODLE_ACTIVITY_COMPLETION: 'Moodle',
  MOODLE_ASSIGNMENT_SUBMISSION: 'Moodle',
  MOODLE_REFLECTION_AI: 'Moodle + AI',
  RECLAIM_HACKERRANK: 'Reclaim 공증',
});

export const sourceShort = (kind) => (kind ? SOURCE_SHORT[kind] ?? SOURCE[kind] ?? kind : null);

/**
 * 조건 한 줄의 수집 상태.
 *
 * 없는 축을 만들지 않는다. 서버는 '대기 / 실행 중 / 실패 / 연동 미지원' 네 값을
 * 주지 않으므로, 가진 필드로 말할 수 있는 것만 말하고 나머지는 미제공이라고 한다.
 */
export function collectionFrom(row) {
  const kind = row.source?.kind ?? null;
  const mode = row.source?.hostMode ?? null;
  const original = row.originalEvidence ?? null;

  return Object.freeze({
    label: sourceLabel(kind),
    shortLabel: sourceShort(kind),
    // 시험용 원천을 실제 학원 기록처럼 보여주면 안 된다. 이게 지금 상태다.
    synthetic: mode === 'SYNTHETIC_TEST_SOURCE',
    modeRaw: mode,
    // 실제 원천 검증은 지금 전부 null 이다. false 와 구분해 미확인으로 둔다.
    realVerified: row.source?.actualSourceVerification ?? null,
    collected: Boolean(row.evidenceId),
    // §10.1 — 해시만 남고 원문이 만료되면 상세 조회가 불가능함을 화면에서 말한다
    originalReadable: original ? original.httpAvailable === true : null,
    originalAuthorized: original ? original.authorized === true : null,
  });
}

/**
 * §9.3 보완 가능성 — 회복 가능 / 불가 / 미확인.
 *
 * **서버가 주지 않는다.** 그래서 전부 미확인이다. reasonCode 로 추측하면
 * "다시 해도 안 됩니다"를 화면이 지어내는 것이 되고, 그 말 때문에 학생이
 * 포기한다. 필드가 생기면 여기만 고친다.
 */
export function recoverabilityFrom(row) {
  if (row.recoverability) return row.recoverability;
  return 'UNKNOWN';
}
