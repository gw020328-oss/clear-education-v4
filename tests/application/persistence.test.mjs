import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { fixture } from './fixture.mjs';

function worker(t, f, action, args) {
  const child = fork(new URL('./worker.mjs', import.meta.url), { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  const ready = once(child, 'message');
  child.send({ config: f.config, time: f.time, action, args });
  return { child, ready };
}
async function race(t, f, action, args) {
  const workers = [worker(t, f, action, args), worker(t, f, action, args)];
  await Promise.all(workers.map(w => w.ready));
  const results = workers.map(w => once(w.child, 'message'));
  const exits = workers.map(w => once(w.child, 'exit'));
  workers.forEach(w => w.child.send('go'));
  const output = (await Promise.all(results)).map(r => r[0]); await Promise.all(exits); return output;
}

test('two independent processes consume an auth nonce exactly once', { timeout: 10000 }, async t => {
  const f = await fixture(t), c = f.service.challenge({ wallet: f.alice.address, chainId: f.config.chainId });
  const body = { nonce: c.nonce, signature: await f.alice.signMessage(c.message) };
  const results = await race(t, f, 'login', [body, c.browserToken]);
  assert.equal(results.filter(r => r.ok).length, 1);
  assert.equal(results.find(r => !r.ok).code, 'AUTH_CHALLENGE');
  f.restart(); assert.throws(() => f.service.login(body, c.browserToken), { message: 'AUTH_CHALLENGE' });
});

test('concurrent create with one actor/key produces one application', { timeout: 10000 }, async t => {
  const f = await fixture(t);
  const results = await race(t, f, 'createApplication', [f.aliceContext, { policyHash: f.compiled.policyHash }, 'concurrent-create']);
  assert.ok(results.every(r => r.ok)); assert.equal(results[0].result.applicationId, results[1].result.applicationId);
  assert.equal(f.service.listApplications(f.aliceContext).length, 1);
});

test('concurrent consent retries return one committed digest', { timeout: 10000 }, async t => {
  const f = await fixture(t), app = f.create(), { body } = await f.signedConsent(app);
  const results = await race(t, f, 'consent', [f.aliceContext, app.applicationId, body, 'concurrent-consent']);
  assert.ok(results.every(r => r.ok)); assert.deepEqual(results[0].result, results[1].result);
});

test('SIGKILL before commit rolls back nonce consumption; fresh process can finish it', { timeout: 10000 }, async t => {
  const f = await fixture(t), c = f.service.challenge({ wallet: f.alice.address, chainId: f.config.chainId });
  const body = { nonce: c.nonce, signature: await f.alice.signMessage(c.message) };
  const w = worker(t, f, 'crash', []); assert.equal((await w.ready)[0], 'uncommitted');
  const ended = once(w.child, 'exit'); w.child.kill('SIGKILL'); await ended;
  f.restart(); assert.ok(f.service.login(body, c.browserToken).token);
});
