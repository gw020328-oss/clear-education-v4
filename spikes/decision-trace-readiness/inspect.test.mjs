import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { digest } from '../../src/policy/mvp/contract.mjs';
import { inspectDecisionTrace } from './inspect.mjs';
const fixture = JSON.parse(readFileSync(new URL('../../specs/m3/evaluation-http-responses.json', import.meta.url)));
const expected = { binding: fixture.responses.preview.binding,
  c1AcknowledgmentHash: fixture.responses.preview.c1AcknowledgmentHash,
  workflowRevision: 8, factsRevision: 6, selectionRevision: 2 };
const record = () => structuredClone(fixture.responses.final.result);
function rehash(r) {
  r.snapshotHash = digest('CLEAR-EVALUATION-SNAPSHOT.1', r.snapshot);
  r.resultHash = digest('CLEAR-EVALUATION-RESULT.1', r.result);
}
test('existing C3 response has connected revisions, without real-source or payment authority', () => {
  const r = record(), before = JSON.stringify(r), report = inspectDecisionTrace(r, expected);
  assert.equal(report.evidenceCount, 4); assert.equal(report.ruleCount, 4);
  assert.equal(report.paymentAllowed, false); assert.equal(report.sourceVerified, false);
  assert.equal(report.completeAuditTrail, false); assert.equal(JSON.stringify(r), before);
});
test('another application expected by caller is rejected', () => {
  const changed = structuredClone(expected); changed.binding.applicationId = '0x' + 'ab'.repeat(32);
  assert.throws(() => inspectDecisionTrace(record(), changed), /TRACE_BINDING/);
});
test('stale stored result is not presented as current', () => {
  assert.throws(() => inspectDecisionTrace(fixture.responses.stale, expected), /TRACE_NOT_CURRENT/);
});
test('old policy acknowledgement is rejected', () => {
  const changed = { ...expected, c1AcknowledgmentHash: '0x' + 'ab'.repeat(32) };
  assert.throws(() => inspectDecisionTrace(record(), changed), /TRACE_REVISION/);
});
test('evidence modification without snapshot update is rejected', () => {
  const r = record(); r.snapshot.evidence[0].revision += 1;
  assert.throws(() => inspectDecisionTrace(r, expected), /TRACE_DIGEST/);
});
test('rehashing a new evidence revision does not repair old evidence pins', () => {
  const r = record(); r.snapshot.evidence[0].revision += 1; rehash(r);
  assert.throws(() => inspectDecisionTrace(r, expected), /TRACE_EVIDENCE_PIN/);
});
test('rehashing another source account does not match registered source binding', () => {
  const r = record(), e = r.snapshot.evidence[0]; e.sourceBinding.sourceAccountRef = 'another-account';
  r.snapshot.context.evidencePins.find(p => p.evidenceId === e.evidenceId).digest = digest('CLEAR-MVP-EVIDENCE', e);
  rehash(r);
  assert.throws(() => inspectDecisionTrace(r, expected), /TRACE_SOURCE_BINDING/);
});
test('duplicate evidence cannot replace a missing evidence item', () => {
  const r = record(); r.snapshot.evidence[1] = structuredClone(r.snapshot.evidence[0]); rehash(r);
  assert.throws(() => inspectDecisionTrace(r, expected), /TRACE_DUPLICATE_EVIDENCE/);
});
test('old rule evidence revision cannot be joined to a new result', () => {
  const r = record(); r.result.rules[0].evidenceRevision += 1; rehash(r);
  assert.throws(() => inspectDecisionTrace(r, expected), /TRACE_RULE_REFERENCE/);
});
test('historical workflow head is rejected even when hashes match', () => {
  assert.throws(() => inspectDecisionTrace(record(), { ...expected, workflowRevision: 9 }), /TRACE_REVISION/);
});
test('synthetic trace cannot silently enable payment', () => {
  const r = record(); r.paymentAllowed = true;
  assert.throws(() => inspectDecisionTrace(r, expected), /TRACE_GATES/);
});
