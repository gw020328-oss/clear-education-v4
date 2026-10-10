import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Wallet, TypedDataEncoder, id } from 'ethers';
import { localFixture } from '../lib/local.mjs';
import { AMOUNT, acceptanceTypes, receiptTypes, acceptTerms, issueReceipt, makeEvidence, validateEvidence, validateAcceptance, termsHash } from '../lib/evidence.mjs';
import { enrollFunded, claimRefund, inspectClaim, verifyDeployment } from '../lib/chain.mjs';
import { exportEvidence, importEvidence, readJson, writePublicJson } from '../lib/files.mjs';
import { CentralEscrow } from '../lib/central.mjs';

const clone = structuredClone;
async function consent(f, wallet = f.learner, overrides = {}, domain = f.trusted.domain, signer = wallet) {
  const value = { termsHash: f.trusted.termsHash, learner: wallet.address, acceptedAt: await f.now(), ...overrides };
  return { ...value, signature: await signer.signTypedData(domain, acceptanceTypes, value) };
}
async function packet(f, acceptance, { signer = f.issuer, recipient = f.learner.address, hash = f.trusted.termsHash,
  time = f.trusted.terms.start, domain = f.trusted.domain, sessions = [0, 1, 2, 3] } = {}) {
  const submissions = [];
  for (const session of sessions) {
    const receipt = { termsHash: hash, learner: recipient, session, completedAt: time };
    submissions.push({ receipt, signature: await signer.signTypedData(domain, receiptTypes, receipt) });
  }
  return makeEvidence(f.trusted, acceptance, submissions);
}
async function setup(options) {
  const f = await localFixture(options);
  try {
    f.acceptance = await acceptTerms(f.trusted, f.learner, await f.now(), f.trusted.termsHash);
    await enrollFunded(f.provider, f.trusted, f.sponsor, f.acceptance, f.learner.address);
    await f.setTime(f.trusted.terms.start);
    f.good = await packet(f, f.acceptance);
    return f;
  } catch (e) { await f.close(); throw e; }
}
function centralFor(f, path = ':memory:') {
  const c = new CentralEscrow(path, f.trusted, { create: true });
  c.fund(AMOUNT); c.enroll(f.acceptance, f.learner.address, f.trusted.terms.start);
  return c;
}
function args(f, p, recipient = f.learner.address) {
  return [recipient, p.submissions.map(s => s.receipt), p.submissions.map(s => s.signature)];
}
async function minedRevert(invoke) {
  let receipt;
  try { await (await invoke()).wait(); }
  catch (e) { receipt = e.receipt; }
  assert.equal(receipt?.status, 0, 'must be an actual mined revert, not a client/transport rejection');
}
async function rejectClaim(f, p, reason) {
  const call = f.vault.connect(f.relayer);
  await assert.rejects(() => call.claim.staticCall(...args(f, p)), new RegExp(reason));
  const balance = await f.token.balanceOf(f.learner.address);
  const reserve = await f.vault.totalReserved();
  await minedRevert(() => call.claim(...args(f, p), { gasLimit: 900000 }));
  assert.equal(await f.token.balanceOf(f.learner.address), balance);
  assert.equal(await f.vault.totalReserved(), reserve);
}
async function successfulRawClaim(f, p) {
  const before = await f.token.balanceOf(f.learner.address);
  const tx = await (await f.vault.connect(f.relayer).claim(...args(f, p), { gasLimit: 900000 })).wait();
  assert.equal(tx.status, 1);
  assert.equal(await f.token.balanceOf(f.learner.address) - before, AMOUNT);
  return tx;
}
async function snapshotReset(f) {
  let snapshot = await f.rpc.request({ method: 'evm_snapshot', params: [] });
  return async () => {
    assert(await f.rpc.request({ method: 'evm_revert', params: [snapshot] }));
    snapshot = await f.rpc.request({ method: 'evm_snapshot', params: [] });
  };
}

test('all 14 original outcome expectations on the new consent/file/ledger implementation', async t => {
  const original = JSON.parse(await readFile(new URL('../../baseline/results.json', import.meta.url), 'utf8'));
  const f = await setup();
  const reset = await snapshotReset(f);
  const reasons = { 'verifier-withholds-last-receipt': 'count', 'forged-signatures': 'signature', 'duplicate-receipt': 'duplicate',
    'other-learner': 'scope', 'changed-terms': 'scope', 'replay-claim': 'not claimable', 'claim-expired': 'expired' };
  try {
    for (const expected of original.scenarios) await t.test(expected.scenario, async () => {
      await reset(); const c = centralFor(f);
      try {
        const name = expected.scenario;
        let p = clone(f.good);
        if (name.startsWith('escrow-')) c.engine = false;
        if (name === 'verifier-withholds-last-receipt') p.submissions.pop();
        if (name === 'forged-signatures') p = await packet(f, f.acceptance, { signer: f.attacker });
        if (name === 'duplicate-receipt') p.submissions[3] = clone(p.submissions[0]);
        if (name === 'other-learner') p = await packet(f, f.acceptance, { recipient: f.other.address });
        if (name === 'changed-terms') p = await packet(f, f.acceptance, { hash: id('changed') });
        if (name === 'replay-claim') { c.claim(p, f.learner.address, await f.now()); await successfulRawClaim(f, p); }
        if (name === 'claim-expired') await f.setTime(f.trusted.terms.claimUntil + 1);
        if (expected.central.accepted) {
          assert.equal(c.claim(p, f.learner.address, await f.now()).paidUnits, AMOUNT.toString());
          assert.equal(c.status(f.learner.address).paidUnits, AMOUNT.toString());
        } else {
          const now = await f.now();
          const code = { 'escrow-executor-refuses': 'CENTRAL_ENGINE_UNAVAILABLE', 'escrow-engine-offline': 'CENTRAL_ENGINE_UNAVAILABLE',
            'verifier-withholds-last-receipt': 'COUNT', 'forged-signatures': 'ISSUER_SIGNATURE', 'duplicate-receipt': 'DUPLICATE',
            'other-learner': 'RECEIPT_SCOPE', 'changed-terms': 'RECEIPT_SCOPE', 'replay-claim': 'CENTRAL_NOT_CLAIMABLE', 'claim-expired': 'EXPIRED' }[name];
          assert.throws(() => c.claim(p, f.learner.address, now), new RegExp(code));
        }
        if (expected.onchain.accepted) await successfulRawClaim(f, p);
        else await rejectClaim(f, p, reasons[name]);
      } finally { c.close(); }
    });
  } finally { await f.close(); }
});

test('participant consent, complete reserve, fixed recipient and JS/Solidity digests', async () => {
  const f = await setup();
  try {
    const accepted = await validateAcceptance(f.acceptance, f.trusted, f.learner.address, await f.now());
    assert.equal(await f.vault.acceptanceDigest(f.learner.address, f.acceptance.acceptedAt), accepted);
    assert.equal(await f.vault.consentDigest(f.learner.address), accepted);
    assert.equal(await f.vault.acceptedAt(f.learner.address), BigInt(f.acceptance.acceptedAt));
    for (const s of f.good.submissions) assert.equal(await f.vault.digest(s.receipt), TypedDataEncoder.hash(f.trusted.domain, receiptTypes, s.receipt));
    const inspected = await inspectClaim(f.provider, f.trusted, f.good, f.learner.address);
    assert.equal(inspected.balanceUnits, AMOUNT.toString());
    assert.equal(inspected.reserveUnits, AMOUNT.toString());
    const paid = await claimRefund(f.provider, f.trusted, f.relayer, f.good, f.learner.address);
    assert.equal(paid.afterUnits, AMOUNT.toString());
    assert.equal(paid.submitter, f.attacker.address);
    assert.equal(await f.token.balanceOf(f.attacker.address), 0n);
    assert.equal(await f.vault.totalReserved(), 0n);
  } finally { await f.close(); }
});

test('absent, forged, other-contract, other-terms and future consent rejected without registration', async t => {
  const f = await localFixture();
  const reset = await snapshotReset(f);
  try {
    await assert.rejects(() => acceptTerms(f.trusted, f.learner, f.trusted.terms.start, undefined), /TERMS_NOT_CONFIRMED/);
    for (const label of ['absent', 'forged', 'other-contract', 'other-terms', 'future', 'zero']) await t.test(label, async () => {
      await reset();
      let a = await consent(f);
      if (label === 'absent') a.signature = '0x';
      if (label === 'forged') a = await consent(f, f.learner, {}, f.trusted.domain, f.attacker);
      if (label === 'other-contract') a = await consent(f, f.learner, {}, { ...f.trusted.domain, verifyingContract: f.token.target });
      if (label === 'other-terms') a = await consent(f, f.learner, { termsHash: id('changed') });
      if (label === 'future') a = await consent(f, f.learner, { acceptedAt: await f.now() + 1 });
      if (label === 'zero') a = await consent(f, f.learner, { acceptedAt: 0 });
      assert.throws(() => validateAcceptance(a, f.trusted, f.learner.address, f.trusted.terms.start - 10));
      await minedRevert(() => f.vault.enroll(f.learner.address, a.acceptedAt, a.signature, { gasLimit: 500000 }));
      assert.equal(await f.vault.enrolled(f.learner.address), false);
      assert.equal(await f.vault.totalReserved(), 0n);
      assert.equal(await f.token.balanceOf(f.vault.target), 0n);
      const c = new CentralEscrow(':memory:', f.trusted, { create: true });
      try { c.fund(AMOUNT); assert.throws(() => c.enroll(a, f.learner.address, f.trusted.terms.start - 10)); assert.equal(c.status(f.learner.address).enrolled, false); }
      finally { c.close(); }
    });
  } finally { await f.close(); }
});

test('insufficient balance and insufficient approval independently roll back deposits/consent', async t => {
  for (const [label, options, reason] of [['balance', { funds: AMOUNT - 1n }, 'balance/address'], ['allowance', { allowance: AMOUNT - 1n }, 'allowance']]) {
    await t.test(label, async () => {
      const f = await localFixture(options);
      try {
        const a = await consent(f);
        const before = await f.token.balanceOf(await f.sponsor.getAddress());
        await assert.rejects(() => f.vault.enroll.staticCall(f.learner.address, a.acceptedAt, a.signature), new RegExp(reason));
        await minedRevert(() => f.vault.enroll(f.learner.address, a.acceptedAt, a.signature, { gasLimit: 500000 }));
        assert.equal(await f.vault.enrolled(f.learner.address), false);
        assert.equal(await f.vault.acceptedAt(f.learner.address), 0n);
        assert.equal(await f.vault.consentDigest(f.learner.address), '0x' + '0'.repeat(64));
        assert.equal(await f.token.balanceOf(f.vault.target), 0n);
        assert.equal(await f.vault.totalReserved(), 0n);
        assert.equal(await f.token.balanceOf(await f.sponsor.getAddress()), before);
        const c = new CentralEscrow(':memory:', f.trusted, { create: true });
        try {
          c.fund(AMOUNT - 1n);
          assert.throws(() => c.enroll(a, f.learner.address, f.trusted.terms.start - 10), /CENTRAL_RESERVE/);
          assert.equal(c.status(f.learner.address).enrolled, false);
          c.fund(1n); c.enroll(a, f.learner.address, f.trusted.terms.start - 10);
          assert.equal(c.status(f.learner.address).reserveUnits, AMOUNT.toString());
        } finally { c.close(); }
      } finally { await f.close(); }
    });
  }
});

test('signed receipt time boundaries and out-of-range submission number, exact mined timestamps', async t => {
  const f = await setup(); const reset = await snapshotReset(f);
  const { start, due } = f.trusted.terms;
  try {
    for (const [label, completedAt, now, accepted, sessions] of [
      ['before-start', start - 1, start, false], ['at-start', start, start, true],
      ['before-due', due - 1, due, true], ['at-due', due, due, true], ['after-due', due + 1, due + 1, false],
      ['future', start + 1, start, false], ['session-4', start, start, false, [0, 1, 2, 4]]
    ]) await t.test(label, async () => {
      await reset(); await f.setTime(now);
      const p = await packet(f, f.acceptance, { time: completedAt, ...(sessions ? { sessions } : {}) });
      const c = centralFor(f);
      try {
        if (accepted) {
          validateEvidence(p, f.trusted, f.learner.address, now);
          c.claim(p, f.learner.address, now);
          const r = await successfulRawClaim(f, p);
          assert.equal(Number((await f.provider.send('eth_getBlockByNumber', ['0x' + r.blockNumber.toString(16), false])).timestamp), now);
        } else {
          assert.throws(() => validateEvidence(p, f.trusted, f.learner.address, now));
          assert.throws(() => c.claim(p, f.learner.address, now));
          await rejectClaim(f, p, sessions ? 'scope' : 'time');
        }
      } finally { c.close(); }
    });
  } finally { await f.close(); }
});

test('claim expiry minus-one / exact / plus-one and sponsor-only destination of expired reserves', async t => {
  const f = await setup(); const reset = await snapshotReset(f);
  try {
    for (const offset of [-1, 0, 1]) await t.test(String(offset), async () => {
      await reset(); const now = f.trusted.terms.claimUntil + offset; await f.setTime(now);
      const c = centralFor(f);
      try {
        if (offset <= 0) {
          await minedRevert(() => f.vault.reclaimExpired(f.learner.address, { gasLimit: 300000 }));
          assert.throws(() => c.reclaimExpired(f.learner.address, now), /CENTRAL_NOT_EXPIRED/);
          c.claim(f.good, f.learner.address, now);
          await successfulRawClaim(f, f.good);
        } else {
          assert.throws(() => c.claim(f.good, f.learner.address, now), /EXPIRED/);
          await rejectClaim(f, f.good, 'expired');
          const sponsorBefore = await f.token.balanceOf(await f.sponsor.getAddress());
          await (await f.vault.connect(f.relayer).reclaimExpired(f.learner.address)).wait();
          assert.equal(await f.token.balanceOf(await f.sponsor.getAddress()) - sponsorBefore, AMOUNT);
          assert.equal(await f.token.balanceOf(f.vault.target), 0n);
          assert.equal(await f.token.balanceOf(f.attacker.address), 0n);
          assert.equal(await f.vault.totalReserved(), 0n);
          assert.equal(await f.vault.settled(f.learner.address), true);
          const returned = c.reclaimExpired(f.learner.address, now);
          assert.equal(returned.recipient, f.trusted.terms.sponsor);
          assert.equal(returned.returnedUnits, AMOUNT.toString());
          assert.equal(c.status(f.learner.address).reserveUnits, '0');
          assert.equal(c.status(f.learner.address).paidUnits, '0');
          assert.throws(() => c.reclaimExpired(f.learner.address, now), /CENTRAL_NOT_CLAIMABLE/);
        }
        assert.equal(await f.now(), now);
      } finally { c.close(); }
    });
  } finally { await f.close(); }
});

test('registration deadline boundary and one-time participant consent', async t => {
  const f = await localFixture(); const reset = await snapshotReset(f);
  try {
    for (const offset of [-1, 0, 1]) await t.test(String(offset), async () => {
      await reset(); await f.setTime(f.trusted.terms.due + offset);
      const a = await consent(f); const c = new CentralEscrow(':memory:', f.trusted, { create: true }); c.fund(AMOUNT * 2n);
      try {
        if (offset <= 0) {
          await enrollFunded(f.provider, f.trusted, f.sponsor, a, f.learner.address);
          c.enroll(a, f.learner.address, await f.now());
          await minedRevert(() => f.vault.enroll(f.learner.address, a.acceptedAt, a.signature, { gasLimit: 500000 }));
          assert.throws(() => c.enroll(a, f.learner.address, f.trusted.terms.due + offset), /CENTRAL_ALREADY_ENROLLED/);
          assert.equal(await f.vault.totalReserved(), AMOUNT);
        } else {
          await minedRevert(() => f.vault.enroll(f.learner.address, a.acceptedAt, a.signature, { gasLimit: 500000 }));
          assert.throws(() => c.enroll(a, f.learner.address, f.trusted.terms.due + offset));
          assert.equal(await f.vault.enrolled(f.learner.address), false);
        }
      } finally { c.close(); }
    });
  } finally { await f.close(); }
});

test('foreign contract and chain signatures rejected by both file validation and EVM', async t => {
  const f = await setup();
  try {
    const second = await f.deploy('RefundVault', [f.token.target, f.issuer.address, f.trusted.termsHash, f.trusted.terms.start, f.trusted.terms.due, f.trusted.terms.claimUntil]);
    for (const domain of [{ ...f.trusted.domain, verifyingContract: second.target }, { ...f.trusted.domain, chainId: 31338 }]) await t.test(String(domain.chainId) + '/' + domain.verifyingContract, async () => {
      const p = await packet(f, f.acceptance, { domain });
      assert.throws(() => validateEvidence(p, f.trusted, f.learner.address, f.trusted.terms.start), /ISSUER_SIGNATURE/);
      await rejectClaim(f, p, 'signature');
      p.domain = domain;
      assert.throws(() => validateEvidence(p, f.trusted, f.learner.address, f.trusted.terms.start), /DOMAIN_MISMATCH/);
    });
    // Even a caller-supplied altered manifest fails against the actual deployed code/config.
    const wrong = clone(f.trusted); wrong.terms.due -= 1; wrong.termsHash = termsHash(wrong.terms);
    await assert.rejects(() => verifyDeployment(f.provider, wrong), /CONTRACT_CONFIG_MISMATCH/);
    const wrongGenesis = clone(f.trusted); wrongGenesis.deployment.genesisHash = id('foreign-chain-instance');
    await assert.rejects(() => verifyDeployment(f.provider, wrongGenesis), /DEPLOYMENT_MISMATCH/);
    const wrongCode = clone(f.trusted); wrongCode.deployment.vaultCodeHash = id('other-code');
    await assert.rejects(() => verifyDeployment(f.provider, wrongCode), /VAULT_CODE_MISMATCH/);
  } finally { await f.close(); }
});

test('malformed/noncanonical signatures, participant mismatch and untrusted metadata rejected', async t => {
  const f = await setup();
  try {
    for (const [label, mutate, contractReason] of [
      ['truncated signature', p => { p.submissions[0].signature = '0x12'; }, 'signature length'],
      ['high s', p => { p.submissions[0].signature = '0x' + '11'.repeat(32) + 'ff'.repeat(32) + '1b'; }, 'signature canonical'],
      ['bad v', p => { p.submissions[0].signature = p.submissions[0].signature.slice(0, -2) + '00'; }, 'signature canonical'],
      ['file condition', p => { p.terms.claimUntil += 1; }],
      ['file contract', p => { p.domain.verifyingContract = f.token.target; }],
      ['file chain', p => { p.domain.chainId = 1; }],
      ['file recipient', p => { p.recipient = f.other.address; }],
      ['unknown field / key input', p => { p.privateKey = 'forbidden-field'; }],
      ['unexpected personal information', p => { p.submissions[0].receipt.email = 'unneeded'; }],
      ['unknown version', p => { p.schemaVersion = 'refund-evidence/99'; }]
    ]) await t.test(label, async () => {
      const p = clone(f.good); mutate(p);
      assert.throws(() => validateEvidence(p, f.trusted, f.learner.address, f.trusted.terms.start));
      if (contractReason) await rejectClaim(f, p, contractReason);
    });
    assert.throws(() => validateEvidence(f.good, f.trusted, f.other.address, f.trusted.terms.start), /RECIPIENT_MISMATCH/);
  } finally { await f.close(); }
});

test('issuer, bounded file round-trip, independent verifier process and exact secret exclusion', async () => {
  const f = await setup(); const dir = await mkdtemp(join(tmpdir(), 'refund-files-'));
  try {
    const issued = [];
    for (let i = 0; i < 4; i++) issued.push(await issueReceipt(f.trusted, f.issuer, f.learner.address, i, await f.now(), await f.now()));
    const p = makeEvidence(f.trusted, f.acceptance, issued);
    await assert.rejects(() => issueReceipt(f.trusted, f.attacker, f.learner.address, 0, f.trusted.terms.start, f.trusted.terms.start), /ISSUER/);
    const file = join(dir, 'evidence.json'); const trust = join(dir, 'trust.json');
    await writePublicJson(trust, f.trusted);
    await exportEvidence(file, p, f.trusted, f.learner.address, await f.now());
    assert.deepEqual(await importEvidence(file, f.trusted, f.learner.address, await f.now()), p);
    await assert.rejects(() => exportEvidence(file, p, f.trusted, f.learner.address, f.trusted.terms.start), { code: 'EEXIST' });
    const text = await readFile(file, 'utf8');
    for (const wallet of f.wallets) assert(!text.toLowerCase().includes(wallet.privateKey.slice(2).toLowerCase()), 'no generated secret in file');
    assert(!/privateKey|secretKey|mnemonic|email|studentName/i.test(text));
    const output = await runChild([fileURLToPath(new URL('../cli.mjs', import.meta.url)), 'verify', '--evidence', file, '--trusted', trust,
      '--recipient', f.learner.address, '--at', String(await f.now())]);
    assert.equal(output.code, 0); assert.equal(JSON.parse(output.stdout).cryptographicallyValid, true);
    assert.equal(JSON.parse(output.stdout).liveReserveChecked, false);
    for (const [name, content, code] of [['invalid', '{', 'INVALID_JSON'], ['oversize', ' '.repeat(65537), 'FILE_TOO_LARGE'], ['utf8', Buffer.from([0xff]), 'INVALID_JSON']]) {
      const path = join(dir, name); await writeFile(path, content);
      await assert.rejects(() => readJson(path), new RegExp(code));
    }
    const imported = await importEvidence(file, f.trusted, f.learner.address, await f.now());
    await claimRefund(f.provider, f.trusted, f.relayer, imported, f.learner.address);
  } finally { await f.close(); await rm(dir, { recursive: true, force: true }); }
});

test('token freeze restores settled/reserve; thaw pays exact amount; no-gas sender then alternative sender', async () => {
  const f = await setup();
  try {
    await (await f.token.setFrozen(true)).wait();
    await rejectClaim(f, f.good, 'token frozen');
    assert.equal(await f.vault.settled(f.learner.address), false);
    assert.equal(await f.vault.totalReserved(), AMOUNT);
    await (await f.token.setFrozen(false)).wait();
    const empty = Wallet.createRandom().connect(f.provider);
    await assert.rejects(async () => { await (await f.vault.connect(empty).claim(...args(f, f.good), { gasLimit: 900000 })).wait(); }, /insufficient funds/);
    assert.equal(await f.vault.settled(f.learner.address), false);
    await claimRefund(f.provider, f.trusted, f.relayer, f.good, f.learner.address);
    assert.equal(await f.token.balanceOf(f.learner.address), AMOUNT);
    assert.equal(await f.token.balanceOf(f.attacker.address), 0n);
  } finally { await f.close(); }
});

test('two participants have fully funded independent reserves and no early sponsor withdrawal', async () => {
  const f = await setup();
  try {
    const otherConsent = await consent(f, f.other);
    await enrollFunded(f.provider, f.trusted, f.sponsor, otherConsent, f.other.address);
    assert.equal(await f.vault.totalReserved(), 2n * AMOUNT);
    assert.equal(await f.token.balanceOf(f.vault.target), 2n * AMOUNT);
    await minedRevert(() => f.vault.reclaimExpired(f.learner.address, { gasLimit: 300000 }));
    await successfulRawClaim(f, f.good);
    assert.equal(await f.vault.totalReserved(), AMOUNT);
    assert.equal(await f.token.balanceOf(f.vault.target), AMOUNT);
    const otherPacket = await packet(f, otherConsent, { recipient: f.other.address });
    await claimRefund(f.provider, f.trusted, f.relayer, otherPacket, f.other.address);
    assert.equal(await f.vault.totalReserved(), 0n);
    assert.equal(await f.token.balanceOf(f.vault.target), 0n);
  } finally { await f.close(); }
});

function runChild(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject); child.on('close', code => resolve({ code, stdout, stderr }));
  });
}
test('central independent persistent reserve, alternate direct process, concurrent/restarted replay and no RPC dependence', async () => {
  const f = await setup(); const dir = await mkdtemp(join(tmpdir(), 'refund-central-'));
  const db = join(dir, 'escrow.sqlite'); let c;
  try {
    c = centralFor(f, db); c.close(); c = undefined;
    const trust = join(dir, 'trust.json'), file = join(dir, 'evidence.json');
    await writePublicJson(trust, f.trusted); await exportEvidence(file, f.good, f.trusted, f.learner.address, await f.now());
    const worker = join(dir, 'worker.mjs');
    await writeFile(worker, `import { CentralEscrow } from ${JSON.stringify(new URL('../lib/central.mjs', import.meta.url).href)};
      import { readFileSync } from 'node:fs';
      const [db, trust, file, recipient, time] = process.argv.slice(2);
      const c = new CentralEscrow(db, JSON.parse(readFileSync(trust)));
      try { c.claim(JSON.parse(readFileSync(file)), recipient, Number(time)); console.log('paid'); }
      catch (e) { console.log(e.code || 'error'); process.exitCode = 2; }
      finally { c.close(); }`);
    const arguments_ = [worker, db, trust, file, f.learner.address, String(await f.now())];
    const results = await Promise.all([runChild(arguments_), runChild(arguments_)]);
    assert.deepEqual(results.map(r => r.code).sort(), [0, 2]);
    assert(results.some(r => r.stdout.trim() === 'CENTRAL_NOT_CLAIMABLE'));
    c = new CentralEscrow(db, f.trusted);
    assert.equal(c.status(f.learner.address).paidUnits, AMOUNT.toString());
    assert.equal(c.status(f.learner.address).reserveUnits, '0');
    assert.throws(() => c.claim(f.good, f.learner.address, f.trusted.terms.start), /CENTRAL_NOT_CLAIMABLE/);
    const c2 = centralFor(f);
    try {
      await assert.rejects(() => verifyDeployment({ send: async () => { throw new Error('LOCAL_RPC_OFFLINE'); } }, f.trusted), /LOCAL_RPC_OFFLINE/);
      assert.equal(c2.claim(f.good, f.learner.address, f.trusted.terms.start).paidUnits, AMOUNT.toString());
    } finally { c2.close(); }
    const bypass = await runChild([fileURLToPath(new URL('../cli.mjs', import.meta.url)), 'central-claim', '--trusted', trust,
      '--evidence', file, '--recipient', f.learner.address, '--db', db, '--at', String(f.trusted.terms.start)]);
    assert.equal(bypass.code, 1); assert.match(bypass.stderr, /PAYMENT_CLOCK_OVERRIDE_FORBIDDEN/);
  } finally { c?.close(); await f.close(); await rm(dir, { recursive: true, force: true }); }
});
