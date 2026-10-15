// 신청 상태 문구
//
// docs/current/API_CONTRACT.ko.md 의 '화면 상태' 표를 그대로 옮겼다.
// 각 상태마다 '말할 수 있는 사실'과 '금지되는 추정'을 함께 둔다.
// 금지 문구를 화면에도 띄우는 이유는, 이 단계의 상태를 환급 가능이나
// 지급 완료로 읽는 것을 막는 것이 F0 의 완료 기준이기 때문이다.
//
// actor 는 '지금 누가 움직여야 하는가'다. 버튼은 계획 F2·F3 에서 붙지만
// 누구 차례인지는 지금도 말할 수 있다. 참가자가 기다려야 하는 구간에서
// 아무것도 안 하고 있으면 멈춘 것처럼 보인다.
//
// 표를 고칠 때는 API_CONTRACT 를 같은 PR 에서 함께 고친다.

export const ACTOR = Object.freeze({
  LEARNER: { key: 'LEARNER', label: '내 차례' },
  OPERATOR: { key: 'OPERATOR', label: '학원 차례' },
  DONE: { key: 'DONE', label: '절차 완료' },
});

export const STATE_LABELS = Object.freeze({
  DRAFT: {
    title: '신청 생성',
    short: '신청',
    fact: '신청이 만들어졌고 아직 동의 전입니다.',
    forbidden: '등록이나 예치가 끝났다고 읽지 않습니다.',
    actor: ACTOR.LEARNER,
    next: '조건을 확인하고 지갑으로 서명하면 다음 단계로 넘어갑니다.',
    step: 1,
  },
  TERMS_ACCEPTED: {
    title: '신청 조건 확인',
    short: '조건 동의',
    fact: '신청 조건을 확인했습니다.',
    forbidden: '최종 계약 동의가 끝났다고 읽지 않습니다.',
    // 금고가 연결되기 전에는 학원을 기다리고, 연결된 뒤에는 참가자가
    // 그 설정을 보고 최종 동의에 서명한다. actorFor() 가 갈라 준다.
    actor: ACTOR.OPERATOR,
    next: '학원이 금고를 배포하고 연결하면 최종 동의를 할 수 있습니다.',
    actorWhenRuntimeReady: ACTOR.LEARNER,
    nextWhenRuntimeReady: '금고 설정을 확인하고 최종 동의에 서명하세요. 참가자의 두 번째 서명입니다.',
    step: 2,
  },
  CONSENTED: {
    title: '최종 동의 저장',
    short: '계약 동의',
    fact: '화면에서 보여준 배포 설정에 대한 최종 동의가 저장되었습니다.',
    forbidden: '예치가 끝났다고 읽지 않습니다.',
    actor: ACTOR.OPERATOR,
    // 바로 다음은 '예치 거래 발급'이지 송금이 아니다. 돈이 실제로 움직이는
    // 것은 그다음 단계다. 둘을 합쳐 쓰면 4·5단계가 구별되지 않는다.
    next: '학원이 예치 거래를 받아올 차례입니다. 실제 송금은 그다음입니다.',
    step: 3,
  },
  FUNDING_PENDING: {
    title: '예치 준비',
    short: '예치 준비',
    fact: '학원이 예치 거래를 준비하거나 다시 시도할 수 있는 상태입니다.',
    forbidden: '거래가 전송되었거나 성공했다고 읽지 않습니다.',
    actor: ACTOR.OPERATOR,
    next: '학원이 토큰 승인과 예치 전송을 마치고 확인을 요청해야 합니다.',
    step: 4,
  },
  ENROLLED: {
    title: '예치 확인',
    short: '예치 확인',
    fact: '기록된 블록에서 예치가 검증되었습니다.',
    forbidden: '지금 청구할 수 있다거나, 자격을 충족했다거나, 지급이 끝났다고 읽지 않습니다.',
    actor: ACTOR.DONE,
    next: '이제 정해진 기간 안에 수업을 듣고 시험에 응시합니다. 환급은 그 뒤 절차입니다.',
    step: 5,
  },
});

export const TOTAL_STEPS = 5;
export const STEP_ORDER = Object.freeze(
  Object.entries(STATE_LABELS).sort((a, b) => a[1].step - b[1].step).map(([state]) => state),
);

/**
 * 그 단계에서 '다음에 움직여야 하는 쪽'.
 *
 * 상태 이름은 끝난 일을 가리키고 actor 는 다음 행동을 가리킨다. 둘을 섞으면
 * 참가자가 서명을 한 번만 하는 것처럼 보인다. 실제로는 두 번이다 —
 * 1단계에서 조건 동의, 2단계에서 최종 동의.
 *
 * 2단계의 최종 동의는 금고가 연결된 뒤에만 가능하다. 서버의
 * final-consent-challenge 가 participant 역할을 요구하면서 runtime 도 함께 읽는다.
 *
 * @param {string} state
 * @param {{runtimeReady?: boolean}} [context]
 */
export function actorFor(state, context = {}) {
  const label = stateLabel(state);
  if (state === 'TERMS_ACCEPTED' && context.runtimeReady) return label.actorWhenRuntimeReady;
  return label.actor;
}

export function nextFor(state, context = {}) {
  const label = stateLabel(state);
  if (state === 'TERMS_ACCEPTED' && context.runtimeReady) return label.nextWhenRuntimeReady;
  return label.next;
}

export const stateLabel = (state) => STATE_LABELS[state] ?? {
  title: '알 수 없는 상태',
  short: '알 수 없음',
  fact: '이 화면이 모르는 상태입니다. 서버 응답을 그대로 표시합니다.',
  forbidden: '임의로 다음 단계로 해석하지 않습니다.',
  actor: ACTOR.OPERATOR,
  next: '담당자에게 알려 주세요.',
  step: 0,
};

/** 화면 맨 위에 늘 붙는 문구. 합성 데모임을 숨기지 않는다. */
export const SYNTHETIC_NOTICE = Object.freeze({
  title: '합성 데모',
  body: '실제 신청·지갑·성적·지급이 아닙니다. 화면 골격과 상태 표현을 검토하기 위한 합성 데이터이며, '
    + '실제 서버·서명·거래에 연결되어 있지 않습니다.',
});

/**
 * 조건 구역 바로 밑에 붙는 한 줄.
 * 조건을 읽은 직후가 '그래서 나는 얼마나 왔나'가 떠오르는 자리다.
 * 빈 구역을 따로 두지는 않는다 — 상세 하단의 '확인되지 않는 것' 과 중복된다.
 * 달성 현황 화면은 계획 F4 이고 선행 API(B1·B2b·B3)가 아직 없다.
 */
/**
 * 기록이 들어오기 시작한 뒤에 쓰는 문구.
 *
 * 조건이 전부 충족으로 차 있으면 '다 됐다' 로 읽힌다. 그런데 안내문은
 * 환급률이 최초 제출한 성적으로 정해진다고 하고, 후기 내용에 따라 바뀔 수
 * 있다고도 한다. 확인된 기록과 확정된 결과는 다르다.
 */
export const PROGRESS_NOT_FINAL =
  '여기 표시된 것은 지금까지 확인된 기록입니다. 환급률과 지급 금액은 '
  + '환급 신청 뒤에 확정됩니다.';

export const PROGRESS_NOT_YET =
  '충족 여부는 아직 표시되지 않습니다. 증명 제출과 자격 판정이 연결되면 이 아래에 들어옵니다.';

/** 이 단계에서 화면이 말하지 않는 것 — 상세 화면 하단 고정 */
export const NOT_CLAIMED_HERE = Object.freeze([
  '환급 자격을 판정하지 않습니다.',
  '청구 가능 여부를 말하지 않습니다.',
  '지급 결과를 말하지 않습니다.',
  '성적·이수 기록을 다루지 않습니다.',
]);

export const ERROR_TEXT = Object.freeze({
  AUTH_REQUIRED: {
    title: '다시 로그인해야 합니다',
    body: '세션이 없거나 만료되었습니다. 지갑 연결과 로그인은 후속 작업(F1)에서 붙습니다.',
  },
  API_REQUEST_FAILED: {
    title: '요청이 실패했습니다',
    body: '자세한 사유는 화면으로 전달되지 않습니다. 잠시 뒤 다시 시도하거나 담당자에게 알려 주세요.',
  },
});

export const errorText = (code) => ERROR_TEXT[code] ?? ERROR_TEXT.API_REQUEST_FAILED;
