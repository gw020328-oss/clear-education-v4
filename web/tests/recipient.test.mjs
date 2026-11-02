// V2 수령 계정 등록 — 서명과 화면
//
// PR #128 리뷰 2번. 전에는 `api.registerRecipient(applicationId)` 하나를
// 불렀는데 **그런 메서드가 없었다.** 우리가 지어낸 이름이라 버튼을 눌러도
// 조용히 끝났고, 시험 251건이 통과하는 채로 남아 있었다.
//
// 여기서 지키는 것 넷.
//
//   1  등록 서명은 **EIP-712 typed data** 다. personal_sign 을 쓰면 서버의
//      verifyTypedData 를 통과하지 못한다
//   2  **내 주소가 아닌 등록 자료에는 서명하지 않는다**
//   3  **서명 수락과 체인 등록은 다른 축**이다. 합쳐 적지 않는다
//   4  결과를 모르면 다시 보내지 않고 같은 번호로 조회한다
//
// 전부 합성이다. 네트워크로 나가는 요청이 없다.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createWalletSession } from '../src/bootcamp/wallet-session.js';
import { recipientPanel, runRecipientRegistration } from '../src/bootcamp/recipient-panel.js';
import { onboardingView } from '../src/bootcamp/onboarding.js';
import { bootcampView } from '../src/fixtures/bootcamp.js';

const ORIGIN = 'https://127.0.0.1:8443';
const ACTIVE = Object.freeze({ phase: 'ACTIVE_LOCAL_TEST', origin: ORIGIN, chainId: 31337 });
const WALLET = '0x' + 'a1'.repeat(20);
const OTHER = '0x' + 'b2'.repeat(20);
const CSRF = 'a'.repeat(64);
const SIG65 = '0x' + 'cd'.repeat(65);
const B32 = (b) => '0x' + b.repeat(32);

const jsonRes = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});

/** 서버 recipient-registration.mjs 가 만드는 모양 그대로 */
const payloadFor = (who = WALLET) => ({
  domain: {
    name: 'ClearBootcampRecipientRegistration',
    version: '1',
    chainId: '31337',
    verifyingContract: '0x' + 'cc'.repeat(20),
    salt: B32('11'),
  },
  types: {
    RecipientRegistration: [
      { name: 'applicationId', type: 'bytes32' }, { name: 'applicationSalt', type: 'bytes32' },
      { name: 'policyHash', type: 'bytes32' }, { name: 'runtimeMappingHash', type: 'bytes32' },
      { name: 'participant', type: 'address' }, { name: 'recipient', type: 'address' },
      { name: 'nonce', type: 'bytes32' }, { name: 'deadline', type: 'uint64' },
    ],
  },
  primaryType: 'RecipientRegistration',
  message: {
    applicationId: B32('22'), applicationSalt: B32('33'),
    policyHash: B32('44'), runtimeMappingHash: B32('55'),
    participant: who, recipient: who,
    nonce: B32('66'), deadline: '1793937600',
  },
});

/** 서버 procedure.mjs 의 getRecipientRegistration 응답 모양 */
const packetFor = (over = {}) => ({
  version: 'clear-bootcamp-recipient-registration.1',
  applicationId: 'application-50ffec3f-ebb9-40eb-b449-93c98ff1f1ed',
  role: 'PARTICIPANT',
  applicationRevision: 9,
  decisionId: 'decision-8dd63078-406b-457d-a7ca-e7202f5024fc',
  decisionRevision: 9,
  chainStatus: 'NOT_OBSERVED',
  signatureAccepted: false,
  calldataPublic: true,
  purpose: 'REGISTER_FIXED_RECIPIENT',
  status: 'AWAITING_SIGNATURE',
  registrationTargetId: 'registration-target-1',
  payload: payloadFor(),
  digest: null,
  ...over,
});

// ── 지갑 서명 ───────────────────────────────────────────────────────────

function walletHarness({ accounts = () => [WALLET], onRpc = () => {} } = {}) {
  const calls = [];
  const handlers = {};
  const provider = {
    on: (name, fn) => { handlers[name] = fn; },
    request: async ({ method, params }) => {
      calls.push({ method, params });
      onRpc(method);
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return accounts();
      if (method === 'eth_chainId') return '0x7a69';
      if (method === 'personal_sign' || method === 'eth_signTypedData_v4') return SIG65;
      throw new Error('시험이 모르는 rpc: ' + method);
    },
  };
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname;
    if (path === '/auth/nonce') {
      return jsonRes({
        nonce: 'nonce-1', message: 'CLEAR 로그인 확인',
        expiresAt: Math.floor(Date.now() / 1000) + 300,
      });
    }
    if (path === '/auth/verify') return jsonRes({ wallet: WALLET, csrf: CSRF });
    return jsonRes({});
  };
  const session = createWalletSession({ origin: ORIGIN, provider, fetchImpl });
  return { session, calls, handlers };
}

test('등록 서명은 personal_sign 이 아니라 typed data 로 나간다', async () => {
  const h = walletHarness();
  await h.session.signIn(ACTIVE);
  h.calls.length = 0;

  const signature = await h.session.signTypedData(payloadFor());
  assert.equal(signature, SIG65);

  const signing = h.calls.filter((c) => c.method.startsWith('personal_') || c.method.startsWith('eth_sign'));
  assert.deepEqual(signing.map((c) => c.method), ['eth_signTypedData_v4'], '서명 방식이 틀렸다');
  assert.equal(signing[0].params[0], WALLET, '남의 주소로 서명을 요청했다');
});

test('EIP712Domain 을 domain 에 있는 칸으로만 만든다', async () => {
  const h = walletHarness();
  await h.session.signIn(ACTIVE);

  // salt 가 없는 도메인. 없는 칸을 끼워 넣으면 해시가 달라져 검증이 깨진다.
  const payload = payloadFor();
  delete payload.domain.salt;
  await h.session.signTypedData(payload);

  const sent = h.calls.find((c) => c.method === 'eth_signTypedData_v4');
  const typed = JSON.parse(sent.params[1]);
  assert.deepEqual(
    typed.types.EIP712Domain.map((f) => f.name),
    ['name', 'version', 'chainId', 'verifyingContract'],
    'EIP712Domain 이 실제 domain 과 다르다',
  );
  // 서버가 준 타입은 그대로 남아 있어야 한다
  assert.ok(typed.types.RecipientRegistration, '서버가 준 타입이 사라졌다');
});

test('내 주소가 아닌 등록 자료에는 서명하지 않는다', async () => {
  const h = walletHarness();
  await h.session.signIn(ACTIVE);
  h.calls.length = 0;

  await assert.rejects(
    () => h.session.signTypedData(payloadFor(OTHER)),
    (e) => e.code === 'BC_SIGN_TYPED_DATA',
  );
  assert.equal(
    h.calls.some((c) => c.method === 'eth_signTypedData_v4'), false,
    '남의 등록 자료에 서명을 요청했다',
  );
});

test('등록이 아닌 typed data 는 거절한다', async () => {
  const h = walletHarness();
  await h.session.signIn(ACTIVE);

  const payload = payloadFor();
  payload.primaryType = 'Permit';
  payload.types = { Permit: [{ name: 'spender', type: 'address' }] };
  await assert.rejects(
    () => h.session.signTypedData(payload),
    (e) => e.code === 'BC_SIGN_TYPED_DATA',
  );
});

test('로그인 전에는 등록 서명을 하지 않는다', async () => {
  const h = walletHarness();
  await assert.rejects(
    () => h.session.signTypedData(payloadFor()),
    (e) => e.code === 'AUTH_REQUIRED',
  );
});

// ── 절차 ────────────────────────────────────────────────────────────────

test('서명할 수 있는 상태가 아니면 서명하지 않는다', async () => {
  for (const status of ['NOT_READY', 'STALE', 'EXPIRED', 'SIGNED']) {
    let signed = false;
    const out = await runRecipientRegistration({
      api: {
        recipientRegistration: async () => packetFor({ status }),
        submitRecipientRegistration: async () => { throw new Error('보내선 안 된다'); },
      },
      signTypedData: async () => { signed = true; return SIG65; },
      applicationId: 'app-1',
      idempotencyKey: 'recipient-1',
    });
    assert.equal(signed, false, status + ': 서명했다');
    assert.equal(out.status, status);
  }
});

test('서명하면 같은 packet 으로 제출하고 결과를 다시 읽는다', async () => {
  const sent = [];
  let reads = 0;
  const out = await runRecipientRegistration({
    api: {
      recipientRegistration: async () => {
        reads += 1;
        return reads === 1 ? packetFor() : packetFor({ status: 'SIGNED', signatureAccepted: true });
      },
      submitRecipientRegistration: async (app, packet, signature, options) => {
        sent.push({ app, target: packet.registrationTargetId, signature, key: options?.idempotencyKey });
        return { signatureAccepted: true };
      },
    },
    signTypedData: async () => SIG65,
    applicationId: 'app-1',
    idempotencyKey: 'recipient-1',
  });

  assert.equal(sent.length, 1);
  assert.equal(sent[0].target, 'registration-target-1', '다른 대상에 제출했다');
  assert.equal(sent[0].signature, SIG65);
  assert.equal(sent[0].key, 'recipient-1');
  assert.equal(reads, 2, '제출 결과를 다시 읽지 않았다');
  assert.equal(out.signatureAccepted, true);
});

// ── 화면 ────────────────────────────────────────────────────────────────

function installDom() {
  class Node {
    constructor(tag) {
      this.tagName = String(tag).toUpperCase();
      this.children = []; this.attributes = {}; this.className = ''; this.handlers = {}; this._text = '';
    }

    get firstChild() { return this.children[0] ?? null; }

    set textContent(v) { this._text = String(v); this.children = []; }

    get textContent() { return this._text + this.children.map((c) => c.textContent ?? '').join(''); }

    setAttribute(n, v) { this.attributes[n] = String(v); }

    addEventListener(type, fn) { (this.handlers[type] ??= []).push(fn); }

    append(...n) { this.children.push(...n); }

    removeChild(n) { this.children = this.children.filter((c) => c !== n); }
  }
  globalThis.document = {
    createElement: (t) => new Node(t),
    createElementNS: (_n, t) => new Node(t),
    createTextNode: (t) => ({ textContent: String(t), children: [] }),
  };
  globalThis.crypto ??= { getRandomValues: (a) => a.fill(7) };
  return () => { delete globalThis.document; };
}

function* walk(node) { yield node; for (const c of node.children ?? []) yield* walk(c); }
const button = (root, label) => [...walk(root)]
  .find((n) => n.tagName === 'BUTTON' && n.textContent.includes(label)) ?? null;
const press = (node) => {
  assert.ok(node, '누를 버튼이 없다');
  if (node.attributes?.disabled) return false;
  for (const fn of node.handlers?.click ?? []) fn({ preventDefault() {} });
  return true;
};
const settle = async () => { for (let i = 0; i < 30; i += 1) await new Promise((r) => setTimeout(r, 0)); };

const VIEW = () => bootcampView('inProgress', 'participant');
const bootcampLike = (code, outcome = 'HTTP_ERROR') =>
  Object.assign(new Error(code), { name: 'BootcampError', code, outcome, status: null });

test('등록 경로가 없으면 버튼 대신 없다고 적는다', () => {
  const restore = installDom();
  try {
    const box = recipientPanel({ view: VIEW(), api: {}, signTypedData: null });
    assert.equal(button(box, '불러오기'), null);
    assert.ok(box.textContent.includes('아직 열리지 않았습니다'));
  } finally { restore(); }
});

test('서명 수락과 체인 등록을 합쳐 적지 않는다', async () => {
  const restore = installDom();
  try {
    const box = recipientPanel({
      view: VIEW(),
      signTypedData: async () => SIG65,
      api: {
        recipientRegistration: async () => packetFor({
          status: 'SIGNED', signatureAccepted: true, chainStatus: 'NOT_OBSERVED',
        }),
        submitRecipientRegistration: async () => ({}),
      },
    });
    press(button(box, '등록 자료 불러오기'));
    await settle();

    const text = box.textContent;
    assert.ok(text.includes('접수됨'), '서명 수락을 적지 않았다');
    assert.ok(text.includes('아직 관측되지 않음'), '체인 상태를 적지 않았다');
    assert.ok(text.includes('등록이 끝난 것으로 보지 마세요'), '둘을 구분하지 않았다');
  } finally { restore(); }
});

test('서명 기한과 받을 주소를 사람이 보고 서명한다', async () => {
  const restore = installDom();
  try {
    const box = recipientPanel({
      view: VIEW(),
      signTypedData: async () => SIG65,
      api: {
        recipientRegistration: async () => packetFor(),
        submitRecipientRegistration: async () => ({}),
      },
    });
    press(button(box, '등록 자료 불러오기'));
    await settle();

    const text = box.textContent;
    assert.ok(text.includes(WALLET), '받을 주소를 안 보여줬다');
    assert.ok(text.includes('바꿀 수 없습니다'), '고정된다는 것을 안 적었다');
    assert.ok(/26\. \d+\. \d+\./.test(text), '서명 기한을 안 보여줬다 — ' + text.slice(0, 200));
    assert.ok(button(box, '지갑으로 서명하기'), '서명 버튼이 없다');
  } finally { restore(); }
});

test('중복 제출과 기한 만료를 사람 말로 적는다', async () => {
  const restore = installDom();
  try {
    for (const [code, part] of [
      ['BC_RECIPIENT_REGISTRATION_ALREADY_SIGNED', '이미 서명을 제출했습니다'],
      ['BC_RECIPIENT_REGISTRATION_SIGNATURE', '다시 서명해 주세요'],
      ['BC_RECIPIENT_REGISTRATION_TARGET', '다시 불러온 뒤'],
      ['BC_E3_CURRENT_MET_REQUIRED', '조건을 모두 충족해야'],
    ]) {
      const box = recipientPanel({
        view: VIEW(),
        signTypedData: async () => SIG65,
        api: {
          recipientRegistration: async () => packetFor(),
          submitRecipientRegistration: async () => { throw bootcampLike(code); },
        },
      });
      press(button(box, '등록 자료 불러오기'));
      await settle();
      press(button(box, '지갑으로 서명하기'));
      await settle();

      const text = box.textContent;
      assert.ok(text.includes(part), code + ': 「' + part + '」 가 없다');
      assert.ok(!text.includes(code), code + ': 코드가 그대로 나왔다');
    }
  } finally { restore(); }
});

test('지갑에서 거절하면 제출하지 않는다', async () => {
  const restore = installDom();
  try {
    let submitted = false;
    const box = recipientPanel({
      view: VIEW(),
      signTypedData: async () => { throw bootcampLike('BC_WALLET_REJECTED'); },
      api: {
        recipientRegistration: async () => packetFor(),
        submitRecipientRegistration: async () => { submitted = true; return {}; },
      },
    });
    press(button(box, '등록 자료 불러오기'));
    await settle();
    press(button(box, '지갑으로 서명하기'));
    await settle();

    assert.equal(submitted, false, '거절했는데 제출했다');
    assert.ok(box.textContent.includes('거절'));
  } finally { restore(); }
});

test('결과를 모르면 다시 보내지 않고 조회한다', async () => {
  const restore = installDom();
  try {
    let submits = 0;
    let accepted = false;
    const box = recipientPanel({
      view: VIEW(),
      signTypedData: async () => SIG65,
      api: {
        recipientRegistration: async () => packetFor(
          accepted ? { status: 'SIGNED', signatureAccepted: true } : {},
        ),
        submitRecipientRegistration: async () => {
          submits += 1; accepted = true;
          throw bootcampLike('BC_TRANSPORT_FAILED', 'UNKNOWN');
        },
      },
    });
    press(button(box, '등록 자료 불러오기'));
    await settle();
    press(button(box, '지갑으로 서명하기'));
    await settle();

    assert.ok(box.textContent.includes('닿았는지 알 수 없습니다'), 'UNKNOWN 을 실패로 적었다');
    assert.equal(button(box, '지갑으로 서명하기'), null, 'UNKNOWN 인데 다시 서명하라고 한다');

    press(button(box, '결과 확인'));
    await settle();

    assert.equal(submits, 1, '결과를 모르는데 또 보냈다');
    assert.ok(box.textContent.includes('접수된 것을 확인했습니다'));
  } finally { restore(); }
});

test('세션의 기대 주소만으로 온보딩을 끝내지 않는다', () => {
  const restore = installDom();
  try {
    const conn = {
      state: 'LIVE', demo: false,
      expectedRecipient: WALLET, recipient: null,
      walletKind: 'EMBEDDED',
    };
    // 등록을 한 적이 없다 — 3단계가 끝났다고 표시하면 안 된다
    const before = onboardingView({ conn, role: 'participant', registration: null });
    assert.ok(!before.textContent.includes('등록됨'), '등록 전인데 끝났다고 적었다');

    // 서명이 접수되면 그때 끝이다
    const after = onboardingView({
      conn, role: 'participant', registration: { signatureAccepted: true },
    });
    assert.notEqual(before.textContent, after.textContent, '등록 상태가 화면에 반영되지 않는다');
  } finally { restore(); }
});

// ── 실제 세션과 합성 월드 분리 ──────────────────────────────────────────
//
// PR #128 리뷰 3번. `connection.refresh()` 가 `api.view()` 실패를 삼켜 null 을
// 돌려주고, 화면이 그 null 을 '서버 없음' 으로 읽어 **로그인한 사용자에게
// 합성 학생 20명과 조작판을 띄웠다.**
//
// 백엔드가 지정한 세 경우를 그대로 건다.
//
//   1  로그인 뒤 첫 조회 실패
//   2  한 번 성공한 뒤 다음 조회 실패
//   3  절차 준비 중 응답
//
// 어느 경우에도 fixture / worldApi / 조작판이 자동으로 선택되면 안 된다.

import { pickMode, MODE, viewStatusOf } from '../src/bootcamp/mode.js';
import { viewStatusView } from '../src/bootcamp/view-status.js';

test('로그인한 세션은 어떤 경우에도 합성으로 떨어지지 않는다', () => {
  const cases = [
    ['첫 조회 실패', null],
    ['성공 뒤 다음 조회 실패', null],
    ['절차 준비 중', null],
  ];
  for (const [label, liveView] of cases) {
    // 주소가 시연 상황(live)이어도 로그인했으면 합성이 아니다
    const mode = pickMode({ connState: 'LIVE', liveView, pickedCase: 'live' });
    assert.equal(mode, MODE.LIVE_NO_VIEW, label + ': 합성으로 떨어졌다');
    assert.notEqual(mode, MODE.SIM, label);
    assert.notEqual(mode, MODE.FIXTURE, label);
  }

  // 대조군 — 판정이 들어오면 그걸 그린다
  assert.equal(
    pickMode({ connState: 'LIVE', liveView: { applicationId: 'a' }, pickedCase: 'live' }),
    MODE.LIVE,
  );
});

test('로그인하지 않았을 때만 합성 월드가 켜진다', () => {
  for (const state of ['SIGNED_OUT', 'NOT_ACTIVE', 'OFFLINE']) {
    assert.equal(pickMode({ connState: state, liveView: null, pickedCase: 'live' }), MODE.SIM, state);
    assert.equal(pickMode({ connState: state, liveView: null, pickedCase: 'paid' }), MODE.FIXTURE, state);
  }
});

test('절차 준비 중과 일반 오류를 구분한다', () => {
  assert.equal(viewStatusOf(null), 'LOADING');
  assert.equal(viewStatusOf({ code: 'BC_NORMAL_PROCEDURE_NOT_READY' }), 'NOT_READY');
  assert.equal(viewStatusOf({ code: 'NORMAL_HOST_NOT_ACTIVATED' }), 'NOT_READY');
  assert.equal(viewStatusOf({ code: 'BC_TRANSPORT_FAILED' }), 'FAILED');
  assert.equal(viewStatusOf({ code: 'BC_TRANSPORT_TIMEOUT' }), 'FAILED');
});

test('판정을 못 읽은 화면은 숫자를 지어내지 않는다', () => {
  const restore = installDom();
  try {
    const box = viewStatusView({
      conn: { state: 'LIVE', viewError: { code: 'BC_TRANSPORT_TIMEOUT' } },
    });
    const text = box.textContent;

    assert.ok(text.includes('불러오지 못했습니다'), '무슨 일인지 적지 않았다');
    assert.ok(text.includes('응답이 오지 않았습니다'), '사유를 사람 말로 적지 않았다');
    assert.ok(button(box, '다시 읽기'), '다시 읽을 길이 없다');

    // 조건 개수·금액 같은 합성 숫자가 한 톨도 없어야 한다
    assert.ok(!/\d+\s*\/\s*4/.test(text), '조건 개수를 지어냈다 — ' + text);
    assert.ok(!/TEST/.test(text), '금액을 지어냈다 — ' + text);
    assert.ok(!/학생|참여자\s*\d/.test(text), '명단을 그렸다 — ' + text);
  } finally { restore(); }
});

test('절차 준비 중에는 오류가 아니라 기다리라고 적는다', () => {
  const restore = installDom();
  try {
    const box = viewStatusView({
      conn: { state: 'LIVE', viewError: { code: 'BC_NORMAL_PROCEDURE_NOT_READY' } },
    });
    const text = box.textContent;
    assert.ok(text.includes('아직 준비되지 않았습니다'));
    assert.ok(!text.includes('불러오지 못했습니다'), '준비 중을 실패로 적었다');
  } finally { restore(); }
});
