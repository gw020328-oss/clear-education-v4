import { TypedDataEncoder, getAddress } from 'ethers';
import { requireCompiledPolicy } from '../policy/compiler.mjs';
import { array, calendarDate, canonical, exactKeys, freeze, hash, hash32, identifier, requireRule, RuleError, timestamp } from '../policy/values.mjs';
import { proofBindingTypes } from '../application/proof-binding.mjs';

// A proposed source contract, NOT a description of YBM's current endpoints.
export const SOURCE_CONTRACT = freeze({
  version: 'synthetic-exam-inventory.1', dataMode: 'SYNTHETIC', examType: 'TOEIC_LR',
  scope: 'inclusive-exam-date-all-statuses', pagination: 'pinned-page-hashes-offsets-and-terminal',
  consistency: 'one-source-snapshot', maxRowsPerSource: 100, maxPagesPerSource: 100,
  registrationStatuses: ['TAKEN', 'CANCELLED', 'ABSENT', 'INVALID', 'PENDING', 'CHANGED'],
  scoreStatuses: ['VALID', 'INVALID', 'PENDING'],
  identity: 'opaque-account-scoped-exam-key', liveSupported: false,
});
export const SOURCE_CONTRACT_HASH = hash(SOURCE_CONTRACT);
export const COMPLETENESS_VERSION = 'synthetic-exam-completeness.1';
const roles = ['REGISTRATION', 'SCORE'];
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const bounded = (n, max, code) => requireRule(Number.isSafeInteger(n) && n >= 0 && n <= max, code);
const opaque = (v, code) => { requireRule(identifier(v, code) === v, code); return v; };

// context is supplied by a trusted internal caller, not by an HTTP client.
// manifestHash must come from an independently authenticated source inventory.
// No live source can currently supply that inventory; only synthetic fixtures do.
function expected(compiled, context) {
  const policy = requireCompiledPolicy(compiled);
  exactKeys(context, ['session', 'manifestHash', 'now'], 'EVIDENCE_CONTEXT');
  requireRule(policy.sourcePolicySetHash === SOURCE_CONTRACT_HASH, 'EVIDENCE_SOURCE_POLICY');
  hash32(context.manifestHash, 'EVIDENCE_MANIFEST_PIN'); timestamp(context.now, 'EVIDENCE_CLOCK');
  const s = context.session;
  requireRule(s && s.dataMode === 'SYNTHETIC' && s.state === 'AUTHORIZED' && s.collectionEnabled === false
    && s.proofVerified === false && s.paymentAllowed === false, 'EVIDENCE_SESSION');
  timestamp(s.issuedAt, 'EVIDENCE_SESSION'); timestamp(s.expiresAt, 'EVIDENCE_SESSION');
  timestamp(s.authorizedAt, 'EVIDENCE_SESSION');
  requireRule(BigInt(s.issuedAt) <= BigInt(s.authorizedAt) && BigInt(s.authorizedAt) <= BigInt(context.now)
    && BigInt(context.now) < BigInt(s.expiresAt), 'EVIDENCE_SESSION_TIME');
  const typed = s.typedData;
  exactKeys(typed, ['domain', 'types', 'primaryType', 'message'], 'EVIDENCE_BINDING');
  exactKeys(typed.message, proofBindingTypes.ProofSessionBindingV4.map(field => field.name), 'EVIDENCE_BINDING');
  exactKeys(typed.domain, ['name', 'version', 'chainId', 'verifyingContract', 'salt'], 'EVIDENCE_BINDING');
  requireRule(typed.domain.name === 'ClearRefund' && typed.domain.version === '4', 'EVIDENCE_BINDING');
  requireRule(typed.primaryType === 'ProofSessionBindingV4'
    && canonical(typed.types) === canonical(proofBindingTypes), 'EVIDENCE_BINDING');
  requireRule(typed.message.applicationId === s.applicationId && typed.message.proofSessionId === s.proofSessionId
    && typed.message.policyHash === compiled.policyHash && typed.message.expiresAt === s.expiresAt, 'EVIDENCE_BINDING');
  let digest, learner;
  try { digest = TypedDataEncoder.hash(typed.domain, typed.types, typed.message); learner = getAddress(typed.message.learner); }
  catch { throw new RuleError('EVIDENCE_BINDING'); }
  requireRule(digest === s.bindingDigest, 'EVIDENCE_BINDING');
  return { policy, s, learner, now: BigInt(context.now), manifestHash: context.manifestHash };
}

function inventory(value, role) {
  exactKeys(value, ['role', 'totalRows', 'pages', 'terminalPageId'], 'INVENTORY_SCHEMA');
  requireRule(value.role === role, 'INVENTORY_ROLE');
  bounded(value.totalRows, 100, 'INVENTORY_LIMIT'); array(value.pages, 100, 'INVENTORY_PAGES');
  requireRule(value.pages.length > 0, 'INVENTORY_PAGES');
  const seen = new Set(); let offset = 0;
  for (const p of value.pages) {
    exactKeys(p, ['pageId', 'offset', 'rowCount', 'pageHash'], 'INVENTORY_PAGE_SCHEMA');
    opaque(p.pageId, 'PAGE_ID'); hash32(p.pageHash, 'PAGE_HASH');
    bounded(p.offset, 100, 'PAGE_OFFSET'); bounded(p.rowCount, 100, 'PAGE_COUNT');
    requireRule(!seen.has(p.pageId), 'PAGE_DUPLICATE'); seen.add(p.pageId);
    requireRule(p.offset === offset, 'PAGE_GAP'); offset += p.rowCount;
    requireRule(p.rowCount > 0 || (value.totalRows === 0 && value.pages.length === 1), 'PAGE_EMPTY');
  }
  requireRule(offset === value.totalRows, 'INVENTORY_COUNT');
  requireRule(value.terminalPageId === value.pages.at(-1).pageId, 'PAGE_TERMINAL');
}

function pageRows(pages, descriptor, manifest) {
  const found = pages.filter(p => p.role === descriptor.role);
  requireRule(found.length === descriptor.pages.length, 'PAGE_MISSING_OR_EXTRA');
  const result = [], seen = new Set();
  for (const [index, pin] of descriptor.pages.entries()) {
    const matches = found.filter(p => p.pageId === pin.pageId);
    requireRule(matches.length === 1, 'PAGE_MISSING_OR_DUPLICATE');
    const page = matches[0];
    requireRule(hash(page) === pin.pageHash, 'PAGE_HASH_MISMATCH');
    requireRule(page.snapshotId === manifest.snapshotId && page.subjectRef === manifest.subjectRef
      && page.bindingDigest === manifest.bindingDigest && page.observedAt === manifest.observedAt, 'PAGE_CONTEXT');
    requireRule(page.offset === pin.offset && page.nextPageId === (descriptor.pages[index + 1]?.pageId ?? null), 'PAGE_CHAIN');
    requireRule(page.records.length === pin.rowCount, 'PAGE_COUNT');
    for (const row of page.records) {
      exactKeys(row, ['examKey', 'examType', 'examDate', 'status', ...(descriptor.role === 'SCORE' ? ['totalScore'] : [])], 'EXAM_EVIDENCE_SCHEMA');
      opaque(row.examKey, 'EXAM_KEY'); calendarDate(row.examDate, 'EXAM_DATE');
      requireRule(row.examType === 'TOEIC_LR', 'EXAM_TYPE');
      requireRule(row.examDate >= manifest.scope.examDateStart && row.examDate <= manifest.scope.examDateEnd, 'EXAM_OUTSIDE_SCOPE');
      requireRule(BigInt(Date.parse(row.examDate + 'T00:00:00+09:00') / 1000) <= BigInt(manifest.observedAt), 'EXAM_FUTURE');
      requireRule(!seen.has(row.examKey), 'EXAM_DUPLICATE_OR_CONFLICT'); seen.add(row.examKey);
      requireRule((descriptor.role === 'SCORE' ? SOURCE_CONTRACT.scoreStatuses : SOURCE_CONTRACT.registrationStatuses).includes(row.status), 'EXAM_STATUS');
      if (descriptor.role === 'SCORE') {
        if (row.status === 'VALID') requireRule(Number.isInteger(row.totalScore) && row.totalScore >= 10
          && row.totalScore <= 990 && row.totalScore % 5 === 0, 'EXAM_SCORE');
        else requireRule(row.totalScore === null, 'EXAM_SCORE');
      }
      result.push(row);
    }
  }
  return result;
}

function assess(compiled, e, bundle) {
  exactKeys(bundle, ['manifest', 'pages'], 'EVIDENCE_SCHEMA');
  const m = bundle.manifest;
  exactKeys(m, ['version', 'dataMode', 'sourcePolicySetHash', 'policyHash', 'bindingDigest', 'learnerId',
    'subjectRef', 'snapshotId', 'observedAt', 'scope', 'inventories'], 'MANIFEST_SCHEMA');
  requireRule(m.version === SOURCE_CONTRACT.version && m.dataMode === 'SYNTHETIC', 'MANIFEST_PROFILE');
  requireRule(m.sourcePolicySetHash === SOURCE_CONTRACT_HASH && m.policyHash === compiled.policyHash
    && m.bindingDigest === e.s.bindingDigest && m.learnerId === e.learner, 'MANIFEST_CONTEXT');
  hash32(m.subjectRef, 'MANIFEST_SUBJECT'); opaque(m.snapshotId, 'MANIFEST_SNAPSHOT'); timestamp(m.observedAt, 'MANIFEST_TIME');
  // The policy period must have fully ended. A current list cannot establish a
  // final maximum while more eligible exams can still occur.
  requireRule(BigInt(m.observedAt) >= BigInt(e.s.authorizedAt) && BigInt(m.observedAt) <= e.now
    && e.now - BigInt(m.observedAt) <= 300n, 'MANIFEST_TIME');
  requireRule(BigInt(Date.parse(e.policy.examDateEnd + 'T23:59:59+09:00') / 1000) <= BigInt(m.observedAt), 'PERIOD_NOT_CLOSED');
  exactKeys(m.scope, ['examType', 'examDateStart', 'examDateEnd', 'allStatuses', 'coverageStart', 'coverageEnd'], 'SCOPE_SCHEMA');
  calendarDate(m.scope.coverageStart, 'SCOPE_COVERAGE'); calendarDate(m.scope.coverageEnd, 'SCOPE_COVERAGE');
  requireRule(m.scope.examType === e.policy.examType && m.scope.examDateStart === e.policy.examDateStart
    && m.scope.examDateEnd === e.policy.examDateEnd && m.scope.allStatuses === true, 'SCOPE_MISMATCH');
  requireRule(m.scope.coverageStart <= m.scope.examDateStart && m.scope.coverageEnd >= m.scope.examDateEnd, 'SCOPE_TRUNCATED');
  array(m.inventories, 2, 'INVENTORY_SCHEMA'); requireRule(m.inventories.length === 2, 'INVENTORY_SCHEMA');
  roles.forEach((role, i) => inventory(m.inventories[i], role));
  array(bundle.pages, 200, 'EVIDENCE_PAGES');
  for (const page of bundle.pages) {
    exactKeys(page, ['role', 'pageId', 'snapshotId', 'subjectRef', 'bindingDigest', 'observedAt', 'offset', 'nextPageId', 'records'], 'PAGE_SCHEMA');
    requireRule(roles.includes(page.role), 'PAGE_ROLE'); array(page.records, 100, 'PAGE_RECORDS');
    // Validate before canonical hashing; malformed input produces only fixed codes.
    for (const row of page.records) {
      exactKeys(row, ['examKey', 'examType', 'examDate', 'status', ...(page.role === 'SCORE' ? ['totalScore'] : [])], 'EXAM_EVIDENCE_SCHEMA');
      requireRule(['examKey', 'examType', 'examDate', 'status'].every(k => typeof row[k] === 'string' && row[k].length <= 64), 'EXAM_EVIDENCE_SCHEMA');
      if (page.role === 'SCORE') requireRule(row.totalScore === null || Number.isSafeInteger(row.totalScore), 'EXAM_SCORE');
    }
    opaque(page.pageId, 'PAGE_ID'); opaque(page.snapshotId, 'PAGE_CONTEXT'); hash32(page.subjectRef, 'PAGE_CONTEXT');
    hash32(page.bindingDigest, 'PAGE_CONTEXT'); timestamp(page.observedAt, 'PAGE_CONTEXT'); bounded(page.offset, 100, 'PAGE_OFFSET');
    if (page.nextPageId !== null) opaque(page.nextPageId, 'PAGE_CHAIN');
  }
  requireRule(hash(m) === e.manifestHash, 'MANIFEST_PIN_MISMATCH');
  const registrations = pageRows(bundle.pages, m.inventories[0], m);
  const scores = new Map(pageRows(bundle.pages, m.inventories[1], m).map(r => [r.examKey, r]));
  const records = [];
  for (const row of registrations) {
    requireRule(!['PENDING', 'CHANGED'].includes(row.status), 'EXAM_UNRESOLVED');
    const score = scores.get(row.examKey);
    if (['CANCELLED', 'ABSENT'].includes(row.status)) requireRule(!score, 'EXAM_STATUS_CONFLICT');
    else {
      requireRule(score, 'SCORE_MISSING');
      requireRule(score.examDate === row.examDate && score.examType === row.examType, 'EXAM_PAIR_MISMATCH');
      requireRule(score.status !== 'PENDING', 'SCORE_UNRELEASED');
      requireRule(score.status === (row.status === 'TAKEN' ? 'VALID' : 'INVALID'), 'EXAM_STATUS_CONFLICT');
      if (row.status === 'TAKEN') {
        const identity = { examKey: row.examKey, examType: row.examType, examDate: row.examDate };
        records.push({ status: 'VALID', registration: identity, score: { ...identity, totalScore: score.totalScore } });
      }
    }
    scores.delete(row.examKey);
  }
  requireRule(scores.size === 0, 'REGISTRATION_MISSING');
  records.sort((a, b) => compare(a.registration.examKey, b.registration.examKey));
  const ranked = [...records].sort((a, b) => b.score.totalScore - a.score.totalScore
    || compare(a.score.examDate, b.score.examDate) || compare(a.score.examKey, b.score.examKey));
  return { snapshot: { dataMode: 'SYNTHETIC', policyHash: compiled.policyHash, learnerId: e.learner,
    snapshotVersion: m.snapshotId, observedAt: m.observedAt, completeSnapshot: true,
    sourcePolicySetHash: SOURCE_CONTRACT_HASH, records }, selected: ranked[0]?.score ?? null };
}

// Does not verify a signature, call RPC, consume a nonce, store a proof, or
// accept a live verifier result. Hashes bind synthetic evidence to a trusted pin;
// they do not authenticate the source that produced the inventory.
export function assessSyntheticExamEvidence(compiled, context, bundle) {
  const e = expected(compiled, context);
  const base = { completenessVersion: COMPLETENESS_VERSION, dataMode: 'SYNTHETIC', policyHash: compiled.policyHash,
    bindingDigest: e.s.bindingDigest, collectionEnabled: false, proofVerified: false, paymentAllowed: false, liveSupported: false };
  try {
    const { snapshot, selected } = assess(compiled, e, bundle);
    return freeze({ ...base, status: 'COMPLETE_SYNTHETIC', reasons: [], highestScoreAssessed: true,
      selectedExamKey: selected?.examKey ?? null, highestScore: selected?.totalScore ?? null, snapshot });
  } catch (error) {
    if (!(error instanceof RuleError)) throw error;
    return freeze({ ...base, status: 'ON_HOLD', reasons: [error.message], highestScoreAssessed: false,
      selectedExamKey: null, highestScore: null, snapshot: null });
  }
}
