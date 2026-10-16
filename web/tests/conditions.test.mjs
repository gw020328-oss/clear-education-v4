// 조건 목록 변환 시험
//
// 화면이 조건을 하드코딩해 그리던 것을 목록으로 바꿨다. 반마다 조건의 개수와
// 묶이는 방식이 다르기 때문이다. 여기서 고정하는 것은 두 가지다.
//
//   1. 서버가 준 값만 조건이 된다. 없는 조건을 화면이 만들지 않는다.
//   2. 경로가 여럿일 때와 하나일 때의 구분이 유지된다.
//
// 그리는 부분은 document 가 필요하므로 다루지 않는다.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  conditionsFrom, hasAlternatives, hasPathPayouts, hasProgress, countItems,
  metCount, progressOf, wonText, EVIDENCE, VERIFY, verifyOf,
} from '../src/ui/conditions.js';
import { daysLeftText } from '../src/ui/policy-view.js';
import { checkPolicyView, checkApplicationView } from '../src/adapter/contract.js';
import { createSyntheticAdapter } from '../src/adapter/synthetic.js';
import { SYNTHETIC_APPLICATIONS, SCENARIOS } from '../src/fixtures/applications.js';

/** 진행 상황을 붙여 볼 기준 신청. 마지막 단계라야 조건이 쌓이기 시작한다 */
const PROGRESS_VIEW = SYNTHETIC_APPLICATIONS[SYNTHETIC_APPLICATIONS.length - 1];
import { SYNTHETIC_POLICY, ALTERNATIVE_POLICY, YBM_POLICY } from '../src/fixtures/policy.js';
import { YBM_REVIEW } from '../src/fixtures/review.js';

const copy = () => ({ ...SYNTHETIC_POLICY, policy: { ...SYNTHETIC_POLICY.policy } });

// 금액은 구간에 붙기도 하고 경로마다 붙기도 한다. 시원스쿨 100% 는 출석
// 경로에 응시료 환급이 없어서 성적 경로보다 적다. 그래서 금액을 찾을 때
// 구간만 보면 절반을 놓친다.
const payoutsOf = (model) => (model.tiers ?? [model]).flatMap((tier) => [
  ...(tier.payout ? [{ at: tier.rate ?? '단일', payout: tier.payout }] : []),
  ...tier.groups.filter((g) => g.payout).map((g) => ({
    at: `${tier.rate ?? '단일'} ${g.label ?? ''}`.trim(), payout: g.payout,
  })),
]);

/** fixture 의 날 금액 내역. 변환을 거치지 않은 쪽을 봐야 할 때 쓴다 */
const moneysOf = (policy) => policy.conditionTiers.flatMap((tier) => [
  ...(tier.payout ? [{ at: tier.rate, money: tier.payout }] : []),
  ...tier.groups.filter((g) => g.payout).map((g) => ({
    at: `${tier.rate} ${g.label}`, money: g.payout,
  })),
]);

/**
 * 그 구간에서 나갈 수 있는 가장 큰 실수령.
 *
 * conditionsFrom 을 거친 모양을 받는다 — 변환 뒤에는 금액이 payout.money 에
 * 들어가고, payout 자체는 화면이 쓸 label·token·note 를 함께 가진다.
 */
const topNet = (tier) => Math.max(...[
  tier.payout?.money?.net, ...tier.groups.map((g) => g.payout?.money?.net),
].filter(Number.isInteger));

test('현재 정책은 조건 둘과 지급 하나로 바뀐다', () => {
  const model = conditionsFrom(SYNTHETIC_POLICY);
  assert.equal(model.groups.length, 1, '지금 컴파일러에는 경로 개념이 없다');
  assert.equal(countItems(model), 2);
  assert.deepEqual(model.groups[0].items.map((i) => i.kind), ['EXAM', 'LEARNING']);
  assert.ok(model.payout.token.includes('TEST'));
});

test('금액 내역이 없는 반은 토큰만 적는다', () => {
  // 안내문 금액을 모르면 지어내지 않는다. 합성 토큰 수량만 말한다.
  const c = copy();
  delete c.policy.payoutBreakdown;
  const model = conditionsFrom(c);
  assert.equal(model.payout.money, null);
  assert.ok(model.payout.token.includes('TEST'));
});

test('받을 금액과 보낼 토큰이 1 대 1로 맞는다', () => {
  // 시연은 1 TEST 를 1원으로 둔다. 둘이 어긋나면 화면이 말한 금액과
  // 계약이 보내는 양이 달라진다 — 이 제품이 없애려는 바로 그 문제다.
  // 구간이 없는 반은 실수령 하나가 곧 예치액이다.
  const p = SYNTHETIC_POLICY.policy;
  const expected = BigInt(p.payoutBreakdown.net) * 10n ** BigInt(p.tokenDecimals);
  assert.equal(p.amount, String(expected));

  // 구간이 있는 반은 금액이 붙은 자리마다 토큰 수량이 그 실수령과 맞아야 한다.
  for (const { at, payout } of payoutsOf(conditionsFrom(ALTERNATIVE_POLICY))) {
    assert.equal(payout.token, `${payout.money.net} TEST`,
      `${at} 의 토큰 수량이 실수령과 다르다`);
  }
});

test('토큰 환산이 어긋나면 계약 검사가 잡는다', () => {
  // 1 TEST = 1원 규칙이 깨지면 화면이 말한 금액과 계약이 보내는 양이 달라진다.
  // 얼마를 예치할지를 검사하는 것이 아니다 — 그건 아직 정해지지 않았다.
  const c = copy();
  c.policy = { ...c.policy, amount: '1' };
  assert.ok(checkPolicyView(c).some((m) => m.includes('환산이 맞지 않는다')));
});

test('예치액을 화면이 정하지 않는다', () => {
  // 전에는 '가장 높은 구간의 실수령과 같아야 한다' 고 막았다. 그것은
  // 예치율을 화면이 정하는 것이었고, 예치율은 아직 OPEN 이다.
  const c = {
    ...ALTERNATIVE_POLICY,
    policy: { ...ALTERNATIVE_POLICY.policy, amount: '1000000000' },
  };
  assert.deepEqual(checkPolicyView(c), [], '예치액을 바꿨다고 거부하면 안 된다');
});

test('400% 는 싣지 않는다', () => {
  // CLEAR 가 집행하지 않기로 했다(조건 구조화와 서류 사전 검토까지만).
  // 안내문에 있다고 해서 화면이 집행을 약속하면 안 된다.
  const rates = ALTERNATIVE_POLICY.policy.conditionTiers.map((t) => t.rate);
  assert.deepEqual(rates, ['50%', '100%', '200%', '300%']);
  const ids = ALTERNATIVE_POLICY.policy.conditionTiers
    .flatMap((t) => t.groups).flatMap((g) => g.items).map((i) => i.id);
  assert.ok(!ids.includes('exam990'));
  assert.ok(!ids.includes('challenge14'));
});

test('공제 산수가 틀리면 계약 검사가 잡는다', () => {
  const c = copy();
  c.policy = {
    ...c.policy,
    payoutBreakdown: { ...c.policy.payoutBreakdown, net: 999 },
  };
  assert.ok(checkPolicyView(c).some((m) => m.includes('내역이 맞지 않는다')));
});

test('공제를 거쳐 실수령이 남고 산수가 맞는다', () => {
  // 합계 하나만 적으면 광고 금액과 실수령의 차이가 안 보인다.
  // 그 차이가 이 제품이 겨냥한 문제다.
  for (const { at, money } of moneysOf(ALTERNATIVE_POLICY.policy)) {
    const added = money.additions.reduce((sum, a) => sum + a.amount, 0);
    const taken = money.deductions.reduce((sum, d) => sum + d.amount, 0);
    assert.ok(taken > 0, `${at} 에 공제가 없다`);
    assert.equal(money.gross.amount + added - taken, money.net,
      `${at} 의 내역이 맞지 않는다`);
  }
});

test('응시료는 공제가 아니라 가산이고 세금은 그 뒤에 붙는다', () => {
  // 안내문 계산식이 ((수강료 × 환급비율) − 결제수수료 + 응시료) × 0.78 이다.
  // 응시료를 공제로 넣거나 세금 베이스에서 빼면 금액이 틀린다.
  const { money } = moneysOf(ALTERNATIVE_POLICY.policy).find((m) => m.at === '200%');
  const exam = money.additions.reduce((sum, a) => sum + a.amount, 0);
  const fee = money.deductions.find((d) => d.label.includes('결제수수료')).amount;
  const tax = money.deductions.find((d) => d.label.includes('제세공과금')).amount;
  assert.equal(exam, 52500, '응시료는 52,500원 — YBM 표의 40,950 ÷ 0.78 로 역산된다');
  assert.equal(tax, Math.floor((money.gross.amount - fee + exam) * 22 / 100));
  assert.equal(money.net, 532662);
});

test('같은 환급률인데 경로마다 받는 금액이 다르다', () => {
  // 응시료 환급은 성적 경로의 조건이다(안내문 2-3). 출석만으로 받는
  // 경로에는 없다. 구간에 금액 하나를 적으면 한쪽이 틀린 금액을 본다.
  const r100 = conditionsFrom(ALTERNATIVE_POLICY).tiers.find((t) => t.id === 'r100');
  assert.equal(r100.payout, null, '경로마다 다르면 구간은 금액을 말하지 않는다');
  assert.ok(hasPathPayouts(r100), '모든 경로에 금액이 있어야 화면이 경로 안에 그린다');

  const [attend, score] = r100.groups;
  assert.equal(attend.payout.money.net, 242112, '출석 경로는 응시료 환급이 없다');
  assert.equal(score.payout.money.net, 283062, '성적 경로는 응시료 환급이 있다');
  assert.equal(attend.payout.money.additions.length, 0);
  assert.equal(score.payout.money.additions.length, 1);
});

test('50% 구간에는 응시료 환급이 없다', () => {
  // 안내문 표의 행 이름이 '수강료 50%환급' 뿐이다. 100% 이상만 '+응시료 0원'.
  const r50 = ALTERNATIVE_POLICY.policy.conditionTiers.find((t) => t.id === 'r50');
  assert.equal(r50.payout.additions.length, 0);
  assert.equal(r50.payout.net, 117312);
});

test('확정되지 않은 공제는 그렇다고 표시한다', () => {
  // 안내문이 '약 3%' 라고만 쓴 값을 3% 로 확정하면 금액이 틀린다.
  for (const { at, money } of moneysOf(ALTERNATIVE_POLICY.policy)) {
    assert.ok(money.deductions.some((d) => d.uncertain === true), at);
  }
});

test('금액마다 안내문 계산식이 출처로 붙는다', () => {
  // 우리가 만든 식이 아니라 안내문에 적힌 식이라는 것을 확인할 수 있어야 한다.
  for (const { at, money } of moneysOf(ALTERNATIVE_POLICY.policy)) {
    assert.ok(money.basis?.includes('안내문 계산식'), `${at} 에 계산식 출처가 없다`);
  }
});

test('토큰 수량을 원화와 환산해 적지 않는다', () => {
  // 'N TEST = M원' 이라고 적는 순간 그것부터 거짓이 된다.
  for (const { payout } of payoutsOf(conditionsFrom(ALTERNATIVE_POLICY))) {
    assert.ok(payout.token.includes('TEST'));
    assert.ok(!payout.token.includes('원'));
  }
});

test('모든 구간이 한 계약 안에 있고 금액을 가진다', () => {
  // 구간은 계약 시점에 정해지지 않는다. 달성한 것에 따라 판정 때 갈린다.
  // '계약 밖' 인 구간은 없다.
  const model = conditionsFrom(ALTERNATIVE_POLICY);
  assert.equal(model.tiers.length, 4, '400% 는 CLEAR 가 집행하지 않아 싣지 않는다');
  for (const tier of model.tiers) {
    assert.ok(Number.isInteger(topNet(tier)), `${tier.rate} 에 금액이 없다`);
  }
});

test('구간이 환급률 오름차순이고 금액도 함께 오른다', () => {
  // 순서가 뒤집히면 어느 구간이 더 높은지 화면이 잘못 말한다.
  const tiers = conditionsFrom(ALTERNATIVE_POLICY).tiers;
  for (let i = 1; i < tiers.length; i += 1) {
    assert.ok(topNet(tiers[i]) > topNet(tiers[i - 1]),
      `${tiers[i].rate} 가 ${tiers[i - 1].rate} 보다 크지 않다`);
  }
});


test('가산을 빼먹은 내역은 계약 검사가 잡는다', () => {
  // 응시료를 더하지 않고 세금만 빼면 실수령이 맞지 않는다.
  const c = {
    ...ALTERNATIVE_POLICY,
    policy: {
      ...ALTERNATIVE_POLICY.policy,
      conditionTiers: ALTERNATIVE_POLICY.policy.conditionTiers.map((t) => (
        t.id === 'r200' ? { ...t, payout: { ...t.payout, additions: [] } } : t)),
    },
  };
  assert.ok(checkPolicyView(c).some((m) => m.includes('내역이 맞지 않는다')));
});

test('구간에도 경로에도 금액이 없으면 계약 검사가 잡는다', () => {
  // 금액 없는 구간을 통과시키면 화면이 '충족 시 얼마' 를 말할 수 없다.
  const c = {
    ...ALTERNATIVE_POLICY,
    policy: {
      ...ALTERNATIVE_POLICY.policy,
      conditionTiers: ALTERNATIVE_POLICY.policy.conditionTiers.map((t) => (
        t.id === 'r50' ? { ...t, payout: null } : t)),
    },
  };
  assert.ok(checkPolicyView(c).some((m) => m.includes('금액이 없다')));
});

test('원 단위 금액에 자리수를 넣는다', () => {
  assert.equal(wonText(242112), '242,112원');
  assert.equal(wonText(0), '0원');
  assert.equal(wonText('320000'), '320,000원');
});

test('조건마다 무엇으로 확인하는지 붙는다', () => {
  // 경로마다 필요 자료가 달라지는 것을 보여주는 것이 시연의 요지다.
  const [exam, learning] = conditionsFrom(SYNTHETIC_POLICY).groups[0].items;
  assert.equal(exam.evidence, EVIDENCE.EXAM);
  assert.equal(learning.evidence, EVIDENCE.LEARNING);
});

test('정책에 없는 조건은 목록에 나오지 않는다', () => {
  // 서버가 주지 않는 조건을 화면이 지어내면, 동의하지 않은 조건을 보여주게 된다.
  const c = copy();
  delete c.policy.minScore;
  const model = conditionsFrom(c);
  assert.equal(countItems(model), 1);
  assert.equal(model.groups[0].items[0].kind, 'LEARNING');
});

test('조건이 하나도 없어도 깨지지 않는다', () => {
  const c = copy();
  delete c.policy.minScore;
  delete c.policy.minCompletionBps;
  const model = conditionsFrom(c);
  assert.equal(countItems(model), 0);
  assert.equal(model.groups.length, 1);
  assert.ok(model.payout, '지급은 조건과 별개로 남는다');
});

test('경로가 하나면 선택 경로가 아니다', () => {
  assert.equal(hasAlternatives(conditionsFrom(SYNTHETIC_POLICY)), false);
});

test('경로가 둘이면 선택 경로로 센다', () => {
  // 시원스쿨처럼 '출석 경로 또는 성적 경로' 가 되면 머리글과 꼬리말이 바뀐다.
  // 변환이 그 모양을 만들 수 있는지 여기서 확인한다.
  const two = { groups: [{ id: 'a', items: [{}] }, { id: 'b', items: [{}, {}] }], payout: {} };
  assert.equal(hasAlternatives(two), true);
  assert.equal(countItems(two), 3);
});

test('금액이 일부 경로에만 있으면 경로 안에 그리지 않는다', () => {
  // 한쪽만 금액을 가지면, 경로 안에 그렸을 때 나머지 경로가 금액 없이
  // 보인다. 그 경우는 구간 금액 하나로 그려야 한다.
  const half = { groups: [{ id: 'a', items: [{}], payout: {} }, { id: 'b', items: [{}], payout: null }] };
  assert.equal(hasPathPayouts(half), false);
});

test('값에 점수·이수율 실제 기록이 섞이지 않는다', () => {
  // 조건은 '무엇을 충족해야 하는가' 이고 '얼마나 했는가' 가 아니다.
  // 자격 판정은 계획 F4 이고 이 응답에는 값 자체가 없다.
  const model = conditionsFrom(SYNTHETIC_POLICY);
  for (const item of model.groups[0].items) {
    for (const banned of ['totalScore', 'completedUnits', 'met', 'eligibility']) {
      assert.ok(!JSON.stringify(item).includes(banned), `${banned} 가 조건에 들어갔다`);
    }
  }
});

test('조건마다 어떻게 확인하는지 붙는다', () => {
  // '아직 확인 안 됨' 만 붙여 두면 참가자는 자기가 뭘 해야 하는지 모른다.
  // 조건마다 할 일이 다른 것이 이 화면의 요지다.
  const r100 = conditionsFrom(ALTERNATIVE_POLICY).tiers.find((t) => t.id === 'r100');
  const [attend] = r100.groups[0].items;
  const [exam, history] = r100.groups[1].items;

  assert.equal(verifyOf(attend).actor, false, '출석은 참가자가 할 일이 없다');
  assert.equal(verifyOf(exam).actor, true, '성적은 본인이 로그인해야 한다');
  assert.equal(verifyOf(history).actor, false, '과거 이력은 같은 로그인에서 함께 확인된다');
  assert.equal(verifyOf(history).tag, '함께 가져옴');
  // 가져오는 것과 '전부가 맞다' 는 다르다. 수집만으로 끝난 것처럼 적지 않는다.
  assert.ok(verifyOf(history).note.includes('전부인지는 아직 확인하지 못했'));
});

test('성적은 제출이 아니라 본인 로그인으로 확인한다', () => {
  // 점수를 입력받거나 성적표 파일을 올리는 방식이 아니다. 그 차이가
  // zkTLS 를 쓰는 이유이므로 문구가 뒤집히면 설계를 잘못 말하는 것이 된다.
  const note = VERIFY.SELF_LOGIN.note;
  assert.ok(note.includes('본인 계정으로 로그인'));
  assert.ok(!note.includes('제출'), '성적을 제출한다고 적으면 안 된다');
});

test('모르는 확인 방법은 계약 검사가 잡는다', () => {
  // 화면이 모르는 코드가 오면 확인 방법 없이 그려져서 할 일이 안 보인다.
  const c = {
    ...YBM_POLICY,
    policy: {
      ...YBM_POLICY.policy,
      conditionGroups: [{
        ...YBM_POLICY.policy.conditionGroups[0],
        items: YBM_POLICY.policy.conditionGroups[0].items.map((item, i) => (
          i === 0 ? { ...item, verify: 'TELEPATHY' } : item)),
      }],
    },
  };
  assert.ok(checkPolicyView(c).some((m) => m.includes('verify 가')));
});

test('YBM 반은 안내문 금액과 토큰이 맞는다', () => {
  // 안내문에 적힌 금액은 170,040원(세후)이고, 218,000원은 거기서 역산한 값이다.
  // 결제수수료 공제가 없다는 것도 이 역산이 딱 떨어지는 데서 나온다.
  const p = YBM_POLICY.policy;
  const m = p.payoutBreakdown;
  assert.equal(m.net, 170040);
  assert.equal(m.gross.amount, 218000);
  assert.equal(m.additions.length, 0, '750+ 표에는 응시료 추가 환급 칸이 없다');
  assert.equal(m.deductions.length, 1, '결제수수료 공제가 없다');
  assert.equal(m.gross.amount - m.deductions[0].amount, m.net);
  assert.equal(p.amount, String(BigInt(m.net) * 10n ** BigInt(p.tokenDecimals)));
});

test('YBM 반은 구간 없이 한 경로로 그려진다', () => {
  // 환급률이 100% 하나뿐이라 넘겨볼 구간이 없다. 조건 넷은 전부 AND 다.
  const model = conditionsFrom(YBM_POLICY);
  assert.equal(model.tiers, null);
  assert.equal(model.groups.length, 1);
  assert.equal(countItems(model), 4);
  assert.equal(hasAlternatives(model), false);
  assert.ok(checkPolicyView(YBM_POLICY).length === 0, checkPolicyView(YBM_POLICY).join(' / '));
});

test('진행 상황은 조건 id 로 붙는다', () => {
  const progress = { attend100: { state: 'MET', value: '100일 / 100일' } };
  const model = conditionsFrom(ALTERNATIVE_POLICY, progress);
  const r200 = model.tiers.find((t) => t.id === 'r200');
  const attend = r200.groups[0].items.find((i) => i.id === 'attend100');
  assert.equal(progressOf(attend).state, 'MET');
  assert.equal(progressOf(attend).value, '100일 / 100일');
});

test('같은 조건은 구간이 달라도 한 번에 채워진다', () => {
  // 출석 100일은 한 번 해내면 200%·300%·400% 어디에나 걸리는 하나의 사실이다.
  const model = conditionsFrom(ALTERNATIVE_POLICY, { attend100: { state: 'MET' } });
  for (const id of ['r200', 'r300']) {
    const tier = model.tiers.find((t) => t.id === id);
    const attend = tier.groups[0].items.find((i) => i.id === 'attend100');
    assert.equal(progressOf(attend).state, 'MET', `${id} 에 안 붙었다`);
  }
});

test('성적 하나가 구간마다 다르게 걸린다', () => {
  // 780점은 750을 넘고 850은 못 넘는다. 구간이 여럿인 반의 요지가 이것이다.
  const model = conditionsFrom(ALTERNATIVE_POLICY, {
    exam750: { state: 'MET', value: '780점' },
    exam850: { state: 'UNMET', value: '780점' },
  });
  const at = (tierId, itemId) => progressOf(
    model.tiers.find((t) => t.id === tierId).groups[0].items.find((i) => i.id === itemId));
  assert.equal(at('r200', 'exam750').state, 'MET');
  assert.equal(at('r300', 'exam850').state, 'UNMET');
});

test('진행 상황이 없으면 충족을 말하지 않는다', () => {
  // 서버가 주지 않은 결과를 화면이 만들면, 판정 없이 충족을 말하게 된다.
  const model = conditionsFrom(ALTERNATIVE_POLICY);
  assert.equal(hasProgress(model.tiers[0]), false);
  for (const item of model.tiers[0].groups[0].items) {
    assert.equal(progressOf(item).state, 'WAITING');
  }
});

test('모르는 상태는 충족으로 읽히지 않는다', () => {
  const model = conditionsFrom(YBM_POLICY, { attend90: { state: 'ALMOST' } });
  const attend = model.groups[0].items.find((i) => i.id === 'attend90');
  assert.equal(progressOf(attend).state, 'WAITING', '모르는 상태는 아직으로 떨어뜨린다');
});

test('모르는 상태는 계약 검사가 먼저 잡는다', () => {
  const problems = checkApplicationView({
    ...PROGRESS_VIEW, conditionProgress: { attend90: { state: 'ALMOST' } },
  });
  assert.ok(problems.some((m) => m.includes('state 가')), problems.join(' / '));
});

test('충족한 조건을 센다 — 판정이 아니라 세기다', () => {
  const model = conditionsFrom(ALTERNATIVE_POLICY, {
    attend100: { state: 'MET' }, exam750: { state: 'MET' }, history2y: { state: 'MET' },
  });
  const r200 = model.tiers.find((t) => t.id === 'r200');
  assert.deepEqual(metCount(r200.groups[0]), { met: 3, total: 4 }, '후기는 아직이다');
});

test('진행 상황이 든 시나리오가 계약을 지킨다', async () => {
  for (const scenario of ['ybmProgress', 'altProgress']) {
    const adapter = createSyntheticAdapter({ scenario });
    const [view] = await adapter.listApplications();
    assert.deepEqual(checkApplicationView(view), [], scenario);
    assert.ok(view.conditionProgress, `${scenario} 에 진행 상황이 없다`);
  }
});

test('수강후기는 참가자가 자료를 낸다', () => {
  // 후기는 학원 사이트에 쓰는 글이지만 우리가 그 사이트를 읽을 수단이
  // 없다. 그래서 참가자가 쓴 화면을 자료로 내고, 낸 자료에서 작성일·분량을
  // 읽지 못하면 보완을 요청한다.
  const r200 = conditionsFrom(ALTERNATIVE_POLICY).tiers.find((t) => t.id === 'r200');
  const review = r200.groups[0].items.find((i) => i.id === 'review');
  assert.equal(review.evidence, EVIDENCE.REVIEW);
  assert.equal(verifyOf(review), VERIFY.SUBMIT);
  assert.equal(verifyOf(review).actor, true, '참가자가 할 일이다');
});

test('낸 자료에서 못 읽은 것이 있으면 보완을 받는다고 말한다', () => {
  // '검토 실패' 가 아니라 '무엇이 빠졌는지' 를 말해야 참가자가 고칠 수 있다.
  assert.ok(VERIFY.SUBMIT.note.includes('읽지 못하면'));
  assert.ok(VERIFY.SUBMIT.note.includes('다시 받습니다'));
});

test('후기 내용으로 환급률이 바뀔 수 있다는 조항을 적는다', () => {
  // 안내문에 있는 학원 재량이다. 빠뜨리면 조건을 사실과 다르게 말하게 된다.
  const r200 = conditionsFrom(ALTERNATIVE_POLICY).tiers.find((t) => t.id === 'r200');
  const review = r200.groups[0].items.find((i) => i.id === 'review');
  assert.ok(review.detail.includes('환급률이 바뀔 수 있습니다'));
});



test('성적 인정 기간을 안내문보다 넓게 적지 않는다', () => {
  // 안내문 2-2) 는 '수강시작일로부터 100일 이내 치른 성적표' 다.
  // '수강시작일 이후' 라고만 적으면 안 되는 조건을 된다고 말하게 된다.
  for (const tier of ALTERNATIVE_POLICY.policy.conditionTiers) {
    for (const group of tier.groups) {
      for (const item of group.items) {
        if (!item.id.startsWith('exam') || item.id === 'examBelow') continue;
        assert.ok(item.detail.includes('100일 이내'), `${tier.rate} ${item.id}`);
      }
    }
  }
});




test('기한까지 남은 날을 적는다', () => {
  const at = 1795132800;                       // 2026-11-20 09:00 KST
  const day = 86400000;
  assert.equal(daysLeftText(at, at * 1000 - day * 3), '앞으로 3일');
  assert.equal(daysLeftText(at, at * 1000), '오늘까지');
  assert.equal(daysLeftText(at, at * 1000 + day), '지났습니다');
  assert.equal(daysLeftText('없음', Date.now()), null, '모르는 값은 지어내지 않는다');
});

test('조건 종류 이름이 서버 스키마와 같다', () => {
  // 화면이 따로 이름을 만들면 나중에 둘을 맞추는 일이 생긴다.
  // src/policy/mvp/schema.mjs 의 Requirement.kind 와 같아야 한다.
  const fromServer = ['EXAM', 'BASELINE', 'LEARNING', 'MOCK_TEST', 'REVIEW', 'BLOG'];
  for (const kind of fromServer) {
    assert.ok(kind in EVIDENCE, `${kind} 가 화면에 없다`);
  }
  const used = new Set();
  for (const policy of [ALTERNATIVE_POLICY, YBM_POLICY]) {
    const groups = policy.policy.conditionTiers
      ? policy.policy.conditionTiers.flatMap((t) => t.groups)
      : policy.policy.conditionGroups;
    for (const group of groups) for (const item of group.items) used.add(item.kind);
  }
  for (const kind of used) assert.ok(fromServer.includes(kind), `${kind} 는 서버에 없는 종류다`);
});

test('종류만으로 확인 방법이 정해져 덮어쓸 일이 없다', () => {
  // 과거 이력은 BASELINE 이라 '함께 확인' 이 저절로 나온다. 조건마다
  // verify 를 적어 주던 것을 없앴다.
  const groups = ALTERNATIVE_POLICY.policy.conditionTiers.flatMap((t) => t.groups);
  const history = groups.flatMap((g) => g.items).find((i) => i.id === 'history2y');
  assert.equal(history.verify, null, '덮어쓰기가 남아 있다');
  assert.equal(verifyOf(history), VERIFY.SELF_LOGIN_SHARED);
});

test('계산 결과를 확정 지급액이라고 말하지 않는다', () => {
  // 결제금액·수수료가 우리가 세운 시연 가정이다. '실제 지급은 이 금액' 이라고
  // 적으면 안내문이 확정한 금액처럼 읽힌다.
  const { payout } = conditionsFrom(ALTERNATIVE_POLICY).tiers[0];
  assert.ok(payout.note.includes('시연 가정'));
  assert.ok(!payout.note.includes('실제 지급은 이 금액'));
});

test('확보된 재원은 모른다고 적는다', () => {
  // 약정/계산 금액 · 확보된 재원 · 신청별 배정액은 서로 다른 값이다.
  // 재원을 못 받았으면 못 받았다고 해야 계산 결과가 지급으로 읽히지 않는다.
  // 100% 처럼 금액이 경로에 붙은 구간도 빠지면 안 된다.
  for (const { at, payout } of payoutsOf(conditionsFrom(ALTERNATIVE_POLICY))) {
    assert.ok(payout.funding.includes('확인 전'), at);
  }
});

test('YBM 시험 인정 기간은 확정하지 않는다', () => {
  // 안내문에 「수강시작일 이후 응시」(L36)와 「수료 후 정기 토익」(L78)이
  // 함께 있다. 운영자 검토는 이걸 보류로 두는데, 학생 화면만 한쪽으로
  // 확정하면 두 화면이 서로 다른 결론을 보여준다.
  const exam = YBM_POLICY.policy.conditionGroups[0].items.find((i) => i.id === 'exam750');
  assert.ok(exam.detail.includes('확인 중'), '확정해서 적으면 안 된다');
  assert.ok(exam.detail.includes('수료 후'), '어느 둘이 엇갈리는지 밝혀야 한다');

  const progress = SCENARIOS.ybmProgress.items[0].conditionProgress.exam750;
  assert.ok(progress.note.includes('확정되지 않아'), progress.note);

  // 운영자 검토도 같은 자리를 보류로 두고 있어야 두 화면이 어긋나지 않는다.
  const field = YBM_REVIEW.fields.find((f) => f.fieldId === 'examWindow');
  assert.equal(field.state, 'HELD');
});

test('가져온 것과 전부인 것을 구분한다', () => {
  // 2년 내 이력은 같은 로그인에서 목록을 받지만, 그 목록이 응시 전부인지는
  // 모른다(listComplete=false). MET 로 적으면 확인되지 않은 것을 확인했다고
  // 말하게 된다.
  const progress = SCENARIOS.altProgress.items[0].conditionProgress.history2y;
  assert.equal(progress.state, 'NEEDS_CHECK');
  assert.notEqual(progress.state, 'MET');
  assert.ok(progress.note.includes('전부인지'));

  const model = conditionsFrom(ALTERNATIVE_POLICY, { history2y: progress });
  const r200 = model.tiers.find((t) => t.id === 'r200');
  const item = r200.groups[0].items.find((i) => i.id === 'history2y');
  assert.equal(progressOf(item).label, '추가 확인 필요');
});

test('반 이름은 선택 필드다 — 없으면 지어내지 않는다', () => {
  // 참가자 화면 맨 위에 와야 하는 값인데 서버가 아직 주지 않는다.
  // cohortId 같은 기계 값을 대신 보여주거나 이름을 만들면 안 된다.
  assert.equal(ALTERNATIVE_POLICY.policy.productName, '시원스쿨 시작이반 750점반');
  assert.equal(YBM_POLICY.policy.productName, 'YBM 750+ 환급코스');

  const noName = { ...YBM_POLICY, policy: { ...YBM_POLICY.policy } };
  delete noName.policy.productName;
  assert.deepEqual(checkPolicyView(noName), [], '없어도 계약을 어기지 않는다');

  const bad = { ...YBM_POLICY, policy: { ...YBM_POLICY.policy, productName: '' } };
  assert.ok(checkPolicyView(bad).some((m) => m.includes('productName')));
});
