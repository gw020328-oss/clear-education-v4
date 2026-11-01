// Real ISOLATED_LIVE_TEST store, real clock, product HTTPS/API/signing adapter,
// canonical reader, authority, relayer and fresh Geth. External data/wallets invented.
import test from 'node:test';
import assert from 'node:assert/strict';
import {normalPaymentFixture} from './normal-payment-fixture.mjs';
import {registeredSourceFixture} from './registered-source-fixture.mjs';
test('registered source mode through product HTTPS completes preparation, acceptance and exact 100 TEST',{skip:process.env.CLEAR_REGISTERED_PAYMENT_TEST!=='1',timeout:300000},async t=>{
 const source=await registeredSourceFixture(t);
 const f=await normalPaymentFixture(t,{executionVersion:2,mode:'ISOLATED_LIVE_TEST',productHost:true,wallClock:true,sourceFactory:source.sourceFactory,sourceMappingHash:source.mappingHash,selfAttestor:source.selfAttestor});
 assert.equal(f.report.sourceMode,'REGISTERED_TEST_SOURCE');assert.equal(source.stats.ai,1);assert.equal(source.stats.hr,1);
 const evidence=await f.api.decisionEvidence(f.app);assert.equal(evidence.manifest.decision.conditionsStatus,'MET');
 await f.run();assert.equal(f.report.completed,true);
 assert.deepEqual(f.report.stages.map(x=>x.kind),['REGISTER','ALLOCATE','START_REVIEW','BIND_CONSENTS','PREPARE','ACCEPT']);
 assert.equal(f.report.claim.amountAtoms,'100000000');assert.equal(f.report.claim.duplicateRejected,true);assert.equal(f.metrics().paymentSignatures,1);assert.equal(f.metrics().broadcasts,6);
 const events=f.http.events,registration=events.filter(e=>e.path.includes('/recipient-registration'));
 assert.equal(registration.filter(e=>e.method==='POST').length,1);assert.equal(registration.filter(e=>e.path.includes('?checkpoint=')).length,2);assert.equal(events.filter(e=>e.method==='WALLET').length,1);
 assert.equal(events.filter(e=>e.path.endsWith('/review-consents')&&e.method==='POST').length,2);
 const before=f.metrics(),receipt=await f.api.paymentReceipt(f.app),operator=await f.http.request('/bootcamp/v4/applications/'+f.app+'/payment-receipt',{actor:f.op});
 assert.equal(receipt.claim.state,'INCLUDED');assert.equal(receipt.claim.canonical,true);assert.equal(receipt.balance.receivedAtoms,'100000000');assert.equal(receipt.balance.exactExpectedAmountVerified,true);assert.deepEqual(operator.claim,receipt.claim);assert.deepEqual(f.metrics(),before);
 t.diagnostic(JSON.stringify({mode:'ISOLATED_LIVE_TEST',wallClock:true,productHttps:true,sourceMode:'REGISTERED_TEST_SOURCE',externalHr:'SYNTHETIC_HTTPS_SELF_ATTESTOR',moodle:'INVENTED_RECORDS',ai:'INTERCEPTED_HTTP',wallet:'TEST_EOA_NOT_PRIVY_OR_METAMASK',actualLogin:false,paidAiCalls:0,actualUserPayment:false,canonical:true,finalized:false,amountAtoms:receipt.balance.receivedAtoms,duplicateRejected:true}));
});
