import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {createBootcampStore} from '../../src/bootcamp/store.mjs';
import {authorityFixture,authorityDump,fixed97Factory} from './authority-fixture.mjs';
import {dump,database} from './fixture.mjs';

async function start(t){const child=fork(new URL('./worker.mjs',import.meta.url),[],{stdio:['ignore','ignore','ignore','ipc']});
 t.after(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');});
 assert.deepEqual((await once(child,'message'))[0],{ready:true});return child;
}
const message=(f,extra)=>({directory:f.directory,authentication:f.config,time:f.time,bindings:f.configuration.operatorBindings,owner:'worker-one',...extra});
async function kill(t,f,extra){const child=await start(t),exited=once(child,'exit');child.send(message(f,extra));assert.deepEqual(await exited,[null,'SIGKILL']);}
for(const stage of ['e5-global-after-fence','e5-global-after-lease'])test(`SIGKILL ${stage}: no half global lease or consumed fence`,{timeout:15000},async t=>{
 const f=await authorityFixture(t),before=authorityDump(f),metadata=dump(f);
 await kill(t,f,{action:'global-acquire',crashStage:stage});f.restart();assert.deepEqual(authorityDump(f),before);assert.deepEqual(dump(f),metadata);
 assert.equal(f.acquireRuntime().workerFence,1);
});
for(const [stage,action]of [['e5-global-after-slot','global-bind'],['e5-global-after-release','global-release']])test(`SIGKILL ${stage}: only committed slot history survives`,{timeout:15000},async t=>{
 const f=await authorityFixture(t);await kill(t,f,{action,handle:f.h,crashStage:stage});f.restart();
 const state=authorityDump(f);assert.equal(state.e5_worker_fences.length,1);
 assert.equal(state.e5_worker_slots.length,action==='global-bind'?0:1);assert.equal(state.e5_runtime_workers[0].intent_id,action==='global-bind'?null:f.i);
 assert.throws(()=>f.acquireRuntime({expectedFence:1}),/BC_E5_GLOBAL_LEASE_BUSY/);
 f.setTime(f.time+30);const g=f.acquireRuntime({expectedFence:1}),h=f.acquire(f.i,{expectedFence:1});
 assert.equal(g.workerFence,2);f.store.execution.bindRuntimeIntent(f.context,g,h);
});
test('SIGKILL after committed global acquire never lets restarted process reuse that fence', {timeout:15000},async t=>{
 const f=await authorityFixture(t);await kill(t,f,{action:'global-acquire',killAfterGlobalCommit:true});f.restart();
 const state=authorityDump(f);assert.equal(state.e5_worker_fences.length,1);assert.equal(state.e5_runtime_workers[0].fence,1);
 assert.throws(()=>f.acquireRuntime({expectedFence:1}),/BC_E5_GLOBAL_LEASE_BUSY/);f.setTime(f.time+30);
 assert.equal(f.acquireRuntime({expectedFence:1}).workerFence,2);assert.equal(authorityDump(f).e5_worker_fences.length,2);
});
test('two independent processes with the same service identity contend for one global fence: one win, one busy', {timeout:15000},async t=>{
 const f=await authorityFixture(t),children=await Promise.all([start(t),start(t)]);
 const outcomes=await Promise.all(children.map(async child=>{const response=once(child,'message'),exited=once(child,'exit');
  child.send(message(f,{action:'global-acquire'}));const r=(await response)[0];assert.deepEqual(await exited,[0,null]);return r;}));
 assert.equal(outcomes.filter(r=>r.finished).length,1);assert.equal(outcomes.filter(r=>r.error==='BC_E5_GLOBAL_LEASE_BUSY').length,1);
 const winner=outcomes.find(r=>r.finished).result;assert.equal(winner.workerFence,1);assert.equal(authorityDump(f).e5_worker_fences.length,1);
 assert.throws(()=>f.store.execution.heartbeatRuntime(f.context,winner),/BC_E5_GLOBAL_FENCED/);
 f.setTime(f.time+30);assert.equal(f.acquireRuntime({expectedFence:1}).workerFence,2);
});
for(const stage of ['e5-global-after-schema','e5-global-after-guards'])test(`SIGKILL migration ${stage}: old 97f bytes survive and retry installs global guards`,{timeout:15000},async t=>{
 const f=await authorityFixture(t),factory=await fixed97Factory(f.directory),directory=join(f.directory,'old-global-crash'),config={...f.configuration,directory};
 const old=factory(config);old.createApplication(f.aliceContext,{},'old-application');old.close();
 const target={directory},names=database(target,db=>db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r=>r.name)),before=dump(target,names);
 await kill(t,f,{directory,action:'global-acquire',crashStage:stage});assert.deepEqual(dump(target,names),before);
 assert.equal(database(target,db=>db.prepare("SELECT 1 FROM sqlite_schema WHERE name='e5_worker_meta'").get()),undefined);
 const reopened=createBootcampStore(config);reopened.close();assert.deepEqual(dump(target,names),before);
 assert.equal(database(target,db=>db.prepare('SELECT version FROM e5_worker_meta').get().version),1);
});
