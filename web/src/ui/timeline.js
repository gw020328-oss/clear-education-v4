// 기록 타임라인 — 다섯 단계를 한 화면에, 단계마다 '그때 생긴 기록'과 함께
//
// 가로 진행 막대만 두면 단계가 달라져도 상세가 똑같아 보인다. 실제로 단계마다
// 달라지는 것은 '어떤 기록이 쌓였는가'다. 그래서 단계별로 그 단계에서 생긴
// 값을 붙이고, 아직 안 된 단계는 무엇이 들어올 자리인지만 적는다.
//
// 값을 지어내지 않는다. 서버가 아직 주지 않는 칸은 비어 있다고 쓴다.

import { el, shortHex } from './dom.js';
import { stateLabel, STEP_ORDER, actorFor } from './state-labels.js';
import { seoulText } from './policy-view.js';

export const DONE = 'done';
export const NOW = 'now';
export const TODO = 'todo';

/**
 * 보려는 단계가 완료인지 진행 중인지 아직인지.
 *
 * 각 단계의 이름·기록·할 일은 모두 「그 단계를 만든 일」이다. 3단계 이름이
 * '최종 동의 저장'이고 거기 최종 동의 지문이 남는 것도 그래서다.
 *
 * 그러니 현재 상태가 3단계면 3단계의 일은 이미 끝난 것이고, 지금 진행 중인
 * 것은 4단계다. 현재 상태와 같은 칸을 '지금 여기'로 칠하면, 이미 한 서명을
 * 지금 해야 하는 일처럼 보여 준다.
 */
export function statusOf(state, currentState) {
  const step = stateLabel(state).step;
  const current = stateLabel(currentState).step;
  // 이 화면이 모르는 상태는 step 이 0 이다. 그때 1단계를 '진행 중'으로 칠하면
  // 모르는 것을 아는 척하게 된다. 아무것도 진행했다고 말하지 않는다.
  if (current === 0) return TODO;
  if (step <= current) return DONE;
  return step === current + 1 ? NOW : TODO;
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
    // 4단계는 거래를 '발급'받는 자리고 5단계가 '승인·전송'하는 자리다.
    // 둘 다 '준비'라고 쓰면 어느 단계 이야기인지 알 수 없다. 발급 자체는
    // 화면에 남길 값이 없어서 문장만 둔다.
    if (status === DONE) {
      rows.push(waitingRow('학원이 예치 거래를 발급받았습니다. 아직 전송 전입니다.'));
    } else if (status === NOW) {
      rows.push(waitingRow('학원이 서버에서 예치 거래를 받아오는 중입니다.'));
    } else {
      rows.push(waitingRow('최종 동의 뒤 학원이 예치 거래를 발급받습니다.'));
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
 * 다섯 단계를 한 줄씩 — 첫 화면용.
 *
 * 첫 화면이 답해야 하는 것은 「어디까지 왔고 지금 누구 차례인가」 하나다.
 * 단계마다 남은 지문·해시까지 펼치면 그 답이 묻힌다. 기록은 단계 상세가
 * 제목 바로 아래에서 보여주므로, 여기서는 줄만 두고 눌러서 들어가게 한다.
 */
export function stepList(view, context = {}) {
  const current = stateLabel(view.state).step;

  return el('section', {}, [
    el('div.sec-head', {}, [
      el('h3', { text: '신청 진행' }),
      el('span.sec-count', { text: `${current} / ${STEP_ORDER.length} 완료` }),
    ]),

    el('ol.sl', { 'aria-label': '신청 진행 단계' }, STEP_ORDER.map((state) => {
      const label = stateLabel(state);
      const status = statusOf(state, view.state);
      // 진행 중인 단계를 끝내는 쪽이 누구인가. actorFor 는 '지금 상태에서
      // 다음에 움직일 쪽' 을 주므로 지금 상태를 넣어야 한다. 단계의 상태를
      // 넣으면 한 칸 밀린 답이 나온다 — DRAFT 에서 2단계가 '학원 차례' 로
      // 나오던 것이 그것이다. 조건 동의 서명은 참가자가 한다.
      const actor = status === NOW ? actorFor(view.state, context) : null;

      return el('li.sl-item', {
        'data-status': status,
        'aria-current': status === NOW ? 'step' : null,
      }, [
        el('a.sl-link', { href: `#/applications/${view.applicationId}/steps/${label.step}` }, [
          el('span.sl-dot', { 'aria-hidden': 'true', text: status === DONE ? '✓' : String(label.step) }),
          el('span.sl-title', { text: label.title }),
          actor ? el('span.actor', { 'data-actor': actor.key, text: actor.label }) : null,
          el('span.sl-state', {
            text: status === DONE ? '완료' : status === NOW ? '진행 중' : '대기',
          }),
          el('span.sl-go', { 'aria-hidden': 'true', text: '›' }),
        ]),
      ]);
    })),
  ]);
}
