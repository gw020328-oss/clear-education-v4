import { getAddress, hexlify, toUtf8Bytes, TypedDataEncoder, verifyTypedData } from 'ethers';
import { finalTermsTypes, runtimeHash, vaultDomain } from '../vault/encoding.mjs';
import { canonical } from '../policy/values.mjs';
import { awaitProofOperation, pinProofAuthorization, proofAuthorizationError, validateProofAuthorization } from './proof-authorization.mjs';
export { createSameOriginApi } from './api-client.mjs';

// EIP-1193 controller for the future UI. api(path, options) must use same-origin
// credentials, must not persist signatures, and must reject non-2xx responses.
export function createWalletClient({ provider, api, chainId, clock = () => Math.floor(Date.now() / 1000) }) {
  let generation = 0, connected = null, authenticated = null, disposed = false;
  let proofAuthorizationPending = false;
  const invalidate = () => { generation++; connected = null; authenticated = null; };
  for (const name of ['accountsChanged', 'chainChanged', 'disconnect']) provider.on(name, invalidate);
  const fail = code => { throw new Error(code); };
  function matches(accounts, chain, wallet) {
    try { return Array.isArray(accounts) && accounts.length > 0 && typeof chain === 'string'
      && /^0x[0-9a-f]+$/i.test(chain) && BigInt(chain) === BigInt(chainId)
      && (!wallet || getAddress(accounts[0]) === wallet); } catch { return false; }
  }
  async function rpc(method, params = []) {
    try { return await provider.request({ method, params }); }
    catch (error) { fail(error?.code === 4001 ? 'WALLET_REJECTED' : 'WALLET_UNAVAILABLE'); }
  }
  async function check(stamp) {
    if (disposed || stamp !== generation || !connected) fail('WALLET_CONTEXT_CHANGED');
    const accounts = await rpc('eth_accounts'), chain = await rpc('eth_chainId');
    // A late check from an older connection must not clear a newer login.
    if (disposed || stamp !== generation || !connected) fail('WALLET_CONTEXT_CHANGED');
    if (!matches(accounts, chain, connected.wallet)) {
      invalidate(); fail('WALLET_CONTEXT_CHANGED');
    }
  }
  const headers = () => ({ 'x-wallet': connected.wallet, 'x-chain-id': String(chainId),
    ...(authenticated ? { 'x-csrf-token': authenticated.csrf } : {}) });
  return {
    async connect() {
      if (disposed) fail('WALLET_DISPOSED');
      invalidate(); const stamp = generation;
      const accounts = await rpc('eth_requestAccounts'), chain = await rpc('eth_chainId');
      if (stamp !== generation || !accounts?.[0]) fail('WALLET_CONTEXT_CHANGED');
      if (!matches(accounts, chain)) fail('WRONG_CHAIN');
      try { connected = { wallet: getAddress(accounts[0]), chainId }; } catch { fail('WALLET_UNAVAILABLE'); }
      return { ...connected };
    },
    async login() {
      const stamp = generation; await check(stamp);
      const challenge = await api('/auth/nonce', { method: 'POST', body: { ...connected } });
      await check(stamp);
      const signature = await rpc('personal_sign', [hexlify(toUtf8Bytes(challenge.message)), connected.wallet]);
      await check(stamp);
      const result = await api('/auth/verify', { method: 'POST', body: { nonce: challenge.nonce, signature } });
      await check(stamp);
      if (getAddress(result.wallet) !== connected.wallet) fail('WALLET_CONTEXT_CHANGED');
      authenticated = result; return { ...result };
    },
    async resume() {
      const stamp = generation; await check(stamp);
      const result = await api('/auth/session', { headers: headers() });
      await check(stamp);
      if (getAddress(result.wallet) !== connected.wallet) fail('WALLET_CONTEXT_CHANGED');
      authenticated = result; return { ...result };
    },
    async logout() {
      const stamp = generation; await check(stamp);
      if (!authenticated) fail('AUTH_REQUIRED');
      try { return await api('/auth/logout', { method: 'POST', body: {}, headers: headers() }); }
      finally { invalidate(); }
    },
    async request(path, { method = 'GET', body, idempotencyKey, signal } = {}) {
      const stamp = generation; await check(stamp);
      if (!authenticated) fail('AUTH_REQUIRED');
      const result = await api(path, { method, body, signal, headers: { ...headers(), ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}) } });
      await check(stamp); return result;
    },
    async consent(applicationId, idempotencyKey) {
      const stamp = generation; await check(stamp);
      if (!authenticated) fail('AUTH_REQUIRED');
      const typed = await api(`/applications/${applicationId}/consent-challenge`, { method: 'POST', body: {}, headers: headers() });
      await check(stamp);
      if (typed.primaryType !== 'ApplicationTermsV4' || typed.domain?.name !== 'ClearApplicationTerms'
        || typed.domain.chainId !== chainId || typed.message?.applicationId !== applicationId
        || typed.message.learner !== connected.wallet) fail('CONSENT_CONTEXT');
      const signature = await rpc('eth_signTypedData_v4', [connected.wallet, JSON.stringify(TypedDataEncoder.getPayload(typed.domain, typed.types, typed.message))]);
      await check(stamp);
      const result = await api(`/applications/${applicationId}/consent`, { method: 'POST',
        body: { nonce: typed.message.nonce.slice(2), signature }, headers: { ...headers(), 'idempotency-key': idempotencyKey } });
      await check(stamp); return result;
    },
    // Caller first displays GET /runtimes/:policyHash and passes the reviewed
    // record. A changed deployment/config must be presented for review again.
    async finalConsent(applicationId, reviewedRuntime) {
      const stamp = generation; await check(stamp);
      if (!authenticated) fail('AUTH_REQUIRED');
      const typed = await api(`/applications/${applicationId}/final-consent-challenge`, { method: 'POST', body: {}, headers: headers() });
      await check(stamp);
      try {
        const record = typed.runtime;
        const reviewedRuntimeHash = reviewedRuntime.runtimeConfigHash;
        if (typed.primaryType !== 'TermsAcceptanceV4' || canonical(typed.types) !== canonical(finalTermsTypes)
          || canonical(record) !== canonical(reviewedRuntime) || runtimeHash(record.config) !== reviewedRuntimeHash
          || canonical(typed.domain) !== canonical(vaultDomain(record)) || typed.domain.chainId !== chainId
          || typed.message.applicationId !== applicationId || typed.message.learner !== connected.wallet
          || typed.message.policyHash !== record.config.policyHash || typed.message.runtimeConfigHash !== reviewedRuntimeHash) fail('CONSENT_CONTEXT');
      } catch { fail('CONSENT_CONTEXT'); }
      const signature = await rpc('eth_signTypedData_v4', [connected.wallet, JSON.stringify(TypedDataEncoder.getPayload(typed.domain, typed.types, typed.message))]);
      await check(stamp);
      const result = await api(`/applications/${applicationId}/final-consent`, { method: 'POST',
        body: { nonce: typed.message.nonce.slice(2), signature }, headers: headers() });
      await check(stamp); return result;
    },
    // Display the session and runtime first. ownerPublicKey must come separately
    // from the selected collector; never derive this expectation from the response.
    async authorizeProofSession(applicationId, reviewedSession, reviewedRuntime, { ownerPublicKey, signal } = {}) {
      if (proofAuthorizationPending) throw proofAuthorizationError('PROOF_AUTHORIZATION_BUSY');
      if (signal !== undefined && !(signal instanceof AbortSignal)) throw proofAuthorizationError('API_REQUEST_INVALID');
      const pin = pinProofAuthorization(applicationId, reviewedSession, reviewedRuntime, ownerPublicKey);
      const stamp = generation;
      let sent = false;
      proofAuthorizationPending = true;
      const step = run => awaitProofOperation(() => {
        if (disposed || stamp !== generation || !connected) fail('WALLET_CONTEXT_CHANGED');
        return run();
      }, signal, sent);
      const guard = async () => { await step(() => check(stamp)); if (!authenticated) fail('AUTH_REQUIRED'); };
      try {
        await guard();
        validateProofAuthorization(pin, pin.session, connected.wallet, chainId, clock());
        const path = `/applications/${applicationId}/proof-sessions/${pin.session.proofSessionId}`;
        const current = await step(() => api(path, { headers: headers(), signal }));
        await guard();
        // Validation pins a private copy so a custom API cannot mutate the message
        // while the wallet prompt is open.
        const typed = structuredClone(validateProofAuthorization(pin, current, connected.wallet, chainId, clock()));
        const signature = await step(() => rpc('eth_signTypedData_v4', [connected.wallet,
          JSON.stringify(TypedDataEncoder.getPayload(typed.domain, typed.types, typed.message))]));
        await guard();
        validateProofAuthorization(pin, pin.session, connected.wallet, chainId, clock());
        try {
          if (typeof signature !== 'string' || verifyTypedData(typed.domain, typed.types, typed.message, signature) !== connected.wallet) throw new Error();
        } catch { throw proofAuthorizationError('WALLET_SIGNATURE_INVALID'); }
        const result = await step(() => {
          sent = true;
          return api(path + '/authorize', { method: 'POST', body: { requestNonce: typed.message.requestNonce, signature }, headers: headers(), signal });
        });
        await guard();
        validateProofAuthorization(pin, result, connected.wallet, chainId, clock(), true);
        return result;
      } catch (error) {
        if (sent && error.name !== 'ApiRequestError') Object.assign(error, { outcome: 'UNKNOWN', nextAction: 'CHECK_RESULT', retryable: false });
        throw error;
      } finally { proofAuthorizationPending = false; }
    },
    dispose() { invalidate(); disposed = true; for (const name of ['accountsChanged', 'chainChanged', 'disconnect']) provider.removeListener(name, invalidate); },
  };
}
