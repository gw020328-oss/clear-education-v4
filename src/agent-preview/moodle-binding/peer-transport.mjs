// Prepared protocol implementation. Existing hosts never import/activate it.
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { chmodSync, lstatSync, existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import { canonical, exact, digest, hex, opaque, integer, requireRule as check } from './contract.mjs';

export const PEER_VERSION = 'clear-preview-peer.1';
export const PEER_FIELDS = Object.freeze(['version','kind','keyRef','sender','receiver','audience','deploymentEpoch',
  'method','path','requestRef','contextRef','sourceHash','proposalHash','bodyHash','issuedAt','expiresAtExclusive','requestHash','status']);
export const ZERO_HASH = '0'.repeat(64);
const DOMAIN = Buffer.from('CLEAR\0PREVIEW\0PEER\0HMAC-SHA256\0V1\0', 'ascii');
const MAX_BODY = 16384, MAX_WIRE = 32768;
const paths = new Set(['/observations','/v1/preview/prepare','/v1/preview/generate','/v1/preview/execute','/v1/preview/observation-result']);
const lifetime = path => path === '/v1/preview/generate' ? 45 : 5;
function metadata(m) {
  exact(m, PEER_FIELDS);
  check(m.version === PEER_VERSION && ['REQUEST','RESPONSE'].includes(m.kind), 'PEER_VERSION');
  for (const k of ['keyRef','sender','receiver','audience','deploymentEpoch','contextRef']) check(opaque(m[k]), 'PEER_REF');
  for (const k of ['requestRef','sourceHash','proposalHash','bodyHash','requestHash']) check(hex(m[k]), 'PEER_HASH');
  check(m.sender !== m.receiver && m.method === 'POST' && paths.has(m.path), 'PEER_ROUTE');
  const beforeDraft = m.path === '/v1/preview/prepare' || m.path === '/v1/preview/generate';
  check(beforeDraft || m.proposalHash !== ZERO_HASH, 'PEER_PROPOSAL_REQUIRED');
  check(integer(m.issuedAt) && m.issuedAt > 0 && integer(m.expiresAtExclusive)
    && m.expiresAtExclusive > m.issuedAt && m.expiresAtExclusive - m.issuedAt <= lifetime(m.path), 'PEER_TIME');
  check(m.kind === 'REQUEST' ? m.status === 0 && m.requestHash === ZERO_HASH : m.status === 200 && m.requestHash !== ZERO_HASH, 'PEER_KIND');
  return m;
}
// Protocol order above; each ASCII field has a uint32 BE byte-length prefix.
// Integers are unsigned shortest decimal strings, never locale/scientific notation.
export function peerSigningBytes(meta) {
  metadata(meta);
  return Buffer.concat([DOMAIN, ...PEER_FIELDS.flatMap(k => {
    const value = Buffer.from(String(meta[k]), 'ascii'), length = Buffer.alloc(4); length.writeUInt32BE(value.length);
    return [length, value];
  })]);
}
export function peerRequestHash(meta) { check(meta.kind === 'REQUEST', 'PEER_KIND'); return digest(peerSigningBytes(meta)); }
function secret(key) { check(Buffer.isBuffer(key) && key.length === 32, 'PEER_KEY'); return key; }
export function encodePeer(meta, body, key) {
  check(Buffer.isBuffer(body) && body.length <= MAX_BODY, 'PEER_SIZE');
  check(digest(body) === meta.bodyHash, 'PEER_BODY');
  const mac = createHmac('sha256', secret(key)).update(peerSigningBytes(meta)).digest('hex');
  return Buffer.from(canonical({ meta, body: body.toString('base64'), mac }), 'utf8');
}
export function decodePeer(wire, key) {
  check(Buffer.isBuffer(wire) && wire.length <= MAX_WIRE, 'PEER_SIZE');
  let text, value;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(wire); value = JSON.parse(text); }
  catch { throw Error('PEER_JSON'); }
  // Re-encoding rejects duplicate/escaped aliases, whitespace, exponent integers and extra members.
  check(canonical(value) === text, 'PEER_CANONICAL'); exact(value, ['meta','body','mac']); metadata(value.meta);
  check(typeof value.body === 'string' && value.body.length <= Math.ceil(MAX_BODY / 3) * 4 && hex(value.mac), 'PEER_BODY');
  const body = Buffer.from(value.body, 'base64');
  check(body.length <= MAX_BODY && body.toString('base64') === value.body && digest(body) === value.meta.bodyHash, 'PEER_BODY');
  const expected = createHmac('sha256', secret(key)).update(peerSigningBytes(value.meta)).digest();
  check(timingSafeEqual(expected, Buffer.from(value.mac, 'hex')), 'PEER_AUTH');
  return { meta: structuredClone(value.meta), body };
}
function window(meta, now, skew, completion = false) {
  metadata(meta);
  check(integer(now) && now > 0 && [0,1,2].includes(skew), 'PEER_CLOCK');
  check(meta.issuedAt <= now + skew && now - meta.issuedAt + skew < (completion ? lifetime(meta.path) : 5)
    && now < meta.expiresAtExclusive - skew, 'PEER_EXPIRED');
}
export function validatePeerPin(pin) {
  exact(pin, ['keyRef','sender','receiver','audience','deploymentEpoch','path','origin','maxClockSkewSeconds']);
  for (const k of ['keyRef','sender','receiver','audience','deploymentEpoch']) check(opaque(pin[k]), 'PEER_PIN');
  const u = new URL(pin.origin);
  check(pin.sender !== pin.receiver && paths.has(pin.path) && u.protocol === 'https:' && u.origin === pin.origin
    && !u.username && !u.password && [0,1,2].includes(pin.maxClockSkewSeconds), 'PEER_PIN');
  return Object.freeze({ ...pin });
}
function pinned(m, p, kind) {
  check(m.kind === kind, 'PEER_KIND');
  for (const k of ['keyRef','audience','deploymentEpoch','path']) check(m[k] === p[k], 'PEER_PIN');
  check(m.sender === (kind === 'REQUEST' ? p.sender : p.receiver)
    && m.receiver === (kind === 'REQUEST' ? p.receiver : p.sender), 'PEER_DIRECTION');
}
// Durable replay floor. Its loss/rollback requires a new deploymentEpoch AND new key;
// it is not a defense against restoring both trusted DB and clock from a backup.
export function createPeerReplayStore({ path, clock = () => Math.floor(Date.now() / 1000) }) {
  check(typeof path === 'string' && isAbsolute(path), 'PEER_STORE');
  const directory = lstatSync(dirname(path));
  check(directory.isDirectory() && !directory.isSymbolicLink() && realpathSync(dirname(path)) === dirname(path)
    && directory.uid === process.getuid() && (directory.mode & 0o777) === 0o700, 'PEER_STORE');
  if(existsSync(path)) {
    const existing = lstatSync(path);
    check(existing.isFile() && !existing.isSymbolicLink() && existing.nlink === 1
      && existing.uid === process.getuid() && (existing.mode & 0o777) === 0o600, 'PEER_STORE');
  }
  const db = new DatabaseSync(path, { timeout: 1000, allowExtension: false });
  try {
    const stat = lstatSync(path); check(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1, 'PEER_STORE');
    chmodSync(path, 0o600);
    db.exec(`PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS peer_floor(id INTEGER PRIMARY KEY CHECK(id=1),value INTEGER NOT NULL) STRICT;
      INSERT OR IGNORE INTO peer_floor VALUES(1,0);
      CREATE TABLE IF NOT EXISTS peer_seen(id TEXT PRIMARY KEY,expires INTEGER NOT NULL) STRICT;`);
  } catch(e) { db.close(); throw e; }
  return Object.freeze({
    claim(meta, skew) {
      db.exec('BEGIN EXCLUSIVE');
      try {
        const now = clock(); window(meta, now, skew);
        check(now >= db.prepare('SELECT value FROM peer_floor WHERE id=1').get().value, 'PEER_CLOCK_REVERSED');
        const id = digest(canonical([meta.kind,meta.keyRef,meta.sender,meta.receiver,meta.audience,meta.deploymentEpoch,meta.path,meta.requestRef]));
        db.prepare('DELETE FROM peer_seen WHERE expires < ?').run(now);
        check(db.prepare('INSERT OR IGNORE INTO peer_seen VALUES(?,?)').run(id, meta.expiresAtExclusive + 2).changes === 1, 'PEER_REPLAY');
        db.prepare('UPDATE peer_floor SET value=? WHERE id=1').run(now);
        db.exec('COMMIT');
        // Committed nonce stays spent if durable I/O crosses expiry.
        const final = clock(); check(final >= now, 'PEER_CLOCK_REVERSED'); window(meta, final, skew);
      } catch(e) { if(db.isTransaction) db.exec('ROLLBACK'); throw e; }
    },
    close() { db.close(); }
  });
}
export function acceptPeerRequest({ wire, key, pin, replay }) {
  const p = validatePeerPin(pin), request = decodePeer(wire, key); pinned(request.meta, p, 'REQUEST');
  replay.claim(request.meta, p.maxClockSkewSeconds);
  return request;
}
export function encodePeerResponse({ request, body, key, pin, now, expiresAtExclusive }) {
  const p = validatePeerPin(pin); pinned(request.meta, p, 'REQUEST');
  window(request.meta, now, p.maxClockSkewSeconds, true);
  const meta = { ...request.meta, kind: 'RESPONSE', sender: p.receiver, receiver: p.sender,
    bodyHash: digest(body), issuedAt: now, expiresAtExclusive: Math.min(request.meta.expiresAtExclusive, expiresAtExclusive),
    requestHash: peerRequestHash(request.meta), status: 200 };
  return encodePeer(meta, body, key);
}
async function bounded(response, signal) {
  check(response.ok && response.status === 200 && !response.redirected
    && response.headers.get('content-type') === 'application/json' && !response.headers.get('content-encoding'), 'PEER_HTTP');
  const length = response.headers.get('content-length'); check(length === null || /^\d+$/.test(length) && Number(length) <= MAX_WIRE, 'PEER_SIZE');
  check(response.body, 'PEER_HTTP'); const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    for (;;) { signal.throwIfAborted(); const { done, value } = await reader.read(); if(done) break;
      size += value.length; check(size <= MAX_WIRE, 'PEER_SIZE'); chunks.push(Buffer.from(value)); }
    return Buffer.concat(chunks);
  } finally { await reader.cancel().catch(() => {}); }
}
export function createPeerTransport({ pin, key, replay, clock = () => Math.floor(Date.now() / 1000),
  monotonic = () => performance.now(), timeoutMs, activation = 'DISABLED', fetchImpl }) {
  const p = validatePeerPin(pin), k = Buffer.from(secret(key));
  timeoutMs ??= lifetime(p.path) * 1000;
  check(integer(timeoutMs) && timeoutMs > 0 && timeoutMs <= lifetime(p.path) * 1000, 'PEER_TIMEOUT');
  // No ambient fetch, no activation by setting an environment variable. The current
  // candidate deliberately has no LIVE activation profile pending exact-contract review.
  check(['DISABLED','OFFLINE_TEST'].includes(activation) && (activation !== 'OFFLINE_TEST' || typeof fetchImpl === 'function'), 'PEER_ACTIVATION');
  let closed = false;
  const pending = new Set();
  return Object.freeze({
    async query(body, correlation, { signal } = {}) {
      check(!closed && activation === 'OFFLINE_TEST', 'PEER_DISABLED');
      exact(correlation, ['contextRef','sourceHash','proposalHash','expiresAtExclusive']);
      const now = clock(), start = monotonic();
      const meta = { version: PEER_VERSION, kind: 'REQUEST', keyRef: p.keyRef, sender: p.sender, receiver: p.receiver,
        audience: p.audience, deploymentEpoch: p.deploymentEpoch, method: 'POST', path: p.path,
        requestRef: randomBytes(32).toString('hex'), contextRef: correlation.contextRef, sourceHash: correlation.sourceHash,
        proposalHash: correlation.proposalHash, bodyHash: digest(body), issuedAt: now,
        expiresAtExclusive: Math.min(now + lifetime(p.path), correlation.expiresAtExclusive), requestHash: ZERO_HASH, status: 0 };
      window(meta, now, p.maxClockSkewSeconds);
      // A seconds-only clock can be anywhere within this second. Use its next
      // boundary so cancellation never gains the discarded fractional second.
      const remainingMs = (meta.expiresAtExclusive - now - p.maxClockSkewSeconds - 1) * 1000;
      const deadlineMono = start + Math.min(timeoutMs, remainingMs);
      const wire = encodePeer(meta, body, k), controller = new AbortController();
      const cancel = () => controller.abort(Error('PEER_ABORTED'));
      pending.add(controller);
      signal?.addEventListener('abort', cancel, { once: true });
      let timer;
      try {
        signal?.throwIfAborted();
        check(monotonic() < deadlineMono, 'PEER_TIMEOUT');
        const cancelled = new Promise((_, reject) => {
          controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true });
        });
        timer = setTimeout(() => controller.abort(Error('PEER_TIMEOUT')),
          Math.max(0, deadlineMono - monotonic()));
        const job = (async () => {
          const response = await fetchImpl(p.origin + p.path, { method: 'POST', redirect: 'error', cache: 'no-store',
            credentials: 'omit', headers: { 'content-type': 'application/json' }, body: wire, signal: controller.signal });
          if(response.url) check(response.url === p.origin + p.path, 'PEER_URL');
          return bounded(response, controller.signal);
        })();
        const bytes = await Promise.race([job, cancelled]);
        controller.signal.throwIfAborted(); check(!closed, 'PEER_CLOSED');
        const end = monotonic(); check(end >= start && end < deadlineMono, 'PEER_TIMEOUT');
        const result = decodePeer(bytes, k); pinned(result.meta, p, 'RESPONSE');
        for (const field of ['requestRef','contextRef','sourceHash','proposalHash']) check(result.meta[field] === meta[field], 'PEER_CORRELATION');
        check(result.meta.requestHash === peerRequestHash(meta) && result.meta.expiresAtExclusive <= meta.expiresAtExclusive
          && result.meta.issuedAt >= meta.issuedAt - p.maxClockSkewSeconds, 'PEER_CORRELATION');
        replay.claim(result.meta, p.maxClockSkewSeconds);
        window(meta, clock(), p.maxClockSkewSeconds, true);
        return result.body;
      } finally {
        clearTimeout(timer);
        pending.delete(controller);
        signal?.removeEventListener('abort', cancel);
        controller.abort();
      }
    },
    close() { closed = true; for(const controller of pending) controller.abort(Error('PEER_CLOSED')); k.fill(0); }
  });
}
