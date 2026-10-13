import { MAX_LECTURES, requireCompiledPolicy } from '../policy/compiler.mjs';
import { array, exactKeys, freeze, hash, hash32, identifier, requireRule, RuleError, timestamp } from '../policy/values.mjs';

// Proposed required-lecture projection, not a claim about a real provider API.
export const LEARNING_SOURCE_PROFILE = 'synthetic-learning-inventory.1';
export const LEARNING_CONTRACT_VERSION = 'synthetic-learning-evidence.1';
export const MAX_LEARNING_AGE = 300n;
const opaque = (v, code) => requireRule(identifier(v, code) === v, code);
const bounded = (v, max, code) => requireRule(Number.isSafeInteger(v) && v >= 0 && v <= max, code);
const flags = { contractVersion: LEARNING_CONTRACT_VERSION, dataMode: 'SYNTHETIC', liveSupported: false,
  collectionEnabled: false, proofVerified: false, paymentAllowed: false };
export const heldLearningEvidence = reason => freeze({ ...flags, status: 'ON_HOLD', reason, snapshot: null,
  manifestHash: null, snapshotHash: null });

// Trusted internal resolver inputs. Never take the pin, learner/account mapping
// or provider ID from the response being checked or a participant HTTP body.
export function learningExpectation(compiled, context) {
  const policy = requireCompiledPolicy(compiled);
  exactKeys(context, ['applicationId', 'learnerId', 'providerId', 'subjectRef', 'snapshotVersion', 'manifestHash', 'now'], 'LEARNING_CONTEXT');
  for (const key of ['applicationId', 'subjectRef', 'manifestHash']) hash32(context[key], 'LEARNING_CONTEXT');
  for (const key of ['learnerId', 'providerId', 'snapshotVersion']) opaque(context[key], 'LEARNING_CONTEXT');
  timestamp(context.now, 'LEARNING_CLOCK');
  return policy;
}

export function inspectLearningManifest(compiled, context, manifest) {
  const policy = learningExpectation(compiled, context), m = manifest;
  exactKeys(m, ['profile', 'dataMode', 'providerId', 'applicationId', 'learnerId', 'subjectRef', 'policyHash',
    'requiredLectureIdsHash', 'completionRuleVersion', 'snapshotVersion', 'observedAt', 'validUntil',
    'learningStart', 'learningEnd', 'coverageStart', 'coverageEnd', 'totalRows', 'pages', 'terminalPageId'], 'LEARNING_MANIFEST_SCHEMA');
  requireRule(m.profile === LEARNING_SOURCE_PROFILE && m.dataMode === 'SYNTHETIC', 'LEARNING_SOURCE_UNSUPPORTED');
  for (const key of ['providerId', 'learnerId', 'snapshotVersion', 'completionRuleVersion', 'terminalPageId']) opaque(m[key], 'LEARNING_MANIFEST_FIELD');
  for (const key of ['applicationId', 'subjectRef', 'policyHash', 'requiredLectureIdsHash']) hash32(m[key], 'LEARNING_MANIFEST_FIELD');
  for (const key of ['observedAt', 'validUntil', 'learningStart', 'learningEnd', 'coverageStart', 'coverageEnd']) timestamp(m[key], 'LEARNING_MANIFEST_TIME');
  requireRule(['applicationId', 'learnerId', 'providerId', 'subjectRef'].every(k => m[k] === context[k]), 'LEARNING_SOURCE_CONTEXT');
  requireRule(m.snapshotVersion === context.snapshotVersion, 'LEARNING_VERSION_CHANGED');
  requireRule(m.policyHash === compiled.policyHash && m.requiredLectureIdsHash === compiled.requiredLectureIdsHash
    && m.completionRuleVersion === policy.completionRuleVersion, 'LEARNING_POLICY');
  requireRule(m.learningStart === policy.learningStart && m.learningEnd === policy.learningEnd
    && BigInt(m.coverageStart) <= BigInt(policy.learningStart) && BigInt(m.coverageEnd) >= BigInt(policy.learningEnd), 'LEARNING_COVERAGE');
  const observed = BigInt(m.observedAt), now = BigInt(context.now), until = BigInt(m.validUntil);
  requireRule(observed >= BigInt(policy.learningEnd), 'LEARNING_PERIOD_OPEN');
  requireRule(observed <= now && now - observed <= MAX_LEARNING_AGE
    && until >= observed && until <= observed + MAX_LEARNING_AGE && now <= until, 'LEARNING_STALE');
  bounded(m.totalRows, MAX_LECTURES, 'LEARNING_COUNT');
  requireRule(m.totalRows === policy.requiredLectureIds.length, 'LEARNING_COUNT');
  array(m.pages, 100, 'LEARNING_PAGES'); requireRule(m.pages.length > 0, 'LEARNING_PAGES');
  const ids = new Set(); let offset = 0;
  for (const p of m.pages) {
    exactKeys(p, ['pageId', 'offset', 'rowCount', 'pageHash'], 'LEARNING_PAGE_PIN');
    opaque(p.pageId, 'LEARNING_PAGE_ID'); hash32(p.pageHash, 'LEARNING_PAGE_HASH');
    bounded(p.offset, MAX_LECTURES, 'LEARNING_OFFSET'); bounded(p.rowCount, 100, 'LEARNING_COUNT');
    requireRule(p.rowCount > 0 && p.offset === offset && !ids.has(p.pageId), 'LEARNING_PAGE_CHAIN');
    ids.add(p.pageId); offset += p.rowCount;
  }
  requireRule(offset === m.totalRows && m.terminalPageId === m.pages.at(-1).pageId, 'LEARNING_PAGE_CHAIN');
  requireRule(hash(m) === context.manifestHash, 'LEARNING_MANIFEST_PIN');
}

function snapshot(compiled, context, bundle) {
  exactKeys(bundle, ['manifest', 'pages'], 'LEARNING_BUNDLE_SCHEMA');
  inspectLearningManifest(compiled, context, bundle.manifest);
  const m = bundle.manifest, required = new Set(compiled.policy.requiredLectureIds), records = new Map();
  array(bundle.pages, 100, 'LEARNING_PAGES');
  requireRule(bundle.pages.length === m.pages.length, 'LEARNING_PAGE_MISSING');
  const pages = new Map();
  for (const p of bundle.pages) {
    exactKeys(p, ['pageId', 'snapshotVersion', 'subjectRef', 'offset', 'nextPageId', 'records'], 'LEARNING_PAGE_SCHEMA');
    opaque(p.pageId, 'LEARNING_PAGE_ID'); opaque(p.snapshotVersion, 'LEARNING_VERSION'); hash32(p.subjectRef, 'LEARNING_SUBJECT');
    bounded(p.offset, MAX_LECTURES, 'LEARNING_OFFSET'); if (p.nextPageId !== null) opaque(p.nextPageId, 'LEARNING_PAGE_ID');
    array(p.records, 100, 'LEARNING_RECORDS');
    for (const row of p.records) {
      exactKeys(row, ['lectureId', 'completed', 'completedAt'], 'LEARNING_RECORD_SCHEMA');
      opaque(row.lectureId, 'LEARNING_LECTURE'); requireRule(typeof row.completed === 'boolean', 'LEARNING_COMPLETED');
      if (row.completed) {
        timestamp(row.completedAt, 'LEARNING_COMPLETED_AT');
        requireRule(BigInt(row.completedAt) <= BigInt(m.observedAt), 'LEARNING_COMPLETED_FUTURE');
      } else requireRule(row.completedAt === null, 'LEARNING_COMPLETED_AT');
    }
    requireRule(!pages.has(p.pageId), 'LEARNING_PAGE_DUPLICATE'); pages.set(p.pageId, p);
  }
  for (const [i, pin] of m.pages.entries()) {
    const p = pages.get(pin.pageId);
    requireRule(p, 'LEARNING_PAGE_MISSING'); requireRule(hash(p) === pin.pageHash, 'LEARNING_PAGE_HASH');
    requireRule(p.snapshotVersion === m.snapshotVersion && p.subjectRef === m.subjectRef, 'LEARNING_PAGE_CONTEXT');
    requireRule(p.offset === pin.offset && p.nextPageId === (m.pages[i + 1]?.pageId ?? null)
      && p.records.length === pin.rowCount, 'LEARNING_PAGE_CHAIN');
    for (const row of p.records) {
      requireRule(required.has(row.lectureId), 'LEARNING_UNEXPECTED_LECTURE');
      // Even equal duplicates are a malformed required-only projection. Never
      // turn omitted records into completed=false or enlarge the denominator.
      requireRule(!records.has(row.lectureId), 'LEARNING_LECTURE_DUPLICATE');
      records.set(row.lectureId, { ...row });
    }
  }
  requireRule([...required].every(id => records.has(id)), 'LEARNING_MISSING_REQUIRED');
  return { dataMode: 'SYNTHETIC', policyHash: compiled.policyHash, learnerId: context.learnerId,
    snapshotVersion: m.snapshotVersion, observedAt: m.observedAt, completeSnapshot: true,
    records: compiled.policy.requiredLectureIds.map(id => records.get(id)) };
}

// Authenticating a real provider is explicitly out of scope: a hash only binds
// bytes to a separately trusted synthetic pin. No signatures or grant output.
export function assessSyntheticLearningEvidence(compiled, context, bundle) {
  learningExpectation(compiled, context);
  try {
    const value = snapshot(compiled, context, bundle);
    return freeze({ ...flags, status: 'COMPLETE_SYNTHETIC', reason: null, snapshot: value,
      manifestHash: context.manifestHash, snapshotHash: hash(value) });
  } catch (error) {
    if (!(error instanceof RuleError)) throw error;
    return heldLearningEvidence(error.message);
  }
}
