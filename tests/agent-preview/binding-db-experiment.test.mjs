// Isolated mechanism evidence, not an implementation/acceptance test of binding.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

function fixture(t, attempts = [['a', 'app-a', 'subject-a']]) {
  const root = mkdtempSync(join(tmpdir(), 'clear-binding-synthetic-'));
  function init(name, sql) {
    const db = new DatabaseSync(join(root, `${name}.sqlite`));
    db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;' + sql);
    db.close();
  }
  init('auth', `CREATE TABLE sessions(digest TEXT PRIMARY KEY,wallet TEXT,revoked_at INTEGER) STRICT;
    INSERT INTO sessions VALUES('synthetic-session','synthetic-wallet',NULL);`);
  init('workflow', `CREATE TABLE applications(id TEXT PRIMARY KEY,wallet TEXT,status TEXT,revision INTEGER) STRICT;
    INSERT INTO applications VALUES('app-a','synthetic-wallet','ACTIVE',1),('app-b','synthetic-wallet','ACTIVE',1);`);
  init('binding', `CREATE TABLE policy(id INTEGER PRIMARY KEY,revision INTEGER) STRICT;
    INSERT INTO policy VALUES(1,1);
    CREATE TABLE attempts(id TEXT PRIMARY KEY,app TEXT,subject TEXT,state TEXT,revision INTEGER) STRICT;
    CREATE TABLE bindings(id TEXT PRIMARY KEY,attempt TEXT NOT NULL UNIQUE REFERENCES attempts(id),
      app TEXT NOT NULL,subject TEXT NOT NULL,status TEXT NOT NULL) STRICT;
    CREATE UNIQUE INDEX one_app ON bindings(app) WHERE status='ACTIVE';
    CREATE UNIQUE INDEX one_subject ON bindings(subject) WHERE status='ACTIVE';
    CREATE TABLE audit(attempt TEXT PRIMARY KEY REFERENCES attempts(id)) STRICT;`);
  const seed = new DatabaseSync(join(root, 'binding.sqlite'));
  for (const a of attempts) seed.prepare("INSERT INTO attempts VALUES(?,?,?,'PENDING',1)").run(...a);
  seed.close();
  const children = [];
  t.after(async () => {
    await Promise.all(children.map(async child => {
      if (child.exitCode !== null) return;
      const ended = once(child, 'exit');
      child.kill('SIGKILL');
      await ended;
    }));
    rmSync(root, { recursive: true, force: true });
  });
  const query = sql => {
    const db = new DatabaseSync(join(root, 'binding.sqlite'));
    try { return db.prepare(sql).all().map(row => ({ ...row })); } finally { db.close(); }
  };
  const fingerprint = name => createHash('sha256').update(readFileSync(join(root, `${name}.sqlite`))).digest('hex');
  async function worker(kind = 'coordinator') {
    const child = fork(new URL('./fixtures/binding-db-worker.mjs', import.meta.url), [root, kind], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
    children.push(child);
    const [ready] = await once(child, 'message');
    assert.equal(ready.ready, true);
    let sequence = 0;
    return request => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timeout = setTimeout(() => { cleanup(); reject(new Error('WORKER_TIMEOUT')); }, 5000);
      const onExit = () => { cleanup(); reject(new Error('WORKER_EXIT')); };
      const onMessage = message => { if (message.request === id) { cleanup(); resolve(message); } };
      function cleanup() { clearTimeout(timeout); child.off('message', onMessage); child.off('exit', onExit); }
      child.on('message', onMessage); child.once('exit', onExit); child.send({ ...request, request: id });
    });
  }
  return { worker, query, fingerprint };
}
const count = (f, table) => f.query(`SELECT count(*) AS n FROM ${table}`)[0].n;

test('attached BEGIN IMMEDIATE fences auth, workflow and local registry writers until binding commit', { timeout: 15000 }, async t => {
  const f = fixture(t), before = [f.fingerprint('auth'), f.fingerprint('workflow')];
  const [binding, auth, workflow, registry] = await Promise.all([f.worker(), f.worker('auth'), f.worker('workflow'), f.worker('binding')]);
  assert.equal((await binding({ op: 'hold', id: 'a' })).value, 'PENDING');
  for (const writer of [auth, workflow, registry]) {
    const blocked = await writer({ op: 'revoke', noWait: true });
    assert.equal(blocked.ok, false); assert.equal(blocked.sqliteCode, 5); // SQLITE_BUSY, actual attempted write.
  }
  assert.equal((await binding({ op: 'complete', id: 'a', held: true })).value, 'COMMITTED');
  assert.deepEqual([f.fingerprint('auth'), f.fingerprint('workflow')], before);
  assert.equal((await auth({ op: 'revoke' })).value, 'REVOKED');
  assert.equal((await workflow({ op: 'revoke' })).value, 'REVOKED');
  assert.equal((await registry({ op: 'revoke' })).value, 'REVOKED');
  assert.equal((await binding({ op: 'precheck', id: 'a' })).reason, 'AUTH_REVOKED');
  assert.equal(count(f, 'bindings'), 1); assert.equal(count(f, 'audit'), 1);
});

for (const [kind, reason] of [['auth', 'AUTH_REVOKED'], ['workflow', 'APP_REVOKED'], ['binding', 'STALE_REVISION']]) {
  test(`${kind} revocation between precheck and final transaction rejects consumption`, { timeout: 10000 }, async t => {
    const f = fixture(t), [binding, writer] = await Promise.all([f.worker(), f.worker(kind)]);
    assert.equal((await binding({ op: 'precheck', id: 'a' })).value, 'PENDING');
    assert.equal((await writer({ op: 'revoke' })).value, 'REVOKED');
    assert.equal((await binding({ op: 'complete', id: 'a' })).reason, reason);
    assert.equal(count(f, 'bindings'), 0); assert.equal(count(f, 'audit'), 0);
    assert.equal(f.query('SELECT state FROM attempts')[0].state, 'PENDING');
  });
}

test('two independent processes both pass precheck; exactly one consumes persistent CAS', { timeout: 10000 }, async t => {
  const f = fixture(t), [a, b] = await Promise.all([f.worker(), f.worker()]);
  for (const w of [a, b]) assert.equal((await w({ op: 'precheck', id: 'a' })).value, 'PENDING');
  const results = await Promise.all([a({ op: 'complete', id: 'a' }), b({ op: 'complete', id: 'a' })]);
  assert.deepEqual(results.map(r => r.ok).sort(), [false, true]);
  assert.equal(results.find(r => !r.ok).reason, 'CAS_LOST');
  assert.equal(count(f, 'bindings'), 1); assert.equal(count(f, 'audit'), 1);
  const reopened = await f.worker();
  assert.equal((await reopened({ op: 'complete', id: 'a' })).reason, 'CAS_LOST');
});

for (const [constraint, second] of [['application', ['b', 'app-a', 'subject-b']], ['subject', ['b', 'app-b', 'subject-a']]]) {
  test(`different attempts racing on active ${constraint} uniqueness roll loser CAS back`, { timeout: 10000 }, async t => {
    const f = fixture(t, [['a', 'app-a', 'subject-a'], second]), [a, b] = await Promise.all([f.worker(), f.worker()]);
    assert.equal((await a({ op: 'precheck', id: 'a' })).ok, true);
    assert.equal((await b({ op: 'precheck', id: 'b' })).ok, true);
    const results = await Promise.all([a({ op: 'complete', id: 'a' }), b({ op: 'complete', id: 'b' })]);
    assert.deepEqual(results.map(r => r.ok).sort(), [false, true]);
    assert.match(results.find(r => !r.ok).reason, /UNIQUE constraint failed/);
    assert.deepEqual(f.query('SELECT state FROM attempts ORDER BY state').map(r => r.state), ['CONSUMED', 'PENDING']);
    assert.equal(count(f, 'bindings'), 1); assert.equal(count(f, 'audit'), 1);
  });
}

test('failure after CAS and insert leaves no binding, consumption or audit', { timeout: 10000 }, async t => {
  const f = fixture(t), w = await f.worker();
  assert.equal((await w({ op: 'complete', id: 'a', fail: true })).reason, 'INJECTED_BEFORE_AUDIT');
  assert.equal(f.query('SELECT state FROM attempts')[0].state, 'PENDING');
  assert.equal(count(f, 'bindings'), 0); assert.equal(count(f, 'audit'), 0);
});

test('coordinator authorizer rejects attached DB writes and DDL without changing their bytes', { timeout: 10000 }, async t => {
  const f = fixture(t), before = [f.fingerprint('auth'), f.fingerprint('workflow')], w = await f.worker();
  for (const op of ['forbiddenWrite', 'forbiddenAuthWrite', 'forbiddenDdl']) {
    const result = await w({ op }); assert.equal(result.ok, false); assert.equal(result.sqliteCode, 23);
  }
  assert.deepEqual([f.fingerprint('auth'), f.fingerprint('workflow')], before);
});
