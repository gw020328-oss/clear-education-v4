import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserProvider, id } from 'ethers';
import { fixture } from './fixture.mjs';
import { createVaultReader } from '../../src/vault/reader.mjs';

function intercepted(t, f, modify, pin = f.pin) {
  const provider = new BrowserProvider({ request: async args => modify(args, structuredClone(await f.raw.request(args))) }, undefined, { cacheTimeout: -1 });
  t.after(() => provider.destroy()); return createVaultReader(provider, pin);
}

for (const [label, modify, error] of [
  ['chain id', (a, r) => a.method === 'eth_chainId' ? '0x1' : r, 'VAULT_CHAIN'],
  ['genesis', (a, r) => a.method === 'eth_getBlockByNumber' && a.params[0] === '0x0' ? { ...r, hash: id('different-genesis') } : r, 'VAULT_GENESIS'],
  ['deployment failure', (a, r) => a.method === 'eth_getTransactionReceipt' ? { ...r, status: '0x0' } : r, 'FUNDING_UNCONFIRMED'],
  ['deployment reorg', (a, r) => a.method === 'eth_getTransactionReceipt' ? { ...r, blockHash: id('orphan') } : r, 'CHAIN_REORG'],
  ['vault code', (a, r, f) => a.method === 'eth_getCode' && a.params[0].toLowerCase() === f.pin.vaultAddress.toLowerCase() ? '0x00' : r, 'VAULT_CODE'],
  ['token code', (a, r, f) => a.method === 'eth_getCode' && a.params[0].toLowerCase() === f.config.token.toLowerCase() ? '0x00' : r, 'TOKEN_CODE'],
]) test(`reader rejects ${label} mismatch without accepting a runtime`, async t => {
  const f = await fixture(t), reader = intercepted(t, f, (a, r) => modify(a, r, f));
  await assert.rejects(() => reader.inspect(), { message: error });
});

for (const [label, modify, error] of [
  ['another transaction receipt', r => { r.transactionHash = id('another-transaction'); }, 'FUNDING_UNCONFIRMED'],
  ['reverted receipt', r => { r.status = '0x0'; }, 'FUNDING_UNCONFIRMED'],
  ['orphan receipt', r => { r.blockHash = id('orphan'); }, 'CHAIN_REORG'],
  ['missing enrollment event', (r, f) => { r.logs = r.logs.filter(l => l.address.toLowerCase() !== f.pin.vaultAddress.toLowerCase()); }, 'FUNDING_EVENT'],
  ['missing token transfer', (r, f) => { r.logs = r.logs.filter(l => l.address.toLowerCase() !== f.config.token.toLowerCase()); }, 'FUNDING_TRANSFER'],
]) test(`reader refuses enrollment from ${label}`, async t => {
  const f = await fixture(t), enrolled = await f.enroll();
  const reader = intercepted(t, f, (a, r) => {
    if (a.method === 'eth_getTransactionReceipt' && a.params[0] === enrolled.tx.hash) modify(r, f);
    return r;
  });
  await assert.rejects(() => reader.fundingEvidence(f.record, enrolled.typed, enrolled.signature, enrolled.tx.hash), { message: error });
});

for (const field of ['from', 'to', 'input', 'value', 'blockHash']) test(`reader refuses funding transaction substitution: ${field}`, async t => {
  const f = await fixture(t), enrolled = await f.enroll();
  const reader = intercepted(t, f, (a, r) => {
    if (a.method === 'eth_getTransactionByHash' && a.params[0] === enrolled.tx.hash) {
      r[field] = ['from', 'to'].includes(field) ? f.app.bob.address : field === 'input' ? '0x00' : field === 'value' ? '0x1' : id('orphan');
    }
    return r;
  });
  await assert.rejects(() => reader.fundingEvidence(f.record, enrolled.typed, enrolled.signature, enrolled.tx.hash), /FUNDING_TRANSACTION/);
});

test('canonical funding evidence remains tied to its historical block and deployment', async t => {
  const f = await fixture(t), enrolled = await f.enroll();
  const evidence = await f.reader.fundingEvidence(f.record, enrolled.typed, enrolled.signature, enrolled.tx.hash);
  await f.setTime(Number(f.config.normalSubmitFrom));
  assert.deepEqual(await f.reader.fundingEvidence(f.record, enrolled.typed, enrolled.signature, enrolled.tx.hash), evidence);
  const pin = { ...f.pin, deploymentTxHash: enrolled.tx.hash }, reader = createVaultReader(f.provider, pin);
  await assert.rejects(() => reader.inspect(), /VAULT_DEPLOYMENT/);
});
