import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {join} from 'node:path';
import {createEnvironment,environmentRecord,environmentStatus,loadRuntime,stopEnvironment,startEnvironment,parkEnvironment} from '../../../src/hackathon-test-vault/e5/environment.mjs';
import {atomicPrivate,sha} from '../../../src/hackathon-test-vault/e5/private-storage.mjs';
import {ExecutionReader} from '../../../src/hackathon-test-vault/e5/reader.mjs';
import {waitForNormalChainTime} from '../../../tools/bootcamp/normal-chain-time.mjs';
test('unsupported mining periods reject before creating an environment',async()=>{
 for(const blockPeriodSeconds of [-1,2,12,null,'1',NaN]){let started=false;await assert.rejects(createEnvironment({blockPeriodSeconds,testAfterStarted(){started=true;}}),/E5_BLOCK_PERIOD/);assert.equal(started,false);}
});
test('periodic TEST time advances without transactions and is pinned through restart',async t=>{
 const e=await createEnvironment({blockPeriodSeconds:1});t.after(()=>{stopEnvironment(e.environmentId);parkEnvironment(e.environmentId);});
 const {record,dir}=environmentRecord(e.environmentId),reader=new ExecutionReader(e.manifest);
 assert.equal(record.blockPeriodSeconds,1);assert.equal(e.manifest.blockPeriodSeconds,1);
 const before=await reader.block(),sender=e.manifest.roles.registrar,nonce=await reader.rpc('eth_getTransactionCount',[sender,'latest']);
 const ready=await waitForNormalChainTime({requiredAt:Number(before.timestamp)+2,businessUntil:Math.floor(Date.now()/1000)+20,authorityUntil:Math.floor(Date.now()/1000)+20,readBlock:async()=>{const b=await reader.block();return {timestamp:Number(b.timestamp)};}});
 const after=await reader.block();assert.ok(BigInt(after.number)>BigInt(before.number));assert.equal(await reader.rpc('eth_getTransactionCount',[sender,'latest']),nonce);
 const full=await reader.rpc('eth_getBlockByHash',[after.hash,true]);assert.equal(full.transactions.length,0);
 const original=readFileSync(join(dir,'environment.json'));try{atomicPrivate(join(dir,'environment.json'),{...record,blockPeriodSeconds:0});assert.throws(()=>environmentStatus(e.environmentId),/E5_BLOCK_PERIOD_OWNER/);assert.throws(()=>loadRuntime(e.environmentId),/E5_RUNTIME_OWNER/);}finally{atomicPrivate(join(dir,'environment.json'),JSON.parse(original));}
 stopEnvironment(e.environmentId);await startEnvironment(e.environmentId);assert.equal(sha(loadRuntime(e.environmentId)),e.manifestHash);
 t.diagnostic(JSON.stringify({blockPeriodSeconds:1,beforeTime:Number(before.timestamp),afterTime:Number(after.timestamp),...ready,extraTransactions:0,runtimeHashUnchanged:true}));
});
