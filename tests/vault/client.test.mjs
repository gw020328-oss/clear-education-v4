import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { request } from 'node:http';
import { createApplicationServer } from '../../src/application/http.mjs';
import { createWalletClient } from '../../src/application/wallet-client.mjs';
import { fixture } from './fixture.mjs';

async function browser(t) {
  const f = await fixture(t), provider = new EventEmitter();
  let hook = () => {}, alter = typed => typed, signs = 0, submits = 0;
  provider.request = async ({ method, params }) => {
    if (['eth_accounts', 'eth_requestAccounts'].includes(method)) return [f.app.alice.address];
    if (method === 'eth_chainId') return '0x' + f.app.config.chainId.toString(16);
    if (method === 'eth_signTypedData_v4') {
      signs++; hook(); const typed = JSON.parse(params[1]); delete typed.types.EIP712Domain;
      return f.sign(typed);
    }
    throw new Error('Unexpected RPC');
  };
  const api = async (path, { body, headers }) => {
    const c = { token: f.app.aliceContext.token, wallet: headers['x-wallet'], chainId: Number(headers['x-chain-id']), csrf: headers['x-csrf-token'] ?? null };
    if (path === '/auth/session') return f.app.service.whoami(c);
    const appId = path.split('/')[2];
    if (path.endsWith('/final-consent-challenge')) return alter(await f.app.service.finalConsentChallenge(c, appId));
    if (path.endsWith('/final-consent')) { submits++; return f.app.service.finalConsent(c, appId, body); }
    throw new Error('Unexpected API');
  };
  const client = createWalletClient({ provider, api, chainId: f.app.config.chainId });
  t.after(() => client.dispose()); await client.connect(); await client.resume();
  const app = f.app.create(), pre = await f.app.signedConsent(app);
  f.app.service.consent(f.app.aliceContext, app.applicationId, pre.body, 'pre');
  return { f, client, provider, app, setHook(h) { hook = h; }, setAlter(h) { alter = h; }, get signs() { return signs; }, get submits() { return submits; } };
}

test('wallet signs separate final contract consent only against the reviewed deployment record', async t => {
  const b = await browser(t), result = await b.client.finalConsent(b.app.applicationId, b.f.record);
  assert.equal(result.state, 'CONSENTED'); assert.equal(b.signs, 1); assert.equal(b.submits, 1);
});

for (const field of ['deployment', 'amount', 'types', 'domain', 'learner', 'policy']) test(`wallet refuses changed ${field} before opening signature approval`, async t => {
  const b = await browser(t);
  b.setAlter(typed => {
    const changed = structuredClone(typed);
    if (field === 'deployment') changed.runtime.deployment.vaultAddress = b.f.app.bob.address;
    if (field === 'amount') changed.runtime.config.amount = '1';
    if (field === 'types') changed.types.TermsAcceptanceV4.push({ name: 'extra', type: 'uint256' });
    if (field === 'domain') changed.domain.verifyingContract = b.f.app.bob.address;
    if (field === 'learner') changed.message.learner = b.f.app.bob.address;
    if (field === 'policy') changed.message.policyHash = '0x' + '00'.repeat(32);
    return changed;
  });
  await assert.rejects(() => b.client.finalConsent(b.app.applicationId, b.f.record), /CONSENT_CONTEXT/);
  assert.equal(b.signs, 0); assert.equal(b.submits, 0);
});

test('wallet context change during final signing discards the signature', async t => {
  const b = await browser(t); b.setHook(() => b.provider.emit('accountsChanged'));
  await assert.rejects(() => b.client.finalConsent(b.app.applicationId, b.f.record), /WALLET_CONTEXT_CHANGED/);
  assert.equal(b.submits, 0); assert.equal(b.f.app.service.getApplication(b.f.app.aliceContext, b.app.applicationId).state, 'TERMS_ACCEPTED');
});

test('HTTP runtime, final consent, funding intent and confirmation preserve role and body boundaries', async t => {
  const f = await fixture(t, { bind: false }), server = createApplicationServer(f.app.service, { allowLoopbackHttpForTests: true });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const call = (path, context, body) => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: server.address().port, path, method: body === undefined ? 'GET' : 'POST',
      headers: { host: 'clear.example.invalid', origin: f.app.config.origin, 'content-type': 'application/json',
        cookie: '__Host-clear-session=' + context.token, 'x-wallet': context.wallet, 'x-chain-id': String(context.chainId), 'x-csrf-token': context.csrf } }, res => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks)) }));
    }); req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  const { aliceContext, operatorContext } = f.app;
  assert.equal((await call('/runtimes', aliceContext, { policyHash: f.app.compiled.policyHash })).status, 403);
  const bound = await call('/runtimes', operatorContext, { policyHash: f.app.compiled.policyHash }); assert.equal(bound.status, 200);
  assert.deepEqual((await call('/runtimes/' + f.app.compiled.policyHash, aliceContext)).body, bound.body);
  const app = f.app.create(), pre = await f.app.signedConsent(app); f.app.service.consent(aliceContext, app.applicationId, pre.body, 'pre');
  const base = '/applications/' + app.applicationId;
  for (const route of ['final-consent-challenge', 'funding-intent']) {
    for (const body of [[], null, { funded: true }]) assert.equal((await call(base + '/' + route, aliceContext, body)).status, 422);
  }
  const challenge = await call(base + '/final-consent-challenge', aliceContext, {}); assert.equal(challenge.status, 200);
  const typed = challenge.body, signature = await f.sign(typed);
  const accepted = await call(base + '/final-consent', aliceContext, { nonce: typed.message.nonce.slice(2), signature });
  assert.equal(accepted.body.state, 'CONSENTED');
  assert.equal((await call(base + '/funding-intent', aliceContext, {})).status, 403);
  const intent = await call(base + '/funding-intent', operatorContext, {}); assert.equal(intent.body.application.state, 'FUNDING_PENDING');
  assert.equal((await call(base + '/funding-confirmation', operatorContext, { funded: true })).body.code, 'FUNDING_SCHEMA');
  await (await f.token.approve(f.pin.vaultAddress, f.config.amount)).wait();
  const tx = await f.signer.sendTransaction(intent.body.transaction); await tx.wait();
  const confirmed = await call(base + '/funding-confirmation', operatorContext, { transactionHash: tx.hash });
  assert.equal(confirmed.status, 200); assert.equal(confirmed.body.state, 'ENROLLED'); assert.equal(confirmed.body.paymentAllowed, false);
});
