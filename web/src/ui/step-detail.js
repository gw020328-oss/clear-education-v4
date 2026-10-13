// 단계 상세 — 한 단계에 대한 것만 보여준다
//
// 동의한 조건과 기한은 신청 전체에 공통이라 첫 화면에 한 번만 둔다. 단계마다
// 똑같이 반복하면 어느 단계를 열어도 같은 화면처럼 보인다.
//
// 여기서는 그 단계에서만 달라지는 것 — 무슨 일이 끝났는지, 어떤 기록이 남았는지,
// 그 단계에서 양쪽이 무엇을 하는지 — 만 다룬다.

import { el, field } from './dom.js';
import { stateLabel, STEP_ORDER, TOTAL_STEPS, actorFor } from './state-labels.js';
import { recordsFor, statusOf, DONE, NOW, TODO } from './timeline.js';

/**
 * 그 단계에서 양쪽이 하는 일.
 *
 * 처음에는 '끝내는 쪽'과 '남긴 쪽'을 나눠 적었는데, 단계 이름이 이미 끝난 일을
 * 가리키다 보니 읽는 사람이 둘을 섞어 읽었다. 그래서 그냥 양쪽을 나란히 적는다.
 * 할 일이 없는 쪽은 비워 두고 화면에 x 로 표시한다.
 *
 * api 는 API_CONTRACT 의 경로를 그대로 적는다. 경로를 고치면
 * tests/steps.test.mjs 가 문서와 맞는지 다시 확인한다.
 */
export const STEP_TASKS = Object.freeze({
  DRAFT: {
    operator: null,
    // 여기서 서명하는 것은 ApplicationTermsV4 — 환급 조건이다.
    // 2단계의 TermsAcceptanceV4(금고 설정 포함)와 다른 서명이므로 구분해 적는다.
    learner: {
      text: '신청 조건을 확인하고 지갑으로 서명합니다. 두 번 하는 동의 서명 중 첫 번째입니다.',
      api: 'POST /applications/:id/consent',
    },
  },
  TERMS_ACCEPTED: {
    // 금고(runtime)는 policyHash 하나에 하나다. VAULT_ENROLLMENT 의
    // '한 cohort 는 하나의 불변 runtime 만 연결한다' 를 따른다.
    // 신청마다 배포하는 것이 아니므로 이미 있으면 할 일이 없다.
    operator: {
      text: '금고가 아직 없으면 배포합니다. 금고는 반마다 하나라서, 이미 있으면 할 일이 없습니다.',
      api: 'POST /runtimes',
    },
    // 로그인 서명까지 세면 '두 번째'가 아니다. 동의 서명만 센다는 것을 밝힌다.
    learner: {
      text: '금고 설정을 확인하고 최종 동의에 서명합니다. 동의 서명 중 두 번째이자 마지막입니다.',
      api: 'POST /applications/:id/final-consent',
    },
  },
  CONSENTED: {
    // funding-intent 는 enrollAndFund calldata 를 돌려줄 뿐이다.
    // 서버는 지갑 키도 송신 권한도 없다 (VAULT_ENROLLMENT). 실제 승인·전송은
    // 다음 단계다. 여기를 '예치 거래를 준비' 라고 적으면 4단계와 구별되지 않는다.
    operator: {
      text: '서버에서 예치 거래를 받아옵니다. 받는 것은 「이 거래를 보내라」는 내용이고, '
        + '아직 돈은 움직이지 않습니다.',
      api: 'POST /applications/:id/funding-intent',
    },
    learner: null,
  },
  FUNDING_PENDING: {
    // VAULT_ENROLLMENT: 무승인 allowance·잔액 부족·revert·미채굴·다른 신청 거래·
    // 토큰 단순 송금은 ENROLLED 로 승격하지 않는다. 학원이 '넣었다'고 말하는 것과
    // 넣은 것의 차이가 이 단계에서 갈리므로 한 줄로 적는다.
    operator: {
      text: '토큰을 승인하고 예치 거래를 보낸 뒤 확인을 요청합니다. 환급금이 실제로 금고에 '
        + '들어가는 자리입니다. 금고로 그냥 토큰을 보낸 것은 인정되지 않고, '
        + '정해진 거래가 성공해야 합니다.',
      api: 'POST /applications/:id/funding-confirmation',
    },
    learner: null,
  },
  ENROLLED: {
    operator: null,
    learner: {
      text: '정해진 기간 안에 수업을 듣고 시험에 응시합니다. 환급은 그 뒤의 별도 절차입니다.',
      api: null,
    },
    // VAULT_ENROLLMENT: ENROLLED 와 fundingEvidence 는 '해당 블록의' 예치 기록이고
    // 실시간 잔액/권리 상태가 아니다. '예치 확인'을 '지금 내 돈이 금고에 있다'로
    // 읽는 것이 가장 자연스러운 오독이라 여기서 끊는다.
    note: '위 기록은 그 블록 시점에 확인된 예치입니다. 지금의 금고 잔액을 실시간으로 '
      + '보여주는 것이 아닙니다.',
  },
});

const chip = (status) => el('span.sd-status', { 'data-status': status, text:
  status === DONE ? '완료' : status === NOW ? '지금 여기' : '아직 오지 않음' });

/** 한 쪽이 그 단계에서 하는 일. 없으면 x 로 적는다 — 빈 줄은 빠뜨린 것처럼 보인다 */
function taskRow(who, task) {
  return el('div.sd-task', { 'data-empty': task ? null : 'yes' }, [
    el('span.sd-who', { text: who }),
    task
      ? el('div.sd-task-body', {}, [
        el('p', { text: task.text }),
        task.api ? el('p.note', {}, [
          el('span', { text: '서버 경로 — ' }),
          el('code', { text: task.api }),
        ]) : null,
      ])
      : el('div.sd-task-body', {}, [el('p.sd-none', { text: 'x' })]),
  ]);
}

/**
 * @param {object} view     신청 view
 * @param {string} state    보여줄 단계의 state
 * @param {object} context  { runtimeReady }
 */
export function stepDetailView(view, state, context = {}) {
  const label = stateLabel(state);
  const status = statusOf(state, view.state);
  const rows = recordsFor(state, view, status);
  const tasks = STEP_TASKS[state];
  const actor = actorFor(state, context);

  const prev = STEP_ORDER[label.step - 2];
  const next = STEP_ORDER[label.step];
  const linkTo = (s) => `#/applications/${view.applicationId}/steps/${stateLabel(s).step}`;

  return el('section', {}, [
    el('p', {}, [el('a.back', { href: `#/applications/${view.applicationId}`, text: '← 신청 전체 보기' })]),

    el('div.sd-head', { 'data-status': status }, [
      el('div.sd-top', {}, [
        el('span.sd-num', { text: `${label.step} / ${TOTAL_STEPS}` }),
        chip(status),
        status === NOW ? el('span.tl-actor', { 'data-actor': actor.key, text: actor.label }) : null,
      ]),
      el('h2', { text: label.title }),
      el('p.sd-fact', { text: status === TODO ? '아직 이 단계에 오지 않았습니다.' : label.fact }),
      el('p.forbidden', {}, [
        el('strong', { text: '이 단계가 말하지 않는 것 — ' }),
        el('span', { text: label.forbidden }),
      ]),
    ]),

    // 단계 이름은 '이미 끝난 일'을 가리킨다. 3단계 '최종 동의 저장'은 2단계에서
    // 참가자가 서명한 결과다. 그러니 제목이 말한 그것의 증거(기록)를 먼저 두고,
    // 앞으로 할 일을 그 뒤에 둔다. 반대로 놓으면 제목을 읽고 그 근거를 찾을 때
    // 할 일을 지나쳐야 해서 끝난 일과 할 일 사이를 왔다 갔다 하게 된다.
    el('h3', { text: '이 단계에 남은 기록' }),
    rows.length
      ? el('div.sd-recs', {}, rows)
      : el('div.card.pending', {}, [el('p', { text: '이 단계에서 남는 기록이 없습니다.' })]),

    el('h3', { text: '이 단계에서 하는 일' }),
    el('div.card', {}, [
      taskRow('학원', tasks.operator),
      taskRow('참가자', tasks.learner),
      tasks.note ? el('p.sd-caveat', { text: tasks.note }) : null,
    ]),

    el('nav.sd-nav', { 'aria-label': '단계 이동' }, [
      prev ? el('a.sd-nav-link', { href: linkTo(prev) }, [
        el('span.sd-nav-dir', { text: '← 이전' }),
        el('span.sd-nav-name', { text: stateLabel(prev).title }),
      ]) : el('span'),
      next ? el('a.sd-nav-link.right', { href: linkTo(next) }, [
        el('span.sd-nav-dir', { text: '다음 →' }),
        el('span.sd-nav-name', { text: stateLabel(next).title }),
      ]) : el('span'),
    ]),
  ]);
}
