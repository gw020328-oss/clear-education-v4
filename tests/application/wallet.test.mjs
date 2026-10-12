import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { getBytes } from 'ethers';
import { createWalletClient, createSameOriginApi } from '../../src/application/wallet-client.mjs';
import { fixture } from './fixture.mjs';

async function walletFixture(t) {
  const f = await fixture(t), provider = new EventEmitter();
  let wallet = f.alice, chain = '0x' + f.config.chainId.toString(16), hook = () => {}, browserToken, session;
  let verifyCalls = 0, consentCalls = 0;
  provider.request = async ({ method, params }) => {
    await hook(method);
    if (['eth_accounts', 'eth_requestAccounts'].includes(method)) return [wallet.address];
    if (method === 'eth_chainId') return chain;
    if (method === 'personal_sign') return wallet.signMessage(getBytes(params[0]));
    if (method === 'eth_signTypedData_v4') {
      const typed = JSON.parse(params[1]); delete typed.types.EIP712Domain;
      return wallet.signTypedData(typed.domain, typed.types, typed.message);
    }
    throw new Error('Unexpected method');
  };
  const api = async (path, options = {}) => {
    const { body, headers = {} } = options;
    if (path === '/auth/nonce') { const c = f.service.challenge(body); browserToken = c.browserToken; return c; }
    if (path === '/auth/verify') { verifyCalls++; session = f.service.login(body, browserToken, session?.token); return session; }
    const context = { token: session?.token, wallet: headers['x-wallet'], chainId: Number(headers['x-chain-id']), csrf: headers['x-csrf-token'] ?? null };
    if (path === '/auth/session') return f.service.whoami(context);
    if (path === '/auth/logout') return f.service.logout(context);
    if (path === '/applications') return f.service.createApplication(context, body, headers['idempotency-key']);
    const id = path.split('/')[2];
    if (path.endsWith('/consent-challenge')) return f.service.consentChallenge(context, id);
    if (path.endsWith('/consent')) { consentCalls++; return f.service.consent(context, id, body, headers['idempotency-key']); }
    return f.service.getApplication(context, id);
  };
  const client = createWalletClient({ provider, api, chainId: f.config.chainId }); t.after(() => client.dispose());
  return { ...f, client, provider, api,
    setHook(fn) { hook = fn; }, setWallet(w) { wallet = w; }, setChain(c) { chain = c; },
    get verifyCalls() { return verifyCalls; }, get consentCalls() { return consentCalls; } };
}

test('EIP-1193 controller connects, signs SIWE, creates application and signs separate terms', async t => {
  const f = await walletFixture(t); await f.client.connect(); await f.client.login();
  const app = await f.client.request('/applications', { method: 'POST', body: { policyHash: f.compiled.policyHash }, idempotencyKey: 'wallet-create' });
  const accepted = await f.client.consent(app.applicationId, 'wallet-consent');
  assert.equal(accepted.state, 'TERMS_ACCEPTED'); assert.equal(accepted.paymentAllowed, false);
  assert.equal(f.verifyCalls, 1); assert.equal(f.consentCalls, 1);
});

test('reconnected browser restores its session and application, then durably logs out', async t => {
  const f = await walletFixture(t); await f.client.connect(); await f.client.login();
  const app = await f.client.request('/applications', { method: 'POST', body: { policyHash: f.compiled.policyHash }, idempotencyKey: 'before-reconnect' });
  f.client.dispose();
  const next = createWalletClient({ provider: f.provider, api: f.api, chainId: f.config.chainId }); t.after(() => next.dispose());
  await next.connect(); await next.resume();
  assert.equal((await next.request('/applications/' + app.applicationId)).applicationId, app.applicationId);
  await next.logout();
  await assert.rejects(() => next.request('/applications'), { message: 'WALLET_CONTEXT_CHANGED' });
  await next.connect(); await assert.rejects(() => next.resume(), { message: 'AUTH_REQUIRED' });
});

for (const event of ['accountsChanged', 'chainChanged', 'disconnect']) test(`${event} clears authenticated client state`, async t => {
  const f = await walletFixture(t); await f.client.connect(); await f.client.login(); f.provider.emit(event);
  await assert.rejects(() => f.client.request('/applications'), { message: 'WALLET_CONTEXT_CHANGED' });
  await f.client.connect(); await assert.rejects(() => f.client.request('/applications'), { message: 'AUTH_REQUIRED' });
});

test('account changes during login signing discard the signature before submission', async t => {
  const f = await walletFixture(t); await f.client.connect();
  f.setHook(method => { if (method === 'personal_sign') { f.setWallet(f.bob); f.provider.emit('accountsChanged'); } });
  await assert.rejects(() => f.client.login(), { message: 'WALLET_CONTEXT_CHANGED' }); assert.equal(f.verifyCalls, 0);
});

test('chain changes during consent signing discard the signature before submission', async t => {
  const f = await walletFixture(t); await f.client.connect(); await f.client.login();
  const app = await f.client.request('/applications', { method: 'POST', body: { policyHash: f.compiled.policyHash }, idempotencyKey: 'wallet-create' });
  f.setHook(method => { if (method === 'eth_signTypedData_v4') { f.setChain('0x1'); f.provider.emit('chainChanged'); } });
  await assert.rejects(() => f.client.consent(app.applicationId, 'wallet-consent'), { message: 'WALLET_CONTEXT_CHANGED' });
  assert.equal(f.consentCalls, 0); assert.equal(f.service.getApplication(f.aliceContext, app.applicationId).state, 'DRAFT');
});

test('silent account or chain changes are detected even without provider events', async t => {
  const f = await walletFixture(t); await f.client.connect(); await f.client.login(); f.setWallet(f.bob);
  await assert.rejects(() => f.client.request('/applications'), { message: 'WALLET_CONTEXT_CHANGED' });
  await f.client.connect(); await f.client.login(); f.setChain('0x1');
  await assert.rejects(() => f.client.request('/applications'), { message: 'WALLET_CONTEXT_CHANGED' });
});

test('wrong chain, user cancellation and malformed provider results fail with fixed errors', async t => {
  const f = await walletFixture(t); f.setChain('0x1');
  await assert.rejects(() => f.client.connect(), { message: 'WRONG_CHAIN' });
  f.setChain('0x' + f.config.chainId.toString(16)); await f.client.connect();
  f.setHook(method => { if (method === 'personal_sign') throw Object.assign(new Error('private-provider-detail'), { code: 4001 }); });
  await assert.rejects(() => f.client.login(), { message: 'WALLET_REJECTED' }); assert.equal(f.verifyCalls, 0);
  f.setHook(() => {}); f.setChain('private-provider-detail');
  await assert.rejects(() => f.client.login(), { message: 'WALLET_CONTEXT_CHANGED' });
});

test('dispose removes listeners and invalidates pending operations', async t => {
  const f = await walletFixture(t); await f.client.connect(); f.client.dispose();
  for (const event of ['accountsChanged', 'chainChanged', 'disconnect']) assert.equal(f.provider.listenerCount(event), 0);
  await assert.rejects(() => f.client.connect(), { message: 'WALLET_DISPOSED' });
});

test('browser API always uses same-origin credentials and forbids external URLs/redirects', async () => {
  let observed;
  const api = createSameOriginApi({ origin: 'https://clear.example.invalid', fetch: async (url, options) => {
    observed = { url, options }; return { ok: true, json: async () => ({ ok: true }) };
  } });
  await api('/applications', { method: 'POST', body: { test: true } });
  assert.equal(observed.options.credentials, 'same-origin'); assert.equal(observed.options.redirect, 'error');
  assert.equal(observed.options.cache, 'no-store');
  for (const path of ['https://other.example.invalid', '//other.example.invalid', '/\\other.example.invalid']) await assert.rejects(() => api(path), { message: 'API_ORIGIN' });
});
