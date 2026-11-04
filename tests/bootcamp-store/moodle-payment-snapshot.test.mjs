import test from 'node:test';
import assert from 'node:assert/strict';
import {symlinkSync,copyFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {paymentFixture} from './moodle-payment-fixture.mjs';
import {START} from './procedure-fixture.mjs';
import {openMoodlePaymentSnapshots} from '../../src/bootcamp/moodle-payment-snapshot.mjs';
import {createMoodlePaymentReader} from '../../src/bootcamp/moodle-payment-projection.mjs';

test('expired pending source request and evidence remain byte-identical under read-only snapshot',async t=>{
 const x=await paymentFixture(t);x.f.request(x.a);x.setWall(START+400);
 const before=x.dump(),bytes=x.bytes();
 const s=x.snapshots.read(x.f.aliceContext,x.a);
 assert.equal(s.sourceCurrentness,'NOT_RECHECKED');assert.equal(s.recordedConditionsStatus,JSON.parse(before.decisions.find(d=>d.id===s.decisionId).record).conditionsStatus);
 assert.deepEqual(x.dump(),before);assert.deepEqual(x.bytes(),bytes);
 assert.ok(before.requests.some(r=>r.status==='PENDING'));
});
test('own operator scope required; other student and removed course binding are denied',async t=>{
 const x=await paymentFixture(t);assert.throws(()=>x.snapshots.read(x.f.bobContext,x.a),/FORBIDDEN/);
 x.f.configuration.operatorBindings=[];assert.throws(()=>x.snapshots.read(x.f.operatorContext,x.a),/FORBIDDEN/);
 assert.equal(x.calls(),0);
});
test('latest withdraw supersedes agree; a new recorded decision never inherits prior consent',async t=>{
 const x=await paymentFixture(t);x.f.consent(x.a,x.f.aliceContext,'WITHDRAW');
 let s=x.snapshots.read(x.f.aliceContext,x.a);assert.equal(s.recordedConsent.participant,'RECORDED_WITHDRAW');
 await x.f.refreshEvidence(x.a,START+10);x.setWall(START+10);
 s=x.snapshots.read(x.f.aliceContext,x.a);assert.equal(s.publication.current,false);
 assert.equal(s.recordedConsent.participant,'NOT_RECORDED');assert.equal(s.recordedConsent.operator,'NOT_RECORDED');
});
test('database path cannot be a symlink or be replaced under an existing reader',async t=>{
 const x=await paymentFixture(t),link=join(x.f.directory,'alias.sqlite');symlinkSync(x.path,link);
 assert.throws(()=>openMoodlePaymentSnapshots({databasePath:link,authentication:x.f.service,resolveOperatorBindings:()=>x.f.configuration.operatorBindings,now:()=>START}),/MOODLE_PAYMENT_DATABASE/);
 const replacement=join(x.f.directory,'replacement.sqlite');copyFileSync(x.path,replacement);renameSync(replacement,x.path);
 assert.throws(()=>x.snapshots.read(x.f.aliceContext,x.a),/MOODLE_PAYMENT_DATABASE_CHANGED/);
});
for(const field of ['participantId','courseOperatorRef','applicationId','policyHash','runtimeMappingHash','participantWallet'])test('fixed owner mapping mismatch '+field+' cannot read a payment',async t=>{
 const x=await paymentFixture(t);
 if(field==='participantWallet'){x.mapping.participantWallet=x.f.bob.address.toLowerCase();x.mapping.recipient=x.mapping.participantWallet;}
 else x.mapping[field]=field.endsWith('Hash')?'0x'+'99'.repeat(32):'other-fixed';
 const reader=createMoodlePaymentReader(x.options);await assert.rejects(reader.read(x.handle));assert.equal(x.calls(),0);
});
for(const field of ['expiresAtExclusive','bindingExpiresAtExclusive'])test('exclusive owner '+field+' deadline blocks even valid canonical receipt',async t=>{
 const x=await paymentFixture(t);x.mapping[field]=START;
 const reader=createMoodlePaymentReader(x.options);await assert.rejects(reader.read(x.handle),/MOODLE_PAYMENT_EXPIRED/);assert.equal(x.calls(),0);
});
test('Moodle authority expiry caps response, and equals-now is rejected',async t=>{
 const x=await paymentFixture(t);x.scopeExpiry(START+2);const r=await x.reader.read(x.handle);assert.equal(r.expiresAtExclusive,START+2);
 x.setWall(START+2);await assert.rejects(x.reader.read(x.handle),/MOODLE_PAYMENT_EXPIRED/);
});
test('CLEAR session expiry caps the response without exporting the session',async t=>{
 const x=await paymentFixture(t);x.mapping.expiresAtExclusive=START+10000;x.mapping.bindingExpiresAtExclusive=START+10000;x.scopeExpiry(START+10000);
 const expiry=x.f.service.whoami(x.f.aliceContext).expiresAt;x.setWall(expiry-2);x.f.setAuthenticationTime(expiry-2);
 const reader=createMoodlePaymentReader(x.options),r=await reader.read(x.handle);assert.equal(r.expiresAtExclusive,expiry);
 x.setWall(expiry);x.f.setAuthenticationTime(expiry);await assert.rejects(reader.read(x.handle),/AUTH_REQUIRED/);
});
