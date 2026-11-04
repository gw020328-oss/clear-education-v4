import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,symlinkSync,readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import {join} from 'node:path';
import {createServer} from 'node:https';
import {randomBytes,createHash,createHmac} from 'node:crypto';
import {paymentFixture} from './moodle-payment-fixture.mjs';
import {START} from './procedure-fixture.mjs';
import {createCertificates,loadTls} from '../../src/dev/tls.mjs';
import {createMoodleCourseReadHost,createMoodleCourseReadServer,loadNormalMoodleReadOwner,attachNormalMoodleReadServer,createFixedMoodleAuthorityVerifier,COURSE_READ_REQUEST,COURSE_READ_PATH} from '../../tools/bootcamp/moodle-course-read-host.mjs';
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

async function fixedBoundaryFixture(t){
 const z=await boundaryFixture(t),{bApplicationId,bindingRef,bindingRevision,bindingExpiresAtExclusive,...base}=z.config.mapping;
 const mapping={...base,version:'clear-normal-moodle-fixed-mapping.1',mappingRef:'normal-fixed-course'};
 const {installationGeneration,readBindingCurrentness,...config}=z.config;
 const verify=config.verifyMoodleAuthority;
 Object.assign(config,{mapping,readFixedMapping:()=>({mapping,actorRefs:config.actorRefs}),verifyMoodleAuthority:async request=>{
  const {installationGeneration,authorityEpoch,...v}=await verify(request);return {...v,version:'clear-moodle-fixed-scope-check.1',
   applicationRef:mapping.applicationId,displayOnly:true,authorityConsumptionAllowed:false};
 }});
 return {...z,config};
}
test('fixed live profile uses own CLEAR sessions and exact fresh C14 response with no B binding supplier',async t=>{
 const z=await fixedBoundaryFixture(t),{x}=z,before=x.bytes(),auth=x.authBytes();
 z.boundary.observeSession(x.f.aliceContext);z.boundary.observeSession(x.f.operatorContext);const host=z.boundary.createHost(z.config);
 for(const role of ['PARTICIPANT','COURSE_OPERATOR']){
  const r=await host.readCourse(z.handle(role));assert.equal(r.status,'OK');assert.equal(r.payment.version,'clear-moodle-fixed-payment-status.1');
  assert.equal(r.payment.mappingRef,z.config.mapping.mappingRef);assert.equal(r.payment.receipt.amountAtoms,'100000000');assert.equal(r.payment.role,role);
  assert.equal(r.evidence.decision.id,r.payment.decision.id);assert.equal(r.expiresAtExclusive,START+1);
  assert.equal(r.payment.paymentAuthority,false);assert.equal(r.payment.consent.usableForPayment,false);
 }
 assert.ok(z.verifies()>2);assert.equal(z.bindings(),0);assert.deepEqual(x.bytes(),before);assert.deepEqual(x.authBytes(),auth);
});
test('fixed Moodle shows the partial decision with a same-decision unobserved receipt',async t=>{
 const z=await fixedBoundaryFixture(t),{x}=z;
 const applicationId=x.f.create();
 await x.f.accept(applicationId,'activity-complete');
 await x.f.accept(applicationId,'assignment-submitted');
 const {participantId}=x.f.store.getApplication(x.f.aliceContext,applicationId);
 Object.assign(z.state,{applicationId,participantId});
 Object.assign(z.config.mapping,{applicationId,participantId});
 Object.assign(x.report,{applicationId,stages:[],claim:null,reviewTarget:null,completed:false});
 z.boundary.observeSession(x.f.aliceContext);
 const host=z.boundary.createHost(z.config),r=await host.readCourse(z.handle());
 assert.equal(r.status,'OK');
 assert.deepEqual(Object.fromEntries(r.evidence.criteria.map(c=>[c.criterionId,c.recordedState])),{
  'activity-complete':'MET','assignment-submitted':'MET','python-basic-certificate':'UNKNOWN','reflection-topics':'UNKNOWN'});
 assert.equal(r.evidence.decision.id,r.payment.decision.id);
 assert.equal(r.payment.decision.recordedConditionsStatus,'UNKNOWN');
 assert.equal(r.payment.receipt.state,'NOT_OBSERVED');
 assert.equal(r.payment.paymentAuthority,false);assert.equal(x.calls(),0);
});
for(const [key,value]of [['status','UNAVAILABLE'],['actorRef','wrong-teacher'],['subjectRef','wrong-student'],['courseRef','other-course'],
 ['installationRef','other-site'],['ownerRunId','other-run'],['expiresAtExclusive',START],['extra',true]])test('fixed C current '+key+' mismatch closes display',async t=>{
 const z=await fixedBoundaryFixture(t);z.boundary.observeSession(z.x.f.operatorContext);z.verifyHook(v=>({...v,[key]:value}));
 const host=z.boundary.createHost(z.config);unavailable(await host.readCourse(z.handle('COURSE_OPERATOR')));assert.equal(z.bindings(),0);assert.equal(z.x.calls(),0);
});
test('fixed profile never falls back to epoch/binding namespace or accepts mixed DTO',async t=>{
 const z=await fixedBoundaryFixture(t);
 assert.throws(()=>z.boundary.createHost({...z.config,installationGeneration:'invented'}),/FIXED_PORTS/);
 assert.throws(()=>z.boundary.createHost({...z.config,readBindingCurrentness:()=>({})}),/FIXED_PORTS/);
 assert.throws(()=>z.boundary.createHost({...z.config,readFixedMapping:undefined}),/PORTS/);
 const original=z.config.verifyMoodleAuthority;z.config.verifyMoodleAuthority=async r=>({...await original(r),authorityEpoch:1});
 z.boundary.observeSession(z.x.f.aliceContext);const host=z.boundary.createHost(z.config);unavailable(await host.readCourse(z.handle()));
});
for(const change of ['old11','applicationRef','displayOnly','authorityConsumptionAllowed','unknown-version'])test('fixed C14 rejects '+change,async t=>{
 const z=await fixedBoundaryFixture(t),original=z.config.verifyMoodleAuthority;
 z.config.verifyMoodleAuthority=async request=>{
  const r=await original(request);
  if(change==='old11'){delete r.applicationRef;delete r.displayOnly;delete r.authorityConsumptionAllowed;}
  if(change==='applicationRef')r.applicationRef='other-application';
  if(change==='displayOnly')r.displayOnly=false;
  if(change==='authorityConsumptionAllowed')r.authorityConsumptionAllowed=true;
  if(change==='unknown-version')r.version='clear-moodle-fixed-scope-check.2';return r;
 };
 z.boundary.observeSession(z.x.f.aliceContext);const host=z.boundary.createHost(z.config);unavailable(await host.readCourse(z.handle()));assert.equal(z.x.calls(),0);
});
test('fixed mapping changes during canonical await close display and require reconstruction',async t=>{
 const z=await fixedBoundaryFixture(t);z.boundary.observeSession(z.x.f.aliceContext);const host=z.boundary.createHost(z.config);
 z.x.onRead(async()=>{z.config.mapping.mappingRevision++;return z.x.receipt;});unavailable(await host.readCourse(z.handle()));
});
test('fixed teacher still needs its separate observed CLEAR login',async t=>{
 const z=await fixedBoundaryFixture(t);z.boundary.observeSession(z.x.f.aliceContext);const host=z.boundary.createHost(z.config);
 unavailable(await host.readCourse(z.handle('COURSE_OPERATOR')));assert.equal(z.x.calls(),0);
 z.boundary.observeSession(z.x.f.operatorContext);assert.equal((await host.readCourse(z.handle('COURSE_OPERATOR'))).status,'OK');
});
for(const action of ['logout','owner-change','abort','expired'])test('fixed current '+action+' during canonical await closes display',async t=>{
 const z=await fixedBoundaryFixture(t),controller=new AbortController();z.boundary.observeSession(z.x.f.aliceContext);const host=z.boundary.createHost(z.config);
 z.x.onRead(async()=>{
  if(action==='logout')z.x.f.service.logout(z.x.f.aliceContext);
  if(action==='owner-change')z.state.applicationId='different-application';
  if(action==='abort')controller.abort();
  if(action==='expired')z.x.setMono(5000);return z.x.receipt;
 });unavailable(await host.readCourse(z.handle(),{signal:controller.signal}));
});

test('fixed reverse HTTPS client pins logical Host, TLS CA, request, fresh nonce and rejects redirects/mixed data',async t=>{
 const z=await fixture(t),directory=join(z.x.f.directory,'fixed-client-tls');mkdirSync(directory,{mode:0o700});
 const fingerprint=createCertificates(directory),tls=loadTls(directory,fingerprint),secret=randomBytes(32).toString('hex'),nonces=new Set();
 let mode='OK',hits=0;
 const server=createServer(tls,(req,res)=>{let raw='';req.on('data',b=>raw+=b);req.on('end',()=>{
  hits++;assert.equal(req.method,'POST');assert.equal(req.url,'/local/clearbridge/authority.php');assert.equal(req.headers.host,'127.0.0.1:18768');
  assert.equal(req.headers.cookie,undefined);assert.equal(req.headers.authorization,undefined);
  const nonce=req.headers['x-clear-nonce'];assert.ok(!nonces.has(nonce));nonces.add(nonce);
  const signature=createHmac('sha256',secret).update(['CLEAR-MOODLE-AUTHORITY-A-TO-C-1',String(START),nonce,'POST',req.url,createHash('sha256').update(raw).digest('hex')].join('\n')).digest('hex');
  assert.equal(req.headers['x-clear-signature'],signature);const request=JSON.parse(raw);
  const result={...request,version:'clear-moodle-fixed-scope-check.1',status:'OK',installationRef:'fixed-moodle',courseRef:'fixed-course',
   subjectRef:'fixed-student',actorRef:'fixed-student',applicationRef:z.x.a,displayOnly:true,authorityConsumptionAllowed:false};
  if(mode==='redirect'){res.writeHead(302,{location:'https://127.0.0.1:1/never'});res.end();return;}
  if(mode==='cookie')res.setHeader('set-cookie','unwanted=1');
  if(mode==='epoch')result.authorityEpoch=1;
  if(mode==='wrong-request')result.requestRef='f'.repeat(64);
  if(mode==='expired')result.expiresAtExclusive=START;
  if(mode==='old11'){delete result.applicationRef;delete result.displayOnly;delete result.authorityConsumptionAllowed;}
  if(mode==='UNAVAILABLE'){result.status='UNAVAILABLE';for(const key of ['installationRef','courseRef','subjectRef','actorRef','applicationRef','expiresAtExclusive'])result[key]=null;}
  res.setHeader('content-type','application/json');res.end(mode==='oversize'?'x'.repeat(4097):JSON.stringify(result));
 });});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const options={ownerRunId:z.args.ownerRunId,secret,ca:readFileSync(join(directory,'ca.pem')),connectionPort:server.address().port,now:()=>START,monotonic:()=>0};
 const client=createFixedMoodleAuthorityVerifier(options);t.after(()=>client.close());const request=z.handle();
 assert.equal((await client.verify(request)).status,'OK');assert.equal((await client.verify(request)).status,'OK');assert.equal(hits,2);
 for(const failure of ['redirect','cookie','epoch','wrong-request','expired','old11','oversize']){
  mode=failure;const before=hits;await assert.rejects(client.verify(request));assert.equal(hits,before+1);
 }
 mode='UNAVAILABLE';assert.equal((await client.verify(request)).status,'UNAVAILABLE');
 const untrusted=createFixedMoodleAuthorityVerifier({...options,ca:'untrusted CA'});t.after(()=>untrusted.close());const before=hits;
 await assert.rejects(untrusted.verify(request));assert.equal(hits,before);
 await assert.rejects(client.verify({...request,connectionPort:1}));assert.equal(hits,before);
 const abort=new AbortController();abort.abort();await assert.rejects(client.verify(request,{signal:abort.signal}));assert.equal(hits,before);
 client.close();await assert.rejects(client.verify(request),/CLOSED/);
});

test('worker owner module is absent by default and only exact private hash-checked bytes load',async t=>{
 const z=await fixture(t),directory=join(z.x.f.directory,'private-owner');mkdirSync(directory,{mode:0o700});
 assert.equal(await loadNormalMoodleReadOwner({directory}),null);
 const source='export const createMoodleReadOptions = () => ({syntheticLoaderTest: true});',sha256=createHash('sha256').update(source).digest('hex');
 writeFileSync(join(directory,'moodle-read-owner.mjs'),source,{mode:0o600});
 await assert.rejects(loadNormalMoodleReadOwner({directory,sha256:'0'.repeat(64)}),/COURSE_READ_OWNER_PIN/);
 const create=await loadNormalMoodleReadOwner({directory,sha256});assert.deepEqual(create(),{syntheticLoaderTest:true});
 writeFileSync(join(directory,'moodle-read-owner.mjs'),source+'\n',{mode:0o600});
 await assert.rejects(loadNormalMoodleReadOwner({directory,sha256}),/COURSE_READ_OWNER_PIN/);
 const alias=join(z.x.f.directory,'alias-owner');symlinkSync(directory,alias);
 await assert.rejects(loadNormalMoodleReadOwner({directory:alias,sha256}));
});
function mountFixture(){
 let closed=0,stopped=0,listens=0,mapped=0,reads=0,bind=false,callback,resolveHook=null;
 const server=new EventEmitter();server.close=()=>{stopped++;};server.closeAllConnections=()=>{};
 const context=Object.freeze({report:()=>({runId:'synthetic-mount-run',applicationId:bind?'app-bound':null}),close:()=>{closed++;},pay(){assert.fail('no payment');},
  createMoodleCourseReadHost:config=>{assert.equal(config.ownerRunId,'synthetic-mount-run');assert.equal(bind,true);mapped++;return {readCourse:async()=>{reads++;return {status:'UNAVAILABLE',expiresAtExclusive:null,evidence:null,payment:null};}};}});
 const options={origin:'https://127.0.0.1:9443',secret:randomBytes(32).toString('hex'),tls:{key:'synthetic-test-only',cert:'synthetic-test-only'},
  createCourseReadServer:args=>{callback=args.readCourse;return server;},listen:async(s,origin)=>{assert.equal(s,server);assert.equal(origin,options.origin);listens++;},
  resolveReadOptions:async({report,signal})=>{if(resolveHook)await resolveHook();signal.throwIfAborted();if(!report.applicationId)throw Error('MAPPING_NOT_BOUND');return {ownerRunId:report.runId};}};
 return {context,options,server,bind:()=>{bind=true;},callback:(...a)=>callback(...a),hook:fn=>{resolveHook=fn;},counts:()=>({closed,stopped,listens,mapped,reads})};
}
test('worker attachment leaves default context untouched; explicit mount waits for bound mapping without automatic retry',async()=>{
 const z=mountFixture();assert.equal(await attachNormalMoodleReadServer({context:z.context}),z.context);assert.equal(z.counts().listens,0);
 const wrapped=await attachNormalMoodleReadServer({context:z.context,options:z.options});assert.equal(wrapped.pay,z.context.pay);assert.equal(z.counts().listens,1);
 await assert.rejects(z.callback(Object.freeze({})),/MAPPING_NOT_BOUND/);assert.equal(z.counts().mapped,0);
 z.bind();await z.callback(Object.freeze({}));await z.callback(Object.freeze({}));assert.equal(z.counts().mapped,1);assert.equal(z.counts().reads,2);
 wrapped.close();wrapped.close();assert.equal(z.counts().closed,1);assert.equal(z.counts().stopped,1);
 await assert.rejects(z.callback(Object.freeze({})),/COURSE_READ_CLOSED/);
});
test('worker attachment abort, listener failure and server error close only this context/read server',async()=>{
 for(const kind of ['abort','listen','server']){
  const z=mountFixture(),controller=new AbortController();
  if(kind==='listen'){z.options.listen=async()=>{throw Error('LISTEN_UNAVAILABLE');};await assert.rejects(attachNormalMoodleReadServer({context:z.context,options:z.options,signal:controller.signal}),/LISTEN_UNAVAILABLE/);}
  else{await attachNormalMoodleReadServer({context:z.context,options:z.options,signal:controller.signal});if(kind==='abort')controller.abort();else z.server.emit('error',Error('synthetic'));}
  assert.equal(z.counts().closed,1);assert.equal(z.counts().stopped,1);assert.equal(z.counts().mapped,0);
 }
});
test('worker attachment does not finish deferred mapping after cancellation or accept another run',async()=>{
 const z=mountFixture(),controller=new AbortController();z.bind();let release;
 z.hook(()=>new Promise(r=>{release=r;}));await attachNormalMoodleReadServer({context:z.context,options:z.options,signal:controller.signal});
 const pending=z.callback(Object.freeze({}));controller.abort();release();await assert.rejects(pending);assert.equal(z.counts().mapped,0);
 const other=mountFixture();other.bind();other.options.resolveReadOptions=async()=>({ownerRunId:'other-run'});
 const wrapped=await attachNormalMoodleReadServer({context:other.context,options:other.options});await assert.rejects(other.callback(Object.freeze({})),/COURSE_READ_OWNER_RUN/);wrapped.close();
});
