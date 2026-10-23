import test from 'node:test';
import assert from 'node:assert/strict';
import {installBoundedSender,boundedSendFailure,TRANSPORT_SEND_LIMIT,PROOF_SEND_LIMIT} from '../../src/ybm-collector/socket.mjs';
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

test('only the exact locally minted failure is recognized without inspecting error properties',async()=>{
 const socket=installBoundedSender({...fake(),send(_bytes,callback){callback(Error('SYNTHETIC_PRIVATE_CAUSE'));}},{proofMode:true});
 const error=await socket.sendPromise(Buffer.alloc(1)).then(()=>assert.fail('must reject'),error=>error);
 assert.equal(boundedSendFailure(error),'ATTESTOR_SEND_FAILED');
 assert.equal(error.message,'ATTESTOR_SEND_FAILED');assert.equal(Object.hasOwn(error,'cause'),false);assert.equal(Object.hasOwn(error,'code'),false);
 let reads=0;
 const forged=[Error('ATTESTOR_SEND_FAILED'),{code:'ATTESTOR_SEND_FAILED',message:'ATTESTOR_SEND_FAILED'},Object.create(error),new Proxy(error,{}),
  {get code(){reads++;throw Error('PRIVATE');},get message(){reads++;throw Error('PRIVATE');}},
  new Proxy({},{get(){reads++;throw Error('PRIVATE');},getPrototypeOf(){reads++;throw Error('PRIVATE');},getOwnPropertyDescriptor(){reads++;throw Error('PRIVATE');}}),null,undefined,'ATTESTOR_SEND_FAILED',1];
 for(const value of forged)assert.equal(boundedSendFailure(value),null);
 Object.defineProperty(error,'message',{get(){reads++;throw Error('PRIVATE');}});
 assert.equal(boundedSendFailure(error),'ATTESTOR_SEND_FAILED');assert.equal(reads,0);
});

test('termination exceptions preserve the original bounded-send failure',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 let stops=0;
 const make=()=>installBoundedSender({...fake(),terminate(){stops++;throw Error('SYNTHETIC_PRIVATE_TERMINATION');},send(){}},{proofMode:true});
 const excess=make();excess.bufferedAmount=PROOF_SEND_LIMIT;
 await assert.rejects(excess.sendPromise(Buffer.alloc(1)),error=>boundedSendFailure(error)==='ATTESTOR_BACKPRESSURE_LIMIT'&&error.message==='ATTESTOR_BACKPRESSURE_LIMIT');
 const timeout=make(),rejected=assert.rejects(timeout.sendPromise(Buffer.alloc(1)),error=>boundedSendFailure(error)==='ATTESTOR_SEND_TIMEOUT'&&error.message==='ATTESTOR_SEND_TIMEOUT');
 t.mock.timers.tick(60000);await rejected;assert.equal(stops,2);
});

test('synchronous send exceptions are owned fixed failures with no leftover timeout',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 let sends=0,stops=0;
 const socket=installBoundedSender({...fake(),send(){sends++;throw Error('SYNTHETIC_PRIVATE_SEND');},terminate(){stops++;}},{proofMode:true});
 await assert.rejects(socket.sendPromise(Buffer.alloc(1)),error=>boundedSendFailure(error)==='ATTESTOR_SEND_FAILED'&&error.message==='ATTESTOR_SEND_FAILED'&&!Object.hasOwn(error,'cause'));
 t.mock.timers.tick(60000);assert.equal(sends,1);assert.equal(stops,0);
});
