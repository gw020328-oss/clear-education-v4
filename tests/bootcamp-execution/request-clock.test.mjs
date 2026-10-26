import test from 'node:test';
import assert from 'node:assert/strict';
import {bridgeFixture} from './bridge-fixture.mjs';
test('B_READ_REQUEST validates original CAS across a second before any native read or issuance',async t=>{
 const f=await bridgeFixture(t),expected=f.bridge.inspect(f.g,f.h);let ticks=0;
 f.setClockHook(()=>{if(++ticks===3)f.setTime(f.time+1);});
 const r=await f.bridge.prepare(f.g,f.h,expected);assert.equal(r.binding.expiresAt,expected.authorityExpiresAt);
 assert.equal(f.counts.reads,1);assert.equal(f.counts.issued,1);assert.equal(f.counts.seals,0);assert.equal(f.counts.dispatches,0);
});
for(const change of ['source','expiry','revoked','reverse','second-conflict'])test('B_READ_REQUEST '+change+' rejects before native read/issuance',async t=>{
 const f=await bridgeFixture(t),expected=f.bridge.inspect(f.g,f.h);let ticks=0;
 f.setClockHook(()=>{ticks++;if(ticks===3){if(change==='source')f.change(f.a,'activity-complete',{rawAvailable:false});else if(change==='revoked')f.revoke();else f.setTime(change==='expiry'?expected.authorityExpiresAt:f.time+(change==='reverse'?-1:1));}else if(change==='second-conflict'&&[5,8].includes(ticks))f.setTime(f.time+1);});
 await assert.rejects(f.bridge.prepare(f.g,f.h,expected),/BC_|SERVICE_FORBIDDEN/);
 assert.equal(f.counts.reads,0);assert.equal(f.counts.issued,0);assert.equal(f.counts.seals,0);assert.equal(f.counts.dispatches,0);
});
