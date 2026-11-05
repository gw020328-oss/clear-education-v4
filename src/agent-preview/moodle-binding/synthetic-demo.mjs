// Run with tools/node. This creates and deletes three new synthetic temp DBs.
import { performance } from 'node:perf_hooks';
import { createBindingCoordinator, createSyntheticEnvironment, createSyntheticVerifier, versions } from './index.mjs';
import { hash, digest } from './contract.mjs';

const now = Math.floor(Date.now() / 1000), wallet = '0x' + '1'.repeat(40), token = 'a'.repeat(64);
const limits = { policyRef: 'SYNTHETIC_DEMO_NOT_OPERATIONAL_APPROVAL', attemptSeconds: 120, bindingSeconds: 300,
  roundTripMs: 5000, finalFenceMs: 1000, maxObservationAgeSeconds: 10, maxClockSkewSeconds: 0 };
const policy = { mode: 'SYNTHETIC_ONLY', status: 'ACTIVE', issuerEpoch: 'synthetic-issuer', authorityRevision: 1, rosterRevision: 1, trustEpoch: 1,
  configHash: hash('synthetic-config'), mappingHash: hash('synthetic-mapping'), participantRef: 'synthetic-participant', wallet,
  installationRef: 'synthetic-installation', courseRef: 'synthetic-course', audience: 'synthetic-clear', expectedSubjectRef: 'synthetic-subject',
  validUntil: now + 600, timePolicyHash: hash(limits), chainId: 31337, targets: ['page-manual'] };
const env = createSyntheticEnvironment({ policy, now, sessions: [{ digest: digest(token), wallet, issuedAt: now, expiresAt: now + 600 }],
  applications: [{ id: 'synthetic-application', participantRef: policy.participantRef, wallet, courseRef: policy.courseRef, mappingHash: policy.mappingHash, revision: 1, status: 'ACTIVE' }] });
const verifier = createSyntheticVerifier(request => {
  const time = Math.floor(Date.now() / 1000), observing = request.version === versions.observationsRequest;
  const result = { version: observing ? versions.observations : versions.confirmation, requestRef: request.requestRef,
    installationRef: policy.installationRef, courseRef: policy.courseRef, subjectRef: policy.expectedSubjectRef, audience: policy.audience,
    issuerEpoch: policy.issuerEpoch, trustEpoch: 1, rosterRevision: 1, bindingScopeHash: request.bindingScopeHash,
    confirmationRef: 'synthetic-confirmation', moodleSessionGeneration: 'synthetic-session-generation', enrolmentRevision: 1,
    observedAt: time, checkedAt: time, expiresAtExclusive: now + 300 };
  return observing ? { ...result, scope: 'READ_PREVIEW', sourceStatus: 'OBSERVED_AT', observations: [{ targetRef: 'page-manual', status: 'COMPLETE', observedAt: time }] }
    : { ...result, attemptRef: request.attemptRef, accountHint: 'Synthetic student', confirmedAt: now };
});
let runtime;
try {
  runtime = createBindingCoordinator({ paths: env.paths, control: env.control, verifier, timePolicy: limits,
    clock: { wall: () => Math.floor(Date.now() / 1000), monotonic: () => performance.now() }, sessionKey: Buffer.alloc(32, 17) });
  const context = { token, wallet, chainId: 31337, csrf: digest('csrf:' + token) }, app = 'synthetic-application';
  const started = runtime.start(context, app, { version: versions.start });
  const preview = await runtime.preview(context, app, { version: versions.preview, attemptRef: started.attemptRef });
  const binding = await runtime.complete(context, app, { version: versions.complete, attemptRef: started.attemptRef, confirmationDigest: preview.confirmationDigest });
  const observation = await runtime.readPreview(context, app, binding.bindingRef);
  console.log(JSON.stringify({ mode: runtime.mode, status: binding.status, scope: observation.scope, sourceStatus: observation.sourceStatus,
    observations: observation.observations, automaticEligibility: observation.automaticEligibility, paymentAllowed: observation.paymentAllowed,
    actualInstallation: 'DISABLED' }, null, 2));
} finally { runtime?.close(); env.dispose(); }
