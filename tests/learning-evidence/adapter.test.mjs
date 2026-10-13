import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture.mjs';
import { collectSyntheticLearningEvidence as collect } from '../../src/learning-evidence/synthetic-adapter.mjs';
import { RuleError } from '../../src/policy/values.mjs';
import { evaluateSyntheticEligibility } from '../../src/eligibility/synthetic-evaluator.mjs';
const run = (f, options = {}) => collect(f.compiled, f.trusted, f.source, { now: f.now, ...options });

test('adapter reads only pinned pages, rechecks revision, closes and provides minimal evaluator input', async () => {
  const f = fixture(), r = await run(f); assert.equal(r.status, 'COMPLETE_SYNTHETIC');
  assert.deepEqual(f.calls.map(c => c[0]), ['manifest', 'page', 'page', 'page', 'manifest', 'close']);
  assert.deepEqual(Object.keys(f.calls[0][1]).sort(), ['applicationId', 'learnerId', 'subjectRef', 'policyHash', 'snapshotVersion',
    'requiredLectureIdsHash', 'learningStart', 'learningEnd'].sort());
  assert.equal(r.snapshot.records.length, 5); assert.equal(r.paymentAllowed, false);
});

for (const mode of ['unconfigured', 'real-profile', 'wrong-provider', 'wrong-pin']) test('source is blocked before page reads: ' + mode, async () => {
  const f = fixture();
  if (mode === 'unconfigured') f.source.readManifest = null;
  if (mode === 'real-profile') f.source.profile = 'REAL_LEARNING';
  if (mode === 'wrong-provider') f.source.providerId = 'other';
  if (mode === 'wrong-pin') f.trusted.manifestHash = '0x' + '00'.repeat(32);
  const r = await run(f); assert.equal(r.status, 'ON_HOLD');
  assert.equal(f.calls.filter(c => c[0] === 'page').length, 0); assert.equal(f.calls.at(-1)[0], 'close');
});

for (const phase of ['manifest', 'page', 'final-manifest', 'close', 'uncloneable']) test('source failure has no partial snapshot or private error at ' + phase, async () => {
  const f = fixture(); let manifests = 0;
  if (phase === 'manifest') f.source.readManifest = () => { throw new RuleError('secret-provider-response'); };
  if (phase === 'page') f.source.readPage = async () => { throw new Error('secret-provider-response'); };
  if (phase === 'final-manifest') { const read = f.source.readManifest; f.source.readManifest = (...a) => {
    if (++manifests === 2) throw new Error('secret-provider-response'); return read(...a);
  }; }
  if (phase === 'close') f.source.close = async () => { throw new Error('secret-provider-response'); };
  if (phase === 'uncloneable') f.source.readManifest = () => ({ fn() {} });
  const r = await run(f); assert.equal(r.status, 'ON_HOLD'); assert.equal(r.snapshot, null);
  assert.equal(r.reason, phase === 'close' ? 'LEARNING_CLEANUP_FAILED' : 'LEARNING_SOURCE_UNAVAILABLE');
  assert.ok(!JSON.stringify(r).includes('secret-provider-response'));
});

for (const mode of ['version', 'same-version-correction']) test('revision during pagination is held: ' + mode, async () => {
  const f = fixture(), read = f.source.readManifest; let reads = 0;
  f.source.readManifest = (...args) => {
    if (++reads === 2) {
      if (mode === 'version') f.bundle.manifest.snapshotVersion = 'seed-2';
      else f.bundle.manifest.validUntil = f.now();
    }
    return read(...args);
  };
  const r = await run(f); assert.equal(r.reason, mode === 'version' ? 'LEARNING_VERSION_CHANGED' : 'LEARNING_MANIFEST_PIN');
  assert.equal(r.snapshot, null); assert.equal(f.calls.at(-1)[0], 'close');
});

for (const mode of ['pre-abort', 'abort', 'timeout']) test('cancelled reads close resources with no result: ' + mode, async () => {
  const f = fixture(), cancel = new AbortController(); let entered, closed = false;
  const waiting = new Promise(resolve => { entered = resolve; });
  f.source.readPage = () => { entered(); return new Promise(() => {}); };
  f.source.close = async () => { closed = true; };
  if (mode === 'pre-abort') cancel.abort();
  const pending = run(f, { signal: cancel.signal, timeoutMs: mode === 'timeout' ? 20 : 10000 });
  if (mode === 'abort') { await waiting; cancel.abort(); }
  const r = await pending; assert.equal(r.reason, mode === 'timeout' ? 'LEARNING_TIMEOUT' : 'LEARNING_CANCELLED');
  assert.equal(r.snapshot, null); assert.equal(closed, true);
  if (mode === 'pre-abort') assert.equal(f.calls.length, 0);
});

test('expiry during cleanup is rechecked after resources close', async () => {
  const f = fixture(); f.source.close = async () => f.setTime(BigInt(f.now()) + 301n);
  assert.equal((await run(f)).reason, 'LEARNING_STALE');
});

test('trusted context and provider response are copied across awaits', async () => {
  const f = fixture(), old = { ...f.trusted }, read = f.source.readPage;
  f.source.readManifest = async () => f.bundle.manifest;
  f.source.readPage = async (...args) => {
    const result = await read(...args);
    f.trusted.learnerId = 'changed';
    return result;
  };
  const r = await run(f); assert.equal(r.status, 'COMPLETE_SYNTHETIC'); assert.equal(r.snapshot.learnerId, old.learnerId);
});

test('B2b accepted exam snapshot and B3 synthetic learning input keep existing AND policy and payment block', async t => {
  const { fixture: productFixture } = await import('../product-proof/fixture.mjs');
  const p = await productFixture(t); await p.accept(await p.signed());
  const exams = await p.snapshot(), f = fixture({ compiled: p.app.compiled, applicationId: p.applicationId,
    learnerId: exams.learnerId, now: p.app.time });
  const learning = await run(f);
  const result = evaluateSyntheticEligibility(p.app.compiled, { learnerId: exams.learnerId,
    expectedSeedSnapshotVersion: f.trusted.snapshotVersion, exams, learning: learning.snapshot });
  assert.equal(result.status, 'ELIGIBLE'); assert.equal(result.selectedExamKey, 'b'); assert.equal(result.completedCount, 4);
  assert.equal(result.paymentAllowed, false); assert.equal(p.rows(), 1);
});
