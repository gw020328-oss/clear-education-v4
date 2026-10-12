import { DatabaseSync } from 'node:sqlite';
import { closeSync, constants, lstatSync, mkdirSync, openSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { canonical, requireRule } from '../policy/values.mjs';

// A dedicated local, single-host database. No proof/key/signature blobs.
export function openStore(directory, config) {
  const root = resolve(directory);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const info = lstatSync(root);
  requireRule(info.isDirectory() && !info.isSymbolicLink() && info.uid === process.getuid()
    && (info.mode & 0o777) === 0o700 && realpathSync(root) === root, 'DB_DIRECTORY');
  const filename = join(root, 'applications.sqlite');
  try { closeSync(openSync(filename, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  const file = lstatSync(filename);
  requireRule(file.isFile() && !file.isSymbolicLink() && file.nlink === 1
    && file.uid === process.getuid() && (file.mode & 0o777) === 0o600, 'DB_FILE');
  const db = new DatabaseSync(filename, { timeout: 5000, allowExtension: false });
  const transaction = fn => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  try {
    db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA trusted_schema=OFF;');
    transaction(() => {
      db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
      const stored = db.prepare('SELECT config FROM metadata WHERE id=1').get();
      const encoded = canonical({ schemaVersion: 1, ...config });
      requireRule(!stored || stored.config === encoded, 'DB_ENVIRONMENT_MISMATCH');
      if (!stored) db.prepare('INSERT INTO metadata VALUES(1,?)').run(encoded);
    });
  } catch (error) { db.close(); throw error; }
  return { db, transaction, close: () => db.close() };
}
