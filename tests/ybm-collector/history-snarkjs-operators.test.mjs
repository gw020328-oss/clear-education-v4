import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {snarkHistoryOperators,releaseSnarkOperators} from '../../src/ybm-collector/history-snarkjs-operators.mjs';
function fixture({reply=true}={}){
 const child=new EventEmitter();child.exitCode=null;child.signalCode=null;
 let forks=0,kills=0,options;
 child.send=(message,cb)=>{cb?.();if(reply)queueMicrotask(()=>child.emit('message',{id:message.id,ok:true,result:'SYNTHETIC_RESULT'}));};
 child.kill=()=>{kills++;queueMicrotask(()=>{child.signalCode='SIGTERM';child.emit('exit',null,'SIGTERM');child.emit('close',null,'SIGTERM');});return true;};
 const forkChild=(url,args,opts)=>{forks++;options=opts;return child;};
 return {child,forkChild,get forks(){return forks;},get kills(){return kills;},get options(){return options;}};
}
test('one memory-only child serves algorithms and closes once',async()=>{
 const f=fixture(),ops=snarkHistoryOperators({forkChild:f.forkChild});assert.equal(f.forks,0);
 assert.equal(await ops['aes-128-ctr'].generateWitness({synthetic:true}),'SYNTHETIC_RESULT');
 assert.equal(await ops.chacha20.groth16Verify({},'SYNTHETIC_PROOF'),'SYNTHETIC_RESULT');
 assert.equal(f.forks,1);assert.equal(f.options.serialization,'advanced');assert.deepEqual(f.options.stdio,['ignore','ignore','ignore','ipc']);
 await releaseSnarkOperators(ops);assert.equal(f.kills,1);await assert.rejects(ops.chacha20.generateWitness({}),/SNARK_WORKER_CLOSED/);
});
test('cancellation rejects pending proof and waits for owned child exit',async()=>{
 const f=fixture({reply:false}),controller=new AbortController(),ops=snarkHistoryOperators({signal:controller.signal,forkChild:f.forkChild});
 const pending=ops['aes-128-ctr'].groth16Prove(new Uint8Array(3));const rejected=assert.rejects(pending,/SNARK_WORKER_OPERATION_FAILED/);
 controller.abort();await rejected;await releaseSnarkOperators(ops);assert.equal(f.kills,1);assert.equal(f.child.signalCode,'SIGTERM');
});
test('child failure exposes only a fixed error, with no worker payload',async()=>{
 const f=fixture({reply:false}),ops=snarkHistoryOperators({forkChild:f.forkChild});const pending=ops.chacha20.generateWitness({});
 const rejected=assert.rejects(pending,error=>error.message==='SNARK_WORKER_OPERATION_FAILED');
 f.child.emit('error',new Error('SYNTHETIC_PRIVATE_PAYLOAD'));await rejected;await releaseSnarkOperators(ops);assert.equal(f.kills,1);
});
