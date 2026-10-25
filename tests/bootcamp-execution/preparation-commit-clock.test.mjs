import test from 'node:test';import assert from 'node:assert/strict';
import {bridgeFixture} from './bridge-fixture.mjs';import {database} from './fixture.mjs';
for(const phase of ['e5b-after-binding','e5b-after-capability'])test(phase+' rolls over with one original binding and capability',async t=>{
 let f,writes=0;f=await bridgeFixture(t,{fault(point){if(point===phase){writes++;f.setTime(f.time+1);}}});
 const r=await f.prepare();assert.equal(writes,1);assert.equal(f.counts.issued,1);assert.equal(f.counts.seals,0);
 const counts=database(f,db=>({requests:db.prepare('SELECT count(*) n FROM e5b_requests').get().n,bindings:db.prepare('SELECT count(*) n FROM e5b_bindings').get().n,capabilities:db.prepare("SELECT count(*) n FROM e5b_events WHERE kind='CAPABILITY'").get().n}));
 assert.deepEqual(counts,{requests:1,bindings:1,capabilities:1});assert.deepEqual(r.binding,r.capability.payload);
});
for(const phase of ['e5b-after-binding','e5b-after-capability'])for(const change of ['expiry','service-revoked','source-change','reversal'])test(phase+' final check rejects '+change+' without repeating writes or issuance',async t=>{
 let f,writes=0,start;f=await bridgeFixture(t,{fault(point){if(point===phase){writes++;f.setTime(change==='expiry'?start+30:change==='reversal'?f.time-1:f.time+1);if(change==='service-revoked')f.revoke();if(change==='source-change')f.change(f.a,'activity-complete',{rawAvailable:false});}}});start=f.time;
 await assert.rejects(f.prepare(),/BC_|SERVICE_FORBIDDEN/);assert.equal(writes,1);assert.equal(f.counts.issued,phase==='e5b-after-binding'?0:1);assert.equal(f.counts.seals,0);assert.equal(f.counts.dispatches,0);
 assert.equal(database(f,db=>db.prepare("SELECT count(*) n FROM e5b_events WHERE kind='CAPABILITY'").get().n),0);
 if(phase==='e5b-after-binding')assert.equal(database(f,db=>db.prepare('SELECT count(*) n FROM e5b_bindings').get().n),0);
});
