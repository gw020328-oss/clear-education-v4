import test from 'node:test';
import assert from 'node:assert/strict';
import { id } from 'ethers';
import { fixture, registration, score } from './fixture.mjs';
import { SOURCE_CONTRACT_HASH, assessSyntheticExamEvidence } from '../../src/exam-evidence/synthetic-completeness.mjs';
import { hash } from '../../src/policy/values.mjs';
import { evaluateSyntheticEligibility } from '../../src/eligibility/synthetic-evaluator.mjs';

function held(f, reason) {
  const r = f.assess(); assert.equal(r.status, 'ON_HOLD');
  if (reason) assert.deepEqual(r.reasons, [reason]);
  assert.equal(r.highestScoreAssessed, false); assert.equal(r.snapshot, null); assert.equal(r.highestScore, null);
  assert.equal(r.paymentAllowed, false); assert.equal(r.proofVerified, false); return r;
}

test('pinned multi-page inventory yields the single highest total and feeds the existing synthetic evaluator', () => {
  const f = fixture(), r = f.assess();
  assert.equal(r.status, 'COMPLETE_SYNTHETIC'); assert.equal(r.highestScore, 900); assert.equal(r.selectedExamKey, 'b');
  const input = { learnerId: r.snapshot.learnerId, expectedSeedSnapshotVersion: 'seed-1', exams: r.snapshot,
    learning: { dataMode: 'SYNTHETIC', learnerId: r.snapshot.learnerId, policyHash: f.compiled.policyHash,
      snapshotVersion: 'seed-1', observedAt: f.context.now, completeSnapshot: true,
      records: f.compiled.policy.requiredLectureIds.map(lectureId => ({ lectureId, completed: true, completedAt: f.compiled.policy.learningStart })) } };
  const result = evaluateSyntheticEligibility(f.compiled, input);
  assert.equal(result.status, 'ELIGIBLE'); assert.equal(result.selectedExamKey, 'b'); assert.equal(result.paymentAllowed, false);
  assert.equal(r.proofVerified, false); assert.equal(r.liveSupported, false); assert.equal(r.collectionEnabled, false);
  assert.ok(Object.isFrozen(r.snapshot.records));
});

test('manifest and output are deterministic, order of transported pages is irrelevant, and output does not alias input', () => {
  const f = fixture(), first = f.assess(); f.bundle.pages.reverse(); assert.deepEqual(f.assess(), first);
  f.bundle.pages[0].records[0].totalScore = 10; assert.equal(first.highestScore, 900);
  assert.equal(hash(f.bundle.manifest), f.context.manifestHash);
  assert.equal(first.snapshot.sourcePolicySetHash, SOURCE_CONTRACT_HASH);
});

test('full empty inventories are represented by authenticated empty terminal pages', () => {
  const f = fixture(); f.setRows([], []); const r = f.assess();
  assert.equal(r.status, 'COMPLETE_SYNTHETIC'); assert.equal(r.highestScore, null); assert.deepEqual(r.snapshot.records, []);
  f.bundle.pages = []; held(f, 'PAGE_MISSING_OR_EXTRA');
});

for (const [name, mutate, reason] of [
  ['partial pair only', f => { f.bundle.pages = f.bundle.pages.slice(0, 1); }, 'PAGE_MISSING_OR_EXTRA'],
  ['missing last score page', f => { f.bundle.pages.pop(); }, 'PAGE_MISSING_OR_EXTRA'],
  ['missing first page', f => { f.bundle.pages.shift(); }, 'PAGE_MISSING_OR_EXTRA'],
  ['extra repeated page', f => { f.bundle.pages.push(structuredClone(f.bundle.pages[0])); }, 'PAGE_MISSING_OR_EXTRA'],
  ['changed score', f => { f.bundle.pages[2].records[0].totalScore = 990; }, 'PAGE_HASH_MISMATCH'],
  ['missing highest-score row', f => { f.bundle.pages[2].records.pop(); }, 'PAGE_HASH_MISMATCH'],
  ['attacker recomputes all hashes after dropping highest-score candidate', f => {
    const pin = f.context.manifestHash; f.setRows([registration('a'), registration('c')], [score('a', 795), score('c', 850)]); f.context.manifestHash = pin;
  }, 'MANIFEST_PIN_MISMATCH'],
  ['unrecognized completion flag', f => { f.bundle.completeSnapshot = true; }, 'EVIDENCE_SCHEMA'],
]) test(name + ' cannot establish completeness', () => { const f = fixture(); mutate(f); held(f, reason); });

for (const [name, mutate, reason] of [
  ['offset gap', f => { f.bundle.pages[1].offset++; }, 'PAGE_GAP'],
  ['offset overlap', f => { f.bundle.pages[1].offset--; }, 'PAGE_GAP'],
  ['early termination', f => { f.bundle.pages[0].nextPageId = null; }, 'PAGE_CHAIN'],
  ['cursor loop', f => { f.bundle.pages[1].nextPageId = f.bundle.pages[0].pageId; }, 'PAGE_CHAIN'],
  ['cross-page snapshot change', f => { f.bundle.pages[1].snapshotId = 'snapshot-2'; }, 'PAGE_CONTEXT'],
  ['different account page', f => { f.bundle.pages[1].subjectRef = id('SYNTHETIC_OTHER'); }, 'PAGE_CONTEXT'],
  ['different session page', f => { f.bundle.pages[1].bindingDigest = id('SYNTHETIC_OTHER'); }, 'PAGE_CONTEXT'],
  ['different observation time', f => { f.bundle.pages[1].observedAt = String(BigInt(f.context.now) - 1n); }, 'PAGE_CONTEXT'],
]) test('even a pinned source with ' + name + ' is held', () => { const f = fixture(); mutate(f); f.seal(); held(f, reason); });

for (const [name, mutate, reason] of [
  ['wrong filter period', m => { m.scope.examDateStart = '2020-01-02'; }, 'SCOPE_MISMATCH'],
  ['valid-only filter', m => { m.scope.allStatuses = false; }, 'SCOPE_MISMATCH'],
  ['retention truncates history', m => { m.scope.coverageStart = '2020-01-02'; }, 'SCOPE_TRUNCATED'],
  ['coverage ends early', m => { m.scope.coverageEnd = '2020-01-30'; }, 'SCOPE_TRUNCATED'],
  ['wrong learner', m => { m.learnerId = 'someone-else'; }, 'MANIFEST_CONTEXT'],
  ['wrong binding', m => { m.bindingDigest = id('wrong-binding'); }, 'MANIFEST_CONTEXT'],
  ['wrong policy', m => { m.policyHash = id('wrong-policy'); }, 'MANIFEST_CONTEXT'],
  ['old pair policy', m => { m.sourcePolicySetHash = id('old-source'); }, 'MANIFEST_CONTEXT'],
  ['live data', m => { m.dataMode = 'REAL_YBM'; }, 'MANIFEST_PROFILE'],
  ['wrong total', m => { m.inventories[0].totalRows++; }, 'INVENTORY_COUNT'],
  ['wrong terminal', m => { m.inventories[0].terminalPageId = 'another'; }, 'PAGE_TERMINAL'],
  ['too many pages', m => { m.inventories[0].pages = Array(101).fill(m.inventories[0].pages[0]); }, 'INVENTORY_PAGES'],
  ['too many rows', m => { m.inventories[0].totalRows = 101; }, 'INVENTORY_LIMIT'],
]) test(name + ' is held independently of a correct manifest hash', () => { const f = fixture(); mutate(f.bundle.manifest); f.repin(); held(f, reason); });

for (const [name, registrations, scores, reason] of [
  ['unreleased result', [registration('a')], [score('a', null, 'PENDING')], 'SCORE_UNRELEASED'],
  ['missing score', [registration('a'), registration('b')], [score('a')], 'SCORE_MISSING'],
  ['orphan high score', [registration('a')], [score('a'), score('b', 990)], 'REGISTRATION_MISSING'],
  ['same key wrong date', [registration('a')], [score('a', 800, 'VALID', '2020-01-16')], 'EXAM_PAIR_MISMATCH'],
  ['identical duplicate registration', [registration('a'), registration('a')], [score('a')], 'EXAM_DUPLICATE_OR_CONFLICT'],
  ['conflicting scores', [registration('a')], [score('a'), score('a', 990)], 'EXAM_DUPLICATE_OR_CONFLICT'],
  ['cancelled with a score', [registration('a', 'CANCELLED')], [score('a')], 'EXAM_STATUS_CONFLICT'],
  ['changed exam unresolved', [registration('a', 'CHANGED')], [], 'EXAM_UNRESOLVED'],
  ['pending exam unresolved', [registration('a', 'PENDING')], [], 'EXAM_UNRESOLVED'],
  ['invalid registration with valid score', [registration('a', 'INVALID')], [score('a')], 'EXAM_STATUS_CONFLICT'],
  ['invented status', [registration('a', 'OTHER')], [], 'EXAM_STATUS'],
  ['out of scope exam', [registration('a', 'TAKEN', '2019-12-31')], [], 'EXAM_OUTSIDE_SCOPE'],
  ['impossible score', [registration('a')], [score('a', 801)], 'EXAM_SCORE'],
]) test(name + ' prevents selection of any highest-score candidate', () => {
  const f = fixture(); f.setRows(registrations, scores); held(f, reason);
});

test('explicit cancellation/absence/invalid evidence accounts for exclusions; mixed LC/RC and extra fields are rejected', () => {
  const f = fixture();
  f.setRows([registration('a', 'CANCELLED'), registration('b', 'ABSENT'), registration('c', 'INVALID'), registration('d')],
    [score('c', null, 'INVALID'), score('d', 795)]);
  assert.equal(f.assess().highestScore, 795); assert.equal(f.assess().snapshot.records.length, 1);
  f.bundle.pages.at(-1).records.at(-1).lcScore = 495; held(f, 'EXAM_EVIDENCE_SCHEMA');
});

test('ties use earliest Seoul exam day then opaque key; range endpoints are inclusive', () => {
  const f = fixture();
  f.setRows([registration('z', 'TAKEN', '2020-01-31'), registration('b', 'TAKEN', '2020-01-01'), registration('a', 'TAKEN', '2020-01-01')],
    [score('z', 900, 'VALID', '2020-01-31'), score('b', 900, 'VALID', '2020-01-01'), score('a', 900, 'VALID', '2020-01-01')]);
  assert.equal(f.assess().selectedExamKey, 'a');
});

test('freshness boundary and expired/cancelled/unsigned sessions fail closed', () => {
  const f = fixture(); f.context.now = String(BigInt(f.context.now) + 300n);
  assert.equal(f.assess().status, 'COMPLETE_SYNTHETIC');
  f.context.now = String(BigInt(f.context.now) + 1n); held(f, 'MANIFEST_TIME');
  for (const state of ['ISSUED', 'CANCELLED', 'EXPIRED']) {
    const g = fixture(); g.context.session.state = state; assert.throws(g.assess, /EVIDENCE_SESSION/);
  }
  const g = fixture(); g.context.now = g.context.session.expiresAt; assert.throws(g.assess, /EVIDENCE_SESSION_TIME/);
});

test('future observation and pre-authorization observation are held', () => {
  for (const delta of [-1n, 1n]) {
    const f = fixture(); f.bundle.manifest.observedAt = String(BigInt(f.context.now) + delta); f.repin(); held(f, 'MANIFEST_TIME');
  }
});

test('untrusted B1 message edits are detected against the persisted binding digest', () => {
  for (const section of ['message', 'domain']) {
    const f = fixture(); f.context.session.typedData[section][section === 'message' ? 'requestNonce' : 'salt'] = id('changed');
    assert.throws(f.assess, /EVIDENCE_BINDING/);
  }
});

test('malformed/sparse/oversized structures return fixed hold codes without reflecting data', () => {
  for (const change of [f => { f.bundle.pages[0].records = Array(1); }, f => { f.bundle.pages = Array(201).fill(null); },
    f => { f.bundle.pages[0].records[0].examKey = { secret: 'do-not-reflect' }; },
    f => { f.bundle.manifest.scope = null; }, f => { f.bundle.manifest.inventories[0].pages = []; }]) {
    const f = fixture(); change(f); const r = held(f); assert.ok(!JSON.stringify(r).includes('do-not-reflect'));
  }
  assert.throws(() => assessSyntheticExamEvidence({}, {}, {}), /COMPILED_POLICY_REQUIRED/);
});
