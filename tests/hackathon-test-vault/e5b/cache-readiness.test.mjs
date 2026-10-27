import test from 'node:test';
import assert from 'node:assert/strict';
import {normalPaymentFixture} from './normal-payment-fixture.mjs';
for(const mode of ['worker','http'])test('expired procedure cache is refreshed by '+mode+' without extending source or replaying REGISTER',async t=>{
 let injected=0,f;f=await normalPaymentFixture(t,{executionVersion:2,wallClock:true,sourceSeconds:240,
  async afterRecovery({report}){if(report.stage!=='REGISTER'||injected++)return;
   await new Promise(r=>setTimeout(r,5500));
   assert.throws(()=>f.store.getProcedure(f.op,f.app),/BC_E3_REGISTERED_SNAPSHOT_EXPIRED/);
   if(mode==='http'){
    const before=f.metrics();const view=await f.http.request('/bootcamp/v3/applications/'+f.app+'/procedure',{actor:f.op});
    assert.equal(view.applicationId,f.app);assert.deepEqual(f.metrics(),before);
   }
  }});
 await f.run();assert.equal(f.report.completed,true);assert.equal(f.report.claim.amountAtoms,'100000000');assert.equal(f.report.claim.duplicateRejected,true);
 assert.equal(f.metrics().broadcasts,6);assert.equal(f.metrics().transactionSignatures,6);assert.equal(f.metrics().paymentSignatures,1);
 assert.equal(f.metadata.prepare("SELECT count(*) n FROM envelopes WHERE state='INCLUDED'").get().n,6);
});

for(const failure of ['logout','source-change','expiry'])test('new preflight refresh still rejects '+failure+' before ALLOCATE',async t=>{
 let injected=0;const f=await normalPaymentFixture(t,{executionVersion:2,sourceSeconds:240,
  afterRefresh({report,auth,user,source,app,advanceClock}){
   if(report.stages.length!==1||report.stages[0].kind!=='REGISTER'||injected)return;injected++;
   if(failure==='logout')auth.logout(user);
   else if(failure==='source-change')source.change(app,'activity-complete',{rawAvailable:false});
   else advanceClock(241);
  }});
 await assert.rejects(f.run(),failure==='logout'?/AUTH_REQUIRED/:/BC_NORMAL_NOT_MET|BC_NORMAL_SOURCE_CHANGED|BC_VIEW_STALE/);
 assert.equal(injected,1);assert.equal(f.report.paymentFailure.operation,'ALLOCATE');assert.equal(f.report.paymentFailure.step,'REVIEW_WINDOW');
 assert.equal(f.metrics().broadcasts,1);assert.equal(f.metrics().transactionSignatures,1);assert.equal(f.metrics().paymentSignatures,0);
 assert.equal(f.metadata.prepare("SELECT count(*) n FROM envelopes WHERE state='INCLUDED'").get().n,1);
});
