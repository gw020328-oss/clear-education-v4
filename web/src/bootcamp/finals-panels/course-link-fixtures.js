// 운영자 강좌 연결 화면 — **합성 시나리오**
//
// 운영자가 자기 Moodle 강좌에서 검증 대상(수강 활동·과제·회고)을 고르는
// 화면의 자료다. 서버가 "연결된 강좌 + 그 강좌의 항목 목록 + 저장된 매핑" 을
// 주는 계약은 저장소에 **아직 없다.** 그래서 이것은 화면 전용 view-model 이고,
// 서버 DTO 가 아니다.
//
// 모양은 지어낸 것이 아니라 실제 Moodle 1502 연동 코드(tools/bootcamp/
// live-context.mjs)가 쓰는 것을 빌렸다 — 강좌 id, 항목 cmId, 모듈 종류
// page/assign/forum, 목록 revision. 계약이 오면 어댑터 `run` 에서 이 모양으로
// 바꿔 넣는다.
//
// **항목 목록은 서버가 준 것만 보여준다.** 프론트가 만든 항목을 실제 Moodle
// 목록처럼 섞지 않는다. 합성 모드는 합성이라고 화면에 적는다.
//
// 수강 활동은 **여러 개**다 — 실제 안내문이 "주차별 수업 100% 수강" 이라
// 1주차·2주차를 다 골라 "모두 완료" 로 본다. 지금 본부 모듈은 활동 대상을
// 하나만 받으므로 이건 백엔드 요청으로 넘겼다 (2026-11-04).

const SITE = 'lms.example-academy.kr';

/** 서버가 준 강좌 항목. 운영자는 이 중에서만 고른다. 퀴즈는 어느 칸에도 안 뜨는 예시 */
const ITEMS = Object.freeze([
  { cmId: 2101, module: 'page', name: '1주차 · 파이썬 시작하기' },
  { cmId: 2102, module: 'page', name: '2주차 · 자료형과 반복문' },
  { cmId: 2104, module: 'quiz', name: '1주차 퀴즈' },
  { cmId: 2105, module: 'assign', name: '실습 과제 · 반복문 구현' },
  { cmId: 2106, module: 'assign', name: '선택 과제 · 코드 리뷰' },
  { cmId: 2107, module: 'forum', name: '회고 게시판' },
]);

const COURSE = Object.freeze({ id: '1502', title: '파이썬 입문 부트캠프', cohort: '12기' });

const SAVED_MAPPING = Object.freeze({
  activity: [2101, 2102],
  assignment: 2105,
  reflection: 2107,
  revision: 'map-3',
  basedOnItemsRevision: 'items-7',
  savedAt: '2026-11-02T09:10:00+09:00',
});

const view = (over) => ({
  kind: 'clear-operator-course-link-view.1',
  site: SITE,
  connection: { status: 'CONNECTED', note: null, checkedAt: '2026-11-04T10:00:00+09:00' },
  course: COURSE,
  items: ITEMS,
  itemsRevision: 'items-7',
  fetchedAt: '2026-11-04T10:00:00+09:00',
  mapping: null,
  ...over,
});

export const LINK_SCENARIOS = Object.freeze([
  {
    id: 'saved',
    label: '① 연결됨 · 저장된 설정 있음',
    payload: view({ mapping: SAVED_MAPPING }),
  },
  {
    id: 'unset',
    label: '② 연결됨 · 아직 미설정',
    payload: view({}),
  },
  {
    id: 'stale-list',
    label: '③ 목록이 바뀜 · 저장된 항목 사라짐',
    payload: view({
      // 과제 2105 가 Moodle 에서 지워졌다. 저장된 매핑은 그 번호를 가리킨다.
      items: ITEMS.filter((i) => i.cmId !== 2105),
      itemsRevision: 'items-8',
      mapping: SAVED_MAPPING,
    }),
  },
  {
    id: 'empty',
    label: '④ 연결됐지만 항목 없음',
    payload: view({ items: [], itemsRevision: 'items-0' }),
  },
  {
    id: 'not-connected',
    label: '⑤ 플러그인 연결 안 됨',
    payload: view({
      connection: { status: 'NOT_CONNECTED', note: 'CLEAR 플러그인에서 이 서버로의 연결이 확인되지 않았습니다.', checkedAt: '2026-11-04T10:00:00+09:00' },
      course: null,
      items: [],
      itemsRevision: null,
      fetchedAt: null,
    }),
  },
  {
    id: 'save-fails',
    label: '⑥ 저장 실패',
    payload: view({}),
  },
]);

export const linkFixture = (id) => LINK_SCENARIOS.find((s) => s.id === id)?.payload ?? null;

/**
 * 저장 결과 fixture. 어댑터의 `fixture(input)` 로 쓴다.
 * 입력은 `{ scenario, courseId, conditions, mapping, basedOnItemsRevision }`.
 * ⑥ 에서는 서버가 거부한 것으로 돌려준다. 어댑터는 `status` 가 있으면 그걸
 * 상태로 읽고 모르는 값은 오류로 떨어뜨리므로, 실패만 `status: 'FAILED'` 를
 * 쓰고 성공은 `result: 'SAVED'` 로 적는다. 화면은 reason 을 적는다.
 */
export function saveFixture(input) {
  if (!input || typeof input !== 'object') return null;
  if (input.scenario === 'save-fails') {
    return {
      kind: 'clear-operator-course-link-save-result.1',
      status: 'FAILED',
      reason: '서버가 저장을 거부했습니다 (합성 시나리오). 설정은 바뀌지 않았습니다.',
    };
  }
  return {
    kind: 'clear-operator-course-link-save-result.1',
    result: 'SAVED',
    mapping: {
      ...input.mapping,
      revision: 'map-4',
      basedOnItemsRevision: input.basedOnItemsRevision ?? null,
      savedAt: '2026-11-04T10:05:00+09:00',
    },
  };
}
