import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';

// An anonymous fixed URL only. Certificate verification uses Node's trusted
// roots. No custom certificate, TLS bypass, credentials, or redirect following.
export async function probeYbmHome(route, {signal} = {}) {
  const combined = signal ? AbortSignal.any([signal, route.signal]) : route.signal;
  const proxy = new URL(route.proxyUrl);
  let tunnel, agent;
  try {
    tunnel = await new Promise((resolve, reject) => {
      const req = http.request({host: proxy.hostname, port: proxy.port, method: 'CONNECT', path: 'exam.toeic.co.kr:443', signal: combined});
      req.setTimeout(25000, () => req.destroy(new Error('PROBE_TIMEOUT')));
      req.once('error', reject);
      req.once('connect', (res, socket, head) => {
        if (res.statusCode !== 200 || head.length) { socket.destroy(); reject(new Error('PROBE_CONNECT_FAILED')); }
        else resolve(socket);
      }); req.end();
    });
    agent = new https.Agent({keepAlive: false});
    agent.createConnection = () => tls.connect({socket: tunnel, servername: 'exam.toeic.co.kr', rejectUnauthorized: true});
    return await new Promise((resolve, reject) => {
      const req = https.get('https://exam.toeic.co.kr/', {agent, signal: combined, headers: {'Accept-Encoding': 'identity'}}, res => {
        let size = 0; const chunks = [];
        res.on('error', reject);
        res.on('data', chunk => {
          size += chunk.length;
          if (size > 1024 * 1024) req.destroy(new Error('PROBE_TOO_LARGE')); else chunks.push(chunk);
        });
        res.on('end', () => {
          const body = Buffer.concat(chunks);
          const toeicPage = /TOEIC|토익/i.test(body.toString('utf8'));
          body.fill(0); for (const chunk of chunks) chunk.fill(0);
          if (res.statusCode !== 200 || !toeicPage) reject(new Error('PUBLIC_ROUTE_NOT_READY'));
          else resolve({ybmHomeStatus: 200, certificateValidated: true, toeicPage: true});
        });
      });
      req.setTimeout(25000, () => req.destroy(new Error('PROBE_TIMEOUT')));
      req.once('error', reject);
    });
  } catch { throw new Error('PUBLIC_ROUTE_NOT_READY'); }
  finally { agent?.destroy(); tunnel?.destroy(); }
}
