import { getAddress, keccak256, toUtf8Bytes, verifyTypedData, TypedDataEncoder } from 'ethers';

export const AMOUNT = 50_000_000n;
export const SCHEMA = 'refund-evidence/1';
export const STATEMENT = 'Mock issuer attestation only; no proof of actual submission or learning.';
export const EXPIRY = 'Unclaimed reserve returns only to sponsor after claimUntil.';
export const receiptTypes = { Receipt: [
  { name: 'termsHash', type: 'bytes32' }, { name: 'learner', type: 'address' },
  { name: 'session', type: 'uint32' }, { name: 'completedAt', type: 'uint64' }
] };
export const acceptanceTypes = { TermsAcceptance: [
  { name: 'termsHash', type: 'bytes32' }, { name: 'learner', type: 'address' },
  { name: 'acceptedAt', type: 'uint64' }
] };
export class EvidenceError extends Error {
  constructor(code) { super(code); this.name = 'EvidenceError'; this.code = code; }
}
export function need(condition, code) { if (!condition) throw new EvidenceError(code); }
export const canonical = value => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, sort(value[k])]));
  return value;
}
function keys(value, expected, code = 'SCHEMA') {
  need(value !== null && typeof value === 'object' && !Array.isArray(value), code);
  need(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null, code);
  need(Object.keys(value).sort().join('|') === [...expected].sort().join('|'), code);
}
function uint(value) { need(Number.isSafeInteger(value) && value >= 0, 'INTEGER'); }
function address(value) {
  try { need(typeof value === 'string' && getAddress(value) !== '0x0000000000000000000000000000000000000000', 'ADDRESS'); }
  catch { throw new EvidenceError('ADDRESS'); }
}
function hash(value) { need(typeof value === 'string' && /^0x[0-9a-f]{64}$/.test(value), 'HASH'); }
function signature(value) {
  need(typeof value === 'string' && /^0x[0-9a-fA-F]{128}(1b|1c)$/.test(value), 'SIGNATURE_FORMAT');
  const s = BigInt('0x' + value.slice(66, 130));
  need(s > 0n && s <= 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n, 'SIGNATURE_FORMAT');
}
function recovered(domain, types, value, sig) {
  signature(sig);
  try { return getAddress(verifyTypedData(domain, types, value, sig)); }
  catch { throw new EvidenceError('SIGNATURE'); }
}
export function validateTerms(t) {
  keys(t, ['version', 'courseId', 'submissionIds', 'amount', 'tokenDecimals', 'tokenSymbol', 'chainId', 'token', 'issuer', 'sponsor', 'start', 'due', 'claimUntil', 'expiryPolicy', 'evidenceStatement']);
  need(t.version === 1 && t.courseId === 'refund-course-001', 'TERMS_VERSION');
  need(canonical(t.submissionIds) === '[0,1,2,3]', 'SUBMISSIONS');
  need(t.amount === AMOUNT.toString() && t.tokenDecimals === 6 && t.tokenSymbol === 'TEST', 'AMOUNT');
  need(t.chainId === 31337 && t.expiryPolicy === EXPIRY && t.evidenceStatement === STATEMENT, 'TERMS_SCOPE');
  for (const k of ['token', 'issuer', 'sponsor']) address(t[k]);
  for (const k of ['start', 'due', 'claimUntil']) uint(t[k]);
  need(t.start > 0 && t.start < t.due && t.due < t.claimUntil, 'DEADLINES');
  return t;
}
export function termsHash(terms) { validateTerms(terms); return keccak256(toUtf8Bytes(canonical(terms))); }
export function validateTrust(trusted) {
  keys(trusted, ['manifestVersion', 'terms', 'termsHash', 'domain', 'deployment']);
  need(trusted.manifestVersion === 1, 'TRUST_VERSION');
  validateTerms(trusted.terms);
  hash(trusted.termsHash);
  need(trusted.termsHash === termsHash(trusted.terms), 'TRUST_TERMS');
  keys(trusted.domain, ['name', 'version', 'chainId', 'verifyingContract']);
  need(trusted.domain.name === 'RefundRights' && trusted.domain.version === '2' && trusted.domain.chainId === 31337, 'TRUST_DOMAIN');
  address(trusted.domain.verifyingContract);
  keys(trusted.deployment, ['genesisHash', 'blockNumber', 'blockHash', 'vaultCodeHash', 'tokenCodeHash']);
  uint(trusted.deployment.blockNumber);
  for (const k of ['genesisHash', 'blockHash', 'vaultCodeHash', 'tokenCodeHash']) hash(trusted.deployment[k]);
  return trusted;
}
export function validateAcceptance(a, trusted, recipient, time, { registration = false } = {}) {
  validateTrust(trusted); address(recipient); uint(time);
  keys(a, ['termsHash', 'learner', 'acceptedAt', 'signature']);
  address(a.learner); uint(a.acceptedAt); hash(a.termsHash);
  need(a.termsHash === trusted.termsHash && getAddress(a.learner) === getAddress(recipient), 'CONSENT_SCOPE');
  need(a.acceptedAt > 0 && a.acceptedAt <= time && a.acceptedAt <= trusted.terms.due, 'CONSENT_TIME');
  if (registration) need(time <= trusted.terms.due, 'REGISTRATION_EXPIRED');
  const value = { termsHash: a.termsHash, learner: a.learner, acceptedAt: a.acceptedAt };
  need(recovered(trusted.domain, acceptanceTypes, value, a.signature) === getAddress(recipient), 'CONSENT_SIGNATURE');
  return TypedDataEncoder.hash(trusted.domain, acceptanceTypes, value);
}
// Caller supplies the reviewed terms hash explicitly; signing is not proof of human comprehension.
export async function acceptTerms(trusted, wallet, time, reviewedTermsHash) {
  validateTrust(trusted); uint(time);
  need(reviewedTermsHash === trusted.termsHash, 'TERMS_NOT_CONFIRMED');
  const value = { termsHash: trusted.termsHash, learner: await wallet.getAddress(), acceptedAt: time };
  const a = { ...value, signature: await wallet.signTypedData(trusted.domain, acceptanceTypes, value) };
  validateAcceptance(a, trusted, value.learner, time, { registration: true });
  return a;
}
export async function issueReceipt(trusted, issuer, learner, session, completedAt, time) {
  validateTrust(trusted); address(learner); uint(session); uint(completedAt); uint(time);
  need(getAddress(await issuer.getAddress()) === getAddress(trusted.terms.issuer), 'ISSUER');
  need(session < 4 && completedAt >= trusted.terms.start && completedAt <= trusted.terms.due && completedAt <= time, 'RECEIPT_TIME_SCOPE');
  const receipt = { termsHash: trusted.termsHash, learner, session, completedAt };
  return { receipt, signature: await issuer.signTypedData(trusted.domain, receiptTypes, receipt) };
}
export function makeEvidence(trusted, acceptance, submissions) {
  return structuredClone({ schemaVersion: SCHEMA, terms: trusted.terms, termsHash: trusted.termsHash,
    domain: trusted.domain, recipient: acceptance.learner, acceptance, submissions });
}
export function validateEvidence(packet, trusted, recipient, time) {
  validateTrust(trusted); address(recipient); uint(time);
  keys(packet, ['schemaVersion', 'terms', 'termsHash', 'domain', 'recipient', 'acceptance', 'submissions']);
  need(packet.schemaVersion === SCHEMA, 'EVIDENCE_VERSION');
  validateTerms(packet.terms);
  need(canonical(packet.terms) === canonical(trusted.terms) && packet.termsHash === trusted.termsHash, 'TERMS_MISMATCH');
  need(canonical(packet.domain) === canonical(trusted.domain), 'DOMAIN_MISMATCH');
  address(packet.recipient);
  need(getAddress(packet.recipient) === getAddress(recipient), 'RECIPIENT_MISMATCH');
  const consentDigest = validateAcceptance(packet.acceptance, trusted, recipient, time);
  need(time <= trusted.terms.claimUntil, 'EXPIRED');
  need(Array.isArray(packet.submissions) && packet.submissions.length === 4, 'COUNT');
  const seen = new Set();
  for (const item of packet.submissions) {
    keys(item, ['receipt', 'signature']);
    const r = item.receipt;
    keys(r, ['termsHash', 'learner', 'session', 'completedAt']);
    uint(r.session); uint(r.completedAt); address(r.learner); hash(r.termsHash);
    need(r.termsHash === trusted.termsHash && getAddress(r.learner) === getAddress(recipient) && r.session < 4, 'RECEIPT_SCOPE');
    need(!seen.has(r.session), 'DUPLICATE'); seen.add(r.session);
    need(r.completedAt >= trusted.terms.start && r.completedAt <= trusted.terms.due && r.completedAt <= time, 'RECEIPT_TIME');
    need(recovered(trusted.domain, receiptTypes, r, item.signature) === getAddress(trusted.terms.issuer), 'ISSUER_SIGNATURE');
  }
  return { recipient: getAddress(recipient), amount: AMOUNT.toString(), consentDigest, cryptographicallyValid: true };
}
export function explainTerms(trusted) {
  validateTrust(trusted);
  return [
    `강좌: ${trusted.terms.courseId} / 제출 증빙: 1–4 (모의 증빙)`,
    '고정 환급액: 50 TEST (무가치, 최소 단위 50000000)',
    `제출 기간: ${new Date(trusted.terms.start * 1000).toISOString()} ~ ${new Date(trusted.terms.due * 1000).toISOString()} (양 끝 포함)`,
    `청구 만료: ${new Date(trusted.terms.claimUntil * 1000).toISOString()} (해당 초 포함)`,
    `조건 해시: ${trusted.termsHash}`,
    '미청구금은 만료 후에만 sponsor에게 반환됩니다.',
    '서명은 발급자의 주장입니다. 실제 제출·학습 성과를 증명하지 않습니다.',
    '발급 미협조·거짓 서명·체인/토큰 장애·키 유실·코드 오류의 한계가 남습니다.'
  ].join('\n');
}
