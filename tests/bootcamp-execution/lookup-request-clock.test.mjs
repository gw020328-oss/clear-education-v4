import test from 'node:test';
import assert from 'node:assert/strict';
import {bridgeFixture} from './bridge-fixture.mjs';
test('B_LOOKUP_REQUEST revalidates original authority across a second with exactly one native lookup',async t=>{
 const f=await bridgeFixture(t),r=await f.prepare();f.makeEnvelope(r.binding);let ticks=0,lookups=0;const issued=f.counts.issued;
 f.setLookupHook(()=>{lookups++;});f.setClockHook(()=>{if(++ticks===2)f.setTime(f.time+1);});
 const found=await f.bridge.lookup(f.g,f.h,r.binding);assert.equal(found.status,'FOUND');assert.equal(lookups,1);
 assert.equal(found.envelope.originalAuthorityUntil,r.binding.expiresAt);assert.equal(f.counts.issued,issued+1);
 assert.equal(f.counts.seals,0);assert.equal(f.counts.dispatches,0);
});
for(const change of ['expiry','revoked','reverse','second-conflict'])test('B_LOOKUP_REQUEST '+change+' rejects before native lookup or witness',async t=>{
 const f=await bridgeFixture(t),r=await f.prepare();f.makeEnvelope(r.binding);let ticks=0,lookups=0;const issued=f.counts.issued;
 f.setLookupHook(()=>{lookups++;});f.setClockHook(()=>{
  ticks++;if(ticks===2){if(change==='revoked')f.revoke();else f.setTime(change==='expiry'?r.binding.expiresAt:f.time+(change==='reverse'?-1:1));}
  if(change==='second-conflict'&&[3,5].includes(ticks))f.setTime(f.time+1);
 });
 await assert.rejects(f.bridge.lookup(f.g,f.h,r.binding),/BC_|SERVICE_FORBIDDEN/);assert.equal(lookups,0);assert.equal(f.counts.issued,issued);
 assert.equal(f.counts.seals,0);assert.equal(f.counts.dispatches,0);
});
test('lookup remains recovery-only after source withdrawal and cannot authorize adoption',async t=>{
 const f=await bridgeFixture(t),r=await f.prepare();f.makeEnvelope(r.binding);let ticks=0;
 f.setClockHook(()=>{if(++ticks===2){f.change(f.a,'activity-complete',{rawAvailable:false});f.setTime(f.time+1);}});
 assert.equal((await f.bridge.lookup(f.g,f.h,r.binding)).status,'FOUND');f.setClockHook(()=>{});
 await assert.rejects(f.bridge.adopt(f.g,f.h,r.binding),/BC_/);assert.equal(f.counts.seals,0);assert.equal(f.counts.dispatches,0);
});
