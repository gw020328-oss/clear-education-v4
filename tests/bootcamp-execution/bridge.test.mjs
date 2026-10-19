import test from 'node:test';
import assert from 'node:assert/strict';
import {bridgeFixture} from './bridge-fixture.mjs';
import {createE4BridgePorts} from '../../src/bootcamp/execution-e4b-ports.mjs';
import {createBootcampStore} from '../../src/bootcamp/store.mjs';
import {currentFixture} from './current-fixture.mjs';
import {database,H,dump} from './fixture.mjs';
import {e4Hash} from '../../src/bootcamp/execution-e4-ports.mjs';

test('explicit B scope, mandatory floor and one-time private callback issue a .2 capability without sender activation',async t=>{
 const f=await bridgeFixture(t),r=await f.prepare();assert.equal(r.binding.version,'clear-e5-execution-capability.2');assert.equal(r.binding.workerFence,String(f.g.workerFence));
 assert.equal(f.g.scopeKey,f.projection.authorityScope.scopeKey);assert.equal(f.counts.binds,1);assert.equal(f.counts.issued,1);
 assert.deepEqual(f.counts,{reads:1,consumed:1,issued:1,binds:1,seals:0,dispatches:0});
 await assert.rejects(f.bridge.seal(f.g,f.h,r.binding),/BC_E5B_FINAL_PACKET_ACTIVATION_PENDING/);assert.equal(f.counts.seals,0);
 assert.equal(database(f,db=>db.prepare("SELECT COUNT(*) n FROM e5b_events WHERE kind='SEAL_REQUESTED'").get().n),0);
});
test('constructor refuses old or body-echoed scope and old current configuration remains distinct',async t=>{
 const f=await bridgeFixture(t,{configure:false});
 assert.throws(()=>createE4BridgePorts({...f.config,runtime:{...f.projection,authorityScope:{...f.projection.authorityScope,scopeKey:H('wrong')}}}),/BC_E5B_SCOPE/);
 const old=await currentFixture(t);old.storeConfiguration.executionConnection=null;old.storeConfiguration.executionServices.runtimePinHash=f.projection.runtimeHash;old.storeConfiguration.executionBridge=f.config;
 assert.throws(()=>createBootcampStore(old.storeConfiguration),/BC_E5B_LEGACY_RUNTIME_REFUSED/);
});
test('a source change while the outside reader awaits prevents capability and binding commit',async t=>{
 const f=await bridgeFixture(t);f.setReadHook(async()=>f.setTime(f.time+31));await assert.rejects(f.prepare(),/BC_E5_(GLOBAL_)?FENCED/);
 assert.equal(f.counts.issued,0);assert.equal(database(f,db=>db.prepare('SELECT COUNT(*) n FROM e5b_bindings').get().n),0);
});
test('owner issuer callback cannot revoke the service after checks and return a usable certificate',async t=>{
 const f=await bridgeFixture(t);f.setIssueHook(()=>f.revoke());await assert.rejects(f.prepare(),/SERVICE_FORBIDDEN/);
 assert.equal(database(f,db=>db.prepare("SELECT COUNT(*) n FROM e5b_events WHERE kind='CAPABILITY'").get().n),0);
});
test('registered proof is exact and authority-only cannot stand in for execution current',async t=>{
 const f=await bridgeFixture(t),r=await f.prepare();const before=f.counts.issued;
 assert.throws(()=>f.invoke('current',r.binding,'BEFORE_SIGN',{proof:{kind:'AUTHORITY_ONLY_NO_CHAIN_ASSERTION'}}),/BC_E5B_READER_PROOF/);
 assert.equal(f.counts.issued,before);
});
test('heartbeat does not extend the issued business or current capability expiry',async t=>{
 const f=await bridgeFixture(t),r=await f.prepare();f.setTime(f.time+1);f.store.execution.heartbeatRuntime(f.context,f.g,60);f.store.execution.heartbeat(f.context,f.h,60);
 assert.ok(f.invoke('current',r.binding,'BEFORE_SIGN'));f.setTime(r.binding.expiresAt);
 assert.throws(()=>f.invoke('current',r.binding,'BEFORE_SIGN'),/BC_E5B_BINDING_AUTHORITY/);
});
test('private lookup/adoption commit binds the exact saved reference and does not clear the request',async t=>{
 const f=await bridgeFixture(t),r=await f.prepare();f.makeEnvelope(r.binding);
 await f.bridge.lookup(f.g,f.h,r.binding);assert.throws(()=>f.invoke('commit',r.binding,'COMMIT'),/BC_E5B_ADOPTION_NOT_COMMITTED/);
 const adoption=await f.bridge.adopt(f.g,f.h,r.binding);assert.equal(adoption.bindingHash,e4Hash(r.binding));
 const cert=f.invoke('commit',r.binding,'COMMIT');assert.equal(cert.payload.adoptionHash,adoption.adoptionHash);
 const before=dump(f);await assert.rejects(f.bridge.dispatch(f.g,f.h,r.binding),/BC_E5B_FINAL_PACKET_ACTIVATION_PENDING/);assert.deepEqual(dump(f),before);
});
test('envelope lookup cannot persist provider private fields or a wrong original request',async t=>{
 const f=await bridgeFixture(t),r=await f.prepare();f.makeEnvelope(r.binding,{raw:'PRIVATE_SENTINEL'});
 await assert.rejects(f.bridge.lookup(f.g,f.h,r.binding),/BC_E5B_ENVELOPE/);
 assert.equal(database(f,db=>db.prepare('SELECT COUNT(*) n FROM e5b_events WHERE kind=\'REFERENCE\'').get().n),0);
});
test('missing registered direct claim reader is an explicit refusal',async t=>{
 const f=await bridgeFixture(t,{configure:false}),ports=createE4BridgePorts(f.config);
 await assert.rejects(ports.directClaimReceipt({applicationId:H('app'),txHash:H('tx')}),/BC_E5B_DIRECT_CLAIM_READER_UNCONFIGURED/);
});

test('current and commit use UUID v4 challenges, including a leading digit, without relaxing logical IDs',async t=>{
 const f=await bridgeFixture(t),r=await f.prepare();
 assert.equal(f.invoke('current',r.binding,'BEFORE_SIGN').payload.challenge,'12345678-1234-4123-8123-123456789abc');
 f.makeEnvelope(r.binding);await f.bridge.lookup(f.g,f.h,r.binding);await f.bridge.adopt(f.g,f.h,r.binding);
 assert.equal(f.invoke('commit',r.binding,'COMMIT').payload.challenge,'12345678-1234-4123-8123-123456789abc');
 const invalid=await bridgeFixture(t,{challenge:'logical-id-not-a-uuid'}),b=await invalid.prepare();
 assert.throws(()=>invalid.invoke('current',b.binding,'BEFORE_SIGN'),/BC_E5B_CHALLENGE/);
 invalid.makeEnvelope(b.binding);
 assert.throws(()=>invalid.invoke('commit',b.binding,'COMMIT'),/BC_E5B_CHALLENGE/);
});
