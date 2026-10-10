import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { localFixture } from './lib/local.mjs';
import { AMOUNT, acceptTerms, explainTerms, issueReceipt, makeEvidence } from './lib/evidence.mjs';
import { enrollFunded, claimRefund, inspectClaim } from './lib/chain.mjs';
import { exportEvidence, importEvidence, writePublicJson } from './lib/files.mjs';
import { CentralEscrow } from './lib/central.mjs';

const root = fileURLToPath(new URL('./', import.meta.url));
await mkdir(resolve(root, 'artifacts'), { recursive: true });
const output = await mkdtemp(resolve(root, 'artifacts/demo-'));
let f, central;
try {
  f = await localFixture();
  const { trusted, learner } = f;
  console.log(explainTerms(trusted));
  console.log('자동 데모: 테스트 참가자가 위 조건 해시를 확인한 것으로 명시하고 서명합니다. 실제 사람의 열람·이해를 증명하지 않습니다.');
  const acceptance = await acceptTerms(trusted, learner, await f.now(), trusted.termsHash);
  const registration = await enrollFunded(f.provider, trusted, f.sponsor, acceptance, learner.address);
  central = new CentralEscrow(resolve(output, 'central.sqlite'), trusted, { create: true });
  central.fund(AMOUNT);
  central.enroll(acceptance, learner.address, await f.now());
  await f.setTime(trusted.terms.start);
  const submissions = [];
  for (const session of trusted.terms.submissionIds) submissions.push(await issueReceipt(trusted, f.issuer, learner.address, session, await f.now(), await f.now()));
  const packet = makeEvidence(trusted, acceptance, submissions);
  const evidencePath = resolve(output, 'refund-evidence.v1.json');
  const trustPath = resolve(output, 'trusted-deployment.json');
  await writePublicJson(trustPath, trusted);
  await exportEvidence(evidencePath, packet, trusted, learner.address, await f.now());
  const child = spawnSync(process.execPath, [resolve(root, 'cli.mjs'), 'verify', '--trusted', trustPath,
    '--evidence', evidencePath, '--recipient', learner.address, '--at', String(await f.now())], { encoding: 'utf8' });
  assert.equal(child.status, 0, 'independent process offline verification');
  const offline = JSON.parse(child.stdout);
  assert.equal(offline.cryptographicallyValid, true);
  // Subsequent claim path uses only the file, pinned manifest and transaction sender.
  const imported = await importEvidence(evidencePath, trusted, learner.address, await f.now());
  const funded = await inspectClaim(f.provider, trusted, imported, learner.address);
  central.close(); central = new CentralEscrow(resolve(output, 'central.sqlite'), trusted);
  const centralPayment = central.claim(imported, learner.address, await f.now());
  const onchainPayment = await claimRefund(f.provider, trusted, f.relayer, imported, learner.address);
  assert.equal(await f.token.balanceOf(f.attacker.address), 0n);
  assert.equal(central.status(learner.address).paidUnits, AMOUNT.toString());
  const result = { completedAt: new Date().toISOString(), scope: 'local EVM and separate valueless central ledger; no UI',
    recipient: learner.address, registration,
    reserveBeforeClaim: { balanceUnits: funded.balanceUnits, totalReservedUnits: funded.reserveUnits },
    freshProcessOfflineVerification: offline, centralPayment, onchainPayment,
    keyMaterialExported: false,
    limits: ['Mock signatures do not establish actual submission or learning.', 'Missing issuance, dishonest issuer, chain/token failure and key loss remain.', 'No independent browser/server outage tested.'] };
  // Scan exact in-memory test keys against every JSON artifact before reporting success.
  const outputs = [await readFile(evidencePath, 'utf8'), await readFile(trustPath, 'utf8'), JSON.stringify(result)];
  for (const wallet of f.wallets) for (const text of outputs) assert(!text.toLowerCase().includes(wallet.privateKey.slice(2).toLowerCase()), 'secret scan');
  await writePublicJson(resolve(output, 'result.json'), result);
  console.log(JSON.stringify({ output, recipient: learner.address, centralPaidUnits: centralPayment.paidUnits,
    onchainPaidUnits: onchainPayment.paidUnits, transactionHash: onchainPayment.transactionHash,
    note: 'The in-process chain ends now; exported files remain verifiable offline, not claimable on a new chain.' }, null, 2));
} catch {
  console.error('DEMO_FAILED: see test suite for diagnostics; sensitive error payloads suppressed.');
  process.exitCode = 1;
} finally { central?.close(); if (f) await f.close(); }
