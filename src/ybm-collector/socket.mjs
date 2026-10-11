import WebSocket from 'ws';

export function makeSocket(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'wss:' || parsed.hostname !== 'attestor.reclaimprotocol.org' || parsed.port !== '444' || parsed.pathname !== '/ws' || parsed.username || parsed.password) throw new Error('INVALID_ATTESTOR_URL');
  const socket = new WebSocket(url, {rejectUnauthorized: true, followRedirects: false, handshakeTimeout: 25000, maxPayload: 4 * 1024 * 1024, perMessageDeflate: false, closeTimeout: 1000});
  socket.sendPromise = bytes => new Promise((resolve, reject) => {
    if (bytes.length + socket.bufferedAmount > 2 * 1024 * 1024) {
      socket.terminate(); reject(new Error('ATTESTOR_BACKPRESSURE_LIMIT')); return;
    }
    const timer = setTimeout(() => {socket.terminate(); reject(new Error('ATTESTOR_SEND_TIMEOUT'));}, 10000);
    socket.send(bytes, error => {clearTimeout(timer);if(error)reject(new Error('ATTESTOR_SEND_FAILED'));else resolve();});
  });
  return socket;
}
