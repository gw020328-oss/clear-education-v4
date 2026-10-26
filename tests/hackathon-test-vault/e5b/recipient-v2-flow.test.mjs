import test from 'node:test';
import assert from 'node:assert/strict';
import {normalPaymentFixture} from './normal-payment-fixture.mjs';
test('V2 HTTP request/signature to canonical exact 100 TEST through wall-clock Geth',async t=>{
 const f=await normalPaymentFixture(t,{executionVersion:2,wallClock:true,sourceSeconds:240,readWhileAsync:true});
 await f.run();const r=f.readReport();
 assert.equal(r.completed,true);assert.equal(r.registrationAccepted,true);
 assert.deepEqual(r.registrationRequest,{status:'AWAITING_SIGNATURE',chainStatus:'NOT_OBSERVED'});
 assert.deepEqual(r.stages.map(x=>x.kind),['REGISTER','ALLOCATE','START_REVIEW','BIND_CONSENTS','PREPARE','ACCEPT']);
 assert.equal(r.claim.amountAtoms,'100000000');assert.equal(r.claim.duplicateRejected,true);
 assert.equal(f.metrics().broadcasts,6);assert.equal(f.metrics().transactionSignatures,6);assert.equal(f.metrics().paymentSignatures,1);
 assert.equal(f.metadata.prepare("SELECT count(*) n FROM envelopes WHERE state='INCLUDED'").get().n,6);
 await f.connection.refresh(f.app);const chain=f.connection.recipientRegistrationState(f.app);
 assert.equal(chain.chainStatus,'INCLUDED');assert.equal(chain.canonical,true);assert.equal(chain.finalized,false);assert.equal(chain.registrationSequence,'1');
 assert.equal(chain.recipient,f.user.wallet.toLowerCase());
 assert.equal((await f.api.recipientRegistration(f.app)).signatureAccepted,true);
 assert.ok(f.concurrentReads()>0);assert.equal(f.readErrors.length,0);
});
for(const scenario of ['logout','source-change'])test('V2 delayed HTTP registration '+scenario+' sends nothing',async t=>{
 let reached=0;const f=await normalPaymentFixture(t,{executionVersion:2,wallClock:true,sourceSeconds:240,
  beforeRegistrationSignature({source,app,auth,user}){reached++;if(scenario==='logout')auth.logout(user);else source.change(app,'activity-complete',{rawAvailable:false});}});
 await assert.rejects(f.run(),/AUTH_REQUIRED|BC_VIEW_STALE|CURRENT_MET|RECIPIENT_REGISTRATION/);assert.equal(reached,1);
 assert.equal(f.metrics().broadcasts,0);assert.equal(f.metrics().transactionSignatures,0);assert.equal(f.metrics().paymentSignatures,0);
});
