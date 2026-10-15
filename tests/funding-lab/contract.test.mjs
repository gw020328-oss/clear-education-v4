import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserProvider, ContractFactory, id, ZeroHash, ZeroAddress } from 'ethers';
import ganache from 'ganache';
import { openLab } from '../../spikes/funding-lab/environment.mjs';
async function setup(t,options) { const f=await openLab(options);t.after(f.close);return f; }
const sent=async p=>(await p).wait();
async function invariant(f) {
  let held=0n,reserved=0n;
  for(const fixture of f.fixtures){const a=await f.vault.accounts(fixture.applicationId);held+=a.held;reserved+=a.settlement===1n?a.allocated:0n;
    assert.equal(a.fundedTotal,a.held+a.paid+a.recovered);assert.ok(a.paid===0n||a.paid===BigInt(fixture.entitlement));
    assert.ok(a.allocated===0n||a.allocated===BigInt(fixture.entitlement));if(a.settlement===3n)assert.equal(a.paid,0n);}
  assert.equal(await f.vault.totalHeld(),held);assert.equal(await f.vault.totalReserved(),reserved);
  assert.ok(await f.token.balanceOf(f.pin.vault)>=held);assert.ok(held>=reserved);
}
test('registration/consent, synthetic eligibility, partial funds, full allocation and one payment stay separate',async t=>{
  const f=await setup(t),app=f.fixtures[0].applicationId;
  await f.register();let s=await f.reader.snapshot(app);
  assert.equal(s.registration,'REGISTERED');assert.equal(s.eligibility,'FINAL_SYNTHETIC');assert.equal(s.funding,'UNFUNDED');assert.equal(s.claimState,'NOT_READY');
  await assert.rejects(()=>f.vault.allocate.staticCall(app),/INSUFFICIENT_APPLICATION_FUNDS/);
  await assert.rejects(()=>f.vault.claim.staticCall(app),/CLAIM_STATE/);
  await f.topUp('40000000');s=await f.reader.snapshot(app);assert.equal(s.shortfallAtoms,'60000000');assert.equal(s.funding,'PARTIAL');
  await assert.rejects(()=>f.vault.claim.staticCall(app),/CLAIM_STATE/);
  await f.topUp('60000000');s=await f.reader.snapshot(app);assert.equal(s.funding,'FUNDED');assert.equal(s.reservedAtoms,'0');
  await sent(f.vault.connect(f.signers[3]).allocate(app));await f.mine();s=await f.reader.snapshot(app);assert.equal(s.reservedAtoms,'100000000');
  await sent(f.vault.connect(f.signers[3]).claim(app));await sent(f.vault.claim(app));await f.mine();s=await f.reader.snapshot(app);
  assert.equal(s.paidAtoms,'100000000');assert.equal(s.claimState,'PAID');assert.equal(s.paymentAllowed,false);assert.equal(s.proofVerified,false);
  assert.equal(await f.token.balanceOf(f.fixtures[0].recipient),100000000n);await invariant(f);
});
test('funding never upgrades an unverified fixture into eligibility',async t=>{
  const f=await setup(t,{eligible:false}),app=f.fixtures[0].applicationId;await f.register();await f.topUp('100000000');
  assert.equal((await f.reader.snapshot(app)).eligibility,'ON_HOLD');await assert.rejects(()=>f.vault.allocate.staticCall(app),/SYNTHETIC_ELIGIBILITY/);await invariant(f);
});
test('consent binding and roles reject another learner, changed agreement and wrong sponsor',async t=>{
  const f=await setup(t),app=f.fixtures[0].applicationId,h=await f.vault.agreementHash(app);
  await assert.rejects(()=>f.vault.register.staticCall(app,h),/CONSENT/);
  await assert.rejects(()=>f.vault.connect(f.signers[1]).register.staticCall(app,id('changed')),/CONSENT/);
  await f.register();await f.register();
  await assert.rejects(()=>f.vault.connect(f.signers[1]).topUp.staticCall(app,id('op'),1),/SPONSOR/);
  await assert.rejects(()=>f.vault.cancel.staticCall(app),/LEARNER/);
  await assert.rejects(()=>f.vault.connect(f.signers[1]).recoverUnallocated.staticCall(app),/SPONSOR/);
  const other=await new ContractFactory(f.artifacts.FundingLab.abi,f.artifacts.FundingLab.bytecode,f.signers[0]).deploy(f.config,f.fixtures);await other.waitForDeployment();
  assert.notEqual(await other.agreementHash(app),h);
  await assert.rejects(()=>other.connect(f.signers[1]).register.staticCall(app,h),/CONSENT/);
});
test('idempotent topup consumes a stable operation once and rejects app/amount reuse',async t=>{
  const f=await setup(t),app=f.fixtures[0].applicationId;await f.register();await f.register(1);
  const {operationId}=await f.topUp('40000000');await sent(f.vault.topUp(app,operationId,'40000000'));await f.mine();
  assert.equal((await f.reader.snapshot(app)).fundedTotalAtoms,'40000000');
  await assert.rejects(()=>f.vault.topUp.staticCall(app,operationId,1),/OPERATION_CONFLICT/);
  await assert.rejects(()=>f.vault.topUp.staticCall(f.fixtures[1].applicationId,operationId,'40000000'),/OPERATION_CONFLICT/);
  await invariant(f);
});
test('failed input transfer rolls back operation and all credited funds',async t=>{
  const f=await setup(t),app=f.fixtures[0].applicationId,op=id('unapproved');await f.register();
  await assert.rejects(()=>sent(f.vault.topUp(app,op,10,{gasLimit:500000})));
  assert.equal(await f.vault.operations(op),ZeroHash);assert.equal((await f.vault.accounts(app)).held,0n);await invariant(f);
});
test('concurrent allocation and payment retries create only one allocation and payment event',async t=>{
  const f=await setup(t),app=f.fixtures[0].applicationId;await f.register();await f.topUp('100000000');
  const allocated=await Promise.all([0,3].map(i=>sent(f.vault.connect(f.signers[i]).allocate(app,{gasLimit:500000}))));
  const paid=await Promise.all([0,3].map(i=>sent(f.vault.connect(f.signers[i]).claim(app,{gasLimit:500000}))));
  const count=(rs,name)=>rs.flatMap(r=>r.logs).filter(l=>{try{return f.vault.interface.parseLog(l)?.name===name;}catch{return false;}}).length;
  assert.equal(count(allocated,'Allocated'),1);assert.equal(count(paid,'Paid'),1);await invariant(f);
});
test('another application cannot spend dedicated credit, excess or reservations',async t=>{
  const f=await setup(t),[a,b]=f.fixtures.map(x=>x.applicationId);await f.register();await f.register(1);await f.topUp('150000000');
  await sent(f.vault.allocate(a));await assert.rejects(()=>f.vault.allocate.staticCall(b),/INSUFFICIENT_APPLICATION_FUNDS/);
  await assert.rejects(()=>f.vault.recoverUnallocated.staticCall(a),/RECOVERY_TIME/);
  await assert.rejects(()=>f.vault.connect(f.signers[1]).cancel.staticCall(a),/CANCEL_STATE/);
  await f.time(f.config.allocationUntil+1);await sent(f.vault.recoverUnallocated(a));
  assert.equal((await f.vault.accounts(a)).held,100000000n);assert.equal(await f.vault.totalReserved(),100000000n);
  await assert.rejects(()=>f.vault.recoverUnallocated.staticCall(a),/NO_UNALLOCATED/);await sent(f.vault.claim(a));await invariant(f);
  assert.ok(!f.vault.interface.fragments.some(x=>x.type==='function'&&/set|move|sweep|pause|upgrade|reduce/i.test(x.name)));
});
test('learner cancellation before allocation refunds only that application to fixed recipient',async t=>{
  const f=await setup(t),[a,b]=f.fixtures.map(x=>x.applicationId);await f.register();await f.register(1);await f.topUp('40000000');await f.topUp('100000000',1);
  await sent(f.vault.allocate(b));await sent(f.vault.connect(f.signers[1]).cancel(a));await f.register();
  await assert.rejects(()=>f.vault.topUp.staticCall(a,id('new'),1),/TOPUP_STATE/);await assert.rejects(()=>f.vault.allocate.staticCall(a),/SYNTHETIC_ELIGIBILITY/);
  await sent(f.vault.recoverUnallocated(a));assert.equal(await f.vault.totalReserved(),100000000n);await invariant(f);
});
test('cancellation/allocation race has one consistent terminal choice',async t=>{
  const f=await setup(t),app=f.fixtures[0].applicationId;await f.register();await f.topUp('100000000');
  const rs=await Promise.allSettled([sent(f.vault.allocate(app,{gasLimit:500000})),sent(f.vault.connect(f.signers[1]).cancel(app,{gasLimit:500000}))]);
  assert.equal(rs.filter(x=>x.status==='fulfilled').length,1);const a=await f.vault.accounts(app);assert.ok(a.cancelled !== (a.settlement===1n));await invariant(f);
});
for(const delta of [0,1])test(`allocation deadline ${delta}: no late reservation and no early recovery`,async t=>{
  const f=await setup(t),app=f.fixtures[0].applicationId;await f.register();await f.topUp('100000000');await f.time(f.config.allocationUntil+delta);
  if(delta===0){await assert.rejects(()=>f.vault.recoverUnallocated.staticCall(app),/RECOVERY_TIME/);await sent(f.vault.allocate(app));}
  else {await assert.rejects(()=>f.vault.allocate.staticCall(app),/ALLOCATION_TIME/);await sent(f.vault.recoverUnallocated(app));}
  await invariant(f);
});
for(const delta of [0,1])test(`claim/reclaim deadline ${delta}: mutually exclusive and no second payment`,async t=>{
  const f=await setup(t),app=f.fixtures[0].applicationId;await f.register();await f.topUp('100000000');await sent(f.vault.allocate(app));await f.time(f.config.claimUntil+delta);
  if(delta===0){await assert.rejects(()=>f.vault.reclaimExpired.staticCall(app),/RECLAIM_STATE_TIME/);await sent(f.vault.claim(app));await f.time(f.config.claimUntil+1);await assert.rejects(()=>f.vault.reclaimExpired.staticCall(app),/RECLAIM_STATE_TIME/);}
  else {await assert.rejects(()=>f.vault.claim.staticCall(app),/CLAIM_TIME/);await sent(f.vault.reclaimExpired(app));await assert.rejects(()=>f.vault.claim.staticCall(app),/CLAIM_STATE/);}
  await invariant(f);
});
test('constructor rejects unsupported asset, invalid deadlines, duplicated fixtures and prohibited tiers',async t=>{
  const f=await setup(t),factory=new ContractFactory(f.artifacts.FundingLab.abi,f.artifacts.FundingLab.bytecode,f.signers[0]);
  for(const c of [{token:ZeroAddress},{minClaimWindow:0},{claimUntil:f.config.allocationUntil},{sponsor:ZeroAddress},{instanceId:ZeroHash}])await assert.rejects(()=>factory.deploy({...f.config,...c},f.fixtures));
  for(const patch of [{tier:400},{tier:500},{entitlement:0},{recipient:ZeroAddress},{decisionCommitment:ZeroHash}])await assert.rejects(()=>factory.deploy(f.config,[{...f.fixtures[0],...patch}]));
  await assert.rejects(()=>factory.deploy(f.config,[f.fixtures[0],f.fixtures[0]]));
});
test('unsolicited token donation never credits an application',async t=>{
  const f=await setup(t),app=f.fixtures[0].applicationId;await f.register();await sent(f.token.transfer(f.pin.vault,100000000));await f.mine();
  const s=await f.reader.snapshot(app);assert.equal(s.contractBalanceAtoms,'100000000');assert.equal(s.securedAtoms,'0');
  await assert.rejects(()=>f.vault.allocate.staticCall(app),/INSUFFICIENT_APPLICATION_FUNDS/);await invariant(f);
});

test('constructor refuses any chain other than the isolated TEST chain',async t=>{
  const f=await setup(t),raw=ganache.provider({logging:{quiet:true},chain:{chainId:31339,hardfork:'shanghai'}});
  const p=new BrowserProvider(raw,undefined,{cacheTimeout:-1});t.after(async()=>{p.destroy();await raw.disconnect();});
  const factory=new ContractFactory(f.artifacts.FundingLab.abi,f.artifacts.FundingLab.bytecode,await p.getSigner());
  await assert.rejects(()=>factory.deploy(f.config,f.fixtures));
});
