import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {verifyIndependently} from '../../src/ybm-collector/independent-verifier.mjs';

test('a real verifier spawn failure rejects after close even though exit never fires',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 let child,exited=false,outcome='pending';
 const pending=verifyIndependently({}, {forkChild:(module,args,options)=>{
  child=fork(module,args,{...options,execPath:'/__clear_nonexistent_node_for_test__'});
  child.once('exit',()=>{exited=true;});return child;
 }});
 pending.then(()=>outcome='accepted',()=>outcome='rejected');
 await new Promise(resolve=>child.once('close',resolve));await new Promise(resolve=>setImmediate(resolve));
 assert.equal(exited,false);assert.equal(outcome,'rejected');
});

import {EventEmitter,getEventListeners} from 'node:events';
function fakeChild(){
 const child=new EventEmitter();child.kills=0;
 child.kill=()=>{child.kills++;return true;};child.send=(_message,callback)=>callback();
 return child;
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
for(const mode of ['abort','timeout','send-throw','send-error'])test(mode+' waits for child close and rejects even if a success arrives late',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const child=fakeChild(),controller=new AbortController();let outcome='pending';
 if(mode==='send-throw')child.send=()=>{throw new Error('SYNTHETIC_PRIVATE');};
 if(mode==='send-error')child.send=(_message,callback)=>callback(new Error('SYNTHETIC_PRIVATE'));
 const pending=verifyIndependently({}, {signal:controller.signal,forkChild:()=>child});
 pending.then(()=>outcome='accepted',()=>outcome='rejected');
 if(mode==='abort')controller.abort();if(mode==='timeout')t.mock.timers.tick(30000);
 assert.equal(child.kills,1);assert.equal(outcome,'pending');
 child.emit('message',{ok:true,result:{proofVerified:true}});child.emit('exit',0);await tick();assert.equal(outcome,'pending');
 child.emit('close',0);await assert.rejects(pending,/PROOF_VERIFICATION_FAILED/);
 assert.equal(getEventListeners(controller.signal,'abort').length,0);
 t.mock.timers.tick(30000);assert.equal(child.kills,1);
});
test('synchronous fork errors become fixed verification errors without leaking original text',async()=>{
 await assert.rejects(verifyIndependently({}, {forkChild:()=>{throw new Error('SYNTHETIC_PRIVATE');}}),error=>error.message==='PROOF_VERIFICATION_FAILED'&&error.verificationCode==='VERIFIER_REJECTED');
});
test('successful result settles only after process and IPC close and clears the deadline',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const child=fakeChild(),controller=new AbortController();let outcome='pending';
 const pending=verifyIndependently({}, {signal:controller.signal,forkChild:()=>child});pending.then(()=>outcome='accepted');
 child.emit('message',{ok:true,result:{proofVerified:true}});child.emit('exit',0);await tick();assert.equal(outcome,'pending');
 child.emit('close',0);assert.equal((await pending).proofVerified,true);
 assert.equal(getEventListeners(controller.signal,'abort').length,0);t.mock.timers.tick(30000);assert.equal(child.kills,0);
});
