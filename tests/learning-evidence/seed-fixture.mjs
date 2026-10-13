import { fixture } from './fixture.mjs';
import { hash } from '../../src/policy/values.mjs';
import { projectSyntheticSeedLearning, createSyntheticSeedProvider, SEED_ACTIVITY_PROFILE,
  SEED_MAPPING_VERSION } from '../../src/learning-evidence/seed-provider.mjs';
import { collectSyntheticLearningEvidence } from '../../src/learning-evidence/synthetic-adapter.mjs';

// Invented source and INDEPENDENT test resolver; never resolve a real pin by
// blindly trusting the same unauthenticated response being evaluated.
export function seedFixture(options) {
  const f = fixture(options), m = f.bundle.manifest, p = f.compiled.policy;
  const binding = { dataMode: 'SYNTHETIC', institutionId: 'synthetic-school', providerId: m.providerId,
    courseId: 'synthetic-course', applicationId: m.applicationId, learnerId: m.learnerId, subjectRef: m.subjectRef,
    policyHash: m.policyHash, activitySetVersion: 'required-1', sourceRevision: 'revision-1',
    completionMappingVersion: SEED_MAPPING_VERSION,
    activities: p.requiredLectureIds.map((lectureId, i) => ({ activityId: 'activity-' + i, lectureId })) };
  const input = { profile: SEED_ACTIVITY_PROFILE, dataMode: 'SYNTHETIC', institutionId: binding.institutionId,
    providerId: binding.providerId, courseId: binding.courseId, subjectRef: binding.subjectRef,
    activitySetVersion: binding.activitySetVersion, sourceRevision: binding.sourceRevision,
    learningStart: p.learningStart, learningEnd: p.learningEnd, coverageStart: p.learningStart, coverageEnd: p.learningEnd,
    observedAt: m.observedAt, validUntil: m.validUntil, completeness: 'COMPLETE', correctionState: 'UNCHANGED',
    records: binding.activities.map((a, i) => ({ activityId: a.activityId, state: i < 4 ? 'COMPLETE' : 'INCOMPLETE',
      tracking: 'AUTOMATIC', overridden: false, completedAt: i < 4 ? p.learningStart : null, stateChangedAt: null })) };
  const calls = [], source = { profile: SEED_ACTIVITY_PROFILE, providerId: binding.providerId,
    async readSnapshot(request, options) { calls.push(['read', request, options]); return structuredClone(input); },
    async close() { calls.push(['close']); } };
  const project = () => projectSyntheticSeedLearning(f.compiled, binding, input);
  const trusted = { ...f.trusted };
  const repin = () => { const b = project(); trusted.snapshotVersion = b.manifest.snapshotVersion; trusted.manifestHash = hash(b.manifest); };
  repin();
  const provider = () => createSyntheticSeedProvider(f.compiled, binding, source);
  const run = (options = {}) => collectSyntheticLearningEvidence(f.compiled, trusted, provider(), { now: f.now, ...options });
  return { ...f, binding, input, source, calls, trusted, project, provider, repin, run };
}
