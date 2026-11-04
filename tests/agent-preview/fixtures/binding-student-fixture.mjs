import { createSyntheticStudentProjection } from '../../../src/agent-preview/moodle-binding/student-profile.mjs';
import { DatabaseSync } from 'node:sqlite';
import { Wallet, id } from 'ethers';
import { mkdtempSync, realpathSync, chmodSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApplicationService } from '../../../src/application/service.mjs';
import { createStudentWorkflowService } from '../../../src/product-workflow/student-http-service.mjs';
import { studentHttpExamplePolicies } from '../../../specs/m3/student-http-example.mjs';
import { createBindingCoordinator, createSyntheticControlPlane, createSyntheticVerifier, versions } from '../../../src/agent-preview/moodle-binding/index.mjs';
import { schemas } from '../../../src/agent-preview/moodle-binding/schema.mjs';
import { hash } from '../../../src/agent-preview/moodle-binding/contract.mjs';
import { responseFor, timePolicy, sessionKey } from './binding-module-fixture.mjs';

export async function studentFixture(t, { acknowledged = true } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'clear-binding-student-')));
  const alice = Wallet.createRandom(), operator = Wallet.createRandom(), bob = Wallet.createRandom();
  const state = { wall: 1000, query: null };
  const authConfig = { directory: join(root, 'authentication'), origin: 'https://student.example.invalid', chainId: 31337,
    instanceId: id('SYNTHETIC_STUDENT_BINDING'), participants: [alice.address], operators: [operator.address],
    bindingAuthority: { revision: 1, expectedRevision: 0 }, now: () => state.wall };
  let auth, student, runtime;
  const extra = [];
  t.after(() => { runtime?.close(); student?.close(); auth?.close(); for (const x of extra) x.close(); rmSync(root, { recursive: true, force: true }); });
  auth = createApplicationService(authConfig);
  async function login(service = auth, previous = null) {
    const c = service.challenge({ wallet: alice.address, chainId: authConfig.chainId });
    const result = service.login({ nonce: c.nonce, signature: await alice.signMessage(c.message) }, c.browserToken, previous);
    return { token: result.token, wallet: result.wallet, chainId: authConfig.chainId, csrf: result.csrf };
  }
  const context = await login();
  const studentConfig = { directory: join(root, 'student'), authentication: auth, instanceId: 'student-binding-test',
    policies: studentHttpExamplePolicies(), now: () => state.wall };
  student = createStudentWorkflowService(studentConfig);
  const policyView = student.policies(context).policies[0];
  const applicationId = student.create(context, { policyHash: policyView.policyHash }, 'create').applicationId;
  const acknowledge = (key = 'ack') => {
    const preview = student.preview(context, applicationId);
    return student.acknowledge(context, applicationId, { expectedRevision: preview.expectedRevision,
      previewHash: preview.previewHash, acknowledgement: 'SYNTHETIC_ACK_ONLY' }, key);
  };
  if (acknowledged) acknowledge();
  const registry = { mode: 'SYNTHETIC_ONLY', applicationId, policyId: policyView.policyId, policyHash: policyView.policyHash,
    policyRevision: policyView.policyRevision, bindingRevision: 1, participantRef: 'synthetic-participant', wallet: alice.address.toLowerCase(),
    installationRef: 'synthetic-installation', courseRef: 'synthetic-course', subjectRef: 'explicit-synthetic-subject' };
  const projection = createSyntheticStudentProjection({ authentication: auth.moodleBindingManifest(), student: student.moodleBindingManifest(), registry });
  const policy = { mode: 'SYNTHETIC_ONLY', status: 'ACTIVE', issuerEpoch: 'synthetic-issuer-1', authorityRevision: projection.authRevision,
    rosterRevision: 1, trustEpoch: 1, configHash: projection.authConfigHash, mappingHash: projection.mappingHash,
    participantRef: registry.participantRef, wallet: registry.wallet, installationRef: registry.installationRef, courseRef: registry.courseRef,
    audience: 'synthetic-audience', expectedSubjectRef: registry.subjectRef, validUntil: 2000, timePolicyHash: hash(timePolicy), chainId: authConfig.chainId, targets: ['page-manual'] };
  const paths = { main: join(root, 'binding.sqlite'), auth: auth.moodleBindingManifest().path, workflow: student.moodleBindingManifest().path };
  const main = new DatabaseSync(paths.main);
  main.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;' + schemas.main);
  main.prepare('INSERT INTO policy VALUES(1,?)').run(JSON.stringify(policy)); main.prepare('INSERT INTO clock VALUES(1,?)').run(state.wall); main.close(); chmodSync(paths.main, 0o600);
  const control = createSyntheticControlPlane(policy);
  const verifier = createSyntheticVerifier((request, options) => state.query ? state.query(request, options) : responseFor(request, policy, state.wall));
  const config = { paths, projection, control, verifier, timePolicy, sessionKey,
    clock: { wall: () => state.wall, monotonic: () => performance.now() } };
  runtime = createBindingCoordinator(config);
  const sql = (name, query, args = []) => {
    const db = new DatabaseSync(paths[name], { timeout: 1000 });
    try { return db.prepare(query).all(...args).map(r => ({ ...r })); } finally { db.close(); }
  };
  return { root, alice, bob, context, state, registry, policy, projection, paths, config, authConfig, studentConfig, sql, login, acknowledge,
    get auth() { return auth; }, get student() { return student; }, get runtime() { return runtime; },
    createAuth(overrides) { const next = createApplicationService({ ...authConfig, ...overrides }); extra.push(next); return next; },
    replaceStudent(policies) { student.close(); student = createStudentWorkflowService({ ...studentConfig, policies }); return student; },
    reopen() { runtime.close(); runtime = createBindingCoordinator(config); },
    start: () => runtime.start(context, applicationId, { version: versions.start }),
    preview: a => runtime.preview(context, applicationId, { version: versions.preview, attemptRef: a.attemptRef }),
    complete: (a, p) => runtime.complete(context, applicationId, { version: versions.complete, attemptRef: a.attemptRef, confirmationDigest: p.confirmationDigest }),
    respond: request => responseFor(request, policy, state.wall),
  };
}
