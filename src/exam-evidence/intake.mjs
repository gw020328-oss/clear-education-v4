import { DatabaseSync } from 'node:sqlite';
import { closeSync, constants, lstatSync, mkdirSync, openSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { canonical, hash, exactKeys, requireRule as check } from '../policy/values.mjs';
import { historyWindowCandidates, unresolvedHistoryCoverage } from '../ybm-collector/history-scope.mjs';

export const INTAKE_VERSION = 'clear-history-intake.1';
const id = v => check(typeof v === 'string' && /^[a-z][a-z0-9.-]{0,63}$/.test(v), 'INTAKE_ID');
const integer = (v, min, max) => check(Number.isSafeInteger(v) && v >= min && v <= max, 'INTAKE_NUMBER');
const time = v => integer(v, 0, 4102444800);
const copy = v => structuredClone(v);
const json = row => row ? JSON.parse(row.body) : null;
const tables = ['intake_meta', 'registrations', 'sessions', 'receipts', 'replays', 'tombstones'];
function validatePolicy(p) {
  exactKeys(p, ['policyVersion', 'consentVersion', 'baselineRequired', 'baselineWindow', 'baselineLagSeconds',
    'achievementFromSeconds', 'achievementUntilSeconds', 'acceptanceMaxAgeSeconds', 'sessionSeconds', 'retentionSeconds'], 'INTAKE_POLICY');
  id(p.policyVersion); id(p.consentVersion); check(typeof p.baselineRequired === 'boolean', 'INTAKE_POLICY');
  check(['CALENDAR_TWO_YEARS_CANDIDATE', 'SECONDS_730_CANDIDATE'].includes(p.baselineWindow), 'INTAKE_POLICY');
  integer(p.baselineLagSeconds, 1, 86400); integer(p.achievementFromSeconds, 0, 366 * 86400);
  integer(p.achievementUntilSeconds, p.achievementFromSeconds + 1, 400 * 86400);
  integer(p.acceptanceMaxAgeSeconds, 1, 1800); integer(p.sessionSeconds, 1, 1800);
  integer(p.retentionSeconds, Math.max(p.baselineLagSeconds, p.achievementUntilSeconds) + 1, 401 * 86400);
}

// Trusted local-service API, not an HTTP handler. Callers must supply approved
// pseudonymous binding/policy and a trusted verifier implementation at startup.
// No public acceptVerifiedResult/restore/import API and no funding dependency.
export function openHistoryIntake({ directory, instanceId, mode, verifierProfile, verifierConfigDigest, verify, clock = () => Math.floor(Date.now() / 1000) }) {
  id(instanceId); id(verifierProfile); check(['SYNTHETIC', 'LIVE_SOURCE'].includes(mode), 'INTAKE_MODE');
  check(typeof verify === 'function', 'INTAKE_VERIFIER');
  check(typeof verifierConfigDigest === 'string' && /^0x[0-9a-f]{64}$/.test(verifierConfigDigest), 'INTAKE_VERIFIER_CONFIG');
  const root = resolve(directory);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const ownerFile = (path, directory) => {
    const s = lstatSync(path);
    check(!s.isSymbolicLink() && s.uid === process.getuid() && (s.mode & 0o777) === (directory ? 0o700 : 0o600)
      && (directory ? s.isDirectory() && realpathSync(path) === path : s.isFile() && s.nlink === 1), 'INTAKE_STORAGE');
  };
  ownerFile(root, true);
  const filename = join(root, 'history-intake.sqlite');
  try { closeSync(openSync(filename, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)); }
  catch (e) { if (e.code !== 'EEXIST') throw new Error('INTAKE_STORAGE'); }
  ownerFile(filename, false);
  for (const suffix of ['-journal', '-wal', '-shm']) {
    try { ownerFile(filename + suffix, false); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  const db = new DatabaseSync(filename, { timeout: 5000, allowExtension: false });
  let replayKey, closed = false;
  const transaction = fn => {
    check(!closed, 'INTAKE_CLOSED'); db.exec('BEGIN IMMEDIATE');
    try { const r = fn(); db.exec('COMMIT'); return r; }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  };
  const now = () => { const t = clock(); time(t); return t; };
  const commitment = (domain, value) => createHmac('sha256', replayKey).update(domain + '\0' + canonical(value)).digest('hex');
  const getRegistration = applicationId => {
    id(applicationId);
    const row = db.prepare('SELECT body, pin FROM registrations WHERE id=?').get(applicationId);
    const r = json(row);
    check(!r || commitment('registration-record', r) === row.pin, 'INTAKE_RECORD_INTEGRITY');
    check(r, 'INTAKE_REGISTRATION_MISSING'); check(now() < r.deleteAt, 'INTAKE_RETENTION_EXPIRED'); return r;
  };
  const getSession = sessionId => {
    id(sessionId);
    const row = db.prepare('SELECT body, pin FROM sessions WHERE id=?').get(sessionId);
    const s = json(row);
    check(!s || commitment('session-record', s) === row.pin, 'INTAKE_RECORD_INTEGRITY');
    check(s, 'INTAKE_SESSION_MISSING'); return s;
  };
  const current = s => {
    const row = db.prepare('SELECT id FROM sessions WHERE application=? AND purpose=? ORDER BY revision DESC LIMIT 1').get(s.binding.applicationId, s.purpose);
    check(row?.id === s.sessionId, 'INTAKE_SUPERSEDED');
  };
  const receiptFor = sessionId => {
    const row = db.prepare('SELECT body, pin FROM receipts WHERE session=?').get(sessionId);
    if (!row) return null;
    const r = JSON.parse(row.body); check(commitment('receipt', r) === row.pin, 'INTAKE_RECEIPT_INTEGRITY'); return r;
  };
  try {
    db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON; PRAGMA trusted_schema=OFF;');
    transaction(() => {
      const present = db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map(r => r.name);
      check(present.length === 0 || (present.length === tables.length && tables.every(n => present.includes(n))), 'INTAKE_SCHEMA_INCOMPLETE');
      db.exec(`CREATE TABLE IF NOT EXISTS intake_meta(id INTEGER PRIMARY KEY CHECK(id=1), config TEXT NOT NULL, replay_key TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS registrations(id TEXT PRIMARY KEY, body TEXT NOT NULL, pin TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, application TEXT NOT NULL REFERENCES registrations(id), purpose TEXT NOT NULL, revision INTEGER NOT NULL, body TEXT NOT NULL, pin TEXT NOT NULL, UNIQUE(application,purpose,revision));
        CREATE TABLE IF NOT EXISTS receipts(session TEXT PRIMARY KEY REFERENCES sessions(id), body TEXT NOT NULL, pin TEXT NOT NULL, proof_commitment TEXT NOT NULL UNIQUE);
        CREATE TABLE IF NOT EXISTS replays(commitment TEXT PRIMARY KEY);
        CREATE TABLE IF NOT EXISTS tombstones(commitment TEXT PRIMARY KEY);`);
      const config = canonical({ version: INTAKE_VERSION, instanceId, mode, verifierProfile, verifierConfigDigest });
      const meta = db.prepare('SELECT * FROM intake_meta WHERE id=1').get();
      check(!present.length || meta, 'INTAKE_SCHEMA_INCOMPLETE');
      check(!meta || meta.config === config, 'INTAKE_ENVIRONMENT');
      if (!meta) db.prepare('INSERT INTO intake_meta VALUES(1,?,?)').run(config, randomBytes(32).toString('hex'));
      replayKey = Buffer.from(db.prepare('SELECT replay_key FROM intake_meta WHERE id=1').get().replay_key, 'hex');
      check(replayKey.length === 32, 'INTAKE_STORAGE');
      check(db.prepare('PRAGMA quick_check').get().quick_check === 'ok', 'INTAKE_STORAGE');
    });
  } catch (e) { db.close(); replayKey?.fill(0); throw e; }
  const purge = () => transaction(() => {
    let count = 0;
    for (const row of db.prepare('SELECT body, pin FROM registrations').all()) {
      const r = JSON.parse(row.body);
      check(commitment('registration-record', r) === row.pin, 'INTAKE_RECORD_INTEGRITY');
      if (now() < r.deleteAt) continue;
      db.prepare('INSERT OR IGNORE INTO tombstones VALUES(?)').run(commitment('registration', r.binding.applicationId));
      db.prepare('DELETE FROM receipts WHERE session IN (SELECT id FROM sessions WHERE application=?)').run(r.binding.applicationId);
      db.prepare('DELETE FROM sessions WHERE application=?').run(r.binding.applicationId);
      db.prepare('DELETE FROM registrations WHERE id=?').run(r.binding.applicationId); count++;
    }
    return count;
  });
  try { purge(); } catch (e) { db.close(); replayKey.fill(0); throw e; }
  return {
    register({ binding, policy }) {
      exactKeys(binding, ['applicationId', 'participantRef', 'recipientRef', 'bindingRevision'], 'INTAKE_BINDING');
      for (const k of ['applicationId', 'participantRef', 'recipientRef']) id(binding[k]);
      integer(binding.bindingRevision, 1, 2147483647); validatePolicy(policy);
      const input = copy({ binding, policy });
      return transaction(() => {
        check(!db.prepare('SELECT 1 FROM tombstones WHERE commitment=?').get(commitment('registration', binding.applicationId)), 'INTAKE_DELETED');
        const old = json(db.prepare('SELECT body FROM registrations WHERE id=?').get(binding.applicationId));
        if (old) {
          check(canonical(input) === canonical({ binding: old.binding, policy: old.policy }), 'INTAKE_REGISTRATION_CONFLICT');
          return getRegistration(binding.applicationId);
        }
        const registeredAt = now(), r = { ...input, version: INTAKE_VERSION, instanceId, mode, verifierProfile,
          registeredAt, registrationEvent: 'LOCAL_INTAKE_CONSENT', officialBoundary: 'OPEN',
          policyDigest: hash(policy), deleteAt: registeredAt + policy.retentionSeconds };
        time(r.deleteAt); db.prepare('INSERT INTO registrations VALUES(?,?,?)').run(binding.applicationId, canonical(r), commitment('registration-record', r)); return r;
      });
    },
    registration: applicationId => copy(getRegistration(applicationId)),
    openSession(applicationId, purpose, ownerAddress) {
      check(['BASELINE_HISTORY', 'ACHIEVEMENT'].includes(purpose), 'INTAKE_PURPOSE');
      check(typeof ownerAddress === 'string' && /^0x[0-9a-f]{40}$/.test(ownerAddress), 'INTAKE_OWNER');
      return transaction(() => {
        const r = getRegistration(applicationId), p = r.policy, t = now();
        check(t >= r.registeredAt, 'INTAKE_CLOCK');
        check(purpose !== 'BASELINE_HISTORY' || p.baselineRequired, 'INTAKE_BASELINE_NOT_REQUIRED');
        const windows = historyWindowCandidates(r.registeredAt);
        const period = purpose === 'BASELINE_HISTORY'
          ? { from: p.baselineWindow === 'CALENDAR_TWO_YEARS_CANDIDATE' ? windows.calendarFrom : windows.seconds730From, until: r.registeredAt }
          : { from: r.registeredAt + p.achievementFromSeconds, until: r.registeredAt + p.achievementUntilSeconds };
        const until = purpose === 'BASELINE_HISTORY' ? r.registeredAt + p.baselineLagSeconds : period.until;
        check(t < until && (purpose !== 'ACHIEVEMENT' || t >= period.from), 'INTAKE_COLLECTION_WINDOW');
        const revision = (db.prepare('SELECT MAX(revision) AS n FROM sessions WHERE application=? AND purpose=?').get(applicationId, purpose).n ?? 0) + 1;
        const context = { version: INTAKE_VERSION, instanceId, mode, verifierProfile, verifierConfigDigest, binding: r.binding, policyDigest: r.policyDigest,
          consentVersion: p.consentVersion, registeredAt: r.registeredAt, officialBoundary: 'OPEN', purpose,
          period: { ...period, boundaries: '[from,until)', timeZone: 'Asia/Seoul' }, revision,
          sessionId: 's-' + randomUUID(), nonce: randomBytes(32).toString('hex'), ownerAddress,
          createdAt: t, expiresAt: Math.min(t + p.sessionSeconds, until, r.deleteAt), deleteAt: r.deleteAt };
        const s = { ...context, contextDigest: hash(context), state: 'OPEN' };
        db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?)').run(s.sessionId, applicationId, purpose, revision, canonical(s), commitment('session-record', s)); return s;
      });
    },
    session: sessionId => { const s = getSession(sessionId); getRegistration(s.binding.applicationId); current(s); return copy(s); },
    cancel(sessionId) {
      return transaction(() => {
        const s = getSession(sessionId); getRegistration(s.binding.applicationId); current(s);
        check(s.state !== 'ACCEPTED', 'INTAKE_ALREADY_ACCEPTED');
        s.state = 'CANCELLED'; db.prepare('UPDATE sessions SET body=?, pin=? WHERE id=?').run(canonical(s), commitment('session-record', s), sessionId); return s;
      });
    },
    async accept(sessionId, proof, { signal } = {}) {
      signal?.throwIfAborted();
      // Bounded raw claim stays only in this invocation and the offline child.
      const encoded = canonical(proof); check(Buffer.byteLength(encoded) <= 2 * 1024 * 1024, 'INTAKE_PROOF_SIZE');
      const proofCommitment = commitment('proof', proof);
      const prepare = () => {
        const s = getSession(sessionId), r = getRegistration(s.binding.applicationId); current(s);
        const receipt = receiptFor(sessionId);
        if (receipt) {
          check(db.prepare('SELECT proof_commitment FROM receipts WHERE session=?').get(sessionId).proof_commitment === proofCommitment, 'INTAKE_REPLAY_CONFLICT');
          return { receipt };
        }
        check(s.state === 'OPEN', 'INTAKE_SESSION_CLOSED');
        check(now() >= s.createdAt && now() < s.expiresAt, 'INTAKE_EXPIRED'); return { s, r };
      };
      const initial = transaction(prepare); if (initial.receipt) return initial.receipt;
      let verified;
      try { verified = await verify(copy(proof), copy(initial.s), { signal }); }
      catch { throw new Error('INTAKE_VERIFICATION_FAILED'); }
      signal?.throwIfAborted();
      return transaction(() => {
        const ready = prepare(); if (ready.receipt) return ready.receipt;
        const { s, r } = ready, t = now();
        exactKeys(verified, ['contextDigest', 'collectedAt', 'proofVerified', 'wholeHistoryTableClaim', 'independentProcess', 'claimIdentifier'], 'INTAKE_VERIFIER_RESULT');
        check(verified.contextDigest === s.contextDigest && verified.independentProcess === true && verified.proofVerified === true
          && verified.wholeHistoryTableClaim === true, 'INTAKE_VERIFIER_RESULT');
        time(verified.collectedAt);
        check(verified.collectedAt >= s.createdAt && verified.collectedAt <= t && verified.collectedAt < s.expiresAt
          && t - verified.collectedAt <= r.policy.acceptanceMaxAgeSeconds, 'INTAKE_ACQUISITION_TIME');
        check(typeof verified.claimIdentifier === 'string' && /^0x[0-9a-f]{64}$/.test(verified.claimIdentifier), 'INTAKE_VERIFIER_RESULT');
        const replay = commitment('claim', verified.claimIdentifier);
        check(!db.prepare('SELECT 1 FROM replays WHERE commitment=?').get(replay), 'INTAKE_SOURCE_REUSE');
        const receipt = { version: INTAKE_VERSION, mode, sessionId, purpose: s.purpose, revision: s.revision,
          contextDigest: s.contextDigest, verifierProfile, collectedAt: verified.collectedAt, acceptedAt: t, deleteAt: r.deleteAt,
          proofVerified: mode === 'LIVE_SOURCE', wholeHistoryTableClaim: mode === 'LIVE_SOURCE',
          syntheticSignatureVerified: mode === 'SYNTHETIC', freshAtAcceptance: true,
          state: 'RECEIVED_UNVERIFIED_COVERAGE', ...unresolvedHistoryCoverage() };
        receipt.version = INTAKE_VERSION;
        db.prepare('INSERT INTO replays VALUES(?)').run(replay);
        db.prepare('INSERT INTO receipts VALUES(?,?,?,?)').run(sessionId, canonical(receipt), commitment('receipt', receipt), proofCommitment);
        s.state = 'ACCEPTED'; db.prepare('UPDATE sessions SET body=?, pin=? WHERE id=?').run(canonical(s), commitment('session-record', s), sessionId); return receipt;
      });
    },
    receipt(sessionId) { const s = getSession(sessionId); getRegistration(s.binding.applicationId); current(s); return copy(receiptFor(sessionId)); },
    purge,
    close() { if (!closed) { db.close(); closed = true; replayKey.fill(0); } },
  };
}
