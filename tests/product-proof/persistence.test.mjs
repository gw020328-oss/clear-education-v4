import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { Wallet } from 'ethers';
import { fixture } from './fixture.mjs';
import { createApplicationService } from '../../src/application/service.mjs';
import { canonical, hash } from '../../src/policy/values.mjs';
import { PRODUCT_PROOF_VERSION } from '../../src/product-proof/contract.mjs';

function worker(t, f, observation, action, body, row) {
  const child = fork(new URL('./worker.mjs', import.meta.url), { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  const ready = once(child, 'message');
  child.send({ config: f.app.config, time: f.app.time, observation, action, row,
    args: [f.context, f.applicationId, f.session.proofSessionId, body] });
  return { child, ready };
}
async function observation(f) {
  return f.reader.proofEnrollment(f.record, f.accepted.typed, f.accepted.signature, f.funded.fundingEvidence);
}
for (const different of [false, true]) test('separate-process competing ' + (different ? 'different results conflict' : 'identical results return one receipt'), { timeout: 20000 }, async t => {
  const f = await fixture(t), a = await f.signed(); let b = a;
  if (different) { f.evidence.bundle.pages[2].records[0].totalScore = 990; f.evidence.seal(); b = await f.signed(); }
  const evidence = await observation(f), workers = [a, b].map(body => worker(t, f, evidence, 'race', body));
  await Promise.all(workers.map(w => w.ready));
  const outputs = workers.map(w => once(w.child, 'message')), exits = workers.map(w => once(w.child, 'exit'));
  workers.forEach(w => w.child.send('go'));
  const results = (await Promise.all(outputs)).map(x => x[0]); await Promise.all(exits);
  assert.equal(results.filter(x => x.ok).length, different ? 1 : 2);
  if (different) assert.equal(results.find(x => !x.ok).code, 'PRODUCT_RESULT_CONFLICT');
  else assert.deepEqual(results[0], results[1]);
  assert.equal(f.rows(), 1);
});

test('kill before commit rolls back; kill after commit recovers one durable identical receipt', { timeout: 20000 }, async t => {
  const f = await fixture(t), body = await f.signed(), chain = await observation(f), snapshot = f.evidence.assess().snapshot;
  const row = [f.session.proofSessionId, hash(body), hash(snapshot), PRODUCT_PROOF_VERSION, f.sourceSigner.address,
    f.app.time, f.app.time, canonical(snapshot), canonical(chain)];
  const before = worker(t, f, chain, 'crash-before-commit', body, row); assert.equal((await before.ready)[0], 'uncommitted');
  let exit = once(before.child, 'exit'); before.child.kill('SIGKILL'); await exit;
  f.app.restart({ vaultReader: f.reader }); assert.equal(f.rows(), 0);
  const after = worker(t, f, chain, 'crash-after-commit', body); await after.ready;
  const result = once(after.child, 'message'); after.child.send('go'); const [committed] = await result;
  assert.equal(committed.ok, true);
  exit = once(after.child, 'exit'); after.child.kill('SIGKILL'); await exit;
  f.app.restart({ vaultReader: f.reader }); assert.deepEqual(await f.accept(body), committed.result); assert.equal(f.rows(), 1);
});

test('schema 3 migrates without losing B1; schema 4 loss or changed trust refuses startup', async t => {
  const f = await fixture(t), body = await f.signed();
  f.sql(db => {
    db.exec('DROP TABLE proof_results'); const config = JSON.parse(db.prepare('SELECT config FROM metadata').get().config);
    config.schemaVersion = 3; delete config.proofSourceSigner; db.prepare('UPDATE metadata SET config=?').run(canonical(config));
  });
  f.app.restart({ vaultReader: f.reader }); assert.deepEqual(f.get(f.issued), f.session);
  assert.equal((await f.accept(body)).state, 'ACCEPTED_SYNTHETIC');
  assert.throws(() => createApplicationService({ ...f.app.config, proofSourceSigner: Wallet.createRandom().address }), /DB_ENVIRONMENT_MISMATCH/);
  assert.equal(f.rows(), 1);
  f.sql(db => db.exec('DROP TABLE proof_results'));
  assert.throws(() => createApplicationService(f.app.config), /DB_SCHEMA_INCOMPLETE/);
});

test('failed schema 3 migration rolls back new result table and metadata', async t => {
  const f = await fixture(t); const prior = f.sql(db => {
    db.exec('DROP TABLE proof_results'); const config = JSON.parse(db.prepare('SELECT config FROM metadata').get().config);
    config.schemaVersion = 3; delete config.proofSourceSigner; const text = canonical(config);
    db.prepare('UPDATE metadata SET config=?').run(text); return text;
  });
  assert.throws(() => createApplicationService({ ...f.app.config, origin: 'https://wrong.invalid' }), /DB_ENVIRONMENT_MISMATCH/);
  f.sql(db => {
    assert.equal(db.prepare('SELECT config FROM metadata').get().config, prior);
    assert.equal(db.prepare("SELECT count(*) n FROM sqlite_schema WHERE name='proof_results'").get().n, 0);
  });
});
