import test from 'node:test';
import assert from 'node:assert/strict';
import {bridgeFixture} from './bridge-fixture.mjs';

for(const phase of ['BEFORE_DISPATCH','SEND_STARTED_FINAL_SYNC','BEFORE_KEY_FINAL_SYNC','AFTER_SIGN_FINAL_SYNC'])test(phase+' revalidates one already-issued witness without issuer or sender replay',async t=>{
 const f=await bridgeFixture(t),r=await f.prepare();const before=f.counts.issued;let issues=0;
 f.setIssueHook(()=>{issues++;f.setTime(f.time+1);});const out=f.invoke('current',r.binding,phase);
 assert.equal(out.payload.phase,phase);assert.equal(issues,1);assert.equal(f.counts.issued,before+1);assert.equal(f.counts.dispatches,0);assert.equal(f.counts.seals,0);
});
for(const change of ['expiry','service-revoked','source-change'])test('pre-dispatch rollover rejects '+change+' without signing again or sending',async t=>{
 const f=await bridgeFixture(t),r=await f.prepare(),before=f.counts.issued;let issues=0;
 f.setIssueHook(()=>{issues++;f.setTime(change==='expiry'?r.binding.expiresAt:f.time+1);
  if(change==='service-revoked')f.revoke();
  if(change==='source-change')f.change(f.a,'activity-complete',{rawAvailable:false});
 });
 assert.throws(()=>f.invoke('current',r.binding,'BEFORE_DISPATCH'),/FENCED|BINDING_AUTHORITY|SERVICE_FORBIDDEN|CURRENT_CHANGED|COMMAND_CHANGED|EXACT_COMMAND/);
 assert.equal(issues,1);assert.equal(f.counts.issued,before+1);assert.equal(f.counts.dispatches,0);assert.equal(f.counts.seals,0);
});

for(const change of ['recipient','amount','payload'])test('immutable controller evidence rejects changed '+change+' before issuing',async t=>{
 const f=await bridgeFixture(t),r=await f.prepare(),before=f.counts.issued,command=structuredClone(f.command);
 if(change==='recipient')command.args[1].recipient='0x'+'99'.repeat(20);
 if(change==='amount')command.args[1].amountAtoms='100000001';
 if(change==='payload')command.args[0]='0x'+'88'.repeat(32);
 assert.throws(()=>f.invoke('current',r.binding,'BEFORE_DISPATCH',{command}),/BC_E5B_READER_PROOF/);
 assert.equal(f.counts.issued,before);assert.equal(f.counts.dispatches,0);
});
for(const change of ['second-clock','second-source-change'])test('second validation rejects '+change+' with one issuer invocation',async t=>{
 const f=await bridgeFixture(t),r=await f.prepare(),before=f.counts.issued;let armed=false,ticks=0;
 f.setIssueHook(()=>{f.setTime(f.time+1);armed=true;});
 f.setClockHook(()=>{if(armed&&++ticks===8){if(change==='second-clock')f.setTime(f.time+1);else f.change(f.a,'activity-complete',{rawAvailable:false});}});
 assert.throws(()=>f.invoke('current',r.binding,'BEFORE_DISPATCH'),/BC_E5_CLOCK_CHANGED|BC_E5_CURRENT_CHANGED|BC_E5_CURRENT_PREPARATION_REQUIRED/);
 assert.equal(f.counts.issued,before+1);assert.equal(f.counts.dispatches,0);assert.equal(f.counts.seals,0);
});
for(const change of ['expiry','service-revoked'])test('commit witness recheck rejects '+change+' before send',async t=>{
 const f=await bridgeFixture(t),r=await f.prepare();f.makeEnvelope(r.binding);await f.bridge.lookup(f.g,f.h,r.binding);await f.bridge.adopt(f.g,f.h,r.binding);
 const before=f.counts.issued;f.setIssueHook(()=>{f.setTime(change==='expiry'?r.binding.expiresAt:f.time+1);if(change==='service-revoked')f.revoke();});
 assert.throws(()=>f.invoke('commit',r.binding,'COMMIT'),/FENCED|BINDING_AUTHORITY|SERVICE_FORBIDDEN/);
 assert.equal(f.counts.issued,before+1);assert.equal(f.counts.dispatches,0);
});
