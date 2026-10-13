// 이 신청에 적용된 조건 — 내용만 보여준다
//
// 참가자가 3단계(최종 동의)에서 무엇에 동의했는지 나중에 확인할 수 있어야 한다.
// 조건을 못 바꾸게 만드는 것이 제품의 요지인데, 정작 참가자가 그 조건을 볼 수
// 없으면 의미가 없다.
//
// 충족 여부는 여기서 말하지 않는다. 자격 판정은 아직 제품에 없고
// 화면은 계획 F4 다. 점수·수강률 값은 이 응답에 들어있지도 않다.

import { el, field } from './dom.js';
import { PROGRESS_NOT_YET } from './state-labels.js';
import { sealBadge } from './brand.js';

/** minCompletionBps 는 베이시스포인트다. 8000 = 80.00% */
export function bpsText(bps) {
  const value = Number(bps);
  if (!Number.isInteger(value)) return String(bps);
  return (value / 100).toFixed(2).replace(/0+$/, '').replace(/\.$/, '') + '%';
}

/** amount 는 문자열이고 tokenDecimals 로 자리를 맞춘다. 부동소수점을 쓰지 않는다 */
export function amountText(amount, decimals) {
  const digits = String(amount);
  if (!/^\d+$/.test(digits) || !Number.isInteger(decimals) || decimals < 0) return digits;
  const padded = digits.padStart(decimals + 1, '0');
  const whole = padded.slice(0, padded.length - decimals);
  const frac = decimals === 0 ? '' : padded.slice(padded.length - decimals).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}

/** 유닉스 초 문자열을 서울 시각으로. 컴파일러가 서울 기준으로 기간을 검사한다 */
export function seoulText(unixSeconds) {
  const value = Number(unixSeconds);
  if (!Number.isFinite(value)) return String(unixSeconds);
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short', hour12: false,
  }).format(new Date(value * 1000));
  return `${parts} (KST)`;
}

/**
 * 조건마다 붙는 '아직 확인 안 됨' 표식.
 *
 * 신청 view 에는 점수도 이수율도 없다(API_CONTRACT 의 기본 view 필드).
 * 서버가 주지 않는 값을 화면이 지어내면, 판정 없이 충족을 말하는 것이 되어
 * 이 제품이 없애려는 바로 그 문제를 우리가 만든다.
 *
 * 그래서 값은 비우되 자리는 보여준다. 자격 판정과 그 표시는 계획 F4 이고,
 * 선행 API(B1·B2b·B3)가 생기면 이 표식이 실제 결과로 바뀐다.
 */
const unchecked = () => el('span.cond-chk', {
  title: '증명 제출과 자격 판정이 연결되면 여기에 결과가 들어옵니다.',
}, [
  el('span.cond-chk-box', { 'aria-hidden': 'true', text: '?' }),
  el('span', { text: '아직 확인 안 됨' }),
]);

export function policySection(compiled) {
  const p = compiled.policy;
  return el('section', {}, [
    el('div.sec-head', {}, [
      el('h3', { text: '동의한 조건' }),
      sealBadge('고정됨'),
    ]),
    el('p.muted', {
      text: '3단계(최종 동의)에서 고정된 값입니다. 이후 운영자도 CLEAR도 바꿀 수 없습니다.',
    }),

    el('div.cond-wrap', {}, [
      el('p.cond-wrap-head', { text: '두 조건을 모두 충족해야 환급 대상' }),
      el('div.cond-wrap-body', {}, [
        el('div.cond', {}, [
          el('div.cond-item', {}, [
            el('div.cond-top', {}, [
              el('span.cond-label', { text: '시험' }),
              unchecked(),
            ]),
            el('strong.cond-value', {}, [
              el('em', { text: `${p.minScore}점` }), ' 이상',
            ]),
            el('span.note', { text: `${p.examType} 총점 · 응시 인정 기간 ${p.examDateStart} ~ ${p.examDateEnd} (응시일 기준)` }),
          ]),
          el('p.cond-and', { text: 'AND' }),
          el('div.cond-item', {}, [
            el('div.cond-top', {}, [
              el('span.cond-label', { text: '이수' }),
              unchecked(),
            ]),
            el('strong.cond-value', {}, [
              el('em', { text: bpsText(p.minCompletionBps) }), ' 이상 완료',
            ]),
            el('span.note', { text: `필수 강의 ${p.requiredLectureIds.length}개 기준 · 인정 기간 ${seoulText(p.learningStart)} ~ ${seoulText(p.learningEnd)}` }),
          ]),
          el('p.cond-and', { text: '충족 시' }),
          el('div.cond-item', {}, [
            el('div.cond-top', {}, [el('span.cond-label', { text: '지급' })]),
            el('strong.cond-value', {}, [
              el('em', { text: `${amountText(p.amount, p.tokenDecimals)} TEST` }), ' 1회',
            ]),
            // 금고가 다루는 것은 토큰이라 정책에 원화 금액이라는 개념이 없다.
            // 숫자만 보면 와닿지 않으므로, 상용에서 무엇이 들어올 자리인지 밝힌다.
            // 'TEST 50 = 얼마' 로 환산해 적는 것은 하지 않는다.
            el('span.note', { text: '무가치 시험 단위입니다. 실제 수강료나 현금 환불이 아닙니다. '
              + '상용에서는 이 자리에 학원이 약속한 실제 환급액이 들어갑니다.' }),
          ]),
        ]),
      ]),
      el('p.cond-foot', { text: '부분 지급은 없습니다. 한 조건만 충족해도 지급되지 않습니다.' }),
    ]),
    el('p.pending-line', {}, [
      el('span.pending-dot', { 'aria-hidden': 'true', text: '○' }),
      el('span', { text: PROGRESS_NOT_YET }),
    ]),
  ]);
}

/**
 * 기한과 정책 식별.
 *
 * 조건과 함께 묶어 두었더니, 첫 화면에서 '지금 어디까지 왔나'가 이 표들
 * 뒤로 밀렸다. 조건은 맨 위에 두되 이 둘은 단계 목록 아래로 내린다.
 */
export function policyDetailSection(compiled) {
  const p = compiled.policy;
  return el('section', {}, [
    el('h3', { text: '기한' }),
    el('dl.fields', {}, [
      field('신청 받는 기간', `${seoulText(p.enrollmentStart)} ~ ${seoulText(p.enrollmentUntil)}`),
      field('정상 제출 마감', seoulText(p.normalSubmitAt), '이 시각까지 제출합니다.'),
      field('보완 종료', seoulText(p.supplementEndAt),
        '제출 마감 +3일. 외부 조회 장애가 확인된 경우에만 재제출이 열립니다.'),
      field('최종 청구 마감', seoulText(p.claimUntil),
        '제출 마감 +10일. 이후에는 청구할 수 없고 미정산 몫은 운영자가 회수합니다.'),
    ]),

    el('details.tech', {}, [
      el('summary', { text: '정책 식별 보기' }),
      el('dl.fields', {}, [
        field('정책 해시', compiled.policyHash),
        field('정책 버전', `${p.cohortId} · v${p.policyVersion}`),
        field('이수 규칙 버전', p.completionRuleVersion),
        field('게시 가능', boolTextLocal(compiled.publishable),
          '합성 정책이라 게시 가능하지 않습니다.'),
      ]),
    ]),
  ]);
}

const boolTextLocal = (value) => (value === true ? '예' : value === false ? '아니오' : '없음');
