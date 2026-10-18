import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {P0_POLICY,P0_GATES,p0Hash,validateP0Evidence} from '../../specs/bootcamp/p0-contract.mjs';
import {compileBootcampPolicy,bytesHash} from '../../src/bootcamp/model.mjs';
import {createBootcampStore} from '../../src/bootcamp/store.mjs';
import {storeFixture,START} from './fixture.mjs';

test('four distinct capabilities compile; score/daily/coerced policy is rejected',()=>{
  assert.equal(compileBootcampPolicy().policy.criteria.length,4);
  for(const change of [p=>p.criteria[0].capability='DAILY',p=>p.amount.decimals=18,p=>p.criteria[3].predicate.achievementAtRequired=true]){
    const p=structuredClone(P0_POLICY);change(p);assert.throws(()=>compileBootcampPolicy(p),/BC_UNSUPPORTED_POLICY/);
  }
});
test('one private ledger: four synthetic facts become ALL MET with candidate amount and all gates held',async t=>{
  const f=await storeFixture(t,{authority:{transform:c=>{if(c.originalBody!==null){c.originalBody+='SELECTED_PRIVATE_RAW_SENTINEL';c.facts.originalBodyHash=bytesHash(c.originalBody);}}}}),a=f.create();assert.equal(f.view(a).decision.record.conditionsStatus,'UNKNOWN');
  for(const c of P0_POLICY.criteria)await f.accept(a,c.criterionId);
  const v=f.view(a);assert.equal(v.evidence.length,4);assert.equal(v.decision.record.conditionsStatus,'MET');
  assert.deepEqual(v.gates,P0_GATES);assert.equal(v.realAcceptanceReady,false);
  assert.equal(v.decision.record.amountCandidate.amountAtoms,'100000000');
  for(const e of v.evidence){validateP0Evidence(e.record);assert.equal(e.record.verification.sourceStatus,'MOCK_VERIFIED');}
  assert.equal(statSync(f.directory).mode&0o777,0o700);assert.equal(statSync(join(f.directory,'bootcamp.sqlite')).mode&0o777,0o600);
  const disk=readFileSync(join(f.directory,'bootcamp.sqlite'));
  assert.equal(disk.includes(Buffer.from('originalBody"')),false);assert.equal(disk.includes(Buffer.from('SELECTED_PRIVATE_RAW_SENTINEL')),false);
});
test('default disabled mode and absent producer/source stay UNKNOWN; external receipts have no API',async t=>{
  const f=await storeFixture(t,{store:{mode:'DISABLED'}}),a=f.create();
  assert.equal(f.view(a).decision.record.conditionsStatus,'UNKNOWN');assert.equal(f.store.acceptCandidate,undefined);
  assert.throws(()=>f.request(a),/BC_ACCEPTANCE_DISABLED/);
  const g=await storeFixture(t,{store:{producers:{}}}),b=g.create();assert.throws(()=>g.request(b),/BC_SOURCE_UNKNOWN/);
});
test('server owns participant/recipient, invited participant only, body cannot supply verified or amount',async t=>{
  const f=await storeFixture(t),a=f.create();
  assert.throws(()=>f.view(a,f.bobContext),/FORBIDDEN/);
  assert.throws(()=>f.store.createApplication(f.operatorContext,{},f.key()),/FORBIDDEN/);
  assert.throws(()=>f.store.createApplication(f.aliceContext,{participantId:'forged'},f.key()),/BC_APPLICATION_BODY/);
  assert.throws(()=>f.store.issueRequest(f.aliceContext,a,{criterionId:'activity-complete',expectedRevision:1,verified:true},f.key()),/BC_REQUEST_BODY/);
  const v=f.view(a);assert.match(v.participantId,/^participant-/);assert.match(v.recipientRef,/^recipient-/);
  assert.throws(()=>f.store.createApplication({...f.aliceContext,csrf:'bad'}, {},f.key()),/CSRF/);
});
test('command idempotency survives response loss/restart, conflicts on changed body, historical receipt never revives',async t=>{
  const f=await storeFixture(t),a=f.create(),r=f.request(a),body={requestId:r.record.target.requestId,expectedRevision:r.record.applicationRevision},key=f.key();
  const first=await f.store.collect(f.aliceContext,a,body,key),counts=f.counts();f.restart();
  assert.deepEqual(await f.store.collect(f.aliceContext,a,body,key),first);assert.deepEqual(f.counts(),counts);
  assert.deepEqual(f.store.getOperation(f.aliceContext,a,first.record.operationId),first);
  await assert.rejects(f.store.collect(f.aliceContext,a,{...body,expectedRevision:1},key),/BC_IDEMPOTENCY_CONFLICT/);
  f.change(a,'activity-complete',{rawAvailable:false});
  const old=await f.store.collect(f.aliceContext,a,body,key);assert.equal(old.current,false);
  f.change(a,'activity-complete',{rawAvailable:true});f.restart();
  assert.equal(f.store.getEvidence(f.aliceContext,a,first.record.target.evidenceId).current,false);
  assert.equal(f.view(a).decision.record.conditionsStatus,'UNKNOWN');
});
test('new request supersedes pending nonce and old CAS cannot accept',async t=>{
  const f=await storeFixture(t),a=f.create(),r=f.request(a),next=f.request(a,'assignment-submitted');
  assert.equal(f.store.getRequest(f.aliceContext,a,r.record.target.requestId).status,'REVOKED');
  await assert.rejects(f.store.collect(f.aliceContext,a,{requestId:r.record.target.requestId,expectedRevision:r.record.applicationRevision},f.key()),/BC_REVISION_CONFLICT/);
  assert.equal(f.counts().evidence,0);assert.equal(f.store.getRequest(f.aliceContext,a,next.record.target.requestId).status,'PENDING');
});
for(const reason of ['CORRECTED','DELETED','INACCESSIBLE'])test(`${reason} appends UNKNOWN decision, blocks retired guard and preserves history`,async t=>{
  const f=await storeFixture(t),a=f.create(),first=await f.accept(a),old=f.view(a).decision.record;
  const before=f.counts();f.store.invalidate(f.aliceContext,a,{criterionId:'activity-complete',reason,expectedRevision:f.view(a).revision},f.key());
  assert.equal(f.store.getDecision(f.aliceContext,a,old.decisionId).current,false);
  assert.deepEqual(f.store.getEvidence(f.aliceContext,a,first.record.target.evidenceId).record,f.view(a).evidence[0].record);
  assert.equal(f.view(a).evidence[0].current,false);assert.equal(f.view(a).decision.record.conditionsStatus,'UNKNOWN');
  assert.equal(f.counts().decisions,before.decisions+1);assert.throws(()=>f.request(a),/BC_SOURCE_RETIRED/);
  f.change(a,'activity-complete',{sourceHash:p0Hash('CORRECTED-SOURCE',reason),leaseId:'fixture-lease.2'});
  const replacement=await f.accept(a);const e=f.store.getEvidence(f.aliceContext,a,replacement.record.target.evidenceId).record;
  assert.equal(e.evidenceRevision,2);assert.equal(e.previousEvidenceId,first.record.target.evidenceId);
});
test('source changed during async work invalidates old evidence durably even though collect is rejected',async t=>{
  let release,entered;const ready=new Promise(r=>{entered=r;});let block=false;
  const f=await storeFixture(t,{authority:{beforeVerify:async()=>{if(block){entered();await new Promise(r=>{release=r;});}}}}),a=f.create();
  const accepted=await f.accept(a,'activity-complete');const r=f.request(a,'assignment-submitted');block=true;
  const pending=f.store.collect(f.aliceContext,a,{requestId:r.record.target.requestId,expectedRevision:r.record.applicationRevision},f.key());await ready;
  f.change(a,'activity-complete',{rawAvailable:false});f.change(a,'assignment-submitted',{trustHash:p0Hash('TRUST','revoked')});release();
  await assert.rejects(pending,/BC_REVISION_CONFLICT|BC_REQUEST/);f.restart();
  assert.equal(f.store.getEvidence(f.aliceContext,a,accepted.record.target.evidenceId).current,false);
  assert.equal(f.counts().evidence,1);assert.equal(f.store.getRequest(f.aliceContext,a,r.record.target.requestId).status,'REVOKED');
});
test('logout during producer work prevents commit; source invalidation still commits',async t=>{
  let revoke=false,source;
  const f=await storeFixture(t,{authority:{beforeVerify:async()=>{if(revoke){f.service.logout(f.aliceContext);source.rawAvailable=false;}}}}),a=f.create();
  await f.accept(a);const r=f.request(a,'assignment-submitted');source=f.resolveSource({applicationId:a,criterionId:'assignment-submitted',participantId:f.view(a).participantId});revoke=true;
  await assert.rejects(f.store.collect(f.aliceContext,a,{requestId:r.record.target.requestId,expectedRevision:r.record.applicationRevision},f.key()),/AUTH_REQUIRED/);
  const context=await f.login(f.alice);assert.equal(f.store.getRequest(context,a,r.record.target.requestId).status,'REVOKED');assert.equal(f.counts().evidence,1);
});
for(const stage of ['after-nonce','after-evidence','after-decision','after-command'])test(`fault ${stage}: nonce/evidence/decision/command roll back together and retry after restart`,async t=>{
  let fail=true;const f=await storeFixture(t,{store:{fault:s=>{if(fail&&s===stage)throw new Error('INJECTED');}}}),a=f.create(),r=f.request(a);
  const body={requestId:r.record.target.requestId,expectedRevision:r.record.applicationRevision},key=f.key(),before=f.counts();
  await assert.rejects(f.store.collect(f.aliceContext,a,body,key),/INJECTED/);assert.deepEqual(f.counts(),before);
  assert.equal(f.store.getRequest(f.aliceContext,a,body.requestId).status,'PENDING');fail=false;f.restart();
  const result=await f.store.collect(f.aliceContext,a,body,key);assert.equal(result.current,true);assert.equal(f.counts().evidence,1);
});
test('two SQLite handles race one CAS and accept a nonce once',async t=>{
  let release,entered=0;const gate=new Promise(r=>{release=r;});
  const f=await storeFixture(t,{authority:{beforeVerify:async()=>{if(++entered===2)release();await gate;}}}),a=f.create(),r=f.request(a),other=f.open();t.after(()=>other.close());
  const body={requestId:r.record.target.requestId,expectedRevision:r.record.applicationRevision};
  const results=await Promise.allSettled([f.store.collect(f.aliceContext,a,body,f.key()),other.collect(f.aliceContext,a,body,f.key())]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.match(results.find(r=>r.status==='rejected').reason.message,/BC_REVISION_CONFLICT/);
  assert.equal(f.counts().evidence,1);
});
test('same proof bundle across new nonce/application is rejected independently of request hash',async t=>{
  const f=await storeFixture(t,{authority:{transform:c=>{c.proofBundleHash=p0Hash('FIXED-BUNDLE','replayed');}}}),a=f.create();await f.accept(a);
  const b=f.create(),r=f.request(b);await assert.rejects(f.store.collect(f.aliceContext,b,{requestId:r.record.target.requestId,expectedRevision:r.record.applicationRevision},f.key()),/BC_PROOF_REPLAY/);
  assert.equal(f.counts().evidence,1);assert.equal(f.store.getRequest(f.aliceContext,b,r.record.target.requestId).status,'PENDING');
});
for(const patch of [
  {sourceVersion:'fixture.2'},{sourceHash:p0Hash('CHANGE','source')},{sourceReceiptHash:p0Hash('CHANGE','receipt')},
  {runtimeMappingHash:p0Hash('CHANGE','mapping')},{trustHash:p0Hash('CHANGE','trust')},{leaseId:'fixture-lease.2'},
  {authExpiresAt:START},{rawExpiresAt:START},{queryExpiresAt:START},{rawAvailable:false},
])test(`current invalidated by ${Object.keys(patch)[0]}; restoring state does not revive`,async t=>{
  const f=await storeFixture(t),a=f.create(),accepted=await f.accept(a),key=a+':activity-complete',prior=structuredClone(f.guards.get(key));
  f.change(a,'activity-complete',patch);assert.equal(f.store.getEvidence(f.aliceContext,a,accepted.record.target.evidenceId).current,false);
  Object.assign(f.guards.get(key),prior);f.restart();assert.equal(f.view(a).evidence[0].current,false);
});
test('freshness boundary expires current with append-only decision; clock rollback is persisted fail-closed',async t=>{
  const f=await storeFixture(t),a=f.create(),accepted=await f.accept(a);f.setTime(START+300);assert.equal(f.view(a).evidence[0].current,true);
  f.setTime(START+301);assert.equal(f.view(a).evidence[0].current,false);f.setTime(START);
  assert.throws(()=>f.view(a),/BC_CLOCK_REVERSED/);f.restart();assert.throws(()=>f.view(a),/BC_CLOCK_REVERSED/);
  f.setTime(START+301);assert.equal(f.store.getEvidence(f.aliceContext,a,accepted.record.target.evidenceId).current,false);
});
test('initial receipt <1800 and supplement <3600 use scenario clock; source timestamp is not rewritten',async t=>{
  const f=await storeFixture(t),a=f.create();f.setTime(START+1800);assert.throws(()=>f.request(a),/BC_RECEIPT_WINDOW/);
  const g=await storeFixture(t),b=g.create();await g.accept(b);g.setTime(START+3599);
  // Fresh source lease is an explicit new observation, not a timestamp rewrite.
  g.change(b,'activity-complete',{rawExpiresAt:START+5000,authExpiresAt:START+5000,queryExpiresAt:START+5000,leaseId:'fixture-lease.2'});
  const r=g.request(b);g.setTime(START+3600);await assert.rejects(g.store.collect(g.aliceContext,b,{requestId:r.record.target.requestId,expectedRevision:r.record.applicationRevision},g.key()),/BC_RECEIPT_WINDOW/);
});
for(const [label,edit,expected] of [
  ['manual',c=>{c.facts.completionMode='MANUAL';},'UNKNOWN'],['incomplete',c=>{c.facts.completionState='INCOMPLETE';},'NOT_MET'],
  ['draft',c=>{c.facts.submissionState='DRAFT';},'NOT_MET'],['missing topic',c=>{c.facts.topics[0].state='MISSING';c.facts.topics[0].originalEvidenceLocator=null;},'NEEDS_SUPPLEMENT'],
  ['failed certificate',c=>{c.facts.issuerStatus='test_failed';},'NOT_MET'],
])test(`predicate derives ${label}, never accepts a client condition`,async t=>{
  const c=label==='draft'?'assignment-submitted':label==='missing topic'?'reflection-topics':label==='failed certificate'?'python-basic-certificate':'activity-complete';
  const f=await storeFixture(t,{authority:{transform:(v,r)=>{if(r.criterionId===c)edit(v);}}}),a=f.create();await f.accept(a,c);
  assert.equal(f.view(a).decision.record.conditionsStatus,expected);
});
for(const [label,c,edit,code] of [
  ['unsigned condition','activity-complete',v=>{v.condition='MET';},'BC_CANDIDATE'],
  ['request replacement','activity-complete',v=>{v.nonceHash=p0Hash('FORGED','nonce');},'BC_REQUEST_BINDING'],
  ['raw path','activity-complete',v=>{v.rawLocator.fieldPath='/private/token';},'BC_LOCATOR'],
  ['future source time','activity-complete',v=>{v.acquiredAt++;},'BC_SOURCE_TIME'],
  ['raw retention','activity-complete',v=>{v.rawLocator.expiresAt+=1801;},'BC_RAW_EXPIRED'],
  ['wrong quote','reflection-topics',v=>{v.facts.topics[0].originalEvidenceLocator.quoteHash=bytesHash('invented');},'BC_TOPIC_QUOTE'],
  ['old signed proof','python-basic-certificate',v=>{v.facts.accountProofIssuedAt=START-901;},'BC_PROOF_EXPIRED'],
])test(`reject ${label} without consuming nonce or recording evidence`,async t=>{
  const f=await storeFixture(t,{authority:{transform:edit}}),a=f.create(),r=f.request(a,c),before=f.counts();
  await assert.rejects(f.store.collect(f.aliceContext,a,{requestId:r.record.target.requestId,expectedRevision:r.record.applicationRevision},f.key()),new RegExp(code));
  assert.deepEqual(f.counts(),before);assert.equal(f.store.getRequest(f.aliceContext,a,r.record.target.requestId).status,'PENDING');
});
test('cancel is durable, rejects late acceptance and cannot be undone by resolver restoration',async t=>{
  const f=await storeFixture(t),a=f.create(),accepted=await f.accept(a),r=f.request(a,'assignment-submitted');
  f.store.cancel(f.aliceContext,a,{expectedRevision:r.record.applicationRevision},f.key());f.restart();
  assert.equal(f.view(a).status,'CANCELLED');assert.equal(f.view(a).decision.current,false);
  assert.equal(f.store.getEvidence(f.aliceContext,a,accepted.record.target.evidenceId).current,false);
  await assert.rejects(f.store.collect(f.aliceContext,a,{requestId:r.record.target.requestId,expectedRevision:r.record.applicationRevision},f.key()),/BC_ACCEPTANCE_DISABLED/);
});
test('append-only records cannot update/delete; missing replay table or mismatched environment cannot reopen',async t=>{
  const f=await storeFixture(t),a=f.create();await f.accept(a);f.store.invalidate(f.aliceContext,a,{criterionId:'activity-complete',reason:'CORRECTED',expectedRevision:f.view(a).revision},f.key());
  const db=new DatabaseSync(join(f.directory,'bootcamp.sqlite'));t.after(()=>db.close());
  for(const table of ['evidence','decisions','events','commands']){
    assert.throws(()=>db.exec('DELETE FROM '+table),/APPEND_ONLY/);assert.throws(()=>db.exec('UPDATE '+table+' SET record=record'),/APPEND_ONLY/);
  }
  assert.throws(()=>createBootcampStore({...f.configuration,instanceId:'different-instance'}),/WORKFLOW_DB_ENVIRONMENT/);
  db.exec('DROP TABLE retired_guards');assert.throws(()=>f.open(),/WORKFLOW_DB_INCOMPLETE/);
});
test('new login cannot reuse an old session request; issuance requires a fresh command/CAS',async t=>{
  const f=await storeFixture(t),a=f.create(),r=f.request(a);f.service.logout(f.aliceContext);const next=await f.login(f.alice);
  assert.equal(f.store.getRequest(next,a,r.record.target.requestId).status,'REVOKED');
  await assert.rejects(f.store.collect(next,a,{requestId:r.record.target.requestId,expectedRevision:r.record.applicationRevision},f.key()),/BC_REVISION_CONFLICT/);
});
test('create-key replay on clock reversal commits invalidation before returning its error',async t=>{
  const f=await storeFixture(t),key=f.key(),created=f.store.createApplication(f.aliceContext,{},key),a=created.record.applicationId;
  const accepted=await f.accept(a);f.setTime(START-1);
  assert.throws(()=>f.store.createApplication(f.aliceContext,{},key),/BC_CLOCK_REVERSED/);
  f.setTime(START);f.restart();assert.equal(f.store.getEvidence(f.aliceContext,a,accepted.record.target.evidenceId).current,false);
});
test('producer receipt must retain in-process identity and synchronous current recheck',async t=>{
  const f=await storeFixture(t,{authority:{recheck:()=>Promise.resolve(true)}}),a=f.create(),r=f.request(a);
  await assert.rejects(f.store.collect(f.aliceContext,a,{requestId:r.record.target.requestId,expectedRevision:r.record.applicationRevision},f.key()),/BC_PRODUCER_RECHECK/);
  assert.equal(f.counts().evidence,0);
});
test('producer validUntil is retained by the current head, beyond source age alone',async t=>{
  const f=await storeFixture(t,{authority:{transform:c=>{c.validUntilExclusive=START+10;}}}),a=f.create();await f.accept(a);
  f.setTime(START+9);assert.equal(f.view(a).evidence[0].current,true);f.setTime(START+10);assert.equal(f.view(a).evidence[0].current,false);
});
test('expiry after writes but before COMMIT rolls back acceptance and commits request invalidation',async t=>{
  let advance=false;const f=await storeFixture(t,{store:{fault:stage=>{if(advance&&stage==='after-command')f.setTime(START+901);}}}),a=f.create(),r=f.request(a);advance=true;
  await assert.rejects(f.store.collect(f.aliceContext,a,{requestId:r.record.target.requestId,expectedRevision:r.record.applicationRevision},f.key()),/BC_COMMIT_CONTEXT|BC_CANDIDATE_EXPIRED/);
  f.restart();assert.equal(f.counts().evidence,0);assert.equal(f.store.getRequest(f.aliceContext,a,r.record.target.requestId).status,'REVOKED');
});
test('final recheck revocation persists invalidation even when command savepoint rolls back',async t=>{
  let revoke=false,calls=0;const f=await storeFixture(t,{authority:{recheck:()=>{if(revoke&&++calls===2)f.change(a,'activity-complete',{rawAvailable:false});return true;}}}),a=f.create();
  const accepted=await f.accept(a),r=f.request(a,'assignment-submitted');revoke=true;
  await assert.rejects(f.store.collect(f.aliceContext,a,{requestId:r.record.target.requestId,expectedRevision:r.record.applicationRevision},f.key()),/BC_COMMIT_CONTEXT/);
  assert.equal(f.store.getEvidence(f.aliceContext,a,accepted.record.target.evidenceId).current,false);
  assert.equal(f.store.getRequest(f.aliceContext,a,r.record.target.requestId).status,'REVOKED');
});
test('cancelled and failed producer work cannot consume request, timeout is bounded',async t=>{
  const f=await storeFixture(t,{authority:{beforeVerify:()=>new Promise(()=>{})}}),a=f.create(),r=f.request(a),controller=new AbortController();controller.abort();
  const body={requestId:r.record.target.requestId,expectedRevision:r.record.applicationRevision};
  await assert.rejects(f.store.collect(f.aliceContext,a,body,f.key(),{signal:controller.signal}),/BC_PRODUCER_FAILED|BC_CANCELLED/);
  await assert.rejects(f.store.collect(f.aliceContext,a,body,f.key(),{timeoutMs:5}),/BC_PRODUCER_FAILED/);
  assert.equal(f.counts().evidence,0);assert.equal(f.store.getRequest(f.aliceContext,a,r.record.target.requestId).status,'PENDING');
});
