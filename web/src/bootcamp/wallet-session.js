// 지갑 로그인 세션
//
// PR #60 에는 지갑이 없었다. F0 는 합성 fixture 만 그렸으니 필요가 없었다.
// 부트캠프 경로는 참가자와 운영자가 **각자 자기 지갑으로** 로그인해야 한다 —
// 같은 판정에 두 역할이 따로 동의해야 하고, 그 동의가 누구 것인지 서버가 알아야 한다.
//
// src/application/wallet-client.mjs 를 그대로 쓸 수 없다. bare ethers import 가 있어
// 번들러 없는 브라우저에서 해석되지 않는다. web/ 은 npm 없는 정적 트리다.
// 그래서 EIP-1193(window.ethereum) 만 쓰는 최소 어댑터를 여기 둔다.
//
// 로그인 흐름
//
//   eth_requestAccounts  →  /auth/nonce  →  personal_sign  →  /auth/verify
//                                                              ↓ CSRF 받음
//                                                        /bootcamp/v4/session
//                                                        role · applicationId · phase
//
// 지키는 것
//
//   CSRF 는 이 closure 안에만 둔다. localStorage·로그·URL 어디에도 쓰지 않는다.
//   계정·체인이 바뀌면 **즉시 서버 세션을 폐기**한다. 자동으로 되돌리지 않는다.
//   서명은 사용자 버튼에서만 시작한다. 자동 로그인·자동 재시도 없음.
//   이미 만들어진 세션도 중간에 끊기면 logout 으로 회수한다.

import { createBootcampTransport, BootcampError } from './transport.js';

const isWallet = (v) => typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v) && !/^0x0+$/i.test(v);
const isCsrf = (v) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
const fail = (code, outcome = 'NOT_SENT') => new BootcampError(code, { outcome });

/**
 * EIP712Domain 타입을 domain 에 실제로 있는 칸으로만 만든다.
 *
 * 순서는 EIP-712 가 정한 것이고 바꾸면 해시가 달라진다. 없는 칸을 끼워 넣어도
 * 마찬가지다 — 그래서 **받은 domain 에 있는 것만** 고른다.
 */
const DOMAIN_FIELDS = Object.freeze([
  ['name', 'string'], ['version', 'string'], ['chainId', 'uint256'],
  ['verifyingContract', 'address'], ['salt', 'bytes32'],
]);

const domainFields = (domain) => DOMAIN_FIELDS
  .filter(([key]) => domain[key] !== undefined && domain[key] !== null)
  .map(([name, type]) => ({ name, type }));

/** personal_sign 은 바이트 hex 를 받는다. 문자열을 그대로 주면 안 된다 */
export const toHex = (text) =>
  '0x' + Array.from(new TextEncoder().encode(text), (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * @param {object} options
 * @param {string} options.origin              서버 출처
 * @param {object} options.provider            window.ethereum (EIP-1193)
 * @param {() => void} [options.onEnd]         세션이 끝났을 때 화면이 정리할 것
 */
export function createWalletSession({ origin, provider, onEnd = () => {}, fetchImpl, timeoutMs }) {
  let wallet = null;      // 소문자 주소
  let chainId = null;     // number
  let csrf = null;        // 이 closure 밖으로 내보내지 않는다
  let ended = false;
  let generation = 0;     // 계정·체인이 바뀔 때마다 올린다. 늦게 온 응답을 버리려고
  const lifetime = new AbortController();

  const headers = () => (wallet
    ? { 'x-wallet': wallet, 'x-chain-id': String(chainId), ...(csrf ? { 'x-csrf-token': csrf } : {}) }
    : {});

  const request = createBootcampTransport({ origin, headers, fetchImpl, timeoutMs });
  const scoped = (signal) => AbortSignal.any([lifetime.signal, signal].filter(Boolean));

  const rpc = async (method, params, signal) => {
    if (!provider) throw fail('BC_WALLET_MISSING');
    try {
      return await provider.request({ method, params });
    } catch (error) {
      // 4001 = 사용자가 지갑 창에서 거절. 실패가 아니라 선택이다.
      throw fail(error?.code === 4001 ? 'BC_WALLET_REJECTED' : 'BC_WALLET_FAILED');
    }
  };

  /**
   * 서명 전후로 지갑이 그대로인지 확인한다.
   *
   * 사용자가 서명 창을 띄워 둔 채 계정을 바꿀 수 있다. 그 사이에 바뀐 걸 모르고
   * 서명을 받아 보내면 **다른 사람 이름으로 세션이 만들어진다.**
   */
  async function assertSameWallet(stamp, signal) {
    if (ended || stamp !== generation || !wallet) throw fail('BC_WALLET_CONTEXT_CHANGED');
    const accounts = await rpc('eth_accounts', [], signal);
    const chain = await rpc('eth_chainId', [], signal);
    const same = isWallet(accounts?.[0])
      && accounts[0].toLowerCase() === wallet
      && BigInt(chain) === BigInt(chainId);
    if (ended || stamp !== generation || !same) {
      void end();
      throw fail('BC_WALLET_CONTEXT_CHANGED');
    }
  }

  /** 세션을 끝내고 서버 쪽도 폐기한다. 메모리만 지우면 서버 세션이 남는다 */
  async function end() {
    if (ended) return 'ENDED';
    const had = csrf !== null;
    const sending = headers();
    ended = true;
    generation += 1;
    lifetime.abort();
    wallet = null;
    csrf = null;
    try { onEnd(); } catch { /* 화면 정리 실패가 폐기를 막지 않는다 */ }
    if (!had) return 'ENDED';
    try {
      // lifetime 이 이미 abort 라 이 요청만 별도 transport 로 보낸다.
      const logout = createBootcampTransport({ origin, headers: () => sending, fetchImpl, timeoutMs });
      await logout('/auth/logout', { method: 'POST', body: {} });
      return 'REVOKED';
    } catch {
      // 서버에 닿지 못했다. 우리는 끝났지만 서버 세션은 모른다 — 숨기지 않는다.
      return 'REVOCATION_UNCONFIRMED';
    }
  }

  // 지갑이 바뀌면 되돌리지 않고 끝낸다. 진행 중이던 원천 승인은 쓸 수 없다.
  const events = {
    accountsChanged: (accounts) => {
      if (wallet && (!isWallet(accounts?.[0]) || accounts[0].toLowerCase() !== wallet)) void end();
    },
    chainChanged: (chain) => {
      if (!wallet) return;
      try { if (BigInt(chain) !== BigInt(chainId)) void end(); } catch { void end(); }
    },
    disconnect: () => { if (wallet) void end(); },
  };
  for (const [name, handler] of Object.entries(events)) provider?.on?.(name, handler);

  return Object.freeze({
    /** 로그인 전에도 읽을 수 있는 것 — /__dev/config 같은 것 */
    read: (path, options) => request(path, options),

    get wallet() { return wallet; },
    get chainId() { return chainId; },
    get signedIn() { return csrf !== null; },

    /**
     * 호스트가 알려 준 네트워크를 지갑에 추가한다.
     *
     * chainId 는 격리 환경마다 다르다. 우리가 숫자를 들고 있으면 안 되고
     * /__dev/config 가 준 값만 쓴다.
     */
    async addNetwork(config, { signal } = {}) {
      if (ended || config?.phase !== 'ACTIVE_LOCAL_TEST') throw fail('BC_HOST_NOT_ACTIVE');
      if (config.origin !== origin || !Number.isSafeInteger(config.chainId)) throw fail('BC_HOST_CONFIG');
      const net = config.network;
      if (net?.chainId !== '0x' + BigInt(config.chainId).toString(16)) throw fail('BC_HOST_CONFIG');
      if (net.rpcUrls?.length !== 1) throw fail('BC_HOST_CONFIG');
      const rpcUrl = new URL(net.rpcUrls[0]);
      // 로컬 루프백만 허용한다. 임의 RPC 를 지갑에 추가하지 않는다.
      if (rpcUrl.protocol !== 'http:' || rpcUrl.hostname !== '127.0.0.1' || !rpcUrl.port) {
        throw fail('BC_HOST_CONFIG');
      }
      await rpc('wallet_addEthereumChain', [{
        chainId: net.chainId,
        chainName: 'CLEAR Local TEST',
        rpcUrls: [rpcUrl.origin],
        nativeCurrency: { name: 'Local test Ether', symbol: 'ETH', decimals: 18 },
      }], scoped(signal));
      if (ended) throw fail('BC_WALLET_CONTEXT_CHANGED');
      chainId = config.chainId;
    },

    /**
     * 지갑 서명으로 로그인한다. **사용자 버튼에서만 부른다.**
     *
     * @param {object} config  /__dev/config 응답
     */
    async signIn(config, { signal } = {}) {
      if (ended || csrf) throw fail('BC_SESSION_ALREADY');
      if (config?.phase !== 'ACTIVE_LOCAL_TEST') throw fail('BC_HOST_NOT_ACTIVE');
      if (config.origin !== origin || !Number.isSafeInteger(config.chainId)) throw fail('BC_HOST_CONFIG');

      const signal2 = scoped(signal);
      const stamp = generation;
      chainId = config.chainId;

      const accounts = await rpc('eth_requestAccounts', [], signal2);
      if (!isWallet(accounts?.[0])) throw fail('BC_WALLET_MISSING');
      wallet = accounts[0].toLowerCase();
      await assertSameWallet(stamp, signal2);

      const challenge = await request('/auth/nonce', {
        method: 'POST', body: { wallet, chainId }, signal: signal2,
      });
      await assertSameWallet(stamp, signal2);
      if (typeof challenge?.message !== 'string' || challenge.message.length > 16384) {
        throw fail('BC_AUTH_CHALLENGE');
      }
      if (!Number.isSafeInteger(challenge.expiresAt) || Date.now() / 1000 >= challenge.expiresAt) {
        throw fail('BC_AUTH_CHALLENGE');
      }

      // 서버가 준 문구를 그대로 서명한다. 우리가 문장을 만들지 않는다.
      const signature = await rpc('personal_sign', [toHex(challenge.message), wallet], signal2);
      await assertSameWallet(stamp, signal2);

      const verified = await request('/auth/verify', {
        method: 'POST', body: { nonce: challenge.nonce, signature }, signal: signal2,
      });
      if (!isWallet(verified?.wallet) || !isCsrf(verified?.csrf)) {
        // 세션이 만들어졌을 수도 있다. 쓰지 않을 거면 회수한다.
        csrf = isCsrf(verified?.csrf) ? verified.csrf : null;
        await end();
        throw fail('BC_AUTH_SESSION');
      }
      csrf = verified.csrf;
      if (ended || stamp !== generation) { await end(); throw fail('BC_WALLET_CONTEXT_CHANGED'); }
      return { wallet, chainId };
    },

    /**
     * 서버가 준 문구에 서명한다. **사용자 버튼에서만 부른다.**
     *
     * 3단계 원천 확인 서명이 이걸 쓴다. signIn 과 똑같이 서명 **앞뒤로** 지갑을
     * 확인한다 — 서명 창이 떠 있는 동안 계정을 바꿔 버리면 다른 사람 서명이
     * 그 신청에 붙는다.
     *
     * 문구를 우리가 만들지 않는다. 받은 문자열을 그대로 서명한다.
     */
    async signMessage(message, { signal } = {}) {
      if (!csrf) throw fail('AUTH_REQUIRED');
      if (typeof message !== 'string' || message.length === 0 || message.length > 16384) {
        throw fail('BC_SIGN_MESSAGE');
      }
      const signal2 = scoped(signal);
      const stamp = generation;
      await assertSameWallet(stamp, signal2);
      const signature = await rpc('personal_sign', [toHex(message), wallet], signal2);
      await assertSameWallet(stamp, signal2);
      return signature;
    },

    /**
     * V2 수령인 등록 자료에 서명한다. **사용자 버튼에서만 부른다.**
     *
     * personal_sign 과 **다른 것**이다. 등록은 EIP-712 typed data 를 요구하고,
     * 서버가 `verifyTypedData` 로 검증한다. personal_sign 으로 만든 서명을
     * 거기 넣으면 통과하지 못한다 — 2026-11-01 리뷰가 짚은 자리다.
     *
     * 지키는 것 셋.
     *
     *   1  도메인·타입·메시지를 **우리가 만들지 않는다.** 서버가 준 payload 를
     *      그대로 서명한다
     *   2  **메시지의 participant·recipient 가 내 주소일 때만** 서명한다.
     *      아니면 남의 등록에 내 서명을 붙이는 것이다
     *   3  서명 앞뒤로 지갑을 확인한다. signMessage 와 같은 이유다
     *
     * `eth_signTypedData_v4` 는 types 에 EIP712Domain 을 요구한다. 서버 payload
     * 에는 없으므로 **domain 에 실제로 있는 칸만** 골라 EIP-712 표준 순서로
     * 만들어 붙인다. 없는 칸을 넣으면 해시가 달라져 검증이 깨진다.
     */
    async signTypedData(payload, { signal } = {}) {
      if (!csrf) throw fail('AUTH_REQUIRED');
      const message = payload?.message;
      const ok = payload?.domain && payload.types?.[payload.primaryType]
        && payload.primaryType === 'RecipientRegistration'
        && isWallet(message?.participant) && isWallet(message?.recipient)
        && message.participant.toLowerCase() === wallet
        && message.recipient.toLowerCase() === wallet;
      if (!ok) throw fail('BC_SIGN_TYPED_DATA');

      const signal2 = scoped(signal);
      const stamp = generation;
      await assertSameWallet(stamp, signal2);
      const signature = await rpc('eth_signTypedData_v4', [
        wallet,
        JSON.stringify({
          ...payload,
          types: { EIP712Domain: domainFields(payload.domain), ...payload.types },
        }),
      ], signal2);
      await assertSameWallet(stamp, signal2);
      return signature;
    },

    /** 역할·신청·phase. 로그인 뒤에만 부른다 */
    async bootcampSession({ signal } = {}) {
      if (!csrf) throw fail('AUTH_REQUIRED');
      return await request('/bootcamp/v4/session', { signal: scoped(signal) });
    },

    /** normal-client 에 넘길 request. 서버 모듈이 이걸 통해 나간다 */
    request: (path, options) => request(path, { ...options, signal: scoped(options?.signal) }),

    signOut: end,
  });
}
