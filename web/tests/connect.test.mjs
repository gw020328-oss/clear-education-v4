// 연결 계층 시험 — 백엔드 없이 동작을 고정한다
//
// 여기서 막으려는 것 셋.
//
//   1. 화면을 열었다고 지갑 창이 뜨는 것 (probe 는 지갑을 건드리지 않는다)
//   2. 서버 모듈 이름을 짐작해서 엉뚱한 함수를 부르는 것
//   3. 서버가 없을 때 '연결됨' 으로 보이는 것

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createConnection, probeHost, loadApi } from '../src/bootcamp/connect.js';

const ORIGIN = 'https://127.0.0.1:8443';
const ACTIVE = { phase: 'ACTIVE_LOCAL_TEST', origin: ORIGIN, chainId: 31337 };

const jsonRes = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});

test('서버가 없으면 OFFLINE 이고 지갑을 건드리지 않는다', async () => {
  let touched = false;
  const provider = { request: () => { touched = true; } };
  const conn = createConnection({
    origin: ORIGIN,
    provider,
    fetchImpl: async () => new Response('not found', { status: 404 }),
  });

  const after = await conn.probe();
  assert.equal(after.state, 'OFFLINE');
  assert.equal(after.api, null);
  assert.equal(after.sign, null);
  assert.equal(touched, false, 'probe 가 지갑을 불렀다');
});

test('phase 가 준비 전이면 로그인 버튼을 주지 않는다', async () => {
  const conn = createConnection({
    origin: ORIGIN,
    provider: { request: async () => { throw new Error('불러선 안 된다'); } },
    fetchImpl: async () => jsonRes({ phase: 'PREPARED_NOT_ACTIVATED', origin: ORIGIN, chainId: null }),
  });
  const after = await conn.probe();
  assert.equal(after.state, 'NOT_ACTIVE');

  // 이 상태에서 signIn 을 불러도 아무 일이 없어야 한다
  const same = await conn.signIn();
  assert.equal(same.state, 'NOT_ACTIVE');
  assert.equal(same.api, null);
});

test('켜져 있으면 SIGNED_OUT 이다 — 로그인은 아직 안 한다', async () => {
  const conn = createConnection({
    origin: ORIGIN,
    provider: { request: async () => { throw new Error('불러선 안 된다'); } },
    fetchImpl: async () => jsonRes(ACTIVE),
  });
  const after = await conn.probe();
  assert.equal(after.state, 'SIGNED_OUT');
  assert.equal(after.api, null);
});

test('서버 모듈 이름이 다르면 짐작하지 않고 받은 이름을 알려준다', async () => {
  const session = { request: async () => ({}) };
  await assert.rejects(
    () => loadApi(session, { origin: ORIGIN, importImpl: async () => ({ makeThing: () => ({}) }) }),
    (error) => {
      assert.equal(error.code, 'BC_CLIENT_SHAPE');
      assert.match(error.detail, /makeThing/);
      return true;
    },
  );
});

test('메서드가 빠지면 붙이지 않고 무엇이 없는지 말한다', async () => {
  const session = { request: async () => ({}) };
  const partial = { view: () => {}, consent: () => {} };
  await assert.rejects(
    () => loadApi(session, {
      origin: ORIGIN,
      importImpl: async () => ({ createNormalClient: () => partial }),
    }),
    (error) => {
      assert.equal(error.code, 'BC_CLIENT_SHAPE');
      assert.match(error.detail, /paymentReceipt/);
      return true;
    },
  );
});

test('probeHost 는 서버가 이상해도 던지지 않는다', async () => {
  const bad = await probeHost({ origin: ORIGIN, fetchImpl: async () => jsonRes({ nope: 1 }) });
  assert.equal(bad, null);
  const thrown = await probeHost({ origin: ORIGIN, fetchImpl: async () => { throw new Error('x'); } });
  assert.equal(thrown, null);
});

// ── 역할마다 쓰는 지갑이 정해져 있다 ───────────────────────────────────
//
// 2026-10-29 결정. 학생은 내장 지갑만, 운영자는 브라우저 확장.
// 학생에게 길이 둘이면 **수령 계정이 어느 주소로 등록되는지가 흔들린다.**

test('학생은 지갑 확장이 있어도 내장 지갑만 쓴다', async () => {
  const { pickProvider } = await import('../src/bootcamp/connect.js');
  const saved = globalThis.window;
  try {
    const ext = { request: () => {} };
    const emb = { request: () => {} };

    // 확장만 있을 때 — 학생은 못 간다, 운영자는 간다
    globalThis.window = { ethereum: ext };
    assert.equal(pickProvider('participant').kind, 'NONE', '학생이 확장으로 떨어졌다');
    assert.equal(pickProvider('participant').provider, null);
    assert.equal(pickProvider('operator').kind, 'BROWSER');

    // 둘 다 있을 때 — 각자 자기 것
    globalThis.window = { ethereum: ext, clearWallet: emb };
    assert.equal(pickProvider('participant').provider, emb, '학생이 확장을 집었다');
    assert.equal(pickProvider('operator').provider, ext, '운영자가 내장을 집었다');

    // 내장만 있을 때 — 운영자는 못 간다
    globalThis.window = { clearWallet: emb };
    assert.equal(pickProvider('participant').kind, 'EMBEDDED');
    assert.equal(pickProvider('operator').kind, 'NONE', '운영자가 내장으로 떨어졌다');
  } finally {
    if (saved === undefined) delete globalThis.window; else globalThis.window = saved;
  }
});

test('역할을 바꾸면 진짜 지갑 세션만 끊는다', async () => {
  const { createConnection } = await import('../src/bootcamp/connect.js');
  const saved = globalThis.window;
  try {
    globalThis.window = { ethereum: { request: () => {} } };
    const conn = createConnection({ origin: 'https://x.test', role: 'participant' });

    // 시연 계정은 역할을 바꿔도 남는다. 발표에서 두 화면을 수없이 오간다.
    await conn.demoSignIn('embedded');
    assert.equal(conn.current.demo, true);
    conn.setRole('operator');
    assert.equal(conn.current.demo, true, '시연 계정이 역할 전환으로 끊겼다');

    // 역할마다 보는 지갑 종류가 다르다
    assert.equal(conn.current.walletKind, 'BROWSER');
    conn.setRole('participant');
    assert.equal(conn.current.walletKind, 'NONE', '학생인데 확장을 집었다');

    // 같은 역할로 다시 부르면 아무 일도 없다
    const a = conn.current;
    conn.setRole('participant');
    assert.equal(conn.current.walletKind, a.walletKind);
  } finally {
    if (saved === undefined) delete globalThis.window; else globalThis.window = saved;
  }
});

test('학생의 시험용 지갑은 눌러야만 켜진다', async () => {
  const { pickProvider, createConnection } = await import('../src/bootcamp/connect.js');
  const saved = globalThis.window;
  try {
    const ext = { request: () => {} };
    globalThis.window = { ethereum: ext };

    // 기본은 그대로 막혀 있다. 제품 경로는 내장 지갑뿐이다.
    assert.equal(pickProvider('participant').kind, 'NONE');
    // 켜면 종류가 TEST_BROWSER 다 — 화면이 "시험용" 이라고 적을 수 있게.
    assert.equal(pickProvider('participant', { test: true }).kind, 'TEST_BROWSER');
    // 운영자에겐 해당 없다. 거기는 원래 브라우저 지갑이다.
    assert.equal(pickProvider('operator', { test: true }).kind, 'BROWSER');

    const conn = createConnection({ origin: 'https://x.test', role: 'participant' });
    assert.equal(conn.current.canTestWallet, true, '확장이 있는데 선택지를 안 준다');
    conn.useTestWallet();
    assert.equal(conn.current.walletKind, 'TEST_BROWSER');
    assert.equal(conn.current.canTestWallet, false, '이미 켰는데 또 권한다');

    // 역할을 바꾸면 꺼진다. 운영자 화면에 시험용 상태를 들고 가지 않는다.
    conn.setRole('operator');
    conn.setRole('participant');
    assert.equal(conn.current.walletKind, 'NONE');

    // 확장이 없으면 선택지 자체가 없다
    globalThis.window = {};
    const bare = createConnection({ origin: 'https://x.test', role: 'participant' });
    assert.equal(bare.current.canTestWallet, false);
    assert.equal(bare.useTestWallet().walletKind, 'NONE');
  } finally {
    if (saved === undefined) delete globalThis.window; else globalThis.window = saved;
  }
});
