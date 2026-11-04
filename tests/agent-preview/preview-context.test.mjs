import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {createPreviewContexts,PREVIEW_CONTEXT_VERSION} from '../../src/agent-preview/moodle-binding/preview-context.mjs';
import {createPreviewHttpHandler} from '../../src/agent-preview/moodle-binding/preview-http.mjs';
import {createPreviewDevelopmentHandler} from '../../src/product-workflow/http-development.mjs';
import {prepareGeminiStructureRequest} from '../../src/agent-preview/gemini-preparation.mjs';
import {hash} from '../../src/agent-preview/moodle-binding/contract.mjs';
import {studentFixture} from './fixtures/binding-student-fixture.mjs';
const sourceText='Moodle에서 첫 학습 활동을 마쳐야 한다';
async function fixture(t){
 const f=await studentFixture(t),attempt=f.start(),preview=await f.preview(attempt);await f.complete(attempt,preview);
 const release={deploymentEpoch:'preview-epoch-1',artifactHash:'a'.repeat(64),model:'gemini-3.5-flash-lite',limitsHash:hash({calls:1,input:4096,output:2048}),validUntil:2000};
 let mono=0;
 const contexts=createPreviewContexts({authentication:f.auth,student:f.student,coordinator:f.runtime,applicationId:f.registry.applicationId,
  targetRef:'page-manual',issuerEpoch:f.policy.issuerEpoch,deployment:()=>release,prepareModel:prepareGeminiStructureRequest,
  timePolicy:f.config.timePolicy,clock:()=>f.state.wall,monotonic:()=>mono});t.after(()=>contexts.close());
 const issued=contexts.issue(f.context,{version:PREVIEW_CONTEXT_VERSION,sourceText});
 const draft={previewContextRef:issued.previewContextRef,draftId:'draft-1',proposalHash:'b'.repeat(64),sourceHash:issued.sourceHash,bodyHash:issued.bodyHash,approvalBindingHash:issued.approvalBindingHash};
 const input={version:PREVIEW_CONTEXT_VERSION,previewContextRef:issued.previewContextRef,draftId:draft.draftId,proposalHash:draft.proposalHash};
 return {f,release,contexts,issued,draft,input,setMono:v=>mono=v,ready(){contexts.acceptVerifiedDraft(f.context,draft);contexts.review(f.context,input);}};
}
test('real auth/C1/coordinator: explicit matched review gives only pinned triple',async t=>{
 const x=await fixture(t);await assert.rejects(x.contexts.observe(x.f.context,x.input),/CONTEXT_DRAFT/);
 assert.throws(()=>x.contexts.acceptVerifiedDraft(x.f.context,{...x.draft,sourceHash:'f'.repeat(64)}),/CONTEXT_DRAFT/);
 x.contexts.acceptVerifiedDraft(x.f.context,x.draft);await assert.rejects(x.contexts.observe(x.f.context,x.input),/CONTEXT_REVIEW_OR_BUSY/);
 assert.throws(()=>x.contexts.review(x.f.context,{...x.input,proposalHash:'f'.repeat(64)}),/CONTEXT_DRAFT/);
 x.contexts.review(x.f.context,x.input);
 const result=await x.contexts.observe(x.f.context,x.input);assert.deepEqual(result,{targetRef:'page-manual',status:'COMPLETE',observedAt:1000});
 assert.deepEqual(Object.keys(result).sort(),['observedAt','status','targetRef']);
 let delivered; await x.contexts.deliverObservation(x.f.context,{previewContextRef:x.input.previewContextRef,draftId:x.input.draftId,proposalHash:x.input.proposalHash},result,{query(body,correlation){delivered={body,correlation};return Promise.resolve();}});
 assert.deepEqual(JSON.parse(delivered.body),result);assert.equal(delivered.correlation.contextRef,x.input.previewContextRef);
 assert.throws(()=>x.contexts.acceptVerifiedDraft(x.f.context,{...x.draft,draftId:'draft-2'}),/CONTEXT_DRAFT_REPLACED/);
});
for(const [name,change] of [
 ['logout',x=>x.f.auth.logout(x.f.context)],
 ['ACK removed',x=>x.f.sql('workflow','UPDATE applications SET ack_id=NULL RETURNING id')],
 ['binding revision',x=>x.f.sql('workflow','UPDATE applications SET binding_revision=binding_revision+1 RETURNING id')],
 ['application revision',x=>x.f.sql('workflow','UPDATE applications SET revision=revision+1 RETURNING id')],
 ['policy disabled',x=>x.f.sql('workflow','UPDATE policy_heads SET active=0 RETURNING id')],
 ['artifact',x=>x.release.artifactHash='c'.repeat(64)],
 ['model',x=>x.release.model='other-model'],
 ['limits',x=>x.release.limitsHash='d'.repeat(64)],
 ['deployment epoch',x=>x.release.deploymentEpoch='epoch-2'],
])test(name+' invalidates existing preview context',async t=>{const x=await fixture(t);x.ready();change(x);await assert.rejects(x.contexts.observe(x.f.context,x.input));});
test('authority change during observation is fenced by existing coordinator',async t=>{
 const x=await fixture(t);x.ready();x.f.state.query=request=>{x.f.createAuth({participants:[x.f.bob.address],bindingAuthority:{revision:2,expectedRevision:1}});return x.f.respond(request);};
 await assert.rejects(x.contexts.observe(x.f.context,x.input),/AUTHORITY_STALE_WORKER/);
});
test('old source snapshot keeps coordinator freshness policy and cannot use D 30 seconds',async t=>{
 const x=await fixture(t);x.ready();x.f.state.query=request=>{const r=x.f.respond(request);return {...r,observedAt:980,observations:r.observations.map(o=>({...o,observedAt:980}))};};
 await assert.rejects(x.contexts.observe(x.f.context,x.input),/SNAPSHOT_OUTSIDE_REQUEST|OBSERVATION_OLD/);
});
test('raw client identity/target fields and context-only peer access are rejected',async t=>{
 const x=await fixture(t);x.ready();
 for(const field of ['subjectRef','courseRef','targetRef','applicationId'])assert.throws(()=>x.contexts.issue(x.f.context,{version:PREVIEW_CONTEXT_VERSION,sourceText,[field]:'injected'}),/DTO_KEYS/);
 await assert.rejects(x.contexts.observe({},x.input));
 await assert.rejects(x.contexts.observe({...x.f.context,wallet:x.f.bob.address},x.input));
});
test('exclusive wall/monotonic expiry and one in-flight read per context',async t=>{
 const x=await fixture(t);x.ready();let release;
 x.f.state.query=req=>new Promise(resolve=>release=()=>resolve(x.f.respond(req)));
 const pending=x.contexts.observe(x.f.context,x.input);await new Promise(r=>setImmediate(r));
 await assert.rejects(x.contexts.observe(x.f.context,x.input),/CONTEXT_REVIEW_OR_BUSY/);release();await pending;
 x.setMono(60000);await assert.rejects(x.contexts.observe(x.f.context,x.input),/CONTEXT_EXPIRED/);
});
async function httpFixture(t,{enabled=true}={}){
 const x=await fixture(t);x.ready();
 const server=createServer(createPreviewHttpHandler({authentication:x.f.auth,contexts:x.contexts,enabled,allowLoopbackHttpForTests:true}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const call=(path,body=x.input,extra={})=>new Promise((resolve,reject)=>{
  const req=request({host:'127.0.0.1',port:server.address().port,path,method:'POST',headers:{host:'student.example.invalid',origin:x.f.auth.origin,
   'content-type':'application/json',cookie:'__Host-clear-preview-session='+x.f.context.token,'x-wallet':x.f.context.wallet,
   'x-chain-id':'31337','x-csrf-token':x.f.context.csrf,...extra}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks))}));});req.on('error',reject);req.end(typeof body==='string'?body:JSON.stringify(body));
 });return {...x,call};
}
test('independent preview HTTP allowlist excludes payment/admin/peer routes',async t=>{
 const x=await httpFixture(t);assert.equal((await x.call('/preview/observe')).status,200);
 for(const path of ['/applications','/runtimes','/policies','/rpc','/admin','/observations','/v1/preview/execute','/auth/nonce?x=1','/preview/context?x=1'])assert.equal((await x.call(path)).status,404);
 for(const headers of [{origin:'https://other.invalid'},{cookie:'__Host-clear-session='+x.f.context.token},{'x-csrf-token':'f'.repeat(64)},{'sec-fetch-site':'cross-site'}])assert.equal((await x.call('/preview/observe',x.input,headers)).status,422);
 assert.equal((await x.call('/preview/context','{"version":"a","version":"b"}')).status,422);
});
test('preview HTTP is disabled by default; development composition rejects external origin',async t=>{
 const x=await httpFixture(t,{enabled:false});assert.equal((await x.call('/preview/observe')).status,503);
 await assert.rejects(createPreviewDevelopmentHandler({authentication:x.f.auth,contexts:x.contexts,enabled:true}),/PREVIEW_LOOPBACK_CONFIG/);
});

test('delivery cannot refresh cached, copied, mutated or already dispatched triple',async t=>{
 const x=await fixture(t);x.ready();const input={previewContextRef:x.input.previewContextRef,draftId:x.input.draftId,proposalHash:x.input.proposalHash};
 let calls=0;const transport={query(){calls++;return Promise.resolve();}};
 const a=await x.contexts.observe(x.f.context,x.input);
 assert.throws(()=>x.contexts.deliverObservation(x.f.context,input,{...a},transport),/CONTEXT_DELIVERY_EXPIRED/);
 a.status='INCOMPLETE';assert.throws(()=>x.contexts.deliverObservation(x.f.context,input,a,transport),/CONTEXT_DELIVERY_EXPIRED/);
 const b=await x.contexts.observe(x.f.context,x.input);x.setMono(x.f.config.timePolicy.finalFenceMs);
 assert.throws(()=>x.contexts.deliverObservation(x.f.context,input,b,transport),/CONTEXT_DELIVERY_EXPIRED/);
 const c=await x.contexts.observe(x.f.context,x.input);await x.contexts.deliverObservation(x.f.context,input,c,transport);
 assert.throws(()=>x.contexts.deliverObservation(x.f.context,input,c,transport),/CONTEXT_DELIVERY_EXPIRED/);assert.equal(calls,1);
});
