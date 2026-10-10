// W02 synthetic cryptographic spike. Never a REAL_YBM verifier or payment authority.
import { createHash } from 'node:crypto';
import { computeAddress, TypedDataEncoder, verifyTypedData, getBytes } from 'ethers';
import { assertVerifiedProof, assertValidProofsByHash, getIdentifierFromClaimInfo, recoverSignersOfSignedClaim } from '@reclaimprotocol/js-sdk';

export const bindingTypes = { ProofSessionBindingV4: [
  { name: 'applicationId', type: 'bytes32' },
  { name: 'learner', type: 'address' },
  { name: 'policyHash', type: 'bytes32' },
  { name: 'runtimeConfigHash', type: 'bytes32' },
  { name: 'proofSessionId', type: 'bytes32' },
  { name: 'requestNonce', type: 'bytes32' },
  { name: 'ownerPublicKey', type: 'bytes' },
  { name: 'expiresAt', type: 'uint256' },
] };
const fail = (code) => { throw new Error(code); };
const requireValue = (condition, code) => { if (!condition) fail(code); };
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  : JSON.stringify(value);
export const bindingHash = (record) => TypedDataEncoder.hash(record.domain, bindingTypes, record.binding);

function normalizeDate(input) {
  requireValue(typeof input === 'string' && /^\d{4}([.\/-])\d{2}\1\d{2}$/.test(input), 'INVALID_DATE');
  const value = input.replace(/[.\/]/g, '-');
  const date = new Date(`${value}T00:00:00.000Z`);
  requireValue(Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value, 'INVALID_DATE');
  return value;
}
function extractExam(fields, role) {
  requireValue(fields && typeof fields === 'object' && !Array.isArray(fields), 'MISSING_FIELDS');
  requireValue(fields.exam_type === 'TOEIC', 'EXAM_TYPE');
  requireValue(typeof fields.registration_number === 'string' && /^\d{6,10}$/.test(fields.registration_number), 'REGISTRATION_NUMBER');
  const value = { examType: fields.exam_type, examDate: normalizeDate(fields.exam_date), registrationNumber: fields.registration_number };
  if (role === 'score') {
    requireValue(typeof fields.total_score === 'string' && /^(?:0|[1-9]\d{0,2})$/.test(fields.total_score), 'SCORE_FORMAT');
    const score = Number(fields.total_score);
    requireValue(score >= 10 && score <= 990 && score % 5 === 0, 'SCORE_RANGE');
    value.totalScore = score;
  }
  return value;
}

export function createOfflineAdapter({ record: input, trustedAttestors, sourcePolicies, now }) {
  // Trusted, server-created record in the spike; not accepted from the callback.
  const record = structuredClone(input);
  const policies = structuredClone(sourcePolicies);
  const attestors = structuredClone(trustedAttestors);
  requireValue(record.dataMode === 'SYNTHETIC' && record.scope === 'W02_OFFLINE_ONLY', 'REAL_MODE_DISABLED');
  requireValue(attestors.length === 1, 'PINNED_SINGLE_ATTESTOR_REQUIRED');
  requireValue(record.state === 'CONSENTED_AND_FUNDED_SYNTHETIC', 'APPLICATION_NOT_READY');
  requireValue(record.domain.name === 'ClearRefund' && record.domain.version === '4', 'DOMAIN_VERSION');
  requireValue(record.binding.learner.toLowerCase() === record.fixedRecipient.toLowerCase(), 'RECIPIENT_CHANGED');
  for (const role of ['registration', 'score']) {
    requireValue(policies[role]?.providerId && policies[role]?.providerVersion && policies[role]?.hashes?.length, 'UNPINNED_SOURCE');
    requireValue(record.reclaimSessionIds[role], 'MISSING_SOURCE_SESSION');
  }
  let acceptedDigest;
  let acceptedResult;
  let acceptanceCount = 0;

  async function validateOne(proof, role, checkedAt) {
    const claim = proof?.claimData;
    requireValue(claim && claim.provider === 'http', 'SOURCE_PROVIDER');
    requireValue(Array.isArray(proof.signatures) && proof.signatures.length === 1 && Array.isArray(proof.witnesses) && proof.witnesses.length === 1, 'SIGNER_COUNT');
    const trusted = attestors[0].id.toLowerCase();
    requireValue(proof.witnesses[0].id?.toLowerCase() === trusted, 'WITNESS_METADATA');
    try {
      await assertVerifiedProof(proof, attestors);
      const recovered = recoverSignersOfSignedClaim({ claim, signatures: proof.signatures.map(getBytes) });
      requireValue(recovered.length === 1 && recovered[0] === trusted, 'SIGNER_NOT_PINNED');
    } catch { fail('SIGNATURE'); }
    const identifier = getIdentifierFromClaimInfo(claim);
    requireValue(proof.identifier === identifier && claim.identifier === identifier, 'IDENTIFIER');
    const policy = policies[role];
    const params = JSON.parse(claim.parameters);
    requireValue(params.url === policy.url && params.method === policy.method, 'SOURCE_REQUEST');
    try { assertValidProofsByHash([proof], { hashes: [{ value: policy.hashes, required: true }] }); }
    catch { fail('SOURCE_POLICY'); }
    requireValue(claim.owner?.toLowerCase() === computeAddress(record.binding.ownerPublicKey).toLowerCase(), 'OWNER_BINDING');
    requireValue(Number.isSafeInteger(claim.timestampS), 'PROOF_TIME');
    requireValue(claim.timestampS >= record.createdAt && claim.timestampS >= checkedAt - 1800 && claim.timestampS <= checkedAt + 60 && claim.timestampS <= Number(record.binding.expiresAt), 'PROOF_TIME');
    const context = JSON.parse(claim.context);
    requireValue(context.clearBindingHash === bindingHash(record), 'CONTEXT_BINDING');
    requireValue(context.clearSourceRole === role, 'SOURCE_ROLE');
    requireValue(context.reclaimSessionId === record.reclaimSessionIds[role], 'RECLAIM_SESSION');
    // The convenience fields/publicData are not an authority for the score.
    if (proof.extractedParameterValues !== undefined) {
      requireValue(canonical(proof.extractedParameterValues) === canonical(context.extractedParameters), 'UNSIGNED_FIELDS_MISMATCH');
    }
    return extractExam(context.extractedParameters, role);
  }

  return {
    async accept({ proofs, walletSignature }) {
      requireValue(Array.isArray(proofs) && proofs.length === 2, 'EXACT_PAIR_REQUIRED');
      const payload = JSON.stringify({ proofs, walletSignature });
      requireValue(Buffer.byteLength(payload) <= 128 * 1024, 'PAYLOAD_TOO_LARGE');
      const snapshot = JSON.parse(payload); // Do not let caller mutate data across awaits.
      const digest = createHash('sha256').update(canonical(snapshot)).digest('hex');
      if (acceptedDigest) {
        requireValue(digest === acceptedDigest, 'NONCE_REPLAY');
        return { ...acceptedResult, duplicate: true };
      }
      const checkedAt = now();
      requireValue(Number.isSafeInteger(checkedAt) && checkedAt >= record.createdAt && checkedAt <= Number(record.binding.expiresAt), 'SESSION_EXPIRED');
      let signer;
      try { signer = verifyTypedData(record.domain, bindingTypes, record.binding, snapshot.walletSignature); }
      catch { fail('WALLET_SIGNATURE'); }
      requireValue(signer.toLowerCase() === record.fixedRecipient.toLowerCase(), 'WALLET_SIGNATURE');
      const registration = await validateOne(snapshot.proofs[0], 'registration', checkedAt);
      const score = await validateOne(snapshot.proofs[1], 'score', checkedAt);
      requireValue(registration.examType === score.examType && registration.examDate === score.examDate && registration.registrationNumber === score.registrationNumber, 'EXAM_JOIN');
      requireValue(now() <= Number(record.binding.expiresAt), 'SESSION_EXPIRED');
      // One-process atomic section only. Durable DB/transaction design belongs to W06/W08.
      if (acceptedDigest) {
        requireValue(digest === acceptedDigest, 'NONCE_REPLAY');
        return { ...acceptedResult, duplicate: true };
      }
      acceptedResult = { status: 'SYNTHETIC_PAIR_BOUND', duplicate: false, paymentAllowed: false, realYbmVerified: false };
      acceptedDigest = digest;
      acceptanceCount += 1;
      return { ...acceptedResult };
    },
    getAcceptanceCount: () => acceptanceCount,
  };
}
