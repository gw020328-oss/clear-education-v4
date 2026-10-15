import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyntheticExportLab } from '../../spikes/moodle-export-lab/source.mjs';
import { collectSyntheticMoodleFacts } from '../../src/learning-evidence/moodle-mvp/read-only.mjs';
import { assessMvpDailyLearning } from '../../src/learning-evidence/moodle-mvp/daily.mjs';
import { dailyFixture, repin } from './fixture.mjs';

const encode = value => JSON.stringify(JSON.stringify(value));
const decode = value => JSON.parse(JSON.parse(value));
function labFixture(multiPage = false) {
  const f = dailyFixture('siwon');
  if (multiPage) {
    for (let i = 0; i < 5; i++) f.facts.records.push({ ...f.facts.records[0], sourceRecordRef: 'extra-' + i });
    repin(f);
  }
  const lab = createSyntheticExportLab(f.facts, f.trusted.sourceBinding), client = lab.connect(), calls = [];
  for (const method of ['readManifest', 'readPage', 'close']) {
    const fn = client[method].bind(client);
    client[method] = (...args) => { calls.push(method); return fn(...args); };
  }
  f.collect = options => collectSyntheticMoodleFacts(f.trusted, client, { now: () => f.now, ...options });
  return { f, lab, client, calls };
}

test('immutable multi-page synthetic export → bounded read-only driver → L1', async () => {
  const { f, lab, calls } = labFixture(true), result = await f.collect();
  assert.equal(result.status, 'COLLECTED_SYNTHETIC'); assert.equal(result.facts.records.length, 105);
  assert.deepEqual(calls, ['readManifest', 'readPage', 'readPage', 'readManifest', 'close']);
  const daily = assessMvpDailyLearning(f.compiled, 'daily-learning', f.trusted, result.facts, f.now);
  assert.equal(daily.learningStatus, 'PASS'); assert.equal(daily.observation.days, 100);
  for (const key of ['collectionEnabled', 'sourceAuthenticityVerified', 'productConnected', 'humanAttentionProven', 'paymentAllowed']) assert.equal(result[key], false);
  const copy = lab.resolveSyntheticHead(); copy.records[0].effectiveMs = '1';
  assert.notEqual(lab.resolveSyntheticHead().records[0].effectiveMs, '1');
});

test('source writes commit one revision/audit entry; read clients cannot mutate', async () => {
  const { f, lab, client } = labFixture(), before = lab.audit();
  assert.deepEqual(Object.keys(client).sort(), ['profile', 'transport', 'readManifest', 'readPage', 'close'].sort());
  const rows = structuredClone(f.facts.records); rows[0].sourceRecordStatus = 'UNAVAILABLE';
  assert.equal(lab.correct('r1', rows, 'SOURCE_UNAVAILABLE'), 'r2');
  assert.equal(before.length, 1); assert.equal(lab.audit().length, 2);
  assert.equal(lab.audit()[1].previousRevision, 'r1');
  assert.throws(() => lab.correct('r1', rows, 'RECORD_CORRECTION'), /EXPORT_REVISION_CONFLICT/);
  assert.throws(() => lab.correct('r2', rows, 'raw-personal-note'), /EXPORT_CORRECTION_REASON/);
  assert.equal(lab.audit().length, 2);
  const result = await f.collect(); assert.equal(result.reason, 'LEARNING_SOURCE_REVISION_CHANGED');
});

test('revision changes between pages never produce a partial collected result', async () => {
  const { f, lab, client, calls } = labFixture(true), read = client.readPage.bind(client);
  let first = true;
  client.readPage = async (...args) => {
    const value = await read(...args);
    if (first) { first = false; lab.correct('r1', f.facts.records, 'RECORD_CORRECTION'); }
    return value;
  };
  const r = await f.collect(); assert.equal(r.status, 'ON_HOLD'); assert.equal(r.facts, null);
  assert.equal(r.reason, 'LEARNING_SOURCE_REVISION_CHANGED'); assert.equal(calls.at(-1), 'close');
});

test('approved new revision preserves UNAVAILABLE instead of fabricating NO_RECORD or zero', async () => {
  const { f, lab } = labFixture(), rows = structuredClone(f.facts.records);
  rows[0].sourceRecordStatus = 'UNAVAILABLE'; lab.correct('r1', rows, 'SOURCE_UNAVAILABLE');
  // Explicit test resolver approval, not pin replacement from a read response.
  const artifact = lab.resolveSyntheticHead();
  const trusted = { ...f.trusted, factsHash: artifact.snapshot.normalizedDigest, sourceRevision: 'r2', approvedCorrectionRevision: 'r2' };
  const r = await collectSyntheticMoodleFacts(trusted, lab.connect(), { now: () => f.now });
  assert.equal(r.status, 'COLLECTED_SYNTHETIC'); assert.equal(r.facts.records[0].sourceRecordStatus, 'UNAVAILABLE');
  assert.equal(assessMvpDailyLearning(f.compiled, 'daily-learning', trusted, r.facts, f.now).learningStatus, 'ON_HOLD');
});

for (const [label, edit] of [
  ['page bytes', p => { p.records[0].effectiveMs = '1'; }],
  ['page id', p => { p.pageId = 'unlisted-page'; }],
  ['page revision', p => { p.revision = 'r2'; }],
  ['extra field', p => { p.untrustedField = 'SYNTHETIC_UNTRUSTED'; }],
]) {
  test('untrusted reply cannot replace independent pins: ' + label, async () => {
    const { f, client } = labFixture(), read = client.readPage.bind(client);
    client.readPage = async (...args) => { const p = decode(await read(...args)); edit(p); return encode(p); };
    const r = await f.collect(); assert.equal(r.status, 'ON_HOLD'); assert.equal(r.facts, null);
  });
}

test('wrong account/course binding is rejected before page reads', async () => {
  const { f, calls } = labFixture(); f.trusted.sourceBinding.courseId = 'other-course';
  const r = await f.collect(); assert.equal(r.reason, 'LEARNING_EXPORT_SCOPE'); assert.ok(!calls.includes('readPage'));
});
test('same revision with changed final manifest is rejected', async () => {
  const { f, client } = labFixture(), read = client.readManifest.bind(client); let count = 0;
  client.readManifest = async (...args) => {
    const p = decode(await read(...args)); if (++count === 2) p.header.snapshot.observedAt = String(f.now + 1); return encode(p);
  };
  assert.equal((await f.collect()).reason, 'LEARNING_EXPORT_CHANGED');
});
test('malformed/oversized/one-layer response is not exposed in an error', async () => {
  for (const response of ['invalid-SYNTHETIC_CONTENT', JSON.stringify({ marker: 'SYNTHETIC_CONTENT' }), 'x'.repeat(262145)]) {
    const { f, client } = labFixture(); client.readManifest = async () => response;
    const r = await f.collect(); assert.equal(r.status, 'ON_HOLD'); assert.equal(r.facts, null);
    assert.ok(!JSON.stringify(r).includes('SYNTHETIC_CONTENT'));
  }
});
test('source exceptions are fixed reasons, never provider text', async () => {
  const { f, client } = labFixture(); client.readPage = async () => { throw Error('SYNTHETIC_PRIVATE_ERROR'); };
  const r = await f.collect(); assert.equal(r.reason, 'LEARNING_SOURCE_UNAVAILABLE');
  assert.ok(!JSON.stringify(r).includes('SYNTHETIC_PRIVATE_ERROR'));
});
test('pre-abort and timeout close once without returning partial facts', async () => {
  const a = labFixture(), controller = new AbortController(); controller.abort();
  assert.equal((await a.f.collect({ signal: controller.signal })).reason, 'LEARNING_CANCELLED');
  assert.deepEqual(a.calls, ['close']);
  const b = labFixture(); b.client.readPage = () => new Promise(() => {});
  assert.equal((await b.f.collect({ timeoutMs: 5 })).reason, 'LEARNING_TIMEOUT');
  assert.equal(b.calls.filter(x => x === 'close').length, 1);
});
test('close failure/timeout or expiry during cleanup prevents collected success', async () => {
  const a = labFixture(); a.client.close = async () => { throw Error('SYNTHETIC_CLEANUP_ERROR'); };
  assert.equal((await a.f.collect()).reason, 'LEARNING_CLEANUP_FAILED');
  const b = labFixture(); b.client.close = () => new Promise(() => {});
  assert.equal((await b.f.collect({ timeoutMs: 5 })).reason, 'LEARNING_CLEANUP_FAILED');
  const c = labFixture(), close = c.client.close.bind(c.client);
  c.client.close = async () => { await close(); c.f.now += 301; };
  assert.equal((await c.f.collect()).reason, 'LEARNING_STALE');
});
test('configured client receives independent query copies and has no write operation', async () => {
  const { f, client } = labFixture(), read = client.readManifest.bind(client), before = structuredClone(f.trusted);
  client.readManifest = async (q, signal) => { const reply = await read(q, signal); q.sourceBinding.courseId = 'changed'; return reply; };
  assert.equal((await f.collect()).status, 'COLLECTED_SYNTHETIC'); assert.deepEqual(f.trusted, before);
  assert.equal(client.exchange, undefined); assert.equal(client.begin, undefined);
});
test('an HTTP/live transport cannot run through the synthetic driver', async () => {
  const { f, client, calls } = labFixture(); client.transport = 'HTTPS';
  assert.equal((await f.collect()).reason, 'LEARNING_TRANSPORT_BLOCKED'); assert.deepEqual(calls, []);
});
