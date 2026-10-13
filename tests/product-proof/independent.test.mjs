import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { Wallet } from 'ethers';
import { fixture as evidenceFixture } from '../exam-evidence/fixture.mjs';
import { ownerMessage, sourceMessage, PRODUCT_PROOF_VERSION } from '../../src/product-proof/contract.mjs';
import { verifyProductIndependently } from '../../src/product-proof/independent.mjs';

async function input() {
  const f = evidenceFixture(), signer = Wallet.createRandom(), owner = Wallet.createRandom();
  const source = { profile: PRODUCT_PROOF_VERSION, bundle: f.bundle, sourceSignature: await signer.signMessage(sourceMessage(f.bundle.manifest)) };
  const { supplementEndAt, claimUntil, ...draft } = f.compiled.policy;
  return { draft, session: f.context.session, sourceSigner: signer.address, now: f.context.now,
    submission: { ...source, ownerSignature: await owner.signMessage(ownerMessage(source)) } };
}

for (const location of ['top', 'manifest', 'page', 'row']) test('private or unsigned fields are rejected before worker IPC at ' + location, async () => {
  const value = await input(), target = location === 'top' ? value.submission : location === 'manifest' ? value.submission.bundle.manifest
    : location === 'page' ? value.submission.bundle.pages[0] : value.submission.bundle.pages[0].records[0];
  target.cookie = 'secret-do-not-reflect'; let calls = 0;
  await assert.rejects(() => verifyProductIndependently(value, { forkChild() { calls++; } }), /PRODUCT_SCHEMA/);
  assert.equal(calls, 0);
});

test('real spawn failure and synchronous spawn failure reject with fixed error', async () => {
  const value = await input();
  await assert.rejects(() => verifyProductIndependently(value, { forkChild() { throw new Error('secret'); } }), /PRODUCT_VERIFICATION_FAILED/);
  await assert.rejects(() => verifyProductIndependently(value, { forkChild(path, args, options) {
    return fork(path, args, { ...options, execPath: '/nonexistent-synthetic-node' });
  } }), /PRODUCT_VERIFICATION_FAILED/);
});

for (const abort of [false, true]) test('actual offline process is closed before rejecting ' + (abort ? 'abort' : 'timeout'), async () => {
  const value = await input(), controller = new AbortController(); let child, closed = false;
  await assert.rejects(() => verifyProductIndependently(value, { signal: controller.signal, timeoutMs: 300,
    forkChild(path, args, options) {
      assert.deepEqual(Object.keys(options.env).sort(), ['LOG_LEVEL', 'PATH']);
      assert.ok(options.execArgv.includes('--permission')); assert.equal(options.stdio[2], 'ignore');
      child = fork(new URL('./hang-worker.mjs', import.meta.url), [], { ...options, execArgv: [] });
      child.once('close', () => { closed = true; });
      if (abort) setTimeout(() => controller.abort(), 50);
      return child;
    } }), /PRODUCT_VERIFICATION_FAILED/);
  assert.equal(closed, true); assert.notEqual(child.signalCode, null);
});

for (const kind of ['duplicate', 'ipc', 'exit-before-close']) test('worker lifecycle rejects malformed transport: ' + kind, async () => {
  const value = await input(); let closed = false;
  const child = new EventEmitter();
  child.kill = () => { setImmediate(() => { closed = true; child.emit('close', null); }); };
  child.send = () => {
    if (kind === 'ipc') throw new Error('secret');
    child.emit('message', { ok: false });
    if (kind === 'duplicate') child.emit('message', { ok: false });
    else { child.emit('exit', 0); setTimeout(() => { closed = true; child.emit('close', 0); }, 20); }
  };
  await assert.rejects(() => verifyProductIndependently(value, { forkChild: () => child }), /PRODUCT_VERIFICATION_FAILED/);
  assert.equal(closed, true);
});

for (const location of ['context', 'session', 'typed']) test('IPC excludes secrets in ' + location, async () => {
  const value = await input();
  const target = location === 'context' ? value : location === 'session' ? value.session : value.session.typedData.message;
  target.privateKey = 'secret-do-not-reflect'; let calls = 0;
  await assert.rejects(() => verifyProductIndependently(value, { forkChild() { calls++; } }), /PRODUCT_IPC_SCHEMA/);
  assert.equal(calls, 0);
});
