import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const head = process.argv[2];
assert.match(head ?? '', /^[a-f0-9]{40}$/);
const path = 'src/agent-preview/moodle-binding';
const git = (...args) => execFileSync('git', args);
const directory = mkdtempSync(join(tmpdir(), 'clear-b-c-sources-'));
let child;
try {
  // Copy exact Git blob bytes into a disposable module directory. Relative imports stay intact.
  const files = git('ls-tree', '--name-only', head + ':' + path).toString().trim().split('\n');
  for (const file of files) {
    assert.match(file, /^[a-z-]+\.mjs$/);
    writeFileSync(join(directory, file), git('show', head + ':' + path + '/' + file), { mode: 0o400 });
  }
  const load = name => import(pathToFileURL(join(directory, name + '.mjs')).href);
  const { createBindingCoordinator, createSyntheticEnvironment, createSyntheticVerifier, versions } = await load('index');
  const { digest, hash } = await load('contract');

  child = spawn('docker', ['exec', '-i', '-e', 'CLEAR_ACTUAL_MOODLE_PROBE=1',
    'clear-actual-reader-web', 'php', '/probe/moodle-integration/wire_probe.php'],
  { stdio: ['pipe', 'pipe', 'pipe'] });
  const exited = once(child, 'exit');
  let hadStderr = false;
  child.stderr.on('data', () => { hadStderr = true; });
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  async function next() {
    const cancel = new AbortController();
    try {
      const line = await Promise.race([lines.next(), delay(60000, null, { signal: cancel.signal }).then(() => {
        throw Error('PHP_FIXTURE_TIMEOUT');
      })]);
      assert.equal(line.done, false, 'PHP fixture ended early');
      return JSON.parse(line.value);
    } finally { cancel.abort(); }
  }
  assert.deepEqual(await next(), { ready: true });
  let tail = Promise.resolve();
  function call(op, fields = {}) {
    // Keep each request/response pair adjacent, including when B runs two lookups concurrently.
    const pending = tail.then(async () => {
      child.stdin.write(JSON.stringify({ op, ...fields }) + '\n');
      return next();
    });
    tail = pending;
    return pending;
  }
  async function ok(op, fields) {
    const reply = await call(op, fields);
    assert.equal(reply.ok, true, reply.code);
    return reply.result;
  }
  const pass = description => console.log('PASS ' + description);
  const wall = () => Math.floor(Date.now() / 1000);
  const timePolicy = { policyRef: 'SYNTHETIC_BC_LOCAL_ONLY', attemptSeconds: 120, bindingSeconds: 120,
    roundTripMs: 5000, finalFenceMs: 1000, maxObservationAgeSeconds: 10, maxClockSkewSeconds: 0 };
  const token = 'a'.repeat(64);
  const context = { token, csrf: digest('csrf:' + token), wallet: '0x' + '1'.repeat(40), chainId: 31337 };
  const policy = { mode: 'SYNTHETIC_ONLY', status: 'ACTIVE', issuerEpoch: 'issuer-probe-v1', authorityRevision: 1,
    rosterRevision: 1, trustEpoch: 1, configHash: hash('fixture-config'), mappingHash: hash('fixture-map'),
    participantRef: 'fixture-participant', wallet: context.wallet, installationRef: 'synthetic-moodle',
    courseRef: 'synthetic-course', audience: 'synthetic-clear', expectedSubjectRef: 'synthetic-subject',
    validUntil: wall() + 600, timePolicyHash: hash(timePolicy), chainId: context.chainId, targets: ['core-page-manual-mark'] };
  const application = { id: 'existing-application', participantRef: policy.participantRef, wallet: context.wallet,
    courseRef: policy.courseRef, mappingHash: policy.mappingHash, revision: 1, status: 'ACTIVE' };
  const applications = [application, { ...application, id: 'other-application' },
    { ...application, id: 'other-student', participantRef: 'different-participant' },
    { ...application, id: 'other-course', courseRef: 'different-course' },
    { ...application, id: 'other-mapping', mappingHash: hash('different-map') }];

  async function scenario(run) {
    const env = createSyntheticEnvironment({ policy, now: wall(), applications,
      sessions: [{ digest: digest(token), wallet: context.wallet, issuedAt: wall() - 1, expiresAt: wall() + 600 }] });
    let runtime;
    const calls = [];
    try {
      const before = ['auth', 'workflow'].map(name => digest(readFileSync(env.paths[name])));
      const verifier = createSyntheticVerifier(async request => {
        const op = request.version === versions.confirmationRequest ? 'confirmation' : 'observations';
        assert.equal(request.version, versions[op + 'Request']);
        calls.push(op);
        const reply = await call(op, { request });
        if (!reply.ok) throw Error(reply.code);
        return reply.result;
      });
      runtime = createBindingCoordinator({ paths: env.paths, control: env.control, verifier, timePolicy,
        clock: { wall, monotonic: () => performance.now() }, sessionKey: Buffer.alloc(32, 17) });
      function rows(query, ...args) {
        const db = new DatabaseSync(env.paths.main, { readOnly: true });
        try { return db.prepare(query).all(...args); } finally { db.close(); }
      }
      const start = (id = application.id) => runtime.start(context, id, { version: versions.start });
      const preview = (a, id = application.id) => runtime.preview(context, id, { version: versions.preview, attemptRef: a.attemptRef });
      const complete = (a, p) => runtime.complete(context, application.id, { version: versions.complete,
        attemptRef: a.attemptRef, confirmationDigest: p.confirmationDigest });
      const read = (b, id = application.id) => runtime.readPreview(context, id, b.bindingRef);
      async function register(a, override) {
        // Test-only substitute for authenticated attempt intake. Read a row B already created.
        const row = rows('SELECT application_id, status, app_revision, scope_hash, expires_at FROM attempts WHERE id=?',
          digest(a.attemptRef))[0];
        assert.ok(row);
        assert.equal(row.application_id, application.id);
        assert.equal(row.status, 'PENDING');
        assert.equal(row.app_revision, application.revision);
        assert.equal(row.expires_at, a.expiresAtExclusive);
        const request = { version: versions.confirmationRequest, attemptRef: a.attemptRef,
          requestRef: 'explicit-fixture-confirm', issuerEpoch: policy.issuerEpoch, bindingScopeHash: row.scope_hash };
        await ok('register', { request, override: { expiry: row.expires_at, ...override } });
        return request;
      }
      await run({ start, preview, complete, read, register, rows, calls });
      assert.deepEqual(['auth', 'workflow'].map(name => digest(readFileSync(env.paths[name]))), before);
    } finally {
      runtime?.close();
      env.dispose();
    }
  }

  await scenario(async ({ start, preview, register, rows }) => {
    for (const id of ['missing-application', 'other-student', 'other-course', 'other-mapping']) {
      assert.throws(() => start(id), /^Error: APPLICATION_SCOPE$/);
    }
    assert.equal(rows('SELECT id FROM attempts').length, 0);
    pass('existing application and matching student, course and mapping are required');
    const a = start();
    await assert.rejects(preview(a, 'other-application'), /^Error: ATTEMPT_SCOPE$/);
    await assert.rejects(preview(a), /^Error: CONFIRMATION$/);
    pass('cross-application attempt and lookup before explicit Moodle confirmation rejected');
    for (const override of [{ userid: 0 }, { courseid: 0 }]) {
      const request = await register(a, override);
      assert.deepEqual(await call('mint', { request }), { ok: false, code: 'ATTEMPT_BINDING' });
    }
    pass('PHP refuses mismatched local student or course mapping at mint');
    const request = await register(a, { subjectref: 'wrong-subject' });
    await ok('mint', { request });
    await assert.rejects(preview(a), /^Error: RESPONSE_SCOPE$/);
    assert.equal(rows('SELECT preview_digest FROM attempts')[0].preview_digest, null);
    assert.equal(rows('SELECT id FROM bindings').length, 0);
    pass('B rejects an actual PHP response for the wrong subject without consumption');
  });

  await scenario(async ({ start, preview, complete, register, rows }) => {
    const a = start();
    await ok('mint', { request: await register(a) });
    const p = await preview(a);
    await ok('revokeAttempt', { attemptRef: a.attemptRef });
    await assert.rejects(complete(a, p), /^Error: ATTEMPT_BINDING$/);
    assert.equal(rows('SELECT status FROM attempts')[0].status, 'PENDING');
    assert.equal(rows('SELECT id FROM bindings').length, 0);
    pass('PHP revocation between preview and complete prevents B consumption');
  });

  await scenario(async ({ start, preview, complete, read, register, rows, calls }) => {
    const a = start();
    assert.equal((await ok('mint', { request: await register(a) })).nativeClosed, true);
    const p = await preview(a);
    const results = await Promise.allSettled([complete(a, p), complete(a, p)]);
    const won = results.filter(r => r.status === 'fulfilled');
    assert.equal(won.length, 1);
    assert.match(results.find(r => r.status === 'rejected').reason.message, /^(ATTEMPT_INACTIVE|CAS_LOST)$/);
    const b = won[0].value;
    assert.equal(b.status, 'OBSERVED_ONLY');
    assert.equal(rows('SELECT status FROM attempts')[0].status, 'CONSUMED');
    assert.equal(rows('SELECT id FROM bindings').length, 1);
    const before = calls.length;
    await assert.rejects(complete(a, p), /^Error: ATTEMPT_INACTIVE$/);
    assert.equal(calls.length, before);
    pass('concurrent and later complete calls consume the B attempt only once');
    await assert.rejects(read(b, 'other-application'), /^Error: BINDING_SCOPE$/);
    const first = await read(b);
    assert.equal(first.observations[0].status, 'INCOMPLETE');
    await ok('completePage');
    const second = await read(b);
    assert.equal(second.applicationId, application.id);
    assert.equal(second.observations[0].status, 'COMPLETE');
    assert.equal(second.scope, 'READ_PREVIEW');
    assert.equal(second.automaticEligibility, false);
    assert.equal(second.paymentAllowed, false);
    pass('B start, preview, complete and readPreview use fresh actual Moodle observations');
    await ok('revokeAttempt', { attemptRef: a.attemptRef });
    await assert.rejects(read(b), /^Error: ATTEMPT_BINDING$/);
    pass('PHP revocation blocks subsequent reads of an existing B binding');
  });
  pass('synthetic B auth and workflow database bytes are unchanged across all scenarios');
  child.stdin.end();
  assert.deepEqual(await exited, [0, null]);
  assert.equal(hadStderr, false);
  console.log('B_HEAD=' + head);
} finally {
  child?.stdin.destroy();
  child?.kill();
  rmSync(directory, { recursive: true, force: true });
}
