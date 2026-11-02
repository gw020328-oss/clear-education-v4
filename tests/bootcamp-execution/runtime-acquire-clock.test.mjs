// Atomic metadata acquisition only; no native key, signature or broadcast.
import test from 'node:test';
import assert from 'node:assert/strict';
import {authorityFixture,authorityDump} from './authority-fixture.mjs';
for(const change of ['forward','validation-rollover','expiry','revoked','authority-shrunk','service-changed','reverse','repeat','witness-expired'])test('runtime acquisition '+change+' keeps one original fence and expiry or rolls back',async t=>{
 const f=await authorityFixture(t);let armed=false,writes=0,reads=0,ticks=0;
 f.configuration.executionFenceWitness={version:'clear-bootcamp-runtime-fence-reader.1',read:async q=>{reads++;return {version:'clear-bootcamp-runtime-fence-witness.1',...q,highestFence:0};}};
 const base=f.configuration.now,authorize=f.ports.authorizeService;
 f.ports.authorizeService=function(...args){const a=authorize.apply(this,args);return armed&&writes&&change==='authority-shrunk'?{...a,expiresAt:f.time+10}:armed&&writes&&change==='service-changed'?{...a,serviceId:'worker-two'}:a;};
 f.configuration.now=()=>{if(armed&&writes){ticks++;if(change==='repeat'&&ticks<=4||change==='validation-rollover'&&ticks===2)f.setTime(f.time+1);}return base();};
 f.configuration.fault=p=>{if(armed&&p==='e5-global-after-lease'){writes++;f.setTime(f.time+(change==='expiry'?30:change==='reverse'?-1:1));if(change==='revoked')f.revoke();}};
 f.restart();await f.store.execution.observeRuntimeFence(f.context);if(change==='witness-expired')f.setTime(f.time+5);
 const before=authorityDump(f),original=f.time;armed=true;
 try{
  if(['forward','validation-rollover'].includes(change)){
   const g=f.acquireRuntime(),state=authorityDump(f);assert.equal(g.workerFence,1);assert.equal(state.e5_worker_fences.length,1);
   assert.equal(state.e5_runtime_workers[0].expires_at,original+30);assert.equal(JSON.parse(state.e5_worker_fences[0].record).acquiredAt,original);
  }else{
   assert.throws(()=>f.acquireRuntime(),/BC_E5_GLOBAL_FENCED|BC_E5_SERVICE_AUTHORITY|BC_E5_CLOCK_CHANGED|BC_E5_GLOBAL_FENCE_PREFLIGHT_REQUIRED|SERVICE_FORBIDDEN/);
   assert.deepEqual(authorityDump(f),before);
  }
 }finally{armed=false;}
 assert.equal(writes,1);assert.equal(reads,1);assert.equal(f.metrics.signatures,0);assert.equal(f.metrics.broadcasts,0);
});
