import { getAddress, SigningKey, TypedDataEncoder } from 'ethers';
import { canonical, exactKeys, freeze, hash32, identifier, timestamp } from '../policy/values.mjs';
import { proofBindingTypes } from './proof-binding.mjs';
import { awaitProofOperation } from './proof-authorization.mjs';

const allowedErrors = new Set(['AUTH_REQUIRED', 'CSRF', 'FORBIDDEN', 'PROOF_BROWSER_SESSION', 'WALLET_CONTEXT_CHANGED',
  'WALLET_REJECTED', 'WALLET_UNAVAILABLE', 'WALLET_SIGNATURE_INVALID', 'WRONG_CHAIN', 'API_ABORTED', 'API_TIMEOUT', 'API_NETWORK',
  'API_RESPONSE_INVALID', 'API_REQUEST_FAILED', 'PROOF_SESSION_NOT_FOUND', 'APPLICATION_NOT_FOUND', 'PROOF_SESSION_EXPIRED',
  'PROOF_SESSION_CANCELLED', 'PROOF_SESSION_ACTIVE', 'PROOF_OWNER_REUSED', 'PROOF_NONCE_CONSUMED', 'PROOF_SUBMISSION_CLOSED',
  'PROOF_ENROLLMENT_REQUIRED', 'PROOF_ENROLLMENT_CHANGED', 'PROOF_ENROLLMENT_SETTLED', 'PROOF_GRANT_EXISTS',
  'PROOF_AUTHORIZATION_CONTEXT', 'PROOF_AUTHORIZATION_STATE', 'PROOF_AUTHORIZATION_BUSY', 'PROOF_SOURCE_INCOMPLETE',
  'IDEMPOTENCY_CONFLICT', 'CHAIN_UNAVAILABLE', 'CHAIN_REORG', 'FLOW_RESPONSE_INVALID']);
const fail = code => { throw Object.assign(new Error(code), { code }); };
function ownerKey(value) {
  if (typeof value !== 'string' || !/^0x04[0-9a-fA-F]{128}$/.test(value)) fail('FLOW_INPUT');
  return SigningKey.computePublicKey(value, false);
}
function blocked(value) {
  if (value.dataMode !== 'SYNTHETIC' || value.collectionEnabled !== false || value.proofVerified !== false || value.paymentAllowed !== false) throw new Error();
}
function sessionValue(value, applicationId, expectedId, owner) {
  try {
    const p = structuredClone(value), typed = p.typedData, m = typed.message;
    blocked(p); hash32(p.proofSessionId, 'INVALID');
    exactKeys(typed, ['domain', 'types', 'primaryType', 'message'], 'INVALID');
    exactKeys(m, proofBindingTypes.ProofSessionBindingV4.map(f => f.name), 'INVALID');
    if (typed.primaryType !== 'ProofSessionBindingV4' || canonical(typed.types) !== canonical(proofBindingTypes)) throw new Error();
    for (const key of ['applicationId', 'policyHash', 'runtimeConfigHash', 'proofSessionId', 'requestNonce']) hash32(m[key], 'INVALID');
    timestamp(p.issuedAt, 'INVALID'); timestamp(p.expiresAt, 'INVALID');
    getAddress(m.learner); ownerKey(m.ownerPublicKey);
    if (p.applicationId !== applicationId || m.applicationId !== applicationId || m.proofSessionId !== p.proofSessionId
      || (expectedId && p.proofSessionId !== expectedId) || (owner && m.ownerPublicKey.toLowerCase() !== owner.toLowerCase())
      || m.expiresAt !== p.expiresAt || Number(p.expiresAt) <= Number(p.issuedAt)
      || Number(p.expiresAt) - Number(p.issuedAt) > 1800 || !['ISSUED', 'AUTHORIZED', 'CANCELLED', 'EXPIRED'].includes(p.state)) throw new Error();
    // A terminal session may carry a historical authorization digest.
    if (p.authorizedAt === null) {
      if (p.bindingDigest !== null || p.state === 'AUTHORIZED') throw new Error();
    } else {
      timestamp(p.authorizedAt, 'INVALID');
      if (p.state === 'ISSUED' || Number(p.authorizedAt) < Number(p.issuedAt) || Number(p.authorizedAt) >= Number(p.expiresAt)
        || p.bindingDigest !== TypedDataEncoder.hash(typed.domain, typed.types, m)) throw new Error();
    }
    return freeze(p);
  } catch { fail('FLOW_RESPONSE_INVALID'); }
}
function resultValue(value, session) {
  try {
    blocked(value);
    if (value.liveSupported !== false || value.proofSessionId !== session.proofSessionId) throw new Error();
    if (value.state === 'NOT_ACCEPTED') return { state: value.state, acceptedAt: null };
    if (value.state !== 'ACCEPTED_SYNTHETIC' || session.authorizedAt === null) throw new Error();
    timestamp(value.acceptedAt, 'INVALID');
    if (Number(value.acceptedAt) < Number(session.authorizedAt) || Number(value.acceptedAt) >= Number(session.expiresAt)) throw new Error();
    return { state: value.state, acceptedAt: value.acceptedAt };
  } catch { fail('FLOW_RESPONSE_INVALID'); }
}

// One controller belongs to one selected application and authenticated wallet
// context. No storage, collector, automatic polling, signing or write retries.
export function createProofSessionFlow({ walletClient, provider, applicationId, clock = () => Math.floor(Date.now() / 1000) }) {
  try {
    hash32(applicationId, 'FLOW_INPUT');
    if (typeof walletClient?.request !== 'function' || typeof walletClient?.authorizeProofSession !== 'function'
      || typeof provider?.on !== 'function' || typeof provider?.removeListener !== 'function' || typeof clock !== 'function') throw new Error();
  } catch { fail('FLOW_INPUT'); }
  const base = `/applications/${applicationId}/proof-sessions`, listeners = new Set();
  let current = null, pendingCreation = null, creationUncertain = false, active = null, closed = null;
  let state = freeze({ revision: 0, phase: 'IDLE', operation: null, session: null, result: null, error: null, checkedAt: null,
    needsRefresh: false, creationRecovery: false, dataMode: 'SYNTHETIC', collectionEnabled: false, proofVerified: false,
    paymentAllowed: false, grantOutboxEnabled: false });
  function publish(change) {
    state = freeze({ ...state, ...change, revision: state.revision + 1 });
    const snapshot = state;
    for (const listener of [...listeners]) { try { listener(snapshot); } catch { /* A view cannot interrupt the operation. */ } }
    return snapshot;
  }
  function ready() {
    if (closed) fail(closed);
    if (active) fail('FLOW_BUSY');
  }
  const path = id => `${base}/${id}`;
  function view(p) {
    const m = p.typedData.message;
    return { applicationId, proofSessionId: p.proofSessionId, state: p.state, issuedAt: p.issuedAt, expiresAt: p.expiresAt,
      authorizedAt: p.authorizedAt, learner: m.learner, policyHash: m.policyHash, runtimeConfigHash: m.runtimeConfigHash,
      ownerPublicKey: m.ownerPublicKey };
  }
  function errorView(error, write) {
    const code = allowedErrors.has(error?.code ?? error?.message) ? error.code ?? error.message : 'API_REQUEST_FAILED';
    const outcome = ['NOT_SENT', 'HTTP_ERROR', 'UNKNOWN'].includes(error?.outcome) ? error.outcome : write ? 'UNKNOWN' : 'NOT_SENT';
    const nextAction = write && outcome === 'UNKNOWN' ? 'CHECK_RESULT'
      : ['AUTH_REQUIRED', 'CSRF', 'PROOF_BROWSER_SESSION'].includes(code) ? 'SIGN_IN_AGAIN'
      : code === 'WALLET_CONTEXT_CHANGED' || code === 'WRONG_CHAIN' ? 'RECONNECT_WALLET'
      : code === 'PROOF_SOURCE_INCOMPLETE' ? 'WAIT_FOR_SOURCE' : 'REFRESH_STATE';
    return { code, outcome, nextAction, retryable: false };
  }
  async function run(operation, write, action, clearSession = false) {
    ready(); const op = { controller: new AbortController() }; active = op;
    if (clearSession) current = null;
    publish({ phase: 'BUSY', operation, error: null, needsRefresh: true,
      ...(clearSession ? { session: null, result: null, checkedAt: null } : {}) });
    try {
      const value = await awaitProofOperation(() => action(op.controller.signal), op.controller.signal, write);
      if (closed || active !== op) fail(closed ?? 'FLOW_CONTEXT_CHANGED');
      const now = clock(); if (!Number.isSafeInteger(now) || now < 0) fail('FLOW_RESPONSE_INVALID');
      current = value.session;
      // A known session with the pinned owner also resolves a lost create reply.
      if (pendingCreation && current.typedData.message.ownerPublicKey.toLowerCase() === pendingCreation.ownerPublicKey.toLowerCase()) { pendingCreation = null; creationUncertain = false; }
      active = null;
      return publish({ phase: 'READY', operation: null, session: view(current), result: value.result ?? null,
        error: null, checkedAt: String(now), needsRefresh: false, creationRecovery: Boolean(pendingCreation) });
    } catch (error) {
      if (closed || active !== op) fail(closed ?? 'FLOW_CONTEXT_CHANGED');
      const safe = errorView(error, write);
      if (safe.code === 'WALLET_CONTEXT_CHANGED') {
        invalidate('FLOW_CONTEXT_CHANGED'); fail('FLOW_CONTEXT_CHANGED');
      }
      if (operation === 'START') {
        creationUncertain ||= safe.outcome === 'UNKNOWN';
        if (!creationUncertain) pendingCreation = null;
      }
      active = null;
      publish({ phase: creationUncertain || (write && safe.outcome === 'UNKNOWN') ? 'RECOVERY_REQUIRED' : 'ERROR', operation: null,
        error: safe, needsRefresh: true, creationRecovery: Boolean(pendingCreation) });
      throw Object.assign(new Error(safe.code), safe);
    }
  }
  const startRequest = input => run('START', true, async signal => ({ session: sessionValue(await walletClient.request(base,
    { method: 'POST', body: { ownerPublicKey: input.ownerPublicKey }, idempotencyKey: input.idempotencyKey, signal }), applicationId, null, input.ownerPublicKey) }), true);
  function invalidate(code) {
    if (closed) {
      if (code === 'FLOW_DISPOSED' && closed !== code) { closed = code; publish({ phase: 'DISPOSED', error: null }); }
      return;
    }
    closed = code; const pending = active; active = null; current = null; pendingCreation = null; creationUncertain = false;
    pending?.controller.abort();
    publish({ phase: code === 'FLOW_DISPOSED' ? 'DISPOSED' : 'CONTEXT_CHANGED', operation: null, session: null, result: null,
      error: { code, outcome: pending ? 'UNKNOWN' : 'NOT_SENT', nextAction: 'RECONNECT_WALLET', retryable: false },
      needsRefresh: true, creationRecovery: false, checkedAt: null });
  }
  const contextChanged = () => invalidate('FLOW_CONTEXT_CHANGED');
  for (const event of ['accountsChanged', 'chainChanged', 'disconnect']) provider.on(event, contextChanged);
  return {
    getState: () => state,
    subscribe(listener) {
      if (closed) fail(closed); if (typeof listener !== 'function') fail('FLOW_INPUT');
      listeners.add(listener); try { listener(state); } catch { /* Isolate the view. */ }
      return () => listeners.delete(listener);
    },
    async start({ ownerPublicKey, idempotencyKey } = {}) {
      ready(); if (pendingCreation) fail('FLOW_RECOVERY_REQUIRED');
      if (current && (state.needsRefresh || ['ISSUED', 'AUTHORIZED'].includes(current.state))) fail('FLOW_REFRESH_REQUIRED');
      let input; try { input = freeze({ ownerPublicKey: ownerKey(ownerPublicKey), idempotencyKey: identifier(idempotencyKey, 'FLOW_INPUT') }); }
      catch { fail('FLOW_INPUT'); }
      pendingCreation = input; return startRequest(input);
    },
    async retryStart() { ready(); if (!pendingCreation) fail('FLOW_RECOVERY_REQUIRED'); return startRequest(pendingCreation); },
    async refresh(proofSessionId = current?.proofSessionId) {
      ready(); try { hash32(proofSessionId, 'FLOW_INPUT'); } catch { fail('FLOW_INPUT'); }
      return run('REFRESH', false, async signal => {
        const session = sessionValue(await walletClient.request(path(proofSessionId), { signal }), applicationId, proofSessionId,
          pendingCreation?.ownerPublicKey);
        signal.throwIfAborted();
        const result = resultValue(await walletClient.request(path(proofSessionId) + '/result', { signal }), session);
        return { session, result };
      }, current?.proofSessionId !== proofSessionId);
    },
    async authorize({ revision, reviewedRuntime, ownerPublicKey } = {}) {
      ready();
      if (!current || state.phase !== 'READY' || state.needsRefresh || state.creationRecovery || revision !== state.revision
        || current.state !== 'ISSUED') fail('FLOW_REVIEW_REQUIRED');
      let runtime; try { runtime = structuredClone(reviewedRuntime); } catch { fail('FLOW_INPUT'); }
      const reviewed = current;
      return run('AUTHORIZE', true, async signal => ({ session: sessionValue(await walletClient.authorizeProofSession(applicationId,
        reviewed, runtime, { ownerPublicKey, signal }), applicationId, reviewed.proofSessionId) }));
    },
    async cancel() {
      ready(); if (!current) fail('FLOW_REFRESH_REQUIRED');
      const id = current.proofSessionId;
      return run('CANCEL', true, async signal => {
        const session = sessionValue(await walletClient.request(path(id) + '/cancel', { method: 'POST', body: {}, signal }), applicationId, id);
        if (!['CANCELLED', 'EXPIRED'].includes(session.state)) fail('FLOW_RESPONSE_INVALID');
        return { session };
      });
    },
    stop() { active?.controller.abort(); }, // Local stop is never a server cancellation.
    dispose() {
      invalidate('FLOW_DISPOSED');
      for (const event of ['accountsChanged', 'chainChanged', 'disconnect']) provider.removeListener(event, contextChanged);
      listeners.clear();
    },
  };
}
