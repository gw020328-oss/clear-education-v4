import test from 'node:test';
import assert from 'node:assert/strict';
import {bridgeFixture} from './bridge-fixture.mjs';

test('read-only B_INSPECT crosses a second without new signing or extended authority',async t=>{
 const f=await bridgeFixture(t),before=f.bridge.inspect(f.g,f.h);let ticks=0;
 f.setClockHook(()=>{if(++ticks===3)f.setTime(f.time+1);});
 const after=f.bridge.inspect(f.g,f.h);assert.deepEqual(after,before);
 assert.equal(f.counts.issued,0);assert.equal(f.counts.seals,0);assert.equal(f.counts.dispatches,0);
});
for(const phase of ['LOOKUP','RETENTION'])test(phase+' rechecks a single unreturned read witness across a second',async t=>{
 const f=await bridgeFixture(t),r=await f.prepare(),before=f.counts.issued;
 f.setIssueHook(()=>f.setTime(f.time+1));f.invoke('current',r.binding,phase);
 assert.equal(f.counts.issued,before+1);assert.equal(f.counts.seals,0);assert.equal(f.counts.dispatches,0);
});

import {executionFixture,database} from './fixture.mjs';
for(const change of ['forward','expiry','revoked'])test('one lease acquisition validates '+change+' without repeating its write',async t=>{
 const f=await executionFixture(t),i=f.enqueue().receipt.intentId,original=f.time,authorize=f.ports.authorizeService;let calls=0;
 f.ports.authorizeService=function(...args){const result=authorize.apply(this,args);if(++calls===1){f.setTime(original+(change==='expiry'?30:1));if(change==='revoked')f.revoke();}return result;};f.restart();
 if(change==='forward'){
  const h=f.acquire(i);assert.ok(calls>=2);assert.equal(h.workerFence,1);assert.equal(database(f,db=>db.prepare('SELECT expires_at FROM e5_leases WHERE intent_id=?').get(i).expires_at),original+30);
 }else{assert.throws(()=>f.acquire(i),/FENCED|SERVICE_FORBIDDEN/);assert.equal(database(f,db=>db.prepare('SELECT count(*) n FROM e5_leases WHERE intent_id=?').get(i).n),0);}
});
for(const change of ['expiry','source','revoked','reverse'])test('B_INSPECT fails on '+change+' during final read validation',async t=>{
 const f=await bridgeFixture(t);let ticks=0;
 f.setClockHook(()=>{if(++ticks===3){if(change==='source')f.change(f.a,'activity-complete',{rawAvailable:false});else if(change==='revoked')f.revoke();else f.setTime(f.time+(change==='expiry'?30:-1));}});
 assert.throws(()=>f.bridge.inspect(f.g,f.h),/BC_|SERVICE_FORBIDDEN/);assert.equal(f.counts.issued,0);
});
for(const phase of ['LOOKUP','RETENTION'])for(const change of ['expiry','revoked','reverse'])test(phase+' stops on '+change+' with one unreturned witness',async t=>{
 const f=await bridgeFixture(t),r=await f.prepare(),before=f.counts.issued;
 f.setIssueHook(()=>{if(change==='revoked')f.revoke();f.setTime(change==='expiry'?r.binding.expiresAt:f.time+(change==='reverse'?-1:1));});
 assert.throws(()=>f.invoke('current',r.binding,phase),/BC_|SERVICE_FORBIDDEN/);
 assert.equal(f.counts.issued,before+1);assert.equal(f.counts.seals,0);assert.equal(f.counts.dispatches,0);
});
