import { DatabaseSync } from 'node:sqlite';
import { closeSync, constants, lstatSync, mkdirSync, openSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { canonical, requireRule } from '../policy/values.mjs';

export const applicationSchema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
export const bindingAuthoritySchema = `CREATE TABLE binding_authority(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL CHECK(revision>0),config_hash TEXT NOT NULL) STRICT;`;

// Dedicated local, single-host DB. No proofs, private keys or login signatures.
// Final contract authorization is retained to recover sponsor funding.
// Product binding challenges are public; only their signature hashes are kept.
export function openStore(directory, config, authority = null) {
  config = { proofSourceSigner: null, ...config };
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
  let encoded;
  try {
    db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA trusted_schema=OFF;');
    transaction(() => {
      encoded = canonical({ schemaVersion: authority ? 5 : 4, ...config });
      const hasMetadata = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name='metadata'").get();
      const prior = hasMetadata ? db.prepare('SELECT config FROM metadata WHERE id=1').get() : null;
      requireRule(hasMetadata ? !!prior : db.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().n === 0, 'DB_METADATA_MISSING');
      // Once migrated, a missing nonce table is data loss, not a new empty
      // store. Do not silently reset replay protection during startup.
      const version = prior ? JSON.parse(prior.config).schemaVersion : 0;
      requireRule([0, 1, 2, 3, 4, 5].includes(version), 'DB_ENVIRONMENT_MISMATCH');
      for (const name of version >= 4 ? ['proof_sessions', 'proof_results'] : version === 3 ? ['proof_sessions'] : []) {
        requireRule(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name=?").get(name), 'DB_SCHEMA_INCOMPLETE');
      }
      requireRule(version < 5 || authority, 'AUTHORITY_REQUIRED');
      if (version >= 5) {
        requireRule(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name='binding_authority'").get()
          && db.prepare('SELECT id FROM binding_authority WHERE id=1').get(), 'AUTHORITY_MISSING');
      }
      db.exec(applicationSchema);
      const stored = db.prepare('SELECT config FROM metadata WHERE id=1').get();
      const { proofSourceSigner, ...legacyConfig } = config;
      const previous = [1, 2, 3].map(schemaVersion => canonical({ schemaVersion, ...legacyConfig }));
      if (authority) previous.push(canonical({ schemaVersion: 4, ...config }));
      requireRule(!stored || stored.config === encoded || previous.includes(stored.config), 'DB_ENVIRONMENT_MISMATCH');
      if (authority) {
        const { revision, configHash, expectedRevision } = authority;
        requireRule(Number.isSafeInteger(revision) && revision > 0 && /^[a-f0-9]{64}$/.test(configHash), 'AUTHORITY_CONFIG');
        if (version < 5) {
          requireRule(revision === 1 && expectedRevision === 0, 'AUTHORITY_ACTIVATION');
          // A pre-existing unmarked table is drift, never an empty new authority.
          db.exec(bindingAuthoritySchema);
          db.prepare('INSERT INTO binding_authority VALUES(1,?,?)').run(revision, configHash);
        } else {
          const current = db.prepare('SELECT revision,config_hash FROM binding_authority WHERE id=1').get();
          if (current.revision !== revision || current.config_hash !== configHash) {
            requireRule(expectedRevision === current.revision && revision === current.revision + 1, 'AUTHORITY_CAS');
            requireRule(db.prepare('UPDATE binding_authority SET revision=?,config_hash=? WHERE id=1 AND revision=?')
              .run(revision, configHash, expectedRevision).changes === 1, 'AUTHORITY_CAS');
          }
        }
      }
      if (!stored) db.prepare('INSERT INTO metadata VALUES(1,?)').run(encoded);
      else if (stored.config !== encoded) db.prepare('UPDATE metadata SET config=? WHERE id=1').run(encoded);
    });
  } catch (error) { db.close(); throw error; }
  const assertAuthority = () => {
    requireRule(db.prepare('SELECT config FROM metadata WHERE id=1').get()?.config === encoded, 'AUTHORITY_STALE_WORKER');
    if (authority) {
      const current = db.prepare('SELECT revision,config_hash FROM binding_authority WHERE id=1').get();
      requireRule(current?.revision === authority.revision && current.config_hash === authority.configHash, 'AUTHORITY_STALE_WORKER');
    }
  };
  return { db, transaction, assertAuthority, bindingManifest: authority ? Object.freeze({
    path: filename, metadata: encoded, revision: authority.revision, configHash: authority.configHash,
  }) : null, close: () => db.close() };
}
