import test from 'node:test';
import assert from 'node:assert/strict';
import { Wallet } from 'ethers';
import { fixture } from './fixture.mjs';
import { ownerMessage, sourceMessage } from '../../src/product-proof/contract.mjs';
import { evaluateSyntheticEligibility } from '../../src/eligibility/synthetic-evaluator.mjs';

test('independent verification accepts once, persists only minimal fields, survives restart and supplies the existing evaluator', async t => {
  const f = await fixture(t), body = await f.signed();
  assert.equal(f.result().state, 'NOT_ACCEPTED');
  const receipt = await f.accept(body);
  assert.equal(receipt.state, 'ACCEPTED_SYNTHETIC'); assert.equal(f.rows(), 1);
  assert.equal(receipt.proofVerified, false); assert.equal(receipt.paymentAllowed, false);
  assert.deepEqual(await f.accept(body), receipt);
  f.app.restart({ vaultReader: f.reader }); assert.deepEqual(await f.accept(body), receipt);
  const saved = f.sql(db => JSON.stringify(db.prepare('SELECT * FROM proof_results').get()));
  for (const secret of [body.sourceSignature, body.ownerSignature, f.owner.privateKey, f.sourceSigner.privateKey]) assert.ok(!saved.includes(secret));
  assert.ok(!JSON.stringify(receipt).includes('totalScore'));
  assert.equal(f.sql(db => db.prepare('SELECT count(*) n FROM proof_sessions WHERE consumed_at IS NOT NULL').get().n), 1);
  const snapshot = await f.snapshot(); assert.equal(snapshot.records.length, 3);
  const learning = { dataMode: 'SYNTHETIC', policyHash: f.app.compiled.policyHash, learnerId: snapshot.learnerId,
    snapshotVersion: 'seed-1', observedAt: String(f.app.time), completeSnapshot: true,
    records: f.app.compiled.policy.requiredLectureIds.map(lectureId => ({ lectureId, completed: true, completedAt: f.app.compiled.policy.learningStart })) };
  const evaluated = evaluateSyntheticEligibility(f.app.compiled, { learnerId: snapshot.learnerId, expectedSeedSnapshotVersion: 'seed-1', exams: snapshot, learning });
  assert.equal(evaluated.selectedExamKey, 'b'); assert.equal(evaluated.paymentAllowed, false);
});

for (const kind of ['source', 'owner', 'page', 'binding', 'held', 'stale']) test(kind + ' tampering or incomplete evidence cannot consume acceptance', async t => {
  const f = await fixture(t); let body = await f.signed();
  if (kind === 'source') body.sourceSignature = await Wallet.createRandom().signMessage(sourceMessage(body.bundle.manifest));
  if (kind === 'owner') { const { ownerSignature, ...source } = body; body.ownerSignature = await Wallet.createRandom().signMessage(ownerMessage(source)); }
  if (kind === 'page') body.bundle.pages[2].records[0].totalScore = 990;
  if (kind === 'binding') body.bundle.manifest.bindingDigest = '0x' + '00'.repeat(32);
  if (kind === 'held') { f.evidence.bundle.pages.pop(); f.evidence.seal(); body = await f.signed(); }
  if (kind === 'stale') f.app.setTime(f.app.time + 301);
  await assert.rejects(() => f.accept(body), /PRODUCT_VERIFICATION_FAILED/); assert.equal(f.rows(), 0);
});

test('different signed result after acceptance conflicts; invalid attempts do not preclude a correct later result', async t => {
  const f = await fixture(t), body = await f.signed();
  await assert.rejects(() => f.accept({ ...body, verified: true }), /PRODUCT_SCHEMA/);
  const accepted = await f.accept(body);
  f.evidence.bundle.pages[2].records[0].totalScore = 990; f.evidence.seal();
  const other = await f.signed(); await assert.rejects(() => f.accept(other), /PRODUCT_RESULT_CONFLICT/);
  assert.deepEqual(f.result(), accepted); assert.equal(f.rows(), 1);
});

test('auth, same browser, ownership, cancellation and snapshot freshness are rechecked', async t => {
  const f = await fixture(t), body = await f.signed(), second = await f.app.login(f.app.alice);
  await assert.rejects(() => f.app.service.acceptProofEvidence(second, f.applicationId, f.session.proofSessionId, body), /PROOF_BROWSER_SESSION/);
  const bob = await f.app.login(f.app.bob);
  assert.throws(() => f.app.service.getProofResult(bob, f.applicationId, f.session.proofSessionId), /APPLICATION_NOT_FOUND/);
  await f.accept(body); f.app.setTime(f.app.time + 301);
  await assert.rejects(f.snapshot, /PRODUCT_VERIFICATION_STALE/);
  // Replaying an existing receipt is not reacceptance or fresh evaluation.
  assert.equal((await f.accept(body)).state, 'ACCEPTED_SYNTHETIC');
  f.cancel(f.issued); await assert.rejects(() => f.accept(body), /PROOF_SESSION_CANCELLED/);
  await assert.rejects(f.snapshot, /PROOF_SESSION_CANCELLED/); assert.equal(f.rows(), 1);
});

for (const change of ['cancel', 'logout', 'expire', 'stale', 'funding', 'abort']) test('RPC pause cannot override ' + change + ' before result commit', async t => {
  const f = await fixture(t), body = await f.signed(); let entered, release;
  const waiting = new Promise(resolve => { entered = resolve; });
  const controller = new AbortController();
  f.app.restart({ vaultReader: { ...f.reader, proofEnrollment: async (...args) => {
    const observation = await f.reader.proofEnrollment(...args); entered(); await new Promise(resolve => { release = resolve; }); return observation;
  } } });
  const pending = f.accept(body, { signal: controller.signal }); await waiting;
  if (change === 'cancel') f.cancel(f.issued);
  if (change === 'logout') f.app.service.logout(f.context);
  if (change === 'expire') f.app.setTime(Number(f.session.expiresAt));
  if (change === 'stale') f.app.setTime(f.app.time + 31);
  if (change === 'funding') f.sql(db => db.prepare("UPDATE funding SET state='CONSENTED',evidence=NULL").run());
  if (change === 'abort') controller.abort();
  release(); await assert.rejects(() => pending); assert.equal(f.rows(), 0);
});

test('chain settlement blocks both new result acceptance and previously accepted internal inputs', async t => {
  const f = await fixture(t), body = await f.signed(); await f.accept(body);
  const grant = f.grant(f.accepted.typed); await (await f.vault.authorizeGrant(grant, await f.signGrant(grant))).wait();
  await (await f.vault.claim(f.applicationId)).wait();
  await assert.rejects(() => f.accept(body), /PROOF_ENROLLMENT_SETTLED/);
  await assert.rejects(f.snapshot, /PROOF_ENROLLMENT_SETTLED/); assert.equal(f.rows(), 1);
});

for (const keyEnabled of [false, true]) test('missing source trust or incompatible source policy stays blocked before verification', async t => {
  const { fixture: proofFixture } = await import('../proof-sessions/fixture.mjs');
  const { policyDraft } = await import('../exam-evidence/fixture.mjs');
  const f = await proofFixture(t, keyEnabled ? { proofSourceSigner: Wallet.createRandom().address } : { policyDraft: policyDraft() });
  const p = await f.create(); await f.authorize(p, await f.signed(p));
  await assert.rejects(() => f.app.service.acceptProofEvidence(f.context, f.applicationId, p.proofSessionId, { verified: true }), /PROOF_SOURCE_INCOMPLETE/);
});

test('mutation of the caller object while verification is in flight cannot change the committed submission', async t => {
  const f = await fixture(t), body = await f.signed(); const { hash } = await import('../../src/policy/values.mjs');
  const expected = hash(body), pending = f.accept(body);
  body.bundle.pages[0].records[0].examKey = 'mutated-after-start';
  const receipt = await pending; assert.equal(receipt.submissionHash, expected);
  assert.ok(!(await f.snapshot()).records.some(r => r.registration.examKey === 'mutated-after-start'));
});
