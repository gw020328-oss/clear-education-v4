import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {normalApprovalFixture} from './normal-approval-fixture.mjs';
import {commandFixture} from './moodle-command-fixture.mjs';
for(const partial of [false,true])test('reflection exclusive file commit '+(partial?'keeps first effect and never reopens a partial failure':'consumes one grant after both files'),async t=>{
 let x,writes=0;
 const fence={beforeFile(){if(partial&&writes===1)x.invalidate();x.scope.beforeFile();},
  afterFile(){writes++;x.scope.afterFile();},filesCommitted(){x.scope.filesCommitted();}};
 const f=await normalApprovalFixture(t,{commandScope:fence});
 x=await commandFixture({authentication:f.f.service,contexts:{PARTICIPANT:f.f.aliceContext,COURSE_OPERATOR:f.f.operatorContext}});t.after(()=>x.owner.close());
 const command={method:'POST',path:'/bootcamp/v4/applications/'+f.app+'/reflection-approval',body:f.body(),idempotencyKey:'native-reflection'};
 const input=await x.grant(command,'COURSE_OPERATOR');
 const run=()=>x.scope.run(input,()=>f.control.approve(f.actor,f.app,command.body,command.idempotencyKey));
 if(partial){await assert.rejects(run(),/RECORD_FAILED/);assert.throws(()=>x.lastReservation.finish(),/NOT_COMMITTED/);}
 else{assert.equal((await run()).status,'RECORDED');x.lastReservation.finish();}
 assert.equal(writes,partial?1:2);assert(existsSync(join(f.directory,'human-ai-approval-evidence.json')));
 assert.equal(existsSync(join(f.directory,'approval.json')),!partial);
 await assert.rejects(run(),/BINDING/);assert.deepEqual(f.counts(),{fetches:0,keys:0});
});

test('expiry at second temp fsync fences the actual approval link, retaining only partial evidence',async t=>{
 const fs=(await import('node:fs')).default,{syncBuiltinESMExports}=await import('node:module');let x;
 const fence={beforeFile(){x.scope.beforeFile();},afterFile(){x.scope.afterFile();},filesCommitted(){x.scope.filesCommitted();}};
 const f=await normalApprovalFixture(t,{commandScope:fence});
 x=await commandFixture({authentication:f.f.service,contexts:{PARTICIPANT:f.f.aliceContext,COURSE_OPERATOR:f.f.operatorContext}});t.after(()=>x.owner.close());
 const command={method:'POST',path:'/bootcamp/v4/applications/'+f.app+'/reflection-approval',body:f.body(),idempotencyKey:'native-fsync-expiry'};
 const input=await x.grant(command,'COURSE_OPERATOR');const original=fs.fsyncSync;let calls=0;
 try{
  fs.fsyncSync=fd=>{const result=original(fd);if(++calls===3)x.advance(5);return result;};syncBuiltinESMExports();
  await assert.rejects(x.scope.run(input,()=>f.control.approve(f.actor,f.app,command.body,command.idempotencyKey)),/RECORD_FAILED/);
 }finally{fs.fsyncSync=original;syncBuiltinESMExports();}
 assert.equal(calls,3);assert(existsSync(join(f.directory,'human-ai-approval-evidence.json')));
 assert.equal(existsSync(join(f.directory,'approval.json')),false);assert.throws(()=>x.lastReservation.finish(),/NOT_COMMITTED/);
 await assert.rejects(x.scope.run(input,()=>{}),/BINDING/);assert.deepEqual(f.counts(),{fetches:0,keys:0});
});
