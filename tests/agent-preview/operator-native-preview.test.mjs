// Operator condition preview on the Moodle-native host: native command fence,
// command route, host config and owner-approval file. Synthetic only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, readFileSync, chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createNativePreviewCommand, NATIVE_PREVIEW_COMMAND_FENCE} from '../../src/agent-preview/operator-native-command.mjs';
import {moodleCommandDigest} from '../../src/embedded-wallet/moodle-command.mjs';
import {validateOperatorPreviewConfig, createFileOwnerApprovals} from '../../tools/bootcamp/normal-operator-preview.mjs';

const hex = c => c.repeat(64);
function scope() {
  const calls = []; let valid = true;
  return {calls, revoke() { valid = false; }, scope: Object.freeze({
    async run(input, work) { calls.push(['reserve', input]); try { const r = await work(); calls.push(['finish']); return r; } finally { calls.push(['end']); } },
    assert() { calls.push(['assert']); if (!valid) throw Error('MOODLE_COMMAND_BINDING'); },
    memoryCommitted() { calls.push(['committed']); },
  })};
}
const auth = (role = 'operator', wallet = '0x' + 'ab'.repeat(20)) => ({authorizeWorkflow() { return {role, wallet}; }});
const request = (headers = {}) => ({headers: {'x-clear-command-ref': hex('a'), 'x-clear-command-binding': hex('b'), 'idempotency-key': 'preview-0123456789abcdef01234567', ...headers}});
const command = {method: 'POST', path: '/bootcamp/preview/prepare', body: {version: 'clear-operator-preview.1', sourceText: '강의를 모두 수강해야 합니다'}};

test('native preview command reserves the exact Moodle grant and fences work once', async () => {
  const s = scope(), run = createNativePreviewCommand({commandScope: s.scope, authentication: auth()});
  let fence;
  const result = await run({request: request(), context: {token: hex('c')}, command, signal: new AbortController().signal}, async f => { fence = f; f.assertCurrent(); return 'ok'; });
  assert.equal(result, 'ok'); assert.equal(fence.kind, NATIVE_PREVIEW_COMMAND_FENCE);
  const [kind, input] = s.calls[0];
  assert.equal(kind, 'reserve');
  assert.deepEqual(input.command, {method: 'POST', path: command.path, body: command.body, idempotencyKey: 'preview-0123456789abcdef01234567'});
  assert.equal(input.requestRef, hex('a')); assert.equal(input.commandBinding, hex('b'));
  assert(s.calls.some(([k]) => k === 'committed'), 'the one grant is consumed');
  assert.throws(() => fence.assertCurrent(), /COMMAND_FENCE_EXPIRED/, 'fence closes after work');
});

test('native preview command refuses missing native headers, non-operators, a revoked scope and expiry', async () => {
  const signal = new AbortController().signal;
  for (const missing of ['x-clear-command-ref', 'x-clear-command-binding', 'idempotency-key']) {
    const s = scope(), run = createNativePreviewCommand({commandScope: s.scope, authentication: auth()});
    await assert.rejects(run({request: request({[missing]: undefined}), context: {}, command, signal}, async () => 'x'), /COMMAND_FENCE_NATIVE_REQUIRED/);
    assert.equal(s.calls.length, 0, 'nothing reserved or run unfenced');
  }
  const s = scope();
  await assert.rejects(createNativePreviewCommand({commandScope: s.scope, authentication: auth('participant')})(
    {request: request(), context: {}, command, signal}, async () => 'x'), /COMMAND_FENCE_FORBIDDEN/);
  const r = scope(), run = createNativePreviewCommand({commandScope: r.scope, authentication: auth()});
  await assert.rejects(run({request: request(), context: {}, command, signal}, async f => { r.revoke(); f.assertCurrent(); }), /MOODLE_COMMAND_BINDING/);
  assert(!r.calls.some(([k]) => k === 'committed'), 'a failed fence never commits');
  let now = 0; const e = scope();
  await assert.rejects(createNativePreviewCommand({commandScope: e.scope, authentication: auth(), clock: () => now})(
    {request: request(), context: {}, command, signal}, async f => { now = 45001; f.assertCurrent(); }), /COMMAND_FENCE_EXPIRED/);
});

test('Moodle command route accepts preview POSTs only with a per-request key', () => {
  for (const name of ['prepare', 'generate', 'execute']) {
    assert.match(moodleCommandDigest({method: 'POST', path: '/bootcamp/preview/' + name, body: {a: 1}, idempotencyKey: 'preview-abc'}), /^[a-f0-9]{64}$/);
    assert.throws(() => moodleCommandDigest({method: 'POST', path: '/bootcamp/preview/' + name, body: {a: 1}, idempotencyKey: null}), /MOODLE_COMMAND_ROUTE/);
  }
  assert.throws(() => moodleCommandDigest({method: 'POST', path: '/bootcamp/preview/publish', body: {}, idempotencyKey: 'preview-abc'}), /MOODLE_COMMAND_ROUTE/);
  assert.notEqual(moodleCommandDigest({method: 'POST', path: '/bootcamp/preview/prepare', body: {a: 1}, idempotencyKey: 'preview-a'}),
    moodleCommandDigest({method: 'POST', path: '/bootcamp/preview/prepare', body: {a: 1}, idempotencyKey: 'preview-b'}), 'same text twice is two distinct grants');
});

test('host preview config is exact; owner approvals come from a private file and are consumed once', () => {
  const dir = mkdtempSync(join(tmpdir(), 'clear-preview-')), file = join(dir, 'approvals.json');
  const base = {version: 'clear-normal-operator-preview.1', dPublicOrigin: 'https://d-preview.clear.invalid', dConnectOrigin: 'http://127.0.0.1:18991',
    dExecution: 'OFFLINE_TEST_TRANSPORT', scopeFile: join(dir, 's.json'), sharedSecretFile: join(dir, 'k'), approvalsFile: file};
  assert.equal(validateOperatorPreviewConfig(base).dExecution, 'OFFLINE_TEST_TRANSPORT');
  for (const bad of [{...base, extra: 1}, {...base, dExecution: 'LIVE'}, {...base, dConnectOrigin: 'http://example.com'}, {...base, scopeFile: 's.json'}]) {
    assert.throws(() => validateOperatorPreviewConfig(bad), /NORMAL_OPERATOR_PREVIEW_CONFIG/);
  }
  const now = 1_800_000_000_000, grant = {bodyHash: hex('1'), bindingHash: hex('2'), approvalRef: 'approval-ref-1', expiresAt: now + 60000};
  writeFileSync(file, JSON.stringify({version: 'clear-normal-operator-preview-approvals.1', approvals: [grant]}), {mode: 0o644});
  const approvals = createFileOwnerApprovals({path: file, clock: () => now});
  assert.throws(() => approvals.take(hex('1'), hex('2')), /NORMAL_OPERATOR_PREVIEW_PERMISSIONS/, 'a world-readable file is refused');
  chmodSync(file, 0o600);
  assert.equal(approvals.take(hex('1'), hex('9')), null, 'other binding gets nothing');
  assert.deepEqual(approvals.take(hex('1'), hex('2')), grant);
  assert.equal(approvals.take(hex('1'), hex('2')), null, 'consumed once');
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).approvals, [], 'removed from the owner file');
});
