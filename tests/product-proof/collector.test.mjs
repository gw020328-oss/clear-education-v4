import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture.mjs';
import { createProductCollector } from '../../src/ybm-collector/product-session.mjs';
import { PRODUCT_PROOF_VERSION } from '../../src/product-proof/contract.mjs';
import { RawProofMemory } from '../../src/mac-collector/storage.mjs';

for (const mode of ['success', 'source-failure', 'verification-failure', 'abort', 'cleanup-failure']) test('product collector cleans staged data and owner on ' + mode, async t => {
  let time = 0; const collector = createProductCollector({ now: () => time });
  const f = await fixture(t, { collector }); time = f.app.time;
  const controller = new AbortController(); let closed = 0, raw, staged;
  const use = RawProofMemory.prototype.use;
  RawProofMemory.prototype.use = async function (id, fn) { staged = this; return use.call(this, id, bytes => { raw = bytes; return fn(bytes); }); };
  t.after(() => { RawProofMemory.prototype.use = use; });
  const source = { profile: PRODUCT_PROOF_VERSION, async collect(input) {
    assert.deepEqual(Object.keys(input).sort(), ['session', 'signal']);
    if (mode === 'source-failure') throw new Error('secret source error');
    const value = await f.source();
    if (mode === 'verification-failure') value.bundle.pages[0].records[0].examKey = 'changed';
    if (mode === 'abort') controller.abort();
    return value;
  }, async close() { closed++; if (mode === 'cleanup-failure') throw new Error('secret cleanup error'); } };
  const run = () => collector.collect({ session: f.session, source, signal: controller.signal, submit: f.accept });
  if (mode === 'success') assert.equal((await run()).state, 'ACCEPTED_SYNTHETIC');
  else await assert.rejects(run, /PRODUCT_COLLECTION_FAILED|PRODUCT_CLEANUP_FAILED/);
  assert.equal(closed, 1); if (raw) { assert.ok(raw.every(b => b === 0)); assert.equal(staged.size, 0); }
  assert.equal(f.rows(), ['success', 'cleanup-failure'].includes(mode) ? 1 : 0);
  await assert.rejects(run, /PRODUCT_COLLECTOR_CLOSED/);
});

test('live or diagnostic drivers are rejected before source access and closed', async t => {
  assert.throws(() => createProductCollector({ dataMode: 'REAL_YBM' }), /PROOF_SOURCE_INCOMPLETE/);
  const collector = createProductCollector({ now: () => 1 }); let opened = 0, closed = 0;
  await assert.rejects(() => collector.collect({ session: { dataMode: 'REAL_YBM' },
    source: { collect() { opened++; }, close() { closed++; } }, submit() { throw new Error(); } }), /PRODUCT_COLLECTION_FAILED/);
  assert.equal(opened, 0); assert.equal(closed, 1);
});

test('closing collector during a pending source stops the operation and awaits source cleanup', async t => {
  let time = 0; const collector = createProductCollector({ now: () => time });
  const f = await fixture(t, { collector }); time = f.app.time;
  let entered, closed = false; const waiting = new Promise(resolve => { entered = resolve; });
  const pending = collector.collect({ session: f.session, source: { profile: PRODUCT_PROOF_VERSION,
    collect() { entered(); return new Promise(() => {}); }, async close() { closed = true; } }, submit: f.accept });
  const rejected = assert.rejects(() => pending, /PRODUCT_COLLECTION_FAILED/);
  await waiting; collector.close(); await rejected; assert.equal(closed, true); assert.equal(f.rows(), 0);
});
