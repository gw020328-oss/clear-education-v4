// 원래 화면에 다녀온 뒤 판정 다시 읽기
//
// 학생이 카드의 「강의 열기」 를 누르면 떠나기 직전 그 조건의 서버 판정을
// 지문으로 남긴다. 탭으로 돌아오면(visibilitychange · pageshow · focus) 기존
// 조회 API 로 판정을 다시 읽고, 지문과 비교한다.
//
//   달라졌다   → UPDATED  서버가 새 판정을 줬다. 그 판정을 그대로 보여 준다
//   같다       → PENDING  '확인 중'. 정해진 간격으로 몇 번 더 읽는다
//   끝내 같다  → STALLED  자동 재조회를 멈추고 「다시 확인」 만 남긴다
//   못 읽었다  → READ_FAILED  이전 판정을 그대로 두고 그 사실을 말한다
//
// 지키는 것
//
//   돌아왔다는 사실만으로 충족으로 바꾸지 않는다. 상태를 바꾸는 건 서버 판정뿐이다
//   **조회 API 는 저장된 판정만 읽는다.** 2026-10-29 백엔드 답변대로 GET 은 원천을
//   다시 읽지 않는다. 그래서 '같다' 는 '아직 안 했다' 가 아니라 '서버가 아직 다시
//   읽지 않았다' 일 수 있다. 화면 문구가 그 차이를 말한다(status.js)
//   읽기만 한다. 서명·동의·재수집 요청 같은 쓰기를 보내지 않는다
//   탭이 가려져 있으면 읽지 않는다. 기존 자동 조회(createTestAutoReader)와 같은 원칙이다
//   저장소(sessionStorage)는 같은 탭으로 다녀오는 경우를 위한 것이다. 쓰기·읽기가
//   막혀 있어도 동작은 같아야 한다 — 실패는 조용히 메모리만 쓴다

export const RETURN = Object.freeze({
  IDLE: 'IDLE',               // 떠난 적 없다
  AWAY: 'AWAY',               // 원래 화면으로 갔다. 돌아오길 기다린다
  CHECKING: 'CHECKING',       // 돌아왔다. 판정을 읽는 중
  PENDING: 'PENDING',         // 읽었는데 판정이 그대로다. 확인 중
  UPDATED: 'UPDATED',         // 서버 판정이 바뀌었다
  STALLED: 'STALLED',         // 몇 번 더 읽어도 그대로다. 자동 재조회 멈춤
  READ_FAILED: 'READ_FAILED', // 읽지 못했다
  CANNOT_CHECK: 'CANNOT_CHECK', // 서버가 이 조건의 원천 재확인을 지원하지 않는다(UNAVAILABLE)
});

/**
 * 원천 재확인 요청의 결과. A 의 `source-refresh` 응답(검증표 11/5)과 같은 값이다.
 *
 *   QUEUED         접수됨. 새 판정은 아직이다 — **접수와 확정을 섞지 않는다**
 *   RATE_LIMITED   방금 요청했다. retryAfterSeconds 뒤에 다시
 *   RECORDED       서버가 이미 다시 읽어 기록했다. 조회하면 새 판정이 보여야 한다
 *   UNAVAILABLE    이 조건은 재확인을 지원하지 않는다(또는 준비 전)
 *   REQUEST_FAILED 요청 자체를 보내지 못했다(네트워크 등). 저장된 판정만 읽는다
 */
export const REFRESH = Object.freeze({
  QUEUED: 'QUEUED', RATE_LIMITED: 'RATE_LIMITED', RECORDED: 'RECORDED',
  UNAVAILABLE: 'UNAVAILABLE', REQUEST_FAILED: 'REQUEST_FAILED',
});

/** HackerRank 는 Reclaim 흐름이라 Moodle 원천 재확인 대상이 아니다 */
export const defaultRefreshFor = (criterionId) => criterionId !== 'python-basic-certificate';

/** 돌아온 뒤 다시 읽는 간격. 합쳐서 2분이 안 된다 */
export const FOLLOW_UP_MS = Object.freeze([3000, 7000, 15000, 30000, 60000]);

/** 이보다 오래 떠나 있던 기록은 버린다. 다음날 열었을 때 '확인 중' 이 남지 않게 */
export const MAX_AWAY_MS = 30 * 60 * 1000;

/** 복귀 신호가 겹쳐 올 때(focus + visibilitychange) 다시 읽지 않는 간격 */
const ARRIVE_GAP_MS = 2000;

const STORE_PREFIX = 'clear.condition-return.v1:';
const LIVE = new Set([RETURN.AWAY, RETURN.CHECKING, RETURN.PENDING, RETURN.STALLED, RETURN.READ_FAILED, RETURN.CANNOT_CHECK]);

const rowOf = (rows, criterionId) => (rows ?? []).find((r) => r?.criterionId === criterionId) ?? null;

/**
 * 조건 한 줄의 지문. 서버가 판정을 바꾸면 이 중 하나가 바뀐다.
 *
 * 판정 전체(decision.id·revision)는 넣지 않는다. 다른 조건 때문에 판정
 * 회차가 올라간 것을 '이 조건이 반영됐다' 로 읽으면 안 된다.
 */
export function rowFingerprint(rows, criterionId) {
  const row = (rows ?? []).find((r) => r?.criterionId === criterionId);
  if (!row) return null;
  return JSON.stringify([
    row.state ?? null, row.current ?? null, row.evidenceId ?? null,
    row.evidenceRevision ?? null, row.reasonCode ?? null,
  ]);
}

/** sessionStorage 를 감싼다. 막혀 있으면(사생활 모드·미리보기) 아무 일도 안 한다 */
export function sessionStore(win = globalThis) {
  return Object.freeze({
    get(key) { try { return win.sessionStorage?.getItem(key) ?? null; } catch { return null; } },
    set(key, value) { try { win.sessionStorage?.setItem(key, value); } catch { /* 메모리만 쓴다 */ } },
    remove(key) { try { win.sessionStorage?.removeItem(key); } catch { /* 메모리만 쓴다 */ } },
  });
}

export const memoryStore = () => {
  const m = new Map();
  return Object.freeze({
    get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => { m.set(k, String(v)); }, remove: (k) => { m.delete(k); },
  });
};

/**
 * @param {object} o
 * @param {string} o.applicationId     이 화면의 신청. 저장 열쇠와 응답 검사에 쓴다
 * @param {() => object[]|null} o.getRows   지금 화면이 가진 조건 줄
 * @param {() => Promise<{applicationId:string, rows:object[], current?:boolean}>} o.read
 *        기존 조회 API 를 부르는 함수. 쓰기를 하지 않아야 한다
 * @param {(error:any) => boolean} [o.isBusy]  다른 조회가 진행 중이라 못 읽은 경우
 * @param {null | ((req:{criterionId:string, expectedRevision:any}) => Promise<null|{status:string, operationId?:string, retryAfterSeconds?:number}>)} [o.refresh]
 *        원천 재확인 요청(A 의 source-refresh). 없으면 저장된 판정만 읽는다(지금 develop).
 *        null 을 돌려주면 "이 빌드에는 그 경로가 없다" 는 뜻으로, 요청하지 않은 것과 같다.
 * @param {(criterionId:string) => boolean} [o.refreshFor]  어느 조건에 요청하나. 기본은 Moodle 셋
 */
export function createReturnTracker({
  applicationId,
  getRows,
  read,
  isBusy = () => false,
  refresh = null,
  refreshFor = defaultRefreshFor,
  storage = sessionStore(),
  nowMs = () => Date.now(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  isVisible = () => true,
  followUpMs = FOLLOW_UP_MS,
  maxAwayMs = MAX_AWAY_MS,
  onChange = () => {},
}) {
  if (typeof applicationId !== 'string' || !applicationId) throw new Error('CONDITION_RETURN_APPLICATION');
  if (typeof read !== 'function' || typeof getRows !== 'function') throw new Error('CONDITION_RETURN_PORTS');

  const key = STORE_PREFIX + applicationId;
  /** @type {Map<string, object>} */
  const visits = new Map();
  let timer = null;
  let inflight = null;
  let lastCheckAt = null;
  let closed = false;
  let detach = null;

  const emit = () => { if (!closed) onChange(); };

  const persist = () => {
    const keep = {};
    for (const [id, v] of visits) {
      if (LIVE.has(v.state)) {
        keep[id] = {
          departedAt: v.departedAt, baseline: v.baseline, attempts: v.attempts,
          expectedRevision: v.expectedRevision ?? null, refresh: v.refresh ?? null,
        };
      }
    }
    if (Object.keys(keep).length === 0) storage.remove(key);
    else storage.set(key, JSON.stringify({ v: 1, visits: keep }));
  };

  // 같은 탭으로 갔다 온 경우. 저장된 방문을 AWAY 로 되살린다.
  (() => {
    let saved;
    try { saved = JSON.parse(storage.get(key) ?? 'null'); } catch { saved = null; }
    if (saved?.v !== 1 || !saved.visits || typeof saved.visits !== 'object') return;
    const at = nowMs();
    for (const [id, v] of Object.entries(saved.visits)) {
      const ok = Number.isFinite(v?.departedAt) && at - v.departedAt >= 0 && at - v.departedAt <= maxAwayMs
        && (v.baseline === null || typeof v.baseline === 'string');
      if (ok) {
        visits.set(id, {
          state: RETURN.AWAY, departedAt: v.departedAt, baseline: v.baseline, attempts: 0, checkedAt: null, error: null,
          expectedRevision: v.expectedRevision ?? null, refresh: v.refresh ?? null, needsRefresh: false,
        });
      }
    }
    persist();
  })();

  const stopTimer = () => { if (timer !== null) clearTimer(timer); timer = null; };

  const waiting = () => [...visits.values()].filter((v) => v.state === RETURN.PENDING || v.state === RETURN.CHECKING);

  const schedule = () => {
    stopTimer();
    if (closed || !isVisible()) return;
    const due = waiting().map((v) => {
      const base = followUpMs[v.attempts - 1];
      // 서버가 "N초 뒤에" 라고 했으면 그보다 빨리 다시 묻지 않는다.
      const retry = v.refresh?.status === REFRESH.RATE_LIMITED && Number.isFinite(v.refresh.retryAfterSeconds)
        ? v.refresh.retryAfterSeconds * 1000 : 0;
      return Number.isFinite(base) ? Math.max(base, retry) : base;
    }).filter((ms) => Number.isFinite(ms));
    if (due.length === 0) return;
    timer = setTimer(() => { timer = null; void check(); }, Math.min(...due));
  };

  /**
   * 새 조건 줄을 받아 떠난 조건들과 비교한다.
   *
   * 기존 자동 조회가 이미 읽어 온 결과도 여기로 넣으면 따로 읽지 않아도 된다.
   * `fromCheck` 가 아니면 '확인 중' 회수를 늘리지 않는다 — 학생이 아직 돌아오지
   * 않은 채 다른 경로로 들어온 결과다.
   */
  function observe(result, { fromCheck = false } = {}) {
    if (closed || !result || result.applicationId !== applicationId) return;
    const at = nowMs();
    let changed = false;
    for (const [id, v] of visits) {
      if (!LIVE.has(v.state)) continue;
      const now = rowFingerprint(result.rows, id);
      // 현재 판정이 아니라는 응답은 반영으로 치지 않는다.
      const differs = now !== null && now !== v.baseline && result.current !== false;
      if (differs) {
        visits.set(id, { ...v, state: RETURN.UPDATED, checkedAt: at, updatedAt: at, error: null });
        changed = true;
      } else if (fromCheck && v.state !== RETURN.AWAY) {
        const attempts = v.attempts + 1;
        // 서버가 "이 조건은 재확인 못 한다" 고 했으면 더 묻지 않는다. '아직 확인할 수
        // 없음' 으로 두고 「다시 확인」 만 남긴다. 반영 안 됨(STALLED)과 다른 말이다.
        const cannot = v.refresh?.status === REFRESH.UNAVAILABLE;
        visits.set(id, {
          ...v, attempts, checkedAt: at, error: null,
          state: cannot ? RETURN.CANNOT_CHECK : attempts > followUpMs.length ? RETURN.STALLED : RETURN.PENDING,
        });
        changed = true;
      }
    }
    if (changed) { persist(); emit(); }
  }

  /**
   * 원천 재확인 요청. 읽기 전에 조건마다 한 번 보낸다.
   *
   * 응답은 기록만 한다 — **접수(QUEUED)는 판정이 아니다.** 판정이 바뀌었는지는
   * 그 뒤의 read() 와 지문 비교가 정한다. 요청이 실패해도 읽기는 계속한다.
   */
  async function requestRefresh(targets) {
    if (typeof refresh !== 'function') return;
    for (const [id, v] of targets) {
      if (!v.needsRefresh || !refreshFor(id)) continue;
      let r;
      try {
        r = await refresh({ criterionId: id, expectedRevision: v.expectedRevision ?? null });
      } catch (error) {
        r = { status: REFRESH.REQUEST_FAILED, error: String(error?.code ?? error?.message ?? 'REQUEST_FAILED') };
      }
      const cur = visits.get(id);
      if (!cur || closed) continue;
      // null 은 "이 빌드엔 그 경로가 없다". 요청하지 않은 것과 같이 둔다.
      if (r === null || r === undefined) { visits.set(id, { ...cur, needsRefresh: false }); continue; }
      const status = Object.values(REFRESH).includes(r.status) ? r.status : REFRESH.REQUEST_FAILED;
      visits.set(id, {
        ...cur,
        // 제한에 걸렸으면 다음 읽기 때 다시 요청한다. 접수·기록·불가면 더 보내지 않는다.
        needsRefresh: status === REFRESH.RATE_LIMITED,
        refresh: {
          status,
          operationId: typeof r.operationId === 'string' ? r.operationId : null,
          retryAfterSeconds: Number.isFinite(r.retryAfterSeconds) ? r.retryAfterSeconds : null,
          at: nowMs(),
          error: r.error ?? null,
        },
      });
    }
    emit();
  }

  async function check() {
    if (closed) return undefined;
    if (inflight) return inflight;
    const targets = [...visits.entries()].filter(([, v]) => v.state !== RETURN.AWAY && LIVE.has(v.state));
    if (targets.length === 0) return undefined;
    stopTimer();
    for (const [id, v] of targets) visits.set(id, { ...v, state: RETURN.CHECKING });
    emit();
    inflight = (async () => {
      try {
        await requestRefresh(targets);
        const result = await read();
        observe(result, { fromCheck: true });
      } catch (error) {
        const at = nowMs();
        for (const [id, v] of visits) {
          if (v.state !== RETURN.CHECKING) continue;
          if (isBusy(error)) {
            // 다른 조회가 진행 중이었을 뿐이다. 실패로 적지 않고 '그대로' 와 같이
            // 센다 — 그 조회 결과는 observe() 로 들어온다. 회수를 세야 바쁜 상태가
            // 길어져도 끝없이 다시 묻지 않는다.
            const attempts = v.attempts + 1;
            visits.set(id, { ...v, attempts, state: attempts > followUpMs.length ? RETURN.STALLED : RETURN.PENDING });
          } else {
            visits.set(id, { ...v, state: RETURN.READ_FAILED, checkedAt: at, error: String(error?.code ?? error?.message ?? 'READ_FAILED') });
          }
        }
        persist(); emit();
      } finally {
        inflight = null;
        lastCheckAt = nowMs();
        schedule();
      }
    })();
    return inflight;
  }

  /** 원래 화면으로 떠난다. 지금 판정을 지문으로 남긴다 */
  function depart(criterionId) {
    if (closed || typeof criterionId !== 'string') return;
    const rows = getRows();
    visits.set(criterionId, {
      state: RETURN.AWAY, departedAt: nowMs(), baseline: rowFingerprint(rows, criterionId),
      attempts: 0, checkedAt: null, error: null,
      // 재확인 요청에 "이 회차 기준" 으로 보낸다. 서버가 그 사이 바뀐 것을 알 수 있게.
      expectedRevision: rowOf(rows, criterionId)?.evidenceRevision ?? null,
      refresh: null, needsRefresh: false,
    });
    persist(); emit();
  }

  /**
   * 돌아왔다. 떠났던 조건이 있으면 판정을 다시 읽는다.
   *
   * focus 와 visibilitychange 가 거의 동시에 오고, 창을 오갈 때마다 focus 가
   * 온다. 방금 읽었으면(2초 안) 떠났다 온 조건이 없는 한 다시 읽지 않는다.
   */
  function arrive() {
    if (closed || !isVisible()) return undefined;
    let fresh = false;
    for (const [id, v] of visits) {
      // 돌아온 조건마다 재확인을 한 번 요청한다(포트가 있을 때).
      if (v.state === RETURN.AWAY) { visits.set(id, { ...v, state: RETURN.CHECKING, attempts: 0, needsRefresh: true }); fresh = true; }
    }
    const live = [...visits.values()].some((v) => LIVE.has(v.state));
    if (!live) return undefined;
    if (!fresh && lastCheckAt !== null && nowMs() - lastCheckAt < ARRIVE_GAP_MS) return inflight ?? undefined;
    return check();
  }

  /** 학생이 「다시 확인」 을 눌렀다. 멈췄던 재조회도 처음부터 다시 센다 */
  function recheck(criterionId) {
    const v = visits.get(criterionId);
    if (closed || !v || !LIVE.has(v.state)) return undefined;
    // 「다시 확인」 은 재확인 요청도 다시 보낸다. 멈춤·불가 뒤에 서버가 바뀌었을 수 있다.
    visits.set(criterionId, { ...v, state: RETURN.CHECKING, attempts: 0, error: null, needsRefresh: true });
    return check();
  }

  function status(criterionId) {
    const v = visits.get(criterionId);
    return Object.freeze(v ? { ...v } : { state: RETURN.IDLE });
  }

  /** 탭 복귀 신호를 듣는다. 떼어 낼 함수를 돌려준다 */
  function attach({ doc = globalThis.document, win = globalThis } = {}) {
    if (detach) return detach;
    const onVisible = () => {
      if (doc?.visibilityState === 'hidden') { stopTimer(); return; }
      void arrive();
    };
    const onShow = () => { void arrive(); };
    doc?.addEventListener?.('visibilitychange', onVisible);
    win?.addEventListener?.('pageshow', onShow);
    win?.addEventListener?.('focus', onShow);
    detach = () => {
      doc?.removeEventListener?.('visibilitychange', onVisible);
      win?.removeEventListener?.('pageshow', onShow);
      win?.removeEventListener?.('focus', onShow);
      detach = null;
    };
    return detach;
  }

  function close() { closed = true; stopTimer(); detach?.(); }

  return Object.freeze({ depart, arrive, recheck, observe, status, attach, close });
}
