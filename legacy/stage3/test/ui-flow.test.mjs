import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPrototypeServer } from '../server.mjs';

async function json(url, options) {
  const response = await fetch(url, options);
  const value = await response.json();
  return { response, value };
}

test('화면의 로컬 환급 흐름은 접수와 실제 지급 완료를 구분한다', async () => {
  const app = await createPrototypeServer({ claimDelay: 250 });
  const address = await app.listen();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    let current = (await json(`${base}/api/state`)).value;
    assert.equal(current.consent.recorded, false);
    assert.equal(current.reserve.secured, false);
    assert.equal(current.course.completed, 0);
    assert.equal(current.payment.state, 'idle');

    const earlyEvidence = await json(`${base}/api/evidence`);
    assert.equal(earlyEvidence.response.status, 400);
    assert.equal(earlyEvidence.value.code, 'EVIDENCE_NOT_READY');

    const agreed = await json(`${base}/api/consent`, { method: 'POST' });
    assert.equal(agreed.response.status, 200);
    assert.equal(agreed.value.consent.recorded, true);
    assert.equal(agreed.value.reserve.secured, true);
    assert.equal(agreed.value.reserve.units, '50000000');

    const issued = await json(`${base}/api/submissions/issue`, { method: 'POST' });
    assert.equal(issued.value.course.completed, 4);
    assert(issued.value.submissions.every(item => item.issued));

    const evidenceResponse = await fetch(`${base}/api/evidence`);
    assert.equal(evidenceResponse.status, 200);
    assert.match(evidenceResponse.headers.get('content-disposition'), /refund-evidence\.v1\.json/);
    const evidenceText = await evidenceResponse.text();
    const evidence = JSON.parse(evidenceText);
    assert.equal(evidence.submissions.length, 4);
    assert(!/privateKey|secretKey|mnemonic|email|studentName/i.test(evidenceText));
    for (const wallet of app.fixture.wallets) assert(!evidenceText.toLowerCase().includes(wallet.privateKey.slice(2).toLowerCase()));

    const beforeImport = await json(`${base}/api/claim`, { method: 'POST' });
    assert.equal(beforeImport.response.status, 400);
    assert.equal(beforeImport.value.code, 'IMPORT_REQUIRED');

    const foreign = structuredClone(evidence);
    foreign.domain.chainId = 1;
    const rejected = await json(`${base}/api/evidence/import`, { method: 'POST', body: JSON.stringify(foreign), headers: { 'Content-Type': 'application/json' } });
    assert.equal(rejected.response.status, 400);
    assert.equal(rejected.value.code, 'DOMAIN_MISMATCH');

    const imported = await json(`${base}/api/evidence/import`, { method: 'POST', body: evidenceText, headers: { 'Content-Type': 'application/json' } });
    assert.equal(imported.response.status, 200);
    assert.equal(imported.value.evidence.imported, true);

    const accepted = await json(`${base}/api/claim`, { method: 'POST' });
    assert.equal(accepted.response.status, 202);
    assert.equal(accepted.value.claim.state, 'submitted');
    assert.equal(accepted.value.claim.paidUnits, undefined);

    const during = await json(`${base}/api/state`);
    assert(['submitted', 'confirming'].includes(during.value.payment.state));
    assert.equal(during.value.payment.settled, false);
    assert.equal(during.value.payment.balanceUnits, '0');

    for (let index = 0; index < 40; index++) {
      await new Promise(resolve => setTimeout(resolve, 50));
      current = (await json(`${base}/api/state`)).value;
      if (current.payment.state === 'completed') break;
    }
    assert.equal(current.payment.state, 'completed');
    assert.equal(current.payment.settled, true);
    assert.equal(current.payment.paidUnits, '50000000');
    assert.equal(current.payment.balanceUnits, '50000000');
    assert.match(current.payment.transactionHash, /^0x[0-9a-f]{64}$/);

    const replay = await json(`${base}/api/claim`, { method: 'POST' });
    assert.equal(replay.response.status, 400);
    assert.equal(replay.value.code, 'CLAIM_ALREADY_STARTED');
  } finally { await app.close(); }
});

test('정적 화면은 요청한 다섯 영역과 모바일·접근성 기반을 갖춘다', async () => {
  const root = new URL('../public/', import.meta.url);
  const [html, css, js] = await Promise.all([
    readFile(new URL('index.html', root), 'utf8'), readFile(new URL('styles.css', root), 'utf8'), readFile(new URL('app.js', root), 'utf8')
  ]);
  for (const id of ['terms', 'agreement', 'evidence', 'download', 'claim']) assert.match(html, new RegExp(`id="${id}"`));
  for (const phrase of ['보장하지 않는 사항', '받을 수 있는 금액', '남은 조건', '청구 기한', '다음', '증빙 파일 다운로드', '청구 접수', '실제 지급 완료']) assert.match(html + js, new RegExp(phrase));
  assert.match(html, /<html lang="ko">/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /download="refund-evidence\.v1\.json"/);
  assert.equal((html.match(/<h1/g) ?? []).length, 1);
  assert.equal((html.match(/<section/g) ?? []).length, 6);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /role="alert"/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /min-height: 48px/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(js, /transactionHash/);
  assert.match(js, /balanceUnits/);
  assert.match(js, /거래 영수증이 확정됐고 수령자 잔액이 정확히 50 TEST 늘었습니다/);
  const mobile = await readFile(new URL('mobile-check.html', root), 'utf8');
  const mobileCss = await readFile(new URL('mobile-check.css', root), 'utf8');
  assert.match(mobileCss, /width: 360px/);
  assert.match(mobile, /<iframe src="\/"/);
});

test('정적 응답은 로컬 전용 CSP와 캐시 금지를 보낸다', async () => {
  const app = await createPrototypeServer();
  const address = await app.listen();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  } finally { await app.close(); }
});
