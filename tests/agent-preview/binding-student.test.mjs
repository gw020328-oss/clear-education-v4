import { createSyntheticStudentProjection } from '../../src/agent-preview/moodle-binding/student-profile.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createApplicationService } from '../../src/application/service.mjs';
import { createBindingCoordinator, versions } from '../../src/agent-preview/moodle-binding/index.mjs';
import { hash } from '../../src/agent-preview/moodle-binding/contract.mjs';
import { createSqlPolicy } from '../../src/agent-preview/moodle-binding/sql-policy.mjs';
import { studentProfile } from '../../src/agent-preview/moodle-binding/projection-profiles.mjs';
import { studentHttpExamplePolicies } from '../../specs/m3/student-http-example.mjs';
import { studentFixture } from './fixtures/binding-student-fixture.mjs';

const fingerprint = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const unconsumed = f => {
  assert.equal(f.sql('main', 'SELECT status FROM attempts')[0].status, 'PENDING');
  assert.equal(f.sql('main', 'SELECT * FROM bindings').length, 0);
  assert.equal(f.sql('main', "SELECT * FROM audit WHERE event='CONSUMED'").length, 0);
};

test('C1 original databases: complete/read/reopen with no source database writes', async t => {
  const f = await studentFixture(t), before = [fingerprint(f.paths.auth), fingerprint(f.paths.workflow)];
  const a = f.start(), p = await f.preview(a), b = await f.complete(a, p);
  assert.equal(b.status, 'OBSERVED_ONLY');
  assert.equal((await f.runtime.readPreview(f.context, f.registry.applicationId, b.bindingRef)).paymentAllowed, false);
  assert.deepEqual([fingerprint(f.paths.auth), fingerprint(f.paths.workflow)], before);
  f.reopen(); assert.equal(f.runtime.bindingStatus(f.context, f.registry.applicationId).bindingRef, b.bindingRef);
  await assert.rejects(f.complete(a, p), /ATTEMPT_INACTIVE/);
  assert.equal(f.auth.whoami(f.context).wallet, f.alice.address);
  assert.equal(f.student.get(f.context, f.registry.applicationId).state, 'ACKNOWLEDGED_SYNTHETIC');
  assert.ok(!JSON.stringify(f.sql('main', 'SELECT * FROM attempts')).includes(f.context.token));
});

test('DRAFT is not bindable; explicit acknowledgment permits a new attempt', async t => {
  const f = await studentFixture(t, { acknowledged: false });
  assert.throws(f.start, /APPLICATION_SCOPE/); assert.equal(f.sql('main', 'SELECT * FROM attempts').length, 0);
  f.acknowledge(); assert.ok(f.start().attemptRef);
});

for (const [label, mutate, error] of [
  ['logout', f => f.auth.logout(f.context), /AUTH_REQUIRED/],
  ['relogin', f => f.login(f.auth, f.context.token), /AUTH_REQUIRED/],
  ['application revision', f => f.sql('workflow', 'UPDATE applications SET revision=revision+1 RETURNING id'), /ATTEMPT_STALE/],
  ['binding revision alone', f => f.sql('workflow', 'UPDATE applications SET binding_revision=binding_revision+1 RETURNING id'), /APPLICATION_SCOPE/],
  ['acknowledgment cleared', f => f.sql('workflow', 'UPDATE applications SET ack_id=NULL RETURNING id'), /APPLICATION_SCOPE/],
  ['policy head disabled', f => f.sql('workflow', 'UPDATE policy_heads SET active=0 RETURNING id'), /POLICY_NOT_CURRENT/],
  ['policy head revision changed', f => f.sql('workflow', 'UPDATE policy_heads SET revision=revision+1 RETURNING id'), /POLICY_NOT_CURRENT/],
  ['policy replaced by owner service', f => f.replaceStudent(studentHttpExamplePolicies(2)), /POLICY_NOT_CURRENT/],
]) {
  test(`${label} during source call prevents consume atomically`, async t => {
    const f = await studentFixture(t), a = f.start(), p = await f.preview(a);
    f.state.query = async request => { await mutate(f); return f.respond(request); };
    await assert.rejects(f.complete(a, p), error); unconsumed(f);
  });
}

test('disable and reenable the same policy during source I/O cannot revive old approval', async t => {
  const f = await studentFixture(t), a = f.start(), p = await f.preview(a);
  f.replaceStudent(studentHttpExamplePolicies());
  assert.equal(f.sql('workflow', 'SELECT binding_revision FROM applications')[0].binding_revision, 1);
  f.state.query = request => {
    f.replaceStudent([]); f.replaceStudent(studentHttpExamplePolicies());
    return f.respond(request);
  };
  await assert.rejects(f.complete(a, p), /APPLICATION_SCOPE/); unconsumed(f);
  assert.equal(f.sql('workflow', 'SELECT binding_revision FROM applications')[0].binding_revision, 3);
  assert.equal(f.student.get(f.context, f.registry.applicationId).state, 'ACKNOWLEDGED_SYNTHETIC');
  assert.throws(f.start, /APPLICATION_SCOPE/);
});

test('policy selection and fresh acknowledgment cannot reuse old approved mapping/confirmation', async t => {
  const f = await studentFixture(t), a = f.start(), p = await f.preview(a);
  f.replaceStudent(studentHttpExamplePolicies(2));
  const next = f.student.policies(f.context).policies[0];
  f.student.selectPolicy(f.context, f.registry.applicationId, { expectedRevision: 2, policyHash: next.policyHash }, 'select-next');
  assert.throws(f.start, /APPLICATION_SCOPE/);
  f.acknowledge('ack-next');
  await assert.rejects(f.complete(a, p), /APPLICATION_SCOPE/); assert.throws(f.start, /APPLICATION_SCOPE/); unconsumed(f);
  // Explicit new synthetic approval is necessary; the student action never builds a registry.
  const projection = createSyntheticStudentProjection({ authentication: f.auth.moodleBindingManifest(), student: f.student.moodleBindingManifest(),
    registry: { ...f.registry, policyHash: next.policyHash, policyRevision: next.policyRevision, bindingRevision: 2 } });
  const policy = { ...f.policy, mappingHash: projection.mappingHash, rosterRevision: 2 };
  f.sql('main', 'UPDATE policy SET record=? WHERE id=1 RETURNING id', [JSON.stringify(policy)]);
  f.config.control.replace({ status: 'ACTIVE', policyHash: hash(policy) });
  Object.assign(f.policy, policy);
  const runtime = createBindingCoordinator({ ...f.config, projection }); t.after(() => runtime.close());
  await assert.rejects(runtime.complete(f.context, f.registry.applicationId, { version: versions.complete, attemptRef: a.attemptRef, confirmationDigest: p.confirmationDigest }), /ATTEMPT_STALE/);
  const fresh = runtime.start(f.context, f.registry.applicationId, { version: versions.start });
  const shown = await runtime.preview(f.context, f.registry.applicationId, { version: versions.preview, attemptRef: fresh.attemptRef });
  assert.notEqual(shown.confirmationDigest, p.confirmationDigest);
  assert.equal((await runtime.complete(f.context, f.registry.applicationId, { version: versions.complete, attemptRef: fresh.attemptRef, confirmationDigest: shown.confirmationDigest })).status, 'OBSERVED_ONLY');
});

test('authority activation CAS fences old auth and coordinator workers, including A→B→A', async t => {
  const f = await studentFixture(t), a = f.start(), p = await f.preview(a);
  assert.throws(() => f.createAuth({ participants: [f.bob.address] }), /AUTHORITY_CAS/);
  assert.throws(() => f.createAuth({ bindingAuthority: null }), /AUTHORITY_REQUIRED/);
  f.state.query = request => {
    f.createAuth({ participants: [f.bob.address], bindingAuthority: { revision: 2, expectedRevision: 1 } });
    return f.respond(request);
  };
  await assert.rejects(f.complete(a, p), /AUTHORITY_STALE_WORKER/); unconsumed(f);
  assert.throws(() => f.auth.whoami(f.context), /AUTHORITY_STALE_WORKER/);
  const fresh = f.createAuth({ bindingAuthority: { revision: 3, expectedRevision: 2 } });
  assert.equal(fresh.whoami(f.context).wallet, f.alice.address);
  assert.throws(f.start, /AUTHORITY_STALE_WORKER/);
  assert.throws(() => f.createAuth({ bindingAuthority: { revision: 1 } }), /AUTHORITY_CAS/);
  assert.equal(f.sql('auth', 'SELECT revision FROM binding_authority')[0].revision, 3);
});

test('missing persisted authority is data loss, not automatic reset', async t => {
  const f = await studentFixture(t);
  f.sql('auth', 'DELETE FROM binding_authority RETURNING id');
  assert.throws(() => createApplicationService(f.authConfig), /AUTHORITY_MISSING/);
  assert.throws(f.start, /AUTHORITY_STALE_WORKER/);
});

test('only owner manifests, explicit synthetic registry and exact source paths are accepted', async t => {
  const f = await studentFixture(t), args = { authentication: f.auth.moodleBindingManifest(), student: f.student.moodleBindingManifest(), registry: f.registry };
  assert.throws(() => createSyntheticStudentProjection({ ...args, authentication: structuredClone(args.authentication) }), /PRODUCT_MANIFEST/);
  assert.throws(() => createSyntheticStudentProjection({ ...args, registry: { ...f.registry, mode: 'LIVE' } }), /SYNTHETIC_ONLY/);
  assert.throws(() => createSyntheticStudentProjection({ ...args, registry: { ...f.registry, wallet: f.bob.address.toLowerCase() } }), /REGISTRY_ROLE/);
  assert.throws(() => createBindingCoordinator({ ...f.config, projection: { kind: 'C1_STUDENT_SYNTHETIC' } }), /PRODUCT_PROFILE/);
  assert.throws(() => createBindingCoordinator({ ...f.config, projection: null }), /SCHEMA_INVENTORY/);
  assert.throws(() => createBindingCoordinator({ ...f.config, paths: { ...f.paths, auth: f.paths.workflow } }), /PRODUCT_PATH/);
  assert.throws(() => f.runtime.start({ ...f.context, wallet: f.bob.address }, f.registry.applicationId, { version: versions.start }), /AUTH_REQUIRED/);
});

test('product SQL profile denies raw proof/policy/ack data, source writes and trigger drift', async t => {
  const f = await studentFixture(t), db = new DatabaseSync(f.paths.main);
  db.prepare('ATTACH DATABASE ? AS auth').run(f.paths.auth); db.prepare('ATTACH DATABASE ? AS workflow').run(f.paths.workflow);
  const guard = createSqlPolicy(studentProfile(f.projection)); db.setAuthorizer(guard.authorize); guard.inspect(db);
  for (const sql of ['SELECT draft FROM auth.policies', 'SELECT record FROM workflow.policies', 'SELECT record FROM workflow.acknowledgments', 'SELECT * FROM auth.proof_results',
    'UPDATE auth.sessions SET revoked_at=1000', 'DELETE FROM workflow.applications']) assert.throws(() => db.prepare(sql), /prohibited|authorized/);
  db.close();
  const source = new DatabaseSync(f.paths.workflow); source.exec('CREATE VIEW unexpected AS SELECT record FROM acknowledgments'); source.close();
  assert.throws(f.start, /SCHEMA_INVENTORY/); assert.equal(f.sql('main', 'SELECT * FROM attempts').length, 0);
});

async function startWriter(t, f) {
  const worker = fork(new URL('./fixtures/binding-student-writer.mjs', import.meta.url), { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  t.after(() => { if (worker.exitCode === null) worker.kill(); });
  const exit = once(worker, 'exit');
  let ready, done, blocked = false;
  const held = new Promise(resolve => { ready = resolve; });
  const result = new Promise(resolve => { done = resolve; });
  worker.on('message', message => { if (message.event === 'auth-blocked') blocked = true; else if (message.event === 'workflow-held') ready(); else if (message.event === 'done') done(message.result); });
  const preview = f.student.acknowledgments(f.context, f.registry.applicationId)[0].payload.preview;
  const { now, ...authConfig } = f.authConfig;
  worker.send({ authConfig, directory: f.studentConfig.directory, context: f.context, applicationId: f.registry.applicationId,
    body: { expectedRevision: preview.expectedRevision, previewHash: preview.previewHash, acknowledgement: 'SYNTHETIC_ACK_ONLY' } });
  await Promise.race([held, result.then(error => { throw Error('WRITER_NOT_READY: ' + error); })]);
  return { result, exit, get blocked() { return blocked; } };
}

for (const holdAuth of [false, true]) {
  test(`opposite writer/coordinator locks: ${holdAuth ? 'both time out and roll back' : 'coordinator times out, writer completes'}, then fresh retry works`, { timeout: 15000 }, async t => {
    const f = await studentFixture(t), a = f.start(), p = await f.preview(a);
    const before = f.sql('workflow', 'SELECT * FROM commands ORDER BY id');
    let writer, blocker;
    t.after(() => { if (blocker) { blocker.exec('ROLLBACK'); blocker.close(); } });
    f.state.query = async request => {
      writer = await startWriter(t, f);
      if (holdAuth) { blocker = new DatabaseSync(f.paths.auth); blocker.exec('BEGIN EXCLUSIVE'); }
      return f.respond(request);
    };
    await assert.rejects(f.complete(a, p), /database is locked/);
    const result = await writer.result; await writer.exit; assert.equal(writer.blocked, true);
    if (holdAuth) { assert.match(result, /database is locked/); blocker.exec('ROLLBACK'); blocker.close(); blocker = null; }
    else assert.equal(result, 'COMMITTED');
    unconsumed(f); assert.deepEqual(f.sql('workflow', 'SELECT * FROM commands ORDER BY id'), before);
    f.state.query = null;
    assert.equal((await f.complete(a, p)).status, 'OBSERVED_ONLY');
  });
}
