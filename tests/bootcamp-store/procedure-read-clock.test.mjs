import test from 'node:test';
import assert from 'node:assert/strict';
import {procedureFixture} from './procedure-fixture.mjs';

test('procedure GET rebuilds its snapshot once after a forward second',async t=>{
 const f=await procedureFixture(t),app=f.create();await f.complete(app);let ticks=0,armed=false;
 f.configuration.now=()=>{if(armed&&++ticks===2)f.setTime(f.time+1);return f.time;};f.restart();
 const before=f.counts();armed=true;const result=f.view(app);armed=false;
 assert.equal(result.asOf,f.time);assert.deepEqual(f.counts(),before);
});
for(const change of ['source','port','logout','operator-scope','expiry','reverse','second-conflict'])test('procedure GET '+change+' cannot return its stale snapshot',async t=>{
 const f=await procedureFixture(t),app=f.create();await f.complete(app);let ticks=0,armed=false,bindings=f.configuration.operatorBindings;
 f.configuration.resolveOperatorBindings=()=>bindings;
 f.configuration.now=()=>{
  if(armed){ticks++;
   if(ticks===2){
    if(change==='source')f.change(app,'activity-complete',{rawAvailable:false});
    if(change==='port')f.setFull(false);
    if(change==='logout')f.service.logout(f.aliceContext);
    if(change==='operator-scope')bindings=[];
    f.setTime(f.time+(change==='expiry'?301:change==='reverse'?-1:1));
   }
   if(change==='second-conflict'&&ticks===6)f.setTime(f.time+1);
  }return f.time;
 };f.restart();const before=f.counts();armed=true;
 assert.throws(()=>f.view(app,change==='operator-scope'?f.operatorContext:f.aliceContext),/BC_|AUTH_REQUIRED|FORBIDDEN/);armed=false;
 assert.equal(f.counts().commands,before.commands);assert.equal(f.counts().evidence,before.evidence);assert.ok(ticks<=8);
});
test('procedure GET rebuilds eligibility at the original confirmation deadline',async t=>{
 const f=await procedureFixture(t),app=f.create();await f.complete(app);f.publish(app);
 const deadline=f.view(app).procedure.confirmAt;f.setTime(deadline-1);const before=f.view(app);let ticks=0;
 f.configuration.now=()=>{if(++ticks===2)f.setTime(f.time+1);return f.time;};f.restart();ticks=0;
 const after=f.view(app);assert.equal(after.asOf,deadline);assert.equal(after.procedure.confirmAt,deadline);
 assert.notEqual(after.procedure.status,before.procedure.status);
 assert.equal(after.procedure.status,'DEADLINE_PREFLIGHT_CANDIDATE');
});
