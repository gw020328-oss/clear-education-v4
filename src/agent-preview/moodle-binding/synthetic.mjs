import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, chmodSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { schemas } from './schema.mjs';
import { requireRule, hash } from './contract.mjs';

const controls = new WeakSet(), verifiers = new WeakSet();
export const isSyntheticControl = value => controls.has(value);
export const isSyntheticVerifier = value => verifiers.has(value);
export const installationVerifier = Object.freeze({ status: 'DISABLED', reason: 'MOODLE_AUTHORITY_INTAKE_REQUIRED' });
export function createSyntheticControlPlane(policy) {
  let state = { status: 'ACTIVE', policyHash: hash(policy) };
  const plane = Object.freeze({ current: () => ({ ...state }), replace: next => { state = { ...next }; } });
  controls.add(plane); return plane;
}
export function createSyntheticVerifier(respond) {
  requireRule(typeof respond === 'function', 'SYNTHETIC_VERIFIER');
  const verifier = Object.freeze({ query: (request, options) => respond(structuredClone(request), options) });
  verifiers.add(verifier); return verifier;
}
// Always creates new private temp files. Never migrates or accepts an existing DB.
export function createSyntheticEnvironment({ policy, sessions, applications, now }) {
  requireRule(policy.mode === 'SYNTHETIC_ONLY', 'SYNTHETIC_ONLY');
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'clear-binding-module-')));
  const paths = Object.fromEntries(['main', 'auth', 'workflow'].map(n => [n, join(directory, `${n}.sqlite`)]));
  const withDb = (name, fn) => {
    const db = new DatabaseSync(paths[name]);
    try { return fn(db); } finally { db.close(); }
  };
  try {
    for (const name of Object.keys(paths)) {
      withDb(name, db => db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;' + schemas[name]));
      chmodSync(paths[name], 0o600);
    }
    withDb('main', db => { db.prepare('INSERT INTO policy VALUES(1,?)').run(JSON.stringify(policy)); db.prepare('INSERT INTO clock VALUES(1,?)').run(now); });
    withDb('auth', db => {
      db.prepare("INSERT INTO metadata VALUES(1,?,'SYNTHETIC_ONLY')").run(policy.configHash);
      for (const s of sessions) db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(s.digest, s.wallet, s.issuedAt, s.expiresAt, s.revokedAt ?? null);
    });
    withDb('workflow', db => {
      db.exec("INSERT INTO metadata VALUES(1,'SYNTHETIC_ONLY')");
      for (const a of applications) db.prepare('INSERT INTO applications VALUES(?,?,?,?,?,?,?)').run(a.id, a.participantRef, a.wallet, a.courseRef, a.mappingHash, a.revision, a.status);
    });
  } catch (error) { rmSync(directory, { recursive: true, force: true }); throw error; }
  return { paths, directory, control: createSyntheticControlPlane(policy), dispose: () => rmSync(directory, { recursive: true, force: true }) };
}
