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

const WHY = Object.freeze({
  [STAGE.CONNECT]: '환급금을 받을 계정을 먼저 연결해야 다음 단계가 열려요.',
  [STAGE.CONDITIONS]: 'CLEAR 가 Moodle·HackerRank 기록으로 네 조건을 확인해요. 따로 올릴 증빙은 없어요.',
  [STAGE.CONFIRM]: '참가자와 운영자가 같은 판정을 확인해야 지급이 나가요.',
  [STAGE.PAID]: '네 조건 충족과 양측 확인이 끝나 환급금이 보내졌어요.',
});

/**
 * 조건 확인 단계의 한 줄 — 카드 상태(서버 판정 + 재확인 상태)에서만 만든다.
 *
 * @param {object} o
 * @param {number|null} o.met        충족한 조건 수(서버 판정), 판정 전이면 null
 * @param {string[]} o.lacking       미충족 조건 이름
 * @param {boolean} o.checking       재확인 요청이 접수돼 새 결과를 기다리는 카드가 있나
 * @param {boolean} o.fetchFailed    판정을 읽지 못한 카드가 있나
 */
export function conditionsLine({ met = null, lacking = [], checking = false, fetchFailed = false } = {}) {
  if (fetchFailed) return { text: '판정을 읽지 못한 조건이 있어요. 잠시 뒤 「다시 확인」 을 눌러 주세요.', tone: 'warn' };
  if (checking) return { text: '다시 확인 요청을 접수했어요. 새로운 결과를 기다리고 있어요.', tone: 'wait' };
  if (met === null) return { text: '아직 판정을 읽지 못했어요. 서버가 조건을 읽으면 여기에 보여요.', tone: 'muted' };
  if (met >= 4) return { text: '조건 확인이 끝났어요. 지급 내용과 판단 근거를 확인해 주세요.', tone: 'ok' };
  const next = lacking[0] ? ` ${lacking[0]} 조건을 먼저 채워 주세요.` : '';
  return { text: `4개 조건 중 ${met}개를 충족했어요.${next}`, tone: 'wait' };
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
  const lacking = rows.filter((r) => r.state !== 'MET').map((r) => r.label ?? r.criterionId);
  const consent = view?.consent ?? {};
  const agreed = new Set((consent.records ?? []).filter((r) => r.value === 'AGREE').map((r) => r.actorRole));
  const required = consent.requiredRoles ?? [];
  const published = Boolean(view?.procedure?.publishedAt);
  const d = view?.agreedPayment?.decimals ?? 0;
  const sym = view?.agreedPayment?.symbol ?? '';
  const amount = (atoms) => (atoms === null || atoms === undefined ? null : `${(Number(atoms) / 10 ** d).toLocaleString('ko-KR')} ${sym}`);

  if (conn && conn.state !== 'LIVE' && !conn.demo) {
    return { stage: STAGE.CONNECT, demo, line: { text: '로그인하시면 내 기록을 불러와 조건을 확인해요.', tone: 'wait' },
      action: onSignIn ? { label: '로그인', onClick: onSignIn } : null };
  }
  if (paid) {
    return { stage: STAGE.PAID, demo, line: { text: `내 환급 계정으로 ${amount(pay.receivedAtoms)}를 받았어요.`, tone: 'ok' }, action: null };
  }
  if (pay.transactionState === 'SUBMITTED' || pay.claimState === 'INCLUDED') {
    return { stage: STAGE.CONFIRM, demo, line: { text: '지급 거래를 보냈어요. 블록체인에서 완료를 확인하고 있어요.', tone: 'wait' }, action: null };
  }
  if (view?.decision?.conditionsStatus === 'MET' && published) {
    const mine = agreed.has('PARTICIPANT');
    const theirs = agreed.has('COURSE_OPERATOR');
    const text = mine && !theirs ? '참가자 확인 완료 · 운영자 확인 대기'
      : !mine ? '조건 확인이 끝났어요. 지급 내용과 판단 근거를 확인해 주세요.'
        : required.length && required.every((r) => agreed.has(r)) ? '양측 확인 완료 · 지급 처리를 기다려요.' : '양측 확인 중';
    return { stage: STAGE.CONFIRM, demo, line: { text, tone: mine && theirs ? 'ok' : 'wait' }, action: null };
  }
  if (view?.decision?.conditionsStatus === 'MET') {
    return { stage: STAGE.CONDITIONS, demo, line: { text: '조건 확인이 끝났어요. 환급 재원이 확보되면 양측 확인이 열려요.', tone: 'ok' }, action: null };
  }
  return { stage: STAGE.CONDITIONS, demo, line: conditionsLine({ met: rows.length ? met : null, lacking }), action: null };
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
