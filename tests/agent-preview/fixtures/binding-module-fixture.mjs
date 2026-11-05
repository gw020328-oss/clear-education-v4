import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createBindingCoordinator, createSyntheticEnvironment, createSyntheticVerifier } from '../../../src/agent-preview/moodle-binding/index.mjs';
import { digest, hash, versions } from '../../../src/agent-preview/moodle-binding/contract.mjs';

export const timePolicy = Object.freeze({ policyRef: 'SYNTHETIC_TEST_POLICY_NOT_OPERATIONAL_APPROVAL', attemptSeconds: 120, bindingSeconds: 300, roundTripMs: 5000, finalFenceMs: 1000, maxObservationAgeSeconds: 10, maxClockSkewSeconds: 0 });
export const context = Object.freeze({ token: 'a'.repeat(64), wallet: '0x' + '1'.repeat(40), chainId: 31337, csrf: digest('csrf:' + 'a'.repeat(64)) });
export const sessionKey = Buffer.alloc(32, 17); // Public synthetic test material, never an operational key.
export function responseFor(request, policy, wall) {
  const observing = request.version === versions.observationsRequest;
  const response = { version: observing ? versions.observations : versions.confirmation,
    requestRef: request.requestRef, installationRef: policy.installationRef, courseRef: policy.courseRef,
    subjectRef: policy.expectedSubjectRef, audience: policy.audience, issuerEpoch: policy.issuerEpoch,
    trustEpoch: policy.trustEpoch, rosterRevision: policy.rosterRevision, bindingScopeHash: request.bindingScopeHash,
    confirmationRef: observing ? request.confirmationRef : 'confirm-' + request.attemptRef.slice(0, 20),
    moodleSessionGeneration: 'synthetic-session-generation-1', enrolmentRevision: 1,
    observedAt: wall, checkedAt: wall, expiresAtExclusive: 1290 };
  return observing ? { ...response, scope: 'READ_PREVIEW', sourceStatus: 'OBSERVED_AT', observations: [{ targetRef: 'page-manual', status: 'COMPLETE', observedAt: wall }] }
    : { ...response, attemptRef: request.attemptRef, accountHint: 'Synthetic student', confirmedAt: 990 };
}
export function fixture(t, options = {}) {
  const state = { wall: 1000, mono: 1000, mutate: r => r, query: null, samples: null };
  const policy = { mode: 'SYNTHETIC_ONLY', status: 'ACTIVE', issuerEpoch: 'synthetic-issuer-1', authorityRevision: 1, rosterRevision: 1, trustEpoch: 1,
    configHash: hash('synthetic-config'), mappingHash: hash('synthetic-mapping'), participantRef: 'synthetic-participant', wallet: context.wallet,
    installationRef: 'synthetic-installation', courseRef: 'synthetic-course', audience: 'synthetic-audience', expectedSubjectRef: 'synthetic-subject',
    validUntil: 2000, timePolicyHash: hash(options.timePolicy ?? timePolicy), chainId: context.chainId, targets: ['page-manual'] };
  const env = createSyntheticEnvironment({ policy, now: 1000, sessions: [{ digest: digest(context.token), wallet: context.wallet, issuedAt: 900, expiresAt: 1800 }],
    applications: ['app-a', 'app-b'].map(id => ({ id, participantRef: policy.participantRef, wallet: policy.wallet, courseRef: policy.courseRef, mappingHash: policy.mappingHash, revision: 1, status: 'ACTIVE' })) });
  const clock = { wall: () => { state.samples?.(); return state.wall; }, monotonic: () => state.mono };
  const verifier = createSyntheticVerifier(async (request, options) => state.query ? state.query(request, options) : state.mutate(responseFor(request, policy, state.wall)));
  const config = { paths: env.paths, control: env.control, verifier, timePolicy: options.timePolicy ?? timePolicy, clock, sessionKey };
  let runtime;
  t.after(() => { runtime?.close(); env.dispose(); });
  runtime = createBindingCoordinator(config);
  const sql = (name, query, args = []) => {
    const db = new DatabaseSync(env.paths[name], { timeout: 1000 });
    try { return db.prepare(query).all(...args).map(r => ({ ...r })); } finally { db.close(); }
  };
  const execute = (name, query) => { const db = new DatabaseSync(env.paths[name]); try { db.exec(query); } finally { db.close(); } };
  return { ...env, state, policy, config, sql, execute, get runtime() { return runtime; },
    reopen() { runtime.close(); runtime = createBindingCoordinator(config); return runtime; },
    fingerprint: name => createHash('sha256').update(readFileSync(env.paths[name])).digest('hex'),
    start: (app = 'app-a') => runtime.start(context, app, { version: versions.start }),
    preview: (a, app = 'app-a') => runtime.preview(context, app, { version: versions.preview, attemptRef: a.attemptRef }),
    complete: (a, preview, app = 'app-a') => runtime.complete(context, app, { version: versions.complete, attemptRef: a.attemptRef, confirmationDigest: preview.confirmationDigest }),
    setPolicy(next, external = true) {
      sql('main', 'UPDATE policy SET record=? WHERE id=1 RETURNING id', [JSON.stringify(next)]);
      if (external) env.control.replace({ status: 'ACTIVE', policyHash: hash(next) });
    },
  };
}
