import test from 'node:test';
import assert from 'node:assert/strict';
import { validateContract, DOCUMENT_LIMITS } from '../../src/policy/mvp/contract.mjs';
import { precheckCode, precheckObservation, markPrecheckCurrent } from '../../src/document-precheck/precheck.mjs';
import { fixture, pinned, rebind, image } from './fixture.mjs';

const run = value => precheckCode(value.compiled, value.context, value.submission, pinned(value));
const observe = (value, output, method = 'VISION') => precheckObservation(value.compiled, value.context, value.submission,
  { method, fieldIds: ['image-type'], adapter: { execution: 'MOCK', observe: () => structuredClone(output) } });
const visual = () => ({ reviewStatus: 'CHECKED', observations: [{ fieldId: 'image-type', value: 'SYNTHETIC_STUDY_MATERIAL', locator: 'post/post-a/image/image-0', quote: null }] });
const assertUnverified = record => {
  validateContract('DocumentPrecheck', record);
  assert.ok(Object.values(record.sourceVerification).every(status => status === 'UNVERIFIED'));
  assert.equal(record.automaticEligibility, false); assert.equal(record.paymentAllowed, false);
};

for (const name of ['ybm', 'siwon', 'third']) test(`${name} requirement is consumed by the same code path`, () => {
  const value = fixture(name), report = run(value);
  assert.equal(report.outcome, 'PRECHECK_REQUIREMENTS_MET');
  assertUnverified(report.records[0]);
  assert.equal(report.records[0].observations[0].value, '4');
  assert.equal(report.records[0].binding.policyHash, value.compiled.policyHash);
});

test('character and byte profiles are explicit; missing profile remains POLICY_OPEN', () => {
  const value = fixture();
  value.plan.checks[0].options.unit = 'UTF16';
  assert.equal(run(value).records[0].observations[0].value, '5');
  value.plan.checks[0].kind = 'BYTE_COUNT';
  value.plan.checks[0].options = { minimum: 13, encoding: 'UTF8', space: 'INCLUDE', normalization: 'NONE' };
  assert.equal(run(value).records[0].observations[0].value, '13');
  value.plan.checks[0].options.encoding = null;
  assert.equal(run(value).records[0].reviewStatus, 'POLICY_OPEN');
  assert.equal(run(value).outcome, 'UNDETERMINED');
  value.plan.checks[0].options.encoding = 'UTF8'; value.plan.checks[0].options.minimum = null;
  assert.equal(run(value).records[0].reviewStatus, 'POLICY_OPEN');
});

test('seven versus eight images is a submitted-file count, never image truth', async () => {
  const value = fixture('siwon', 'BLOG');
  value.plan.checks[0].kind = 'IMAGE_COUNT'; value.plan.checks[0].options = { minimum: 8, duplicatePolicy: 'COUNT_SUBMITTED_FILES' };
  value.submission.posts[0].images = Array.from({ length: 7 }, (_, i) => image(i)); rebind(value);
  assert.equal(run(value).outcome, 'NEEDS_SUPPLEMENT');
  value.submission.posts[0].images.push(image(7)); rebind(value);
  assert.equal(run(value).outcome, 'PRECHECK_REQUIREMENTS_MET');
  const unrecognizable = await observe(value, { reviewStatus: 'UNREADABLE', observations: [{ fieldId: 'image-type', value: null, locator: null, quote: null }] });
  assert.equal(unrecognizable.outcome, 'UNDETERMINED'); assertUnverified(unrecognizable.record);
  value.plan.checks[0].options.duplicatePolicy = 'OPEN';
  assert.equal(run(value).records[0].reviewStatus, 'POLICY_OPEN');
});

test('links use exact submitted strings without fetching a URL', () => {
  const value = fixture();
  value.plan.checks[0].kind = 'LINK'; value.plan.checks[0].options = { url: 'https://example.invalid/synthetic' };
  value.submission.posts[0].links = ['https://example.invalid/synthetic.evil']; rebind(value);
  assert.equal(run(value).outcome, 'NEEDS_SUPPLEMENT');
  value.submission.posts[0].links = ['https://example.invalid/synthetic']; rebind(value);
  assert.equal(run(value).outcome, 'PRECHECK_REQUIREMENTS_MET');
});

test('ambiguous disclosure position stays open while a known missing link is still reported', () => {
  const value = fixture();
  value.plan.checks = [
    { ...value.plan.checks[0], checkId: 'disclosure', kind: 'TEXT', options: { value: 'SYNTHETIC', position: null } },
    { ...value.plan.checks[0], checkId: 'link', kind: 'LINK', options: { url: 'https://example.invalid/synthetic' } },
  ];
  const result = run(value);
  assert.equal(result.outcome, 'UNDETERMINED');
  assert.deepEqual(result.details[0].checks.map(item => item.status), ['POLICY_OPEN', 'MISSING']);
});

test('bundle keyword diversity is separate from individual post presence and ignores sentiment', () => {
  const value = fixture(); value.plan.checks[0] = { ...value.plan.checks[0], kind: 'KEYWORDS', scope: 'BUNDLE', options: { values: ['alpha', 'beta'], minimumDistinct: 2, field: 'TITLE' } };
  value.submission.posts = Array.from({ length: 14 }, (_, i) => ({ ...structuredClone(value.submission.posts[0]), postId: 'post-' + i })); rebind(value);
  assert.equal(run(value).outcome, 'NEEDS_SUPPLEMENT');
  value.submission.posts[13].title = 'beta: I disliked this course'; rebind(value);
  assert.equal(run(value).outcome, 'PRECHECK_REQUIREMENTS_MET');
  value.submission.posts[13].title = 'beta: I liked this course'; rebind(value);
  assert.equal(run(value).outcome, 'PRECHECK_REQUIREMENTS_MET');
});

test('missing document is code-only MISSING, and no model adapter is required', () => {
  const value = fixture(); value.submission.posts = []; rebind(value);
  const result = run(value);
  assert.equal(result.outcome, 'NEEDS_SUPPLEMENT'); assert.equal(result.records[0].reviewStatus, 'MISSING');
  assertUnverified(result.records[0]);
  value.plan.checks[0].options.minimum = null;
  const unresolved = run(value);
  assert.equal(unresolved.outcome, 'UNDETERMINED');
  assert.deepEqual(unresolved.records.map(record => record.reviewStatus), ['MISSING', 'POLICY_OPEN']);
});

test('missing image skips the observer entirely instead of generating an observation', async () => {
  const value = fixture(); let calls = 0;
  const result = await precheckObservation(value.compiled, value.context, value.submission, { method: 'VISION', fieldIds: ['image-type'],
    adapter: { execution: 'MOCK', observe() { calls++; throw new Error('MUST_NOT_CALL'); } } });
  assert.equal(calls, 0); assert.equal(result.runStatus, 'SKIPPED_MISSING_INPUT');
  assert.equal(result.record.reviewStatus, 'MISSING'); assertUnverified(result.record);
});

test('plan/source/input/compiled-policy mismatches are rejected', () => {
  const value = fixture();
  assert.throws(() => precheckCode(value.compiled, value.context, value.submission, { ...pinned(value), pinnedPlanHash: '0x' + '00'.repeat(32) }), /DOCUMENT_PLAN_PIN/);
  value.plan.checks[0].sourceRefs = [{ sourceId: 'missing', locator: 'missing' }];
  assert.throws(() => run(value), /DOCUMENT_SOURCE/);
  const fresh = fixture(); fresh.context.binding.policyHash = '0x' + '00'.repeat(32);
  assert.throws(() => run(fresh), /DOCUMENT_BINDING/);
  const stale = fixture(); stale.submission.revision++;
  assert.throws(() => run(stale), /DOCUMENT_CONTEXT/);
  const forged = fixture(); forged.compiled = structuredClone(forged.compiled);
  assert.throws(() => run(forged), /MVP_COMPILED_REQUIRED/);
});

test('preparation metadata limits are enforced without claiming actual decode', () => {
  for (const corrupt of [
    value => { value.submission.posts = Array.from({ length: 15 }, (_, i) => ({ ...value.submission.posts[0], postId: 'post-' + i })); },
    value => { value.submission.posts[0].images = Array.from({ length: 9 }, (_, i) => image(i)); },
    value => { value.submission.posts[0].images = [{ ...image(), byteLength: DOCUMENT_LIMITS.maxBytesPerFile + 1 }]; },
    value => { value.submission.posts[0].images = [{ ...image(), width: 10000, height: 10000 }]; },
  ]) {
    const value = fixture(); corrupt(value); rebind(value);
    assert.throws(() => run(value), /DOCUMENT_LIMIT/);
  }
});

test('mock Vision observation preserves method, run and each unverified source assertion', async () => {
  const value = fixture(); value.submission.posts[0].images = [image()]; rebind(value);
  const result = await observe(value, visual());
  assert.equal(result.outcome, 'PRECHECK_REQUIREMENTS_MET'); assertUnverified(result.record);
  assert.equal(result.record.method, 'VISION'); assert.equal(result.record.execution, 'MOCK');
  assert.equal(result.record.runId, value.context.runId); assert.equal(result.actualModelCall, false);
});

test('out-of-input locators, invented fields, null passing values and injected authority are rejected', async () => {
  for (const corrupt of [
    output => { output.observations[0].locator = 'post/missing/image/missing'; },
    output => { output.observations[0].fieldId = 'invented'; },
    output => { output.observations[0].value = null; output.observations[0].locator = null; },
    output => { output.paymentAllowed = true; },
    output => { output.observations = [null]; },
  ]) {
    const value = fixture(), output = visual(); value.submission.posts[0].images = [image()]; rebind(value); corrupt(output);
    const result = await observe(value, output);
    assert.equal(result.reason, 'MODEL_OUTPUT_REJECTED'); assert.equal(result.outcome, 'UNDETERMINED'); assertUnverified(result.record);
  }
});

test('text observation span must reproduce its quote; visible quotes do not prove authorship', async () => {
  const value = fixture(); value.submission.posts[0].text = 'SYNTHETIC study notes'; rebind(value);
  const output = { reviewStatus: 'CHECKED', observations: [{ fieldId: 'image-type', value: 'RELATED', locator: 'post/post-a/text/0/9', quote: 'SYNTHETIC' }] };
  const good = await observe(value, output, 'TEXT_AI'); assert.equal(good.record.reviewStatus, 'CHECKED'); assertUnverified(good.record);
  output.observations[0].locator = 'post/post-a/text/0/999';
  assert.equal((await observe(value, output, 'TEXT_AI')).reason, 'MODEL_OUTPUT_REJECTED');
});

test('failed/timeout model output holds and a late result is stale for any binding/revision/run change', async () => {
  const value = fixture(); value.submission.posts[0].images = [image()]; rebind(value);
  const result = await observe(value, visual());
  for (const key of ['submissionRevision', 'routeRevision', 'runId', 'inputHash', 'ruleVersion']) {
    const latest = structuredClone(value.context); latest[key] = typeof latest[key] === 'number' ? latest[key] + 1 : latest[key] + '-new';
    const stale = markPrecheckCurrent(result.record, latest);
    assert.equal(stale.current, false);
    assert.equal(markPrecheckCurrent(stale, value.context).current, false);
  }
  const latest = structuredClone(value.context); latest.binding.subjectRef = '0x' + '00'.repeat(32);
  assert.equal(markPrecheckCurrent(result.record, latest).current, false);
  assert.equal(result.record.current, true);
  const failure = await precheckObservation(value.compiled, value.context, value.submission, { method: 'VISION', fieldIds: ['image-type'], adapter: { execution: 'MOCK', observe: () => new Promise(() => {}) }, timeoutMs: 5 });
  assert.equal(failure.reason, 'TIMED_OUT'); assert.equal(failure.outcome, 'UNDETERMINED'); assertUnverified(failure.record);
});
