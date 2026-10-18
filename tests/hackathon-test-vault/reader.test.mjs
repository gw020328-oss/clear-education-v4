import test from 'node:test';
import assert from 'node:assert/strict';
import {id,keccak256,AbiCoder} from 'ethers';
import {setup,sent,AMOUNT,BASE} from './fixture.mjs';
import {createPreparationReader} from '../../src/hackathon-test-vault/reader.mjs';
async function readerFor(f,read=(method,args)=>f.provider.send(method,args),patch={}){
 const vaultAddress=(await f.vault.getAddress()).toLowerCase(),tokenAddress=(await f.token.getAddress()).toLowerCase();
 const pin={version:'clear-hackathon-test-preparation-runtime.1',chainId:'31339',genesisHash:(await f.provider.send('eth_getBlockByNumber',['0x0',false])).hash,instanceId:f.config.instanceId,vaultAddress,vaultCodeHash:keccak256(await f.provider.send('eth_getCode',[vaultAddress,'latest'])),tokenAddress,tokenCodeHash:keccak256(await f.provider.send('eth_getCode',[tokenAddress,'latest'])),operationsPolicyHash:await f.vault.PROFILE(),policyHash:f.config.policyHash,runtimeMappingHash:f.config.runtimeMappingHash,roles:Object.fromEntries(Object.entries(f.roles).map(([k,v])=>[k,v.toLowerCase()])),sourceMode:'SYNTHETIC_FIXTURE',environment:'MEMORY_COMPONENT_HARNESS_ONLY',...patch};
 return createPreparationReader({read,abi:f.artifacts.HackathonTestVaultPreparation.abi,pin});
}
async function replacement(f,appId){
 const app=appId??await f.ready(),old=await f.state(app),operation=f.op(),next=f.target('replacement',{revision:2n});
 const calldata=f.vault.interface.encodeFunctionData('replaceTarget',[operation,app,next,1,old.version]);
 const commandDigest=keccak256(AbiCoder.defaultAbiCoder().encode(['address','bytes'],[f.roles.registrar,calldata]));
 const previous={decisionId:old.target.decisionId,revision:old.target.revision.toString(),decisionHash:old.target.decisionHash,acceptanceSequence:old.target.acceptanceSequence.toString(),epoch:old.epoch.toString(),appVersion:old.version.toString(),sourceReceiptHash:old.target.sourceReceiptHash};
 const expected={operationId:operation,applicationId:app,calldata,commandDigest,allocationId:old.allocationId,firstStartedAt:old.firstStartedAt.toString(),previous};
 const tx=await f.vault.replaceTarget(operation,app,next,1,old.version);await tx.wait();return {app,old,tx,expected};
}
test('read-only default stays unconfigured and runtime source modes cannot imply production',async()=>{assert.equal((await createPreparationReader().snapshot()).status,'UNCONFIGURED');});
test('canonical replacement DTO carries stable allocation and exact old/new epoch/version without source authority',async t=>{
 const f=await setup(t),r=await replacement(f),reader=await readerFor(f),dto=await reader.replacement(r.tx.hash,r.expected);
 assert.equal(dto.status,'INCLUDED');assert.equal(dto.allocationId,r.old.allocationId);assert.equal(dto.previous.appVersion,r.old.version.toString());assert.equal(dto.current.appVersion,(r.old.version+1n).toString());assert.equal(dto.current.epoch,(r.old.epoch+1n).toString());
 assert.equal(dto.sourceAuthenticatedByEvent,false);assert.equal(dto.payoutAccepted,false);assert.equal(dto.distributedAtomicity,false);assert.equal(dto.firstStartedAt,String(BASE));assert.equal(dto.checkpoint.transactionHash,r.tx.hash);
 const snapshot=await reader.snapshot(r.app);assert.equal(snapshot.accounting.R,AMOUNT.toString());assert.equal(snapshot.accounting.O,AMOUNT.toString());assert.equal(snapshot.application.state,'RESERVED');assert.equal(snapshot.application.preparedDigest,'0x'+'00'.repeat(32));
 // A new process-side reader can recover the same operation, without resubmission.
 assert.equal((await (await readerFor(f)).operation(r.expected.operationId,r.expected.commandDigest)).status,'APPLIED_AT_CHECKPOINT');
});
test('replacement reader rejects wrong app/allocation/old version/command and conflicting operation',async t=>{
 const f=await setup(t),r=await replacement(f),reader=await readerFor(f);
 for(const edit of [e=>e.allocationId=id('wrong'),e=>e.applicationId=id('wrong'),e=>e.previous.epoch='99',e=>e.commandDigest=id('wrong'),e=>e.firstStartedAt='1']){const expected=structuredClone(r.expected);edit(expected);await assert.rejects(()=>reader.replacement(r.tx.hash,expected),/E4_/);}
 await assert.rejects(()=>reader.operation(r.expected.operationId,id('conflict')),/E4_OPERATION_CONFLICT/);
});
test('wrong runtime/genesis/roles/code pins and RPC failure are rejected without raw error leakage',async t=>{
 const f=await setup(t),app=await f.register();
 for(const patch of [{roles:{...Object.fromEntries(Object.entries(f.roles).map(([k,v])=>[k,v.toLowerCase()])),registrar:f.addresses[7].toLowerCase()}},{chainId:'31340'},{genesisHash:id('wrong')},{instanceId:id('wrong')},{vaultCodeHash:id('wrong')},{tokenCodeHash:id('wrong')},{runtimeMappingHash:id('wrong')}])await assert.rejects(async()=>{const reader=await readerFor(f,undefined,patch);await reader.snapshot(app);},/E4_ENVIRONMENT|E4_CODE_PIN|E4_ROLES/);
 const reader=await readerFor(f,async()=>{throw new Error('PRIVATE_RPC_CANARY');});await assert.rejects(()=>reader.snapshot(app),error=>error.message==='E4_RPC_UNAVAILABLE');
 await assert.rejects(async()=>readerFor(f,undefined,{sourceMode:'REAL_SOURCE'}),/E4_PIN/);
});
test('canonical block replacement during snapshot fails closed',async t=>{
 const f=await setup(t),app=await f.register();let seen=0;
 const read=async(method,args)=>{const value=await f.provider.send(method,args);if(method==='eth_getBlockByNumber'&&args[0]!=='0x0'&&++seen===2)return {...value,hash:id('replaced')};return value;};
 await assert.rejects(()=>(readerFor(f,read)).then(r=>r.snapshot(app)),/E4_REORG/);
});
test('a swapped transaction cannot authenticate a replacement event',async t=>{
 const f=await setup(t),r=await replacement(f),reader=await readerFor(f,async(method,args)=>{const v=await f.provider.send(method,args);return method==='eth_getTransactionByHash'?{...v,input:'0xdeadbeef'}:v;});
 await assert.rejects(()=>reader.replacement(r.tx.hash,r.expected),/E4_TX_BINDING/);
});
test('memory reorg invalidates replacement receipt and new reader sees prior stable reservation',async t=>{
 const f=await setup(t),app=await f.ready(),snapshot=await f.provider.send('evm_snapshot',[]),r=await replacement(f,app),reader=await readerFor(f);await reader.replacement(r.tx.hash,r.expected);
 await f.provider.send('evm_revert',[snapshot]);await f.provider.send('evm_mine',[]);
 await assert.rejects(()=>reader.replacement(r.tx.hash,r.expected),/E4_TX_UNKNOWN/);
 const observed=await reader.snapshot(r.app);assert.equal(observed.application.state,'REVIEW');assert.equal(observed.accounting.R,AMOUNT.toString());assert.equal(observed.application.decisionHash,r.old.target.decisionHash);
});

test('receipt log tx-index and operation-event provenance are independently checked',async t=>{
 const f=await setup(t),r=await replacement(f);
 for(const alter of [v=>({...v,logs:v.logs.map(l=>({...l,transactionIndex:'0x99'}))}),v=>({...v,logs:v.logs.map(l=>({...l,removed:true}))})]){
  const reader=await readerFor(f,async(method,args)=>{const value=await f.provider.send(method,args);return method==='eth_getTransactionReceipt'?alter(value):value;});
  await assert.rejects(()=>reader.replacement(r.tx.hash,r.expected),/E4_LOG_BINDING/);
 }
});
test('publication anchor is not replacement CAS after same-decision consent observation and unsigned preparation',async t=>{
 const f=await setup(t),app=await f.register();await f.fund(AMOUNT);await f.allocate(app);await f.review(app);const publication=await f.state(app);
 await f.consent(app);await f.key();await f.prepare(app);await f.observe(app);await f.consent(app);await f.prepare(app);
 const r=await replacement(f,app),reader=await readerFor(f),dto=await reader.replacement(r.tx.hash,r.expected);
 assert(BigInt(dto.previous.epoch)>publication.epoch);assert(BigInt(dto.previous.appVersion)>publication.version);assert.equal(dto.previous.decisionHash,publication.target.decisionHash);
 const current=await reader.snapshot(app);assert.equal(dto.current.epoch,current.application.epoch);assert.equal(dto.current.appVersion,current.application.version);
 const stale=structuredClone(r.expected);stale.previous.epoch=publication.epoch.toString();stale.previous.appVersion=publication.version.toString();
 await assert.rejects(()=>reader.replacement(r.tx.hash,stale),/E4_PREVIOUS/);
});

test('reader verifies frozen .3 domain separator and type hash as well as code and chain pins',async t=>{
 const f=await setup(t),app=await f.register();
 for(const name of ['domainSeparator','TYPE_HASH']){const selector=f.vault.interface.encodeFunctionData(name,[]);
  const reader=await readerFor(f,async(method,args)=>method==='eth_call'&&args[0].data===selector?id('wrong-domain-or-type'):f.provider.send(method,args));
  await assert.rejects(()=>reader.snapshot(app),/E4_DOMAIN|E4_TYPE_HASH/);
 }
});
