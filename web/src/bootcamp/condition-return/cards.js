// 환급 조건 네 카드 — 원래 화면으로 가고, 돌아오면 서버 판정을 다시 읽는다
//
// 기존 student-view.js 의 conditionCard 와 같은 뼈대·같은 클래스(.cc ...)를 쓴다.
// 그 파일은 백엔드 무결성 검사의 지문 대상이라 고치지 않고, 여기서 같은 모양을
// 다시 조립한 뒤 카드마다 두 가지를 더한다.
//
//   1  이동 버튼   강의 열기 · 과제 열기 · 회고 쓰기 → 지정 Moodle 항목(새 탭)
//                  HackerRank 인증 → 기존 Reclaim 시작(bind · 메시지 읽기 · 서명)
//   2  복귀 상태   돌아오면 기존 조회 API 로 다시 읽고 '확인 중 / 반영됨' 을 말한다
//
// 「자세히」 는 그대로 둔다. 기존 조건 상세·근거 보기(onOpen)를 부른다.
//
// 이 파일은 그리기만 한다. 서버를 부르지 않는다. 읽기는 tracker·evidence 로더,
// 쓰기(인증 시작·서명)는 넘겨받은 기존 driver 동작이 한다.

import { el } from '../../ui/dom.js';
import { icon } from '../../ui/brand.js';
import { seoulText } from '../../ui/policy-view.js';
import { CRITERIA, displayState, collectionFrom } from '../criteria.js';
import { LINK, verbFor } from './targets.js';
import { RETURN } from './tracker.js';
import { CRITERION_IDS, evidenceFor, EVIDENCE_LOAD } from './evidence.js';
import {
  STATE_TEXT, returnLine, moodleFacts, reflectionReview, certificateStatus, REVIEW, CERT,
} from './status.js';
import { stageStrip, conditionsLine, STAGE } from './stage-strip.js';

// 카드가 말하는 순서 — 해야 하는 일 → 지금 충족 여부 → 판단 이유와 근거 → 다음 행동
// (오규원 11/6). 기술 이름보다 학생이 할 행동과 결과를 크게, 원문·시각·이력은 접는다.
export const TASK = Object.freeze({
  'activity-complete': {
    title: '지정 강의 수강',
    todo: '지정된 강의 페이지를 끝까지 보면 Moodle 에 완료 기록이 남아요.',
    verb: '강의 보기',
    met: '지정한 강의의 완료 기록을 확인했어요.',
    unmet: '지정한 강의의 완료 기록이 아직 없어요.',
  },
  'assignment-submitted': {
    title: '지정 과제 제출',
    todo: '지정된 과제를 Moodle 에 제출하면 제출 기록이 남아요.',
    verb: '과제 보기',
    met: '지정한 과제의 제출 기록을 확인했어요.',
    unmet: '지정한 과제의 제출 기록이 아직 없어요.',
  },
  'reflection-topics': {
    title: '회고 작성',
    todo: '회고 게시판에 수행 내용 · 문제 해결 과정 · 배운 점이 담긴 글을 올려요. AI 가 세 항목이 있는지만 봐요.',
    verb: '회고 쓰기',
  },
  'python-basic-certificate': {
    title: 'HackerRank Python (Basic) 인증',
    todo: 'HackerRank 에서 받은 인증서를 Reclaim 증명으로 확인해요. 로그인과 동의만 하면 돼요.',
    verb: null,
  },
});

/**
 * 카드 맨 위에 크게 쓰는 한 단어. **서버 판정과 읽기 상태를 섞지 않는다.**
 * 다시 읽는 중이면 '확인 중', 판정을 못 읽었으면 '조회 실패' — 둘 다 미충족이 아니다.
 */
export function verdictOf({ row, shown, ret }) {
  if ([RETURN.CHECKING, RETURN.PENDING].includes(ret.state)) return { key: 'CHECKING', label: '확인 중', tone: 'wait' };
  if (ret.state === RETURN.READ_FAILED) return { key: 'FETCH_FAILED', label: '조회 실패', tone: 'warn' };
  if (!row) return { key: 'NONE', label: '판정 전', tone: 'muted' };
  const key = shown.state;
  return {
    key, label: STATE_TEXT[key] ?? key,
    tone: key === 'MET' ? 'ok' : key === 'UNMET' ? 'bad' : key === 'UNAVAILABLE' ? 'warn' : 'muted',
  };
}

const CARD_ICON = Object.freeze({
  'activity-complete': 'layers',
  'assignment-submitted': 'check',
  'reflection-topics': 'history',
  'python-basic-certificate': 'key',
});

const SOURCE_SHORT = Object.freeze({
  'activity-complete': 'Moodle',
  'assignment-submitted': 'Moodle',
  'reflection-topics': 'Moodle + AI',
  'python-basic-certificate': 'Reclaim 공증',
});

function cardRow(label, value, { strong = false } = {}) {
  return el('li', {}, [
    el('span.cc-k', { text: label }),
    el(strong ? 'span.cc-v.on' : 'span.cc-v', { text: value }),
  ]);
}

const pairs = (list) => (list.length
  ? el('dl.crc-facts', {}, list.map((f) => el('div', {}, [el('dt', { text: f.k }), el('dd', { text: f.v })])))
  : null);

// ── 조건별 덧붙임 ────────────────────────────────────────────────────────

function moodleBlock(criterionId, ev, evidenceState, row) {
  const facts = moodleFacts(criterionId, ev.row);
  if (facts.length) return el('div.crc-block', {}, [pairs(facts)]);
  if (!row?.evidenceId) return null;
  const text = evidenceState === EVIDENCE_LOAD.LOADING ? 'Moodle 기록을 읽는 중이에요.'
    : evidenceState === EVIDENCE_LOAD.FAILED ? 'Moodle 기록을 읽지 못했어요. 「자세히」 에서 다시 볼 수 있어요.'
      : null;
  return text ? el('p.crc-muted', { text }) : null;
}

export function reflectionBlock(review, link, { demo = false } = {}) {
  const reviewed = review.state === REVIEW.REVIEWED;
  const absent = review.topics.filter((t) => t.state === 'ABSENT' || t.state === 'MISSING');
  const uncertain = review.topics.filter((t) => t.state === 'UNCERTAIN');
  const present = review.topics.filter((t) => t.state === 'PRESENT');
  const where = link?.status === LINK.LINKED ? (link.name ?? '회고 게시판') : '회고 게시판 (주소 미제공)';
  const labels = (list) => list.map((t) => t.label).join(' · ');
  // 머리말 — 지금 글의 검토가 끝났으면 무엇이 문제인지 바로. '없음' 과 '불확실' 은 다른 말이다.
  const headline = reviewed && !review.previous
    ? (absent.length ? `${labels(absent)} 내용이 부족해요.`
      : uncertain.length ? `${labels(uncertain)} 항목은 판단하기 어려워요.`
        : '세 항목을 모두 확인했어요.')
    : review.title;
  const topicLine = (t) => el('li', { 'data-met': t.state === 'PRESENT' ? 'yes' : t.state === 'UNCERTAIN' ? 'maybe' : 'no' }, [
    el('span.crc-topic', { text: t.label }),
    el('span.crc-topic-state', { text: t.stateText }),
    t.quote
      ? el('q.crc-quote', { text: t.quote })
      : el('span.crc-loc', {
        text: t.location ? `원문 ${t.location.start}–${t.location.end} (UTF-16)`
          : t.state === 'PRESENT' ? '원문 위치 미제공' : t.state === 'UNCERTAIN' ? '어느 문장인지 확정하지 못했어요' : '근거 문장을 찾지 못했어요',
      }),
  ]);
  // 돌아온 뒤 무엇이 일어나는지 — 실제 회고 재검증 경로는 아직 없다. 시연에서만 "다시 검토를 요청" 이라고 쓴다.
  const afterReturn = demo ? '이 탭으로 돌아오면 다시 검토를 요청해요.' : '돌아오면 저장된 판정을 다시 읽어요.';
  // 불확실(UNCERTAIN)만 있을 때의 안내도 같다 — 실제 모드에서 "다시 검토해요" 라고 약속하지 않는다(오규원 11/6 보완).
  const uncertainHint = (topics) => (demo
    ? `${labels(topics)} 부분을 더 분명하게 적어 ${where}에 다시 올리시면 다시 검토를 요청해요. ${afterReturn}`
    : `${labels(topics)} 부분을 더 분명하게 적어 ${where}에 다시 올릴 수 있어요. 재검증 경로가 연결되기 전이라, 돌아오면 저장된 판정을 다시 확인해요.`);
  return el('div.crc-block.crc-review', { 'data-review': review.state }, [
    el('p.crc-title', { text: headline }),
    review.note ? el('p.crc-muted', { text: review.note }) : null,
    review.previous ? el('p.crc-muted', { text: '아래는 지난 글의 검토 결과예요. 새 검토가 끝나면 바뀌어요.' }) : null,
    // AI 가 본 것 — 서버가 준 항목·위치·인용만. 프론트가 판단을 만들지 않는다.
    present.length ? el('div.crc-ai', {}, [
      el('p.crc-ai-k', { text: '확인한 문장' }),
      el('ul.crc-topics', {}, present.map(topicLine)),
    ]) : null,
    reviewed && absent.length ? el('div.crc-ai', {}, [
      el('p.crc-ai-k', { text: '부족한 내용' }),
      el('ul.crc-topics', {}, absent.map(topicLine)),
    ]) : null,
    reviewed && uncertain.length ? el('div.crc-ai', {}, [
      el('p.crc-ai-k', { text: '판단하기 어려운 내용' }),
      el('ul.crc-topics', {}, uncertain.map(topicLine)),
      el('p.crc-muted', { text: 'AI 가 이 항목이 글에 있는지 확신하지 못했어요. 없다는 뜻은 아니에요.' }),
    ]) : null,
    review.reason ? el('p.crc-reason', { text: `서버 판정 사유 · ${review.reason}` }) : null,
    // 보완 방법 — 어떤 항목을 어디에 더해 올릴지. 글 내용을 대신 써 주지 않는다.
    // 불확실뿐이면 무조건 다시 쓰라고 하지 않는다 — 더 분명하게 적으면 다시 검토한다고만 말한다.
    review.needsRewrite && absent.length
      ? el('div.crc-fix', {}, [
        el('p.crc-ai-k', { text: '보완 방법' }),
        el('p', { text: `회고에 ${labels(absent)} 내용을 더해 ${where}에 다시 올려 주세요. ${afterReturn}` }),
      ])
      : review.needsRewrite && uncertain.length
        ? el('div.crc-fix', { 'data-kind': 'uncertain' }, [
          el('p.crc-ai-k', { text: '참고' }),
          el('p', { text: uncertainHint(uncertain) }),
        ])
        : review.needsRewrite
          ? el('div.crc-fix', {}, [
            el('p.crc-ai-k', { text: '보완 방법' }),
            el('p', { text: `회고를 고쳐 ${where}에 다시 올려 주세요. ${afterReturn}` }),
          ])
          : null,
    el('details.crc-more', {}, [
      el('summary', { text: '검토 상세' }),
      review.originalNote ? el('p.crc-muted', { text: review.originalNote }) : null,
      pairs(review.meta),
    ].filter(Boolean)),
  ].filter(Boolean));
}

function certificateBlock(cert) {
  return el('div.crc-block', { 'data-cert': cert.state }, [
    el('p.crc-title', { text: cert.title }),
    cert.note ? el('p.crc-muted', { text: cert.note }) : null,
    // 서명할 내용을 서명 버튼 위에 그대로 보여 준다. 기존 준비 구역과 같은 원칙이다.
    cert.message
      ? el('details.crc-message', { open: true }, [
        el('summary', { text: '서명할 메시지' }),
        el('pre', { text: cert.message }),
      ])
      : null,
    pairs([...cert.verification, ...cert.facts]),
  ]);
}

// ── 버튼 ────────────────────────────────────────────────────────────────

function goControl(criterionId, link, { tracker, cert, certificate, busy, verb = null }) {
  if (criterionId === 'python-basic-certificate') {
    const act = cert?.action;
    if (!act) return null;
    const run = certificate?.[act.kind];
    // 「다시 진행」 은 호스트가 로그인 창을 다시 여는 동작(resume)이 있어야 한다.
    // 없으면 잠근 채 그 사실을 적는다 — 다시 서명하게 돌리지 않는다.
    const missing = typeof run !== 'function';
    return el('button.cc-btn.crc-go', {
      type: 'button',
      disabled: busy || missing,
      'aria-disabled': missing ? 'true' : null,
      title: missing && act.kind === 'resume' ? '로그인 창을 다시 여는 동작을 호스트가 아직 제공하지 않아요' : null,
      onClick: () => {
        // 서명하거나 다시 진행하면 학생은 HackerRank 창으로 간다. 돌아오면 다시 읽는다.
        if (act.kind === 'sign' || act.kind === 'resume') tracker?.depart(criterionId);
        void run?.();
      },
    }, [el('span', { text: missing && act.kind === 'resume' ? `${act.label} · 호스트 동작 미제공` : act.label }), icon('arrowUpRight')]);
  }
  if (link?.status === LINK.LINKED) {
    return el('a.cc-btn.crc-go', {
      href: link.href,
      target: '_blank',
      rel: 'noopener noreferrer',
      onClick: () => tracker?.depart(criterionId),
    }, [el('span', { text: verb ?? link.verb }), icon('arrowUpRight')]);
  }
  return el('button.cc-btn.crc-go', { type: 'button', disabled: true, 'aria-disabled': 'true' }, [
    el('span', { text: `${verbFor(criterionId)} · 주소 미제공` }),
  ]);
}

function targetLine(criterionId, link) {
  if (criterionId === 'python-basic-certificate') return null;
  if (link?.status === LINK.LINKED) {
    return el('p.crc-target', { text: `열 항목 · ${link.name ?? `${link.where} (Moodle ${link.module} ${link.cmId})`}` });
  }
  return el('p.crc-target', { 'data-missing': 'yes', text: link?.note ?? '이동할 곳을 모릅니다.' });
}

// ── 카드 ────────────────────────────────────────────────────────────────

function conditionCard(criterionId, ctx) {
  const { snapshot, links, tracker, evidence, evidenceState, session, approval, signedAtMs,
    certificate, busy, onOpen, sourceText, demo = false } = ctx;
  const meta = CRITERIA[criterionId];
  const task = TASK[criterionId] ?? { title: meta?.label ?? criterionId, todo: '', verb: null };
  const row = snapshot?.rows.find((r) => r.criterionId === criterionId) ?? null;
  const shown = row ? displayState(row) : { state: null, note: null };
  const met = shown.state === 'MET';
  const c = row ? collectionFrom(row) : null;
  const ev = evidenceFor(evidence, criterionId);
  const link = links?.[criterionId] ?? null;
  const ret = tracker ? tracker.status(criterionId) : { state: RETURN.IDLE };
  const line = returnLine(ret, row, { where: link?.where ?? '원래 화면' });
  const verdict = verdictOf({ row, shown, ret });

  let detail = null;   // 조건별 덧붙임(회고 검토 · 인증 단계 · Moodle 기록)
  let cert = null;
  let verb = task.verb;
  let why = null;      // 판단 이유 한 줄
  let folded = [];     // '자세히 보기' 에 접어 둘 기록(Moodle 완료·제출 시각 등)
  if (criterionId === 'reflection-topics') {
    const review = reflectionReview({
      row, evRow: ev.row, limitations: ev.limitations, phase: session?.phase ?? null,
      aiApproval: session?.aiApproval ?? null, sourceText,
      // 떠나지 않고 「다시 확인」 만 누른 경우(departed=false)는 고친 글이 아니다.
      returned: ret.departed !== false && [RETURN.CHECKING, RETURN.PENDING, RETURN.STALLED, RETURN.READ_FAILED, RETURN.CANNOT_CHECK].includes(ret.state),
    });
    detail = el('div', {}, [
      reflectionBlock(review, link, { demo }),
      // 회고 재검증은 강의·과제의 원천 재확인 경로와 별개다(오규원 11/6). 실제 연결 전까지
      // 시연은 '합성 검증 범위', 실제 모드는 '경로 연결 전' 이라고 말한다.
      el('p.crc-muted', { 'data-role': 'reflection-scope', text: demo
        ? '회고 재검증은 합성 검증 범위예요 — 강의·과제 재확인 경로와 별개이고, 실제 연결 전이라 이 페이지의 대역이 흉내 내요.'
        : '회고 재검증 경로는 아직 연결 전이에요. 돌아오면 서버에 저장된 판정만 다시 읽어요.' }),
    ]);
    // 없는 항목이 있을 때만 '보완하기'. 불확실뿐이면 열어 보는 동작으로 둔다.
    if (review.needsRewrite) verb = review.topics.some((t) => t.state === 'ABSENT' || t.state === 'MISSING') ? '회고 보완하기' : '회고 열기';
  } else if (criterionId === 'python-basic-certificate') {
    cert = certificateStatus({ row, evRow: ev.row, availability: ev.availability, session, approval, signedAtMs });
    why = cert.title;
    detail = certificateBlock(cert);
  } else {
    const facts = moodleFacts(criterionId, ev.row);
    why = met ? task.met : row ? (shown.note ?? task.unmet) : null;
    const more = [
      facts.length ? pairs(facts) : null,
      !facts.length && row?.evidenceId && evidenceState === EVIDENCE_LOAD.LOADING ? el('p.crc-muted', { text: 'Moodle 기록을 읽는 중이에요.' }) : null,
      !facts.length && row?.evidenceId && evidenceState === EVIDENCE_LOAD.FAILED
        ? el('p.crc-muted', { text: '근거 기록을 가져오지 못했어요. 판정은 서버 값 그대로이고, 「근거 보기」 에서 다시 볼 수 있어요.' })
        : null,
    ].filter(Boolean);
    // 완료·제출 기록 시각 같은 이력은 '자세히 보기' 로 접는다. 위에는 이유 한 줄만.
    folded = more.length ? more : [];
  }

  return el('li.cc.crc-card', {
    'data-state': met ? 'met' : 'open',
    'data-criterion': criterionId,
    'data-return': ret.state,
    'data-verdict': verdict.key,
  }, [
    // 1. 해야 하는 일
    el('span.cc-chip', { 'aria-hidden': 'true' }, [icon(CARD_ICON[criterionId] ?? 'check')]),
    el('h3.bcx-task-name', { text: task.title }),
    el('p.cc-sub.crc-todo', { text: task.todo }),

    // 2. 지금 충족 여부 — 크게 한 단어. 확인 중·조회 실패는 미충족과 다르다.
    el('p.crc-verdict', { 'data-tone': verdict.tone }, [
      el('strong', { text: verdict.label }),
      verdict.key === 'CHECKING' || verdict.key === 'FETCH_FAILED'
        ? el('span.crc-verdict-sub', { text: `서버 판정 ${row ? (STATE_TEXT[shown.state] ?? shown.state) : '없음'}` })
        : null,
    ].filter(Boolean)),
    line ? el('p.crc-status', { role: 'status', 'data-tone': line.tone, text: line.text }) : null,

    // 3. 판단 이유와 확인 근거
    why ? el('p.crc-why', { text: why }) : null,
    criterionId !== 'reflection-topics' && shown.note && !met && why !== shown.note ? el('p.cc-note', { text: shown.note }) : null,
    el('p.crc-source', { text: `확인 출처 · ${c?.shortLabel ?? SOURCE_SHORT[criterionId] ?? '미확인'} · 근거 ${c?.collected ? '확보' : '없음'}` }),
    detail,

    // 4. 다음 행동
    el('div.crc-actions', {}, [
      goControl(criterionId, link, { tracker, cert, certificate, busy, verb }),
      line?.recheck
        ? el('button.crc-sub-btn', {
          type: 'button', disabled: busy || ret.state === RETURN.CHECKING,
          onClick: () => { void tracker?.recheck(criterionId); },
        }, [el('span', { text: '다시 확인' })])
        : null,
      el('button.crc-sub-btn', { type: 'button', onClick: () => onOpen(criterionId) }, [el('span', { text: '근거 보기' })]),
    ]),
    // 상세 원문·열 항목·조회 시각은 접어 둔다.
    el('details.crc-more', {}, [
      el('summary', { text: '자세히 보기' }),
      ...folded,
      targetLine(criterionId, link),
      meta?.value ? el('p.crc-muted', { text: `조건 종류 · ${meta.label} (${meta.value})` }) : null,
      row?.evidenceId ? el('p.crc-muted', { text: `근거 ${row.evidenceId} · 개정 ${row.evidenceRevision ?? '-'}` }) : null,
      ret.refresh?.operationId ? el('p.crc-muted', { text: `재확인 접수 번호 ${ret.refresh.operationId}` }) : null,
    ].filter(Boolean)),
  ].filter(Boolean));
}

/**
 * 네 카드 구역.
 *
 * @param {object} o
 * @param {object|null} o.snapshot   conditionRows() 결과. 없으면 카드만 '판정 없음' 으로
 * @param {object} o.links           resolveTargets() 결과
 * @param {object|null} o.tracker    createReturnTracker() 결과
 * @param {object|null} o.evidence   지금 판정과 맞는 판정 근거
 * @param {object|null} o.session    { applicationId, boundApplicationId, phase, failure, aiApproval }
 * @param {object|null} o.certificate 기존 driver 동작 { start, read, sign }
 * @param {boolean} [o.demo]         독립 프리뷰의 시연 데이터면 true
 */
export function conditionCardsSection({
  snapshot = null, links = null, tracker = null, evidence = null, evidenceState = EVIDENCE_LOAD.IDLE,
  session = null, approval = null, signedAtMs = null, certificate = null, busy = false,
  onOpen = () => {}, sourceText = null, demo = false,
} = {}) {
  const ctx = { snapshot, links, tracker, evidence, evidenceState, session, approval, signedAtMs, certificate, busy, onOpen, sourceText, demo };
  const rows = snapshot?.rows ?? [];
  const met = rows.filter((r) => r.state === 'MET' && r.current !== false).length;
  const anyLinked = CRITERION_IDS.some((id) => links?.[id]?.status === LINK.LINKED);
  // 상단 띠 — 지금 단계와 다음 행동. 카드 상태(서버 판정 + 재확인 상태)에서만 만든다.
  const returns = CRITERION_IDS.map((id) => (tracker ? tracker.status(id) : { state: RETURN.IDLE }));
  const notMet = CRITERION_IDS.filter((id) => rows.find((r) => r.criterionId === id)?.state !== 'MET');
  // '조회 중' 과 '접수' 를 섞지 않는다 — tracker 가 가진 실제 재확인 응답으로 센다.
  const live = returns.filter((r) => [RETURN.CHECKING, RETURN.PENDING].includes(r.state));
  const byStatus = (status) => live.filter((r) => r.refresh?.status === status).length;
  const stripLine = conditionsLine({
    met: snapshot ? met : null,
    lacking: notMet.map((id) => TASK[id]?.title ?? id),
    refresh: {
      queued: byStatus('QUEUED'),
      rateLimited: byStatus('RATE_LIMITED'),
      failed: byStatus('REQUEST_FAILED'),
      unavailable: returns.filter((r) => r.state === RETURN.CANNOT_CHECK).length,
      reading: live.filter((r) => !r.refresh || !['QUEUED', 'RATE_LIMITED', 'REQUEST_FAILED'].includes(r.refresh.status)).length,
    },
    fetchFailed: returns.some((r) => r.state === RETURN.READ_FAILED),
  });
  const firstLacking = notMet[0] ?? null;
  const stripAction = snapshot && met < 4 && firstLacking
    ? {
      // 순서 없음 — 남은 조건 중 화면에서 첫 카드로 데려갈 뿐이다.
      label: notMet.length > 1 ? '남은 조건 보러 가기' : `${TASK[firstLacking]?.title ?? firstLacking} 보러 가기`,
      onClick: () => {
        const target = typeof document !== 'undefined' ? document.querySelector(`[data-criterion="${firstLacking}"]`) : null;
        target?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      },
    }
    : null;

  return el('section.cc-section.crc', { 'data-demo': demo ? 'yes' : null }, [
    stageStrip({ stage: STAGE.CONDITIONS, line: stripLine, action: stripAction, demo }),
    el('div.sec-head', {}, [
      el('div', {}, [
        el('h2.sec-title', { text: '환급 조건' }),
        el('p.sec-sub', {
          text: '네 개를 모두 충족하면 100 TEST 를 지급합니다. 카드에서 원래 화면으로 가서 마치고 '
            + '이 탭으로 돌아오시면 CLEAR 가 서버 판정을 다시 읽어요. 따로 올릴 증빙은 없어요.',
        }),
      ]),
      el('p.sec-count', { text: snapshot ? `${met} / 4 충족` : '판정 전' }),
    ]),

    demo ? el('p.bcx-warn', { text: '시연 데이터 · 서버·Moodle·HackerRank 는 이 페이지 안의 시연용 대역이에요. 실제 기록이 아니에요.' }) : null,
    // 넷 다 충족한 뒤 "그래서 이제 뭐?" 가 없었다(11/5 점검). 지급은 이 화면이 하지 않는다 —
    // 기존 지급 흐름의 서버가 한다. 여기서 약속하는 건 '더 할 일이 없다' 까지다.
    snapshot && snapshot.current !== false && met === 4
      ? el('p.bcx-note', { 'data-role': 'all-met', text: '네 조건을 모두 충족했어요. 이 화면에서 더 할 일은 없어요. 100 TEST 지급은 기존 지급 흐름에서 서버가 처리하고, 결과는 기존 CLEAR 화면(수령 확인)에서 보여요.' })
      : null,
    snapshot?.source === 'OPERATIONS'
      ? el('p.bcx-note', { text: '확인 절차가 준비되기 전이라 수집 단계에 저장된 판정을 보여 드려요. 조건별 현재성은 아직 표시되지 않아요.' })
      : null,
    snapshot && snapshot.current === false
      ? el('p.bcx-warn', { text: '지금 판정이 아니에요. 다시 읽기 전까지 이 판정으로 진행하지 않아요.' })
      : null,
    !anyLinked && links
      ? el('p.bcx-note', { text: links['activity-complete']?.note ?? '이동할 Moodle 항목 주소가 없어요.' })
      : null,

    el('ul.cc-grid.crc-grid', {}, CRITERION_IDS.map((id) => conditionCard(id, ctx))),

    el('p.sec-foot', {
      text: [
        demo ? null : '돌아오시면 서버에 저장된 판정을 다시 읽어요. 이 조회는 Moodle·Reclaim 원천을 다시 읽지 않아요 — '
          + '판정이 바뀌려면 서버가 원천을 다시 읽어야 해요.',
        snapshot?.observedAt ? `서버 기준 ${seoulText(snapshot.observedAt)}` : null,
      ].filter(Boolean).join(' · '),
    }),
  ].filter(Boolean));
}

export { REVIEW, CERT };
