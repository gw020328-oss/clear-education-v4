import test from 'node:test';
import assert from 'node:assert/strict';
import { Wallet, id } from 'ethers';
import { assertVerifiedProof, createSignDataForClaim, getIdentifierFromClaimInfo, hashProofClaimParams, ReclaimProofRequest } from '@reclaimprotocol/js-sdk';
import { bindingHash, bindingTypes, createOfflineAdapter } from '../offline-adapter.mjs';

// Ephemeral artificial identities only. No test keys or proof blobs are written.
globalThis.fetch = async () => { throw new Error('NETWORK_FORBIDDEN_IN_OFFLINE_TEST'); };
const fixedNow = 1791597600;
async function fixture() {
  const learner = Wallet.createRandom(), owner = Wallet.createRandom(), attestor = Wallet.createRandom();
  const record = {
    scope: 'W02_OFFLINE_ONLY', dataMode: 'SYNTHETIC', state: 'CONSENTED_AND_FUNDED_SYNTHETIC',
    createdAt: fixedNow - 60, fixedRecipient: learner.address,
    domain: { name: 'ClearRefund', version: '4', chainId: 431701, verifyingContract: Wallet.createRandom().address, salt: id('w02-only-instance') },
    binding: { applicationId: id('application-a'), learner: learner.address, policyHash: id('policy-a'), runtimeConfigHash: id('runtime-a'), proofSessionId: id('clear-session-a'), requestNonce: id('synthetic-nonce-a'), ownerPublicKey: owner.signingKey.publicKey, expiresAt: fixedNow + 1740 },
    reclaimSessionIds: { registration: 'synthetic-sdk-session-reg', score: 'synthetic-sdk-session-score' },
  };
  const sourcePolicies = {}, proofs = [];
  for (const role of ['registration', 'score']) {
    const params = { url: `https://example.invalid/synthetic/${role}`, method: role === 'registration' ? 'POST' : 'GET', body: '', responseMatches: [{ type: 'regex', value: `(?<synthetic_${role}>TEST_ONLY)` }], responseRedactions: [{ regex: `(?<synthetic_${role}>TEST_ONLY)` }] };
    const hashes = hashProofClaimParams(params);
    sourcePolicies[role] = { providerId: `synthetic-${role}`, providerVersion: 'test.1', url: params.url, method: params.method, hashes: Array.isArray(hashes) ? hashes : [hashes] };
    const fields = { exam_type: 'TOEIC', exam_date: role === 'registration' ? '2026.10.01' : '2026-10-01', registration_number: '00000001', ...(role === 'score' ? { total_score: '850' } : {}) };
    const claimData = { provider: 'http', parameters: JSON.stringify(params), owner: owner.address, timestampS: fixedNow, epoch: 1, context: JSON.stringify({ clearBindingHash: bindingHash(record), clearSourceRole: role, reclaimSessionId: record.reclaimSessionIds[role], extractedParameters: fields }) };
    const proof = { claimData, extractedParameterValues: fields, witnesses: [{ id: attestor.address, url: '' }] };
    await resign(proof, attestor); proofs.push(proof);
  }
  return { learner, owner, attestor, record, sourcePolicies, proofs, trustedAttestors: [{ id: attestor.address, url: '' }], walletSignature: await learner.signTypedData(record.domain, bindingTypes, record.binding) };
}
async function resign(proof, signer) {
  proof.identifier = getIdentifierFromClaimInfo(proof.claimData);
  proof.claimData.identifier = proof.identifier;
  proof.signatures = [await signer.signMessage(createSignDataForClaim(proof.claimData))];
}
const adapter = (f, now = () => fixedNow) => createOfflineAdapter({ ...f, now });
const input = (f) => ({ proofs: f.proofs, walletSignature: f.walletSignature });
async function changeContext(f, index, change, signed = true) {
  const context = JSON.parse(f.proofs[index].claimData.context); change(context);
  f.proofs[index].claimData.context = JSON.stringify(context);
  if (signed) await resign(f.proofs[index], f.attestor);
}

test('positive: two artificial signed claims bind to the wallet; no payment authority', async () => {
  const f = await fixture();
  assert.deepEqual(await adapter(f).accept(input(f)), { status: 'SYNTHETIC_PAIR_BOUND', duplicate: false, paymentAllowed: false, realYbmVerified: false });
});
test('REAL_YBM mode cannot enter this offline adapter', async () => {
  const f = await fixture(); f.record.dataMode = 'REAL_YBM'; assert.throws(() => adapter(f), /REAL_MODE_DISABLED/);
});
test('duplicate concurrent callbacks accept once in this process', async () => {
  const f = await fixture(), a = adapter(f);
  const results = await Promise.all([a.accept(input(f)), a.accept(input(f))]);
  assert.equal(a.getAcceptanceCount(), 1); assert.equal(results.filter((r) => r.duplicate).length, 1);
});
test('newly signed proof on consumed session is a replay', async () => {
  const f = await fixture(), a = adapter(f); await a.accept(input(f));
  f.proofs[1].claimData.timestampS++; await resign(f.proofs[1], f.attestor);
  await assert.rejects(a.accept(input(f)), /NONCE_REPLAY/);
});
for (const field of ['applicationId', 'policyHash', 'runtimeConfigHash', 'proofSessionId', 'requestNonce']) {
  test(`wallet signature cannot move to another ${field}`, async () => {
    const f = await fixture(); f.record.binding[field] = id(`different-${field}`);
    await assert.rejects(adapter(f).accept(input(f)), /WALLET_SIGNATURE/);
  });
}
for (const [name, change] of [
  ['chain', (f) => { f.record.domain.chainId++; }],
  ['contract', (f) => { f.record.domain.verifyingContract = Wallet.createRandom().address; }],
  ['instance', (f) => { f.record.domain.salt = id('other-instance'); }],
  ['wallet', (f) => { f.record.fixedRecipient = f.record.binding.learner = Wallet.createRandom().address; }],
]) test(`wallet signature rejects changed ${name}`, async () => {
  const f = await fixture(); change(f); await assert.rejects(adapter(f).accept(input(f)), /WALLET_SIGNATURE/);
});
test('attested proof still cannot move to a newly consented different application', async () => {
  const f = await fixture(); f.record.binding.applicationId = id('application-b');
  f.walletSignature = await f.learner.signTypedData(f.record.domain, bindingTypes, f.record.binding);
  await assert.rejects(adapter(f).accept(input(f)), /CONTEXT_BINDING/);
});
test('unsigned context alteration invalidates the actual signature', async () => {
  const f = await fixture(); await changeContext(f, 1, (c) => { c.extractedParameters.total_score = '990'; }, false);
  await assert.rejects(adapter(f).accept(input(f)), /SIGNATURE/);
});
test('an untrusted signer with trusted-looking witness metadata is rejected', async () => {
  const f = await fixture(); await resign(f.proofs[1], Wallet.createRandom()); await assert.rejects(adapter(f).accept(input(f)), /SIGNATURE/);
});
test('SDK accepts any trusted signer; wrapper rejects an extra untrusted signer', async () => {
  const f = await fixture(); f.proofs[1].signatures.push(await Wallet.createRandom().signMessage(createSignDataForClaim(f.proofs[1].claimData)));
  await assertVerifiedProof(f.proofs[1], f.trustedAttestors);
  await assert.rejects(adapter(f).accept(input(f)), /SIGNER_COUNT/);
});
test('claim identifier must match signed contents', async () => {
  const f = await fixture(); f.proofs[1].identifier = id('wrong-id'); await assert.rejects(adapter(f).accept(input(f)), /IDENTIFIER/);
});
test('valid attestor signature does not override the pinned extraction rules', async () => {
  const f = await fixture(), p = f.proofs[1], params = JSON.parse(p.claimData.parameters);
  params.responseMatches[0].value = 'arbitrary-response'; p.claimData.parameters = JSON.stringify(params); await resign(p, f.attestor);
  await assert.rejects(adapter(f).accept(input(f)), /SOURCE_POLICY/);
});
test('valid attestor signature does not override source URL/method', async () => {
  const f = await fixture(), p = f.proofs[1], params = JSON.parse(p.claimData.parameters);
  params.url = 'https://example.invalid/attacker'; p.claimData.parameters = JSON.stringify(params); await resign(p, f.attestor);
  await assert.rejects(adapter(f).accept(input(f)), /SOURCE_REQUEST/);
});
test('different proof owner fails even with a valid attestor signature', async () => {
  const f = await fixture(); f.proofs[1].claimData.owner = Wallet.createRandom().address; await resign(f.proofs[1], f.attestor);
  await assert.rejects(adapter(f).accept(input(f)), /OWNER_BINDING/);
});
for (const [label, timestamp] of [['stale', fixedNow - 1801], ['before request', fixedNow - 61], ['future', fixedNow + 61]]) {
  test(`${label} proof is rejected`, async () => {
    const f = await fixture(); f.proofs[1].claimData.timestampS = timestamp; await resign(f.proofs[1], f.attestor);
    await assert.rejects(adapter(f).accept(input(f)), /PROOF_TIME/);
  });
}
test('expired session is rejected', async () => { const f = await fixture(); await assert.rejects(adapter(f, () => fixedNow + 1741).accept(input(f)), /SESSION_EXPIRED/); });
for (const [name, mutate, error] of [
  ['SDK session', (c) => { c.reclaimSessionId = 'another-sdk-session'; }, 'RECLAIM_SESSION'],
  ['source role', (c) => { c.clearSourceRole = 'registration'; }, 'SOURCE_ROLE'],
  ['exam number', (c) => { c.extractedParameters.registration_number = '00000002'; }, 'EXAM_JOIN'],
  ['exam date', (c) => { c.extractedParameters.exam_date = '2026-10-02'; }, 'EXAM_JOIN'],
  ['invalid calendar date', (c) => { c.extractedParameters.exam_date = '2026-02-30'; }, 'INVALID_DATE'],
  ['exam type', (c) => { c.extractedParameters.exam_type = 'OTHER'; }, 'EXAM_TYPE'],
  ['score range', (c) => { c.extractedParameters.total_score = '995'; }, 'SCORE_RANGE'],
]) test(`rejects signed but wrong ${name}`, async () => {
  const f = await fixture(); await changeContext(f, 1, mutate);
  f.proofs[1].extractedParameterValues = JSON.parse(f.proofs[1].claimData.context).extractedParameters;
  await assert.rejects(adapter(f).accept(input(f)), new RegExp(error));
});
test('unsigned score convenience fields cannot change the result', async () => {
  const f = await fixture(); f.proofs[1].extractedParameterValues.total_score = '990';
  await assert.rejects(adapter(f).accept(input(f)), /UNSIGNED_FIELDS_MISMATCH/);
});
test('missing proof is rejected without consuming the session', async () => {
  const f = await fixture(), a = adapter(f); await assert.rejects(a.accept({ ...input(f), proofs: f.proofs.slice(0, 1) }), /EXACT_PAIR_REQUIRED/);
  assert.equal(a.getAcceptanceCount(), 0); assert.equal((await a.accept(input(f))).status, 'SYNTHETIC_PAIR_BOUND');
});
test('oversized callback is rejected before signature verification', async () => {
  const f = await fixture(); f.proofs[0].publicData = 'x'.repeat(128 * 1024); await assert.rejects(adapter(f).accept(input(f)), /PAYLOAD_TOO_LARGE/);
});
test('pinned SDK exposes JSON context and exact provider-version methods', () => {
  for (const name of ['setJsonContext', 'setContext', 'getProviderVersion', 'getProviderHashRequirements', 'setAppCallbackUrl', 'toJsonString']) assert.equal(typeof ReclaimProofRequest.prototype[name], 'function');
});
