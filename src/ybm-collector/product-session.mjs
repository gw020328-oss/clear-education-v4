import { Wallet } from 'ethers';
import { canonical, hash, requireRule, RuleError } from '../policy/values.mjs';
import { ownerMessage, PRODUCT_PROOF_VERSION, validateSourceEnvelope } from '../product-proof/contract.mjs';
import { RawProofMemory } from '../mac-collector/storage.mjs';

function abortable(pending, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(new RuleError('PRODUCT_CANCELLED')); };
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(pending).then(value => { signal.removeEventListener('abort', abort); resolve(value); },
      error => { signal.removeEventListener('abort', abort); reject(error); });
    if (signal.aborted) abort();
  });
}

// Synthetic driver only. No Chrome/official Attestor is opened here. A future
// live adapter must resolve B2a's source coverage and storage preflight first.
export function createProductCollector({ dataMode = 'SYNTHETIC', now = () => Math.floor(Date.now() / 1000) } = {}) {
  requireRule(dataMode === 'SYNTHETIC', 'PROOF_SOURCE_INCOMPLETE');
  let owner = Wallet.createRandom(), used = false;
  const cancelled = new AbortController();
  const ownerPublicKey = owner.signingKey.publicKey;
  return {
    ownerPublicKey,
    async collect({ session, source, submit, signal }) {
      requireRule(!used && owner, 'PRODUCT_COLLECTOR_CLOSED'); used = true;
      const memory = new RawProofMemory(); let envelope, sourceValue, body, bytes, scope = signal;
      const guard = () => {
        scope?.throwIfAborted();
        requireRule(session?.dataMode === 'SYNTHETIC' && session.state === 'AUTHORIZED'
          && session.collectionEnabled === false && session.proofVerified === false && session.paymentAllowed === false, 'PROOF_SOURCE_INCOMPLETE');
        requireRule(session.typedData.message.ownerPublicKey === ownerPublicKey, 'PRODUCT_OWNER_MISMATCH');
        requireRule(now() >= Number(session.authorizedAt) && now() < Number(session.expiresAt), 'PROOF_SESSION_EXPIRED');
      };
      try {
        guard(); requireRule(source?.profile === PRODUCT_PROOF_VERSION && typeof source.close === 'function', 'PROOF_SOURCE_INCOMPLETE');
        const remaining = (Number(session.expiresAt) - now()) * 1000;
        requireRule(Number.isSafeInteger(remaining) && remaining > 0 && remaining <= 1800000, 'PROOF_SESSION_EXPIRED');
        scope = AbortSignal.any([signal, cancelled.signal, AbortSignal.timeout(remaining)].filter(Boolean));
        guard(); sourceValue = await abortable(source.collect({ session: structuredClone(session), signal: scope }), scope); guard();
        validateSourceEnvelope(sourceValue);
        envelope = structuredClone(sourceValue);
        requireRule(envelope.bundle.manifest.bindingDigest === session.bindingDigest, 'PRODUCT_OWNER_MISMATCH');
        body = { ...envelope, ownerSignature: await owner.signMessage(ownerMessage(envelope)) }; guard();
        bytes = Buffer.from(canonical(body)); memory.put(session.applicationId.slice(2), bytes); bytes.fill(0);
        const submissionHash = hash(body);
        const receipt = await memory.use(session.applicationId.slice(2), raw => abortable(submit(JSON.parse(raw.toString('utf8')), { signal: scope }), scope));
        guard(); requireRule(receipt?.state === 'ACCEPTED_SYNTHETIC' && receipt.proofSessionId === session.proofSessionId
          && receipt.submissionHash === submissionHash && receipt.proofVerified === false && receipt.paymentAllowed === false, 'PRODUCT_RECEIPT');
        return receipt;
      } catch { throw new RuleError('PRODUCT_COLLECTION_FAILED'); }
      finally {
        cancelled.abort(); bytes?.fill(0); memory.close(); owner = null; envelope = sourceValue = body = undefined;
        try { await source?.close(); } catch { throw new RuleError('PRODUCT_CLEANUP_FAILED'); }
      }
    },
    close() { cancelled.abort(); owner = null; used = true; },
  };
}
