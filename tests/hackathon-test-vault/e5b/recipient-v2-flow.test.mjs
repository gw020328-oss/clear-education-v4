import test from 'node:test';
import assert from 'node:assert/strict';
import {BridgeExecutionService} from '../../../src/hackathon-test-vault/e5b/service.mjs';
import {ExecutionReader} from '../../../src/hackathon-test-vault/e5/reader.mjs';
import {normalPaymentFixture} from './normal-payment-fixture.mjs';
for(const rollover of ['none','receipt','enqueue'])test('V2 HTTP request/signature to canonical exact 100 TEST; rollover='+rollover,async t=>{
 let injected=0;const f=await normalPaymentFixture(t,{executionVersion:2,wallClock:true,sourceSeconds:240,readWhileAsync:true,fault(point,{report}){if(rollover==='receipt'&&point==='e5b-after-completion'&&report.stage==='ACCEPT'||rollover==='enqueue'&&point==='e5-after-receipt'&&report.stage==='REGISTER'){injected++;const before=Date.now();Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1001-before%1000);assert.ok(Math.floor(Date.now()/1000)>Math.floor(before/1000));}}});
 await f.run();const r=f.readReport();
 assert.equal(injected,rollover==='none'?0:1);assert.equal(r.completed,true);assert.equal(r.registrationAccepted,true);
 assert.deepEqual(r.registrationRequest,{status:'AWAITING_SIGNATURE',chainStatus:'NOT_REGISTERED'});
 assert.deepEqual(r.stages.map(x=>x.kind),['REGISTER','ALLOCATE','START_REVIEW','BIND_CONSENTS','PREPARE','ACCEPT']);
 assert.equal(r.claim.amountAtoms,'100000000');assert.equal(r.claim.duplicateRejected,true);
 assert.equal(f.metrics().broadcasts,6);assert.equal(f.metrics().transactionSignatures,6);assert.equal(f.metrics().paymentSignatures,1);
 assert.equal(f.metadata.prepare("SELECT count(*) n FROM envelopes WHERE state='INCLUDED'").get().n,6);
 await f.connection.refresh(f.app);const chain=f.connection.recipientRegistrationState(f.app);
 assert.equal(chain.chainStatus,'INCLUDED');assert.equal(chain.canonical,true);assert.equal(chain.finalized,false);assert.equal(chain.registrationSequence,'1');
 assert.equal(chain.recipient,f.user.wallet.toLowerCase());
 const packet=await f.api.recipientRegistration(f.app);assert.equal(packet.signatureAccepted,true);assert.equal(packet.chainStatus,'INCLUDED');assert.equal(packet.registrationSequence,'1');
 const received=await f.api.paymentReceipt(f.app);assert.equal(received.claim.state,'INCLUDED');assert.equal(received.claim.canonical,true);assert.equal(received.claim.finalized,false);assert.equal(received.balance.receivedAtoms,'100000000');assert.equal(received.balance.exactExpectedAmountVerified,true);
 assert.ok(f.concurrentReads()>0);assert.equal(f.readErrors.length,0);
 const wrong=new ExecutionReader({...f.connection.runtime.manifest,version:'clear-e5-test-runtime.1'});await assert.rejects(wrong.observe({applicationId:chain.chainApplicationId}),/E5_.*CODE|E5_.*TEMPLATE/);
});
for(const scenario of ['logout','source-change'])test('V2 delayed HTTP registration '+scenario+' sends nothing',async t=>{
 let reached=0;const f=await normalPaymentFixture(t,{executionVersion:2,wallClock:true,sourceSeconds:240,
  beforeRegistrationSignature({source,app,auth,user}){reached++;if(scenario==='logout')auth.logout(user);else source.change(app,'activity-complete',{rawAvailable:false});}});
 await assert.rejects(f.run(),/AUTH_REQUIRED|BC_VIEW_STALE|CURRENT_MET|RECIPIENT_REGISTRATION/);assert.equal(reached,1);
 assert.equal(f.metrics().broadcasts,0);assert.equal(f.metrics().transactionSignatures,0);assert.equal(f.metrics().paymentSignatures,0);
});

for(const failure of ['source-change','service-revoked','expiry'])test('V2 HTTP real wall-clock ACCEPT pre-send '+failure+' stops with one sealed envelope and no sixth send',async t=>{
 const current=BridgeExecutionService.prototype.current,checked=BridgeExecutionService.prototype.checked;let f,injected=0;
 if(failure==='expiry')BridgeExecutionService.prototype.checked=async function(b,c,phase){
  if(phase==='BEFORE_DISPATCH'&&c.method==='accept'){injected++;await new Promise(resolve=>setTimeout(resolve,Math.max(0,b.expiresAt*1000-Date.now()+20)));}
  return checked.call(this,b,c,phase);
 };
 else BridgeExecutionService.prototype.current=function(b,o,phase){
  if(phase==='BEFORE_DISPATCH'&&this.commands.get(b.commandHash)?.method==='accept'){injected++;if(failure==='source-change')f.withdrawSource();else f.revokeService();}
  return current.call(this,b,o,phase);
 };
 t.after(()=>{BridgeExecutionService.prototype.current=current;BridgeExecutionService.prototype.checked=checked;});
 f=await normalPaymentFixture(t,{executionVersion:2,wallClock:true,sourceSeconds:240,readWhileAsync:true});
 await assert.rejects(f.run(),/E5B_CONTROLLER_REJECTED|E5_LEASE_EXPIRED/);assert.equal(injected,1);
 assert.equal(f.report.paymentFailure.operation,'ACCEPT');assert.equal(f.report.paymentFailure.step,'DISPATCH');
 assert.equal(f.metrics().broadcasts,5);assert.equal(f.metrics().transactionSignatures,6);assert.equal(f.metrics().paymentSignatures,1);
 assert.deepEqual(f.metadata.prepare('SELECT state,count(*) n FROM envelopes GROUP BY state ORDER BY state').all().map(x=>({...x})),[{state:'INCLUDED',n:5},{state:'SEALED',n:1}]);
});
