import test from 'node:test';
import assert from 'node:assert/strict';
import { id, Wallet } from 'ethers';
import { fixture } from './fixture.mjs';
import { fixture as applicationFixture } from '../application/fixture.mjs';
import { canonical } from '../../src/policy/values.mjs';

const freshBody = () => ({ ownerPublicKey: Wallet.createRandom().signingKey.publicKey });

test('durable product binding and one-time authorization survive restart without recording wallet signatures or claiming proof success', async t => {
  const f = await fixture(t), p = await f.create(), body = await f.signed(p);
  assert.equal(p.state, 'ISSUED'); assert.equal(Number(p.expiresAt) - Number(p.issuedAt), 1800);
  assert.equal(p.typedData.domain.name, 'ClearRefund'); assert.equal(p.typedData.domain.salt, f.app.config.instanceId);
  f.app.restart({ vaultReader: f.reader });
  assert.deepEqual(f.get(p), p);
  assert.deepEqual(await f.create(), p);
  const authorized = await f.authorize(p, body);
  assert.equal(authorized.state, 'AUTHORIZED'); assert.ok(authorized.bindingDigest);
  for (const key of ['paymentAllowed', 'proofVerified', 'collectionEnabled']) assert.equal(authorized[key], false);
  f.app.restart({ vaultReader: f.reader });
  assert.deepEqual(await f.authorize(p, body), authorized);
  assert.equal(f.sql(db => db.prepare('SELECT count(*) n FROM proof_sessions WHERE consumed_at IS NOT NULL').get().n), 1);
  assert.equal(f.sql(db => JSON.stringify(db.prepare('SELECT * FROM proof_sessions').get())).includes(body.signature), false);
  assert.equal(f.app.service.getApplication(f.context, f.applicationId).state, 'ENROLLED');
  assert.deepEqual(f.app.service.listProofSessions(f.context, f.applicationId), [authorized]);
});

test('only enrolled owner can create; auth, CSRF, chain and role are rechecked', async t => {
  const f = await applicationFixture(t), a = f.create(), body = freshBody();
  await assert.rejects(() => f.service.createProofSession(f.aliceContext, a.applicationId, body, 'k'), /PROOF_ENROLLMENT_REQUIRED/);
  const g = await fixture(t);
  for (const [ctx, error] of [
    [{ ...g.context, csrf: null }, 'CSRF'], [{ ...g.context, chainId: 1 }, 'WALLET_CONTEXT_CHANGED'],
    [{ ...g.context, wallet: g.app.bob.address }, 'WALLET_CONTEXT_CHANGED'],
    [await g.app.login(g.app.bob), 'APPLICATION_NOT_FOUND'], [await g.app.login(g.app.operator), 'APPLICATION_NOT_FOUND'],
  ]) await assert.rejects(() => g.create('k', g.body, ctx), new RegExp(error));
  g.app.service.logout(g.context);
  await assert.rejects(() => g.create(), /AUTH_REQUIRED/);
});

test('strict owner key validation, one active session, key conflict, durable owner reuse rejection', async t => {
  const f = await fixture(t);
  for (const ownerPublicKey of [null, f.app.alice.address, f.owner.signingKey.compressedPublicKey, '0x04' + '00'.repeat(64)])
    await assert.rejects(() => f.create('bad', { ownerPublicKey }), /PROOF_OWNER_KEY/);
  await assert.rejects(() => f.create('bad', { ...f.body, rpc: 'https://invalid.example' }), /PROOF_SESSION_SCHEMA/);
  await assert.rejects(() => f.create(null), /IDEMPOTENCY_KEY/);
  const p = await f.create();
  await assert.rejects(() => f.create('proof-create', freshBody()), /IDEMPOTENCY_CONFLICT/);
  await assert.rejects(() => f.create('new', freshBody()), /PROOF_SESSION_ACTIVE/);
  f.cancel(p); f.app.restart({ vaultReader: f.reader });
  await assert.rejects(() => f.create('new'), /PROOF_OWNER_REUSED/);
  assert.equal((await f.create()).state, 'CANCELLED');
  const next = await f.create('new', freshBody()); assert.notEqual(next.proofSessionId, p.proofSessionId);
  assert.notEqual(next.typedData.message.requestNonce, p.typedData.message.requestNonce);
  await assert.rejects(() => f.authorize(next, awaitBody(p)), /PROOF_NONCE/);
  function awaitBody(x) { return { requestNonce: x.typedData.message.requestNonce, signature: '0x' + '01'.repeat(65) }; }
});

test('every signed field and diagnostic domain substitution is rejected before consuming nonce', async t => {
  const f = await fixture(t), p = await f.create(), correct = await f.signed(p);
  const cases = [
    ...['applicationId', 'learner', 'policyHash', 'runtimeConfigHash', 'proofSessionId', 'requestNonce', 'ownerPublicKey', 'expiresAt'].map(k => ['message', k]),
    ...['chainId', 'verifyingContract', 'salt', 'name', 'version'].map(k => ['domain', k]),
  ];
  for (const [section, field] of cases) {
    const changed = structuredClone(p.typedData);
    changed[section][field] = field === 'chainId' ? 1 : field === 'expiresAt' ? String(Number(p.expiresAt) + 1)
      : ['learner', 'verifyingContract'].includes(field) ? f.app.bob.address
        : field === 'ownerPublicKey' ? freshBody().ownerPublicKey : field === 'name' ? 'ClearCollectionDiagnostic'
          : field === 'version' ? '3' : id('different');
    const signature = await f.sign(changed);
    await assert.rejects(() => f.authorize(p, { ...correct, signature }), /SIGNATURE/, field);
  }
  await assert.rejects(async () => f.authorize(p, { ...correct, signature: await f.sign(p.typedData, f.app.bob) }), /SIGNATURE/);
  assert.equal(f.get(p).authorizedAt, null);
  assert.equal((await f.authorize(p, correct)).state, 'AUTHORIZED');
});

test('another login cannot authorize or replay creation, but same wallet can cancel and restart', async t => {
  const f = await fixture(t), p = await f.create(), body = await f.signed(p), second = await f.app.login(f.app.alice);
  await assert.rejects(() => f.authorize(p, body, second), /PROOF_BROWSER_SESSION/);
  await assert.rejects(() => f.create('proof-create', f.body, second), /PROOF_BROWSER_SESSION/);
  assert.equal(f.app.service.getProofSession(second, f.applicationId, p.proofSessionId).state, 'ISSUED');
  f.app.service.cancelProofSession(second, f.applicationId, p.proofSessionId, {});
  await assert.rejects(() => f.authorize(p, body), /PROOF_SESSION_CANCELLED/);
  assert.equal((await f.create('after-login', freshBody(), second)).state, 'ISSUED');
});

test('expiry exact boundary is durable, clears active slot, and never refreshes the same idempotency key', async t => {
  const f = await fixture(t), p = await f.create(), body = await f.signed(p);
  await f.setTime(p.expiresAt);
  await assert.rejects(() => f.authorize(p, body), /PROOF_SESSION_EXPIRED/);
  f.app.restart({ vaultReader: f.reader });
  assert.equal(f.get(p).state, 'EXPIRED'); assert.equal((await f.create()).state, 'EXPIRED');
  const next = await f.create('new', freshBody()); assert.equal(next.state, 'ISSUED');
  assert.notEqual(next.typedData.message.requestNonce, body.requestNonce);
});

test('authorized then cancelled/expired nonce cannot be activated again', async t => {
  const f = await fixture(t), p = await f.create(), body = await f.signed(p);
  await f.authorize(p, body); f.cancel(p);
  await assert.rejects(() => f.authorize(p, body), /PROOF_SESSION_CANCELLED/);
  const next = await f.create('next', freshBody()), nextBody = await f.signed(next);
  await f.authorize(next, nextBody); await f.setTime(next.expiresAt);
  await assert.rejects(() => f.authorize(next, nextBody), /PROOF_SESSION_EXPIRED/);
  assert.ok(f.get(next).authorizedAt); assert.equal(f.get(next).state, 'EXPIRED');
});

test('proof session read/write is application-owned and does not expose other applicants or accept callbacks', async t => {
  const f = await fixture(t), p = await f.create(), bob = await f.app.login(f.app.bob);
  assert.throws(() => f.app.service.getProofSession(bob, f.applicationId, p.proofSessionId), /APPLICATION_NOT_FOUND/);
  assert.throws(() => f.app.service.listProofSessions(bob, f.applicationId), /APPLICATION_NOT_FOUND/);
  assert.throws(() => f.app.service.cancelProofSession(bob, f.applicationId, p.proofSessionId, {}), /APPLICATION_NOT_FOUND/);
  assert.throws(() => f.get({ proofSessionId: id('unknown') }), /PROOF_SESSION_NOT_FOUND/);
  assert.throws(() => f.app.service.cancelProofSession(f.context, f.applicationId, p.proofSessionId, { verified: true }), /PROOF_SESSION_SCHEMA/);
});

for (const phase of ['create', 'authorize']) test(`RPC pause holds no SQLite write lock and rechecks logout for ${phase}`, async t => {
  const f = await fixture(t), p = phase === 'authorize' ? await f.create() : null, body = p ? await f.signed(p) : null;
  let release, entered; const waiting = new Promise(resolve => { entered = resolve; });
  const reader = { ...f.reader, proofEnrollment: async (...args) => {
    const result = await f.reader.proofEnrollment(...args); entered(); await new Promise(resolve => { release = resolve; }); return result;
  } };
  f.app.restart({ vaultReader: reader });
  const pending = p ? f.authorize(p, body) : f.create(); await waiting;
  f.app.service.logout(f.context); release(); await assert.rejects(() => pending, /AUTH_REQUIRED/);
  assert.equal(f.sql(db => db.prepare('SELECT count(*) n FROM proof_sessions WHERE consumed_at IS NOT NULL').get().n), 0);
});

for (const change of ['cancel', 'expire', 'slow', 'funding']) test(`RPC response cannot override ${change} during authorization`, async t => {
  const f = await fixture(t), p = await f.create(), body = await f.signed(p);
  let release, entered; const waiting = new Promise(resolve => { entered = resolve; });
  f.app.restart({ vaultReader: { ...f.reader, proofEnrollment: async (...args) => {
    const result = await f.reader.proofEnrollment(...args); entered(); await new Promise(resolve => { release = resolve; }); return result;
  } } });
  const pending = f.authorize(p, body); await waiting;
  if (change === 'cancel') f.cancel(p);
  if (change === 'expire') f.app.setTime(Number(p.expiresAt));
  if (change === 'slow') f.app.setTime(f.app.time + 31);
  if (change === 'funding') f.sql(db => db.prepare('UPDATE funding SET evidence=?').run(canonical({ ...f.funded.fundingEvidence, blockHash: id('changed') })));
  release();
  await assert.rejects(() => pending, new RegExp({ cancel: 'PROOF_SESSION_CANCELLED', expire: 'PROOF_SESSION_EXPIRED', slow: 'PROOF_CHAIN_CHECK_EXPIRED', funding: 'PROOF_ENROLLMENT_CHANGED' }[change]));
  assert.equal(f.sql(db => db.prepare('SELECT consumed_at FROM proof_sessions').get().consumed_at), null);
});

test('v2 migration preserves session, immutable runtime and funding', async t => {
  const f = await fixture(t);
  f.sql(db => {
    db.exec('DROP TABLE proof_sessions');
    const c = JSON.parse(db.prepare('SELECT config FROM metadata').get().config); c.schemaVersion = 2;
    db.prepare('UPDATE metadata SET config=?').run(canonical(c));
  });
  f.app.restart({ vaultReader: f.reader });
  assert.equal(f.sql(db => JSON.parse(db.prepare('SELECT config FROM metadata').get().config).schemaVersion), 3);
  assert.deepEqual(f.app.service.getApplication(f.context, f.applicationId), f.funded);
  assert.deepEqual(f.app.service.getRuntime(f.context, f.app.compiled.policyHash), f.record);
  assert.equal((await f.create()).state, 'ISSUED');
});

test('environment mismatch rolls back v2 migration without adding tables or changing metadata', async t => {
  const f = await fixture(t);
  const previous = f.sql(db => {
    db.exec('DROP TABLE proof_sessions');
    const c = JSON.parse(db.prepare('SELECT config FROM metadata').get().config); c.schemaVersion = 2;
    const encoded = canonical(c); db.prepare('UPDATE metadata SET config=?').run(encoded); return encoded;
  });
  const { createApplicationService } = await import('../../src/application/service.mjs');
  assert.throws(() => createApplicationService({ ...f.app.config, instanceId: id('another-instance') }), /DB_ENVIRONMENT_MISMATCH/);
  f.sql(db => {
    assert.equal(db.prepare('SELECT config FROM metadata').get().config, previous);
    assert.equal(db.prepare("SELECT count(*) n FROM sqlite_schema WHERE name='proof_sessions'").get().n, 0);
  });
  f.app.restart({ vaultReader: f.reader }); assert.equal((await f.create()).state, 'ISSUED');
});

test('a consumed nonce refuses a different signature encoding and cannot authorize another session', async t => {
  const f = await fixture(t), p = await f.create(), body = await f.signed(p);
  const authorized = await f.authorize(p, body);
  // ethers accepts recovery parity 0/1 as well as 27/28; it is a different
  // request than the exact signature that was committed for this nonce.
  const alternate = body.signature.slice(0, -2) + (parseInt(body.signature.slice(-2), 16) - 27).toString(16).padStart(2, '0');
  await assert.rejects(() => f.authorize(p, { ...body, signature: alternate }), /PROOF_NONCE_CONSUMED/);
  assert.deepEqual(f.get(p), authorized);
  f.cancel(p); const next = await f.create('next', freshBody());
  await assert.rejects(() => f.authorize(next, body), /PROOF_NONCE/);
});

test('missing nonce table after schema 3 never silently resets replay protection', async t => {
  const f = await fixture(t); await f.create();
  f.sql(db => db.exec('DROP TABLE proof_sessions'));
  const { createApplicationService } = await import('../../src/application/service.mjs');
  assert.throws(() => createApplicationService(f.app.config), /DB_SCHEMA_INCOMPLETE/);
  assert.equal(f.sql(db => db.prepare("SELECT count(*) n FROM sqlite_schema WHERE name='proof_sessions'").get().n), 0);
});
