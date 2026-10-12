import { createApplicationService } from '../../src/application/service.mjs';
import { openStore } from '../../src/application/store.mjs';
// The parent tests the real EVM reader separately; this process uses only its
// frozen public observation to isolate DB contention from the test RPC engine.
process.once('message', ({ config, time, evidence, action, args }) => {
  if (action === 'crash') {
    const { db } = openStore(config.directory, { origin: config.origin, chainId: config.chainId,
      instanceId: config.instanceId, dataMode: 'SYNTHETIC', consentScope: 'APPLICATION_ONLY' });
    db.exec('BEGIN IMMEDIATE');
    db.prepare(`UPDATE proof_sessions SET state='AUTHORIZED', consumed_at=?, signature_hash='synthetic-test-hash',
      binding_digest='synthetic-test-digest',authorization_evidence=?`).run(time, JSON.stringify(evidence));
    process.send('uncommitted'); return;
  }
  const service = createApplicationService({ ...config, now: () => time, vaultReader: { proofEnrollment: async () => evidence } });
  process.send('ready');
  process.once('message', async () => {
    try {
      const result = await service[action === 'commit-then-crash' ? 'authorizeProofSession' : action](...args);
      process.send({ ok: true, result });
      if (action === 'commit-then-crash') return;
    } catch (error) { process.send({ ok: false, code: error.message }); }
    service.close(); process.disconnect();
  });
});
