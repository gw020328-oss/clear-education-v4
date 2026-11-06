// Operator condition preview on the Moodle-native host: native command fence,
// command route, host config and owner-approval file. Synthetic only.
import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import fs, {mkdtempSync, writeFileSync, readFileSync, chmodSync, readdirSync, unlinkSync} from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
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

test('relay accepts a remote D expiry a little ahead of this host clock, still rejects stale or far-future ones', () => {
  const src = readFileSync(new URL('../../src/agent-preview/operator-relay.mjs', import.meta.url), 'utf8');
  assert.match(src, /const D_CLOCK_SKEW_MS = 30000;/);
  assert.match(src, /b\.expiresAt>time\(\)\.wall&&b\.expiresAt<=time\(\)\.wall\+900000\+D_CLOCK_SKEW_MS/);
  assert.match(src, /time\(\)\.wall<input\.expiresAt&&input\.expiresAt<=time\(\)\.wall\+3600000\+D_CLOCK_SKEW_MS/);
});

// Owner approval file: the file is the only authority, under one lock shared by every writer.
const approvalDir = () => mkdtempSync(join(tmpdir(), 'clear-preview-approvals-'));
const ownerGrant = (i, expiresAt) => ({bodyHash: createHash('sha256').update('body-' + i).digest('hex'), bindingHash: hex('2'), approvalRef: 'approval-ref-' + i, expiresAt});
const writeApprovals = (file, approvals) => writeFileSync(file, JSON.stringify({version: 'clear-normal-operator-preview-approvals.1', approvals}), {mode: 0o600});
const fileApprovals = file => JSON.parse(readFileSync(file, 'utf8')).approvals;

test('two instances consume in turn: an entry the other instance took or the owner removed is never returned', () => {
  const dir = approvalDir(), file = join(dir, 'approvals.json'), now = 1_800_000_000_000;
  const [g1, g2, g3, g4] = [1, 2, 3, 4].map(i => ownerGrant(i, now + 60000));
  writeApprovals(file, [g1, g2]);
  const a = createFileOwnerApprovals({path: file, clock: () => now}), b = createFileOwnerApprovals({path: file, clock: () => now});
  assert.deepEqual(a.take(g2.bodyHash, g2.bindingHash), g2, 'instance A reads g1 and g2 from the file');
  assert.deepEqual(b.take(g1.bodyHash, g1.bindingHash), g1, 'instance B consumes g1 from the file');
  assert.equal(a.take(g1.bodyHash, g1.bindingHash), null, 'A has no memory copy of g1');
  assert.equal(b.take(g2.bodyHash, g2.bindingHash), null);
  a.record(g3); a.record(g4);
  assert.equal(b.size(), 2);
  writeApprovals(file, [g4]);
  assert.equal(a.take(g3.bodyHash, g3.bindingHash), null, 'an entry the owner removed is gone for every instance');
  assert.deepEqual(b.take(g4.bodyHash, g4.bindingHash), g4);
  assert.deepEqual(fileApprovals(file), []);
  assert.deepEqual(readdirSync(dir), ['approvals.json'], 'no temporary or lock file is left');
});

test('owner additions racing with takes in other processes are neither lost nor consumed twice', async () => {
  const dir = approvalDir(), file = join(dir, 'approvals.json'), expiresAt = Date.now() + 600000;
  const existing = [1, 2, 3, 4, 5, 6].map(i => ownerGrant(i, expiresAt)), added = [7, 8, 9, 10, 11, 12].map(i => ownerGrant(i, expiresAt));
  writeApprovals(file, existing);
  // A writer that still uses the old fixed temporary name must not collide with these writers.
  writeFileSync(join(dir, '.approvals.tmp'), 'foreign', {mode: 0o600});
  const code = `const job = JSON.parse(process.env.CLEAR_APPROVAL_JOB);
    const {createFileOwnerApprovals} = await import(job.module);
    const store = createFileOwnerApprovals({path: job.file});
    while (Date.now() < job.startAt) {}
    let out = null;
    if (job.mode === 'record') { store.record(job.grant); out = 'RECORDED'; }
    else { const end = Date.now() + 5000; while (!out && Date.now() < end) out = store.take(job.grant.bodyHash, job.grant.bindingHash); }
    process.stdout.write(JSON.stringify(out));`;
  const startAt = Date.now() + 1500, module = new URL('../../tools/bootcamp/normal-operator-preview.mjs', import.meta.url).href;
  const run = (mode, grant) => new Promise((resolve, reject) => execFile(process.execPath, ['--input-type=module', '-e', code],
    {env: {...process.env, CLEAR_APPROVAL_JOB: JSON.stringify({module, file, mode, grant, startAt})}, timeout: 20000},
    (error, stdout, stderr) => error ? reject(Object.assign(error, {stderr})) : resolve(JSON.parse(stdout))));
  const results = await Promise.all([...existing.map(g => run('take', g)), ...added.map(g => run('record', g))]);
  assert.deepEqual(results.slice(0, 6), existing, 'every concurrent take got exactly its own grant');
  assert.deepEqual(results.slice(6), added.map(() => 'RECORDED'));
  const left = fileApprovals(file);
  assert.deepEqual(left.map(g => g.approvalRef).sort(), added.map(g => g.approvalRef).sort(), 'no addition lost, no taken entry restored');
  const store = createFileOwnerApprovals({path: file});
  for (const g of existing) assert.equal(store.take(g.bodyHash, g.bindingHash), null, 'a consumed entry never returns');
  for (const g of added) { assert.deepEqual(store.take(g.bodyHash, g.bindingHash), g); assert.equal(store.take(g.bodyHash, g.bindingHash), null); }
  assert.equal(readFileSync(join(dir, '.approvals.tmp'), 'utf8'), 'foreign');
  assert.deepEqual(readdirSync(dir).sort(), ['.approvals.tmp', 'approvals.json']);
});

test('a failed approval write returns no grant and keeps the entry; a held lock fails closed', () => {
  const dir = approvalDir(), file = join(dir, 'approvals.json'), now = 1_800_000_000_000;
  const g = ownerGrant(1, now + 60000), extra = ownerGrant(2, now + 60000);
  writeApprovals(file, [g]);
  const store = createFileOwnerApprovals({path: file, clock: () => now});
  mock.method(fs, 'renameSync', () => { throw Object.assign(Error('synthetic'), {code: 'EIO'}); }); syncBuiltinESMExports();
  try {
    assert.throws(() => store.take(g.bodyHash, g.bindingHash), /OWNER_APPROVAL_STORE/, 'no grant without the removal on file');
    assert.throws(() => store.record(extra), /OWNER_APPROVAL_STORE/);
  } finally { mock.restoreAll(); syncBuiltinESMExports(); }
  assert.deepEqual(fileApprovals(file), [g], 'the entry stays for a later take');
  assert.deepEqual(readdirSync(dir), ['approvals.json'], 'temporary file removed and lock released');
  writeFileSync(file + '.lock', '', {mode: 0o600});
  assert.throws(() => store.take(g.bodyHash, g.bindingHash), /OWNER_APPROVAL_LOCKED/, 'a lock held elsewhere is never bypassed');
  assert.deepEqual(fileApprovals(file), [g]);
  unlinkSync(file + '.lock');
  assert.deepEqual(store.take(g.bodyHash, g.bindingHash), g);
  assert.equal(store.take(g.bodyHash, g.bindingHash), null);
});
