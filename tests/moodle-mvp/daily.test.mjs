import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyFixture, repin } from './fixture.mjs';
import { exampleDraft } from '../../specs/m1/examples.mjs';
import { compileMvpPolicy } from '../../src/policy/mvp/compiler.mjs';
import { validateContract } from '../../src/policy/mvp/contract.mjs';
import { factsDigest } from '../../src/learning-evidence/moodle-mvp/daily.mjs';

for (const [profile, days] of [['ybm', 90], ['siwon', 100], ['third', 14]]) {
  test('same daily engine consumes compiled synthetic profile: ' + profile, () => {
    const f = dailyFixture(profile), r = f.run();
    assert.equal(r.learningStatus, 'PASS'); assert.equal(r.observation.days, days);
    assert.equal(r.observation.status, 'OBSERVED'); validateContract('RuleObservation', r.observation);
    for (const key of ['productConnected', 'humanAttentionProven', 'paymentAllowed']) assert.equal(r[key], false);
  });
}

test('the same source records meet one configured threshold and fail another', () => {
  const a = dailyFixture('third'), d = exampleDraft('third');
  d.rules.find(r => r.ruleId === 'daily-learning').threshold = 9500; d.learningRules[0].thresholdBps = 9500;
  const b = dailyFixture('third', compileMvpPolicy(d, { sources: structuredClone(d.sources), capabilities: structuredClone(d.capabilities) }));
  assert.deepEqual(a.facts.records, b.facts.records);
  assert.equal(a.run().learningStatus, 'PASS'); assert.equal(b.run().learningStatus, 'NOT_MET');
  assert.equal(b.run().observation.days, 0); assert.notEqual(a.compiled.policyHash, b.compiled.policyHash);
});

for (const [ms, expected] of [['23999', 'NOT_MET'], ['24000', 'PASS'], ['24001', 'PASS']]) {
  test('millisecond integer boundary on configured 80%: ' + ms, () => {
    const f = dailyFixture(); f.facts.records[0].effectiveMs = ms; repin(f);
    assert.equal(f.run().learningStatus, expected);
  });
}

for (const [key, value] of [['effectiveMs', '14981'], ['effectiveMs', '5085'], ['normalCloseAcknowledged', false], ['deliveryMode', 'DOWNLOAD']]) {
  test('full media/position cannot compensate for missing valid daily condition: ' + key + '/' + value, () => {
    const f = dailyFixture(); f.facts.records[0][key] = value; repin(f);
    assert.equal(f.run().learningStatus, 'NOT_MET'); assert.equal(f.run().observation.days, 13);
  });
}

test('explicit absence is a known failed day, unavailable and unknown remain held', () => {
  for (const [state, result] of [['NO_RECORD', 'NOT_MET'], ['UNAVAILABLE', 'ON_HOLD'], ['UNKNOWN', 'ON_HOLD']]) {
    const f = dailyFixture(); f.facts.records[0].sourceRecordStatus = state; repin(f);
    assert.equal(f.run().learningStatus, result);
    if (result === 'ON_HOLD') assert.equal(f.run().observation.value, null);
  }
});

for (const field of ['providerProgressBps', 'speedCompliance', 'progressRuleVersion']) {
  test('configuration does not invent missing progress/speed meaning: ' + field, () => {
    const f = dailyFixture('siwon'); f.facts.records[0][field] = field === 'speedCompliance' ? 'UNKNOWN' : null; repin(f);
    assert.equal(f.run().learningStatus, 'ON_HOLD');
  });
}
test('known noncompliant speed is not a qualified day; OT remains inventory-driven', () => {
  const f = dailyFixture('siwon'); f.facts.records[0].speedCompliance = 'NON_COMPLIANT'; repin(f);
  assert.equal(f.run().observation.days, 99); assert.equal(f.run().learningStatus, 'NOT_MET');
  f.facts.records[0].speedCompliance = 'COMPLIANT'; f.facts.records[0].activityType = 'OT'; repin(f);
  assert.equal(f.run().learningStatus, 'ON_HOLD');
  f.trusted.activityMappings[0].activityType = 'OT';
  assert.equal(f.run().learningStatus, 'PASS');
});

test('current unfinished day and future days are in progress, not absences', () => {
  const f = dailyFixture();
  f.now = f.compiled.policy.requirements.find(r => r.requirementId === 'learning').period.from + 3600;
  f.facts.snapshot.observedAt = String(f.now); f.facts.snapshot.validUntil = String(f.now + 300);
  f.facts.snapshot.coverageEndExclusive = String(f.now);
  for (const row of f.facts.records) row.sourceRecordStatus = 'NO_RECORD';
  repin(f); assert.equal(f.run().learningStatus, 'IN_PROGRESS'); assert.equal(f.run().observation.status, 'IN_PROGRESS');
  f.now += 86400; f.facts.snapshot.observedAt = String(f.now); f.facts.snapshot.validUntil = String(f.now + 300);
  f.facts.snapshot.coverageEndExclusive = String(f.now); repin(f);
  assert.equal(f.run().learningStatus, 'NOT_MET'); assert.equal(f.run().missingDates.length, 1);
});

test('identical retry and multiple lectures per day do not add days; conflicting same record holds', () => {
  const f = dailyFixture(); f.facts.records.push(structuredClone(f.facts.records[0])); repin(f);
  assert.equal(f.run().observation.days, 14);
  f.facts.records.at(-1).effectiveMs = '1'; repin(f);
  assert.equal(f.run().learningStatus, 'ON_HOLD'); assert.equal(f.run().reason, 'LEARNING_RECORD_CONFLICT');
});
test('the same lecture cannot supply a second day, irrespective of repeated source record refs', () => {
  const f = dailyFixture(); f.facts.records[1].lectureId = f.facts.records[0].lectureId;
  f.trusted.activityMappings[1].lectureId = f.facts.records[0].lectureId; repin(f);
  assert.equal(f.run().observation.days, 13);
});
test('a finish at endExclusive is outside the study period; date mismatch is held', () => {
  const f = dailyFixture(); const end = f.compiled.policy.requirements.find(r => r.requirementId === 'learning').period.until;
  f.facts.records.at(-1).closedAtMs = String(end * 1000);
  f.facts.records.at(-1).sourceCreditDay = new Date(end * 1000 + 9 * 3600000).toISOString().slice(0, 10); repin(f);
  assert.equal(f.run().observation.days, 13);
  f.facts.records[0].sourceCreditDay = '2030-03-02'; repin(f);
  assert.equal(f.run().reason, 'LEARNING_DATE_CONFLICT');
});

test('KST midnight moves credit to the new day while the preceding millisecond does not', () => {
  const f = dailyFixture(), row = f.facts.records[0], next = f.facts.records[1];
  const midnight = Date.parse('2030-03-02T00:00:00+09:00');
  row.closedAtMs = String(midnight - 1); row.sourceCreditDay = '2030-03-01'; repin(f);
  assert.equal(f.run().observation.days, 14);
  row.closedAtMs = String(midnight); row.sourceCreditDay = next.sourceCreditDay; repin(f);
  assert.equal(f.run().observation.days, 13); assert.deepEqual(f.run().missingDates, ['2030-03-01']);
});
test('a separately approved corrected revision replaces history rather than adding credit', () => {
  const f = dailyFixture(), row = f.facts.records[0];
  f.facts.snapshot.sourceRevision = 'r2'; f.facts.snapshot.correctionState = 'CORRECTED';
  for (const r of f.facts.records) r.recordRevision = 'r2';
  row.supersedesRecordRef = row.sourceRecordRef; row.sourceRecordRef = 'record-corrected';
  f.trusted.sourceRevision = 'r2'; repin(f);
  assert.equal(f.run().learningStatus, 'ON_HOLD');
  f.trusted.approvedCorrectionRevision = 'r2';
  f.trusted.approvedSupersessions = [{ sourceRecordRef: row.sourceRecordRef, supersedesRecordRef: row.supersedesRecordRef }];
  assert.equal(f.run().learningStatus, 'PASS'); assert.equal(f.run().observation.days, 14);
});
test('page consistency is checked even when a synthetic resolver pinned the malformed export', () => {
  const f = dailyFixture(); f.facts.snapshot.pageManifest.pages[0].offset = 1;
  f.facts.snapshot.normalizedDigest = factsDigest(f.facts); f.trusted.factsHash = f.facts.snapshot.normalizedDigest;
  assert.equal(f.run().reason, 'LEARNING_PAGE_CHAIN');
});
test('result is immutable and input is unchanged; an unpinned facts rewrite is rejected', () => {
  const f = dailyFixture(), before = structuredClone(f.facts), r = f.run();
  assert.deepEqual(f.facts, before); assert.ok(Object.isFrozen(r)); assert.ok(Object.isFrozen(r.observation));
  f.facts.records[0].effectiveMs = '1'; assert.equal(f.run().reason, 'LEARNING_FACTS_PIN');
});

for (const [label, mutate] of [
  ['unknown source trust', f => { f.trusted.verification.authenticity = 'UNKNOWN'; }],
  ['raw account', f => { f.facts.binding.accountBindingId = 'other'; }],
  ['inventory', f => { f.facts.inventory.mappingVersion = 'other'; }],
  ['revision', f => { f.facts.snapshot.sourceRevision = 'r2'; }],
  ['correction', f => { f.facts.snapshot.correctionState = 'CORRECTED'; }],
  ['incomplete', f => { f.facts.snapshot.sourceCompleteness = 'PARTIAL'; }],
  ['stale', f => { f.now += 86401; }],
  ['page pin', f => { f.facts.snapshot.pageManifest.pages[0].pageDigest = '0x' + '00'.repeat(32); }],
  ['missing activity', f => { f.facts.records.pop(); }],
  ['live', f => { f.facts.dataMode = 'LOCAL_LMS_RECORD'; }],
  ['unsafe seconds', f => { f.facts.snapshot.observedAt = '99999999999999999999'; }],
]) {
  test('fail closed on ' + label, () => {
    const f = dailyFixture(); mutate(f);
    // Re-pin facts to distinguish semantic validation from a byte mismatch.
    if (!['page pin', 'stale'].includes(label)) repin(f);
    const r = f.run(); assert.equal(r.learningStatus, 'ON_HOLD');
    assert.equal(r.observation.status, 'UNKNOWN'); assert.equal(r.observation.days, null);
  });
}

// A still-fresh snapshot cannot learn what happened after it was observed.
test('crossing midnight without a new snapshot cannot finalize success or absence', () => {
  for (const missing of [false, true]) {
    const f = dailyFixture(), end = f.compiled.policy.requirements.find(r => r.kind === 'LEARNING').period.until;
    f.facts.snapshot.observedAt = String(end - 1);
    f.facts.snapshot.validUntil = String(end + 300);
    f.facts.snapshot.coverageEndExclusive = String(end - 1);
    if (missing) f.facts.records.at(-1).sourceRecordStatus = 'NO_RECORD';
    repin(f);
    assert.equal(f.run().learningStatus, 'IN_PROGRESS');
    assert.equal(f.run().observation.value, null);
    f.facts.snapshot.observedAt = String(end);
    f.facts.snapshot.coverageEndExclusive = String(end);
    repin(f);
    assert.equal(f.run().learningStatus, missing ? 'NOT_MET' : 'PASS');
  }
});
