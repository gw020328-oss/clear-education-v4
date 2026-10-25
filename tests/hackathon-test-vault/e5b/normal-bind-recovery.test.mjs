// Fresh isolated TEST chain; the shared fixture uses actual API and native bridge.
import test from 'node:test';
import assert from 'node:assert/strict';
import {normalPaymentFixture as fixture} from './normal-payment-fixture.mjs';

test('dual direct consents complete BIND and payment when post-send authority recovery crosses one second',async t=>{
 const f=await fixture(t,{crossing:true});
 try{await f.run();}catch(e){t.diagnostic(JSON.stringify({stage:f.report.stage,crossed:f.crossed,nativeBindState:f.nativeState(),completed:f.report.completed,
  callbackDiagnostics:f.diagnostics(),safeError:/^[A-Z][A-Z0-9_]+$/.test(e.message)?e.message:'UNCLASSIFIED'}));throw e;}
 assert.equal(f.crossed,true);assert.equal(f.report.completed,true);
 assert.deepEqual(f.report.stages.map(x=>x.kind),['REGISTER','ALLOCATE','START_REVIEW','BIND_CONSENTS','PREPARE','ACCEPT']);
 assert.equal(f.report.claim.amountAtoms,'100000000');assert.equal(f.report.claim.duplicateRejected,true);
 assert.equal(f.store.getProcedure(f.user,f.app).consent.bothCurrent,true);
 assert.equal(f.metadata.prepare("SELECT count(*) n FROM envelopes WHERE json_extract(record,'$.method')='bindConsents'").get().n,1);
 assert.equal(f.metrics().broadcasts,6);assert.equal(f.metrics().transactionSignatures,6);assert.equal(f.metrics().paymentSignatures,1);
 assert.deepEqual(f.diagnostics().filter(d=>d.code==='BC_E5_CLOCK_CHANGED').map(d=>d.phase),[]);
});

