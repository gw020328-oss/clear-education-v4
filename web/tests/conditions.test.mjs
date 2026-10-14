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

import { conditionsFrom, hasAlternatives, countItems, wonText, EVIDENCE } from '../src/ui/conditions.js';
import { SYNTHETIC_POLICY, ALTERNATIVE_POLICY } from '../src/fixtures/policy.js';

const copy = () => ({ ...SYNTHETIC_POLICY, policy: { ...SYNTHETIC_POLICY.policy } });

test('현재 정책은 조건 둘과 지급 하나로 바뀐다', () => {
  const model = conditionsFrom(SYNTHETIC_POLICY);
  assert.equal(model.groups.length, 1, '지금 컴파일러에는 경로 개념이 없다');
  assert.equal(countItems(model), 2);
  assert.deepEqual(model.groups[0].items.map((i) => i.kind), ['EXAM', 'LEARNING']);
  assert.ok(model.payout.token.includes('TEST'));
});

test('금액 내역이 없는 반은 토큰만 적는다', () => {
  // 안내문 금액을 모르면 지어내지 않는다. 합성 토큰 수량만 말한다.
  const model = conditionsFrom(SYNTHETIC_POLICY);
  assert.equal(model.payout.money, null);
});

test('금액 내역이 있으면 공제를 거쳐 실수령이 남는다', () => {
  // 합계 하나만 적으면 광고 금액과 실수령의 차이가 안 보인다.
  // 그 차이가 이 제품이 겨냥한 문제다.
  const tier = ALTERNATIVE_POLICY.policy.conditionTiers.find((t) => t.supported);
  const m = tier.payout;
  const taken = m.deductions.reduce((sum, d) => sum + d.amount, 0);
  assert.ok(m.gross.amount > m.net, '실수령이 표시 금액보다 작아야 한다');
  assert.equal(m.gross.amount - taken, m.net, '공제 합계와 실수령이 맞지 않는다');
});

test('확정되지 않은 공제는 그렇다고 표시한다', () => {
  // 안내문이 '약 3%' 라고만 쓴 값을 3% 로 확정하면 금액이 틀린다.
  const tier = ALTERNATIVE_POLICY.policy.conditionTiers.find((t) => t.supported);
  assert.ok(tier.payout.deductions.some((d) => d.uncertain === true));
});

test('토큰 수량을 원화와 환산해 적지 않는다', () => {
  // 'N TEST = M원' 이라고 적는 순간 그것부터 거짓이 된다.
  const model = conditionsFrom(ALTERNATIVE_POLICY);
  const tier = model.tiers.find((t) => t.supported);
  assert.ok(tier.payout.token.includes('TEST'));
  assert.ok(!tier.payout.token.includes('원'));
});

test('집행하지 않는 구간에는 금액을 적지 않는다', () => {
  // 정책의 amount 는 집행 구간의 값 하나뿐이라, 다른 구간에 적으면 틀린 금액이 된다.
  const model = conditionsFrom(ALTERNATIVE_POLICY);
  for (const tier of model.tiers.filter((t) => !t.supported)) {
    assert.equal(tier.payout, null, `${tier.rate} 에 금액이 붙었다`);
  }
});

test('집행 구간은 정확히 하나다', () => {
  const model = conditionsFrom(ALTERNATIVE_POLICY);
  assert.equal(model.tiers.filter((t) => t.supported).length, 1);
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
