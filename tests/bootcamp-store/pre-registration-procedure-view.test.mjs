// Offline HTTPS only. Synthetic wallets/ports; no Moodle, source, chain or AI runs.
// Before chain registration the registered chain/funding ports have no binding and throw.
// The participant/operator card view must still read the same application's current
// conditions as display-only, while consent stays blocked until registration.
import test from 'node:test';
import assert from 'node:assert/strict';
import {request as httpsRequest} from 'node:https';
import {once} from 'node:events';
import {mkdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {compileFunction} from 'node:vm';
import {procedureFixture,START} from './procedure-fixture.mjs';
import {createCertificates,loadTls} from '../../src/dev/tls.mjs';
import {createBootcampFrontendServer} from '../../tools/bootcamp/frontend-server.mjs';
import {createNormalBootcampClient} from '../../src/bootcamp/normal-client.mjs';
import {requireRule} from '../../src/policy/values.mjs';

// The exact live-context fragment, compiled against test doubles for its closure variables.
const live=readFileSync(new URL('../../tools/bootcamp/live-context.mjs',import.meta.url),'utf8');
const start=live.indexOf('  const procedureReadMode=(c,a)=>{'),end=live.indexOf("'SOURCE_ONLY':'CANONICAL';};",start);
assert(start>=0&&end>start,'procedureReadMode fragment');
const compileReadMode=vars=>compileFunction(live.slice(start,end)+"'SOURCE_ONLY':'CANONICAL';};return procedureReadMode;",
 ['store','failureState','activityReturnOnly','certificateCardOnly','app','report'])(vars.store,vars.failureState??null,
 vars.activityReturnOnly??false,vars.certificateCardOnly??false,vars.app,vars.report);

async function fixture(t,{withReadMode=true}={}){
 const f=await procedureFixture(t),a=f.create(),report={};let registered=false,refreshes=0;
 await f.complete(a);
 // Registered chain/funding ports throw until the application has a chain binding.
 f.setHook(()=>{if(!registered)throw Error('BC_E3_REGISTERED_BINDING');});
 const procedureReadMode=compileReadMode({store:f.store,app:a,report});
 const normalUi={getSession(){return null;},...(withReadMode?{procedureReadMode}:{}),
  async refreshProcedure(c,id){f.store.getOperationsProjection(c,id);refreshes++;requireRule(id===a&&!!report.chainApplicationId,'BC_NORMAL_PROCEDURE_NOT_READY');}};
 const dir=join(f.directory,'ui-tls');mkdirSync(dir,{mode:0o700});const fingerprint=createCertificates(dir);
 const mounted=createBootcampFrontendServer({authentication:f.service,store:f.store,tls:loadTls(dir,fingerprint),sourceMode:'REGISTERED_TEST_SOURCE',chainId:f.config.chainId,normalUi});
 mounted.server.listen(0,'127.0.0.1');await once(mounted.server,'listening');
 t.after(async()=>{mounted.server.closeAllConnections();await new Promise(r=>mounted.server.close(r));await mounted.drain();});
 const raw=(path,{context=f.aliceContext,method='GET',body,headers={}}={})=>new Promise((resolve,reject)=>{
  const req=httpsRequest({hostname:'127.0.0.1',servername:'localhost',port:mounted.server.address().port,path,method,ca:readFileSync(join(dir,'ca.pem')),
   headers:{host:'clear.example.invalid',origin:f.config.origin,cookie:'__Host-clear-session='+context.token,'x-wallet':context.wallet,'x-chain-id':String(context.chainId),
    'x-csrf-token':context.csrf,...(body===undefined?{}:{'content-type':'application/json'}),...headers}},
   res=>{const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks))}));});
  req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));});
 const client=context=>createNormalBootcampClient({request:async(path,options)=>{const r=await raw(path,{...options,context});
  if(r.status!==200)throw Object.assign(Error(r.body.error),{code:r.body.error});return r.body;}});
 return {f,a,report,raw,client,refreshes:()=>refreshes,register(){registered=true;report.chainApplicationId='chain-'+a;}};
}

test('before chain registration both roles read the current conditions display-only; consent stays blocked',async t=>{
 const x=await fixture(t),path=`/bootcamp/v3/applications/${x.a}`;
 assert.throws(()=>x.f.store.getProcedure(x.f.aliceContext,x.a),/BC_E3_REGISTERED_BINDING/,'canonical read is unchanged and still needs registration');

 const view=await x.client(x.f.aliceContext).view(x.a);
 assert.equal(view.displayOnly,true);assert.equal(view.role,'PARTICIPANT');assert.equal(view.decision.conditionsStatus,'MET');
 assert.deepEqual(view.criteria.map(r=>[r.criterionId,r.state,r.current]),[['activity-complete','MET',true],['assignment-submitted','MET',true],
  ['reflection-topics','MET',true],['python-basic-certificate','MET',true]]);
 assert(Number.isSafeInteger(view.target.expectedRevision)&&view.target.targetDecisionId===view.decision.id);
 assert.equal(view.funding.implementation,'NOT_IMPLEMENTED');assert.equal(view.payment.acceptedRight,null);assert.equal(view.procedure.id,null);

 const operator=await x.client(x.f.operatorContext).view(x.a);
 assert.equal(operator.role,'COURSE_OPERATOR');assert.equal(operator.decision.hash,view.decision.hash);
 assert.equal((await x.raw(path+'/procedure',{context:x.f.bobContext})).status,403,'another participant is still refused');
 assert.equal(x.refreshes(),0,'display read never touches the chain refresh');

 const p=(await x.raw(path+'/procedure')).body;assert.equal(p.execution.status,'BLOCKED');assert.equal(p.execution.paymentAuthority,false);
 const consent=await x.raw(path+'/review-consents',{method:'POST',headers:{'idempotency-key':'pre-registration-consent'},
  body:{expectedRevision:p.applicationRevision,expectedLedgerSequence:p.ledgerSequence,targetDecisionId:p.decisionId,targetDecisionRevision:p.decisionRevision,targetDecisionHash:p.decisionHash,value:'AGREE'}});
 assert.deepEqual([consent.status,consent.body.error],[409,'BC_NORMAL_PROCEDURE_NOT_READY']);
 assert.equal((await x.raw(path+'/procedure')).body.consent.records.length,0);
});

test('after registration the canonical refreshed procedure is used again; source-only read refuses a started procedure',async t=>{
 const x=await fixture(t),path=`/bootcamp/v3/applications/${x.a}`;x.register();
 const p=await x.raw(path+'/procedure');assert.equal(p.status,200);assert.equal(x.refreshes(),1);
 assert.equal(p.body.funding.implementation,'SYNTHETIC_PORT_FIXTURE');
 x.f.publish(x.a);
 assert.throws(()=>x.f.store.getSourceProcedure(x.f.aliceContext,x.a),/BC_NORMAL_PROCEDURE_NOT_READY/);
});

test('read mode is source-only only for the bound application before registration in full mode',async t=>{
 const f=await procedureFixture(t),a=f.create(),b=f.create(f.bobContext),mode=vars=>compileReadMode({store:f.store,app:a,report:{},...vars});
 assert.equal(mode({})(f.aliceContext,a),'SOURCE_ONLY');
 assert.equal(mode({report:{chainApplicationId:'chain-a'}})(f.aliceContext,a),'CANONICAL');
 for(const flag of [{failureState:{}},{activityReturnOnly:true},{certificateCardOnly:true}])assert.equal(mode(flag)(f.aliceContext,a),'CANONICAL');
 assert.equal(mode({})(f.bobContext,b),'CANONICAL');
 assert.throws(()=>mode({})(f.bobContext,a),/BC_|FORBIDDEN|403/,'authorization runs before any mode decision');
});

test('reproduction: without the read mode the same pre-registration view is the old HTTP 409',async t=>{
 const x=await fixture(t,{withReadMode:false}),r=await x.raw(`/bootcamp/v3/applications/${x.a}/procedure`);
 assert.deepEqual([r.status,r.body.error],[409,'BC_NORMAL_PROCEDURE_NOT_READY']);
});

test('expired evidence is never shown as current MET before registration',async t=>{
 const x=await fixture(t);x.f.setTime(START+600);
 const view=await x.client(x.f.aliceContext).view(x.a);
 assert.equal(view.decision.conditionsStatus,'UNKNOWN');assert.equal(view.decision.evidenceCurrent,false);
 assert(view.criteria.every(r=>r.current===false));assert.equal(view.procedure.status,'SOURCE_REVERIFICATION_REQUIRED');
});
