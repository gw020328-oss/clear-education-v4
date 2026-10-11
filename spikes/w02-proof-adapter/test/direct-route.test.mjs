import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { Wallet, id } from 'ethers';
import { createSignDataForClaim, generateAttestationNonce, getIdentifierFromClaimInfo, hashProofClaimParams, runTeeVerification, verifyTeeAttestation, verifyAttestorTeeAttestation } from '@reclaimprotocol/js-sdk';
import { bindingTypes } from '../offline-adapter.mjs';
import { canonical, sourceBundleHash, buildDirectContext, inspectSyntheticDirectPair, checkRequiredTee } from '../direct-route.mjs';

let fetchAttempts = 0;
globalThis.fetch = async () => { fetchAttempts++; throw new Error('NETWORK_FORBIDDEN'); };
after(() => assert.equal(fetchAttempts, 0, 'No network call is needed for these offline cases'));
const NOW = 1791673200;
const inspect = f => inspectSyntheticDirectPair({ ...f, now: f.now ?? NOW });

async function signClaim(proof, attestor) {
  proof.identifier = getIdentifierFromClaimInfo(proof.claimData);
  proof.claimData.identifier = proof.identifier;
  proof.signatures = [await attestor.signMessage(createSignDataForClaim(proof.claimData))];
}
async function changeContext(f, role, mutate, resign = true) {
  const p = f.envelope.proofs[role === 'registration' ? 0 : 1];
  const context = JSON.parse(p.claimData.context);
  mutate(context);
  p.claimData.context = canonical(context);
  p.extractedParameterValues = structuredClone(context.extractedParameters);
  if (resign) await signClaim(p, f.attestor);
}
async function fixture() {
  const learner = Wallet.createRandom(), owner = Wallet.createRandom(), attestor = Wallet.createRandom();
  const bundle = { revision: 'synthetic-direct.1', sources: {} };
  for (const role of ['registration', 'score']) {
    const params = { url: `https://example.invalid/${role}`, method: role === 'registration' ? 'POST' : 'GET', body: '', headers: { accept: 'text/plain' }, responseMatches: [{ type: 'regex', value: `(?<exam_type>TOEIC)-${role}` }], responseRedactions: [{ regex: `(?<exam_type>TOEIC)-${role}` }], writeRedactionMode: 'zk' };
    bundle.sources[role] = { params, hashes: hashProofClaimParams(params) };
  }
  const record = {
    scope: 'W02_A_OFFLINE_ONLY', dataMode: 'SYNTHETIC', state: 'CONSENTED_AND_FUNDED_SYNTHETIC', route: 'DIRECT_ATTESTOR',
    createdAt: NOW - 60, fixedRecipient: learner.address, sourcePolicyBundleHash: sourceBundleHash(bundle),
    sourceRequestIds: { registration: id('synthetic-reg-request'), score: id('synthetic-score-request') },
    domain: { name: 'ClearRefund', version: '4', chainId: 431701, verifyingContract: Wallet.createRandom().address, salt: id('w02a-synthetic-instance') },
    binding: { applicationId: id('application-a'), learner: learner.address, policyHash: id('policy-a'), runtimeConfigHash: id('runtime-a'), proofSessionId: id('session-a'), requestNonce: id('nonce-a'), ownerPublicKey: owner.signingKey.publicKey, expiresAt: NOW + 1740 },
  };
  const proofs = [];
  for (const role of ['registration', 'score']) {
    const fields = { exam_type: 'TOEIC', exam_date: role === 'registration' ? '2026.10.01' : '2026-10-01', registration_number: '00000001', ...(role === 'score' ? { total_score: '850' } : {}) };
    const context = { ...buildDirectContext(record, role), extractedParameters: fields };
    const proof = { claimData: { provider: 'http', parameters: canonical(bundle.sources[role].params), owner: owner.address, timestampS: NOW, epoch: 1, context: canonical(context) }, extractedParameterValues: fields, witnesses: [{ id: attestor.address, url: '' }] };
    await signClaim(proof, attestor); proofs.push(proof);
  }
  return { learner, owner, attestor, bundle, record, trustedAttestors: [{ id: attestor.address, url: '' }], envelope: { route: 'DIRECT_ATTESTOR', proofs, walletSignature: await learner.signTypedData(record.domain, bindingTypes, record.binding) } };
}

test('direct context and ephemeral owner bind without any hosted provider/session ID', async () => {
  const f = await fixture();
  assert.notEqual(f.owner.address, f.learner.address);
  assert.equal(JSON.stringify(f.envelope).includes('reclaimSessionId'), false);
  assert.deepEqual(await inspect(f), {
    status: 'SYNTHETIC_DIRECT_BINDING_PASS', bindingVerified: true, teeVerified: false,
    realYbmVerified: false, paymentAllowed: false, sessionConsumed: false, liveBlocker: 'REQUIRED_TEE_NOT_ESTABLISHED',
  });
});
test('context builder never forwards caller-injected extracted fields', async () => {
  const f = await fixture();
  f.record.extractedParameters = { total_score: '990' };
  f.record.reclaimSessionId = 'fabricated';
  const context = buildDirectContext(f.record, 'score');
  assert.equal(Object.hasOwn(context, 'extractedParameters'), false);
  assert.equal(Object.hasOwn(context, 'reclaimSessionId'), false);
  // This checks our request builder, NOT the live attestor extraction implementation.
});
for (const [name, mutate, error] of [
  ['real data mode', f => { f.record.dataMode = 'REAL_YBM'; }, 'REAL_MODE_DISABLED'],
  ['wrong scope', f => { f.record.scope = 'LIVE'; }, 'REAL_MODE_DISABLED'],
  ['unfunded application', f => { f.record.state = 'CREATED'; }, 'APPLICATION_NOT_READY'],
  ['hosted envelope', f => { f.envelope.route = 'HOSTED_SDK'; }, 'ROUTE'],
  ['hosted record', f => { f.record.route = 'HOSTED_SDK'; }, 'ROUTE'],
  ['different recipient', f => { f.record.fixedRecipient = Wallet.createRandom().address; }, 'RECIPIENT'],
  ['expired session', f => { f.now = NOW + 1741; }, 'SESSION_EXPIRED'],
  ['not-yet-created session', f => { f.now = NOW - 61; }, 'SESSION_EXPIRED'],
  ['malformed public key', f => { f.record.binding.ownerPublicKey = '0x04' + '00'.repeat(64); }, 'OWNER_KEY'],
  ['missing pair', f => { f.envelope.proofs.pop(); }, 'EXACT_PAIR_REQUIRED'],
  ['oversized envelope', f => { f.envelope.padding = 'x'.repeat(128 * 1024); }, 'PAYLOAD_TOO_LARGE'],
  ['raw cookie field', f => { f.envelope.cookie = 'SYNTHETIC_SECRET'; }, 'SCHEMA_KEYS'],
  ['missing role request', f => { delete f.record.sourceRequestIds.score; }, 'SCHEMA_KEYS'],
  ['shared role request', f => { f.record.sourceRequestIds.score = f.record.sourceRequestIds.registration; }, 'SOURCE_REQUEST_IDS'],
]) test(`direct rejects ${name}`, async () => {
  const f = await fixture(); mutate(f); await assert.rejects(inspect(f), new RegExp(error));
});
for (const field of ['applicationId', 'policyHash', 'runtimeConfigHash', 'proofSessionId', 'requestNonce', 'expiresAt', 'ownerPublicKey']) {
  test(`wallet binding prevents substituted ${field}`, async () => {
    const f = await fixture();
    f.record.binding[field] = field === 'expiresAt' ? NOW + 1000 : field === 'ownerPublicKey' ? Wallet.createRandom().signingKey.publicKey : id('other-' + field);
    await assert.rejects(inspect(f), /WALLET_SIGNATURE/);
  });
}
for (const field of ['chainId', 'verifyingContract', 'salt']) test(`direct wallet binding rejects other ${field}`, async () => {
  const f = await fixture();
  f.record.domain[field] = field === 'chainId' ? 431702 : field === 'salt' ? id('other-instance') : Wallet.createRandom().address;
  await assert.rejects(inspect(f), /WALLET_SIGNATURE/);
});
test('new wallet consent for another application cannot reuse old proofs', async () => {
  const f = await fixture(); f.record.binding.applicationId = id('application-b');
  f.envelope.walletSignature = await f.learner.signTypedData(f.record.domain, bindingTypes, f.record.binding);
  await assert.rejects(inspect(f), /CONTEXT_clearBindingHash/);
});
for (const [field, value] of Object.entries({ clearSchemaVersion: 3, clearRoute: 'HOSTED_SDK', clearBindingHash: id('other'), clearSourceRole: 'registration', clearSourceRequestId: id('other-source'), clearSourcePolicyHash: id('other-policy') })) {
  test(`attestor-signed ${field} mismatch is still rejected`, async () => {
    const f = await fixture(); await changeContext(f, 'score', c => { c[field] = value; });
    await assert.rejects(inspect(f), new RegExp(`CONTEXT_${field}`));
  });
}
test('fabricated vendor session field cannot make direct proof a hosted proof', async () => {
  const f = await fixture(); await changeContext(f, 'score', c => { c.reclaimSessionId = 'invented'; });
  await assert.rejects(inspect(f), /SCHEMA_KEYS/);
});
test('unsigned context alteration fails the real SDK signature check', async () => {
  const f = await fixture(); await changeContext(f, 'score', c => { c.extractedParameters.total_score = '990'; }, false);
  await assert.rejects(inspect(f), /SIGNATURE/);
});
test('untrusted signer with trusted-looking metadata is rejected', async () => {
  const f = await fixture(); await signClaim(f.envelope.proofs[1], Wallet.createRandom());
  await assert.rejects(inspect(f), /SIGNATURE/);
});
test('second signature cannot smuggle an extra untrusted attestor', async () => {
  const f = await fixture(); f.envelope.proofs[1].signatures.push(f.envelope.proofs[0].signatures[0]);
  await assert.rejects(inspect(f), /SIGNER_COUNT/);
});
test('a valid attestor signature cannot change the owner', async () => {
  const f = await fixture(); f.envelope.proofs[1].claimData.owner = Wallet.createRandom().address;
  await signClaim(f.envelope.proofs[1], f.attestor); await assert.rejects(inspect(f), /OWNER_BINDING/);
});
for (const [name, mutate] of [
  ['URL', p => { p.url = 'https://example.invalid/other'; }],
  ['method', p => { p.method = 'POST'; }],
  ['header', p => { p.headers.accept = 'application/json'; }],
  ['extraction rule', p => { p.responseMatches[0].value = '.*'; }],
  ['redaction rule', p => { p.responseRedactions = []; }],
]) test(`signed changed ${name} fails the pinned source policy`, async () => {
  const f = await fixture(), p = f.envelope.proofs[1], params = JSON.parse(p.claimData.parameters);
  mutate(params); p.claimData.parameters = canonical(params); await signClaim(p, f.attestor);
  await assert.rejects(inspect(f), /SOURCE_POLICY/);
});
test('mutating the trusted source bundle without updating its binding is rejected', async () => {
  const f = await fixture(); f.bundle.sources.score.params.responseMatches[0].value = '.*';
  await assert.rejects(inspect(f), /BUNDLE_HASH/);
});
test('SDK hash omits accept header; direct exact parameter check covers it', async () => {
  const f = await fixture(), params = structuredClone(f.bundle.sources.score.params);
  params.headers.accept = 'application/json';
  assert.deepEqual(hashProofClaimParams(params), f.bundle.sources.score.hashes);
  const p = f.envelope.proofs[1]; p.claimData.parameters = canonical(params); await signClaim(p, f.attestor);
  await assert.rejects(inspect(f), /SOURCE_POLICY/);
});
for (const [name, timestamp] of [['stale', NOW - 1801], ['before session', NOW - 61], ['future', NOW + 61]]) test(`direct rejects ${name} proof`, async () => {
  const f = await fixture(); f.envelope.proofs[1].claimData.timestampS = timestamp;
  await signClaim(f.envelope.proofs[1], f.attestor); await assert.rejects(inspect(f), /PROOF_TIME/);
});
for (const [name, mutate, code] of [
  ['different exam', e => { e.registration_number = '00000002'; }, 'EXAM_JOIN'],
  ['invalid date', e => { e.exam_date = '2026-02-30'; }, 'EXAM_DATE'],
  ['wrong type', e => { e.exam_type = 'OTHER'; }, 'EXAM_TYPE'],
  ['missing score', e => { delete e.total_score; }, 'SCHEMA_KEYS'],
  ['invalid score', e => { e.total_score = '995'; }, 'SCORE'],
  ['unneeded identity', e => { e.candidate_name = 'SYNTHETIC'; }, 'SCHEMA_KEYS'],
]) test(`direct rejects ${name}`, async () => {
  const f = await fixture(); await changeContext(f, 'score', c => mutate(c.extractedParameters));
  await assert.rejects(inspect(f), new RegExp(code));
});
test('unsigned convenience score is not authority', async () => {
  const f = await fixture(); f.envelope.proofs[1].extractedParameterValues.total_score = '990';
  await assert.rejects(inspect(f), /UNSIGNED_FIELDS/);
});
test('duplicate keys in signed context are rejected, not silently normalized', async () => {
  const f = await fixture(), p = f.envelope.proofs[1];
  p.claimData.context = p.claimData.context.replace('"clearSchemaVersion":4', '"clearSchemaVersion":3,"clearSchemaVersion":4');
  await signClaim(p, f.attestor); await assert.rejects(inspect(f), /NON_CANONICAL_SIGNED_JSON/);
});
test('proof snapshot cannot be changed while asynchronous verification is pending', async () => {
  const f = await fixture(), pending = inspect(f);
  f.envelope.proofs[1].claimData.context = '{}';
  f.record.fixedRecipient = Wallet.createRandom().address;
  assert.equal((await pending).bindingVerified, true);
});
test('pure inspection does not consume a nonce or grant payment on repeated requests', async () => {
  const f = await fixture(); const results = await Promise.all([inspect(f), inspect(f)]);
  for (const r of results) { assert.equal(r.sessionConsumed, false); assert.equal(r.paymentAllowed, false); }
});

test('historical direct proof shape is signed but fails required SDK TEE validation', async () => {
  const f = await fixture(); assert.equal((await inspect(f)).bindingVerified, true);
  await assert.rejects(runTeeVerification(f.envelope.proofs, { appSecret: Wallet.createRandom().privateKey }), /missing TEE attestation data/);
  assert.deepEqual(await checkRequiredTee(f.envelope.proofs, Wallet.createRandom().privateKey), {
    sdkTeeVerified: false, paymentAllowed: false, liveEnabled: false, blocker: 'REQUIRED_TEE_REJECTED',
  });
});
for (const [name, make] of [
  ['empty proof array', () => []],
  ['one proof', f => f.envelope.proofs.slice(0, 1)],
  ['client success flags', f => f.envelope.proofs.map(p => ({ ...p, isTeeAttestationVerified: true, isAttestorTeeAttestationVerified: true }))],
  ['witness-only attestation label', f => f.envelope.proofs.map(p => ({ ...p, witnesses: p.witnesses.map(w => ({ ...w, claimAttestation: { attestation_report: 'SYNTHETIC_NOT_A_TOKEN' } })) }))],
]) test(`required TEE stays blocked for ${name}`, async () => {
  const f = await fixture(); const r = await checkRequiredTee(make(f), Wallet.createRandom().privateKey);
  assert.equal(r.sdkTeeVerified, false); assert.equal(r.liveEnabled, false); assert.equal(r.paymentAllowed, false);
});
test('actual SDK rejects a forged attestor TEE token independently of claim signing', async () => {
  const f = await fixture();
  const result = await verifyAttestorTeeAttestation('SYNTHETIC_NOT_A_JWT', f.attestor.address);
  assert.equal(result.isVerified, false); assert.match(result.error, /not a JWT/);
});

// Shape-only negative fixtures. No token is signed by a hardware attestation issuer.
// Test mocks mute synthetic error logs only; neither the verifier nor trust roots are mocked.
for (const [name, mutate, message] of [
  ['wrong app', (p, c) => { c.attestationNonceData.applicationId = Wallet.createRandom().address; }, /Application ID Mismatch/],
  ['wrong session', (p, c) => { c.reclaimSessionId = 'wrong'; }, /Session ID Mismatch/],
  ['old nonce timestamp', (p, c) => { c.attestationNonceData.timestamp = String((NOW - 601) * 1000); }, /Timestamp Skew/],
  ['fabricated nonce material', (p, c) => { c.attestationNonce = 'ff'.repeat(32); }, /nonce verification failed/],
  ['bundle nonce mismatch', p => { p.teeAttestation.nonce = 'ff'.repeat(32); }, /Nonce Mismatch/],
  ['unsupported TEE format', p => { p.teeAttestation.proof_version = 'v0'; }, /unexpected proof version/],
  ['unsigned JWT', () => {}, /unexpected attestation signing algorithm/],
]) test(`real SDK TEE validator rejects ${name}`, async t => {
  t.mock.method(console, 'error', () => {});
  t.mock.method(console, 'log', () => {});
  const app = Wallet.createRandom(), sessionId = 'synthetic-tee-session', timestamp = String(NOW * 1000);
  const nonce = generateAttestationNonce(app.privateKey, app.address, sessionId, timestamp);
  const p = (await fixture()).envelope.proofs[1];
  const context = JSON.parse(p.claimData.context);
  context.reclaimSessionId = sessionId;
  context.attestationNonce = nonce;
  context.attestationNonceData = { applicationId: app.address, sessionId, timestamp };
  const part = v => Buffer.from(JSON.stringify(v)).toString('base64url');
  p.teeAttestation = { proof_version: 'v2', tee_provider: 'gcp', tee_technology: 'amd-sev', nonce, timestamp: new Date(NOW * 1000).toISOString(), workload: { image_digest: 'synthetic-only' }, verifier: { image_digest: 'synthetic-only' }, attestation: { token: `${part({ alg: 'none' })}.${part({})}.AA` } };
  mutate(p, context); p.claimData.context = canonical(context);
  const result = await verifyTeeAttestation(p, app.privateKey);
  assert.equal(result.isVerified, false); assert.match(result.error, message);
});
