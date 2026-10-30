// 월드 한 줄 → 서버 응답 모양
//
// 화면 코드는 서버의 normal-view 를 그린다. 월드가 그 모양을 그대로 만들어
// 주면 화면은 한 줄도 안 바뀌고, 오규원이 조회를 붙이는 날 이 모듈만 빠진다.
//
// 모양을 새로 짓지 않는다. `waitingForOperatorConsent` 를 **그대로 복사해**
// 상태에 따라 달라지는 칸만 덮는다. 서버 응답 모양이 바뀌면 여기도 같이
// 깨져서 알아챈다 — bootcamp-demo.js 가 쓰는 방법과 같다.

import { BOOTCAMP_FIXTURES } from '../fixtures/bootcamp.js';
import { withAiEvidence } from '../fixtures/bootcamp-demo.js';
import { CRITERIA, CRITERION_LABEL, STAGE_LABEL, AMOUNT, CONFIRM_SECONDS } from './world.js';

const BASE = BOOTCAMP_FIXTURES.cases.waitingForOperatorConsent;

/**
 * 아직 안 한 조건.
 *
 * 내역을 지어내지 않는다. 안 했으면 진행도도 항목도 없다 — 0 으로 채우면
 * "0개 했음" 과 "모름" 이 같은 그림이 된다(§9.3).
 */
function unmet(row) {
  return {
    ...row,
    state: 'MISSING',
    current: false,
    evidenceId: null,
    evidenceRevision: null,
    reasonCode: 'EVIDENCE_MISSING',
    expiresAt: null,
    detail: row.detail
      ? { ...row.detail, progress: null, items: [], more: 0 }
      : undefined,
  };
}

/** 확인 기록 한 줄. 서버가 주는 모양 그대로 */
function consentRecord(base, role, at, decisionId) {
  return {
    ...base,
    id: `consent-${role === 'PARTICIPANT' ? 'p' : 'o'}-${decisionId.slice(9, 17)}`,
    actorRole: role,
    recordedAt: at,
    decisionId,
  };
}

/**
 * @param {object} row   derive() 가 만든 한 줄
 * @param {'participant'|'operator'} role
 * @param {number} now
 */
export function viewFor(row, role, now) {
  const base = BASE[role === 'operator' ? 'operator' : 'participant'];
  const decisionId = base.decision.id;
  const full = row.metCount === CRITERIA.length;

  const criteria = withAiEvidence(base.criteria)
    .map((c) => (row.met.includes(c.criterionId) ? c : unmet(c)));

  // ── 절차 ──────────────────────────────────────────────────────────
  const procedure = {
    ...base.procedure,
    firstStartedAt: row.acceptedAt ?? base.procedure.firstStartedAt,
    revalidationCount: row.revalidationUsed,
  };
  // 끝난 절차에는 **살아 있는 기한을 남기지 않는다.** base 를 그대로 펴면
  // reviewCapAt 이 따라와서, 다 끝난 화면에 '3분 남음' 이 돈다.
  if (row.stage === 'PAID') {
    Object.assign(procedure, {
      status: 'ACCEPTED_RIGHT_PRESERVED',
      publishedAt: row.acceptedAt,
      confirmAt: row.acceptedAt + CONFIRM_SECONDS,
      reviewCapAt: null,
      deadlineRouteAvailable: false,
    });
  } else if (row.stage === 'TERMINATED') {
    Object.assign(procedure, {
      status: 'CONTRACT_TERMINATED',
      terminationReason: row.terminated,
      reservationReleased: true,
      publishedAt: null,
      confirmAt: null,
      reviewCapAt: null,
      deadlineRouteAvailable: false,
    });
  } else if (row.stage === 'CONFIRMING') {
    Object.assign(procedure, {
      // 열린 오류 신고가 있으면 확인을 기다리는 게 아니라 **신고 검토**를
      // 기다리는 것이다. 같은 글자로 쓰면 왜 안 나가는지 알 수 없다.
      status: row.blocked ? 'OBJECTION_BLOCKED' : 'WAITING_CONFIRMATION',
      publishedAt: row.acceptedAt,
      confirmAt: row.confirmAt,
      reviewCapAt: row.capAt,
      deadlineRouteAvailable: true,
    });
  } else if (row.stage === 'FUNDING_WAIT') {
    // §8.3 — 전액 배정이 안 됐으니 판정을 공개하지 않는다. 기한도 없다.
    Object.assign(procedure, {
      status: 'FUNDING_WAIT',
      publishedAt: null,
      confirmAt: null,
      reviewCapAt: null,
      deadlineRouteAvailable: false,
    });
  } else {
    Object.assign(procedure, {
      status: 'SOURCE_REVERIFICATION_REQUIRED',
      publishedAt: null,
      confirmAt: null,
      reviewCapAt: null,
      deadlineRouteAvailable: false,
    });
  }

  // ── 재원 ──────────────────────────────────────────────────────────
  const funding = { ...base.funding, queue: null, reservedAtoms: '0' };
  if (row.stage === 'CONFIRMING' || row.stage === 'PAID') {
    Object.assign(funding, { status: 'FULLY_ALLOCATED', reservedAtoms: String(AMOUNT) });
  } else if (row.stage === 'TERMINATED') {
    Object.assign(funding, { status: 'RELEASED' });
  } else {
    Object.assign(funding, { status: 'WAITING_FUNDS', queue: row.queue });
  }

  // ── 확인 ──────────────────────────────────────────────────────────
  const records = [];
  if (row.stage === 'CONFIRMING' || row.stage === 'PAID') {
    const b = base.consent.records[0];
    if (row.confirm.participant) records.push(consentRecord(b, 'PARTICIPANT', row.acceptedAt + 2, decisionId));
    if (row.confirm.operator) records.push(consentRecord(b, 'COURSE_OPERATOR', row.acceptedAt + 5, decisionId));
  }

  // ── 지급 ──────────────────────────────────────────────────────────
  const payment = row.stage === 'PAID'
    ? {
      acceptedRight: { recipientFixed: true, amountAtoms: base.agreedPayment.amountAtoms, acceptedAt: row.paidAt - 3 },
      transactionState: 'SUBMITTED',
      transactionHash: base.payment?.transactionHash
        ?? '0x5d41402abc4b2a76b9719d911017c592f0b4e8a1cc3e95b70f28d41a3b8e1d47',
      blockRef: { number: 1428, hash: '0x7f1c9ab2' },
      claimState: 'FINALIZED',
      receivedAtoms: base.agreedPayment.amountAtoms,
      canonicalTransferVerified: true,
      receiptHttpAvailable: true,
    }
    : {
      acceptedRight: null,
      transactionState: null,
      transactionHash: null,
      blockRef: null,
      claimState: null,
      receivedAtoms: null,
      canonicalTransferVerified: null,
      receiptHttpAvailable: false,
    };

  return {
    ...base,
    observedAt: now,
    applicationId: `application-${row.id}`,
    criteria,
    decision: { ...base.decision, conditionsStatus: full ? 'MET' : 'NOT_MET' },
    procedure,
    funding,
    consent: {
      ...base.consent,
      bothCurrent: records.length === 2,
      records,
    },
    objection: {
      blocked: row.blocked || row.stage === 'TERMINATED',
      ...(row.objection
        ? {
          criterion: row.objection.criterion,
          raisedAt: row.objection.raisedAt,
          // 재검증 결과가 나오는 시각. 화면이 남은 시간을 센다.
          resolvesAt: row.revalidationAt,
          // 접수(사용자가 한 일) / 재검증 진행(서버가 하는 일)
          phase: row.objectionPhase,
        }
        : {}),
      // 끝난 신고의 결과. 기각됐는지 정정됐는지를 학생이 알아야 한다.
      last: row.objectionLog.length > 0 ? row.objectionLog[row.objectionLog.length - 1] : null,
    },
    payment,
  };
}

// ── 운영자 화면이 보는 기수 ─────────────────────────────────────────────
//
// cohort.js 가 정해 둔 모양과 같다. 거기는 고정값이었고 여기는 월드에서 센다.

/**
 * 도구별 검증 현황.
 *
 * 월드에서 셀 수 있는 것만 적는다 — 조건마다 **전원을 확인했고 몇 명이
 * 통과했나**. 실패 사유는 그 조건에서 막혀 있다고 적어 둔 사람의 말을 쓴다.
 * 없는 사유를 지어내지 않는다.
 */
const TOOL_OF = Object.freeze({
  'activity-complete': 'Moodle 활동 완료',
  'assignment-submitted': 'Moodle 과제 제출',
  'reflection-topics': '회고 AI 검사',
  'python-basic-certificate': 'HackerRank + Reclaim',
});

/** 운영자 목록에 쓰는 단계. 접수와 재검증을 구분한다 */
const row_phase = (r) => (r.objectionPhase === 'RECEIVED' ? 'RECEIVED' : 'REVALIDATING');

function tools(rows) {
  return CRITERIA.map((cid) => {
    const ran = rows.length;
    const ok = rows.filter((r) => r.met.includes(cid)).length;
    const failed = ran - ok;
    return {
      label: TOOL_OF[cid],
      ran,
      ok,
      failed,
      reason: failed > 0 ? `${failed}건 — 아직 확인되지 않았습니다` : null,
    };
  });
}

/** @param {object} d derive() 결과 */
export function cohortOf(d) {
  const rows = d.rows;
  const confirming = rows.filter((r) => r.stage === 'CONFIRMING');

  return {
    name: 'Python 부트캠프 10기',
    participants: rows.length,
    observedAt: d.now,

    stages: d.stages,
    tools: tools(rows),

    funding: {
      ...d.funding,
      pendingTopUp: null,      // 충전 거래 조회가 아직 없다
      gasBudgetAtoms: null,    // 가스 후원 예산은 환급 재원과 다른 돈
    },

    // 지금 걸려 있는 오류 신고와, 상한 안에 안 풀려 끝난 건.
    // 없는 이의를 지어내지 않는다 — 학생이 실제로 건 것만 올라온다.
    objections: [
      // 지금 재검증이 돌고 있는 것
      ...rows.filter((r) => r.objection).map((r) => ({
        id: `objection-${r.id}`,
        byRole: r.objection.by ?? 'PARTICIPANT',
        criterion: CRITERION_LABEL[r.objection.criterion] ?? r.objection.criterion,
        note: `${r.name} · ${r.objection.reason}`,
        raisedAt: r.objection.raisedAt,
        state: row_phase(r),
      })),
      // 끝난 것 — 결과를 남긴다. 기각인지 정정인지가 다음 행동을 가른다.
      ...rows.flatMap((r) => r.objectionLog.map((o, i) => ({
        id: `objection-${r.id}-${i}`,
        byRole: o.by ?? 'PARTICIPANT',
        criterion: CRITERION_LABEL[o.criterion] ?? o.criterion,
        note: `${r.name} · ${o.reason}`,
        raisedAt: o.raisedAt,
        state: o.outcome === 'CORRECTED' ? 'RESOLVED' : 'DISMISSED',
        outcome: o.outcome === 'CORRECTED'
          ? '판정이 정정돼 다시 진행합니다'
          : '재검증 결과 판정이 유지돼 기각됐습니다',
      }))),
      // 상한 안에 재검증이 못 끝나 종료된 것
      ...rows.filter((r) => r.stage === 'TERMINATED' && !r.objection && r.objectionLog.length === 0)
        .map((r) => ({
          id: `objection-${r.id}-ended`,
          byRole: 'PARTICIPANT',
          criterion: CRITERION_LABEL['reflection-topics'],
          note: `${r.name} · 재검증이 전체 상한 안에 끝나지 않았습니다`,
          raisedAt: r.acceptedAt,
          state: 'UNRESOLVED',
        })),
    ],

    // 운영자가 이름을 누르면 펴 볼 수 있어야 한다. 집계만 보고는
    // "그래서 이 사람이 왜 막혔나" 를 알 수 없다.
    applicants: rows.map((r) => ({
      id: r.id,
      name: r.name,
      stage: r.stage,
      met: r.metCount,
      note: r.objection
        ? `${r.objectionPhase === 'RECEIVED' ? '신고 접수됨' : '재검증 진행 중'} · ${r.objection.reason}`
        : r.queue
          ? `재원 ${Math.round(Number(r.queue.shortfallAtoms) / 1_000_000)} TEST 부족`
          : r.stage === 'TERMINATED' ? '오류 신고가 상한 안에 해결되지 않음'
            : r.note,
      // 펼쳤을 때 보여 줄 것들
      criteria: CRITERIA.map((cid) => ({
        id: cid,
        label: CRITERION_LABEL[cid],
        met: r.met.includes(cid),
      })),
      amountAtoms: String(AMOUNT),
      acceptedAt: r.acceptedAt,
      confirmAt: r.confirmAt,
      paidAt: r.paidAt,
      confirm: { ...r.confirm },
      queue: r.queue,
      objection: r.objection ? { ...r.objection } : null,
    })),

    pending: confirming.map((r) => ({
      applicationId: `application-${r.id}`,
      studentId: r.id,
      who: r.name,
      amountAtoms: String(AMOUNT),
      confirmAt: r.confirmAt,
      participantConfirmed: r.confirm.participant,
      operatorConfirmed: r.confirm.operator,
    })),

    // §14.1 — 센 것만. 사람 시간은 baseline 이 없어 계속 null 이다.
    metrics: {
      verifiedApplications: rows.filter((r) => r.metCount === CRITERIA.length).length,
      unattendedApplications: rows.filter((r) => r.stage === 'PAID').length,
      // 사람이 손댄 건 = 오류 신고가 올라온 건. 그 밖에는 아무도 안 만졌다.
      humanInterventions: rows.filter((r) => r.objection || r.terminated).length,
      failuresRetried: rows.filter((r) => r.objection).length,
      humanWorkMs: null,
      humanWorkReductionPercent: null,
    },
  };
}

/**
 * 이번 입력의 AI 승인 자료 — 서버 `session().aiApproval` 과 같은 모양.
 *
 * 해시는 합성이다. 실제 호출도 비용도 없다. 그래도 **모양과 흐름은 같아야**
 * 서버가 붙었을 때 화면을 안 고친다.
 *
 * 승인 창은 월드 시계 기준 120초로 둔다. 서버가 주는 값이 따로 있으면
 * 그 값이 쓰인다 — 여기 숫자는 월드에서만 쓰는 것이다.
 */
const APPROVAL_WINDOW_MS = 120_000;

const fakeHash = (seed) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `0x${h.toString(16).padStart(8, '0').repeat(8)}`;
};

/**
 * @param {object} row derive() 의 한 줄
 * @param {number} now
 * @param {string|null} wallet 지금 로그인한 주소. 게이트가 지정 지갑과 대조한다
 */
export function aiApprovalOf(row, now, wallet = null) {
  const id = `application-${row.id}`;
  return {
    applicationId: id,
    permitted: !row.aiApproved,
    status: row.aiApproved ? 'RECORDED' : 'WAITING',
    model: 'gemini-2.0-flash',
    costAcknowledgment: '이 호출 1회분 과금에 동의합니다',
    // 게이트가 보는 칸들. 월드에서는 늘 갖춰진 것으로 둔다 —
    // 실서버에서는 호스트가 정하고 우리는 그 값을 그대로 읽는다.
    authorityConfigured: true,
    reviewScreensReady: true,
    approvalWallet: wallet ?? '0x0000000000000000000000000000000000000000',
    bodySha256: fakeHash(`body:${row.id}`),
    planHash: fakeHash(`plan:${row.id}`),
    contextHash: fakeHash(`ctx:${row.id}`),
    runBindingHash: fakeHash(`run:${row.id}`),
    codeHead: fakeHash(`code:${row.id}`),
    observedAtMs: now * 1000,
    approvalWindowEndsAtMs: now * 1000 + APPROVAL_WINDOW_MS,
  };
}

export { STAGE_LABEL };
