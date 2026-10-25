import test from 'node:test';
import assert from 'node:assert/strict';
import {waitSetupReceipt} from '../../../src/hackathon-test-vault/e5/setup-receipt.mjs';
const hash='0x'+'ab'.repeat(32),receipt={hash,status:1,blockHash:'0x'+'cd'.repeat(32),blockNumber:1};
const indexing=()=>Object.assign(Error('PRIVATE_ERROR_NOT_RETURNED'),{code:'UNKNOWN_ERROR',error:{message:'transaction indexing is in progress'},payload:{method:'eth_getTransactionReceipt',params:[hash]}});
test('setup receipt waits only for the identical submitted hash through indexing and pending',async()=>{
 const hashes=[];const provider={getTransactionReceipt:async h=>{hashes.push(h);if(hashes.length===1)throw indexing();return hashes.length===2?null:receipt;}};
 assert.equal(await waitSetupReceipt(provider,hash,{pollMs:1}),receipt);assert.deepEqual(hashes,[hash,hash,hash]);
});
test('setup receipt does not retry other RPC errors, other hashes, reverts or malformed inclusion',async()=>{
 for(const error of [Error('PRIVATE_ERROR_NOT_RETURNED'),Object.assign(indexing(),{payload:{method:'eth_getTransactionReceipt',params:['different']}}),Object.assign(indexing(),{error:{message:'other'}})]){let calls=0;await assert.rejects(()=>waitSetupReceipt({getTransactionReceipt:async()=>{calls++;throw error;}},hash),/^Error: E5_SETUP_RECEIPT_READ_FAILED$/);assert.equal(calls,1);}
 for(const r of [{...receipt,status:0},{...receipt,hash:'other'},{...receipt,blockHash:null}])await assert.rejects(()=>waitSetupReceipt({getTransactionReceipt:async()=>r},hash),/E5_SETUP_RECEIPT_INVALID/);
});
test('setup receipt bounds pending, indexing and a stalled read without sending a replacement',async()=>{
 for(const read of [async()=>null,async()=>{throw indexing();},()=>new Promise(()=>{})])await assert.rejects(()=>waitSetupReceipt({getTransactionReceipt:read},hash,{timeoutMs:20,pollMs:1}),/E5_SETUP_RECEIPT_TIMEOUT/);
});
