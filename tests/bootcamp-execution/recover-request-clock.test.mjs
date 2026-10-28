import test from 'node:test';
import assert from 'node:assert/strict';
import {bridgeFixture} from './bridge-fixture.mjs';

for(const change of ['forward','source','expiry','revoked','reverse','second-conflict'])test('recovery request '+change+' preserves recovery-only original authority',async t=>{
 const f=await bridgeFixture(t),r=await f.prepare();f.makeEnvelope(r.binding);await f.bridge.lookup(f.g,f.h,r.binding);
 f.setReceipt({ref:'env-offline',status:'UNKNOWN',automaticResign:false});let ticks=0;
 f.setClockHook(()=>{
  ticks++;if(ticks===2){
   if(change==='source')f.change(f.a,'activity-complete',{rawAvailable:false});
   if(change==='revoked')f.revoke();
   f.setTime(change==='expiry'?r.binding.expiresAt:f.time+(change==='reverse'?-1:1));
  }
  if(change==='second-conflict'&&[3,5].includes(ticks))f.setTime(f.time+1);
 });
 if(['forward','source'].includes(change)){
  const result=await f.bridge.recover(f.g,f.h,r.binding);assert.equal(result.status,'HOLD');assert.equal(result.automaticResign,false);assert.equal(f.nativeRecoveries,1);
 }else{await assert.rejects(f.bridge.recover(f.g,f.h,r.binding),/BC_|SERVICE_FORBIDDEN/);assert.equal(f.nativeRecoveries,0);}
 assert.equal(f.counts.seals,0);assert.equal(f.counts.dispatches,0);
});
