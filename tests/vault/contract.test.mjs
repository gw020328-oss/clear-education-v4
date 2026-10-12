import test from 'node:test';
import assert from 'node:assert/strict';
import { ContractFactory, id, Signature, TypedDataEncoder, ZeroAddress } from 'ethers';
import { fixture } from './fixture.mjs';
import { finalDigest, grantTypes, runtimeHash, supplementTypes, vaultDomain } from '../../src/vault/encoding.mjs';

test('deployed immutable config and Solidity EIP-712 hashes match the independent JS encoder', async t => {
  const f = await fixture(t), terms = f.terms(), grant = f.grant(terms);
  assert.equal(await f.vault.runtimeConfigHash(), runtimeHash(f.config));
  assert.equal(await f.vault.termsDigest(terms.message), finalDigest(terms));
  assert.equal(await f.vault.grantDigest(grant), TypedDataEncoder.hash(vaultDomain(f.record), grantTypes, grant));
  assert.equal(await f.vault.domainSeparator(), TypedDataEncoder.hashDomain(vaultDomain(f.record)));
  assert.equal(f.vault.interface.fragments.filter(x => x.type === 'function' && /set|upgrade|cancel|withdraw/i.test(x.name)).length, 0);
});

test('only sponsor funds the fixed recipient, with full reserves and atomic failed transfers', async t => {
  const f = await fixture(t), terms = f.terms(), sig = await f.sign(terms);
  await assert.rejects(() => f.vault.connect(f.issuer.connect(f.provider)).enrollAndFund.staticCall(terms.message, sig), /SPONSOR/);
  const reverted = await f.vault.enrollAndFund(terms.message, sig, { gasLimit: 1000000 });
  await assert.rejects(() => reverted.wait());
  assert.equal(await f.vault.totalReserved(), 0n); assert.equal(await f.vault.usedConsentNonces(terms.message.nonce), false);
  assert.equal((await f.vault.enrollments(terms.message.applicationId)).learner, ZeroAddress);
  await f.enroll(terms);
  const bob = f.terms({ learner: f.app.bob.address }); await f.enroll(bob, f.app.bob);
  assert.equal(await f.vault.totalReserved(), BigInt(f.config.amount) * 2n);
  assert.equal(await f.token.balanceOf(f.pin.vaultAddress), BigInt(f.config.amount) * 2n);
  assert.equal((await f.vault.enrollments(terms.message.applicationId)).learner, f.app.alice.address);
  await assert.rejects(() => f.vault.enrollAndFund.staticCall(terms.message, sig), /APPLICATION/);
  const reused = f.terms({ nonce: terms.message.nonce }), reusedSignature = await f.sign(reused);
  await assert.rejects(() => f.vault.enrollAndFund.staticCall(reused.message, reusedSignature), /TERMS_TIME_NONCE/);
});

for (const field of ['applicationId', 'learner', 'policyHash', 'runtimeConfigHash', 'nonce', 'signedAt', 'expiresAt']) {
  test(`contract rejects signed terms substitution: ${field}`, async t => {
    const f = await fixture(t), typed = f.terms(), signature = await f.sign(typed), changed = { ...typed.message };
    changed[field] = field === 'learner' ? f.app.bob.address : ['signedAt', 'expiresAt'].includes(field) ? String(Number(changed[field]) + 1) : id('changed');
    await assert.rejects(() => f.vault.enrollAndFund.staticCall(changed, signature));
    assert.equal(await f.vault.totalReserved(), 0n);
  });
}
for (const [field, change] of [['chainId', 1], ['verifyingContract', ZeroAddress], ['salt', id('other-instance')], ['name', 'ClearApplicationTerms'], ['version', '3']]) {
  test(`contract rejects a signature for another domain: ${field}`, async t => {
    const f = await fixture(t), typed = f.terms(); typed.domain[field] = change;
    const signature = await f.sign(typed);
    await assert.rejects(() => f.vault.enrollAndFund.staticCall(typed.message, signature), /LEARNER_SIGNATURE/);
  });
}

test('malformed, high-S, wrong-wallet and personal_sign signatures never enroll', async t => {
  const f = await fixture(t), typed = f.terms(), normal = Signature.from(await f.sign(typed));
  const highS = (BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141') - BigInt(normal.s)).toString(16).padStart(64, '0');
  const signatures = ['0x', '0x' + '00'.repeat(65), normal.r + highS + (normal.v === 27 ? '1c' : '1b'),
    await f.sign(typed, f.app.bob), await f.app.alice.signMessage(finalDigest(typed))];
  for (const signature of signatures) await assert.rejects(() => f.vault.enrollAndFund.staticCall(typed.message, signature));
  assert.equal(await f.vault.totalReserved(), 0n);
});

for (const [field, delta, allowed] of [['enrollmentStart', -1, false], ['enrollmentStart', 0, true], ['enrollmentUntil', 0, true], ['enrollmentUntil', 1, false]]) {
  test(`chain enrollment boundary ${field} ${delta}`, async t => {
    const f = await fixture(t), time = Number(f.config[field]) + delta; await f.setTime(time);
    const typed = f.terms({ signedAt: String(time), expiresAt: String(Math.min(time + 600, Number(f.config.enrollmentUntil) + 1)) });
    const signature = await f.sign(typed); await (await f.token.approve(f.pin.vaultAddress, f.config.amount)).wait();
    if (allowed) await (await f.vault.enrollAndFund(typed.message, signature)).wait();
    else await assert.rejects(() => f.vault.enrollAndFund.staticCall(typed.message, signature), /ENROLLMENT_TIME/);
  });
}

test('consent expiry is exclusive and a future-dated signature is rejected', async t => {
  const f = await fixture(t), typed = f.terms(), signature = await f.sign(typed);
  const future = f.terms({ signedAt: String(f.app.time + 1) }), futureSignature = await f.sign(future);
  await assert.rejects(() => f.vault.enrollAndFund.staticCall(future.message, futureSignature), /TERMS_TIME_NONCE/);
  await f.setTime(typed.message.expiresAt);
  await assert.rejects(() => f.vault.enrollAndFund.staticCall(typed.message, signature), /TERMS_TIME_NONCE/);
});

test('constructor refuses unrelated tokens and inconsistent immutable deadlines', async t => {
  const f = await fixture(t), artifact = f.artifacts.CourseRefundVaultV4;
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, f.signer);
  for (const changes of [{ token: f.app.alice.address }, { claimUntil: f.config.supplementEndAt }, { supplementEndAt: f.config.claimUntil },
    { amount: '0' }, { issuer: ZeroAddress }, { outageSigner: ZeroAddress }, { enrollmentStart: f.config.claimUntil }]) {
    await assert.rejects(() => factory.deploy({ ...f.config, ...changes }));
  }
});

test('issuer authorization is immutable, replay-safe and cannot reuse another application exam or grant', async t => {
  const f = await fixture(t), first = await f.enroll(), second = await f.enroll(f.terms({ learner: f.app.bob.address }), f.app.bob);
  await f.setTime(f.config.normalSubmitFrom);
  const g = f.grant(first.typed), sig = await f.signGrant(g);
  const wrongIssuer = await f.signGrant(g, f.app.alice);
  await assert.rejects(() => f.vault.authorizeGrant.staticCall(g, wrongIssuer), /ISSUER_SIGNATURE/);
  await (await f.vault.authorizeGrant(g, sig)).wait(); await (await f.vault.authorizeGrant(g, sig)).wait();
  for (const changes of [{ amount: '1' }, { learner: f.app.bob.address }, { grantId: id('replacement') }]) {
    const changed = { ...g, ...changes }, signed = await f.signGrant(changed);
    await assert.rejects(() => f.vault.authorizeGrant.staticCall(changed, signed), /GRANT_CONFLICT/);
  }
  for (const changes of [{ grantId: g.grantId }, { examNullifier: g.examNullifier }]) {
    const reused = f.grant(second.typed, changes), signed = await f.signGrant(reused);
    await assert.rejects(() => f.vault.authorizeGrant.staticCall(reused, signed), /GRANT_REUSE/);
  }
  assert.equal(await f.vault.totalReserved(), BigInt(f.config.amount) * 2n);
});

test('first grant rejects wrong recipient/config, empty identifiers and times outside the authorized window', async t => {
  const f = await fixture(t), enrolled = await f.enroll(); await f.setTime(f.config.normalSubmitFrom);
  for (const changes of [{ learner: f.app.bob.address }, { policyHash: id('other-policy') }, { runtimeConfigHash: id('other-runtime') },
    { amount: '1' }, { claimUntil: String(Number(f.config.claimUntil) + 1) }, { grantId: '0x' + '00'.repeat(32) },
    { examNullifier: '0x' + '00'.repeat(32) }, { verifiedAt: String(Number(f.config.normalSubmitFrom) - 1) },
    { verifiedAt: String(Number(f.config.normalSubmitFrom) + 1) }, { issueBy: String(Number(f.config.normalSubmitAt) + 1) }]) {
    const grant = f.grant(enrolled.typed, changes), signature = await f.signGrant(grant);
    await assert.rejects(() => f.vault.authorizeGrant.staticCall(grant, signature));
  }
  await f.setTime(Number(f.config.normalSubmitAt) + 1);
  const late = f.grant(enrolled.typed), signature = await f.signGrant(late);
  await assert.rejects(() => f.vault.authorizeGrant.staticCall(late, signature), /ISSUE_TIME/);
  assert.equal((await f.vault.enrollments(enrolled.typed.message.applicationId)).grantDigest, '0x' + '00'.repeat(32));
});

test('insufficient sponsor balance reverts reservation and nonce consumption', async t => {
  const f = await fixture(t), typed = f.terms();
  await (await f.token.transfer(f.app.bob.address, await f.token.balanceOf(f.app.operator.address))).wait();
  await (await f.token.approve(f.pin.vaultAddress, f.config.amount)).wait();
  const tx = await f.vault.enrollAndFund(typed.message, await f.sign(typed), { gasLimit: 1000000 }); await assert.rejects(() => tx.wait());
  assert.equal(await f.vault.totalReserved(), 0n); assert.equal(await f.vault.usedConsentNonces(typed.message.nonce), false);
});

test('claim at T+10 pays only learner once, early reclaim fails and other reserves remain', async t => {
  const f = await fixture(t), first = await f.enroll(), second = await f.enroll();
  await f.setTime(f.config.normalSubmitFrom);
  const g = f.grant(first.typed); await (await f.vault.authorizeGrant(g, await f.signGrant(g))).wait();
  await assert.rejects(() => f.vault.claim.staticCall(second.typed.message.applicationId), /CLAIM_STATE/);
  await f.setTime(f.config.claimUntil);
  await assert.rejects(() => f.vault.reclaimExpired.staticCall(second.typed.message.applicationId), /RECLAIM_TIME_ROLE/);
  await (await f.vault.connect(await f.provider.getSigner(f.app.bob.address)).claim(first.typed.message.applicationId)).wait();
  assert.equal(await f.token.balanceOf(f.app.alice.address), BigInt(f.config.amount));
  assert.equal(await f.token.balanceOf(f.app.bob.address), 0n);
  assert.equal(await f.vault.totalReserved(), BigInt(f.config.amount));
  await assert.rejects(() => f.vault.claim.staticCall(first.typed.message.applicationId), /CLAIM_STATE/);
  await f.setTime(Number(f.config.claimUntil) + 1);
  await (await f.vault.reclaimExpired(second.typed.message.applicationId)).wait();
  assert.equal(await f.vault.totalReserved(), 0n);
  assert.equal(await f.token.balanceOf(f.pin.vaultAddress), 0n);
});

test('unclaimed authorized right expires only after T+10 and sponsor reclaims it', async t => {
  const f = await fixture(t), e = await f.enroll(); await f.setTime(f.config.normalSubmitAt);
  const g = f.grant(e.typed); await (await f.vault.authorizeGrant(g, await f.signGrant(g))).wait();
  await f.setTime(Number(f.config.claimUntil) + 1);
  await assert.rejects(() => f.vault.claim.staticCall(e.typed.message.applicationId), /CLAIM_TIME/);
  await (await f.vault.reclaimExpired(e.typed.message.applicationId)).wait();
  await assert.rejects(() => f.vault.reclaimExpired.staticCall(e.typed.message.applicationId), /RECLAIM_STATE/);
});

test('supplement requires configured outage signer and normal-period incident, ends exactly T+3', async t => {
  const f = await fixture(t), e = await f.enroll(); await f.setTime(Number(f.config.normalSubmitAt) + 1);
  const g = f.grant(e.typed, { issueBy: f.config.supplementEndAt }), sig = await f.signGrant(g);
  await assert.rejects(() => f.vault.authorizeGrant.staticCall(g, sig), /ISSUE_TIME/);
  const message = { runtimeConfigHash: f.record.runtimeConfigHash, observedAt: f.config.normalSubmitAt };
  const wrong = await f.issuer.signTypedData(vaultDomain(f.record), supplementTypes, message);
  await assert.rejects(() => f.vault.enableSupplement.staticCall(message.observedAt, wrong), /OUTAGE_SIGNATURE/);
  const late = { ...message, observedAt: String(Number(f.config.normalSubmitAt) + 1) };
  const lateSignature = await f.outage.signTypedData(vaultDomain(f.record), supplementTypes, late);
  await assert.rejects(() => f.vault.enableSupplement.staticCall(late.observedAt, lateSignature), /OUTAGE_TIME/);
  const signed = await f.outage.signTypedData(vaultDomain(f.record), supplementTypes, message);
  await (await f.vault.enableSupplement(message.observedAt, signed)).wait();
  await f.setTime(f.config.supplementEndAt); await (await f.vault.authorizeGrant(g, sig)).wait();
  await f.setTime(Number(f.config.supplementEndAt) + 1);
  await assert.rejects(() => f.vault.enableSupplement.staticCall(message.observedAt, signed), /OUTAGE_TIME/);
  // A retry preserves the already-authorized digest even after issuance closes.
  await (await f.vault.authorizeGrant(g, sig)).wait();
});
