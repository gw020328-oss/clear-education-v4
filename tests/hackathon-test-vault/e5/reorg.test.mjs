import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {fixture,hash} from './fixture.mjs';
import {rewindOwnedTestChain,parkEnvironment,stopEnvironment,startEnvironment} from '../../../src/hackathon-test-vault/e5/environment.mjs';
import {ExecutionReader,ZERO,checkpoint} from '../../../src/hackathon-test-vault/e5/reader.mjs';
import {retainedOrphan} from './fork-fixture.mjs';
const out=new URL('../../../.toolchain/hackathon-test-vault/e5/',import.meta.url);mkdirSync(out,{recursive:true});
test('real owned Geth reorg: orphan blockHash selector rejection, proof and durable stop',async t=>{
 const f=await fixture();t.after(()=>{f.close();stopEnvironment(f.id);parkEnvironment(f.id);});
 const req=await f.request({method:'approve',args:[f.m.vaultAddress,'1'],applicationId:ZERO}),sealed=await f.service.seal(req);
 const {orphan,replacement}=await retainedOrphan(f);
 assert.notEqual(replacement.hash,orphan.hash);
 const rawOrphan=await f.reader.rpc('eth_getBlockByHash',[orphan.hash,false]);
 const calls=[['eth_getCode',[f.m.vaultAddress]],['eth_getBalance',[f.m.vaultAddress]],['eth_getTransactionCount',[f.m.roles.registrar]],['eth_call',[{to:f.m.vaultAddress,data:f.reader.vault.encodeFunctionData('newOperationsPaused',[])}]]];
 const capabilities=[];
 for(const [method,args] of calls){
  let nonCanonicalAvailable=false;try{await f.reader.rpc(method,[...args,{blockHash:orphan.hash,requireCanonical:false}]);nonCanonicalAvailable=true;}catch{}
  let requireCanonicalRejected=false;try{await f.reader.rpc(method,[...args,{blockHash:orphan.hash,requireCanonical:true}]);}catch(e){requireCanonicalRejected=e.message==='E5_RPC_REJECTED';}
  capabilities.push({method,nonCanonicalAvailable,requireCanonicalRejected});
 }
 writeFileSync(new URL('reorg-measurement.json',out),JSON.stringify({runtime:f.m,orphan:checkpoint(orphan),replacement:checkpoint(replacement),canonicalAtOldHeight:(await f.reader.rpc('eth_getBlockByNumber',[orphan.number,false]))?.hash,orphanBlockRetained:Boolean(rawOrphan),capabilities,automaticRebase:false},null,2)+'\n');
 assert(rawOrphan,'known orphan must remain stored');
 assert(capabilities.every(x=>x.nonCanonicalAvailable&&x.requireCanonicalRejected),'known orphan succeeds only when canonical requirement is false');
 console.log('E5_RETAINED_ORPHAN '+JSON.stringify({orphanBlockRetained:true,capabilities}));
 const current=await f.reader.observe();
 const proof=await f.reader.compare(checkpoint(orphan),current.checkpoint);assert.equal(proof.status,'REORG_PROVEN_RECOVERY_BLOCKED');await assert.rejects(()=>f.service.track(current),/E5_RECOVERY_BLOCKED/);assert(f.service.db.prepare('SELECT record FROM stops').get());
 f.restart();f.controller.commit(sealed);await assert.rejects(()=>f.service.dispatch({...req,...sealed}),/E5_RECOVERY_BLOCKED/);assert.equal((await f.service.recover({...req,...sealed})).status,'RECOVERY_BLOCKED');assert.equal(f.service.metrics.broadcasts,0);
 writeFileSync(new URL('reorg-measurement.json',out),JSON.stringify({runtime:f.m,orphan:checkpoint(orphan),replacement:checkpoint(replacement),orphanBlockRetained:Boolean(rawOrphan),capabilities,automaticRebase:false},null,2)+'\n');
});
test('canonical reader rejects incomplete data and proofless regression; all state selectors remain hash-bound',async t=>{
 const f=await fixture();t.after(()=>{f.close();stopEnvironment(f.id);parkEnvironment(f.id);});let selectors=0;
 const rpc=async(method,args)=>{
  if(['eth_call','eth_getCode','eth_getBalance','eth_getTransactionCount'].includes(method)){assert.equal(args.at(-1).requireCanonical,true);assert.match(args.at(-1).blockHash,/^0x[0-9a-f]{64}$/);selectors++;}
  return f.reader.rpc(method,args);
 };
 const reader=new ExecutionReader(f.m,{rpc});await reader.observe();assert.equal(selectors,20);
 const incomplete=async(method,args)=>method==='eth_getBlockByNumber'?null:f.reader.rpc(method,args);
 await assert.rejects(()=>new ExecutionReader(f.m,{rpc:incomplete}).observe(),/E5_BLOCK_INCOMPLETE/);
 const initial=await f.reader.block();await f.mine();const later=await f.reader.block();await assert.rejects(()=>f.reader.compare(checkpoint(later),checkpoint(initial)),/E5_CHECKPOINT_REGRESSION/);
 const unknown=async(method,args)=>method==='eth_getBlockByHash'?null:f.reader.rpc(method,args);
 await assert.rejects(()=>new ExecutionReader(f.m,{rpc:unknown}).compare(checkpoint(initial),checkpoint(later)),/E5_REORG_EVIDENCE_INCOMPLETE/);
});
