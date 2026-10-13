import { computeAddress, getAddress, getBytes, verifyMessage } from 'ethers';
import { array, canonical, exactKeys, freeze, hash, hash32, identifier, requireRule, RuleError, timestamp } from '../policy/values.mjs';
import { compileSyntheticPolicy } from '../policy/compiler.mjs';
import { assessSyntheticExamEvidence, SOURCE_CONTRACT_HASH } from '../exam-evidence/synthetic-completeness.mjs';
import { proofBindingTypes } from '../application/proof-binding.mjs';

export const PRODUCT_PROOF_VERSION = 'synthetic-product-proof.1';
export const MAX_SUBMISSION_BYTES = 65536;
// Includes the trusted policy (up to 10,000 lecture IDs), not just the proof.
export const MAX_VERIFIER_BYTES = 1024 * 1024;
const sig = v => requireRule(typeof v === 'string' && /^0x[0-9a-fA-F]{130}$/.test(v), 'PRODUCT_SIGNATURE');
const text = v => { identifier(v, 'PRODUCT_FIELD'); requireRule(v.length <= 64, 'PRODUCT_FIELD'); };
const count = v => requireRule(Number.isSafeInteger(v) && v >= 0 && v <= 100, 'PRODUCT_FIELD');
const address = value => { try { return getAddress(value); } catch { throw new RuleError('PRODUCT_FIELD'); } };
// Allow-list every nested field before IPC. No cookies, keys, raw HTML,
// transcripts, caller verification flags or unsigned extracted copies.
export function validateSourceEnvelope(value) {
  exactKeys(value, ['profile', 'bundle', 'sourceSignature'], 'PRODUCT_SCHEMA');
  requireRule(value.profile === PRODUCT_PROOF_VERSION, 'PROOF_SOURCE_INCOMPLETE'); sig(value.sourceSignature);
  exactKeys(value.bundle, ['manifest', 'pages'], 'PRODUCT_SCHEMA');
  const m = value.bundle.manifest;
  exactKeys(m, ['version', 'dataMode', 'sourcePolicySetHash', 'policyHash', 'bindingDigest', 'learnerId', 'subjectRef',
    'snapshotId', 'observedAt', 'scope', 'inventories'], 'PRODUCT_SCHEMA');
  requireRule(m.dataMode === 'SYNTHETIC' && m.sourcePolicySetHash === SOURCE_CONTRACT_HASH, 'PROOF_SOURCE_INCOMPLETE');
  for (const key of ['version', 'learnerId', 'snapshotId']) text(m[key]);
  for (const key of ['sourcePolicySetHash', 'policyHash', 'bindingDigest', 'subjectRef']) hash32(m[key], 'PRODUCT_FIELD');
  timestamp(m.observedAt, 'PRODUCT_FIELD');
  exactKeys(m.scope, ['examType', 'examDateStart', 'examDateEnd', 'allStatuses', 'coverageStart', 'coverageEnd'], 'PRODUCT_SCHEMA');
  for (const key of ['examType', 'examDateStart', 'examDateEnd', 'coverageStart', 'coverageEnd']) text(m.scope[key]);
  requireRule(typeof m.scope.allStatuses === 'boolean', 'PRODUCT_FIELD');
  array(m.inventories, 2, 'PRODUCT_SCHEMA');
  for (const i of m.inventories) {
    exactKeys(i, ['role', 'totalRows', 'pages', 'terminalPageId'], 'PRODUCT_SCHEMA'); text(i.role); count(i.totalRows); text(i.terminalPageId);
    array(i.pages, 100, 'PRODUCT_SCHEMA');
    for (const p of i.pages) {
      exactKeys(p, ['pageId', 'offset', 'rowCount', 'pageHash'], 'PRODUCT_SCHEMA'); text(p.pageId); count(p.offset); count(p.rowCount); hash32(p.pageHash, 'PRODUCT_FIELD');
    }
  }
  array(value.bundle.pages, 200, 'PRODUCT_SCHEMA');
  for (const p of value.bundle.pages) {
    exactKeys(p, ['role', 'pageId', 'snapshotId', 'subjectRef', 'bindingDigest', 'observedAt', 'offset', 'nextPageId', 'records'], 'PRODUCT_SCHEMA');
    requireRule(['REGISTRATION', 'SCORE'].includes(p.role), 'PRODUCT_FIELD');
    for (const key of ['pageId', 'snapshotId']) text(p[key]);
    for (const key of ['subjectRef', 'bindingDigest']) hash32(p[key], 'PRODUCT_FIELD');
    timestamp(p.observedAt, 'PRODUCT_FIELD'); count(p.offset); if (p.nextPageId !== null) text(p.nextPageId);
    array(p.records, 100, 'PRODUCT_SCHEMA');
    for (const row of p.records) {
      exactKeys(row, ['examKey', 'examType', 'examDate', 'status', ...(p.role === 'SCORE' ? ['totalScore'] : [])], 'PRODUCT_SCHEMA');
      for (const key of ['examKey', 'examType', 'examDate', 'status']) text(row[key]);
      if (p.role === 'SCORE') requireRule(row.totalScore === null || (Number.isSafeInteger(row.totalScore) && row.totalScore >= 0 && row.totalScore <= 990), 'PRODUCT_FIELD');
    }
  }
  requireRule(Buffer.byteLength(JSON.stringify(value)) <= MAX_SUBMISSION_BYTES, 'PRODUCT_SIZE');
}
export function validateSubmission(value) {
  exactKeys(value, ['profile', 'bundle', 'sourceSignature', 'ownerSignature'], 'PRODUCT_SCHEMA'); sig(value.ownerSignature);
  const { ownerSignature, ...source } = value; validateSourceEnvelope(source);
  requireRule(Buffer.byteLength(JSON.stringify(value)) <= MAX_SUBMISSION_BYTES, 'PRODUCT_SIZE');
}
export const sourceMessage = manifest => getBytes(hash({ purpose: 'CLEAR_SYNTHETIC_SOURCE_INVENTORY_V1', manifestHash: hash(manifest) }));
export const ownerMessage = source => getBytes(hash({ purpose: 'CLEAR_PRODUCT_OWNER_POSSESSION_V1', sourceHash: hash(source) }));

export function publicVerificationInput(input) {
  exactKeys(input, ['draft', 'session', 'sourceSigner', 'submission', 'now'], 'PRODUCT_IPC_SCHEMA');
  compileSyntheticPolicy(input.draft); timestamp(input.now, 'PRODUCT_FIELD'); validateSubmission(input.submission);
  const s = input.session, fields = ['proofSessionId', 'applicationId', 'state', 'issuedAt', 'expiresAt', 'authorizedAt',
    'bindingDigest', 'typedData', 'dataMode', 'collectionEnabled', 'proofVerified', 'paymentAllowed'];
  exactKeys(s, [...fields, ...['issuanceEvidence', 'authorizationEvidence'].filter(k => Object.hasOwn(s, k))], 'PRODUCT_IPC_SCHEMA');
  for (const key of ['proofSessionId', 'applicationId', 'bindingDigest']) hash32(s[key], 'PRODUCT_FIELD');
  for (const key of ['issuedAt', 'expiresAt', 'authorizedAt']) timestamp(s[key], 'PRODUCT_FIELD');
  requireRule(s.state === 'AUTHORIZED' && s.dataMode === 'SYNTHETIC' && s.collectionEnabled === false
    && s.proofVerified === false && s.paymentAllowed === false, 'PRODUCT_IPC_SCHEMA');
  const typed = s.typedData;
  exactKeys(typed, ['domain', 'types', 'primaryType', 'message'], 'PRODUCT_IPC_SCHEMA');
  requireRule(typed.primaryType === 'ProofSessionBindingV4' && canonical(typed.types) === canonical(proofBindingTypes), 'PRODUCT_IPC_SCHEMA');
  exactKeys(typed.message, proofBindingTypes.ProofSessionBindingV4.map(x => x.name), 'PRODUCT_IPC_SCHEMA');
  for (const key of ['applicationId', 'policyHash', 'runtimeConfigHash', 'proofSessionId', 'requestNonce']) hash32(typed.message[key], 'PRODUCT_FIELD');
  address(typed.message.learner); timestamp(typed.message.expiresAt, 'PRODUCT_FIELD');
  requireRule(typeof typed.message.ownerPublicKey === 'string' && /^0x04[0-9a-fA-F]{128}$/.test(typed.message.ownerPublicKey), 'PRODUCT_FIELD');
  exactKeys(typed.domain, ['name', 'version', 'chainId', 'verifyingContract', 'salt'], 'PRODUCT_IPC_SCHEMA');
  requireRule(typed.domain.name === 'ClearRefund' && typed.domain.version === '4'
    && Number.isSafeInteger(typed.domain.chainId) && typed.domain.chainId > 0, 'PRODUCT_FIELD');
  address(typed.domain.verifyingContract); hash32(typed.domain.salt, 'PRODUCT_FIELD');
  // Observations and authentication context are unnecessary in the child.
  return structuredClone({ draft: input.draft, session: Object.fromEntries(fields.map(k => [k, s[k]])),
    sourceSigner: address(input.sourceSigner), submission: input.submission, now: input.now });
}

// Called only in the dedicated offline child. A synthetic source signature
// authenticates the inventory pin BEFORE B2a is given that trusted pin.
export function verifyProductSubmission({ draft, session, sourceSigner, submission, now }) {
  validateSubmission(submission);
  const { ownerSignature, ...source } = submission;
  let issuer, owner;
  try { issuer = verifyMessage(sourceMessage(source.bundle.manifest), source.sourceSignature);
    owner = verifyMessage(ownerMessage(source), ownerSignature); }
  catch { throw new RuleError('PRODUCT_SIGNATURE'); }
  requireRule(issuer === sourceSigner, 'PRODUCT_SOURCE_SIGNATURE');
  requireRule(owner === computeAddress(session.typedData.message.ownerPublicKey), 'PRODUCT_OWNER_SIGNATURE');
  const compiled = compileSyntheticPolicy(draft);
  const result = assessSyntheticExamEvidence(compiled, { session, manifestHash: hash(source.bundle.manifest), now }, source.bundle);
  requireRule(result.status === 'COMPLETE_SYNTHETIC', 'PRODUCT_EVIDENCE_HELD');
  return freeze({ version: PRODUCT_PROOF_VERSION, submissionHash: hash(submission), bindingDigest: session.bindingDigest,
    policyHash: compiled.policyHash, observedAt: source.bundle.manifest.observedAt, verifiedAt: now,
    snapshot: result.snapshot, snapshotHash: hash(result.snapshot), dataMode: 'SYNTHETIC',
    liveSupported: false, collectionEnabled: false, proofVerified: false, paymentAllowed: false });
}
