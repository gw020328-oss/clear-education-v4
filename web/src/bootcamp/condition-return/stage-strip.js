// 참가자 화면 상단 — 지금 어느 단계이고 다음에 뭘 하면 되는지 한 줄로
//
//   환급 계정 연결 → 조건 확인 → 양측 확인 → 지급 완료
//
// 처음 보는 사람이 화면만 보고 "지금 어떤 단계인가 · 다음에 무엇을 해야 하나" 에
// 답하게 하려는 띠다(오규원 11/6). 상태는 **서버가 준 값에서만** 고른다 — 요청 접수,
// 조건 충족, 양측 확인, 지급 완료는 서로 다른 상태라 섞지 않는다.
//
// 그리기만 한다. 서버를 부르지 않고, 판정을 만들지 않는다.

import { el } from '../../ui/dom.js';

export const STAGE = Object.freeze({
  CONNECT: 'CONNECT', CONDITIONS: 'CONDITIONS', CONFIRM: 'CONFIRM', PAID: 'PAID',
});
export const STAGE_ORDER = Object.freeze([STAGE.CONNECT, STAGE.CONDITIONS, STAGE.CONFIRM, STAGE.PAID]);
export const STAGE_LABEL = Object.freeze({
  [STAGE.CONNECT]: '환급 계정 연결',
  [STAGE.CONDITIONS]: '조건 확인',
  [STAGE.CONFIRM]: '양측 확인',
  [STAGE.PAID]: '지급 완료',
});

// 문체는 대시보드 규칙(합니다체)을 따른다 — 이 띠는 봉인된 student-view 에 마운트된다.
const WHY = Object.freeze({
  [STAGE.CONNECT]: '환급금을 받을 계정을 먼저 연결해야 다음 단계가 열립니다.',
  [STAGE.CONDITIONS]: 'CLEAR 가 Moodle·HackerRank 기록으로 네 조건을 확인합니다. 따로 올릴 증빙은 없습니다.',
  [STAGE.CONFIRM]: '참가자와 운영자가 같은 판정을 확인해야 지급이 나갑니다.',
  [STAGE.PAID]: '네 조건 충족과 양측 확인이 끝나 환급금이 보내졌습니다.',
});
// 종료 사유 — 기존 student-view 의 사전과 같은 말.
const TERMINATION = Object.freeze({
  UNRESOLVED_OBJECTION: '오류 신고가 정해진 시간 안에 해결되지 않았습니다',
  REVALIDATION_EXHAUSTED: '재검증 횟수를 다 썼는데 결론이 나지 않았습니다',
  EVIDENCE_INVALIDATED: '근거가 무효가 되었습니다',
  // 검토 상한(600초)이 지났을 때 A 가 남기는 사유. 지급 권리가 이미 수락됐으면 아래에서 지급 단계가 먼저다.
  REVIEW_CAP_UNRESOLVED: '검토 기한 안에 결론이 나지 않았습니다',
});

/**
 * 조건 확인 단계의 한 줄 — 카드 상태(서버 판정 + tracker 의 실제 재확인 상태)에서만 만든다.
 * '조회 중' 과 '재확인 요청 접수' 를 섞지 않는다(오규원 11/6). 접수는 서버가 QUEUED 라고 답했을 때만.
 *
 * @param {object} o
 * @param {number|null} o.met        충족한 조건 수(서버 판정), 판정 전이면 null
 * @param {string[]} o.lacking       미충족 조건 이름
 * @param {object} [o.refresh]       카드들의 재확인 상태 묶음 { queued, reading, rateLimited, failed, unavailable }
 * @param {boolean} [o.checking]     (구) 읽는 중 — refresh 가 없을 때만 쓴다
 * @param {boolean} o.fetchFailed    판정을 읽지 못한 카드가 있나
 */
export function conditionsLine({ met = null, lacking = [], refresh = null, checking = false, fetchFailed = false } = {}) {
  if (fetchFailed) return { text: '판정을 읽지 못한 조건이 있습니다. 잠시 뒤 「다시 확인」 을 눌러 주세요.', tone: 'warn' };
  const r = refresh ?? { queued: 0, reading: checking ? 1 : 0, rateLimited: 0, failed: 0, unavailable: 0 };
  if (r.queued) return { text: '재확인 요청을 접수했습니다. 서버가 다시 읽어 새 판정을 확정하면 반영됩니다.', tone: 'wait' };
  if (r.rateLimited) return { text: '재확인 요청을 방금 보내서 잠시 뒤 다시 요청합니다. 그동안 저장된 판정을 보여 드립니다.', tone: 'wait' };
  if (r.failed) return { text: '재확인 요청을 보내지 못했습니다. 저장된 판정만 다시 읽고 있으며 잠시 뒤 다시 요청합니다.', tone: 'warn' };
  if (r.reading) return { text: '최신 판정을 확인하고 있습니다.', tone: 'wait' };
  if (met === null) return { text: '아직 판정을 읽지 못했습니다. 서버가 조건을 읽으면 여기에 보입니다.', tone: 'muted' };
  if (met >= 4) return { text: '조건 확인이 끝났습니다. 지급 내용과 판단 근거를 확인해 주세요.', tone: 'ok' };
  // 네 조건은 순서가 없다(모두 채우면 됨). '먼저' 라고 하지 않고 남은 것을 그대로 나열한다.
  const rest = lacking.length ? ` 남은 조건 · ${lacking.join(' · ')}.` : '';
  const unavailable = r.unavailable ? ' 일부 조건은 아직 서버가 재확인을 지원하지 않습니다.' : '';
  return { text: `4개 조건 중 ${met}개를 충족했습니다.${rest}${unavailable}`, tone: 'wait' };
}

/**
 * 참가자 대시보드(student-view)의 view·conn 에서 단계와 한 줄을 고른다.
 * 요청 접수 · 조건 충족 · 양측 확인 · 지급 완료를 서로 섞지 않는다. 시간·동의 가능 여부·
 * 지급 판단은 기존 로직(view 의 값)을 그대로 읽기만 한다.
 *
 * 봉인된 student-view.js 에는 `stageStrip(participantStage({ view, conn, onSignIn }))` 한 줄만 들어가면 된다.
 *
 * @param {object} o
 * @param {object} o.view      기존 conditionRows/procedure view (decision · criteria · procedure · consent · payment · funding)
 * @param {object|null} o.conn 연결 상태 { state: 'LIVE'|'SIGNED_OUT'|…, recipient }
 * @param {Function} [o.onSignIn]
 * @param {boolean} [o.demo]
 */
export function participantStage({ view, conn = null, onSignIn = null, demo = false }) {
  const pay = view?.payment ?? {};
  const paid = Boolean(pay.acceptedRight) && pay.claimState === 'FINALIZED' && pay.receivedAtoms !== null && pay.receivedAtoms !== undefined;
  const rows = view?.criteria ?? [];
  const met = rows.filter((r) => r.state === 'MET').length;
  const metAll = rows.length > 0 && met === rows.length;
  const lacking = rows.filter((r) => r.state !== 'MET').map((r) => r.label ?? r.criterionId);
  const consent = view?.consent ?? {};
  const agreed = new Set((consent.records ?? []).filter((r) => r.value === 'AGREE').map((r) => r.actorRole));
  const required = consent.requiredRoles ?? [];
  const published = Boolean(view?.procedure?.publishedAt);
  const d = view?.agreedPayment?.decimals ?? 0;
  const sym = view?.agreedPayment?.symbol ?? '';
  const amount = (atoms) => (atoms === null || atoms === undefined ? null : `${(Number(atoms) / 10 ** d).toLocaleString('ko-KR')} ${sym}`);
  const out = (stage, text, tone, action = null) => ({ stage, demo, line: { text, tone }, action });

  // 0. 로그인 전 — 지금 보이는 값은 내 기록이 아니다.
  if (conn && conn.state !== 'LIVE' && !conn.demo) {
    return out(STAGE.CONNECT, '로그인하시면 내 기록을 불러와 조건을 확인합니다.', 'wait', onSignIn ? { label: '로그인', onClick: onSignIn } : null);
  }
  // 1. 확인 절차가 끝났다 — 기다리면 지급될 것처럼 말하지 않는다.
  //    미해결 종료(조건은 채웠는데 절차가 결론을 못 냄)와 조건 미충족을 구분한다.
  //    예외는 딱 하나 — 검토 상한이 지나 A 가 REVIEW_CAP_UNRESOLVED 를 남겼지만 절차 상태가 권리 보존
  //    (ACCEPTED_RIGHT_PRESERVED · 봉인 화면의 "지급권리 보존 · 청구 가능")이고 지급 권리가 수락된 경우.
  //    이때만 종료 대신 지급 단계를 말한다. 다른 종료 사유·이의·연결 오류는 그대로 먼저 보인다 (오규원 11/6 밤, 범위 한정 요청).
  const ended = view?.procedure?.terminationReason ?? null;
  const rightPreserved = ended === 'REVIEW_CAP_UNRESOLVED'
    && view?.procedure?.status === 'ACCEPTED_RIGHT_PRESERVED'
    && Boolean(pay.acceptedRight);
  if (ended && !paid && !rightPreserved) {
    const why = TERMINATION[ended] ?? '확인 절차가 종료되었습니다';
    return metAll
      ? out(STAGE.CONFIRM, `확인 절차가 종료되었습니다 · ${why}. 조건은 모두 충족했고 미충족으로 확정된 것은 아닙니다. 후속 확인은 운영자에게 문의해 주세요.`, 'warn')
      : out(STAGE.CONDITIONS, `확인 절차가 종료되었습니다 · ${why}. 조건 ${met}/${rows.length || 4} 충족 상태에서 멈췄고 미충족으로 확정된 것은 아닙니다. 후속 확인은 운영자에게 문의해 주세요.`, 'warn');
  }
  // 2. 지급 완료 — 청구 최종 확정 + 실제 수령액이 있을 때만.
  if (paid) return out(STAGE.PAID, `내 환급 계정으로 ${amount(pay.receivedAtoms)}를 받았습니다.`, 'ok');
  // 3. 오류 신고가 걸려 있다 — 결과가 나올 때까지 지급이 진행되지 않는다.
  if (view?.objection?.blocked) {
    const received = view.objection.phase === 'RECEIVED';
    const text = (received ? '오류 신고를 접수했습니다. 곧 다시 확인합니다.' : 'CLEAR 가 오류 신고를 다시 확인하고 있습니다.')
      + (metAll ? ' 결과가 나올 때까지 지급이 진행되지 않습니다.' : ' 판정이 바뀌면 그대로 반영됩니다.');
    return out(metAll ? STAGE.CONFIRM : STAGE.CONDITIONS, text, 'wait');
  }
  // 4. 지금 판정이 아니다 — 다시 읽기 전까지 진행하지 않는다.
  if (view?.decision?.current === false) return out(STAGE.CONDITIONS, '지금 판정이 아닙니다. 다시 불러온 뒤 진행합니다.', 'warn');
  // 5. 지급 처리 중 — 보냈지만 최종 확정 전. 완료라고 쓰지 않는다.
  if (pay.transactionState === 'SUBMITTED' || pay.claimState === 'INCLUDED') {
    return out(STAGE.CONFIRM, '지급 거래를 보냈습니다. 블록체인에서 완료를 확인하고 있습니다.', 'wait');
  }
  // 6. 양측 확인
  if (view?.decision?.conditionsStatus === 'MET' && published) {
    const mine = agreed.has('PARTICIPANT');
    const theirs = agreed.has('COURSE_OPERATOR');
    const both = required.length > 0 && required.every((r) => agreed.has(r));
    const text = both ? '양측 확인 완료 · 지급 처리를 기다립니다.'
      : mine && !theirs ? '참가자 확인 완료 · 운영자 확인 대기'
        : !mine && theirs ? '운영자 확인 완료 · 내 확인이 남았습니다.'
          : '조건 확인이 끝났습니다. 지급 내용과 판단 근거를 확인해 주세요.';
    return out(STAGE.CONFIRM, text, both ? 'ok' : 'wait');
  }
  if (view?.decision?.conditionsStatus === 'MET') {
    return out(STAGE.CONDITIONS, '조건 확인이 끝났습니다. 환급 재원이 확보되면 양측 확인이 열립니다.', 'ok');
  }
  // 7. 조건 확인 중 — 가장 흔한 상태. 대시보드 view 에는 재확인 요청 상태가 없어 '접수' 를 말하지 않는다.
  return out(STAGE.CONDITIONS, conditionsLine({ met: rows.length ? met : null, lacking }).text, 'wait');
}

/**
 * 띠 하나. 현재 단계를 강조하고 아래에 설명 한 줄과 핵심 버튼 하나를 둔다.
 *
 * @param {object} o
 * @param {string} o.stage              STAGE 값
 * @param {{text:string, tone?:string}} [o.line]  현재 단계 설명 한 줄(없으면 단계의 '왜' 만)
 * @param {{label:string, onClick?:Function, href?:string}|null} [o.action]  핵심 버튼 하나
 * @param {boolean} [o.demo]            합성 화면이면 표시를 남긴다
 */
export function stageStrip({ stage, line = null, action = null, demo = false }) {
  const at = Math.max(0, STAGE_ORDER.indexOf(stage));
  return el('section.crc-stage', { 'aria-label': '진행 단계', 'data-stage': stage, 'data-demo': demo ? 'yes' : null }, [
    el('ol.crc-stage-track', {}, STAGE_ORDER.map((key, i) => el('li', {
      'data-state': i < at ? 'done' : i === at ? 'now' : 'next',
      'aria-current': i === at ? 'step' : null,
    }, [
      el('span.crc-stage-dot', { text: i < at ? '✓' : String(i + 1) }),
      el('span.crc-stage-name', { text: STAGE_LABEL[key] }),
    ]))),
    el('div.crc-stage-now', {}, [
      el('p.crc-stage-kicker', { text: `지금 단계 · ${STAGE_LABEL[stage]}` }),
      el('p.crc-stage-line', { 'data-tone': line?.tone ?? null, text: line?.text ?? WHY[stage] }),
      line ? el('p.crc-stage-why', { text: WHY[stage] }) : null,
      action
        ? (action.href
          ? el('a.cc-btn.crc-stage-btn', { href: action.href, target: action.target ?? null, rel: action.target ? 'noopener noreferrer' : null }, [el('span', { text: action.label })])
          : el('button.cc-btn.crc-stage-btn', { type: 'button', onClick: action.onClick ?? (() => {}) }, [el('span', { text: action.label })]))
        : null,
    ].filter(Boolean)),
  ]);
}
