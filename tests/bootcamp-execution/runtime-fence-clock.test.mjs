import test from 'node:test';
import assert from 'node:assert/strict';
import {authorityFixture,authorityDump} from './authority-fixture.mjs';

for (const scenario of ['forward','validation-rollover','reverse','repeat','revoked','authority-shrunk','lease-expired','basis-changed','higher-fence']) {
 test('runtime fence commit '+scenario, async t => {
  const f=await authorityFixture(t);
  let armed=false,committing=false,ticks=0,reads=0,handle=null,highestFence=0;
  const base=f.configuration.now,authorize=f.ports.authorizeService;
  f.configuration.executionFenceWitness={
   version:'clear-bootcamp-runtime-fence-reader.1',
   async read(query) {
    reads++;
    if(armed&&scenario==='basis-changed')f.acquireRuntime();
    return {version:'clear-bootcamp-runtime-fence-witness.1',...query,highestFence};
   },
  };
  f.ports.authorizeService=function(...args) {
   if(armed&&args[1].action==='COMMIT_RUNTIME_FENCE')committing=true;
   const value=authorize.apply(this,args);
   return armed&&ticks>=1&&scenario==='authority-shrunk'?{...value,expiresAt:f.time+1}:value;
  };
  f.configuration.now=()=>{
   if(armed&&committing) {
    ticks++;
    if(ticks===1) {
     f.setTime(f.time+(scenario==='reverse'?-1:scenario==='lease-expired'?30:1));
     if(scenario==='revoked')f.revoke();
    }
    if(scenario==='repeat'&&ticks>1||scenario==='validation-rollover'&&ticks===2)f.setTime(f.time+1);
   }
   return base();
  };
  f.restart();
  if(['lease-expired','basis-changed'].includes(scenario)) {
   await f.store.execution.observeRuntimeFence(f.context);
   if(scenario==='lease-expired'){handle=f.acquireRuntime();highestFence=1;}
  }
  if(scenario==='higher-fence')highestFence=1;
  const before=authorityDump(f),original=f.time;armed=true;
  if(['forward','validation-rollover'].includes(scenario)) {
   const result=await f.store.execution.observeRuntimeFence(f.context,handle);
   assert.equal(result.status,'OBSERVED');
   const rows=authorityDump(f).e5_worker_witnesses;
   assert.equal(rows.length,1);
   assert.equal(JSON.parse(rows[0].record).recordedAt,original);
  } else if(scenario==='higher-fence') {
   // A same-second safety stop retains its original path.
   armed=false;
   assert.equal((await f.store.execution.observeRuntimeFence(f.context)).status,'BLOCKED');
   assert.equal(authorityDump(f).e5_worker_stops.length,1);
  } else {
   await assert.rejects(f.store.execution.observeRuntimeFence(f.context,handle),/BC_E5_CLOCK_CHANGED|SERVICE_FORBIDDEN|BC_E5_SERVICE_AUTHORITY|BC_E5_GLOBAL_FENCED|BC_E5_GLOBAL_WITNESS_CAS/);
   if(scenario!=='basis-changed')assert.deepEqual(authorityDump(f),before);
  }
  assert.equal(f.metrics.signatures,0);
  assert.equal(f.metrics.broadcasts,0);
  assert.equal(reads,['lease-expired','basis-changed'].includes(scenario)?2:1);
 });
}
