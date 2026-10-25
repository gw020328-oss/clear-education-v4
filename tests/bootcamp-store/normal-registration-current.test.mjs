// Offline: real SQLite/evaluator/procedure code, invented evidence and fixed time.
// No source login, proof, network, paid AI, wallet consent or chain transaction.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {procedureFixture,START} from './procedure-fixture.mjs';
import {RuleError} from '../../src/policy/values.mjs';
import {readNormalView,normalSourceTarget,normalProcedureBody,registerNormalSourceTarget} from '../../tools/bootcamp/normal-current-view.mjs';

async function fixture(t){
 let executions=0,collections=0,reflections=0;
 const f=await procedureFixture(t,{fault:stage=>{if(stage==='e3-before-command')executions++;},
  authority:{beforeVerify:async r=>{collections++;if(r.criterionId==='reflection-topics')reflections++;}}});
 let armed=null,ticks=0;
 f.configuration.now=()=>{if(armed)armed(++ticks);return f.time;};f.restart();
 const a=f.create();
 // Simulate the existing human AI approval delay before consuming the fourth
 // request; the producer is an offline fixture and is still called only once.
 for(const c of ['python-basic-certificate','activity-complete','assignment-submitted','reflection-topics']){
  const r=f.request(a,c);if(c==='reflection-topics')f.setTime(START+215);
  await f.store.collect(f.aliceContext,a,{requestId:r.record.target.requestId,expectedRevision:r.record.applicationRevision},f.key());
 }
 f.setFull(false);const sourceTarget=normalSourceTarget(f.store.getApplication(f.aliceContext,a)),body=f.body(a),key=f.key();
 const stats=()=>{const db=new DatabaseSync(join(f.directory,'bootcamp.sqlite'),{readOnly:true});try{
  return {registrations:db.prepare("SELECT count(*) n FROM e3_records WHERE kind='REGISTRATION_TARGET'").get().n,
   ids:db.prepare('SELECT count(*) n FROM e3_ids').get().n,procedures:db.prepare('SELECT count(*) n FROM e3_procedures').get().n,
   consents:db.prepare("SELECT count(*) n FROM e3_records WHERE kind='CONSENT'").get().n,
   failed:db.prepare("SELECT count(*) n FROM r2_metrics WHERE json_extract(record,'$.eventType')='OPERATION_FAILED'").get().n,
   consumed:db.prepare("SELECT count(*) n FROM requests WHERE status='CONSUMED'").get().n};
 }finally{db.close();}};
 return {f,a,body,key,sourceTarget,stats,get executions(){return executions;},get collections(){return collections;},get reflections(){return reflections;},
  arm(fn){ticks=0;armed=fn;},disarm(){armed=null;},
  register:b=>f.store.registerCurrentMetForE4(f.aliceContext,a,b??body,key)};
}

test('registration crosses one second after four MET sources and commits exactly one fresh registration',async t=>{
 const x=await fixture(t);x.arm(n=>{if(n===2)x.f.setTime(START+216);});
 const r=x.register();x.disarm();
 assert.equal(x.executions,2);assert.equal(r.record.committedAt,START+216);
 const intake=x.f.store.inspectRegistrationForE4(x.f.aliceContext,x.a,r.record.target.registrationTargetId);
 assert.equal(intake.record.recordedAt,START+216);assert.equal(intake.record.sourceValidUntilExclusive,START+300);
 assert.deepEqual(x.stats(),{registrations:1,ids:3,procedures:0,consents:0,failed:0,consumed:4});
 assert.deepEqual(x.register(),r);assert.equal(x.executions,2); // exact same key/body replay
 assert.throws(()=>x.register({...x.body,targetDecisionRevision:99}),/BC_IDEMPOTENCY_CONFLICT/);
 assert.equal(x.collections,4);assert.equal(x.reflections,1);
});

test('normal source handoff refreshes only reads and reuses the original collected decision',async t=>{
 const x=await fixture(t);let registered=0,refreshed=0,bound=0,keys=0,registerCalls=0;
 const store={getApplication:(...args)=>x.f.store.getApplication(...args),getProcedure:(...args)=>x.f.store.getProcedure(...args),
  inspectRegistrationForE4:(...args)=>x.f.store.inspectRegistrationForE4(...args),
  registerCurrentMetForE4(...args){registerCalls++;x.arm(n=>{if(n===2)x.f.setTime(x.f.time+1);});return x.f.store.registerCurrentMetForE4(...args);}};
 const connection={registerApplication(){registered++;},async refresh(){refreshed++;},bindOpaque(){bound++;}};
 // First getApplication fails at the old projection's second boundary. The
 // discarded read cannot become the target; the fresh authenticated one does.
 x.arm(n=>{if(n===2)x.f.setTime(START+216);});
 const result=await registerNormalSourceTarget({store,connection,user:x.f.aliceContext,app:x.a,key:()=>{keys++;return x.key;},sourceTarget:x.sourceTarget});
 x.disarm();assert.deepEqual(result.target,x.sourceTarget);assert.equal(result.intake.record.paymentAuthority,false);
 assert.deepEqual([registered,refreshed,bound,keys,registerCalls,x.collections,x.reflections],[1,1,1,1,1,4,1]);
 assert.deepEqual(x.stats(),{registrations:1,ids:3,procedures:0,consents:0,failed:0,consumed:4});
});

test('a second clock conflict exhausts the one retry and rolls back every registration ID',async t=>{
 const x=await fixture(t);x.arm(n=>{if(n===2||n===6)x.f.setTime(x.f.time+1);});
 assert.throws(()=>x.register(),/BC_VIEW_STALE/);x.disarm();assert.equal(x.executions,2);
 assert.deepEqual(x.stats(),{registrations:0,ids:0,procedures:0,consents:0,failed:1,consumed:4});
});

for(const kind of ['expiry','source-change','clock-reversal'])test(`real ${kind} during registration is never retried or accepted`,async t=>{
 const x=await fixture(t);x.arm(n=>{if(n!==2)return;
  if(kind==='expiry')x.f.setTime(START+301);
  if(kind==='source-change')x.f.change(x.a,'activity-complete',{rawAvailable:false});
  if(kind==='clock-reversal')x.f.setTime(START+214);
 });
 assert.throws(()=>x.register(),/BC_VIEW_STALE|BC_E3_PORT_CHANGED|BC_E3_CURRENT_MET_REQUIRED/);x.disarm();assert.equal(x.executions,1);
 assert.equal(x.stats().registrations,0);assert.equal(x.stats().ids,0);
 if(kind==='clock-reversal')x.f.setTime(START+215);
 assert.notEqual(x.f.store.getApplication(x.f.aliceContext,x.a).decision.record.conditionsStatus,'MET');
});

test('expiry during rollback is committed and prevents the clock-only retry',async t=>{
 const x=await fixture(t);x.arm(n=>{if(n===2)x.f.setTime(START+216);if(n===4)x.f.setTime(START+301);});
 assert.throws(()=>x.register(),/BC_VIEW_STALE/);x.disarm();assert.equal(x.executions,1);
 assert.equal(x.stats().registrations,0);assert.notEqual(x.f.store.getApplication(x.f.aliceContext,x.a).decision.record.conditionsStatus,'MET');
});

test('the exact E3 source cutoff still rejects even when the ledger head has one second left',async t=>{
 const x=await fixture(t);x.f.setTime(START+299);x.arm(n=>{if(n===2)x.f.setTime(START+300);});
 assert.throws(()=>x.register(),/BC_E3_CURRENT_MET_REQUIRED/);x.disarm();assert.equal(x.executions,1);
 assert.equal(x.stats().registrations,0);assert.equal(x.stats().ids,0);
 assert.equal(x.f.store.getApplication(x.f.aliceContext,x.a).decision.record.conditionsStatus,'MET');
 assert.equal(x.f.view(x.a).evidence.current,false);
});

test('human consent commands never opt into the internal registration retry',async t=>{
 const x=await fixture(t);x.f.setFull(true);x.f.publish(x.a);const body=x.f.body(x.a,{value:'AGREE'}),before=x.executions;
 x.arm(n=>{if(n===2)x.f.setTime(START+216);});
 x.f.store.recordReviewConsent(x.f.aliceContext,x.a,body,x.f.key());
 x.disarm();assert.equal(x.executions,before+1);assert.equal(x.stats().consents,1);
});

test('authentication is reacquired after a clock rollback; logout cannot be reused',async t=>{
 const x=await fixture(t);x.arm(n=>{if(n===2)x.f.setTime(START+216);if(n===4)x.f.service.logout(x.f.aliceContext);});
 assert.throws(()=>x.register(),/AUTH_REQUIRED/);x.disarm();assert.equal(x.executions,1);assert.equal(x.stats().registrations,0);
});

for(const [field,value,code] of [['expectedRevision',1,'BC_VIEW_STALE'],['expectedLedgerSequence',0,'BC_VIEW_STALE'],['targetDecisionRevision',1,'BC_DECISION_TARGET'],['targetDecisionHash','0x'+'99'.repeat(32),'BC_DECISION_TARGET']])
 test(`old ${field} is rejected without rebasing the caller's target`,async t=>{
  const x=await fixture(t);assert.throws(()=>x.register({...x.body,[field]:value}),new RegExp(code));assert.equal(x.executions,0);assert.equal(x.stats().registrations,0);
 });

test('a changed chain port fails before clock retry and does not register a target',async t=>{
 const x=await fixture(t);let seen=0;x.f.setHook(k=>{if(k==='funding'&&++seen===2)x.f.setFull(true);});
 assert.throws(()=>x.register(),/BC_E3_PORT_CHANGED/);assert.equal(x.executions,1);assert.equal(x.stats().registrations,0);
});

test('read refresh never converts an expired source into a MET payment target',async t=>{
 const x=await fixture(t);x.arm(n=>{if(n===2)x.f.setTime(START+301);});
 const v=readNormalView(()=>x.f.store.getApplication(x.f.aliceContext,x.a));x.disarm();
 assert.throws(()=>normalSourceTarget(v),/BC_NORMAL_NOT_MET/);assert.equal(x.stats().registrations,0);
});

test('changed collected target is rejected before any connection registration or consent body',async t=>{
 const x=await fixture(t);let calls=0;const connection={registerApplication(){calls++;}};
 await assert.rejects(registerNormalSourceTarget({store:x.f.store,connection,user:x.f.aliceContext,app:x.a,key:x.f.key,
  sourceTarget:{...x.sourceTarget,decisionHash:'0x'+'88'.repeat(32)}}),/BC_NORMAL_SOURCE_CHANGED/);
 assert.equal(calls,0);
 assert.throws(()=>normalProcedureBody(x.f.store,x.f.aliceContext,x.a,{...x.sourceTarget,applicationRevision:1}),/BC_NORMAL_SOURCE_CHANGED/);
});

test('read refresh is bounded and only recognizes the exact typed projection error',()=>{
 for(const error of [Error('BC_VIEW_STALE'),new RuleError('BC_CLOCK_REVERSED'),new RuleError('AUTH_REQUIRED'),
  new Proxy({},{getPrototypeOf(){throw Error('trap');}})]){
  let calls=0;assert.throws(()=>readNormalView(()=>{calls++;throw error;}),e=>e===error);assert.equal(calls,1);
 }
 let calls=0;assert.throws(()=>readNormalView(()=>{calls++;throw new RuleError('BC_VIEW_STALE');}),/BC_VIEW_STALE/);assert.equal(calls,2);
});
