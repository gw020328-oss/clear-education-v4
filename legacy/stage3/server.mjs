import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { localFixture } from '../stage2/lib/local.mjs';
import { AMOUNT, acceptTerms, issueReceipt, makeEvidence, validateEvidence } from '../stage2/lib/evidence.mjs';
import { chainTime, claimRefund, enrollFunded, inspectClaim } from '../stage2/lib/chain.mjs';

const publicDir = fileURLToPath(new URL('./public/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const safeCode = error => error?.name === 'EvidenceError' ? error.code : 'LOCAL_OPERATION_FAILED';

async function bodyJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw Object.assign(new Error('FILE_TOO_LARGE'), { name: 'EvidenceError', code: 'FILE_TOO_LARGE' });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('INVALID_JSON'), { name: 'EvidenceError', code: 'INVALID_JSON' }); }
}

export async function createPrototypeServer({ claimDelay = 700 } = {}) {
  const fixture = await localFixture();
  let acceptance = null;
  let packet = null;
  let imported = null;
  let claim = { state: 'idle' };
  let closed = false;

  async function state() {
    const { trusted, learner, token, vault } = fixture;
    const enrolled = await vault.enrolled(learner.address);
    const settled = await vault.settled(learner.address);
    const reserve = await token.balanceOf(vault.target);
    const balance = await token.balanceOf(learner.address);
    return {
      course: {
        title: '블록체인 환급권 실습', amount: '50 TEST', amountUnits: AMOUNT.toString(),
        required: 4, completed: packet?.submissions.length ?? 0,
        due: trusted.terms.due, claimUntil: trusted.terms.claimUntil,
        evidenceStatement: '서명은 모의 발급자의 주장입니다. 실제 제출이나 학습 성과를 증명하지 않습니다.'
      },
      learner: learner.address,
      consent: { accepted: Boolean(acceptance), recorded: enrolled },
      reserve: { secured: enrolled && reserve >= await vault.totalReserved(), units: reserve.toString() },
      submissions: [0, 1, 2, 3].map(index => ({ index: index + 1, issued: Boolean(packet?.submissions[index]), completedAt: packet?.submissions[index]?.receipt.completedAt ?? null })),
      evidence: { ready: Boolean(packet), imported: Boolean(imported) },
      payment: { ...claim, settled, balanceUnits: balance.toString() },
      connection: { mode: '서버 메모리의 로컬 데모 지갑', browserWallet: false, chain: '로컬 체인 31337' }
    };
  }

  async function issueAll() {
    if (!acceptance || !await fixture.vault.enrolled(fixture.learner.address)) throw Object.assign(new Error(), { name: 'EvidenceError', code: 'CONSENT_REQUIRED' });
    if ((await fixture.now()) < fixture.trusted.terms.start) await fixture.setTime(fixture.trusted.terms.start);
    const submissions = [];
    for (const session of fixture.trusted.terms.submissionIds) {
      const at = await fixture.now();
      submissions.push(await issueReceipt(fixture.trusted, fixture.issuer, fixture.learner.address, session, at, at));
    }
    packet = makeEvidence(fixture.trusted, acceptance, submissions);
    return packet;
  }

  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const send = (status, value) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(value));
    };
    try {
      if (request.method === 'GET' && url.pathname === '/api/state') return send(200, await state());
      if (request.method === 'POST' && url.pathname === '/api/consent') {
        if (acceptance) throw Object.assign(new Error(), { name: 'EvidenceError', code: 'ALREADY_ACCEPTED' });
        const now = await chainTime(fixture.provider);
        acceptance = await acceptTerms(fixture.trusted, fixture.learner, now, fixture.trusted.termsHash);
        try { await enrollFunded(fixture.provider, fixture.trusted, fixture.sponsor, acceptance, fixture.learner.address); }
        catch (error) { acceptance = null; throw error; }
        return send(200, await state());
      }
      if (request.method === 'POST' && url.pathname === '/api/submissions/issue') {
        if (packet) throw Object.assign(new Error(), { name: 'EvidenceError', code: 'ALREADY_ISSUED' });
        await issueAll();
        return send(200, await state());
      }
      if (request.method === 'GET' && url.pathname === '/api/evidence') {
        if (!packet) throw Object.assign(new Error(), { name: 'EvidenceError', code: 'EVIDENCE_NOT_READY' });
        const text = JSON.stringify(packet, null, 2) + '\n';
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': 'attachment; filename="refund-evidence.v1.json"', 'Content-Length': Buffer.byteLength(text), 'Cache-Control': 'no-store' });
        return response.end(text);
      }
      if (request.method === 'POST' && url.pathname === '/api/evidence/import') {
        const candidate = await bodyJson(request);
        const now = await chainTime(fixture.provider);
        validateEvidence(candidate, fixture.trusted, fixture.learner.address, now);
        await inspectClaim(fixture.provider, fixture.trusted, candidate, fixture.learner.address);
        imported = candidate;
        return send(200, await state());
      }
      if (request.method === 'POST' && url.pathname === '/api/claim') {
        if (!imported) throw Object.assign(new Error(), { name: 'EvidenceError', code: 'IMPORT_REQUIRED' });
        if (claim.state !== 'idle' && claim.state !== 'failed') throw Object.assign(new Error(), { name: 'EvidenceError', code: 'CLAIM_ALREADY_STARTED' });
        await inspectClaim(fixture.provider, fixture.trusted, imported, fixture.learner.address);
        const id = randomUUID();
        claim = { state: 'submitted', id, submittedAt: new Date().toISOString() };
        setTimeout(async () => {
          if (closed || claim.id !== id) return;
          claim = { ...claim, state: 'confirming' };
          try {
            const paid = await claimRefund(fixture.provider, fixture.trusted, fixture.relayer, imported, fixture.learner.address);
            claim = { state: 'completed', id, submittedAt: claim.submittedAt, completedAt: new Date().toISOString(), ...paid };
          } catch (error) { claim = { state: 'failed', id, code: safeCode(error) }; }
        }, claimDelay);
        return send(202, { claim: { ...claim } });
      }
      if (request.method === 'POST' && url.pathname === '/api/demo/reset') {
        return send(405, { ok: false, code: 'RESTART_SERVER_TO_RESET' });
      }
      if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/app.js' || url.pathname === '/styles.css' || url.pathname === '/mobile-check.html' || url.pathname === '/mobile-check.css')) {
        const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        const file = resolve(publicDir, name);
        const content = await readFile(file);
        response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store',
          'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
          'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
        return response.end(content);
      }
      send(404, { ok: false, code: 'NOT_FOUND' });
    } catch (error) { send(error?.code === 'FILE_TOO_LARGE' ? 413 : 400, { ok: false, code: safeCode(error) }); }
  });

  return {
    server, fixture,
    async listen(port = 0) { await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolveListen); }); return server.address(); },
    async close() { closed = true; if (server.listening) await new Promise(resolveClose => server.close(resolveClose)); await fixture.close(); }
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = await createPrototypeServer();
  const port = Number(process.env.REFUND_UI_PORT ?? 4173);
  const address = await app.listen(port);
  console.log(`환급 약속 금고: http://127.0.0.1:${address.port}`);
  const stop = async () => { await app.close(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
