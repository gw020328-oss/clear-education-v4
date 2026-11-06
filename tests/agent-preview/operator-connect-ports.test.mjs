// Offline unit tests for the separate-environment ports (network-block preload).
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {hash} from '../../src/agent-preview/index.mjs';
import {createOperatorScopeResolver, validateOperatorScopeConfig, OPERATOR_SCOPE_CONFIG_VERSION} from '../../src/agent-preview/operator-scope.mjs';
import {createSessionCommandFence, SESSION_COMMAND_FENCE} from '../../src/agent-preview/operator-session-fence.mjs';
import {createOwnerApprovalRegistry, withOwnerApprovals} from '../../src/agent-preview/operator-owner-approval.mjs';
import {offlineClauses} from '../../tools/agent-preview/offline-gemini.mjs';

const OP = '0x' + '1'.repeat(40), OTHER = '0x' + '2'.repeat(40);
const binding = (over = {}) => ({courseOperatorRef: 'course-a', scopeRef: 'course-a:preview', authorityRevision: 1,
  expiresAtMs: 2_000_000_000_000, dActor: {institutionId: 'clear-demo', courseId: '2', operatorId: '2'},
  deployment: {artifactHash: 'a'.repeat(64), deploymentEpoch: randomUUID(), bindingHash: 'b'.repeat(64),
    model: 'gemini-3.5-flash-lite', limitsHash: 'c'.repeat(64)}, ...over});
function world() {
  const s = {valid: true, role: 'operator', wallet: OP, csrfOk: true, expiresAt: 1_900_000_000, now: 1_800_000_000_000,
    bindings: [{wallet: OP, courseOperatorRef: 'course-a'}], config: {version: OPERATOR_SCOPE_CONFIG_VERSION, bindings: [binding()]}};
  const authentication = {
    authorizeWorkflow(c, write) { if (!s.valid || (write && !s.csrfOk)) throw Error('AUTH'); return {wallet: s.wallet, role: s.role}; },
    whoami() { if (!s.valid) throw Error('AUTH'); return {wallet: s.wallet, role: s.role, expiresAt: s.expiresAt}; },
  };
  const resolve = createOperatorScopeResolver({authentication, operatorBindings: () => s.bindings, previewBindings: () => s.config, clock: () => s.now});
  return {s, authentication, resolve, signal: new AbortController().signal};
}

test('scope comes from the existing course binding plus explicit preview config, never from role alone', () => {
  const w = world();
  const scope = w.resolve({}, {signal: w.signal});
  assert.deepEqual(scope.dActor, {institutionId: 'clear-demo', courseId: '2', operatorId: '2'});
  assert.equal(scope.expiresAtMs, Math.min(2_000_000_000_000, 1_900_000_000 * 1000));
  scope.assertCurrent();
  // operator role, but no course binding
  w.s.bindings = [{wallet: OTHER, courseOperatorRef: 'course-a'}];
  assert.throws(() => w.resolve({}, {signal: w.signal}), /OPERATOR_SCOPE_FORBIDDEN/);
  assert.throws(() => scope.assertCurrent(), /OPERATOR_SCOPE_FORBIDDEN/);
  // course binding but no preview config for that course
  w.s.bindings = [{wallet: OP, courseOperatorRef: 'course-b'}];
  assert.throws(() => w.resolve({}, {signal: w.signal}), /OPERATOR_SCOPE_NOT_CONFIGURED/);
  // two configured courses for one operator: the browser cannot pick; fail closed
  w.s.bindings = [{wallet: OP, courseOperatorRef: 'course-a'}, {wallet: OP, courseOperatorRef: 'course-b'}];
  w.s.config = {version: OPERATOR_SCOPE_CONFIG_VERSION, bindings: [binding(), binding({courseOperatorRef: 'course-b', scopeRef: 'b',
    dActor: {institutionId: 'clear-demo', courseId: '3', operatorId: '2'}})]};
  assert.throws(() => w.resolve({}, {signal: w.signal}), /OPERATOR_SCOPE_AMBIGUOUS/);
  // participants never get a scope
  const p = world(); p.s.role = 'participant';
  assert.throws(() => p.resolve({}, {signal: p.signal}), /OPERATOR_SCOPE_FORBIDDEN/);
});

test('scope snapshot fails on changed binding, revision, session or expiry', () => {
  for (const change of [
    s => { s.config = {...s.config, bindings: [binding({authorityRevision: 2})]}; },
    s => { s.config = {...s.config, bindings: [binding({dActor: {institutionId: 'clear-demo', courseId: '9', operatorId: '2'}})]}; },
    s => { s.valid = false; },
    s => { s.csrfOk = false; },
    s => { s.now = 1_900_000_000_000; },
  ]) {
    const w = world(), scope = w.resolve({}, {signal: w.signal});
    change(w.s);
    assert.throws(() => scope.assertCurrent());
  }
  const w = world(), c = new AbortController(); c.abort();
  assert.throws(() => w.resolve({}, {signal: c.signal}), /OPERATOR_SCOPE_CANCELLED/);
});

test('preview config is strict: duplicates, shared D actor, bad model or hash refused', () => {
  const base = {version: OPERATOR_SCOPE_CONFIG_VERSION, bindings: [binding()]};
  assert.ok(validateOperatorScopeConfig(base));
  for (const bad of [
    {...base, bindings: [binding(), binding()]},
    {...base, bindings: [binding(), binding({courseOperatorRef: 'course-b'})]},
    {...base, bindings: [binding({deployment: {...binding().deployment, model: 'other-model'}})]},
    {...base, bindings: [binding({deployment: {...binding().deployment, bindingHash: 'x'}})]},
    {...base, bindings: [binding({dActor: {institutionId: 'clear-demo', courseId: '0', operatorId: '2'}})]},
    {...base, extra: true},
  ]) assert.throws(() => validateOperatorScopeConfig(bad));
});

test('separate-environment fence: one command per session, exact body, single await, no reuse after finish', async () => {
  const s = {valid: true, now: 0};
  const authentication = {authorizeWorkflow() { if (!s.valid) throw Error('AUTH'); return {wallet: OP, role: 'operator'}; }};
  const run = createSessionCommandFence({authentication, clock: () => s.now});
  const context = {token: 'a'.repeat(64)}, signal = new AbortController().signal;
  const command = Object.freeze({method: 'POST', path: '/bootcamp/preview/prepare', body: Object.freeze({x: 1})});
  let saved;
  const result = await run({context, command, signal}, async fence => { assert.equal(fence.kind, SESSION_COMMAND_FENCE); fence.assertCurrent(); saved = fence; return 'ok'; });
  assert.equal(result, 'ok');
  assert.throws(() => saved.assertCurrent(), /COMMAND_FENCE_EXPIRED/);
  // concurrent command on the same session is refused
  let release; const hold = new Promise(r => { release = r; });
  const first = run({context, command, signal}, () => hold);
  await assert.rejects(run({context, command, signal}, async () => 'second'), /COMMAND_FENCE_BUSY/);
  release('done'); assert.equal(await first, 'done');
  // session revoked during work: assert before finish fails
  await assert.rejects(run({context, command, signal}, async () => { s.valid = false; return 'late'; }), /AUTH/);
  s.valid = true;
  // deadline is never longer than the relay's 45 s
  await assert.rejects(run({context, command, signal}, async fence => { s.now += 45000; fence.assertCurrent(); }), /COMMAND_FENCE_EXPIRED/);
  assert.throws(() => createSessionCommandFence({authentication, maxMs: 60000}), /COMMAND_FENCE_CONFIG/);
  // participants cannot run preview commands
  const p = createSessionCommandFence({authentication: {authorizeWorkflow: () => ({wallet: OP, role: 'participant'})}});
  await assert.rejects(p({context, command, signal}, async () => 'x'), /COMMAND_FENCE_FORBIDDEN/);
});

test('owner approvals bind only an exact pre-recorded bodyHash once, inside the operator request', async () => {
  let now = 1000;
  const registry = createOwnerApprovalRegistry({clock: () => now});
  const bodyHash = hash('body'), bindingHash = hash('binding');
  registry.record({bodyHash, bindingHash, approvalRef: 'approved_1', expiresAt: now + 60000});
  assert.throws(() => registry.record({bodyHash, bindingHash, approvalRef: 'approved_2', expiresAt: now + 60000}), /OWNER_APPROVAL_EXISTS/);
  assert.throws(() => registry.record({bodyHash: hash('x'), bindingHash, approvalRef: 'approved_3', expiresAt: now + 3600001}), /OWNER_APPROVAL_INVALID/);
  const bound = [];
  const relay = Object.freeze({
    async prepare(c, input) { return {stage: 'PREPARED', contextRef: 'ctx', revision: 1, bodyHash: input.sourceText === 'same' ? bodyHash : hash('other')}; },
    async bindApproval(c, input) { bound.push(input); return {stage: 'PREPARED', approvalState: 'RECORDED'}; },
    publish() {}, generate() {}, execute() {},
  });
  const facade = withOwnerApprovals(relay, {registry, bindingHash});
  assert.equal((await facade.prepare({}, {sourceText: 'different'})).approvalState, undefined);
  assert.equal((await facade.prepare({}, {sourceText: 'same'})).approvalState, 'RECORDED');
  assert.equal(bound[0].approvalRef, 'approved_1'); assert.equal(bound[0].bodyHash, bodyHash);
  // taken once
  assert.equal((await facade.prepare({}, {sourceText: 'same'})).approvalState, undefined);
  // expired grants are dropped
  registry.record({bodyHash, bindingHash, approvalRef: 'approved_4', expiresAt: now + 10});
  now += 11; assert.equal(registry.size(), 0);
  assert.equal(typeof facade.publish, 'function');
});

test('offline model is naive on purpose; the server review decides holds', () => {
  const rows = offlineClauses('강의를 완료하세요; 출석률 80%');
  assert.deepEqual(rows.map(r => [r.status, r.capability]), [['SUPPORTED', 'MOODLE_ACTIVITY_COMPLETION.1'], ['UNSUPPORTED', null]]);
});
