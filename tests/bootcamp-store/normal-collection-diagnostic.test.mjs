import test from 'node:test';
import assert from 'node:assert/strict';
import {storeFixture} from './fixture.mjs';
import {executionErrorSummary} from '../../src/bootcamp/execution-diagnostics.mjs';
import {createSourceDiagnostics,observeSource} from '../../src/hackerrank-evidence/diagnostics.mjs';
test('producer failure preserves only bounded fixed AI code before outer producer error',async t=>{
 const seen=[];let calls=0;
 const f=await storeFixture(t,{authority:{beforeVerify(){calls++;throw Object.assign(Error('NORMAL_CURRENT'),{data:'private source',cause:Error('private text')});}},store:{onCollectionFailure:x=>seen.push(x)}});
 const app=f.create();await assert.rejects(f.accept(app),/BC_PRODUCER_FAILED/);
 assert.equal(calls,1);assert.equal(seen.length,1);assert.equal(seen[0].phase,'PRODUCER');assert.equal(seen[0].code,'NORMAL_CURRENT');
 assert.doesNotMatch(JSON.stringify(seen),/private/);assert.equal(seen[0].causes[0].code,'UNCLASSIFIED');
 const hostile=new Proxy({},{get(){throw Error('private');}});assert.equal(executionErrorSummary(hostile).code,'UNCLASSIFIED');
});

test('source cleanup after producer failure revokes its request before the secondary revision rejection',async t=>{
 const diagnostics=createSourceDiagnostics({persist(){}});let calls=0,f;
 f=await storeFixture(t,{authority:{beforeVerify(request){
  calls++;
  observeSource(diagnostics,'PREPARED_SOURCE','FAILED',Error('NORMAL_HOST_INPUT_CLOSED'));
  // Equivalent public authority change to preparedSource.close(): pins unavailable.
  f.change(request.applicationId,request.criterionId,{rawAvailable:false});
  throw Error('COLLECTION_FAILED');
 }}});
 const app=f.create(),request=f.request(app),before=f.counts();
 await assert.rejects(f.store.collect(f.aliceContext,app,{
  requestId:request.record.target.requestId,expectedRevision:request.record.applicationRevision},f.key()),error=>{
   observeSource(diagnostics,'MANAGED_SOURCE','FAILED',error);return error.message==='BC_REVISION_CONFLICT';
  });
 assert.equal(calls,1);
 assert.equal(f.store.getRequest(f.aliceContext,app,request.record.target.requestId).status,'REVOKED');
 assert.equal(f.view(app).revision,request.record.applicationRevision+1);
 assert.equal(f.counts().evidence,before.evidence);
 assert.equal(f.counts().commands,before.commands);
 assert.equal(diagnostics.snapshot().firstFailure.code,'NORMAL_HOST_INPUT_CLOSED');
 assert.equal(diagnostics.snapshot().events.at(-1).code,'BC_REVISION_CONFLICT');
});

test('an independent revision change during collection still rejects without retry or evidence acceptance',async t=>{
 let calls=0;const entered=Promise.withResolvers(),release=Promise.withResolvers();
 const f=await storeFixture(t,{authority:{async beforeVerify(){calls++;entered.resolve();await release.promise;}}});
 const app=f.create(),request=f.request(app),before=f.counts();
 const result=f.store.collect(f.aliceContext,app,{
  requestId:request.record.target.requestId,expectedRevision:request.record.applicationRevision},f.key());
 const rejected=assert.rejects(result,/BC_REVISION_CONFLICT/);
 await entered.promise;
 try{f.store.invalidate(f.aliceContext,app,{criterionId:'activity-complete',reason:'INACCESSIBLE',
  expectedRevision:request.record.applicationRevision},f.key());}finally{release.resolve();}
 await rejected;
 assert.equal(calls,1);assert.equal(f.counts().evidence,before.evidence);
 assert.equal(f.store.getRequest(f.aliceContext,app,request.record.target.requestId).status,'REVOKED');
});

test('filesystem diagnostics retain fixed code and source-defined location without paths or raw exceptions',()=>{
 for(const code of ['ENOENT','EACCES','EPERM','ELOOP','ENOTDIR','E5_PRIVATE_DIRECTORY','E5_PRIVATE_DIRECTORY_ALIAS']){
  const cause=Object.assign(Error('sensitive source /private/path'),{code,path:'/private/path',syscall:'mkdir',stack:'private stack'});
  const e=Object.assign(Error('NORMAL_RUN_CLAIMS_DIRECTORY',{cause}),{failurePhase:'NORMAL_CLAIMS_PARENT'});
  const d=executionErrorSummary(e);assert.equal(d.code,'NORMAL_RUN_CLAIMS_DIRECTORY');assert.equal(d.causes[0].code,code);assert.equal(d.failurePhase,'NORMAL_CLAIMS_PARENT');assert.doesNotMatch(JSON.stringify(d),/private|sensitive|mkdir/);
 }
 assert.equal(executionErrorSummary(Object.assign(Error('ENOENT'),{failurePhase:'/private/path'})).failurePhase,undefined);
});

test('post-model source failures retain fixed codes while arbitrary source text stays redacted',()=>{
 for(const code of ['MSE_RAW_UNAVAILABLE','MSE_SOURCE_CHANGED','MSE_SOURCE_UNAVAILABLE','REVIEW_AUTH','REVIEW_TIMEOUT','REVIEW_UNAVAILABLE','BCM_SOURCE_CHANGED','E6_OWNED_CLI_FAILED']){
  const error=Object.assign(Error(code),{body:'private source text',token:'private token'});
  const result=executionErrorSummary(error);
  assert.equal(result.code,code);
  assert.doesNotMatch(JSON.stringify(result),/private/);
 }
 assert.equal(executionErrorSummary(Error('REVIEW_AUTH private token')).code,'UNCLASSIFIED');
});
