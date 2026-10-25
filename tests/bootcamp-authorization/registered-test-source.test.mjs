import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureV3,rebind} from './test-fixture-v3.mjs';
import {createTestDraftInspector} from '../../src/bootcamp-authorization/test-encoding-v3.mjs';

// Invented data on wall time only; this test is not an actual source receipt.
function currentFixture(){
 const f=fixtureV3(),delta=BigInt(Math.floor(Date.now()/1000))-BigInt(f.now);
 for(const k of ['issuedAt','expiresAt','firstReviewStartedAt','decisionPublishedAt','sourceValidUntilExclusive'])f.snapshot.message[k]=String(BigInt(f.snapshot.message[k])+delta);
 for(const [k,v] of Object.entries(f.state.sourceWindow))f.state.sourceWindow[k]=Array.isArray(v)?v.map(x=>String(BigInt(x)+delta)):String(BigInt(v)+delta);
 f.snapshot.provenance='REGISTERED_TEST_SOURCE';return rebind(f);
}
test('registered source label permits real clock preflight but is never source/payment authority',()=>{
 const f=currentFixture(),r=createTestDraftInspector(f.snapshot).inspect(f.input,f.state);
 assert.equal(r.status,'UNSIGNED_PREFLIGHT_ONLY');assert.equal(r.sourceSignatureVerified,false);
 assert.equal(r.consentAuthenticityVerified,false);assert.equal(r.nonceConsumed,false);
 assert.equal(r.gates.paymentAllowed,false);assert.equal(r.gates.usableForIssuance,false);
 assert.throws(()=>createTestDraftInspector(f.snapshot,{clock:()=>f.now}),/REAL_CLOCK_REQUIRED/);
 for(const provenance of ['REGISTERED_SOURCE','REAL','VERIFIED'])assert.throws(()=>createTestDraftInspector({...f.snapshot,provenance}),/SNAPSHOT_VERSION/);
});
test('registered source keeps current, consent, nonce, recipient, allocation and source expiry checks',()=>{
 for(const mutate of [s=>s.currentDecision=false,s=>s.bothPartiesConsent=false,s=>s.nonceAvailable=false,s=>s.recipient='0x'+'99'.repeat(20),s=>s.fullAllocation=false,s=>s.sourceWindow.queryLeaseExpiresAt='1']){
  const f=currentFixture();mutate(f.state);assert.equal(createTestDraftInspector(f.snapshot).inspect(f.input,f.state).status,'REJECTED');
 }
 const expired=fixtureV3();expired.snapshot.provenance='REGISTERED_TEST_SOURCE';
 assert.equal(createTestDraftInspector(expired.snapshot).inspect(expired.input,expired.state).status,'REJECTED');
});
