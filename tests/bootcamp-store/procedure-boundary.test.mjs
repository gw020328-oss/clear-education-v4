import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {procedureFixture,START} from './procedure-fixture.mjs';
import {createBootcampStore} from '../../src/bootcamp/store.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';

test('stable allocation replacement preserves one obligation/100, invalidates old preparation and needs new consent',async t=>{
 const f=await procedureFixture(t),a=f.create();await f.complete(a);f.publish(a);f.consent(a);f.consent(a,f.operatorContext);
 const old=f.prepare(a),before=f.view(a),oldTarget=f.store.inspectPreparedForE4(f.operatorContext,a,old.record.target.preparationId);
 await f.refreshEvidence(a,START+100);f.publish(a);const after=f.view(a);
 assert.equal(after.funding.allocationId,before.funding.allocationId);assert.equal(after.funding.reservedAtoms,'100000000');assert.equal(after.procedure.id,before.procedure.id);
 assert.equal(after.consent.bothCurrent,false);assert.equal(after.procedure.firstStartedAt,before.procedure.firstStartedAt);
 assert.throws(()=>f.store.inspectPreparedForE4(f.operatorContext,a,old.record.target.preparationId),/BC_E3_CONFIRMATION_WINDOW|BC_E3_PREPARATION_STALE/);
 f.consent(a);f.consent(a,f.operatorContext);f.newNonce();const next=f.prepare(a),target=f.store.inspectPreparedForE4(f.operatorContext,a,next.record.target.preparationId);
 assert.equal(target.payload.message.allocationId,oldTarget.payload.message.allocationId);assert.notEqual(target.payload.message.decisionId,oldTarget.payload.message.decisionId);
 assert.ok(BigInt(target.payload.message.authorizationEpoch)>BigInt(oldTarget.payload.message.authorizationEpoch));
 assert.deepEqual(target.snapshot.registrations.map(r=>r.opaqueId).sort(),[...new Set(target.snapshot.registrations.map(r=>r.opaqueId))].sort());
});
for(const field of ['fromDecisionHash','fromAuthorizationEpoch','toAuthorizationEpoch','fromAllocationVersion','allocationId'])test(`replacement receipt rejects changed ${field} without republishing/resetting`,async t=>{
 const f=await procedureFixture(t),a=f.create();await f.complete(a);f.publish(a);const before=f.view(a).procedure;
 await f.refreshEvidence(a,START+50);const funding=f.configuration.procedurePorts.funding,body=f.body(a);
 f.configuration.procedurePorts.funding=context=>{const v=funding(context);v.replacement[field]=field.includes('Hash')?p0Hash('BAD',field):field==='allocationId'?'allocation-other':'99';return v;};
 assert.throws(()=>f.store.publishReview(f.aliceContext,a,body,f.key()),/BC_E3_REPLACEMENT|BC_E3_CHECKPOINT_TARGET/);
 f.configuration.procedurePorts.funding=funding;assert.equal(f.view(a).procedure.id,before.id);
});
test('consent ignores browser authority assertions, rejects other actor/CSRF/stale CAS and current scope removal',async t=>{
 const f=await procedureFixture(t),a=f.create();await f.complete(a);f.publish(a);const body=f.body(a,{value:'AGREE'});
 for(const assertion of [{actorRole:'COURSE_OPERATOR'},{wallet:f.operator.address},{verified:true},{recordedAt:START-1},{serverSnapshot:{}}])
  assert.throws(()=>f.store.recordReviewConsent(f.aliceContext,a,{...body,...assertion},f.key()),/BC_E3_COMMAND_BODY/);
 assert.throws(()=>f.store.recordReviewConsent(f.bobContext,a,body,f.key()),/FORBIDDEN/);
 assert.throws(()=>f.store.recordReviewConsent({...f.aliceContext,csrf:'bad'},a,body,f.key()),/CSRF/);
 f.consent(a);assert.throws(()=>f.store.recordReviewConsent(f.operatorContext,a,body,f.key()),/BC_VIEW_STALE/);
 f.consent(a,f.operatorContext);assert.equal(f.view(a).consent.bothCurrent,true);
 f.configuration.resolveOperatorBindings=()=>[];f.restart();assert.equal(f.view(a).consent.bothCurrent,false);
 assert.throws(()=>f.view(a,f.operatorContext),/FORBIDDEN/);
});
test('changed funding during final check rolls back consent; final source invalidation commits',async t=>{
 const f=await procedureFixture(t),a=f.create();await f.complete(a);f.publish(a);const before=f.counts().commands,body=f.body(a,{value:'AGREE'});let n=0;
 f.setHook(name=>{if(name==='funding'&&++n===2){f.setFull(false);f.change(a,'activity-complete',{rawAvailable:false});}});
 assert.throws(()=>f.store.recordReviewConsent(f.aliceContext,a,body,f.key()),/BC_E3_PORT_CHANGED|BC_VIEW_STALE/);f.setHook(()=>{});
 assert.equal(f.view(a).consent.records.length,0);assert.equal(f.view(a).evidence.current,false);assert.equal(f.counts().commands,before);
});
test('final scope change denies E3 DTO and command after source/port callbacks',async t=>{
 const f=await procedureFixture(t),a=f.create();await f.complete(a);f.publish(a);let scope=true,calls=0;
 f.configuration.resolveOperatorBindings=()=>scope?[{wallet:f.operator.address,courseOperatorRef:'course-operator-demo'}]:[];f.restart();
 const body=f.body(a,{value:'AGREE'});f.setHook(name=>{if(name==='funding'&&++calls===2)scope=false;});
 assert.throws(()=>f.store.recordReviewConsent(f.operatorContext,a,body,f.key()),/FORBIDDEN/);f.setHook(()=>{});scope=true;
 calls=0;f.setHook(name=>{if(name==='funding'&&++calls===2)scope=false;});assert.throws(()=>f.view(a,f.operatorContext),/FORBIDDEN/);
});
test('prepared nonce is pinned once, repeated key/GET are stable and a later changed issuance cannot overwrite it',async t=>{
 const f=await procedureFixture(t),a=f.create();await f.complete(a);f.publish(a);f.consent(a);f.consent(a,f.operatorContext);
 const body=f.body(a),key=f.key(),op=f.store.prepareReviewAuthorization(f.aliceContext,a,body,key);
 assert.deepEqual(f.store.prepareReviewAuthorization(f.aliceContext,a,body,key),op);assert.deepEqual(f.store.getProcedureOperation(f.aliceContext,a,op.record.operationId),op);
 f.setTime(START+1);assert.throws(()=>f.prepare(a),/BC_E3_PREPARED_NONCE_CONFLICT/);f.newNonce();f.prepare(a);
});
test('unsigned expiry follows earliest source/lease and key/epoch/nonce changes reject old prepared target',async t=>{
 const f=await procedureFixture(t),a=f.create();await f.complete(a);f.publish(a);f.consent(a);f.consent(a,f.operatorContext);const op=f.prepare(a);
 f.auth.authorizationEpoch='9';f.setSigner(false);assert.throws(()=>f.store.inspectPreparedForE4(f.operatorContext,a,op.record.target.preparationId),/BC_E3_PREFLIGHT|BC_E3_EPOCH/);
 f.setSigner(true);f.change(a,'reflection-topics',{authExpiresAt:START+2});f.setTime(START+2);
 assert.equal(f.view(a).evidence.current,false);assert.throws(()=>f.prepare(a),/BC_E3_CURRENT_PUBLICATION_REQUIRED/);
});
test('unresolved termination intent requires E4 atomic work; accepted first denies termination',async t=>{
 const f=await procedureFixture(t),a=f.create();await f.complete(a);f.publish(a);await f.refreshEvidence(a,START+480);f.publish(a);f.setTime(START+600);
 const op=f.store.requestReviewTermination(f.aliceContext,a,f.body(a),f.key());assert.ok(op.record.target.terminationIntentId);
 assert.equal(f.view(a).procedure.reservationReleased,false);f.setAccepted();assert.equal(f.view(a).procedure.status,'ACCEPTED_RIGHT_PRESERVED');
 assert.throws(()=>f.store.requestReviewTermination(f.aliceContext,a,f.body(a),f.key()),/BC_E3_TERMINATION_NOT_READY/);
});
test('new evidence judgement blocks old decision; objection remains unassessed across corrections until server assessment',async t=>{
 const f=await procedureFixture(t),a=f.create();await f.complete(a);f.publish(a);f.consent(a);f.consent(a,f.operatorContext);
 const assessmentId=f.registerAssessment(a,'revalidation');f.store.recordReviewRevalidation(f.aliceContext,a,f.body(a,{assessmentId}),f.key());
 assert.equal(f.view(a).procedure.status,'REVALIDATION_REQUIRED');assert.throws(()=>f.prepare(a),/BC_E3_REVALIDATION_REQUIRED/);
 const evidenceId=f.store.getApplication(f.aliceContext,a).evidence[0].record.evidenceId;
 f.store.submitReviewObjection(f.aliceContext,a,f.body(a,{reason:'SOURCE_MISMATCH',evidenceId}),f.key());await f.refreshEvidence(a,START+50);f.publish(a);
 assert.equal(f.view(a).objection.blocked,true);assert.equal(f.view(a).procedure.reviewCapAt,START+600);
});
test('E4 lifecycle advances beyond publication baseline before replacement; stale checkpoint never overwrites latest target',async t=>{
 const f=await procedureFixture(t),a=f.create();await f.complete(a);f.publish(a);const old=f.view(a),base=f.configuration.procedurePorts.funding;let phase=2;
 f.configuration.procedurePorts.funding=context=>{const v=base(context);v.authorizationEpoch=String(phase);v.allocationVersion=String(phase);f.auth.authorizationEpoch=String(phase);
  if(v.replacement){v.replacement.fromAuthorizationEpoch='4';v.replacement.fromAllocationVersion='4';v.replacement.toAuthorizationEpoch=String(phase);v.replacement.toAllocationVersion=String(phase);}return v;};
 f.consent(a);phase=3;f.consent(a,f.operatorContext);phase=4;f.newNonce();f.prepare(a);
 await f.refreshEvidence(a,START+100);phase=5;f.publish(a);const corrected=f.view(a);
 assert.equal(corrected.funding.allocationId,old.funding.allocationId);assert.equal(corrected.procedure.id,old.procedure.id);assert.equal(corrected.consent.bothCurrent,false);
 phase=2;assert.throws(()=>f.view(a),/BC_E3_CHECKPOINT_REGRESSION/);
});

// Load the fixed E1 own modules in an isolated synthetic folder. Producer and
// funding owner sources are neither modified nor copied. Absolute shared imports
// use their fixed merged code; old store/ops/ledger/model/http stay E1 bytes.
async function fixedE1Factory(root){
 const dir=join(root,'fixed-e1-modules');mkdirSync(dir,{mode:0o700});
 for(const name of ['store','operations','r2-ledger','model']){
  let code=execFileSync('git',['show',`6b4b0cf:src/bootcamp/${name}.mjs`],{encoding:'utf8'});
  const original=new URL(`../../src/bootcamp/${name}.mjs`,import.meta.url);
  code=code.replace(/from '(\.\.?\/[^']+)'/g,(_,p)=>p.startsWith('./')?`from '${p}'`:`from '${new URL(p,original).href}'`)
   .replace("new URL('../../specs/bootcamp/p0-runtime-mapping.json',import.meta.url)",`new URL('${new URL('../../specs/bootcamp/p0-runtime-mapping.json',original).href}')`);
  writeFileSync(join(dir,name+'.mjs'),code,{mode:0o600});
 }return (await import(pathToFileURL(join(dir,'store.mjs')).href)).createBootcampStore;
}
for(const stage of ['e3-after-schema','e3-after-guards'])test(`E1 migration ${stage} rolls back, preserves v1/R2 bytes, and guards old writer after success`,async t=>{
 const f=await procedureFixture(t),makeE1=await fixedE1Factory(f.directory),directory=join(f.directory,'old-e1-synthetic'),config={...f.configuration,directory,procedurePorts:undefined};
 const old=makeE1(config),created=old.createApplication(f.aliceContext,{},'old-create'),a=created.record.applicationId;
 const request=old.issueRequest(f.aliceContext,a,{criterionId:'activity-complete',expectedRevision:1},'old-request');
 await old.collect(f.aliceContext,a,{requestId:request.record.target.requestId,expectedRevision:request.record.applicationRevision},'old-collect');
 const before=old.getApplication(f.aliceContext,a),metrics=old.getMetricEvents(f.aliceContext,a);old.close();
 assert.throws(()=>createBootcampStore({...config,procedurePorts:null,fault:s=>{if(s===stage)throw Error('E3_MIGRATION_FAULT');}}),/E3_MIGRATION_FAULT/);
 const retry=makeE1(config);assert.deepEqual(retry.getApplication(f.aliceContext,a),before);assert.deepEqual(retry.getMetricEvents(f.aliceContext,a),metrics);retry.close();
 const current=createBootcampStore({...config,procedurePorts:null});assert.deepEqual(current.getApplication(f.aliceContext,a),before);assert.deepEqual(current.getMetricEvents(f.aliceContext,a),metrics);current.close();
 const reader=makeE1(config);assert.deepEqual(reader.getApplication(f.aliceContext,a),before);assert.throws(()=>reader.createApplication(f.aliceContext,{},'old-write-after-e3'),/BC_E3_WRITER_REQUIRED/);reader.close();
 const reopen=createBootcampStore({...config,procedurePorts:null});assert.deepEqual(reopen.getApplication(f.aliceContext,a),before);reopen.close();
});
test('append-only procedure/ID mapping tables reject mutation and DB reopen checks missing guards',async t=>{
 const f=await procedureFixture(t),a=f.create();await f.complete(a);f.publish(a);f.consent(a);
 const db=new DatabaseSync(join(f.directory,'bootcamp.sqlite'));t.after(()=>db.close());
 for(const table of ['e3_procedures','e3_publications','e3_records','e3_ids'])assert.throws(()=>db.exec(`UPDATE ${table} SET ${table==='e3_ids'?'opaque_id=opaque_id':'record=record'}`),/APPEND_ONLY/);
 db.exec('DROP TRIGGER e3_insert_commands');assert.throws(()=>f.open(),/BC_E3_SCHEMA/);
});
test('old signed proof and shortest query lease bound .3 preflight independently of source acquiredAt',async t=>{
 const f=await procedureFixture(t,{authority:{transform:(candidate,r)=>{if(r.criterionId==='python-basic-certificate')candidate.facts.accountProofIssuedAt=START-800;}}}),a=f.create();
 await f.complete(a);f.publish(a);f.consent(a);f.consent(a,f.operatorContext);const prepared=f.prepare(a),target=f.store.inspectPreparedForE4(f.operatorContext,a,prepared.record.target.preparationId);
 assert.equal(target.payload.message.sourceValidUntilExclusive,String(START+100));assert.equal(target.payload.message.expiresAt,String(START+100));
 f.setTime(START+100);assert.throws(()=>f.prepare(a),/BC_E3_SOURCE_EXPIRED|BC_E3_CURRENT_PUBLICATION_REQUIRED/);
 const g=await procedureFixture(t,{authority:{transform:(c,r)=>{c.rawLocator.expiresAt=Math.min(c.rawLocator.expiresAt,r.expiresAt);}}}),b=g.create(),participantId=g.store.getApplication(g.aliceContext,b).participantId;
 for(const criterionId of ['activity-complete','assignment-submitted','reflection-topics','python-basic-certificate'])g.resolveSource({applicationId:b,criterionId,participantId}).queryExpiresAt=START+60;
 await g.complete(b);g.publish(b);g.consent(b);g.consent(b,g.operatorContext);const p=g.prepare(b),v=g.store.inspectPreparedForE4(g.operatorContext,b,p.record.target.preparationId);
 assert.equal(v.payload.message.expiresAt,String(START+60));g.setTime(START+60);assert.equal(g.view(b).evidence.current,false);
});
test('internal E4 current CAS rejects forged metadata hash and stale sequence; termination intent rechecks accepted-first',async t=>{
 const f=await procedureFixture(t),a=f.create();await f.complete(a);f.publish(a);f.consent(a);f.consent(a,f.operatorContext);
 const p=f.prepare(a),id=p.record.target.preparationId,target=f.store.inspectPreparedForE4(f.operatorContext,a,id),cas={expectedRevision:target.applicationRevision,expectedLedgerSequence:target.ledgerSequence,expectedSnapshotHash:target.currentSnapshotHash};
 assert.equal(f.store.inspectPreparedForE4(f.operatorContext,a,id,cas).status,'UNSIGNED_PREFLIGHT_ONLY');
 assert.throws(()=>f.store.inspectPreparedForE4(f.operatorContext,a,id,{...cas,expectedSnapshotHash:p0Hash('FORGED','snapshot')}),/BC_E3_PREPARATION_STALE/);
 f.consent(a);assert.throws(()=>f.store.inspectPreparedForE4(f.operatorContext,a,id,cas),/BC_VIEW_STALE/);
 await f.refreshEvidence(a,START+480);f.publish(a);f.setTime(START+600);
 const op=f.store.requestReviewTermination(f.aliceContext,a,f.body(a),f.key()),intent=f.store.inspectTerminationForE4(f.operatorContext,a,op.record.target.terminationIntentId);
 assert.equal(intent.contractMustRecheck,true);assert.equal(intent.intent.epochInvalidated,false);assert.equal(intent.intent.requiredAtomicEffects.length,3);
 f.setAccepted();assert.throws(()=>f.store.inspectTerminationForE4(f.operatorContext,a,op.record.target.terminationIntentId),/BC_E3_TERMINATION_NOT_READY/);
});
test('cancel before cap invalidates first accept without inventing a new release condition',async t=>{
 const f=await procedureFixture(t),a=f.create();await f.complete(a);f.publish(a);f.consent(a);f.consent(a,f.operatorContext);const prepared=f.prepare(a);
 const v=f.view(a),funding=f.configuration.procedurePorts.funding;
 // Actual reserved target stays the old MET decision when the source/app is cancelled.
 const db=new DatabaseSync(join(f.directory,'bootcamp.sqlite'),{readOnly:true}),seq=db.prepare('SELECT sequence FROM r2_decisions WHERE decision_id=?').get(v.decisionId).sequence;db.close();
 const reserved=funding({applicationId:a,decisionId:v.decisionId,decisionRevision:v.decisionRevision,decisionHash:v.decisionHash,acceptanceSequence:seq});
 f.configuration.procedurePorts.funding=()=>reserved;
 f.store.cancel(f.aliceContext,a,{expectedRevision:v.applicationRevision},f.key());
 assert.equal(f.view(a).procedure.status,'INVALIDATED_WAIT_FOR_TERMINATION_CONDITION');assert.equal(f.view(a).procedure.terminationReason,null);
 assert.throws(()=>f.store.requestReviewTermination(f.aliceContext,a,f.body(a),f.key()),/BC_E3_TERMINATION_NOT_READY/);
 assert.throws(()=>f.store.inspectPreparedForE4(f.operatorContext,a,prepared.record.target.preparationId),/BC_E3_REVIEW_CLOSED/);
 f.setTime(START+600);const op=f.store.requestReviewTermination(f.aliceContext,a,f.body(a),f.key()),intent=f.store.inspectTerminationForE4(f.operatorContext,a,op.record.target.terminationIntentId);
 assert.ok(['REVIEW_CAP_UNRESOLVED','EXPIRED_EVIDENCE_NOT_REFRESHED_WITHIN_CAP'].includes(intent.intent.reason));assert.equal(intent.reservationReleased,false);
 f.setAccepted();assert.equal(f.view(a).chain.acceptedRight.state,'FIXED_RIGHT_PRESERVED');
});
test('failed preparation rolls back nonce/command/success metric; fresh CAS retry records one failure and one completion',async t=>{
 let fail=false;const f=await procedureFixture(t,{fault:stage=>{if(fail&&stage==='e3-after-prepared')throw Error('E3_PREPARE_FAULT');}}),a=f.create();
 await f.complete(a);f.publish(a);f.consent(a);f.consent(a,f.operatorContext);const before=f.counts().commands,key=f.key(),body=f.body(a);fail=true;
 assert.throws(()=>f.store.prepareReviewAuthorization(f.aliceContext,a,body,key),/E3_PREPARE_FAULT/);
 const db=new DatabaseSync(join(f.directory,'bootcamp.sqlite'),{readOnly:true});assert.equal(db.prepare('SELECT COUNT(*) n FROM e3_prepared').get().n,0);db.close();assert.equal(f.counts().commands,before);
 fail=false;const fresh=f.body(a),op=f.store.prepareReviewAuthorization(f.aliceContext,a,fresh,key),events=f.store.getMetricEvents(f.aliceContext,a).events.filter(e=>e.operationId===op.record.operationId);
 assert.equal(events.filter(e=>e.eventType==='OPERATION_FAILED').length,1);assert.equal(events.filter(e=>e.eventType==='AUTO_OPERATION_COMPLETED').length,1);
 assert.deepEqual(f.store.prepareReviewAuthorization(f.aliceContext,a,fresh,key),op);assert.equal(f.view(a).procedure.revalidationCount,0);
});
