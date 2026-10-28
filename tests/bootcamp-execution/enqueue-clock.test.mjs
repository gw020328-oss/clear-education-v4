import test from 'node:test';
import assert from 'node:assert/strict';
import {executionFixture,dump} from './fixture.mjs';

async function fixture(t,change='forward'){
 const f=await executionFixture(t),body=f.body();let writes=0,ticks=0,armed=false;
 f.configuration.resolveOperatorBindings=()=>f.configuration.operatorBindings;
 f.configuration.fault=point=>{if(point==='e5-after-receipt'){writes++;armed=true;}};
 f.configuration.now=()=>{
  if(armed){ticks++;
   if(ticks===1){
    if(change==='source')f.change(f.a,'activity-complete',{rawAvailable:false});
    else if(change==='logout')f.service.logout(f.aliceContext);
    else if(change==='role-revoked')f.configuration.operatorBindings.splice(0);
    else f.setTime(f.time+(change==='expiry'?301:change==='reverse'?-1:1));
   }
   if(change==='second-conflict'&&[2,4].includes(ticks))f.setTime(f.time+1);
  }
  return f.time;
 };
 f.restart();
 return {f,run:()=>f.store.execution.enqueue(change==='role-revoked'?f.operatorContext:f.aliceContext,f.a,body,f.key()),get writes(){return writes;},disarm(){armed=false;}};
}
test('enqueue crossing a second commits one intent and one receipt without replay',async t=>{
 const x=await fixture(t),r=x.run();x.disarm();assert.equal(x.writes,1);
 const rows=dump(x.f);assert.equal(rows.e5_intents.length,1);assert.equal(rows.e5_receipts.length,1);
 assert.equal(rows.e5_intents[0].id,r.receipt.intentId);assert.equal(x.f.metrics.signatures,0);assert.equal(x.f.metrics.broadcasts,0);
});
for(const change of ['source','expiry','logout','role-revoked','reverse','second-conflict'])test('enqueue '+change+' rolls back both records without replay',async t=>{
 const x=await fixture(t,change);assert.throws(x.run,/BC_|AUTH_REQUIRED|FORBIDDEN/);x.disarm();
 assert.equal(x.writes,1);const rows=dump(x.f);assert.equal(rows.e5_intents.length,0);assert.equal(rows.e5_receipts.length,0);
 assert.equal(x.f.metrics.signatures,0);assert.equal(x.f.metrics.broadcasts,0);
});
