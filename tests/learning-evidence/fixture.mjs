import { id } from 'ethers';
import { compileSyntheticPolicy } from '../../src/policy/compiler.mjs';
import { hash } from '../../src/policy/values.mjs';
import { assessSyntheticLearningEvidence, LEARNING_SOURCE_PROFILE } from '../../src/learning-evidence/synthetic-contract.mjs';
import { draft, epoch, exam } from '../policy/fixture.mjs';

// Test-only source and trusted resolver. No provider API or account is implied.
export function fixture({ compiled = compileSyntheticPolicy(draft()), learnerId = 'synthetic-learner',
  applicationId = id('synthetic-application'), now = epoch('2020-02-03T00:00:00Z') } = {}) {
  const policy = compiled.policy, subjectRef = id('synthetic-learning-account');
  const manifest = { profile: LEARNING_SOURCE_PROFILE, dataMode: 'SYNTHETIC', providerId: 'synthetic-seed',
    applicationId, learnerId, subjectRef, policyHash: compiled.policyHash, requiredLectureIdsHash: compiled.requiredLectureIdsHash,
    completionRuleVersion: policy.completionRuleVersion, snapshotVersion: 'seed-1', observedAt: String(now),
    validUntil: String(BigInt(now) + 300n), learningStart: policy.learningStart, learningEnd: policy.learningEnd,
    coverageStart: policy.learningStart, coverageEnd: policy.learningEnd, totalRows: 0, pages: [], terminalPageId: 'unset' };
  const bundle = { manifest, pages: [] }, trusted = { applicationId, learnerId, providerId: manifest.providerId,
    subjectRef, snapshotVersion: manifest.snapshotVersion, manifestHash: null };
  const context = () => ({ ...trusted, now: String(now) });
  function repin() { trusted.manifestHash = hash(manifest); }
  function seal() {
    manifest.pages = bundle.pages.map(p => ({ pageId: p.pageId, offset: p.offset, rowCount: p.records.length, pageHash: hash(p) }));
    manifest.totalRows = bundle.pages.reduce((n, p) => n + p.records.length, 0);
    manifest.terminalPageId = bundle.pages.at(-1)?.pageId ?? 'missing'; repin();
  }
  function setRows(rows, pageSize = 2) {
    const chunks = []; for (let i = 0; i < rows.length; i += pageSize) chunks.push(rows.slice(i, i + pageSize));
    bundle.pages = chunks.map((records, i) => ({ pageId: 'page-' + i, snapshotVersion: manifest.snapshotVersion,
      subjectRef, offset: i * pageSize, nextPageId: i + 1 < chunks.length ? 'page-' + (i + 1) : null, records }));
    seal();
  }
  setRows(policy.requiredLectureIds.map((lectureId, i) => ({ lectureId, completed: i < 4, completedAt: i < 4 ? policy.learningStart : null })));
  const calls = [], source = { profile: LEARNING_SOURCE_PROFILE, providerId: manifest.providerId,
    async readManifest(request) { calls.push(['manifest', request]); return structuredClone(manifest); },
    async readPage(request) { calls.push(['page', request]); return structuredClone(bundle.pages.find(p => p.pageId === request.pageId)); },
    async close() { calls.push(['close']); } };
  const exams = { dataMode: 'SYNTHETIC', policyHash: compiled.policyHash, learnerId, snapshotVersion: 'exam-1',
    observedAt: String(now), completeSnapshot: true, sourcePolicySetHash: policy.sourcePolicySetHash, records: [exam()] };
  return { compiled, bundle, trusted, source, calls, context, repin, seal, setRows, exams,
    now: () => String(now), setTime: value => { now = String(value); },
    assess: () => assessSyntheticLearningEvidence(compiled, context(), bundle) };
}
