import test from 'node:test';
import assert from 'node:assert/strict';
import { Wallet } from 'ethers';
import { browser } from './wallet-http-fixture.mjs';
import { createProofSessionFlow } from '../../src/application/proof-session-flow.mjs';

async function fixture(t) {
  const f = await browser(t); f.cancel(f.session);
  const owner = Wallet.createRandom(), flow = createProofSessionFlow({ walletClient: f.client, provider: f.provider,
    applicationId: f.applicationId, clock: () => f.app.time });
  t.after(() => flow.dispose());
  const input = { ownerPublicKey: owner.signingKey.publicKey, idempotencyKey: 'flow-new-creation' };
  return { f, flow, input, approve: () => flow.authorize({ revision: flow.getState().revision, reviewedRuntime: f.record, ownerPublicKey: input.ownerPublicKey }) };
}

test('HTTPS flow creates a fresh session, reviews, authorizes, reads result and cancels without proof acceptance', async t => {
  const { f, flow, input, approve } = await fixture(t);
  const created = await flow.start(input); assert.notEqual(created.session.proofSessionId, f.session.proofSessionId);
  assert.equal(created.session.state, 'ISSUED'); assert.equal((await approve()).session.state, 'AUTHORIZED');
  const checked = await flow.refresh(); assert.equal(checked.result.state, 'NOT_ACCEPTED');
  assert.equal((await flow.cancel()).session.state, 'CANCELLED');
  assert.equal((await flow.refresh()).session.state, 'CANCELLED');
  assert.equal(f.sql(db => db.prepare('SELECT COUNT(*) AS n FROM proof_results').get().n), 0);
  assert.equal(f.sql(db => db.prepare('SELECT COUNT(*) AS n FROM proof_sessions WHERE consumed_at IS NOT NULL').get().n), 1);
  assert.equal(flow.getState().paymentAllowed, false); assert.equal(flow.getState().collectionEnabled, false);
});

test('HTTPS create reply loss recovers the same durable session with the same key', async t => {
  const { f, flow, input } = await fixture(t); f.loseResponse();
  await assert.rejects(flow.start(input), { code: 'API_NETWORK', nextAction: 'CHECK_RESULT' });
  // Reads do not lose responses. Recover using the known ID from the existing list route.
  const list = await f.client.request(`/applications/${f.applicationId}/proof-sessions`);
  const created = list.find(s => s.typedData.message.ownerPublicKey === input.ownerPublicKey);
  assert.ok(created); assert.equal(created.state, 'ISSUED');
  await assert.rejects(flow.retryStart(), { code: 'API_NETWORK' });
  assert.equal(f.sql(db => db.prepare('SELECT COUNT(*) AS n FROM proof_sessions').get().n), 2);
  await flow.refresh(created.proofSessionId); assert.equal(flow.getState().creationRecovery, false);
  assert.equal(flow.getState().session.proofSessionId, created.proofSessionId);
});

test('HTTPS lost approval response leaves a recovery state until GET confirms authorization', async t => {
  const { f, flow, input, approve } = await fixture(t); await flow.start(input); f.loseResponse();
  await assert.rejects(approve(), { code: 'API_NETWORK', outcome: 'UNKNOWN', nextAction: 'CHECK_RESULT' });
  assert.equal(flow.getState().phase, 'RECOVERY_REQUIRED'); await assert.rejects(approve(), { code: 'FLOW_REVIEW_REQUIRED' });
  const checked = await flow.refresh(); assert.equal(checked.session.state, 'AUTHORIZED'); assert.equal(checked.result.state, 'NOT_ACCEPTED');
  assert.equal(f.signs, 1);
});

test('HTTPS lost cancellation reply is confirmed by GET without claiming proof success', async t => {
  const { f, flow, input } = await fixture(t); await flow.start(input); f.loseResponse();
  await assert.rejects(flow.cancel(), { code: 'API_NETWORK' }); assert.equal(flow.getState().needsRefresh, true);
  const checked = await flow.refresh(); assert.equal(checked.session.state, 'CANCELLED'); assert.equal(checked.result.state, 'NOT_ACCEPTED');
  assert.equal(checked.proofVerified, false);
});
