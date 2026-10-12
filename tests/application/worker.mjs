import { createApplicationService } from '../../src/application/service.mjs';
import { openStore } from '../../src/application/store.mjs';
process.once('message', ({ config, time, action, args }) => {
  if (action === 'crash') {
    const { db } = openStore(config.directory, { origin: config.origin, chainId: config.chainId,
      instanceId: config.instanceId, dataMode: 'SYNTHETIC', consentScope: 'APPLICATION_ONLY' });
    db.exec('BEGIN IMMEDIATE');
    db.prepare('UPDATE auth_nonces SET consumed_at=? WHERE consumed_at IS NULL').run(time);
    process.send('uncommitted'); // Parent terminates this process before COMMIT.
    return;
  }
  const service = createApplicationService({ ...config, now: () => time });
  process.send('ready');
  process.once('message', () => {
    try { process.send({ ok: true, result: service[action](...args) }); }
    catch (error) { process.send({ ok: false, code: error.message }); }
    finally { service.close(); process.disconnect(); }
  });
});
