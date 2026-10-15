// Real local EVM calls, fabricated ABI outputs, no actual Reclaim proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import solc from 'solc';
import ganache from 'ganache';
import {BrowserProvider,ContractFactory,keccak256,ZeroHash} from 'ethers';
const source=readFileSync(new URL('ReturnBoundary.sol',import.meta.url),'utf8');
const build=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'Boundary.sol':{content:source}},settings:{evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));
assert.deepEqual((build.errors??[]).filter(x=>x.severity==='error'),[]);
test('pinned direct-code ABI behavior: void, false-success, true-success are distinct',async t=>{
  const raw=ganache.provider({logging:{quiet:true},chain:{chainId:431799,hardfork:'shanghai'}});
  const provider=new BrowserProvider(raw,undefined,{cacheTimeout:-1});provider.pollingInterval=10;
  t.after(async()=>{provider.destroy();await raw.disconnect();});
  const signer=await provider.getSigner();
  const factory=name=>{const a=build.contracts['Boundary.sol'][name];return new ContractFactory(a.abi,a.evm.bytecode.object,signer);};
  const wire=await factory('WireFixture').deploy();await wire.waitForDeployment();
  const target=await wire.getAddress(),hash=keccak256(await provider.getCode(target));
  const selector=wire.interface.getFunction('verifyProof').selector;
  await assert.rejects(factory('ReturnBoundary').deploy(await signer.getAddress(),ZeroHash,0,selector));
  await assert.rejects(factory('ReturnBoundary').deploy(target,ZeroHash,0,selector));
  const guards=[];
  for(let convention=0;convention<3;convention++){
    const guard=await factory('ReturnBoundary').deploy(target,hash,convention,selector);await guard.waitForDeployment();guards.push(guard);
    for(const i of [0,1,2]){
      const call=()=>guard.check(wire.interface.encodeFunctionData('verifyProof',[i]));
      if(i===convention)assert.equal(await call(),true);else await assert.rejects(call);
    }
    for(const mode of [3,4,5,6])await assert.rejects(()=>guard.check(wire.interface.encodeFunctionData('verifyProof',[mode])));
    await assert.rejects(()=>guard.check(wire.interface.encodeFunctionData('unrelated')),/SELECTOR/);
    await assert.rejects(()=>guard.check('0x'),/SELECTOR/);
  }
  // Test-node-only fault injection; this never touches an existing chain.
  await raw.request({method:'evm_setAccountCode',params:[target,'0x00']});
  for(const guard of guards)await assert.rejects(()=>guard.check(wire.interface.encodeFunctionData('verifyProof',[0])),/CODE_CHANGED/);
});
