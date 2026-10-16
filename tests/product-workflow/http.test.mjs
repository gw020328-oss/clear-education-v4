import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { httpFixture,contextHeaders } from './http-fixture.mjs';
import { id } from 'ethers';
import { createApplicationService } from '../../src/application/service.mjs';
import { createWorkflowHttpService } from '../../src/product-workflow/http-service.mjs';
import { createWorkflowSourceClient } from '../../src/product-workflow/http-client.mjs';
const path='/mvp/source-bundles/bundle-a';

test('signed wallet sessions drive capture, safe source preview, grounded draft, exact review and restart',async t=>{
 const f=await httpFixture(t),catalogue=await f.request('/mvp/source-bundles');
 assert.equal(catalogue.status,200);assert.equal(catalogue.body.captureMode,'MOCK');assert.equal(catalogue.body.bundles[0].revision,0);
 const captured=await f.capture();assert.equal(captured.body.state,'SUCCEEDED');assert.equal(f.captureCalls,1);
 const preview=await f.request(path);assert.equal(preview.body.status,'NEEDS_SUPPLEMENT');assert.deepEqual(preview.body.missingSourceIds,['missing-guide']);
 assert.ok(preview.body.sources[0].blocks[0].text.includes('SYNTHETIC'));assert.equal(preview.headers['content-type'],'application/json; charset=utf-8');
 const draftBody={expectedRevision:1,bundleHash:preview.body.bundleHash};
 const draft=await f.request(path+'/drafts',{method:'POST',body:draftBody,headers:{...contextHeaders(f.operatorContext),'idempotency-key':'draft-a'}});
 assert.equal(draft.status,200);assert.equal(draft.body.state,'SUCCEEDED');assert.ok(draft.body.result.proposal.proposal);
 assert.equal(draft.body.result.proposal.publishable,false);assert.equal(draft.body.revision,2);
 const replay=await f.request(path+'/drafts',{method:'POST',body:draftBody,headers:{...contextHeaders(f.operatorContext),'idempotency-key':'draft-a'}});
 assert.deepEqual(replay.body,draft.body);
 const latest=(await f.request(path)).body,reviewBody={expectedRevision:2,previewHash:latest.previewHash,acknowledgement:'SYNTHETIC_REVIEW_ONLY'};
 const review=await f.request(path+'/reviews',{method:'POST',body:reviewBody,headers:{...contextHeaders(f.operatorContext),'idempotency-key':'review-a'}});
 assert.equal(review.status,200);assert.equal(review.body.status,'SYNTHETIC_REVIEW_RECORDED');assert.equal(review.body.current,true);
 for(const key of ['identityVerified','sourceVerified','userConsentVerified','policyPublished','paymentAllowed'])assert.equal(review.body[key],false);
 await f.restart();
 assert.deepEqual((await f.request('/mvp/operations/'+draft.body.operationId)).body,draft.body);
 assert.deepEqual((await f.request(path+'/reviews')).body,[review.body]);
 assert.equal((await f.capture()).body.current,false);assert.equal(f.captureCalls,1);
 const again=await f.request(path+'/reviews',{method:'POST',body:reviewBody,headers:{...contextHeaders(f.operatorContext),'idempotency-key':'review-a'}});assert.deepEqual(again.body,review.body);
 const authDb=readFileSync(join(f.directory,'applications.sqlite'));assert.ok(!authDb.includes(Buffer.from('SYNTHETIC target 700.')));
});

test('operator role, session, CSRF, origin/host and optional runtime gate fail closed',async t=>{
 const f=await httpFixture(t);
 for(const headers of [{},contextHeaders(f.aliceContext),{...contextHeaders(f.operatorContext),'x-wallet':f.alice.address},
  {...contextHeaders(f.operatorContext),origin:'https://evil.invalid'},{...contextHeaders(f.operatorContext),host:'evil.invalid'},
  {...contextHeaders(f.operatorContext),'sec-fetch-site':'cross-site'}]){
  assert.ok([401,403].includes((await f.request('/mvp/source-bundles',{headers})).status));
 }
 const bad=await f.request(path+'/snapshots',{method:'POST',body:{urlId:0,expectedRevision:0},headers:{...contextHeaders(f.operatorContext),'x-csrf-token':'','idempotency-key':'bad'}});
 assert.equal(bad.status,403);assert.equal(bad.body.code,'CSRF');assert.equal(f.captureCalls,0);
 await f.restartTransport({});assert.equal((await f.request('/mvp/source-bundles')).status,403);
});

test('untrusted authority, URL, snapshot and pin JSON cannot enter the internal resolver',async t=>{
 const f=await httpFixture(t);
 for(const extra of [{url:'http://169.254.169.254/'},{sourceVerified:true},{actor:'operator'},{snapshot:{binding:'forged'}},{urlId:99}]){
  const body={urlId:0,expectedRevision:0,...extra};
  const r=await f.request(path+'/snapshots',{method:'POST',body,headers:{...contextHeaders(f.operatorContext),'idempotency-key':'bad'}});assert.equal(r.status,422);
 }
 assert.equal(f.captureCalls,0);
 for(const route of ['/mvp/policies','/mvp/applications','/mvp/source-bundles/bundle-a/approve'])assert.equal((await f.request(route)).status,404);
 const malformed=await f.request(path+'/snapshots',{method:'POST',body:'{SYNTHETIC_PRIVATE',headers:contextHeaders(f.operatorContext)});
 assert.equal(malformed.status,422);assert.ok(!JSON.stringify(malformed.body).includes('SYNTHETIC_PRIVATE'));
 const oversized=await f.request(path+'/snapshots',{method:'POST',body:{pad:'a'.repeat(65536)}});assert.equal(oversized.status,413);
});

test('stale revisions, changed-key payload and exact display hash are rejected; old receipts become history',async t=>{
 const f=await httpFixture(t);await f.capture();const p=(await f.request(path)).body;
 const headers={...contextHeaders(f.operatorContext),'idempotency-key':'review-a'};
 assert.equal((await f.request(path+'/reviews',{method:'POST',body:{expectedRevision:1,previewHash:'0x'+'00'.repeat(32),acknowledgement:'SYNTHETIC_REVIEW_ONLY'},headers})).status,409);
 const body={expectedRevision:1,previewHash:p.previewHash,acknowledgement:'SYNTHETIC_REVIEW_ONLY'};
 assert.equal((await f.request(path+'/reviews',{method:'POST',body,headers})).body.current,true);
 assert.equal((await f.capture('fresh',1)).body.state,'SUCCEEDED');
 assert.equal((await f.request(path+'/reviews',{method:'POST',body,headers})).body.current,false);
 assert.equal((await f.capture('old',0)).status,409);
 const conflict=await f.request(path+'/snapshots',{method:'POST',body:{urlId:0,expectedRevision:2},headers:{...contextHeaders(f.operatorContext),'idempotency-key':'capture-a'}});
 assert.equal(conflict.status,409);assert.equal(conflict.body.code,'IDEMPOTENCY_CONFLICT');
 assert.equal(f.captureCalls,2);
});

test('expiry hides old operation/model values and returns source-expired for preview',async t=>{
 const f=await httpFixture(t),r=await f.capture();f.setTime(f.source.snapshot.expiresAt);
 const op=(await f.request('/mvp/operations/'+r.body.operationId)).body;assert.equal(op.current,false);assert.equal(op.result,null);
 assert.equal((await f.request(path)).status,410);
});

test('browser adapter uses existing authenticated request with explicit idempotency; F0 is untouched',async t=>{
 const f=await httpFixture(t),client=createWorkflowSourceClient({request:async(url,options={})=>{
  const r=await f.request(url,{method:options.method,body:options.body,headers:{...contextHeaders(f.operatorContext),...(options.idempotencyKey?{'idempotency-key':options.idempotencyKey}:{})}});
  if(r.status!==200)throw Object.assign(Error('API_REQUEST_FAILED'),{status:r.status});return r.body;
 }});
 const list=await client.catalogue();assert.equal(list.version,'clear-mvp-source-http.1');
 const r=await client.capture('bundle-a',{expectedRevision:0,urlId:0},{idempotencyKey:'client-a'});assert.equal(r.state,'SUCCEEDED');
 assert.equal((await client.preview('bundle-a')).fundingStatus,'UNKNOWN');assert.equal((await client.operation(r.operationId)).paymentAllowed,false);
 assert.throws(()=>client.capture('bundle-a',{},{idempotencyKey:'../bad'}),/CLIENT_ID/);
 assert.throws(()=>client.preview('../bad'),/CLIENT_ID/);
 const old=await f.request('/applications',{headers:contextHeaders(f.aliceContext)});assert.deepEqual(old.body,[]);
});

test('lost response recovers by actor/route/key GET with no automatic capture repeat',async t=>{
 const f=await httpFixture(t);const first=await f.capture();
 const recovered=await f.request(path+'/operations/snapshots/capture-a');assert.deepEqual(recovered.body,first.body);
 assert.equal(f.captureCalls,1);await f.restart();assert.deepEqual((await f.request(path+'/operations/snapshots/capture-a')).body,first.body);
 const denied=await f.request(path+'/operations/snapshots/capture-a',{headers:contextHeaders(f.aliceContext)});assert.equal(denied.status,403);
});

test('explicit cancellation returns before an ignoring collector and wipes late owned bytes',async t=>{
 let release,owned;
 const f=await httpFixture(t,{collector:input=>new Promise(r=>{release=()=>{
  owned=new Map([...f.source.blobs].map(([id,b])=>[id,Buffer.from(b)]));r({snapshot:{...structuredClone(f.source.snapshot),revision:input.revision},blobs:owned});
 };})});
 const pending=f.capture();while(!release)await new Promise(r=>setImmediate(r));
 const first=(await f.request(path+'/operations/snapshots/capture-a')).body;assert.equal(first.state,'RUNNING');
 const cancelled=await f.request('/mvp/operations/'+first.operationId+'/cancel',{method:'POST',body:{}});assert.equal(cancelled.body.state,'CANCELLED');
 const ended=await pending;assert.equal(ended.body.state,'CANCELLED');release();await new Promise(r=>setImmediate(r));
 assert.ok([...owned.values()].every(b=>b.every(v=>v===0)));assert.equal((await f.request(path)).status,404);
});

test('logout during an asynchronous capture prevents archive acceptance',async t=>{
 let release;
 const f=await httpFixture(t,{collector:input=>new Promise(r=>{release=()=>r({snapshot:{...structuredClone(f.source.snapshot),revision:input.revision},blobs:new Map([...f.source.blobs].map(([id,b])=>[id,Buffer.from(b)]))});})});
 const pending=f.capture();while(!release)await new Promise(r=>setImmediate(r));
 assert.equal((await f.request('/auth/logout',{method:'POST',body:{}})).status,200);release();
 const result=await pending;assert.equal(result.body.state,'FAILED');assert.equal(result.body.result,null);
 const next=await f.login(f.operator);assert.equal((await f.request(path,{headers:contextHeaders(next)})).status,404);
});

test('a newer revision supersedes pending capture and an old preview cannot be reviewed',async t=>{
 let release,count=0,late;
 const f=await httpFixture(t,{collector:async input=>{
  const result=()=>({snapshot:{...structuredClone(f.source.snapshot),revision:input.revision},blobs:new Map([...f.source.blobs].map(([id,b])=>[id,Buffer.from(b)]))});
  if(++count===1)return new Promise(r=>{release=()=>{late=result();r(late);};});return result();
 }});
 const old=f.capture();while(!release)await new Promise(r=>setImmediate(r));
 const newer=await f.capture('newer',1);assert.equal(newer.body.state,'SUCCEEDED');assert.equal(newer.body.revision,2);
 assert.equal((await old).body.state,'SUPERSEDED');release();await new Promise(r=>setImmediate(r));
 assert.ok([...late.blobs.values()].every(b=>b.every(v=>v===0)));
 const preview=(await f.request(path)).body;assert.equal(preview.revision,2);assert.equal(preview.sourceCurrent,true);
});

test('a persisted COMMITTING marker reconciles after restart without repeating source collection',async t=>{
 const f=await httpFixture(t),first=await f.capture();
 const db=new DatabaseSync(join(f.config.directory,'mvp-http.sqlite'));
 db.prepare("UPDATE operations SET state='COMMITTING' WHERE id=?").run(first.body.operationId);
 db.prepare('UPDATE heads SET bundle_hash=NULL WHERE id=?').run('bundle-a');db.close();
 await f.restart();const recovered=await f.request(path+'/operations/snapshots/capture-a');assert.equal(recovered.body.state,'SUCCEEDED');
 assert.equal(recovered.body.result.bundleHash,first.body.result.bundleHash);assert.equal(f.captureCalls,1);
 assert.equal((await f.request(path)).body.bundleHash,first.body.result.bundleHash);
});

test('uncommitted interrupted work times out across restart and never automatically refetches',async t=>{
 const f=await httpFixture(t),first=await f.capture();
 const db=new DatabaseSync(join(f.config.directory,'mvp-http.sqlite'));
 db.prepare("UPDATE operations SET state='RUNNING',result=NULL WHERE id=?").run(first.body.operationId);
 db.prepare('UPDATE heads SET bundle_hash=NULL WHERE id=?').run('bundle-a');db.close();
 await f.restart();assert.equal((await f.request(path+'/operations/snapshots/capture-a')).body.state,'RUNNING');
 f.setTime(130);assert.equal((await f.request(path+'/operations/snapshots/capture-a')).body.state,'TIMED_OUT');assert.equal(f.captureCalls,1);
});

test('expired source artifacts and persisted public draft quotes are logically purged while replay keys remain',async t=>{
 const f=await httpFixture(t);await f.capture();const p=(await f.request(path)).body;
 const draft=await f.request(path+'/drafts',{method:'POST',body:{expectedRevision:1,bundleHash:p.bundleHash},headers:{...contextHeaders(f.operatorContext),'idempotency-key':'draft-retention'}});
 assert.equal(draft.body.state,'SUCCEEDED');f.setTime(f.source.snapshot.expiresAt);
 const retired=(await f.request('/mvp/operations/'+draft.body.operationId)).body;assert.equal(retired.current,false);assert.equal(retired.result,null);
 const db=new DatabaseSync(join(f.config.directory,'mvp-http.sqlite'));
 const row=db.prepare('SELECT result,request_hash FROM operations WHERE id=?').get(draft.body.operationId);db.close();assert.equal(row.result,null);assert.ok(row.request_hash);
 const sourceDb=new DatabaseSync(join(f.config.directory,'sources.sqlite'));assert.equal(sourceDb.prepare('SELECT COUNT(*) AS n FROM artifacts').get().n,0);sourceDb.close();
});

test('first preview after COMMITTING recovery uses the newly archived source, never old bytes with a new operation',async t=>{
 const f=await httpFixture(t),first=await f.capture(),second=await f.capture('capture-b',1);
 const db=new DatabaseSync(join(f.config.directory,'mvp-http.sqlite'));
 db.prepare("UPDATE operations SET state='COMMITTING' WHERE id=?").run(second.body.operationId);
 db.prepare('UPDATE heads SET bundle_hash=? WHERE id=?').run(first.body.result.bundleHash,'bundle-a');db.close();
 await f.restart();const p=await f.request(path);
 assert.equal(p.status,200);assert.equal(p.body.bundleHash,second.body.result.bundleHash);assert.equal(p.body.bundleRevision,2);
 assert.equal(p.body.sources[0].revision,2);assert.equal(p.body.sourceCurrent,true);assert.equal(f.captureCalls,2);
});

test('clock reversal does not purge an unexpired stored draft or expose a pre-issuance operation',async t=>{
 const f=await httpFixture(t);await f.capture();const p=(await f.request(path)).body;
 const draft=await f.request(path+'/drafts',{method:'POST',body:{expectedRevision:1,bundleHash:p.bundleHash},headers:{...contextHeaders(f.operatorContext),'idempotency-key':'clock-draft'}});
 assert.equal(draft.body.state,'SUCCEEDED');f.setTime(99);f.workflow.purgeExpired();
 const db=new DatabaseSync(join(f.config.directory,'mvp-http.sqlite'));const stored=db.prepare('SELECT result FROM operations WHERE id=?').get(draft.body.operationId);db.close();
 assert.notEqual(stored.result,null,'temporary clock/source unavailability must not delete unexpired quotes');
 const denied=await f.request('/mvp/operations/'+draft.body.operationId);assert.equal(denied.status,422);assert.equal(denied.body.code,'MVP_CLOCK');
 f.setTime(101);assert.deepEqual((await f.request('/mvp/operations/'+draft.body.operationId)).body.result,draft.body.result);
});

test('an operation cannot be current before its stored creation time even when its source is still readable',async t=>{
 const f=await httpFixture(t);f.setTime(200);const captured=await f.capture();assert.equal(captured.body.state,'SUCCEEDED');
 f.setTime(150);const denied=await f.request('/mvp/operations/'+captured.body.operationId);assert.equal(denied.status,422);assert.equal(denied.body.code,'MVP_CLOCK');
});


test('another signed operator cannot recover or cancel an actor-owned operation',async t=>{
 const f=await httpFixture(t);
 const authentication=createApplicationService({directory:join(f.directory,'two-operators-auth'),origin:f.service.origin,
  chainId:f.operatorContext.chainId,instanceId:id('SYNTHETIC_TWO_OPERATORS'),participants:[f.alice.address],operators:[f.operator.address,f.bob.address],now:()=>f.time});
 const workflow=createWorkflowHttpService({...f.config,directory:join(f.directory,'two-operators-source'),authentication});
 try{
  const a=await f.login(f.operator,authentication),b=await f.login(f.bob,authentication);
  const captured=await workflow.capture(a,'bundle-a',{urlId:0,expectedRevision:0},'owned');
  assert.equal(workflow.catalogue(b).bundles.length,1);
  assert.throws(()=>workflow.operation(b,captured.operationId),/MVP_NOT_FOUND/);
  assert.throws(()=>workflow.recoverOperation(b,'bundle-a','snapshots','owned'),/MVP_NOT_FOUND/);
  assert.throws(()=>workflow.cancel(b,captured.operationId,{}),/MVP_NOT_FOUND/);
  assert.throws(()=>workflow.recoverOperation(a,'bundle-a','drafts','owned'),/MVP_NOT_FOUND/);
  assert.deepEqual(workflow.recoverOperation(a,'bundle-a','snapshots','owned'),captured);
 }finally{workflow.close();authentication.close();}
});


test('a stored review cannot become current before its recorded review time',async t=>{
 const f=await httpFixture(t);await f.capture();const p=(await f.request(path)).body;f.setTime(200);
 const body={expectedRevision:1,previewHash:p.previewHash,acknowledgement:'SYNTHETIC_REVIEW_ONLY'};
 const headers={...contextHeaders(f.operatorContext),'idempotency-key':'clock-review'};
 assert.equal((await f.request(path+'/reviews',{method:'POST',body,headers})).body.current,true);
 f.setTime(150);const history=await f.request(path+'/reviews');assert.equal(history.status,422);assert.equal(history.body.code,'MVP_CLOCK');
 const replay=await f.request(path+'/reviews',{method:'POST',body,headers});assert.equal(replay.status,422);assert.equal(replay.body.code,'MVP_CLOCK');
 f.setTime(201);assert.equal((await f.request(path+'/reviews')).body[0].current,true);
});
