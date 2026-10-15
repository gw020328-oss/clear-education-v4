import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { digest } from '../../src/policy/mvp/contract.mjs';
import {documentHttpFixture,headersFor} from './document-http-fixture.mjs';
const path=app=>'/mvp/applications/'+app;
const start=(f,app,sub,method='CODE',key='run')=>f.post(path(app)+'/review-runs',{expectedWorkflowRevision:sub.workflowRevision,submissionId:sub.submissionId,expectedSubmissionRevision:sub.submissionRevision,method},key);
test('C2 exact C1/document confirmations, actual bytes, single receipt and restart recovery',async t=>{
 const f=await documentHttpFixture(t),app=await f.create(),ack=await f.acknowledge(app);assert.equal(ack.status,200);
 const submitted=await f.submit(app);assert.equal(submitted.status,200);const sub=submitted.body.result;assert.equal(sub.rawAvailable,true);
 const run=await start(f,app,sub);assert.equal(run.status,200);await f.documents.idle();
 const result=await f.request(path(app)+'/review-runs/'+run.body.result.runId);assert.equal(result.body.state,'ACCEPTED');assert.equal(result.body.summary.reviewStatus,'CHECKED');
 assert.equal((await f.request(path(app)+'/submissions/'+sub.submissionId)).body.rawAvailable,false);
 await f.restart();assert.deepEqual((await f.request(path(app)+'/review-runs/'+run.body.result.runId)).body,result.body);
 assert.deepEqual((await f.request(path(app)+'/document-operations/review-runs/run')).body.result,result.body);
});
test('received file bytes are hashed and undecoded images remain held for every method',async t=>{
 const f=await documentHttpFixture(t),app=await f.create();await f.acknowledge(app);const sub=(await f.submit(app,'image')).body.result;
 assert.equal(sub.manifest.files[0].validation,'SIGNATURE_ONLY_NOT_DECODED');
 const run=await start(f,app,sub);await f.documents.idle();const r=(await f.request(path(app)+'/review-runs/'+run.body.result.runId)).body;
 assert.equal(r.state,'ACCEPTED');assert.equal(r.summary.reviewStatus,'NEEDS_REVIEW');assert.ok(r.summary.reasons.some(x=>x.code==='IMAGE_NOT_DECODED'));
});

test('all C2 paths preserve owner404/operator403 and pre-body session/CSRF/Origin checks',async t=>{
 const f=await documentHttpFixture(t),app=await f.create();await f.acknowledge(app);const sub=(await f.submit(app)).body.result,run=await start(f,app,sub);await f.documents.idle();
 for(const suffix of ['/document-preview','/submissions','/submissions/'+sub.submissionId,'/review-runs/'+run.body.result.runId,'/document-operations/'+run.body.operationId,'/document-operations/submissions/submit']){
  assert.equal((await f.request(path(app)+suffix,{headers:headersFor(f.bobContext)})).status,404,suffix);
  assert.equal((await f.request(path(app)+suffix,{headers:headersFor(f.operatorContext)})).status,403,suffix);
 }
 assert.equal((await f.request(path(app)+'/submissions',{method:'POST',body:{pad:'x'.repeat(400000)},headers:{}})).status,401);
 assert.equal((await f.request(path(app)+'/submissions',{method:'POST',body:{},headers:{...headersFor(f.aliceContext),'x-csrf-token':''}})).status,403);
 assert.equal((await f.request(path(app)+'/submissions',{method:'POST',body:{},headers:{...headersFor(f.aliceContext),origin:'https://evil.invalid'}})).status,403);
});

test('C1 acknowledgment and exact separate document display are both required',async t=>{
 const f=await documentHttpFixture(t),p=(await f.request('/mvp/policies')).body.policies[0],created=await f.post('/mvp/applications',{policyHash:p.policyHash},'create-unack'),app=created.body.applicationId;
 assert.equal((await f.request(path(app)+'/document-preview')).body.code,'DOC_CONFIGURATION_REQUIRED');
 const c1=(await f.request(path(app)+'/agreement-preview')).body;
 await f.post(path(app)+'/agreement',{expectedRevision:1,previewHash:c1.previewHash,acknowledgement:'SYNTHETIC_ACK_ONLY'},'c1');
 const preview=(await f.request(path(app)+'/document-preview')).body;
 assert.notEqual(preview.documentPreviewHash,c1.previewHash);
 assert.equal((await f.post(path(app)+'/document-agreement',{expectedWorkflowRevision:preview.expectedWorkflowRevision,documentPreviewHash:c1.previewHash,acknowledgement:'SYNTHETIC_DOCUMENT_ACK_ONLY'},'bad')).status,409);
 assert.equal((await f.post(path(app)+'/document-agreement',{expectedWorkflowRevision:preview.expectedWorkflowRevision,documentPreviewHash:preview.documentPreviewHash,acknowledgement:'REAL_CONSENT'},'bad')).status,409);
 assert.equal((await f.acknowledge(app)).status,200);
});

test('synthetic bytes, basename, MIME, base64, counts and body authority are checked before reservation',async t=>{
 const f=await documentHttpFixture(t),app=await f.create();await f.acknowledge(app);const p=(await f.request(path(app)+'/document-preview')).body,fixture=f.configuration.fixtures.find(x=>x.fixtureId==='image');
 const file={postId:'post-a',imageId:'image-a',name:'synthetic.png',mediaType:'image/png',base64:fixture.files[0].bytes.toString('base64')};
 const body={expectedWorkflowRevision:p.expectedWorkflowRevision,expectedSubmissionRevision:0,documentAcknowledgmentHash:p.documentAcknowledgment.documentAcknowledgmentHash,fixtureId:'image',files:[file]};
 for(const change of [{files:[{...file,name:'../private.png'}]},{files:[{...file,name:'C:\\private.png'}]},{files:[{...file,mediaType:'image/jpeg'}]},
  {files:[{...file,base64:Buffer.from('PRIVATE_NOT_ALLOWED').toString('base64')}]},{files:[{...file,base64:file.base64+'\n'}]},{files:[file,file]},{verified:true},{runContext:{}},{fixtureId:'actual-student'}]){
  const r=await f.post(path(app)+'/submissions',{...body,...change},'invalid');assert.ok([409,422].includes(r.status));assert.ok(!JSON.stringify(r.body).includes('PRIVATE_NOT_ALLOWED'));
 }
 assert.equal((await f.request(path(app)+'/submissions')).body.length,0);
 assert.equal((await f.post(path(app)+'/submissions',{...body,pad:'x'.repeat(400000)},'large')).status,413);
 const ok=await f.post(path(app)+'/submissions',body,'good');assert.equal(ok.status,200);
 assert.equal((await f.post(path(app)+'/submissions',{...body,expectedSubmissionRevision:1},'good')).body.code,'IDEMPOTENCY_CONFLICT');
 assert.deepEqual((await f.post(path(app)+'/submissions',body,'good')).body,ok.body);
});

test('explicit supplementation invalidates old receipt, and missing/conflict/unreadable remain distinct',async t=>{
 const f=await documentHttpFixture(t),app=await f.create();await f.acknowledge(app);let old,revision=0;
 for(const [fixture,method,expected,reason]of [['missing','TEXT_AI','MISSING','MISSING_INPUT'],['conflict','TEXT_AI','NEEDS_REVIEW','CONFLICT'],['unreadable','VISION','UNREADABLE','UNREADABLE'],['ready-text','CODE','CHECKED',null]]){
  const sub=(await f.submit(app,fixture,'submit-'+revision,revision)).body.result;revision++;
  const run=await start(f,app,sub,method,'run-'+revision);assert.equal(run.status,200);await f.documents.idle();
  const r=(await f.request(path(app)+'/review-runs/'+run.body.result.runId)).body;assert.equal(r.summary.reviewStatus,expected);if(reason)assert.ok(r.summary.reasons.some(x=>x.code===reason));
  if(old){const stale=(await f.request(path(app)+'/review-runs/'+old)).body;assert.equal(stale.current,false);assert.equal(stale.summary,null);}old=r.runId;
 }
});

test('logout cancels ignoring mock work, wipes owned copies and rejects late acceptance',async t=>{
 let assets,release;const f=await documentHttpFixture(t,{adapter:{execution:'MOCK',modelVersion:'mock-document.1',observe(request){assets=request.assets;return new Promise(r=>{release=r;});}}});
 const app=await f.create();await f.acknowledge(app);const sub=(await f.submit(app,'image')).body.result,run=await start(f,app,sub,'VISION');
 assert.ok(assets);assert.equal((await f.post('/auth/logout',{},'logout')).status,200);await f.documents.idle();
 assert.ok(assets.every(f=>f.bytes.every(b=>b===0)));release({reviewStatus:'CHECKED',observations:[]});
 const fresh=await f.login(f.alice),r=await f.request(path(app)+'/review-runs/'+run.body.result.runId,{headers:headersFor(fresh)});
 assert.equal(r.body.current,false);assert.equal(r.body.summary,null);assert.equal((await f.request(path(app)+'/submissions/'+sub.submissionId,{headers:headersFor(fresh)})).body.rawAvailable,false);
});

test('explicit cancellation and raw deletion are owner-only, idempotent and terminal',async t=>{
 const f=await documentHttpFixture(t,{adapter:{execution:'MOCK',modelVersion:'mock-document.1',observe(){return new Promise(()=>{});}}}),app=await f.create();await f.acknowledge(app);
 const sub=(await f.submit(app,'image')).body.result,run=await start(f,app,sub,'VISION');
 assert.equal((await f.post(path(app)+'/review-runs/'+run.body.result.runId+'/cancel',{},'cancel',f.bobContext)).status,404);
 const cancel=await f.post(path(app)+'/review-runs/'+run.body.result.runId+'/cancel',{},'cancel');await f.documents.idle();assert.equal(cancel.body.result.state,'CANCELLED');
 const deletion=await f.request(path(app)+'/submissions/'+sub.submissionId+'/raw',{method:'DELETE',headers:{...headersFor(f.aliceContext),'idempotency-key':'delete'}});assert.equal(deletion.status,200);assert.equal(deletion.body.result.state,'DELETED');
 assert.deepEqual((await f.request(path(app)+'/submissions/'+sub.submissionId+'/raw',{method:'DELETE',headers:{...headersFor(f.aliceContext),'idempotency-key':'delete'}})).body,deletion.body);
});

test('TTL and clock reversal cannot expose or run expired/future raw',async t=>{
 const f=await documentHttpFixture(t),app=await f.create();await f.acknowledge(app);const sub=(await f.submit(app,'image')).body.result;
 f.setTime(sub.createdAt-1);assert.equal((await f.request(path(app)+'/submissions/'+sub.submissionId)).body.code,'MVP_CLOCK');
 assert.equal((await f.request(path(app)+'/submissions/'+sub.submissionId,{headers:headersFor(f.bobContext)})).status,404);
 f.setTime(sub.expiresAt);assert.equal((await f.request(path(app)+'/submissions/'+sub.submissionId)).body.rawAvailable,false);assert.equal((await start(f,app,sub)).body.code,'DOC_RAW_UNAVAILABLE');
});

for(const trigger of ['submission-read','run-read','timer'])test('raw expiry interrupts an in-flight observer via '+trigger,async t=>{
 let copies,signal;const f=await documentHttpFixture(t,{timeoutMs:30000,adapter:{execution:'MOCK',modelVersion:'mock-document.1',observe(request,options){copies=request.assets;signal=options.signal;return new Promise(()=>{});}}});
 const app=await f.create();await f.acknowledge(app);if(trigger==='timer')t.mock.timers.enable({apis:['setTimeout']});
 const sub=(await f.submit(app,'image')).body.result;if(trigger==='timer')t.mock.timers.tick(1799000);
 f.setTime(sub.expiresAt-1);const run=await start(f,app,sub,'VISION');assert.equal(run.status,200);assert.ok(copies.some(x=>x.bytes.some(b=>b!==0)));
 f.setTime(sub.expiresAt);
 if(trigger==='timer')t.mock.timers.tick(1000);
 else if(trigger==='run-read')await f.request(path(app)+'/review-runs/'+run.body.result.runId);
 else assert.equal((await f.request(path(app)+'/submissions/'+sub.submissionId)).body.rawAvailable,false);
 assert.equal(signal.aborted,true);await f.documents.idle();assert.ok(copies.every(x=>x.bytes.every(b=>b===0)));
 const result=(await f.request(path(app)+'/review-runs/'+run.body.result.runId)).body;assert.equal(result.current,false);assert.equal(result.summary,null);
 if(trigger==='timer')t.mock.timers.reset();
});

test('two-DB crash markers recover an existing receipt and interrupt an unstarted reservation without observation',async t=>{
 let calls=0;const base=(await import('../../specs/m3/document-http-example.mjs')).documentHttpExample().adapter;
 const f=await documentHttpFixture(t,{adapter:{...base,observe(request){calls++;return base.observe(request);}}}),app=await f.create();await f.acknowledge(app);
 const sub=(await f.submit(app,'ready-text')).body.result,run=await start(f,app,sub,'TEXT_AI');await f.documents.idle();assert.equal(calls,1);
 const accepted=(await f.request(path(app)+'/review-runs/'+run.body.result.runId)).body;
 const db=new DatabaseSync(join(f.directory,'document-http.sqlite'));
 db.prepare("UPDATE runs SET state='RUNNING' WHERE id=?").run(accepted.runId);
 const pending='document-run-interrupted';db.prepare("INSERT INTO runs VALUES(?,?,?,?,?,?,'RESERVED',?)").run(pending,app,f.aliceContext.wallet,sub.submissionId,sub.workflowRevision,'CODE',sub.createdAt);
 db.prepare('INSERT INTO commands VALUES(?,?,?,?,?,?,?,?,?)').run('document-op-interrupted',app,f.aliceContext.wallet,app+'/review-runs','interrupted',digest('SYNTHETIC-CRASH',{}),'review-runs',pending,sub.createdAt);db.close();
 await f.restart();assert.deepEqual((await f.request(path(app)+'/review-runs/'+accepted.runId)).body,accepted);
 const interrupted=(await f.request(path(app)+'/document-operations/review-runs/interrupted')).body;
 assert.equal(interrupted.result.state,'INTERRUPTED');assert.equal(interrupted.result.reason,'INTERRUPTED');assert.equal(interrupted.result.summary,null);assert.equal(calls,1);
 const raw=(await f.request(path(app)+'/submissions/'+sub.submissionId)).body;assert.equal(raw.rawAvailable,false);
});

test('metadata databases contain neither submitted file bytes, names, text nor mock observed values',async t=>{
 const f=await documentHttpFixture(t),app=await f.create();await f.acknowledge(app);const sub=(await f.submit(app,'image')).body.result;
 await start(f,app,sub,'VISION');await f.documents.idle();
 for(const name of ['document-http.sqlite','workflow.sqlite']){
  const bytes=readFileSync(join(f.directory,name));for(const text of ['synthetic.png','SYNTHETIC image document.','RELATED'])assert.ok(!bytes.includes(Buffer.from(text)),name+':'+text);
  assert.ok(!bytes.includes(f.configuration.fixtures.find(f=>f.fixtureId==='image').files[0].bytes));
 }
 const db=new DatabaseSync(join(f.directory,'document-http.sqlite'));assert.throws(()=>db.prepare("UPDATE commands SET request_hash='changed'").run(),/IMMUTABLE_DOCUMENT_COMMAND/);assert.throws(()=>db.prepare("UPDATE acknowledgments SET record='{}'").run(),/IMMUTABLE_DOCUMENT_ACK/);db.close();
});

test('policy disable and source expiry make immutable accepted summaries historical',async t=>{
 for(const disable of [false,true]){
  const f=await documentHttpFixture(t),app=await f.create();await f.acknowledge(app);const sub=(await f.submit(app)).body.result,run=await start(f,app,sub);await f.documents.idle();
  if(disable)await f.restart([]);else f.setTime(f.configuration.source.snapshot.expiresAt);
  const historical=(await f.request(path(app)+'/review-runs/'+run.body.result.runId)).body;assert.equal(historical.current,false);assert.equal(historical.summary,null);assert.equal(historical.syntheticDocumentSubmissionReady,false);
  assert.ok([409,410].includes((await f.request(path(app)+'/document-preview')).status));
  if(!disable){const db=new DatabaseSync(join(f.directory,'sources.sqlite'));assert.equal(db.prepare('SELECT COUNT(*) AS n FROM artifacts').get().n,0);db.close();}
 }
});

test('an incomplete upload reserves a single actor slot, abort releases it, and no partial submission persists',async t=>{
 const f=await documentHttpFixture(t),app=await f.create();await f.acknowledge(app);
 const req=httpRequest({hostname:'127.0.0.1',port:f.port,path:path(app)+'/submissions',method:'POST',headers:{host:'clear.example.invalid',origin:f.service.origin,...headersFor(f.aliceContext),'content-type':'application/json','idempotency-key':'partial'}});
 req.on('error',()=>{});req.write('{');await new Promise(r=>setTimeout(r,15));
 assert.equal((await f.submit(app)).body.code,'DOC_BUSY');req.destroy();await new Promise(r=>setTimeout(r,15));
 assert.equal((await f.request(path(app)+'/submissions')).body.length,0);assert.equal((await f.submit(app)).status,200);
});

test('a newer submission supersedes an active run and late owned image bytes are zeroed',async t=>{
 let copies,release;const f=await documentHttpFixture(t,{adapter:{execution:'MOCK',modelVersion:'mock-document.1',observe(r){copies=r.assets;return new Promise(resolve=>{release=resolve;});}}}),app=await f.create();await f.acknowledge(app);
 const old=(await f.submit(app,'image')).body.result,run=await start(f,app,old,'VISION');
 const next=await f.submit(app,'ready-text','supplement',1);assert.equal(next.status,200);await f.documents.idle();release({reviewStatus:'CHECKED',observations:[]});
 const result=(await f.request(path(app)+'/review-runs/'+run.body.result.runId)).body;assert.equal(result.current,false);assert.equal(result.state,'SUPERSEDED');assert.equal(result.summary,null);assert.ok(copies.every(x=>x.bytes.every(b=>b===0)));
});

test('worker timeout and ledger deadline retain fixed hold reasons and never accept a late result',async t=>{
 const f=await documentHttpFixture(t,{timeoutMs:5,adapter:{execution:'MOCK',modelVersion:'mock-document.1',observe(){return new Promise(()=>{});}}}),app=await f.create();await f.acknowledge(app);
 const sub=(await f.submit(app,'image')).body.result,run=await start(f,app,sub,'VISION');f.setTime(sub.createdAt+301);await f.documents.idle();
 const result=(await f.request(path(app)+'/review-runs/'+run.body.result.runId)).body;assert.equal(result.state,'TIMED_OUT');assert.equal(result.summary,null);
});

test('restarting a persisted RUNNING ledger row interrupts it without any observer call',async t=>{
 const {runContextHash}=await import('../../src/product-workflow/contract.mjs');let calls=0;
 const f=await documentHttpFixture(t,{adapter:{execution:'MOCK',modelVersion:'mock-document.1',observe(){calls++;throw Error('not-called');}}}),app=await f.create();await f.acknowledge(app);
 const sub=(await f.submit(app)).body.result,done=await start(f,app,sub);await f.documents.idle();
 const ledger=new DatabaseSync(join(f.directory,'workflow.sqlite')),prior=ledger.prepare('SELECT * FROM runs WHERE id=?').get(done.body.result.runId),context=JSON.parse(prior.context),run='document-run-crashed';context.runId=run;context.attempt=2;
 ledger.prepare("INSERT INTO runs VALUES(?,?,?,?,?,?,?,'RUNNING',?,?,NULL,NULL)").run(run,prior.scope,'crashed',digest('CRASH',{}),2,JSON.stringify(context),runContextHash(context),prior.created_at,prior.expires_at);ledger.close();
 const db=new DatabaseSync(join(f.directory,'document-http.sqlite'));db.prepare("INSERT INTO runs VALUES(?,?,?,?,?,?,'RUNNING',?)").run(run,app,f.aliceContext.wallet,sub.submissionId,sub.workflowRevision,'CODE',sub.createdAt);db.close();
 await f.restart();const interrupted=(await f.request(path(app)+'/review-runs/'+run)).body;assert.equal(interrupted.state,'INTERRUPTED');assert.equal(interrupted.summary,null);assert.equal(calls,0);
});

test('oversized decoded files are rejected and a stalled upload gets a bounded timeout without a submission',async t=>{
 const f=await documentHttpFixture(t),app=await f.create();await f.acknowledge(app);const p=(await f.request(path(app)+'/document-preview')).body;
 const bad=await f.post(path(app)+'/submissions',{expectedWorkflowRevision:p.expectedWorkflowRevision,expectedSubmissionRevision:0,documentAcknowledgmentHash:p.documentAcknowledgment.documentAcknowledgmentHash,fixtureId:'image',files:[{postId:'post-a',imageId:'image-a',name:'large.png',mediaType:'image/png',base64:Buffer.alloc(65537).toString('base64')}]},'oversize');assert.equal(bad.body.code,'DOC_LIMIT');
 const result=await new Promise((resolve,reject)=>{const req=httpRequest({hostname:'127.0.0.1',port:f.port,path:path(app)+'/submissions',method:'POST',headers:{host:'clear.example.invalid',origin:f.service.origin,...headersFor(f.aliceContext),'content-type':'application/json','idempotency-key':'stalled'}},res=>{const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks).toString())}));});req.on('error',reject);req.write('{');});
 assert.equal(result.status,408);assert.equal(result.body.code,'DOC_RECEIVE_TIMEOUT');assert.equal((await f.request(path(app)+'/submissions')).body.length,0);
});

test('an old C1 application must explicitly select the bound policy and reconfirm before separate document acknowledgment',async t=>{
 const {studentHttpExamplePolicies}=await import('../../specs/m3/student-http-example.mjs'),{createStudentWorkflowService}=await import('../../src/product-workflow/student-http-service.mjs');
 const f=await documentHttpFixture(t,{initialStudentPolicies:studentHttpExamplePolicies()}),app=await f.create();
 assert.equal((await f.request(path(app)+'/document-preview')).body.code,'DOC_CONFIGURATION_REQUIRED');
 const updated=createStudentWorkflowService({directory:join(f.directory,'../student'),authentication:f.service,instanceId:'document-test',policies:f.configuration.studentPolicies});updated.close();
 assert.equal((await f.request(path(app))).body.state,'POLICY_CHANGED');
 const current=(await f.request('/mvp/policies')).body.policies[0];assert.equal((await f.post(path(app)+'/policy-selection',{expectedRevision:2,policyHash:current.policyHash},'choose-document-policy')).status,200);
 assert.equal((await f.request(path(app)+'/document-preview')).body.code,'DOC_CONFIGURATION_REQUIRED');
 const shown=(await f.request(path(app)+'/agreement-preview')).body;
 await f.post(path(app)+'/agreement',{expectedRevision:3,previewHash:shown.previewHash,acknowledgement:'SYNTHETIC_ACK_ONLY'},'new-c1');
 const p=(await f.request(path(app)+'/document-preview')).body;assert.equal(p.documentAcknowledgment,null);assert.equal((await f.acknowledge(app)).status,200);
 assert.equal((await f.request(path(app)+'/agreements')).body.length,2);
});

test('deleting raw makes a stored receipt historical and a repeated deletion has no additional state transition',async t=>{
 const f=await documentHttpFixture(t),app=await f.create();await f.acknowledge(app);const sub=(await f.submit(app)).body.result,run=await start(f,app,sub);await f.documents.idle();
 for(const key of ['delete-one','delete-two'])assert.equal((await f.request(path(app)+'/submissions/'+sub.submissionId+'/raw',{method:'DELETE',headers:{...headersFor(f.aliceContext),'idempotency-key':key}})).status,200);
 const p=(await f.request(path(app)+'/document-preview')).body;assert.equal(p.expectedWorkflowRevision,4);
 const old=(await f.request(path(app)+'/review-runs/'+run.body.result.runId)).body;assert.equal(old.current,false);assert.equal(old.summary,null);
});

test('logout interrupts an incomplete upload immediately and leaves no partial submission',async t=>{
 const f=await documentHttpFixture(t),app=await f.create();await f.acknowledge(app);
 let req;const pending=new Promise((resolve,reject)=>{req=httpRequest({hostname:'127.0.0.1',port:f.port,path:path(app)+'/submissions',method:'POST',headers:{host:'clear.example.invalid',origin:f.service.origin,...headersFor(f.aliceContext),'content-type':'application/json','idempotency-key':'pending-logout'}},res=>{const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks).toString())}));});req.on('error',reject);req.write('{');});
 await new Promise(r=>setTimeout(r,15));assert.equal((await f.post('/auth/logout',{},'logout')).status,200);
 const interrupted=await pending;assert.equal(interrupted.body.code,'DOC_CANCELLED');const fresh=await f.login(f.alice);
 assert.equal((await f.request(path(app)+'/submissions',{headers:headersFor(fresh)})).body.length,0);
});

test('a C1 policy mutation clears pending raw immediately while replaying an unchanged C1 acknowledgment does not',async t=>{
 const {createStudentWorkflowService}=await import('../../src/product-workflow/student-http-service.mjs');
 const f=await documentHttpFixture(t),app=await f.create();await f.acknowledge(app);const sub=(await f.submit(app,'image')).body.result;
 const old=(await f.request(path(app)+'/agreements')).body[0].payload.preview;
 await f.post(path(app)+'/agreement',{expectedRevision:1,previewHash:old.previewHash,acknowledgement:'SYNTHETIC_ACK_ONLY'},'c1-ack');
 assert.equal((await f.request(path(app)+'/submissions/'+sub.submissionId)).body.rawAvailable,true);
 const next=structuredClone(f.configuration.studentPolicies);next[0].revision=3;next[0].draft.policyVersion='document-changed.3';
 const changed=createStudentWorkflowService({directory:join(f.directory,'../student'),authentication:f.service,instanceId:'document-test',policies:next});changed.close();
 const p=(await f.request('/mvp/policies')).body.policies[0];assert.equal((await f.post(path(app)+'/policy-selection',{expectedRevision:2,policyHash:p.policyHash},'change')).status,200);
 assert.equal((await f.request(path(app)+'/submissions/'+sub.submissionId)).body.rawAvailable,false);
});
