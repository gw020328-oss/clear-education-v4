// 어댑터 계약 시험 — DOM 없이 돌아간다
//   ./tools/node --test web/tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  checkApplicationView, APPLICATION_STATES, BASE_VIEW_FIELDS, isHash32, isAddress,
} from '../src/adapter/contract.js';
import { SYNTHETIC_APPLICATIONS } from '../src/fixtures/applications.js';

const sample = () => ({ ...SYNTHETIC_APPLICATIONS[0] });
const enrolled = () => ({ ...SYNTHETIC_APPLICATIONS.at(-1) });

test('합성 fixture 다섯 건이 모두 계약을 통과한다', () => {
  assert.equal(SYNTHETIC_APPLICATIONS.length, 5);
  for (const view of SYNTHETIC_APPLICATIONS) {
    assert.deepEqual(checkApplicationView(view), [], `${view.state} 가 계약을 어긴다`);
  }
});

test('다섯 상태가 모두 한 번씩 들어 있다', () => {
  const states = SYNTHETIC_APPLICATIONS.map((v) => v.state);
  assert.deepEqual([...states].sort(), [...APPLICATION_STATES].sort());
});

test('기본 필드가 빠지면 잡는다', () => {
  for (const removed of BASE_VIEW_FIELDS) {
    const view = sample();
    delete view[removed];
    const problems = checkApplicationView(view);
    assert.ok(problems.some((p) => p.includes(removed)), `${removed} 누락을 못 잡았다`);
  }
});

test('계약에 없는 필드를 넣으면 잡는다', () => {
  const view = { ...sample(), eligibility: 'MET' };
  const problems = checkApplicationView(view);
  assert.ok(problems.some((p) => p.includes('eligibility')));
});

test('paymentAllowed 를 true 로 바꾸면 잡는다', () => {
  const problems = checkApplicationView({ ...sample(), paymentAllowed: true });
  assert.ok(problems.some((p) => p.includes('paymentAllowed')));
});

test('dataMode 를 SYNTHETIC 외로 바꾸면 잡는다', () => {
  const problems = checkApplicationView({ ...sample(), dataMode: 'REAL' });
  assert.ok(problems.some((p) => p.includes('dataMode')));
});

test('ENROLLED 가 아닌데 funded 가 true 면 잡는다', () => {
  const problems = checkApplicationView({ ...sample(), funded: true });
  assert.ok(problems.some((p) => p.includes('funded')));
});

test('알 수 없는 state 를 잡는다', () => {
  const problems = checkApplicationView({ ...sample(), state: 'REFUNDABLE' });
  assert.ok(problems.some((p) => p.includes('REFUNDABLE')));
});

test('createdAt 이 숫자면 잡는다 — 시각은 문자열로 온다', () => {
  const problems = checkApplicationView({ ...sample(), createdAt: 1762000000 });
  assert.ok(problems.some((p) => p.includes('createdAt')));
});

test('blockNumber 가 숫자면 잡는다 — 문자열로 온다', () => {
  const view = enrolled();
  view.fundingEvidence = { ...view.fundingEvidence, blockNumber: 1234 };
  const problems = checkApplicationView(view);
  assert.ok(problems.some((p) => p.includes('blockNumber')));
});

test('fundingEvidence 필드가 빠지면 잡는다', () => {
  const view = enrolled();
  const { blockHash, ...rest } = view.fundingEvidence;
  view.fundingEvidence = rest;
  const problems = checkApplicationView(view);
  assert.ok(problems.some((p) => p.includes('blockHash')));
});

test('consentScope 와 contractConsentRequired 의 조합을 검사한다', () => {
  assert.ok(checkApplicationView({ ...sample(), consentScope: 'CONTRACT' })
    .some((p) => p.includes('contractConsentRequired')));
  const view = enrolled();
  assert.ok(checkApplicationView({ ...view, contractConsentRequired: true })
    .some((p) => p.includes('contractConsentRequired')));
});

test('해시·주소 형식 검사', () => {
  assert.ok(isHash32('0x' + 'a'.repeat(64)));
  assert.ok(!isHash32('0x' + 'A'.repeat(64)), '대문자 hex 는 허용하지 않는다');
  assert.ok(!isHash32('0x' + 'a'.repeat(63)));
  assert.ok(!isHash32('a'.repeat(64)), '0x 접두사가 필요하다');
  assert.ok(isAddress('0x' + '1'.repeat(40)));
  assert.ok(!isAddress('0x' + '1'.repeat(41)));
});

test('객체가 아니면 바로 문제로 돌려준다', () => {
  for (const value of [null, undefined, 'x', 7, []]) {
    assert.ok(checkApplicationView(value).length > 0, `${String(value)} 를 통과시켰다`);
  }
});
