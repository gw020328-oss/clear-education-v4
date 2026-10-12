// 합성 어댑터와 상태 문구 시험

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSyntheticAdapter, SCENARIO_KEYS } from '../src/adapter/synthetic.js';
import { SYNTHETIC_APPLICATIONS } from '../src/fixtures/applications.js';
import { checkApplicationView, APPLICATION_STATES } from '../src/adapter/contract.js';
import { STATE_LABELS, stateLabel, errorText, SYNTHETIC_NOTICE } from '../src/ui/state-labels.js';
import { resolveWithin, portFromArgv, WEB_ROOT } from '../tools/dev-server.mjs';
import { sep } from 'node:path';

// ── 어댑터 ──────────────────────────────────────────────────────────────────

test('기본 시나리오는 다섯 건을 돌려주고 모두 계약을 지킨다', async () => {
  const adapter = createSyntheticAdapter({ scenario: 'default' });
  const items = await adapter.listApplications();
  assert.equal(items.length, 5);
  for (const view of items) assert.deepEqual(checkApplicationView(view), []);
});

test('빈 목록 시나리오는 빈 배열을 돌려준다', async () => {
  const items = await createSyntheticAdapter({ scenario: 'empty' }).listApplications();
  assert.deepEqual(items, []);
});

test('목록은 복사본이라 호출자가 fixture 를 바꿀 수 없다', async () => {
  const adapter = createSyntheticAdapter();
  const first = await adapter.listApplications();
  first[0].state = 'ENROLLED';
  const second = await adapter.listApplications();
  assert.equal(second[0].state, 'DRAFT');
  assert.equal(SYNTHETIC_APPLICATIONS[0].state, 'DRAFT');
});

test('상세는 id 로 찾는다', async () => {
  const adapter = createSyntheticAdapter();
  const target = SYNTHETIC_APPLICATIONS[2];
  const view = await adapter.getApplication(target.applicationId);
  assert.equal(view.applicationId, target.applicationId);
  assert.equal(view.state, target.state);
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
  assert.equal(adapter.describe().scenario, 'default');
  assert.equal((await adapter.listApplications()).length, 5);
});

test('describe 는 합성임을 밝힌다', () => {
  const info = createSyntheticAdapter().describe();
  assert.equal(info.mode, 'SYNTHETIC');
  assert.match(info.note, /합성/);
});

test('시나리오 키에 신청 없음·느린 응답·오류 둘이 모두 있다', () => {
  for (const key of ['default', 'empty', 'slow', 'authError', 'apiError']) {
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
