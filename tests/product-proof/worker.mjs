import { createApplicationService } from '../../src/application/service.mjs';
import { openStore } from '../../src/application/store.mjs';
process.once('message', ({ config, time, observation, action, args, row }) => {
  if (action === 'crash-before-commit') {
    const { db } = openStore(config.directory, { origin: config.origin, chainId: config.chainId, instanceId: config.instanceId,
      dataMode: 'SYNTHETIC', consentScope: 'APPLICATION_ONLY', proofSourceSigner: config.proofSourceSigner });
    db.exec('BEGIN IMMEDIATE');
    db.prepare('INSERT INTO proof_results VALUES(?,?,?,?,?,?,?,?,?)').run(...row);
    process.send('uncommitted'); return;
  }
  const service = createApplicationService({ ...config, now: () => time, vaultReader: { proofEnrollment: async () => observation } });
  process.send('ready');
  process.once('message', async () => {
    try { process.send({ ok: true, result: await service.acceptProofEvidence(...args) }); }
    catch (error) { process.send({ ok: false, code: error.message }); }
    if (action === 'crash-after-commit') return;
    service.close(); process.disconnect();
  });
});
