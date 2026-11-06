import test from 'node:test';
import assert from 'node:assert/strict';
import {hash} from '../../src/agent-preview/index.mjs';
import {createOperatorDPort,operatorPreviewFailure} from '../../src/agent-preview/operator-relay.mjs';
import {fixture,deferred,version,sourceText} from './operator-fixture.mjs';

test('ports are mandatory: operator role alone, missing fence, missing scope are closed',async t=>{
  const f=fixture(t,{resolveOperatorPreviewScope:undefined});await assert.rejects(f.prepare(),/PREVIEW_UNAVAILABLE/);assert.equal(f.state.calls.length,0);
  const g=fixture(t);await assert.rejects(g.relay.prepare(g.context,{version,sourceText},{}),/PREVIEW_UNAVAILABLE/);
  g.state.role='participant';await assert.rejects(g.prepare(),/PREVIEW_FORBIDDEN/);assert.equal(g.state.calls.length,0);
});
test('server revision and exact raw source/hash; browser cannot supply actor, model, approval or rows',async t=>{
  const f=fixture(t),p=await f.prepare();assert.equal(p.sourceHash,hash(sourceText));assert.equal(f.state.calls[0].body.sourceText,sourceText);
  assert.equal(p.approvalState,'REQUIRED');assert.equal(JSON.stringify(p).includes('approvalRef'),false);
  for(const field of ['institutionId','courseId','operatorId','approvalRef','rows','model','execution'])await assert.rejects(
    f.relay.prepare(f.context,{version,sourceText,[field]:'browser'},f.native));
  await assert.rejects(f.relay.generate(f.context,{version,contextRef:p.contextRef,revision:p.revision+1,bodyHash:p.bodyHash},f.native),/PREVIEW_STALE/);
  await assert.rejects(f.relay.generate({...f.context,token:'e'.repeat(64)},{version,contextRef:p.contextRef,revision:p.revision,bodyHash:p.bodyHash},f.native),/PREVIEW_FORBIDDEN/);
  const q=await f.prepare(sourceText.trim());assert.notEqual(q.bodyHash,p.bodyHash);assert.ok(q.revision>p.revision);
  await assert.rejects(f.generate(p),/PREVIEW_STALE/);assert.equal(f.state.calls.length,2);
});
test('approval binding is owner-only and exact, generate without it never calls D',async t=>{
  const f=fixture(t),p=await f.prepare();await assert.rejects(f.generate(p),/APPROVAL_REQUIRED/);
  await assert.rejects(f.relay.bindApproval(f.context,{version,contextRef:p.contextRef,revision:p.revision,bodyHash:'f'.repeat(64),
    bindingHash:f.deployment.bindingHash,approvalRef:'approval_1',expiresAt:f.state.now+10000},f.native),/APPROVAL_REQUIRED/);
  await assert.rejects(f.bind(p,'approval_1',f.state.now),/APPROVAL_REQUIRED/);assert.equal(f.state.calls.length,1);
});
test('success preserves D .1 and raw .2 modelRows; DISPLAY_ONLY never executes',async t=>{
  const f=fixture(t),p=await f.prepare();await f.bind(p);const g=await f.generate(p);
  assert.equal(g.stage,'PROPOSED');assert.equal(g.generated.version,'clear-external-preview-draft.1');
  assert.equal(g.generated.draft.version,'clear-preview-model-draft.2');assert.ok(g.generated.draft.modelRows.length);
  assert.equal(g.generated.actualModelCall,false);assert.equal(g.expiresAt,p.expiresAt);
  await assert.rejects(f.execute(g),/PREVIEW_DISPLAY_ONLY/);assert.equal(f.state.calls.length,2);
});
test('explicit single-activity contract executes once with original offline observation',async t=>{
  const f=fixture(t,{executionContract:'D_SINGLE_ACTIVITY_OFFLINE.1'}),p=await f.prepare();await f.bind(p);const g=await f.generate(p);
  const observed=await f.execute(g);assert.equal(observed.stage,'OBSERVED');assert.equal(observed.observation.observation.status,'UNKNOWN');
  assert.equal(observed.observation.observation.eligibility,'NOT_EVALUATED');assert.equal(observed.paymentAllowed,false);
  await assert.rejects(f.execute(g),/PREVIEW_ALREADY_USED/);assert.equal(f.state.calls.length,3);
});
test('concurrent generation consumes locally before D; a new context cannot reuse the ref',async t=>{
  const f=fixture(t),p=await f.prepare();await f.bind(p);const entered=deferred(),late=deferred();
  f.state.hook=(op,body)=>{entered.resolve();return late.promise.then(()=>f.reply(op,body));};
  const first=f.generate(p);await entered.promise;await assert.rejects(f.generate(p),/PREVIEW_ALREADY_USED/);
  late.resolve();await first;f.state.hook=null;const q=await f.prepare();await f.bind(q);
  await assert.rejects(f.generate(q),/PREVIEW_ALREADY_USED/);assert.equal(f.state.calls.filter(c=>c.path.endsWith('generate')).length,1);
});
test('D failure is .1 only, has no invented actualModelCall/modelCall and does not restore approval',async t=>{
  const f=fixture(t),p=await f.prepare();await f.bind(p);
  f.state.hook=()=>({status:502,body:{version:'clear-external-preview-error.1',code:'GEMINI_HTTP_FAILURE',paymentAllowed:false}});
  const failed=await f.generate(p);assert.equal(failed.failure.kind,'D_HTTP');assert.equal(failed.failure.status,502);
  assert.equal(JSON.stringify(failed).includes('actualModelCall'),false);assert.equal(JSON.stringify(failed).includes('modelCall'),false);
  f.state.hook=null;const q=await f.prepare();await f.bind(q);await assert.rejects(f.generate(q),/PREVIEW_ALREADY_USED/);
  assert.equal(operatorPreviewFailure(Object.assign(Error('private-provider-body'),{actualModelCall:null})).failure.code,'PREVIEW_REJECTED');
});
for(const change of ['session','scope','revision','deployment','native','expiry','monotonic'])test(`late reply rejected after ${change} changes`,async t=>{
  const f=fixture(t),p=await f.prepare();await f.bind(p);const entered=deferred(),late=deferred();
  f.state.hook=(op,body)=>{entered.resolve();const result=f.reply(op,body);return late.promise.then(()=>result);};
  const work=f.generate(p);await entered.promise;
  if(change==='session')f.state.valid=false;if(change==='scope')f.state.scopeValid=false;if(change==='revision')f.state.revision++;
  if(change==='deployment')f.deployment.bindingHash='f'.repeat(64);if(change==='native')f.state.native=false;
  if(change==='expiry')f.advance(60001);if(change==='monotonic')f.state.mono+=60001;
  late.resolve();await assert.rejects(work);assert.equal(f.state.calls.length,2);assert.equal(f.state.timers.size,0);
});
test('shortened approval expiry reschedules cleanup without renewing original TTL',async t=>{
  const f=fixture(t),p=await f.prepare(),a=await f.bind(p,'approval_1',f.state.now+1000);
  assert.equal(a.expiresAt,f.state.now+1000);assert.equal(f.state.timers.size,1);
  const timer=[...f.state.timers.values()][0];assert.equal(timer.ms,1000);f.advance(1000);timer.fn();
  await assert.rejects(f.generate(p),/PREVIEW_STALE/);assert.equal(f.state.timers.size,0);
});
for(const mode of ['invalidate','close','cancel','deadline'])test(`${mode} aborts pending D and rejects noncooperative late result`,async t=>{
  const f=fixture(t),p=await f.prepare();await f.bind(p);const entered=deferred(),late=deferred(),controller=new AbortController();
  f.state.hook=(op,body)=>{entered.resolve();return late.promise.then(()=>f.reply(op,body));};
  const work=f.relay.generate(f.context,{version,contextRef:p.contextRef,revision:p.revision,bodyHash:p.bodyHash},{...f.native,signal:controller.signal});
  await entered.promise;if(mode==='invalidate')f.relay.invalidate(p.contextRef);if(mode==='close')f.relay.close();
  if(mode==='cancel')controller.abort();if(mode==='deadline')[...f.state.timers.values()].find(x=>x.ms===45000).fn();
  await assert.rejects(work);late.resolve();await Promise.resolve();assert.equal(f.state.calls.length,2);
});
test('a stalled A scope resolver is bounded before D and expiry never resurrects',async t=>{
  const pending=deferred(),entered=deferred(),f=fixture(t,{resolveOperatorPreviewScope:()=>{entered.resolve();return pending.promise;}});
  const work=f.prepare();await entered.promise;[...f.state.timers.values()][0].fn();await assert.rejects(work);assert.equal(f.state.calls.length,0);
  pending.resolve(null);
});
for(const corruption of ['source','rows','execution','phase','extra','errorExtra'])test(`D ${corruption} corruption is rejected`,async t=>{
  const f=fixture(t),p=await f.prepare();await f.bind(p);
  f.state.hook=(op,body)=>{const r=structuredClone(f.reply(op,body));
    if(corruption==='source')r.body.draft.sourceText+='x';if(corruption==='rows')r.body.draft.modelRows[0].quote+='x';
    if(corruption==='execution')delete r.body.modelCall.execution;if(corruption==='phase')r.body.modelCall.methods.generateContent.replied=false;
    if(corruption==='extra')r.body.providerBody='private';if(corruption==='errorExtra')return {status:500,body:{version:'clear-external-preview-error.1',code:'REQUEST_REJECTED',paymentAllowed:false,actualModelCall:false}};
    return r;};await assert.rejects(f.generate(p));
});
test('fixed D port rejects arbitrary operation and extra authority fields',()=>{
  let calls=0;const port=createOperatorDPort({execution:'OFFLINE_TEST_TRANSPORT',request:()=>{calls++;}});
  assert.throws(()=>port.call('approve',{}));assert.throws(()=>port.call('prepare',{institutionId:'x',courseId:'1',operatorId:'1',sourceText,actor:'x'}));assert.equal(calls,0);
});
test('slow earlier prepare cannot replace newer server revision or source',async t=>{
  const first=deferred(),entered=deferred();let original,calls=0;
  const f=fixture(t,{resolveOperatorPreviewScope:()=>{if(++calls===1){entered.resolve();return first.promise;}return original();}});
  original=f.resolveOperatorPreviewScope;
  const old=f.prepare(sourceText);await entered.promise;const newer=await f.prepare(sourceText.trim());
  first.resolve(original());await assert.rejects(old,/PREVIEW_STALE/);await f.bind(newer);await f.generate(newer);
  assert.equal(f.state.calls.filter(c=>c.path.endsWith('prepare')).length,1);
  assert.equal(f.state.calls[0].body.sourceText,sourceText.trim());
});
test('close immediately cancels authority resolution before a preview record exists',async t=>{
  const pending=deferred(),entered=deferred(),f=fixture(t,{resolveOperatorPreviewScope:()=>{entered.resolve();return pending.promise;}});
  const work=f.prepare();await entered.promise;f.relay.close();await assert.rejects(work);
  assert.equal(f.state.timers.size,0);assert.equal(f.state.calls.length,0);pending.resolve(null);
});
test('shorter D draft deadline never renews prepare or approval expiry',async t=>{
  const f=fixture(t),p=await f.prepare();await f.bind(p,'approval_1',f.state.now+30000);
  f.state.hook=(op,body)=>{const r=structuredClone(f.reply(op,body));r.body.expiresAt=f.state.now+5000;return r;};
  const g=await f.generate(p);assert.equal(g.expiresAt,f.state.now+5000);assert.equal([...f.state.timers.values()][0].ms,5000);
});
test('request deadline uses monotonic and wall clocks even if timer has not fired',async t=>{
  const f=fixture(t,{ttlMs:120000}),p=await f.prepare();await f.bind(p);const entered=deferred(),late=deferred();
  f.state.hook=(op,body)=>{entered.resolve();const result=f.reply(op,body);return late.promise.then(()=>result);};
  const work=f.generate(p);await entered.promise;f.advance(45000);late.resolve();await assert.rejects(work,/PREVIEW_EXPIRED/);
});
test('known failures retain an immutable public code even if an owner mutates the Error',async t=>{
  const f=fixture(t),p=await f.prepare();let error;try{await f.generate(p);}catch(e){error=e;}
  Object.defineProperty(error,'message',{get(){throw Error('private-message-getter');}});
  assert.equal(operatorPreviewFailure(error).failure.code,'APPROVAL_REQUIRED');
});
for(const mode of ['session','scope'])test(`detected ${mode} revocation clears idle context immediately`,async t=>{
  const f=fixture(t),p=await f.prepare();if(mode==='session')f.state.valid=false;else f.state.revision++;
  await assert.rejects(f.generate(p));assert.equal(f.state.timers.size,0);assert.equal(f.state.calls.length,1);
});
test('scope revocation in a microtask between resolver and dispatch is checked at the dispatch fence',async t=>{
  let revoked=false,checks=0,original;
  const f=fixture(t,{resolveOperatorPreviewScope:()=>({...original(),assertCurrent(){
    if(revoked)throw Error('scope-revoked');if(++checks===1)queueMicrotask(()=>{revoked=true;});
  }})});original=f.resolveOperatorPreviewScope;
  await assert.rejects(f.prepare());assert.equal(f.state.calls.length,0);assert.equal(f.state.timers.size,0);
});
test('held proposal and altered execute pins never cross the explicit offline execution boundary',async t=>{
  const f=fixture(t,{executionContract:'D_SINGLE_ACTIVITY_OFFLINE.1'}),p=await f.prepare('파이썬 강좌 두 번 이수');
  await f.bind(p);const g=await f.generate(p);assert.notEqual(g.generated.draft.status,'READY');
  await assert.rejects(f.relay.execute(f.context,{version,contextRef:g.contextRef,revision:g.revision,draftId:g.generated.draftId,
    proposalHash:'f'.repeat(64)},f.native),/PREVIEW_STALE/);
  await assert.rejects(f.execute(g),/DRAFT_NOT_READY/);assert.equal(f.state.calls.length,2);
});
