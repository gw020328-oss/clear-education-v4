import { createHash, randomBytes } from 'node:crypto';
import { getAddress, TypedDataEncoder, verifyMessage, verifyTypedData } from 'ethers';
import { compileSyntheticPolicy } from '../policy/compiler.mjs';
import { RuleError, canonical, exactKeys, freeze, hash, hash32, identifier, requireRule } from '../policy/values.mjs';
import { openStore } from './store.mjs';
import { createFundingService } from './funding.mjs';

const secret = () => randomBytes(32).toString('hex');
const digest = value => createHash('sha256').update(value).digest('hex');
const hexSecret = value => requireRule(typeof value === 'string' && /^[0-9a-f]{64}$/.test(value), 'AUTH_REQUIRED');
const id32 = () => '0x' + secret();
const signatureShape = value => requireRule(typeof value === 'string' && /^0x[0-9a-fA-F]{130}$/.test(value), 'SIGNATURE');
function address(value) {
  try { const a = getAddress(value); requireRule(!/^0x0{40}$/.test(a), 'ADDRESS'); return a; }
  catch { throw new RuleError('ADDRESS'); }
}
export const applicationTermsTypes = freeze({ ApplicationTermsV4: [
  { name: 'applicationId', type: 'bytes32' }, { name: 'learner', type: 'address' },
  { name: 'policyHash', type: 'bytes32' }, { name: 'origin', type: 'string' },
  { name: 'nonce', type: 'bytes32' }, { name: 'signedAt', type: 'uint256' }, { name: 'expiresAt', type: 'uint256' },
] });

export function createApplicationService({ directory, origin, chainId, instanceId, participants, operators, vaultReader, now = () => Math.floor(Date.now() / 1000) }) {
  const url = new URL(origin);
  requireRule(url.protocol === 'https:' && url.origin === origin && !url.username && !url.password, 'ORIGIN_CONFIG');
  requireRule(Number.isSafeInteger(chainId) && chainId > 0, 'CHAIN_CONFIG');
  hash32(instanceId, 'INSTANCE_CONFIG');
  const participantSet = new Set(participants.map(address)), operatorSet = new Set(operators.map(address));
  requireRule(operatorSet.size > 0 && ![...operatorSet].some(a => participantSet.has(a)), 'ROLE_CONFIG');
  const store = openStore(directory, { origin, chainId, instanceId, dataMode: 'SYNTHETIC', consentScope: 'APPLICATION_ONLY' });
  const { db, transaction } = store;
  const clock = () => { const t = now(); requireRule(Number.isSafeInteger(t) && t > 0 && t < 253402290000, 'CLOCK'); return t; };
  const role = wallet => operatorSet.has(wallet) ? 'operator' : participantSet.has(wallet) ? 'participant' : null;
  const domain = freeze({ name: 'ClearApplicationTerms', version: '4', chainId, salt: instanceId });
  const message = (wallet, nonce, issuedAt, expiresAt) => `${url.host} wants you to sign in with your Ethereum account:\n${wallet}\n\nSign in to CLEAR. This is not acceptance of refund terms.\n\nURI: ${origin}/auth\nVersion: 1\nChain ID: ${chainId}\nNonce: ${nonce}\nIssued At: ${new Date(issuedAt * 1000).toISOString()}\nExpiration Time: ${new Date(expiresAt * 1000).toISOString()}\nRequest ID: ${instanceId.slice(2)}`;
  function session(context, write = false) {
    exactKeys(context, ['token', 'wallet', 'chainId', 'csrf'], 'SESSION_CONTEXT');
    hexSecret(context.token);
    const s = db.prepare('SELECT * FROM sessions WHERE digest=?').get(digest(context.token)), t = clock();
    requireRule(s && s.revoked_at === null && s.issued_at <= t && t < s.expires_at && role(s.wallet), 'AUTH_REQUIRED');
    requireRule(context.chainId === chainId && address(context.wallet) === s.wallet, 'WALLET_CONTEXT_CHANGED');
    if (write) requireRule(context.csrf === digest('csrf:' + context.token), 'CSRF');
    return { ...s, role: role(s.wallet) };
  }
  function owned(applicationId, s, operatorRead = false) {
    hash32(applicationId, 'APPLICATION_ID');
    const a = db.prepare('SELECT * FROM applications WHERE id=?').get(applicationId);
    requireRule(a && (a.wallet === s.wallet || (operatorRead && s.role === 'operator')), 'APPLICATION_NOT_FOUND');
    return a;
  }
  function policy(hashValue) {
    hash32(hashValue, 'POLICY_HASH');
    const row = db.prepare('SELECT * FROM policies WHERE hash=?').get(hashValue);
    requireRule(row, 'POLICY_NOT_FOUND');
    const compiled = compileSyntheticPolicy(JSON.parse(row.draft));
    requireRule(compiled.policyHash === row.hash, 'POLICY_INTEGRITY');
    return compiled;
  }
  function currentPolicy(hashValue) {
    const p = policy(hashValue), current = db.prepare('SELECT policy_hash FROM courses WHERE id=?').get(p.policy.cohortId);
    requireRule(current?.policy_hash === hashValue, 'POLICY_SUPERSEDED');
    const t = BigInt(clock());
    requireRule(t >= BigInt(p.policy.enrollmentStart) && t <= BigInt(p.policy.enrollmentUntil), 'ENROLLMENT_CLOSED');
    return p;
  }
  const view = a => ({ applicationId: a.id, learner: a.wallet, policyHash: a.policy_hash, state: a.state,
    consentDigest: a.consent_digest, createdAt: String(a.created_at), consentedAt: a.consented_at === null ? null : String(a.consented_at),
    consentScope: 'APPLICATION_ONLY', contractConsentRequired: true, funded: false, paymentAllowed: false, dataMode: 'SYNTHETIC', ...funding.view(a) });
  function idempotent(s, route, key, body, fn) {
    identifier(key, 'IDEMPOTENCY_KEY');
    const bodyHash = hash(body), previous = db.prepare('SELECT * FROM idempotency WHERE actor=? AND route=? AND key=?').get(s.wallet, route, key);
    if (previous) {
      requireRule(previous.body_hash === bodyHash, 'IDEMPOTENCY_CONFLICT');
      return view(owned(previous.application_id, s));
    }
    const result = fn();
    db.prepare('INSERT INTO idempotency VALUES(?,?,?,?,?)').run(s.wallet, route, key, bodyHash, result.id);
    return view(result);
  }
  function terms(a, nonce, issuedAt, expiresAt) {
    return { domain: { ...domain }, types: structuredClone(applicationTermsTypes), primaryType: 'ApplicationTermsV4',
      message: { applicationId: a.id, learner: a.wallet, policyHash: a.policy_hash, origin,
        nonce: '0x' + nonce, signedAt: String(issuedAt), expiresAt: String(expiresAt) } };
  }
  const funding = createFundingService({ db, transaction, session, owned, policy, currentPolicy, clock, digest, secret,
    hexSecret, signatureShape, view, vaultReader, chainId, instanceId });
  return {
    ...funding.methods,
    origin, chainId, close: store.close,
    challenge(body) {
      exactKeys(body, ['wallet', 'chainId'], 'AUTH_SCHEMA');
      const wallet = address(body.wallet);
      requireRule(body.chainId === chainId, 'WRONG_CHAIN'); requireRule(role(wallet), 'NOT_INVITED');
      return transaction(() => {
        const t = clock();
        const pending = db.prepare('SELECT count(*) n FROM auth_nonces WHERE wallet=? AND consumed_at IS NULL AND expires_at>?').get(wallet, t).n;
        requireRule(pending < 10, 'AUTH_RATE_LIMIT');
        const nonce = secret(), browserToken = secret(), expiresAt = t + 300;
        db.prepare('INSERT INTO auth_nonces VALUES(?,?,?,?,?,NULL)').run(digest(nonce), wallet, digest(browserToken), t, expiresAt);
        return { nonce, message: message(wallet, nonce, t, expiresAt), browserToken, expiresAt };
      });
    },
    login(body, browserToken, previousToken = null) {
      exactKeys(body, ['nonce', 'signature'], 'AUTH_SCHEMA'); hexSecret(body.nonce); hexSecret(browserToken); signatureShape(body.signature);
      return transaction(() => {
        const n = db.prepare('SELECT * FROM auth_nonces WHERE digest=?').get(digest(body.nonce)), t = clock();
        requireRule(n && n.consumed_at === null && n.issued_at <= t && t < n.expires_at
          && n.browser_digest === digest(browserToken) && role(n.wallet), 'AUTH_CHALLENGE');
        let signer; try { signer = verifyMessage(message(n.wallet, body.nonce, n.issued_at, n.expires_at), body.signature); } catch { signer = null; }
        requireRule(signer === n.wallet, 'SIGNATURE');
        db.prepare('UPDATE auth_nonces SET consumed_at=? WHERE digest=? AND consumed_at IS NULL').run(t, digest(body.nonce));
        if (typeof previousToken === 'string' && /^[0-9a-f]{64}$/.test(previousToken)) db.prepare('UPDATE sessions SET revoked_at=? WHERE digest=?').run(t, digest(previousToken));
        const token = secret(); db.prepare('INSERT INTO sessions VALUES(?,?,?,?,NULL)').run(digest(token), n.wallet, t, t + 3600);
        return { token, wallet: n.wallet, role: role(n.wallet), csrf: digest('csrf:' + token), expiresAt: t + 3600 };
      });
    },
    whoami(context) {
      const s = session(context); return { wallet: s.wallet, role: s.role, csrf: digest('csrf:' + context.token), expiresAt: s.expires_at };
    },
    logout(context) { return transaction(() => { const s = session(context, true); db.prepare('UPDATE sessions SET revoked_at=? WHERE digest=?').run(clock(), s.digest); return { loggedOut: true }; }); },
    registerPolicy(context, draft) {
      return transaction(() => {
        requireRule(session(context, true).role === 'operator', 'FORBIDDEN');
        const p = compileSyntheticPolicy(draft), existing = db.prepare('SELECT hash FROM policies WHERE cohort_id=? AND version=?').get(p.policy.cohortId, p.policy.policyVersion);
        if (existing) { requireRule(existing.hash === p.policyHash, 'POLICY_VERSION_CONFLICT'); return p; }
        requireRule(!db.prepare('SELECT hash FROM runtime_configs WHERE cohort_id=?').get(p.policy.cohortId), 'COHORT_RUNTIME_FIXED');
        const active = db.prepare('SELECT p.version FROM courses c JOIN policies p ON p.hash=c.policy_hash WHERE c.id=?').get(p.policy.cohortId);
        requireRule(!active || BigInt(p.policy.policyVersion) > BigInt(active.version), 'POLICY_VERSION_ORDER');
        db.prepare('INSERT INTO policies VALUES(?,?,?,?)').run(p.policyHash, p.policy.cohortId, p.policy.policyVersion, canonical(draft));
        db.prepare('INSERT INTO courses VALUES(?,?) ON CONFLICT(id) DO UPDATE SET policy_hash=excluded.policy_hash').run(p.policy.cohortId, p.policyHash);
        return p;
      });
    },
    getPolicy(context, policyHash) { session(context); return policy(policyHash); },
    createApplication(context, body, key) {
      exactKeys(body, ['policyHash'], 'APPLICATION_SCHEMA');
      return transaction(() => {
        const s = session(context, true); requireRule(s.role === 'participant', 'FORBIDDEN');
        return idempotent(s, 'create-application', key, body, () => {
          currentPolicy(body.policyHash); const id = id32();
          db.prepare("INSERT INTO applications VALUES(?,?,?,'DRAFT',?,NULL,NULL)").run(id, s.wallet, body.policyHash, clock());
          return owned(id, s);
        });
      });
    },
    getApplication(context, id) { return view(owned(id, session(context), true)); },
    listApplications(context) {
      const s = session(context);
      // Bound response; callers resume with explicit IDs. No cross-user session data.
      const rows = s.role === 'operator' ? db.prepare('SELECT * FROM applications ORDER BY created_at,id LIMIT 100').all()
        : db.prepare('SELECT * FROM applications WHERE wallet=? ORDER BY created_at,id LIMIT 100').all(s.wallet);
      return rows.map(view);
    },
    consentChallenge(context, id) {
      return transaction(() => {
        const s = session(context, true), a = owned(id, s); requireRule(s.role === 'participant' && a.state === 'DRAFT', 'APPLICATION_STATE');
        currentPolicy(a.policy_hash); const t = clock(), nonce = secret();
        // Replace only this session's outstanding consent. A second browser cannot
        // silently consume a challenge issued to the first authenticated session.
        db.prepare('UPDATE consent_nonces SET consumed_at=? WHERE application_id=? AND session_digest=? AND consumed_at IS NULL').run(t, id, s.digest);
        db.prepare('INSERT INTO consent_nonces VALUES(?,?,?,?,?,NULL)').run(digest(nonce), id, s.digest, t, t + 600);
        return terms(a, nonce, t, t + 600);
      });
    },
    consent(context, id, body, key) {
      exactKeys(body, ['nonce', 'signature'], 'CONSENT_SCHEMA'); hexSecret(body.nonce); signatureShape(body.signature);
      return transaction(() => {
        const s = session(context, true), a = owned(id, s); requireRule(s.role === 'participant', 'FORBIDDEN');
        return idempotent(s, 'consent:' + id, key, body, () => {
          requireRule(a.state === 'DRAFT', 'APPLICATION_STATE'); currentPolicy(a.policy_hash);
          const n = db.prepare('SELECT * FROM consent_nonces WHERE digest=?').get(digest(body.nonce)), t = clock();
          requireRule(n && n.application_id === id && n.session_digest === s.digest && n.consumed_at === null
            && n.issued_at <= t && t < n.expires_at, 'CONSENT_CHALLENGE');
          const typed = terms(a, body.nonce, n.issued_at, n.expires_at);
          let signer; try { signer = verifyTypedData(typed.domain, typed.types, typed.message, body.signature); } catch { signer = null; }
          requireRule(signer === a.wallet, 'SIGNATURE');
          const consentDigest = TypedDataEncoder.hash(typed.domain, typed.types, typed.message);
          db.prepare('UPDATE consent_nonces SET consumed_at=? WHERE digest=?').run(t, digest(body.nonce));
          db.prepare("UPDATE applications SET state='TERMS_ACCEPTED',consent_digest=?,consented_at=? WHERE id=? AND state='DRAFT'").run(consentDigest, t, id);
          return owned(id, s);
        });
      });
    },
  };
}
