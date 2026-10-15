import test from 'node:test';
import assert from 'node:assert/strict';
import {installBoundedSender,PROOF_SEND_LIMIT} from '../../src/ybm-collector/history-socket.mjs';
import {PROOF_SEND_LIMIT as productLimit} from '../../src/ybm-collector/socket.mjs';
const fake=()=>({bufferedAmount:0,sent:0,terminated:false,terminate(){this.terminated=true;},send(bytes,cb){this.sent++;cb();}});
test('isolated history sender permits measured payload while product remains 32 MiB',async()=>{assert.equal(productLimit,32*1024*1024);assert.equal(PROOF_SEND_LIMIT,128*1024*1024);const s=installBoundedSender(fake(),{proofMode:true});await s.sendPromise({length:116830175});assert.equal(s.sent,1);assert.equal(s.terminated,false);});
test('history sender still caps combined queue plus payload and rejects excess',async()=>{const s=installBoundedSender(fake(),{proofMode:true});s.bufferedAmount=PROOF_SEND_LIMIT;await assert.rejects(s.sendPromise({length:1}),/ATTESTOR_BACKPRESSURE_LIMIT/);assert.equal(s.sent,0);assert.equal(s.terminated,true);});
test('history sender timeout remains finite',async t=>{t.mock.timers.enable({apis:['setTimeout']});const s=installBoundedSender({...fake(),send(){}},{proofMode:true}),pending=assert.rejects(s.sendPromise({length:116830175}),/ATTESTOR_SEND_TIMEOUT/);t.mock.timers.tick(60000);await pending;assert.equal(s.terminated,true);});
