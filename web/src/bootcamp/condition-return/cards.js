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

function reflectionBlock(review) {
  return el('div.crc-block', { 'data-review': review.state }, [
    el('p.crc-title', { text: review.title }),
    review.note ? el('p.crc-muted', { text: review.note }) : null,
    review.reason ? el('p.crc-reason', { text: `판정 사유 · ${review.reason}` }) : null,
    review.topics.length
      ? el('div', {}, [
        review.previous ? el('p.crc-muted', { text: '아래는 지난 검토 결과예요. 새 검토가 끝나면 바뀌어요.' }) : null,
        el('ul.crc-topics', {}, review.topics.map((t) => el('li', { 'data-met': t.state === 'PRESENT' ? 'yes' : 'no' }, [
          el('span.crc-topic', { text: t.label }),
          el('span.crc-topic-state', { text: t.stateText }),
          t.quote
            ? el('q.crc-quote', { text: t.quote })
            : el('span.crc-loc', {
              text: t.location ? `원문 ${t.location.start}–${t.location.end} (UTF-16)`
                : t.state === 'PRESENT' ? '원문 위치 미제공' : '근거 문장을 찾지 못했어요',
            }),
        ]))),
        review.originalNote ? el('p.crc-muted', { text: review.originalNote }) : null,
      ])
      : null,
    pairs(review.meta),
  ]);
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

function goControl(criterionId, link, { tracker, cert, certificate, busy }) {
  if (criterionId === 'python-basic-certificate') {
    const act = cert?.action;
    if (!act) return null;
    const run = certificate?.[act.kind];
    return el('button.cc-btn.crc-go', {
      type: 'button',
      disabled: busy || typeof run !== 'function',
      onClick: () => {
        // 서명하면 학생은 HackerRank 로그인 창으로 간다. 돌아오면 다시 읽는다.
        if (act.kind === 'sign') tracker?.depart(criterionId);
        void run?.();
      },
    }, [el('span', { text: act.label }), icon('arrowUpRight')]);
  }
  if (link?.status === LINK.LINKED) {
    return el('a.cc-btn.crc-go', {
      href: link.href,
      target: '_blank',
      rel: 'noopener noreferrer',
      onClick: () => tracker?.depart(criterionId),
    }, [el('span', { text: link.verb }), icon('arrowUpRight')]);
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
    certificate, busy, onOpen, sourceText } = ctx;
  const meta = CRITERIA[criterionId];
  const row = snapshot?.rows.find((r) => r.criterionId === criterionId) ?? null;
  const shown = row ? displayState(row) : { state: null, note: null };
  const met = shown.state === 'MET';
  const c = row ? collectionFrom(row) : null;
  const ev = evidenceFor(evidence, criterionId);
  const link = links?.[criterionId] ?? null;
  const ret = tracker ? tracker.status(criterionId) : { state: RETURN.IDLE };
  const line = returnLine(ret, row, { where: link?.where ?? '원래 화면' });

  let extra = null;
  let cert = null;
  if (criterionId === 'reflection-topics') {
    extra = reflectionBlock(reflectionReview({
      row, evRow: ev.row, limitations: ev.limitations, phase: session?.phase ?? null,
      aiApproval: session?.aiApproval ?? null, sourceText,
    }));
  } else if (criterionId === 'python-basic-certificate') {
    cert = certificateStatus({ row, evRow: ev.row, availability: ev.availability, session, approval, signedAtMs });
    extra = certificateBlock(cert);
  } else {
    extra = moodleBlock(criterionId, ev, evidenceState, row);
  }

  return el('li.cc.crc-card', {
    'data-state': met ? 'met' : 'open',
    'data-criterion': criterionId,
    'data-return': ret.state,
  }, [
    el('span.cc-chip', { 'aria-hidden': 'true' }, [icon(CARD_ICON[criterionId] ?? 'check')]),
    el('h3.bcx-task-name', { text: meta?.label ?? criterionId }),
    el('p.cc-sub', { text: meta?.value ?? '' }),

    el('ul.cc-rows', {}, [
      cardRow('서버 판정', row ? STATE_TEXT[shown.state] ?? shown.state : '판정 없음', { strong: met }),
      cardRow('원천', c?.shortLabel ?? SOURCE_SHORT[criterionId] ?? '미확인'),
      cardRow('근거', c?.collected ? '확보' : '없음'),
    ]),

    line ? el('p.crc-status', { role: 'status', 'data-tone': line.tone, text: line.text }) : null,
    extra,
    shown.note ? el('p.cc-note', { text: shown.note }) : null,
    targetLine(criterionId, link),

    el('div.crc-actions', {}, [
      // 이미 충족이면 다시 갈 이유가 적다. 그래도 길은 남긴다 — 기록을 볼 수 있다.
      goControl(criterionId, link, { tracker, cert, certificate, busy }),
      line?.recheck
        ? el('button.crc-sub-btn', {
          type: 'button', disabled: busy || ret.state === RETURN.CHECKING,
          onClick: () => { void tracker?.recheck(criterionId); },
        }, [el('span', { text: '다시 확인' })])
        : null,
      el('button.crc-sub-btn', { type: 'button', onClick: () => onOpen(criterionId) }, [el('span', { text: '자세히' })]),
    ]),
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
  const ctx = { snapshot, links, tracker, evidence, evidenceState, session, approval, signedAtMs, certificate, busy, onOpen, sourceText };
  const met = (snapshot?.rows ?? []).filter((r) => r.state === 'MET' && r.current !== false).length;
  const anyLinked = CRITERION_IDS.some((id) => links?.[id]?.status === LINK.LINKED);

  return el('section.cc-section.crc', { 'data-demo': demo ? 'yes' : null }, [
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
