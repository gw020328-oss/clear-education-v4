import http from 'node:http';
import { randomInt } from 'node:crypto';

export const ATTESTOR_URL = 'wss://attestor.reclaimprotocol.org:444/ws';
export const allowedHost = host => ['toeic.co.kr', 'ybmnet.co.kr', 'ybm.co.kr']
  .some(domain => host === domain || host.endsWith('.' + domain));

// CONNECT carries encrypted TLS bytes only. This is not a collection/control
// API: no cookies, HTML, proof, credential, or browser command is exposed here.
export async function createRoute({client, signal, allowHost = allowedHost, maxTunnels = 32}) {
  signal?.throwIfAborted();
  if (!client.isInitialised || !client.isOpen) throw new Error('ATTESTOR_NOT_READY');
  const sockets = new Set(), tunnels = new Map();
  const controller = new AbortController();
  let stopped = false, connected = 0, rejected = 0;
  const server = http.createServer({maxHeaderSize: 8192}, (_req, res) => {
    res.writeHead(403, {'Connection': 'close'}); res.end();
  });
  server.headersTimeout = 10000;
  server.requestTimeout = 10000;
  server.on('clientError', (_error, socket) => socket.destroy());
  server.on('connection', socket => {
    sockets.add(socket); socket.on('error', () => {});
    socket.once('close', () => sockets.delete(socket));
    socket.setTimeout(120000, () => socket.destroy());
    if (stopped || sockets.size > maxTunnels + 4) socket.destroy();
  });
  const stop = () => {
    stopped = true;
    controller.abort(new Error('ROUTE_RESTART_REQUIRES_LOGIN'));
    for (const tunnel of tunnels.values()) tunnel.close();
    for (const socket of sockets) socket.destroy();
    server.close();
  };
  client.addEventListener('connection-terminated', stop);
  signal?.addEventListener('abort', stop, {once: true});
  server.on('connect', async (req, socket, head) => {
    // Reject URL credentials, paths, trailing dots, ambiguous ports and any
    // browser-originated fetch pretext before asking the attestor to connect.
    const match = /^([a-z0-9]+(?:[.-][a-z0-9]+)*):443$/.exec(req.url ?? '');
    if (stopped || !match || !allowHost(match[1]) || req.headers.origin || tunnels.size >= maxTunnels) {
      rejected++; socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
    }
    socket.pause();
    let id; do { id = randomInt(1, 0x100000000); } while (tunnels.has(id));
    let closed = false, ready = false;
    const close = () => {
      if (closed) return;
      closed = true; tunnels.delete(id);
      socket.destroy();
      if (ready && client.isOpen) void client.rpc('disconnectTunnel', {id}, 5000).catch(() => {});
    };
    const finish = () => {
      if (closed) return;
      closed = true; tunnels.delete(id);
      // Remote EOF can follow the last data event before Node flushes its
      // writable buffer. end() drains those TLS bytes; destroy() truncates them.
      // Keep a finite drain window for a browser that has stopped reading.
      const timer = setTimeout(() => socket.destroy(), 10000);
      timer.unref(); socket.once('close', () => clearTimeout(timer));
      socket.end();
    };
    tunnels.set(id, {close, finish, socket});
    socket.once('close', close); socket.once('error', close); socket.once('end', close);
    socket.setTimeout(120000, close);
    // Pausing before each send bounds our upload queue to one stream chunk.
    // The SDK's WebSocket send Promise is backed by its send callback.
    const send = async chunk => {
      socket.pause();
      try {
        if (!closed) await client.sendMessage({tunnelMessage: {tunnelId: id, message: chunk}});
        if (!closed) socket.resume();
      } catch { close(); }
    };
    try {
      await client.rpc('createTunnel', {id, host: match[1], port: 443, geoLocation: '', proxySessionId: ''}, 25000);
      ready = true;
      if (closed || stopped) {
        if (client.isOpen) void client.rpc('disconnectTunnel', {id}, 5000).catch(() => {});
        close(); return;
      }
      connected++;
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      socket.on('data', send);
      if (head.length) await send(head); else socket.resume();
    } catch { close(); }
  });
  const onMessage = event => {
    const tunnel = tunnels.get(event.data.tunnelId);
    if (!tunnel) return;
    const bytes = event.data.message;
    // Bound slow-reader download buffering, without stalling other tunnels on
    // the shared WebSocket. Termination forces the browser request to retry.
    if (bytes.length + tunnel.socket.writableLength > 2 * 1024 * 1024) tunnel.close();
    else tunnel.socket.write(bytes);
  };
  const onDisconnect = event => tunnels.get(event.data.tunnelId)?.finish();
  client.addEventListener('tunnel-message', onMessage);
  client.addEventListener('tunnel-disconnect-event', onDisconnect);
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject); server.listen(0, '127.0.0.1', resolve);
    });
    if (signal?.aborted || stopped) throw new Error('ROUTE_CLOSED');
  } catch (error) { stop(); removeListeners(); throw error; }
  function removeListeners() {
    client.removeEventListener('connection-terminated', stop);
    client.removeEventListener('tunnel-message', onMessage);
    client.removeEventListener('tunnel-disconnect-event', onDisconnect);
    signal?.removeEventListener('abort', stop);
  }
  const port = server.address().port;
  return {
    client, // The proof stage must receive this exact instance; no pool/reconnect.
    proxyUrl: `http://127.0.0.1:${port}`,
    signal: controller.signal,
    summary: () => ({connected, rejected, active: tunnels.size, stopped}),
    async close() { stop(); removeListeners(); await new Promise(resolve => server.close(resolve)); },
  };
}
