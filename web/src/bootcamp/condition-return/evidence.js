// 조건 줄과 판정 근거 — 서버가 준 것만
//
// 카드가 읽는 곳은 둘이다.
//
//   조건 줄   procedure(view.criteria) 가 있으면 그것, 아직 절차가 준비되지 않았으면
//             operations 프로젝션(evidence.criteria). 수집 단계에서 학생이 원래
//             화면을 오가는 때가 바로 절차 준비 전이라 둘 다 받는다
//   판정 근거 GET /bootcamp/v3/applications/:id/decision-evidence/:decisionId
//             (normal-client.mjs 의 decisionEvidence). 회고 항목·원문 위치,
//             인증서 검증 결과, Moodle 완료·제출 기록이 여기 있다
//
// 근거는 **지금 판정과 같은 판정의 것일 때만** 쓴다. 기준은 기존 live-evidence.js 와
// 같다(신청·역할·판정 ID·판정 해시). 판정이 바뀌면 이전 근거를 버리고 다시 읽는다.

const ORDER = Object.freeze([
  ['activity-complete', 'MOODLE_ACTIVITY_COMPLETION'],
  ['assignment-submitted', 'MOODLE_ASSIGNMENT_SUBMISSION'],
  ['reflection-topics', 'MOODLE_REFLECTION_AI'],
  ['python-basic-certificate', 'RECLAIM_HACKERRANK'],
]);

export const CRITERION_IDS = Object.freeze(ORDER.map(([id]) => id));

/**
 * 화면이 쓰는 조건 줄 묶음.
 *
 * @returns {null | {source:'VIEW'|'OPERATIONS', applicationId:string, role:string,
 *   decision:{id:string, revision:number, hash:string}, current:boolean,
 *   observedAt:number|null, rows:object[]}}
 */
export function conditionRows({ view = null, operations = null } = {}) {
  if (Array.isArray(view?.criteria) && view.applicationId) {
    return Object.freeze({
      source: 'VIEW',
      applicationId: view.applicationId,
      role: view.role,
      decision: Object.freeze({ id: view.decision?.id, revision: view.decision?.revision, hash: view.decision?.hash }),
      current: view.decision?.current !== false,
      observedAt: view.observedAt ?? null,
      rows: view.criteria,
    });
  }
  const o = operations;
  if (Array.isArray(o?.evidence?.criteria) && o.applicationId) {
    // operations 에는 조건별 현재성이 없다. null 로 둔다 — true 로 채우지 않는다.
    const rows = ORDER.map(([criterionId, kind]) => {
      const r = o.evidence.criteria.find((x) => x?.criterionId === criterionId);
      if (!r) return null;
      return Object.freeze({
        criterionId, state: r.state, current: null, evidenceId: r.evidenceId ?? null,
        evidenceRevision: r.evidenceRevision ?? null, reasonCode: r.reasonCode ?? null, expiresAt: r.expiresAt ?? null,
        source: Object.freeze({ kind, hostMode: null, actualSourceVerification: null }),
        originalEvidence: null,
      });
    }).filter(Boolean);
    return Object.freeze({
      source: 'OPERATIONS',
      applicationId: o.applicationId,
      role: o.role === 'OPERATOR' ? 'COURSE_OPERATOR' : o.role,
      decision: Object.freeze({ id: o.decisionId, revision: o.decisionRevision, hash: o.decisionHash }),
      current: o.current !== false,
      observedAt: o.asOf?.observedAt ?? null,
      rows,
    });
  }
  return null;
}

/** 근거가 지금 판정의 것인가. live-evidence.js 와 같은 네 가지를 본다 */
export function evidenceMatches(snapshot, evidence) {
  return Boolean(snapshot && evidence
    && evidence.applicationId === snapshot.applicationId
    && evidence.role === snapshot.role
    && evidence.manifest?.decision?.decisionId === snapshot.decision.id
    && evidence.manifest.decision.decisionHash === snapshot.decision.hash);
}

/** 근거 묶음에서 한 조건 */
export function evidenceFor(evidence, criterionId) {
  return Object.freeze({
    row: evidence?.manifest?.criteria?.find((r) => r.criterionId === criterionId) ?? null,
    availability: evidence?.availability?.find((r) => r.criterionId === criterionId) ?? null,
    limitations: evidence?.limitations ?? null,
  });
}

export const EVIDENCE_LOAD = Object.freeze({
  IDLE: 'IDLE', LOADING: 'LOADING', READY: 'READY', FAILED: 'FAILED',
});

/**
 * 판정 근거 읽기. 판정(신청·ID·해시)마다 한 번만 읽고, 늦게 온 이전 판정의
 * 응답은 버린다.
 *
 * @param {(snapshot) => Promise<object>} load  기존 decisionEvidence 호출
 */
export function createEvidenceLoader({ load, onChange = () => {} }) {
  let key = null;
  let value = null;
  let state = EVIDENCE_LOAD.IDLE;
  let seq = 0;

  const keyOf = (s) => (s ? [s.applicationId, s.role, s.decision.id, s.decision.hash].join('|') : null);

  return Object.freeze({
    /** 지금 판정의 근거. 없거나 다른 판정의 것이면 null */
    get(snapshot) {
      return keyOf(snapshot) === key && evidenceMatches(snapshot, value) ? value : null;
    },
    state(snapshot) { return keyOf(snapshot) === key ? state : EVIDENCE_LOAD.IDLE; },
    /**
     * 판정이 바뀌었으면 읽는다. 같은 판정이면 다시 읽지 않는다.
     * 실패한 판정은 그리기마다 다시 묻지 않고, 학생이 돌아왔을 때(`retryFailed`)만 다시 묻는다.
     */
    async ensure(snapshot, { force = false, retryFailed = false } = {}) {
      const k = keyOf(snapshot);
      if (!k || !snapshot.decision.id) return null;
      const settled = state === EVIDENCE_LOAD.READY || state === EVIDENCE_LOAD.LOADING
        || (state === EVIDENCE_LOAD.FAILED && !retryFailed);
      if (k === key && !force && settled) return value;
      key = k; state = EVIDENCE_LOAD.LOADING; value = null;
      const mine = ++seq;
      onChange();
      try {
        const got = await load(snapshot);
        if (mine !== seq) return null;
        value = evidenceMatches(snapshot, got) ? got : null;
        state = value ? EVIDENCE_LOAD.READY : EVIDENCE_LOAD.FAILED;
      } catch {
        if (mine !== seq) return null;
        value = null; state = EVIDENCE_LOAD.FAILED;
      }
      onChange();
      return value;
    },
  });
}
