// Reuse the existing funding lab WITHOUT changing its constructor trust model.
// No API/source/attestor process is started. This isolates only L1 after fixture
// allocation, and does not simulate acquiring new real evidence during an outage.
import test from 'node:test';
import assert from 'node:assert/strict';
import {openLab} from '../funding-lab/environment.mjs';
const sent=async p=>(await p).wait();
test('L1 fixture allocation: relayer can claim with no CLEAR/source/witness client and no new grant',async t=>{
  const f=await openLab();t.after(f.close);await f.register();await f.topUp('100000000');
  const app=f.fixtures[0].applicationId;await sent(f.vault.connect(f.signers[3]).allocate(app));
  const before=await f.token.balanceOf(f.fixtures[0].recipient);
  await sent(f.vault.connect(f.signers[3]).claim(app));await sent(f.vault.connect(f.signers[3]).claim(app));
  assert.equal(await f.token.balanceOf(f.fixtures[0].recipient)-before,100000000n);
  assert.equal(await f.vault.totalReserved(),0n);
});
test('independent claim cannot manufacture a funding shortfall without sponsor top-up',async t=>{
  const f=await openLab();t.after(f.close);await f.register();await f.topUp('40000000');
  const app=f.fixtures[0].applicationId;
  await assert.rejects(()=>f.vault.connect(f.signers[3]).allocate.staticCall(app),/INSUFFICIENT_APPLICATION_FUNDS/);
  await assert.rejects(()=>f.vault.connect(f.signers[3]).claim.staticCall(app),/CLAIM_STATE/);
  assert.equal(await f.vault.totalReserved(),0n);
});
test('prefunding an unqualified fixture does not establish eligibility during source outage',async t=>{
  const f=await openLab({eligible:false});t.after(f.close);await f.register();await f.topUp('100000000');
  const app=f.fixtures[0].applicationId;
  await assert.rejects(()=>f.vault.allocate.staticCall(app),/SYNTHETIC_ELIGIBILITY/);
  await assert.rejects(()=>f.vault.claim.staticCall(app),/CLAIM_STATE/);
});
