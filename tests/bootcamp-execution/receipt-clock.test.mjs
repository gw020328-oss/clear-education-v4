import test from 'node:test';
import assert from 'node:assert/strict';
import {bridgeFixture} from './bridge-fixture.mjs';
import {database,H} from './fixture.mjs';
async function setup(t,fault){const f=await bridgeFixture(t,{fault}),r=await f.prepare();f.makeEnvelope(r.binding);await f.bridge.lookup(f.g,f.h,r.binding);
 Object.assign(f.observation.business.application,{preparedDigest:f.digest,preparedNonce:f.m.nonce,deadlinePolicyHash:f.m.deadlinePolicyHash,version:'5'});
 const o=f.snapshot();f.setReceipt({ref:'env-offline',status:'INCLUDED',txHash:H('tx'),checkpoint:o.checkpoint,observation:o,automaticResign:false});return {f,binding:r.binding};}
test('receipt completion crosses a second without repeating receipt consumption or slot release',async t=>{
 let f,writes=0,releases=0;const x=await setup(t,point=>{if(point==='e5b-after-completion'){writes++;f.setTime(f.time+1);}if(point==='e5b-after-terminal-slot-release')releases++;});f=x.f;
 const before={...f.counts};const r=await f.bridge.recover(f.g,f.h,x.binding);
 assert.equal(r.completion.status,'INCLUDED');assert.equal(writes,1);assert.equal(releases,1);assert.equal(f.counts.reads,before.reads+1);assert.equal(f.counts.seals,0);assert.equal(f.counts.dispatches,0);
 assert.equal(database(f,db=>db.prepare('SELECT count(*) n FROM e5b_completions').get().n),1);
});
for(const change of ['expiry','revoke','reverse'])test('receipt final '+change+' rolls back completion and release, without send',async t=>{
 let f,binding,writes=0;const x=await setup(t,point=>{if(point==='e5b-after-terminal-slot-release'){writes++;f.setTime(change==='expiry'?binding.expiresAt:change==='reverse'?f.time-1:f.time+1);if(change==='revoke')f.revoke();}});f=x.f;binding=x.binding;
 await assert.rejects(f.bridge.recover(f.g,f.h,binding),/BC_|SERVICE_FORBIDDEN/);assert.equal(writes,1);
 assert.equal(database(f,db=>db.prepare('SELECT count(*) n FROM e5b_completions').get().n),0);assert.equal(f.counts.dispatches,0);
});

for(const crossings of [1,2])test('receipt final validation crossings '+crossings+' keeps one completion attempt',async t=>{
 let f,armed=false,ticks=0,writes=0;const x=await setup(t,point=>{if(point==='e5b-after-terminal-slot-release'){armed=true;writes++;}});f=x.f;
 f.setClockHook(()=>{if(armed&&[2,...(crossings===2?[4]:[])].includes(++ticks))f.setTime(f.time+1);});
 const work=f.bridge.recover(f.g,f.h,x.binding);if(crossings===1)await work;else await assert.rejects(work,/BC_E5_CLOCK_CHANGED/);
 assert.equal(writes,1);assert.equal(f.counts.seals,0);assert.equal(f.counts.dispatches,0);
 assert.equal(database(f,db=>db.prepare('SELECT count(*) n FROM e5b_completions').get().n),crossings===1?1:0);
});
