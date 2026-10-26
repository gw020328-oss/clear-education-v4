import {randomUUID} from 'node:crypto';
import {canonical,exactKeys,freeze,requireRule as check} from '../policy/values.mjs';
import {hash,id} from './model.mjs';
import {e4Hash,validateE4Observation} from './execution-e4-ports.mjs';
import {bridgeBusinessHash,validateBusinessWindow} from './execution-e4b-ports.mjs';
import {bridgeControllerFactory} from './execution-e4b-controller.mjs';
import {executionBridgeLedger} from './execution-b-ledger.mjs';
import {executionCommands} from './execution-commands.mjs';

export function createApiExecutionBridge({db,ports,service:baseService,live,basis,sameBasis,business,app,current,heads,source,global,runtime,event,fault},context){
 // The controller wrapper records only terminal failures after its existing bounded recheck.
 const service=(context,action,...args)=>{try{return baseService(context,action,...args);}catch(error){try{if(action!=='B_CONTROLLER')ports.diagnose?.(action,error);}catch{}throw error;}};
 const ledger=executionBridgeLedger(db),commands=executionCommands({db,current,heads,source});
 const decode=row=>row?JSON.parse(row.record):null;
 function state(g,h,time,authority){const s=live(h,time,authority.serviceId);check(['UNOBSERVED','ACTIVE'].includes(s.r.status),'BC_E5_RUNTIME_SUSPENDED');
  check(g.generation===s.r.generation,'BC_E5_GLOBAL_FENCED');const slot=global.slot(g,h,time,authority);return {...s,g,h,slot};}
 function cas(s,time,authority,{recovery=false}={}){
  const base=recovery?{version:'clear-bootcamp-e5b-recovery-cas.1',intentId:s.h.intentId,generation:s.r.generation,runtimeRevision:s.r.revision,
   localLease:s.h,requestHash:e4Hash(ledger.request(s.h.intentId)),authorityExpiresAt:Math.min(s.lease.expires_at,authority.expiresAt)}:
   basis(s.i,s.r,s.lease,time,authority);
  return freeze({...base,version:recovery?'clear-bootcamp-e5b-recovery-cas.1':'clear-bootcamp-e5b-current-cas.1',runtimeAuthority:s.slot.commitment,
   authorityExpiresAt:Math.min(base.authorityExpiresAt,s.slot.row.expires_at)});
 }
 function run(g,h,action,fn,validateCommit=null){return service(context,action,null,(time,authority)=>fn(state(g,h,time,authority),time,authority),
  validateCommit?(time,authority,value)=>validateCommit(state(g,h,time,authority),time,authority,value):null);}
 function bound(b){const record=ledger.bindings(b.intentId).find(r=>canonical(r.binding)===canonical(b));check(record,'BC_E5B_UNKNOWN_BINDING');return record;}
 function inspectBound(s,e,{kind,recovery,time,authority}){
  const record=bound(e.binding),b=record.binding;
  check(time<b.expiresAt&&canonical(record.globalHandle)===canonical(s.g)&&canonical(record.localHandle)===canonical(s.h),'BC_E5B_BINDING_AUTHORITY');
  check(canonical(e.command)===canonical(ledger.request(b.intentId).command)&&e4Hash(e.command)===b.commandHash,'BC_E5B_COMMAND_CHANGED');
  if(!recovery){
   sameBasis(record.basis,cas(s,time,authority),time);
   check(time<b.business.businessValidUntil,'BC_E5B_BUSINESS_EXPIRED');
   const o=ports.observation(e.observation,e.command),facts=commands.inspect(s.i,business(s.i,time).a,o,ports.runtime,time);
   check(canonical(facts.command)===canonical(e.command),'BC_E5B_COMMAND_CHANGED');
   check(b.business.sourceUntil===facts.sourceValidUntilExclusive&&b.business.reviewUntil===facts.reviewCapAt
    &&b.business.messageUntil===(facts.payload?Number(facts.payload.message.expiresAt):null),'BC_E5B_WINDOW_CHANGED');
  }else if(b.purpose==='RECOVER')sameBasis(record.basis,cas(s,time,authority,{recovery:true}),time);
  if(kind==='commit'){
   const adoption=ledger.event(b.intentId,'ADOPTION');check(adoption&&adoption.bindingHash===e4Hash(b),'BC_E5B_ADOPTION_NOT_COMMITTED');
   for(const key of ['ref','manifestHash','adoptionId','adoptionHash'])check(e.reference[key]===adoption[key],'BC_E5B_ADOPTION_NOT_COMMITTED');
  }
  return cas(s,time,authority,{recovery});
 }
 ports.bind(bridgeControllerFactory({ports,run:(b,fn)=>{
  const r=bound(b);return run(r.globalHandle,r.localHandle,'B_CONTROLLER', (s,time,authority)=>fn(s,time,authority));
 },inspect:inspectBound}));
 function saveBinding(s,time,authority,request,purpose,observation=null){
  const snapshot=cas(s,time,authority,{recovery:purpose==='RECOVER'}),b={version:'clear-e5-execution-capability.2',purpose,business:request.business,
   intentId:s.i.intentId,requestId:s.i.intentId,attemptId:request.attemptId,runtimeHash:ports.runtime.runtimeHash,lineage:String(s.r.generation),
   workerFence:String(s.g.workerFence),workerId:s.g.owner,leaseId:s.g.leaseId,expiresAt:snapshot.authorityExpiresAt,e3Commitment:e4Hash(snapshot),
   commandHash:e4Hash(request.command),anchor:observation?.checkpoint??request.anchor,businessHash:observation?bridgeBusinessHash(request.command,observation):request.businessHash};
  check(b.businessHash===request.businessHash,'BC_E5B_BUSINESS_CHANGED');
  ledger.bind(s.i.intentId,{binding:b,basis:snapshot,globalHandle:s.g,localHandle:s.h});fault('e5b-after-binding');return freeze(b);
 }
 async function authorize(g,h,b){
  const request=run(g,h,'B_AUTHORIZE_REQUEST',()=>{bound(b);return {binding:b,command:ledger.request(h.intentId).command};});
  const capability=await ports.authorize(request);
  return run(g,h,'B_AUTHORIZE_COMMIT',(s,time,authority)=>{
   const r=bound(b);sameBasis(r.basis,cas(s,time,authority,{recovery:b.purpose==='RECOVER'}),time);
   ledger.append(h.intentId,'CAPABILITY','capability-'+e4Hash(b),capability);fault('e5b-after-capability');return freeze({binding:b,command:request.command,capability});
  },(s,time,authority)=>{
   const r=bound(b);sameBasis(r.basis,cas(s,time,authority,{recovery:b.purpose==='RECOVER'}),time);
   check(time<b.expiresAt&&(b.purpose==='RECOVER'||time<b.business.businessValidUntil),'BC_E5B_BINDING_AUTHORITY');
   check(canonical(ledger.event(h.intentId,'CAPABILITY'))===canonical(capability),'BC_E5B_CAPABILITY_REQUIRED');
  });
 }
 function authorized(b){const capability=ledger.event(b.intentId,'CAPABILITY');check(capability&&canonical(capability.payload)===canonical(b),'BC_E5B_CAPABILITY_REQUIRED');return capability;}
 function reference(b){const r=ledger.event(b.intentId,'REFERENCE');check(r,'BC_E5B_REFERENCE_REQUIRED');return {...r,binding:b,capability:authorized(b)};}
 function validateEnvelope(value,request){
  exactKeys(value,['version','ref','manifestHash','state','runtimeHash','intentId','requestId','attemptId','lineage','commandHash','originalBindingHash','sender','transactionNonce','authorizationNonce','to','value','chainId','dataHash','txHash','businessValidUntil','originalAuthorityUntil','bytesUntil'],'BC_E5B_ENVELOPE');
  check(value.version==='clear-e5-public-envelope.2'&&value.runtimeHash===ports.runtime.runtimeHash,'BC_E5B_ENVELOPE');
  check(['PREPARING','SIGNING_UNCERTAIN','SEALED','SEND_STARTED','UNKNOWN','INCLUDED','REVERTED','REORGED','EXPIRED_UNSENT'].includes(value.state)
   &&value.sender===request.caller&&value.to===ports.runtime.domain.verifyingContract&&value.value==='0'&&value.chainId===ports.runtime.domain.chainId,'BC_E5B_ENVELOPE');
  for(const [key,wanted]of Object.entries({intentId:request.intentId,requestId:request.intentId,attemptId:request.attemptId,lineage:request.lineage,commandHash:e4Hash(request.command),businessValidUntil:request.business.businessValidUntil}))check(value[key]===wanted,'BC_E5B_ENVELOPE_TARGET');
  id(value.ref);hash(value.originalBindingHash);if(value.manifestHash!==null)hash(value.manifestHash);if(value.txHash!==null)hash(value.txHash);
  return freeze(value);
 }
 const worker={
  status(){return freeze({version:'clear-bootcamp-e5b-api.1',signingEnabled:ports.executionEnabled,dispatchEnabled:ports.executionEnabled,productionEnabled:false});},
  inspect(g,h){return run(g,h,'B_INSPECT',(s,time,authority)=>cas(s,time,authority),
   (s,time,authority,value)=>sameBasis(value,cas(s,time,authority),time));},
  async prepare(g,h,expected){
   const command=run(g,h,'B_READ_REQUEST',(s,time,authority)=>{sameBasis(expected,cas(s,time,authority),time);return commands.command(s.i);});
   const observed=await ports.read(command);let preparedObservation;
   const b=run(g,h,'B_PREPARE',(s,time,authority)=>{
    sameBasis(expected,cas(s,time,authority),time);const {observation:o}=ports.consume(observed,'OBSERVATION');preparedObservation=o;
    const facts=commands.inspect(s.i,business(s.i,time).a,o,ports.runtime,time);check(canonical(facts.command)===canonical(command),'BC_E5B_COMMAND_CHANGED');
    let request=ledger.request(h.intentId);
    if(!request){const limits={createdAt:time,sourceUntil:facts.sourceValidUntilExclusive,reviewUntil:facts.reviewCapAt,messageUntil:facts.payload?Number(facts.payload.message.expiresAt):null};
     const businessWindow={...limits,businessValidUntil:Math.min(time+120,...['sourceUntil','reviewUntil','messageUntil'].map(k=>limits[k]??Infinity))};validateBusinessWindow(businessWindow);
     request=ledger.requestOnce(h.intentId,{version:'clear-bootcamp-e5b-request.1',intentId:h.intentId,attemptId:'bridge-attempt-'+randomUUID(),applicationId:s.i.applicationId,
      command,caller:s.i.caller,business:businessWindow,anchor:o.checkpoint,businessHash:bridgeBusinessHash(command,o),lineage:String(s.r.generation),createdAt:time});
    }
    check(canonical(request.command)===canonical(command)&&time<request.business.businessValidUntil,'BC_E5B_REQUEST_EXPIRED_OR_CHANGED');
    return saveBinding(s,time,authority,request,'EXECUTE',o);
   },(s,time,authority,b)=>inspectBound(s,{binding:b,command,observation:preparedObservation},{kind:'capability',recovery:false,time,authority}));return authorize(g,h,b);
  },
  async recoveryAuthority(g,h){
   const b=run(g,h,'B_RECOVERY_AUTHORITY',(s,time,authority)=>{const request=ledger.request(h.intentId);check(request,'BC_E5B_REQUEST_REQUIRED');return saveBinding(s,time,authority,request,'RECOVER');});
   return authorize(g,h,b);
  },
  async lookup(g,h,b){
   const request=run(g,h,'B_LOOKUP_REQUEST',()=>({binding:b,command:ledger.request(h.intentId).command,capability:authorized(b)}));
   const ticket=ports.lookup(request); // Synchronous E4 callbacks still run outside the API transaction.
   return run(g,h,'B_LOOKUP_COMMIT',()=>{
    const result=ports.consume(ticket,'LOOKUP');check(result.automaticSeal===false&&['NOT_FOUND','FOUND','FOUND_UNSEALED_HOLD'].includes(result.status),'BC_E5B_LOOKUP');
    if(result.status==='NOT_FOUND')return result;
    const value=validateEnvelope(result.envelope,ledger.request(h.intentId));
    if(result.status==='FOUND'){check(value.manifestHash,'BC_E5B_ENVELOPE');ledger.append(h.intentId,'REFERENCE','reference-'+value.ref,{ref:value.ref,manifestHash:value.manifestHash});}
    ledger.append(h.intentId,'ENVELOPE','envelope-'+e4Hash(value),value);return result;
   });
  },
  async seal(g,h,b){
   check(ports.executionEnabled,'BC_E5B_FINAL_PACKET_ACTIVATION_PENDING');
   const request=run(g,h,'B_SEAL_REQUEST',(s,time)=>{
    check(!ledger.event(h.intentId,'SEAL_REQUESTED'),'BC_E5B_SEAL_LOOKUP_REQUIRED');
    const request={binding:b,command:ledger.request(h.intentId).command,capability:authorized(b)};
    ledger.append(h.intentId,'SEAL_REQUESTED','seal-'+h.intentId,{bindingHash:e4Hash(b),recordedAt:time});
    event(s.i,'E4_SEAL_REQUESTED',{bindingHash:e4Hash(b)},time,'e5b-seal-'+h.intentId);fault('e5b-after-seal-request');return request;
   });
   const result=await ports.seal(request);
   return run(g,h,'B_SEAL_REFERENCE',()=>{const r=ports.consume(result,'REFERENCE');ledger.append(h.intentId,'REFERENCE','reference-'+r.ref,r);fault('e5b-after-reference');return r;});
  },
  async adopt(g,h,b){
   const request=run(g,h,'B_ADOPT_REQUEST',()=>reference(b)),ticket=await ports.adopt(request);
   return run(g,h,'B_ADOPT_COMMIT',(s,time,authority)=>{
    const a=ports.consume(ticket,'ADOPTION'),{adoptionHash,...unsigned}=a;
    exactKeys(a,['version','adoptionId','ref','manifestHash','originalBindingHash','binding','bindingHash','businessValidUntil','authorityUntil','adoptionHash'],'BC_E5B_ADOPTION');
    const envelope=ledger.event(h.intentId,'ENVELOPE');check(envelope&&envelope.state==='SEALED'&&envelope.ref===a.ref&&envelope.originalBindingHash===a.originalBindingHash,'BC_E5B_ENVELOPE_REQUIRED');
    check(a.version==='clear-e5-envelope-adoption.1'&&a.ref===request.ref&&a.manifestHash===request.manifestHash&&canonical(a.binding)===canonical(b)
     &&a.bindingHash===e4Hash(b)&&adoptionHash===e4Hash(unsigned)&&a.businessValidUntil===b.business.businessValidUntil&&a.authorityUntil===Math.min(b.expiresAt,b.business.businessValidUntil),'BC_E5B_ADOPTION');
    sameBasis(bound(b).basis,cas(s,time,authority),time);check(time<a.authorityUntil,'BC_E5B_ADOPTION_EXPIRED');
    ledger.append(h.intentId,'ADOPTION','adoption-'+a.adoptionId,a);fault('e5b-after-adoption');return a;
   },(s,time,authority,a)=>{
    sameBasis(bound(b).basis,cas(s,time,authority),time);
    check(time<Math.min(a.authorityUntil,b.expiresAt,b.business.businessValidUntil),'BC_E5B_ADOPTION_EXPIRED');
    check(canonical(ledger.event(h.intentId,'ADOPTION'))===canonical(a),'BC_E5B_ADOPTION_NOT_COMMITTED');
    const envelope=ledger.event(h.intentId,'ENVELOPE');
    check(envelope?.state==='SEALED'&&envelope.ref===a.ref&&envelope.manifestHash===a.manifestHash
     &&envelope.originalBindingHash===a.originalBindingHash,'BC_E5B_ENVELOPE_REQUIRED');
   });
  },
  async dispatch(g,h,b){
   check(ports.executionEnabled,'BC_E5B_FINAL_PACKET_ACTIVATION_PENDING');
   const request=run(g,h,'B_DISPATCH_REQUEST',()=>{
    const a=ledger.event(h.intentId,'ADOPTION');check(a&&a.bindingHash===e4Hash(b),'BC_E5B_ADOPTION_NOT_COMMITTED');
    return {...reference(b),adoptionId:a.adoptionId,adoptionHash:a.adoptionHash};
   });return ports.dispatch(request);
  },
  async recover(g,h,b){
   const request=run(g,h,'B_RECOVER_REQUEST',()=>reference(b));const ticket=await ports.recover(request);
   const result=ports.consume(ticket,'RECEIPT');
   if(!['INCLUDED','REVERTED'].includes(result.status))return run(g,h,'B_RECOVERY_HOLD',()=>{
    check(result.ref===request.ref,'BC_E5B_RECEIPT_REFERENCE');ledger.append(h.intentId,'RECOVERY','recovery-'+randomUUID(),result);return freeze({status:'HOLD',observation:result,automaticResign:false});
   });
   const command=ledger.request(h.intentId).command,observed=await ports.read(command,result.checkpoint);
   return run(g,h,'B_RECEIPT_COMMIT',(s,time,authority)=>{
    const latest=ports.consume(observed,'OBSERVATION');check(result.ref===request.ref&&result.txHash,'BC_E5B_RECEIPT_REFERENCE');hash(result.txHash);
    if(latest.comparison?.status==='REORG_PROVEN_RECOVERY_BLOCKED')return freeze({status:'RECOVERY_BLOCKED',automaticPromotion:false});
    const receipt=validateE4Observation(result.observation,ports.runtime);check(canonical(receipt.checkpoint)===canonical(result.checkpoint)&&receipt.business.applicationId===command.applicationId,'BC_E5B_RECEIPT');
    const envelope=ledger.event(h.intentId,'ENVELOPE');check(envelope&&envelope.ref===request.ref&&envelope.manifestHash===request.manifestHash&&envelope.txHash===result.txHash,'BC_E5B_ENVELOPE_REQUIRED');
    const c=latest.observation.business.application;check(BigInt(c.version)>=BigInt(receipt.business.application.version),'BC_E5B_RECEIPT_REGRESSION');
    if(result.status==='INCLUDED'){
     const a=receipt.business.application,args=command.args;
     if(command.method==='registerCurrentMet')check(a.state==='1'&&a.recipient===args[2]&&canonical(a.target)===canonical(args.length===6?{...args[3],acceptanceSequence:a.target.acceptanceSequence}:args[3])&&(args.length!==6||BigInt(a.target.acceptanceSequence)>0n),'BC_E5B_RECEIPT_POSTCONDITION');
     else if(command.method==='allocate')check(a.state==='2'&&a.allocationId===args[2],'BC_E5B_RECEIPT_POSTCONDITION');
     else if(command.method==='startReview')check(a.state==='3'&&a.procedureId===args[2]&&a.publishedAt===args[3]&&a.firstStartedAt===args[3],'BC_E5B_RECEIPT_POSTCONDITION');
     else if(command.method==='bindConsents')check(a.state==='3'&&a.consentSetHash===args[2]&&a.mutualConsent===args[3],'BC_E5B_RECEIPT_POSTCONDITION');
     else if(command.method==='prepareUnsigned')check(a.state==='3'&&a.preparedDigest===s.i.authorizationDigest&&a.preparedNonce===args[1].nonce,'BC_E5B_RECEIPT_POSTCONDITION');
     else check(command.method==='accept','BC_E5B_RECEIPT_POSTCONDITION');
     check(c.version===a.version&&canonical(c.target)===canonical(a.target)&&c.recipient===a.recipient&&c.allocationId===a.allocationId,'BC_E5B_RECEIPT_POSTCONDITION');
    }
    let job=null;
    if(result.status==='INCLUDED'&&command.method==='accept'){
     const accepted=current.right(app(s.i.applicationId),receipt,ports.runtime),fresh=current.right(app(s.i.applicationId),latest.observation,ports.runtime);
     const expected=command.args[1];check(accepted.right.authorizationDigest===s.i.authorizationDigest&&accepted.right.nonce===expected.nonce,'BC_E5B_ACCEPTED_TARGET');
     check(canonical({...accepted.right,settledAt:fresh.right.settledAt})===canonical(fresh.right),'BC_E5B_ACCEPTED_RIGHT_CHANGED');
     job=ledger.createClaim(s.i.applicationId,accepted.right,{version:'clear-bootcamp-claim-job.1',jobId:'claim-job-'+randomUUID(),applicationId:s.i.applicationId,
      runtimeId:s.i.runtimeId,chainApplicationId:command.applicationId,right:accepted.right,acceptedCheckpoint:receipt.checkpoint,acceptedTxHash:result.txHash,
      createdAt:time,claimOperationId:null,requiresCurrentSource:false,requiresCurrentSigner:false,requiresNewPaymentSignature:false});
    }
    const completion=ledger.complete(h.intentId,{version:'clear-bootcamp-e5b-completion.1',status:result.status,ref:request.ref,manifestHash:request.manifestHash,
     txHash:result.txHash,checkpoint:receipt.checkpoint,currentObservationHash:e4Hash(latest.observation),globalHandle:g,localHandle:h,recordedAt:time});
    fault('e5b-after-completion');global.complete(g,h,time,authority);return freeze({completion,claimJob:job});
   });
  },
  completion(intentId){id(intentId);return service(context,'B_READ_COMPLETION',null,()=>ledger.completion(intentId));},
  claimJobs(applicationId){id(applicationId);return service(context,'B_READ_CLAIM_JOBS',null,()=>ledger.claims(applicationId));},
  async directClaimReceipt(g,jobId,txHash){
   hash(txHash);const expected=service(context,'B_DIRECT_CLAIM_REQUEST',null,(time,authority)=>{
    global.live(g,time,authority.serviceId);const job=ledger.claimJob(jobId);check(job&&job.runtimeId===runtime().id,'BC_E5B_CLAIM_JOB');
    return {job,authorityHash:e4Hash(g),authorityUntil:Math.min(authority.expiresAt,global.live(g,time,authority.serviceId).expires_at)};
   });
   const receiptTicket=await ports.directClaimReceipt({applicationId:expected.job.chainApplicationId,txHash}),receipt=ports.consume(receiptTicket,'DIRECT_CLAIM');
   if(receipt.status==='UNKNOWN')return freeze({status:'UNKNOWN',automaticPromotion:false});
   const command={method:'claim',args:[expected.job.chainApplicationId],applicationId:expected.job.chainApplicationId};
   const observed=await ports.read(command,receipt.checkpoint);
   return service(context,'B_DIRECT_CLAIM_COMMIT',null,(time,authority)=>{
    const row=global.live(g,time,authority.serviceId);check(time<expected.authorityUntil&&Math.min(row.expires_at,authority.expiresAt)>=expected.authorityUntil,'BC_E5B_CLAIM_AUTHORITY');
    const {observation:o,comparison}=ports.consume(observed,'OBSERVATION');check(comparison?.status==='CANONICAL_ANCESTOR','BC_E5B_CLAIM_CANONICAL_REQUIRED');
    const job=ledger.claimJob(jobId);check(canonical(job)===canonical(expected.job),'BC_E5B_CLAIM_JOB_CHANGED');
    const accepted=job.right,at=receipt.observation.business.right,now=o.business.right;
    check(canonical({...accepted,settledAt:at.settledAt})===canonical(at)&&canonical(now)===canonical(at)&&o.business.application.state==='6','BC_E5B_CLAIM_RIGHT_CHANGED');
    const value={status:'SETTLED',jobId,receipt,claimOperationId:null};
    return ledger.settle(jobId,value);
   });
  },
 };
 return Object.freeze(worker);
}
