// 단계 화면 시험
//
// 첫 화면의 타임라인과 단계 상세는 같은 판정을 써야 한다. 둘이 어긋나면
// 타임라인에서는 '완료'인 단계가 상세에서는 '아직'으로 보인다.
// 그래서 statusOf() 하나만 두고, 여기서 그 경계를 고정한다.
//
// 화면을 그리는 부분은 document 가 필요하므로 여기서 다루지 않는다.
// 이 파일은 순수 판정과 문구 표(表)만 본다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { statusOf, DONE, NOW, TODO } from '../src/ui/timeline.js';
import { STEP_TASKS } from '../src/ui/step-detail.js';
import { STEP_ORDER, TOTAL_STEPS } from '../src/ui/state-labels.js';

/** 현재 상태를 기준으로 다섯 단계의 판정을 순서대로 늘어놓는다 */
const line = (currentState) => STEP_ORDER.map((state) => statusOf(state, currentState));

// ── 어느 단계가 완료·지금·아직인가 ──────────────────────────────────────────

test('3단계에 있으면 앞은 완료, 지금은 3단계, 뒤는 아직', () => {
  assert.deepEqual(line('CONSENTED'), [DONE, DONE, NOW, TODO, TODO]);
});

test('첫 단계에서는 완료가 하나도 없다', () => {
  assert.deepEqual(line('DRAFT'), [NOW, TODO, TODO, TODO, TODO]);
});

test('마지막 단계에서는 아직인 단계가 없다', () => {
  assert.deepEqual(line('ENROLLED'), [DONE, DONE, DONE, DONE, NOW]);
});

test('어느 상태에서도 「지금 여기」는 한 단계뿐이다', () => {
  for (const state of STEP_ORDER) {
    assert.equal(line(state).filter((s) => s === NOW).length, 1, `${state} 에서 어긋난다`);
  }
});

test('완료는 지금보다 앞에만 온다 — 완료 뒤에 아직이 끼지 않는다', () => {
  for (const state of STEP_ORDER) {
    const statuses = line(state);
    const lastDone = statuses.lastIndexOf(DONE);
    const firstTodo = statuses.indexOf(TODO);
    if (lastDone !== -1 && firstTodo !== -1) {
      assert.ok(lastDone < firstTodo, `${state} 에서 순서가 섞인다`);
    }
  }
});

test('모르는 상태에서는 어느 단계도 완료라고 말하지 않는다', () => {
  // 서버가 이 화면이 모르는 상태를 주면 step 이 0 이다. 임의로 진행했다고
  // 읽지 않는 것이 F0 의 기준이므로 전부 '아직' 이어야 한다.
  assert.deepEqual(line('WHAT_IS_THIS'), [TODO, TODO, TODO, TODO, TODO]);
  assert.deepEqual(line(undefined), [TODO, TODO, TODO, TODO, TODO]);
});

// ── 주소의 단계 번호 ────────────────────────────────────────────────────────

test('주소의 단계 번호가 1부터 다섯 단계에 차례로 붙는다', () => {
  // main.js 가 #/applications/<id>/steps/<n> 을 STEP_ORDER[n-1] 로 읽는다.
  assert.equal(STEP_ORDER.length, TOTAL_STEPS);
  assert.equal(STEP_ORDER[1 - 1], 'DRAFT');
  assert.equal(STEP_ORDER[TOTAL_STEPS - 1], 'ENROLLED');
});

test('범위를 벗어난 단계 번호는 상태로 바뀌지 않는다', () => {
  for (const n of [0, -1, TOTAL_STEPS + 1, 99]) {
    assert.equal(STEP_ORDER[n - 1], undefined, `${n} 단계가 상태로 바뀐다`);
  }
});
// ── 「이 단계에서 하는 일」 표 ──────────────────────────────────────────────

test('다섯 단계가 모두 표에 있다', () => {
  // 상태를 하나 더 넣고 이 표를 잊으면 상세 화면이 그 단계에서 깨진다.
  for (const state of STEP_ORDER) {
    assert.ok(STEP_TASKS[state], `${state} 가 표에 없다`);
  }
});

test('표에 단계가 아닌 키가 없다', () => {
  for (const key of Object.keys(STEP_TASKS)) {
    assert.ok(STEP_ORDER.includes(key), `${key} 는 단계가 아니다`);
  }
});

test('어느 단계든 적어도 한 쪽은 할 일이 있다', () => {
  // 양쪽 다 비면 그 단계는 저절로 넘어간다는 말이 된다.
  for (const state of STEP_ORDER) {
    const { operator, learner } = STEP_TASKS[state];
    assert.ok(operator || learner, `${state} 에 아무 일도 없다`);
  }
});

test('할 일을 적은 쪽에는 설명이 있다', () => {
  for (const state of STEP_ORDER) {
    for (const [who, task] of Object.entries(STEP_TASKS[state])) {
      if (who === 'note' || !task) continue;
      assert.ok(task.text?.length, `${state} 의 ${who} 에 설명이 없다`);
    }
  }
});

test('적어 둔 서버 경로가 API_CONTRACT 에 실제로 있다', () => {
  // 화면이 없는 경로를 말하면 검토자가 그 호출이 있다고 믿는다.
  const contract = readFileSync(new URL('../../docs/current/API_CONTRACT.ko.md', import.meta.url), 'utf8');
  for (const state of STEP_ORDER) {
    for (const [who, task] of Object.entries(STEP_TASKS[state])) {
      if (who === 'note' || !task?.api) continue;
      const path = task.api.replace(/^[A-Z]+\s+/, '');
      assert.ok(contract.includes(path), `${state}.${who}: ${path} 가 계약서에 없다`);
    }
  }
});

test('한 쪽의 할 일에 서버 경로를 하나만 적는다', () => {
  for (const state of STEP_ORDER) {
    for (const [who, task] of Object.entries(STEP_TASKS[state])) {
      if (who === 'note' || !task?.api) continue;
      assert.match(task.api, /^[A-Z]+ \/\S+$/, `${state}.${who} 의 경로 모양이 다르다`);
    }
  }
});

// ── 누가 무엇을 하는가 ──────────────────────────────────────────────────────

test('서명 두 번은 참가자가 하고, 학원이 대신하지 않는다', () => {
  // 1·2단계의 동의 서명은 참가자 몫이다. 이것이 학원 쪽으로 옮겨가면
  // 화면이 거짓말을 한다.
  assert.ok(STEP_TASKS.DRAFT.learner, '1단계에 참가자 할 일이 없다');
  assert.ok(STEP_TASKS.TERMS_ACCEPTED.learner, '2단계에 참가자 할 일이 없다');
  assert.equal(STEP_TASKS.DRAFT.operator, null, '1단계는 학원이 할 일이 없다');
});

test('예치 두 단계는 학원만 움직인다', () => {
  for (const state of ['CONSENTED', 'FUNDING_PENDING']) {
    assert.ok(STEP_TASKS[state].operator, `${state} 에 학원 할 일이 없다`);
    assert.equal(STEP_TASKS[state].learner, null, `${state} 에 참가자 할 일이 생겼다`);
  }
});

test('신청이 끝난 뒤에는 학원이 할 일이 없다', () => {
  assert.equal(STEP_TASKS.ENROLLED.operator, null);
  assert.ok(STEP_TASKS.ENROLLED.learner, '수업·응시가 빠졌다');
});

test('돈이 어느 단계에서 움직이는지 화면이 말한다', () => {
  // 3단계는 거래 내용을 받아오는 자리이고 4단계가 돈이 들어가는 자리다.
  // 단계 이름(최종 동의 저장 / 예치 준비)만으로는 구별되지 않아, 읽는 사람이
  // 3단계에서 예치가 끝난다고 읽었다. 그래서 두 문장을 고정한다.
  assert.match(STEP_TASKS.CONSENTED.operator.text, /아직 돈은 움직이지 않습니다/);
  assert.match(STEP_TASKS.FUNDING_PENDING.operator.text, /실제로 금고에 들어가는 자리/);
});

test('단계 설명이 자격·청구·지급을 말하지 않는다', () => {
  // F0 의 완료 기준이다. 이 화면은 신청 절차까지만 말한다.
  for (const state of STEP_ORDER) {
    for (const [who, task] of Object.entries(STEP_TASKS[state])) {
      const text = who === 'note' ? task : task?.text;
      if (!text) continue;
      for (const banned of ['자격', '청구', '지급']) {
        assert.ok(!text.includes(banned), `${state}.${who} 가 ${banned} 을 말한다`);
      }
    }
  }
});
