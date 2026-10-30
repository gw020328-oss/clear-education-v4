import test from 'node:test';
import assert from 'node:assert/strict';
import {bridgeFixture} from './bridge-fixture.mjs';
import {database} from './fixture.mjs';

test('lookup commit crosses a second after exactly one native lookup',async t=>{
 const f=await bridgeFixture(t),r=await f.prepare();f.makeEnvelope(r.binding);let calls=0,ticks=0;
 f.setAfterLookup(()=>{calls++;f.setClockHook(()=>{if(++ticks===2)f.setTime(f.time+1);});});
 const result=await f.bridge.lookup(f.g,f.h,r.binding);assert.equal(result.status,'FOUND');assert.equal(calls,1);
 assert.equal(result.envelope.originalAuthorityUntil,r.binding.expiresAt);assert.equal(f.nativeAdoptions,0);
 assert.equal(database(f,db=>db.prepare("SELECT count(*) n FROM e5b_events WHERE kind='REFERENCE'").get().n),1);
 assert.equal(f.counts.seals,0);assert.equal(f.counts.dispatches,0);
});
for(const action of ['lookup','adopt'])for(const change of ['expiry','revoked','reverse','second-conflict'])test(action+' final request/commit '+change+' cannot replay native work',async t=>{
 const f=await bridgeFixture(t),r=await f.prepare();f.makeEnvelope(r.binding);let ticks=0,lookups=0;
 const hook=()=>{
  ticks++;
  if(ticks===2){if(change==='revoked')f.revoke();else f.setTime(change==='expiry'?r.binding.expiresAt:f.time+(change==='reverse'?-1:1));}
  if(change==='second-conflict'&&(action==='lookup'?[3,5]:[4,7]).includes(ticks))f.setTime(f.time+1);
 };
 if(action==='lookup')f.setAfterLookup(()=>{lookups++;f.setClockHook(hook);});
 else{await f.bridge.lookup(f.g,f.h,r.binding);f.setClockHook(hook);}
 await assert.rejects(f.bridge[action](f.g,f.h,r.binding),/BC_|SERVICE_FORBIDDEN/);f.setClockHook(()=>{});
 assert.equal(f.nativeAdoptions,0);assert.equal(lookups,action==='lookup'?1:0);assert.equal(f.counts.seals,0);assert.equal(f.counts.dispatches,0);
 assert.equal(database(f,db=>db.prepare("SELECT count(*) n FROM e5b_events WHERE kind='REFERENCE'").get().n),action==='lookup'?0:1);
 assert.equal(database(f,db=>db.prepare("SELECT count(*) n FROM e5b_events WHERE kind='ADOPTION'").get().n),0);
});
test('recovery lookup can record an existing envelope after source withdrawal but adoption stops before native work',async t=>{
 const f=await bridgeFixture(t),r=await f.prepare();f.makeEnvelope(r.binding);let ticks=0;
 f.setAfterLookup(()=>f.setClockHook(()=>{if(++ticks===2){f.change(f.a,'activity-complete',{rawAvailable:false});f.setTime(f.time+1);}}));
 assert.equal((await f.bridge.lookup(f.g,f.h,r.binding)).status,'FOUND');f.setClockHook(()=>{});
 await assert.rejects(f.bridge.adopt(f.g,f.h,r.binding),/BC_/);assert.equal(f.nativeAdoptions,0);
 assert.equal(f.counts.seals,0);assert.equal(f.counts.dispatches,0);
});
test('NOT_FOUND lookup crosses a second without creating an envelope or reference',async t=>{
 const f=await bridgeFixture(t),r=await f.prepare();let ticks=0,lookups=0;
 f.setAfterLookup(()=>{lookups++;f.setClockHook(()=>{if(++ticks===2)f.setTime(f.time+1);});});
 assert.equal((await f.bridge.lookup(f.g,f.h,r.binding)).status,'NOT_FOUND');assert.equal(lookups,1);
 assert.equal(database(f,db=>db.prepare("SELECT count(*) n FROM e5b_events WHERE kind IN ('REFERENCE','ENVELOPE')").get().n),0);
 assert.equal(f.counts.seals,0);assert.equal(f.counts.dispatches,0);
});
test('adoption request crosses a second before exactly one native adoption',async t=>{
 const f=await bridgeFixture(t),r=await f.prepare();f.makeEnvelope(r.binding);await f.bridge.lookup(f.g,f.h,r.binding);let ticks=0;
 f.setClockHook(()=>{if(++ticks===2)f.setTime(f.time+1);});
 const result=await f.bridge.adopt(f.g,f.h,r.binding);assert.equal(f.nativeAdoptions,1);
 assert.equal(result.authorityUntil,Math.min(r.binding.expiresAt,r.binding.business.businessValidUntil));
 assert.equal(f.counts.seals,0);assert.equal(f.counts.dispatches,0);
});
