import { MAX_LECTURES, requireCompiledPolicy } from '../policy/compiler.mjs';
import { array, exactKeys, freeze, hash, hash32, identifier, requireRule, timestamp } from '../policy/values.mjs';
import { LEARNING_SOURCE_PROFILE } from './synthetic-contract.mjs';

// CLEAR's invented seed format, NOT a Moodle response or live provider.
export const SEED_ACTIVITY_PROFILE = 'synthetic-seed-activities.1';
export const SEED_MAPPING_VERSION = 'seed-automatic-completion.1';
const opaque = value => requireRule(identifier(value, 'SEED_BINDING') === value, 'SEED_BINDING');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function bindingFor(compiled, input) {
  const policy = requireCompiledPolicy(compiled), b = structuredClone(input);
  exactKeys(b, ['dataMode', 'institutionId', 'providerId', 'courseId', 'applicationId', 'learnerId', 'subjectRef',
    'policyHash', 'activitySetVersion', 'sourceRevision', 'completionMappingVersion', 'activities'], 'SEED_BINDING');
  requireRule(b.dataMode === 'SYNTHETIC' && b.completionMappingVersion === SEED_MAPPING_VERSION, 'SEED_MAPPING_UNSUPPORTED');
  for (const k of ['institutionId', 'providerId', 'courseId', 'learnerId', 'activitySetVersion', 'sourceRevision']) opaque(b[k]);
  for (const k of ['applicationId', 'subjectRef', 'policyHash']) hash32(b[k], 'SEED_BINDING');
  requireRule(b.policyHash === compiled.policyHash, 'SEED_BINDING_POLICY');
  array(b.activities, MAX_LECTURES, 'SEED_ACTIVITY_SET');
  requireRule(b.activities.length > 0 && b.activities.length === policy.requiredLectureIds.length, 'SEED_ACTIVITY_SET');
  const ids = new Set(), lectures = new Set();
  for (const row of b.activities) {
    exactKeys(row, ['activityId', 'lectureId'], 'SEED_ACTIVITY_SET'); opaque(row.activityId); opaque(row.lectureId);
    requireRule(!ids.has(row.activityId) && !lectures.has(row.lectureId), 'SEED_ACTIVITY_DUPLICATE');
    ids.add(row.activityId); lectures.add(row.lectureId);
  }
  requireRule(policy.requiredLectureIds.every(id => lectures.has(id)), 'SEED_ACTIVITY_SET');
  b.activities.sort((a, c) => compare(a.lectureId, c.lectureId));
  return freeze(b);
}

// Pure projection into the EXISTING B3 contract. The caller still needs an
// independently trusted manifest/version pin before assessing or collecting.
export function projectSyntheticSeedLearning(compiled, binding, input) {
  const b = bindingFor(compiled, binding), s = structuredClone(input), p = compiled.policy;
  exactKeys(s, ['profile', 'dataMode', 'institutionId', 'providerId', 'courseId', 'subjectRef', 'activitySetVersion',
    'sourceRevision', 'learningStart', 'learningEnd', 'coverageStart', 'coverageEnd', 'observedAt', 'validUntil',
    'completeness', 'correctionState', 'records'], 'SEED_SOURCE_SCHEMA');
  requireRule(s.profile === SEED_ACTIVITY_PROFILE && s.dataMode === 'SYNTHETIC', 'SEED_SOURCE_UNSUPPORTED');
  requireRule(['institutionId', 'providerId', 'courseId', 'subjectRef'].every(k => s[k] === b[k]), 'SEED_SOURCE_CONTEXT');
  requireRule(s.activitySetVersion === b.activitySetVersion && s.sourceRevision === b.sourceRevision, 'SEED_SOURCE_REVISION');
  requireRule(s.completeness === 'COMPLETE', 'SEED_SOURCE_INCOMPLETE');
  requireRule(s.correctionState === 'UNCHANGED', 'SEED_CORRECTION_UNCONFIRMED');
  for (const k of ['learningStart', 'learningEnd', 'coverageStart', 'coverageEnd', 'observedAt', 'validUntil']) timestamp(s[k], 'SEED_SOURCE_TIME');
  requireRule(s.learningStart === p.learningStart && s.learningEnd === p.learningEnd
    && BigInt(s.coverageStart) <= BigInt(p.learningStart) && BigInt(s.coverageEnd) >= BigInt(p.learningEnd), 'SEED_SOURCE_PERIOD');
  array(s.records, MAX_LECTURES, 'SEED_SOURCE_RECORDS');
  const required = new Set(b.activities.map(a => a.activityId)), records = new Map();
  for (const row of s.records) {
    exactKeys(row, ['activityId', 'state', 'tracking', 'overridden', 'completedAt', 'stateChangedAt'], 'SEED_ACTIVITY_SCHEMA');
    requireRule(required.has(row.activityId), 'SEED_ACTIVITY_UNEXPECTED');
    requireRule(!records.has(row.activityId), 'SEED_ACTIVITY_DUPLICATE');
    // This version accepts only invented, automatic, non-overridden activity
    // completion. Other provider semantics require a separately reviewed map.
    requireRule(row.tracking === 'AUTOMATIC' && row.overridden === false
      && ['INCOMPLETE', 'COMPLETE', 'PASS'].includes(row.state), 'SEED_COMPLETION_UNMAPPED');
    const completed = row.state !== 'INCOMPLETE';
    if (completed) {
      timestamp(row.completedAt, 'SEED_COMPLETION_TIME_UNKNOWN');
      requireRule(BigInt(row.completedAt) <= BigInt(s.observedAt), 'SEED_COMPLETION_TIME');
    } else requireRule(row.completedAt === null, 'SEED_COMPLETION_TIME');
    if (row.stateChangedAt !== null) {
      timestamp(row.stateChangedAt, 'SEED_STATE_TIME');
      requireRule(BigInt(row.stateChangedAt) <= BigInt(s.observedAt)
        && (!completed || BigInt(row.stateChangedAt) >= BigInt(row.completedAt)), 'SEED_STATE_TIME');
    }
    records.set(row.activityId, { completed, completedAt: row.completedAt });
  }
  requireRule(b.activities.every(a => records.has(a.activityId)), 'SEED_ACTIVITY_MISSING');
  s.records.sort((a, c) => compare(a.activityId, c.activityId));
  // Bind source metadata, corrections/times and mapping to the old manifest,
  // including fields omitted from the evaluator's intentionally minimal DTO.
  const snapshotVersion = hash({ binding: b, snapshot: s }).slice(2);
  const rows = b.activities.map(a => ({ lectureId: a.lectureId, ...records.get(a.activityId) })), pages = [];
  for (let offset = 0; offset < rows.length; offset += 100) pages.push({ pageId: 'seed-' + pages.length, snapshotVersion,
    subjectRef: b.subjectRef, offset, nextPageId: offset + 100 < rows.length ? 'seed-' + (pages.length + 1) : null,
    records: rows.slice(offset, offset + 100) });
  const manifest = { profile: LEARNING_SOURCE_PROFILE, dataMode: 'SYNTHETIC', providerId: b.providerId,
    applicationId: b.applicationId, learnerId: b.learnerId, subjectRef: b.subjectRef, policyHash: compiled.policyHash,
    requiredLectureIdsHash: compiled.requiredLectureIdsHash, completionRuleVersion: p.completionRuleVersion,
    snapshotVersion, observedAt: s.observedAt, validUntil: s.validUntil, learningStart: s.learningStart, learningEnd: s.learningEnd,
    coverageStart: s.coverageStart, coverageEnd: s.coverageEnd, totalRows: rows.length,
    pages: pages.map(page => ({ pageId: page.pageId, offset: page.offset, rowCount: page.records.length, pageHash: hash(page) })),
    terminalPageId: pages.at(-1).pageId };
  return freeze({ manifest, pages });
}

// A concrete synthetic seed provider for collectSyntheticLearningEvidence.
// No HTTP, token, provider registry, evaluator or payment dependency here.
export function createSyntheticSeedProvider(compiled, binding, source) {
  const b = bindingFor(compiled, binding);
  requireRule(source?.profile === SEED_ACTIVITY_PROFILE && source.providerId === b.providerId
    && typeof source.readSnapshot === 'function' && typeof source.close === 'function', 'SEED_SOURCE_UNSUPPORTED');
  const request = freeze({ institutionId: b.institutionId, providerId: b.providerId, courseId: b.courseId,
    subjectRef: b.subjectRef, activitySetVersion: b.activitySetVersion, sourceRevision: b.sourceRevision,
    activities: b.activities, learningStart: compiled.policy.learningStart, learningEnd: compiled.policy.learningEnd });
  let bundle = null, closed = false;
  return Object.freeze({ profile: LEARNING_SOURCE_PROFILE, providerId: b.providerId,
    async readManifest(expected, { signal } = {}) {
      requireRule(!closed, 'SEED_PROVIDER_CLOSED');
      requireRule(expected.applicationId === b.applicationId && expected.learnerId === b.learnerId
        && expected.subjectRef === b.subjectRef && expected.policyHash === b.policyHash, 'SEED_SOURCE_CONTEXT');
      const input = await source.readSnapshot(request, { signal });
      requireRule(!closed, 'SEED_PROVIDER_CLOSED'); signal?.throwIfAborted();
      bundle = projectSyntheticSeedLearning(compiled, b, input);
      return bundle.manifest;
    },
    async readPage({ pageId }) {
      requireRule(!closed && bundle, 'SEED_PROVIDER_CLOSED');
      const page = bundle.pages.find(p => p.pageId === pageId); requireRule(page, 'SEED_ACTIVITY_MISSING'); return page;
    },
    async close() { if (closed) return; closed = true; bundle = null; await source.close(); },
  });
}
