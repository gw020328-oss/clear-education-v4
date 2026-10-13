import { SigningKey, TypedDataEncoder } from 'ethers';
import { canonical, exactKeys, freeze, hash32, timestamp } from '../policy/values.mjs';
import { runtimeHash, vaultDomain } from '../vault/encoding.mjs';
import { proofBindingTypes } from './proof-binding.mjs';

// Browser-safe validation only. Never imports the server, collector or a key store.
export function proofAuthorizationError(code, sent = false) {
  return Object.assign(new Error(code), { code, outcome: sent ? 'UNKNOWN' : 'NOT_SENT', retryable: false,
    nextAction: sent ? 'CHECK_RESULT' : code === 'API_ABORTED' ? 'NONE' : 'REFRESH_STATE' });
}

export function pinProofAuthorization(applicationId, session, runtime, ownerPublicKey) {
  try {
    hash32(applicationId, 'CONTEXT'); hash32(session.proofSessionId, 'CONTEXT');
    if (typeof ownerPublicKey !== 'string' || !/^0x04[0-9a-fA-F]{128}$/.test(ownerPublicKey)
      || SigningKey.computePublicKey(ownerPublicKey, false).toLowerCase() !== ownerPublicKey.toLowerCase()) throw new Error();
    return freeze(structuredClone({ applicationId, session, runtime, ownerPublicKey }));
  } catch { throw proofAuthorizationError('PROOF_AUTHORIZATION_CONTEXT'); }
}

export function validateProofAuthorization(pin, session, wallet, chainId, now, authorized = false) {
  try {
    const { applicationId, runtime, ownerPublicKey } = pin, typed = session.typedData, m = typed.message;
    exactKeys(typed, ['domain', 'types', 'primaryType', 'message'], 'CONTEXT');
    exactKeys(m, proofBindingTypes.ProofSessionBindingV4.map(f => f.name), 'CONTEXT');
    for (const field of ['applicationId', 'policyHash', 'runtimeConfigHash', 'proofSessionId', 'requestNonce']) hash32(m[field], 'CONTEXT');
    timestamp(session.issuedAt, 'CONTEXT'); timestamp(session.expiresAt, 'CONTEXT');
    if (typed.primaryType !== 'ProofSessionBindingV4' || canonical(typed.types) !== canonical(proofBindingTypes)
      || canonical(typed.domain) !== canonical(vaultDomain(runtime)) || typed.domain.chainId !== chainId
      || runtimeHash(runtime.config) !== runtime.runtimeConfigHash
      || session.applicationId !== applicationId || m.applicationId !== applicationId || m.learner !== wallet
      || m.policyHash !== runtime.config.policyHash || m.runtimeConfigHash !== runtime.runtimeConfigHash
      || session.proofSessionId !== pin.session.proofSessionId || m.proofSessionId !== session.proofSessionId
      || m.ownerPublicKey.toLowerCase() !== ownerPublicKey.toLowerCase() || m.expiresAt !== session.expiresAt
      || canonical(typed) !== canonical(pin.session.typedData) || session.issuedAt !== pin.session.issuedAt
      || session.expiresAt !== pin.session.expiresAt || session.dataMode !== 'SYNTHETIC'
      || session.collectionEnabled !== false || session.proofVerified !== false || session.paymentAllowed !== false
      || Number(session.expiresAt) <= Number(session.issuedAt) || Number(session.expiresAt) - Number(session.issuedAt) > 1800
      || !Number.isSafeInteger(now) || now < 0) throw new Error();
    if (authorized) {
      timestamp(session.authorizedAt, 'CONTEXT');
      if (session.state !== 'AUTHORIZED' || Number(session.authorizedAt) < Number(session.issuedAt)
        || Number(session.authorizedAt) >= Number(session.expiresAt) || Number(session.authorizedAt) > now
        || session.bindingDigest !== TypedDataEncoder.hash(typed.domain, typed.types, m)) throw new Error();
    } else if (session.state !== 'ISSUED' || session.bindingDigest !== null || session.authorizedAt !== null) {
      throw proofAuthorizationError('PROOF_AUTHORIZATION_STATE');
    }
    if (now < Number(session.issuedAt) || now >= Number(session.expiresAt)) {
      throw proofAuthorizationError('PROOF_SESSION_EXPIRED');
    }
    return typed;
  } catch (error) {
    if (['PROOF_AUTHORIZATION_STATE', 'PROOF_SESSION_EXPIRED'].includes(error.code)) throw error;
    throw proofAuthorizationError('PROOF_AUTHORIZATION_CONTEXT');
  }
}

// EIP-1193 has no portable prompt-cancel operation. Stop waiting on abort and
// consume/discard a late response; never let it continue to the authorization POST.
export function awaitProofOperation(run, signal, sent) {
  if (signal?.aborted) return Promise.reject(proofAuthorizationError('API_ABORTED', sent));
  return new Promise((resolve, reject) => {
    const abort = () => reject(proofAuthorizationError('API_ABORTED', sent));
    signal?.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(() => {
      if (signal?.aborted) throw proofAuthorizationError('API_ABORTED', sent);
      return run();
    }).then(resolve, reject).finally(() => signal?.removeEventListener('abort', abort));
  });
}
