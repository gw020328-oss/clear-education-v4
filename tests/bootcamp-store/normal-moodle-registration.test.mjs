import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,chmodSync,renameSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {paymentFixture} from './moodle-payment-fixture.mjs';
import {openNormalMoodleRegistration} from '../../tools/bootcamp/normal-moodle-registration.mjs';
import {createNormalMoodleCurrentness} from '../../tools/bootcamp/normal-moodle-currentness.mjs';

async function fixture(t){
 const x=await paymentFixture(t),directory=join(x.f.directory,'normal-registration');mkdirSync(directory,{mode:0o700});
 let wall=x.f.time,mono=0,epoch=1,n=0,hook=()=>{},unavailable=false;
 const state={runId:'normal-fixture-run',...x.mapping},scope={installationRef:'moodle-fixture',installationGeneration:'generation-fixture',
  courseRef:'course-fixture',subjectRef:'student-fixture',actorRefs:{PARTICIPANT:'student-fixture',COURSE_OPERATOR:'teacher-fixture'}};
 const request=(role='PARTICIPANT')=>({version:'clear-moodle-course-read-request.1',requestRef:(++n).toString(16).padStart(64,'0'),
  ownerRunId:state.runId,moodleAuthorityRef:(++n).toString(16).padStart(64,'0'),role,expiresAtExclusive:wall+5});
 const options={databasePath:join(directory,'registrations.sqlite'),create:true,ownerRunId:state.runId,scope,authentication:x.f.service,snapshots:x.snapshots,
  getOwnerState:()=>state,now:()=>wall,monotonic:()=>mono,verifyMoodleAuthority:async r=>{
   await hook(r);if(unavailable)throw Error('C_UNAVAILABLE');return {version:'clear-moodle-authority-check.1',...r,version:'clear-moodle-authority-check.1',status:'OK',
    installationRef:scope.installationRef,installationGeneration:scope.installationGeneration,authorityEpoch:epoch,courseRef:scope.courseRef,
    subjectRef:scope.subjectRef,actorRef:scope.actorRefs[r.role]};}};
 const owner=openNormalMoodleRegistration(options);t.after(()=>owner.close());
 const prepare=(role='PARTICIPANT',operation='REGISTER',revision=0)=>owner.prepare(role==='PARTICIPANT'?x.f.aliceContext:x.f.operatorContext,request(role),{operation,expectedRevision:revision});
 const sign=(p,wallet=x.f.alice)=>wallet.signMessage(p.message);
 const consume=async(p,role='PARTICIPANT',signature)=>owner.consume(role==='PARTICIPANT'?x.f.aliceContext:x.f.operatorContext,request(role),
  {challengeId:p.challengeId,signature:signature??await sign(p,role==='PARTICIPANT'?x.f.alice:x.f.operator)});
 return {x,owner,options,state,scope,request,prepare,sign,consume,
  hook:fn=>{hook=fn;},unavailable:()=>{unavailable=true;},epoch:()=>{epoch++;},mono:v=>{mono=v;},
  advance:seconds=>{wall+=seconds;mono+=seconds*1000;x.setWall(wall);x.f.setTime(wall);x.f.setAuthenticationTime(wall);},
  bytes:()=>readFileSync(options.databasePath)};
}

test('separate real SQLite registrations require each CLEAR actor signature; new C lease after human delay',async t=>{
 const f=await fixture(t),student=await f.prepare();assert.equal(student.expiresAtExclusive-student.issuedAt,120);
 assert.equal(student.identity.actorRef,student.identity.subjectRef);assert.match(student.message,/does not authorize payment/);
 f.advance(10);f.epoch();const sr=await f.consume(student);
 const teacher=await f.prepare('COURSE_OPERATOR');assert.notEqual(teacher.identity.actorRef,teacher.identity.subjectRef);
 const tr=await f.consume(teacher,'COURSE_OPERATOR');assert.notEqual(sr.registrationRef,tr.registrationRef);
 assert.equal(sr.status,'ACTIVE');assert.equal(tr.status,'ACTIVE');assert.equal(sr.paymentAuthority,false);
 assert.equal(sr.applicationId,f.x.a);assert.equal(sr.registrationRevision,1);
 const data=f.bytes().toString('latin1');assert.ok(!data.includes(f.x.f.aliceContext.token));assert.ok(!data.includes(await f.sign(student)));
});

for(const role of ['PARTICIPANT','COURSE_OPERATOR'])test('other CLEAR role cannot register '+role,async t=>{
 const f=await fixture(t),context=role==='PARTICIPANT'?f.x.f.operatorContext:f.x.f.aliceContext;
 await assert.rejects(f.owner.prepare(context,f.request(role),{operation:'REGISTER',expectedRevision:0}),/NORMAL_MOODLE_ACTOR/);
});
test('wrong wallet signature, payment-like signature and replay cannot consume challenge',async t=>{
 const f=await fixture(t),p=await f.prepare();
 await assert.rejects(f.consume(p,'PARTICIPANT',await f.sign(p,f.x.f.operator)),/SIGNATURE/);
 await assert.rejects(f.consume(p,'PARTICIPANT',await f.x.f.alice.signMessage('Agree to payment')),/SIGNATURE/);
 await f.consume(p);await assert.rejects(f.consume(p),/CHALLENGE_USED/);
});
test('concurrent approvals of the same expected revision commit exactly once',async t=>{
 const f=await fixture(t),a=await f.prepare(),b=await f.prepare();
 const results=await Promise.allSettled([f.consume(a),f.consume(b)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.match(results.find(r=>r.status==='rejected').reason.message,/REVISION/);
});
test('signed revocation atomically increments revision and blocks old read/approval',async t=>{
 const f=await fixture(t),r=await f.consume(await f.prepare()),replacement=await f.prepare('PARTICIPANT','REGISTER',1),revoke=await f.prepare('PARTICIPANT','REVOKE',1);
 const revoked=await f.consume(revoke);assert.equal(revoked.status,'REVOKED');assert.equal(revoked.registrationRevision,2);
 await assert.rejects(f.consume(replacement),/REVISION/);
 const reader=createNormalMoodleCurrentness({registration:f.owner});
 await assert.rejects(reader.read(f.x.f.aliceContext,f.request(),{applicationId:f.x.a,registrationRef:r.registrationRef,registrationRevision:1}),/NOT_CURRENT/);
 const restored=await f.consume(await f.prepare('PARTICIPANT','REGISTER',2));assert.equal(restored.registrationRevision,3);
});
test('expired wall or monotonic human challenge cannot be renewed by fresh C lease',async t=>{
 const f=await fixture(t),p=await f.prepare();f.advance(120);await assert.rejects(f.consume(p),/CHALLENGE_(EXPIRED|CHANGED)/);
});
test('monotonic cap also rejects a stalled wall clock',async t=>{
 const f=await fixture(t),p=await f.prepare();f.mono(120000);await assert.rejects(f.consume(p),/CHALLENGE_EXPIRED/);
});
test('pending challenge cannot be revived by reopening owner process',async t=>{
 const f=await fixture(t),p=await f.prepare();f.owner.close();
 const next=openNormalMoodleRegistration({...f.options,create:false});t.after(()=>next.close());
 await assert.rejects(next.consume(f.x.f.aliceContext,f.request(),{challengeId:p.challengeId,signature:await f.sign(p)}),/CHALLENGE_EXPIRED/);
});
test('current logout prevents consume and leaves no registration',async t=>{
 const f=await fixture(t),p=await f.prepare();f.x.f.service.logout(f.x.f.aliceContext);
 await assert.rejects(f.consume(p));const db=new DatabaseSync(f.options.databasePath,{readOnly:true});
 assert.equal(db.prepare('SELECT count(*) n FROM heads').get().n,0);assert.equal(db.prepare('SELECT consumed FROM requests').get().consumed,0);db.close();
});
test('C unavailable at consume fails closed without consuming request',async t=>{
 const f=await fixture(t),p=await f.prepare(),before=f.bytes();f.unavailable();await assert.rejects(f.consume(p),/C_UNAVAILABLE/);assert.deepEqual(f.bytes(),before);
});
for(const field of ['actorRef','subjectRef','installationGeneration','courseRef'])test('C '+field+' substitution rejected',async t=>{
 const f=await fixture(t),old=f.options.verifyMoodleAuthority;
 f.owner.close();const next=openNormalMoodleRegistration({...f.options,create:false,verifyMoodleAuthority:async r=>({...await old(r),[field]:'foreign'})});t.after(()=>next.close());
 await assert.rejects(next.prepare(f.x.f.aliceContext,f.request(),{operation:'REGISTER',expectedRevision:0}),/AUTHORITY/);
});
test('epoch changes within C recheck reject; target changes during await reject',async t=>{
 const f=await fixture(t);let calls=0;f.hook(()=>{if(++calls===2)f.epoch();});await assert.rejects(f.prepare(),/AUTHORITY_CHANGED/);
 f.hook(()=>{f.state.runtimeMappingHash='0x'+'ab'.repeat(32);});await assert.rejects(f.prepare(),/APPLICATION|TARGET_CHANGED/);
});
test('C lease exclusive expiration after awaited verification rejected',async t=>{
 const f=await fixture(t);f.hook(()=>f.advance(5));await assert.rejects(f.prepare(),/LEASE_EXPIRED/);
});
test('cancelled request cannot issue challenge',async t=>{
 const f=await fixture(t),controller=new AbortController();f.hook(()=>controller.abort());
 await assert.rejects(f.owner.prepare(f.x.f.aliceContext,f.request(),{operation:'REGISTER',expectedRevision:0},{signal:controller.signal}));
});
test('changed target between proposal and consume requires new signed proposal',async t=>{
 const f=await fixture(t),p=await f.prepare();f.scope.installationGeneration='generation-changed';
 await assert.rejects(f.consume(p),/AUTHORITY/);
});
test('private file replacement, symlink, mode and schema drift fail closed',async t=>{
 const f=await fixture(t);chmodSync(f.options.databasePath,0o644);await assert.rejects(f.prepare(),/PRIVATE_STORE/);chmodSync(f.options.databasePath,0o600);
 const db=new DatabaseSync(f.options.databasePath);db.exec('CREATE TABLE foreign_table(value TEXT)');db.close();await assert.rejects(f.prepare(),/SCHEMA/);
 const saved=f.options.databasePath+'.saved';renameSync(f.options.databasePath,saved);symlinkSync(saved,f.options.databasePath);await assert.rejects(f.prepare(),/PRIVATE_STORE/);
});
test('opening absent store or a different run never auto creates/repairs authority',async t=>{
 const f=await fixture(t);assert.throws(()=>openNormalMoodleRegistration({...f.options,create:false,databasePath:f.options.databasePath+'.absent'}));
 assert.throws(()=>openNormalMoodleRegistration({...f.options,create:false,ownerRunId:'different-run'}),/STORE_RUN/);
});
