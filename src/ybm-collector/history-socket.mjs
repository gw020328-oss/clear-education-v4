// Isolated history diagnostic only: measured table proof was 116,830,175 bytes.
// Product socket.mjs remains bounded at 32 MiB. SDK upstream default is 512 MiB.
import WebSocket from 'ws';

export const TRANSPORT_SEND_LIMIT=2*1024*1024, PROOF_SEND_LIMIT=128*1024*1024;
export function makeSocket(url,{proofMode=false}={}) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'wss:' || parsed.hostname !== 'attestor.reclaimprotocol.org' || parsed.port !== '444' || parsed.pathname !== '/ws' || parsed.username || parsed.password) throw new Error('INVALID_ATTESTOR_URL');
  const socket = new WebSocket(url, {rejectUnauthorized: true, followRedirects: false, handshakeTimeout: 25000, maxPayload: 4 * 1024 * 1024, perMessageDeflate: false, closeTimeout: 1000});
  installBoundedSender(socket,{proofMode});
  return socket;
}
export function installBoundedSender(socket,{proofMode=false}={}) {
  const limit=proofMode?PROOF_SEND_LIMIT:TRANSPORT_SEND_LIMIT;
  socket.sendPromise = bytes => new Promise((resolve, reject) => {
    if (bytes.length + socket.bufferedAmount > limit) {
      socket.terminate(); reject(new Error('ATTESTOR_BACKPRESSURE_LIMIT')); return;
    }
    const timer = setTimeout(() => {socket.terminate(); reject(new Error('ATTESTOR_SEND_TIMEOUT'));}, proofMode?60000:10000);
    socket.send(bytes, error => {clearTimeout(timer);if(error)reject(new Error('ATTESTOR_SEND_FAILED'));else resolve();});
  });
  return socket;
}
