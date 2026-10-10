import { parseArgs } from 'node:util';
import { readTrust, importEvidence } from './lib/files.mjs';
import { validateEvidence, need } from './lib/evidence.mjs';

try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    evidence: { type: 'string' }, trusted: { type: 'string' }, recipient: { type: 'string' },
    at: { type: 'string' }, db: { type: 'string' }
  } });
  const command = positionals[0];
  need(positionals.length === 1 && ['verify', 'central-claim'].includes(command), 'USAGE');
  need(values.evidence && values.trusted && values.recipient, 'USAGE');
  const trusted = await readTrust(values.trusted);
  // --at is a local replay clock for offline inspection, never accepted by payment CLI.
  need(command === 'verify' || values.at === undefined, 'PAYMENT_CLOCK_OVERRIDE_FORBIDDEN');
  const time = values.at === undefined ? Math.floor(Date.now() / 1000) : Number(values.at);
  const packet = await importEvidence(values.evidence, trusted, values.recipient, time);
  if (command === 'verify') {
    console.log(JSON.stringify({ ...validateEvidence(packet, trusted, values.recipient, time), evaluatedAt: time,
      liveReserveChecked: false, settlementChecked: false, note: 'Offline signature/terms check only; not a current payment guarantee.' }, null, 2));
  } else {
    need(values.db, 'USAGE');
    const { CentralEscrow } = await import('./lib/central.mjs');
    const central = new CentralEscrow(values.db, trusted);
    try { console.log(JSON.stringify(central.claim(packet, values.recipient, time), null, 2)); }
    finally { central.close(); }
  }
} catch (e) {
  // Do not print foreign file contents, signer objects or provider error payloads.
  console.error(JSON.stringify({ ok: false, code: e.code?.startsWith?.('ERR_') ? 'ARGUMENT_ERROR' : (e.name === 'EvidenceError' ? e.code : 'LOCAL_OPERATION_FAILED') }));
  process.exitCode = 1;
}
