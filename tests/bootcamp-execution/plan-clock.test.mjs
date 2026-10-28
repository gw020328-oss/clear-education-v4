// Real store/SQLite/projection, invented source and owner facade. No sender.
import test from 'node:test';
import assert from 'node:assert/strict';
import {bridgeFixture} from './bridge-fixture.mjs';
import {H,database} from './fixture.mjs';

async function fixture(t){
 const f=await bridgeFixture(t,{configure:false});let hook=()=>{},ticks=0;
 f.configuration.executionBridge=f.config;
 f.configuration.now=()=>{hook(++ticks);return f.time;};f.restart();
 const args={kind:'PREPARE',operationId:H('one-unchanged-operation'),expectedChainVersion:'4',preparationId:f.prepared.preparationId};
 return {f,args,arm(fn){ticks=0;hook=fn;},disarm(){hook=()=>{};},get ticks(){return ticks;},plan:()=>f.store.execution.plan(f.aliceContext,f.a,args)};
}
test('plan discards only one forward-clock projection, retaining operation and expected chain version',async t=>{
 const x=await fixture(t),before=x.plan();x.arm(n=>{if(n===2)x.f.setTime(x.f.time+1);});
 const after=x.plan();assert.equal(x.ticks,7);assert.deepEqual(after,before);
 assert.equal(database(x.f,db=>db.prepare('SELECT count(*) n FROM e5_intents').get().n),0);
 assert.equal(x.f.counts.seals,0);assert.equal(x.f.counts.dispatches,0);
});
test('second plan clock conflict stops at two transactions',async t=>{
 const x=await fixture(t);x.arm(n=>{if(n===2||n===6)x.f.setTime(x.f.time+1);});
 assert.throws(x.plan,/BC_VIEW_STALE/);assert.equal(x.ticks,8);
});
for(const change of ['source-change','expiry','clock-reversal','rollback-expiry','logout','identity-change'])test('plan refuses '+change+' across its boundary',async t=>{
 const x=await fixture(t);x.arm(n=>{
  if(n===2){
   if(change==='source-change')x.f.change(x.f.a,'activity-complete',{rawAvailable:false});
   else x.f.setTime(x.f.time+(change==='expiry'?301:change==='clock-reversal'?-1:1));
  }
  if(n===4&&change==='rollback-expiry')x.f.setTime(x.f.time+301);
  if(n===4&&change==='logout')x.f.service.logout(x.f.aliceContext);
  if(n===4&&change==='identity-change')x.f.aliceContext.wallet=x.f.bob.address;
 });
 assert.throws(x.plan,/BC_VIEW_STALE|AUTH_REQUIRED|WALLET_CONTEXT_CHANGED|BC_E5_CURRENT_SOURCE_REQUIRED/);
 assert.ok(x.ticks<=5);assert.equal(x.f.counts.seals,0);assert.equal(x.f.counts.dispatches,0);
});
test('enqueue stale revision and changed decision stay rejected, without write retries',async t=>{
 const x=await fixture(t),p=x.plan();
 assert.throws(()=>x.f.store.execution.enqueue(x.f.aliceContext,x.f.a,{...p.body,expectedRevision:p.body.expectedRevision-1},x.f.key()),/BC_VIEW_STALE/);
 assert.throws(()=>x.f.store.execution.enqueue(x.f.aliceContext,x.f.a,{...p.body,targetDecisionHash:H('changed-decision')},x.f.key()),/BC_DECISION_TARGET/);
 x.arm(n=>{if([2,3,5].includes(n))x.f.setTime(x.f.time+1);});
 assert.throws(()=>x.f.store.execution.enqueue(x.f.aliceContext,x.f.a,p.body,x.f.key()),/BC_VIEW_STALE/);assert.equal(x.ticks,6);
 assert.equal(database(x.f,db=>db.prepare('SELECT count(*) n FROM e5_intents').get().n),0);
});

test('plan rejects the exact source cutoff before producing a command',async t=>{
 const x=await fixture(t);x.f.setTime(Number(x.f.m.sourceValidUntilExclusive));
 assert.throws(x.plan,/BC_E3_SOURCE_EXPIRED|BC_E5_CURRENT_SOURCE_REQUIRED/);
 assert.equal(x.f.counts.seals,0);assert.equal(x.f.counts.dispatches,0);
});
