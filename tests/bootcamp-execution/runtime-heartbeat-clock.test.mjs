import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {authorityFixture,authorityDump} from './authority-fixture.mjs';
import {database,dump} from './fixture.mjs';

for(const scenario of ['forward','validation-rollover','repeat','reverse','original-lease-expiry','authority-expiry','authority-shrunk','service-changed','revoked','competing-writer']){
 test('runtime heartbeat commit '+scenario,async t=>{
  const f=await authorityFixture(t);
  let armed=false,inHeartbeat=false,ticks=0,contended=0;
  const now=f.configuration.now,authorize=f.ports.authorizeService;
  let originalTime;
  f.configuration.now=()=>{
   if(armed&&inHeartbeat){
    ticks++;
    if(ticks===1){f.setTime(f.time+(scenario==='reverse'?-1:1));if(scenario==='revoked')f.revoke();}
    if(scenario==='repeat'&&ticks>1||scenario==='validation-rollover'&&ticks===2)f.setTime(f.time+1);
   }
   return now();
  };
  f.ports.authorizeService=function(...args){
   if(armed&&args[1].action==='HEARTBEAT_RUNTIME'){
    inHeartbeat=true;
    if(scenario==='competing-writer'&&!contended){
     const competitor=new DatabaseSync(join(f.directory,'bootcamp.sqlite'),{timeout:0});
     try{assert.throws(()=>competitor.exec('BEGIN IMMEDIATE'),/database is locked/);contended++;}finally{competitor.close();}
    }
   }
   const value=authorize.apply(this,args);
   if(armed&&scenario==='authority-expiry')return {...value,expiresAt:originalTime+1};
   if(armed&&ticks&&scenario==='authority-shrunk')return {...value,expiresAt:originalTime+2};
   if(armed&&ticks&&scenario==='service-changed')return {...value,serviceId:'worker-two'};
   return value;
  };
  f.restart();const handle=f.acquireRuntime();
  if(scenario==='original-lease-expiry')f.setTime(f.time+29);
  originalTime=f.time;
  const before=authorityDump(f),businessBefore=dump(f),sequence=f.view(f.a).ledgerSequence;
  armed=true;
  if(['forward','validation-rollover','competing-writer'].includes(scenario)){
   assert.deepEqual(f.store.execution.heartbeatRuntime(f.context,handle,60),handle);
   const expected=before;
   // The write used the original instant, not any later validation instant.
   expected.e5_runtime_workers[0].expires_at=originalTime+60;
   assert.deepEqual(authorityDump(f),expected);
   assert.equal(contended,scenario==='competing-writer'?1:0);
  }else{
   assert.throws(()=>f.store.execution.heartbeatRuntime(f.context,handle,60),/BC_E5_CLOCK_CHANGED|BC_E5_GLOBAL_FENCED|BC_E5_SERVICE_AUTHORITY|SERVICE_FORBIDDEN/);
   assert.deepEqual(authorityDump(f),before);
  }
  armed=false;
  assert.deepEqual(dump(f),businessBefore);
  assert.equal(database(f,db=>db.prepare('SELECT sequence FROM r2_meta WHERE id=1').get().sequence),sequence);
  assert.equal(f.metrics.signatures,0);assert.equal(f.metrics.broadcasts,0);
 });
}

for(const scenario of ['suspended','generation-changed','old-owner']){
 test('runtime heartbeat rejects changed '+scenario+' before renewing',async t=>{
  const f=await authorityFixture(t),handle=f.acquireRuntime();
  if(scenario==='old-owner'){f.setTime(f.time+30);f.acquireRuntime({expectedFence:1});}
  else database(f,db=>{
   db.exec('BEGIN IMMEDIATE; UPDATE e5_worker_meta SET writer=1; UPDATE e5_meta SET writer=1');
   if(scenario==='suspended')db.prepare("UPDATE e5_runtimes SET status='RECOVERY_BLOCKED' WHERE id=?").run(f.ports.runtimeId);
   else db.prepare('UPDATE e5_runtimes SET generation=generation+1 WHERE id=?').run(f.ports.runtimeId);
   db.exec('UPDATE e5_meta SET writer=0; UPDATE e5_worker_meta SET writer=0; COMMIT');
  });
  const before=authorityDump(f);
  assert.throws(()=>f.store.execution.heartbeatRuntime(f.context,handle,60),/BC_E5_RUNTIME_SUSPENDED|BC_E5_GLOBAL_FENCED/);
  assert.deepEqual(authorityDump(f),before);
  assert.equal(f.metrics.signatures,0);assert.equal(f.metrics.broadcasts,0);
 });
}
