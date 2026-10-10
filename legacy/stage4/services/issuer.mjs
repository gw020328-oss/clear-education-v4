import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { Wallet } from 'ethers';
import { issueReceipt, validateTrust } from '../../stage2/lib/evidence.mjs';

const port = Number(process.env.ISSUER_PORT ?? 4301);
const key = process.env.ISSUER_KEY;
const manifestPath = process.env.MANIFEST_PATH;
if (!key || !manifestPath) throw new Error('ISSUER_CONFIGURATION');
const trusted = validateTrust(JSON.parse(await readFile(manifestPath, 'utf8')));
const issuer = new Wallet(key);
const json = (response, status, value) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(value)); };
async function body(request) { const chunks=[]; let size=0; for await (const chunk of request) { size+=chunk.length; if(size>4096) throw new Error(); chunks.push(chunk); } return JSON.parse(Buffer.concat(chunks)); }
const server = createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/health') return json(response, 200, { ok: true, service: 'issuer' });
    if (request.method === 'POST' && request.url === '/issue-all') {
      const { learner } = await body(request);
      const submissions=[];
      for (const session of trusted.terms.submissionIds) submissions.push(await issueReceipt(trusted, issuer, learner, session, trusted.terms.start, trusted.terms.start));
      return json(response, 200, { submissions });
    }
    json(response, 404, { ok: false, code: 'NOT_FOUND' });
  } catch { json(response, 400, { ok: false, code: 'ISSUANCE_REJECTED' }); }
});
server.listen(port, '127.0.0.1', () => process.send?.({ type: 'ready', service: 'issuer', port }));
const stop=()=>server.close(()=>process.exit(0)); process.on('SIGTERM', stop); process.on('SIGINT', stop);
