// 독립 프리뷰의 시연용 서버 대역 — 실서버가 아니다
//
// 프리뷰(web/condition-cards.html)와 Moodle 대역 탭(web/condition-cards-moodle.html)이
// 같은 localStorage 를 나눠 쓴다. 대역 탭에서 '완료' 를 누르면 Moodle 기록만 바뀌고,
// CLEAR 판정은 **서버 대역이 원천을 다시 읽어야** 바뀐다. 그게 이 시연의 요점이다.
//
//   재수집 모드 DELAYED  기록이 생기고 lag 초 뒤 서버가 다시 읽었다고 친다.
//                        A 에게 요청한 '원천 재조회' 가 생기면 이렇게 보인다
//   재수집 모드 NEVER    지금 develop 과 같다. 조회는 저장된 판정만 읽고 아무것도
//                        바뀌지 않는다 → 카드는 '확인 중' 뒤 '아직 반영되지 않았어요'
//
// 회고 판정은 AI 가 아니다. 시연 판정기가 예문 문장(specs/bootcamp/reflection-example.json
// 과 같은 세 문장)이 글에 그대로 있는지만 본다. 화면에도 시연이라고 적는다.

export const DEMO_KEY = 'clear.demo.condition-cards.v1';
export const DEMO_APPLICATION = 'application-demo-cards';

export const DEMO_REFLECTION = Object.freeze({
  'work-performed': 'for 반복문으로 목록의 합계를 구하는 코드를 작성했습니다.',
  'problem-solving-process': '빈 목록에서 결과가 달라져 초기값을 0으로 두고 다시 확인했습니다.',
  'learning-takeaway': '초기값과 경계 입력을 함께 점검해야 한다는 점을 배웠습니다.',
});

export const DEMO_REFLECTION_TEXT = Object.values(DEMO_REFLECTION).join('\n');

const HR_MESSAGE = 'CLEAR HackerRank evidence observation approval; not a payment authorization.\n'
  + 'application: application-demo-cards\npurpose: HACKERRANK_EVIDENCE_OBSERVATION_NOT_PAYMENT_AUTHORIZATION\n'
  + '(시연 메시지 · 실제 서명 아님)';

const fresh = () => ({
  v: 1,
  mode: 'DELAYED',
  lagMs: 5000,
  moodle: { activityAt: null, assignmentAt: null, reflection: null },
  hr: { boundAt: null, messageAt: null, signedAt: null, consentAt: null },
});

/** localStorage 를 감싼다. 막혀 있으면 메모리만 쓴다(그러면 대역 탭과 공유되지 않는다) */
export function demoStore(win = globalThis) {
  let memory = null;
  return Object.freeze({
    load() {
      try {
        const raw = win.localStorage?.getItem(DEMO_KEY);
        if (raw) { const v = JSON.parse(raw); if (v?.v === 1) return v; }
      } catch { /* 메모리로 */ }
      return memory ?? fresh();
    },
    save(state) {
      memory = state;
      try { win.localStorage?.setItem(DEMO_KEY, JSON.stringify(state)); } catch { /* 메모리로 */ }
    },
    reset() { memory = null; try { win.localStorage?.removeItem(DEMO_KEY); } catch { /* 없음 */ } },
  });
}

const hex = (n) => `0x${n.toString(16).padStart(64, '0')}`;

/** 짧은 문자열 지문(FNV-1a 32비트). 시연 판정 ID 용이다 — 보안 용도가 아니다 */
function fnv(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}

/**
 * @param {object} o
 * @param {ReturnType<typeof demoStore>} o.store
 * @param {() => number} [o.nowMs]
 */
export function createDemoServer({ store, nowMs = () => Date.now() }) {
  const update = (fn) => { const s = store.load(); fn(s); store.save(s); return s; };

  /** 서버가 '다시 읽었다' 고 볼 시점이 지났나 */
  const seen = (s, at) => at !== null && at !== undefined && s.mode === 'DELAYED' && nowMs() >= at + s.lagMs;

  function reflectionStage(s) {
    const r = s.moodle.reflection;
    if (!r || !seen(s, r.at)) return { stage: 'NONE' };
    const t = nowMs() - r.at - s.lagMs;
    if (t < s.lagMs) return { stage: 'APPROVAL' };
    if (t < s.lagMs * 2) return { stage: 'REVIEWING' };
    const topics = Object.entries(DEMO_REFLECTION).map(([topicId, quote]) => {
      const start = r.text.indexOf(quote);
      return start >= 0
        ? { topicId, state: 'PRESENT', location: { start, end: start + quote.length } }
        : { topicId, state: 'ABSENT', location: null };
    });
    return { stage: 'REVIEWED', topics, at: r.at + s.lagMs * 3 };
  }

  function rows(s) {
    const activity = seen(s, s.moodle.activityAt);
    const assignment = seen(s, s.moodle.assignmentAt);
    const refl = reflectionStage(s);
    const hrDone = seen(s, s.hr.consentAt);
    const met = refl.stage === 'REVIEWED' && refl.topics.every((t) => t.state === 'PRESENT');
    return [
      { criterionId: 'activity-complete', state: activity ? 'MET' : 'NOT_MET', current: true,
        evidenceId: activity ? 'evidence-demo-activity-2' : 'evidence-demo-activity-1', evidenceRevision: activity ? 2 : 1,
        reasonCode: activity ? null : 'TARGET_COUNT_NOT_REACHED' },
      { criterionId: 'assignment-submitted', state: assignment ? 'MET' : 'NOT_MET', current: true,
        evidenceId: assignment ? 'evidence-demo-assign-2' : 'evidence-demo-assign-1', evidenceRevision: assignment ? 2 : 1,
        reasonCode: assignment ? null : 'EVIDENCE_MISSING' },
      { criterionId: 'reflection-topics', state: refl.stage === 'REVIEWED' ? (met ? 'MET' : 'NOT_MET') : 'MISSING', current: true,
        evidenceId: refl.stage === 'REVIEWED' ? 'evidence-demo-reflection-1' : null, evidenceRevision: refl.stage === 'REVIEWED' ? 1 : null,
        reasonCode: refl.stage === 'REVIEWED' ? null : 'SOURCE_UNAVAILABLE' },
      { criterionId: 'python-basic-certificate', state: hrDone ? 'MET' : 'UNKNOWN', current: true,
        evidenceId: hrDone ? 'evidence-demo-hr-1' : null, evidenceRevision: hrDone ? 1 : null,
        reasonCode: hrDone ? null : 'SOURCE_UNAVAILABLE' },
    ].map((r) => ({
      ...r, expiresAt: null,
      source: { kind: { 'activity-complete': 'MOODLE_ACTIVITY_COMPLETION', 'assignment-submitted': 'MOODLE_ASSIGNMENT_SUBMISSION',
        'reflection-topics': 'MOODLE_REFLECTION_AI', 'python-basic-certificate': 'RECLAIM_HACKERRANK' }[r.criterionId],
      hostMode: 'SYNTHETIC_TEST_SOURCE', actualSourceVerification: null },
      originalEvidence: { authorized: true, httpAvailable: false },
    }));
  }

  function view() {
    const s = store.load();
    const criteria = rows(s);
    // 조건 줄이 바뀔 때만 판정이 바뀐다. 같은 줄이면 같은 판정 ID·해시다.
    const id = fnv(JSON.stringify(criteria.map((r) => [r.state, r.evidenceId])));
    const revision = 1 + criteria.filter((r) => r.state === 'MET').length + (criteria[2].state === 'NOT_MET' ? 1 : 0);
    return {
      version: 'clear-bootcamp-normal-view.1', displayOnly: true, applicationId: DEMO_APPLICATION,
      role: 'PARTICIPANT', observedAt: Math.floor(nowMs() / 1000),
      decision: { id: `decision-demo-${id.toString(16)}`, revision, hash: hex(id), current: true, evidenceCurrent: true,
        conditionsStatus: criteria.every((r) => r.state === 'MET') ? 'MET' : 'NOT_MET' },
      criteria,
    };
  }

  function session() {
    const s = store.load();
    const refl = reflectionStage(s);
    const hrInProgress = s.hr.boundAt && !seen(s, s.hr.consentAt);
    return {
      applicationId: DEMO_APPLICATION,
      boundApplicationId: s.hr.boundAt ? DEMO_APPLICATION : null,
      phase: hrInProgress ? 'SOURCE_python-basic-certificate'
        : refl.stage === 'APPROVAL' ? 'AWAITING_EXACT_REFLECTION_APPROVAL'
          : refl.stage === 'REVIEWING' ? 'SOURCE_reflection-topics'
            : s.hr.boundAt ? 'AUTHENTICATED_EXTERNAL_UI_APPLICATION' : 'AWAITING_EXTERNAL_UI_AUTHENTICATION',
      failure: null,
      aiApproval: refl.stage === 'APPROVAL' ? { status: 'WAITING', permitted: false }
        : refl.stage === 'REVIEWING' ? { status: 'RECORDED', permitted: false } : null,
    };
  }

  function decisionEvidence() {
    const s = store.load();
    const v = view();
    const refl = reflectionStage(s);
    const criteria = v.criteria.map((r) => {
      const base = { criterionId: r.criterionId, state: r.state, evidenceId: r.evidenceId, evidenceRevision: r.evidenceRevision,
        metadataStatus: r.evidenceId ? 'RECORDED' : 'MISSING', source: r.evidenceId ? { kind: r.source.kind, dataMode: 'SYNTHETIC_FIXTURE' } : null };
      if (!r.evidenceId) return { ...base, verification: null, checks: null };
      if (r.criterionId === 'activity-complete') {
        return { ...base, verification: null, checks: { completionState: r.state === 'MET' ? 'COMPLETED' : 'INCOMPLETE',
          completionMode: 'AUTOMATIC', sourceCompletedAt: r.state === 'MET' ? Math.floor(s.moodle.activityAt / 1000) : null } };
      }
      if (r.criterionId === 'assignment-submitted') {
        return { ...base, verification: null, checks: { submissionState: r.state === 'MET' ? 'SUBMITTED' : 'NOT_SUBMITTED',
          sourceSubmittedAt: r.state === 'MET' ? Math.floor(s.moodle.assignmentAt / 1000) : null } };
      }
      if (r.criterionId === 'reflection-topics') {
        return { ...base, verification: null, checks: { profileHash: { status: 'RECORDED', value: hex(7) },
          modelVersion: { status: 'UNAVAILABLE', value: null },
          topics: refl.topics.map((t) => ({ topicId: t.topicId, state: t.state, location: t.location ? { ...t.location, unit: 'UTF16_CODE_UNIT' } : null })) } };
      }
      return { ...base, verification: { sourceStatus: 'VERIFIED', participantBinding: 'MATCHED', requestBinding: 'MATCHED',
        integrity: 'SIGNATURE_VALID', freshness: 'WITHIN_900_SECONDS' },
      checks: { certificateName: 'Python (Basic)', issuerStatus: 'ISSUED', achievementAt: Math.floor(s.hr.consentAt / 1000) - 86400 * 30 } };
    });
    return {
      version: 'clear-bootcamp-decision-evidence.1', applicationId: DEMO_APPLICATION, role: 'PARTICIPANT',
      manifest: { version: 'clear-bootcamp-evidence-manifest.1', applicationId: DEMO_APPLICATION,
        decision: { decisionId: v.decision.id, decisionRevision: v.decision.revision, decisionHash: v.decision.hash }, criteria },
      manifestHash: hex(99),
      availability: criteria.map((r) => ({ criterionId: r.criterionId, status: r.evidenceId ? 'VALID_AS_RECORDED' : 'MISSING',
        original: { status: 'UNAVAILABLE', httpAvailable: false } })),
      limitations: { hashProvesSourceTruth: false, independentReverificationAvailable: false, liveSourceChecked: false,
        originalTextHttpAvailable: false, usableForPayment: false },
    };
  }

  return Object.freeze({
    view, session, decisionEvidence,
    // 서명하면 기존 driver 처럼 읽어 둔 메시지를 비운다(state.approval = null)
    approval: () => { const h = store.load().hr; return h.messageAt && !h.signedAt ? { approvalId: 'approval-demo', message: HR_MESSAGE } : null; },
    reflectionText: () => store.load().moodle.reflection?.text ?? null,
    settings: () => { const s = store.load(); return { mode: s.mode, lagMs: s.lagMs }; },
    setMode: (mode) => update((s) => { s.mode = mode === 'NEVER' ? 'NEVER' : 'DELAYED'; }),
    setLag: (ms) => update((s) => { s.lagMs = Math.max(1000, Math.min(20000, Number(ms) || 5000)); }),
    // 기존 driver 동작의 대역 — bind · approval · sign
    startHr: () => update((s) => { s.hr.boundAt ??= nowMs(); }),
    readHrMessage: () => update((s) => { s.hr.messageAt = nowMs(); }),
    signHr: () => update((s) => { s.hr.signedAt = nowMs(); }),
    // Moodle·HackerRank 대역 탭이 부른다
    completeActivity: () => update((s) => { s.moodle.activityAt ??= nowMs(); }),
    submitAssignment: () => update((s) => { s.moodle.assignmentAt ??= nowMs(); }),
    submitReflection: (text) => update((s) => { s.moodle.reflection = { text: String(text).slice(0, 4000), at: nowMs() }; }),
    consentHr: () => update((s) => { if (s.hr.signedAt) s.hr.consentAt ??= nowMs(); }),
    reset: () => store.reset(),
  });
}
