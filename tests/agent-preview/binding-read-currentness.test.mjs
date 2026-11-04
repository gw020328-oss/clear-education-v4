import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, statSync, readdirSync } from 'node:fs';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createBindingCurrentnessReader } from '../../src/agent-preview/moodle-binding/coordinator.mjs';
import { hash } from '../../src/agent-preview/moodle-binding/contract.mjs';
import { studentFixture } from './fixtures/binding-student-fixture.mjs';

const fingerprint = f => Object.fromEntries(Object.entries(f.paths).map(([name, path]) => [name, {
  sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
  mtime: statSync(path, { bigint: true }).mtimeNs,
  files: readdirSync(dirname(path)).sort(),
}]));

async function setup(t) {
  const f = await studentFixture(t), a = f.start(), preview = await f.preview(a), b = await f.complete(a, preview);
  const input = { applicationId: f.registry.applicationId, bindingRef: b.bindingRef, bindingRevision: b.bindingRevision };
  const time = { wall: 1000, mono: 1000, trusted: 1000, epoch: f.policy.issuerEpoch, hook: null, providerHook: null };
  const { verifier, ...config } = f.config;
  const options = { ...config, clock: { wall: () => { time.hook?.(); return time.wall; }, monotonic: () => time.mono },
    trustedTime: () => { time.providerHook?.(); return { issuerEpoch: time.epoch, wall: time.trusted }; } };
  const readers = [];
  t.after(() => { for (const reader of readers) reader.close(); });
  const open = (overrides = {}) => { const reader = createBindingCurrentnessReader({ ...options, ...overrides }); readers.push(reader); return reader; };
  f.state.query = () => { throw Error('SOURCE_QUERY_FORBIDDEN'); };
  return { f, input, time, options, open, advance(seconds) { time.wall += seconds; time.trusted += seconds; time.mono += seconds * 1000; } };
}

test('reader creation, repeated reads, rejected reads, close and reopen leave all DB bytes/mtime/files unchanged', async t => {
  const { f, input, open, advance } = await setup(t), before = fingerprint(f), reader = open();
  advance(2);
  const dto = reader.readStudent(f.context, input);
  assert.deepEqual(dto, { version: 'clear-moodle-binding-currentness.1', ...input,
    scope: { installationRef: f.registry.installationRef, courseRef: f.registry.courseRef, subjectRef: f.registry.subjectRef },
    currentness: 'LOCAL_BINDING_CURRENT', checkedAt: 1002, expiresAtExclusive: 1290 });
  assert.equal(Object.isFrozen(dto), true);
  assert.deepEqual(Object.keys(reader).sort(), ['close', 'mode', 'readStudent']);
  for (const value of [f.context.token, f.context.wallet, f.context.csrf]) assert.equal(JSON.stringify(dto).includes(value), false);
  assert.deepEqual(reader.readStudent(f.context, input), dto);
  assert.throws(() => reader.readStudent({ ...f.context, csrf: '0'.repeat(64) }, input), /CSRF/);
  assert.throws(() => reader.readStudent(f.context, { ...input, role: 'TEACHER' }), /DTO_KEYS/);
  reader.close(); assert.throws(() => reader.readStudent(f.context, input), /CLOSED/);
  assert.deepEqual(open().readStudent(f.context, input), dto);
  assert.deepEqual(fingerprint(f), before);
  assert.equal(f.sql('main', 'SELECT floor FROM clock')[0].floor, 1000);
});

test('owner student profile and independent trusted time are mandatory; there is no teacher port', async t => {
  const { f, input, open } = await setup(t), before = fingerprint(f);
  assert.throws(() => open({ trustedTime: undefined }), /TRUSTED_TIME_REQUIRED/);
  assert.throws(() => open({ projection: null }), /STUDENT_PROFILE_REQUIRED/);
  assert.throws(() => open({ trustedTime: () => Promise.resolve({ issuerEpoch: f.policy.issuerEpoch, wall: 1000 }) }), /DTO_KEYS/);
  const reader = open();
  assert.equal(reader.readTeacher, undefined);
  assert.throws(() => reader.readStudent({ ...f.context, wallet: f.bob.address }, input), /AUTH_REQUIRED/);
  assert.throws(() => reader.readStudent(f.context, { ...input, applicationId: '0x' + 'f'.repeat(64) }), /APPLICATION_SCOPE/);
  assert.throws(() => reader.readStudent(f.context, { ...input, bindingRef: 'f'.repeat(64) }), /BINDING_SCOPE/);
  assert.throws(() => reader.readStudent(f.context, { ...input, bindingRevision: input.bindingRevision + 1 }), /BINDING_REVISION/);
  assert.deepEqual(fingerprint(f), before);
});

test('another active session for the same student cannot borrow a binding', async t => {
  const { f, input, open } = await setup(t), reader = open(), second = await f.login(), before = fingerprint(f);
  assert.throws(() => reader.readStudent(second, input), /BINDING_SCOPE/);
  assert.ok(reader.readStudent(f.context, input));
  assert.deepEqual(fingerprint(f), before);
});

test('all authority databases remain shared-locked through the pre-commit sample, then accept owner revocation', async t => {
  const { f, input, open, time } = await setup(t), reader = open(), before = fingerprint(f);
  let samples = 0;
  time.hook = () => {
    if (++samples !== 2) return;
    for (const path of Object.values(f.paths)) {
      const writer = new DatabaseSync(path, { timeout: 0 });
      try { assert.throws(() => writer.exec('BEGIN EXCLUSIVE'), /database is locked/); }
      finally { if (writer.isTransaction) writer.exec('ROLLBACK'); writer.close(); }
    }
  };
  assert.ok(reader.readStudent(f.context, input));
  assert.equal(samples, 3);
  assert.deepEqual(fingerprint(f), before);
  time.hook = null;
  f.auth.logout(f.context);
  const revoked = fingerprint(f);
  assert.throws(() => reader.readStudent(f.context, input), /AUTH_REQUIRED/);
  assert.deepEqual(fingerprint(f), revoked);
});

for (const [label, edit, error] of [
  ['logout', f => f.auth.logout(f.context), /AUTH_REQUIRED/],
  ['session expiry', f => f.sql('auth', 'UPDATE sessions SET expires_at=1000 RETURNING digest'), /AUTH_REQUIRED/],
  ['binding revoked', f => f.sql('main', "UPDATE bindings SET status='REVOKED' RETURNING id"), /BINDING_INACTIVE/],
  ['binding expiry', f => f.sql('main', 'UPDATE bindings SET expires_at=1000 RETURNING id'), /BINDING_INACTIVE/],
  ['application revision', f => f.sql('workflow', 'UPDATE applications SET revision=revision+1 RETURNING id'), /BINDING_INACTIVE/],
  ['mapping binding revision', f => f.sql('workflow', 'UPDATE applications SET binding_revision=binding_revision+1 RETURNING id'), /APPLICATION_SCOPE/],
  ['policy disabled', f => f.sql('workflow', 'UPDATE policy_heads SET active=0 RETURNING id'), /POLICY_NOT_CURRENT/],
  ['acknowledgment revoked', f => f.sql('workflow', 'UPDATE applications SET ack_id=NULL RETURNING id'), /APPLICATION_SCOPE/],
  ['subject mapping changed', f => f.sql('main', "UPDATE bindings SET subject_ref='other-subject' RETURNING id"), /BINDING_SCOPE/],
  ['generation changed', f => f.sql('main', 'UPDATE generations SET generation=generation+1 RETURNING application_id'), /BINDING_REVISION/],
  ['authority ABA revision', f => {
    f.createAuth({ participants: [f.bob.address], bindingAuthority: { revision: 2, expectedRevision: 1 } });
    f.createAuth({ bindingAuthority: { revision: 3, expectedRevision: 2 } });
  }, /AUTHORITY_STALE_WORKER/],
]) {
  test(`next read rechecks ${label} and does not write on denial`, async t => {
    const { f, input, open } = await setup(t), reader = open();
    assert.ok(reader.readStudent(f.context, input));
    await edit(f); const before = fingerprint(f);
    assert.throws(() => reader.readStudent(f.context, input), error);
    assert.deepEqual(fingerprint(f), before);
  });
}

test('expiry is the minimum of binding, independent CLEAR session and policy; final boundary rejects', async t => {
  const { f, input, open, time } = await setup(t);
  f.sql('auth', 'UPDATE sessions SET expires_at=1001 RETURNING digest');
  const reader = open(), before = fingerprint(f);
  assert.equal(reader.readStudent(f.context, input).expiresAtExclusive, 1001);
  let samples = 0;
  time.providerHook = () => { if (++samples === 2) { time.wall = 1001; time.trusted = 1001; time.mono += 999; } };
  assert.throws(() => reader.readStudent(f.context, input), /FINAL_EXPIRED/);
  assert.deepEqual(fingerprint(f), before);
});

test('policy expiry is also included, even if an inconsistent stored binding is longer', async t => {
  const { f, input, open, advance } = await setup(t);
  // Synthetic fault injection: retain the current policy hash but make other
  // lifetimes longer to exercise the explicit policy minimum in the reader.
  f.sql('auth', 'UPDATE sessions SET expires_at=3000 RETURNING digest');
  f.sql('main', 'UPDATE bindings SET expires_at=3000 RETURNING id');
  const reader = open(), before = fingerprint(f);
  assert.equal(reader.readStudent(f.context, input).expiresAtExclusive, f.policy.validUntil);
  advance(1000);
  assert.throws(() => reader.readStudent(f.context, input), /CLOCK_OR_POLICY_EXPIRED/);
  assert.deepEqual(fingerprint(f), before);
});

for (const [label, change, error] of [
  ['stored floor is ahead', ({ f }) => f.sql('main', 'UPDATE clock SET floor=1001 RETURNING id'), /CLOCK_FLOOR/],
  ['local wall rollback', ({ time }) => { time.wall = 999; }, /CLOCK_FLOOR/],
  ['trusted wall rollback', ({ time }) => { time.trusted = 999; }, /CLOCK_FLOOR/],
  ['trusted epoch changed', ({ time }) => { time.epoch = 'restored-epoch'; }, /TRUSTED_TIME_SCOPE/],
  ['local/trusted time disagreement', ({ time }) => { time.wall = 1001; }, /TRUSTED_TIME_MISMATCH/],
  ['monotonic rollback', ({ time }) => { time.mono = 999; }, /CLOCK_REVERSED/],
  ['wall clock jump', ({ time }) => { time.wall = time.trusted = 1010; }, /CLOCK_JUMP/],
  ['frozen wall with elapsed monotonic', ({ time }) => { time.mono += 2000; }, /CLOCK_JUMP/],
]) {
  test(`${label} fails closed without advancing the DB floor`, async t => {
    const s = await setup(t), reader = s.open(); change(s); const before = fingerprint(s.f);
    assert.throws(() => reader.readStudent(s.f.context, s.input), error);
    s.time.wall = s.time.trusted = 1001; s.time.mono = 2000; s.time.epoch = s.f.policy.issuerEpoch;
    assert.throws(() => reader.readStudent(s.f.context, s.input), /READ_CLOCK_UNAVAILABLE/);
    assert.deepEqual(fingerprint(s.f), before);
  });
}

test('in-process high-water mark rejects rollback above persisted floor; reopen still needs fresh trusted time', async t => {
  const { f, input, open, advance, time } = await setup(t), reader = open(), before = fingerprint(f);
  advance(10); assert.ok(reader.readStudent(f.context, input));
  time.wall = time.trusted = 1009;
  assert.throws(() => reader.readStudent(f.context, input), /CLOCK_REVERSED/);
  reader.close();
  time.trusted = 1010;
  assert.throws(open, /TRUSTED_TIME_MISMATCH/);
  time.wall = 1010; assert.ok(open().readStudent(f.context, input));
  assert.deepEqual(fingerprint(f), before);
});

test('recovery drain/new epoch, DB-only policy drift and final deployment revocation are denied', async t => {
  const { f, input, open, time } = await setup(t), reader = open(), before = fingerprint(f);
  let samples = 0;
  time.hook = () => { if (++samples === 2) f.config.control.replace({ status: 'DRAINING', policyHash: hash(f.policy) }); };
  assert.throws(() => reader.readStudent(f.context, input), /STALE_WORKER/);
  time.hook = null;
  f.config.control.replace({ status: 'ACTIVE', policyHash: hash({ ...f.policy, issuerEpoch: 'restored-epoch' }) });
  assert.throws(() => reader.readStudent(f.context, input), /STALE_WORKER/);
  assert.throws(open, /POLICY_CHANGED/);
  assert.deepEqual(fingerprint(f), before);
});

test('slow final fence and schema drift refuse a result without reader writes', async t => {
  const { f, input, open, time } = await setup(t), reader = open(), before = fingerprint(f);
  let samples = 0;
  time.providerHook = () => { if (++samples === 2) { time.mono += 1000; time.wall = time.trusted = 1001; } };
  assert.throws(() => reader.readStudent(f.context, input), /RESPONSE_TIMEOUT/);
  assert.deepEqual(fingerprint(f), before);
  time.providerHook = null; time.wall = time.trusted = 1001;
  const fresh = open();
  f.sql('main', 'CREATE TABLE unexpected(id INTEGER)');
  const drifted = fingerprint(f);
  assert.throws(() => fresh.readStudent(f.context, input), /SCHEMA_INVENTORY/);
  assert.deepEqual(fingerprint(f), drifted);
});

for (const boundary of ['provider', 'file-check', 'commit']) {
  for (const delay of [250, 2000]) {
    test(`${boundary} latency ${delay}ms is charged before return; failure latches without writes`, async t => {
      const { f, input, open, time } = await setup(t);
      f.sql('auth', 'UPDATE sessions SET expires_at=1001 RETURNING digest');
      let providers = 0, armed = false, delayed = false, reading = false;
      const pause = () => {
        delayed = true; time.mono += delay;
        if (delay === 2000) { time.wall += 2; time.trusted += 2; }
      };
      const reader = open({ trustedTime: () => {
        const result = { issuerEpoch: time.epoch, wall: time.trusted };
        if (reading && ++providers === 2) {
          armed = true;
          if (boundary === 'provider') pause();
        }
        return result;
      } });
      reading = true;
      const before = fingerprint(f), originalPath = fs.realpathSync, originalExec = DatabaseSync.prototype.exec;
      if (boundary === 'file-check') {
        fs.realpathSync = (...args) => {
          const result = originalPath(...args);
          if (armed && !delayed) pause();
          return result;
        };
        syncBuiltinESMExports();
      }
      if (boundary === 'commit') DatabaseSync.prototype.exec = function(sql) {
        const result = originalExec.call(this, sql);
        if (sql === 'COMMIT' && armed && !delayed) pause();
        return result;
      };
      try {
        assert.throws(() => reader.readStudent(f.context, input), delay === 250 ? /FINAL_EXPIRED/ : /RESPONSE_TIMEOUT/);
        assert.equal(delayed, true);
        assert.throws(() => reader.readStudent(f.context, input), /READ_CLOCK_UNAVAILABLE/);
        assert.deepEqual(fingerprint(f), before);
      } finally {
        fs.realpathSync = originalPath; syncBuiltinESMExports(); DatabaseSync.prototype.exec = originalExec;
      }
    });
  }
}

test('successful return samples the pure local clock after provider, deployment file I/O and COMMIT', async t => {
  const { f, input, open, time } = await setup(t), events = [];
  const reader = open({
    trustedTime: () => { events.push('provider'); return { issuerEpoch: time.epoch, wall: time.trusted }; },
    clock: { wall: () => { events.push('wall'); return time.wall; }, monotonic: () => { events.push('mono'); return time.mono; } },
  });
  events.length = 0;
  const originalPath = fs.realpathSync, originalExec = DatabaseSync.prototype.exec;
  fs.realpathSync = (...args) => { events.push('file'); return originalPath(...args); };
  syncBuiltinESMExports();
  DatabaseSync.prototype.exec = function(sql) { events.push(sql); return originalExec.call(this, sql); };
  try {
    assert.ok(reader.readStudent(f.context, input));
    const commit = events.indexOf('COMMIT');
    assert.ok(commit > events.lastIndexOf('file') && commit > events.lastIndexOf('provider'));
    assert.deepEqual(events.slice(commit + 1), ['wall', 'mono']);
  } finally {
    fs.realpathSync = originalPath; syncBuiltinESMExports(); DatabaseSync.prototype.exec = originalExec;
  }
});
