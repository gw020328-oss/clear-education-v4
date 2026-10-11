// W02 A: pure synthetic inspection. No collector, session acceptance, or payment API.
import { computeAddress, getBytes, id, SigningKey, verifyTypedData } from 'ethers';
import { assertVerifiedProof, assertValidProofsByHash, getIdentifierFromClaimInfo, recoverSignersOfSignedClaim, runTeeVerification } from '@reclaimprotocol/js-sdk';
import { bindingHash, bindingTypes } from './offline-adapter.mjs';

export const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`
  : JSON.stringify(value);
const requireValue = (value, code) => { if (!value) throw new Error(code); };
const keys = (value, required, optional = []) => {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), 'OBJECT_REQUIRED');
  requireValue(required.every(k => Object.hasOwn(value, k)) && Object.keys(value).every(k => [...required, ...optional].includes(k)), 'SCHEMA_KEYS');
};
// Spike restriction, not a general HTTP JSON parser: rejects ambiguous/duplicate keys
// by requiring exact canonical spelling of signed JSON, without rewriting the proof.
function signedJson(value) {
  requireValue(typeof value === 'string', 'SIGNED_JSON');
  let parsed;
  try { parsed = JSON.parse(value); } catch { throw new Error('SIGNED_JSON'); }
  requireValue(canonical(parsed) === value, 'NON_CANONICAL_SIGNED_JSON');
  return parsed;
}
export const sourceBundleHash = bundle => id(canonical(bundle));

// Called BEFORE generation. Reserved provider/extracted fields cannot enter input.
export function buildDirectContext(record, role) {
  requireValue(['registration', 'score'].includes(role), 'SOURCE_ROLE');
  return {
    clearSchemaVersion: 4,
    clearRoute: 'DIRECT_ATTESTOR',
    clearBindingHash: bindingHash(record),
    clearSourceRole: role,
    clearSourceRequestId: record.sourceRequestIds[role],
    clearSourcePolicyHash: record.sourcePolicyBundleHash,
  };
}

function exam(fields, role) {
  keys(fields, ['exam_type', 'exam_date', 'registration_number', ...(role === 'score' ? ['total_score'] : [])]);
  requireValue(fields.exam_type === 'TOEIC', 'EXAM_TYPE');
  requireValue(typeof fields.registration_number === 'string' && /^\d{6,10}$/.test(fields.registration_number), 'EXAM_NUMBER');
  requireValue(typeof fields.exam_date === 'string' && /^\d{4}([.\/-])\d{2}\1\d{2}$/.test(fields.exam_date), 'EXAM_DATE');
  const date = fields.exam_date.replace(/[.\/]/g, '-');
  const time = Date.parse(`${date}T00:00:00Z`);
  requireValue(Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date, 'EXAM_DATE');
  if (role === 'score') {
    requireValue(typeof fields.total_score === 'string' && /^\d{2,3}$/.test(fields.total_score), 'SCORE');
    const score = Number(fields.total_score);
    requireValue(score >= 10 && score <= 990 && score % 5 === 0 && String(score) === fields.total_score, 'SCORE');
  }
  return `${fields.exam_type}:${date}:${fields.registration_number}`;
}

export async function inspectSyntheticDirectPair({ record, bundle, trustedAttestors, envelope, now }) {
  requireValue(record.dataMode === 'SYNTHETIC' && record.scope === 'W02_A_OFFLINE_ONLY', 'REAL_MODE_DISABLED');
  requireValue(record.route === 'DIRECT_ATTESTOR' && envelope.route === record.route, 'ROUTE');
  requireValue(record.state === 'CONSENTED_AND_FUNDED_SYNTHETIC', 'APPLICATION_NOT_READY');
  requireValue(Buffer.byteLength(JSON.stringify(envelope)) <= 128 * 1024, 'PAYLOAD_TOO_LARGE');
  // Pin a snapshot before the asynchronous signature checks.
  ({ record, bundle, trustedAttestors, envelope } = structuredClone({ record, bundle, trustedAttestors, envelope }));
  keys(envelope, ['route', 'proofs', 'walletSignature']);
  requireValue(Array.isArray(envelope.proofs) && envelope.proofs.length === 2, 'EXACT_PAIR_REQUIRED');
  requireValue(record.domain.name === 'ClearRefund' && record.domain.version === '4', 'DOMAIN');
  requireValue(record.binding.learner.toLowerCase() === record.fixedRecipient.toLowerCase(), 'RECIPIENT');
  requireValue(Number.isSafeInteger(now) && now >= record.createdAt && now <= Number(record.binding.expiresAt), 'SESSION_EXPIRED');
  requireValue(/^0x04[0-9a-fA-F]{128}$/.test(record.binding.ownerPublicKey), 'OWNER_KEY');
  let owner;
  try { owner = computeAddress(SigningKey.computePublicKey(record.binding.ownerPublicKey, false)); }
  catch { throw new Error('OWNER_KEY'); }
  let wallet;
  try { wallet = verifyTypedData(record.domain, bindingTypes, record.binding, envelope.walletSignature); }
  catch { throw new Error('WALLET_SIGNATURE'); }
  requireValue(wallet.toLowerCase() === record.fixedRecipient.toLowerCase(), 'WALLET_SIGNATURE');
  requireValue(sourceBundleHash(bundle) === record.sourcePolicyBundleHash, 'BUNDLE_HASH');
  requireValue(trustedAttestors.length === 1, 'TRUST_SET');
  const signer = trustedAttestors[0].id.toLowerCase();
  keys(record.sourceRequestIds, ['registration', 'score']);
  requireValue(Object.values(record.sourceRequestIds).every(v => /^0x[0-9a-f]{64}$/.test(v)) && record.sourceRequestIds.registration !== record.sourceRequestIds.score, 'SOURCE_REQUEST_IDS');
  const matched = [];
  for (const [index, role] of ['registration', 'score'].entries()) {
    const p = envelope.proofs[index], policy = bundle.sources[role];
    keys(p, ['claimData', 'identifier', 'signatures', 'witnesses'], ['extractedParameterValues']);
    keys(p.claimData, ['provider', 'parameters', 'owner', 'timestampS', 'epoch', 'context', 'identifier']);
    requireValue(p.claimData.provider === 'http', 'PROVIDER');
    requireValue(p.signatures?.length === 1 && p.witnesses?.length === 1, 'SIGNER_COUNT');
    keys(p.witnesses[0], ['id', 'url']);
    requireValue(p.witnesses[0].id.toLowerCase() === signer, 'WITNESS');
    try {
      await assertVerifiedProof(p, trustedAttestors);
      const recovered = recoverSignersOfSignedClaim({ claim: p.claimData, signatures: p.signatures.map(getBytes) });
      requireValue(recovered.length === 1 && recovered[0] === signer, 'SIGNATURE');
    } catch { throw new Error('SIGNATURE'); }
    const identifier = getIdentifierFromClaimInfo(p.claimData);
    requireValue(p.identifier === identifier && p.claimData.identifier === identifier, 'IDENTIFIER');
    requireValue(p.claimData.owner.toLowerCase() === owner.toLowerCase(), 'OWNER_BINDING');
    const t = p.claimData.timestampS;
    requireValue(Number.isSafeInteger(t) && t >= record.createdAt && t >= now - 1800 && t <= now + 60 && t <= Number(record.binding.expiresAt), 'PROOF_TIME');
    const params = signedJson(p.claimData.parameters);
    // Synthetic HTTP requests only. Current YBM policies must be reviewed separately.
    requireValue(new URL(policy.params.url).hostname === 'example.invalid', 'NON_SYNTHETIC_SOURCE');
    requireValue(canonical(params) === canonical(policy.params), 'SOURCE_POLICY');
    // Exact comparison also pins headers, which the SDK hash does not fully cover.
    assertValidProofsByHash([p], { hashes: [{ value: policy.hashes, required: true }] });
    const context = signedJson(p.claimData.context);
    const expected = buildDirectContext(record, role);
    keys(context, [...Object.keys(expected), 'extractedParameters'], ['providerHash']);
    for (const [k, v] of Object.entries(expected)) requireValue(context[k] === v, `CONTEXT_${k}`);
    if (p.extractedParameterValues !== undefined) requireValue(canonical(context.extractedParameters) === canonical(p.extractedParameterValues), 'UNSIGNED_FIELDS');
    matched.push(exam(context.extractedParameters, role));
  }
  requireValue(matched[0] === matched[1], 'EXAM_JOIN');
  return {
    status: 'SYNTHETIC_DIRECT_BINDING_PASS', bindingVerified: true,
    teeVerified: false, realYbmVerified: false, paymentAllowed: false,
    sessionConsumed: false, liveBlocker: 'REQUIRED_TEE_NOT_ESTABLISHED',
  };
}

// Separate capability check: invokes the pinned SDK's real TEE validator.
// Does not permit injecting a fake verifier or treating a signed claim as a TEE proof.
export async function checkRequiredTee(proofs, testAppSecret) {
  try {
    // SDK's array helper uses every(); empty input must not pass vacuously.
    requireValue(Array.isArray(proofs) && proofs.length === 2 && proofs.every(p => p?.claimData), 'EXACT_PAIR_REQUIRED');
    await runTeeVerification(proofs, { appSecret: testAppSecret });
    return { sdkTeeVerified: true, paymentAllowed: false, liveEnabled: false };
  } catch {
    return { sdkTeeVerified: false, paymentAllowed: false, liveEnabled: false, blocker: 'REQUIRED_TEE_REJECTED' };
  }
}
