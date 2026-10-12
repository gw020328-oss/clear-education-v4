// 이 신청에 적용된 조건 — 내용만 보여준다
//
// 참가자가 3단계(최종 동의)에서 무엇에 동의했는지 나중에 확인할 수 있어야 한다.
// 조건을 못 바꾸게 만드는 것이 제품의 요지인데, 정작 참가자가 그 조건을 볼 수
// 없으면 의미가 없다.
//
// 충족 여부는 여기서 말하지 않는다. 자격 판정은 아직 제품에 없고
// 화면은 계획 F4 다. 점수·수강률 값은 이 응답에 들어있지도 않다.

import { el, field } from './dom.js';

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

export function policySection(compiled) {
  const p = compiled.policy;
  return el('section', {}, [
    el('h3', { text: '동의한 조건' }),
    el('p.muted', {
      text: '3단계(최종 동의)에서 고정된 값입니다. 이후 운영자도 CLEAR도 바꿀 수 없습니다.',
    }),

    el('div.cond', {}, [
      el('div.cond-item', {}, [
        el('span.cond-label', { text: '시험' }),
        el('strong.cond-value', { text: `${p.examType} 총점 ${p.minScore}점 이상` }),
        el('span.note', { text: `응시 인정 기간 ${p.examDateStart} ~ ${p.examDateEnd} (응시일 기준)` }),
      ]),
      el('div.cond-item', {}, [
        el('span.cond-label', { text: '이수' }),
        el('strong.cond-value', {
          text: `필수 강의 ${p.requiredLectureIds.length}개 중 ${bpsText(p.minCompletionBps)} 이상 완료`,
        }),
        el('span.note', { text: `인정 기간 ${seoulText(p.learningStart)} ~ ${seoulText(p.learningEnd)}` }),
      ]),
      el('div.cond-item', {}, [
        el('span.cond-label', { text: '지급' }),
        el('strong.cond-value', { text: `${amountText(p.amount, p.tokenDecimals)} TEST 1회` }),
        el('span.note', { text: '무가치 시험 단위입니다. 실제 수강료나 현금 환불이 아닙니다.' }),
      ]),
    ]),
    el('p.muted', { text: '두 조건을 모두 충족해야 합니다.' }),

    el('h3', { text: '기한' }),
    el('dl.fields', {}, [
      field('신청 받는 기간', `${seoulText(p.enrollmentStart)} ~ ${seoulText(p.enrollmentUntil)}`),
      field('정상 제출 마감', seoulText(p.normalSubmitAt), '이 시각까지 제출합니다.'),
      field('보완 종료', seoulText(p.supplementEndAt),
        '제출 마감 +3일. 외부 조회 장애가 확인된 경우에만 재제출이 열립니다.'),
      field('최종 청구 마감', seoulText(p.claimUntil),
        '제출 마감 +10일. 이후에는 청구할 수 없고 미정산 몫은 운영자가 회수합니다.'),
    ]),

    el('h3', { text: '정책 식별' }),
    el('dl.fields', {}, [
      field('정책 해시', compiled.policyHash),
      field('정책 버전', `${p.cohortId} · v${p.policyVersion}`),
      field('이수 규칙 버전', p.completionRuleVersion),
      field('게시 가능', boolTextLocal(compiled.publishable),
        '합성 정책이라 게시 가능하지 않습니다.'),
    ]),

    el('div.card.limits', {}, [
      el('p', { text: '이 구역은 조건의 내용만 보여줍니다. 참가자가 이 조건을 충족했는지는 '
        + '판정하지 않으며, 점수와 이수율 값도 여기에 들어있지 않습니다.' }),
    ]),
  ]);
}

const boolTextLocal = (value) => (value === true ? '예' : value === false ? '아니오' : '없음');
