import test from 'node:test';
import assert from 'node:assert/strict';
import { id } from 'ethers';
import { compileSyntheticPolicy as compile } from '../../src/policy/compiler.mjs';
import { canonical } from '../../src/policy/values.mjs';
import { draft, epoch } from './fixture.mjs';

test('canonical JSON and Keccak use a pinned byte vector', () => {
  assert.equal(canonical({ z: ['é', 4, null], a: '1' }), '{"a":"1","z":["é",4,null]}');
  assert.equal(id(''), '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
  const compiled = compile(draft());
  assert.equal(compiled.policyHash, '0xfbb3e2dd76536a64a71dedaf5ac7e1770a604820158008b6c532392078b2896d');
  assert.equal(compiled.requiredLectureIdsHash, '0x14185f04b57fe4ee8a57bd8cda4cc79b3667fa4715efb2d0c6fb731ba81e4529');
});

test('key and lecture ordering normalize; other arrays retain their order', () => {
  const original = draft(), reordered = Object.fromEntries(Object.entries(original).reverse());
  reordered.requiredLectureIds = [...original.requiredLectureIds].reverse();
  assert.deepEqual(compile(original), compile(reordered));
  assert.notEqual(canonical(['a', 'b']), canonical(['b', 'a']));
});

test('identifiers normalize NFC before hashing and duplicate detection', () => {
  const a = draft(), b = draft();
  a.cohortId = 'é'; b.cohortId = 'e\u0301';
  assert.equal(compile(a).policyHash, compile(b).policyHash);
  a.requiredLectureIds = ['é', 'e\u0301'];
  assert.throws(() => compile(a), { message: 'DUPLICATE_LECTURE' });
});

test('compiled policy is detached, deeply frozen, and never publishable', () => {
  const source = draft(), compiled = compile(source), before = compiled.policyHash;
  source.requiredLectureIds.push('later'); source.policyVersion = '2';
  assert.equal(compiled.policy.requiredLectureIds.length, 5);
  assert.equal(compiled.policy.policyVersion, '1');
  assert.equal(compiled.policyHash, before);
  assert.equal(compiled.publishable, false);
  assert.throws(() => { compiled.policy.requiredLectureIds.push('later'); }, TypeError);
  assert.throws(() => { compiled.policy.claimUntil = '0'; }, TypeError);
});

test('T+3 and T+10 use exact seconds; enrollment may follow retrospective learning', () => {
  const { policy } = compile(draft());
  assert.equal(policy.supplementEndAt, epoch('2020-02-08T00:00:00Z'));
  assert.equal(policy.claimUntil, epoch('2020-02-15T00:00:00Z'));
  assert.equal(BigInt(policy.claimUntil) - BigInt(policy.supplementEndAt), 604800n);
});

for (const [field, value] of [
  ['policyVersion', '2'], ['cohortId', 'other-cohort'], ['privacyNoticeVersion', 'fixture-2'],
  ['examDateStart', '2020-01-02'], ['examDateEnd', '2020-01-30'],
  ['learningStart', epoch('2020-01-02T00:00:00Z')], ['learningEnd', epoch('2020-01-30T00:00:00Z')],
  ['enrollmentStart', epoch('2020-02-01T01:00:00Z')], ['enrollmentUntil', epoch('2020-02-02T01:00:00Z')],
  ['normalSubmitFrom', epoch('2020-02-02T01:00:00Z')], ['normalSubmitAt', epoch('2020-02-06T00:00:00Z')],
  ['requiredLectureIds', ['different-lecture']], ['amount', '1'], ['tokenDecimals', 0],
  ['sourcePolicySetHash', id('OTHER_SYNTHETIC_SOURCE')],
]) test(`policy hash commits to ${field}`, () => {
  assert.notEqual(compile({ ...draft(), [field]: value }).policyHash, compile(draft()).policyHash);
});

for (const [label, change, code] of [
  ['missing date', p => { delete p.normalSubmitAt; }, 'POLICY_SCHEMA'],
  ['null date', p => { p.examDateStart = null; }, 'POLICY_DATE'],
  ['undecided date', p => { p.normalSubmitAt = 'TBD'; }, 'POLICY_TIME'],
  ['unknown field', p => { p.approved = true; }, 'POLICY_SCHEMA'],
  ['derived deadline override', p => { p.claimUntil = '1'; }, 'POLICY_SCHEMA'],
  ['real data', p => { p.dataMode = 'REAL_YBM'; }, 'POLICY_PROFILE'],
  ['legacy schema', p => { p.schemaVersion = 3; }, 'POLICY_PROFILE'],
  ['unknown exam', p => { p.examType = 'OTHER'; }, 'POLICY_PROFILE'],
  ['threshold change', p => { p.minScore = 795; }, 'POLICY_THRESHOLDS'],
  ['percentage string', p => { p.minCompletionBps = '8000'; }, 'POLICY_THRESHOLDS'],
  ['unsupported completion rule', p => { p.completionRuleVersion = 'other'; }, 'COMPLETION_RULE_VERSION'],
  ['invalid calendar', p => { p.examDateEnd = '2020-02-30'; }, 'POLICY_DATE'],
  ['non leap year', p => { p.examDateStart = '2019-02-29'; }, 'POLICY_DATE'],
  ['reversed exam period', p => { p.examDateStart = '2020-02-01'; }, 'POLICY_PERIOD'],
  ['reversed learning period', p => { p.learningStart = p.normalSubmitAt; }, 'POLICY_PERIOD'],
  ['reversed enrollment', p => { p.enrollmentStart = p.normalSubmitAt; }, 'POLICY_PERIOD'],
  ['enrollment after T', p => { p.enrollmentUntil = '2000000000'; }, 'POLICY_PERIOD'],
  ['submission reversed', p => { p.normalSubmitFrom = '2000000000'; }, 'POLICY_PERIOD'],
  ['learning after T', p => { p.learningEnd = '2000000000'; }, 'POLICY_PERIOD'],
  ['exam after T', p => { p.examDateEnd = '2021-01-01'; }, 'POLICY_PERIOD'],
  ['number timestamp', p => { p.normalSubmitAt = 1580860800; }, 'POLICY_TIME'],
  ['leading zero timestamp', p => { p.normalSubmitAt = '01580860800'; }, 'POLICY_TIME'],
  ['time overflow', p => { p.normalSubmitAt = '253402300799'; }, 'POLICY_TIME'],
  ['zero version', p => { p.policyVersion = '0'; }, 'POLICY_VERSION'],
  ['number version', p => { p.policyVersion = 1; }, 'POLICY_VERSION'],
  ['zero amount', p => { p.amount = '0'; }, 'POLICY_AMOUNT'],
  ['amount overflow', p => { p.amount = String(1n << 256n); }, 'POLICY_AMOUNT'],
  ['numeric amount', p => { p.amount = 50000000; }, 'POLICY_AMOUNT'],
  ['fractional amount', p => { p.amount = '50.0'; }, 'POLICY_AMOUNT'],
  ['negative amount', p => { p.amount = '-1'; }, 'POLICY_AMOUNT'],
  ['token decimals', p => { p.tokenDecimals = 19; }, 'TOKEN_DECIMALS'],
  ['missing source hash', p => { p.sourcePolicySetHash = null; }, 'SOURCE_POLICY_HASH'],
  ['duplicate lecture', p => { p.requiredLectureIds.push('lecture-a'); }, 'DUPLICATE_LECTURE'],
  ['zero denominator', p => { p.requiredLectureIds = []; }, 'REQUIRED_LECTURES_EMPTY'],
  ['sparse list', p => { p.requiredLectureIds = new Array(2); }, 'REQUIRED_LECTURES'],
]) test(`compiler rejects ${label}`, () => {
  const value = draft(); change(value);
  assert.throws(() => compile(value), { message: code });
});

test('leap day and Seoul day-end boundary are exact', () => {
  const value = draft();
  value.examDateStart = value.examDateEnd = '2020-02-29';
  value.normalSubmitAt = epoch('2020-02-29T14:59:59Z');
  assert.doesNotThrow(() => compile(value));
  value.normalSubmitAt = String(BigInt(value.normalSubmitAt) - 1n);
  assert.throws(() => compile(value), { message: 'POLICY_PERIOD' });
});
