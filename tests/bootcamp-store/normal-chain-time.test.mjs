import test from 'node:test';import assert from 'node:assert/strict';
import {waitForNormalChainTime} from '../../tools/bootcamp/normal-chain-time.mjs';
const base={requiredAt:100,businessUntil:120,authorityUntil:110,clock:()=>101000,pollMs:1};
test('chain readiness rereads only until original issued/publication time, with unchanged caps',async()=>{
 let reads=0;const r=await waitForNormalChainTime({...base,readBlock:async()=>({timestamp:++reads===1?99:100})});
 assert.equal(reads,2);assert.equal(r.requiredAt,100);assert.equal(r.expiresAt,110);assert.equal(r.businessUntil,120);assert.equal(r.firstBlockTime,99);assert.equal(r.blockTime,100);
});
for(const kind of ['authority','source-review-message','block-business'])test('chain readiness rejects original '+kind+' expiry',async()=>{
 await assert.rejects(waitForNormalChainTime({...base,authorityUntil:kind==='authority'?101:110,businessUntil:kind==='source-review-message'?101:120,readBlock:async()=>({timestamp:kind==='block-business'?120:100})}),/BC_NORMAL_CHAIN_TIME_EXPIRED/);
});
test('chain readiness rejects a backwards clock and invalid block',async()=>{
 let tick=102000;await assert.rejects(waitForNormalChainTime({...base,clock:()=>tick--,readBlock:async()=>({timestamp:100})}),/REVERSED/);
 await assert.rejects(waitForNormalChainTime({...base,readBlock:async()=>({timestamp:'invalid'})}),/BLOCK/);
});
test('chain readiness cancellation never starts a late second read',async()=>{
 const controller=new AbortController();let reads=0;
 const promise=waitForNormalChainTime({...base,signal:controller.signal,readBlock:async()=>{reads++;controller.abort();return {timestamp:99};}});
 await assert.rejects(promise,/ABORTED/);assert.equal(reads,1);
});
test('chain readiness bounds a stalled RPC by original expiry',async()=>{
 const now=Math.floor(Date.now()/1000);await assert.rejects(waitForNormalChainTime({requiredAt:now,businessUntil:now+1,authorityUntil:now+1,readBlock:()=>new Promise(()=>{})}),/EXPIRED/);
});
test('already-ready canonical time returns after one read',async()=>{
 let reads=0;await waitForNormalChainTime({...base,readBlock:async()=>{reads++;return {timestamp:100};}});assert.equal(reads,1);
});
