import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Wallet, id, getBytes} from 'ethers';
import {mkdtempSync, rmSync, realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pinnedWallet} from '../../src/embedded-wallet/provider-boundary.mjs';
import {walletChoices, selectedIdentity} from '../../src/embedded-wallet/privy-adapter.mjs';
import {validateConfig, privyConfig, embeddedCsp} from '../../src/embedded-wallet/config.mjs';
import {createClearSession} from '../../src/embedded-wallet/clear-session.mjs';
import {createApplicationService} from '../../src/application/service.mjs';

const CHAIN = 1298374561, NOW = 1900000000;
export const config = {origin: 'https://127.0.0.1:9457', redirectUri: 'https://127.0.0.1:9457/onboarding', appId: null,
  rpcUrl: 'http://127.0.0.1:9458', phase: 'ACTIVE_LOCAL_TEST', chainId: CHAIN, instanceId: id('synthetic-wallet-instance')};
function actor(t, {timeoutMs = 1000} = {}) {
  const w = Wallet.createRandom(), provider = new EventEmitter(); let hook = () => {}, invalidations = 0, session;
  const identity = {sdkUserId: 'did:privy:synthetic', walletId: 'synthetic-wallet', address: w.address, chainId: CHAIN};
  provider.request = async q => {
    await hook(q);
    if (q.method === 'eth_accounts') return [w.address];
    if (q.method === 'eth_chainId') return '0x' + CHAIN.toString(16);
    if (q.method === 'personal_sign') return w.signMessage(getBytes(q.params[0]));
    if (q.method === 'eth_signTypedData_v4') { const p = JSON.parse(q.params[1]); delete p.types.EIP712Domain; return w.signTypedData(p.domain, p.types, p.message); }
    throw Error('RPC_FORBIDDEN');
  };
  const wallet = pinnedWallet({provider, identity, readIdentity: () => identity, timeoutMs,
    onInvalidate: () => { invalidations++; return session?.invalidate(); }});
  t.after(() => wallet.dispose());
  return {w, provider, wallet, identity, hook: h => { hook = h; }, setSession: s => {session = s;}, get invalidations() { return invalidations; }};
}
function fixture(t) {
  const a = actor(t), directory = realpathSync(mkdtempSync(join(tmpdir(), 'clear-embedded-auth-')));
  const service = createApplicationService({directory, origin: config.origin, chainId: CHAIN, instanceId: config.instanceId,
    participants: [a.w.address], operators: [Wallet.createRandom().address], now: () => NOW});
  let browser, cookie, hook = async () => {}, observed = [];
  const context = h => ({token: cookie, wallet: h?.['x-wallet'], chainId: Number(h?.['x-chain-id']), csrf: h?.['x-csrf-token'] ?? null});
  const api = async (path, options = {}) => {
    observed.push(path); await hook(path, options);
    if (path === '/auth/nonce') { const c = service.challenge(options.body); browser = c.browserToken; return c; }
    if (path === '/auth/verify') { const s = service.login(options.body, browser, cookie); cookie = s.token; const {token, ...result} = s; return result; }
    if (path === '/auth/session') return service.whoami(context(options.headers));
    if (path === '/auth/logout') return service.logout(context(options.headers));
    service.whoami(context(options.headers)); return {ok: true};
  };
  const s = createClearSession({wallet: a.wallet, api, config, now: () => NOW}); a.setSession(s);
  t.after(async () => { await s.dispose().catch(() => {}); service.close(); rmSync(directory, {recursive: true, force: true}); });
  return {...a, s, service, api, observed, setHook: h => {hook = h;}, context: () => ({token: cookie, wallet: a.w.address, chainId: CHAIN, csrf: null})};
}
test('server role is bound to selected SDK identity; logout revokes real service', async t => {
  const f = fixture(t), binding = await f.s.authenticate();
  assert.equal(binding.role, 'participant'); assert.equal(binding.sdkUserId, f.identity.sdkUserId);
  assert.deepEqual(await f.s.request('/test'), {ok: true});
  await f.s.logout(); assert.equal(f.s.state().revocation, 'CONFIRMED');
  assert.throws(() => f.service.whoami(f.context()), /AUTH_REQUIRED/);
});
test('wallet change revokes using previous address even after SDK invalidation', async t => {
  const f = fixture(t); await f.s.authenticate();
  f.identity.address = Wallet.createRandom().address;
  f.provider.emit('accountsChanged'); await f.s.invalidate();
  assert.equal(f.s.state().revocation, 'CONFIRMED');
  await assert.rejects(f.s.request('/test'), /CANCELLED/);
  assert.throws(() => f.service.whoami(f.context()), /AUTH_REQUIRED/);
});
test('late auth verification after logout is revoked, never authenticated locally', async t => {
  const f = fixture(t); let release, started;
  const gate = new Promise(r => {release = r;}), ready = new Promise(r => {started = r;});
  f.setHook(async path => { if (path === '/auth/verify') {started(); await gate;} });
  const login = f.s.authenticate(), rejection = assert.rejects(login, /CANCELLED/);
  await ready; const closing = f.s.logout(); release(); await rejection; await closing;
  assert.equal(f.s.state().revocation, 'CONFIRMED'); assert.equal(f.s.state().authenticated, false);
  assert.throws(() => f.service.whoami(f.context()), /AUTH_REQUIRED/);
});
test('revoke network failure remains UNKNOWN and explicit retry confirms', async t => {
  const f = fixture(t); await f.s.authenticate();
  f.setHook(async path => {if (path === '/auth/logout') throw Error('NETWORK');});
  await assert.rejects(f.s.logout(), /REVOKE_UNKNOWN/); assert.equal(f.s.state().revocation, 'UNKNOWN');
  f.setHook(async () => {}); await f.s.retryRevocation(); assert.equal(f.s.state().revocation, 'CONFIRMED');
});
test('lost verify response cannot be declared revoked by a later empty-cookie 401', async t => {
  const f = fixture(t);
  f.setHook(async path => {if (path === '/auth/verify') throw Object.assign(Error('API_TIMEOUT'), {outcome:'UNKNOWN'});});
  await assert.rejects(f.s.authenticate(), /API_TIMEOUT/);
  await assert.rejects(f.s.logout(), /REVOKE_UNKNOWN/);
  assert.equal(f.s.state().revocation, 'UNKNOWN'); assert.equal(f.s.state().authenticated, false);
  await assert.rejects(f.s.authenticate(), /SESSION_BUSY/);
});
test('onboarding cannot use CLEAR auth or infer operator role', async t => {
  const a = actor(t); const s = createClearSession({wallet: a.wallet, api: () => assert.fail('no HTTP'), config: {...config, phase: 'ONBOARDING_ONLY'}});
  await assert.rejects(s.authenticate(), /ONBOARDING_ONLY/); await s.dispose();
});
test('server-side session revocation clears local authentication before further requests', async t => {
  const f = fixture(t); await f.s.authenticate();
  f.setHook(async path => {if (path === '/auth/session') throw Error('AUTH_REQUIRED');});
  await assert.rejects(f.s.request('/test'), /AUTH_REQUIRED/);
  assert.equal(f.s.state().authenticated, false); assert.ok(!f.observed.includes('/test'));
});
for (const method of ['eth_accounts','eth_chainId','personal_sign']) test('bounded hung provider ' + method, async t => {
  const a = actor(t, {timeoutMs: 25}); a.hook(q => q.method === method ? new Promise(() => {}) : undefined);
  await assert.rejects(a.wallet.personal('test', {expiresAt: NOW + 120, now: () => NOW}), /TIMEOUT|CANCELLED|SIGN_FAILED/);
  assert.equal(a.invalidations, 1);
  await assert.rejects(a.wallet.personal('second prompt must not overlap', {expiresAt: NOW + 120, now: () => NOW}), /CANCELLED/);
});
test('caller abort cancels hung identity reads without waiting for provider', async t => {
  const a = actor(t), c = new AbortController(); a.hook(() => new Promise(() => {}));
  const pending = a.wallet.personal('test', {expiresAt: NOW + 120, now: () => NOW, signal: c.signal});
  c.abort(); await assert.rejects(pending, /CANCELLED/);
});
test('SDK choices require explicit owned EOA; no array-first or delegated fallback', () => {
  const address = Wallet.createRandom().address;
  const account = {type:'wallet',chainType:'ethereum',walletClientType:'privy-v2',connectorType:'embedded',address,
    imported:false,delegated:false,userCanSign:true,walletIndex:0,id:'synthetic-id'};
  const wallet = {type:'ethereum',walletClientType:'privy-v2',connectorType:'embedded',linked:true,imported:false,address,walletIndex:0,chainId:`eip155:${CHAIN}`};
  const user = {id:'did:privy:synthetic', linkedAccounts:[account]}, choices = walletChoices(user,[wallet]);
  assert.equal(choices.length,1);
  const snapshot = {ready:true,authenticated:true,walletsReady:true,user,wallets:[wallet]};
  assert.equal(selectedIdentity(snapshot,choices[0],CHAIN).address,address);
  assert.throws(() => selectedIdentity({...snapshot,user:{...user,id:'other'}},choices[0],CHAIN), /SELECTION_CHANGED/);
  assert.throws(() => selectedIdentity(snapshot,choices[0],CHAIN+1), /CHAIN_CHANGED/);
  for (const patch of [{delegated:true},{imported:true},{userCanSign:false},{chainType:'solana'},{walletClientType:'metamask'}])
    assert.deepEqual(walletChoices({...user,linkedAccounts:[{...account,...patch}]},[wallet]),[]);
  const legacy = walletChoices({...user,linkedAccounts:[{...account,id:null}]},[wallet])[0];
  assert.equal(legacy.walletIdKind,'local-locator'); assert.match(legacy.walletId,/^legacy:/);
});
test('exact loopback config, one explicit custom chain, no explorer or default mainnet', () => {
  assert.equal(validateConfig(config).chainId,CHAIN);
  const p = privyConfig(config, 'abcdefghijklmnopqrstuvwx');
  assert.equal(p.supportedChains.length,1); assert.equal(p.defaultChain.id,CHAIN);
  assert.equal(p.defaultChain.blockExplorers,undefined); assert.equal(p.embeddedWallets.disableAutomaticMigration,true);
  assert.equal(p.embeddedWallets.ethereum.createOnLogin,'off');
  for (const patch of [{origin:'http://127.0.0.1:9457'},{rpcUrl:'https://public.example/rpc'},{redirectUri:config.origin+'/'},{chainId:null}])
    assert.throws(() => validateConfig({...config,...patch}), /EMBEDDED_/);
});
test('narrow nonce CSP has only explicit hosts and rejects injection', () => {
  const csp = embeddedCsp('abcdefghijklmnopqrstuvwx',config.rpcUrl);
  assert.ok(csp.includes('frame-src https://auth.privy.io https://challenges.cloudflare.com'));
  assert.ok(csp.includes("style-src-attr 'none'")); assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|\*|walletconnect|rpc\.privy/);
  assert.throws(() => embeddedCsp("'; default-src *",config.rpcUrl),/NONCE/);
});
