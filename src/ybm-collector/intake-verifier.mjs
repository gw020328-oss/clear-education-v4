import { canonical, digest, exactKeys, examFields, requireValue as check } from './values.mjs';
import { policyFor, sourcePolicyHash } from './source-policy.mjs';
import { validateTrust } from './trust.mjs';
import { historyParams, historyPolicyHash, inspectHistory } from './history-policy.mjs';
import { verifyIndependently } from './history-independent.mjs';

export const INTAKE_VERIFIER = 'ybm-history-intake-verifier.1';
export const intakeTrustDigest = trust => digest({ profile: INTAKE_VERIFIER, attestors: validateTrust(trust),
  sourcePolicyHash: historyPolicyHash, singleExamPolicyHash: sourcePolicyHash, sdk: '5.1.4', engine: 'snarkjs-groth16' });
export const intakeClaimParams = session => session.purpose === 'BASELINE_HISTORY' ? historyParams() : policyFor('score', session.scoreIndex);
export const intakeClaimContext = session => ({ purpose: 'CLEAR_HISTORY_INTAKE_ONLY',
  intakeContextDigest: session.contextDigest, sourcePolicyHash: historyPolicyHash });

// Expected session and registry are server-owned, never read from the claim.
export async function verifyIntakeClaim({ proof, expected, trust }, now = Math.floor(Date.now() / 1000)) {
  check(expected.version === 'clear-history-intake.1' && expected.verifierProfile === INTAKE_VERIFIER
    && expected.verifierConfigDigest === intakeTrustDigest(trust) && expected.state === 'OPEN', 'INTAKE_EXPECTED');
  const { contextDigest, state, ...context } = expected;
  check(digest(context) === contextDigest, 'INTAKE_EXPECTED');
  check(Number.isSafeInteger(now) && now >= expected.createdAt && now < expected.expiresAt, 'PROOF_TIME');
  exactKeys(proof, ['claim', 'signature', 'attestor']);
  check(typeof proof.attestor === 'string' && validateTrust(trust).includes(proof.attestor.toLowerCase()), 'UNTRUSTED_ATTESTOR');
  check(typeof proof.signature === 'string' && /^0x[0-9a-fA-F]{130}$/.test(proof.signature), 'CLAIM_SIGNATURE');
  const c = proof.claim;
  exactKeys(c, ['provider', 'parameters', 'owner', 'timestampS', 'context', 'identifier', 'epoch']);
  check(c.provider === 'http' && typeof c.owner === 'string' && c.owner.toLowerCase() === expected.ownerAddress, 'CLAIM_OWNER');
  check(Number.isSafeInteger(c.epoch) && c.epoch >= 0, 'CLAIM_EPOCH');
  check(Number.isSafeInteger(c.timestampS) && c.timestampS >= expected.createdAt && c.timestampS <= now
    && c.timestampS < expected.expiresAt && c.timestampS >= now - 1800, 'PROOF_TIME');
  check(typeof c.parameters === 'string' && typeof c.context === 'string', 'SIGNED_JSON');
  const params = JSON.parse(c.parameters), ctx = JSON.parse(c.context);
  check(canonical(params) === c.parameters && canonical(ctx) === c.context, 'SIGNED_JSON');
  check(canonical(params) === canonical(intakeClaimParams(expected)), 'SOURCE_POLICY');
  exactKeys(ctx, ['purpose', 'intakeContextDigest', 'sourcePolicyHash', 'extractedParameters', ...(Object.hasOwn(ctx,'providerHash') ? ['providerHash'] : [])]);
  for (const [key, value] of Object.entries(intakeClaimContext(expected))) check(ctx[key] === value, 'PROOF_CONTEXT');
  const core = await import('@reclaimprotocol/attestor-core');
  check(core.getIdentifierFromClaimInfo(c) === c.identifier, 'CLAIM_IDENTIFIER');
  await core.assertValidClaimSignatures({ claim: c, signatures: { claimSignature: Buffer.from(proof.signature.slice(2), 'hex'), attestorAddress: proof.attestor } });
  if (Object.hasOwn(ctx, 'providerHash')) check(ctx.providerHash === core.hashProviderParams(params), 'PROVIDER_HASH');
  if (expected.purpose === 'BASELINE_HISTORY') {
    exactKeys(ctx.extractedParameters, ['history_html']);
    const html = ctx.extractedParameters.history_html;
    check(typeof html === 'string' && /^<table\b[^*>]*>[^*]*<\/table>$/is.test(html), 'HISTORY_TABLE');
    const summary = inspectHistory(html, now * 1000);
    check(summary.layoutSupported && summary.tableCount === 1 && !summary.duplicateRows && !summary.redactionInScoreTable, 'HISTORY_TABLE');
  } else {
    check(expected.purpose === 'ACHIEVEMENT', 'INTAKE_PURPOSE');
    const fields = examFields(ctx.extractedParameters, 'score');
    const dayStart = Date.parse(fields.exam_date + 'T00:00:00+09:00') / 1000;
    // Date-only source cannot prove exact time or publication. Reject disjoint
    // days; overlapping boundary days still remain UNKNOWN, never eligible.
    check(dayStart < expected.period.until && dayStart + 86400 > expected.period.from && dayStart <= now, 'EXAM_PERIOD');
  }
  return { contextDigest, collectedAt: c.timestampS, proofVerified: true, wholeHistoryTableClaim: expected.purpose === 'BASELINE_HISTORY',
    independentProcess: false, claimIdentifier: c.identifier };
}

export function createIntakeVerifier(trust) {
  const pinned = validateTrust(trust);
  return (proof, expected, { signal } = {}) => verifyIndependently({ proof, expected, trust: pinned },
    { signal, workerUrl: new URL('./intake-verifier-worker.mjs', import.meta.url) });
}
