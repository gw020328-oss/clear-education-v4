import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {paymentFixture} from './moodle-payment-fixture.mjs';
import {openNormalMoodleRegistration} from '../../tools/bootcamp/normal-moodle-registration.mjs';
import {createNormalMoodleCurrentness} from '../../tools/bootcamp/normal-moodle-currentness.mjs';

async function fixture(t){
 const x=await paymentFixture(t),dir=join(x.f.directory,'normal-currentness');mkdirSync(dir,{mode:0o700});let n=0,epoch=1,wall=x.f.time,hook=()=>{},calls=0;
 const state={runId:'currentness-fixture',...x.mapping},scope={installationRef:'moodle-fixture',installationGeneration:'generation-fixture',courseRef:'course-fixture',
  subjectRef:'student-fixture',actorRefs:{PARTICIPANT:'student-fixture',COURSE_OPERATOR:'teacher-fixture'}};
 const request=(role='PARTICIPANT')=>({version:'clear-moodle-course-read-request.1',requestRef:(++n).toString(16).padStart(64,'0'),ownerRunId:state.runId,
  moodleAuthorityRef:(++n).toString(16).padStart(64,'0'),role,expiresAtExclusive:wall+5});
 const path=join(dir,'registration.sqlite'),owner=openNormalMoodleRegistration({databasePath:path,create:true,ownerRunId:state.runId,scope,authentication:x.f.service,snapshots:x.snapshots,
  getOwnerState:()=>state,now:()=>wall,monotonic:()=>0,verifyMoodleAuthority:async r=>{calls++;await hook();return {...r,version:'clear-moodle-authority-check.1',status:'OK',
   installationRef:scope.installationRef,installationGeneration:scope.installationGeneration,authorityEpoch:epoch,courseRef:scope.courseRef,subjectRef:scope.subjectRef,actorRef:scope.actorRefs[r.role]};}});
 t.after(()=>owner.close());const reader=createNormalMoodleCurrentness({registration:owner});
 const register=async(role='PARTICIPANT',operation='REGISTER',expectedRevision=0)=>{
  const context=role==='PARTICIPANT'?x.f.aliceContext:x.f.operatorContext,wallet=role==='PARTICIPANT'?x.f.alice:x.f.operator;
  const p=await owner.prepare(context,request(role),{operation,expectedRevision});return owner.consume(context,request(role),{challengeId:p.challengeId,signature:await wallet.signMessage(p.message)});
 };
 const selector=r=>({applicationId:x.a,registrationRef:r.registrationRef,registrationRevision:r.registrationRevision});
 const read=(r,role='PARTICIPANT')=>reader.read(role==='PARTICIPANT'?x.f.aliceContext:x.f.operatorContext,request(role),selector(r));
 return {x,state,scope,owner,reader,register,read,request,selector,path,calls:()=>calls,hook:f=>{hook=f;},epoch:()=>{epoch++;},
  advance:n=>{wall+=n;x.setWall(wall);x.f.setTime(wall);x.f.setAuthenticationTime(wall);}};
}
test('normal namespace returns minimal read-only DTO for each independent role',async t=>{
 const f=await fixture(t),student=await f.register(),teacher=await f.register('COURSE_OPERATOR');
 const files=[f.path,f.x.path,join(f.x.f.config.directory,'applications.sqlite')],before=files.map(p=>readFileSync(p));
 const a=await f.read(student),b=await f.read(teacher,'COURSE_OPERATOR');
 assert.equal(a.version,'clear-normal-moodle-currentness.1');assert.equal(a.applicationId,f.x.a);assert.equal(a.scope.role,'PARTICIPANT');
 assert.equal(b.scope.role,'COURSE_OPERATOR');assert.notEqual(b.scope.actorRef,b.scope.subjectRef);assert.equal(a.currentness,'OWNER_REGISTRATION_CURRENT');
 assert.equal(a.expiresAtExclusive-a.checkedAt,5);assert.equal(a.paymentAuthority,false);assert.equal(a.displayOnly,true);
 const serialized=JSON.stringify([a,b]);for(const raw of [f.x.f.aliceContext.token,f.x.mapping.participantWallet,f.x.mapping.operatorWallet])assert.ok(!serialized.includes(raw));
 files.forEach((p,i)=>assert.deepEqual(readFileSync(p),before[i]));
});
test('unbranded currentness supplier cannot masquerade as actual registration owner',()=>{
 assert.throws(()=>createNormalMoodleCurrentness({registration:{readStudent:()=>({currentness:'LOCAL_BINDING_CURRENT'})}}),/OWNER_REQUIRED/);
});
test('unregistered, wrong role/ref/revision/app cannot read; teacher cannot borrow student registration',async t=>{
 const f=await fixture(t),r=await f.register();await assert.rejects(f.read(r,'COURSE_OPERATOR'),/NOT_CURRENT/);
 for(const [key,value]of [['registrationRef','other'],['registrationRevision',2],['applicationId','different-app']]){
  await assert.rejects(f.reader.read(f.x.f.aliceContext,f.request(),{...f.selector(r),[key]:value}),/NOT_CURRENT|SELECTOR/);
 }
});
test('new C authority query every read and epoch not cached as permanent entitlement',async t=>{
 const f=await fixture(t),r=await f.register(),before=f.calls();await f.read(r);f.epoch();await f.read(r);assert.equal(f.calls()-before,4);
});
test('Moodle authority removed after registration blocks read without touching registry',async t=>{
 const f=await fixture(t),r=await f.register(),before=readFileSync(f.path);f.hook(()=>{throw Error('ACL_REMOVED');});
 await assert.rejects(f.read(r),/ACL_REMOVED/);assert.deepEqual(readFileSync(f.path),before);
});
test('CLEAR logout during fresh authority call blocks read',async t=>{
 const f=await fixture(t),r=await f.register();f.hook(()=>f.x.f.service.logout(f.x.f.aliceContext));await assert.rejects(f.read(r));
});
test('application revision may evolve between reads; immutable registration target may not',async t=>{
 const f=await fixture(t),r=await f.register();f.x.f.consent(f.x.a,f.x.f.aliceContext,'WITHDRAW');await f.read(r);
 f.state.recipient='0x'+'44'.repeat(20);await assert.rejects(f.read(r),/TARGET/);
});
test('application revision change during authority recheck is rejected',async t=>{
 const f=await fixture(t),r=await f.register();let changed=false;f.hook(()=>{if(!changed){changed=true;f.x.f.consent(f.x.a,f.x.f.aliceContext,'WITHDRAW');}});
 await assert.rejects(f.read(r),/TARGET_CHANGED/);
});
test('revocation that commits during async authority lookup prevents stale read',async t=>{
 const f=await fixture(t),r=await f.register();let entered=false,release;
 const waiting=new Promise(resolve=>{release=resolve;});f.hook(async()=>{if(!entered){entered=true;await waiting;}});
 const pending=f.read(r);while(!entered)await Promise.resolve();await f.register('PARTICIPANT','REVOKE',1);release();
 await assert.rejects(pending,/NOT_CURRENT/);
});
test('registration expiry and closed owner are exclusive fail-closed boundaries',async t=>{
 const f=await fixture(t),r=await f.register();f.advance(r.expiresAtExclusive-f.x.f.time);await assert.rejects(f.read(r));
 f.owner.close();await assert.rejects(f.read(r),/CLOSED/);
});
