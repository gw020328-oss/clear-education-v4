import test from 'node:test';
import assert from 'node:assert/strict';
import {procedureFixture,START} from './procedure-fixture.mjs';
test('internal bootstrap IDs precede allocation/publication; same registry survives restart and correction issues only a new decision mapping',async t=>{
 const f=await procedureFixture(t),a=f.create();await f.complete(a);f.setFull(false);
 const op=f.store.registerCurrentMetForE4(f.operatorContext,a,f.body(a),f.key()),id=op.record.target.registrationTargetId;
 const registration=f.store.inspectRegistrationForE4(f.operatorContext,a,id),before=f.view(a);
 assert.equal(before.procedure.id,null);assert.equal(before.procedure.firstStartedAt,null);assert.equal(before.procedure.reviewCapAt,null);assert.equal(before.consent.records.length,0);
 assert.equal(registration.allocationConfirmed,false);assert.equal(registration.record.sourceWindow.moodleObservedAt.length,3);assert.equal(registration.record.registration.amountAtoms,'100000000');
 f.restart();assert.deepEqual(f.store.inspectRegistrationForE4(f.operatorContext,a,id).record,registration.record);
 // E4 synthetic register/allocate receives these existing IDs; E3 must reuse them.
 const allocated={...registration.record.opaqueTarget};f.setFull(true);f.publish(a);f.consent(a);f.consent(a,f.operatorContext);const prepared=f.prepare(a),target=f.store.inspectPreparedForE4(f.operatorContext,a,prepared.record.target.preparationId);
 for(const field of ['applicationId','decisionId','allocationId'])assert.equal(target.payload.message[field],allocated[field]);
 await f.refreshEvidence(a,START+100);assert.throws(()=>f.publish(a),/BC_E3_REGISTRATION_STALE/);
 const corrected=f.store.registerCurrentMetForE4(f.operatorContext,a,f.body(a),f.key()),next=f.store.inspectRegistrationForE4(f.operatorContext,a,corrected.record.target.registrationTargetId);
 assert.equal(next.record.opaqueTarget.applicationId,allocated.applicationId);assert.equal(next.record.opaqueTarget.allocationId,allocated.allocationId);assert.notEqual(next.record.opaqueTarget.decisionId,allocated.decisionId);
 f.publish(a);assert.equal(f.view(a).procedure.id,before.procedure.id??target.snapshot.logicalTarget.procedureId);assert.equal(f.view(a).procedure.reviewCapAt,START+600);
 assert.throws(()=>f.store.inspectRegistrationForE4(f.operatorContext,a,id),/BC_E3_REGISTRATION_STALE/);
});
test('internal bootstrap enforces authentication/source/CAS and cannot take arbitrary opaque IDs or start without MET',async t=>{
 const f=await procedureFixture(t),a=f.create();f.setFull(false);
 assert.throws(()=>f.store.registerCurrentMetForE4(f.operatorContext,a,f.body(a),f.key()),/BC_E3_CURRENT_MET_REQUIRED/);await f.complete(a);
 const body=f.body(a);assert.throws(()=>f.store.registerCurrentMetForE4(f.bobContext,a,body,f.key()),/FORBIDDEN/);
 assert.throws(()=>f.store.registerCurrentMetForE4(f.operatorContext,a,{...body,opaqueId:'0x'+'99'.repeat(32)},f.key()),/BC_E3_COMMAND_BODY/);
 const op=f.store.registerCurrentMetForE4(f.operatorContext,a,f.body(a),f.key()),id=op.record.target.registrationTargetId,record=f.store.inspectRegistrationForE4(f.operatorContext,a,id);
 const cas={expectedRevision:record.applicationRevision,expectedLedgerSequence:record.ledgerSequence,expectedSnapshotHash:record.currentSnapshotHash};
 assert.equal(f.store.inspectRegistrationForE4(f.operatorContext,a,id,cas).paymentAuthority,false);
 f.change(a,'assignment-submitted',{rawAvailable:false});assert.throws(()=>f.store.inspectRegistrationForE4(f.operatorContext,a,id,cas),/BC_VIEW_STALE|BC_E3_CURRENT_MET_REQUIRED/);
 assert.equal(f.view(a).procedure.firstStartedAt,null);
});
test('trusted host allocation logical ID cannot alias two applications in the durable registry',async t=>{
 const f=await procedureFixture(t),a=f.create(),b=f.create();await f.complete(a);await f.complete(b);f.setFull(false);
 const first=f.store.registerCurrentMetForE4(f.operatorContext,a,f.body(a),f.key()),target=f.store.inspectRegistrationForE4(f.operatorContext,a,first.record.target.registrationTargetId);
 const registration=f.configuration.procedurePorts.registration;f.configuration.procedurePorts.registration=context=>({...registration(context),allocationId:target.record.registration.allocationId});
 assert.throws(()=>f.store.registerCurrentMetForE4(f.operatorContext,b,f.body(b),f.key()),/BC_E3_ALLOCATION_OWNER/);assert.equal(f.view(b).procedure.id,null);
});
