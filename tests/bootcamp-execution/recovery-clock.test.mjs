// Invented actors and clocks, actual API store/controller. No network, signing or sender activation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {bridgeFixture} from './bridge-fixture.mjs';
import {bridgeControllerFactory} from '../../src/bootcamp/execution-e4b-controller.mjs';
import {e4Hash} from '../../src/bootcamp/execution-e4-ports.mjs';
import {RuleError} from '../../src/policy/values.mjs';
import {sourceDiagnosticCode} from '../../src/hackerrank-evidence/diagnostics.mjs';

for(const phase of ['RECOVER','RECOVER_FINAL_SYNC'])test('one '+phase+' clock rollover rechecks the store with the same single witness',async t=>{
 const f=await bridgeFixture(t),r=await f.prepare(),before=f.counts.issued;let issues=0;
 f.setIssueHook(()=>{issues++;f.setTime(f.time+1);});const result=f.invoke('current',r.binding,phase);
 assert.equal(result.payload.phase,phase);assert.equal(f.counts.issued,before+1);assert.equal(issues,1);
 assert.equal(f.counts.dispatches,0);assert.equal(f.counts.seals,0);
});
for(const phase of ['BEFORE_DISPATCH','BEFORE_KEY_FINAL_SYNC'])test(phase+' clock rollover never repeats an execution witness',async t=>{
 const f=await bridgeFixture(t),r=await f.prepare(),before=f.counts.issued;
 f.setIssueHook(()=>f.setTime(f.time+1));assert.throws(()=>f.invoke('current',r.binding,phase),/BC_E5_CLOCK_CHANGED/);
 assert.equal(f.counts.issued,before+1);assert.equal(f.counts.dispatches,0);
});
test('commit rollover never repeats commit or transaction authority',async t=>{
 const f=await bridgeFixture(t),r=await f.prepare();f.makeEnvelope(r.binding);await f.bridge.lookup(f.g,f.h,r.binding);await f.bridge.adopt(f.g,f.h,r.binding);
 const before=f.counts.issued;f.setIssueHook(()=>f.setTime(f.time+1));assert.throws(()=>f.invoke('commit',r.binding,'COMMIT'),/BC_E5_CLOCK_CHANGED/);
 assert.equal(f.counts.issued,before+1);assert.equal(f.counts.dispatches,0);
});
for(const change of ['expiry','service-revoked','untyped-error'])test('recovery recheck rejects '+change+' without issuing again or sending',async t=>{
 const f=await bridgeFixture(t),r=await f.prepare(),before=f.counts.issued;
 f.setIssueHook(()=>{if(change==='untyped-error')throw Error('BC_E5_CLOCK_CHANGED');
  f.setTime(change==='expiry'?r.binding.expiresAt:f.time+1);if(change==='service-revoked')f.revoke();});
 assert.throws(()=>f.invoke('current',r.binding,'RECOVER'),change==='expiry'?/FENCED|BINDING_AUTHORITY/:change==='service-revoked'?/SERVICE_FORBIDDEN/:/BC_E5_CLOCK_CHANGED/);
 assert.equal(f.counts.issued,before+1);assert.equal(f.counts.dispatches,0);assert.equal(f.counts.seals,0);
});
test('two recovery clock conflicts propagate after one recheck and a single issuer call',()=>{
 const H='0x'+'11'.repeat(32),binding={version:'clear-e5-execution-capability.2',purpose:'EXECUTE',runtimeHash:H,e3Commitment:H,commandHash:H},
  payload={version:'clear-e5-current-witness.2',challenge:'12345678-1234-4123-8123-123456789abc',phase:'RECOVER',bindingHash:H,observationHash:H,runtimeHash:H};
 // Real payload hashes, with a deterministic API transaction rollback port.
 let runs=0,issues=0;
  payload.bindingHash=e4Hash(binding);payload.observationHash=e4Hash({recovery:true});
  const e={binding,command:{},observation:{recovery:true},proof:{kind:'AUTHORITY_ONLY_NO_CHAIN_ASSERTION'},phase:'RECOVER',payload,reference:null};
  const factory=bridgeControllerFactory({ports:{runtime:{runtimeHash:H}},run:(b,fn)=>{runs++;fn({},100,{});throw new RuleError('BC_E5_CLOCK_CHANGED');},inspect:()=>({originalAuthorityUntil:200})});
  const controller=factory({consume:()=>e,issue(){issues++;return {payload};}});
  assert.throws(()=>controller.readCurrentSync({ticket:{}}),/BC_E5_CLOCK_CHANGED/);assert.equal(runs,2);assert.equal(issues,1);
  assert.equal(sourceDiagnosticCode(Error('E5B_CONTROLLER_REJECTED')),'E5B_CONTROLLER_REJECTED');
});
