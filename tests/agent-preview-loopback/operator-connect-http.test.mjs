// Run with --import ./tests/agent-preview-loopback/loopback-only.mjs (loopback HTTPS only).
// Set CLEAR_D_PREVIEW_ROOT to an exported exact D snapshot to use the real D
// service over HMAC; otherwise the in-process D double is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import {operatorConnectFixture, COURSE} from './operator-connect-fixture.mjs';
import {OPERATOR_PREVIEW_VERSION as version} from '../../src/agent-preview/operator-relay.mjs';

const prepare = (f, context, sourceText) => f.raw('/bootcamp/preview/prepare', {context, body: {version, sourceText}});
const generate = (f, context, p) => f.raw('/bootcamp/preview/generate', {context,
  body: {version, contextRef: p.contextRef, revision: p.revision, bodyHash: p.bodyHash}});
const TEXT = '강의를 완료하세요; 과제를 제출하세요';

test('existing operator session + course binding: prepare, owner-approved generate, display-only execute', async t => {
  const f = await operatorConnectFixture(t), op = await f.login(f.operator);
  const first = await prepare(f, op, TEXT);
  assert.equal(first.status, 200);
  assert.equal(first.body.stage, 'PREPARED'); assert.equal(first.body.approvalState, 'REQUIRED');
  assert.equal(first.body.paymentAllowed, false);
  // No direct approval yet: generate is refused before any D generate call.
  const refused = await generate(f, op, first.body);
  assert.equal(refused.status, 409); assert.deepEqual(refused.body.failure, {kind: 'RELAY', code: 'APPROVAL_REQUIRED'});
  assert.deepEqual(f.state.calls, ['prepare']); assert.deepEqual(f.state.modelCalls, []);

  const approval = f.approve(TEXT);
  const second = await prepare(f, op, TEXT);
  assert.equal(second.status, 200); assert.equal(second.body.approvalState, 'RECORDED');
  assert.equal(second.body.bodyHash, approval.bodyHash);
  const proposed = await generate(f, op, second.body);
  assert.equal(proposed.status, 200, JSON.stringify(proposed.body));
  assert.equal(proposed.body.stage, 'PROPOSED');
  const g = proposed.body.generated;
  assert.equal(g.version, 'clear-external-preview-draft.1'); assert.equal(g.actualModelCall, false);
  assert.equal(g.modelProvenance, 'OFFLINE_TEST_TRANSPORT'); assert.equal(g.draft.sourceText, TEXT);
  assert.deepEqual(g.proposal.clauses.map(c => [c.quote, c.start, c.end, c.status, c.tool]),
    [['강의를 완료하세요', 0, 9, 'SUPPORTED', 'moodle.activity.public'], ['과제를 제출하세요', 11, 20, 'SUPPORTED', 'moodle.assignment.public']]);
  assert.deepEqual(f.state.modelCalls, ['countTokens', 'generateContent']);
  assert.ok(proposed.body.expiresAt <= g.expiresAt);

  // Execution stays DISPLAY_ONLY: no D execute, no multi-tool run.
  const exec = await f.raw('/bootcamp/preview/execute', {context: op, body: {version, contextRef: second.body.contextRef,
    revision: second.body.revision, draftId: g.draftId, proposalHash: g.draft.proposalHash}});
  assert.equal(exec.status, 409); assert.deepEqual(exec.body.failure, {kind: 'RELAY', code: 'PREVIEW_DISPLAY_ONLY'});
  assert.equal(f.state.calls.includes('execute'), false);
  t.diagnostic(`D side: ${f.mode}`);
});

test('only the bound operator course scope can reach D', async t => {
  const f = await operatorConnectFixture(t);
  const alice = await f.login(f.alice), unbound = await f.login(f.unbound), other = await f.login(f.otherCourse);
  // Participant role: handler refuses before reading the body.
  const p = await prepare(f, alice, TEXT);
  assert.equal(p.status, 403); assert.equal(p.body.failure.code, 'PREVIEW_FORBIDDEN');
  // Operator role without any course binding, and operator of a course without preview binding:
  // role alone never creates an actor; the supplier fails closed and D is not called.
  for (const context of [unbound, other]) {
    const r = await prepare(f, context, TEXT);
    assert.equal(r.status, 400); assert.deepEqual(r.body.failure, {kind: 'RELAY', code: 'PREVIEW_REJECTED'});
  }
  assert.deepEqual(f.state.calls, []);
  // Wrong CSRF, foreign Origin, missing cookie.
  const op = await f.login(f.operator);
  assert.equal((await f.raw('/bootcamp/preview/prepare', {context: {...op, csrf: 'f'.repeat(64)}, body: {version, sourceText: TEXT}})).status, 403);
  assert.equal((await f.raw('/bootcamp/preview/prepare', {context: op, headers: {origin: 'https://evil.invalid'}, body: {version, sourceText: TEXT}})).status, 403);
  const unknown = await f.raw('/bootcamp/preview/prepare', {context: {...op, token: 'a'.repeat(64)}, body: {version, sourceText: TEXT}});
  assert.equal(unknown.status, 403); assert.equal(unknown.body.failure.code, 'PREVIEW_AUTH_REQUIRED');
  const noCookie = await f.raw('/bootcamp/preview/prepare', {context: op, headers: {cookie: undefined}, body: {version, sourceText: TEXT}});
  assert.equal(noCookie.status, 401);
  // Browser cannot supply actor, approval, rows or execution mode.
  for (const extra of [{institutionId: 'x'}, {approvalRef: 'approved_123456'}, {executionMode: 'ACTUAL'}]) {
    const r = await f.raw('/bootcamp/preview/prepare', {context: op, body: {version, sourceText: TEXT, ...extra}});
    assert.equal(r.status, 409); assert.equal(r.body.failure.code, 'PREVIEW_INVALID');
  }
  assert.deepEqual(f.state.calls, []);
  // Course authority removed while the context lives: next use fails closed.
  const ok = await prepare(f, op, TEXT); assert.equal(ok.status, 200);
  f.state.bindings = f.state.bindings.filter(b => b.courseOperatorRef !== COURSE);
  const after = await generate(f, op, ok.body);
  assert.notEqual(after.status, 200); assert.equal(f.state.calls.filter(c => c === 'generate').length, 0);
});

test('changing the source makes the earlier context, proposal and approval unusable', async t => {
  const f = await operatorConnectFixture(t), op = await f.login(f.operator);
  f.approve(TEXT);
  const a = (await prepare(f, op, TEXT)).body; assert.equal(a.approvalState, 'RECORDED');
  // Operator edits the text and prepares again: same session, new context.
  const edited = TEXT + '; 회고를 작성하세요';
  const b = (await prepare(f, op, edited)).body;
  assert.notEqual(b.contextRef, a.contextRef); assert.notEqual(b.bodyHash, a.bodyHash);
  assert.equal(b.approvalState, 'REQUIRED');
  // The earlier context (and its bound approval) is gone.
  const stale = await generate(f, op, a);
  assert.equal(stale.status, 409); assert.equal(stale.body.failure.code, 'PREVIEW_STALE');
  // The new text has no approval; the old approval cannot be moved to it.
  const none = await generate(f, op, b);
  assert.equal(none.body.failure.code, 'APPROVAL_REQUIRED');
  // A body hash that is not the prepared one is refused.
  const forged = await f.raw('/bootcamp/preview/generate', {context: op, body: {version, contextRef: b.contextRef, revision: b.revision, bodyHash: a.bodyHash}});
  assert.equal(forged.status, 409);
  assert.equal(f.state.calls.filter(c => c === 'generate').length, 0);
});

test('an approval is used once; a second prepare of the same text needs a new direct approval', async t => {
  const f = await operatorConnectFixture(t), op = await f.login(f.operator);
  const approval = f.approve(TEXT);
  const p = (await prepare(f, op, TEXT)).body;
  assert.equal((await generate(f, op, p)).status, 200);
  const again = (await prepare(f, op, TEXT)).body;
  assert.equal(again.approvalState, 'REQUIRED');
  assert.equal((await generate(f, op, again)).body.failure.code, 'APPROVAL_REQUIRED');
  // Owner re-records the SAME ref: CLEAR relay refuses the spent ref before D.
  f.preview.approvals.record({bodyHash: approval.bodyHash, bindingHash: f.bindingHash, approvalRef: approval.ref, expiresAt: approval.expires});
  const reuse = (await prepare(f, op, TEXT)).body; assert.equal(reuse.approvalState, 'RECORDED');
  const r = await generate(f, op, reuse);
  assert.equal(r.status, 409); assert.equal(r.body.failure.code, 'PREVIEW_ALREADY_USED');
  assert.equal(f.state.calls.filter(c => c === 'generate').length, 1);
});

test('server hold, expiry and D error are separate outcomes', async t => {
  const f = await operatorConnectFixture(t, {ttlMs: 1500}), op = await f.login(f.operator);
  // Hold: model says SUPPORTED for an alternative; server review holds it.
  const ALT = '강의 수강 또는 과제 제출';
  f.approve(ALT);
  const held = await generate(f, op, (await prepare(f, op, ALT)).body);
  assert.equal(held.status, 200);
  const clause = held.body.generated.proposal.clauses[0];
  assert.equal(clause.status, 'NEEDS_CLARIFICATION'); assert.equal(clause.tool, null);
  assert.deepEqual(clause.serverGuard.kinds.includes('ALTERNATIVE'), true);
  assert.equal(held.body.generated.proposal.operatorCanApprove, false);
  // Expiry: context TTL passes before generate.
  f.approve('과제를 제출하세요');
  const late = (await prepare(f, op, '과제를 제출하세요')).body;
  await new Promise(r => setTimeout(r, 1700));
  const expired = await generate(f, op, late);
  assert.equal(expired.status, 409); assert.ok(['PREVIEW_STALE', 'PREVIEW_EXPIRED'].includes(expired.body.failure.code));
});

test('D HTTP error stays a D_HTTP envelope without an invented model-call state', async t => {
  const failing = {execution: 'OFFLINE', async request(model, method) {
    if (method === 'countTokens') return {totalTokens: 10};
    throw Object.assign(Error('GEMINI_HTTP_FAILURE'), {code: 'GEMINI_HTTP_FAILURE'});
  }};
  const f = await operatorConnectFixture(t, {transport: failing}), op = await f.login(f.operator);
  f.approve(TEXT);
  const r = await generate(f, op, (await prepare(f, op, TEXT)).body);
  assert.equal(r.body.stage, 'FAILED'); assert.equal(r.body.failure.kind, 'D_HTTP');
  assert.equal(r.body.failure.error.version, 'clear-external-preview-error.1');
  assert.equal(r.body.failure.error.code, 'GEMINI_HTTP_FAILURE');
  assert.equal(r.status, r.body.failure.status);
  assert.equal(Object.hasOwn(r.body, 'actualModelCall'), false);
  assert.equal(JSON.stringify(r.body).includes('modelCall'), false);
});

test('logout ends the preview session', async t => {
  const f = await operatorConnectFixture(t), op = await f.login(f.operator);
  f.approve(TEXT);
  const p = (await prepare(f, op, TEXT)).body;
  f.authentication.logout(op);
  const r = await generate(f, op, p);
  assert.equal(r.status, 403);
  assert.equal(f.state.calls.filter(c => c === 'generate').length, 0);
});
