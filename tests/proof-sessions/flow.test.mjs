import test from 'node:test';
import assert from 'node:assert/strict';
import { id } from 'ethers';
import { browser, deferred } from './wallet-fixture.mjs';
import { createProofSessionFlow } from '../../src/application/proof-session-flow.mjs';

async function fixture(t) {
  const f = await browser(t), calls = []; let hook = async () => {}, receipt = null, approvals = 0;
  const base = `/applications/${f.applicationId}/proof-sessions`, path = `${base}/${f.session.proofSessionId}`;
  const walletClient = {
    async request(url, options = {}) {
      calls.push({ url, options: { ...options, body: structuredClone(options.body) } });
      let value;
      if (url === base) value = await f.client.request(path);
      else if (url === path + '/cancel') { f.mutate(p => p.state = 'CANCELLED'); value = await f.client.request(path); }
      else if (url === path + '/result') value = receipt ?? { proofSessionId: f.session.proofSessionId, state: 'NOT_ACCEPTED',
        dataMode: 'SYNTHETIC', liveSupported: false, collectionEnabled: false, proofVerified: false, paymentAllowed: false };
      else value = await f.client.request(url, options);
      const changed = await hook(url, options, value); return changed ?? value;
    },
    authorizeProofSession: (...args) => { approvals++; return f.client.authorizeProofSession(...args); },
  };
  const flow = createProofSessionFlow({ walletClient, provider: f.provider, applicationId: f.applicationId, clock: () => f.time });
  t.after(() => flow.dispose());
  const input = { ownerPublicKey: f.owner.signingKey.publicKey, idempotencyKey: 'synthetic-create-key' };
  return { ...f, flow, input, base, path, calls, walletClient,
    get approvalCalls() { return approvals; },
    start: () => flow.start(input), approve: () => flow.authorize({ revision: flow.getState().revision, reviewedRuntime: f.runtime, ownerPublicKey: input.ownerPublicKey }),
    hook(fn) { hook = fn; }, setReceipt(v) { receipt = v; } };
}
const network = () => Object.assign(new Error('private-network-detail'), { code: 'API_NETWORK', outcome: 'UNKNOWN' });

test('subscriber observes create, review, separate wallet authorization, read and cancellation as synthetic states', async t => {
  const f = await fixture(t), phases = [], unsubscribe = f.flow.subscribe(s => phases.push(s.phase));
  assert.equal(f.flow.getState().phase, 'IDLE'); const created = await f.start();
  assert.equal(created.session.state, 'ISSUED'); assert.equal(created.session.ownerPublicKey, f.input.ownerPublicKey);
  assert.equal((await f.approve()).session.state, 'AUTHORIZED');
  const checked = await f.flow.refresh(); assert.equal(checked.result.state, 'NOT_ACCEPTED');
  const cancelled = await f.flow.cancel(); assert.equal(cancelled.session.state, 'CANCELLED');
  assert.equal(cancelled.result, null); assert.equal(cancelled.paymentAllowed, false); assert.equal(cancelled.collectionEnabled, false);
  assert.equal(cancelled.proofVerified, false); assert.equal(cancelled.grantOutboxEnabled, false);
  assert.deepEqual(phases, ['IDLE','BUSY','READY','BUSY','READY','BUSY','READY','BUSY','READY']); unsubscribe();
  assert.equal(JSON.stringify(cancelled).includes('requestNonce'), false);
  assert.equal(JSON.stringify(cancelled).includes('typedData'), false);
});

test('lost creation response locks new creation and explicit retry keeps exactly the same key and owner', async t => {
  const f = await fixture(t); let lose = true;
  f.hook(url => { if (url === f.base && lose) throw network(); });
  await assert.rejects(f.start(), { code: 'API_NETWORK' });
  assert.equal(f.flow.getState().phase, 'RECOVERY_REQUIRED'); assert.equal(f.flow.getState().creationRecovery, true);
  await assert.rejects(f.flow.start({ ...f.input, idempotencyKey: 'different' }), { code: 'FLOW_RECOVERY_REQUIRED' });
  lose = false; assert.equal((await f.flow.retryStart()).session.state, 'ISSUED');
  const calls = f.calls.filter(c => c.url === f.base); assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].options.body, calls[1].options.body); assert.equal(calls[0].options.idempotencyKey, calls[1].options.idempotencyKey);
});

test('a failed recovery attempt cannot erase an earlier uncertain creation', async t => {
  const f = await fixture(t); f.hook(url => { if (url === f.base) throw network(); }); await assert.rejects(f.start());
  f.hook(url => { if (url === f.base) throw Object.assign(new Error('private'), { code: 'AUTH_REQUIRED', outcome: 'HTTP_ERROR' }); });
  await assert.rejects(f.flow.retryStart(), { code: 'AUTH_REQUIRED', nextAction: 'SIGN_IN_AGAIN' });
  assert.equal(f.flow.getState().creationRecovery, true);
  await assert.rejects(f.start(), { code: 'FLOW_RECOVERY_REQUIRED' });
  f.hook(() => {}); await f.flow.refresh(f.session.proofSessionId); assert.equal(f.flow.getState().creationRecovery, false);
});

test('create inputs are pinned before observer callbacks can mutate caller objects', async t => {
  const f = await fixture(t); f.flow.subscribe(s => { if (s.phase === 'BUSY') f.input.idempotencyKey = 'mutated-key'; });
  await f.start(); assert.equal(f.calls[0].options.idempotencyKey, 'synthetic-create-key');
});

test('busy actions and stale review revisions cannot trigger another signature or write', async t => {
  const f = await fixture(t), entered = deferred(), release = deferred();
  f.hook(async url => { if (url === f.base) { entered.resolve(); await release.promise; } });
  const starting = f.start(); await entered.promise; await assert.rejects(f.start(), { code: 'FLOW_BUSY' });
  await assert.rejects(f.flow.cancel(), { code: 'FLOW_BUSY' }); release.resolve(); const reviewed = await starting;
  f.hook(() => {}); await f.flow.refresh();
  await assert.rejects(f.flow.authorize({ revision: reviewed.revision, reviewedRuntime: f.runtime, ownerPublicKey: f.input.ownerPublicKey }), { code: 'FLOW_REVIEW_REQUIRED' });
  assert.equal(f.approvalCalls, 0); assert.equal(f.calls.filter(c => c.url === f.base).length, 1);
});

for (const op of ['CREATE', 'READ', 'SIGN', 'CANCEL']) test(`local stop during ${op} never reports server cancellation or late success`, async t => {
  const f = await fixture(t), entered = deferred(), release = deferred();
  if (op !== 'CREATE') await f.start();
  if (op === 'SIGN') f.setHook(async method => { if (method === 'eth_signTypedData_v4') { entered.resolve(); await release.promise; } });
  else f.hook(async url => { if (url === (op === 'CREATE' ? f.base : op === 'READ' ? f.path : f.path + '/cancel')) { entered.resolve(); await release.promise; } });
  const pending = op === 'CREATE' ? f.start() : op === 'READ' ? f.flow.refresh() : op === 'SIGN' ? f.approve() : f.flow.cancel();
  await entered.promise; f.flow.stop(); await assert.rejects(pending, { code: 'API_ABORTED' });
  const snapshot = f.flow.getState(); assert.equal(snapshot.needsRefresh, true);
  if (snapshot.session) assert.equal(snapshot.session.state, 'ISSUED');
  release.resolve(); await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(f.flow.getState(), snapshot);
  if (op === 'READ') assert.equal(f.calls.filter(c => c.url.endsWith('/result')).length, 0);
});

for (const event of ['accountsChanged', 'chainChanged', 'disconnect', 'dispose']) test(`${event} clears the screen and rejects late replies`, async t => {
  const f = await fixture(t), entered = deferred(), release = deferred(); await f.start();
  f.hook(async url => { if (url === f.path) { entered.resolve(); await release.promise; } });
  const pending = f.flow.refresh(); await entered.promise;
  if (event === 'dispose') f.flow.dispose(); else f.provider.emit(event);
  await assert.rejects(pending, { code: event === 'dispose' ? 'FLOW_DISPOSED' : 'FLOW_CONTEXT_CHANGED' });
  assert.equal(f.flow.getState().session, null); assert.equal(f.flow.getState().result, null);
  release.resolve(); await new Promise(resolve => setImmediate(resolve)); assert.equal(f.flow.getState().session, null);
});

test('unknown error details cannot reach the view or rejected promise', async t => {
  const f = await fixture(t); f.hook(() => { throw Object.assign(new Error('private-source-detail'), { code: 'PRIVATE_CODE', nextAction: 'SEND_SECRET', extra: 'private' }); });
  await assert.rejects(f.start(), { message: 'API_REQUEST_FAILED', code: 'API_REQUEST_FAILED', nextAction: 'CHECK_RESULT' });
  assert.equal(JSON.stringify(f.flow.getState()).includes('private'), false);
});

for (const mutate of [p => p.applicationId = id('other'), p => p.proofSessionId = id('other'), p => p.paymentAllowed = true,
  p => p.collectionEnabled = true, p => p.proofVerified = true, p => p.dataMode = 'REAL', p => p.state = 'PAID',
  p => p.typedData.message.ownerPublicKey = 'invalid', p => p.typedData.message.policyHash = 'invalid']) {
  test('invalid session response fails closed with stale state', async t => {
    const f = await fixture(t); await f.start(); f.hook((url, options, p) => { if (url === f.path) mutate(p); });
    await assert.rejects(f.flow.refresh(), { code: 'FLOW_RESPONSE_INVALID' }); assert.equal(f.flow.getState().needsRefresh, true);
    await assert.rejects(f.approve(), { code: 'FLOW_REVIEW_REQUIRED' });
  });
}

test('historical synthetic acceptance is separate from cancelled session and never grants eligibility', async t => {
  const f = await fixture(t); await f.start(); await f.approve();
  f.setReceipt({ proofSessionId: f.session.proofSessionId, state: 'ACCEPTED_SYNTHETIC', acceptedAt: String(f.time),
    dataMode: 'SYNTHETIC', liveSupported: false, collectionEnabled: false, proofVerified: false, paymentAllowed: false,
    rawProof: 'must-not-reach-view', snapshotHash: id('unneeded') });
  await f.flow.cancel(); const state = await f.flow.refresh();
  assert.equal(state.session.state, 'CANCELLED'); assert.deepEqual(state.result, { state: 'ACCEPTED_SYNTHETIC', acceptedAt: String(f.time) });
  assert.equal(state.proofVerified, false); assert.equal(state.paymentAllowed, false); assert.equal(JSON.stringify(state).includes('rawProof'), false);
});

test('bad result scope and live claims are rejected without displaying them', async t => {
  const f = await fixture(t); await f.start(); f.setReceipt({ proofSessionId: id('other'), state: 'ACCEPTED_SYNTHETIC', liveSupported: true });
  await assert.rejects(f.flow.refresh(), { code: 'FLOW_RESPONSE_INVALID' }); assert.equal(f.flow.getState().result, null);
});

test('a lost cancellation reply keeps last known state stale until explicit refresh', async t => {
  const f = await fixture(t); await f.start(); f.hook(url => { if (url.endsWith('/cancel')) throw network(); });
  await assert.rejects(f.flow.cancel(), { code: 'API_NETWORK' }); assert.equal(f.flow.getState().session.state, 'ISSUED');
  assert.equal(f.flow.getState().phase, 'RECOVERY_REQUIRED'); f.hook(() => {});
  assert.equal((await f.flow.refresh()).session.state, 'CANCELLED');
});

test('a failed switch to another session cannot cancel the previous selection', async t => {
  const f = await fixture(t); await f.start(); await assert.rejects(f.flow.refresh(id('different')));
  assert.equal(f.flow.getState().session, null); await assert.rejects(f.flow.cancel(), { code: 'FLOW_REFRESH_REQUIRED' });
});

test('subscriber exceptions are isolated, snapshots are immutable and dispose removes only its listeners', async t => {
  const f = await fixture(t), counts = f.provider.listenerCount('accountsChanged');
  const unsubscribe = f.flow.subscribe(() => { throw new Error('view failed'); }); await f.start(); unsubscribe();
  assert.throws(() => f.flow.getState().session.state = 'PAID', TypeError);
  f.flow.dispose(); assert.equal(f.provider.listenerCount('accountsChanged'), counts - 1);
  await assert.rejects(f.start(), { code: 'FLOW_DISPOSED' });
});

test('silent wallet changes detected during a read clear prior identity and close the flow', async t => {
  const f = await fixture(t); await f.start(); f.setAccount(f.other.address);
  await assert.rejects(f.flow.refresh(), { code: 'FLOW_CONTEXT_CHANGED' });
  assert.equal(f.flow.getState().phase, 'CONTEXT_CHANGED'); assert.equal(f.flow.getState().session, null);
  await assert.rejects(f.start(), { code: 'FLOW_CONTEXT_CHANGED' });
});

test('unknown creation can only be resolved by a read bound to the original owner', async t => {
  const f = await fixture(t); f.hook(url => { if (url === f.base) throw network(); }); await assert.rejects(f.start());
  f.hook(() => {}); f.mutate(p => p.typedData.message.ownerPublicKey = f.other.signingKey.publicKey);
  await assert.rejects(f.flow.refresh(f.session.proofSessionId), { code: 'FLOW_RESPONSE_INVALID' });
  assert.equal(f.flow.getState().creationRecovery, true); assert.equal(f.flow.getState().session, null);
});

test('runtime reviewed by the caller is detached before BUSY notification', async t => {
  const f = await fixture(t); await f.start();
  const expected = structuredClone(f.runtime); f.flow.subscribe(s => { if (s.operation === 'AUTHORIZE') expected.config.amount = '999'; });
  const result = await f.flow.authorize({ revision: f.flow.getState().revision, reviewedRuntime: expected, ownerPublicKey: f.input.ownerPublicKey });
  assert.equal(result.session.state, 'AUTHORIZED');
});
