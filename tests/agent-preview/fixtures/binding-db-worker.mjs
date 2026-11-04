// Synthetic SQLite mechanism experiment only. Never imported by product code.
import { DatabaseSync, constants as C } from 'node:sqlite';
import { join } from 'node:path';

const [root, kind] = process.argv.slice(2);
const db = new DatabaseSync(join(root, `${kind === 'coordinator' ? 'binding' : kind}.sqlite`), { timeout: 1000 });
db.exec('PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; PRAGMA synchronous=FULL;');
if (kind === 'coordinator') {
  db.prepare('ATTACH DATABASE ? AS auth').run(join(root, 'auth.sqlite'));
  db.prepare('ATTACH DATABASE ? AS workflow').run(join(root, 'workflow.sqlite'));
  // Read projection plus main-only mutation; reject schema/pragma/attach/functions.
  db.setAuthorizer((action, table, column, schema) => {
    if ([C.SQLITE_SELECT, C.SQLITE_TRANSACTION].includes(action)) return C.SQLITE_OK;
    if (action === C.SQLITE_READ && ['main', 'auth', 'workflow'].includes(schema)) return C.SQLITE_OK;
    if ([C.SQLITE_INSERT, C.SQLITE_UPDATE, C.SQLITE_DELETE].includes(action)
      && schema === 'main' && ['attempts', 'bindings', 'audit', 'policy'].includes(table)) return C.SQLITE_OK;
    return C.SQLITE_DENY;
  });
}
const check = (ok, reason) => { if (!ok) throw new Error(reason); };
const get = (sql, ...args) => db.prepare(sql).get(...args);
const run = (sql, ...args) => db.prepare(sql).run(...args);
function validate(id) {
  const a = get('SELECT * FROM main.attempts WHERE id=?', id);
  const s = get('SELECT * FROM auth.sessions WHERE digest=?', 'synthetic-session');
  const p = get('SELECT * FROM workflow.applications WHERE id=?', a.app);
  const policy = get('SELECT * FROM main.policy WHERE id=1');
  check(s.revoked_at === null, 'AUTH_REVOKED');
  check(p.status === 'ACTIVE' && p.wallet === s.wallet, 'APP_REVOKED');
  check(a.revision === policy.revision, 'STALE_REVISION');
  return a;
}
function complete({ id, fail = false, held = false }) {
  if (!held) db.exec('BEGIN IMMEDIATE');
  try {
    const a = validate(id);
    const result = run("UPDATE main.attempts SET state='CONSUMED' WHERE id=? AND state='PENDING' AND revision=?", id, a.revision);
    check(result.changes === 1, 'CAS_LOST');
    run("INSERT INTO main.bindings VALUES(?,?,?,?,'ACTIVE')", `binding-${id}`, id, a.app, a.subject);
    if (fail) throw new Error('INJECTED_BEFORE_AUDIT');
    run('INSERT INTO main.audit VALUES(?)', id);
    db.exec('COMMIT');
    return 'COMMITTED';
  } catch (e) { if (db.isTransaction) db.exec('ROLLBACK'); throw e; }
}
process.on('message', request => {
  try {
    let value;
    switch (request.op) {
      case 'precheck': value = validate(request.id).state; break;
      case 'hold': db.exec('BEGIN IMMEDIATE'); value = validate(request.id).state; break;
      case 'complete': value = complete(request); break;
      case 'revoke':
        db.exec(`PRAGMA busy_timeout=${request.noWait ? 0 : 1000}`);
        db.exec('BEGIN IMMEDIATE');
        try {
          if (kind === 'auth') db.exec('UPDATE sessions SET revoked_at=101');
          else if (kind === 'workflow') db.exec("UPDATE applications SET status='CLOSED'");
          else db.exec('UPDATE policy SET revision=revision+1');
          db.exec('COMMIT'); value = 'REVOKED';
        } catch (e) { if (db.isTransaction) db.exec('ROLLBACK'); throw e; }
        break;
      case 'forbiddenWrite': db.exec('UPDATE workflow.applications SET revision=2'); break;
      case 'forbiddenAuthWrite': db.exec('UPDATE auth.sessions SET revoked_at=999'); break;
      case 'forbiddenDdl': db.exec('DROP TABLE workflow.applications'); break;
      default: throw new Error('UNKNOWN_OPERATION');
    }
    process.send({ request: request.request, ok: true, value });
  } catch (e) { process.send({ request: request.request, ok: false, reason: e.message, sqliteCode: e.errcode ?? null }); }
});
process.on('disconnect', () => { db.close(); process.exit(0); });
process.send({ ready: true });
