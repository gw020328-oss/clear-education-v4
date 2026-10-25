import test from 'node:test';
import assert from 'node:assert/strict';
import {bridgeFixture} from './bridge-fixture.mjs';
import {database} from './fixture.mjs';

test('adoption clock rollover commits its one provisional record without invoking native adoption again',async t=>{
 let f,writes=0;f=await bridgeFixture(t,{fault(point){if(point==='e5b-after-adoption'){writes++;f.setTime(f.time+1);}}});
 const r=await f.prepare();f.makeEnvelope(r.binding);await f.bridge.lookup(f.g,f.h,r.binding);
 const a=await f.bridge.adopt(f.g,f.h,r.binding);assert.equal(a.adoptionHash,f.adoption.adoptionHash);assert.equal(writes,1);assert.equal(f.nativeAdoptions,1);assert.equal(database(f,db=>db.prepare("SELECT count(*) n FROM e5b_events WHERE kind='ADOPTION'").get().n),1);
 assert.equal(f.counts.seals,0);assert.equal(f.counts.dispatches,0);
});

test('a canonical block before original issuedAt reproduces FIRST_ACCEPT_TIME while wall clock is valid',async t=>{
 const f=await bridgeFixture(t);f.observation.checkpoint.time=String(Number(f.m.issuedAt)-1);
 assert.ok(f.time>=Number(f.m.issuedAt)&&f.time<Number(f.m.expiresAt));
 await assert.rejects(f.prepare(),/BC_E5_CURRENT_FIRST_ACCEPT_TIME/);assert.equal(f.counts.issued,0);
});

for(const change of ['expiry','service-revoked','source-change','clock-reversal'])test('adoption final validation rejects '+change+' without another native adoption or API write',async t=>{
 let f,writes=0,binding;f=await bridgeFixture(t,{fault(point){if(point==='e5b-after-adoption'){
  writes++;f.setTime(change==='expiry'?binding.expiresAt:change==='clock-reversal'?f.time-1:f.time+1);
  if(change==='service-revoked')f.revoke();if(change==='source-change')f.change(f.a,'activity-complete',{rawAvailable:false});
 }}});
 const r=await f.prepare();binding=r.binding;f.makeEnvelope(binding);await f.bridge.lookup(f.g,f.h,binding);
 await assert.rejects(f.bridge.adopt(f.g,f.h,binding),/BC_|SERVICE_FORBIDDEN/);
 assert.equal(writes,1);assert.equal(f.nativeAdoptions,1);assert.equal(f.counts.dispatches,0);
 assert.equal(database(f,db=>db.prepare("SELECT count(*) n FROM e5b_events WHERE kind='ADOPTION'").get().n),0);
});
for(const crossings of [1,2])test('adoption final-validation crossings '+crossings+' never replay adoption',async t=>{
 let f,armed=false,ticks=0,writes=0;
 f=await bridgeFixture(t,{fault(point){if(point==='e5b-after-adoption'){armed=true;writes++;}}});
 const r=await f.prepare();f.makeEnvelope(r.binding);await f.bridge.lookup(f.g,f.h,r.binding);
 f.setClockHook(()=>{if(armed&&[3,...(crossings===2?[6]:[])].includes(++ticks))f.setTime(f.time+1);});
 const adopt=f.bridge.adopt(f.g,f.h,r.binding);if(crossings===1)await adopt;else await assert.rejects(adopt,/BC_E5_CLOCK_CHANGED/);
 assert.equal(writes,1);assert.equal(f.nativeAdoptions,1);assert.equal(f.counts.dispatches,0);
 assert.equal(database(f,db=>db.prepare("SELECT count(*) n FROM e5b_events WHERE kind='ADOPTION'").get().n),crossings===1?1:0);
});
