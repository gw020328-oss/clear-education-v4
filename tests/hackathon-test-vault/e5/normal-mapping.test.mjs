import test from 'node:test';
import assert from 'node:assert/strict';
import {createEnvironment,stopEnvironment,parkEnvironment} from '../../../src/hackathon-test-vault/e5/environment.mjs';
import {ExecutionReader} from '../../../src/hackathon-test-vault/e5/reader.mjs';
import {sha} from '../../../src/hackathon-test-vault/e5/private-storage.mjs';
import {fixture,hash} from './fixture.mjs';

test('invalid explicit mapping is rejected before creating a TEST environment',async()=>{
 for(const runtimeMappingHash of [null,0,'', '0x'+'00'.repeat(32),'0x'+'GG'.repeat(32),'0x'+'AA'.repeat(32),{}]){
  let started=false;
  await assert.rejects(createEnvironment({runtimeMappingHash,testAfterStarted(){started=true;}}),/E5_RUNTIME_MAPPING_HASH/);
  assert.equal(started,false);
 }
});

test('fresh mapping is immutable on chain and canonical lowercase observations survive accept/claim',async t=>{
 const mapping=hash(),created=await createEnvironment({runtimeMappingHash:mapping});
 let f;t.after(()=>{try{f?.close();}finally{stopEnvironment(created.environmentId);parkEnvironment(created.environmentId);}});
 assert.equal(created.manifest.runtimeMappingHash,mapping);
 f=await fixture(created.environmentId);
 assert.equal(await f.vault.runtimeMappingHash(),mapping);
 const wrong=new ExecutionReader({...f.m,runtimeMappingHash:hash()});
 await assert.rejects(wrong.observe(),/E5_RUNTIME_runtimeMappingHash/);
 const ready=await f.ready();
 const assertCanonical=o=>{
  for(const address of [o.business.application.recipient,o.business.right.recipient,o.business.right.token])assert.match(address,/^0x[0-9a-f]{40}$/);
  assert.equal(o.businessHash,sha(o.business));
 };
 assertCanonical(await f.reader.observe({applicationId:ready.app}));
 assert.equal((await f.submit(ready.command)).result.status,'INCLUDED');
 const accepted=await f.reader.observe({applicationId:ready.app,nonce:ready.msg.nonce});assertCanonical(accepted);
 assert.equal(accepted.business.right.recipient,f.wallet('recipient').address.toLowerCase());
 assert.equal(accepted.business.right.token,f.m.tokenAddress);
 const before=await f.token.balanceOf(accepted.business.right.recipient);
 const claim=await f.submit({method:'claim',applicationId:ready.app,args:[ready.app]});
 assert.equal(claim.result.status,'INCLUDED');assertCanonical(claim.result.observation);
 assert.equal((await f.token.balanceOf(accepted.business.right.recipient))-before,100000000n);
});
