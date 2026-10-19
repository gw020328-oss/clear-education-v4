import test from 'node:test';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import {BrowserProvider,ContractFactory,TypedDataEncoder} from 'ethers';
import {buildProbe} from './test-build-probe-v3.mjs';
import {fixtureV3 as fixture,mutationsV3 as mutations} from './test-fixture-v3.mjs';
import {manualHashes} from './test-manual-hash-v3.mjs';
import {TYPES,PRIMARY_TYPE} from '../../src/bootcamp-authorization/test-schema-v3.mjs';
test('JS EIP712, independent ABI/keccak and deployed pure Solidity agree for base + all 29 field mutations',async t=>{
 const artifact=buildProbe();
 assert.equal(artifact.abi.filter(x=>x.type==='function').length,3);
 assert(artifact.abi.filter(x=>x.type==='function').every(x=>x.stateMutability==='pure'));
 // One temporary tx account supplied by a fresh in-memory EVM. No existing keys,
 // oracle/relayer accounts or authorization signatures. Only probe deployment.
 const raw=ganache.provider({logging:{quiet:true},chain:{chainId:31338,hardfork:'shanghai'},wallet:{totalAccounts:1}});
 const provider=new BrowserProvider(raw,undefined,{cacheTimeout:-1});
 t.after(async()=>{provider.destroy();await raw.disconnect();});
 const probe=await new ContractFactory(artifact.abi,artifact.bytecode,await provider.getSigner()).deploy();await probe.waitForDeployment();
 const base=fixture().input,rows=[{label:'base',input:base},...mutations()];assert.equal(rows.length,30);
 for(const {label,input:{domain,message}} of rows){
  const expected=manualHashes({domain,message});
  assert.equal(TypedDataEncoder.hashDomain(domain),expected.domainSeparator,label);
  assert.equal(TypedDataEncoder.hashStruct(PRIMARY_TYPE,TYPES,message),expected.structHash,label);
  assert.equal(TypedDataEncoder.hash(domain,TYPES,message),expected.digest,label);
  assert.equal(await probe.domainHash(domain),expected.domainSeparator,label);
  assert.equal(await probe.structHash(message),expected.structHash,label);
  assert.equal(await probe.digest(domain,message),expected.digest,label);
 }
 t.diagnostic('PURE_HASH_ONLY: 1 probe deployment, 90 pure eth_calls, 0 authorization signatures, 0 payment transactions, 0 external RPC');
});
