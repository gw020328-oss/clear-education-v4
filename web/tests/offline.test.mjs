// 오프라인 검사 — 실서버 없이 "활성화 이후" 경로를 합성 응답으로 돌린다
//
// 왜 이 파일이 따로 있는가.
//
// 다른 시험들은 **잘 되는 길**을 지킨다. 화면이 끝까지 그려지는지, 상태가
// 규칙대로 옮겨 가는지. 그런데 실서버를 붙이면 잘 되는 길보다 **어긋나는 길**이
// 먼저 온다 — 서버가 아직 안 켜졌고, 지갑이 중간에 바뀌고, 조회가 끊기고,
// 판정이 보내는 사이에 바뀐다. 그 길들은 백엔드가 켜지기 전에도 합성 응답으로
// 전부 돌려 볼 수 있다.
//
// 여기서 보는 것 여섯. 백엔드가 요청한 목록 그대로다.
//
//   1  준비 상태        phase 가 ACTIVE_LOCAL_TEST 가 아닐 때 막는가
//   2  인증 취소·만료   문구 만료 · 지갑 거절 · 서명 중 계정 변경 · 세션 폐기
//   3  조회 실패        비 JSON · 5xx · 상한 초과 · 중단 · 시간 초과
//   4  오래된 판정      보내는 사이에 판정이 바뀌면 보내지 않는다
//   5  조회와 클릭 충돌  두 번 보내지 않는다 · 결과를 모르면 조회만 한다
//   6  영수증 null/성공  없는 값을 0으로 채우지 않는다
//
// **이 파일의 모든 응답은 합성이다.** 실제 API 에 닿은 것이 하나도 없다.
// 실서버 확인과 섞어 보고하지 않는다.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createBootcampTransport, BOOTCAMP_CODES } from '../src/bootcamp/transport.js';
import { createWalletSession } from '../src/bootcamp/wallet-session.js';
import {
  consentPanel, paymentPanel, sourceSignaturePanel, errorText,
} from '../src/bootcamp/panels.js';
import { studentSection } from '../src/bootcamp/student-view.js';
import { operatorSection } from '../src/bootcamp/operator-view.js';
import { bootcampView } from '../src/fixtures/bootcamp.js';

const ORIGIN = 'https://127.0.0.1:8443';
const ACTIVE = Object.freeze({ phase: 'ACTIVE_LOCAL_TEST', origin: ORIGIN, chainId: 31337 });
const PREPARED = Object.freeze({ phase: 'PREPARED_NOT_ACTIVATED', origin: ORIGIN, chainId: null });

const WALLET = '0x' + 'a1'.repeat(20);
const OTHER = '0x' + 'b2'.repeat(20);
const CSRF = 'a'.repeat(64);
const SIG = '0x' + 'cd'.repeat(65);

const jsonRes = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});

/** transport 가 던지는 것과 같은 모양 */
const bootcampLike = (code, outcome = 'HTTP_ERROR') =>
  Object.assign(new Error(code), { name: 'BootcampError', code, outcome, status: null });

/** 화면에 영어 코드가 그대로 나왔는가 */
const CODE_SHAPED = /\b(?:BC|NORMAL|AUTH|BOOTCAMP)_[A-Z0-9_]{3,}\b/;

// ── 최소 DOM ────────────────────────────────────────────────────────────
//
// render.test.mjs 의 흉내에 **클릭**을 더했다. 5번(조회와 클릭 충돌)은
// 버튼을 실제로 눌러 보지 않으면 확인할 수 없다.

function installDom() {
  class Node {
    constructor(tag) {
      this.tagName = String(tag).toUpperCase();
      this.children = [];
      this.attributes = {};
      this.className = '';
      this.handlers = {};
      this._text = '';
    }

    get firstChild() { return this.children[0] ?? null; }

    set textContent(value) { this._text = String(value); this.children = []; }

    get textContent() {
      return this._text + this.children.map((c) => c.textContent ?? '').join('');
    }

    setAttribute(name, value) { this.attributes[name] = String(value); }

    addEventListener(type, fn) { (this.handlers[type] ??= []).push(fn); }

    append(...nodes) { for (const n of nodes) this.children.push(n); }

    removeChild(node) { this.children = this.children.filter((c) => c !== node); }
  }

  globalThis.document = {
    createElement: (tag) => new Node(tag),
    createElementNS: (_ns, tag) => new Node(tag),
    createTextNode: (text) => ({ textContent: String(text), children: [] }),
  };
  globalThis.crypto ??= { getRandomValues: (a) => a.fill(7) };
  return () => { delete globalThis.document; };
}

function* walk(node) {
  yield node;
  for (const child of node.children ?? []) yield* walk(child);
}

const buttons = (root) => [...walk(root)].filter((n) => n.tagName === 'BUTTON');
const button = (root, label) => buttons(root).find((b) => b.textContent.includes(label)) ?? null;

/**
 * 클릭 한 번. 기다리지 않으므로 보내는 중인 모습을 볼 수 있다.
 *
 * **disabled 면 핸들러를 부르지 않는다** — 브라우저가 그렇게 한다. 여기서
 * 그냥 불러 버리면 "잠긴 버튼" 시험이 통과할 수 없는 시험이 된다.
 */
const press = (node) => {
  assert.ok(node, '누를 버튼이 없다');
  if (node.attributes?.disabled) return false;
  for (const fn of node.handlers?.click ?? []) fn({ preventDefault() {} });
  return true;
};

/** 비동기 핸들러가 끝날 때까지 */
const settle = async () => {
  for (let i = 0; i < 30; i += 1) await new Promise((r) => setTimeout(r, 0));
};

const pressAndWait = async (node) => { press(node); await settle(); };

// ── 합성 서버·지갑 ─────────────────────────────────────────────────────

function walletHarness({
  accounts = () => [WALLET], chain = () => '0x7a69', nonce = {},
  onSign = () => {}, signError = null, verify = null,
} = {}) {
  const calls = [];
  const posts = [];
  const handlers = {};
  const provider = {
    on: (name, fn) => { handlers[name] = fn; },
    request: async ({ method }) => {
      calls.push(method);
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return accounts();
      if (method === 'eth_chainId') return chain();
      if (method === 'wallet_addEthereumChain') return null;
      if (method === 'personal_sign') {
        if (signError) throw signError;
        onSign();
        return SIG;
      }
      throw new Error('시험이 모르는 rpc: ' + method);
    },
  };
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname;
    posts.push(path);
    if (path === '/auth/nonce') {
      return jsonRes({
        nonce: 'nonce-1',
        message: 'CLEAR 로그인 확인',
        expiresAt: Math.floor(Date.now() / 1000) + 300,
        ...nonce,
      });
    }
    if (path === '/auth/verify') return jsonRes(verify ?? { wallet: WALLET, csrf: CSRF });
    if (path === '/auth/logout') return jsonRes({ revoked: true });
    return jsonRes({});
  };
  const session = createWalletSession({ origin: ORIGIN, provider, fetchImpl });
  return { session, provider, calls, posts, handlers };
}

/** paid 판정의 payment 만 바꿔 끼운다. decimals 는 6 이다 */
function paidView(payment) {
  const base = bootcampView('paid', 'participant');
  return { ...base, payment: { ...base.payment, receiptHttpAvailable: true, ...payment } };
}

/** 보내기 직전 재조회가 무엇을 돌려주는지로 갈린다 */
function consentHarness(fresh, { consent, operation } = {}) {
  const view = bootcampView('inProgress', 'participant');
  const sent = [];
  const box = consentPanel({
    view,
    api: {
      view: async () => fresh(view),
      consent: async (app, target, action, options) => {
        sent.push({ app, action, key: options?.idempotencyKey });
        if (consent) return consent();
        return { recorded: true };
      },
      operation: async (app, key) => {
        sent.push({ app, action: 'OPERATION', key });
        if (operation) return operation();
        return { status: 'RECORDED' };
      },
    },
  });
  return { box, sent, view };
}

// ── 1 · 준비 상태 ───────────────────────────────────────────────────────

test('준비 상태에서는 로그인·네트워크 추가가 지갑을 건드리지 않는다', async () => {
  const h = walletHarness();
  await assert.rejects(() => h.session.signIn(PREPARED), (e) => e.code === 'BC_HOST_NOT_ACTIVE');
  await assert.rejects(() => h.session.addNetwork(PREPARED), (e) => e.code === 'BC_HOST_NOT_ACTIVE');
  assert.deepEqual(h.calls, [], '준비 중인데 지갑을 불렀다');
  assert.deepEqual(h.posts, [], '준비 중인데 서버에 보냈다');
  assert.equal(h.session.signedIn, false);
});

test('서버가 보낸 준비 중·절차 미준비 코드를 뭉개지 않는다', async () => {
  for (const code of ['NORMAL_HOST_NOT_ACTIVATED', 'BC_NORMAL_PROCEDURE_NOT_READY']) {
    const request = createBootcampTransport({
      origin: ORIGIN, fetchImpl: async () => jsonRes({ error: code }, 409),
    });
    await assert.rejects(() => request('/bootcamp/v4/session'), (e) => {
      assert.equal(e.code, code);
      assert.equal(e.outcome, 'HTTP_ERROR');
      return true;
    });
  }
});

test('준비 상태 화면은 두 역할 다 쓰기 버튼을 그리지 않는다', async () => {
  const restore = installDom();
  try {
    const WRITE = ['바로 받기', '서명 문구 받기', '지갑으로 서명하기', '수령 결과 확인', '결과 확인'];
    for (const [role, make] of [['participant', studentSection], ['operator', operatorSection]]) {
      const node = make({
        view: bootcampView('inProgress', role),
        phase: 'PREPARED_NOT_ACTIVATED',
        // api 가 있어도 phase 가 막는다. 이게 이 시험의 핵심이다.
        api: {}, sign: () => SIG,
        // 실제로는 연결 객체가 항상 온다. 준비 중인 서버는 NOT_ACTIVE 다.
        conn: { state: 'NOT_ACTIVE', busy: false },
      });
      const text = node.textContent;
      assert.ok(text.includes('서버가 아직 켜지지 않았'), role + ': 막힌 이유를 적지 않았다');
      for (const label of WRITE) {
        assert.equal(button(node, label), null, role + ': 준비 중인데 「' + label + '」 가 있다');
      }
    }
  } finally { restore(); }
});

// ── 2 · 인증 취소·만료 ─────────────────────────────────────────────────

test('만료된 로그인 문구에는 서명하지 않는다', async () => {
  let signed = false;
  const h = walletHarness({
    nonce: { expiresAt: Math.floor(Date.now() / 1000) - 1 },
    onSign: () => { signed = true; },
  });
  await assert.rejects(() => h.session.signIn(ACTIVE), (e) => e.code === 'BC_AUTH_CHALLENGE');
  assert.equal(signed, false, '만료된 문구에 서명했다');
  assert.equal(h.session.signedIn, false);
});

test('지갑에서 거절하면 실패가 아니라 거절로 구분한다', async () => {
  const h = walletHarness({ signError: Object.assign(new Error('User rejected'), { code: 4001 }) });
  await assert.rejects(() => h.session.signIn(ACTIVE), (e) => e.code === 'BC_WALLET_REJECTED');
  const h2 = walletHarness({ signError: new Error('지갑 내부 오류') });
  await assert.rejects(() => h2.session.signIn(ACTIVE), (e) => e.code === 'BC_WALLET_FAILED');
});

test('서명 창이 떠 있는 사이에 계정이 바뀌면 그 서명을 쓰지 않는다', async () => {
  let current = [WALLET];
  const h = walletHarness({
    accounts: () => current,
    // 사용자가 서명 창을 띄워 둔 채 지갑에서 계정을 갈아탄 경우다.
    onSign: () => { current = [OTHER]; },
  });
  await assert.rejects(() => h.session.signIn(ACTIVE), (e) => e.code === 'BC_WALLET_CONTEXT_CHANGED');
  assert.equal(h.session.signedIn, false);
  assert.equal(h.session.wallet, null, '다른 사람 주소가 남았다');
  assert.equal(h.posts.includes('/auth/verify'), false, '바뀐 뒤에도 서명을 보냈다');
});

test('로그인 뒤 계정·체인·연결이 바뀌면 세션을 서버 쪽까지 폐기한다', async () => {
  for (const [event, payload] of [
    ['accountsChanged', [OTHER]],
    ['chainChanged', '0x1'],
    ['disconnect', undefined],
  ]) {
    const h = walletHarness();
    await h.session.signIn(ACTIVE);
    assert.equal(h.session.signedIn, true, event + ': 로그인이 안 됐다');

    h.handlers[event](payload);
    await settle();

    assert.equal(h.session.signedIn, false, event + ': 세션이 남았다');
    assert.ok(h.posts.includes('/auth/logout'), event + ': 서버 세션을 회수하지 않았다');
    await assert.rejects(() => h.session.signMessage('문구'), (e) => e.code === 'AUTH_REQUIRED');
  }
});

test('같은 계정의 accountsChanged 는 세션을 끊지 않는다', async () => {
  // 지갑이 같은 주소로 이벤트를 다시 쏘는 경우가 있다. 그때마다 끊으면
  // 사용자는 이유 없이 로그아웃된다.
  const h = walletHarness();
  await h.session.signIn(ACTIVE);
  // EIP-55 체크섬 주소는 hex 쪽 대소문자가 섞인다. '0x' 접두사는 그대로다.
  h.handlers.accountsChanged(['0x' + WALLET.slice(2).toUpperCase()]);
  await settle();
  assert.equal(h.session.signedIn, true);
});

test('서버가 세션을 반쪽만 주면 쓰지 않는다', async () => {
  const h = walletHarness({ verify: { wallet: WALLET, csrf: 'too-short' } });
  await assert.rejects(() => h.session.signIn(ACTIVE), (e) => e.code === 'BC_AUTH_SESSION');
  assert.equal(h.session.signedIn, false);
});

test('취소·만료 코드가 화면에 사람 말로 나온다', async () => {
  const restore = installDom();
  try {
    const cases = [
      ['BC_UI_SIGNATURE_EXPIRED', '시간이 지났'],
      ['BC_UI_SIGNATURE_CANCELLED', '취소'],
      ['BC_UI_SIGNATURE_NOT_PENDING', '기다리는'],
      ['BC_UI_SIGNATURE_REQUEST_USED', '이미 사용'],
      ['BC_WALLET_REJECTED', '거절'],
      ['BC_WALLET_CONTEXT_CHANGED', '바뀌었습니다'],
    ];
    for (const [code, part] of cases) {
      const box = sourceSignaturePanel({
        view: bootcampView('inProgress', 'participant'),
        sign: async () => SIG,
        api: {
          bindSourceSession: async () => ({}),
          pendingSourceSignature: async () => { throw bootcampLike(code); },
          submitSourceSignature: async () => ({}),
        },
      });
      await pressAndWait(button(box, '서명 문구 받기'));
      const text = box.textContent;
      assert.ok(text.includes(part), code + ': 「' + part + '」 가 없다 — ' + text);
      assert.ok(!text.includes(code), code + ': 코드가 그대로 나왔다');
    }
  } finally { restore(); }
});

test('화면이 뜻을 아는 코드에는 빠짐없이 사람 말이 있다', () => {
  // errorText 는 표에 없는 코드를 **그대로** 내보낸다. 그래서 코드가 하나
  // 늘어날 때마다 영어가 새는 길이 하나 생긴다. 기계로 막는다.
  // 2026-10-29 에 이 검사를 처음 돌렸을 때 28개가 비어 있었다.
  const thrownHere = [
    'BC_TRANSPORT_ORIGIN', 'BC_TRANSPORT_CONFIG', 'BC_TRANSPORT_ROUTE',
    'BC_TRANSPORT_RESPONSE', 'BC_TRANSPORT_HTTP', 'BC_TRANSPORT_CANCELLED',
    'BC_TRANSPORT_TIMEOUT', 'BC_TRANSPORT_FAILED',
    'BC_WALLET_MISSING', 'BC_WALLET_REJECTED', 'BC_WALLET_FAILED',
    'BC_WALLET_CONTEXT_CHANGED', 'BC_HOST_NOT_ACTIVE', 'BC_HOST_CONFIG',
    'BC_AUTH_CHALLENGE', 'BC_AUTH_SESSION', 'BC_SESSION_ALREADY', 'BC_SIGN_MESSAGE',
  ];
  const missing = [...BOOTCAMP_CODES, ...thrownHere].filter((code) => errorText(code) === code);
  assert.deepEqual(missing, [], '사람 말이 없는 코드');
});

// ── 3 · 조회 실패 ───────────────────────────────────────────────────────

test('JSON 이 아닌 응답은 성공으로 읽지 않는다', async () => {
  for (const [label, res] of [
    ['404 본문 없음', () => new Response('not found', { status: 404 })],
    ['200 HTML', () => new Response('<html>로그인</html>', { status: 200, headers: { 'content-type': 'text/html' } })],
    ['200 본문 없음', () => new Response('', { status: 200 })],
  ]) {
    const request = createBootcampTransport({ origin: ORIGIN, fetchImpl: async () => res() });
    await assert.rejects(() => request('/bootcamp/v4/session'), (e) => {
      assert.equal(e.code, 'BC_TRANSPORT_RESPONSE', label);
      return true;
    });
  }
});

test('5xx 쓰기는 처리됐는지 모른다고 적는다 — 자동 재시도 금지', async () => {
  const request = createBootcampTransport({
    origin: ORIGIN, fetchImpl: async () => jsonRes({ error: 'nope' }, 503),
  });
  await assert.rejects(
    () => request('/bootcamp/v4/session', { method: 'POST', body: {} }),
    (e) => {
      assert.equal(e.outcome, 'UNKNOWN', '쓰기 5xx 를 실패로 단정했다');
      return true;
    },
  );
  // 조회는 다르다. 안 됐으면 그냥 다시 읽으면 된다.
  await assert.rejects(() => request('/bootcamp/v4/session'), (e) => e.outcome === 'HTTP_ERROR');
});

test('모르는 서버 코드를 그대로 흘리지 않는다', async () => {
  const request = createBootcampTransport({
    origin: ORIGIN,
    fetchImpl: async () => jsonRes({ error: 'INTERNAL_DB_PASSWORD_WRONG' }, 400),
  });
  await assert.rejects(() => request('/bootcamp/v4/session'), (e) => {
    assert.equal(e.code, 'BC_TRANSPORT_HTTP');
    assert.ok(!String(e.message).includes('PASSWORD'), '서버 문자열이 새 나갔다');
    return true;
  });
});

test('큰 본문은 상한에서 읽기를 멈춘다', async () => {
  const big = JSON.stringify({ pad: 'x'.repeat(600 * 1024) });
  const request = createBootcampTransport({
    origin: ORIGIN,
    fetchImpl: async () => new Response(big, { status: 200, headers: { 'content-type': 'application/json' } }),
  });
  await assert.rejects(() => request('/bootcamp/v4/session'), (e) => e.code === 'BC_TRANSPORT_RESPONSE');
});

test('중단과 시간 초과를 구분한다', async () => {
  const hang = createBootcampTransport({
    origin: ORIGIN,
    timeoutMs: 20,
    fetchImpl: (url, init) => new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('abort')));
    }),
  });
  await assert.rejects(() => hang('/bootcamp/v4/session'), (e) => {
    assert.equal(e.code, 'BC_TRANSPORT_TIMEOUT');
    return true;
  });

  const ac = new AbortController();
  const cancelled = hang('/bootcamp/v4/session', { signal: ac.signal });
  ac.abort();
  await assert.rejects(() => cancelled, (e) => e.code === 'BC_TRANSPORT_CANCELLED');
});

test('조회가 실패해도 화면이 없는 값을 0으로 채우지 않는다', async () => {
  const restore = installDom();
  try {
    const box = paymentPanel({
      view: paidView({ receivedAtoms: null, claimState: null, canonicalTransferVerified: null }),
      api: { paymentReceipt: async () => { throw bootcampLike('BC_TRANSPORT_FAILED'); } },
    });
    await pressAndWait(button(box, '수령 결과 확인'));
    const text = box.textContent;
    assert.ok(text.includes('연결하지 못했'), '실패를 적지 않았다 — ' + text);
    assert.ok(!/\b0 TEST/.test(text), '못 받은 값을 0으로 적었다');
    assert.ok(!CODE_SHAPED.test(text), '코드가 그대로 나왔다 — ' + text);
  } finally { restore(); }
});

// ── 4 · 오래된 판정 ────────────────────────────────────────────────────

test('보내는 사이에 판정이 바뀌면 동의를 보내지 않는다', async () => {
  const restore = installDom();
  try {
    const changes = [
      ['판정 id 가 바뀜', (v) => ({ ...v, target: { ...v.target, targetDecisionId: 'decision-new' } })],
      ['개정 번호만 바뀜', (v) => ({ ...v, target: { ...v.target, targetDecisionRevision: v.target.targetDecisionRevision + 1 } })],
    ];
    for (const [label, fresh] of changes) {
      const h = consentHarness(fresh);
      await pressAndWait(button(h.box, '바로 받기'));
      assert.deepEqual(h.sent, [], label + ': 바뀐 판정에 동의를 보냈다');
      assert.ok(h.box.textContent.includes('보내지 않았습니다'), label + ': 안 보냈다고 적지 않았다');
    }

    // 대조군 — 그대로면 보낸다. 위 둘이 '아무것도 안 하는 버튼' 이라서 통과한
    // 것이 아님을 여기서 확인한다.
    const same = consentHarness((v) => v);
    await pressAndWait(button(same.box, '바로 받기'));
    assert.equal(same.sent.length, 1, '판정이 그대로인데 보내지 않았다');
    assert.equal(same.sent[0].action, 'AGREE');
    assert.ok(same.box.textContent.includes('확인했습니다'));
  } finally { restore(); }
});

test('서버가 오래된 판정이라고 답하면 다시 불러오라고 적는다', async () => {
  const restore = installDom();
  try {
    for (const code of ['BC_VIEW_STALE', 'BC_DECISION_TARGET']) {
      const h = consentHarness((v) => v, { consent: () => { throw bootcampLike(code); } });
      await pressAndWait(button(h.box, '바로 받기'));
      const text = h.box.textContent;
      assert.ok(text.includes('다시 불러'), code + ': 할 일을 적지 않았다 — ' + text);
      assert.ok(!text.includes(code), code + ': 코드가 그대로 나왔다');
    }
  } finally { restore(); }
});

test('기록이 있어도 지금 판정 기준이 아니면 양쪽 확인이라고 적지 않는다', () => {
  const restore = installDom();
  try {
    // unresolved 는 기록 1건 · bothCurrent false 다.
    const box = consentPanel({ view: bootcampView('unresolved', 'participant') });
    assert.ok(box.textContent.includes('아직 양쪽 확인이 아닙니다'));
  } finally { restore(); }
});

// ── 5 · 조회와 클릭 충돌 ───────────────────────────────────────────────

test('보내는 중에는 버튼이 잠긴다', async () => {
  const restore = installDom();
  try {
    let release = null;
    const h = consentHarness((v) => v, {
      consent: () => new Promise((r) => { release = () => r({ recorded: true }); }),
    });
    assert.equal(press(button(h.box, '바로 받기')), true);
    await new Promise((r) => setTimeout(r, 0));

    const locked = button(h.box, '바로 받기');
    assert.ok(locked, '보내는 중에 버튼이 사라졌다');
    assert.equal(locked.attributes.disabled, 'disabled', '보내는 중에 또 누를 수 있다');
    assert.equal(press(locked), false, '잠긴 버튼이 눌렸다');

    release();
    await settle();
    assert.equal(h.sent.length, 1, '동의를 두 번 보냈다');
  } finally { restore(); }
});

test('결과를 모르면 다시 보내지 않고 같은 번호로 조회한다', async () => {
  const restore = installDom();
  try {
    const h = consentHarness((v) => v, {
      consent: () => { throw bootcampLike('BC_TRANSPORT_FAILED', 'UNKNOWN'); },
    });
    await pressAndWait(button(h.box, '바로 받기'));

    const text = h.box.textContent;
    assert.ok(text.includes('닿았는지 알 수 없습니다'), 'UNKNOWN 을 실패로 적었다 — ' + text);
    assert.equal(button(h.box, '바로 받기'), null, 'UNKNOWN 인데 다시 보내기를 권한다');

    const again = button(h.box, '결과 확인');
    assert.ok(again, '결과 확인 버튼이 없다');
    await pressAndWait(again);

    assert.equal(h.sent.length, 2);
    assert.equal(h.sent[1].action, 'OPERATION', '결과를 모르는데 또 보냈다');
    assert.equal(h.sent[1].key, h.sent[0].key, '같은 요청 번호로 조회하지 않았다');
    assert.ok(h.box.textContent.includes('처리된 것을 확인했습니다'));
  } finally { restore(); }
});

test('이미 확인한 역할에는 버튼을 그리지 않는다', () => {
  const restore = installDom();
  try {
    // paid 는 두 역할 기록이 다 있다.
    for (const role of ['participant', 'operator']) {
      const box = consentPanel({ view: bootcampView('paid', role), api: {} });
      assert.equal(button(box, '바로 받기'), null, role + ': 또 확인하라고 한다');
    }
  } finally { restore(); }
});

// ── 6 · 영수증 null / 성공 ─────────────────────────────────────────────

test('조회 경로가 없으면 버튼 대신 없다고 적는다', () => {
  const restore = installDom();
  try {
    const box = paymentPanel({
      view: paidView({ receiptHttpAvailable: false }),
      api: { paymentReceipt: async () => { throw new Error('불러선 안 된다'); } },
    });
    assert.equal(button(box, '수령 결과 확인'), null);
    assert.ok(box.textContent.includes('조회가 이 서버에 아직 없습니다'));
  } finally { restore(); }
});

test('영수증이 null 을 주면 없음으로 적고 0 으로 적지 않는다', async () => {
  const restore = installDom();
  try {
    const box = paymentPanel({
      view: paidView({ receivedAtoms: null, canonicalTransferVerified: null, claimState: null }),
      api: { paymentReceipt: async () => ({ claim: null, balance: null }) },
    });
    await pressAndWait(button(box, '수령 결과 확인'));
    const text = box.textContent;
    assert.ok(!/\b0 TEST/.test(text), '못 받은 값을 0 으로 적었다 — ' + text);
    assert.ok(text.includes('아직 못 받은 값'), '없는 값을 없다고 적지 않았다');
  } finally { restore(); }
});

test('블록에 들어간 것과 최종 확정을 구분한다', async () => {
  const restore = installDom();
  try {
    const run = async (state) => {
      const box = paymentPanel({
        view: paidView({ claimState: state }),
        api: {
          paymentReceipt: async () => ({
            claim: { state },
            balance: { receivedAtoms: '100000000', exactExpectedAmountVerified: true },
          }),
        },
      });
      await pressAndWait(button(box, '수령 결과 확인'));
      return box.textContent;
    };

    const included = await run('INCLUDED');
    assert.ok(included.includes('블록에 들어갔'), 'INCLUDED 를 사람 말로 적지 않았다');
    assert.ok(included.includes('최종 확정은 아닙니다'), 'INCLUDED 를 확정으로 보이게 뒀다');

    const finalized = await run('FINALIZED');
    assert.ok(finalized.includes('최종 확정됨'));
    assert.ok(!finalized.includes('최종 확정은 아닙니다'), '확정인데 아니라고 적었다');
    // decimals 6 — 100000000 atoms 는 100 TEST 다.
    assert.ok(finalized.includes('100 TEST'), '받은 금액을 적지 않았다 — ' + finalized);
    assert.ok(finalized.includes('확인됨'));
  } finally { restore(); }
});

test('수락 뒤 판정이 바뀌어도 이미 받은 권리를 지우지 않는다', () => {
  const restore = installDom();
  try {
    const base = paidView({});
    const box = paymentPanel({
      view: { ...base, decision: { ...base.decision, current: false } },
      api: { paymentReceipt: async () => ({ claim: null, balance: null }) },
    });
    assert.ok(box.textContent.includes('이미 수락된 권리는 사라지지 않습니다'));
  } finally { restore(); }
});
