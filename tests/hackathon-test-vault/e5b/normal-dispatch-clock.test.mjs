// Fresh isolated Geth, actual Date.now throughout and real asynchronous RPC.
// Invented source/model facts and authenticated synthetic actors, 240s sources.
import test from 'node:test';
import assert from 'node:assert/strict';
import {BridgeExecutionService} from '../../../src/hackathon-test-vault/e5b/service.mjs';
import {normalPaymentFixture} from './normal-payment-fixture.mjs';

function crossSecond(){const before=Date.now();Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1001-before%1000);const after=Date.now();assert.ok(Math.floor(after/1000)>Math.floor(before/1000));return {before,after};}
for(const scenario of ['normal','rollover','commit-rollover','lost-response','capability-rollover','consent-rollover','adoption-rollover'])test(`real wall-clock full payment with ${scenario==='rollover'?'ACCEPT BEFORE_DISPATCH rollover':scenario==='commit-rollover'?'ACCEPT COMMIT rollover':scenario==='lost-response'?'lost ACCEPT response':scenario==='capability-rollover'?'PREPARE AUTHORIZE rollover':scenario==='consent-rollover'?'each explicit synthetic consent rollover':scenario==='adoption-rollover'?'ACCEPT adoption record rollover':'ordinary async RPC'}`,async t=>{
 const crossing=scenario==='rollover';
 const original=BridgeExecutionService.prototype.current;let active=false,ticks=0,crossed=null;
 BridgeExecutionService.prototype.current=function(b,o,phase){active=crossing&&phase==='BEFORE_DISPATCH'&&this.commands.get(b.commandHash)?.method==='accept';ticks=0;
  try{return original.call(this,b,o,phase);}finally{active=false;}
 };
 t.after(()=>{BridgeExecutionService.prototype.current=original;});
 const consentCrossings=[],storeTicks=[];let adoptionBinding=null;
 const adopt=BridgeExecutionService.prototype.adopt;BridgeExecutionService.prototype.adopt=function(request){if(scenario==='adoption-rollover')adoptionBinding=request.binding;return adopt.call(this,request);};t.after(()=>{BridgeExecutionService.prototype.adopt=adopt;});
 const f=await normalPaymentFixture(t,{wallClock:true,sourceSeconds:240,readWhileAsync:true,
  fault(point,{report}){if(scenario==='consent-rollover'&&point==='e3-after-consent')consentCrossings.push(crossSecond());if(scenario==='adoption-rollover'&&point==='e5b-after-adoption'&&report.stage==='ACCEPT'){crossed=crossSecond();t.diagnostic(JSON.stringify({phase:'ADOPTION_STORE',...crossed,storeTicks:storeTicks.slice(-8),authorityUntil:adoptionBinding.expiresAt,businessUntil:adoptionBinding.business.businessValidUntil,sourceUntil:adoptionBinding.business.sourceUntil,reviewUntil:adoptionBinding.business.reviewUntil,messageUntil:adoptionBinding.business.messageUntil}));}},
  onStoreTick(){storeTicks.push(Date.now());if(storeTicks.length>16)storeTicks.shift();if(active&&++ticks===2&&!crossed)crossed=crossSecond();}});
 const authorize=BridgeExecutionService.prototype.authorize;
 BridgeExecutionService.prototype.authorize=async function(request){
  if(scenario!=='capability-rollover'||request.command.method!=='prepareUnsigned')return authorize.call(this,request);
  const gate=this.gate;this.gate={...gate,invoke(kind,e){active=kind==='capability';ticks=0;try{return gate.invoke(kind,e);}finally{active=false;}}};
  try{return await authorize.call(this,request);}finally{this.gate=gate;}
 };
 t.after(()=>{BridgeExecutionService.prototype.authorize=authorize;});
 const dispatch=BridgeExecutionService.prototype.dispatch;let lost=0;
 BridgeExecutionService.prototype.dispatch=async function(request){
  if(this.commands.get(request.binding.commandHash)?.method!=='accept')return dispatch.call(this,request);
  const rpc=this.reader.rpc,gate=this.gate;
  if(scenario==='lost-response')this.reader.rpc=async(method,...args)=>{const value=await rpc(method,...args);if(method==='eth_sendRawTransaction'&&!lost++){const e=Error('SYNTHETIC_LOST_RESPONSE');e.code='ECONNRESET';throw e;}return value;};
  if(scenario==='commit-rollover')this.gate={...gate,invoke(kind,e){active=kind==='commit';ticks=0;try{return gate.invoke(kind,e);}finally{active=false;}}};
  try{return await dispatch.call(this,request);}finally{this.reader.rpc=rpc;this.gate=gate;}
 };
 t.after(()=>{BridgeExecutionService.prototype.dispatch=dispatch;});
 await f.run();const r=f.readReport();if(scenario==='lost-response'){assert.equal(lost,1);assert.equal(r.executionDiagnostics.find(x=>x.phase==='BROADCAST').sendOutcome,'UNKNOWN');}
 assert.equal(r.completed,true);assert.deepEqual(r.stages.map(s=>s.kind),['REGISTER','ALLOCATE','START_REVIEW','BIND_CONSENTS','PREPARE','ACCEPT']);
 assert.equal(r.claim.amountAtoms,'100000000');assert.equal(r.claim.duplicateRejected,true);assert.equal(r.consentOrigin,'AUTHENTICATED_APP_CONSENT_RECORDS');
 assert.equal(f.metrics().broadcasts,6);assert.equal(f.metrics().transactionSignatures,6);assert.equal(f.metrics().paymentSignatures,1);
 assert.equal(f.metadata.prepare("SELECT count(*) n FROM envelopes WHERE state='INCLUDED'").get().n,6);
 if(crossing||scenario==='commit-rollover'||scenario==='capability-rollover'||scenario==='adoption-rollover'){assert.ok(crossed);t.diagnostic(JSON.stringify({phase:crossing?'BEFORE_DISPATCH':scenario==='capability-rollover'?'AUTHORIZE':scenario==='adoption-rollover'?'ADOPTION_COMMIT':'COMMIT',...crossed}));}
 if(scenario==='consent-rollover'){assert.equal(consentCrossings.length,2);t.diagnostic(JSON.stringify({phase:'CONSENT_COMMIT',crossings:consentCrossings}));}
});

for(const failure of ['source-change','service-revoked','expiry'])test('real wall-clock ACCEPT pre-send '+failure+' stops with one sealed envelope and no sixth send',async t=>{
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
 f=await normalPaymentFixture(t,{wallClock:true,sourceSeconds:240,readWhileAsync:true});
 await assert.rejects(f.run(),/E5B_CONTROLLER_REJECTED|E5_LEASE_EXPIRED/);assert.equal(injected,1);
 assert.equal(f.report.paymentFailure.operation,'ACCEPT');assert.equal(f.report.paymentFailure.step,'DISPATCH');
 assert.equal(f.metrics().broadcasts,5);assert.equal(f.metrics().transactionSignatures,6);assert.equal(f.metrics().paymentSignatures,1);
 assert.deepEqual(f.metadata.prepare('SELECT state,count(*) n FROM envelopes GROUP BY state ORDER BY state').all().map(x=>({...x})),[{state:'INCLUDED',n:5},{state:'SEALED',n:1}]);
});
