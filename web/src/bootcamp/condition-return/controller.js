// 조건 카드 묶음 — 호스트가 몇 줄로 붙이는 입구
//
// 호스트(기존 team-entry.js 나 독립 프리뷰)는 이미 가진 것만 넘긴다.
//
//   getState()        지금 화면 상태 { view, operations, session, approval, busy }
//   read()            기존 조회 API 를 한 번 부르고 { view, operations } 를 돌려준다
//                     (team-entry 라면 driver.readLive() 후 driver.snapshot())
//   loadEvidence(s)   기존 decisionEvidence(applicationId, { decisionId })
//   targets()         이동 정보(targets.js 의 제안 계약). 아직 없으면 null
//   refresh(req)      원천 재확인 요청(A 의 source-refresh). 없으면 저장된 판정만 읽는다.
//                     { criterionId, expectedRevision } → { status: QUEUED|RATE_LIMITED|RECORDED|UNAVAILABLE,
//                     operationId?, retryAfterSeconds? } · null 이면 "이 빌드엔 없음"
//   certificate       기존 driver 의 { start: bind, read: approval, sign: sign }
//   onOpen(id)        기존 「자세히」 (조건 상세·근거 보기)
//   onChange()        다시 그려 달라는 요청
//
// 새 쓰기 API 를 만들지 않는다. 읽기 둘(조회·근거)과 기존 인증 동작 셋만 쓴다.

import { resolveTargets } from './targets.js';
import { createReturnTracker, sessionStore, MAX_AWAY_MS } from './tracker.js';
import { conditionRows, createEvidenceLoader } from './evidence.js';
import { conditionCardsSection } from './cards.js';

export function createConditionCards({
  getState,
  read,
  isBusy = (e) => (e?.code ?? e?.message) === 'TEST_BUSY_OR_ENDED',
  loadEvidence = null,
  targets = () => null,
  refresh = null,
  // 어느 조건에 재확인을 보내나. 기본(tracker.defaultRefreshFor)은 강의·과제뿐 — 회고 재검증은
  // 별개 경로라 실제 연결 전엔 안 보낸다. 시연 페이지는 대역이 회고도 받아 따로 넘긴다.
  refreshFor = undefined,
  certificate = null,
  onOpen = () => {},
  onChange = () => {},
  storage = sessionStore(),
  nowMs = () => Date.now(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  isVisible = () => globalThis.document?.visibilityState !== 'hidden',
  doc = globalThis.document,
  win = globalThis,
  followUpMs,
  demo = false,
  sourceText = () => null,
  // 독립 프리뷰만 쓴다. 검사를 통과한 링크를 시연용 Moodle 대역 주소로 바꾼다.
  adaptLinks = (links) => links,
}) {
  if (typeof getState !== 'function' || typeof read !== 'function') throw new Error('CONDITION_CARDS_PORTS');

  let version = 0;
  let queued = false;
  let tracker = null;
  let trackerApp = null;
  let closed = false;

  // 「표시한 메시지에 서명」 을 보냈다는 표시. 같은 탭으로 HackerRank 에 다녀오면
  // 페이지가 새로 뜨므로 메모리만으로는 잊힌다. 잊으면 카드가 다시 '서명할 차례' 로
  // 보여 **두 번 서명하게 만들 수 있다.** 그래서 신청별로 저장하고 30분 뒤 버린다.
  const SIGNED_PREFIX = 'clear.condition-return.signed.v1:';
  const signedAt = (applicationId) => {
    if (!applicationId) return null;
    const v = Number(storage.get(SIGNED_PREFIX + applicationId));
    if (!Number.isFinite(v) || v <= 0) return null;
    const age = nowMs() - v;
    if (age < 0 || age > MAX_AWAY_MS) { storage.remove(SIGNED_PREFIX + applicationId); return null; }
    return v;
  };

  // 렌더 도중에 상태가 바뀌어도 그 자리에서 다시 그리지 않는다. 한 박자 뒤에 한 번.
  const notify = () => {
    version += 1;
    if (queued || closed) return;
    queued = true;
    queueMicrotask(() => { queued = false; if (!closed) onChange(); });
  };

  const loader = loadEvidence ? createEvidenceLoader({ load: loadEvidence, onChange: notify }) : null;

  const snapshotOf = (s) => conditionRows({ view: s?.view ?? null, operations: s?.operations ?? null });

  /** 신청이 정해져야 추적을 시작한다. 신청이 바뀌면 새로 만든다 */
  function trackerFor(applicationId) {
    if (!applicationId || closed) return null;
    if (tracker && trackerApp === applicationId) return tracker;
    tracker?.close();
    trackerApp = applicationId;
    tracker = createReturnTracker({
      applicationId,
      getRows: () => snapshotOf(getState())?.rows ?? null,
      read: async () => {
        const fresh = snapshotOf(await read());
        // 근거도 같은 판정 기준으로 맞춘다. 판정이 바뀌었으면 다시 읽는다.
        if (fresh && loader) void loader.ensure(fresh, { retryFailed: true });
        return fresh;
      },
      isBusy, storage, nowMs, setTimer, clearTimer, isVisible, onChange: notify,
      refresh,
      ...(typeof refreshFor === 'function' ? { refreshFor } : {}),
      // 재확인 명령의 기준 번호 = 지금 화면이 가진 **신청(판정) 개정 번호**
      getRevision: () => snapshotOf(getState())?.decision?.revision ?? null,
      ...(followUpMs ? { followUpMs } : {}),
    });
    tracker.attach({ doc, win });
    return tracker;
  }

  return Object.freeze({
    /** team-render 의 detailKey 에 넣는다. 카드 상태가 바뀌면 다시 그리게 */
    version: () => version,

    /** 호스트가 서명 성공을 확인한 뒤 부른다(기존 action 래퍼는 오류를 삼키므로) */
    markSigned() {
      const applicationId = getState()?.session?.applicationId ?? null;
      if (applicationId) storage.set(SIGNED_PREFIX + applicationId, String(nowMs()));
      notify();
    },

    render() {
      const s = getState() ?? {};
      const snapshot = snapshotOf(s);
      const applicationId = snapshot?.applicationId ?? s.session?.applicationId ?? null;
      const t = trackerFor(applicationId);
      if (snapshot && t) t.observe(snapshot);
      if (snapshot && loader) void loader.ensure(snapshot);
      const links = adaptLinks(resolveTargets(targets(), { applicationId }));
      return conditionCardsSection({
        snapshot,
        links,
        tracker: t,
        evidence: loader?.get(snapshot) ?? null,
        evidenceState: loader?.state(snapshot),
        session: s.session ?? null,
        approval: s.approval ?? null,
        signedAtMs: signedAt(s.session?.applicationId ?? null),
        certificate,
        busy: Boolean(s.busy),
        onOpen,
        sourceText: sourceText(),
        demo,
      });
    },

    /** 돌아온 것처럼 다시 읽게 한다(시험·프리뷰용) */
    arrive: () => tracker?.arrive(),
    status: (id) => tracker?.status(id) ?? null,

    close() { closed = true; tracker?.close(); },
  });
}
