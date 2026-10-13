// A fixed offline verifier. Node permissions also prohibit writes, arbitrary
// file reads, child processes, native addons and worker threads. Network
// primitives are disabled here (Node 24 permissions do not isolate networking).
import net from 'node:net';
import dns from 'node:dns';
import dgram from 'node:dgram';
import { syncBuiltinESMExports } from 'node:module';
const deny = () => { throw new Error('VERIFIER_OFFLINE'); };
net.Socket.prototype.connect = deny; dns.lookup = deny; dgram.createSocket = deny; globalThis.fetch = deny;
syncBuiltinESMExports();
for (const key of ['log', 'warn', 'error', 'info', 'debug']) console[key] = () => {};
let used = false;
process.on('message', async text => {
  if (used) return; used = true;
  let response;
  try {
    if (typeof text !== 'string' || Buffer.byteLength(text) > 1024 * 1024) throw new Error();
    const { verifyProductSubmission } = await import('./contract.mjs');
    response = { ok: true, result: verifyProductSubmission(JSON.parse(text)) };
  } catch { response = { ok: false }; }
  process.send(response, () => process.disconnect());
});
process.on('disconnect', () => process.exit(0));
