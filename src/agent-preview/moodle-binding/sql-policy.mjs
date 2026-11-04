import { constants as C, DatabaseSync } from 'node:sqlite';
import { columns, schemas } from './schema.mjs';
import { canonical, requireRule } from './contract.mjs';

const insertTables = new Set(['attempts', 'bindings', 'requests', 'audit', 'generations']);
const updates = { clock: ['floor'], generations: ['generation'], attempts: ['status', 'preview_digest', 'confirmation', 'binding_id'], bindings: ['status'], requests: ['state'] };
// Source is non-null for trigger/view expansion. This profile permits neither.
export function createSqlPolicy(profile = null) {
  const allowed = profile?.columns ?? columns;
  const expectedInventory = profile ? inventories(profile.schemas) : expected;
  let inspecting = false;
  return {
    authorize(action, table, column, schema, source) {
      if (source !== null) return C.SQLITE_DENY;
      if (inspecting && action === C.SQLITE_PRAGMA && table === 'journal_mode' && column === null) return C.SQLITE_OK;
      if ([C.SQLITE_SELECT, C.SQLITE_TRANSACTION].includes(action)) return C.SQLITE_OK;
      if (action === C.SQLITE_READ) {
        if (inspecting && (table === 'sqlite_master' || schema === 'temp' && table === 'sqlite_temp_master') && ['type', 'name', 'tbl_name', 'sql'].includes(column)
          && ['main', 'auth', 'workflow', 'temp'].includes(schema)) return C.SQLITE_OK;
        return allowed[schema]?.[table]?.includes(column) ? C.SQLITE_OK : C.SQLITE_DENY;
      }
      if (schema === 'main' && action === C.SQLITE_INSERT && insertTables.has(table)) return C.SQLITE_OK;
      if (schema === 'main' && action === C.SQLITE_UPDATE && updates[table]?.includes(column)) return C.SQLITE_OK;
      return C.SQLITE_DENY;
    },
    inspect(db) {
      inspecting = true;
      try {
        for (const name of ['main', 'auth', 'workflow', 'temp']) {
          requireRule(canonical(inventory(db, name)) === expectedInventory[name], 'SCHEMA_INVENTORY');
          if (name !== 'temp') requireRule(db.prepare(`PRAGMA ${name}.journal_mode`).get().journal_mode === 'delete', 'DB_JOURNAL');
        }
      } finally { inspecting = false; }
    },
  };
}
function inventory(db, schema) {
  return db.prepare(`SELECT type,name,tbl_name,sql FROM ${schema}.sqlite_master ORDER BY type,name`).all();
}
function inventories(definitions) {
  const result = {};
  for (const [name, ddl] of Object.entries(definitions)) {
    const db = new DatabaseSync(':memory:');
    try { db.exec(ddl); result[name] = canonical(inventory(db, 'main')); } finally { db.close(); }
  }
  result.temp = canonical([]);
  return result;
}
const expected = inventories(schemas);
