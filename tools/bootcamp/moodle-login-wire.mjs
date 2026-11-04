import {createHash, createHmac, randomBytes} from 'node:crypto';
import {request as httpsRequest} from 'node:https';
import {exactKeys, requireRule as check} from '../../src/policy/values.mjs';

const authorityPath = '/local/clearbridge/login_authority.php';
const operations = ['start', 'status', 'end', 'finish'];
const grantKeys = ['ownerRunId', 'role', 'installationRef', 'courseRef', 'subjectRef', 'actorRef', 'sessionRef', 'expiresAtExclusive'];
const correlationKeys = ['version', 'requestRef', 'moodleAuthorityRef', 'intentRef', 'status'];
const digest = raw => createHash('sha256').update(raw).digest('hex');
const hmac = (key, parts) => createHmac('sha256', key).update(parts.join('\n')).digest('hex');
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const wallSeconds = () => Math.floor(Date.now() / 1000);

export function createMoodleLoginProofs(proofKey) {
  check(hex(proofKey), 'MOODLE_LOGIN_PROOF_KEY');
  const key = Buffer.from(proofKey, 'utf8');
  return Object.freeze({
    deriveBrowserProof({ownerRunId, intentRef, launchCode, challenge}) {
      return hmac(key, ['CLEAR-MOODLE-LOGIN-BROWSER-PROOF-1', ownerRunId, intentRef, launchCode, challenge]);
    },
    deriveFinishProof({ownerRunId, intentRef, launchCode}) {
      return hmac(key, ['CLEAR-MOODLE-LOGIN-FINISH-PROOF-1', ownerRunId, intentRef, launchCode]);
    },
    close() { key.fill(0); },
  });
}

function parseLoginJson(raw) {
  const text = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(raw);
  const value = JSON.parse(text);
  check(JSON.stringify(value) === text, 'MOODLE_LOGIN_JSON');
  return value;
}

export async function readLoginJson(req) {
  check(req.headers['content-type'] === 'application/json' && !req.headers['content-encoding'], 'MOODLE_LOGIN_JSON');
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    check(size <= 4096, 'MOODLE_LOGIN_JSON');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks);
  return {raw, value: parseLoginJson(raw)};
}

export function protectLoginResponse(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

export function createMoodleLoginAuthority({moodleOrigin, reverseKey, ca, connectionPort = 19468, signal: ownerSignal,
  now = wallSeconds, monotonic = () => performance.now()}) {
  const moodle = new URL(moodleOrigin);
  check(moodle.origin === moodleOrigin && moodle.hostname === '127.0.0.1'
    && ['http:', 'https:'].includes(moodle.protocol) && moodle.port
    && hex(reverseKey) && ca && Number.isInteger(connectionPort)
    && connectionPort >= 1024 && connectionPort <= 65535, 'MOODLE_LOGIN_AUTHORITY_CONFIG');
  const key = Buffer.from(reverseKey, 'utf8'), pending = new Set(), certificateAuthority = Buffer.from(ca);
  let closed = false;
  return Object.freeze({
    async verify(envelope, {signal} = {}) {
      exactKeys(envelope, ['operation', 'request'], 'MOODLE_LOGIN_AUTHORITY_REQUEST');
      const {operation, request} = envelope;
      check(operations.includes(operation), 'MOODLE_LOGIN_AUTHORITY_REQUEST');
      const combined = AbortSignal.any([signal, ownerSignal].filter(Boolean));
      const start = now(), mono = monotonic(), current = () => {
        combined.throwIfAborted();
        const wall = now(), elapsed = monotonic() - mono;
        check(!closed && wall >= start && wall < request.expiresAtExclusive && elapsed >= 0 && elapsed < 5000,
          'MOODLE_LOGIN_AUTHORITY_EXPIRED');
        return wall;
      };
      current();
      const raw = Buffer.from(JSON.stringify(envelope)), nonce = randomBytes(16).toString('hex'), stamp = String(start);
      const mac = hmac(key, ['CLEAR-MOODLE-AUTHORITY-A-TO-C-1', stamp, nonce, 'POST', authorityPath, digest(raw)]);
      const reply = await new Promise((resolve, reject) => {
        let settled = false, timer;
        function finish(value) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          pending.delete(abort);
          combined.removeEventListener('abort', abort);
          if (value) resolve(value);
          else { outgoing.destroy(); reject(Error('MOODLE_LOGIN_AUTHORITY_UNAVAILABLE')); }
        }
        const abort = () => finish(null);
        const outgoing = httpsRequest({hostname: '127.0.0.1', port: connectionPort, path: authorityPath, method: 'POST',
          agent: false, ca: certificateAuthority, rejectUnauthorized: true, minVersion: 'TLSv1.2', headers: {
            Host: moodle.host, 'Content-Type': 'application/json', 'Content-Length': raw.length,
            'X-Clear-Timestamp': stamp, 'X-Clear-Nonce': nonce, 'X-Clear-Signature': mac,
          }}, incoming => {
          if (incoming.statusCode !== 200 || incoming.headers.location !== undefined || incoming.headers['set-cookie'] !== undefined
              || incoming.headers['content-encoding'] !== undefined
              || !/^application\/json(?:;\s*charset=utf-8)?$/i.test(incoming.headers['content-type'] ?? '')) return abort();
          const chunks = [];
          let size = 0;
          incoming.on('data', chunk => { size += chunk.length; if (size > 4096) abort(); else chunks.push(chunk); });
          incoming.on('error', abort);
          incoming.on('aborted', abort);
          incoming.on('end', () => finish(Buffer.concat(chunks)));
        });
        pending.add(abort);
        outgoing.on('error', abort);
        combined.addEventListener('abort', abort, {once: true});
        timer = setTimeout(abort, Math.min(5000, (request.expiresAtExclusive - start) * 1000));
        if (combined.aborted) abort(); else outgoing.end(raw);
      });
      const result = parseLoginJson(reply);
      exactKeys(result, [...grantKeys, ...correlationKeys], 'MOODLE_LOGIN_AUTHORITY_RESPONSE');
      check(result.version === 'clear-moodle-login-authority-result.1' && result.status === 'OK'
        && ['requestRef', 'ownerRunId', 'moodleAuthorityRef', 'role'].every(field => result[field] === request[field])
        && result.intentRef === (request.intentRef ?? null)
        && Number.isSafeInteger(result.expiresAtExclusive) && current() < result.expiresAtExclusive,
        'MOODLE_LOGIN_AUTHORITY_RESPONSE');
      return Object.fromEntries(grantKeys.map(field => [field, result[field]]));
    },
    close() { closed = true; for (const abort of pending) abort(); key.fill(0); },
  });
}
