// 참가자 진입 화면 — **합성 시나리오**
//
// Moodle 학생 ↔ CLEAR 참가자 ↔ 신청 연결을 서버가 검증해 돌려주는 계약은
// 저장소에 **아직 없다** (docs/current 의 Moodle 항목은 전부 후속·차단).
// 그래서 아래는 화면 전용 view-model 이다. 서버 DTO 를 가정한 것이 아니고,
// 계약이 오면 어댑터의 `run` 에서 이 모양으로 바꿔 넣는다.
//
// 모양 이름을 `…-view.1` 로 둔 이유 — 서버 enum 처럼 읽히지 않게.

const SITE = 'lms.example-academy.kr';

/** 공통 머리. 주소의 번호는 **표시용**이다. 인증 근거로 쓰지 않는다 */
const origin = {
  via: 'MOODLE_REFUND_BUTTON',
  site: SITE,
  // Moodle 이 버튼에 실어 보낸 값. 화면은 보여주기만 하고, 아래 links 는
  // 서버가 검증한 결과만 쓴다.
  displayedCourseId: '1502',
  displayedUserId: '87',
};

const course = {
  title: '파이썬 입문 부트캠프',
  cohort: '12기',
  linkedAt: '2026-11-02T09:10:00+09:00',
};

/**
 * CLEAR 쪽 진행. 이 화면은 **CLEAR 로그인 뒤**라 로그인은 서버가 안다.
 * 내장 지갑은 로그인에 따라오지만, 수령인 등록은 본인 서명이라 '아직' 이다.
 * 조건·동의·지급은 서버가 아직 말하지 않은 것 — 모름.
 */
const clearAfterLogin = {
  signedIn: true,
  wallet: true,
  recipient: false,
  conditions: null,
  consent: null,
  payout: null,
};

const view = (over) => ({
  kind: 'clear-participant-entry-view.1',
  origin,
  course,
  session: { status: 'VALID' },
  links: {
    self: { status: 'LINKED', note: null },
    course: { status: 'LINKED', note: null },
    application: { status: 'FOUND', ref: 'app-12-0087', note: null },
  },
  clear: clearAfterLogin,
  ...over,
});

export const ENTRY_SCENARIOS = Object.freeze([
  {
    id: 'linked',
    label: '① 정상 연결',
    payload: view({}),
  },
  {
    id: 'pending',
    label: '② 연결 확인 중',
    payload: view({
      links: {
        self: { status: 'PENDING', note: 'Moodle 계정과 CLEAR 참가자를 대조하고 있습니다.' },
        course: { status: 'LINKED', note: null },
        application: { status: 'PENDING', ref: null, note: null },
      },
    }),
  },
  {
    id: 'failed',
    label: '③ 연결 실패',
    payload: view({
      links: {
        self: { status: 'FAILED', note: 'Moodle 계정에 대응하는 CLEAR 참가자를 찾지 못했습니다.' },
        course: { status: 'LINKED', note: null },
        application: { status: 'NONE', ref: null, note: null },
      },
    }),
  },
  {
    id: 'wrong-course',
    label: '④ 잘못된 강좌',
    payload: view({
      course: null,
      links: {
        self: { status: 'LINKED', note: null },
        course: { status: 'WRONG_COURSE', note: '버튼이 가리키는 강좌는 CLEAR 에 연결돼 있지 않습니다.' },
        application: { status: 'NONE', ref: null, note: null },
      },
    }),
  },
  {
    id: 'expired',
    label: '⑤ 세션 만료',
    payload: view({
      session: { status: 'EXPIRED' },
      links: {
        self: { status: 'NOT_LINKED', note: null },
        course: { status: 'NOT_LINKED', note: null },
        application: { status: 'NONE', ref: null, note: null },
      },
    }),
  },
  {
    id: 'no-application',
    label: '⑥ 신청 없음',
    payload: view({
      links: {
        self: { status: 'LINKED', note: null },
        course: { status: 'LINKED', note: null },
        application: { status: 'NONE', ref: null, note: '이 강좌 12기에 본인 신청이 없습니다.' },
      },
    }),
  },
]);

export const entryFixture = (id) => ENTRY_SCENARIOS.find((s) => s.id === id)?.payload ?? null;
