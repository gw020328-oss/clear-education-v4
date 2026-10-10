export const MAX_EVIDENCE_BYTES = 64 * 1024;
export const MAX_JSON_DEPTH = 12;
export const SAFE_TOKEN_CODE_HASH = '0xe927d828d159bdf3a0b93facf54869913ff4e0a3723cfc93717b8aa47133f1bd';
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

export function createValidation(E) {
  const need = (condition, code) => { if (!condition) throw new EvidenceError(code); };
  const canonical = value => JSON.stringify(sort(value));
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
    try { need(typeof value === 'string' && E.getAddress(value) !== E.ZeroAddress, 'ADDRESS'); }
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
    try { return E.getAddress(E.verifyTypedData(domain, types, value, sig)); }
    catch { throw new EvidenceError('SIGNATURE'); }
  }
  function depth(value, level = 0) {
    need(level <= MAX_JSON_DEPTH, 'JSON_DEPTH');
    if (Array.isArray(value)) for (const item of value) depth(item, level + 1);
    else if (value && typeof value === 'object') for (const item of Object.values(value)) depth(item, level + 1);
  }
  function parseEvidenceText(text) {
    need(typeof text === 'string', 'FILE_TYPE');
    need(new TextEncoder().encode(text).byteLength <= MAX_EVIDENCE_BYTES, 'FILE_TOO_LARGE');
    let value; try { value = JSON.parse(text); } catch { throw new EvidenceError('JSON'); }
    depth(value);
    return value;
  }
  function validateTerms(t) {
    keys(t, ['version','courseId','submissionIds','amount','tokenDecimals','tokenSymbol','chainId','token','issuer','sponsor','start','due','claimUntil','expiryPolicy','evidenceStatement']);
    need(t.version === 1 && t.courseId === 'refund-course-001', 'TERMS_VERSION');
    need(canonical(t.submissionIds) === '[0,1,2,3]', 'SUBMISSIONS');
    need(t.amount === AMOUNT.toString() && t.tokenDecimals === 6 && t.tokenSymbol === 'TEST', 'AMOUNT');
    need(t.chainId === 31337 && t.expiryPolicy === EXPIRY && t.evidenceStatement === STATEMENT, 'TERMS_SCOPE');
    for (const k of ['token','issuer','sponsor']) address(t[k]);
    for (const k of ['start','due','claimUntil']) uint(t[k]);
    need(t.start > 0 && t.start < t.due && t.due < t.claimUntil, 'DEADLINES');
    return t;
  }
  function termsHash(terms) { validateTerms(terms); return E.keccak256(E.toUtf8Bytes(canonical(terms))); }
  function validateTrust(trusted) {
    keys(trusted, ['manifestVersion','tokenProfile','terms','termsHash','domain','deployment']);
    need(trusted.manifestVersion === 2 && trusted.tokenProfile === 'immutable-fixed-test-token/v1', 'TRUST_VERSION');
    validateTerms(trusted.terms); hash(trusted.termsHash);
    need(trusted.termsHash === termsHash(trusted.terms), 'TRUST_TERMS');
    keys(trusted.domain, ['name','version','chainId','verifyingContract']);
    need(trusted.domain.name === 'RefundRights' && trusted.domain.version === '2' && trusted.domain.chainId === 31337, 'TRUST_DOMAIN');
    address(trusted.domain.verifyingContract);
    keys(trusted.deployment, ['genesisHash','blockNumber','blockHash','vaultCodeHash','tokenCodeHash']);
    uint(trusted.deployment.blockNumber);
    for (const k of ['genesisHash','blockHash','vaultCodeHash','tokenCodeHash']) hash(trusted.deployment[k]);
    need(trusted.deployment.tokenCodeHash === SAFE_TOKEN_CODE_HASH, 'UNTRUSTED_TOKEN_CODE');
    return trusted;
  }
  function validateAcceptance(a, trusted, recipient, time, { registration = false } = {}) {
    validateTrust(trusted); address(recipient); uint(time);
    keys(a, ['termsHash','learner','acceptedAt','signature']);
    address(a.learner); uint(a.acceptedAt); hash(a.termsHash);
    need(a.termsHash === trusted.termsHash && E.getAddress(a.learner) === E.getAddress(recipient), 'CONSENT_SCOPE');
    need(a.acceptedAt > 0 && a.acceptedAt <= time && a.acceptedAt <= trusted.terms.due, 'CONSENT_TIME');
    if (registration) need(time <= trusted.terms.due, 'REGISTRATION_EXPIRED');
    const value = { termsHash:a.termsHash, learner:a.learner, acceptedAt:a.acceptedAt };
    need(recovered(trusted.domain, acceptanceTypes, value, a.signature) === E.getAddress(recipient), 'CONSENT_SIGNATURE');
    return E.TypedDataEncoder.hash(trusted.domain, acceptanceTypes, value);
  }
  function validateEvidence(packet, trusted, recipient, time) {
    depth(packet); validateTrust(trusted); address(recipient); uint(time);
    keys(packet, ['schemaVersion','terms','termsHash','domain','recipient','acceptance','submissions']);
    need(packet.schemaVersion === SCHEMA, 'EVIDENCE_VERSION'); validateTerms(packet.terms);
    need(canonical(packet.terms) === canonical(trusted.terms) && packet.termsHash === trusted.termsHash, 'TERMS_MISMATCH');
    need(canonical(packet.domain) === canonical(trusted.domain), 'DOMAIN_MISMATCH');
    address(packet.recipient); need(E.getAddress(packet.recipient) === E.getAddress(recipient), 'RECIPIENT_MISMATCH');
    const consentDigest = validateAcceptance(packet.acceptance, trusted, recipient, time);
    need(time <= trusted.terms.claimUntil, 'EXPIRED');
    need(Array.isArray(packet.submissions) && packet.submissions.length === 4, 'COUNT');
    const seen = new Set();
    for (const item of packet.submissions) {
      keys(item, ['receipt','signature']); const r = item.receipt;
      keys(r, ['termsHash','learner','session','completedAt']);
      uint(r.session); uint(r.completedAt); address(r.learner); hash(r.termsHash);
      need(r.termsHash === trusted.termsHash && E.getAddress(r.learner) === E.getAddress(recipient) && r.session < 4, 'RECEIPT_SCOPE');
      need(!seen.has(r.session), 'DUPLICATE'); seen.add(r.session);
      need(r.completedAt >= trusted.terms.start && r.completedAt <= trusted.terms.due && r.completedAt <= time, 'RECEIPT_TIME');
      need(recovered(trusted.domain, receiptTypes, r, item.signature) === E.getAddress(trusted.terms.issuer), 'ISSUER_SIGNATURE');
    }
    return { recipient:E.getAddress(recipient), amount:AMOUNT.toString(), consentDigest, cryptographicallyValid:true };
  }
  return { need, canonical, parseEvidenceText, validateTerms, termsHash, validateTrust, validateAcceptance, validateEvidence, signature, depth };
}
