// 조건 카드 → 원래 화면으로 가는 길
//
// 네 카드 중 셋(강의·과제·회고)은 Moodle 의 지정 항목으로 보낸다. HackerRank 는
// 주소로 보내지 않고 기존 Reclaim 인증 흐름을 시작한다(certificate.js).
//
// **어느 항목이 지정 항목인지는 화면이 정하지 않는다.** develop 기준으로 그 값은
// 호스트의 비공개 매핑(tools/bootcamp/live-context.mjs 의 mapping.targets)과
// C 의 플러그인 설정에만 있고, 브라우저로 오는 API(세션·판정·근거)에는 없다.
// 판정 근거 API 는 일부러 원천 ID 를 숨긴다(src/bootcamp/decision-evidence.mjs).
//
// 그래서 이 파일은 **서버가 줄 모양을 제안하고, 그 모양을 엄격하게 검사**한다.
// 받지 못했으면 버튼을 '이동 주소 미제공' 으로 잠근다. 강좌 번호나 cmId 를
// 주소창·fixture 에서 주워 와서 링크를 만들지 않는다.
//
// 제안 계약 (A·C 요청 — docs/pivot/학생_조건카드_인계_20261105.ko.md)
//
//   {
//     version: 'clear-student-condition-targets.1',
//     applicationId: '<현재 신청>',
//     moodleOrigin: 'https://moodle.example',      // 경로 없는 origin
//     courseId: 12,
//     targets: [
//       { criterionId: 'activity-complete',    cmId: 2101, module: 'page',   name: '1주차 · 파이썬 시작하기' },
//       { criterionId: 'assignment-submitted', cmId: 2105, module: 'assign', name: '실습 과제' },
//       { criterionId: 'reflection-topics',    cmId: 2107, module: 'forum',  instanceId: 31, name: '회고 게시판' },
//     ],
//   }
//
// 주소는 문자열로 받지 않고 **조각(origin·module·cmId)으로 받아 여기서 조립한다.**
// 서버가 준 URL 문자열을 그대로 href 에 넣으면 javascript: 나 다른 사이트로
// 보내는 값을 막을 길이 없다.

export const TARGETS_VERSION = 'clear-student-condition-targets.1';

export const LINK = Object.freeze({
  LINKED: 'LINKED',           // 지정 Moodle 항목 주소가 있다
  RECLAIM: 'RECLAIM',         // 주소가 아니라 기존 Reclaim 인증을 시작한다
  UNAVAILABLE: 'UNAVAILABLE', // 이동할 곳을 모른다 — 버튼을 잠근다
});

/**
 * 조건마다 허용하는 Moodle 모듈과 여는 화면.
 *
 * 모듈 목록은 live-context.mjs 가 실제로 읽는 것(page·assign·forum)에
 * 강의 자료로 흔히 쓰는 몇 개만 더했다. 회고 칸에 퀴즈가 들어오는 식의
 * 엉뚱한 매핑은 여기서 걸러진다(A 화면 course-link.js 와 같은 원칙).
 */
const MOODLE_ROUTE = Object.freeze({
  'activity-complete': Object.freeze({
    modules: Object.freeze(['page', 'url', 'resource', 'book', 'lesson', 'h5pactivity']),
    verb: '강의 열기',
    where: '지정 강의',
    href: (origin, t) => moodleHref(origin, `/mod/${t.module}/view.php`, { id: t.cmId }),
  }),
  'assignment-submitted': Object.freeze({
    modules: Object.freeze(['assign']),
    verb: '과제 열기',
    where: '지정 과제',
    href: (origin, t) => moodleHref(origin, '/mod/assign/view.php', { id: t.cmId }),
  }),
  'reflection-topics': Object.freeze({
    modules: Object.freeze(['forum']),
    verb: '회고 쓰기',
    where: '회고 작성 화면',
    // 게시판 인스턴스 번호가 있으면 새 글 쓰기 화면으로 바로 보낸다.
    // 없으면 게시판 첫 화면이다 — 작성 버튼이 거기 있다.
    href: (origin, t) => (t.instanceId
      ? moodleHref(origin, '/mod/forum/post.php', { forum: t.instanceId })
      : moodleHref(origin, '/mod/forum/view.php', { id: t.cmId })),
  }),
});

const REASON = Object.freeze({
  TARGETS_NOT_PROVIDED: '이동할 Moodle 항목 주소를 서버가 아직 주지 않았습니다.',
  TARGETS_INVALID: '서버가 준 이동 정보의 모양이 맞지 않아 열지 않습니다.',
  TARGETS_OTHER_APPLICATION: '다른 신청의 이동 정보라 열지 않습니다.',
  TARGET_MISSING: '이 조건의 Moodle 항목이 지정되지 않았습니다.',
  TARGET_INVALID: '이 조건의 Moodle 항목 정보가 맞지 않아 열지 않습니다.',
});

export const linkReasonText = (code) => (code ? REASON[code] ?? code : null);

const isPositiveInt = (v) => Number.isSafeInteger(v) && v > 0;
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/**
 * Moodle origin 검사. https 만 받는다. 로컬 Moodle 실습(127.0.0.1)만 http 를 허용한다.
 * 경로·쿼리·계정 정보가 붙은 값은 origin 이 아니므로 거부한다.
 */
export function safeMoodleOrigin(value) {
  if (typeof value !== 'string' || value.length > 200) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.origin !== value) return null;
  if (url.username || url.password) return null;
  if (url.protocol === 'https:') return url.origin;
  if (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname)) return url.origin;
  return null;
}

function moodleHref(origin, path, params) {
  const url = new URL(path, origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  return url.href;
}

function targetOk(criterionId, t) {
  const route = MOODLE_ROUTE[criterionId];
  if (!route || !t || typeof t !== 'object') return false;
  const keys = Object.keys(t);
  if (!keys.every((k) => ['criterionId', 'cmId', 'module', 'instanceId', 'name'].includes(k))) return false;
  if (!isPositiveInt(t.cmId) || !route.modules.includes(t.module)) return false;
  if (t.instanceId !== undefined && t.instanceId !== null && !isPositiveInt(t.instanceId)) return false;
  if (t.name !== undefined && t.name !== null && (typeof t.name !== 'string' || t.name.length > 120)) return false;
  return true;
}

const unavailable = (reason) => Object.freeze({ status: LINK.UNAVAILABLE, reason, note: linkReasonText(reason) });

/**
 * 서버가 준 이동 정보를 조건별 링크로 바꾼다.
 *
 * @param {object|null} raw  제안 계약 모양. 없으면 null
 * @param {{applicationId:string}} scope  지금 화면의 신청
 * @returns {Readonly<Record<string, object>>} criterionId → 링크
 */
export function resolveTargets(raw, { applicationId } = {}) {
  const out = {};
  const fill = (fn) => {
    for (const id of Object.keys(MOODLE_ROUTE)) out[id] = fn(id);
    // 인증서는 주소가 아니라 기존 Reclaim 시작이다. 이동 정보와 무관하다.
    out['python-basic-certificate'] = Object.freeze({
      status: LINK.RECLAIM, verb: 'HackerRank 인증', where: 'HackerRank 로그인 · 증명 동의',
    });
    return Object.freeze(out);
  };

  if (raw === null || raw === undefined) return fill(() => unavailable('TARGETS_NOT_PROVIDED'));

  const origin = safeMoodleOrigin(raw?.moodleOrigin);
  if (raw?.version !== TARGETS_VERSION || !origin || !isPositiveInt(raw.courseId) || !Array.isArray(raw.targets)
    || raw.targets.length > 16) {
    return fill(() => unavailable('TARGETS_INVALID'));
  }
  // 신청이 다르면 남의 항목으로 보낼 수 있다. 화면이 신청을 모르면 열지 않는다.
  if (typeof applicationId !== 'string' || raw.applicationId !== applicationId) {
    return fill(() => unavailable('TARGETS_OTHER_APPLICATION'));
  }

  return fill((criterionId) => {
    const rows = raw.targets.filter((t) => t?.criterionId === criterionId);
    if (rows.length === 0) return unavailable('TARGET_MISSING');
    // 활동 여러 개(AND)는 11/4 합의대로 아직 하나만 연결한다. 둘 이상이면
    // 어느 쪽으로 보낼지 화면이 고르지 않는다.
    if (rows.length > 1 || !targetOk(criterionId, rows[0])) return unavailable('TARGET_INVALID');
    const t = rows[0];
    const route = MOODLE_ROUTE[criterionId];
    return Object.freeze({
      status: LINK.LINKED,
      href: route.href(origin, t),
      verb: route.verb,
      where: route.where,
      name: t.name ?? null,
      module: t.module,
      cmId: t.cmId,
      origin,
    });
  });
}

/** 조건별 동사. 링크가 없어도 버튼 글자는 같게 둔다 — 잠긴 이유만 다르게 말한다 */
export function verbFor(criterionId) {
  return MOODLE_ROUTE[criterionId]?.verb ?? (criterionId === 'python-basic-certificate' ? 'HackerRank 인증' : '열기');
}
