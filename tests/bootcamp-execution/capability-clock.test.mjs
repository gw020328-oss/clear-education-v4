import test from 'node:test';
import assert from 'node:assert/strict';
import {bridgeFixture} from './bridge-fixture.mjs';

test('capability rollover returns the same single issued certificate after fresh validation',async t=>{
 const f=await bridgeFixture(t);let issued=0;
 f.setIssueHook(()=>{issued++;f.setTime(f.time+1);});
 const r=await f.prepare();
 assert.deepEqual(r.capability.payload,r.binding);assert.equal(issued,1);
 assert.equal(f.counts.issued,1);assert.equal(f.counts.consumed,1);
 assert.equal(f.counts.seals,0);assert.equal(f.counts.dispatches,0);
});

for(const change of ['expiry','service-revoked','source-change','clock-reversal','untyped-error'])test('capability rollover rejects '+change+' without a second issuance',async t=>{
 const f=await bridgeFixture(t),r=await f.prepare(),before=f.counts.issued;
 f.setIssueHook(()=>{
  if(change==='untyped-error')throw Error('BC_E5_CLOCK_CHANGED');
  f.setTime(change==='expiry'?r.binding.expiresAt:change==='clock-reversal'?f.time-1:f.time+1);
  if(change==='service-revoked')f.revoke();
  if(change==='source-change')f.change(f.a,'activity-complete',{rawAvailable:false});
 });
 assert.throws(()=>f.invoke('capability',r.binding,'AUTHORIZE'),/FENCED|BINDING_AUTHORITY|SERVICE_FORBIDDEN|CURRENT_CHANGED|COMMAND_CHANGED|EXACT_COMMAND|CLOCK_REVERSED|CLOCK_CHANGED|CURRENT_PREPARATION_REQUIRED/);
 assert.equal(f.counts.issued,before+1);assert.equal(f.counts.seals,0);assert.equal(f.counts.dispatches,0);
});
for(const mutation of ['recipient','amount','payload'])test('capability cannot revalidate a different '+mutation,async t=>{
 const f=await bridgeFixture(t),r=await f.prepare(),before=f.counts.issued,command=structuredClone(f.command);
 if(mutation==='recipient')command.args[1].recipient='0x'+'99'.repeat(20);
 if(mutation==='amount')command.args[1].amountAtoms='100000001';
 if(mutation==='payload')command.args[0]='0x'+'88'.repeat(32);
 assert.throws(()=>f.invoke('capability',r.binding,'AUTHORIZE',{command}),/READER_PROOF/);
 assert.equal(f.counts.issued,before);
});
test('a second capability clock conflict stops with one issuer invocation',async t=>{
 const f=await bridgeFixture(t),r=await f.prepare(),before=f.counts.issued;let armed=false,ticks=0;
 f.setIssueHook(()=>{f.setTime(f.time+1);armed=true;});
 f.setClockHook(()=>{if(armed&&++ticks===8)f.setTime(f.time+1);});
 assert.throws(()=>f.invoke('capability',r.binding,'AUTHORIZE'),/BC_E5_CLOCK_CHANGED/);
 assert.equal(f.counts.issued,before+1);assert.equal(f.counts.seals,0);assert.equal(f.counts.dispatches,0);
});
