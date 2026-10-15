import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { studentHttpFixture,headersFor } from './student-http-fixture.mjs';
import { studentHttpExamplePolicies } from '../../specs/m3/student-http-example.mjs';
import { createStudentWorkflowClient } from '../../src/product-workflow/student-http-client.mjs';
import { createStudentWorkflowService } from '../../src/product-workflow/student-http-service.mjs';
const appPath=id=>'/mvp/applications/'+id;
const post=(f,path,body,key,context=f.aliceContext)=>f.request(path,{method:'POST',body,headers:{...headersFor(context),'idempotency-key':key}});

test('C1 participant creates a synthetic application, reviews exact display, records acknowledgment and resumes after restart',async t=>{
 const f=await studentHttpFixture(t),policies=await f.request('/mvp/policies');assert.equal(policies.status,200);assert.equal(policies.body.policies[0].configurationStatus,'SYNTHETIC_READY');
 const created=await f.create(),id=created.body.applicationId;assert.equal(created.status,200);assert.equal(created.body.result.state,'DRAFT');
 const displayed=await f.request(appPath(id)+'/agreement-preview');assert.equal(displayed.body.expectedRevision,1);assert.equal(displayed.body.binding.applicationId,id);
 assert.equal(displayed.body.display.displayVersion,'clear-mvp-student-display.1');assert.equal(displayed.body.previewVersion,'clear-mvp-student-preview.1');
 const body={expectedRevision:1,previewHash:displayed.body.previewHash,acknowledgement:'SYNTHETIC_ACK_ONLY'};
 const accepted=await post(f,appPath(id)+'/agreement',body,'agree-a');assert.equal(accepted.status,200);assert.equal(accepted.body.result.state,'ACKNOWLEDGED_SYNTHETIC');
 for(const key of ['userConsentVerified','identityVerified','sourceVerified','policyPublished','productEligible','paymentAllowed','documentSubmissionReady'])assert.equal(accepted.body.result[key],false);
 assert.equal(accepted.body.result.acknowledgment.current,true);assert.equal(accepted.body.result.acknowledgment.payload.preview.displayHash,displayed.body.displayHash);
 assert.deepEqual((await post(f,appPath(id)+'/agreement',body,'agree-a')).body,accepted.body);
 await f.restart();assert.deepEqual((await f.request('/mvp/student-operations/'+accepted.body.operationId)).body,accepted.body);
 assert.deepEqual((await f.request(appPath(id))).body,accepted.body.result);
 assert.equal((await f.request('/mvp/applications')).body.length,1);assert.equal((await f.request(appPath(id)+'/agreements')).body.length,1);
 assert.equal((await f.request('/mvp/applications/operations/create-a')).body.current,false); // create is historical after acknowledgment revision.
 assert.deepEqual((await f.request(appPath(id)+'/operations/agreement/agree-a')).body,accepted.body);
});

test('participant ownership and operator/CSRF/origin/Host separation apply to every student path',async t=>{
 const f=await studentHttpFixture(t),a=await f.create(),id=a.body.applicationId;
 for(const path of [appPath(id),appPath(id)+'/agreement-preview',appPath(id)+'/agreements','/mvp/student-operations/'+a.body.operationId,appPath(id)+'/operations/agreement/agree-a']){
  assert.equal((await f.request(path,{headers:headersFor(f.bobContext)})).status,404);
  assert.equal((await f.request(path,{headers:headersFor(f.operatorContext)})).status,403);
 }
 assert.deepEqual((await f.request('/mvp/applications',{headers:headersFor(f.bobContext)})).body,[]);
 assert.equal((await f.request('/mvp/policies',{headers:{}})).status,401);
 for(const headers of [{...headersFor(f.aliceContext),origin:'https://evil.invalid'},{...headersFor(f.aliceContext),host:'evil.invalid'},
  {...headersFor(f.aliceContext),'sec-fetch-site':'cross-site'},{...headersFor(f.aliceContext),'x-wallet':f.bob.address}])assert.equal((await f.request('/mvp/policies',{headers})).status,403);
 const badHeaders={...headersFor(f.aliceContext),'x-csrf-token':'','idempotency-key':'bad'};
 const p=(await f.request('/mvp/policies')).body.policies[0];assert.equal((await f.request('/mvp/applications',{method:'POST',body:{policyHash:p.policyHash},headers:badHeaders})).status,403);
});

test('display mismatch, another application preview, synthetic scope tampering and duplicate keys are rejected',async t=>{
 const f=await studentHttpFixture(t),a=await f.create(),b=await f.create('create-b',f.bobContext),id=a.body.applicationId;
 const p=(await f.request(appPath(id)+'/agreement-preview')).body,other=(await f.request(appPath(b.body.applicationId)+'/agreement-preview',{headers:headersFor(f.bobContext)})).body;
 const base={expectedRevision:1,previewHash:p.previewHash,acknowledgement:'SYNTHETIC_ACK_ONLY'};
 assert.equal((await post(f,appPath(id)+'/agreement',{...base,previewHash:other.previewHash},'wrong-preview')).status,409);
 assert.equal((await post(f,appPath(id)+'/agreement',{...base,acknowledgement:'REAL_CONSENT'},'wrong-scope')).status,422);
 assert.equal((await post(f,appPath(id)+'/agreement',{...base,verified:true},'wrong-flags')).status,422);
 const ok=await post(f,appPath(id)+'/agreement',base,'same-key');assert.equal(ok.status,200);
 assert.equal((await post(f,appPath(id)+'/agreement',{...base,expectedRevision:2},'same-key')).body.code,'IDEMPOTENCY_CONFLICT');
 assert.equal((await post(f,appPath(id)+'/agreement',base,'different-key')).body.code,'MVP_STALE');
 assert.equal((await f.create('another-create')).body.code,'MVP_APPLICATION_EXISTS');
});

test('configured policy revision changes require explicit selection and a new exact-display acknowledgment',async t=>{
 const f=await studentHttpFixture(t),created=await f.create(),id=created.body.applicationId;
 const oldPreview=(await f.request(appPath(id)+'/agreement-preview')).body;
 const ack=await post(f,appPath(id)+'/agreement',{expectedRevision:1,previewHash:oldPreview.previewHash,acknowledgement:'SYNTHETIC_ACK_ONLY'},'old-ack');
 await f.restart(studentHttpExamplePolicies(2));
 const stale=(await f.request(appPath(id))).body;assert.equal(stale.state,'POLICY_CHANGED');assert.equal(stale.acknowledgment.current,false);
 assert.equal((await f.request('/mvp/student-operations/'+ack.body.operationId)).body.result,null);
 const current=(await f.request('/mvp/policies')).body.policies[0];assert.equal(current.policyRevision,2);
 const changed=await post(f,appPath(id)+'/policy-selection',{expectedRevision:2,policyHash:current.policyHash},'choose-v2');assert.equal(changed.body.result.state,'DRAFT');
 const next=(await f.request(appPath(id)+'/agreement-preview')).body;assert.equal(next.expectedRevision,3);assert.notEqual(next.previewHash,oldPreview.previewHash);assert.equal(next.binding.bindingRevision,2);
 assert.equal((await post(f,appPath(id)+'/agreement',{expectedRevision:3,previewHash:oldPreview.previewHash,acknowledgement:'SYNTHETIC_ACK_ONLY'},'bad-old-preview')).status,409);
 assert.equal((await post(f,appPath(id)+'/agreement',{expectedRevision:3,previewHash:next.previewHash,acknowledgement:'SYNTHETIC_ACK_ONLY'},'ack-v2')).body.result.state,'ACKNOWLEDGED_SYNTHETIC');
 const history=(await f.request(appPath(id)+'/agreements')).body;assert.equal(history.length,2);assert.equal(history[0].current,true);assert.equal(history[1].current,false);
});

test('no configured synthetic policy blocks new applications without publishing or upgrading a source draft',async t=>{
 const f=await studentHttpFixture(t,{policies:[]});assert.deepEqual((await f.request('/mvp/policies')).body.policies,[]);
 assert.equal((await post(f,'/mvp/applications',{policyHash:'0x'+'00'.repeat(32)},'missing-policy')).body.code,'MVP_POLICY_UNAVAILABLE');
 const official=studentHttpExamplePolicies();official[0].draft.mode='OFFICIAL_DRAFT';
 assert.throws(()=>createStudentWorkflowService({directory:join(f.directory,'reject-official'),authentication:f.service,instanceId:'student-test',policies:official}),/MVP_OFFICIAL_BLOCKED/);
 for(const path of ['/mvp/policies','/mvp/applications/0x'+'11'.repeat(32)+'/submissions','/mvp/applications/0x'+'11'.repeat(32)+'/review-runs'])assert.equal((await post(f,path,{},'unimplemented')).status,404);
});

test('C1 browser client recovers create response by key and cannot inject student identity or overwrite F0 DTO',async t=>{
 const f=await studentHttpFixture(t),client=createStudentWorkflowClient({request:async(path,options={})=>{
  const r=await f.request(path,{method:options.method,body:options.body,headers:{...headersFor(f.aliceContext),...(options.idempotencyKey?{'idempotency-key':options.idempotencyKey}:{})}});
  if(r.status!==200)throw Object.assign(Error('API_REQUEST_FAILED'),{status:r.status});return r.body;
 }});
 const p=(await client.policies()).policies[0],created=await client.create({policyHash:p.policyHash},{idempotencyKey:'client-create'});
 assert.deepEqual(await client.recoverCreate('client-create'),created);assert.equal((await client.list()).length,1);
 assert.equal((await post(f,'/mvp/applications',{policyHash:p.policyHash,learner:f.bob.address},'inject-wallet')).status,422);
 assert.deepEqual((await f.request('/applications')).body,[]);
 const source=await f.request('/mvp/source-bundles');assert.equal(source.status,404); // absent source service is not silently enabled.
 const db=new DatabaseSync(join(f.directory,'mvp-student.sqlite'));
 assert.throws(()=>db.prepare('UPDATE commands SET result=? WHERE id=?').run('{}',created.operationId),/IMMUTABLE_STUDENT_COMMAND/);db.close();
});

test('removing the configured policy disables current acknowledgment without deleting its immutable history',async t=>{
 const f=await studentHttpFixture(t),a=await f.create(),id=a.body.applicationId,p=(await f.request(appPath(id)+'/agreement-preview')).body;
 await post(f,appPath(id)+'/agreement',{expectedRevision:1,previewHash:p.previewHash,acknowledgement:'SYNTHETIC_ACK_ONLY'},'ack-before-disable');
 await f.restart([]);const current=(await f.request(appPath(id))).body;assert.equal(current.state,'POLICY_UNAVAILABLE');assert.equal(current.acknowledgment.current,false);
 assert.deepEqual((await f.request('/mvp/policies')).body.policies,[]);assert.equal((await f.request(appPath(id)+'/agreements')).body.length,1);
});

test('configured policy rollback/conflicting revision fails closed and leaves the current policy unchanged',async t=>{
 const f=await studentHttpFixture(t,{policies:studentHttpExamplePolicies(2)});
 for(const definitions of [studentHttpExamplePolicies(1),studentHttpExamplePolicies(2).map(p=>({...p,draft:{...p.draft,policyVersion:'conflicting-version'}})),studentHttpExamplePolicies(2).map(p=>({...p,revision:3}))]){
  assert.throws(()=>createStudentWorkflowService({directory:f.directory,authentication:f.service,instanceId:'student-test',policies:definitions}),/MVP_POLICY_(ROLLBACK|CONFLICT)/);
 }
 assert.equal((await f.request('/mvp/policies')).body.policies[0].policyRevision,2);
});

test('clock reversal cannot timestamp a new acknowledgment before the prior application revision',async t=>{
 const f=await studentHttpFixture(t),created=await f.create(),id=created.body.applicationId,p=(await f.request(appPath(id)+'/agreement-preview')).body;
 const body={expectedRevision:1,previewHash:p.previewHash,acknowledgement:'SYNTHETIC_ACK_ONLY'};f.setTime(99);
 const denied=await post(f,appPath(id)+'/agreement',body,'clock-a');assert.equal(denied.status,422);assert.equal(denied.body.code,'MVP_CLOCK');
 f.setTime(100);assert.equal((await f.request(appPath(id))).body.workflowRevision,1);assert.equal((await f.request(appPath(id)+'/agreements')).body.length,0);
 f.setTime(101);assert.equal((await post(f,appPath(id)+'/agreement',body,'clock-a')).body.result.state,'ACKNOWLEDGED_SYNTHETIC');
});

test('two competing acknowledgment requests accept one revision and retain one immutable acknowledgment',async t=>{
 const f=await studentHttpFixture(t),created=await f.create(),id=created.applicationId??created.body.applicationId,p=(await f.request(appPath(id)+'/agreement-preview')).body;
 const body={expectedRevision:1,previewHash:p.previewHash,acknowledgement:'SYNTHETIC_ACK_ONLY'};
 const replies=await Promise.all([post(f,appPath(id)+'/agreement',body,'race-a'),post(f,appPath(id)+'/agreement',body,'race-b')]);
 assert.deepEqual(replies.map(r=>r.status).sort(),[200,409]);assert.equal((await f.request(appPath(id)+'/agreements')).body.length,1);
 const db=new DatabaseSync(join(f.directory,'mvp-student.sqlite'));
 assert.throws(()=>db.prepare('UPDATE acknowledgments SET record=?').run('{}'),/IMMUTABLE_STUDENT_ACK/);db.close();
});


test('clock reversal cannot expose a future application or acknowledgment through reads or replay',async t=>{
 const f=await studentHttpFixture(t),created=await f.create(),id=created.body.applicationId,p=(await f.request(appPath(id)+'/agreement-preview')).body;
 f.setTime(200);const body={expectedRevision:1,previewHash:p.previewHash,acknowledgement:'SYNTHETIC_ACK_ONLY'};
 const ack=await post(f,appPath(id)+'/agreement',body,'future-ack');assert.equal(ack.status,200);f.setTime(150);
 for(const path of [appPath(id),appPath(id)+'/agreement-preview',appPath(id)+'/agreements','/mvp/applications','/mvp/student-operations/'+ack.body.operationId,appPath(id)+'/operations/agreement/future-ack']){
  const r=await f.request(path);assert.equal(r.status,422,path);assert.equal(r.body.code,'MVP_CLOCK');
 }
 assert.equal((await post(f,appPath(id)+'/agreement',body,'future-ack')).body.code,'MVP_CLOCK');
 assert.equal((await f.request(appPath(id),{headers:headersFor(f.bobContext)})).status,404);
 assert.equal((await f.request(appPath(id),{headers:headersFor(f.operatorContext)})).status,403);
 await f.restart();assert.equal((await f.request(appPath(id))).body.code,'MVP_CLOCK');
 f.setTime(201);assert.deepEqual((await f.request('/mvp/student-operations/'+ack.body.operationId)).body,ack.body);
});

test('same-key POST replay revalidates the session inside the command transaction',async t=>{
 const f=await studentHttpFixture(t);let armed=false,calls=0;
 const authentication={origin:f.service.origin,authorizeWorkflow(context,write){
  if(armed&&++calls===2)f.service.logout(context);
  return f.service.authorizeWorkflow(context,write);
 }};
 const service=createStudentWorkflowService({directory:join(f.directory,'transaction-replay'),authentication,instanceId:'replay-test',policies:studentHttpExamplePolicies(),now:()=>100});
 try{
  const body={policyHash:service.policies(f.aliceContext).policies[0].policyHash};service.create(f.aliceContext,body,'replay');armed=true;
  assert.throws(()=>service.create(f.aliceContext,body,'replay'),/AUTH_REQUIRED/);assert.equal(calls,2);
  const fresh=await f.login(f.alice);assert.equal(service.recover(fresh,'applications','replay').state,'RECORDED');
 }finally{service.close();}
});
