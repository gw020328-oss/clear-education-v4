// Invented wallets, synthetic four-MET evidence and model facts, isolated Geth.
// No retained actual run, external source, browser or paid provider is opened.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalPaymentFixture} from './normal-payment-fixture.mjs';
import {BridgeExecutionService} from '../../../src/hackathon-test-vault/e5b/service.mjs';
import {RuleError} from '../../../src/policy/values.mjs';
import {isDevelopmentConnection,isCanonicalProcedurePorts} from '../../../src/bootcamp/execution-development.mjs';

for(const scenario of [
 {operation:'ALLOCATE',point:'e5b-after-binding',phase:'B_PREPARE',native:'NONE',broadcasts:1,signatures:1},
 {operation:'REGISTER',point:'e5b-after-adoption',phase:'B_ADOPT_COMMIT',native:'SEALED',broadcasts:0,signatures:1},
])test('persists original '+scenario.operation+' failure outside controller callbacks',async t=>{
 const secret='SYNTHETIC_SECRET_DO_NOT_LOG',cause=new TypeError(secret),error=new RuleError('BC_E5_CURRENT_CHANGED');error.cause=cause;
 let injected=0;
 const f=await normalPaymentFixture(t,{fault(point,{report}){if(report.stage===scenario.operation&&point===scenario.point){injected++;throw error;}}});
 await assert.rejects(f.run(),e=>e===error);
 const saved=f.readReport();assert.equal(saved.paymentFailure.operation,scenario.operation);
 assert.equal(saved.executionDiagnostics[0].phase,scenario.phase);assert.equal(saved.executionDiagnostics[0].code,'BC_E5_CURRENT_CHANGED');
 assert.deepEqual(saved.executionDiagnostics[0].causes,[{errorKind:'TYPE_ERROR',code:'UNCLASSIFIED',codeBasis:'REDACTED'}]);
 assert.equal(injected,1);assert.equal(f.metrics().broadcasts,scenario.broadcasts);assert.equal(f.metrics().transactionSignatures,scenario.signatures);
 assert.equal(f.metrics().paymentSignatures,0);assert.equal(saved.completed,false);
 assert.equal(readFileSync(f.reportPath,'utf8').includes(secret),false);
 const states=f.metadata.prepare("SELECT state FROM envelopes WHERE state!='INCLUDED'").all().map(x=>x.state);
 assert.deepEqual(states,scenario.native==='NONE'?[]:[scenario.native]);
});

test('post-send native failure is recorded before sanitization without another broadcast',async t=>{
 const original=BridgeExecutionService.prototype.current;let injected=0;
 BridgeExecutionService.prototype.current=function(binding,observation,phase){
  if(phase==='RECOVER'&&this.commands.get(binding.commandHash)?.method==='bindConsents'){
   injected++;throw new TypeError('SYNTHETIC_PRIVATE_TEXT',{cause:Error('E5_LEASE_EXPIRED')});
  }
  return original.call(this,binding,observation,phase);
 };
 t.after(()=>{BridgeExecutionService.prototype.current=original;});
 const f=await normalPaymentFixture(t);await assert.rejects(f.run(),/E5B_PORT_REJECTED/);
 const saved=f.readReport();assert.equal(saved.paymentFailure.operation,'BIND_CONSENTS');
 const first=saved.executionDiagnostics[0];assert.equal(first.errorKind,'TYPE_ERROR');assert.equal(first.code,'UNCLASSIFIED');assert.equal(first.causes[0].code,'E5_LEASE_EXPIRED');
 assert.equal(injected,1);assert.equal(f.nativeState(),'SEND_STARTED');assert.equal(f.metrics().broadcasts,4);assert.equal(f.metrics().transactionSignatures,4);assert.equal(f.metrics().paymentSignatures,0);
 assert.equal(readFileSync(f.reportPath,'utf8').includes('SYNTHETIC_PRIVATE_TEXT'),false);
});

test('a lost synthetic send response resolves by canonical readback, six sends and exact payment once',async t=>{
 const original=BridgeExecutionService.prototype.dispatch;let injected=0;
 BridgeExecutionService.prototype.dispatch=async function(request){
  const rpc=this.reader.rpc;
  this.reader.rpc=async(method,...args)=>{
   const result=await rpc(method,...args);
   if(method==='eth_sendRawTransaction'&&injected===0){injected++;const e=Error('PRIVATE_RESPONSE');e.code='ECONNRESET';throw e;}
   return result;
  };
  try{return await original.call(this,request);}finally{this.reader.rpc=rpc;}
 };
 t.after(()=>{BridgeExecutionService.prototype.dispatch=original;});
 const f=await normalPaymentFixture(t,{readWhileAsync:true});
 assert.equal(isDevelopmentConnection(f.connection.configuration),true);assert.equal(isCanonicalProcedurePorts(f.connection.procedurePorts),true);
 await f.run();const saved=f.readReport();assert.equal(saved.completed,true);
 assert.deepEqual(saved.stages.map(x=>x.kind),['REGISTER','ALLOCATE','START_REVIEW','BIND_CONSENTS','PREPARE','ACCEPT']);
 assert.equal(saved.claim.amountAtoms,'100000000');assert.equal(saved.claim.duplicateRejected,true);
 assert.equal(saved.executionDiagnostics[0].phase,'BROADCAST');assert.equal(saved.executionDiagnostics[0].code,'ECONNRESET');assert.equal(saved.executionDiagnostics[0].sendOutcome,'UNKNOWN');
 assert.equal(injected,1);assert.equal(f.metrics().broadcasts,6);assert.equal(f.metrics().transactionSignatures,6);assert.equal(f.metrics().paymentSignatures,1);
 assert.equal(f.metadata.prepare("SELECT count(*) n FROM envelopes WHERE state='INCLUDED'").get().n,6);
 assert.equal(readFileSync(f.reportPath,'utf8').includes('PRIVATE_RESPONSE'),false);
 assert.ok(f.concurrentReads()>0);assert.ok(f.readErrors.every(e=>e instanceof RuleError&&e.message==='BC_E3_REGISTERED_SNAPSHOT_EXPIRED'));assert.equal(saved.consentOrigin,'AUTHENTICATED_APP_CONSENT_RECORDS');
});


test('authority expiry during an awaited dispatch read stops before broadcast',async t=>{
 const original=BridgeExecutionService.prototype.checked;let injected=0,f;
 BridgeExecutionService.prototype.checked=async function(binding,command,phase){
  if(phase==='BEFORE_DISPATCH'&&injected===0){injected++;await new Promise(resolve=>setTimeout(resolve,20));f.advance(61);}
  return original.call(this,binding,command,phase);
 };
 t.after(()=>{BridgeExecutionService.prototype.checked=original;});
 f=await normalPaymentFixture(t);await assert.rejects(f.run());
 const saved=f.readReport();assert.equal(saved.paymentFailure.operation,'REGISTER');assert.equal(saved.paymentFailure.step,'DISPATCH');
 assert.equal(injected,1);assert.equal(f.metrics().broadcasts,0);assert.equal(f.metrics().transactionSignatures,1);assert.equal(f.metrics().paymentSignatures,0);
 assert.equal(f.metadata.prepare('SELECT state FROM envelopes').get().state,'SEALED');
 assert.equal(saved.executionDiagnostics[0].code,'BC_E5_FENCED');
 assert.equal(saved.completed,false);
});
