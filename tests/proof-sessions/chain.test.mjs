import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserProvider, id, Wallet } from 'ethers';
import { fixture } from './fixture.mjs';
import { createVaultReader } from '../../src/vault/reader.mjs';
import { supplementTypes, vaultDomain } from '../../src/vault/encoding.mjs';

function intercepted(t, f, modify, pin = f.pin) {
  const provider = new BrowserProvider({ request: async args => modify(args, structuredClone(await f.raw.request(args))) }, undefined, { cacheTimeout: -1 });
  t.after(() => provider.destroy()); return createVaultReader(provider, pin);
}
const inspect = (f, reader = f.reader) => reader.proofEnrollment(f.record, f.accepted.typed, f.accepted.signature, f.funded.fundingEvidence);

test('session issue and approval recheck current grant/claim state, including idempotent retries', async t => {
  const f = await fixture(t), p = await f.create(), body = await f.signed(p);
  const g = f.grant(f.accepted.typed); await (await f.vault.authorizeGrant(g, await f.signGrant(g))).wait();
  await assert.rejects(() => f.authorize(p, body), /PROOF_GRANT_EXISTS/);
  await assert.rejects(() => f.create(), /PROOF_GRANT_EXISTS/);
  assert.equal(f.get(p).state, 'ISSUED');
  await (await f.vault.claim(f.applicationId)).wait();
  await assert.rejects(() => f.authorize(p, body), /PROOF_ENROLLMENT_SETTLED/);
  await assert.rejects(() => f.create(), /PROOF_ENROLLMENT_SETTLED/);
  // The historical funding view deliberately stays ENROLLED.
  assert.equal(f.app.service.getApplication(f.context, f.applicationId).state, 'ENROLLED');
});

test('settled reclaim is rejected even while historical DB enrollment remains confirmed', async t => {
  const f = await fixture(t);
  await f.setTime(Number(f.config.claimUntil) + 1);
  await (await f.vault.reclaimExpired(f.applicationId)).wait();
  const context = await f.app.login(f.app.alice);
  await assert.rejects(() => f.create('late', f.body, context), /PROOF_ENROLLMENT_SETTLED/);
});

test('both chain and server submission windows apply, including authoritative supplement and TTL cap', async t => {
  const f = await fixture(t, { advance: false });
  await assert.rejects(() => f.create(), /PROOF_SUBMISSION_CLOSED/);
  // Server clock alone cannot advance chain eligibility.
  f.app.setTime(Number(f.config.normalSubmitFrom));
  let ctx = await f.app.login(f.app.alice);
  await assert.rejects(() => f.create('k', f.body, ctx), /PROOF_SUBMISSION_CLOSED/);
  await f.setTime(f.config.normalSubmitFrom); f.app.setTime(Number(f.config.normalSubmitFrom) - 1);
  ctx = await f.app.login(f.app.alice);
  await assert.rejects(() => f.create('k', f.body, ctx), /PROOF_SUBMISSION_CLOSED/);
  await f.setTime(Number(f.config.normalSubmitAt) - 5); ctx = await f.app.login(f.app.alice);
  const p = await f.create('last', f.body, ctx);
  assert.equal(p.expiresAt, String(Number(f.config.normalSubmitAt) + 1));
  await f.setTime(Number(f.config.normalSubmitAt) + 1);
  await assert.rejects(() => f.create('late', f.body, ctx), /PROOF_SUBMISSION_CLOSED/);
  const sig = await f.outage.signTypedData(vaultDomain(f.record), supplementTypes,
    { runtimeConfigHash: f.record.runtimeConfigHash, observedAt: f.config.normalSubmitAt });
  await (await f.vault.enableSupplement(f.config.normalSubmitAt, sig)).wait();
  const next = await f.create('supplement', { ownerPublicKey: Wallet.createRandom().signingKey.publicKey }, ctx);
  assert.equal(next.issuanceEvidence.supplementEnabled, true);
  assert.equal(next.issuanceEvidence.submitUntil, f.config.supplementEndAt);
  await f.setTime(Number(f.config.supplementEndAt) + 1); ctx = await f.app.login(f.app.alice);
  await assert.rejects(() => f.create('closed', f.body, ctx), /PROOF_SUBMISSION_CLOSED/);
});

test('chain/genesis/vault/runtime/funding reorg or unavailable RPC never issues or consumes a nonce', async t => {
  const f = await fixture(t), p = await f.create(), body = await f.signed(p);
  const cases = [
    ['chain', (a, r) => a.method === 'eth_chainId' ? '0x1' : r, 'VAULT_CHAIN'],
    ['genesis', (a, r) => a.method === 'eth_getBlockByNumber' && a.params[0] === '0x0' ? { ...r, hash: id('other') } : r, 'VAULT_GENESIS'],
    ['code', (a, r) => a.method === 'eth_getCode' ? '0x00' : r, 'VAULT_CODE'],
    ['funding reorg', (a, r) => a.method === 'eth_getTransactionReceipt' && a.params[0] === f.funded.fundingEvidence.transactionHash ? { ...r, blockHash: id('orphan') } : r, 'CHAIN_REORG'],
  ];
  for (const [label, modify, error] of cases) {
    const reader = intercepted(t, f, modify); f.app.restart({ vaultReader: reader });
    await assert.rejects(() => f.create(), new RegExp(error), label);
    await assert.rejects(() => f.authorize(p, body), new RegExp(error), label);
  }
  await assert.rejects(() => f.reader.proofEnrollment({ ...f.record, config: { ...f.record.config, instanceId: id('another') } }, f.accepted.typed, f.accepted.signature, f.funded.fundingEvidence), /RUNTIME_CHANGED/);
  const otherPin = intercepted(t, f, (a, r) => r, { ...f.pin, vaultAddress: f.app.bob.address });
  await assert.rejects(() => inspect(f, otherPin), /VAULT_DEPLOYMENT/);
  f.app.restart({ vaultReader: { ...f.reader, proofEnrollment: async () => { throw new Error('synthetic unavailable'); } } });
  await assert.rejects(() => f.create(), /synthetic unavailable/);
  await assert.rejects(() => f.authorize(p, body), /synthetic unavailable/);
  assert.equal(f.get(p).authorizedAt, null);
  f.app.restart(); await assert.rejects(() => f.authorize(p, body), /VAULT_NOT_CONFIGURED/);
});

test('current enrollment identity, reserves and observed block must match, independent of valid historical funding', async t => {
  const f = await fixture(t), latest = await f.provider.send('eth_getBlockByNumber', ['latest', false]);
  const e = await f.vault.enrollments(f.applicationId);
  for (const [method, values, code] of [
    ['enrollments', [f.app.bob.address, e.consentDigest, e.grantDigest, false], 'PROOF_ENROLLMENT'],
    ['enrollments', [e.learner, id('other-consent'), e.grantDigest, false], 'PROOF_ENROLLMENT'],
    ['totalReserved', [0n], 'RESERVES'], ['balanceOf', [0n], 'RESERVES'],
  ]) {
    const iface = method === 'balanceOf' ? f.token.interface : f.vault.interface;
    const selector = iface.getFunction(method).selector;
    const reader = intercepted(t, f, (a, r) => a.method === 'eth_call' && a.params[1] === latest.number && a.params[0].data.startsWith(selector)
      ? iface.encodeFunctionResult(method, values) : r);
    await assert.rejects(() => inspect(f, reader), new RegExp(code));
  }
  const changed = intercepted(t, f, (a, r) => a.method === 'eth_getBlockByNumber' && a.params[0] === latest.number ? { ...r, hash: id('new-tip') } : r);
  await assert.rejects(() => inspect(f, changed), /CHAIN_REORG/);
});

test('identical authorization retry revalidates a now-settled enrollment without resetting the receipt', async t => {
  const f = await fixture(t), p = await f.create(), body = await f.signed(p), authorized = await f.authorize(p, body);
  const grant = f.grant(f.accepted.typed); await (await f.vault.authorizeGrant(grant, await f.signGrant(grant))).wait();
  await (await f.vault.claim(f.applicationId)).wait();
  await assert.rejects(() => f.authorize(p, body), /PROOF_ENROLLMENT_SETTLED/);
  assert.deepEqual(f.get(p), authorized);
});
