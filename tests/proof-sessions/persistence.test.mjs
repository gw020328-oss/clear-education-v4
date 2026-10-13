import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { Wallet } from 'ethers';
import { fixture } from './fixture.mjs';

function worker(t, f, evidence, action, args) {
  const child = fork(new URL('./worker.mjs', import.meta.url), { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  const ready = once(child, 'message');
  child.send({ config: f.app.config, time: f.app.time, evidence, action, args });
  return { child, ready };
}
async function race(t, f, action, args) {
  const evidence = await f.reader.proofEnrollment(f.record, f.accepted.typed, f.accepted.signature, f.funded.fundingEvidence);
  const workers = args.map(a => worker(t, f, evidence, action, a));
  await Promise.all(workers.map(w => w.ready));
  const results = workers.map(w => once(w.child, 'message')), exits = workers.map(w => once(w.child, 'exit'));
  workers.forEach(w => w.child.send('go'));
  const output = (await Promise.all(results)).map(r => r[0]); await Promise.all(exits); return output;
}

test('separate processes creating the same idempotency key return one durable session', { timeout: 20000 }, async t => {
  const f = await fixture(t), args = [f.context, f.applicationId, f.body, 'same'];
  const results = await race(t, f, 'createProofSession', [args, args]);
  assert.ok(results.every(r => r.ok), JSON.stringify(results)); assert.deepEqual(results[0], results[1]);
  assert.equal(f.app.service.listProofSessions(f.context, f.applicationId).length, 1);
});

test('separate processes with competing keys and owners cannot create two active sessions', { timeout: 20000 }, async t => {
  const f = await fixture(t);
  const args = [1, 2].map(i => [f.context, f.applicationId, { ownerPublicKey: Wallet.createRandom().signingKey.publicKey }, 'key-' + i]);
  const results = await race(t, f, 'createProofSession', args);
  assert.equal(results.filter(r => r.ok).length, 1); assert.equal(results.find(r => !r.ok).code, 'PROOF_SESSION_ACTIVE');
});

test('concurrent authorization retries consume one nonce and return exactly one receipt', { timeout: 20000 }, async t => {
  const f = await fixture(t), p = await f.create(), body = await f.signed(p), args = [f.context, f.applicationId, p.proofSessionId, body];
  const results = await race(t, f, 'authorizeProofSession', [args, args]);
  assert.ok(results.every(r => r.ok), JSON.stringify(results)); assert.deepEqual(results[0], results[1]);
  assert.equal(f.get(p).state, 'AUTHORIZED');
  assert.equal(f.sql(db => db.prepare('SELECT count(*) n FROM proof_sessions WHERE consumed_at IS NOT NULL').get().n), 1);
});

test('kill before commit restores unconsumed nonce, and kill after commit recovers the identical receipt', { timeout: 20000 }, async t => {
  const f = await fixture(t), p = await f.create(), body = await f.signed(p), evidence = p.issuanceEvidence;
  const w = worker(t, f, evidence, 'crash', []); assert.equal((await w.ready)[0], 'uncommitted');
  let ended = once(w.child, 'exit'); w.child.kill('SIGKILL'); await ended;
  f.app.restart({ vaultReader: f.reader }); assert.equal(f.get(p).authorizedAt, null);
  const next = worker(t, f, evidence, 'commit-then-crash', [f.context, f.applicationId, p.proofSessionId, body]); await next.ready;
  const result = once(next.child, 'message'); next.child.send('go'); const [committed] = await result;
  assert.equal(committed.ok, true);
  ended = once(next.child, 'exit'); next.child.kill('SIGKILL'); await ended;
  f.app.restart({ vaultReader: f.reader }); assert.deepEqual(await f.authorize(p, body), committed.result);
});
