import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {copyFileSync,mkdirSync} from 'node:fs';
import {createBootcampStore} from '../../src/bootcamp/store.mjs';
import {createFenceWitness} from '../../src/bootcamp/execution-authority.mjs';
import {e4Hash} from '../../src/bootcamp/execution-e4-ports.mjs';
import {authorityFixture,authorityDump,corruptOwnedFixture,fixed97Factory,authorityTables} from './authority-fixture.mjs';
import {executionFixture,database,dump,H} from './fixture.mjs';
import {currentFixture} from './current-fixture.mjs';

test('global authority defaults do not configure a sender or consume any existing intent lease',async t=>{
 const f=await authorityFixture(t),before=dump(f),g=f.acquireRuntime();
 assert.equal(g.workerFence,1);assert.deepEqual(dump(f),before);assert.equal(f.store.execution.status().broadcastImplemented,false);
 await assert.rejects(f.store.execution.observeRuntimeFence(f.context,g),/BC_E5_FENCE_WITNESS_UNCONFIGURED/);
 assert.equal(f.metrics.reads,0);assert.equal(f.metrics.signatures,0);
});
test('one active global owner per runtime, including another incarnation with the same service identity',async t=>{
 const f=await authorityFixture(t),g=f.acquireRuntime(),second=f.open();t.after(()=>second.close());
 assert.throws(()=>f.acquireRuntime({expectedFence:1}),/BC_E5_GLOBAL_LEASE_BUSY/);
 assert.throws(()=>f.acquireRuntime({owner:'worker-two',expectedFence:1},f.other),/BC_E5_GLOBAL_LEASE_BUSY/);
 assert.throws(()=>second.execution.acquireRuntime(f.context,{owner:'worker-one',expectedFence:1,generation:1,leaseSeconds:30}),/BC_E5_GLOBAL_LEASE_BUSY/);
 assert.throws(()=>second.execution.heartbeatRuntime(f.context,g),/BC_E5_GLOBAL_FENCED/);
 assert.deepEqual(f.store.execution.heartbeatRuntime(f.context,g),g);
});
test('global expiry takeover increments its journal; former process and forged incarnation cannot heartbeat',async t=>{
 const f=await authorityFixture(t),g=f.acquireRuntime(),second=f.open();t.after(()=>second.close());f.setTime(f.time+30);
 const next=second.execution.acquireRuntime(f.context,{owner:'worker-one',expectedFence:1,generation:1,leaseSeconds:30});
 assert.equal(next.workerFence,2);assert.notEqual(next.incarnation,g.incarnation);assert.notEqual(next.leaseId,g.leaseId);
 assert.throws(()=>f.store.execution.heartbeatRuntime(f.context,g),/BC_E5_GLOBAL_FENCED/);
 assert.throws(()=>f.store.execution.heartbeatRuntime(f.context,{...next,incarnation:g.incarnation}),/BC_E5_GLOBAL_FENCED/);
 assert.equal(authorityDump(f).e5_worker_fences.length,2);
});
test('global heartbeat has no business CAS/sequence effect and cannot extend an already issued capability',async t=>{
 const f=await currentFixture(t),first=await f.prepare(),before=f.connection.worker.inspect(f.h),state=dump(f),globalBefore=authorityDump(f);
 f.setTime(f.time+1);assert.deepEqual(f.store.execution.heartbeatRuntime(f.context,f.runtimeHandle,60),f.runtimeHandle);
 f.store.execution.heartbeat(f.context,f.h,60);const after=f.connection.worker.inspect(f.h);
 assert.deepEqual({...after,authorityExpiresAt:before.authorityExpiresAt},before);assert.deepEqual(dump(f),state);
 const globalAfter=authorityDump(f);assert.deepEqual(globalAfter.e5_worker_fences,globalBefore.e5_worker_fences);assert.deepEqual(globalAfter.e5_worker_slots,globalBefore.e5_worker_slots);
 assert.deepEqual((await f.prepare()).binding,first.binding);f.setTime(first.binding.expiresAt);
 assert.throws(()=>f.connection.controller.readCurrentSync(f.currentRequest(first.binding)),/BC_E5_E4_CAPABILITY_EXPIRED/);
});
test('E4 wire fence is global while local fence and both lease identities remain in E3 commitment',async t=>{
 const f=await currentFixture(t);f.store.execution.releaseRuntimeIntent(f.context,f.runtimeHandle,f.h);f.setTime(f.time+30);
 const h=f.acquire(f.i,{expectedFence:1}),g=f.store.execution.acquireRuntime(f.context,{owner:'worker-one',expectedFence:1,generation:1,leaseSeconds:30});
 // Let only the local lease expire again while global ownership is renewed.
 f.setTime(f.time+1);f.store.execution.heartbeatRuntime(f.context,g,60);f.setTime(f.time+29);
 const h3=f.acquire(f.i,{expectedFence:h.workerFence});assert.equal(h3.workerFence,3);assert.equal(g.workerFence,2);
 f.store.execution.bindRuntimeIntent(f.context,g,h3);const connection=f.store.execution.connectCurrentController(f.context,g),cas=connection.worker.inspect(h3);
 const result=await connection.worker.prepare(h3,cas);assert.equal(result.binding.workerFence,'2');assert.equal(result.binding.leaseId,g.leaseId);
 const saved=JSON.parse(dump(f).e5_events.find(r=>r.kind==='E4_CURRENT_BINDING').record);
 assert.equal(saved.basis.workerFence,3);assert.equal(saved.basis.runtimeAuthority.workerFence,2);
 assert.equal(saved.basis.runtimeAuthority.incarnation,g.incarnation);assert.equal(result.binding.e3Commitment,e4Hash(saved.basis));
});
test('different intents serialize through one global slot without inflating the global fence',async t=>{
 const f=await authorityFixture(t),g=f.acquireRuntime();f.store.execution.bindRuntimeIntent(f.context,g,f.h);
 const i2=f.enqueue({operationId:H('second-operation')}).receipt.intentId;
 // Old per-application lease still excludes the other local intent until expiry.
 f.setTime(f.time+30);const g2=f.acquireRuntime({expectedFence:1}),h=f.acquire(f.i,{expectedFence:1});
 f.store.execution.bindRuntimeIntent(f.context,g2,h);
 f.store.execution.releaseRuntimeIntent(f.context,g2,h);
 // A local lease remains separate; expiry is needed before another intent of the same app.
 f.setTime(f.time+1);f.store.execution.heartbeatRuntime(f.context,g2,60);f.setTime(f.time+29);
 const h2=f.acquire(i2);f.store.execution.bindRuntimeIntent(f.context,g2,h2);
 const state=authorityDump(f);assert.equal(state.e5_runtime_workers[0].fence,2);assert.equal(state.e5_runtime_workers[0].intent_id,i2);
 assert.equal(state.e5_worker_fences.length,2);assert.equal(state.e5_worker_slots.length,4);
});
test('same global worker cannot bind a second intent while another slot is active',async t=>{
 const f=await authorityFixture(t),g=f.acquireRuntime();f.store.execution.bindRuntimeIntent(f.context,g,f.h);
 const i2=f.enqueue({operationId:H('second-operation')}).receipt.intentId;f.setTime(f.time+30);
 const g2=f.acquireRuntime({expectedFence:1}),h2=f.acquire(i2);
 assert.throws(()=>f.store.execution.bindRuntimeIntent(f.context,g2,h2),/BC_E5_GLOBAL_INTENT_BUSY/);
 assert.equal(authorityDump(f).e5_runtime_workers[0].intent_id,f.i);
});
test('releasing and rebinding an unsigned intent invalidates its previous current capability',async t=>{
 const f=await currentFixture(t),first=await f.prepare();f.store.execution.releaseRuntimeIntent(f.context,f.runtimeHandle,f.h);
 assert.throws(()=>f.connection.controller.readCurrentSync(f.currentRequest(first.binding)),/BC_E5_GLOBAL_INTENT_FENCED/);
 f.store.execution.bindRuntimeIntent(f.context,f.runtimeHandle,f.h);
 assert.throws(()=>f.connection.controller.readCurrentSync(f.currentRequest(first.binding)),/BC_E5_CURRENT_CHANGED/);
 assert.equal(f.metrics.certificates,0);
});
test('seal/UNKNOWN barrier keeps its slot after expiry takeover; it cannot be cleared to run another intent',async t=>{
 const f=await currentFixture(t);await f.prepare();f.sealHook(async()=>{throw Error('LOST');});await assert.rejects(f.connection.worker.seal(f.h),/LOST/);
 assert.throws(()=>f.store.execution.releaseRuntimeIntent(f.context,f.runtimeHandle,f.h),/BC_E5_GLOBAL_INTENT_UNRESOLVED/);
 const before=dump(f);f.reconnect();assert.throws(()=>f.store.execution.releaseRuntimeIntent(f.context,f.runtimeHandle,f.h),/BC_E5_GLOBAL_INTENT_UNRESOLVED/);
 await assert.rejects(f.connection.worker.seal(f.h),/BC_E5_E4_SEAL_RECOVERY_REQUIRED/);assert.deepEqual(dump(f),before);
});
test('global expiry alone blocks late reader even if the local lease was extended',async t=>{
 const f=await currentFixture(t);f.store.execution.heartbeat(f.context,f.h,60);
 f.readHook(async()=>{f.setTime(f.time+30);});await assert.rejects(f.prepare(),/BC_E5_GLOBAL_FENCED/);
 assert.equal(dump(f).e5_events.filter(r=>r.kind==='E4_CURRENT_BINDING').length,0);
});
test('runtime alias cannot obtain a second global lease for the same pin',async t=>{
 const f=await authorityFixture(t);f.acquireRuntime();f.configuration.executionServices={...f.ports,runtimeId:'runtime-alias'};f.restart();
 f.enqueue();assert.throws(()=>f.acquireRuntime(),/BC_E5_GLOBAL_SCOPE_CONFLICT/);assert.equal(authorityDump(f).e5_runtime_workers.length,1);
});
for(const field of ['fence','lease_id','slot_revision'])test(`durable ${field} regression/corruption stops before current authority and survives restart`,async t=>{
 const f=await authorityFixture(t),g=f.acquireRuntime();f.store.execution.bindRuntimeIntent(f.context,g,f.h);
 corruptOwnedFixture(f,db=>{if(field==='fence')db.prepare('UPDATE e5_runtime_workers SET fence=2').run();
  else if(field==='lease_id')db.prepare("UPDATE e5_runtime_workers SET lease_id='forged-lease'").run();else db.prepare('UPDATE e5_runtime_workers SET slot_revision=0').run();});
 assert.throws(()=>f.store.execution.heartbeatRuntime(f.context,g),/BC_E5_GLOBAL_STOPPED/);
 assert.equal(authorityDump(f).e5_worker_stops.length,1);f.restart();assert.throws(()=>f.acquireRuntime({expectedFence:2}),/BC_E5_GLOBAL_STOPPED/);
 assert.equal(database(f,db=>db.prepare('SELECT status FROM e5_runtimes').get().status),'RECOVERY_BLOCKED');
});
test('a lowered counter below an immutable higher journal entry is halted, never increased to match',async t=>{
 const f=await authorityFixture(t);f.acquireRuntime();f.setTime(f.time+30);const g=f.acquireRuntime({expectedFence:1});
 corruptOwnedFixture(f,db=>db.prepare('UPDATE e5_runtime_workers SET fence=1').run());
 assert.throws(()=>f.store.execution.heartbeatRuntime(f.context,g),/BC_E5_GLOBAL_STOPPED/);assert.equal(authorityDump(f).e5_runtime_workers[0].fence,1);
 assert.equal(authorityDump(f).e5_worker_fences.length,2);
});
test('cleared active slot without a release record is detected rather than freeing UNKNOWN work',async t=>{
 const f=await authorityFixture(t),g=f.acquireRuntime();f.store.execution.bindRuntimeIntent(f.context,g,f.h);
 corruptOwnedFixture(f,db=>db.exec('UPDATE e5_runtime_workers SET slot_id=NULL,intent_id=NULL,local_fence=NULL,local_revision=NULL'));
 assert.throws(()=>f.store.execution.heartbeatRuntime(f.context,g),/BC_E5_GLOBAL_STOPPED/);
});
test('constructor-captured external fence ticket halts a fully consistent but older API counter',async t=>{
 const f=await authorityFixture(t);let witness=0;
 f.configuration.executionFenceWitness={version:'clear-bootcamp-runtime-fence-reader.1',async read(q){database(f,db=>{db.exec('BEGIN IMMEDIATE');db.exec('ROLLBACK');});return {version:'clear-bootcamp-runtime-fence-witness.1',...q,highestFence:witness};}};
 f.restart();await f.store.execution.observeRuntimeFence(f.context);const g=f.acquireRuntime();witness=2;f.configuration.executionFenceWitness.read=()=>{throw Error('REPLACED_READER');};
 const result=await f.store.execution.observeRuntimeFence(f.context,g);assert.equal(result.reason,'API_FENCE_BEHIND_E4');
 assert.equal(authorityDump(f).e5_runtime_workers[0].fence,1);assert.equal(authorityDump(f).e5_worker_stops.length,1);
 witness=1;f.restart();assert.throws(()=>f.acquireRuntime({expectedFence:1}),/BC_E5_GLOBAL_STOPPED/);
});
test('external witness regression, forged ticket and mismatched runtime are rejected',async t=>{
 const port=createFenceWitness({version:'clear-bootcamp-runtime-fence-reader.1',read:async q=>({version:'clear-bootcamp-runtime-fence-witness.1',...q,runtimePinHash:H('other'),highestFence:1})});
 assert.throws(()=>port.consume({highestFence:100}),/BC_E5_UNTRUSTED_FENCE_WITNESS/);
 await assert.rejects(port.read({runtimeId:'runtime',runtimePinHash:H('pin'),scopeKey:H('scope')}),/BC_E5_FENCE_WITNESS/);
 const f=await authorityFixture(t);let fence=0;f.configuration.executionFenceWitness={version:'clear-bootcamp-runtime-fence-reader.1',read:async q=>({version:'clear-bootcamp-runtime-fence-witness.1',...q,highestFence:fence})};
 f.restart();await f.store.execution.observeRuntimeFence(f.context);const g=f.acquireRuntime();fence=1;assert.equal((await f.store.execution.observeRuntimeFence(f.context,g)).status,'OBSERVED');fence=0;
 assert.equal((await f.store.execution.observeRuntimeFence(f.context,g)).reason,'E4_FENCE_WITNESS_REGRESSION');
});
test('lease expiry while external fence read awaits cannot commit a late witness',async t=>{
 const f=await authorityFixture(t);let late=false;f.configuration.executionFenceWitness={version:'clear-bootcamp-runtime-fence-reader.1',async read(q){if(late)f.setTime(f.time+30);return {version:'clear-bootcamp-runtime-fence-witness.1',...q,highestFence:late?2:0};}};
 f.restart();await f.store.execution.observeRuntimeFence(f.context);const g=f.acquireRuntime();late=true;await assert.rejects(f.store.execution.observeRuntimeFence(f.context,g),/BC_E5_GLOBAL_FENCED/);assert.equal(authorityDump(f).e5_worker_witnesses.length,1);
});
test('restored synthetic DB requires external comparison before increment, so old counter cannot align itself by acquiring',async t=>{
 const f=await authorityFixture(t);f.acquireRuntime();const restored=join(f.directory,'restored-owned-synthetic-db');mkdirSync(restored,{mode:0o700});
 copyFileSync(join(f.directory,'bootcamp.sqlite'),join(restored,'bootcamp.sqlite'));
 f.setTime(f.time+30);assert.equal(f.acquireRuntime({expectedFence:1}).workerFence,2);
 const store=createBootcampStore({...f.configuration,directory:restored,executionFenceWitness:{version:'clear-bootcamp-runtime-fence-reader.1',
  read:async q=>({version:'clear-bootcamp-runtime-fence-witness.1',...q,highestFence:2})}});t.after(()=>store.close());
 assert.throws(()=>store.execution.acquireRuntime(f.context,{owner:'worker-one',expectedFence:1,generation:1,leaseSeconds:30}),/BC_E5_GLOBAL_FENCE_PREFLIGHT_REQUIRED/);
 const checked=await store.execution.observeRuntimeFence(f.context);assert.equal(checked.reason,'API_FENCE_BEHIND_E4');
 const state=authorityDump({directory:restored});assert.equal(state.e5_runtime_workers[0].fence,1);assert.equal(state.e5_worker_fences.length,1);assert.equal(state.e5_worker_stops.length,1);
});
test('pre-acquire external comparison cannot be reused by another incarnation or after its short receipt window',async t=>{
 const f=await authorityFixture(t);f.configuration.executionFenceWitness={version:'clear-bootcamp-runtime-fence-reader.1',read:async q=>({version:'clear-bootcamp-runtime-fence-witness.1',...q,highestFence:0})};
 f.restart();await f.store.execution.observeRuntimeFence(f.context);const another=f.open();t.after(()=>another.close());
 assert.throws(()=>another.execution.acquireRuntime(f.context,{owner:'worker-one',expectedFence:0,generation:1,leaseSeconds:30}),/BC_E5_GLOBAL_FENCE_PREFLIGHT_REQUIRED/);
 f.setTime(f.time+6);assert.throws(()=>f.acquireRuntime(),/BC_E5_GLOBAL_FENCE_PREFLIGHT_REQUIRED/);
 await f.store.execution.observeRuntimeFence(f.context);assert.equal(f.acquireRuntime().workerFence,1);
});
test('backward wall time never resurrects a global lease',async t=>{
 const f=await authorityFixture(t),g=f.acquireRuntime();f.setTime(f.time+5);f.store.execution.heartbeatRuntime(f.context,g);f.setTime(f.time-1);
 assert.throws(()=>f.store.execution.heartbeatRuntime(f.context,g),/BC_CLOCK_REVERSED|BC_E5_CLOCK_REVERSED/);
});
for(const stage of ['e5-global-after-fence','e5-global-after-lease','e5-global-after-slot','e5-global-after-release'])test(`${stage}: atomic rollback preserves fence/slot history`,async t=>{
 const f=await authorityFixture(t);let g;
 if(stage.endsWith('slot')||stage.endsWith('release'))g=f.acquireRuntime();
 if(stage.endsWith('release'))f.store.execution.bindRuntimeIntent(f.context,g,f.h);
 // A second open connection is a new incarnation: inject the fault before the
 // first global acquire in that connection, not by reusing the old handle.
 let armed=false;f.configuration.fault=s=>{if(armed&&s===stage)throw Error('GLOBAL_ROLLBACK');};
 if(g){f.setTime(f.time+30);f.restart();g=f.acquireRuntime({expectedFence:1});const local=f.acquire(f.i,{expectedFence:1});f.h=local;if(stage.endsWith('release'))f.store.execution.bindRuntimeIntent(f.context,g,local);}
 else f.restart();
 const before=authorityDump(f);armed=true;
 assert.throws(()=>stage.endsWith('slot')?f.store.execution.bindRuntimeIntent(f.context,g,f.h):stage.endsWith('release')?f.store.execution.releaseRuntimeIntent(f.context,g,f.h):f.acquireRuntime(),/GLOBAL_ROLLBACK/);
 assert.deepEqual(authorityDump(f),before);
});
for(const stage of ['e5-global-after-schema','e5-global-after-guards'])test(`97f migration ${stage}: existing metadata/unknown bytes preserved and old writer fenced after success`,async t=>{
 const f=await executionFixture(t),factory=await fixed97Factory(f.directory),directory=join(f.directory,'before-global'),config={...f.configuration,directory};
 let old=factory(config);old.createApplication(f.aliceContext,{},'old-create');old.close();
 const target={directory},oldTables=database(target,db=>db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name));
 // Public synthetic historical markers, including a request with unknown outcome.
 database(target,db=>{db.exec('UPDATE e5_meta SET writer=1');
  db.prepare("INSERT INTO e5_runtimes VALUES('e5-offline-runtime',?,1,1,'ACTIVE','{}')").run(f.ports.runtimePinHash);
  for(const [n,kind]of ['E4_CURRENT_BINDING','E4_SEAL_REQUESTED'].entries())db.prepare('INSERT INTO e5_events VALUES(?,NULL,?,?,?,?,?)').run('historical-'+n,'e5-offline-runtime',kind,'historical-key-'+n,JSON.stringify({kind,binding:{workerFence:'7'},unknown:true}),n+1);
  db.exec('UPDATE e5_meta SET sequence=2,writer=0');});
 const before=dump(target,oldTables);
 assert.throws(()=>createBootcampStore({...config,fault:s=>{if(s===stage)throw Error('MIGRATION_GLOBAL_ROLLBACK');}}),/MIGRATION_GLOBAL_ROLLBACK/);
 assert.deepEqual(dump(target,oldTables),before);database(target,db=>{for(const table of authorityTables)assert.equal(db.prepare('SELECT 1 FROM sqlite_schema WHERE name=?').get(table),undefined);});
 old=factory(config);assert.ok(old.getApplication(f.aliceContext,JSON.parse(before.applications[0].record??'null')?.id??before.applications[0].id));old.close();
 const upgraded=createBootcampStore(config);upgraded.close();assert.deepEqual(dump(target,oldTables),before);
 old=factory(config);assert.throws(()=>old.getApplication(f.aliceContext,before.applications[0].id),/BC_E5_GLOBAL_WRITER_REQUIRED/);old.close();
 assert.equal(authorityDump(target).e5_worker_fences.length,0);assert.equal(authorityDump(target).e5_runtime_workers.length,0);
});
test('new tables are append-only and missing transaction-entry guard fails reopen',async t=>{
 const f=await authorityFixture(t),g=f.acquireRuntime();f.store.execution.bindRuntimeIntent(f.context,g,f.h);
 database(f,db=>{for(const table of ['e5_worker_fences','e5_worker_slots'])assert.throws(()=>db.exec(`UPDATE ${table} SET record=record`),/APPEND_ONLY/);
  assert.throws(()=>db.exec('UPDATE e5_meta SET writer=1'),/BC_E5_GLOBAL_WRITER_REQUIRED/);
  db.exec('DROP TRIGGER e5_global_transaction_entry');});
 assert.throws(()=>f.open(),/BC_E5_GLOBAL_SCHEMA/);
});
