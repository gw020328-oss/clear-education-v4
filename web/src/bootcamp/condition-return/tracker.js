// 원래 화면에 다녀온 뒤 판정 다시 읽기
//
// 학생이 카드의 「강의 열기」 를 누르면 떠나기 직전 그 조건의 서버 판정을
// 지문으로 남긴다. 탭으로 돌아오면(visibilitychange · pageshow · focus) 기존
// 조회 API 로 판정을 다시 읽고, 지문과 비교한다.
//
//   달라졌다   → UPDATED  서버가 새 판정을 줬다. 그 판정을 그대로 보여 준다
//     단, 접수 직후 첫 읽기에 이미 바뀌어 있으면 **지난 요청의 늦은 판정**이다 —
//     보류(PENDING)하고 한 번 더 요청해 서버가 이미 읽었다(RECORDED)고 할 때 확정한다.
//     근거(evidenceId) 없는 줄로 바뀐 것은 중간 단계라 확정하지 않고 계속 읽는다
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
 * 이번 방문의 재확인 요청이 아직 처리 전인가. 접수(QUEUED)·제한(RATE_LIMITED)이면 그렇다.
 * 요청 경로가 없거나(null) 못 보냈거나(REQUEST_FAILED) 미지원(UNAVAILABLE)·이미 읽음(RECORDED)이면
 * 더 기다릴 근거가 없으니 바뀐 판정을 그대로 받는다.
 */
const unconfirmed = (v) => v?.requested === false || v?.refresh?.status === REFRESH.QUEUED || v?.refresh?.status === REFRESH.RATE_LIMITED;

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
  // 재확인 명령에 넣는 **신청 개정 번호**(오규원 11/5: expectedRevision 은 명령의 기준이
  // 되는 신청 개정 번호이지, 조건 근거 번호(evidenceRevision)가 아니다).
  getRevision = () => null,
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
  // 방문 식별. depart·recheck 마다 새로 매긴다. 조회·요청을 기다리는 동안 방문이
  // 바뀌었으면 이전 방문의 요청을 보내거나 새 방문을 덮지 않는다. 저장하지 않는다.
  let visitSeq = 0;
  const nextVisitRef = () => (visitSeq += 1);

  const emit = () => { if (!closed) onChange(); };
  const canRefresh = (id) => typeof refresh === 'function' && refreshFor(id);

  const persist = () => {
    const keep = {};
    for (const [id, v] of visits) {
      if (LIVE.has(v.state)) {
        keep[id] = {
          departedAt: v.departedAt, baseline: v.baseline, baselineState: v.baselineState ?? null, attempts: v.attempts,
          nextAllowedAt: v.nextAllowedAt ?? 0, refresh: v.refresh ?? null,
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
          state: RETURN.AWAY, departedAt: v.departedAt, departed: true, baseline: v.baseline, baselineState: v.baselineState ?? null,
          attempts: 0, checkedAt: null, error: null,
          nextAllowedAt: v.nextAllowedAt ?? 0, refresh: v.refresh ?? null, needsRefresh: false, requested: false,
          visitRef: nextVisitRef(),
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
      const base = followUpMs[Math.max(0, v.attempts - 1)];
      // 서버가 "N초 뒤에" 라고 했으면 그보다 빨리 다시 묻지 않는다.
      const retry = Math.max(0, (v.nextAllowedAt ?? 0) - nowMs());
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
  function observe(result, { fromCheck = false, visitRefs = null } = {}) {
    if (closed || !result || result.applicationId !== applicationId) return;
    const at = nowMs();
    let changed = false;
    for (const [id, v] of visits) {
      if (!LIVE.has(v.state) || (visitRefs && visitRefs.get(id) !== v.visitRef)) continue;
      const now = rowFingerprint(result.rows, id);
      const row = rowOf(result.rows, id);
      // 이번 요청 뒤 몇 번째 읽기인가. 요청 응답을 받을 때 0 으로 돌아간다.
      const readsSince = (v.readsSince ?? 0) + 1;
      const ref = v.held ?? v.baseline;
      // 현재 판정이 아니라는 응답은 반영으로 치지 않는다.
      const differs = now !== null && now !== ref && result.current !== false;
      // 보류했던 변화가 이번 요청의 결과로 확인됐다(서버가 이번 요청을 읽었다고 함).
      const heldConfirmed = v.held != null && !unconfirmed(v) && now !== null && result.current !== false;

      if (differs && !v.held && canRefresh(id) && unconfirmed(v)) {
        // 이번 방문의 재확인 요청이 **아직 처리 전**(안 보냈거나·접수·제한)인데 판정이 바뀌어
        // 있다. 그 변화는 지난 요청의 늦은 결과일 수 있다 — 회고를 고쳐 올리고 바로 돌아오면
        // 지난 글의 '미충족' 이 이때 도착한다. 확정하지 않고 보류(held)로 적는다. 같은 회차에
        // 한 번 더 물어 서버가 "이미 읽었다(RECORDED)" 고 하면 그때 확정한다(check 참고).
        // 늘 접수만 답하는 서버라면 끝내 STALLED 로 닫히고 문구가 그 사실을 말한다.
        const attempts = fromCheck ? v.attempts + 1 : v.attempts;
        visits.set(id, {
          ...v, attempts, readsSince, checkedAt: at, error: null, held: now, lateChange: true, needsRefresh: true,
          state: attempts > followUpMs.length ? RETURN.STALLED : RETURN.PENDING,
        });
        changed = true;
      } else if (differs || heldConfirmed) {
        const final = now !== v.baseline;
        // 근거 없는 줄(evidenceId 없음)은 아직 판정이 아니다 — 회고 승인 대기·검토 중,
        // HackerRank 검증 전이 그렇다. '새 판정 확정' 으로 닫지 않고 계속 읽는다.
        const interim = !row?.evidenceId;
        if (!final || interim) {
          const attempts = fromCheck ? v.attempts + 1 : v.attempts;
          const next = {
            ...v, attempts, readsSince, checkedAt: at, error: null, held: null, lateChange: false,
            state: attempts > followUpMs.length ? RETURN.STALLED : RETURN.PENDING,
          };
          // 중간 단계로 바뀐 것은 기준을 그 줄로 옮겨 다음 변화만 본다.
          if (final && interim) { next.baseline = now; next.baselineState = row?.state ?? null; }
          visits.set(id, next);
          changed = changed || fromCheck || v.held != null || (final && interim);
        } else {
          // 새 근거는 왔는데 판정 상태는 같을 수 있다(미충족 → 새 근거로도 미충족).
          // 그건 '재확인 완료' 이지 '판정이 바뀜' 이 아니다. 둘을 따로 적는다.
          const sameState = (row?.state ?? null) === (v.baselineState ?? null);
          visits.set(id, { ...v, state: RETURN.UPDATED, sameState, held: null, lateChange: false, readsSince, checkedAt: at, updatedAt: at, error: null });
          changed = true;
        }
      } else if (fromCheck && v.state !== RETURN.AWAY) {
        const attempts = v.attempts + 1;
        // 서버가 "이 조건은 재확인 못 한다" 고 했으면 더 묻지 않는다. '아직 확인할 수
        // 없음' 으로 두고 「다시 확인」 만 남긴다. 반영 안 됨(STALLED)과 다른 말이다.
        const cannot = v.refresh?.status === REFRESH.UNAVAILABLE;
        visits.set(id, {
          ...v, attempts, readsSince, checkedAt: at, error: null,
          state: cannot ? RETURN.CANNOT_CHECK : attempts > followUpMs.length ? RETURN.STALLED : RETURN.PENDING,
        });
        changed = true;
      } else {
        visits.set(id, { ...v, readsSince });
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
      if (closed) return;
      if (!v.needsRefresh || !refreshFor(id) || nowMs() < (v.nextAllowedAt ?? 0)) continue;
      const ref = v.visitRef;
      // read() may return a fresh snapshot without updating the host's getState().
      const latest = await read();
      // 조회하는 동안 닫혔거나(로그아웃·신청 전환) 이 조건의 방문이 새 depart·recheck 로
      // 바뀌었으면 보내지 않는다. 제한 시각도 지금 방문 기준으로 다시 본다.
      const live = visits.get(id);
      if (closed || !live || live.visitRef !== ref || !live.needsRefresh || nowMs() < (live.nextAllowedAt ?? 0)) continue;
      if (!latest || latest.applicationId !== applicationId || latest.current === false) continue;
      const revision = latest.decision?.revision ?? getRevision() ?? null;
      let r;
      try {
        r = await refresh({ criterionId: id, expectedRevision: revision });
      } catch (error) {
        r = { status: REFRESH.REQUEST_FAILED, error: String(error?.code ?? error?.message ?? 'REQUEST_FAILED') };
      }
      const cur = visits.get(id);
      if (!cur || closed) continue;
      // null 은 "이 빌드엔 그 경로가 없다". 요청하지 않은 것과 같이 둔다.
      if (r === null || r === undefined) { if (cur.visitRef === ref) visits.set(id, { ...cur, needsRefresh: false, requested: true }); continue; }
      const status = Object.values(REFRESH).includes(r.status) ? r.status : REFRESH.REQUEST_FAILED;
      if (cur.visitRef !== ref) {
        // 요청은 이미 나갔고 응답 전에 방문이 바뀌었다. 새 방문의 상태·요청 결과는 덮지 않고,
        // 서버가 준 조건별 제한 시각만 이어 받는다(더 늦은 쪽).
        if (status === REFRESH.RATE_LIMITED && Number.isFinite(r.retryAfterSeconds)) {
          visits.set(id, { ...cur, nextAllowedAt: Math.max(cur.nextAllowedAt ?? 0, nowMs() + Math.max(0, r.retryAfterSeconds) * 1000) });
        }
        continue;
      }
      visits.set(id, {
        ...cur,
        requested: true,
        // 제한에 걸렸으면 다음 읽기 때 다시 요청한다. 접수·기록·불가면 더 보내지 않는다 —
        // 단, 늦은 판정을 보류 중이면 서버가 '이미 읽었다' 고 할 때까지 읽기마다 한 번 더 묻는다.
        needsRefresh: status === REFRESH.RATE_LIMITED || (status === REFRESH.QUEUED && cur.held != null),
        nextAllowedAt: status === REFRESH.RATE_LIMITED && Number.isFinite(r.retryAfterSeconds)
          ? nowMs() + Math.max(0, r.retryAfterSeconds) * 1000 : 0,
        readsSince: 0,
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
    const visitRefs = new Map(targets.map(([id, v]) => [id, v.visitRef]));
    stopTimer();
    for (const [id, v] of targets) visits.set(id, { ...v, state: RETURN.CHECKING });
    emit();
    inflight = (async () => {
      try {
        await requestRefresh(targets);
        const result = await read();
        observe(result, { fromCheck: true, visitRefs });
        // 보류한 변화가 있으면 다음 간격을 기다리지 않고 지금 한 번 더 묻는다. 서버가
        // RECORDED 라고 하면 같은 조회 결과로 바로 확정한다(정상 경로는 늦어지지 않는다).
        // 제한에 걸리면 다음 간격에 다시 묻는다. 요청 수는 바뀐 조건당 한 번 더다.
        const held = [...visits.entries()].filter(([id, v]) => v.held != null && v.needsRefresh
          && visitRefs.get(id) === v.visitRef && nowMs() >= (v.nextAllowedAt ?? 0));
        if (held.length > 0) {
          await requestRefresh(held);
          observe(result, { fromCheck: false, visitRefs });
        }
      } catch (error) {
        const at = nowMs();
        for (const [id, v] of visits) {
          if (closed || v.state !== RETURN.CHECKING || visitRefs.get(id) !== v.visitRef) continue;
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
      state: RETURN.AWAY, departedAt: nowMs(), departed: true, baseline: rowFingerprint(rows, criterionId),
      baselineState: rowOf(rows, criterionId)?.state ?? null,
      attempts: 0, checkedAt: null, error: null,
      // 재확인 명령의 기준 — **신청 개정 번호**. 조건 근거 번호가 아니다.
      nextAllowedAt: visits.get(criterionId)?.nextAllowedAt ?? 0,
      refresh: null, needsRefresh: false, requested: false, visitRef: nextVisitRef(),
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
    if (closed || typeof criterionId !== 'string') return undefined;
    const v = visits.get(criterionId);
    if (!v || !LIVE.has(v.state)) {
      // 떠난 기록이 없어도 된다 — 학생이 카드 버튼을 안 거치고 Moodle 에서 직접 마친 뒤
      // 「다시 확인」 을 눌렀다. 지금 판정을 기준으로 새 방문을 만들고 재확인을 요청한다.
      // 돌아온 것이 아니므로 departed=false — 회고 카드가 '고친 글' 이라고 말하지 않는다.
      const rows = getRows();
      visits.set(criterionId, {
        state: RETURN.CHECKING, departedAt: nowMs(), departed: false,
        baseline: rowFingerprint(rows, criterionId), baselineState: rowOf(rows, criterionId)?.state ?? null,
        attempts: 0, checkedAt: null, error: null, nextAllowedAt: v?.nextAllowedAt ?? 0,
        refresh: null, needsRefresh: true, requested: false, held: null, lateChange: false, visitRef: nextVisitRef(),
      });
      return check();
    }
    // 「다시 확인」 은 재확인 요청도 다시 보낸다. 멈춤·불가 뒤에 서버가 바뀌었을 수 있다.
    visits.set(criterionId, { ...v, state: RETURN.CHECKING, attempts: 0, error: null, needsRefresh: true, requested: false, held: null, lateChange: false, visitRef: nextVisitRef() });
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
