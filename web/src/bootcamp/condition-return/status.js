// 카드에 붙는 상태 문구 — 서버가 준 값에서만 만든다
//
// 네 갈래다.
//
//   returnLine        원래 화면에 다녀온 뒤의 재조회 상태(tracker.js)
//   moodleFacts       강의·과제 — Moodle 완료·제출 기록(판정 근거 checks)
//   reflectionReview  회고 — AI 검토 단계, 판정 사유, 항목별 원문 위치
//   certificateStatus HackerRank — 기존 Reclaim 인증 단계와 서버 검증 결과
//
// 지키는 것 (criteria.js 머리말과 같다)
//
//   없는 값을 0·'완료'·'정상' 으로 채우지 않는다
//   '확인 중' 과 '서버가 확인함' 을 섞지 않는다. 충족은 서버 줄의 state 만 말한다
//   원문 조회 API 가 없으면(originalTextHttpAvailable:false) 원문을 지어내지 않는다.
//   위치(UTF-16 범위)만 보여 준다

import { reasonText, displayState } from '../criteria.js';
import { seoulText } from '../../ui/policy-view.js';
import { RETURN, REFRESH } from './tracker.js';

export const STATE_TEXT = Object.freeze({
  MET: '충족', UNMET: '미충족', WAITING: '확인 전',
  NEEDS_CHECK: '확인 필요', IN_PROGRESS: '진행 중', UNAVAILABLE: '지원 안 됨',
});

const when = (sec) => (Number.isFinite(sec) ? seoulText(sec) : null);

/** 한 조건의 서버 판정을 한 단어로 */
export const serverWord = (row) => (row ? STATE_TEXT[displayState(row).state] ?? row.state : '판정 없음');

// ── 재조회 상태 ─────────────────────────────────────────────────────────

/**
 * @param {object} ret   tracker.status(criterionId)
 * @param {object|null} row  지금 서버 줄
 * @param {{source:string}} [o]
 * @returns {null | {tone:'wait'|'ok'|'warn', text:string, recheck:boolean}}
 */
export function returnLine(ret, row, { where = '원래 화면' } = {}) {
  // 원천 재확인 요청의 결과. **접수(QUEUED)는 판정이 아니다** — 확정은 UPDATED 뿐이다.
  const req = ret?.refresh ?? null;
  const opId = req?.operationId ? ` · 접수 ${req.operationId}` : '';
  const retry = Number.isFinite(req?.retryAfterSeconds) ? `${req.retryAfterSeconds}초` : '잠시';

  // 떠난 기록이 없는 미충족 카드. 학생이 카드 버튼을 안 거치고 Moodle 에서 직접 마쳤을 수
  // 있다 — 그때는 돌아와도 카드가 모른다. 「다시 확인」 으로 재확인을 요청할 길을 둔다.
  // HackerRank 는 Moodle 재확인 대상이 아니라 제외.
  if (!ret || ret.state === RETURN.IDLE || ret.state === undefined) {
    if (row && row.state !== 'MET' && row.criterionId !== 'python-basic-certificate') {
      // 회고 재검증은 강의·과제 재확인 경로와 별개다(실제 연결 전). 요청한다고 말하지 않는다.
      return row.criterionId === 'reflection-topics'
        ? { tone: 'wait', text: '글을 고쳐 올렸다면 「다시 확인」 을 눌러 주세요. 서버 판정을 다시 읽어요.', recheck: true }
        : { tone: 'wait', text: 'Moodle 에서 직접 마치셨다면 「다시 확인」 을 눌러 주세요. 서버에 원천 재확인을 요청하고 판정을 다시 읽어요.', recheck: true };
    }
    return null;
  }
  switch (ret.state) {
    case RETURN.AWAY:
      return { tone: 'wait', text: `${where}에서 마치고 이 탭으로 돌아오시면 서버 판정을 다시 읽어요.`, recheck: false };
    case RETURN.CHECKING:
      return {
        tone: 'wait',
        // 접수 번호는 카드의 '자세히 보기' 에 있다. 여기는 한 줄만.
        text: req?.status === REFRESH.QUEUED
          ? '확인 중 · 재확인 요청 접수 · 서버 판정을 다시 읽고 있어요.'
          : '확인 중 · 서버 판정을 다시 읽고 있어요.',
        recheck: false,
      };
    case RETURN.PENDING:
      // 판정은 바뀌었지만 이번 요청은 처리 전 — 지난 요청의 늦은 결과일 수 있다(회고 고침 직후).
      if (ret.lateChange) {
        return {
          tone: 'wait',
          text: `확인 중 · 서버 판정이 바뀌었지만 이번 재확인 요청${opId}은 아직 처리 전이에요. 지난 요청의 결과일 수 있어, 서버가 이번 요청을 읽은 뒤 한 번 더 확인해요.`,
          recheck: true,
        };
      }
      if (req?.status === REFRESH.QUEUED) {
        return {
          tone: 'wait',
          text: '확인 중 · 재확인 요청 접수 · 새 판정은 아직 확정되지 않았어요. 잠시 뒤 다시 읽어요.',
          recheck: true,
        };
      }
      if (req?.status === REFRESH.RECORDED) {
        return {
          tone: 'wait',
          text: '확인 중 · 서버가 원천을 다시 읽어 기록했지만 이 조건의 판정은 그대로예요. 잠시 뒤 한 번 더 읽어요.',
          recheck: true,
        };
      }
      if (req?.status === REFRESH.RATE_LIMITED) {
        return {
          tone: 'wait',
          text: `확인 중 · 재확인 요청을 방금 보내서 ${retry} 뒤에 다시 요청해요. 그동안 저장된 판정은 그대로예요.`,
          recheck: true,
        };
      }
      if (req?.status === REFRESH.REQUEST_FAILED) {
        return {
          tone: 'wait',
          text: '확인 중 · 원천 재확인 요청을 보내지 못했어요. 저장된 판정만 다시 읽고 있어요. 잠시 뒤 다시 요청해요.',
          recheck: true,
        };
      }
      return {
        tone: 'wait',
        // 같다는 건 '아직 안 했다' 가 아니라 '서버가 아직 반영하지 않았다' 일 수 있다.
        text: '확인 중 · 서버 판정이 아직 그대로예요. CLEAR 가 원천 기록을 다시 읽어 판정을 '
          + '바꿔야 반영돼요. 잠시 뒤 자동으로 한 번 더 읽어요.',
        recheck: true,
      };
    case RETURN.STALLED:
      return {
        tone: 'warn',
        text: ret.lateChange
          ? `서버 판정은 바뀌었지만 이번 재확인 요청${opId}이 처리됐는지 확인하지 못했어요. 아래는 지금 서버가 가진 판정이에요. 자동 재조회는 멈췄어요. 잠시 뒤 「다시 확인」 을 눌러 주세요.`
          : req?.status === REFRESH.QUEUED
          ? `아직 반영되지 않았어요. 재확인 요청은 접수됐지만${opId} 새 판정이 확정되지 않았어요. 자동 재조회는 멈췄어요. 잠시 뒤 「다시 확인」 을 눌러 주세요.`
          : '아직 반영되지 않았어요. 자동 재조회는 멈췄어요. 서버가 원천을 다시 읽은 뒤 「다시 확인」 을 눌러 주세요.',
        recheck: true,
      };
    case RETURN.CANNOT_CHECK:
      return {
        tone: 'warn',
        text: '아직 확인할 수 없어요 · 서버가 이 조건의 원천 재확인을 아직 지원하지 않아요. 아래는 저장된 판정 그대로예요.',
        recheck: true,
      };
    case RETURN.READ_FAILED:
      return { tone: 'warn', text: '최신 판정을 읽지 못했어요. 아래는 이전에 읽은 판정이에요.', recheck: true };
    case RETURN.UPDATED: {
      const at = ret.updatedAt ? ` · ${new Date(ret.updatedAt).toLocaleTimeString('ko-KR', { hour12: false })} 확인` : '';
      // 새 근거는 확인됐는데 판정 상태가 같은 경우 — '바뀌었다' 가 아니라 '재확인 완료'.
      if (ret.sameState) {
        return { tone: 'wait', text: `재확인 완료 · 서버가 새 근거를 확인했어요 · 판정은 그대로 ${serverWord(row)}${at}`, recheck: false };
      }
      // 바뀌었는데 아직 미충족이면(회고 미충족 등) 다시 확인할 길은 남긴다.
      return { tone: 'ok', text: `새 판정 확정 · 서버 판정이 바뀌었어요 · 지금 판정 ${serverWord(row)}${at}`, recheck: row?.state !== 'MET' };
    }
    default:
      return null;
  }
}

// ── 강의·과제 ───────────────────────────────────────────────────────────

const COMPLETION = Object.freeze({
  COMPLETED: '완료', COMPLETE: '완료', COMPLETE_PASS: '완료(통과)', INCOMPLETE: '미완료', NOT_COMPLETED: '미완료',
});
const SUBMISSION = Object.freeze({
  SUBMITTED: '제출됨', NOT_SUBMITTED: '미제출', DRAFT: '임시 저장(제출 전)', NEW: '미제출',
});

/** 판정 근거의 Moodle 기록. 근거가 없으면 빈 배열 — 화면이 기록을 지어내지 않는다 */
export function moodleFacts(criterionId, evRow) {
  const c = evRow?.checks;
  if (!c) return [];
  if (criterionId === 'activity-complete') {
    return [
      c.completionState ? { k: '완료 상태', v: COMPLETION[c.completionState] ?? c.completionState } : null,
      when(c.sourceCompletedAt) ? { k: '완료 기록', v: when(c.sourceCompletedAt) } : null,
    ].filter(Boolean);
  }
  if (criterionId === 'assignment-submitted') {
    return [
      c.submissionState ? { k: '제출 상태', v: SUBMISSION[c.submissionState] ?? c.submissionState } : null,
      when(c.sourceSubmittedAt) ? { k: '제출 기록', v: when(c.sourceSubmittedAt) } : null,
    ].filter(Boolean);
  }
  return [];
}

// ── 회고 ────────────────────────────────────────────────────────────────

export const TOPIC_LABEL = Object.freeze({
  'work-performed': '수행 내용',
  'problem-solving-process': '문제 해결 과정',
  'learning-takeaway': '배운 점',
});

const TOPIC_STATE = Object.freeze({
  PRESENT: '있음', ABSENT: '없음', MISSING: '없음', UNCERTAIN: '불확실',
});

export const REVIEW = Object.freeze({
  NOT_COLLECTED: 'NOT_COLLECTED',     // 회고를 아직 읽지 않았다
  AWAITING_APPROVAL: 'AWAITING_APPROVAL', // 이번 입력을 AI 로 보내는 승인 대기
  REVIEWING: 'REVIEWING',             // AI 검토 중
  REVIEWED: 'REVIEWED',               // 서버가 검토 결과로 판정했다
});

/**
 * 회고 카드의 AI 검토 상태.
 *
 * @param {object} o
 * @param {object|null} o.row       서버 조건 줄
 * @param {object|null} o.evRow     판정 근거의 회고 줄(evidenceFor().row)
 * @param {object|null} o.limitations  판정 근거 limitations
 * @param {string|null} o.phase     세션 phase
 * @param {object|null} o.aiApproval 세션 aiApproval 요약
 * @param {string|null} [o.sourceText] 원문. **실서버는 주지 않는다.** 시연 데이터만
 */
export function reflectionReview({
  row = null, evRow = null, limitations = null, phase = null, aiApproval = null, sourceText = null,
  // 학생이 글을 고치러 갔다 돌아와 아직 서버가 새 글을 반영하지 않은 상태(tracker 가 확인 중).
  // 이때 보이는 검토 결과는 **지난 글의 것**이다 — 새 글의 결과처럼 보이면 안 된다(오규원 11/5).
  returned = false,
} = {}) {
  const inApproval = phase === 'AWAITING_EXACT_REFLECTION_APPROVAL' || aiApproval?.status === 'WAITING';
  const inReview = !inApproval && (phase === 'SOURCE_reflection-topics' || aiApproval?.status === 'RECORDED');
  const topicsRaw = Array.isArray(evRow?.checks?.topics) ? evRow.checks.topics : [];
  const reviewed = Boolean(row?.evidenceId) && evRow?.metadataStatus !== 'MISSING' && topicsRaw.length > 0;

  const topics = topicsRaw.map((t) => {
    const loc = t.location && Number.isInteger(t.location.start) && Number.isInteger(t.location.end)
      && t.location.end >= t.location.start ? t.location : null;
    const quote = sourceText && loc && loc.end <= sourceText.length ? sourceText.slice(loc.start, loc.end) : null;
    return Object.freeze({
      id: t.topicId,
      label: TOPIC_LABEL[t.topicId] ?? t.topicId,
      state: t.state,
      stateText: TOPIC_STATE[t.state] ?? t.state,
      location: loc ? Object.freeze({ start: loc.start, end: loc.end }) : null,
      quote,
    });
  });

  // 판정 사유. 검토 결과가 있을 때만 말한다(검토 전 사유는 카드의 기존 줄이 이미 말한다).
  // 서버 reasonCode 를 먼저, 없으면 서버가 준 항목 상태로 말한다.
  const lacking = topics.filter((t) => t.state !== 'PRESENT');
  const reason = !reviewed ? null
    : reasonText(row?.reasonCode)
      ?? (row?.state !== 'MET' && lacking.length
        ? `${lacking.map((t) => `${t.label}(${t.stateText})`).join(' · ')} 항목이 확인되지 않았습니다.`
        : null);

  const originalNote = sourceText
    ? '시연 데이터의 원문으로 근거 문장을 표시합니다.'
    : limitations?.originalTextHttpAvailable === false || limitations === null
      ? '원문 조회 API 가 제공되지 않아 근거 문장 대신 원문 위치(UTF-16 범위)만 표시합니다.'
      : null;

  let state; let title; let note;
  if (inApproval) {
    state = REVIEW.AWAITING_APPROVAL;
    title = '확인 중 · AI 검토 승인 대기';
    note = '이번 회고 입력을 AI 로 보내려면 승인이 먼저 필요해요. 승인되면 검토가 시작돼요.';
  } else if (inReview) {
    state = REVIEW.REVIEWING;
    title = '확인 중 · AI 가 회고를 검토하고 있어요';
    note = '세 항목(수행 내용 · 문제 해결 과정 · 배운 점)이 글에 있는지 봅니다. 점수를 매기지 않습니다.';
  } else if (reviewed && returned) {
    state = REVIEW.REVIEWED;
    title = `지난 글의 검토 결과 · ${serverWord(row)} — 고친 글은 아직 검토 전`;
    note = '서버가 새 글을 다시 읽고 승인·검토해야 결과가 바뀌어요. 아래 항목은 지난 글 기준이에요.';
  } else if (reviewed) {
    state = REVIEW.REVIEWED;
    title = row.state === 'MET' ? 'AI 검토 완료 · 세 항목 확인' : `AI 검토 완료 · ${serverWord(row)}`;
    note = null;
  } else {
    state = REVIEW.NOT_COLLECTED;
    title = '회고 검토 전';
    note = '회고를 쓰신 뒤 CLEAR 가 Moodle 에서 그 글을 읽어야 AI 검토가 시작돼요.';
  }

  // 미충족이면 **어디를 고쳐 다시 써야 하는지** 바로 보여야 한다 (오규원 11/5).
  // 서버 판정이 미충족이고 검토가 끝났을 때만이다. 검토 중엔 아직 모른다.
  // 돌아와서 새 글을 기다리는 중엔 또 다시 쓰라고 하지 않는다.
  const needsRewrite = state === REVIEW.REVIEWED && row?.state !== 'MET' && !returned;

  return Object.freeze({
    state, title, note, reason,
    needsRewrite,
    lackingLabels: Object.freeze(lacking.map((t) => t.label)),
    // 검토 중이거나 고친 글을 기다리는 중이면 아래 항목은 지난 검토의 것이다.
    previous: ((inApproval || inReview) || returned) && reviewed,
    topics: Object.freeze(topics),
    originalNote: topics.length ? originalNote : null,
    meta: Object.freeze([
      evRow?.checks?.profileHash?.status === 'RECORDED' ? { k: '검토 프로필', v: '기록됨' } : null,
      evRow?.checks?.modelVersion?.status === 'UNAVAILABLE' ? { k: '모델 버전', v: '미제공' } : null,
    ].filter(Boolean)),
  });
}

// ── HackerRank ──────────────────────────────────────────────────────────

export const CERT = Object.freeze({
  NO_APPLICATION: 'NO_APPLICATION', // 신청이 없다 — 시작할 수 없다
  START: 'START',                   // 기존 증빙 확인 세션을 시작할 수 있다
  WAITING: 'WAITING',               // 서버가 인증 단계를 준비하는 중
  READ_MESSAGE: 'READ_MESSAGE',     // 인증서 확인 메시지를 읽을 차례
  SIGN: 'SIGN',                     // 표시한 메시지에 서명할 차례
  VERIFYING: 'VERIFYING',           // 서명했다. HackerRank 로그인·증명 동의 → 서버 검증 대기
  VERIFIED: 'VERIFIED',             // 서버가 충족으로 판정했다
  NOT_MET: 'NOT_MET',               // 서버가 미충족으로 판정했다
  BLOCKED: 'BLOCKED',               // 실패 대기 등 — 운영자 확인 필요
});

const VERIFY_LABEL = Object.freeze({
  sourceStatus: '원천 상태', participantBinding: '본인 결합', requestBinding: '요청 결합',
  integrity: '무결성', freshness: '신선도',
});
const CERT_FACT = Object.freeze({
  certificateName: '인증서', issuerStatus: '발급 상태', achievementAt: '취득 시각',
});

/**
 * HackerRank 카드 상태. 버튼은 기존 driver 의 세 동작(bind · approval · sign)만 부른다.
 *
 * @param {object} o
 * @param {object|null} o.row        서버 조건 줄
 * @param {object|null} o.evRow      판정 근거의 인증서 줄
 * @param {object|null} o.availability 판정 근거 availability 줄
 * @param {object|null} o.session    { applicationId(driver), boundApplicationId(bootstrap), phase, failure }
 * @param {object|null} o.approval   읽어 온 인증서 확인 메시지
 * @param {number|null} o.signedAtMs 이 화면에서 서명을 보낸 시각
 */
export function certificateStatus({ row = null, evRow = null, availability = null, session = null, approval = null, signedAtMs = null } = {}) {
  const verification = Object.entries(VERIFY_LABEL)
    .map(([k, label]) => (evRow?.verification?.[k] != null ? { k: label, v: String(evRow.verification[k]) } : null))
    .filter(Boolean);
  const facts = Object.entries(CERT_FACT)
    .map(([k, label]) => {
      const v = evRow?.checks?.[k];
      if (v === undefined || v === null) return null;
      return { k: label, v: k.endsWith('At') && Number.isFinite(v) ? seoulText(v) : String(v) };
    })
    .filter(Boolean);
  const expired = ['EXPIRED', 'SUPERSEDED', 'INVALIDATED', 'DELETED'].includes(availability?.status);
  const base = { verification: Object.freeze(verification), facts: Object.freeze(facts), message: null, action: null };
  const out = (state, title, note, extra = {}) => Object.freeze({ ...base, state, title, note, ...extra });

  if (session?.failure) {
    return out(CERT.BLOCKED, '진행이 멈췄어요', '서버가 실패 대기 상태예요. 다시 시도하기 전에 운영자에게 확인해 주세요.');
  }
  // 서버 판정이 먼저다. 이 화면에서 서명했다는 사실보다 우선한다.
  if (row?.state === 'MET' && row.current !== false && !expired) {
    return out(CERT.VERIFIED, '서버 검증 완료', 'Reclaim 증명 두 개(계정 · 인증서)를 서버가 검증해 충족으로 판정했어요.');
  }
  if (row?.state === 'NOT_MET') {
    return out(CERT.NOT_MET, `서버 판정 · ${serverWord(row)}`, reasonText(row.reasonCode) ?? '서버가 사유를 주지 않았어요.');
  }

  const phase = session?.phase ?? null;
  const inHr = phase === 'SOURCE_python-basic-certificate';
  if (signedAtMs && (inHr || !row?.evidenceId)) {
    // 서명은 했는데 서버 판정이 아직이다. 로그인 창을 닫았거나 동의를 취소했으면
    // 여기서 멈춘 것처럼 보인다 — 그래서 **다시 진행** 길을 남긴다. 다시 서명하게
    // 하지 않는다. 호스트가 로그인 창을 다시 여는 동작(resume)을 부른다.
    return out(CERT.VERIFYING, '검증 중 · 서버 검증 대기',
      'HackerRank 로그인과 증명 동의를 마치면 서버가 Reclaim 증명을 검증해요. 끝나면 이 탭에서 결과를 보여 드려요. '
      + '로그인 창을 닫았거나 동의를 취소했다면 「다시 진행」 으로 그 창을 다시 열 수 있어요. 서명은 다시 하지 않아요.', {
      action: Object.freeze({ kind: 'resume', label: '다시 진행' }),
    });
  }
  if (inHr && approval) {
    return out(CERT.SIGN, '인증서 확인 메시지 서명', '아래 메시지는 증명 확인 승인이며 지급 승인이 아니에요. 서명하면 HackerRank 로그인으로 넘어가요.', {
      message: approval.message ?? null,
      action: Object.freeze({ kind: 'sign', label: '표시한 메시지에 서명' }),
    });
  }
  if (inHr) {
    return out(CERT.READ_MESSAGE, 'HackerRank 인증 차례', '먼저 인증서 확인 메시지를 읽어요. 서명 전에 내용을 보여 드려요.', {
      action: Object.freeze({ kind: 'read', label: '인증서 확인 메시지 읽기' }),
    });
  }
  if (!session?.applicationId) {
    return out(CERT.NO_APPLICATION, '신청 전', '신청을 먼저 만들어야 인증을 시작할 수 있어요.');
  }
  if (!session.boundApplicationId) {
    return out(CERT.START, '인증 시작 전', '이 신청의 증빙 확인을 시작하면 HackerRank 인증서 확인부터 진행해요.', {
      action: Object.freeze({ kind: 'start', label: 'HackerRank 인증 시작' }),
    });
  }
  if (expired) {
    return out(CERT.WAITING, '증명 유효 기간 경과', '이전 증명이 만료됐거나 대체됐어요. 서버가 새 인증 단계를 열면 다시 진행할 수 있어요.');
  }
  return out(CERT.WAITING, '확인 중 · 서버가 인증 단계를 준비하고 있어요', '차례가 되면 이 카드에 다음 할 일이 나타나요.');
}
