// Cross-review of B 0ec25db's explicitly simplified experiment authorizer.
// This is a synthetic counterexample, not a claim about an implemented product.
import assert from 'node:assert/strict';
import { DatabaseSync, constants as C } from 'node:sqlite';
const db = new DatabaseSync(':memory:');
try {
  db.exec(`PRAGMA trusted_schema=OFF;
    CREATE TABLE policy(revision INTEGER);
    INSERT INTO policy VALUES(1);
    CREATE TABLE audit(attempt TEXT);
    CREATE TRIGGER audit_policy AFTER INSERT ON audit BEGIN
      UPDATE policy SET revision=revision+1;
    END;`);
  // Same callback policy as B's binding-db-worker.mjs, not a production gate.
  db.setAuthorizer((action, table, column, schema) => {
    if ([C.SQLITE_SELECT, C.SQLITE_TRANSACTION].includes(action)) return C.SQLITE_OK;
    if (action === C.SQLITE_READ && ['main', 'auth', 'workflow'].includes(schema)) return C.SQLITE_OK;
    if ([C.SQLITE_INSERT, C.SQLITE_UPDATE, C.SQLITE_DELETE].includes(action)
      && schema === 'main' && ['attempts', 'bindings', 'audit', 'policy'].includes(table)) return C.SQLITE_OK;
    return C.SQLITE_DENY;
  });
  db.prepare('INSERT INTO audit VALUES(?)').run('synthetic-attempt');
  assert.equal(db.prepare('SELECT revision FROM policy').get().revision, 2);
  console.log('REPRODUCED: accepted audit INSERT also mutates admin policy through trigger');
} finally {
  db.close();
}
