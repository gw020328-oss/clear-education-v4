import test from 'node:test';
import assert from 'node:assert/strict';
import {createNormalCertificateStart,CERTIFICATE_STAGE} from '../../tools/bootcamp/normal-certificate-start.mjs';
import {createNormalSourceSequence} from '../../tools/bootcamp/normal-source-sequence.mjs';
import {commandFixture} from './moodle-command-fixture.mjs';
import {START} from './fixture.mjs';

async function fixture(t){
 const commands=await commandFixture(),stop=new AbortController(),app='application-fixture';
 let time=START,phase='BOUND',revision=1,bound={app,user:commands.contexts.PARTICIPANT},count=0;
 const store={getApplication:()=>({applicationId:app,revision,status:'ACTIVE'})};
 const gate=createNormalCertificateStart({store,commandScope:commands.scope,
  authorize(c){commands.scope.assertContext(c);return{role:c.token===commands.contexts.PARTICIPANT.token?'participant':'operator'};},
  getBinding:()=>bound,validateParticipant(){},now:()=>time,expiresAt:START+1200,signal:stop.signal,getStage:()=>phase});
 const post=async({role='PARTICIPANT',key='start-one',applicationId=app,body={expectedRevision:revision}}={})=>{
  const input=await commands.grant({method:'POST',path:'/bootcamp/v4/applications/'+applicationId+'/certificate-start',body,idempotencyKey:key},role);
  return commands.scope.run(input,()=>gate.start(input.context,applicationId,body,key));
 };
 t.after(()=>{gate.close();stop.abort();commands.owner.close();});
 return {commands,stop,gate,post,app,store,context:commands.contexts.PARTICIPANT,
  stage(v=CERTIFICATE_STAGE){phase=v;},revision(v){revision=v;},replace(){bound={...bound,user:{...bound.user,token:'f'.repeat(64)}};},
  advance(n){time+=n;commands.advance(n);},key:()=> 'test-'+(++count)};
}
test('binding and reads cannot start; stage, participant, application and revision gate explicit start',async t=>{
 const x=await fixture(t);
 assert.equal(x.gate.view(x.context,x.app).startAllowed,false);
 await assert.rejects(x.post({key:'too-early'}),/BC_CERTIFICATE_NOT_READY/);
 x.stage();const wait=x.gate.wait();
 assert.equal(x.gate.view(x.context,x.app).startAllowed,true);
 assert.equal(x.gate.view(x.context,x.app).signatureReady,false);
 await assert.rejects(x.post({role:'COURSE_OPERATOR'}),/FORBIDDEN/);
 await assert.rejects(x.post({applicationId:'another-app'}),/FORBIDDEN/);
 await assert.rejects(x.post({body:{expectedRevision:2}}),/BC_REVISION_CONFLICT/);
 await assert.rejects(x.post({body:{expectedRevision:1,url:'https://example.invalid'}}),/BC_CERTIFICATE_BODY/);
 const receipt=await x.post();assert.equal(receipt.status,'START_ACCEPTED');
 const accepted=await wait;accepted.assertAuthority();assert.equal(accepted.expectedRevision,1);
 await assert.rejects(x.post(),/MOODLE_COMMAND_UNAVAILABLE/);
 await assert.rejects(x.post({key:'start-two'}),/BC_CERTIFICATE_ALREADY_STARTED/);
 assert.equal(x.gate.view(x.context,x.app).signatureReady,false);
 const signed=Promise.withResolvers(),pending=x.gate.signature(()=>signed.promise);
 assert.equal(x.gate.view(x.context,x.app).signatureReady,true);
 signed.resolve('synthetic-accepted-signature');await pending;
 assert.equal(x.gate.view(x.context,x.app).state,'SIGNATURE_ACCEPTED');x.gate.complete();
 assert.equal(x.gate.view(x.context,x.app).state,'VERIFIED');
});
test('accepted start remains bounded by original Moodle intent, even after transport expires',async t=>{
 const x=await fixture(t);x.stage();const wait=x.gate.wait();await x.post();const accepted=await wait;
 x.advance(6);accepted.assertAuthority();
 await x.commands.end();assert.throws(accepted.assertAuthority,/MOODLE_CERTIFICATE_AUTHORITY/);
 assert.throws(()=>x.gate.view(x.context,x.app),/MOODLE_CERTIFICATE_AUTHORITY/);
 await assert.rejects(x.gate.signature(()=>assert.fail('must not ask wallet')),/MOODLE_CERTIFICATE_AUTHORITY/);
});
test('authority is rechecked after pending signature and before any browser can launch',async t=>{
 const x=await fixture(t);x.stage();const wait=x.gate.wait();await x.post();await wait;
 const signed=Promise.withResolvers(),pending=x.gate.signature(()=>signed.promise);
 const rejected=assert.rejects(pending,/FORBIDDEN/);x.replace();signed.resolve('synthetic-signature');await rejected;
});
test('actual C execute lease cap permits human signature wait but never reuses the POST',async t=>{
 const x=await fixture(t);x.stage();const wait=x.gate.wait();await x.post();await wait;
 const signed=Promise.withResolvers(),pending=x.gate.signature(()=>signed.promise);
 x.advance(6);
 assert.equal(x.gate.view(x.context,x.app).signatureReady,true);
 assert.throws(()=>x.commands.lastReservation.assert(),/MOODLE_COMMAND_BINDING/);
 await assert.rejects(x.post(),/MOODLE_COMMAND_UNAVAILABLE/);
 x.advance(20);signed.resolve('synthetic-reviewed-signature');await pending;x.gate.complete();
 assert.equal(x.gate.view(x.context,x.app).state,'VERIFIED');
});
test('source wait keeps the shorter original authorization horizon despite a longer connected intent',async t=>{
 const x=await fixture(t);x.commands.limitAuthority(START+9);x.stage();
 const wait=x.gate.wait();await x.post();const accepted=await wait;
 x.advance(6);accepted.assertAuthority();x.advance(3);
 assert.throws(accepted.assertAuthority,/MOODLE_CERTIFICATE_AUTHORITY/);
 assert.throws(()=>x.gate.view(x.context,x.app),/MOODLE_CERTIFICATE_AUTHORITY/);
});
test('closing or expiry makes readiness unavailable and releases waiting owner',async t=>{
 const x=await fixture(t);x.stage();const wait=x.gate.wait();const rejected=assert.rejects(wait,/BC_CERTIFICATE_CLOSED/);
 x.stop.abort();await rejected;await assert.rejects(x.post(),/BC_CERTIFICATE_CLOSED/);
});
test('certificate authority cannot be captured by the common binding or activity command',async t=>{
 const x=await fixture(t);
 for(const [tail,body] of [['source-session',{}],['source-refresh',{criterionId:'activity-complete',expectedRevision:1}]]){
  const input=await x.commands.grant({method:'POST',path:'/bootcamp/v4/applications/'+x.app+'/'+tail,body,idempotencyKey:'scope-'+tail});
  await assert.rejects(x.commands.scope.run(input,()=>x.commands.scope.captureCertificateAuthority(x.app)),/MOODLE_CERTIFICATE_AUTHORITY/);
 }
});
test('native sequence waits before issuing certificate request; current start revision and authority reach collection',async t=>{
 const x=await fixture(t),events=[];
 const sequence=createNormalSourceSequence({store:{...x.store,
  issueBridgeRequest(c,a,b){events.push('ISSUE');assert.equal(b.criterionId,'python-basic-certificate');assert.equal(b.expectedRevision,1);
   return{record:{target:{requestId:'request-fixture'},applicationRevision:1}};},
  async collectBridge(c,a,b,k,options){events.push('COLLECT');options.assertAuthority();
   await x.gate.signature(async()=>{events.push('SIGN_ACCEPTED');return 'synthetic-signature';});
   throw Error('STOP_BEFORE_EXTERNAL_SOURCE');}},getContext:()=>x.context,applicationId:x.app,sourceWindows:new Map(),
  startedAt:START,now:()=>START,signal:x.stop.signal,key:x.key,stage:name=>x.stage(name),waitForReaders:async()=>{},
  requireReaders(){},certificateStart:x.gate});
 const pending=sequence.collect();const rejected=assert.rejects(pending,/STOP_BEFORE_EXTERNAL_SOURCE/);
 await new Promise(r=>setImmediate(r));assert.deepEqual(events,[]);
 for(let i=0;i<3;i++)assert.equal(x.gate.view(x.context,x.app).startAllowed,true);
 assert.deepEqual(events,[]);await x.post();await rejected;
 assert.deepEqual(events,['ISSUE','COLLECT','SIGN_ACCEPTED']);assert.equal(x.gate.view(x.context,x.app).state,'UNAVAILABLE');
});

test('expired owner cannot advertise readiness or accept a certificate start',async t=>{
 const x=await fixture(t);x.advance(1200);
 assert.throws(()=>x.gate.view(x.context,x.app),/BC_CERTIFICATE_CLOSED/);
 await assert.rejects(x.gate.wait(),/BC_CERTIFICATE_CLOSED/);
});

test('certificate-only sequence never issues activity, assignment or reflection requests',async t=>{
 const x=await fixture(t),issued=[];
 const sequence=createNormalSourceSequence({store:{...x.store,
  issueBridgeRequest(c,a,b){issued.push(b.criterionId);return{record:{target:{requestId:'request-fixture'},applicationRevision:1}};},
  async collectBridge(c,a,b,k,options){options.assertAuthority();await x.gate.signature(async()=> 'synthetic-signature');}},
  getContext:()=>x.context,applicationId:x.app,sourceWindows:new Map(),startedAt:START,now:()=>START,
  signal:x.stop.signal,key:x.key,stage:name=>x.stage(name),waitForReaders:async()=>{},requireReaders(){},
  certificateStart:x.gate,certificateOnly:true});
 const pending=sequence.collect();await new Promise(r=>setImmediate(r));await x.post();await pending;
 assert.deepEqual(issued,['python-basic-certificate']);assert.equal(x.gate.view(x.context,x.app).state,'VERIFIED');
});
