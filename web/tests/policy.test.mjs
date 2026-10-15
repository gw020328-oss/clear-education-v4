// 조건 표시 시험

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkPolicyView, POLICY_FIELDS } from '../src/adapter/contract.js';
import { SYNTHETIC_POLICY } from '../src/fixtures/policy.js';
import { createSyntheticAdapter } from '../src/adapter/synthetic.js';
import { bpsText, amountText, seoulText } from '../src/ui/policy-view.js';

const copy = () => ({ ...SYNTHETIC_POLICY, policy: { ...SYNTHETIC_POLICY.policy } });

test('합성 정책이 컴파일러 계약을 지킨다', () => {
  assert.deepEqual(checkPolicyView(SYNTHETIC_POLICY), []);
});

test('컴파일러 필수 필드가 모두 있다', () => {
  for (const f of POLICY_FIELDS) {
    assert.ok(f in SYNTHETIC_POLICY.policy, `${f} 가 없다`);
  }
});

test('publishable 을 true 로 바꾸면 잡는다', () => {
  assert.ok(checkPolicyView({ ...copy(), publishable: true }).some((p) => p.includes('publishable')));
});

test('보완 종료가 제출 마감 +3일이 아니면 잡는다', () => {
  const c = copy();
  c.policy.supplementEndAt = String(Number(c.policy.normalSubmitAt) + 1000);
  assert.ok(checkPolicyView(c).some((p) => p.includes('보완 종료')));
});

test('최종 청구가 제출 마감 +10일이 아니면 잡는다', () => {
  const c = copy();
  c.policy.claimUntil = String(Number(c.policy.normalSubmitAt) + 1000);
  assert.ok(checkPolicyView(c).some((p) => p.includes('최종 청구')));
});

test('학습 종료가 제출 마감보다 늦으면 잡는다', () => {
  const c = copy();
  c.policy.learningEnd = String(Number(c.policy.normalSubmitAt) + 1);
  assert.ok(checkPolicyView(c).some((p) => p.includes('학습 종료')));
});

test('시험 인정 기간의 시작이 종료보다 늦으면 잡는다', () => {
  const c = copy();
  c.policy.examDateStart = '2026-12-01';
  assert.ok(checkPolicyView(c).some((p) => p.includes('시험 인정 기간')));
});

test('amount 가 숫자면 잡는다 — 금액은 문자열이다', () => {
  const c = copy();
  c.policy.amount = 50000000;
  assert.ok(checkPolicyView(c).some((p) => p.includes('amount')));
});

test('어댑터가 정책을 돌려준다', async () => {
  const adapter = createSyntheticAdapter();
  const got = await adapter.getPolicy(SYNTHETIC_POLICY.policyHash);
  assert.equal(got.policyHash, SYNTHETIC_POLICY.policyHash);
  assert.equal(got.policy.minScore, 800);
});

test('모르는 정책 해시는 API_REQUEST_FAILED', async () => {
  const adapter = createSyntheticAdapter();
  await assert.rejects(
    () => adapter.getPolicy('0x' + '0'.repeat(64)),
    (error) => error.code === 'API_REQUEST_FAILED',
  );
});

test('신청의 policyHash 로 그 정책을 받을 수 있다', async () => {
  // 신청이 가리키는 해시와 돌려받는 정책이 어긋나면, 참가자가 동의한 것과
  // 다른 조건을 화면이 보여주게 된다. 어느 반이든 성립해야 하므로 특정
  // 정책에 묶지 않는다.
  for (const scenario of ['ybm', 'altPath', 'stage3']) {
    const adapter = createSyntheticAdapter({ scenario });
    for (const view of await adapter.listApplications()) {
      const got = await adapter.getPolicy(view.policyHash);
      assert.equal(got.policyHash, view.policyHash, scenario);
    }
  }
});

test('베이시스포인트를 퍼센트로 바꾼다', () => {
  assert.equal(bpsText(8000), '80%');
  assert.equal(bpsText(7999), '79.99%');
  assert.equal(bpsText(10000), '100%');
  assert.equal(bpsText(8050), '80.5%');
});

test('금액은 자리수로 맞춘다 — 부동소수점을 쓰지 않는다', () => {
  assert.equal(amountText('50000000', 6), '50');
  assert.equal(amountText('50500000', 6), '50.5');
  assert.equal(amountText('1', 6), '0.000001');
  assert.equal(amountText('0', 6), '0');
  assert.equal(amountText('123', 0), '123');
});

test('시각은 서울 기준으로 보여준다', () => {
  const text = seoulText(SYNTHETIC_POLICY.policy.normalSubmitAt);
  assert.match(text, /KST/);
  assert.match(text, /26\. 11\. 20\./);
});

test('조건 화면은 점수·이수율 실제 값을 담지 않는다', () => {
  const keys = Object.keys(SYNTHETIC_POLICY.policy);
  for (const banned of ['totalScore', 'completedUnits', 'eligibility', 'met']) {
    assert.ok(!keys.includes(banned), `${banned} 가 정책에 있다`);
  }
});
