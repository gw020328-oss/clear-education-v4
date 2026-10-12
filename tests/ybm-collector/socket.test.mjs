import test from 'node:test';
import assert from 'node:assert/strict';
import {installBoundedSender,TRANSPORT_SEND_LIMIT,PROOF_SEND_LIMIT} from '../../src/ybm-collector/socket.mjs';
const fake=()=>({bufferedAmount:0,terminated:false,sent:0,terminate(){this.terminated=true;},send(_bytes,callback){this.sent++;callback();}});
test('transport-only mode rejects a proof-sized frame that proof mode accepts',async()=>{
 const bytes=Buffer.alloc(TRANSPORT_SEND_LIMIT+1),small=installBoundedSender(fake()),proof=installBoundedSender(fake(),{proofMode:true});
 await assert.rejects(small.sendPromise(bytes),/ATTESTOR_BACKPRESSURE_LIMIT/);assert.equal(small.terminated,true);assert.equal(small.sent,0);
 await proof.sendPromise(bytes);assert.equal(proof.terminated,false);assert.equal(proof.sent,1);
});
test('proof mode has a finite message-plus-queue cap and never sends above it',async()=>{
 const socket=installBoundedSender(fake(),{proofMode:true});socket.bufferedAmount=PROOF_SEND_LIMIT;
 await assert.rejects(socket.sendPromise(Buffer.alloc(1)),/ATTESTOR_BACKPRESSURE_LIMIT/);assert.equal(socket.sent,0);assert.equal(socket.terminated,true);
 const tooLarge=installBoundedSender(fake(),{proofMode:true});await assert.rejects(tooLarge.sendPromise(Buffer.alloc(PROOF_SEND_LIMIT+1)),/ATTESTOR_BACKPRESSURE_LIMIT/);assert.equal(tooLarge.sent,0);
});
test('send callback errors are reduced to a safe fixed code',async()=>{
 const socket=installBoundedSender({...fake(),send(_bytes,cb){cb(new Error('SYNTHETIC_PRIVATE'));}},{proofMode:true});
 await assert.rejects(socket.sendPromise(Buffer.alloc(1)),error=>error.message==='ATTESTOR_SEND_FAILED');
});
test('proof upload timeout terminates the socket and rejects without waiting indefinitely',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const socket=installBoundedSender({...fake(),send(){}},{proofMode:true});
 const pending=socket.sendPromise(Buffer.alloc(1)),rejection=assert.rejects(pending,/ATTESTOR_SEND_TIMEOUT/);
 t.mock.timers.tick(60000);await rejection;assert.equal(socket.terminated,true);
});
