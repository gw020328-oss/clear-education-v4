import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {createBootcampStore} from '../../src/bootcamp/store.mjs';
import {fixedE3Factory} from './legacy-factory.mjs';
import {executionFixture,database,dump} from './fixture.mjs';
const oldTables=['applications','requests','evidence','evidence_heads','retired_guards','decisions','events','commands',
 'r2_decisions','r2_metrics','r2_attempts','r2_bridges','r2_actions','e3_procedures','e3_publications','e3_records','e3_ids','e3_prepared'];
async function crash(t,f,message){
 const child=fork(new URL('./worker.mjs',import.meta.url),[],{stdio:['ignore','ignore','ignore','ipc']});
 t.after(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');});
 assert.deepEqual((await once(child,'message'))[0],{ready:true});const exited=once(child,'exit');
 child.send({directory:f.directory,authentication:f.config,time:f.time,bindings:f.configuration.operatorBindings,...message});
 assert.deepEqual(await exited,[null,'SIGKILL']);
}
for(const stage of ['e5-after-schema','e5-after-guards'])test(`migration ${stage}: atomic rollback, legacy bytes preserved, old E3 writer rejected after success`,async t=>{
 const f=await executionFixture(t),oldFactory=await fixedE3Factory(f.directory),directory=join(f.directory,'old-e3-database');
 const config={...f.configuration,directory,executionServices:undefined,procedurePorts:null};const old=oldFactory(config);
 const a=old.createApplication(f.aliceContext,{},'old-create').record.applicationId;
 const req=old.issueRequest(f.aliceContext,a,{criterionId:'activity-complete',expectedRevision:1},'old-request');
 await old.collect(f.aliceContext,a,{requestId:req.record.target.requestId,expectedRevision:req.record.applicationRevision},'old-collect');old.close();
 const target={directory},before=dump(target,oldTables);
 assert.throws(()=>createBootcampStore({...config,fault:s=>{if(s===stage)throw Error('MIGRATION_FAULT');}}),/MIGRATION_FAULT/);
 assert.deepEqual(dump(target,oldTables),before);
 database(target,db=>assert.equal(db.prepare("SELECT count(*) n FROM sqlite_schema WHERE name LIKE 'e5_%'").get().n,0));
 const retry=oldFactory(config);retry.createApplication(f.aliceContext,{},'still-old-writable');retry.close();const beforeUpgrade=dump(target,oldTables);
 const upgraded=createBootcampStore(config);upgraded.close();assert.deepEqual(dump(target,oldTables),beforeUpgrade);
 const stale=oldFactory(config),view=stale.getApplication(f.aliceContext,a);assert.ok(view);assert.throws(()=>stale.createApplication(f.aliceContext,{},'old-writer'),/BC_E5_WRITER_REQUIRED/);
 assert.throws(()=>stale.cancel(f.aliceContext,a,{expectedRevision:view.revision},'old-update'),/BC_E5_WRITER_REQUIRED/);stale.close();
 const reopened=createBootcampStore(config);reopened.close();assert.deepEqual(dump(target,oldTables),beforeUpgrade);
});
test('append-only E5 tables reject edits; old-style direct insert/update requires E5 writer; missing/modified guard fails reopen',async t=>{
 const f=await executionFixture(t),i=f.enqueue().receipt.intentId,h=f.acquire(i);await f.observe(h);
 const attempt=f.store.execution.beginAttempt(f.context,h,f.inspect(h)),m=f.setManifest(i,h,attempt);
 await f.store.execution.attachEnvelope(f.context,h,f.inspect(h),m.envelopeRef);f.store.execution.requestRebase(f.context,i);
 database(f,db=>{
  for(const table of ['e5_intents','e5_receipts','e5_attempts','e5_events','e5_observations','e5_envelopes'])
   assert.throws(()=>db.exec(`UPDATE ${table} SET record=record`),/APPEND_ONLY/);
  assert.throws(()=>db.exec('UPDATE applications SET status=status'),/BC_E5_WRITER_REQUIRED/);
  db.exec("DROP TRIGGER e5_writer_e5_leases_update; CREATE TRIGGER e5_writer_e5_leases_update BEFORE UPDATE ON e5_leases BEGIN SELECT 1; END");
 });
 assert.throws(()=>f.open(),/BC_E5_SCHEMA/);
});
for(const stage of ['e5-after-intent','e5-after-receipt'])test(`SIGKILL ${stage}: intent/receipt transaction recovers once`,{timeout:15000},async t=>{
 const f=await executionFixture(t),body=f.body(),key=f.key(),before=dump(f),legacy=dump(f,oldTables);
 await crash(t,f,{action:'enqueue',context:f.aliceContext,applicationId:f.a,body,key,crashStage:stage});f.restart();
 assert.deepEqual(dump(f),before);assert.deepEqual(dump(f,oldTables),legacy);
 const result=f.store.execution.enqueue(f.aliceContext,f.a,body,key);assert.equal(dump(f).e5_intents.length,1);assert.equal(dump(f).e5_receipts.length,1);
 assert.deepEqual(f.store.execution.enqueue(f.aliceContext,f.a,body,key).receipt,result.receipt);
});
for(const [stage,action]of [['e5-after-observation','observe'],['e5-after-attempt','attempt'],['e5-after-envelope','envelope']])
 test(`SIGKILL ${stage}: no partial observation/attempt/envelope, fixed op retained`,{timeout:15000},async t=>{
  const f=await executionFixture(t),i=f.enqueue().receipt.intentId,h=f.acquire(i);let manifest;
  if(action!=='observe')await f.observe(h);
  if(action==='envelope'){const attempt=f.store.execution.beginAttempt(f.context,h,f.inspect(h));manifest=f.setManifest(i,h,attempt);}
  const before=dump(f),legacy=dump(f,oldTables);
  await crash(t,f,{action,handle:h,observation:f.chain,manifest,crashStage:stage});f.restart();
  assert.deepEqual(dump(f),before);assert.deepEqual(dump(f,oldTables),legacy);
  if(action==='observe')await f.observe(h);
  if(action==='attempt')f.store.execution.beginAttempt(f.context,h,f.inspect(h));
  if(action==='envelope')await f.store.execution.attachEnvelope(f.context,h,f.inspect(h),manifest.envelopeRef);
  assert.equal(dump(f).e5_intents.length,1);assert.equal(dump(f).e5_receipts.length,1);
 });
test('independent process lease race grants one fence and rejects the other claimant', {timeout:15000},async t=>{
 const f=await executionFixture(t),intentId=f.enqueue().receipt.intentId;
 const children=await Promise.all(['worker-one','worker-two'].map(async owner=>{
  const child=fork(new URL('./worker.mjs',import.meta.url),[],{stdio:['ignore','ignore','ignore','ipc']});
  t.after(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');});assert.deepEqual((await once(child,'message'))[0],{ready:true});return {child,owner};
 }));
 const results=await Promise.all(children.map(async({child,owner})=>{
  const response=once(child,'message'),exited=once(child,'exit');child.send({action:'acquire',directory:f.directory,authentication:f.config,time:f.time,
   bindings:f.configuration.operatorBindings,intentId,owner});const result=(await response)[0];assert.deepEqual(await exited,[0,null]);return result;
 }));
 assert.equal(results.filter(r=>r.finished).length,1);assert.equal(results.filter(r=>r.error==='BC_E5_LEASE_BUSY').length,1);
 f.setTime(f.time+30);assert.equal(f.acquire(intentId,{expectedFence:1}).workerFence,2);
});
