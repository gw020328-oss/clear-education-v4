import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { id } from 'ethers';
import { fixture } from './fixture.mjs';
import { draft } from '../policy/fixture.mjs';
import { createApplicationService } from '../../src/application/service.mjs';

async function preliminary(f) {
  const a = f.app.create(), signed = await f.app.signedConsent(a);
  f.app.service.consent(f.app.aliceContext, a.applicationId, signed.body, 'preliminary'); return { a, signed };
}
async function submit(f, accepted) {
  await (await f.token.approve(f.pin.vaultAddress, f.config.amount)).wait();
  const intent = await f.app.service.fundingIntent(f.app.operatorContext, accepted.a.applicationId);
  const tx = await f.signer.sendTransaction(intent.transaction); await tx.wait(); return { tx, intent };
}

test('bind only actual deployment settings, freeze cohort policy, and persist final consent separately', async t => {
  const f = await fixture(t, { bind: false }), { service, operatorContext, aliceContext } = f.app;
  await assert.rejects(() => service.bindRuntime(aliceContext, { policyHash: f.app.compiled.policyHash }), /FORBIDDEN/);
  await assert.rejects(() => service.bindRuntime(operatorContext, { policyHash: f.app.compiled.policyHash, rpc: 'https://example.invalid' }), /RUNTIME_SCHEMA/);
  const bound = await service.bindRuntime(operatorContext, { policyHash: f.app.compiled.policyHash });
  assert.deepEqual(await service.bindRuntime(operatorContext, { policyHash: f.app.compiled.policyHash }), bound);
  assert.deepEqual(service.getRuntime(aliceContext, f.app.compiled.policyHash), bound);
  assert.throws(() => service.registerPolicy(operatorContext, { ...draft(), policyVersion: '2' }), /COHORT_RUNTIME_FIXED/);
  const { a, signed } = await preliminary(f);
  assert.equal(service.getApplication(aliceContext, a.applicationId).state, 'TERMS_ACCEPTED');
  const typed = await service.finalConsentChallenge(aliceContext, a.applicationId);
  assert.throws(() => service.finalConsent(aliceContext, a.applicationId, { nonce: typed.message.nonce.slice(2), signature: signed.body.signature }), /SIGNATURE/);
  const body = { nonce: typed.message.nonce.slice(2), signature: await f.sign(typed) };
  const consented = service.finalConsent(aliceContext, a.applicationId, body);
  assert.equal(consented.state, 'CONSENTED'); assert.equal(consented.funded, false); assert.equal(consented.paymentAllowed, false);
  assert.notEqual(consented.consentDigest, consented.finalConsentDigest);
  assert.equal(JSON.stringify(consented).includes(body.signature), false);
  f.app.restart({ vaultReader: f.reader });
  assert.deepEqual(f.app.service.finalConsent(aliceContext, a.applicationId, body), consented);
  assert.deepEqual(f.app.service.getRuntime(aliceContext, f.app.compiled.policyHash), bound);
});

for (const [field, value] of [['amount', '1000000'], ['enrollmentStart', '1'], ['normalSubmitFrom', '1'], ['policyHash', id('wrong-policy')], ['instanceId', id('wrong-instance')], ['cohortId', id('wrong-cohort')]]) {
  test(`deployment binding rejects mismatched ${field}`, async t => {
    const f = await fixture(t, { bind: false, config: { [field]: value } });
    await assert.rejects(() => f.app.service.bindRuntime(f.app.operatorContext, { policyHash: f.app.compiled.policyHash }), /RUNTIME_(POLICY|ENVIRONMENT)/);
    assert.throws(() => f.app.service.getRuntime(f.app.aliceContext, f.app.compiled.policyHash), /RUNTIME_NOT_BOUND/);
  });
}

for (const field of ['applicationId', 'learner', 'policyHash', 'runtimeConfigHash', 'nonce', 'signedAt', 'expiresAt', 'chainId', 'verifyingContract', 'salt']) {
  test(`final application consent rejects substitution: ${field}`, async t => {
    const f = await fixture(t), { a } = await preliminary(f), typed = await f.app.service.finalConsentChallenge(f.app.aliceContext, a.applicationId);
    const changed = structuredClone(typed);
    if (field === 'chainId') changed.domain.chainId = 1;
    else if (field === 'verifyingContract') changed.domain.verifyingContract = f.app.bob.address;
    else if (field === 'salt') changed.domain.salt = id('different-instance');
    else changed.message[field] = field === 'learner' ? f.app.bob.address : ['signedAt', 'expiresAt'].includes(field) ? String(Number(changed.message[field]) + 1) : id('different');
    const signature = await f.sign(changed);
    assert.throws(() => f.app.service.finalConsent(f.app.aliceContext, a.applicationId, { nonce: typed.message.nonce.slice(2), signature }), /SIGNATURE/);
    assert.equal(f.app.service.getApplication(f.app.aliceContext, a.applicationId).state, 'TERMS_ACCEPTED');
  });
}

test('final challenge is bound to owner, browser session, expiry, and latest challenge', async t => {
  const f = await fixture(t), { a } = await preliminary(f), s = f.app.service;
  await assert.rejects(() => s.finalConsentChallenge(f.app.bobContext, a.applicationId), /APPLICATION_NOT_FOUND/);
  const one = await s.finalConsentChallenge(f.app.aliceContext, a.applicationId), oneBody = { nonce: one.message.nonce.slice(2), signature: await f.sign(one) };
  const otherSession = await f.app.login(f.app.alice);
  assert.throws(() => s.finalConsent(otherSession, a.applicationId, oneBody), /FINAL_CONSENT_CHALLENGE/);
  const two = await s.finalConsentChallenge(f.app.aliceContext, a.applicationId);
  assert.throws(() => s.finalConsent(f.app.aliceContext, a.applicationId, oneBody), /FINAL_CONSENT_CHALLENGE/);
  const twoBody = { nonce: two.message.nonce.slice(2), signature: await f.sign(two) };
  f.app.setTime(Number(two.message.expiresAt));
  assert.throws(() => s.finalConsent(f.app.aliceContext, a.applicationId, twoBody), /FINAL_CONSENT_CHALLENGE/);
});

test('funding is pending through revert and restart, confirmed only from exact canonical receipt', async t => {
  const f = await fixture(t), accepted = await f.accepted(), appId = accepted.a.applicationId;
  await assert.rejects(() => f.app.service.fundingIntent(f.app.aliceContext, appId), /SPONSOR_REQUIRED/);
  const intent = await f.app.service.fundingIntent(f.app.operatorContext, appId);
  assert.equal(intent.application.state, 'FUNDING_PENDING'); assert.equal(intent.application.funded, false);
  assert.deepEqual(intent.approval, { token: f.config.token, spender: f.pin.vaultAddress, amount: f.config.amount });
  const reverted = await f.signer.sendTransaction({ ...intent.transaction, gasLimit: 1000000 }); await assert.rejects(() => reverted.wait());
  await assert.rejects(() => f.app.service.confirmFunding(f.app.operatorContext, appId, { transactionHash: reverted.hash }), /FUNDING_UNCONFIRMED/);
  await assert.rejects(() => f.app.service.confirmFunding(f.app.operatorContext, appId, { transactionHash: id('unmined') }), /FUNDING_UNCONFIRMED/);
  f.app.restart({ vaultReader: f.reader });
  assert.equal(f.app.service.getApplication(f.app.aliceContext, appId).state, 'FUNDING_PENDING');
  const { tx } = await submit(f, accepted);
  // Chain success alone must not pretend the DB already confirmed it.
  assert.equal(f.app.service.getApplication(f.app.aliceContext, appId).funded, false);
  f.app.restart({ vaultReader: f.reader });
  const result = await f.app.service.confirmFunding(f.app.operatorContext, appId, { transactionHash: tx.hash });
  assert.equal(result.state, 'ENROLLED'); assert.equal(result.funded, true); assert.equal(result.paymentAllowed, false);
  assert.equal(result.fundingEvidence.transactionHash, tx.hash);
  assert.equal(await f.vault.totalReserved(), BigInt(f.config.amount));
  assert.deepEqual(await f.app.service.confirmFunding(f.app.operatorContext, appId, { transactionHash: tx.hash }), result);
  f.app.restart({ vaultReader: f.reader });
  assert.deepEqual(f.app.service.getApplication(f.app.aliceContext, appId), result);
  await assert.rejects(() => f.app.service.finalConsentChallenge(f.app.aliceContext, appId), /FINAL_CONSENT_EXISTS/);
});

test('another application funding receipt and direct token transfer cannot confirm enrollment', async t => {
  const f = await fixture(t), one = await f.accepted(), two = await f.accepted(f.app.bobContext, f.app.bob);
  const { tx } = await submit(f, one);
  await assert.rejects(() => f.app.service.confirmFunding(f.app.operatorContext, two.a.applicationId, { transactionHash: tx.hash }), /FUNDING_TRANSACTION/);
  const transfer = await f.token.transfer(f.pin.vaultAddress, f.config.amount); await transfer.wait();
  await assert.rejects(() => f.app.service.confirmFunding(f.app.operatorContext, two.a.applicationId, { transactionHash: transfer.hash }), /FUNDING_TRANSACTION/);
  assert.equal(f.app.service.getApplication(f.app.bobContext, two.a.applicationId).state, 'CONSENTED');
});

test('unfunded expired consent can be renewed only after chain expiry, preserving stale-signature rejection', async t => {
  const f = await fixture(t), one = await f.accepted(), appId = one.a.applicationId;
  await f.app.service.fundingIntent(f.app.operatorContext, appId);
  await assert.rejects(() => f.app.service.finalConsentChallenge(f.app.aliceContext, appId), /FINAL_CONSENT_EXISTS/);
  f.app.setTime(Number(one.typed.message.expiresAt));
  await assert.rejects(() => f.app.service.fundingIntent(f.app.operatorContext, appId), /FINAL_CONSENT_EXPIRED/);
  await assert.rejects(() => f.app.service.finalConsentChallenge(f.app.aliceContext, appId), /FINAL_CONSENT_ACTIVE/);
  await f.setTime(one.typed.message.expiresAt);
  const next = await f.app.service.finalConsentChallenge(f.app.aliceContext, appId);
  assert.notEqual(next.message.nonce, one.typed.message.nonce);
  assert.throws(() => f.app.service.finalConsent(f.app.aliceContext, appId, one.body), /FINAL_CONSENT_CHALLENGE/);
  const body = { nonce: next.message.nonce.slice(2), signature: await f.sign(next) };
  assert.equal(f.app.service.finalConsent(f.app.aliceContext, appId, body).state, 'CONSENTED');
});

test('mined but unconfirmed funding cannot be overwritten by consent renewal after timeout', async t => {
  const f = await fixture(t), one = await f.accepted(), { tx } = await submit(f, one);
  await f.setTime(one.typed.message.expiresAt);
  await assert.rejects(() => f.app.service.finalConsentChallenge(f.app.aliceContext, one.a.applicationId), /FUNDING_RECOVERY_REQUIRED/);
  assert.equal((await f.app.service.confirmFunding(f.app.operatorContext, one.a.applicationId, { transactionHash: tx.hash })).state, 'ENROLLED');
});

test('RPC suspension rechecks logout and avoids holding the SQLite write lock', async t => {
  const f = await fixture(t), one = await f.accepted();
  let release, entered; const waiting = new Promise(resolve => { entered = resolve; });
  const reader = { ...f.reader, inspect: async () => { entered(); await new Promise(resolve => { release = resolve; }); return f.record; } };
  f.app.restart({ vaultReader: reader });
  const pending = f.app.service.fundingIntent(f.app.operatorContext, one.a.applicationId);
  await waiting;
  f.app.service.logout(f.app.operatorContext); release();
  await assert.rejects(() => pending, /AUTH_REQUIRED/);
  assert.equal(f.app.service.getApplication(f.app.aliceContext, one.a.applicationId).state, 'CONSENTED');
});

test('two sessions racing final consent commit one immutable digest; repeated funding intent is stable', async t => {
  const f = await fixture(t), { a } = await preliminary(f), secondContext = await f.app.login(f.app.alice);
  const secondService = createApplicationService({ ...f.app.config, vaultReader: f.reader, now: () => f.app.time });
  t.after(() => secondService.close());
  const [one, two] = await Promise.all([f.app.service.finalConsentChallenge(f.app.aliceContext, a.applicationId),
    secondService.finalConsentChallenge(secondContext, a.applicationId)]);
  const signatures = await Promise.all([f.sign(one), f.sign(two)]);
  const results = await Promise.allSettled([
    Promise.resolve().then(() => f.app.service.finalConsent(f.app.aliceContext, a.applicationId, { nonce: one.message.nonce.slice(2), signature: signatures[0] })),
    Promise.resolve().then(() => secondService.finalConsent(secondContext, a.applicationId, { nonce: two.message.nonce.slice(2), signature: signatures[1] })),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.message, 'FINAL_CONSENT_CONFLICT');
  const intents = await Promise.all([f.app.service.fundingIntent(f.app.operatorContext, a.applicationId), secondService.fundingIntent(f.app.operatorContext, a.applicationId)]);
  assert.deepEqual(intents[0], intents[1]);
});

test('schema v1 migration preserves existing application/session/consent and rejects unknown versions', async t => {
  const f = await fixture(t), one = await f.accepted(), filename = join(f.app.directory, 'applications.sqlite');
  // Emulate the previous schema without mutating any real user database.
  const db = new DatabaseSync(filename);
  db.exec('DROP TABLE proof_sessions; DROP TABLE funding; DROP TABLE final_challenges; DROP TABLE runtime_configs;');
  const metadata = JSON.parse(db.prepare('SELECT config FROM metadata').get().config); metadata.schemaVersion = 1;
  const { canonical } = await import('../../src/policy/values.mjs');
  db.prepare('UPDATE metadata SET config=?').run(canonical(metadata)); db.close();
  f.app.restart({ vaultReader: f.reader });
  const restored = f.app.service.getApplication(f.app.aliceContext, one.a.applicationId);
  assert.equal(restored.state, 'TERMS_ACCEPTED'); assert.ok(restored.consentDigest);
  assert.equal(f.app.service.whoami(f.app.operatorContext).role, 'operator');
  const next = new DatabaseSync(filename); const version = JSON.parse(next.prepare('SELECT config FROM metadata').get().config);
  assert.equal(version.schemaVersion, 3); next.close();
  const unknown = new DatabaseSync(filename); version.schemaVersion = 99;
  unknown.prepare('UPDATE metadata SET config=?').run(canonical(version)); unknown.close();
  assert.throws(() => createApplicationService(f.app.config), /DB_ENVIRONMENT_MISMATCH/);
});
