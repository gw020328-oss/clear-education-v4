// 합성 어댑터와 상태 문구 시험

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSyntheticAdapter, SCENARIO_KEYS } from '../src/adapter/synthetic.js';
import { SYNTHETIC_APPLICATIONS, DEMO_APPLICATION_ID } from '../src/fixtures/applications.js';
import { checkApplicationView, APPLICATION_STATES } from '../src/adapter/contract.js';
import { STATE_LABELS, stateLabel, errorText, SYNTHETIC_NOTICE } from '../src/ui/state-labels.js';
import { resolveWithin, portFromArgv, WEB_ROOT } from '../tools/dev-server.mjs';
import { sep } from 'node:path';

// ── 어댑터 ──────────────────────────────────────────────────────────────────

test('단계 시나리오는 신청 1건만 돌려주고 계약을 지킨다', async () => {
  for (const key of ['stage1', 'stage2', 'stage3', 'stage4', 'stage5']) {
    const items = await createSyntheticAdapter({ scenario: key }).listApplications();
    assert.equal(items.length, 1, `${key} 가 1건이 아니다`);
    assert.deepEqual(checkApplicationView(items[0]), []);
  }
});

test('다섯 단계가 모두 같은 신청·같은 지갑이다', () => {
  const ids = new Set(SYNTHETIC_APPLICATIONS.map((v) => v.applicationId));
  const wallets = new Set(SYNTHETIC_APPLICATIONS.map((v) => v.learner));
  assert.equal(ids.size, 1, '신청 ID 가 여러 개다');
  assert.equal(wallets.size, 1, '지갑이 여러 개다');
});

test('빈 목록 시나리오는 빈 배열을 돌려준다', async () => {
  const items = await createSyntheticAdapter({ scenario: 'empty' }).listApplications();
  assert.deepEqual(items, []);
});

test('목록은 복사본이라 호출자가 fixture 를 바꿀 수 없다', async () => {
  const adapter = createSyntheticAdapter({ scenario: 'stage1' });
  const first = await adapter.listApplications();
  first[0].state = 'ENROLLED';
  const second = await adapter.listApplications();
  assert.equal(second[0].state, 'DRAFT');
  assert.equal(SYNTHETIC_APPLICATIONS[0].state, 'DRAFT');
});

test('상세는 id 로 찾는다', async () => {
  const adapter = createSyntheticAdapter({ scenario: 'stage3' });
  const view = await adapter.getApplication(DEMO_APPLICATION_ID);
  assert.equal(view.applicationId, DEMO_APPLICATION_ID);
  assert.equal(view.state, 'CONSENTED');
});

test('없는 id 는 API_REQUEST_FAILED 로 던진다', async () => {
  const adapter = createSyntheticAdapter();
  await assert.rejects(
    () => adapter.getApplication('0x' + '0'.repeat(64)),
    (error) => error.code === 'API_REQUEST_FAILED',
  );
});

test('로그인 필요 시나리오는 AUTH_REQUIRED 로 던진다', async () => {
  const adapter = createSyntheticAdapter({ scenario: 'authError' });
  await assert.rejects(() => adapter.listApplications(), (error) => error.code === 'AUTH_REQUIRED');
});

test('요청 실패 시나리오는 API_REQUEST_FAILED 로 던진다', async () => {
  const adapter = createSyntheticAdapter({ scenario: 'apiError' });
  await assert.rejects(() => adapter.listApplications(), (error) => error.code === 'API_REQUEST_FAILED');
});

test('모르는 오류 코드는 API_REQUEST_FAILED 로 줄인다', async () => {
  const { AdapterError } = await import('../src/adapter/contract.js');
  assert.equal(new AdapterError('SOMETHING_ELSE').code, 'API_REQUEST_FAILED');
});

test('없는 시나리오 이름은 기본값으로 떨어진다', async () => {
  const adapter = createSyntheticAdapter({ scenario: 'does-not-exist' });
  assert.equal(adapter.describe().scenario, 'stage1');
  assert.equal((await adapter.listApplications()).length, 1);
});

test('describe 는 합성임을 밝힌다', () => {
  const info = createSyntheticAdapter().describe();
  assert.equal(info.mode, 'SYNTHETIC');
  assert.match(info.note, /합성/);
});

test('시나리오 키에 신청 없음·느린 응답·오류 둘이 모두 있다', () => {
  for (const key of ['stage1', 'stage5', 'empty', 'slow', 'authError', 'apiError']) {
    assert.ok(SCENARIO_KEYS.includes(key), `${key} 시나리오가 없다`);
  }
});

test('계약을 어긴 fixture 는 화면에 그리기 전에 깨뜨린다', async () => {
  const { SCENARIOS } = await import('../src/fixtures/applications.js');
  const broken = { ...SCENARIOS.default, items: [{ ...SYNTHETIC_APPLICATIONS[0], paymentAllowed: true }] };
  // SCENARIOS 는 freeze 되어 있으므로 어댑터를 직접 만들지 않고 검사 함수로 확인한다
  assert.ok(checkApplicationView(broken.items[0]).length > 0);
});

// ── 상태 문구 ───────────────────────────────────────────────────────────────

test('다섯 상태 모두 사실과 금지 추정 문구를 가진다', () => {
  for (const state of APPLICATION_STATES) {
    const label = STATE_LABELS[state];
    assert.ok(label, `${state} 문구가 없다`);
    assert.ok(label.fact.length > 0, `${state} 사실 문구가 비었다`);
    assert.ok(label.forbidden.length > 0, `${state} 금지 문구가 비었다`);
    assert.ok(label.step >= 1 && label.step <= 5);
  }
});

test('어떤 상태도 환급 가능·지급 완료라고 말하지 않는다', () => {
  for (const state of APPLICATION_STATES) {
    const { title, fact } = STATE_LABELS[state];
    for (const banned of ['환급 가능', '지급 완료', '지급이 끝', '자격 충족', '청구 가능']) {
      assert.ok(!title.includes(banned), `${state} 제목에 '${banned}' 가 있다`);
      assert.ok(!fact.includes(banned), `${state} 사실 문구에 '${banned}' 가 있다`);
    }
  }
});

test('ENROLLED 의 금지 문구가 청구·자격·지급 셋을 모두 짚는다', () => {
  const { forbidden } = STATE_LABELS.ENROLLED;
  for (const word of ['청구', '자격', '지급']) {
    assert.ok(forbidden.includes(word), `ENROLLED 금지 문구에 '${word}' 가 없다`);
  }
});

test('모르는 상태도 임의로 다음 단계로 해석하지 않는다', () => {
  const label = stateLabel('REFUNDABLE');
  assert.equal(label.step, 0);
  assert.match(label.title, /알 수 없는/);
});

test('오류 문구는 둘만 다루고 서버 사유를 추측하지 않는다', () => {
  assert.match(errorText('AUTH_REQUIRED').title, /로그인/);
  assert.equal(errorText('WHATEVER').title, errorText('API_REQUEST_FAILED').title);
  assert.match(errorText('API_REQUEST_FAILED').body, /전달되지 않습니다/);
});

test('합성 안내 문구가 실제가 아님을 밝힌다', () => {
  assert.match(SYNTHETIC_NOTICE.body, /실제/);
  assert.match(SYNTHETIC_NOTICE.body, /연결되어 있지 않습니다/);
});

// ── 개발 서버 ───────────────────────────────────────────────────────────────

test('web/ 밖으로 나가는 경로를 막는다', () => {
  for (const attempt of ['/../package.json', '/../../etc/passwd', '/%2e%2e/package.json']) {
    const resolved = resolveWithin(attempt);
    assert.ok(
      resolved === null || resolved === WEB_ROOT || resolved.startsWith(WEB_ROOT + sep),
      `${attempt} 가 web/ 밖을 가리킨다: ${resolved}`,
    );
  }
});

test('루트 요청은 index.html 로 간다', () => {
  assert.ok(String(resolveWithin('/')).endsWith('index.html'));
});

test('쿼리와 해시를 떼고 경로만 본다', () => {
  assert.equal(resolveWithin('/styles.css?v=1'), resolveWithin('/styles.css'));
  assert.equal(resolveWithin('/styles.css#x'), resolveWithin('/styles.css'));
});

test('--port 검사', () => {
  assert.equal(portFromArgv(['node', 'dev-server.mjs']), 5173);
  assert.equal(portFromArgv(['node', 'dev-server.mjs', '--port', '5050']), 5050);
  for (const bad of ['80', '0', 'abc', '70000']) {
    assert.throws(() => portFromArgv(['node', 'dev-server.mjs', '--port', bad]), /--port/);
  }
});

// ── 누구 차례 ───────────────────────────────────────────────────────────────

test('상태마다 누구 차례인지와 다음에 무엇을 하는지가 있다', async () => {
  const { STATE_LABELS, ACTOR } = await import('../src/ui/state-labels.js');
  const valid = new Set(Object.values(ACTOR).map((a) => a.key));
  for (const state of APPLICATION_STATES) {
    const label = STATE_LABELS[state];
    assert.ok(valid.has(label.actor.key), `${state} actor 가 이상하다`);
    assert.ok(label.next.length > 0, `${state} 다음 안내가 비었다`);
    assert.ok(label.short.length > 0, `${state} 짧은 이름이 비었다`);
  }
});

test('참가자 차례는 DRAFT 하나뿐이다 — 나머지는 학원 차례나 완료', async () => {
  const { STATE_LABELS } = await import('../src/ui/state-labels.js');
  const mine = APPLICATION_STATES.filter((s) => STATE_LABELS[s].actor.key === 'LEARNER');
  assert.deepEqual(mine, ['DRAFT']);
  assert.equal(STATE_LABELS.ENROLLED.actor.key, 'DONE');
});

test('단계 순서가 1..5 로 빠짐없이 이어진다', async () => {
  const { STEP_ORDER, STATE_LABELS, TOTAL_STEPS } = await import('../src/ui/state-labels.js');
  assert.equal(STEP_ORDER.length, TOTAL_STEPS);
  STEP_ORDER.forEach((state, index) => assert.equal(STATE_LABELS[state].step, index + 1));
});

test('조건 밑 한 줄이 충족 여부를 아직 안 보여준다고 말한다', async () => {
  const { PROGRESS_NOT_YET } = await import('../src/ui/state-labels.js');
  assert.match(PROGRESS_NOT_YET, /아직 표시되지 않습니다/);
  for (const banned of ['충족했', '달성했', '환급 가능', '지급 완료']) {
    assert.ok(!PROGRESS_NOT_YET.includes(banned), `'${banned}' 를 말하고 있다`);
  }
});

test('ENROLLED 의 다음 안내가 환급을 약속하지 않는다', async () => {
  const { STATE_LABELS } = await import('../src/ui/state-labels.js');
  const next = STATE_LABELS.ENROLLED.next;
  assert.match(next, /수업|응시/);
  for (const banned of ['환급됩니다', '지급됩니다', '받으실 수 있습니다']) {
    assert.ok(!next.includes(banned), `'${banned}' 가 있다`);
  }
});
