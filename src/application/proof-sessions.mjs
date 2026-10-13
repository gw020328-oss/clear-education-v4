import { computeAddress, SigningKey, TypedDataEncoder, verifyTypedData } from 'ethers';
import { canonical, exactKeys, freeze, hash, hash32, identifier, requireRule, RuleError } from '../policy/values.mjs';
import { vaultDomain } from '../vault/encoding.mjs';
import { PRODUCT_PROOF_VERSION, validateSubmission } from '../product-proof/contract.mjs';
import { verifyProductIndependently } from '../product-proof/independent.mjs';
import { SOURCE_CONTRACT_HASH } from '../exam-evidence/synthetic-completeness.mjs';

import { proofBindingTypes } from './proof-binding.mjs';
export { proofBindingTypes } from './proof-binding.mjs';

function ownerKey(value) {
  requireRule(typeof value === 'string' && /^0x04[0-9a-fA-F]{128}$/.test(value), 'PROOF_OWNER_KEY');
  try { const key = SigningKey.computePublicKey(value, false); return { key, address: computeAddress(key) }; }
  catch { throw new RuleError('PROOF_OWNER_KEY'); }
}

// B1 wallet authorization and B2b synthetic result acceptance are separate.
export function createProofSessionService({ db, transaction, session, owned, clock, digest, secret, signatureShape, vaultReader, policy, proofSourceSigner }) {
  const read = id => db.prepare('SELECT * FROM proof_sessions WHERE id=?').get(id);
  function applicant(context, applicationId, write = false) {
    const s = session(context, write), a = owned(applicationId, s);
    requireRule(s.role === 'participant', 'FORBIDDEN'); return { s, a };
  }
  function enrolled(a) {
    const f = db.prepare('SELECT * FROM funding WHERE application_id=?').get(a.id);
    requireRule(a.state === 'TERMS_ACCEPTED' && f?.state === 'ENROLLED', 'PROOF_ENROLLMENT_REQUIRED');
    const row = db.prepare('SELECT * FROM runtime_configs WHERE hash=? AND policy_hash=?').get(f.runtime_hash, a.policy_hash);
    requireRule(row, 'RUNTIME_NOT_BOUND');
    return { f, record: JSON.parse(row.record) };
  }
  function found(applicationId, proofSessionId) {
    hash32(proofSessionId, 'PROOF_SESSION_ID'); const p = read(proofSessionId);
    requireRule(p && p.application_id === applicationId, 'PROOF_SESSION_NOT_FOUND'); return p;
  }
  function expire(applicationId) {
    db.prepare("UPDATE proof_sessions SET state='EXPIRED' WHERE application_id=? AND state IN ('ISSUED','AUTHORIZED') AND expires_at<=?").run(applicationId, clock());
  }
  function active(p) {
    const t = clock();
    requireRule(t >= p.issued_at && t < p.expires_at && p.state !== 'EXPIRED', 'PROOF_SESSION_EXPIRED');
    requireRule(['ISSUED', 'AUTHORIZED'].includes(p.state), 'PROOF_SESSION_CANCELLED');
  }
  const view = p => ({ proofSessionId: p.id, applicationId: p.application_id, state: p.state,
    issuedAt: String(p.issued_at), expiresAt: String(p.expires_at),
    authorizedAt: p.consumed_at === null ? null : String(p.consumed_at), bindingDigest: p.binding_digest,
    typedData: JSON.parse(p.typed_data), issuanceEvidence: JSON.parse(p.issuance_evidence),
    authorizationEvidence: p.authorization_evidence === null ? null : JSON.parse(p.authorization_evidence),
    dataMode: 'SYNTHETIC', collectionEnabled: false, proofVerified: false, paymentAllowed: false });
  async function observe(a) {
    const { f, record } = enrolled(a), started = clock();
    requireRule(typeof vaultReader?.proofEnrollment === 'function', 'VAULT_NOT_CONFIGURED');
    const evidence = await vaultReader.proofEnrollment(record, JSON.parse(f.typed_data), f.signature, JSON.parse(f.evidence));
    return { f, record, evidence, started };
  }
  function recheck(a, observation) {
    const { f, record, evidence, started } = observation, t = clock();
    requireRule(canonical({ ...enrolled(a).f }) === canonical({ ...f }), 'PROOF_ENROLLMENT_CHANGED');
    requireRule(t >= started && t <= started + 30, 'PROOF_CHAIN_CHECK_EXPIRED');
    requireRule(t >= Number(record.config.normalSubmitFrom) && t <= Number(evidence.submitUntil), 'PROOF_SUBMISSION_CLOSED');
  }
  const resultRow = id => db.prepare('SELECT * FROM proof_results WHERE proof_session_id=?').get(id);
  const receipt = p => ({ proofSessionId: p.proof_session_id, state: 'ACCEPTED_SYNTHETIC',
    submissionHash: p.submission_hash, snapshotHash: p.snapshot_hash, acceptedAt: String(p.accepted_at),
    verifierVersion: p.verifier_version, dataMode: 'SYNTHETIC', liveSupported: false,
    collectionEnabled: false, proofVerified: false, paymentAllowed: false });
  function productContext(context, applicationId, proofSessionId, write = true) {
    const { s, a } = applicant(context, applicationId, write), p = found(applicationId, proofSessionId);
    active(p); requireRule(p.state === 'AUTHORIZED' && p.consumed_at !== null, 'PRODUCT_AUTHORIZATION_REQUIRED');
    requireRule(s.digest === p.session_digest, 'PROOF_BROWSER_SESSION');
    const compiled = policy(a.policy_hash);
    requireRule(proofSourceSigner && compiled.policy.sourcePolicySetHash === SOURCE_CONTRACT_HASH, 'PROOF_SOURCE_INCOMPLETE');
    return { a, p, compiled };
  }
  return {
    async acceptProofEvidence(context, applicationId, proofSessionId, body, { signal } = {}) {
      // Fix a private validated copy before the first await. No caller-supplied
      // verifier result, context, trust key, clock or raw cookie/key crosses IPC.
      const initial = productContext(context, applicationId, proofSessionId);
      validateSubmission(body); const submission = structuredClone(body), submissionHash = hash(submission);
      signal?.throwIfAborted();
      const previous = resultRow(proofSessionId), started = clock();
      if (previous) requireRule(previous.submission_hash === submissionHash, 'PRODUCT_RESULT_CONFLICT');
      let verified;
      if (!previous) {
        const { supplementEndAt, claimUntil, ...draft } = initial.compiled.policy;
        verified = await verifyProductIndependently({ draft, session: view(initial.p), sourceSigner: proofSourceSigner,
          submission, now: String(started) }, { signal });
        requireRule(verified.submissionHash === submissionHash && verified.bindingDigest === initial.p.binding_digest
          && verified.policyHash === initial.a.policy_hash && verified.snapshotHash === hash(verified.snapshot), 'PRODUCT_VERIFICATION_FAILED');
      }
      const observation = await observe(initial.a);
      return transaction(() => {
        signal?.throwIfAborted();
        const current = productContext(context, applicationId, proofSessionId); recheck(current.a, observation);
        const accepted = resultRow(proofSessionId);
        if (accepted) {
          requireRule(accepted.submission_hash === submissionHash, 'PRODUCT_RESULT_CONFLICT');
          return receipt(accepted);
        }
        const t = clock();
        requireRule(verified && t >= started && t <= started + 30 && t >= Number(verified.observedAt)
          && t <= Number(verified.observedAt) + 300, 'PRODUCT_VERIFICATION_STALE');
        db.prepare(`INSERT INTO proof_results VALUES(?,?,?,?,?,?,?,?,?)`).run(proofSessionId, submissionHash,
          verified.snapshotHash, PRODUCT_PROOF_VERSION, proofSourceSigner, t, Number(verified.observedAt),
          canonical(verified.snapshot), canonical(observation.evidence));
        return receipt(resultRow(proofSessionId));
      });
    },
    getProofResult(context, applicationId, proofSessionId) {
      applicant(context, applicationId); found(applicationId, proofSessionId);
      const accepted = resultRow(proofSessionId);
      return accepted ? receipt(accepted) : { proofSessionId, state: 'NOT_ACCEPTED', dataMode: 'SYNTHETIC',
        liveSupported: false, collectionEnabled: false, proofVerified: false, paymentAllowed: false };
    },
    // Internal only: no HTTP route exposes scores. B4 must perform its own final
    // acceptance/issuance checks; this read is not a grant or exam reservation.
    async getAcceptedExamSnapshot(context, applicationId, proofSessionId) {
      const initial = productContext(context, applicationId, proofSessionId, false), observation = await observe(initial.a);
      return transaction(() => {
        const current = productContext(context, applicationId, proofSessionId, false); recheck(current.a, observation);
        const accepted = resultRow(proofSessionId);
        requireRule(accepted, 'PRODUCT_RESULT_MISSING');
        requireRule(clock() >= accepted.observed_at && clock() <= accepted.observed_at + 300, 'PRODUCT_VERIFICATION_STALE');
        const snapshot = JSON.parse(accepted.snapshot);
        requireRule(hash(snapshot) === accepted.snapshot_hash, 'PRODUCT_RESULT_INTEGRITY');
        return freeze(snapshot);
      });
    },
    async createProofSession(context, applicationId, body, key) {
      exactKeys(body, ['ownerPublicKey'], 'PROOF_SESSION_SCHEMA');
      const owner = ownerKey(body.ownerPublicKey); key = identifier(key, 'IDEMPOTENCY_KEY');
      const { a } = applicant(context, applicationId, true);
      const observation = await observe(a);
      return transaction(() => {
        const current = applicant(context, applicationId, true); recheck(current.a, observation);
        expire(applicationId);
        const previous = db.prepare('SELECT * FROM proof_sessions WHERE application_id=? AND request_key=?').get(applicationId, key);
        if (previous) {
          requireRule(previous.owner_address === owner.address, 'IDEMPOTENCY_CONFLICT');
          requireRule(previous.session_digest === current.s.digest, 'PROOF_BROWSER_SESSION');
          // An idempotency key never creates a replacement, even after expiry.
          return view(previous);
        }
        requireRule(!db.prepare("SELECT id FROM proof_sessions WHERE application_id=? AND state IN ('ISSUED','AUTHORIZED')").get(applicationId), 'PROOF_SESSION_ACTIVE');
        requireRule(!db.prepare('SELECT id FROM proof_sessions WHERE owner_address=?').get(owner.address), 'PROOF_OWNER_REUSED');
        const t = clock(), expires = Math.min(t + 1800, Number(observation.evidence.submitUntil) + 1);
        const proofSessionId = '0x' + secret(), requestNonce = '0x' + secret();
        const typed = { domain: vaultDomain(observation.record), types: structuredClone(proofBindingTypes), primaryType: 'ProofSessionBindingV4',
          message: { applicationId, learner: a.wallet, policyHash: a.policy_hash, runtimeConfigHash: observation.f.runtime_hash,
            proofSessionId, requestNonce, ownerPublicKey: owner.key, expiresAt: String(expires) } };
        db.prepare(`INSERT INTO proof_sessions
          (id,application_id,session_digest,runtime_hash,request_key,owner_address,nonce_digest,typed_data,state,issued_at,expires_at,issuance_evidence)
          VALUES(?,?,?,?,?,?,?,?,'ISSUED',?,?,?)`).run(proofSessionId, applicationId, current.s.digest, observation.f.runtime_hash,
          key, owner.address, digest(requestNonce), canonical(typed), t, expires, canonical(observation.evidence));
        return view(read(proofSessionId));
      });
    },
    getProofSession(context, applicationId, proofSessionId) {
      return transaction(() => { applicant(context, applicationId); expire(applicationId); return view(found(applicationId, proofSessionId)); });
    },
    listProofSessions(context, applicationId) {
      return transaction(() => {
        applicant(context, applicationId); expire(applicationId);
        return db.prepare('SELECT * FROM proof_sessions WHERE application_id=? ORDER BY issued_at DESC,id DESC LIMIT 100').all(applicationId).map(view);
      });
    },
    async authorizeProofSession(context, applicationId, proofSessionId, body) {
      exactKeys(body, ['requestNonce', 'signature'], 'PROOF_SESSION_SCHEMA');
      hash32(body.requestNonce, 'PROOF_NONCE'); signatureShape(body.signature);
      function validate() {
        const { s, a } = applicant(context, applicationId, true), p = found(applicationId, proofSessionId);
        active(p);
        requireRule(p.session_digest === s.digest, 'PROOF_BROWSER_SESSION');
        requireRule(p.nonce_digest === digest(body.requestNonce), 'PROOF_NONCE');
        const typed = JSON.parse(p.typed_data);
        let signer; try { signer = verifyTypedData(typed.domain, typed.types, typed.message, body.signature); } catch { signer = null; }
        requireRule(signer === a.wallet, 'SIGNATURE');
        if (p.consumed_at !== null) requireRule(p.state === 'AUTHORIZED' && p.signature_hash === digest(body.signature.toLowerCase()), 'PROOF_NONCE_CONSUMED');
        return { a, p, typed };
      }
      const initial = validate(), observation = await observe(initial.a);
      return transaction(() => {
        const { a, p, typed } = validate(); recheck(a, observation);
        if (p.consumed_at !== null) return view(p); // Stable receipt, no second consumption.
        const bindingDigest = TypedDataEncoder.hash(typed.domain, typed.types, typed.message);
        const updated = db.prepare(`UPDATE proof_sessions SET state='AUTHORIZED',consumed_at=?,signature_hash=?,binding_digest=?,authorization_evidence=?
          WHERE id=? AND state='ISSUED' AND consumed_at IS NULL`).run(clock(), digest(body.signature.toLowerCase()), bindingDigest,
          canonical(observation.evidence), proofSessionId);
        requireRule(updated.changes === 1, 'PROOF_NONCE_CONSUMED');
        return view(read(proofSessionId));
      });
    },
    cancelProofSession(context, applicationId, proofSessionId, body) {
      exactKeys(body, [], 'PROOF_SESSION_SCHEMA');
      return transaction(() => {
        applicant(context, applicationId, true); expire(applicationId); const p = found(applicationId, proofSessionId);
        if (['ISSUED', 'AUTHORIZED'].includes(p.state)) db.prepare("UPDATE proof_sessions SET state='CANCELLED' WHERE id=?").run(proofSessionId);
        return view(read(proofSessionId));
      });
    },
  };
}
