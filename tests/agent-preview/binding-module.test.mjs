import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { createBindingCoordinator, createSyntheticVerifier, installationVerifier, validateDto, versions } from '../../src/agent-preview/moodle-binding/index.mjs';
import { createSqlPolicy } from '../../src/agent-preview/moodle-binding/sql-policy.mjs';
import { schemas } from '../../src/agent-preview/moodle-binding/schema.mjs';
import { digest, hash } from '../../src/agent-preview/moodle-binding/contract.mjs';
import { fixture, context, responseFor } from './fixtures/binding-module-fixture.mjs';

test('real module starts, previews, consumes, reads and survives reopen without product writes', async t => {
  const f = fixture(t), before = [f.fingerprint('auth'), f.fingerprint('workflow')];
  const a = f.start(), preview = await f.preview(a), b = await f.complete(a, preview);
  assert.equal(b.status, 'OBSERVED_ONLY');
  const result = await f.runtime.readPreview(context, 'app-a', b.bindingRef);
  assert.equal(result.observations[0].status, 'COMPLETE');
  assert.equal(result.automaticEligibility, false); assert.equal(result.paymentAllowed, false);
  assert.deepEqual([f.fingerprint('auth'), f.fingerprint('workflow')], before);
  f.reopen();
  assert.equal(f.runtime.bindingStatus(context, 'app-a').bindingRef, b.bindingRef);
  await assert.rejects(f.complete(a, preview), /ATTEMPT_INACTIVE/);
  assert.equal((await f.runtime.readPreview(context, 'app-a', b.bindingRef)).bindingRef, b.bindingRef);
  const attempts = JSON.stringify(f.sql('main', 'SELECT * FROM attempts'));
  assert.ok(!attempts.includes(context.token) && !attempts.includes('Synthetic student'));
});

test('installation verifier and missing/unapproved policy defaults stay disabled', t => {
  const f = fixture(t);
  assert.equal(installationVerifier.status, 'DISABLED');
  assert.throws(() => createBindingCoordinator({ ...f.config, verifier: { query() {} } }), /INSTALLATION_DISABLED/);
  assert.throws(() => createBindingCoordinator({ ...f.config, timePolicy: undefined }), /DTO_KEYS/);
  assert.throws(() => createBindingCoordinator({ ...f.config, timePolicy: { ...f.config.timePolicy, roundTripMs: 999999 } }), /TIME_POLICY/);
});

for (const [label, edit] of [
  ['extra input', r => ({ ...r, userId: 7 })], ['old version', r => ({ ...r, version: 'clear-moodle-confirmation.2' })],
  ['wrong request', r => ({ ...r, requestRef: 'other' })], ['old snapshot with fresh checkedAt', r => ({ ...r, observedAt: 10 })],
  ['snapshot after check', r => ({ ...r, observedAt: 1001 })], ['future checkedAt', r => ({ ...r, checkedAt: 1001 })],
  ['exact expiry', r => ({ ...r, expiresAtExclusive: 1000 })], ['wrong epoch', r => ({ ...r, issuerEpoch: 'old-issuer' })],
  ['wrong subject', r => ({ ...r, subjectRef: 'other-student' })], ['unsafe generation', r => ({ ...r, enrolmentRevision: Number.MAX_SAFE_INTEGER + 1 })],
]) {
  test(`remote ${label} rejects without consume`, async t => {
    const f = fixture(t), a = f.start(); f.state.mutate = edit;
    await assert.rejects(f.preview(a));
    assert.deepEqual(f.sql('main', 'SELECT status,preview_digest FROM attempts'), [{ status: 'PENDING', preview_digest: null }]);
    assert.equal(f.sql('main', 'SELECT * FROM bindings').length, 0);
  });
}

test('requestRef response replay is rejected on a new lookup', async t => {
  const f = fixture(t), a = f.start(); let previous;
  f.state.mutate = r => { previous ??= r; return previous; };
  const p = await f.preview(a);
  await assert.rejects(f.complete(a, p), /REQUEST_REF/);
  assert.deepEqual(f.sql('main', 'SELECT state FROM requests ORDER BY rowid').map(r => r.state), ['USED', 'CANCELLED']);
});

test('timeout cancels request; ignored abort and late response cannot commit', async t => {
  const f = fixture(t, { timePolicy: { policyRef: 'SYNTHETIC_TIMEOUT_ONLY', attemptSeconds: 120, bindingSeconds: 300, roundTripMs: 20, finalFenceMs: 1000, maxObservationAgeSeconds: 10, maxClockSkewSeconds: 0 } });
  const a = f.start(); let release;
  f.state.query = request => new Promise(resolve => { release = () => resolve(responseFor(request, f.policy, f.state.wall)); });
  await assert.rejects(f.preview(a), /RESPONSE_TIMEOUT/);
  release(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.sql('main', 'SELECT state FROM requests'), [{ state: 'CANCELLED' }]);
  assert.equal(f.sql('main', 'SELECT preview_digest FROM attempts')[0].preview_digest, null);
  f.state.query = null; assert.ok((await f.preview(a)).confirmationDigest);
});

test('monotonic final fence expiry rolls preview and request consumption back', async t => {
  const f = fixture(t), a = f.start(); let reads = 0;
  f.state.query = request => {
    f.state.samples = () => { if (++reads === 3) f.state.mono += 1000; }; // receipt, txn begin, final fence.
    return responseFor(request, f.policy, f.state.wall);
  };
  await assert.rejects(f.preview(a), /RESPONSE_TIMEOUT/);
  assert.equal(f.sql('main', 'SELECT preview_digest FROM attempts')[0].preview_digest, null);
});

for (const field of ['authorityRevision', 'rosterRevision', 'trustEpoch', 'configHash', 'issuerEpoch']) {
  test(`stale ${field} worker rejects after remote query`, async t => {
    const f = fixture(t), a = f.start();
    f.state.query = request => {
      const next = { ...f.policy, [field]: typeof f.policy[field] === 'number' ? f.policy[field] + 1 : field === 'configHash' ? hash('new-config') : 'new-issuer' };
      f.setPolicy(next); return responseFor(request, f.policy, f.state.wall);
    };
    await assert.rejects(f.preview(a), /STALE_WORKER/);
    assert.equal(f.sql('main', 'SELECT preview_digest FROM attempts')[0].preview_digest, null);
  });
}

test('config returns to original value with newer revision; old worker is still rejected', t => {
  const f = fixture(t);
  f.setPolicy({ ...f.policy, authorityRevision: 3 });
  assert.throws(f.start, /STALE_WORKER/);
});

test('restore drain fences an old worker even if the entire DB policy is old', async t => {
  const f = fixture(t), a = f.start();
  f.state.query = request => { f.control.replace({ status: 'DRAINING', policyHash: hash(f.policy) }); return responseFor(request, f.policy, f.state.wall); };
  await assert.rejects(f.preview(a), /STALE_WORKER/);
  f.control.replace({ status: 'ACTIVE', policyHash: hash({ ...f.policy, issuerEpoch: 'restored-epoch' }) });
  assert.throws(f.start, /STALE_WORKER/);
  assert.throws(f.reopen, /POLICY_CHANGED/);
});

for (const [label, change, expected] of [
  ['logout', f => f.execute('auth', 'UPDATE sessions SET revoked_at=1000'), /AUTH_REQUIRED/],
  ['application revision', f => f.execute('workflow', 'UPDATE applications SET revision=2'), /ATTEMPT_STALE/],
  ['application closure', f => f.execute('workflow', "UPDATE applications SET status='CLOSED'"), /APPLICATION_SCOPE/],
  ['auth config', f => f.sql('auth', 'UPDATE metadata SET config_hash=? RETURNING id', [hash('other')]), /CONFIG_CHANGED/],
  ['policy DB only', f => f.setPolicy({ ...f.policy, rosterRevision: 2 }, false), /POLICY_CHANGED/],
]) {
  test(`${label} during remote I/O denies final commit`, async t => {
    const f = fixture(t), a = f.start();
    f.state.query = request => { change(f); return responseFor(request, f.policy, f.state.wall); };
    await assert.rejects(f.preview(a), expected);
    assert.equal(f.sql('main', 'SELECT preview_digest FROM attempts')[0].preview_digest, null);
  });
}

test('new same-wallet session and superseding attempt cannot inherit confirmation', async t => {
  const f = fixture(t), a = f.start();
  const newToken = 'b'.repeat(64);
  f.sql('auth', 'INSERT INTO sessions VALUES(?,?,?,?,NULL) RETURNING digest', [digest(newToken), context.wallet, 1000, 1800]);
  await assert.rejects(f.runtime.preview({ ...context, token: newToken, csrf: digest('csrf:' + newToken) }, 'app-a', { version: versions.preview, attemptRef: a.attemptRef }), /ATTEMPT_SCOPE/);
  f.start(); await assert.rejects(f.preview(a), /ATTEMPT_INACTIVE/);
});

test('active subject uniqueness rolls back a different application consumption', async t => {
  const f = fixture(t), a = f.start(), b = f.start('app-b'), pa = await f.preview(a), pb = await f.preview(b, 'app-b');
  await f.complete(a, pa);
  await assert.rejects(f.complete(b, pb, 'app-b'), /UNIQUE constraint/);
  assert.deepEqual(f.sql('main', 'SELECT status FROM attempts ORDER BY application_id').map(r => r.status), ['CONSUMED', 'PENDING']);
  assert.equal(f.sql('main', "SELECT event FROM audit WHERE event='CONSUMED'").length, 1);
});

test('changed confirmation requires a new preview; foreign target cannot be returned', async t => {
  const f = fixture(t), a = f.start(), p = await f.preview(a);
  f.state.mutate = r => ({ ...r, moodleSessionGeneration: 'changed' });
  await assert.rejects(f.complete(a, p), /PREVIEW_CHANGED/);
  f.state.mutate = r => r; const b = await f.complete(a, p);
  f.state.mutate = r => ({ ...r, observations: [{ ...r.observations[0], targetRef: 'foreign' }] });
  await assert.rejects(f.runtime.readPreview(context, 'app-a', b.bindingRef), /TARGET_SCOPE/);
});

test('schema drift audit trigger is refused before any runtime mutation', async t => {
  const f = fixture(t);
  f.execute('main', "CREATE TRIGGER audit_policy AFTER INSERT ON audit BEGIN UPDATE policy SET record='{}'; END;");
  assert.throws(f.start, /SCHEMA_INVENTORY/);
  assert.equal(f.sql('main', 'SELECT * FROM attempts').length, 0);
  assert.equal(JSON.parse(f.sql('main', 'SELECT record FROM policy')[0].record).authorityRevision, 1);
});

test('extra view and changed journal mode each refuse runtime startup', t => {
  const f = fixture(t);
  f.execute('auth', 'CREATE VIEW leaked AS SELECT raw_token FROM secrets');
  assert.throws(() => createBindingCoordinator(f.config), /SCHEMA_INVENTORY/);
  f.execute('auth', 'DROP VIEW leaked');
  f.execute('workflow', 'PRAGMA journal_mode=WAL');
  assert.throws(() => createBindingCoordinator(f.config), /DB_JOURNAL/);
});

test('attempt exact expiry, clock rollback and wrong CSRF refuse consumption', async t => {
  const f = fixture(t), a = f.start();
  assert.throws(() => f.runtime.start({ ...context, csrf: '0'.repeat(64) }, 'app-b', { version: versions.start }), /CSRF/);
  f.state.wall = 999; assert.throws(f.start, /CLOCK_OR_POLICY_EXPIRED/);
  f.state.wall = a.expiresAtExclusive; f.state.mono += 120000;
  await assert.rejects(f.preview(a), /ATTEMPT_INACTIVE/);
});

test('restricted authorizer denies policy DML, raw reads and trigger/view sources independently of inventory', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(schemas.main + "CREATE TABLE raw_secrets(secret TEXT); CREATE VIEW forbidden_view AS SELECT secret FROM raw_secrets; CREATE VIEW allowed_view AS SELECT record FROM policy; CREATE TRIGGER audit_policy AFTER INSERT ON audit BEGIN UPDATE policy SET record='{}'; END;");
    const policy = createSqlPolicy(); db.setAuthorizer(policy.authorize);
    for (const sql of ["UPDATE policy SET record='{}'", 'SELECT secret FROM raw_secrets', 'SELECT * FROM forbidden_view', 'SELECT * FROM allowed_view', "INSERT INTO audit VALUES('id','event','ref',1000)", 'DROP TABLE policy', "ATTACH ':memory:' AS other"]) assert.throws(() => db.exec(sql), /authorized|prohibited/);
  } finally { db.close(); }
});

test('non-allowlisted auth and workflow secret columns are denied', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec("ATTACH ':memory:' AS auth; ATTACH ':memory:' AS workflow; CREATE TABLE auth.sessions(digest TEXT,raw_token TEXT); CREATE TABLE workflow.proofs(raw_secret TEXT);");
    db.setAuthorizer(createSqlPolicy().authorize);
    for (const sql of ['SELECT raw_token FROM auth.sessions', 'SELECT raw_secret FROM workflow.proofs', 'UPDATE auth.sessions SET digest=\'x\'']) assert.throws(() => db.exec(sql), /authorized|prohibited/);
    assert.doesNotThrow(() => db.prepare('SELECT digest FROM auth.sessions').all());
  } finally { db.close(); }
});

test('DTO validators reject source fields in start and invalid snapshot item timestamps', () => {
  assert.throws(() => validateDto('start', { version: versions.start, wallet: context.wallet }), /DTO_KEYS/);
  assert.throws(() => validateDto('observations', {}), /DTO_KEYS/);
});

test('two real module processes pass local checks before exactly one consumes', { timeout: 10000 }, async t => {
  const f = fixture(t), a = f.start(), p = await f.preview(a);
  const workers = [0, 1].map(() => fork(new URL('./fixtures/binding-module-worker.mjs', import.meta.url), [], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] }));
  t.after(async () => {
    await Promise.all(workers.map(async child => { if (child.exitCode !== null) return; const exit = once(child, 'exit'); child.kill(); await exit; }));
  });
  const ready = workers.map(child => once(child, 'message'));
  for (const child of workers) child.send({ op: 'run', paths: f.paths, policy: f.policy, body: { version: versions.complete, attemptRef: a.attemptRef, confirmationDigest: p.confirmationDigest } });
  assert.deepEqual((await Promise.all(ready)).map(([m]) => m.phase), ['REMOTE_READY', 'REMOTE_READY']);
  const results = workers.map(child => once(child, 'message'));
  for (const child of workers) child.send({ op: 'respond' });
  const values = (await Promise.all(results)).map(([m]) => m);
  assert.deepEqual(values.map(r => r.ok).sort(), [false, true]);
  assert.match(values.find(r => !r.ok).reason, /ATTEMPT_INACTIVE/);
  assert.equal(f.sql('main', 'SELECT * FROM bindings').length, 1);
  assert.equal(f.sql('main', "SELECT event FROM audit WHERE event='CONSUMED'").length, 1);
});

test('COMMIT busy failure rolls back binding, CAS and audit together', { timeout: 10000 }, async t => {
  const f = fixture(t), a = f.start(), p = await f.preview(a);
  const reader = new DatabaseSync(f.paths.main);
  f.state.query = request => {
    reader.exec('BEGIN'); reader.prepare('SELECT id FROM attempts').all();
    return responseFor(request, f.policy, f.state.wall);
  };
  try {
    await assert.rejects(f.complete(a, p), /locked/);
  } finally { reader.exec('ROLLBACK'); reader.close(); }
  assert.equal(f.sql('main', 'SELECT status FROM attempts')[0].status, 'PENDING');
  assert.equal(f.sql('main', 'SELECT * FROM bindings').length, 0);
  assert.equal(f.sql('main', "SELECT event FROM audit WHERE event='CONSUMED'").length, 0);
});
