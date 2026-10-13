import test from 'node:test';
import assert from 'node:assert/strict';
import { id } from 'ethers';
import { browser, deferred } from './wallet-fixture.mjs';

const contextError = { message: 'PROOF_AUTHORIZATION_CONTEXT' };
test('proof approval sends the exact prefixed nonce once and returns only synthetic authorization', async t => {
  const f = await browser(t), result = await f.approve();
  assert.equal(result.state, 'AUTHORIZED'); assert.equal(f.reads, 1); assert.equal(f.signs, 1); assert.equal(f.posts, 1);
  assert.equal(f.lastBody.requestNonce, f.session.typedData.message.requestNonce);
  assert.deepEqual(Object.keys(f.lastBody).sort(), ['requestNonce', 'signature']);
  for (const flag of ['collectionEnabled', 'proofVerified', 'paymentAllowed']) assert.equal(result[flag], false);
  assert.equal(JSON.stringify(result).includes(f.lastBody.signature), false);
  await assert.rejects(f.approve(), { message: 'PROOF_AUTHORIZATION_STATE' }); assert.equal(f.signs, 1); assert.equal(f.posts, 1);
});

const changes = {
  application: p => p.applicationId = id('different'),
  session: p => p.proofSessionId = id('different'),
  learner: (p, f) => p.typedData.message.learner = f.other.address,
  policy: p => p.typedData.message.policyHash = id('different'),
  runtime: p => p.typedData.message.runtimeConfigHash = id('different'),
  nonce: p => p.typedData.message.requestNonce = id('different'),
  'nonce prefix': p => p.typedData.message.requestNonce = p.typedData.message.requestNonce.slice(2),
  owner: (p, f) => p.typedData.message.ownerPublicKey = f.other.signingKey.publicKey,
  'typed application': p => p.typedData.message.applicationId = id('different'),
  'typed session': p => p.typedData.message.proofSessionId = id('different'),
  chain: p => p.typedData.domain.chainId = 1,
  contract: (p, f) => p.typedData.domain.verifyingContract = f.wallet.address,
  instance: p => p.typedData.domain.salt = id('different'),
  domain: p => p.typedData.domain.name = 'Other',
  version: p => p.typedData.domain.version = '5',
  type: p => p.typedData.primaryType = 'EligibilityGrantV4',
  types: p => p.typedData.types.ProofSessionBindingV4.push({ name: 'extra', type: 'uint256' }),
  'extra message': p => p.typedData.message.extra = '0',
  'extra typed field': p => p.typedData.extra = '0',
  expiry: p => p.expiresAt = String(Number(p.expiresAt) + 1),
  'typed expiry': p => p.typedData.message.expiresAt = String(Number(p.expiresAt) + 1),
  issuance: p => p.issuedAt = String(Number(p.issuedAt) - 1),
  mode: p => p.dataMode = 'REAL',
  collection: p => p.collectionEnabled = true,
  verified: p => p.proofVerified = true,
  payment: p => p.paymentAllowed = true,
};
for (const [name, change] of Object.entries(changes)) test(`changed ${name} is rejected before the wallet prompt`, async t => {
  const f = await browser(t); f.mutate(p => change(p, f));
  await assert.rejects(f.approve(), contextError); assert.equal(f.signs, 0); assert.equal(f.posts, 0);
});
for (const state of ['CANCELLED', 'EXPIRED', 'AUTHORIZED']) test(`refreshed ${state} requires state recovery without signing again`, async t => {
  const f = await browser(t); f.mutate(p => p.state = state);
  await assert.rejects(f.approve(), { message: 'PROOF_AUTHORIZATION_STATE' }); assert.equal(f.signs, 0);
});
test('invalid reviewed context and independent owner are rejected before a server read', async t => {
  const f = await browser(t);
  for (const ownerPublicKey of [undefined, 'invalid', f.owner.signingKey.compressedPublicKey, f.other.signingKey.publicKey]) {
    await assert.rejects(f.approve({ ownerPublicKey }), contextError);
  }
  f.runtime.config.amount = '1'; await assert.rejects(f.approve(), contextError); assert.equal(f.reads, 0);
});
test('arguments are detached before the first await', async t => {
  const f = await browser(t), pending = f.approve();
  f.session.typedData.message.requestNonce = id('caller-mutated'); f.runtime.config.amount = '1';
  assert.equal((await pending).state, 'AUTHORIZED'); assert.notEqual(f.lastBody.requestNonce, f.session.typedData.message.requestNonce);
});
for (const phase of ['before', 'read', 'sign']) test(`expiry at ${phase} stops signing or submission`, async t => {
  const f = await browser(t);
  if (phase === 'before') f.advance(1800);
  if (phase === 'read') f.setApiHook(method => { if (method === 'GET') f.advance(1800); });
  if (phase === 'sign') f.setHook(method => { if (method === 'eth_signTypedData_v4') f.advance(1800); });
  await assert.rejects(f.approve(), { message: 'PROOF_SESSION_EXPIRED' });
  assert.equal(f.posts, 0); assert.equal(f.signs, phase === 'sign' ? 1 : 0);
});
for (const event of ['accountsChanged', 'chainChanged', 'disconnect', 'dispose', 'silent account', 'silent chain']) {
  test(`${event} during signing discards the signature`, async t => {
    const f = await browser(t); f.setHook(method => {
      if (method !== 'eth_signTypedData_v4') return;
      if (event === 'dispose') f.client.dispose();
      else if (event === 'silent account') f.setAccount(f.other.address);
      else if (event === 'silent chain') f.setChain('0x1');
      else f.provider.emit(event);
    });
    await assert.rejects(f.approve(), { message: 'WALLET_CONTEXT_CHANGED' }); assert.equal(f.posts, 0);
  });
}
for (const [code, expected] of [[4001, 'WALLET_REJECTED'], [-1, 'WALLET_UNAVAILABLE']]) test(`provider error ${code} is sanitized with no retry`, async t => {
  const f = await browser(t); f.setHook(method => { if (method === 'eth_signTypedData_v4') throw Object.assign(new Error('private-provider-detail'), { code }); });
  await assert.rejects(f.approve(), { message: expected }); assert.equal(f.signs, 1); assert.equal(f.posts, 0);
});
for (const value of ['private-provider-detail', 12, null]) test(`malformed signature ${typeof value} is not submitted`, async t => {
  const f = await browser(t); f.setHook(method => method === 'eth_signTypedData_v4' ? value : undefined);
  await assert.rejects(f.approve(), { message: 'WALLET_SIGNATURE_INVALID' }); assert.equal(f.posts, 0);
});
test('another signer cannot submit authorization', async t => {
  const f = await browser(t); f.setHook(async (method, params) => {
    if (method !== 'eth_signTypedData_v4') return;
    const typed = JSON.parse(params[1]); delete typed.types.EIP712Domain;
    return f.other.signTypedData(typed.domain, typed.types, typed.message);
  });
  await assert.rejects(f.approve(), { message: 'WALLET_SIGNATURE_INVALID' }); assert.equal(f.posts, 0);
});
test('abort before start does not read or sign and never exposes abort reason', async t => {
  const f = await browser(t), c = new AbortController(); c.abort('private-abort-detail');
  await assert.rejects(f.approve({ signal: c.signal }), { message: 'API_ABORTED', outcome: 'NOT_SENT', nextAction: 'NONE' });
  assert.equal(f.reads, 0); assert.equal(f.signs, 0); assert.equal(f.posts, 0);
});
for (const phase of ['GET', 'SIGN']) test(`abort during pending ${phase} rejects immediately and discards late completion`, async t => {
  const f = await browser(t), c = new AbortController(), entered = deferred(), release = deferred();
  if (phase === 'GET') f.setApiHook(async method => { if (method === 'GET') { entered.resolve(); await release.promise; } });
  else f.setHook(async method => { if (method === 'eth_signTypedData_v4') { entered.resolve(); await release.promise; } });
  const pending = f.approve({ signal: c.signal }); await entered.promise; c.abort('private-detail');
  await assert.rejects(pending, { message: 'API_ABORTED', outcome: 'NOT_SENT' });
  release.resolve(); await new Promise(resolve => setImmediate(resolve)); assert.equal(f.posts, 0);
});
test('concurrent calls never open a second wallet prompt', async t => {
  const f = await browser(t), entered = deferred(), release = deferred();
  f.setHook(async method => { if (method === 'eth_signTypedData_v4') { entered.resolve(); await release.promise; } });
  const first = f.approve(); await entered.promise;
  await assert.rejects(f.approve(), { message: 'PROOF_AUTHORIZATION_BUSY' }); release.resolve();
  await first; assert.equal(f.signs, 1); assert.equal(f.posts, 1);
});
test('abort after POST may leave a committed authorization; read it without signing again', async t => {
  const f = await browser(t), c = new AbortController(), entered = deferred(), release = deferred();
  f.setApiHook(async (method, options) => { assert.equal(options.signal, c.signal); if (method === 'POST') { entered.resolve(); await release.promise; } });
  const pending = f.approve({ signal: c.signal }); await entered.promise; c.abort();
  await assert.rejects(pending, { message: 'API_ABORTED', outcome: 'UNKNOWN', nextAction: 'CHECK_RESULT', retryable: false });
  release.resolve(); await new Promise(resolve => setImmediate(resolve));
  f.setApiHook(() => {});
  const result = await f.client.request(`/applications/${f.applicationId}/proof-sessions/${f.session.proofSessionId}`);
  assert.equal(result.state, 'AUTHORIZED'); assert.equal(f.posts, 1); assert.equal(f.signs, 1);
});
test('safe transport HTTP errors retain their authentication recovery fields', async t => {
  const f = await browser(t), error = Object.assign(new Error('AUTH_REQUIRED'), { name: 'ApiRequestError', code: 'AUTH_REQUIRED', status: 401,
    outcome: 'HTTP_ERROR', nextAction: 'SIGN_IN_AGAIN', retryable: false });
  f.setApiHook(method => { if (method === 'POST') throw error; });
  await assert.rejects(f.approve(), e => e === error && e.nextAction === 'SIGN_IN_AGAIN' && e.outcome === 'HTTP_ERROR');
});
for (const mutation of ['digest', 'flag', 'context', 'state', 'authorizedAt']) test(`invalid ${mutation} in the POST receipt cannot report success`, async t => {
  const f = await browser(t); f.setApiHook(method => { if (method === 'POST') f.mutate(p => {
    if (mutation === 'digest') p.bindingDigest = id('wrong');
    if (mutation === 'flag') p.paymentAllowed = true;
    if (mutation === 'context') p.typedData.message.requestNonce = id('wrong');
    if (mutation === 'state') p.state = 'ISSUED';
    if (mutation === 'authorizedAt') p.authorizedAt = p.expiresAt;
  }); });
  await assert.rejects(f.approve(), { message: 'PROOF_AUTHORIZATION_CONTEXT', outcome: 'UNKNOWN', nextAction: 'CHECK_RESULT' });
  assert.equal(f.posts, 1);
});

test('aborted old wallet check cannot invalidate a newly connected login when it completes late', async t => {
  const f = await browser(t), c = new AbortController(), entered = deferred(), release = deferred();
  let first = true;
  f.setHook(async method => {
    if (method === 'eth_accounts' && first) { first = false; entered.resolve(); await release.promise; }
  });
  const pending = f.approve({ signal: c.signal }); await entered.promise; c.abort();
  await assert.rejects(pending, { message: 'API_ABORTED' });
  await f.client.connect(); await f.client.resume();
  release.resolve(); await new Promise(resolve => setImmediate(resolve));
  assert.equal((await f.client.request(`/applications/${f.applicationId}/proof-sessions/${f.session.proofSessionId}`)).state, 'ISSUED');
  assert.equal(f.posts, 0);
});

test('context change after POST reports an uncertain result instead of success', async t => {
  const f = await browser(t); f.setApiHook(method => { if (method === 'POST') f.provider.emit('accountsChanged'); });
  await assert.rejects(f.approve(), { message: 'WALLET_CONTEXT_CHANGED', outcome: 'UNKNOWN', nextAction: 'CHECK_RESULT' });
  assert.equal(f.posts, 1);
});

test('authorization expiring while its POST response is in flight requires a fresh state read', async t => {
  const f = await browser(t); f.setApiHook(method => { if (method === 'POST') f.advance(1800); });
  await assert.rejects(f.approve(), { message: 'PROOF_SESSION_EXPIRED', outcome: 'UNKNOWN', nextAction: 'CHECK_RESULT' });
  assert.equal(f.posts, 1);
});

test('future-issued and overlong reviewed sessions cannot open a wallet prompt', async t => {
  const f = await browser(t); f.advance(-1);
  await assert.rejects(f.approve(), { message: 'PROOF_SESSION_EXPIRED' });
  f.advance(1); f.session.expiresAt = String(Number(f.session.expiresAt) + 1);
  f.session.typedData.message.expiresAt = f.session.expiresAt;
  await assert.rejects(f.approve(), contextError); assert.equal(f.signs, 0);
});

test('late rejected wallet prompt after abort is consumed without leaking or posting', async t => {
  const f = await browser(t), entered = deferred(), release = deferred(), c = new AbortController();
  f.setHook(async method => { if (method === 'eth_signTypedData_v4') { entered.resolve(); await release.promise; } });
  const pending = f.approve({ signal: c.signal }); await entered.promise; c.abort();
  await assert.rejects(pending, { message: 'API_ABORTED' }); release.reject(new Error('private-late-detail'));
  await new Promise(resolve => setImmediate(resolve)); assert.equal(f.posts, 0);
});
