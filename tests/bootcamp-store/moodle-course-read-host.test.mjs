import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createServer} from 'node:https';
import {randomBytes} from 'node:crypto';
import {paymentFixture} from './moodle-payment-fixture.mjs';
import {START} from './procedure-fixture.mjs';
import {createCertificates,loadTls} from '../../src/dev/tls.mjs';
import {createMoodleCourseReadHost,createMoodleCourseReadServer,COURSE_READ_REQUEST,COURSE_READ_PATH} from '../../tools/bootcamp/moodle-course-read-host.mjs';
import {createNormalMoodleReadBoundary} from '../../tools/bootcamp/live-context.mjs';

// Owner-port double for adapter tests, not a Moodle authority implementation.
// The reviewed B factory is separately exercised in the integration handoff.
async function fixture(t){
 const x=await paymentFixture(t);let sequence=0,scopeCalls=0,evidenceReads=0,afterEvidence=async()=>{},project=v=>v,authority=s=>s;
 const args={...x.options,ownerRunId:'synthetic-owner-run',
  resolveAuthority:async(handle,request)=>{scopeCalls++;assert.equal(handle.requestRef,request.requestRef);
   return authority({...await x.options.resolveScope(x.handle),requestRef:request.requestRef});},
  getDecisionEvidence:(context,id)=>{evidenceReads++;return x.f.store.getDecisionEvidence(context,id);},
  createCourseEvidenceReader:({resolveScope,getDecisionEvidence})=>({async read(handle){
   const scope=await resolveScope(handle),snapshot=getDecisionEvidence(scope.clearContext,scope.applicationId),d=snapshot.manifest.decision;
   const result={version:'clear-moodle-course-evidence.1',role:scope.role,observedAt:snapshot.observedAt,
    decision:{id:d.decisionId,revision:d.decisionRevision,recordedConditionsStatus:d.conditionsStatus},
    applicationActive:snapshot.currentDecision.applicationActive,
    criteria:snapshot.manifest.criteria.map(r=>({criterionId:r.criterionId,recordedState:r.state})),usableForPayment:false};
   await afterEvidence();await resolveScope(handle);return project(result);
  }})};
 const host=createMoodleCourseReadHost(args);
 const handle=(role='PARTICIPANT',change={})=>Object.freeze({version:COURSE_READ_REQUEST,requestRef:(++sequence).toString(16).padStart(64,'0'),
  ownerRunId:args.ownerRunId,moodleAuthorityRef:'moodle-authority-1',role,expiresAtExclusive:START+5,...change});
 return {x,args,host,handle,scopeCalls:()=>scopeCalls,evidenceReads:()=>evidenceReads,
  afterEvidence:fn=>{afterEvidence=fn;},project:fn=>{project=fn;},authority:fn=>{authority=fn;}};
}
const unavailable=result=>{assert.deepEqual(Object.keys(result).sort(),['status','expiresAtExclusive','evidence','payment'].sort());
 assert.deepEqual(result,{status:'UNAVAILABLE',expiresAtExclusive:null,evidence:null,payment:null});};

test('both separate CLEAR actors get a same-decision pair, shortest display expiry and no writes or secrets',async t=>{
 const z=await fixture(t),{x}=z,bytes=x.bytes(),auth=x.authBytes(),counts=x.f.counts();
 for(const role of ['PARTICIPANT','COURSE_OPERATOR']){
  if(role==='COURSE_OPERATOR')x.operator();const request=z.handle(role),r=await z.host.readCourse(request);
  assert.equal(r.status,'OK');assert.equal(r.evidence.role,role);assert.equal(r.payment.role,role);
  assert.equal(r.payment.requestRef,request.requestRef);assert.equal(r.payment.receipt.amountAtoms,'100000000');
  assert.equal(r.evidence.decision.id,r.payment.decision.id);assert.equal(r.expiresAtExclusive,START+1);
  assert.equal(r.payment.expiresAtExclusive,r.expiresAtExclusive);assert.equal(r.payment.paymentAuthority,false);
  for(const secret of [x.mapping.recipient,x.mapping.token,x.f.aliceContext.token,x.f.operatorContext.token,x.f.aliceContext.csrf])assert.equal(JSON.stringify(r).includes(secret),false);
 }
 assert.deepEqual(x.bytes(),bytes);assert.deepEqual(x.authBytes(),auth);assert.deepEqual(x.f.counts(),counts);
 assert.equal(x.calls(),2);assert.equal(z.evidenceReads(),4);
});
test('D private callback is required; a request object cannot call the read port directly',async t=>{
 const z=await fixture(t),h=z.handle();await assert.rejects(z.host.read(h,h),/COURSE_READ_AUTH/);
 await assert.rejects(z.host.readCourse({...h}),/COURSE_READ_TRANSPORT_HANDLE/);assert.equal(z.scopeCalls(),0);
});
for(const [field,value]of [['ownerRunId','other-run'],['requestRef','not-hex'],['role','ADMIN'],['expiresAtExclusive',START],['expiresAtExclusive',START+6],['moodleAuthorityRef',''],['extra',true]])
 test('invalid channel request '+field+' '+String(value)+' is rejected before owner ports',async t=>{
  const z=await fixture(t);await assert.rejects(z.host.readCourse(z.handle('PARTICIPANT',{[field]:value})));assert.equal(z.scopeCalls(),0);assert.equal(z.x.calls(),0);
 });
test('same requestRef cannot be retried, including a new object or rejected owner read',async t=>{
 const z=await fixture(t),h=z.handle();z.x.unavailable();unavailable(await z.host.readCourse(h));
 await assert.rejects(z.host.readCourse(Object.freeze({...h})),/COURSE_READ_REPLAY/);assert.equal(z.x.calls(),0);
});
for(const kind of ['teacher-borrow','teacher-unavailable','authority-ref','request-ref','role','binding','mapping','authority-expiry','clear-logout'])
 test('owner '+kind+' fails closed without a partial DTO',async t=>{
  const z=await fixture(t),{x}=z;let role='PARTICIPANT';
  if(kind.startsWith('teacher')){role='COURSE_OPERATOR';x.operator();if(kind==='teacher-borrow')x.useParticipantSession();else x.unavailable();}
  if(kind==='authority-ref')x.authority('another-authority');
  if(kind==='request-ref')z.authority(s=>({...s,requestRef:'0'.repeat(64)}));
  if(kind==='role')z.authority(s=>({...s,role:'COURSE_OPERATOR'}));
  if(kind==='binding')x.mapping.bindingRevision++;
  if(kind==='mapping')x.mapping.mappingRevision++;
  if(kind==='authority-expiry')x.scopeExpiry(START);
  if(kind==='clear-logout')x.f.service.logout(x.f.aliceContext);
  unavailable(await z.host.readCourse(z.handle(role)));assert.equal(x.calls(),0);
 });
for(const kind of ['epoch','mapping','clear-logout','expired','monotonic','clock-backwards','consent','decision'])
 test('canonical await '+kind+' returns no pair',async t=>{
  const z=await fixture(t),{x}=z;x.onRead(async()=>{
   if(kind==='epoch')x.epoch();if(kind==='mapping')x.mapping.mappingRevision++;
   if(kind==='clear-logout')x.f.service.logout(x.f.aliceContext);
   if(kind==='expired')x.setWall(START+5);if(kind==='monotonic')x.setMono(5000);if(kind==='clock-backwards')x.setWall(START-1);
   if(kind==='consent')x.f.consent(x.a,x.f.aliceContext,'WITHDRAW');
   if(kind==='decision'){await x.f.refreshEvidence(x.a,START+1);x.setWall(START+1);}
   return x.receipt;
  });unavailable(await z.host.readCourse(z.handle()));assert.equal(x.calls(),1);
 });
for(const kind of ['authority','consent','observation-expired','evidence-availability','mismatched-decision','unexpected-field'])
 test('after evidence '+kind+' cannot return an old payment plus new evidence',async t=>{
  const z=await fixture(t),{x}=z;
  z.afterEvidence(async()=>{
   if(kind==='authority')x.unavailable();if(kind==='consent')x.f.consent(x.a,x.f.aliceContext,'WITHDRAW');
   if(kind==='observation-expired'){x.setWall(START+1);x.f.setTime(START+1);}
   if(kind==='evidence-availability'){x.setWall(START+400);x.f.setTime(START+400);}
  });
  if(kind==='mismatched-decision')z.project(v=>({...v,decision:{...v.decision,id:'wrong-decision'}}));
  if(kind==='unexpected-field')z.project(v=>({...v,privateContext:x.f.aliceContext}));
  unavailable(await z.host.readCourse(z.handle()));
 });
test('missing canonical readback still gives a coherent pair without claiming received TEST',async t=>{
 const z=await fixture(t);z.x.onRead(async()=>null);const r=await z.host.readCourse(z.handle());
 assert.equal(r.status,'OK');assert.equal(r.payment.receipt.amountAtoms,null);assert.equal(r.payment.receipt.state,'READBACK_UNAVAILABLE');
});
test('missing owner authority/factory cannot construct a live adapter',async t=>{
 const z=await fixture(t);for(const field of ['resolveAuthority','createCourseEvidenceReader','getDecisionEvidence'])assert.throws(()=>createMoodleCourseReadHost({...z.args,[field]:undefined}),/COURSE_READ_CONFIG/);
});
test('HTTPS composition supplies only the fixed D server contract without listening',async t=>{
 const z=await fixture(t),dir=join(z.x.f.directory,'course-tls');mkdirSync(dir,{mode:0o700});const fp=createCertificates(dir);
 let contract;const server=createMoodleCourseReadServer({host:z.host,tls:loadTls(dir,fp),origin:'https://127.0.0.1:9443',secret:randomBytes(32).toString('hex'),
  createCourseReadServer:args=>{contract=args;return createServer(args.tls);}});
 assert.equal(server.listening,false);assert.equal(contract.ownerRunId,z.args.ownerRunId);
 assert.equal(contract.readCourse,z.host.readCourse);assert.equal(contract.origin,'https://127.0.0.1:9443');
 assert.equal(Object.hasOwn(contract,'tlsTermination'),false);
 assert.throws(()=>createMoodleCourseReadServer({host:z.host,tls:loadTls(dir,fp),origin:'http://127.0.0.1:9443',secret:'',createCourseReadServer:()=>{throw Error('must not create');}}),/COURSE_READ_SERVER_CONFIG/);
});
test('D cancellation is honored before entry and after canonical await',async t=>{
 const z=await fixture(t),controller=new AbortController();controller.abort();
 await assert.rejects(z.host.readCourse(z.handle(),{signal:controller.signal}));assert.equal(z.x.calls(),0);
 const live=new AbortController();z.x.onRead(async()=>{live.abort();return z.x.receipt;});
 unavailable(await z.host.readCourse(z.handle(),{signal:live.signal}));assert.equal(z.evidenceReads(),0);
});

async function boundaryFixture(t){
 const z=await fixture(t),{x}=z;let verifyHook=v=>v,bindingHook=v=>v,verifies=0,bindings=0;
 const state={...x.mapping,runId:z.args.ownerRunId,expiresAtExclusive:START+1800};
 const boundary=createNormalMoodleReadBoundary({databasePath:x.path,authentication:x.f.service,
  getDecisionEvidence:(c,id)=>x.f.store.getDecisionEvidence(c,id),resolveOperatorBindings:()=>x.f.configuration.operatorBindings,
  receiptSource:x.options.receiptSource,getOwnerState:()=>state,now:x.options.now,monotonic:x.options.monotonic});t.after(()=>boundary.close());
 const actorRefs={PARTICIPANT:x.mapping.subjectRef,COURSE_OPERATOR:'synthetic-teacher'},config={
  ownerRunId:state.runId,mapping:x.mapping,installationGeneration:'synthetic-installation-generation',actorRefs,
  createCourseEvidenceReader:z.args.createCourseEvidenceReader,
  verifyMoodleAuthority:async(request)=>{verifies++;assert.deepEqual(Object.keys(request).sort(),['version','requestRef','ownerRunId','moodleAuthorityRef','role','expiresAtExclusive'].sort());
   return verifyHook({version:'clear-moodle-authority-check.1',requestRef:request.requestRef,ownerRunId:request.ownerRunId,
    moodleAuthorityRef:request.moodleAuthorityRef,role:request.role,status:'OK',installationRef:x.mapping.installationRef,
    installationGeneration:'synthetic-installation-generation',authorityEpoch:1,courseRef:x.mapping.courseRef,subjectRef:x.mapping.subjectRef,
    actorRef:actorRefs[request.role],expiresAtExclusive:request.expiresAtExclusive});},
  readBindingCurrentness:async(context,target,authority)=>{bindings++;
   assert.equal(context.token,(authority.role==='PARTICIPANT'?x.f.aliceContext:x.f.operatorContext).token);
   assert.equal(authority.actorRef,actorRefs[authority.role]);assert.equal(target.applicationId,x.mapping.bApplicationId);
   return bindingHook({version:'clear-moodle-binding-currentness.1',...target,
    scope:{installationRef:x.mapping.installationRef,courseRef:x.mapping.courseRef,subjectRef:x.mapping.subjectRef},
    currentness:'LOCAL_BINDING_CURRENT',checkedAt:x.options.now(),expiresAtExclusive:START+100});}
 };
 return {...z,boundary,config,state,verifies:()=>verifies,bindings:()=>bindings,
  verifyHook:fn=>{verifyHook=fn;},bindingHook:fn=>{bindingHook=fn;}};
}
test('live boundary combines fresh C actor/subject with only each observed CLEAR session and B binding, without writes',async t=>{
 const z=await boundaryFixture(t),{x}=z,bytes=x.bytes(),auth=x.authBytes(),counts=x.f.counts();
 z.boundary.observeSession(x.f.aliceContext);z.boundary.observeSession(x.f.operatorContext);
 const host=z.boundary.createHost(z.config);
 for(const role of ['PARTICIPANT','COURSE_OPERATOR']){const r=await host.readCourse(z.handle(role));assert.equal(r.status,'OK');assert.equal(r.payment.role,role);}
 assert.ok(z.verifies()>2);assert.equal(z.verifies(),z.bindings());
 assert.deepEqual(x.bytes(),bytes);assert.deepEqual(x.authBytes(),auth);assert.deepEqual(x.f.counts(),counts);
});
test('live boundary never uses participant login for a teacher with no observed operator session',async t=>{
 const z=await boundaryFixture(t);z.boundary.observeSession(z.x.f.aliceContext);const host=z.boundary.createHost(z.config);
 unavailable(await host.readCourse(z.handle('COURSE_OPERATOR')));assert.equal(z.bindings(),0);assert.equal(z.x.calls(),0);
 z.boundary.observeSession(z.x.f.operatorContext);assert.equal((await host.readCourse(z.handle('COURSE_OPERATOR'))).status,'OK');
});
for(const [field,value]of [['status','UNAVAILABLE'],['actorRef','wrong-person'],['subjectRef','wrong-student'],['courseRef','other-course'],
 ['installationGeneration','another-installation'],['installationRef','another-site'],['ownerRunId','other-run'],['authorityEpoch',0],['expiresAtExclusive',START],['extra',true]])
 test('live boundary rejects C verifier '+field+' mismatch before B/receipt',async t=>{
  const z=await boundaryFixture(t);z.boundary.observeSession(z.x.f.operatorContext);z.verifyHook(v=>({...v,[field]:value}));
  const host=z.boundary.createHost(z.config);unavailable(await host.readCourse(z.handle('COURSE_OPERATOR')));assert.equal(z.bindings(),0);assert.equal(z.x.calls(),0);
 });
for(const kind of ['missing-runtime','binding-revision','binding-subject','stale-currentness','expired-currentness','owner-change','logout','close'])
 test('live boundary '+kind+' blocks the pair without an authority fallback',async t=>{
  const z=await boundaryFixture(t);z.boundary.observeSession(z.x.f.aliceContext);const host=z.boundary.createHost(z.config);
  z.bindingHook(v=>{
   if(kind==='missing-runtime')throw Error('LEGITIMATE_RUNTIME_UNAVAILABLE');
   if(kind==='binding-revision')v.bindingRevision++;
   if(kind==='binding-subject')v.scope.subjectRef='wrong-student';
   if(kind==='stale-currentness')v.checkedAt--;
   if(kind==='expired-currentness')v.expiresAtExclusive=START;
   if(kind==='owner-change')z.state.applicationId='other-application';
   if(kind==='logout')z.x.f.service.logout(z.x.f.aliceContext);
   if(kind==='close')z.boundary.close();return v;
  });unavailable(await host.readCourse(z.handle()));assert.equal(z.x.calls(),0);
 });
test('live boundary requires explicit verifier/currentness, distinct actor mapping and fixed live run mapping',async t=>{
 const z=await boundaryFixture(t);
 for(const field of ['verifyMoodleAuthority','readBindingCurrentness'])assert.throws(()=>z.boundary.createHost({...z.config,[field]:undefined}),/BC_MOODLE_READ_PORTS/);
 assert.throws(()=>z.boundary.createHost({...z.config,actorRefs:{PARTICIPANT:z.x.mapping.subjectRef,COURSE_OPERATOR:z.x.mapping.subjectRef}}),/BC_MOODLE_READ_ACTORS/);
 assert.throws(()=>z.boundary.createHost({...z.config,ownerRunId:'other-run'}),/BC_MOODLE_READ_RUN/);
 assert.throws(()=>z.boundary.createHost({...z.config,mapping:{...z.x.mapping,recipient:z.x.mapping.operatorWallet}}),/BC_MOODLE_READ_MAPPING/);
 assert.throws(()=>z.boundary.observeSession(z.x.f.bobContext),/BC_MOODLE_READ_ACTOR/);
});
