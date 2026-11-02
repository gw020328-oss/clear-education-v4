// 운영자 검토 fixture 시험 (F3)
//
// 여기서 고정하는 것은 하나다 — **AI 가 못 뽑은 값은 비어 있어야 한다.**
//
// src/ai-policy/field-review.mjs 의 주석이 그 이유를 말한다.
//   "No NLP/regex guessing of question meaning. Any unresolved signal holds
//    its explicit fields."
//
// 보류된 값이 채워진 채로 화면에 오면 운영자가 확인 없이 승인하게 되고,
// 그러면 조건을 사실과 다르게 고정하게 된다. 이 제품이 없애려는 문제다.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkReviewView } from '../src/adapter/contract.js';
import { reasonText, heldCount, fieldsAt } from '../src/ui/review-view.js';
import { REVIEWS, SIWON_REVIEW, YBM_REVIEW, DEFAULT_REVIEW_ID } from '../src/fixtures/review.js';

const all = Object.values(REVIEWS);

test('두 반의 검토가 계약을 지킨다', () => {
  for (const review of all) {
    assert.deepEqual(checkReviewView(review), [], review.reviewId);
  }
});

test('보류된 값은 비어 있다', () => {
  for (const review of all) {
    for (const field of review.fields) {
      if (field.state === 'OBSERVED') continue;
      assert.equal(field.value, null, `${review.reviewId} ${field.fieldId}`);
    }
  }
});

test('보류되어도 AI 가 본 값은 남는다', () => {
  // 값을 비우는 것과 관측을 버리는 것은 다르다. 운영자가 판단하려면
  // 'AI 는 3% 라고 봤다' 는 사실이 필요하다.
  const fee = SIWON_REVIEW.provenance.find((row) => row.fieldId === 'feeRate');
  assert.equal(fee.observedValue, '3');
  const held = SIWON_REVIEW.fields.find((f) => f.fieldId === 'feeRate');
  assert.equal(held.value, null);
  assert.equal(held.state, 'HELD');
});

test('값이 있으면 안내문 어디서 왔는지 가리킨다', () => {
  // 멘토가 평가지표로 꼽은 '원문 인용 위치 매핑' 이다.
  for (const review of all) {
    const locators = new Set(review.blocks.map((b) => b.locator));
    for (const field of review.fields) {
      if (field.value === null) continue;
      assert.ok(locators.has(field.location), `${review.reviewId} ${field.fieldId}`);
    }
  }
});

test('보류된 값에는 사유가 붙는다', () => {
  for (const review of all) {
    for (const field of review.fields) {
      if (field.state === 'OBSERVED') continue;
      assert.ok(field.reasons.length > 0, `${review.reviewId} ${field.fieldId}`);
    }
  }
});

test('질문은 붙잡은 값을 가리킨다', () => {
  for (const review of all) {
    const ids = new Set(review.fields.map((f) => f.fieldId));
    for (const question of review.questions) {
      for (const id of question.fieldIds) {
        assert.ok(ids.has(id), `${review.reviewId} ${question.questionId}`);
        const field = review.fields.find((f) => f.fieldId === id);
        assert.notEqual(field.state, 'OBSERVED', '질문이 걸린 값이 확정돼 있다');
      }
    }
  }
});

test('승인 전에는 게시할 수 없다', () => {
  for (const review of all) {
    assert.equal(review.publishable, false, review.reviewId);
    assert.equal(review.automaticEligibility, false);
    assert.equal(review.paymentAllowed, false);
  }
});

test('보류가 있으면 검토가 필요하다고 말한다', () => {
  assert.equal(SIWON_REVIEW.status, 'NEEDS_REVIEW');
  assert.equal(YBM_REVIEW.status, 'NEEDS_REVIEW');
});

test('안내문에 없는 값은 지어내지 않는다', () => {
  // 시원스쿨 계산식에 '+응시료' 자리는 있는데 금액이 어디에도 없다.
  // AI 가 숫자를 채우면 금액이 틀리고, 그게 바로 이 제품이 겨냥한 문제다.
  const exam = SIWON_REVIEW.fields.find((f) => f.fieldId === 'examCredit');
  assert.equal(exam.value, null);
  const asked = SIWON_REVIEW.questions.find((q) => q.fieldIds.includes('examCredit'));
  assert.ok(asked, '비워만 두고 묻지 않으면 운영자가 모른 채 넘어간다');
  assert.ok(asked.text.includes('금액이 없습니다'));
});

test('채워진 값이 오면 계약 검사가 잡는다', () => {
  const broken = {
    ...SIWON_REVIEW,
    fields: SIWON_REVIEW.fields.map((f) => (
      f.fieldId === 'examCredit' ? { ...f, value: '52500' } : f)),
  };
  assert.ok(checkReviewView(broken).some((m) => m.includes('보류된 값은 비어 있어야')));
});

test('출처 없는 값이 오면 계약 검사가 잡는다', () => {
  const broken = {
    ...SIWON_REVIEW,
    fields: SIWON_REVIEW.fields.map((f) => (
      f.fieldId === 'targetScore' ? { ...f, location: 'L999' } : f)),
  };
  assert.ok(checkReviewView(broken).some((m) => m.includes('어디서 왔는지')));
});

test('기본으로 여는 검토에는 할 일이 있다', () => {
  // 보류가 없는 쪽을 먼저 띄우면 운영자가 할 일이 없는 화면을 본다.
  const first = REVIEWS[DEFAULT_REVIEW_ID];
  assert.ok(first.fields.some((f) => f.state !== 'OBSERVED'));
});

test('보류 사유를 사람 말로 바꾼다', () => {
  // 'QUESTION:0' 을 그대로 보여주면 운영자가 왜 비었는지 모른다.
  assert.equal(reasonText('NO_VALUE', SIWON_REVIEW), '안내문에서 이 값을 찾지 못했습니다.');
  assert.ok(reasonText('QUESTION:0', SIWON_REVIEW).includes('금액이 없습니다'));
  assert.ok(reasonText('FLAG:0', SIWON_REVIEW).includes('정확한 기준을 밝히지 않았습니다'));
  // 모르는 사유도 빈칸으로 두지 않는다.
  assert.ok(reasonText('QUESTION:99', SIWON_REVIEW).length > 0);
});

test('운영자가 확인할 것이 몇 개인지 센다', () => {
  assert.equal(heldCount(SIWON_REVIEW), 3);
  // YBM 은 금액이 표에 있어 보류가 적지만, 안내문 안에서 시험 인정 기간이
  // 엇갈려서(L36 「수강시작일 이후 응시」 vs L78 「수료 후」) 그 값도 비어 있다.
  assert.equal(heldCount(YBM_REVIEW), 2);
});

test('안내문 줄에서 그 줄로 뽑은 값을 되짚는다', () => {
  // 값과 원문이 서로 이어져야 운영자가 대조할 수 있다.
  assert.deepEqual(fieldsAt(SIWON_REVIEW, 'L27').map((f) => f.fieldId), ['targetScore']);
  // 보류된 값은 아직 근거가 아니므로 되짚지 않는다.
  assert.deepEqual(fieldsAt(SIWON_REVIEW, 'L53'), []);
});

test('안내문 안에서 근거가 충돌하면 고르지 않고 묻는다', () => {
  // YBM 안내문은 L36 에서 '수강시작일 이후 응시', L78 에서 '수료 후 정기 토익'
  // 이라고 한다. 어느 시험이 인정되는지가 달라지는데 AI 가 둘 중 하나를 고르면
  // 참가자가 못 받을 시험을 받을 수 있다고 믿게 된다.
  const field = YBM_REVIEW.fields.find((f) => f.fieldId === 'examWindow');
  assert.equal(field.value, null, '충돌한 값을 채우면 안 된다');
  assert.equal(field.state, 'HELD');

  const asked = YBM_REVIEW.questions.find((q) => q.fieldIds.includes('examWindow'));
  assert.ok(asked, '비워만 두고 묻지 않으면 운영자가 모른 채 넘어간다');
  assert.ok(asked.text.includes('L36') && asked.text.includes('L78'),
    '어느 줄끼리 어긋나는지 가리켜야 운영자가 대조한다');
});

test('운영자 화면이 AI 추출과 운영자 확인을 구분한다', () => {
  // 'AI 가 뽑았다' 와 '사람이 확인했다' 는 다른 일이다. 섞으면 아무도 안 본
  // 값이 승인된 것처럼 읽힌다.
  assert.ok(!JSON.stringify(SIWON_REVIEW).includes('확인됨'));
});
