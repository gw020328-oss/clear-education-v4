// Real wall clock, current API/store/native modules, fresh isolated Geth.
// Invented source facts and wallets only; 240s source leases, no login/provider calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {normalPaymentFixture} from './normal-payment-fixture.mjs';

function crossSecond(){const ms=Date.now();Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1001-ms%1000);assert.ok(Math.floor(Date.now()/1000)>Math.floor(ms/1000));}
test('wall-clock ALLOCATE plan crosses a second after REGISTER without discarding current target',async t=>{
 let injected=0,planTicks=0,planned=null;const stop=Error('SYNTHETIC_STOP_AFTER_PLAN');
 const f=await normalPaymentFixture(t,{wallClock:true,sourceSeconds:240,readWhileAsync:true,onPlanTick(n,{kind}){
  if(kind!=='ALLOCATE')return;planTicks=n;if(n===2){crossSecond();injected++;}
 },afterPlan(value){if(value.body.kind==='ALLOCATE'){planned=value;throw stop;}}});
 await assert.rejects(f.run(),e=>e===stop);assert.equal(injected,1);assert.equal(planTicks,7);
 assert.equal(planned.body.kind,'ALLOCATE');assert.equal(planned.body.expectedChainVersion,'1');
 assert.deepEqual(f.report.stages.map(x=>x.kind),['REGISTER']);
 assert.equal(f.metrics().broadcasts,1);assert.equal(f.metrics().transactionSignatures,1);assert.equal(f.metrics().paymentSignatures,0);
});

test('controlled plan rollover completes the real normal-payment modules with 240s sources and two synthetic consents',async t=>{
 let injected=0,planTicks=0;
 const f=await normalPaymentFixture(t,{sourceSeconds:240,readWhileAsync:true,onPlanTick(n,{kind,advanceClock}){
  if(kind!=='ALLOCATE')return;planTicks=n;if(n===2){advanceClock(1);injected++;}
 }});
 await f.run();const r=f.readReport();assert.equal(injected,1);assert.equal(planTicks,7);
 assert.equal(r.completed,true);assert.deepEqual(r.stages.map(x=>x.kind),['REGISTER','ALLOCATE','START_REVIEW','BIND_CONSENTS','PREPARE','ACCEPT']);
 assert.equal(r.claim.amountAtoms,'100000000');assert.equal(r.claim.duplicateRejected,true);
 assert.equal(r.consentOrigin,'AUTHENTICATED_APP_CONSENT_RECORDS');assert.ok(f.concurrentReads()>0);
 assert.equal(f.metrics().broadcasts,6);assert.equal(f.metrics().transactionSignatures,6);assert.equal(f.metrics().paymentSignatures,1);
 assert.equal(f.metadata.prepare("SELECT count(*) n FROM envelopes WHERE state='INCLUDED'").get().n,6);
});

for(const failure of ['source-change','expiry','logout'])test('ALLOCATE plan '+failure+' retains only REGISTER and sends nothing further',async t=>{
 let injected=0;
 const f=await normalPaymentFixture(t,{sourceSeconds:240,onPlanTick(n,{kind,advanceClock,source,app,auth,user}){
  if(kind!=='ALLOCATE')return;
  if(n===2){injected++;advanceClock(failure==='expiry'?240:1);if(failure==='source-change')source.change(app,'activity-complete',{rawAvailable:false});}
  if(n===4&&failure==='logout')auth.logout(user);
 }});
 await assert.rejects(f.run(),/BC_VIEW_STALE|AUTH_REQUIRED/);assert.equal(injected,1);
 const r=f.readReport();assert.equal(r.paymentFailure.operation,'ALLOCATE');assert.equal(r.paymentFailure.step,'PLAN');
 assert.deepEqual(r.stages.map(x=>x.kind),['REGISTER']);assert.equal(r.completed,false);
 assert.equal(f.metrics().broadcasts,1);assert.equal(f.metrics().transactionSignatures,1);assert.equal(f.metrics().paymentSignatures,0);
 assert.equal(f.metadata.prepare('SELECT count(*) n FROM envelopes').get().n,1);
});
