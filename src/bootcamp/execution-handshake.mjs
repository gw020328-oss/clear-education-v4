import {randomUUID} from 'node:crypto';
import {canonical,exactKeys,freeze,requireRule as check} from '../policy/values.mjs';
import {e4Hash} from './execution-e4-ports.mjs';

const phases=['BEFORE_SIGN','BEFORE_NONCE_RESERVATION','BEFORE_KEY_FINAL_SYNC','BEFORE_TRANSACTION_KEY_FINAL_SYNC',
 'AFTER_SIGN','AFTER_SIGN_FINAL_SYNC','RECOVER_DURABLE_SEAL','BEFORE_DISPATCH','SEND_STARTED_FINAL_SYNC'];
// Owner-only composition. The worker gets a closed facade, never the service,
// issuer, DB, wallet, raw bytes, or the synchronous controller callbacks.
export function createExecutionHandshake({ports,current,service,live,basis,sameBasis,intent,runtime,l,event,business,db,fault},context){
 check(ports.configured,'BC_E5_E4_UNCONFIGURED');
 const stored=i=>l.events(i.intentId).find(e=>e.kind==='E4_CURRENT_BINDING')??null;
 const reference=i=>l.events(i.intentId).find(e=>e.kind==='E4_SEALED_REFERENCE')??null;
 const lastObservation=i=>db.prepare("SELECT record FROM e5_events WHERE runtime_id=? AND kind='E4_CHAIN_OBSERVATION' ORDER BY sequence DESC").all(i.runtimeId)
  .map(r=>JSON.parse(r.record)).find(r=>r.applicationId===i.applicationId)?.observation??null;
 const run=(action,h,fn)=>service(context,action,h.intentId,(time,authority)=>{
  const state=live(h,time,authority.serviceId);check(state.r.pin_hash===ports.runtime.runtimeHash,'BC_E5_RUNTIME_PIN');
  check(['UNOBSERVED','ACTIVE'].includes(state.r.status),'BC_E5_RUNTIME_SUSPENDED');return fn({...state,time,authority});
 });
 function bound(binding){
  check(binding&&typeof binding.intentId==='string','BC_E5_E4_BINDING');const i=intent(binding.intentId),record=stored(i);
  check(record&&canonical(record.binding)===canonical(binding),'BC_E5_E4_IMMUTABLE_BINDING');
  return record;
 }
 function recheck(state,record,observation=record.observation){
  const {i,r,lease,time,authority}=state;
  check(time<record.binding.expiresAt,'BC_E5_E4_CAPABILITY_EXPIRED');
  sameBasis(record.basis,basis(i,r,lease,time,authority),time);
  check(observation.businessHash===record.binding.businessHash,'BC_E5_E4_BUSINESS_CHANGED');
  const value=current.inspect(i,business(i,time).a,observation,ports.runtime,time);
  check(canonical(value)===canonical(record.current),'BC_E5_E4_CURRENT_CHANGED');return value;
 }
 function issue(state,record,payload,observation){
  recheck(state,record,observation);const certificate=ports.certify(payload);
  // A synchronous issuer is still an injected callback. Check source/scope/CAS
  // again after it returns, before its certificate can escape this transaction.
  recheck(state,record,observation);return certificate;
 }
 function adoptRead(state,ticket){
  const {observation,halt}=ports.consume(ticket),previous=lastObservation(state.i);
  const regression=previous&&(BigInt(observation.business.application.version)<BigInt(previous.business.application.version)||BigInt(observation.business.application.epoch)<BigInt(previous.business.application.epoch));
  if(halt||regression){
   db.prepare("UPDATE e5_runtimes SET status='RECOVERY_BLOCKED',revision=revision+1,record=? WHERE id=?").run(canonical({reason:halt?'PROVEN_REORG':'VERSION_OR_EPOCH_REGRESSION',automaticRebase:false}),state.r.id);
   event(state.i,'E4_RECOVERY_BLOCKED',{evidence:halt,reason:halt?'PROVEN_REORG':'VERSION_OR_EPOCH_REGRESSION',generation:state.r.generation},state.time);
   return {status:'BLOCKED',reason:'RECOVERY_BLOCKED',automaticRebase:false};
  }
  if(previous?.checkpoint.hash===observation.checkpoint.hash){
   const comparable=o=>e4Hash({...o.business,nonce:null,nonceUsed:null});
   check(canonical(previous.checkpoint)===canonical(observation.checkpoint)&&comparable(previous)===comparable(observation)
    &&(previous.business.nonce!==observation.business.nonce||previous.business.nonceUsed===observation.business.nonceUsed),'BC_E5_SAME_BLOCK_CONFLICT');
  }
  return null;
 }
 function saveRead(state,observation){
  const key='e4-read-'+e4Hash({applicationId:state.i.applicationId,generation:state.r.generation,observation}).slice(2);
  if(!db.prepare('SELECT id FROM e5_events WHERE event_key=?').get(key))event(state.i,'E4_CHAIN_OBSERVATION',{applicationId:state.i.applicationId,generation:state.r.generation,observation},state.time,key);
 }
 const worker=Object.freeze({
  status(){return freeze({status:'CURRENT_ADAPTER_ONLY',sourceMode:'SYNTHETIC_TEST_SOURCE',dispatch:'BLOCKED_E4_FINAL_PORT_REVIEW',settlementJob:'NOT_IMPLEMENTED',productionEnabled:false});},
  async prepare(h,expected){
   const request=run('E4_READ_CURRENT',h,state=>{
    sameBasis(expected,basis(state.i,state.r,state.lease,state.time,state.authority),state.time);
    const prepared=db.prepare('SELECT record FROM e3_prepared WHERE application_id=? AND id=?').get(state.i.applicationId,state.i.preparationId);
    check(prepared,'BC_E5_CURRENT_PREPARATION_REQUIRED');const old=stored(state.i);
    const prior=lastObservation(state.i);
    return {query:{applicationId:state.i.chainApplicationId,nonce:JSON.parse(prepared.record).payload.message.nonce},anchor:old?.binding.anchor??prior?.checkpoint??null,priorHash:e4Hash(prior)};
   });
   const ticket=await ports.read(request.query,request.anchor);
   return run('E4_BIND_CURRENT',h,state=>{
    const {i,r,lease,time,authority}=state;sameBasis(expected,basis(i,r,lease,time,authority),time);
    check(e4Hash(lastObservation(i))===request.priorHash,'BC_E5_E4_OBSERVATION_CAS');
    const blocked=adoptRead(state,ticket);if(blocked)return freeze(blocked);
    const {observation}=ports.consume(ticket),value=current.inspect(i,business(i,time).a,observation,ports.runtime,time),old=stored(i);
    if(old){recheck(state,old,observation);saveRead(state,observation);return freeze({binding:old.binding,command:old.current.command,executionAuthorized:false});}
    check(!l.attempts(i.intentId).length,'BC_E5_METADATA_ATTEMPT_NOT_EXECUTABLE');
    // E4-only observations are not converted to the A fixture schema. Activation
    // is a local current-reader state; it does not enable dispatch or production.
    if(r.status==='UNOBSERVED')db.prepare("UPDATE e5_runtimes SET status='ACTIVE',revision=revision+1 WHERE id=?").run(r.id);
    const attempt={version:'clear-bootcamp-test-execution.1',attemptId:'execution-attempt-'+randomUUID(),intentId:i.intentId,operationId:i.operationId,
     generation:r.generation,workerFence:lease.fence,recordedAt:time,transactionState:'NOT_DISPATCHED'};
    db.prepare('INSERT INTO e5_attempts VALUES(?,?,?,?)').run(attempt.attemptId,i.intentId,canonical(attempt),l.next());
    const captured=basis(i,runtime(),lease,time,authority),binding={version:'clear-e5-execution-capability.1',intentId:i.intentId,requestId:i.intentId,attemptId:attempt.attemptId,
     runtimeHash:ports.runtime.runtimeHash,lineage:String(r.generation),workerFence:String(lease.fence),workerId:lease.owner,
     leaseId:'lease-'+e4Hash(h).slice(2,50),expiresAt:Math.min(captured.authorityExpiresAt,value.sourceValidUntilExclusive,value.reviewCapAt,Number(value.payload.message.expiresAt)),
     e3Commitment:e4Hash(captured),commandHash:e4Hash(value.command),anchor:observation.checkpoint,businessHash:observation.businessHash};
    event(i,'E4_CURRENT_BINDING',{binding,basis:captured,current:value,observation,handle:h},time,'e4-current-'+i.intentId);fault('e5-after-current-binding');
    saveRead(state,observation);
    // Final local current check catches a provider callback that changed source
    // or scope even when no E3 command was emitted.
    recheck({...state,r:runtime()},stored(i));return freeze({binding,command:value.command,executionAuthorized:false});
   });
  },
  async seal(h){
   const request=run('E4_AUTHORIZE_SEAL',h,state=>{
    const record=stored(state.i);check(record,'BC_E5_E4_BINDING_REQUIRED');
    const prior=reference(state.i);check(!prior,'BC_E5_E4_REFERENCE_RECOVER_ONLY');
    check(!l.events(state.i.intentId).some(e=>e.kind==='E4_SEAL_REQUESTED'),'BC_E5_E4_SEAL_RECOVERY_REQUIRED');
    const capability=issue(state,record,record.binding);
    event(state.i,'E4_SEAL_REQUESTED',{bindingHash:e4Hash(record.binding),attemptId:record.binding.attemptId},state.time,'e4-seal-request-'+state.i.intentId);
    fault('e5-after-seal-request');return {binding:record.binding,command:record.current.command,capability};
   });
   const ticket=await ports.seal(request); // No SQLite lock spans signing/I/O.
   return run('E4_COMMIT_SEALED_REFERENCE',h,state=>{
    const record=stored(state.i);recheck(state,record);const result=ports.sealed(ticket),prior=reference(state.i);
    if(prior)check(prior.ref===result.ref&&prior.manifestHash===result.manifestHash,'BC_E5_E4_REFERENCE_CONFLICT');
    else event(state.i,'E4_SEALED_REFERENCE',{...result,bindingHash:e4Hash(record.binding),commandHash:record.binding.commandHash,
     originalWorkerFence:record.binding.workerFence,attemptId:record.binding.attemptId,dispatchAuthorized:false},state.time,'e4-sealed-'+state.i.intentId);
    fault('e5-after-e4-reference');return freeze({...result,dispatchAuthorized:false,reason:'E4_FINAL_PORT_REVIEW_PENDING'});
   });
  },
  async readAcceptedRight(h){
   const request=run('E4_READ_RIGHT',h,state=>({applicationId:state.i.chainApplicationId,nonce:'0x'+'00'.repeat(32),
    prior:lastObservation(state.i)}));
   const ticket=await ports.read({applicationId:request.applicationId,nonce:request.nonce},request.prior?.checkpoint??null);
   return run('E4_COMMIT_RIGHT_READBACK',h,state=>{
    check(e4Hash(lastObservation(state.i))===e4Hash(request.prior),'BC_E5_E4_OBSERVATION_CAS');const blocked=adoptRead(state,ticket);if(blocked)return freeze(blocked);
    const {observation}=ports.consume(ticket),result=current.right(business(state.i,state.time).a,observation,ports.runtime);
    saveRead(state,observation);
    return freeze({...result,checkpoint:observation.checkpoint,receiptVerified:false,automaticClaimImplemented:false});
   });
  },
  // No fallback calls, automatic new operation/nonce/signature or fee replacement.
  dispatch(){return freeze({status:'BLOCKED',reason:'E4_FINAL_PORT_REVIEW_PENDING',automaticReplacement:false});},
 });
 const controller=Object.freeze({
  readCurrentSync({binding,observation,payload}){
   const record=bound(binding);
   exactKeys(payload,['version','challenge','phase','bindingHash','observationHash','runtimeHash'],'BC_E5_E4_CURRENT_CHALLENGE');
   check(payload.version==='clear-e5-current-witness.1'&&typeof payload.challenge==='string'&&/^[a-f0-9-]{36}$/.test(payload.challenge)
    &&phases.includes(payload.phase)&&payload.bindingHash===e4Hash(binding)&&payload.observationHash===e4Hash(observation)&&payload.runtimeHash===ports.runtime.runtimeHash,'BC_E5_E4_CURRENT_CHALLENGE');
   const o=ports.witness(observation,binding.anchor,binding.businessHash,record.current.command.method);
   return run('E4_CURRENT_WITNESS',record.handle,state=>issue(state,record,payload,o));
  },
  commitCurrentSync({binding,payload}){
   const record=bound(binding);exactKeys(payload,['version','challenge','ref','manifestHash','bindingHash','runtimeHash'],'BC_E5_E4_COMMIT_CHALLENGE');
   check(payload.version==='clear-e5-api-commit.1'&&typeof payload.challenge==='string'&&/^[a-f0-9-]{36}$/.test(payload.challenge)
    &&payload.bindingHash===e4Hash(binding)&&payload.runtimeHash===ports.runtime.runtimeHash,'BC_E5_E4_COMMIT_CHALLENGE');
   return run('E4_COMMIT_WITNESS',record.handle,state=>{
    const saved=reference(state.i);check(saved&&saved.ref===payload.ref&&saved.manifestHash===payload.manifestHash&&saved.bindingHash===e4Hash(binding),'BC_E5_E4_REFERENCE_NOT_COMMITTED');
    // Commit acknowledgement is evidence of a persisted exact ref, not a dispatch
    // grant. The unreviewed E4 dispatch/adoption boundary remains closed.
    throw Error('BC_E5_E4_DISPATCH_REVIEW_PENDING');
   });
  },
 });
 return Object.freeze({worker,controller});
}
