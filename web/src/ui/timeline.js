// 기록 타임라인 — 다섯 단계를 한 화면에, 단계마다 '그때 생긴 기록'과 함께
//
// 가로 진행 막대만 두면 단계가 달라져도 상세가 똑같아 보인다. 실제로 단계마다
// 달라지는 것은 '어떤 기록이 쌓였는가'다. 그래서 단계별로 그 단계에서 생긴
// 값을 붙이고, 아직 안 된 단계는 무엇이 들어올 자리인지만 적는다.
//
// 값을 지어내지 않는다. 서버가 아직 주지 않는 칸은 비어 있다고 쓴다.

import { el, shortHex } from './dom.js';
import { stateLabel, STEP_ORDER, actorFor, nextFor } from './state-labels.js';
import { seoulText } from './policy-view.js';

export const DONE = 'done';
export const NOW = 'now';
export const TODO = 'todo';

/** 보려는 단계가 현재 상태 기준으로 완료인지 현재인지 아직인지 */
export function statusOf(state, currentState) {
  const step = stateLabel(state).step;
  const current = stateLabel(currentState).step;
  return step < current ? DONE : step === current ? NOW : TODO;
}

/** 해시 한 줄 — 짧게 보이고 전체 값은 title 로 남긴다 */
const hashRow = (label, value) => el('div.rec', {}, [
  el('span.rec-key', { text: label }),
  el('code.rec-val', { text: shortHex(value), title: value }),
]);

const textRow = (label, value) => el('div.rec', {}, [
  el('span.rec-key', { text: label }),
  el('span.rec-val', { text: value }),
]);

const waitingRow = (text) => el('p.rec-wait', { text });

/**
 * 단계마다 무엇을 보여줄지.
 * 완료된 단계에는 그 단계가 남긴 값을, 아직인 단계에는 무엇이 들어올 자리인지를 쓴다.
 */
export function recordsFor(state, view, status) {
  const rows = [];
  if (state === 'DRAFT') {
    if (status === DONE || status === NOW) {
      rows.push(hashRow('신청 ID', view.applicationId));
      rows.push(textRow('생성 시각', seoulText(view.createdAt)));
    }
  }
  if (state === 'TERMS_ACCEPTED') {
    if (view.consentDigest) {
      rows.push(hashRow('신청 동의 지문', view.consentDigest));
      if (view.consentedAt) rows.push(textRow('동의 시각', seoulText(view.consentedAt)));
    } else {
      rows.push(waitingRow('조건을 확인하고 서명하면 동의 지문이 남습니다.'));
    }
  }
  if (state === 'CONSENTED') {
    if (view.finalConsentDigest) {
      rows.push(hashRow('최종 동의 지문', view.finalConsentDigest));
      rows.push(hashRow('배포 설정 해시', view.runtimeConfigHash));
    } else {
      rows.push(waitingRow('학원이 금고를 연결하면 그 설정을 보고 한 번 더 서명합니다.'));
    }
  }
  if (state === 'FUNDING_PENDING') {
    // 3단계가 거래를 '발급'받는 자리이고 4단계가 '승인·전송'하는 자리다.
    // 두 단계를 모두 '준비'라고 쓰면 어느 단계 이야기인지 알 수 없다.
    if (status === DONE) {
      rows.push(waitingRow('학원이 토큰 승인과 예치 전송을 마쳤습니다.'));
    } else if (status === NOW) {
      rows.push(waitingRow('학원이 토큰 승인과 예치 전송을 진행합니다. 아직 전송된 것은 아닙니다.'));
    } else {
      rows.push(waitingRow('환급금이 실제로 금고에 들어가는 자리입니다. '
        + '학원이 발급받은 예치 거래를 승인하고 전송합니다.'));
    }
  }
  if (state === 'ENROLLED') {
    if (view.fundingEvidence) {
      rows.push(hashRow('거래 해시', view.fundingEvidence.transactionHash));
      rows.push(textRow('블록 번호', view.fundingEvidence.blockNumber));
      rows.push(hashRow('블록 해시', view.fundingEvidence.blockHash));
    } else {
      rows.push(waitingRow('예치가 확인되면 거래 해시와 블록 정보가 여기 남습니다.'));
    }
  }
  return rows;
}

/**
 * @param {object} view  신청 view
 * @returns 다섯 단계 세로 타임라인
 */
export function recordTimeline(view, context = {}) {
  const current = stateLabel(view.state).step;

  return el('section', {}, [
    el('div.sec-head', {}, [
      el('h3', { text: '진행 기록' }),
      el('span.sec-count', { text: `${current} / ${STEP_ORDER.length} 단계` }),
    ]),
    el('p.muted', { text: '단계마다 그때 남은 기록을 함께 보여줍니다. 아직인 단계는 비어 있습니다.' }),

    el('ol.tl', { 'aria-label': '신청 진행 기록' }, STEP_ORDER.map((state) => {
      const label = stateLabel(state);
      const status = statusOf(state, view.state);
      const rows = recordsFor(state, view, status);

      return el('li.tl-item', {
        'data-status': status,
        'aria-current': status === NOW ? 'step' : null,
      }, [
        el('span.tl-dot', { 'aria-hidden': 'true', text: status === DONE ? '✓' : String(label.step) }),
        el('div.tl-body', {}, [
          el('div.tl-head', {}, [
            el('a.tl-title', {
              href: `#/applications/${view.applicationId}/steps/${label.step}`,
            }, [el('span', { text: label.title }), el('span.tl-go', { 'aria-hidden': 'true', text: '›' })]),
            el('span.tl-state', {
              text: status === DONE ? '완료' : status === NOW ? '지금 여기' : '대기',
            }),
            status === NOW ? (() => { const a = actorFor(state, context);
              return el('span.tl-actor', { 'data-actor': a.key, text: a.label }); })() : null,
          ]),
          rows.length ? el('div.tl-recs', {}, rows) : null,
          status === NOW ? el('p.tl-next', { text: nextFor(state, context) }) : null,
        ]),
      ]);
    })),
  ]);
}
