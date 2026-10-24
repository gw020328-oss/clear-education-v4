import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {procedureFixture,START} from './procedure-fixture.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';

test('default funding/chain stay unimplemented; views cannot create a procedure or payment authority',async t=>{
 const f=await procedureFixture(t,{defaultPorts:true}),a=f.create();await f.complete(a);const v=f.view(a);
 assert.equal(v.procedure.id,null);assert.equal(v.funding.implementation,'NOT_IMPLEMENTED');assert.equal(v.chain.status,null);
 assert.throws(()=>f.publish(a),/BC_E3_FULL_ALLOCATION_REQUIRED/);assert.equal(f.view(a).procedure.id,null);
});
test('funding wait precedes first start; publication/duplicate/restart keep one procedure and original cap',async t=>{
 const f=await procedureFixture(t),a=f.create();await f.complete(a);f.setFull(false);
 assert.equal(f.view(a).procedure.status,'FUNDING_WAIT');assert.throws(()=>f.publish(a),/BC_E3_FULL_ALLOCATION_REQUIRED/);
 f.setTime(START+100);f.setFull(true);const op=f.publish(a),before=f.view(a).procedure;assert.equal(before.firstStartedAt,START+100);assert.equal(before.reviewCapAt,START+700);
 f.setTime(START+110);f.publish(a);assert.deepEqual(f.view(a).procedure,before);f.restart();assert.deepEqual(f.view(a).procedure,before);
 assert.equal(f.store.getProcedureOperation(f.aliceContext,a,op.record.operationId).record.operationId,op.record.operationId);
});
for(const seconds of [119,120])test(`deadline path at ${seconds} seconds is checked against persistent publication`,async t=>{
 const f=await procedureFixture(t),a=f.create();await f.complete(a);f.publish(a);f.setTime(START+seconds);
 if(seconds===119)assert.throws(()=>f.prepare(a),/BC_E3_CONFIRMATION_WINDOW/);
 else{const op=f.prepare(a),result=f.store.inspectPreparedForE4(f.operatorContext,a,op.record.target.preparationId);
  assert.equal(result.status,'UNSIGNED_PREFLIGHT_ONLY');assert.equal(result.payload.message.eligibilityRoute,'2');assert.equal(result.paymentAuthority,false);
  assert.equal(result.currentServerState.sourceWindow.moodleObservedAt.length,3);assert.equal(result.currentServerState.sourceWindow.reclaimIssuedAt.length,2);
  assert.equal(result.payload.message.sourceValidUntilExclusive,String(START+300));
  assert.equal(result.consentSet.variant,'DEADLINE_CURRENT_APP_CONSENT_SET');assert.equal(result.consentSet.consents.length,0);}
});
test('mutual authenticated app consent permits early preflight and withdrawal blocks it; no circular hash',async t=>{
 const f=await procedureFixture(t),a=f.create();await f.complete(a);f.publish(a);f.consent(a);assert.throws(()=>f.prepare(a),/BC_E3_CONFIRMATION_WINDOW/);
 f.consent(a,f.operatorContext);const op=f.prepare(a),target=f.store.inspectPreparedForE4(f.operatorContext,a,op.record.target.preparationId);
 assert.equal(target.payload.message.eligibilityRoute,'1');assert.equal(target.consentSet.consents.length,2);
 assert.equal(target.payload.message.consentSetHash,p0Hash('E3-APP-CONSENT-SET',target.consentSet));
 const wire=JSON.stringify(target.consentSet);for(const value of ['issuedAt','expiresAt','nonce','deadlinePolicyHash'])assert.equal(wire.includes(value),false);
 f.consent(a,f.operatorContext,'WITHDRAW');assert.equal(f.view(a).consent.bothCurrent,false);assert.throws(()=>f.store.inspectPreparedForE4(f.operatorContext,a,op.record.target.preparationId),/BC_E3_CONFIRMATION_WINDOW|BC_E3_PREPARATION_STALE/);
});
test('partial consent has a tagged deadline set, duplicate command and response-loss GET are stable',async t=>{
 const f=await procedureFixture(t),a=f.create();await f.complete(a);f.publish(a);
 const body=f.body(a,{value:'AGREE'}),key=f.key(),op=f.store.recordReviewConsent(f.aliceContext,a,body,key);
 assert.deepEqual(f.store.recordReviewConsent(f.aliceContext,a,body,key),op);assert.deepEqual(f.store.getProcedureOperation(f.aliceContext,a,op.record.operationId),op);
 f.setTime(START+120);const prepared=f.prepare(a),target=f.store.inspectPreparedForE4(f.operatorContext,a,prepared.record.target.preparationId);
 assert.equal(target.consentSet.variant,'DEADLINE_CURRENT_APP_CONSENT_SET');assert.equal(target.consentSet.consents.length,1);
});
test('substantive unassessed and valid unresolved objections block both routes; only internal assessed receipt resolves',async t=>{
 const f=await procedureFixture(t),a=f.create();await f.complete(a);f.publish(a);f.consent(a);f.consent(a,f.operatorContext);
 const evidenceId=f.store.getApplication(f.aliceContext,a).evidence[0].record.evidenceId,body=f.body(a,{reason:'SOURCE_MISMATCH',evidenceId});
 const first=f.store.submitReviewObjection(f.aliceContext,a,body,f.key());const repeated=f.store.submitReviewObjection(f.aliceContext,a,f.body(a,{reason:'SOURCE_MISMATCH',evidenceId}),f.key());
 assert.equal(first.record.target.actionId,repeated.record.target.actionId);assert.equal(f.view(a).objection.records.length,1);
 assert.throws(()=>f.prepare(a),/BC_E3_OBJECTION_BLOCKED/);f.setTime(START+120);assert.throws(()=>f.prepare(a),/BC_E3_OBJECTION_BLOCKED/);
 assert.throws(()=>f.store.assessReviewObjection(f.operatorContext,a,f.body(a,{assessmentId:'unknown-assessment',objectionId:first.record.target.actionId}),f.key()),/BC_E3_PORT_EXECUTION|BC_E3_ASSESSMENT/);
 for(const outcome of ['VALID_UNRESOLVED','RESOLVED']){
  const assessmentId=f.registerAssessment(a,'objection',{objectionId:first.record.target.actionId,outcome});
  f.store.assessReviewObjection(f.operatorContext,a,f.body(a,{assessmentId,objectionId:first.record.target.actionId}),f.key());
  if(outcome==='VALID_UNRESOLVED')assert.throws(()=>f.prepare(a),/BC_E3_OBJECTION_BLOCKED/);
 }assert.equal(f.view(a).objection.blocked,false);assert.equal(f.view(a).procedure.reviewCapAt,START+600);f.prepare(a);
});
test('new decision needs fresh publication/consents, full new120 can be unavailable but fresh mutual consent works before cap',async t=>{
 const f=await procedureFixture(t),a=f.create();await f.complete(a);f.publish(a);f.consent(a);f.consent(a,f.operatorContext);const before=f.view(a);
 await f.refreshEvidence(a,START+480);assert.equal(f.view(a).procedure.status,'CURRENT_DECISION_PUBLICATION_REQUIRED');f.publish(a);
 const corrected=f.view(a);assert.equal(corrected.procedure.id,before.procedure.id);assert.equal(corrected.procedure.reviewCapAt,START+600);
 assert.equal(corrected.procedure.confirmAt,START+600);assert.equal(corrected.procedure.deadlineRouteAvailable,false);assert.equal(corrected.consent.bothCurrent,false);
 f.setTime(START+599);assert.throws(()=>f.prepare(a),/BC_E3_CONFIRMATION_WINDOW/);f.consent(a);f.consent(a,f.operatorContext);f.prepare(a);
 f.setTime(START+600);assert.equal(f.view(a).procedure.status,'UNRESOLVED_TERMINATION_REQUIRED');assert.throws(()=>f.prepare(a),/BC_E3_REVIEW_CLOSED/);
 assert.equal(f.view(a).procedure.reservationReleased,false);assert.equal(f.view(a).procedure.epochInvalidated,false);
});
test('revalidation counts new assessed grounds once, retry and routine evidence collection do not reset cap or consume another budget',async t=>{
 const f=await procedureFixture(t),a=f.create();await f.complete(a);f.publish(a);const assessmentId=f.registerAssessment(a,'revalidation');
 const body=f.body(a,{assessmentId}),key=f.key(),op=f.store.recordReviewRevalidation(f.aliceContext,a,body,key);
 assert.deepEqual(f.store.recordReviewRevalidation(f.aliceContext,a,body,key),op);assert.equal(f.view(a).procedure.revalidationCount,1);
 f.store.recordReviewRevalidation(f.aliceContext,a,f.body(a,{assessmentId}),f.key());assert.equal(f.view(a).procedure.revalidationCount,1);
 await f.refreshEvidence(a,START+100);f.publish(a);assert.equal(f.view(a).procedure.revalidationCount,1);f.restart();assert.equal(f.view(a).procedure.reviewCapAt,START+600);
 const next=f.registerAssessment(a,'revalidation',{kind:'OBJECTIVE_ERROR'});f.store.recordReviewRevalidation(f.aliceContext,a,f.body(a,{assessmentId:next}),f.key());
 const v=f.view(a);assert.equal(v.procedure.revalidationCount,1);assert.equal(v.procedure.status,'UNRESOLVED_TERMINATION_REQUIRED');
 assert.equal(v.procedure.terminationReason,'NEW_VALID_ERROR_AFTER_ONE_REVERIFICATION');assert.throws(()=>f.consent(a),/BC_E3_REVIEW_CLOSED/);
 f.change(a,'activity-complete',{rawAvailable:false});assert.equal(f.view(a).evidence.current,false);
});
test('source exclusive expiry and lease revocation block preflight while accepted right survives source/key/epoch changes',async t=>{
 const f=await procedureFixture(t),a=f.create();await f.complete(a);f.publish(a);f.consent(a);f.consent(a,f.operatorContext);const op=f.prepare(a);
 f.setAccepted();f.setSigner(false);f.auth.authorizationEpoch='2';f.change(a,'activity-complete',{rawAvailable:false});
 const v=f.view(a);assert.equal(v.evidence.current,false);assert.equal(v.chain.acceptedRight.state,'FIXED_RIGHT_PRESERVED');assert.equal(v.chain.acceptedRight.claimExpiresAt,null);
 assert.equal(v.chain.acceptedRight.requiresCurrentSigner,false);assert.equal(f.store.inspectPreparedForE4(f.operatorContext,a,op.record.target.preparationId).status,'NOT_APPLICABLE_ACCEPTED_RIGHT');
});
for(const change of ['expiry','lease'])test(`unaccepted ${change} cannot be hidden by elapsed confirmation time`,async t=>{
 const f=await procedureFixture(t),a=f.create();await f.complete(a);f.publish(a);
 if(change==='expiry')f.setTime(START+300);else{f.setTime(START+120);f.change(a,'activity-complete',{queryExpiresAt:START+120});}
 assert.throws(()=>f.prepare(a),/BC_E3_CURRENT_PUBLICATION_REQUIRED|BC_E3_FULL_ALLOCATION_REQUIRED|BC_E3_SOURCE_EXPIRED/);
 assert.equal(f.view(a).evidence.current,false); // E3 cutoff is exclusive even while v1 age300 remains inclusive
});
