import {executionCorrections,correctionKinds} from './execution-corrections.mjs';
import {executionCommands} from './execution-commands.mjs';
import {e4Hash} from './execution-e4-ports.mjs';
import {randomUUID} from 'node:crypto';
import {canonical,exactKeys,freeze,requireRule as check} from '../policy/values.mjs';
import {id,hash,revision,epoch} from './model.mjs';
import {p0Hash,P0_GATES} from '../../specs/bootcamp/p0-contract.mjs';
import {currentSourceWindow} from './procedure-ports.mjs';
import {executionLedger,EXECUTION_VERSION} from './execution-ledger.mjs';
import {createExecutionPorts,address,u64,sync} from './execution-ports.mjs';
import {compareExecutionObservations,executionReadback} from './execution-readback.mjs';
import {hashTestUnsignedPayload} from '../bootcamp-authorization/test-encoding-v3.mjs';
import {createExecutionCurrent} from './execution-current.mjs';
import {createExecutionHandshake} from './execution-handshake.mjs';
import {createRuntimeAuthority} from './execution-authority.mjs';
import {createApiExecutionBridge} from './execution-api-bridge.mjs';

const freshId=prefix=>prefix+'-'+randomUUID();
const kinds=['REGISTER','ALLOCATE','START_REVIEW','REPLACE','OBSERVE','BIND_CONSENTS','PREPARE','ACCEPT','TERMINATE'];
const bodyKeys=['expectedRevision','expectedLedgerSequence','targetDecisionId','targetDecisionRevision','targetDecisionHash',
 'kind','operationId','caller','expectedChainVersion','payloadHash','preparationId','authorizationDigest'];
export function createExecutionOperations({db,transaction,authentication,operatorBindings,app,refresh,tick,sessionHash,ledger,heads,source,
 services=null,e4CurrentPorts={configured:false},e4BridgePorts={configured:false},fenceWitness={configured:false},fault=()=>{}}){
 const l=executionLedger(db),ports=createExecutionPorts(services),get=(sql,...args)=>db.prepare(sql).get(...args);
 const corrections=executionCorrections({db,heads,source});
 const current=createExecutionCurrent({db,heads,source,operatorBindings});
 const global=ports.configured?createRuntimeAuthority({db,runtimeId:ports.runtimeId,runtimePinHash:ports.runtimePinHash,e4Runtime:e4CurrentPorts.runtime??null,authorityScope:e4BridgePorts.scope??null,requireWitness:fenceWitness.configured,fault}):null;
 const decode=row=>row?JSON.parse(row.record):null;
 const decision=a=>decode(get('SELECT record FROM decisions WHERE id=?',a.decision_id));
 const configured=()=>check(ports.configured,'BC_E5_UNCONFIGURED');
 const runtime=()=>{configured();const r=l.runtime(ports.runtimeId);check(r&&r.pin_hash===ports.runtimePinHash,'BC_E5_RUNTIME_PIN');return r;};
 function ensureRuntime(time){
  const prior=l.runtime(ports.runtimeId);if(prior){check(prior.pin_hash===ports.runtimePinHash,'BC_E5_RUNTIME_PIN');return prior;}
  const record={version:EXECUTION_VERSION,runtimeId:ports.runtimeId,runtimePinHash:ports.runtimePinHash,recordedAt:time,reason:'INITIAL_READER_REQUIRED'};
  db.prepare('INSERT INTO e5_runtimes VALUES(?,?,1,1,?,?)').run(ports.runtimeId,ports.runtimePinHash,'UNOBSERVED',canonical(record));return runtime();
 }
 function scope(s,a,bindings=operatorBindings()){check(s.role==='participant'?s.wallet===a.wallet:bindings.some(b=>b.wallet===s.wallet&&b.courseOperatorRef===a.course_operator_ref),'FORBIDDEN');}
 function actor(context,write){const s=sync(authentication.authorizeWorkflow(context,write));
  check(['participant','operator'].includes(s?.role)&&typeof s.wallet==='string','FORBIDDEN');address(s.wallet.toLowerCase());return {...s,wallet:s.wallet.toLowerCase()};}
 function withUser(context,applicationId,write,fn,{retryPlanClock=false,validateCommit=null}={}){
  id(applicationId);let original;
  // PLAN is a read projection, never an enqueue/sign/send. Discard at most one
  // rolled-back clock-only view. Keep the same actor, target, ledger and input;
  // a new transaction must authenticate and validate current source facts again.
  for(let attempt=0;;attempt++){
  const result=transaction(()=>{
   const s=actor(context,write);let a=app(applicationId);scope(s,a);const c=tick();l.clock(c.time);
   a=refresh(a,c.time,c.reversed,s.role==='participant'?sessionHash(context,s.wallet):null);
   const initialSequence=ledger.sequence();let clockOnly=false;
   db.exec('SAVEPOINT e5_command');
   try{
    check(!c.reversed,'BC_CLOCK_REVERSED');
    if(original){check(s.wallet===original.wallet&&s.role===original.role,'BC_COMMIT_AUTHORITY');
     check(a.revision===original.revision&&a.decision_id===original.decisionId&&initialSequence===original.sequence,'BC_VIEW_STALE');}
    else original={wallet:s.wallet,role:s.role,revision:a.revision,decisionId:a.decision_id,sequence:initialSequence};
    const value=sync(fn(a,s,c.time)),sequence=ledger.sequence();
    if(validateCommit){
     // Enqueue writes once. Revalidate the same request inside its savepoint;
     // never repeat intent/receipt creation, plan, signing or dispatch.
     for(let validation=0;;validation++){
      const at=tick();check(!at.reversed&&at.time>=c.time,'BC_VIEW_STALE');
      const latest=refresh(app(applicationId),at.time,at.reversed);
      check(latest.revision===a.revision&&latest.decision_id===a.decision_id&&ledger.sequence()===sequence,'BC_VIEW_STALE');
      sync(validateCommit(latest,at.time,value));
      const bindings=operatorBindings(),final=actor(context,write);
      check(final.wallet===s.wallet&&final.role===s.role,'BC_COMMIT_AUTHORITY');scope(final,latest,bindings);
      const end=tick();check(!end.reversed&&end.time>=at.time,'BC_VIEW_STALE');
      if(end.time>at.time&&validation===0)continue;
      check(end.time===at.time,'BC_VIEW_STALE');break;
     }
     db.exec('RELEASE e5_command');return {value};
    }
    const latestTick=tick();
    const latest=refresh(app(applicationId),latestTick.time,latestTick.reversed),end=tick();
    clockOnly=retryPlanClock&&!latestTick.reversed&&!end.reversed&&end.time>c.time
     &&latest.revision===a.revision&&latest.decision_id===a.decision_id&&ledger.sequence()===initialSequence&&sequence===initialSequence;
    check(!latestTick.reversed&&!end.reversed&&end.time===c.time&&latest.revision===a.revision&&ledger.sequence()===sequence,'BC_VIEW_STALE');
    const bindings=operatorBindings(),final=actor(context,write);check(final.wallet===s.wallet&&final.role===s.role,'BC_COMMIT_AUTHORITY');scope(final,latest,bindings);
    db.exec('RELEASE e5_command');return {value};
   }catch(error){db.exec('ROLLBACK TO e5_command; RELEASE e5_command');const end=tick(),latest=refresh(app(applicationId),end.time,end.reversed);
    return {error,retry:attempt===0&&clockOnly&&!end.reversed&&end.time>=c.time&&latest.revision===a.revision
     &&latest.decision_id===a.decision_id&&ledger.sequence()===initialSequence};}
  });
  if(result.retry)continue;
  if(result.error)throw result.error;return result.value;
  }
 }
 function service(context,action,intentId,fn,validateCommit=null){
  check(validateCommit===null||['B_PREPARE','B_AUTHORIZE_COMMIT','B_SEAL_REFERENCE','B_ADOPT_COMMIT','B_RECEIPT_COMMIT','B_READ_REQUEST','B_LOOKUP_REQUEST','B_INSPECT','ACQUIRE','INSPECT','BIND_RUNTIME_INTENT'].includes(action)&&typeof validateCommit==='function','BC_E5_COMMIT_VALIDATOR');
  configured();const result=transaction(()=>{
   const c=tick();l.clock(c.time);check(!c.reversed,'BC_CLOCK_REVERSED');
   const request={action,intentId,runtimeId:ports.runtimeId},authority=ports.authorize(context,request,c.time);
   const corruption=global.audit(c.time);if(corruption)return {error:new Error('BC_E5_GLOBAL_STOPPED:'+corruption)};
   const i=l.intent(intentId);if(i)refresh(app(i.applicationId),c.time,c.reversed);db.exec('SAVEPOINT e5_service');
   try{const value=sync(fn(c.time,authority));
    if(validateCommit){
     // The metadata operation and any preceding native work each happen once.
     // Only read-only validation can cross a second; the savepoint stays open.
     for(let validation=0;;validation++){
      const at=tick();check(!at.reversed&&at.time>=c.time,'BC_E5_CLOCK_CHANGED');
      const fresh=ports.authorize(context,request,at.time);check(fresh.serviceId===authority.serviceId&&fresh.expiresAt>=authority.expiresAt,'BC_E5_SERVICE_AUTHORITY');
      sync(validateCommit(at.time,fresh,value));
      const final=ports.authorize(context,request,at.time);check(final.serviceId===fresh.serviceId&&final.expiresAt>=authority.expiresAt,'BC_E5_SERVICE_AUTHORITY');
      check(!global.audit(at.time),'BC_E5_GLOBAL_STOPPED');const end=tick();
      check(!end.reversed&&end.time>=at.time,'BC_E5_CLOCK_CHANGED');
      if(end.time>at.time&&validation===0)continue;
      check(end.time===at.time,'BC_E5_CLOCK_CHANGED');break;
     }
     db.exec('RELEASE e5_service');return {value};
    }
    const end=tick();check(!end.reversed&&end.time===c.time,'BC_E5_CLOCK_CHANGED');
    const final=ports.authorize(context,request,end.time);check(final.serviceId===authority.serviceId&&final.expiresAt>=authority.expiresAt,'BC_E5_SERVICE_AUTHORITY');
    check(!global.audit(end.time)||value?.status==='BLOCKED','BC_E5_GLOBAL_STOPPED');
    db.exec('RELEASE e5_service');return {value};
   }catch(error){db.exec('ROLLBACK TO e5_service; RELEASE e5_service');const end=tick();if(i)refresh(app(i.applicationId),end.time,end.reversed);global.audit(end.time);return {error};}
  });if(result.error)throw result.error;return result.value;
 }
 function intent(intentId){id(intentId);const i=l.intent(intentId);check(i&&i.runtimeId===ports.runtimeId,'BC_NOT_FOUND');return i;}
 function handle(h){exactKeys(h,['intentId','owner','workerFence','generation','leaseRevision'],'BC_E5_LEASE_HANDLE');id(h.intentId);id(h.owner);
  for(const k of ['workerFence','generation','leaseRevision'])revision(h[k]);return h;}
 function live(h,time,owner,{completedReceipt=false}={}){handle(h);const i=intent(h.intentId),r=runtime(),lease=l.lease(i.intentId);
  check(completedReceipt||!e4BridgePorts.configured||!get('SELECT 1 FROM e5b_completions WHERE intent_id=?',h.intentId),'BC_E5B_ALREADY_COMPLETED');
  check(lease&&lease.owner===h.owner&&lease.owner===owner&&lease.fence===h.workerFence&&lease.generation===h.generation
   &&lease.revision===h.leaseRevision&&lease.expires_at>time&&r.generation===h.generation,'BC_E5_FENCED');return {i,r,lease};}
 function business(i,time){
  let a=app(i.applicationId);const t=tick();a=refresh(a,time,t.reversed);const d=decision(a),hs=heads(a);
  const p=decode(get('SELECT record FROM e3_procedures WHERE application_id=?',a.id));
  const publications=db.prepare('SELECT record FROM e3_publications WHERE application_id=? ORDER BY sequence').all(a.id).map(decode);
  const records=db.prepare('SELECT record FROM e3_records WHERE application_id=? ORDER BY sequence').all(a.id).map(decode);
  const authority={applicationRevision:a.revision,ledgerSequence:ledger.sequence(),decisionId:d.decisionId,decisionRevision:d.decisionRevision,
   decisionHash:d.decisionHash,status:a.status,heads:hs.map(h=>({evidenceId:h.evidence_id,valid:h.valid,reason:h.reason,guard:h.guard})),
   operatorBindings:operatorBindings(),procedure:p,publications,records};
  return {a,d,p,publications,businessHash:p0Hash('E5-CURRENT-BUSINESS',authority),applicationRevision:a.revision,ledgerSequence:ledger.sequence()};
 }
 function basis(i,r,lease,time,authority){const b=business(i,time);return freeze({version:'clear-bootcamp-test-execution-cas.1',intentId:i.intentId,
  generation:r.generation,runtimeRevision:r.revision,workerFence:lease.fence,leaseRevision:lease.revision,applicationRevision:b.applicationRevision,
  ledgerSequence:b.ledgerSequence,businessHash:b.businessHash,authorityExpiresAt:Math.min(lease.expires_at,authority.expiresAt),
  observedSnapshotHash:p0Hash('E5-LAST-OBSERVATION',latest(i)),chainExpectedVersion:i.expectedChainVersion,authorizationDigest:i.authorizationDigest,executionAuthorized:false});}
 function sameBasis(expected,current,time){
  exactKeys(expected,Object.keys(current),'BC_E5_CURRENT_CAS');
  // Renewal may extend the same lease; it must not renew an in-flight cap.
  // Keep the original expiry and reject both expired caps and authority shrink.
  check(expected.authorityExpiresAt>time&&current.authorityExpiresAt>=expected.authorityExpiresAt
   &&canonical(expected)===canonical({...current,authorityExpiresAt:expected.authorityExpiresAt}),'BC_E5_CURRENT_CHANGED');
 }
 function event(i,kind,data,time,key=freshId('event-key')){
  const record={version:EXECUTION_VERSION,id:freshId('event'),intentId:i.intentId,runtimeId:i.runtimeId,kind,eventKey:key,recordedAt:time,...data};l.event(record);return record;
 }
 function latest(i){return l.observations(i.runtimeId,i.applicationId,runtime().generation).at(-1)??null;}
 function finalized(i){return l.observations(i.runtimeId,i.applicationId,runtime().generation).filter(o=>o.checkpoint.finality.kind==='LOCAL_FINALIZED').at(-1)?.checkpoint??null;}
 function dto(i){const r=runtime(),observation=latest(i),envelope=l.envelope(i.intentId),attempt=l.attempts(i.intentId)[0]??null;
  const commandObservation=l.observations(i.runtimeId,i.applicationId,r.generation).filter(o=>o.operation.operationId===i.operationId).at(-1);
  const applied=envelope&&commandObservation?.operation.digest===envelope.commandDigest;
  const consistent=['ACTIVE','UNOBSERVED'].includes(r.status);
  return freeze({version:EXECUTION_VERSION,namespace:'TEST_EXECUTION_METADATA',intent:i,executionSequence:l.sequence(),runtime:{runtimeId:r.id,
   generation:r.generation,status:r.status,revision:r.revision},commandState:applied&&consistent?'APPLIED':envelope?'SEALED':'QUEUED',attempt,
   envelope:envelope?{envelopeRef:envelope.envelopeRef,manifestHash:envelope.manifestHash,transactionHash:envelope.transactionHash}:null,
   observed:executionReadback(observation),observationCurrent:consistent&&!!observation,
   transport:{status:'BLOCKED',reason:'E5_A_METADATA_ONLY',signingImplemented:false,broadcastImplemented:false,automaticReplacement:false},
   reservationReleased:false,productionEnabled:false,paymentAuthority:false,gates:P0_GATES});}
 function stop(i,r,reason,time){
  const record={version:EXECUTION_VERSION,reason,recordedAt:time};db.prepare('UPDATE e5_runtimes SET status=?,revision=revision+1,record=? WHERE id=? AND revision=?')
   .run(reason,canonical(record),r.id,r.revision);event(i,'RUNTIME_SUSPENDED',{generation:r.generation,reason},time);return {status:'BLOCKED',reason};
 }
 const api={
  async reviewChain(context,applicationId){
   check(e4BridgePorts.configured,'BC_E5B_UNCONFIGURED');
   const initial=withUser(context,applicationId,false,a=>{
    const rows=db.prepare("SELECT record FROM e5_intents WHERE application_id=? ORDER BY sequence DESC").all(a.id).map(decode);
    const i=rows.find(i=>correctionKinds.includes(i.kind))??null;
    const completion=i?decode(get('SELECT record FROM e5b_completions WHERE intent_id=?',i.intentId)):null;
    return {revision:a.revision,sequence:ledger.sequence(),i,completion,chainApplicationId:get("SELECT opaque_id FROM e3_ids WHERE kind='APPLICATION' AND logical_id=?",a.id)?.opaque_id};
   });
   const query={method:'claim',args:[initial.chainApplicationId],applicationId:initial.chainApplicationId};
   const ticket=await e4BridgePorts.read(query,initial.completion?.checkpoint??null);
   return withUser(context,applicationId,false,(a,s,time)=>{
    check(a.revision===initial.revision&&ledger.sequence()===initial.sequence,'BC_VIEW_STALE');
    const {observation:o,comparison}=e4BridgePorts.consume(ticket,'OBSERVATION'),c=o.business.application,f=corrections.facts(a,time);
    const pending=db.prepare("SELECT MAX(sequence) n FROM e3_records WHERE application_id=? AND kind IN ('OBJECTION','OBJECTION_ASSESSMENT','REVALIDATION','TERMINATION_REQUIRED','TERMINATION_INTENT')").get(a.id).n??0;
    const matchesCurrentDecision=c.target.decisionHash===f.d.decisionHash&&c.target.revision===String(f.d.decisionRevision);
    const status=comparison?.status==='REORG_PROVEN_RECOVERY_BLOCKED'?'REORGED':initial.completion?.status==='REVERTED'?'REVERTED':
     initial.completion?.status==='INCLUDED'&&pending<=initial.i.expectedLedgerSequence&&(matchesCurrentDecision||['4','5','6'].includes(c.state))?'INCLUDED':pending||initial.i?'PENDING':'NOT_REQUESTED';
    return freeze({version:'clear-bootcamp-review-chain.1',applicationId:a.id,status,canonical:status==='INCLUDED',finalized:false,
     checkpoint:o.checkpoint,operationId:initial.i?.operationId??null,transactionHash:initial.completion?.txHash??null,
     current:{state:c.state,version:c.version,epoch:c.epoch,decisionHash:c.target.decisionHash,decisionRevision:c.target.revision,registrationSequence:c.target.acceptanceSequence,
      recipient:c.recipient,unassessedObjection:c.unassessedObjection,validObjection:c.validObjection,terminalError:c.terminalError},
     serverBlocked:!f.met||f.unassessed||f.valid||f.termination.length>0||f.revalidations.some(r=>r.fromDecisionId===f.d.decisionId),
     matchesCurrentDecision,acceptedRightPreserved:['5','6'].includes(c.state),claimExpiresAt:null,receiptIsChainInclusion:false});
   },{retryPlanClock:true});
  },
  async planCorrection(context,applicationId,{kind,operationId}){
   check(e4BridgePorts.configured&&correctionKinds.includes(kind),'BC_E5_KIND');hash(operationId);
   const initial=withUser(context,applicationId,false,(a)=>({revision:a.revision,sequence:ledger.sequence(),chainApplicationId:get("SELECT opaque_id FROM e3_ids WHERE kind='APPLICATION' AND logical_id=?",a.id)?.opaque_id}));
   const query={method:'claim',args:[initial.chainApplicationId],applicationId:initial.chainApplicationId};
   const ticket=await e4BridgePorts.read(query);
   return withUser(context,applicationId,false,(a,s,time)=>{
    check(a.revision===initial.revision&&ledger.sequence()===initial.sequence,'BC_VIEW_STALE');
    const {observation:o}=e4BridgePorts.consume(ticket,'OBSERVATION'),d=decision(a);
    const body={expectedRevision:a.revision,expectedLedgerSequence:ledger.sequence(),targetDecisionId:d.decisionId,targetDecisionRevision:d.decisionRevision,targetDecisionHash:d.decisionHash,
     kind,operationId,caller:kind==='TERMINATE'?e4BridgePorts.runtime.roles.terminator:e4BridgePorts.runtime.roles.registrar,expectedChainVersion:o.business.application.version,preparationId:null,authorizationDigest:null};
    const command=corrections.build({...body,chainApplicationId:initial.chainApplicationId},a,o,time).command;
    return freeze({body:{...body,payloadHash:e4Hash(command),correctionCommand:command},command});
   },{retryPlanClock:true});
  },
  plan(context,applicationId,{kind,operationId,expectedChainVersion,preparationId=null}){
   check(e4BridgePorts.configured,'BC_E5B_UNCONFIGURED');check(!correctionKinds.includes(kind),'BC_E5_CORRECTION_PLAN_REQUIRED');check(kinds.includes(kind),'BC_E5_KIND');hash(operationId);u64(expectedChainVersion);
   return withUser(context,applicationId,false,(a,s,time)=>{
    const d=decision(a);
    if(!['OBSERVE','TERMINATE'].includes(kind))check(a.status==='ACTIVE'&&d.conditionsStatus==='MET'&&currentSourceWindow(a,heads,source,time),'BC_E5_CURRENT_SOURCE_REQUIRED');
    const opaque=type=>get('SELECT opaque_id FROM e3_ids WHERE kind=? AND logical_id=?',type,type==='APPLICATION'?a.id:d.decisionId)?.opaque_id;
    const body={expectedRevision:a.revision,expectedLedgerSequence:ledger.sequence(),targetDecisionId:d.decisionId,targetDecisionRevision:d.decisionRevision,targetDecisionHash:d.decisionHash,
     kind,operationId,caller:kind==='ACCEPT'?e4BridgePorts.runtime.roles.relayer:e4BridgePorts.runtime.roles.registrar,expectedChainVersion,preparationId,authorizationDigest:null};
    const i={...body,applicationId:a.id,chainApplicationId:opaque('APPLICATION'),chainDecisionId:opaque('DECISION')};
    const command=executionCommands({db,current,heads,source}).command(i,{verifyHash:false});body.payloadHash=e4Hash(command);
    if(preparationId){const p=decode(get('SELECT record FROM e3_prepared WHERE application_id=? AND id=?',a.id,preparationId));check(p,'BC_E5_PREPARATION_REQUIRED');body.authorizationDigest=hashTestUnsignedPayload({domain:p.payload.domain,message:p.payload.message}).digest;}
    return freeze({body,command});
   },{retryPlanClock:true});
  },
  connectBridge(context){
   check(e4BridgePorts.configured,'BC_E5B_UNCONFIGURED');service(context,'B_CONNECT',null,time=>ensureRuntime(time));
   return createApiExecutionBridge({db,ports:e4BridgePorts,service,live,basis,sameBasis,business,app,current,heads,source,global,runtime,event,fault},context);
  },
  acquireRuntime(context,body){exactKeys(body,['owner','expectedFence','generation','leaseSeconds'],'BC_E5_GLOBAL_ACQUIRE');
   return service(context,'ACQUIRE_RUNTIME',null,(time,authority)=>global.acquire(time,authority,runtime(),body));},
  heartbeatRuntime(context,h,seconds=30){return service(context,'HEARTBEAT_RUNTIME',null,(time,authority)=>global.heartbeat(h,time,authority,seconds));},
  bindRuntimeIntent(context,g,h){return service(context,'BIND_RUNTIME_INTENT',h.intentId,(time,authority)=>{
   live(h,time,authority.serviceId);return global.bind(g,h,time,authority);},(time,authority)=>{live(h,time,authority.serviceId);global.slot(g,h,time,authority);});},
  releaseRuntimeIntent(context,g,h){return service(context,'RELEASE_RUNTIME_INTENT',h.intentId,(time,authority)=>{
   live(h,time,authority.serviceId);return global.release(g,h,time,authority);});},
  async observeRuntimeFence(context,g=null){
   const request=service(context,'READ_RUNTIME_FENCE',null,(time,authority)=>{runtime();if(g)global.live(g,time,authority.serviceId);check(fenceWitness.configured,'BC_E5_FENCE_WITNESS_UNCONFIGURED');return {query:global.witnessQuery(),basis:global.witnessBasis()};});
   const ticket=await fenceWitness.read(request.query);
   return service(context,'COMMIT_RUNTIME_FENCE',null,(time,authority)=>{if(g)global.live(g,time,authority.serviceId);check(request.basis===global.witnessBasis(),'BC_E5_GLOBAL_WITNESS_CAS');return global.acceptWitness(fenceWitness.consume(ticket),time);});
  },
  connectCurrentController(context,g){
   configured();check(e4CurrentPorts.configured,'BC_E5_E4_UNCONFIGURED');
   // Never routed through HTTP. Validate the service credential before returning
   // separated controller/worker facades; every later call revalidates it too.
   service(context,'CONNECT_E4_CURRENT',null,(time,authority)=>global.live(g,time,authority.serviceId));
   return createExecutionHandshake({ports:e4CurrentPorts,current,service,live,basis,sameBasis,intent,runtime,l,event,business,db,fault,global},context,g);
  },
  status(){return freeze({version:EXECUTION_VERSION,status:ports.status,signingImplemented:false,broadcastImplemented:false,rebaseImplemented:false,paymentAuthority:false,
   currentConnection:{status:e4CurrentPorts.status??'UNCONFIGURED',ownerSealPortConfigured:!!e4CurrentPorts.sealPortConfigured,dispatchAuthorized:false}});},
  enqueue(context,applicationId,body,key){
   exactKeys(body,[...bodyKeys,...(e4BridgePorts.configured&&correctionKinds.includes(body.kind)?['correctionCommand']:[])],'BC_E5_COMMAND_BODY');id(key);revision(body.expectedRevision);revision(body.targetDecisionRevision);id(body.targetDecisionId);
   hash(body.targetDecisionHash);hash(body.operationId);address(body.caller);u64(body.expectedChainVersion);hash(body.payloadHash);
   check(Number.isSafeInteger(body.expectedLedgerSequence)&&body.expectedLedgerSequence>=0&&kinds.includes(body.kind),'BC_E5_COMMAND_BODY');
   if(body.preparationId!==null)id(body.preparationId);if(body.authorizationDigest!==null)hash(body.authorizationDigest);
   check(body.kind!=='ACCEPT'||body.preparationId!==null&&body.authorizationDigest!==null,'BC_E5_PREPARATION_REQUIRED');
   let validateEnqueue=()=>{};
   return withUser(context,applicationId,true,(a,s,time)=>{
    configured();const r=ensureRuntime(time),requestHash=p0Hash('E5-INTENT-REQUEST',body);
    const prior=get('SELECT * FROM e5_receipts WHERE actor=? AND application_id=? AND command_key=?',s.wallet,a.id,key);
    if(prior){check(prior.request_hash===requestHash,'BC_E5_IDEMPOTENCY_CONFLICT');return freeze({receipt:decode(prior),outbox:dto(intent(prior.intent_id))});}
    check(['UNOBSERVED','ACTIVE'].includes(r.status),'BC_E5_RUNTIME_SUSPENDED');
    const op=get('SELECT * FROM e5_intents WHERE runtime_id=? AND operation_id=?',r.id,body.operationId);
    if(op)check(op.request_hash===requestHash,'BC_E5_OPERATION_CONFLICT');
    check(a.revision===body.expectedRevision&&ledger.sequence()===body.expectedLedgerSequence,'BC_VIEW_STALE');const d=decision(a);
    check(d.decisionId===body.targetDecisionId&&d.decisionRevision===body.targetDecisionRevision&&d.decisionHash===body.targetDecisionHash,'BC_DECISION_TARGET');
    const requiresSource=!['OBSERVE','TERMINATE'].includes(body.kind);
    if(requiresSource)check(a.status==='ACTIVE'&&d.conditionsStatus==='MET','BC_E5_CURRENT_SOURCE_REQUIRED');
    if(requiresSource&&body.kind!=='REPLACE')corrections.gate(a,time);
    const originalSource=requiresSource?currentSourceWindow(a,heads,source,time):null;
    const opaque=kind=>{const logical=kind==='APPLICATION'?a.id:d.decisionId,v=get('SELECT opaque_id FROM e3_ids WHERE kind=? AND logical_id=?',kind,logical);check(v||kind==='DECISION'&&['OBSERVE','TERMINATE'].includes(body.kind),'BC_E3_ID_NOT_REGISTERED');return v?.opaque_id??'0x'+'00'.repeat(32);};
    if(body.preparationId!==null){const p=decode(get('SELECT record FROM e3_prepared WHERE application_id=? AND id=?',a.id,body.preparationId));
     check(p&&p.payload.logicalTarget.decisionId===d.decisionId&&p.payload.logicalTarget.applicationId===a.id,'BC_E5_PREPARATION_REQUIRED');
     if(body.authorizationDigest!==null)check(hashTestUnsignedPayload({domain:p.payload.domain,message:p.payload.message}).digest===body.authorizationDigest,'BC_E5_AUTHORIZATION_DIGEST');}
    const i=op?decode(op):{version:EXECUTION_VERSION,intentId:freshId('execution'),applicationId:a.id,runtimeId:r.id,runtimePinHash:r.pin_hash,
     generation:r.generation,...body,chainApplicationId:opaque('APPLICATION'),chainDecisionId:opaque('DECISION'),requestHash,recordedAt:time};
    validateEnqueue=(latest,at,value)=>{
     check(latest.revision===body.expectedRevision&&ledger.sequence()===body.expectedLedgerSequence,'BC_VIEW_STALE');
     const finalDecision=decision(latest);
     check(finalDecision.decisionId===body.targetDecisionId&&finalDecision.decisionRevision===body.targetDecisionRevision&&finalDecision.decisionHash===body.targetDecisionHash,'BC_DECISION_TARGET');
     if(requiresSource&&body.kind!=='REPLACE')corrections.gate(latest,at);
     if(requiresSource)check(latest.status==='ACTIVE'&&finalDecision.conditionsStatus==='MET'
      &&canonical(currentSourceWindow(latest,heads,source,at))===canonical(originalSource),'BC_E5_CURRENT_SOURCE_REQUIRED');
     const finalRuntime=runtime();check(finalRuntime.generation===r.generation&&finalRuntime.revision===r.revision&&finalRuntime.status===r.status,'BC_E5_RUNTIME_SUSPENDED');
     check(canonical(intent(i.intentId))===canonical(i)
      &&canonical(decode(get('SELECT * FROM e5_receipts WHERE actor=? AND application_id=? AND command_key=?',s.wallet,a.id,key)))===canonical(value.receipt),'BC_E5_OPERATION_CONFLICT');
    };
    if(!op)db.prepare('INSERT INTO e5_intents VALUES(?,?,?,?,?,?,?)').run(i.intentId,a.id,r.id,i.operationId,requestHash,canonical(i),l.next());
    fault('e5-after-intent');
    const receipt={version:'clear-bootcamp-test-execution-receipt.1',operationReceiptId:freshId('execution-receipt'),intentId:i.intentId,
     applicationId:a.id,requestHash,committedAt:time,paymentAuthority:false};
    db.prepare('INSERT INTO e5_receipts VALUES(?,?,?,?,?,?,?,?)').run(receipt.operationReceiptId,i.intentId,a.id,s.wallet,key,requestHash,canonical(receipt),l.next());
    fault('e5-after-receipt');return freeze({receipt,outbox:dto(i)});
   },{validateCommit:(latest,time,value)=>validateEnqueue(latest,time,value)});
  },
  get(context,applicationId,intentId){return withUser(context,applicationId,false,a=>{configured();const i=intent(intentId);check(i.applicationId===a.id,'BC_NOT_FOUND');return dto(i);});},
  getInternal(context,intentId){return service(context,'READ_METADATA',intentId,()=>dto(intent(intentId)));},
  acquire(context,intentId,{owner,expectedFence=0,generation,leaseSeconds=30}){
   id(owner);check(Number.isSafeInteger(expectedFence)&&expectedFence>=0,'BC_E5_FENCE');revision(generation);check(Number.isSafeInteger(leaseSeconds)&&leaseSeconds>=1&&leaseSeconds<=60,'BC_E5_LEASE');
   return service(context,'ACQUIRE',intentId,(time,authority)=>{
    check(owner===authority.serviceId,'BC_E5_SERVICE_AUTHORITY');const i=intent(intentId),r=runtime(),old=l.lease(i.intentId);
    check(['UNOBSERVED','ACTIVE'].includes(r.status)&&r.generation===generation,'BC_E5_RUNTIME_SUSPENDED');
    check(!e4BridgePorts.configured||!get('SELECT 1 FROM e5b_completions WHERE intent_id=?',i.intentId),'BC_E5B_ALREADY_COMPLETED');
    check((old?.fence??0)===expectedFence&&(!old||old.expires_at<=time),'BC_E5_LEASE_BUSY');
    check(!get('SELECT 1 FROM e5_leases l JOIN e5_intents i ON i.id=l.intent_id WHERE i.runtime_id=? AND i.application_id=? AND i.id!=? AND l.expires_at>?'+
     (e4BridgePorts.configured?' AND NOT EXISTS(SELECT 1 FROM e5b_completions c WHERE c.intent_id=i.id)':''),r.id,i.applicationId,i.intentId,time),'BC_E5_APPLICATION_BUSY');
    const expiresAt=Math.min(time+leaseSeconds,authority.expiresAt),fence=(old?.fence??0)+1;
    check(Number.isSafeInteger(fence),'BC_E5_FENCE');
    db.prepare('INSERT INTO e5_leases VALUES(?,?,?,?,?,1) ON CONFLICT(intent_id) DO UPDATE SET owner=excluded.owner,fence=excluded.fence,generation=excluded.generation,expires_at=excluded.expires_at,revision=e5_leases.revision+1')
     .run(i.intentId,owner,fence,r.generation,expiresAt);
    const lease=l.lease(i.intentId);return freeze({intentId:i.intentId,owner,workerFence:fence,generation:r.generation,leaseRevision:lease.revision});
   },(time,authority,h)=>{const {r}=live(h,time,authority.serviceId);check(['UNOBSERVED','ACTIVE'].includes(r.status),'BC_E5_RUNTIME_SUSPENDED');});
  },
  heartbeat(context,h,leaseSeconds=30){check(Number.isSafeInteger(leaseSeconds)&&leaseSeconds>=1&&leaseSeconds<=60,'BC_E5_LEASE');
   return service(context,'HEARTBEAT',h.intentId,(time,authority)=>{const {lease}=live(h,time,authority.serviceId);
    const expiry=Math.max(lease.expires_at,Math.min(time+leaseSeconds,authority.expiresAt));
    db.prepare('UPDATE e5_leases SET expires_at=? WHERE intent_id=?').run(expiry,h.intentId);
    return freeze({...h});});
  },
  inspect(context,h){return service(context,'INSPECT',h.intentId,(time,authority)=>{const {i,r,lease}=live(h,time,authority.serviceId);
   check(['UNOBSERVED','ACTIVE'].includes(r.status),'BC_E5_RUNTIME_SUSPENDED');return basis(i,r,lease,time,authority);},(time,authority,value)=>{const {i,r,lease}=live(h,time,authority.serviceId);sameBasis(value,basis(i,r,lease,time,authority),time);});},
  async observe(context,h,expected){
   const request=service(context,'READ',h.intentId,(time,authority)=>{const {i,r,lease}=live(h,time,authority.serviceId);sameBasis(expected,basis(i,r,lease,time,authority),time);
    check(['UNOBSERVED','ACTIVE'].includes(r.status),'BC_E5_RUNTIME_SUSPENDED');
    return {version:'clear-bootcamp-test-reader-request.1',runtimeId:r.id,runtimePinHash:r.pin_hash,generation:r.generation,workerFence:lease.fence,
     intentId:i.intentId,applicationId:i.applicationId,chainApplicationId:i.chainApplicationId,operationId:i.operationId,
     previousCheckpoint:latest(i)?.checkpoint??null,finalizedCheckpoint:finalized(i)};});
   const observed=await ports.read(request); // No DB transaction spans this await.
   return service(context,'COMMIT_OBSERVATION',h.intentId,(time,authority)=>{
    const {i,r,lease}=live(h,time,authority.serviceId);sameBasis(expected,basis(i,r,lease,time,authority),time);const o=ports.observation(observed);
    check(['UNOBSERVED','ACTIVE'].includes(r.status),'BC_E5_RUNTIME_SUSPENDED');
    check(o.applicationId===i.applicationId&&o.chainApplicationId===i.chainApplicationId&&o.operation.operationId===i.operationId,'BC_E5_OBSERVATION_TARGET');
    const comparison=compareExecutionObservations(latest(i),o,finalized(i));
    if(['REORG_EVIDENCE_REQUIRED','FINALIZED_CONFLICT'].includes(comparison.status))return stop(i,r,comparison.status,time);
    const b=business(i,time),a=o.application;
    if(['ACCEPTED','SETTLED'].includes(a.state)){
     const pub=b.publications.find(p=>p.decisionHash===a.decisionHash&&get("SELECT opaque_id FROM e3_ids WHERE kind='ALLOCATION' AND logical_id=?",p.allocationId)?.opaque_id===a.allocationId);
     check(pub&&pub.recipient===o.right.recipient&&pub.token===o.right.token&&pub.amountAtoms===o.right.amountAtoms,'BC_E5_UNREGISTERED_RIGHT');
    }
    if(b.p&&!['ACCEPTED','SETTLED','TERMINATED'].includes(a.state)){
     const published=b.publications.at(-1)?.publishedAt;
     if(a.state==='NONE'||BigInt(a.allocatedAt)>BigInt(published)||BigInt(a.targetRecordedAt)>BigInt(published)
      ||BigInt(a.firstStartedAt)!==0n&&a.firstStartedAt!==String(b.p.firstStartedAt))return stop(i,r,'RECOVERY_BLOCKED',time);
     if(a.firstStartedAt!=='0'&&a.publishedAt!==String(b.publications.at(-1)?.publishedAt))return stop(i,r,'RECOVERY_BLOCKED',time);
    }
    const observationHash=p0Hash('E5-OBSERVATION',o),prior=get('SELECT id FROM e5_observations WHERE runtime_id=? AND application_id=? AND generation=? AND observation_hash=?',r.id,i.applicationId,r.generation,observationHash);
    if(!prior){db.prepare('INSERT INTO e5_observations VALUES(?,?,?,?,?,?,?)').run(freshId('observation'),r.id,i.applicationId,r.generation,observationHash,canonical(o),l.next());fault('e5-after-observation');}
    if(r.status==='UNOBSERVED')db.prepare("UPDATE e5_runtimes SET status='ACTIVE',revision=revision+1 WHERE id=?").run(r.id);
    return dto(i);
   });
  },
  beginAttempt(context,h,expected){return service(context,'BEGIN_ATTEMPT',h.intentId,(time,authority)=>{
   const {i,r,lease}=live(h,time,authority.serviceId);check(r.status==='ACTIVE','BC_E5_READER_REQUIRED');sameBasis(expected,basis(i,r,lease,time,authority),time);
   const old=l.attempts(i.intentId)[0];if(old)return freeze(old);
   const record={version:EXECUTION_VERSION,attemptId:freshId('execution-attempt'),intentId:i.intentId,operationId:i.operationId,
    generation:r.generation,workerFence:lease.fence,recordedAt:time,transactionState:'NOT_DISPATCHED'};
   db.prepare('INSERT INTO e5_attempts VALUES(?,?,?,?)').run(record.attemptId,i.intentId,canonical(record),l.next());fault('e5-after-attempt');return freeze(record);
  });},
  async attachEnvelope(context,h,expected,envelopeRef){
   id(envelopeRef);const request=service(context,'LOOKUP_ENVELOPE',h.intentId,(time,authority)=>{
    const {i,r,lease}=live(h,time,authority.serviceId);sameBasis(expected,basis(i,r,lease,time,authority),time);
    const attempt=l.attempts(i.intentId)[0];check(attempt,'BC_E5_ATTEMPT_REQUIRED');
    return {envelopeRef,intentId:i.intentId,attemptId:attempt.attemptId,generation:r.generation,workerFence:lease.fence};});
   const manifest=await ports.lookup(request);
   return service(context,'COMMIT_ENVELOPE',h.intentId,(time,authority)=>{
    const {i,r,lease}=live(h,time,authority.serviceId);sameBasis(expected,basis(i,r,lease,time,authority),time);const m=ports.envelope(manifest);
    check(r.status==='ACTIVE'&&m.envelopeRef===envelopeRef&&m.intentId===i.intentId&&m.attemptId===request.attemptId&&m.generation===r.generation&&m.workerFence===lease.fence,'BC_E5_ENVELOPE_TARGET');
    for(const [k,v]of Object.entries({operationId:i.operationId,caller:i.caller,expectedVersion:i.expectedChainVersion,payloadHash:i.payloadHash,authorizationDigest:i.authorizationDigest}))check(m[k]===v,'BC_E5_OPERATION_CONFLICT');
    check(time<m.dispatchNotAfter&&m.dispatchNotAfter<=expected.authorityExpiresAt,'BC_E5_ENVELOPE_EXPIRED');
    const prior=l.envelope(i.intentId);if(prior)check(canonical(prior)===canonical(m),'BC_E5_OPERATION_CONFLICT');
    else{db.prepare('INSERT INTO e5_envelopes VALUES(?,?,?,?,?)').run(freshId('envelope-commit'),i.intentId,m.attemptId,canonical(m),l.next());fault('e5-after-envelope');}
    return confirmation(i,m,r,lease);
   });
  },
  confirmEnvelopeCommit(context,h,envelopeRef,manifestHash){id(envelopeRef);hash(manifestHash);return service(context,'CONFIRM_ENVELOPE',h.intentId,(time,authority)=>{
   const {i,r,lease}=live(h,time,authority.serviceId),m=l.envelope(i.intentId);check(m&&m.envelopeRef===envelopeRef&&m.manifestHash===manifestHash,'BC_E5_ENVELOPE_NOT_COMMITTED');
   return confirmation(i,m,r,lease);
  });},
  requestRebase(context,intentId){return service(context,'REQUEST_REBASE',intentId,time=>stop(intent(intentId),runtime(),'REORG_EVIDENCE_REQUIRED',time));},
 };
 function confirmation(i,m,r,lease){return freeze({version:'clear-bootcamp-test-envelope-commit.1',intentId:i.intentId,attemptId:m.attemptId,
  envelopeRef:m.envelopeRef,manifestHash:m.manifestHash,executionSequence:l.sequence(),generation:r.generation,workerFence:lease.fence,
  envelopeWorkerFence:m.workerFence,dispatchAuthorized:false,reason:'E5_A_METADATA_ONLY'});}
 return freeze(api);
}
