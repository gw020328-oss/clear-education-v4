import { ATTESTOR_URL } from './route.mjs';
import { setMaxListeners } from 'node:events';

export const quiet = {trace(){}, debug(){}, info(){}, warn(){}, error(){}, fatal(){}, child(){return this;}};
let opened = false;

export async function openOfficialClient({signal, socketFactory} = {}) {
  signal?.throwIfAborted();
  if (opened) throw new Error('NEW_WORKER_REQUIRED');
  opened = true;
  // Set before loading the SDK; its default logger and dependency diagnostics
  // must not serialize request parameters or error payloads to the terminal.
  process.env.LOG_LEVEL = 'silent';
  const {setCryptoImplementation} = await import('@reclaimprotocol/tls');
  const {webcryptoCrypto} = await import('@reclaimprotocol/tls/webcrypto');
  setCryptoImplementation(webcryptoCrypto);
  const {getAttestorClientFromPool} = await import('@reclaimprotocol/attestor-core');
  const {makeSocket} = await import('./socket.mjs');
  signal?.throwIfAborted();
  // 5.1.4 exposes only its pool factory. One worker owns exactly one session,
  // calls this factory once, and exits instead of replacing a closed client.
  const client = getAttestorClientFromPool(ATTESTOR_URL, () => ({logger: quiet, makeWebSocket: socketFactory ?? makeSocket}));
  // Pinned SDK uses this EventTarget for pending RPC listeners. With <=32
  // tunnels, the default ten-listener warning is too small; change this target
  // only, retaining a finite limit and the SDK's per-RPC timeout cleanup.
  if (client.eventTarget instanceof EventTarget) setMaxListeners(128, client.eventTarget);
  const stop = () => { void client.terminateConnection().catch(() => {}); };
  signal?.addEventListener('abort', stop, {once: true});
  const timeout = setTimeout(stop, 30000);
  try {
    await client.waitForInit();
    signal?.throwIfAborted();
    if (!client.isOpen) throw new Error('ATTESTOR_UNAVAILABLE');
    return {client, async close() {
      signal?.removeEventListener('abort', stop);
      await client.terminateConnection();
    }};
  } catch {
    signal?.removeEventListener('abort', stop);
    await client.terminateConnection().catch(() => {});
    throw new Error('ATTESTOR_UNAVAILABLE');
  } finally { clearTimeout(timeout); }
}
