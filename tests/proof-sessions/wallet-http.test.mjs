import test from 'node:test';
import assert from 'node:assert/strict';
import { browser } from './wallet-http-fixture.mjs';

test('wallet helper and HTTPS service consume one durable nonce without accepting proof or enabling collection', async t => {
  const f = await browser(t), result = await f.approve();
  assert.equal(result.state, 'AUTHORIZED'); assert.equal(result.dataMode, 'SYNTHETIC');
  assert.equal(result.collectionEnabled, false); assert.equal(result.proofVerified, false); assert.equal(result.paymentAllowed, false);
  assert.equal((await f.client.request(f.path + '/result')).state, 'NOT_ACCEPTED');
  const rows = f.sql(db => db.prepare('SELECT state,consumed_at,binding_digest FROM proof_sessions').all());
  assert.equal(rows.length, 1); assert.equal(rows[0].state, 'AUTHORIZED'); assert.equal(rows[0].binding_digest, result.bindingDigest);
  assert.equal(f.sql(db => db.prepare('SELECT COUNT(*) AS n FROM proof_results').get().n), 0);
  await assert.rejects(f.approve(), { message: 'PROOF_AUTHORIZATION_STATE' });
  assert.equal(f.signs, 1); assert.equal(f.posts, 1);
});

test('lost HTTPS authorization response recovers by GET without a second signature or POST', async t => {
  const f = await browser(t); f.loseResponse();
  await assert.rejects(f.approve(), { code: 'API_NETWORK', outcome: 'UNKNOWN', nextAction: 'CHECK_RESULT', retryable: false });
  const recovered = await f.client.request(f.path); assert.equal(recovered.state, 'AUTHORIZED');
  await assert.rejects(f.approve(), { message: 'PROOF_AUTHORIZATION_STATE' });
  assert.equal(f.signs, 1); assert.equal(f.posts, 1);
});

test('server cancellation while wallet prompt is open still rejects the signed submission', async t => {
  const f = await browser(t); f.onSign(() => f.cancel(f.session));
  await assert.rejects(f.approve(), { code: 'PROOF_SESSION_CANCELLED', status: 409, outcome: 'HTTP_ERROR', nextAction: 'REFRESH_STATE' });
  assert.equal(f.get(f.session).state, 'CANCELLED'); assert.equal(f.get(f.session).bindingDigest, null);
  assert.equal(f.posts, 1);
});
