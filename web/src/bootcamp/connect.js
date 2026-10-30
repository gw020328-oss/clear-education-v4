// 서버 연결 — 탐지 · 로그인 · API 묶기
//
// 지금까지 화면은 fixture 만 그렸다. 여기서 **백엔드가 켜지면 자동으로 실제
// 데이터로 넘어가게** 한다. 켜져 있지 않으면 fixture 로 남는다.
//
//   1  GET /__dev/config          호스트가 살아 있나, 어느 체인인가
//   2  phase 가 ACTIVE_LOCAL_TEST 가 아니면 거기서 멈춘다
//   3  사용자가 로그인 버튼을 누르면 personal_sign 으로 세션
//   4  GET /bootcamp/v4/session   내 역할과 신청
//   5  /bootcamp-normal-client.mjs 를 동적 import 해서 api 를 만든다
//
// ── 자동으로 하지 않는 것 ──────────────────────────────────────────────
//
// 로그인은 **버튼에서만** 시작한다. 화면을 열었다고 지갑 창이 뜨면 안 된다.
// 1·2 번(읽기)은 자동으로 하지만 지갑은 건드리지 않는다.
//
// ── A·B·C 중 무엇으로 가도 이 코드가 산다 ─────────────────────────────
//
// 지갑 방식은 아직 미확정이다(기획서 §15). 그런데 A(기존 지갑)와 B(내장 지갑)는
// 둘 다 **EOA 에 personal_sign** 이라 이 경로가 그대로 쓰인다. 내장 지갑 SDK 는
// EIP-1193 provider 를 내놓으므로 `provider` 자리에 그것을 넣으면 끝이다.
//
// C(스마트 계정)로 가면 §7.4.3 에 따라 ERC-1271 검증이 필요해져 서버의 /auth/verify
// 부터 바뀐다. 그때는 여기도 고쳐야 한다. 지금 C 를 미리 넣지 않는다 —
// 채택되지 않은 설계를 위해 쓰는 코드는 대부분 버려진다.
//
// ── 서버 모듈의 모양을 추측하지 않는다 ────────────────────────────────
//
// normal-client.mjs 는 오규원 브랜치(codex/bootcamp-e5-api-bridge)에 있고 이
// 체크아웃에 없다. 그래서 **기대하는 내보내기 이름을 아래에 적어 두고**, 다르면
// 받은 이름을 그대로 화면에 띄운다. 비슷한 이름을 찾아 쓰면 조용히 틀린 함수를
// 부르게 된다.

import { createWalletSession } from './wallet-session.js';
import { createDemoAccount, fakeRegisterRecipient } from './demo-wallet.js';
import { createBootcampTransport, BootcampError } from './transport.js';

/** 서버 모듈에서 찾는 공장 함수 이름. 첫 번째로 있는 것을 쓴다 */
const FACTORY_NAMES = Object.freeze(['createNormalClient', 'normalClient', 'default']);

/** panels.js 가 부르는 메서드. 하나라도 없으면 붙이지 않는다 */
const REQUIRED = Object.freeze([
  'view', 'consent', 'operation', 'paymentReceipt',
  'bindSourceSession', 'pendingSourceSignature', 'submitSourceSignature',
]);

/**
 * 있으면 쓰고 없으면 화면에서 이유를 말하는 메서드.
 *
 * 기획서 §9.1 은 '구체적 오류 제기'와 '재검증 요청'을 사용자 행동으로 꼽는데,
 * 서버 쪽 경로가 아직 문서에 없다. 없다고 화면에서 빼 버리면 설계가 사라지고,
 * 이름을 짐작해 부르면 엉뚱한 걸 호출한다. **있으면 켜고 없으면 왜 못 하는지
 * 적는다** — 서버가 추가하는 날 코드를 안 고쳐도 버튼이 살아난다.
 */
export const OPTIONAL = Object.freeze(['objection', 'revalidation', 'registerRecipient']);

/**
 * 지갑 공급자를 고른다.
 *
 * B안(내장 지갑)을 채택하면 SDK 가 만든 provider 를 `window.clearWallet` 에
 * 올려 두고 그것을 쓴다. SDK 는 아직 없다 — CSP(script-src 'self')라 CDN 에서
 * 못 받고, 받아서 web/ 에 넣는 건 별도 결정이다.
 *
 * 그때까지는 브라우저 지갑(A안)으로 떨어진다. **둘 다 EOA 라 아래 코드가
 * 그대로 돈다** — 바뀌는 건 이 함수 하나다.
 */
/**
 * 역할마다 **쓰는 지갑이 정해져 있다.** 2026-10-29 결정.
 *
 *   학생   내장 지갑만 (window.clearWallet)
 *   운영자 브라우저 지갑 (window.ethereum)
 *
 * ── 학생을 브라우저 지갑으로 떨어뜨리지 않는다 ────────────────────────
 *
 * 전에는 내장 → 브라우저 → 없음 순으로 찾았다. 그러면 지갑 확장을 깔아 둔
 * 학생이 **내장 지갑 대신 자기 확장으로 연결된다.** 그걸 "이미 쓰는 주소가
 * 있으니 그 주소를 쓴다" 라고 화면에 적어 뒀는데, 그건 제품 결정이 아니라
 * SDK 가 아직 없어서 생긴 구멍을 설명으로 포장한 것이었다.
 *
 * 학생에게 길이 둘이면 **수령 계정이 어느 주소로 등록되는지가 흔들린다.**
 * 환급금은 등록한 그 주소로만 간다. 한 번만 등록하고 바꿀 수 없는 값이
 * "브라우저에 뭐가 깔려 있느냐" 로 갈리면 안 된다.
 *
 * SDK 가 없으면 학생은 NONE 이다. 화면이 "아직 준비되지 않았습니다" 라고
 * 적고 멈춘다 — 엉뚱한 지갑으로 진행시키는 것보다 멈추는 쪽이 낫다.
 *
 * ── 시험용 예외 ─────────────────────────────────────────────────────
 *
 * SDK 가 아직 없다. 그래서 학생은 실서버에 **로그인 자체를 못 한다** —
 * 백엔드 통합 시험(신청 → 원천 → AI 승인 → 지급)을 돌릴 수가 없다.
 *
 *   오규원 10-28: "현재 경로로 먼저 통합을 검증하는 것과 내장 지갑 목표를
 *   폐기하는 것은 다른 결정이야."
 *
 * 그래서 `test` 를 켰을 때만 학생도 브라우저 지갑으로 떨어진다. **저절로
 * 켜지지 않는다** — 화면이 "시험용" 이라고 적고 사용자가 따로 눌러야 한다.
 * 제품 경로는 그대로 내장 지갑뿐이다.
 *
 * @param {'participant'|'operator'} role
 * @param {{test?: boolean}} [options]
 */
export function pickProvider(role = 'participant', { test = false } = {}) {
  if (typeof window === 'undefined') return { provider: null, kind: 'NONE' };
  const browser = window.ethereum?.request
    ? { provider: window.ethereum, kind: 'BROWSER' }
    : { provider: null, kind: 'NONE' };
  if (role === 'operator') return browser;
  if (window.clearWallet?.request) return { provider: window.clearWallet, kind: 'EMBEDDED' };
  // 시험용으로만. 켜 두면 'TEST_BROWSER' 라 화면이 그렇게 적는다.
  if (test && browser.provider) return { provider: browser.provider, kind: 'TEST_BROWSER' };
  return { provider: null, kind: 'NONE' };
}

/** 이 브라우저에 확장 지갑이 있나. 학생에게 시험용 선택지를 띄울지 정한다 */
export const hasBrowserWallet = () => (typeof window !== 'undefined'
  && Boolean(window.ethereum?.request));

const fail = (code, detail = null) => new BootcampError(code, { outcome: 'NOT_SENT', detail });

/**
 * 이 역할이 쓸 지갑. 없으면 null — 오류가 아니다.
 *
 * 학생용 내장 지갑 SDK 는 `window.clearWallet` 에 올라온다. 아직 없다.
 */
export const browserProvider = (role, options) => pickProvider(role, options).provider;

/**
 * 호스트가 켜져 있는지 본다. 지갑은 건드리지 않는다.
 *
 * @returns {Promise<{phase:string, chainId:number|null, origin:string}|null>}
 *   null 이면 서버가 없다(정적 미리보기 등). 오류로 다루지 않는다.
 */
export async function probeHost({ origin, fetchImpl, timeoutMs } = {}) {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : null);
  if (!base) return null;
  const request = createBootcampTransport({ origin: base, fetchImpl, timeoutMs });
  try {
    const config = await request('/__dev/config');
    if (!config || typeof config.phase !== 'string') return null;
    return config;
  } catch {
    // 404·네트워크 오류 = 서버가 없다. 화면은 fixture 로 간다.
    return null;
  }
}

/**
 * 서버 모듈을 불러 api 를 만든다.
 *
 * @param {object} session  wallet-session 이 만든 것
 * @param {string} origin
 */
export async function loadApi(session, { origin, importImpl } = {}) {
  const base = origin ?? window.location.origin;
  const url = new URL('/bootcamp-normal-client.mjs', base);
  // 같은 origin 만. 남의 주소에서 코드를 가져와 실행하지 않는다.
  if (url.origin !== base) throw fail('BC_CLIENT_ORIGIN');

  let module;
  try {
    module = await (importImpl ? importImpl(url.href) : import(/* @vite-ignore */ url.href));
  } catch (error) {
    throw fail('BC_CLIENT_UNAVAILABLE', error?.message ?? null);
  }

  const name = FACTORY_NAMES.find((key) => typeof module?.[key] === 'function');
  if (!name) {
    // 이름을 짐작하지 않는다. 받은 것을 그대로 알려주면 고치기 쉽다.
    throw fail('BC_CLIENT_SHAPE', `기대: ${FACTORY_NAMES.join(' / ')} · 받음: ${Object.keys(module ?? {}).join(', ') || '없음'}`);
  }

  const api = module[name]({ request: session.request, origin: base });
  const missing = REQUIRED.filter((key) => typeof api?.[key] !== 'function');
  if (missing.length > 0) throw fail('BC_CLIENT_SHAPE', `없는 메서드: ${missing.join(', ')}`);
  return api;
}

/**
 * 화면이 들고 다니는 연결 상태.
 *
 * 상태는 넷이다. 화면은 이 중 무엇인지 늘 말할 수 있어야 한다 —
 * "연결 안 됨"과 "로그인 안 함"을 같은 문장으로 뭉개면 사용자는 뭘 할지 모른다.
 *
 *   OFFLINE      서버가 없다. fixture 를 그린다
 *   NOT_ACTIVE   서버는 있는데 phase 가 아직 ACTIVE_LOCAL_TEST 가 아니다
 *   SIGNED_OUT   로그인하면 된다 ← 버튼이 나오는 유일한 상태
 *   LIVE         로그인됨. api 가 있다
 */
/** 단조 시계. 벽시계를 쓰면 시간 조정에 승인 창이 늘어난다 */
const now = () => (typeof performance !== 'undefined' && typeof performance.now === 'function'
  ? performance.now()
  : Date.now());

export function createConnection({
  origin, provider, fetchImpl, timeoutMs, importImpl, onChange = () => {},
  // 어느 역할로 들어왔나. 쓰는 지갑이 달라진다.
  role: initialRole = 'participant',
} = {}) {
  let role = initialRole;
  // 학생이 시험용 브라우저 지갑을 쓰기로 했나. 사용자가 누를 때만 켜진다.
  let testWallet = false;
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  let state = 'OFFLINE';
  let config = null;
  let wallet = null;
  let api = null;
  let session = null;
  // session() 을 부른 시각. 승인 남은 시간을 여기서부터 센다 —
  // 서버가 준 창에서 **조회 뒤 흐른 만큼**을 빼야 하기 때문이다.
  let sessionReadAtMs = null;
  let error = null;
  let busy = false;
  // 시연용 계정. 서버가 없을 때만 쓴다 — demo-wallet.js 머리말 참고.
  let demo = null;

  const snapshot = () => Object.freeze({
    state,
    phase: config?.phase ?? null,
    chainId: config?.chainId ?? null,
    address: wallet?.wallet ?? demo?.address ?? null,
    applicationId: session?.applicationId ?? null,
    role: session?.role ?? null,
    // 멘토 §2 — 수령인을 체인에 등록했나. 서버가 주면 그 값, 아니면 미확인.
    recipient: session?.recipient ?? demo?.recipient ?? null,
    // 이번 입력의 AI 승인 자료. 서버가 세션에 실어 준다.
    aiApproval: session?.aiApproval ?? null,
    sessionReadAtMs,
    walletKind: pickProvider(role, { test: testWallet }).kind,
    // 이 브라우저에 확장이 있나. 학생에게 시험용 선택지를 띄울지 정한다.
    canTestWallet: role !== 'operator' && !testWallet && hasBrowserWallet()
      && pickProvider(role).kind === 'NONE',
    // 시연 모드인가. 화면이 이걸 보고 '가짜' 라고 적는다.
    demo: demo !== null,
    demoHow: demo?.how ?? null,
    api,
    error,
    busy,
    // panels 에 넘길 서명 함수. 서버가 준 문구를 그대로 서명한다.
    sign: wallet && state === 'LIVE'
      ? (message) => wallet.signMessage(message)
      : null,
  });

  const settle = () => { busy = false; onChange(snapshot()); };

  return Object.freeze({
    get current() { return snapshot(); },

    /**
     * 어느 역할 화면인가. **쓰는 지갑이 달라지므로** 바뀌면 연결을 끊는다.
     *
     * 학생은 내장 지갑, 운영자는 브라우저 지갑이다. 운영자로 로그인한
     * 세션을 학생 화면에 그대로 들고 가면 엉뚱한 주소로 수령 계정이
     * 등록된다.
     */
    setRole(next) {
      if (next === role) return snapshot();
      role = next === 'operator' ? 'operator' : 'participant';
      testWallet = false;
      // **진짜 지갑 세션만 끊는다.** 운영자 확장으로 로그인한 세션을 학생
      // 화면에 들고 가면 엉뚱한 주소로 수령 계정이 등록된다.
      //
      // 시연 계정은 그대로 둔다. 발표에서 두 화면을 수없이 오가는데 그때마다
      // 온보딩을 다시 시키면 흐름이 끊긴다. 어차피 진짜 지갑이 아니다.
      if (state === 'LIVE') {
        state = 'SIGNED_OUT'; api = null; session = null; wallet = null;
      }
      // onChange 를 부르지 않는다. 부르는 쪽이 이미 그리는 중이라
      // 다시 그리면 **옛 스냅샷이 나중에 덮어쓴다.** 부른 쪽이 다시 읽는다.
      return snapshot();
    },

    /**
     * 학생이 시험용 브라우저 지갑을 쓰겠다고 눌렀다.
     *
     * 제품 경로가 아니다. SDK 가 들어오면 이 길은 안 쓰인다.
     */
    useTestWallet() {
      if (role === 'operator' || !hasBrowserWallet()) return snapshot();
      testWallet = true;
      onChange(snapshot());
      return snapshot();
    },

    /**
     * 이번 입력의 AI 승인을 보낸다.
     *
     * `normal-client.mjs` 에 이 메서드가 없다. driver.js 처럼 세션 request 로
     * 직접 POST 한다 — 없는 메서드를 지어내 부르지 않는다.
     */
    async approveAi(applicationId, body, idempotencyKey) {
      if (state !== 'LIVE' || !wallet) throw fail('BC_HOST_NOT_ACTIVE');
      return wallet.request(`/bootcamp/v4/applications/${applicationId}/reflection-approval`, {
        method: 'POST', body, idempotencyKey,
      });
    },

    /** 세션을 다시 읽는다. 승인 창이 조회 시각 기준이라 시각도 같이 갱신한다 */
    async refreshSession() {
      if (state !== 'LIVE' || !wallet) return snapshot();
      sessionReadAtMs = now();
      session = await wallet.bootcampSession();
      onChange(snapshot());
      return snapshot();
    },

    /** 서버가 있는지만 본다. 지갑 창을 띄우지 않는다 */
    async probe() {
      busy = true; error = null; onChange(snapshot());
      config = await probeHost({ origin: base, fetchImpl, timeoutMs });
      state = !config ? 'OFFLINE'
        : config.phase !== 'ACTIVE_LOCAL_TEST' ? 'NOT_ACTIVE'
          : 'SIGNED_OUT';
      settle();
      return snapshot();
    },

    /** **사용자 버튼에서만 부른다.** 지갑 창이 여기서 뜬다 */
    async signIn() {
      if (state !== 'SIGNED_OUT' || busy) return snapshot();
      busy = true; error = null; onChange(snapshot());
      try {
        // 역할이 바뀌었을 수 있다. 누를 때 다시 고른다.
        const picked = provider ?? pickProvider(role, { test: testWallet }).provider;
        if (!picked) throw fail('BC_WALLET_MISSING');
        wallet = createWalletSession({
          origin: base,
          provider: picked,
          fetchImpl,
          timeoutMs,
          // 계정·체인이 바뀌면 세션이 끝난다. 화면도 로그아웃으로 돌린다.
          onEnd: () => { state = 'SIGNED_OUT'; api = null; session = null; onChange(snapshot()); },
        });
        await wallet.signIn(config);
        sessionReadAtMs = now();
        session = await wallet.bootcampSession();
        api = await loadApi(wallet, { origin: base, importImpl });
        state = 'LIVE';
      } catch (caught) {
        error = caught instanceof BootcampError ? caught : fail('BC_SIGNIN_FAILED', caught?.message ?? null);
        api = null; session = null;
        if (wallet) { await wallet.signOut().catch(() => {}); wallet = null; }
        state = config?.phase === 'ACTIVE_LOCAL_TEST' ? 'SIGNED_OUT' : 'NOT_ACTIVE';
      }
      settle();
      return snapshot();
    },

    /**
     * 시연용 로그인. **서버가 없을 때만** 된다.
     *
     * 아무것도 서명하지 않고 아무 데도 보내지 않는다. 주소 하나를 만들어
     * 화면이 흐름을 보여줄 수 있게 할 뿐이다. 서버가 살아 있으면 거절한다 —
     * 진짜 서버에 가짜 신원을 밀어 넣으면 시연이 아니라 속임수다.
     */
    async demoSignIn(how = 'embedded') {
      if (state !== 'OFFLINE' && state !== 'NOT_ACTIVE') return snapshot();
      busy = true; error = null; onChange(snapshot());
      demo = { ...createDemoAccount(how), recipient: null };
      settle();
      return snapshot();
    },

    /** 시연용 수령 계정 등록. 체인에 아무것도 안 올라간다 */
    async demoRegister() {
      if (!demo) return snapshot();
      busy = true; onChange(snapshot());
      demo = { ...demo, ...fakeRegisterRecipient(demo) };
      settle();
      return snapshot();
    },

    async signOut() {
      demo = null;
      if (wallet) await wallet.signOut().catch(() => {});
      wallet = null; api = null; session = null; error = null;
      state = config?.phase === 'ACTIVE_LOCAL_TEST' ? 'SIGNED_OUT' : 'OFFLINE';
      settle();
      return snapshot();
    },

    /** 서버에서 현재 판정을 다시 읽는다. 쓰기 뒤에 부른다 */
    async refresh() {
      if (state !== 'LIVE' || !api || !session?.applicationId) return null;
      try { return await api.view(session.applicationId); } catch { return null; }
    },
  });
}
