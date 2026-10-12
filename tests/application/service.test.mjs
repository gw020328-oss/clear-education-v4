import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, chmodSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TypedDataEncoder } from 'ethers';
import { createApplicationService } from '../../src/application/service.mjs';
import { fixture } from './fixture.mjs';
import { draft } from '../policy/fixture.mjs';

test('SIWE message pins origin, URI, chain, expiry and instance; login never accepts terms', async t => {
  const f = await fixture(t), c = f.service.challenge({ wallet: f.alice.address, chainId: f.config.chainId });
  assert.ok(c.message.startsWith('clear.example.invalid wants you to sign in with your Ethereum account:\n' + f.alice.address));
  for (const text of ['URI: https://clear.example.invalid/auth', 'Version: 1', 'Chain ID: 431701', 'Expiration Time:', f.config.instanceId.slice(2)]) assert.ok(c.message.includes(text));
  assert.match(c.nonce, /^[0-9a-f]{64}$/);
  assert.equal(f.service.listApplications(f.aliceContext).length, 0);
  assert.equal(f.create().state, 'DRAFT');
});

test('nonce is consumed once across restart, and session persists with hashed tokens', async t => {
  const f = await fixture(t), c = f.service.challenge({ wallet: f.alice.address, chainId: f.config.chainId });
  const body = { nonce: c.nonce, signature: await f.alice.signMessage(c.message) };
  const login = f.service.login(body, c.browserToken);
  f.restart();
  assert.throws(() => f.service.login(body, c.browserToken), { message: 'AUTH_CHALLENGE' });
  assert.equal(f.service.whoami({ token: login.token, wallet: login.wallet, chainId: f.config.chainId, csrf: null }).wallet, f.alice.address);
  const bytes = readFileSync(join(f.directory, 'applications.sqlite'));
  for (const forbidden of [c.nonce, c.message, body.signature, c.browserToken, login.token, login.csrf]) assert.ok(!bytes.includes(forbidden));
  assert.equal(statSync(f.directory).mode & 0o777, 0o700);
  assert.equal(statSync(join(f.directory, 'applications.sqlite')).mode & 0o777, 0o600);
});

for (const [label, change] of [
  ['domain', m => m.replace('clear.example.invalid wants', 'evil.example.invalid wants')],
  ['URI', m => m.replace('/auth', '/other')], ['chain', m => m.replace('431701', '431702')],
  ['nonce', m => m.replace(/Nonce: .+/, 'Nonce: deadbeef')],
  ['expiry', m => m.replace(/Expiration Time: .+/, 'Expiration Time: 2099-01-01T00:00:00Z')],
  ['instance', m => m.replace(/Request ID: .+/, 'Request ID: another')],
]) test(`login rejects signed ${label} tampering`, async t => {
  const f = await fixture(t), c = f.service.challenge({ wallet: f.alice.address, chainId: f.config.chainId });
  assert.throws(() => f.service.login({ nonce: c.nonce, signature: f.signature }, c.browserToken), { message: 'SIGNATURE' });
  const signature = await f.alice.signMessage(change(c.message));
  assert.throws(() => f.service.login({ nonce: c.nonce, signature }, c.browserToken), { message: 'SIGNATURE' });
  const valid = await f.alice.signMessage(c.message);
  assert.ok(f.service.login({ nonce: c.nonce, signature: valid }, c.browserToken).token);
});

test('wrong signer/browser, unsolicited nonce and client roles cannot authenticate', async t => {
  const f = await fixture(t), c = f.service.challenge({ wallet: f.alice.address, chainId: f.config.chainId });
  const wrong = await f.bob.signMessage(c.message), good = await f.alice.signMessage(c.message);
  assert.throws(() => f.service.login({ nonce: c.nonce, signature: wrong }, c.browserToken), { message: 'SIGNATURE' });
  assert.throws(() => f.service.login({ nonce: c.nonce, signature: good }, '00'.repeat(32)), { message: 'AUTH_CHALLENGE' });
  assert.throws(() => f.service.login({ nonce: '00'.repeat(32), signature: good }, c.browserToken), { message: 'AUTH_CHALLENGE' });
  assert.throws(() => f.service.challenge({ wallet: f.alice.address, chainId: f.config.chainId, role: 'operator' }), { message: 'AUTH_SCHEMA' });
  assert.throws(() => f.service.challenge({ wallet: f.outsider.address, chainId: f.config.chainId }), { message: 'NOT_INVITED' });
  assert.throws(() => f.service.challenge({ wallet: f.alice.address, chainId: 1 }), { message: 'WRONG_CHAIN' });
});

for (const seconds of [-1, 300]) test(`auth rejects time boundary ${seconds}`, async t => {
  const f = await fixture(t), c = f.service.challenge({ wallet: f.alice.address, chainId: f.config.chainId });
  const signature = await f.alice.signMessage(c.message); f.setTime(f.time + seconds);
  assert.throws(() => f.service.login({ nonce: c.nonce, signature }, c.browserToken), { message: 'AUTH_CHALLENGE' });
});

test('session expires, logout is durable, re-login rotates the old browser session', async t => {
  const f = await fixture(t);
  f.service.logout(f.aliceContext); f.restart();
  assert.throws(() => f.service.whoami(f.aliceContext), { message: 'AUTH_REQUIRED' });
  const previous = await f.login(f.alice), c = f.service.challenge({ wallet: f.alice.address, chainId: f.config.chainId });
  const signature = await f.alice.signMessage(c.message);
  f.service.login({ nonce: c.nonce, signature }, c.browserToken, previous.token);
  assert.throws(() => f.service.whoami(previous), { message: 'AUTH_REQUIRED' });
  f.setTime(f.time + 3600);
  assert.throws(() => f.service.whoami(f.bobContext), { message: 'AUTH_REQUIRED' });
});

test('removed invite invalidates a persisted session; role is never taken from a request', async t => {
  const f = await fixture(t); f.restart({ participants: [f.bob.address] });
  assert.throws(() => f.service.whoami(f.aliceContext), { message: 'AUTH_REQUIRED' });
  assert.equal(f.service.whoami(f.bobContext).role, 'participant');
});

test('policy versions are immutable and current policy supersedes unsigned applications', async t => {
  const f = await fixture(t), app = f.create(), p = draft(); p.amount = '1';
  assert.throws(() => f.service.registerPolicy(f.operatorContext, p), { message: 'POLICY_VERSION_CONFLICT' });
  p.policyVersion = '2'; const newer = f.service.registerPolicy(f.operatorContext, p);
  assert.notEqual(newer.policyHash, f.compiled.policyHash);
  assert.throws(() => f.service.consentChallenge(f.aliceContext, app.applicationId), { message: 'POLICY_SUPERSEDED' });
  assert.equal(f.service.getApplication(f.aliceContext, app.applicationId).policyHash, f.compiled.policyHash);
  assert.equal(f.service.getPolicy(f.bobContext, f.compiled.policyHash).policyHash, f.compiled.policyHash);
  assert.throws(() => f.create(f.bobContext), { message: 'POLICY_SUPERSEDED' });
  assert.throws(() => f.service.registerPolicy(f.bobContext, p), { message: 'FORBIDDEN' });
});

test('idempotent create survives restart; same key different body conflicts; actors are isolated', async t => {
  const f = await fixture(t), app = f.create(); f.restart();
  assert.deepEqual(f.create(), app);
  assert.throws(() => f.service.createApplication(f.aliceContext, { policyHash: '0x' + '00'.repeat(32) }, 'create-1'), { message: 'IDEMPOTENCY_CONFLICT' });
  const second = f.create(f.bobContext);
  assert.notEqual(second.applicationId, app.applicationId);
  assert.equal(f.service.listApplications(f.aliceContext).length, 1);
  assert.equal(f.service.listApplications(f.bobContext).length, 1);
  assert.equal(f.service.listApplications(f.operatorContext).length, 2);
  assert.throws(() => f.service.getApplication(f.bobContext, app.applicationId), { message: 'APPLICATION_NOT_FOUND' });
  assert.throws(() => f.service.consentChallenge(f.bobContext, app.applicationId), { message: 'APPLICATION_NOT_FOUND' });
  assert.equal(f.service.getApplication(f.operatorContext, app.applicationId).state, 'DRAFT');
  assert.throws(() => f.create(f.operatorContext), { message: 'FORBIDDEN' });
});

test('recipient injection, wrong account, wrong chain and missing CSRF reject writes', async t => {
  const f = await fixture(t);
  assert.throws(() => f.service.createApplication(f.aliceContext, { policyHash: f.compiled.policyHash, learner: f.bob.address }, 'x'), { message: 'APPLICATION_SCHEMA' });
  for (const context of [{ ...f.aliceContext, wallet: f.bob.address }, { ...f.aliceContext, chainId: 1 }]) assert.throws(() => f.create(context), { message: 'WALLET_CONTEXT_CHANGED' });
  assert.throws(() => f.create({ ...f.aliceContext, csrf: null }), { message: 'CSRF' });
});

test('typed application consent persists, is idempotent, and never enables funding', async t => {
  const f = await fixture(t), app = f.create(), signed = await f.signedConsent(app);
  const result = f.service.consent(f.aliceContext, app.applicationId, signed.body, 'consent-1');
  assert.equal(result.state, 'TERMS_ACCEPTED'); assert.equal(result.contractConsentRequired, true);
  assert.equal(result.funded, false); assert.equal(result.paymentAllowed, false);
  assert.equal(result.consentDigest, TypedDataEncoder.hash(signed.typed.domain, signed.typed.types, signed.typed.message));
  f.restart(); assert.deepEqual(f.service.consent(f.aliceContext, app.applicationId, signed.body, 'consent-1'), result);
  assert.throws(() => f.service.consent(f.aliceContext, app.applicationId, signed.body, 'consent-2'), { message: 'APPLICATION_STATE' });
  assert.ok(!readFileSync(join(f.directory, 'applications.sqlite')).includes(signed.body.signature));
});

for (const [label, change] of [
  ['policy', x => { x.message.policyHash = '0x' + '00'.repeat(32); }],
  ['learner', x => { x.message.learner = '0x' + '11'.repeat(20); }],
  ['application', x => { x.message.applicationId = '0x' + '00'.repeat(32); }],
  ['origin', x => { x.message.origin = 'https://other.example.invalid'; }],
  ['domain', x => { x.domain.name = 'ClearRefund'; }],
  ['chain', x => { x.domain.chainId = 1; }],
  ['instance', x => { x.domain.salt = '0x' + '00'.repeat(32); }],
  ['timestamp', x => { x.message.signedAt = '1'; }],
  ['expiry', x => { x.message.expiresAt = '9999999999'; }],
]) test(`consent rejects signed ${label} substitution without changing state`, async t => {
  const f = await fixture(t), app = f.create(), { typed, body } = await f.signedConsent(app); change(typed);
  body.signature = await f.alice.signTypedData(typed.domain, typed.types, typed.message);
  assert.throws(() => f.service.consent(f.aliceContext, app.applicationId, body, 'c'), { message: 'SIGNATURE' });
  assert.equal(f.service.getApplication(f.aliceContext, app.applicationId).state, 'DRAFT');
});

test('login signature cannot be used as consent; different session and application are rejected', async t => {
  const f = await fixture(t), app = f.create(), { body } = await f.signedConsent(app);
  const bad = { ...body, signature: await f.alice.signMessage('Sign in to CLEAR') };
  assert.throws(() => f.service.consent(f.aliceContext, app.applicationId, bad, 'c'), { message: 'SIGNATURE' });
  const otherSession = await f.login(f.alice);
  assert.throws(() => f.service.consent(otherSession, app.applicationId, body, 'c'), { message: 'CONSENT_CHALLENGE' });
  const second = f.create(f.aliceContext, 'second');
  assert.throws(() => f.service.consent(f.aliceContext, second.applicationId, body, 'c'), { message: 'CONSENT_CHALLENGE' });
});

test('consent expiry, challenge replacement and policy update invalidate stale pending signatures', async t => {
  const f = await fixture(t), app = f.create(), first = await f.signedConsent(app);
  const second = await f.signedConsent(app);
  assert.throws(() => f.service.consent(f.aliceContext, app.applicationId, first.body, 'c'), { message: 'CONSENT_CHALLENGE' });
  f.setTime(f.time + 600);
  assert.throws(() => f.service.consent(f.aliceContext, app.applicationId, second.body, 'c'), { message: 'CONSENT_CHALLENGE' });
  const third = await f.signedConsent(app), p = draft(); p.policyVersion = '2';
  f.service.registerPolicy(f.operatorContext, p);
  assert.throws(() => f.service.consent(f.aliceContext, app.applicationId, third.body, 'c'), { message: 'POLICY_SUPERSEDED' });
});

test('database rejects environment changes and unsafe permissions', async t => {
  const f = await fixture(t);
  for (const patch of [{ chainId: 431702 }, { instanceId: '0x' + '00'.repeat(32) }, { origin: 'https://other.example.invalid' }]) {
    assert.throws(() => createApplicationService({ ...f.config, ...patch }), { message: 'DB_ENVIRONMENT_MISMATCH' });
  }
  chmodSync(join(f.directory, 'applications.sqlite'), 0o644);
  assert.throws(() => createApplicationService(f.config), { message: 'DB_FILE' });
  chmodSync(join(f.directory, 'applications.sqlite'), 0o600);
});

test('authentication challenge count is bounded per invited wallet', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 10; i++) f.service.challenge({ wallet: f.alice.address, chainId: f.config.chainId });
  assert.throws(() => f.service.challenge({ wallet: f.alice.address, chainId: f.config.chainId }), { message: 'AUTH_RATE_LIMIT' });
});

for (const [field, offset, allowed] of [['enrollmentStart', -1, false], ['enrollmentStart', 0, true],
  ['enrollmentUntil', 0, true], ['enrollmentUntil', 1, false]]) test(`application enrollment ${field} ${offset}`, async t => {
  const f = await fixture(t); f.setTime(Number(f.compiled.policy[field]) + offset);
  const context = await f.login(f.alice);
  if (allowed) assert.equal(f.create(context).state, 'DRAFT');
  else assert.throws(() => f.create(context), { message: 'ENROLLMENT_CLOSED' });
});
