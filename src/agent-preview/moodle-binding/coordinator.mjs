import { DatabaseSync } from 'node:sqlite';
import { lstatSync, realpathSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { canonical, exact, hash, digest, hex, opaque, integer, requireRule, validateDto, versions, confirmationDigest, stableConfirmation } from './contract.mjs';
import { validateTimePolicy, sample, checkCurrentness } from './currentness.mjs';
import { createSqlPolicy } from './sql-policy.mjs';
import { isSyntheticControl, isSyntheticVerifier } from './synthetic.mjs';

const randomRef = () => randomBytes(32).toString('hex');
const policyKeys = ['mode', 'status', 'issuerEpoch', 'authorityRevision', 'rosterRevision', 'trustEpoch', 'configHash', 'mappingHash', 'participantRef', 'wallet', 'installationRef', 'courseRef', 'audience', 'expectedSubjectRef', 'validUntil', 'timePolicyHash', 'chainId', 'targets'];
function validatePolicy(p) {
  exact(p, policyKeys);
  requireRule(p.mode === 'SYNTHETIC_ONLY' && p.status === 'ACTIVE', 'POLICY_DISABLED');
  for (const k of ['authorityRevision', 'rosterRevision', 'trustEpoch', 'validUntil', 'chainId']) requireRule(integer(p[k]) && p[k] > 0, 'POLICY_REVISION');
  for (const k of ['issuerEpoch', 'participantRef', 'installationRef', 'courseRef', 'audience', 'expectedSubjectRef']) requireRule(opaque(p[k]), 'POLICY_REF');
  for (const k of ['configHash', 'mappingHash', 'timePolicyHash']) requireRule(hex(p[k]), 'POLICY_HASH');
  requireRule(/^0x[a-f0-9]{40}$/.test(p.wallet), 'POLICY_WALLET');
  requireRule(Array.isArray(p.targets) && p.targets.length > 0 && p.targets.length <= 16 && p.targets.every(opaque) && new Set(p.targets).size === p.targets.length, 'POLICY_TARGETS');
  return p;
}
function checkFile(path) {
  requireRule(typeof path === 'string' && realpathSync(path) === path, 'DB_PATH');
  const f = lstatSync(path), d = lstatSync(dirname(path));
  requireRule(f.isFile() && !f.isSymbolicLink() && f.nlink === 1 && f.uid === process.getuid() && (f.mode & 0o777) === 0o600
    && d.isDirectory() && !d.isSymbolicLink() && d.uid === process.getuid() && (d.mode & 0o777) === 0o700, 'DB_PERMISSIONS');
  return { dev: f.dev, ino: f.ino };
}

export function createBindingCoordinator({ paths, control, verifier, timePolicy, clock, sessionKey }) {
  requireRule(isSyntheticControl(control) && isSyntheticVerifier(verifier), 'INSTALLATION_DISABLED');
  exact(paths, ['main', 'auth', 'workflow']);
  requireRule(new Set(Object.values(paths)).size === 3, 'DB_PATH');
  requireRule(Buffer.isBuffer(sessionKey) && sessionKey.length === 32, 'SESSION_KEY');
  const key = Buffer.from(sessionKey), ptime = validateTimePolicy(timePolicy), files = {};
  for (const [name, path] of Object.entries(paths)) files[name] = checkFile(path);
  const boot = control.current();
  requireRule(boot.status === 'ACTIVE' && hex(boot.policyHash), 'DEPLOYMENT_DISABLED');
  const db = new DatabaseSync(paths.main, { timeout: 1000, allowExtension: false });
  const sqlPolicy = createSqlPolicy();
  try {
    db.exec('PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; PRAGMA synchronous=FULL;');
    db.prepare('ATTACH DATABASE ? AS auth').run(paths.auth);
    db.prepare('ATTACH DATABASE ? AS workflow').run(paths.workflow);
    for (const schema of ['main', 'auth', 'workflow']) {
      requireRule(db.prepare(`PRAGMA ${schema}.journal_mode`).get().journal_mode === 'delete', 'DB_JOURNAL');
      db.exec(`PRAGMA ${schema}.synchronous=FULL`);
    }
    db.setAuthorizer(sqlPolicy.authorize);
  } catch (e) { key.fill(0); db.close(); throw e; }
  const get = (sql, ...args) => db.prepare(sql).get(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  let closed = false;
  const deployment = () => {
    const live = control.current();
    requireRule(live.status === 'ACTIVE' && live.policyHash === boot.policyHash, 'STALE_WORKER');
    for (const [name, path] of Object.entries(paths)) requireRule(canonical(checkFile(path)) === canonical(files[name]), 'DB_REPLACED');
  };
  function transaction(fn, finalCheck = () => {}) {
    requireRule(!closed, 'CLOSED'); deployment();
    db.exec('BEGIN IMMEDIATE');
    try {
      sqlPolicy.inspect(db); deployment();
      const p = validatePolicy(JSON.parse(get('SELECT record FROM main.policy WHERE id=1').record));
      requireRule(hash(p) === boot.policyHash && p.timePolicyHash === hash(ptime), 'POLICY_CHANGED');
      const auth = get('SELECT config_hash,mode FROM auth.metadata WHERE id=1');
      requireRule(auth?.mode === 'SYNTHETIC_ONLY' && auth.config_hash === p.configHash
        && get('SELECT mode FROM workflow.metadata WHERE id=1')?.mode === 'SYNTHETIC_ONLY', 'CONFIG_CHANGED');
      const began = sample(clock), floor = get('SELECT floor FROM main.clock WHERE id=1').floor;
      requireRule(began.wall >= floor && began.wall < p.validUntil, 'CLOCK_OR_POLICY_EXPIRED');
      const value = fn(p, began);
      requireRule(!value?.then, 'ASYNC_TRANSACTION');
      const final = sample(clock);
      requireRule(final.wall >= began.wall && final.mono >= began.mono && final.wall < p.validUntil, 'FINAL_CLOCK');
      if (value?.expiresAtExclusive !== undefined) requireRule(final.wall < value.expiresAtExclusive, 'FINAL_EXPIRED');
      finalCheck(p, final); deployment();
      run('UPDATE main.clock SET floor=? WHERE id=1', final.wall);
      db.exec('COMMIT'); return value;
    } catch (e) { if (db.isTransaction) db.exec('ROLLBACK'); throw e; }
  }
  function principal(context, applicationId, p, now) {
    exact(context, ['token', 'wallet', 'chainId', 'csrf']);
    requireRule(hex(context.token) && hex(context.csrf) && context.wallet === p.wallet && context.chainId === p.chainId, 'AUTH_REQUIRED');
    requireRule(timingSafeEqual(Buffer.from(context.csrf, 'hex'), Buffer.from(digest('csrf:' + context.token), 'hex')), 'CSRF');
    const s = get('SELECT digest,wallet,issued_at,expires_at,revoked_at FROM auth.sessions WHERE digest=?', digest(context.token));
    requireRule(s && s.revoked_at === null && s.wallet === p.wallet && integer(s.issued_at) && s.issued_at > 0
      && integer(s.expires_at) && s.issued_at <= now && now < s.expires_at, 'AUTH_REQUIRED');
    const a = get('SELECT id,participant_id,wallet,course_ref,mapping_hash,revision,status FROM workflow.applications WHERE id=?', applicationId);
    requireRule(a && a.wallet === s.wallet && a.participant_id === p.participantRef && a.status === 'ACTIVE'
      && a.course_ref === p.courseRef && a.mapping_hash === p.mappingHash && integer(a.revision) && a.revision > 0, 'APPLICATION_SCOPE');
    const sessionRef = createHmac('sha256', key).update(canonical({ domain: 'READ_PREVIEW_SESSION', issuerEpoch: p.issuerEpoch, digest: s.digest })).digest('hex');
    return { a, s, sessionRef };
  }
  function attempt(context, applicationId, ref, p, now) {
    const identity = principal(context, applicationId, p, now);
    const a = get('SELECT * FROM main.attempts WHERE id=?', digest(ref));
    requireRule(a && a.application_id === applicationId && a.session_ref === identity.sessionRef, 'ATTEMPT_SCOPE');
    requireRule(a.status === 'PENDING' && a.issued_at <= now && now < a.expires_at, 'ATTEMPT_INACTIVE');
    requireRule(a.policy_hash === hash(p) && a.app_revision === identity.a.revision
      && get('SELECT generation FROM main.generations WHERE application_id=?', applicationId)?.generation === a.generation, 'ATTEMPT_STALE');
    return { row: a, ...identity };
  }
  function binding(context, applicationId, ref, p, now) {
    const identity = principal(context, applicationId, p, now);
    const b = get('SELECT * FROM main.bindings WHERE id=?', ref);
    requireRule(b && b.application_id === applicationId && b.session_ref === identity.sessionRef, 'BINDING_SCOPE');
    requireRule(b.status === 'ACTIVE' && now < b.expires_at && b.policy_hash === hash(p) && b.app_revision === identity.a.revision, 'BINDING_INACTIVE');
    return { row: b, ...identity };
  }
  const audit = (event, ref, now) => run('INSERT INTO main.audit VALUES(?,?,?,?)', randomRef(), event, ref, now);
  // The async boundary is here only. A timed-out promise can never re-enter commit.
  async function lookup(context, applicationId, ref, kind, consume) {
    context = structuredClone(context);
    const requestRef = randomRef();
    let scope, request, started;
    transaction((p, now) => {
      const state = kind === 'OBSERVE' ? binding(context, applicationId, ref, p, now.wall) : attempt(context, applicationId, ref, p, now.wall);
      scope = { ...state, policy: p }; started = now;
      run('INSERT INTO main.requests VALUES(?,?,?,?,?)', requestRef, kind === 'OBSERVE' ? state.row.attempt_id : state.row.id, kind, 'OPEN', now.wall);
      request = kind === 'OBSERVE'
        ? { version: versions.observationsRequest, requestRef, issuerEpoch: p.issuerEpoch, bindingScopeHash: state.row.scope_hash, confirmationRef: JSON.parse(state.row.confirmation).confirmationRef }
        : { version: versions.confirmationRequest, attemptRef: ref, requestRef, issuerEpoch: p.issuerEpoch, bindingScopeHash: state.row.scope_hash };
    });
    let timer;
    const abort = new AbortController();
    try {
      const response = await Promise.race([
        Promise.resolve().then(() => verifier.query(request, { signal: abort.signal })),
        new Promise((_, reject) => { timer = setTimeout(() => { abort.abort(); reject(new Error('RESPONSE_TIMEOUT')); }, ptime.roundTripMs); }),
      ]);
      const received = sample(clock), r = validateDto(kind === 'OBSERVE' ? 'observations' : 'confirmation', response);
      requireRule(kind === 'OBSERVE' || r.attemptRef === ref, 'RESPONSE_ATTEMPT');
      const currentness = final => checkCurrentness({ response: r, requestRef, started, received, final, policy: ptime });
      currentness(received);
      let finalIdentity;
      return transaction((p, now) => {
        const state = kind === 'OBSERVE' ? binding(context, applicationId, ref, p, now.wall) : attempt(context, applicationId, ref, p, now.wall);
        finalIdentity = state;
        for (const [remote, local] of [['installationRef', 'installationRef'], ['courseRef', 'courseRef'], ['subjectRef', 'expectedSubjectRef'], ['audience', 'audience'], ['issuerEpoch', 'issuerEpoch'], ['rosterRevision', 'rosterRevision'], ['trustEpoch', 'trustEpoch']]) requireRule(r[remote] === p[local], 'RESPONSE_SCOPE');
        requireRule(r.bindingScopeHash === state.row.scope_hash && state.row.policy_hash === hash(scope.policy), 'RESPONSE_SCOPE');
        requireRule(run("UPDATE main.requests SET state='USED' WHERE id=? AND state='OPEN'", requestRef).changes === 1, 'REQUEST_REUSED');
        return consume({ p, now, state, r });
      }, (_p, final) => {
        currentness(final);
        requireRule(final.wall < finalIdentity.s.expires_at && final.wall < finalIdentity.row.expires_at, 'FINAL_EXPIRED');
      });
    } catch (error) {
      try { transaction(() => run("UPDATE main.requests SET state='CANCELLED' WHERE id=? AND state='OPEN'", requestRef)); } catch { /* A revoked deployment must not regain write access for cleanup. */ }
      throw error;
    } finally { clearTimeout(timer); abort.abort(); }
  }
  try { transaction(() => null); } catch (e) { key.fill(0); db.close(); throw e; }
  return Object.freeze({
    mode: 'SYNTHETIC_ONLY',
    start(context, applicationId, input) {
      validateDto('start', input); requireRule(opaque(applicationId), 'APPLICATION_ID');
      let expiry;
      return transaction((p, now) => {
        const state = principal(context, applicationId, p, now.wall), ref = randomRef(), id = digest(ref);
        run("UPDATE main.bindings SET status='REVOKED' WHERE expires_at<=?", now.wall);
        requireRule(!get("SELECT id FROM main.bindings WHERE application_id=? AND status='ACTIVE'", applicationId), 'BINDING_EXISTS');
        run("UPDATE main.attempts SET status='REVOKED' WHERE application_id=? AND status='PENDING'", applicationId);
        const old = get('SELECT generation FROM main.generations WHERE application_id=?', applicationId)?.generation ?? 0;
        requireRule(integer(old + 1), 'GENERATION_OVERFLOW');
        if (old) run('UPDATE main.generations SET generation=? WHERE application_id=?', old + 1, applicationId);
        else run('INSERT INTO main.generations VALUES(?,?)', applicationId, 1);
        expiry = Math.min(now.wall + ptime.attemptSeconds, state.s.expires_at, p.validUntil);
        const scopeHash = hash({ domain: 'CLEAR_READ_PREVIEW_SCOPE_3', attempt: id, applicationId, generation: old + 1, sessionRef: state.sessionRef, appRevision: state.a.revision, policy: p });
        run("INSERT INTO main.attempts VALUES(?,?,?,?,?,?,?,NULL,'PENDING',?,?,NULL,NULL)", id, applicationId, old + 1, state.sessionRef, scopeHash, hash(p), state.a.revision, now.wall, expiry);
        audit('START', id, now.wall);
        return validateDto('startResult', { version: versions.start, attemptRef: ref, expiresAtExclusive: expiry });
      }, (_p, final) => requireRule(final.wall < expiry, 'FINAL_EXPIRED'));
    },
    preview(context, applicationId, input) {
      input = validateDto('preview', input);
      return lookup(context, applicationId, input.attemptRef, 'PREVIEW', ({ now, state, r }) => {
        const fingerprint = confirmationDigest(r);
        run('UPDATE main.attempts SET preview_digest=?,confirmation=? WHERE id=?', fingerprint, canonical(stableConfirmation(r)), state.row.id);
        return validateDto('previewResult', { version: versions.preview, attemptRef: input.attemptRef, installationRef: r.installationRef, courseRef: r.courseRef, accountHint: r.accountHint, confirmationDigest: fingerprint, expiresAtExclusive: Math.min(state.row.expires_at, r.expiresAtExclusive - ptime.maxClockSkewSeconds) });
      });
    },
    complete(context, applicationId, input) {
      input = validateDto('complete', input);
      return lookup(context, applicationId, input.attemptRef, 'COMPLETE', ({ p, now, state, r }) => {
        requireRule(state.row.preview_digest === input.confirmationDigest && confirmationDigest(r) === input.confirmationDigest, 'PREVIEW_CHANGED');
        const id = randomRef(), expires = Math.min(now.wall + ptime.bindingSeconds, state.s.expires_at, p.validUntil, r.expiresAtExclusive - ptime.maxClockSkewSeconds);
        const changed = run("UPDATE main.attempts SET status='CONSUMED',binding_id=? WHERE id=? AND status='PENDING' AND generation=? AND session_ref=? AND scope_hash=? AND policy_hash=? AND app_revision=? AND preview_digest=? AND expires_at>?", id, state.row.id, state.row.generation, state.sessionRef, state.row.scope_hash, hash(p), state.a.revision, input.confirmationDigest, now.wall);
        requireRule(changed.changes === 1, 'CAS_LOST');
        run("INSERT INTO main.bindings VALUES(?,?,?,?,?,?,?,?,?,?,?,'ACTIVE',?)", id, state.row.id, applicationId, p.installationRef, p.courseRef, p.expectedSubjectRef, state.sessionRef, hash(p), state.a.revision, state.row.scope_hash, canonical(stableConfirmation(r)), expires);
        audit('CONSUMED', state.row.id, now.wall);
        return validateDto('completeResult', { version: versions.complete, bindingRef: id, status: 'OBSERVED_ONLY', bindingRevision: state.row.generation, expiresAtExclusive: expires });
      });
    },
    readPreview(context, applicationId, bindingRef) {
      requireRule(opaque(bindingRef), 'BINDING_REF');
      return lookup(context, applicationId, bindingRef, 'OBSERVE', ({ p, state, r }) => {
        requireRule(canonical(stableConfirmation(r)) === state.row.confirmation, 'CONFIRMATION_CHANGED');
        requireRule(r.observations.every(item => p.targets.includes(item.targetRef)), 'TARGET_SCOPE');
        return validateDto('readPreview', { version: versions.readPreview, applicationId, bindingRef, bindingRevision: get('SELECT generation FROM main.attempts WHERE id=?', state.row.attempt_id).generation,
          scope: 'READ_PREVIEW', sourceStatus: 'OBSERVED_AT', enrolmentRevision: r.enrolmentRevision, observedAt: r.observedAt,
          expiresAtExclusive: Math.min(state.row.expires_at, r.expiresAtExclusive - ptime.maxClockSkewSeconds), observations: r.observations, automaticEligibility: false, paymentAllowed: false });
      });
    },
    // Metadata recovery after a lost complete response. Does not fetch source facts.
    bindingStatus(context, applicationId) {
      return transaction((p, now) => {
        principal(context, applicationId, p, now.wall);
        const found = get("SELECT id FROM main.bindings WHERE application_id=? AND status='ACTIVE'", applicationId);
        requireRule(found, 'BINDING_INACTIVE');
        const { row, s } = binding(context, applicationId, found.id, p, now.wall);
        return validateDto('completeResult', { version: versions.completeResult, bindingRef: row.id, status: 'OBSERVED_ONLY',
          bindingRevision: get('SELECT generation FROM main.attempts WHERE id=?', row.attempt_id).generation,
          expiresAtExclusive: Math.min(row.expires_at, s.expires_at) });
      });
    },
    close() { if (!closed) { requireRule(!db.isTransaction, 'TRANSACTION_OPEN'); closed = true; key.fill(0); db.close(); } },
  });
}
