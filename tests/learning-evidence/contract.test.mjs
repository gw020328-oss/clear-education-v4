import test from 'node:test';
import assert from 'node:assert/strict';
import { id } from 'ethers';
import { fixture } from './fixture.mjs';
import { draft } from '../policy/fixture.mjs';
import { compileSyntheticPolicy } from '../../src/policy/compiler.mjs';
import { assessSyntheticLearningEvidence } from '../../src/learning-evidence/synthetic-contract.mjs';
import { evaluateSyntheticEligibility } from '../../src/eligibility/synthetic-evaluator.mjs';

function held(f, code) {
  const r = f.assess(); assert.equal(r.status, 'ON_HOLD'); assert.equal(r.reason, code);
  assert.equal(r.snapshot, null); assert.equal(r.snapshotHash, null); assert.equal(r.paymentAllowed, false);
}
const evaluate = (f, result) => evaluateSyntheticEligibility(f.compiled, { learnerId: f.trusted.learnerId,
  expectedSeedSnapshotVersion: f.trusted.snapshotVersion, exams: f.exams, learning: result.snapshot });

test('complete pinned required-only projection feeds unchanged 800 AND 80% evaluator with detached immutable output', () => {
  const f = fixture(), r = f.assess(); assert.equal(r.status, 'COMPLETE_SYNTHETIC');
  assert.equal(evaluate(f, r).status, 'ELIGIBLE');
  for (const key of ['liveSupported', 'collectionEnabled', 'proofVerified', 'paymentAllowed']) assert.equal(r[key], false);
  assert.ok(Object.isFrozen(r.snapshot.records[0]));
  f.bundle.pages[0].records[0].completed = false;
  assert.equal(r.snapshot.records[0].completed, true);
});

for (const [field, value, reason] of [
  ['profile', 'REAL_LEARNING', 'LEARNING_SOURCE_UNSUPPORTED'], ['dataMode', 'REAL', 'LEARNING_SOURCE_UNSUPPORTED'],
  ['providerId', 'other', 'LEARNING_SOURCE_CONTEXT'], ['applicationId', id('other'), 'LEARNING_SOURCE_CONTEXT'],
  ['learnerId', 'other', 'LEARNING_SOURCE_CONTEXT'], ['subjectRef', id('other'), 'LEARNING_SOURCE_CONTEXT'],
  ['policyHash', id('other'), 'LEARNING_POLICY'], ['requiredLectureIdsHash', id('other'), 'LEARNING_POLICY'],
  ['completionRuleVersion', 'other', 'LEARNING_POLICY'], ['snapshotVersion', 'seed-2', 'LEARNING_VERSION_CHANGED'],
]) test('independently pinned but wrong ' + field + ' is held', () => {
  const f = fixture(); f.bundle.manifest[field] = value; f.repin(); held(f, reason);
});

test('response supplied new hash cannot replace trusted manifest pin', () => {
  const f = fixture(); f.bundle.manifest.validUntil = f.now(); held(f, 'LEARNING_MANIFEST_PIN');
});

for (const field of ['learningStart', 'learningEnd', 'coverageStart', 'coverageEnd']) test('period coverage mismatch: ' + field, () => {
  const f = fixture(), m = f.bundle.manifest;
  m[field] = String(BigInt(m[field]) + (field === 'coverageEnd' ? -1n : 1n)); f.repin(); held(f, 'LEARNING_COVERAGE');
});

for (const mode of ['future', 'expired', 'too-old', 'invalid-validity', 'extended-validity', 'open-period']) test('time boundary ' + mode, () => {
  const f = fixture(), m = f.bundle.manifest;
  if (mode === 'future') m.observedAt = String(BigInt(f.now()) + 1n);
  if (mode === 'expired') { m.validUntil = f.now(); f.setTime(BigInt(f.now()) + 1n); }
  if (mode === 'too-old') f.setTime(BigInt(f.now()) + 301n);
  if (mode === 'invalid-validity') m.validUntil = String(BigInt(m.observedAt) - 1n);
  if (mode === 'extended-validity') m.validUntil = String(BigInt(m.observedAt) + 301n);
  if (mode === 'open-period') m.observedAt = String(BigInt(m.learningEnd) - 1n);
  f.repin(); held(f, mode === 'open-period' ? 'LEARNING_PERIOD_OPEN' : 'LEARNING_STALE');
});

test('closed period and exact 300-second expiry boundary accepted, next second held', () => {
  const f = fixture(); f.setTime(BigInt(f.now()) + 300n); assert.equal(f.assess().status, 'COMPLETE_SYNTHETIC');
  f.setTime(BigInt(f.now()) + 1n); held(f, 'LEARNING_STALE');
});

for (const mode of ['missing', 'extra', 'duplicate', 'hash', 'offset', 'link', 'subject', 'version', 'terminal', 'pin-duplicate', 'pin-offset']) test('page completeness ' + mode, () => {
  const f = fixture(), { bundle: b } = f, p = b.pages[0];
  if (mode === 'missing') b.pages.pop();
  if (mode === 'extra') b.pages.push(structuredClone(p));
  if (mode === 'duplicate') b.pages[1] = structuredClone(p);
  if (mode === 'hash') p.records[0].completedAt = f.compiled.policy.learningEnd;
  if (mode === 'offset') { p.offset++; f.seal(); }
  if (mode === 'link') { p.nextPageId = null; f.seal(); }
  if (mode === 'subject') { p.subjectRef = id('other'); f.seal(); }
  if (mode === 'version') { p.snapshotVersion = 'seed-2'; f.seal(); }
  if (mode === 'terminal') { b.manifest.terminalPageId = 'page-0'; f.repin(); }
  if (mode === 'pin-duplicate') { b.manifest.pages[1].pageId = 'page-0'; f.repin(); }
  if (mode === 'pin-offset') { b.manifest.pages[1].offset++; f.repin(); }
  assert.equal(f.assess().status, 'ON_HOLD'); assert.equal(f.assess().snapshot, null);
});

for (const mode of ['missing', 'equal-duplicate', 'conflict', 'unrequired', 'unknown-completed', 'null-time', 'false-with-time', 'future', 'nonnormalized']) test('lecture validation ' + mode, () => {
  const f = fixture(), rows = f.bundle.pages.flatMap(p => p.records);
  if (mode === 'missing') rows.pop();
  if (mode === 'equal-duplicate') rows[1] = { ...rows[0] };
  if (mode === 'conflict') rows[1] = { ...rows[0], completed: false, completedAt: null };
  if (mode === 'unrequired') rows[0].lectureId = 'unrequired';
  if (mode === 'unknown-completed') rows[0].completed = null;
  if (mode === 'null-time') rows[0].completedAt = null;
  if (mode === 'false-with-time') rows[0].completed = false;
  if (mode === 'future') rows[0].completedAt = String(BigInt(f.now()) + 1n);
  if (mode === 'nonnormalized') rows[0].lectureId = 'e\u0301';
  f.setRows(rows); assert.equal(f.assess().status, 'ON_HOLD'); assert.equal(f.assess().snapshot, null);
});

for (const where of ['bundle', 'manifest', 'pin', 'page', 'row']) test('extra private or verification field rejected at ' + where, () => {
  const f = fixture(), b = f.bundle;
  const target = ({ bundle: b, manifest: b.manifest, pin: b.manifest.pages[0], page: b.pages[0], row: b.pages[0].records[0] })[where];
  target.verified = true; assert.equal(f.assess().status, 'ON_HOLD');
});

test('malformed or participant-supplied context fails instead of creating a trusted pin', () => {
  const f = fixture();
  assert.throws(() => assessSyntheticLearningEvidence({}, f.context(), f.bundle), /COMPILED_POLICY_REQUIRED/);
  assert.throws(() => assessSyntheticLearningEvidence(f.compiled, { ...f.context(), providerToken: 'not-allowed' }, f.bundle), /LEARNING_CONTEXT/);
});

test('out-of-period completions remain records but do not count; both exact period ends count', () => {
  const f = fixture(), rows = f.bundle.pages.flatMap(p => p.records), p = f.compiled.policy;
  rows[0].completedAt = p.learningStart; rows[1].completedAt = p.learningEnd;
  f.setRows(rows); assert.equal(evaluate(f, f.assess()).completedCount, 4);
  rows[0].completedAt = String(BigInt(p.learningStart) - 1n); f.setRows(rows);
  assert.equal(evaluate(f, f.assess()).completedCount, 3);
  assert.equal(evaluate(f, f.assess()).status, 'NOT_YET_MET');
  rows[0].completedAt = String(BigInt(p.learningEnd) + 1n); f.setRows(rows);
  assert.equal(evaluate(f, f.assess()).completedCount, 3);
});

test('page and lecture order does not alter normalized snapshot or evaluation', () => {
  const f = fixture(), before = f.assess(), rows = f.bundle.pages.flatMap(p => p.records).reverse();
  f.setRows(rows, 3); f.bundle.pages.reverse();
  assert.deepEqual(f.assess().snapshot, before.snapshot); assert.equal(f.assess().snapshotHash, before.snapshotHash);
});

test('maximum 10,000 required lectures: 79.99% fails and 80% passes without rounding', () => {
  const p = draft(); p.requiredLectureIds = Array.from({ length: 10000 }, (_, i) => 'lecture-' + i);
  const f = fixture({ compiled: compileSyntheticPolicy(p) }), rows = f.compiled.policy.requiredLectureIds.map((lectureId, i) => ({
    lectureId, completed: i < 7999, completedAt: i < 7999 ? p.learningStart : null }));
  f.setRows(rows, 100); assert.equal(evaluate(f, f.assess()).status, 'NOT_YET_MET');
  rows[7999] = { ...rows[7999], completed: true, completedAt: p.learningStart };
  f.setRows(rows, 100); assert.equal(evaluate(f, f.assess()).status, 'ELIGIBLE');
});
