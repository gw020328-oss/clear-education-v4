// 신청 상태 문구
//
// docs/current/API_CONTRACT.ko.md 의 '화면 상태' 표를 그대로 옮겼다.
// 각 상태마다 '말할 수 있는 사실'과 '금지되는 추정'을 함께 둔다.
// 금지 문구를 화면에도 띄우는 이유는, 이 단계의 상태를 환급 가능이나
// 지급 완료로 읽는 것을 막는 것이 F0 의 완료 기준이기 때문이다.
//
// 표를 고칠 때는 API_CONTRACT 를 같은 PR 에서 함께 고친다.

export const STATE_LABELS = Object.freeze({
  DRAFT: {
    title: '신청 생성',
    fact: '신청이 만들어졌고 아직 동의 전입니다.',
    forbidden: '등록이나 예치가 끝났다고 읽지 않습니다.',
    step: 1,
  },
  TERMS_ACCEPTED: {
    title: '신청 조건 확인',
    fact: '신청 조건을 확인했습니다.',
    forbidden: '최종 계약 동의가 끝났다고 읽지 않습니다.',
    step: 2,
  },
  CONSENTED: {
    title: '최종 동의 저장',
    fact: '화면에서 보여준 배포 설정에 대한 최종 동의가 저장되었습니다.',
    forbidden: '예치가 끝났다고 읽지 않습니다.',
    step: 3,
  },
  FUNDING_PENDING: {
    title: '예치 준비',
    fact: '운영자가 예치 거래를 준비하거나 다시 시도할 수 있는 상태입니다.',
    forbidden: '거래가 전송되었거나 성공했다고 읽지 않습니다.',
    step: 4,
  },
  ENROLLED: {
    title: '예치 확인',
    fact: '기록된 블록에서 예치가 검증되었습니다.',
    forbidden: '지금 청구할 수 있다거나, 자격을 충족했다거나, 지급이 끝났다고 읽지 않습니다.',
    step: 5,
  },
});

export const TOTAL_STEPS = 5;

export const stateLabel = (state) => STATE_LABELS[state] ?? {
  title: '알 수 없는 상태',
  fact: '이 화면이 모르는 상태입니다. 서버 응답을 그대로 표시합니다.',
  forbidden: '임의로 다음 단계로 해석하지 않습니다.',
  step: 0,
};

/** 화면 맨 위에 늘 붙는 문구. 합성 데모임을 숨기지 않는다. */
export const SYNTHETIC_NOTICE = Object.freeze({
  title: '합성 데모',
  body: '실제 신청·지갑·성적·지급이 아닙니다. 화면 골격과 상태 표현을 검토하기 위한 합성 데이터이며, '
    + '실제 서버·서명·거래에 연결되어 있지 않습니다.',
});

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
