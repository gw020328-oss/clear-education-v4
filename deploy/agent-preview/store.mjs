import {DatabaseSync} from 'node:sqlite';
import {mkdirSync, chmodSync} from 'node:fs';
import {dirname} from 'node:path';
import {check} from './config.mjs';

export function openStore(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), {recursive:true, mode:0o700});
  const db = new DatabaseSync(path);
  if (path !== ':memory:') chmodSync(path, 0o600);
  db.exec(`PRAGMA busy_timeout=1000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;
    CREATE TABLE IF NOT EXISTS nonces(nonce TEXT PRIMARY KEY, expires INTEGER NOT NULL) STRICT;
    CREATE TABLE IF NOT EXISTS approvals(ref TEXT PRIMARY KEY, body_hash TEXT NOT NULL, binding_hash TEXT NOT NULL,
      expires INTEGER NOT NULL, consumed INTEGER NOT NULL DEFAULT 0) STRICT;`);
  return {
    register({ref, bodyHash, bindingHash, expires}, now=Date.now()) {
      check(/^[a-zA-Z0-9_-]{8,80}$/.test(ref) && /^[a-f0-9]{64}$/.test(bodyHash)
        && /^[a-f0-9]{64}$/.test(bindingHash) && Number.isSafeInteger(expires)
        && expires > now && expires <= now + 3600000, 'APPROVAL_INVALID');
      db.prepare('INSERT INTO approvals(ref,body_hash,binding_hash,expires) VALUES(?,?,?,?)').run(ref,bodyHash,bindingHash,expires);
    },
    consume(ref, bodyHash, binding, clock=Date.now) {
      // Acquire both write/commit locks before observing the authorization clock.
      // No pre-lock timestamp may authorize a request after a busy wait.
      db.exec('BEGIN EXCLUSIVE');
      let grant;
      try {
        const now=clock();
        check(Number.isSafeInteger(now),'APPROVAL_CLOCK');
        grant=db.prepare('UPDATE approvals SET consumed=1 WHERE ref=? AND body_hash=? AND binding_hash=? AND expires>? AND consumed=0 RETURNING expires')
          .get(ref,bodyHash,binding,now);
        check(grant,'APPROVAL_REQUIRED_OR_SPENT');
        db.exec('COMMIT');
      } catch(e) {if(db.isTransaction)db.exec('ROLLBACK');throw e;}
      // Slow durable commit cannot extend the approval. If this fails, keep spent.
      check(grant.expires>clock(),'APPROVAL_EXPIRED');
      return Object.freeze({expires:grant.expires});
    },
    nonce(nonce, now) {
      db.prepare('DELETE FROM nonces WHERE expires < ?').run(now);
      try { db.prepare('INSERT INTO nonces VALUES(?,?)').run(nonce, now+125000); }
      catch { throw Error('REQUEST_REPLAY'); }
    },
    close() {db.close();}
  };
}
