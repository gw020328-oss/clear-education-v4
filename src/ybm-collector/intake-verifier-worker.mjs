import net from 'node:net';
import dns from 'node:dns';
import { syncBuiltinESMExports } from 'node:module';
net.Socket.prototype.connect = () => { throw new Error('VERIFIER_OFFLINE'); };
dns.lookup = () => { throw new Error('VERIFIER_OFFLINE'); };
globalThis.fetch = () => { throw new Error('VERIFIER_OFFLINE'); };
syncBuiltinESMExports(); process.env.LOG_LEVEL = 'silent';
for (const key of ['log','warn','error','info','debug']) console[key] = () => {};
let used = false;
process.on('message', async input => {
  if (used) return; used = true;
  let response;
  try {
    const { verifyIntakeClaim } = await import('./intake-verifier.mjs');
    const result = await verifyIntakeClaim(input);
    response = { ok: true, result: { ...result, independentProcess: true } };
  } catch { response = { ok: false, reason: 'INTAKE_VERIFIER_REJECTED' }; }
  input = undefined;
  process.send?.(response, () => process.disconnect());
});
process.on('disconnect', () => process.exit(0));
