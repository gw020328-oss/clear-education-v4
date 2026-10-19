import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createBootcampStore} from '../../src/bootcamp/store.mjs';
import {r2Ledger,summarizeMetrics} from '../../src/bootcamp/r2-ledger.mjs';
import {P0_POLICY,p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
import {storeFixture} from './fixture.mjs';
const actionBody=(f,a,reason)=>{
 const v=f.store.getOperationsProjection(f.aliceContext,a),old=f.view(a);
 return {expectedRevision:old.revision,expectedLedgerSequence:v.ledgerSequence,targetDecisionId:v.decisionId,
  targetDecisionRevision:v.decisionRevision,targetDecisionHash:v.decisionHash,reason};
};
async function operatorFixture(t){const f=await storeFixture(t);f.configuration.operatorBindings=[{wallet:f.operator.address,courseOperatorRef:'course-operator-demo'}];f.restart();return f;}
test('v2 student/operator DTO shares ledger and decision pins; operator receives no raw facts or original access',async t=>{
 const f=await operatorFixture(t),a=f.create();for(const c of P0_POLICY.criteria)await f.accept(a,c.criterionId);
 const s=f.store.getOperationsProjection(f.aliceContext,a),o=f.store.getOperationsProjection(f.operatorContext,a);
 for(const k of ['ledgerSequence','applicationId','decisionId','decisionRevision','decisionHash','runtimeMappingHash','fundingSnapshotId'])assert.equal(s[k],o[k]);
 assert.equal(s.version,'clear-bootcamp-operations-projection.2');assert.equal(s.evidence.state,'COMPLETE');assert.equal(s.payment.state,'BLOCKED');
 assert.equal(s.funding.implementation,'NOT_IMPLEMENTED');assert.equal(s.fundingSnapshotId,null);assert.equal(s.payment.transactionHash,null);
 assert.ok(s.evidence.criteria.every(c=>c.originalEvidenceAccessible));assert.ok(o.evidence.criteria.every(c=>!c.originalEvidenceAccessible));
 const text=JSON.stringify(o);for(const raw of ['accountBindingRef','originalEvidenceLocator','sourceUsernameHash','__Host-clear-session',f.alice.address])assert.equal(text.includes(raw),false);
 assert.throws(()=>f.store.getApplication(f.operatorContext,a),/FORBIDDEN/);
 assert.throws(()=>f.store.getOperationsProjection(f.bobContext,a),/FORBIDDEN/);
 f.configuration.operatorBindings=[];f.restart();assert.throws(()=>f.store.getOperationsProjection(f.operatorContext,a),/FORBIDDEN/);
});
test('same ledger pagination scopes the operator and rejects stale sequence without rolling back invalidation',async t=>{
 const f=await operatorFixture(t),a=f.create(),b=f.create();await f.accept(a);
 const page=f.store.listOperations(f.operatorContext,{limit:1});assert.equal(page.rows.length,1);assert.ok(page.nextAfter);
 const next=f.store.listOperations(f.operatorContext,{limit:1,after:page.nextAfter,expectedLedgerSequence:page.ledgerSequence});assert.equal(next.rows.length,1);
 assert.throws(()=>f.store.listOperations(f.aliceContext),/FORBIDDEN/);
 f.change(a,'activity-complete',{rawAvailable:false});assert.throws(()=>f.store.listOperations(f.operatorContext,{expectedLedgerSequence:page.ledgerSequence}),/BC_VIEW_STALE/);
 assert.equal(f.view(a).evidence[0].current,false);assert.notEqual(a,b);
});
test('consent intent stays blocked without allocation and deadline; v1 decision is unchanged',async t=>{
 const f=await operatorFixture(t),a=f.create();for(const c of P0_POLICY.criteria)await f.accept(a,c.criterionId);const before=f.view(a).decision.record;
 const body=actionBody(f,a,'AGREE_SAME_RESULT'),key=f.key(),op=f.store.requestConsent(f.aliceContext,a,body,key);
 const receipt=f.store.getAction(f.aliceContext,a,op.record.target.actionId);assert.equal(receipt.record.processingStatus,'BLOCKED');assert.equal(receipt.usableForAuthorization,false);
 assert.deepEqual(f.store.requestConsent(f.aliceContext,a,body,key),op);assert.deepEqual(f.view(a).decision.record,before);
 const v=f.store.getOperationsProjection(f.operatorContext,a);assert.equal(v.consent.acceptedConsentCount,0);assert.equal(v.consent.deadlinePolicy,null);
 assert.equal(v.consent.noObjectionAutomaticRouteEnabled,false);assert.equal(v.consent.reason,'FULL_ALLOCATION_REQUIRED');
 assert.throws(()=>f.store.requestConsent(f.aliceContext,a,{...body,targetDecisionRevision:body.targetDecisionRevision+1},f.key()),/BC_VIEW_STALE|BC_DECISION_TARGET/);
 assert.throws(()=>f.store.requestConsent(f.aliceContext,a,{...actionBody(f,a,'AGREE_SAME_RESULT'),allocation:'FULLY_ALLOCATED'},f.key()),/BC_R2_ACTION_BODY/);
});
test('objection RECEIVED is UNASSESSED, repeated receipt does not extend a deadline and correction stales old intents',async t=>{
 const f=await operatorFixture(t),a=f.create();await f.accept(a);const consent=f.store.requestConsent(f.aliceContext,a,actionBody(f,a,'AGREE_SAME_RESULT'),f.key());
 const first=f.store.fileObjection(f.aliceContext,a,actionBody(f,a,'SOURCE_MISMATCH'),f.key());
 const again=f.store.fileObjection(f.aliceContext,a,actionBody(f,a,'SOURCE_MISMATCH'),f.key());assert.equal(again.record.target.actionId,first.record.target.actionId);
 const receipt=f.store.getAction(f.operatorContext,a,first.record.target.actionId);assert.equal(receipt.record.processingStatus,'RECEIVED');assert.equal(receipt.record.validityStatus,'UNASSESSED');
 assert.equal(receipt.record.deadlineExtensionAllowed,false);assert.equal(receipt.record.deadlinePolicy,null);
 assert.equal(f.store.getOperationsProjection(f.aliceContext,a).evidence.state,'UNRESOLVED');
 f.store.invalidate(f.aliceContext,a,{criterionId:'activity-complete',reason:'CORRECTED',expectedRevision:f.view(a).revision},f.key());
 assert.equal(f.store.getAction(f.aliceContext,a,consent.record.target.actionId).current,false);assert.equal(f.store.getAction(f.aliceContext,a,first.record.target.actionId).current,false);
 f.restart();assert.equal(f.store.getAction(f.aliceContext,a,consent.record.target.actionId).current,false);
 assert.equal(f.store.validateObjection,undefined);assert.equal(f.store.overrideEligibility,undefined);
});
test('r2 actions require CSRF and exact version/hash/sequence, operator has no arbitrary reason or eligibility setter',async t=>{
 const f=await operatorFixture(t),a=f.create();const b=actionBody(f,a,'UNRESOLVED_QUESTION');
 assert.throws(()=>f.store.fileObjection({...f.aliceContext,csrf:'bad'},a,b,f.key()),/CSRF/);
 assert.throws(()=>f.store.fileObjection(f.bobContext,a,b,f.key()),/FORBIDDEN/);
 assert.throws(()=>f.store.fileObjection(f.operatorContext,a,{...b,reason:'REJECT_STUDENT'},f.key()),/BC_R2_REASON/);
 assert.throws(()=>f.store.fileObjection(f.aliceContext,a,{...b,targetDecisionHash:p0Hash('WRONG','target')},f.key()),/BC_DECISION_TARGET/);
});
test('server metric events are atomic/deduped with the command; human/baseline/whole case remain N/A',async t=>{
 const f=await operatorFixture(t),a=f.create(),r=f.request(a),body={requestId:r.record.target.requestId,expectedRevision:r.record.applicationRevision},key=f.key();
 const op=await f.store.collect(f.aliceContext,a,body,key),before=f.store.getMetricEvents(f.aliceContext,a);
 for(const type of ['CONDITION_VERIFIED','AUTO_OPERATION_COMPLETED','WAIT_INTERVAL'])assert.equal(before.events.filter(e=>e.eventType===type&&e.operationId===op.record.operationId).length,1);
 await f.store.collect(f.aliceContext,a,body,key);assert.deepEqual(f.store.getMetricEvents(f.aliceContext,a),before);
 const m=f.store.getOperationsProjection(f.operatorContext,a).metrics;assert.equal(m.automatedOperationCount,1);assert.ok(m.waitingWallMs>=0);
 for(const k of ['humanWorkMs','manualInterventionCount','baselineHumanWorkMs','humanWorkReductionPercent','overallElapsedMs'])assert.equal(m[k],null);
 const wire=JSON.stringify(before);for(const value of [f.alice.address,f.aliceContext.token,'certificateId','originalBody','cookie'])assert.equal(wire.includes(value),false);
 f.restart();assert.deepEqual(f.store.getMetricEvents(f.aliceContext,a),before);
});
test('failed attempt preserves one logical failure, successful retry records success without erasing failure',async t=>{
 let fail=true;const f=await storeFixture(t,{store:{fault:s=>{if(fail&&s==='after-command')throw Error('INJECTED');}}}),a=f.create(),r=f.request(a);
 const body={requestId:r.record.target.requestId,expectedRevision:r.record.applicationRevision};
 for(let i=0;i<2;i++)await assert.rejects(f.store.collect(f.aliceContext,a,body,f.key()),/INJECTED/);
 let events=f.store.getMetricEvents(f.aliceContext,a).events;assert.equal(events.filter(e=>e.eventType==='OPERATION_FAILED').length,1);
 assert.equal(events.filter(e=>e.eventType==='AUTO_OPERATION_COMPLETED').length,0);fail=false;await f.store.collect(f.aliceContext,a,body,f.key());
 events=f.store.getMetricEvents(f.aliceContext,a).events;assert.equal(events.filter(e=>e.eventType==='OPERATION_FAILED').length,1);assert.equal(events.filter(e=>e.eventType==='AUTO_OPERATION_COMPLETED').length,1);
});
test('metric ID conflicts and new IDs for same logical event reject; person/wait union is distinct and epoch mixing rejects',async t=>{
 const f=await storeFixture(t),a=f.create(),v=f.view(a),db=new DatabaseSync(join(f.directory,'bootcamp.sqlite'));t.after(()=>db.close());
 db.prepare('UPDATE e5_meta SET writer=1 WHERE id=1').run();db.prepare('UPDATE e3_meta SET writer=1 WHERE id=1').run();
 try{
 const l=r2Ledger(db),base={version:'clear-bootcamp-metric-event.2',eventId:'metric-fixture',scenarioRunId:'run-fixture',applicationRef:a,
  decisionRevision:v.decision.record.decisionRevision,decisionHash:v.decision.record.decisionHash,operationId:'operation-fixture',eventType:'HUMAN_WORK_INTERVAL',
  startedAtMs:10,endedAtMs:30,actorRef:'actor-fixture',provenance:'SYNTHETIC_EXAMPLE'};
 const metadata={startedUtcMs:100,endedUtcMs:120,epochId:'epoch-fixture'};l.insertMetric(base,metadata);l.insertMetric(base,metadata);
 assert.throws(()=>l.insertMetric({...base,endedAtMs:31},metadata),/BC_METRIC_ID_CONFLICT/);
 assert.throws(()=>l.insertMetric({...base,eventId:'metric-new-id'},metadata),/BC_METRIC_OPERATION_DUPLICATE/);
 assert.throws(()=>l.insertMetric({...base,raw:'not-allowed'},metadata),/BC_METRIC_FIELDS/);
 const other={...base,eventId:'metric-second',operationId:'operation-second',startedAtMs:20,endedAtMs:40};
 const wait={...base,eventId:'metric-wait',operationId:'operation-wait',eventType:'WAIT_INTERVAL',startedAtMs:15,endedAtMs:50};
 const m=summarizeMetrics([base,other,wait]);assert.equal(m.humanWorkMs,30);assert.equal(m.waitingWallMs,35);assert.equal(m.overallElapsedMs,null);assert.equal(m.humanWorkReductionPercent,null);
 assert.throws(()=>summarizeMetrics([base,{...other,scenarioRunId:'different-epoch'}]),/BC_METRIC_EPOCH_MIX/);
 }finally{db.prepare('UPDATE e3_meta SET writer=0 WHERE id=1').run();db.prepare('UPDATE e5_meta SET writer=0 WHERE id=1').run();}
});

// Execute the frozen v1 implementation against a fresh synthetic directory.
// No original/user database or legacy source is copied or opened.
async function frozenV1Factory(){
 const url=new URL('../../src/bootcamp/store.mjs',import.meta.url);
 let code=execFileSync('git',['show','f1efbee6af817083269c518c82fe29501d5b8554:src/bootcamp/store.mjs'],{encoding:'utf8'});
 code=code.replace(/from '(\.\.?\/[^']+)'/g,(_,p)=>`from '${new URL(p,url).href}'`)
  .replace("new URL('../../specs/bootcamp/p0-runtime-mapping.json',import.meta.url)",`new URL('${new URL('../../specs/bootcamp/p0-runtime-mapping.json',url).href}')`);
 return (await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).createBootcampStore;
}
for(const stage of ['r2-after-schema','r2-after-backfill'])test(`frozen v1 migration ${stage} rollback preserves records and can restart/query both versions`,async t=>{
 const f=await storeFixture(t),makeV1=await frozenV1Factory(),oldDirectory=join(f.directory,'v1-original-synthetic');
 const config={...f.configuration,directory:oldDirectory};const v1=makeV1(config);const op=v1.createApplication(f.aliceContext,{},'create-v1'),a=op.record.applicationId;
 const issued=v1.issueRequest(f.aliceContext,a,{criterionId:'activity-complete',expectedRevision:1},'request-v1');
 await v1.collect(f.aliceContext,a,{requestId:issued.record.target.requestId,expectedRevision:issued.record.applicationRevision},'collect-v1');
 const before=v1.getApplication(f.aliceContext,a);v1.close();
 assert.throws(()=>createBootcampStore({...config,fault:s=>{if(s===stage)throw Error('MIGRATION_FAULT');}}),/MIGRATION_FAULT/);
 const old=makeV1(config);assert.deepEqual(old.getApplication(f.aliceContext,a),before);old.close();
 const current=createBootcampStore(config);assert.deepEqual(current.getApplication(f.aliceContext,a),before);assert.equal(current.getOperationsProjection(f.aliceContext,a).fundingSnapshotId,null);current.close();
 const oldReader=makeV1(config);assert.deepEqual(oldReader.getApplication(f.aliceContext,a),before);
 assert.throws(()=>oldReader.createApplication(f.aliceContext,{},'old-writer-after-r2'),/BC_(R2|E3)_WRITER_REQUIRED/);oldReader.close();
 const reopened=createBootcampStore(config);assert.deepEqual(reopened.getApplication(f.aliceContext,a),before);reopened.close();
});
