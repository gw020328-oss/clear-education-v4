import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import solc from 'solc';
import { Contract, id } from 'ethers';
import { openLab } from '../../spikes/funding-lab/environment.mjs';
const source=readFileSync(new URL('./fixtures/TokenFault.sol',import.meta.url),'utf8');
const compiled=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'TokenFault.sol':{content:source}},settings:{evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.deployedBytecode.object']}}}}))).contracts['TokenFault.sol'].TokenFault;
for(const mode of [1,2,3])test(`TEST node token-code fault ${mode}: failed transfer rollback or blocked reentry`,async t=>{
  const f=await openLab();t.after(f.close);const app=f.fixtures[0].applicationId;
  await f.register();await f.topUp('100000000');await(await f.vault.allocate(app)).wait();
  // Corrupt only this ephemeral node after constructor pinning to exercise defense
  // in depth. This does NOT add a mutable token or fault switch to FundingLab.
  await f.provider.send('evm_setAccountCode',[f.pin.token,'0x'+compiled.evm.deployedBytecode.object]);
  const token=new Contract(f.pin.token,compiled.abi,f.signers[0]);
  await(await token.configure(mode,f.pin.vault,f.vault.interface.encodeFunctionData('claim',[app]))).wait();await f.mine();
  await assert.rejects(()=>f.reader.snapshot(app),/LAB_CODE/);
  if(mode<3){
    await assert.rejects(async()=>{await(await f.vault.claim(app,{gasLimit:500000})).wait();});
    const a=await f.vault.accounts(app);assert.equal(a.settlement,1n);assert.equal(a.paid,0n);assert.equal(a.held,100000000n);
    assert.equal(await f.vault.totalReserved(),100000000n);assert.equal(await token.balanceOf(f.fixtures[0].recipient),0n);
  }else{
    await(await f.vault.claim(app,{gasLimit:500000})).wait();assert.equal(await token.blockedReentries(),1n);
    assert.equal(await token.balanceOf(f.fixtures[0].recipient),100000000n);assert.equal(await f.vault.totalReserved(),0n);
    await(await f.vault.claim(app,{gasLimit:500000})).wait();assert.equal(await token.balanceOf(f.fixtures[0].recipient),100000000n);
  }
});
test('simultaneous topups with one operation and different amounts debit only the winning request',async t=>{
  const f=await openLab();t.after(f.close);await f.register();const app=f.fixtures[0].applicationId,op=id('race');
  await(await f.token.approve(f.pin.vault,100)).wait();
  const rs=await Promise.allSettled([40,60].map(async amount=>(await f.vault.topUp(app,op,amount,{gasLimit:500000})).wait()));
  assert.equal(rs.filter(r=>r.status==='fulfilled').length,1);const a=await f.vault.accounts(app);
  assert.ok(a.held===40n||a.held===60n);assert.equal(await f.token.balanceOf(f.pin.vault),a.held);
});
