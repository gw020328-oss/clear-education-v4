// 부트캠프 화면
//
// 이슈 #106 의 2단계. 네 조건의 현재 상태를 보여준다.
//
// 조건 목록은 policy-view 의 conditionBody 를 그대로 쓴다. 같은 상태 이름이
// 반마다 다르게 보이면 안 되기 때문이다. 나머지(단계·재원·지급)는 어학원 반과
// 구성이 달라 여기서 따로 그린다.
//
// 이 화면이 하지 않는 것
//
//   오류를 충족으로 바꾸지 않는다. 모르는 것은 모른다고 적는다
//   받지 못한 숫자를 0 으로 채우지 않는다
//   INCLUDED 를 최종 확정이라고 말하지 않는다
//   준비 중(PREPARED_NOT_ACTIVATED)에 쓰기 버튼을 열지 않는다

import { el, clear } from '../ui/dom.js';
import { conditionBody, seoulText } from '../ui/policy-view.js';
import { conditionsFrom } from '../ui/conditions.js';
import { policyFrom, progressFrom, metCount } from './criteria.js';
import { sourceSignaturePanel, consentPanel, paymentPanel } from './panels.js';

/** 절차 상태 → 사람 말. 모르는 값은 그대로 보여준다 */
const PROCEDURE = Object.freeze({
  FUNDING_WAIT: '조건 충족 · 재원 배정 대기',
  READY_TO_PUBLISH: '확인 절차 공개 준비',
  WAITING_CONFIRMATION: '양측 확인 중',
  OBJECTION_BLOCKED: '오류 신고 접수 · 검토 대기',
  REVALIDATION_REQUIRED: '새 근거 재검증 필요',
  SOURCE_REVERIFICATION_REQUIRED: '근거 재확인 필요',
  CURRENT_DECISION_PUBLICATION_REQUIRED: '새 판정 공개 필요',
  FULL_ALLOCATION_REQUIRED: '현재 판정에 맞는 전액 배정 확인 필요',
  FULL_120_ROUTE_UNAVAILABLE: '남은 상한 내 새 확인 경로 사용 불가',
  EARLY_CONSENT_PREFLIGHT_CANDIDATE: '양측 동의 완료 · 지급 전 검사',
  DEADLINE_PREFLIGHT_CANDIDATE: '확인 기간 종료 · 지급 전 검사',
  INVALIDATED_WAIT_FOR_TERMINATION_CONDITION: '신청 무효화 · 종료 조건 대기',
  UNRESOLVED_TERMINATION_REQUIRED: '미해결 종료 처리 필요',
  CONTRACT_TERMINATED: '이번 지급 절차 종료',
  ACCEPTED_RIGHT_PRESERVED: '수락된 지급권리 보존 · 청구 가능',
});

const FUNDING = Object.freeze({
  WAITING_FUNDS: '재원 대기',
  FULLY_ALLOCATED: '전액 배정됨',
  PARTIALLY_ALLOCATED: '일부만 배정됨',
  RELEASED: '배정 해제됨',
});

const ROLE = Object.freeze({ PARTICIPANT: '참가자', COURSE_OPERATOR: '운영자', OPERATOR: '운영자' });

/** atoms → 사람이 읽는 수량. 받지 못했으면 null 을 그대로 돌려준다 */
function tokenText(atoms, decimals, symbol) {
  if (atoms === null || atoms === undefined) return null;
  const whole = Number(atoms) / 10 ** decimals;
  return `${whole.toLocaleString('ko-KR')} ${symbol}`;
}

/** 확인 전인 값. 0 으로 바꾸지 않고 '확인 전' 이라고 적는다 */
const unknown = () => el('span.bc-unknown', { text: '확인 전' });

function pair(label, value) {
  return el('div.pair', {}, [
    el('dt', { text: label }),
    el('dd', {}, [typeof value === 'string' ? el('span', { text: value }) : (value ?? unknown())]),
  ]);
}

/** 호스트가 아직 켜지지 않았을 때 */
export function preparingNotice(phase) {
  return el('div.bc-notice', { 'data-tone': 'wait' }, [
    el('strong', { text: '서버 준비 중' }),
    el('p', {
      text: phase === 'PREPARED_NOT_ACTIVATED'
        ? '실행 환경이 아직 켜지지 않았습니다. 체인·신청 정보가 없고 로그인과 쓰기가 막혀 있습니다. '
          + '통합 담당이 활성화하면 이 화면에서 이어서 진행할 수 있습니다.'
        : `호스트 단계가 ${phase ?? '확인 전'} 입니다.`,
    }),
  ]);
}

/** 검토 절차가 아직 준비되지 않았을 때 — 조건만 보여주고 쓰기는 막는다 */
export function procedureNotReadyNotice() {
  return el('div.bc-notice', { 'data-tone': 'wait' }, [
    el('strong', { text: '검토 준비 중' }),
    el('p', {
      text: '아직 체인 신청이 결합되지 않아 판정 절차를 조회할 수 없습니다. '
        + '아래 조건 상태는 기존 수집 기록으로 보여주는 것이며, 동의는 준비가 끝난 뒤 열립니다.',
    }),
  ]);
}

/**
 * 네 조건 구역.
 *
 * @param {object} view  normalView 결과
 */
export function criteriaSection(view) {
  const model = conditionsFrom(policyFrom(view), progressFrom(view));
  const met = metCount(view);
  const status = view.decision.conditionsStatus;

  return el('section.bc-criteria', {}, [
    el('div.sec-head', {}, [
      el('h3', { text: '환급 조건 — 아래 4개를 모두 충족해야 합니다' }),
      el('span.bc-count', { text: `${met} / 4 충족` }),
    ]),
    // 서버의 전체 집계와 우리가 센 수를 함께 보여준다. 둘이 어긋나면
    // 화면이 조용히 한쪽을 고르지 않고 둘 다 적는다.
    status !== 'MET' && met === 4
      ? el('p.bc-warn', {
        text: `조건 넷이 모두 충족으로 보이지만 서버의 전체 판정은 ${status} 입니다. `
          + '전체 판정이 바뀌기 전까지는 충족으로 다루지 않습니다.',
      })
      : null,
    view.decision.evidenceCurrent === false
      ? el('p.bc-warn', { text: '근거의 현재성이 확인되지 않았습니다. 다시 수집해야 할 수 있습니다.' })
      : null,
    ...conditionBody(model, model.groups[0].id, { withPayout: false }),
  ].filter(Boolean));
}

/** 절차·재원 구역 */
export function procedureSection(view) {
  const p = view.procedure;
  const f = view.funding;
  const shortfall = f?.queue?.shortfallAtoms ?? null;

  return el('section.bc-procedure', {}, [
    el('div.sec-head', {}, [el('h3', { text: '절차와 재원' })]),
    el('dl.pairs', {}, [
      pair('절차 상태', p?.status ? (PROCEDURE[p.status] ?? p.status) : null),
      pair('재원', f?.status ? (FUNDING[f.status] ?? f.status) : null),
      pair('약정 금액', tokenText(view.agreedPayment.amountAtoms, view.agreedPayment.decimals, view.agreedPayment.symbol)),
      pair('이 신청에 배정된 금액',
        tokenText(f?.reservedAtoms, view.agreedPayment.decimals, view.agreedPayment.symbol)),
      // 부족액과 대기 순번은 숨기지 않는다. 멘토가 꼽은 '투명한 대기열' 이 이것이다.
      shortfall
        ? pair('부족액', tokenText(shortfall, view.agreedPayment.decimals, view.agreedPayment.symbol))
        : null,
      f?.queue?.position ? pair('대기열', `${f.queue.position}번`) : null,
      p?.confirmAt ? pair('확인 기간 종료', seoulText(p.confirmAt)) : null,
      p?.reviewCapAt ? pair('전체 상한', seoulText(p.reviewCapAt)) : null,
    ].filter(Boolean)),

    f && f.matchesCurrentDecision === false
      ? el('p.bc-warn', {
        text: '배정된 재원이 현재 판정과 맞지 않습니다. 현재 판정에 맞는 전액 배정이 확인돼야 지급으로 갑니다.',
      })
      : null,
    view.objection?.blocked
      ? el('p.bc-warn', { text: '미해결 오류 신고가 있어 지급이 막혀 있습니다.' })
      : null,
  ].filter(Boolean));
}

/** 동의 현황 — 누가 동의했는지. 버튼은 4단계에서 붙인다 */
export function consentSection(view) {
  const records = view.consent?.records ?? [];
  const required = view.consent?.requiredRoles ?? [];
  const done = new Set(records.map((r) => r.actorRole));

  return el('section.bc-consent', {}, [
    el('div.sec-head', {}, [el('h3', { text: '양측 확인' })]),
    el('ul.bc-roles', {}, required.map((role) => el('li', {
      'data-done': done.has(role) ? 'yes' : 'no',
    }, [
      el('span.bc-role', { text: ROLE[role] ?? role }),
      el('span.bc-rolestate', { text: done.has(role) ? '동의함' : '대기 중' }),
    ]))),
    // bothCurrent 는 '둘 다 지금 판정에 동의했는가' 다. 기록이 둘이어도
    // 판정이 바뀌었으면 false 다. 그 구분을 화면이 지워서는 안 된다.
    view.consent?.bothCurrent === false && records.length > 0
      ? el('p.bc-warn', {
        text: '동의 기록이 있지만 현재 판정 기준으로는 아직 양측 동의가 아닙니다. '
          + '판정이 바뀌었다면 새로 동의해야 합니다.',
      })
      : null,
  ].filter(Boolean));
}

/** 머리말 — 역할·신청·판정 */
export function headerSection(view) {
  return el('section.bc-head', {}, [
    el('h2', { text: 'Python 부트캠프 — 환급 확인' }),
    el('dl.pairs', {}, [
      pair('내 역할', ROLE[view.role] ?? view.role),
      pair('신청', view.applicationId),
      pair('판정', `${view.decision.id} · rev ${view.decision.revision}`),
      pair('조회 시각', view.observedAt ? seoulText(view.observedAt) : null),
    ]),
    view.decision.current === false
      ? el('p.bc-warn', { text: '이 판정은 더 이상 현재 판정이 아닙니다. 다시 조회해야 합니다.' })
      : null,
  ].filter(Boolean));
}

/**
 * 부트캠프 화면 전체.
 *
 * @param {object} options
 * @param {object} options.view        normalView 결과
 * @param {string|null} [options.phase]  호스트 단계
 * @param {boolean} [options.procedureReady]
 * @param {object|null} [options.api]    normal-client. 없으면 읽기 전용
 * @param {Function|null} [options.sign] personal_sign
 */
export function bootcampSection({
  view, phase = null, procedureReady = true, api = null, sign = null, onChange = () => {},
}) {
  const section = el('section.bc', {});

  // 쓰기를 막는 이유. 하나라도 있으면 버튼을 열지 않고 그 이유를 적는다.
  const blocked = phase && phase !== 'ACTIVE_LOCAL_TEST'
    ? '서버가 아직 켜지지 않았습니다.'
    : !procedureReady
      ? '검토 절차가 아직 준비되지 않았습니다.'
      : !api
        ? '서버에 연결되지 않았습니다. 지금 보이는 것은 백엔드가 준 합성 예시입니다.'
        : view.decision.current === false
          ? '현재 판정이 아닙니다. 다시 조회해 주세요.'
          : view.objection?.blocked
            ? '미해결 오류 신고가 있어 막혀 있습니다.'
            : null;

  const render = () => {
    clear(section);
    section.append(...[
      phase && phase !== 'ACTIVE_LOCAL_TEST' ? preparingNotice(phase) : null,
      !procedureReady ? procedureNotReadyNotice() : null,
      headerSection(view),
      criteriaSection(view),
      // 3단계 — 참가자만. 인증서 조건이 아직 충족이 아닐 때 보여준다.
      sourceSignaturePanel({ view, api, blocked, sign, onDone: onChange }),
      procedureSection(view),
      consentSection(view),
      // 4단계 — 각 역할이 자기 화면에서 직접 동의한다.
      consentPanel({ view, api, blocked, onDone: onChange }),
      // 5단계 — 약정·배정·거래·수령을 나눠 그린다.
      paymentPanel({ view, api, blocked }),
      el('p.bc-foot', {
        text: '여기 표시된 것은 지금까지 확인된 기록입니다. 자격을 판정했거나 지급이 끝났다는 뜻이 아닙니다.',
      }),
    ].filter(Boolean));
  };
  render();
  return section;
}
