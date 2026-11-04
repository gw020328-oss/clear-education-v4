import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { createApplicationService } from '../../src/application/service.mjs';
import { fixture } from './fixture.mjs';

test('authority opt-in migrates existing schema4 atomically and fences running legacy configuration', async t => {
  const f = await fixture(t), created = f.create(), path = join(f.directory, 'applications.sqlite');
  const sql = query => { const db = new DatabaseSync(path); try { return db.prepare(query).all(); } finally { db.close(); } };
  assert.equal(JSON.parse(sql('SELECT config FROM metadata')[0].config).schemaVersion, 4);
  assert.throws(() => f.service.moodleBindingManifest(), /AUTHORITY_REQUIRED/);
  assert.throws(() => createApplicationService({ ...f.config, bindingAuthority: { revision: 2, expectedRevision: 0 } }), /AUTHORITY_ACTIVATION/);
  assert.equal(JSON.parse(sql('SELECT config FROM metadata')[0].config).schemaVersion, 4);
  assert.equal(sql("SELECT name FROM sqlite_schema WHERE name='binding_authority'").length, 0);
  assert.equal(f.service.whoami(f.aliceContext).wallet, f.alice.address);
  const upgraded = createApplicationService({ ...f.config, now: () => f.time, bindingAuthority: { revision: 1, expectedRevision: 0 } });
  t.after(() => upgraded.close());
  assert.equal(JSON.parse(sql('SELECT config FROM metadata')[0].config).schemaVersion, 5);
  assert.equal(upgraded.getApplication(f.aliceContext, created.applicationId).applicationId, created.applicationId);
  assert.throws(() => f.service.authorizeWorkflow(f.aliceContext), /AUTHORITY_STALE_WORKER/);
  assert.throws(() => createApplicationService(f.config), /AUTHORITY_REQUIRED/);
  const reopened = createApplicationService({ ...f.config, now: () => f.time, bindingAuthority: { revision: 1 } });
  try { assert.deepEqual(reopened.moodleBindingManifest(), upgraded.moodleBindingManifest()); } finally { reopened.close(); }
});

for (const missing of ['row', 'table', 'metadata']) {
  test(`authority ${missing} loss is refused without repairing replay state`, async t => {
    const f = await fixture(t), config = { ...f.config, bindingAuthority: { revision: 1, expectedRevision: 0 } };
    const upgraded = createApplicationService(config); upgraded.close();
    const db = new DatabaseSync(join(f.directory, 'applications.sqlite'));
    db.exec(missing === 'row' ? 'DELETE FROM binding_authority' : missing === 'table' ? 'DROP TABLE binding_authority' : 'DELETE FROM metadata');
    const before = db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n;
    assert.throws(() => createApplicationService(config), /AUTHORITY_MISSING|DB_METADATA_MISSING/);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, before); db.close();
  });
}
