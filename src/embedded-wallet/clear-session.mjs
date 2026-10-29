import {getAddress} from 'ethers';
import {validateConfig} from './config.mjs';
const check = (ok, code) => { if (!ok) throw Error(code); };

export function validateSiwe(challenge, pin, config, now) {
  check(/^[a-f0-9]{64}$/.test(challenge?.nonce) && Number.isSafeInteger(challenge.expiresAt)
    && now < challenge.expiresAt && challenge.expiresAt <= now + 300, 'SIWE_CHALLENGE');
  const match = /\nIssued At: ([^\n]+)\n/.exec(challenge.message);
  const issued = match && Date.parse(match[1]);
  check(Number.isFinite(issued) && issued <= now * 1000 && issued + 300000 === challenge.expiresAt * 1000, 'SIWE_TIME');
  const expected = `${new URL(config.origin).host} wants you to sign in with your Ethereum account:\n${pin.address}\n\nSign in to CLEAR. This is not acceptance of refund terms.\n\nURI: ${config.origin}/auth\nVersion: 1\nChain ID: ${pin.chainId}\nNonce: ${challenge.nonce}\nIssued At: ${new Date(issued).toISOString()}\nExpiration Time: ${new Date(challenge.expiresAt * 1000).toISOString()}\nRequest ID: ${config.instanceId.slice(2)}`;
  check(challenge.message === expected, 'SIWE_CONTEXT');
}

// One controller per explicit SDK selection. Dispose/revoke must finish before
// another controller authenticates in the same browser cookie jar.
export function createClearSession({wallet, api, config, now = () => Math.floor(Date.now() / 1000), onState = () => {}}) {
  const c = validateConfig(config), pin = wallet.pin, lifetime = new AbortController();
  check(c.chainId === pin.chainId, 'SESSION_CHAIN');
  let session = null, closed = false, loginPending = null, verifying = null, revokePending = null;
  let attemptedLogin = false, revocation = 'NOT_REQUIRED';
  const headers = s => ({'x-wallet': pin.address, 'x-chain-id': String(pin.chainId), ...(s ? {'x-csrf-token': s.csrf} : {})});
  const publicState = () => ({authenticated: !closed && !!session, role: !closed ? session?.role ?? null : null, revocation});
  const notify = () => { try { onState(publicState()); } catch {} };
  const validSession = s => {
    check(s && getAddress(s.wallet) === pin.address && ['participant', 'operator'].includes(s.role)
      && /^[a-f0-9]{64}$/.test(s.csrf) && Number.isSafeInteger(s.expiresAt) && now() < s.expiresAt, 'SESSION_CONTEXT');
    return s;
  };
  async function revoke() {
    if (revokePending) return revokePending;
    revokePending = (async () => {
      if (!attemptedLogin) { revocation = 'NOT_REQUIRED'; notify(); return; }
      revocation = 'PENDING'; notify();
      try {
        // Do not abort verify: its Set-Cookie and body may arrive after logout.
        // Await it, then use the OLD address/chain to revoke the installed cookie.
        if (verifying) { try { await verifying; } catch {} }
        const current = await api('/auth/session', {headers: headers()});
        validSession(current);
        const result = await api('/auth/logout', {method: 'POST', body: {}, headers: headers(current)});
        check(result?.loggedOut === true, 'SESSION_REVOKE_RESPONSE');
        revocation = 'CONFIRMED';
      } catch (error) {
        revocation = error?.status === 401 || error?.message === 'AUTH_REQUIRED' ? 'CONFIRMED' : 'UNKNOWN';
      } finally { session = null; notify(); }
      check(revocation === 'CONFIRMED', 'SESSION_REVOKE_UNKNOWN');
    })();
    try { return await revokePending; } finally { revokePending = null; }
  }
  function invalidate() {
    if (!closed) { closed = true; lifetime.abort(); wallet.invalidate(); notify(); }
    const pending = revoke(); pending.catch(() => {}); return pending;
  }
  async function guard(signal) {
    check(!closed && !signal?.aborted, 'WALLET_CONTEXT_CANCELLED');
    try { await wallet.guard(lifetime.signal); }
    catch (error) { void invalidate().catch(() => {}); throw error; }
    check(!closed && !signal?.aborted, 'WALLET_CONTEXT_CANCELLED');
  }
  async function authenticate() {
    check(c.phase === 'ACTIVE_LOCAL_TEST', 'ONBOARDING_ONLY');
    check(!loginPending && !session && !closed, 'SESSION_BUSY');
    loginPending = (async () => {
      await guard();
      const challenge = await api('/auth/nonce', {method: 'POST', body: {wallet: pin.address, chainId: pin.chainId}, signal: lifetime.signal});
      await guard(); validateSiwe(challenge, pin, c, now());
      const signature = await wallet.personal(challenge.message, {expiresAt: challenge.expiresAt, now, signal: lifetime.signal});
      await guard();
      attemptedLogin = true;
      verifying = api('/auth/verify', {method: 'POST', body: {nonce: challenge.nonce, signature}});
      try {
        const result = validSession(await verifying);
        await guard(); session = {...result}; notify();
        return {sdkUserId: pin.sdkUserId, walletId: pin.walletId, address: pin.address, chainId: pin.chainId, role: result.role};
      } catch (error) { void invalidate().catch(() => {}); throw error; }
      finally { verifying = null; }
    })();
    try { return await loginPending; } finally { loginPending = null; }
  }
  async function assertSession(signal) {
    await guard(signal); check(session, 'AUTH_REQUIRED');
    const before = session;
    let current;
    try { current = await api('/auth/session', {headers: headers(before), signal: lifetime.signal}); }
    catch (error) {
      if (error?.status === 401 || error?.message === 'AUTH_REQUIRED') void invalidate().catch(() => {});
      throw error;
    }
    await guard(signal);
    try {
      validSession(current);
      check(current.role === before.role && current.csrf === before.csrf && current.expiresAt === before.expiresAt, 'SESSION_CHANGED');
    } catch (error) { void invalidate().catch(() => {}); throw error; }
    return {...before};
  }
  return Object.freeze({authenticate, assertSession, invalidate, state: publicState,
    async request(path, {method = 'GET', body, idempotencyKey, signal} = {}) {
      const s = await assertSession(signal);
      const scope = signal ? AbortSignal.any([lifetime.signal, signal]) : lifetime.signal;
      const result = await api(path, {method, body, signal: scope,
        headers: {...headers(s), ...(idempotencyKey ? {'idempotency-key': idempotencyKey} : {})}});
      try { await guard(signal); }
      catch (error) { if (method !== 'GET') Object.assign(error, {outcome: 'UNKNOWN', nextAction: 'CHECK_RESULT'}); throw error; }
      return result;
    },
    async logout() { await invalidate(); },
    async dispose() { try { await invalidate(); } finally { wallet.dispose(); } },
    retryRevocation: revoke,
  });
}
