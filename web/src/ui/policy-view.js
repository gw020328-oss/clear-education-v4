// 이 신청에 적용된 조건 — 내용만 보여준다
//
// 참가자가 3단계(최종 동의)에서 무엇에 동의했는지 나중에 확인할 수 있어야 한다.
// 조건을 못 바꾸게 만드는 것이 제품의 요지인데, 정작 참가자가 그 조건을 볼 수
// 없으면 의미가 없다.
//
// 충족 여부는 여기서 말하지 않는다. 자격 판정은 아직 제품에 없고
// 화면은 계획 F4 다. 점수·수강률 값은 이 응답에 들어있지도 않다.

import { el, clear, field } from './dom.js';
import { PROGRESS_NOT_YET } from './state-labels.js';
import { sealBadge } from './brand.js';
import { conditionsFrom, hasTiers, wonText } from './conditions.js';

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

/** 조건 한 줄. 어떤 조건이 와도 같은 모양으로 그린다 */
function conditionItem(item, { checkable = true } = {}) {
  return el('div.cond-item', {}, [
    el('div.cond-top', {}, [
      el('span.cond-label', { text: item.label }),
      checkable ? unchecked() : null,
      item.evidence ? el('span.cond-ev', { text: item.evidence }) : null,
    ]),
    el('strong.cond-value', {}, [
      el('em', { text: item.value }),
      item.tail ? ` ${item.tail}` : null,
    ]),
    item.detail ? el('span.note', { text: item.detail }) : null,
  ]);
}

/** 한 경로 안의 조건들. 사이에 AND 를 끼운다 */
function conditionGroup(group) {
  const rows = [];
  if (group.label) rows.push(el('p.cond-path', { text: group.label }));
  group.items.forEach((item, index) => {
    if (index > 0) rows.push(el('p.cond-and', { text: 'AND' }));
    rows.push(conditionItem(item));
  });
  if (rows.length === 0) rows.push(el('p.cond-none', { text: '이 경로에 표시할 조건이 없습니다.' }));
  return el('div.cond-group', {}, rows);
}

/**
 * 지급 칸.
 *
 * 안내문이 말하는 금액과 실제로 받는 금액이 다른 것이 이 제품이 겨냥한
 * 문제다. 그러니 합계 하나만 적으면 안 된다. 표시 금액·공제·실수령을
 * 줄로 나눠 적고, 확실하지 않은 공제는 그렇다고 표시한다.
 */
function payoutItem(payout) {
  const rows = [];
  if (payout.money) {
    const m = payout.money;
    rows.push(el('div.pay-line', {}, [
      el('span', { text: m.gross.label }),
      el('span.pay-num', { text: wonText(m.gross.amount) }),
    ]));
    for (const d of m.deductions ?? []) {
      rows.push(el('div.pay-line.minus', {}, [
        el('span', {}, [
          el('span', { text: d.label }),
          // '약 3%' 처럼 안내문이 확정하지 않은 값은 그대로 두고 표시한다.
          // 임의로 3% 로 확정하면 금액이 틀리고, 그게 바로 이 제품이
          // 없애려는 문제다.
          d.uncertain ? el('span.pay-warn', { title: '안내문이 정확한 기준을 밝히지 않았습니다', text: '확인 필요' }) : null,
        ]),
        el('span.pay-num', { text: `− ${wonText(d.amount)}` }),
      ]));
    }
    rows.push(el('div.pay-line.net', {}, [
      el('span', { text: '실수령' }),
      el('span.pay-num', { text: wonText(m.net) }),
    ]));
  }
  return el('div.cond-item.pay', {}, [
    el('div.cond-top', {}, [
      el('span.cond-label', { text: payout.label }),
      payout.rate ? el('span.pay-rate', { text: `환급률 ${payout.rate}` }) : null,
    ]),
    rows.length
      ? el('div.pay-table', {}, rows)
      : el('strong.cond-value', {}, [el('em', { text: payout.token }), ' 1회']),
    rows.length
      ? el('p.note.pay-token', { text: `${payout.note} (${payout.token})` })
      : el('span.note', { text: payout.note }),
  ]);
}

/** 한 구간(또는 구간이 없는 반)의 조건 본문 */
function conditionBody(view) {
  const body = [];
  view.groups.forEach((group, index) => {
    if (index > 0) body.push(el('p.cond-or', { text: '또는' }));
    body.push(conditionGroup(group));
  });
  if (view.payout) {
    body.push(el('p.cond-and', { text: '충족 시' }));
    body.push(payoutItem(view.payout));
  } else {
    // 집행하지 않는 구간에는 금액을 적지 않는다. 정책의 amount 는
    // 집행 구간의 값 하나뿐이라, 다른 구간에 적으면 틀린 금액이 된다.
    body.push(el('div.cond-out', {}, [
      el('strong', { text: '이번 범위 밖입니다' }),
      el('p', { text: '점수 구간별로 금액이 달라지는 지급은 아직 집행하지 않습니다. '
        + '이 구간의 조건은 안내문에서 읽은 내용이며, CLEAR가 지급을 보장하지 않습니다.' }),
    ]));
  }
  return body;
}

/**
 * 환급률 구간을 넘겨보는 줄.
 *
 * 고르는 장치가 아니다. 수강생은 계약 시점에 어느 구간으로 갈지 정하지 않고,
 * 하다 보니 채워지는 구간으로 간다. 그래서 라디오·체크 모양을 쓰지 않고
 * 읽을 구간을 바꾸는 것으로만 만든다.
 */
function tierTabs(model, selectedId, onSelect) {
  return el('div.tier-tabs', { role: 'tablist', 'aria-label': '환급률별 조건' },
    model.tiers.map((tier) => el('button.tier-tab', {
      type: 'button',
      role: 'tab',
      'aria-selected': tier.id === selectedId ? 'true' : 'false',
      'data-supported': tier.supported ? 'yes' : 'no',
      onClick: () => onSelect(tier.id),
    }, [
      // 집행 구간에는 표식을 달지 않는다. 수강생은 시험 전까지 어느 구간으로
      // 갈지 모르므로, 표식이 붙으면 '이 구간으로 정해졌다'로 읽힌다.
      // 정상인 쪽은 그대로 두고 예외(범위 밖)만 점선으로 구분한다.
      el('span.tier-rate', { text: tier.rate }),
    ])));
}

export function policySection(compiled) {
  const model = conditionsFrom(compiled);

  // 구간이 여럿이면 어느 구간을 읽는지 화면 안에서 바꾼다. 선택한 구간은
  // 이 구역 안에서만 유지되고 신청·동의에 영향을 주지 않는다.
  const tiered = hasTiers(model);
  let shownId = tiered ? (model.tiers.find((t) => t.supported) ?? model.tiers[0]).id : null;

  const section = el('section', {});
  const render = () => {
    const view = tiered ? model.tiers.find((t) => t.id === shownId) : model;
    const multi = view.groups.length > 1;
    const total = view.groups.reduce((sum, g) => sum + g.items.length, 0);

    const head = multi
      ? '아래 경로 중 하나를 충족하면 환급 대상'
      : total === 1 ? '아래 조건을 충족해야 환급 대상' : `${total}개 조건을 모두 충족해야 환급 대상`;

    clear(section);
    // el() 은 null 자식을 걸러내지만 append 는 'null' 문자열로 바꾼다.
    // 여기서 직접 붙이므로 걸러낸 뒤 넣는다.
    const rows = sectionRows(model, view, { tiered, head, multi, shownId, onSelect: (id) => {
      shownId = id; render();
    } });
    section.append(...rows.filter(Boolean));
  };
  render();
  return section;
}

function sectionRows(model, view, { tiered, head, multi, shownId, onSelect }) {
  return [
    el('div.sec-head', {}, [
      el('h3', { text: '동의한 조건' }),
      sealBadge('고정됨'),
    ]),
    el('p.muted', {
      text: '3단계(최종 동의)에서 고정된 값입니다. 이후 운영자도 CLEAR도 바꿀 수 없습니다.',
    }),

    tiered ? el('p.muted.tier-help', {
      text: '이 반은 환급률 구간이 여럿입니다. 미리 고르지 않아도 되며, '
        + '충족한 조건에 따라 정해집니다. 구간을 눌러 조건을 비교해 보세요.',
    }) : null,
    tiered ? tierTabs(model, shownId, onSelect) : null,

    el('div.cond-wrap', { 'data-out': view.payout ? null : 'yes' }, [
      el('p.cond-wrap-head', { text: head }),
      el('div.cond-wrap-body', {}, [
        el('div.cond', {}, conditionBody(view)),
      ]),
      // 경로가 여럿이면 '한 조건만 충족해도 지급되지 않는다'가 거짓이 된다.
      // 한 경로만 충족하면 되기 때문이다. 문구를 구조에 맞춘다.
      el('p.cond-foot', {
        text: multi
          ? '부분 지급은 없습니다. 한 경로의 조건을 모두 충족해야 지급됩니다.'
          : '부분 지급은 없습니다. 일부만 충족해도 지급되지 않습니다.',
      }),
    ]),
    el('p.pending-line', {}, [
      el('span.pending-dot', { 'aria-hidden': 'true', text: '○' }),
      el('span', { text: PROGRESS_NOT_YET }),
    ]),
  ];
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
