import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { getAddress } from 'ethers';
import { AMOUNT, EvidenceError, canonical, need, validateAcceptance, validateEvidence, validateTrust } from './evidence.mjs';

// Separate valueless ledger, not a bank/PG connection. Direct CLI and library access
// share this same persistent state without needing the school, issuer or chain RPC.
export class CentralEscrow {
  constructor(path, trusted, { create = false } = {}) {
    this.trusted = structuredClone(validateTrust(trusted));
    this.engine = true;
    need(create || (path !== ':memory:' && existsSync(path)), 'CENTRAL_NOT_INITIALIZED');
    this.db = new DatabaseSync(path, { open: true });
    try {
      this.db.exec('PRAGMA busy_timeout=3000; PRAGMA foreign_keys=ON;');
      if (create) {
        this.db.exec(`CREATE TABLE IF NOT EXISTS config (id INTEGER PRIMARY KEY CHECK(id=1), manifest TEXT NOT NULL, treasury INTEGER NOT NULL CHECK(treasury>=0));
          CREATE TABLE IF NOT EXISTS enrollment (learner TEXT PRIMARY KEY, digest TEXT NOT NULL, acceptance TEXT NOT NULL, reserve INTEGER NOT NULL CHECK(reserve>=0), settled INTEGER NOT NULL DEFAULT 0);
          CREATE TABLE IF NOT EXISTS payment (learner TEXT PRIMARY KEY REFERENCES enrollment(learner), amount INTEGER NOT NULL);
          CREATE TABLE IF NOT EXISTS expired_return (learner TEXT PRIMARY KEY REFERENCES enrollment(learner), sponsor TEXT NOT NULL, amount INTEGER NOT NULL);`);
        this.db.prepare('INSERT OR IGNORE INTO config VALUES (1, ?, 0)').run(canonical(this.trusted));
      }
      need(this.db.prepare('SELECT manifest FROM config WHERE id=1').get()?.manifest === canonical(this.trusted), 'CENTRAL_CONFIG');
    } catch (e) { this.db.close(); throw e; }
  }
  transaction(action) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = action(); this.db.exec('COMMIT'); return result; }
    catch (e) { this.db.exec('ROLLBACK'); throw e instanceof EvidenceError ? e : new EvidenceError('CENTRAL_STORAGE'); }
  }
  fund(units) {
    need(typeof units === 'bigint' && units > 0n && units <= AMOUNT * 100n, 'CENTRAL_FUND_AMOUNT');
    this.transaction(() => {
      const treasury = this.db.prepare('SELECT treasury FROM config WHERE id=1').get().treasury;
      need(Number.isSafeInteger(treasury + Number(units)), 'CENTRAL_FUND_AMOUNT');
      this.db.prepare('UPDATE config SET treasury=treasury+? WHERE id=1').run(Number(units));
    });
  }
  enroll(acceptance, recipient, time) {
    const digest = validateAcceptance(acceptance, this.trusted, recipient, time, { registration: true });
    const learner = getAddress(recipient);
    return this.transaction(() => {
      need(!this.db.prepare('SELECT 1 FROM enrollment WHERE learner=?').get(learner), 'CENTRAL_ALREADY_ENROLLED');
      need(this.db.prepare('SELECT treasury FROM config WHERE id=1').get().treasury >= Number(AMOUNT), 'CENTRAL_RESERVE');
      this.db.prepare('UPDATE config SET treasury=treasury-? WHERE id=1').run(Number(AMOUNT));
      this.db.prepare('INSERT INTO enrollment VALUES (?, ?, ?, ?, 0)').run(learner, digest, canonical(acceptance), Number(AMOUNT));
      return { recipient: learner, depositUnits: AMOUNT.toString(), consentDigest: digest };
    });
  }
  claim(packet, recipient, time) {
    need(this.engine, 'CENTRAL_ENGINE_UNAVAILABLE');
    const checked = validateEvidence(packet, this.trusted, recipient, time);
    return this.transaction(() => {
      const row = this.db.prepare('SELECT * FROM enrollment WHERE learner=?').get(checked.recipient);
      need(row && row.settled === 0, 'CENTRAL_NOT_CLAIMABLE');
      need(row.digest === checked.consentDigest, 'CENTRAL_CONSENT');
      need(row.reserve === Number(AMOUNT), 'CENTRAL_RESERVE');
      this.db.prepare('UPDATE enrollment SET reserve=0, settled=1 WHERE learner=?').run(checked.recipient);
      this.db.prepare('INSERT INTO payment VALUES (?, ?)').run(checked.recipient, Number(AMOUNT));
      return { recipient: checked.recipient, paidUnits: AMOUNT.toString(), rail: 'valueless independent central ledger' };
    });
  }
  status(recipient) {
    const learner = getAddress(recipient);
    const row = this.db.prepare('SELECT reserve, settled FROM enrollment WHERE learner=?').get(learner);
    return { enrolled: Boolean(row), reserveUnits: String(row?.reserve ?? 0), settled: Boolean(row?.settled),
      paidUnits: String(this.db.prepare('SELECT amount FROM payment WHERE learner=?').get(learner)?.amount ?? 0) };
  }
  reclaimExpired(recipient, time) {
    need(this.engine, 'CENTRAL_ENGINE_UNAVAILABLE');
    need(Number.isSafeInteger(time) && time > this.trusted.terms.claimUntil, 'CENTRAL_NOT_EXPIRED');
    const learner = getAddress(recipient);
    return this.transaction(() => {
      const row = this.db.prepare('SELECT reserve, settled FROM enrollment WHERE learner=?').get(learner);
      need(row && row.settled === 0 && row.reserve === Number(AMOUNT), 'CENTRAL_NOT_CLAIMABLE');
      this.db.prepare('UPDATE enrollment SET reserve=0, settled=1 WHERE learner=?').run(learner);
      this.db.prepare('INSERT INTO expired_return VALUES (?, ?, ?)').run(learner, this.trusted.terms.sponsor, Number(AMOUNT));
      return { recipient: this.trusted.terms.sponsor, returnedUnits: AMOUNT.toString() };
    });
  }
  close() { this.db.close(); }
}
