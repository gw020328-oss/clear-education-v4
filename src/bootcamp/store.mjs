import {isLiveReclaimConsumer} from './reclaim-live-consumer.mjs';
import {isLiveMoodleConsumer} from './moodle-live-consumer.mjs';
import {isCanonicalProcedurePorts} from './execution-development.mjs';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {canonical,exactKeys,freeze,requireRule as check} from '../policy/values.mjs';
import {same} from '../policy/mvp/contract.mjs';
import {openPrivateDb} from '../product-workflow/private-db.mjs';
import {P0_GATES,p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
import {compiled,criterion,id,epoch,revision,hash,validateGuard,guardExpiry,guardHash,snapshotCandidate,validateCandidate,evidenceRecord,decisionRecord} from './model.mjs';
import {migrateR2,r2Ledger} from './r2-ledger.mjs';
import {createOperations} from './operations.mjs';
import {migrateProcedure} from './procedure-ledger.mjs';
import {migrateExecution} from './execution-ledger.mjs';
import {createExecutionOperations} from './execution-operations.mjs';
import {createExecutionPorts,sync} from './execution-ports.mjs';
import {createE4CurrentPorts} from './execution-e4-ports.mjs';
import {migrateExecutionAuthority,createFenceWitness} from './execution-authority.mjs';
import {createE4BridgePorts} from './execution-e4b-ports.mjs';
import {migrateExecutionBridge} from './execution-b-ledger.mjs';

const mapping=JSON.parse(readFileSync(new URL('../../specs/bootcamp/p0-runtime-mapping.json',import.meta.url)));
export const DEFAULT_MAPPING_HASH=p0Hash('RUNTIME-MAPPING',mapping);
export const BOOTCAMP_STORE_VERSION='clear-bootcamp-store.1';
const schema=`
 CREATE TABLE IF NOT EXISTS clock(id INTEGER PRIMARY KEY CHECK(id=1),floor INTEGER NOT NULL) STRICT;
 CREATE TABLE IF NOT EXISTS applications(id TEXT PRIMARY KEY,participant_id TEXT NOT NULL,wallet TEXT NOT NULL,recipient_ref TEXT NOT NULL,
   course_operator_ref TEXT NOT NULL,policy_hash TEXT NOT NULL,mapping_hash TEXT NOT NULL,revision INTEGER NOT NULL,
   decision_id TEXT,status TEXT NOT NULL,created_at INTEGER NOT NULL,initial_received_at INTEGER) STRICT;
 CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES applications(id),criterion_id TEXT NOT NULL,
   request_hash TEXT NOT NULL UNIQUE,nonce_hash TEXT NOT NULL UNIQUE,record TEXT NOT NULL,status TEXT NOT NULL) STRICT;
 CREATE TABLE IF NOT EXISTS evidence(id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES applications(id),criterion_id TEXT NOT NULL,
   revision INTEGER NOT NULL,request_hash TEXT NOT NULL UNIQUE,nonce_hash TEXT NOT NULL UNIQUE,bundle_hash TEXT NOT NULL UNIQUE,record TEXT NOT NULL,
   UNIQUE(application_id,criterion_id,revision)) STRICT;
 CREATE TABLE IF NOT EXISTS evidence_heads(application_id TEXT NOT NULL REFERENCES applications(id),criterion_id TEXT NOT NULL,
   evidence_id TEXT NOT NULL REFERENCES evidence(id),guard TEXT NOT NULL,valid_until INTEGER NOT NULL,valid INTEGER NOT NULL,reason TEXT,
   PRIMARY KEY(application_id,criterion_id)) STRICT;
 CREATE TABLE IF NOT EXISTS retired_guards(application_id TEXT NOT NULL,criterion_id TEXT NOT NULL,guard_hash TEXT NOT NULL,
   PRIMARY KEY(application_id,criterion_id,guard_hash)) STRICT;
 CREATE TABLE IF NOT EXISTS decisions(id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES applications(id),revision INTEGER NOT NULL,
   record TEXT NOT NULL,UNIQUE(application_id,revision)) STRICT;
 CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES applications(id),record TEXT NOT NULL) STRICT;
 CREATE TABLE IF NOT EXISTS commands(id TEXT PRIMARY KEY,wallet TEXT NOT NULL,route TEXT NOT NULL,key TEXT NOT NULL,body_hash TEXT NOT NULL,
   application_id TEXT NOT NULL REFERENCES applications(id),record TEXT NOT NULL,UNIQUE(wallet,route,key)) STRICT;
 CREATE TRIGGER IF NOT EXISTS evidence_no_update BEFORE UPDATE ON evidence BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
 CREATE TRIGGER IF NOT EXISTS evidence_no_delete BEFORE DELETE ON evidence BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
 CREATE TRIGGER IF NOT EXISTS decisions_no_update BEFORE UPDATE ON decisions BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
 CREATE TRIGGER IF NOT EXISTS decisions_no_delete BEFORE DELETE ON decisions BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
 CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
 CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
 CREATE TRIGGER IF NOT EXISTS commands_no_update BEFORE UPDATE ON commands BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
 CREATE TRIGGER IF NOT EXISTS commands_no_delete BEFORE DELETE ON commands BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
`;
const tables=['clock','applications','requests','evidence','evidence_heads','retired_guards','decisions','events','commands'];
const newId=prefix=>prefix+'-'+randomUUID();
const decode=r=>r?JSON.parse(r.record):null;
const inactiveReasons=['CORRECTED','DELETED','INACCESSIBLE'];
const requestGuardHash=(g,version)=>version==='clear-bootcamp-bound-request.2'?p0Hash('BOUND-LEASE',{
  runtimeMappingHash:g.runtimeMappingHash,trustHash:g.trustHash,leaseId:g.leaseId,authExpiresAt:g.authExpiresAt,
  rawExpiresAt:g.rawExpiresAt,queryExpiresAt:g.queryExpiresAt,rawAvailable:g.rawAvailable}):guardHash(g);

// No direct candidate acceptance method and no real-data mode. The caller owns
// authentication and in-process producer/source authority; HTTP never supplies it.
export function createBootcampStore({directory,authentication,instanceId,demoStartedAt,courseOperatorRef='course-operator-demo',
  mode='DISABLED',runtimeMappingHash=DEFAULT_MAPPING_HASH,producers={},resolveSource=()=>null,
  now=()=>Math.floor(Date.now()/1000),fault=()=>{},operatorBindings=[],resolveOperatorBindings=null,measurement={},procedurePorts=null,executionServices=null,executionConnection=null,executionFenceWitness=null,executionBridge=null}){
  id(instanceId);id(courseOperatorRef);epoch(demoStartedAt);hash(runtimeMappingHash);
  check(['DISABLED','SYNTHETIC_FIXTURE','ISOLATED_LIVE_TEST'].includes(mode)&&typeof resolveSource==='function'&&typeof now==='function'&&typeof fault==='function','BC_CONFIGURATION');
  check(typeof authentication?.authorizeWorkflow==='function','BC_AUTHENTICATION');
  check(procedurePorts===null||(procedurePorts?.execution==='SYNTHETIC_PORT_FIXTURE'&&mode==='SYNTHETIC_FIXTURE'||isCanonicalProcedurePorts(procedurePorts)&&mode!=='DISABLED'),'BC_E3_PORT_CONFIGURATION');
  createExecutionPorts(executionServices); // Validate constructor-only services before opening a DB; never invokes them.
  const e4CurrentPorts=createE4CurrentPorts(executionConnection);
  const e4BridgePorts=createE4BridgePorts(executionBridge);
  check(!e4BridgePorts.configured||mode!=='DISABLED'&&!e4CurrentPorts.configured&&executionFenceWitness===null
    &&(mode==='ISOLATED_LIVE_TEST'?e4BridgePorts.sourceMode==='REGISTERED_TEST_SOURCE':e4BridgePorts.sourceMode==='SYNTHETIC_TEST_SOURCE')
    &&executionServices?.runtimeId===e4BridgePorts.scope.runtimeId&&executionServices?.runtimePinHash===e4BridgePorts.scope.runtimePinHash,'BC_E5B_CONFIGURATION');
  const fenceWitness=createFenceWitness(e4BridgePorts.configured?e4BridgePorts.fenceReader:executionFenceWitness);
  check(!e4CurrentPorts.configured||mode==='SYNTHETIC_FIXTURE'&&executionServices!==null&&executionServices.runtimePinHash===e4CurrentPorts.runtime.runtimeHash,'BC_E5_E4_CONFIGURATION');
  const registry=new Map();
  for(const [key,p] of Object.entries(producers)){
    criterion(key);check((mode!=='ISOLATED_LIVE_TEST'&&p?.execution==='SYNTHETIC_FIXTURE'||mode==='ISOLATED_LIVE_TEST'&&(isLiveMoodleConsumer(p)||isLiveReclaimConsumer(p)))&&p.capability===criterion(key).capability&&typeof p.verify==='function'&&typeof p.recheck==='function','BC_PRODUCER');
    // Pin methods: mutating a registration object cannot substitute a producer.
    check(!p.bridgeVersion||p.bridgeVersion==='clear-bootcamp-producer-bridge.2'&&typeof p.reference==='function','BC_BRIDGE_VERSION');
    registry.set(key,{dataMode:mode==='ISOLATED_LIVE_TEST'?p.dataMode:'SYNTHETIC_FIXTURE',verify:p.verify.bind(p),recheck:p.recheck.bind(p),bridgeVersion:p.bridgeVersion??null,reference:p.reference?.bind(p),close:p.close?.bind(p),prepareReflection:p.prepareReflection?.bind(p)});
  }
  const file=openPrivateDb(directory,'bootcamp.sqlite',{version:BOOTCAMP_STORE_VERSION,instanceId,demoStartedAt,courseOperatorRef,mode,
    policyHash:compiled.policyHash,runtimeMappingHash},schema,tables),{db,transaction:baseTransaction}=file;
  try{migrateR2({db,transaction:baseTransaction,fault});migrateProcedure({db,transaction:baseTransaction,fault});migrateExecution({db,transaction:baseTransaction,fault});migrateExecutionAuthority({db,transaction:baseTransaction,fault});
   if(e4BridgePorts.configured)migrateExecutionBridge({db,transaction:baseTransaction,scope:e4BridgePorts.scope,fault});
   else check(!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='e5b_meta'").get(),'BC_E5B_CONFIGURATION_REQUIRED');
  }catch(error){file.close();throw error;}
  const transaction=fn=>baseTransaction(()=>{if(e4BridgePorts.configured)db.prepare('UPDATE e5b_meta SET writer=1 WHERE id=1').run();
    db.prepare('UPDATE e5_worker_meta SET writer=1 WHERE id=1').run();db.prepare('UPDATE e5_meta SET writer=1 WHERE id=1').run();db.prepare('UPDATE r2_meta SET writer=1 WHERE id=1').run();
    db.prepare('UPDATE e3_meta SET writer=1 WHERE id=1').run();
    try{return sync(fn());}finally{db.prepare('UPDATE e3_meta SET writer=0 WHERE id=1').run();db.prepare('UPDATE r2_meta SET writer=0 WHERE id=1').run();db.prepare('UPDATE e5_meta SET writer=0 WHERE id=1').run();db.prepare('UPDATE e5_worker_meta SET writer=0 WHERE id=1').run();if(e4BridgePorts.configured)db.prepare('UPDATE e5b_meta SET writer=0 WHERE id=1').run();}});
  const ledger=r2Ledger(db,measurement);
  const normalizeOperators=bindings=>{check(Array.isArray(bindings),'BC_OPERATOR_BINDING');return bindings.map(b=>{
    exactKeys(b,['wallet','courseOperatorRef'],'BC_OPERATOR_BINDING');id(b.courseOperatorRef);
    check(typeof b.wallet==='string'&&/^0x[0-9a-fA-F]{40}$/.test(b.wallet),'BC_OPERATOR_BINDING');return {...b,wallet:b.wallet.toLowerCase()};});};
  const operators=normalizeOperators(operatorBindings);
  check(resolveOperatorBindings===null||typeof resolveOperatorBindings==='function','BC_OPERATOR_BINDING');
  const currentOperators=()=>resolveOperatorBindings?normalizeOperators(resolveOperatorBindings()):operators;
  const run=(sql,...args)=>db.prepare(sql).run(...args),get=(sql,...args)=>db.prepare(sql).get(...args),all=(sql,...args)=>db.prepare(sql).all(...args);
  const actor=(context,write)=>{
    const a=authentication.authorizeWorkflow(context,write);
    check(a?.role==='participant'&&typeof a.wallet==='string'&&/^0x[0-9a-fA-F]{40}$/.test(a.wallet),'FORBIDDEN');
    return a.wallet.toLowerCase();
  };
  const app=id=>{const a=get('SELECT * FROM applications WHERE id=?',id);check(a,'BC_NOT_FOUND');return a;};
  const owned=(wallet,applicationId)=>{const a=app(applicationId);check(a.wallet===wallet,'FORBIDDEN');return a;};
  const sessionHash=(context,wallet)=>p0Hash('AUTH-CONTEXT',{token:context.token,wallet,chainId:context.chainId});
  const heads=a=>all('SELECT * FROM evidence_heads WHERE application_id=? ORDER BY criterion_id',a.id)
    .map(h=>({...h,valid:!!h.valid,evidence:decode(get('SELECT record FROM evidence WHERE id=?',h.evidence_id)),guard:JSON.parse(h.guard)}));
  const event=(a,reason,target,time)=>{run('INSERT INTO events VALUES(?,?,?)',newId('event'),a.id,canonical({reason,target,recordedAt:time}));ledger.next();};
  function decide(a,time){
    const prior=a.decision_id&&decode(get('SELECT record FROM decisions WHERE id=?',a.decision_id));
    const d=decisionRecord(a,heads(a),{decisionId:newId('decision'),decisionRevision:(prior?.decisionRevision??0)+1,
      previousDecisionId:prior?.decisionId??null,evaluatedAt:time});
    run('INSERT INTO decisions VALUES(?,?,?,?)',d.decisionId,a.id,d.decisionRevision,canonical(d));
    ledger.decision(d);
    run('UPDATE applications SET decision_id=? WHERE id=?',d.decisionId,a.id);return d;
  }
  function source(a,c,time){
    if(mode==='DISABLED'||!registry.has(c))return null;
    try{
      const g=structuredClone(resolveSource(freeze({participantId:a.participant_id,participantWallet:a.wallet,applicationId:a.id,criterionId:c,
        policyHash:a.policy_hash,runtimeMappingHash:a.mapping_hash})));
      validateGuard(g);if(!g.rawAvailable||g.runtimeMappingHash!==a.mapping_hash||time>=guardExpiry(g))return null;
      return freeze(g);
    }catch{return null;}
  }
  function retire(a,h,reason,time){
    run('UPDATE evidence_heads SET valid=0,reason=? WHERE application_id=? AND criterion_id=?',reason,a.id,h.criterion_id);
    if(reason!=='REQUEST_REPLACED')run('INSERT OR IGNORE INTO retired_guards VALUES(?,?,?)',a.id,h.criterion_id,guardHash(h.guard));
    event(a,reason,h.evidence_id,time);
  }
  // Runs before a command savepoint. Its invalidations commit even if the
  // command is rejected. Invalid heads are never revived by a restored resolver.
  function refresh(a,time,clockReversed=false,currentSessionHash=null){
    let changed=false;
    for(const h of heads(a).filter(h=>h.valid)){
      const g=source(a,h.criterion_id,time),e=h.evidence,c=criterion(h.criterion_id);
      const age=c.source==='RECLAIM_HACKERRANK'?900:300;
      const expired=time<e.verifiedAt||time-e.acquiredAt>age||time>=h.valid_until||time>=e.rawLocator.expiresAt
        ||(c.source==='RECLAIM_HACKERRANK'&&['accountProofIssuedAt','certificateProofIssuedAt'].some(k=>time-e.facts[k]>900));
      if(clockReversed||a.status!=='ACTIVE'||!g||!same(g,h.guard)||expired){
        retire(a,h,clockReversed?'CLOCK_REVERSED':expired?'EXPIRED':'SOURCE_OR_LEASE_CHANGED',time);changed=true;
      }
    }
    for(const row of all("SELECT * FROM requests WHERE application_id=? AND status='PENDING'",a.id)){
      const r=decode(row),g=source(a,r.criterionId,time);
      if(changed||r.expectedRevision!==a.revision||clockReversed||a.status!=='ACTIVE'||time<r.issuedAt||time>=r.expiresAt||!g||requestGuardHash(g,r.version)!==r.sourceGuardHash
        ||currentSessionHash!==null&&r.authContextHash!==currentSessionHash){
        run("UPDATE requests SET status='REVOKED' WHERE id=?",r.requestId);event(a,'REQUEST_REVOKED',r.requestId,time);changed=true;
      }
    }
    if(changed){run('UPDATE applications SET revision=revision+1 WHERE id=?',a.id);a=app(a.id);decide(a,time);}
    return app(a.id);
  }
  function tick(){
    const t=epoch(now()),prior=get('SELECT floor FROM clock WHERE id=1');
    if(!prior)run('INSERT INTO clock VALUES(1,?)',t);
    else if(t>=prior.floor)run('UPDATE clock SET floor=? WHERE id=1',t);
    return {time:t,reversed:!!prior&&t<prior.floor};
  }
  function outcome(result){if(result.error)throw result.error;return result.value;}
  function access(context,applicationId,write,fn,validateCommit=null){
    return outcome(transaction(()=>{
      const wallet=actor(context,write);let a=owned(wallet,applicationId);const {time,reversed}=tick();a=refresh(a,time,reversed,sessionHash(context,wallet));
      db.exec('SAVEPOINT command');
      try{check(!reversed,'BC_CLOCK_REVERSED');const value=fn(a,wallet,time),sequence=ledger.sequence(),revision=app(applicationId).revision;
        // Collection writes once. Only its original candidate/authority and current
        // heads are revalidated; no producer call, nonce consumption or write replay.
        for(let validation=0;;validation++){
          const final=tick(),latest=refresh(app(applicationId),final.time,final.reversed,sessionHash(context,wallet));
          check(!final.reversed&&final.time>=time&&latest.revision===revision&&ledger.sequence()===sequence,'BC_VIEW_STALE');
          if(validateCommit)validateCommit(latest,final.time);
          check(actor(context,write)===wallet,'BC_COMMIT_AUTHORITY');const end=tick();
          check(!end.reversed&&end.time>=final.time,'BC_VIEW_STALE');
          if(validateCommit&&end.time>final.time&&validation===0)continue;
          check(end.time===(validateCommit?final.time:time),'BC_VIEW_STALE');break;
        }
        db.exec('RELEASE command');return {value};}
      catch(error){
        db.exec('ROLLBACK TO command; RELEASE command');
        // A producer's final synchronous recheck may reveal a revocation after
        // the first refresh. Commit that invalidation outside the savepoint too.
        const latest=tick();refresh(app(applicationId),latest.time,latest.reversed);
        return {error};
      }
    }));
  }
  // An async producer may outlive logout. Reconcile independently before its
  // final authenticated command so logout cannot roll back source invalidation.
  const reconcile=applicationId=>transaction(()=>{const {time,reversed}=tick();refresh(app(applicationId),time,reversed);});
  function replay(wallet,route,key,body){
    id(key);const bodyHash=p0Hash('COMMAND-BODY',body),prior=get('SELECT * FROM commands WHERE wallet=? AND route=? AND key=?',wallet,route,key);
    check(!prior||prior.body_hash===bodyHash,'BC_IDEMPOTENCY_CONFLICT');return prior?decode(prior):null;
  }
  function command(a,wallet,route,key,body,target,time,measurementInfo={}){
    const r={version:BOOTCAMP_STORE_VERSION,operationId:measurementInfo.operationId??newId('operation'),applicationId:a.id,route,key,
      bodyHash:p0Hash('COMMAND-BODY',body),applicationRevision:app(a.id).revision,target,committedAt:time};
    run('INSERT INTO commands VALUES(?,?,?,?,?,?,?)',r.operationId,wallet,route,key,r.bodyHash,a.id,canonical(r));ledger.next();
    const decision=decode(get('SELECT record FROM decisions WHERE id=?',target.decisionId??app(a.id).decision_id));
    const emit=eventType=>ledger.emit({applicationId:a.id,decision,operationId:r.operationId,eventType,start:measurementInfo.start});
    if(route==='create')emit('CASE_STARTED');
    if(/^collect(?:2)?:/.test(route)){emit('CONDITION_VERIFIED');emit('WAIT_INTERVAL');emit('AUTO_OPERATION_COMPLETED');
      if(decision.conditionsStatus==='NEEDS_SUPPLEMENT')emit('SUPPLEMENT_REQUESTED');}
    if(measurementInfo.extraEvent)emit(measurementInfo.extraEvent);
    return r;
  }
  const ready=a=>check(a.status==='ACTIVE'&&mode!=='DISABLED','BC_ACCEPTANCE_DISABLED');
  const cas=(a,expected)=>{revision(expected);check(a.revision===expected,'BC_REVISION_CONFLICT');};
  function window(a,time){
    const elapsed=time-demoStartedAt;check(elapsed>=0&&elapsed<(a.initial_received_at===null?1800:3600),'BC_RECEIPT_WINDOW');
  }
  const projection=r=>{
    const a=app(r.applicationId);let current=a.status==='ACTIVE'&&a.decision_id===r.target.decisionId;
    if(r.target.evidenceId)current=current&&!!get('SELECT valid FROM evidence_heads WHERE application_id=? AND evidence_id=?',a.id,r.target.evidenceId)?.valid;
    if(r.target.requestId)current=current&&get('SELECT status FROM requests WHERE id=?',r.target.requestId)?.status==='PENDING';
    return freeze({record:r,current:!!current,gates:P0_GATES});
  };
  const projection2=r=>{const p=projection(r);return freeze({version:'clear-bootcamp-operation-receipt.2',record:{operationId:r.operationId,
    applicationId:r.applicationId,applicationRevision:r.applicationRevision,target:r.target,committedAt:r.committedAt},current:p.current,gates:P0_GATES});};
  const view=a=>freeze({version:BOOTCAMP_STORE_VERSION,applicationId:a.id,participantId:a.participant_id,recipientRef:a.recipient_ref,
    policyHash:a.policy_hash,runtimeMappingHash:a.mapping_hash,revision:a.revision,status:a.status,mode,realAcceptanceReady:false,
    decision:{record:decode(get('SELECT record FROM decisions WHERE id=?',a.decision_id)),current:a.status==='ACTIVE'},
    evidence:heads(a).map(h=>({record:h.evidence,current:h.valid&&a.status==='ACTIVE',invalidationReason:h.reason})),gates:P0_GATES});

  const requestAuthority=(context,applicationId,wallet,r)=>()=>{try{
    const a=owned(wallet,applicationId),row=get('SELECT status FROM requests WHERE id=?',r.requestId);
    if(a.status!=='ACTIVE'||a.policy_hash!==r.policyHash||a.mapping_hash!==r.runtimeMappingHash
      ||sessionHash(context,wallet)!==r.authContextHash||actor(context,true)!==wallet)return false;
    if(row?.status==='PENDING')return a.revision===r.expectedRevision&&epoch(now())<r.expiresAt;
    return row?.status==='CONSUMED'&&!!get('SELECT 1 FROM evidence e JOIN evidence_heads h ON h.evidence_id=e.id WHERE e.request_hash=? AND h.valid=1',r.requestHash);
  }catch{return false;}};
  const service={
    origin:authentication.origin,close(){for(const p of registry.values())p.close?.();file.close();},
    policy(context){actor(context,false);return freeze({...compiled,mode,realAcceptanceReady:false,gates:P0_GATES});},
    createApplication(context,body,key){
      exactKeys(body,[],'BC_APPLICATION_BODY');
      return outcome(transaction(()=>{
        const wallet=actor(context,true),prior=replay(wallet,'create',key,body),{time,reversed}=tick();
        if(prior){
          refresh(app(prior.applicationId),time,reversed);
          try{const value=projection(prior),final=tick(),sequence=ledger.sequence();refresh(app(prior.applicationId),final.time,final.reversed);
            const end=tick();check(!reversed&&!final.reversed&&!end.reversed,'BC_CLOCK_REVERSED');
            check(end.time===time&&sequence===ledger.sequence(),'BC_VIEW_STALE');check(actor(context,true)===wallet,'BC_COMMIT_AUTHORITY');return {value};
          }catch(error){const c=tick();refresh(app(prior.applicationId),c.time,c.reversed);return {error};}
        }
        check(!reversed&&time>=demoStartedAt,'BC_CLOCK_REVERSED');
        const applicationId=newId('application'),participantId='participant-'+p0Hash('PARTICIPANT',{instanceId,wallet}).slice(2,42),recipientRef='recipient-'+p0Hash('RECIPIENT',{instanceId,wallet}).slice(2,42);
        run("INSERT INTO applications VALUES(?,?,?,?,?,?,?,1,NULL,'ACTIVE',?,NULL)",applicationId,participantId,wallet,recipientRef,courseOperatorRef,compiled.policyHash,runtimeMappingHash,time);
        const a=app(applicationId),d=decide(a,time),value=projection(command(a,wallet,'create',key,body,{decisionId:d.decisionId},time));
        check(actor(context,true)===wallet,'BC_COMMIT_AUTHORITY');return {value};
      }));
    },
    getApplication(context,applicationId){id(applicationId);return access(context,applicationId,false,a=>view(a));},
    issueRequest(context,applicationId,body,key,{bridge=false}={}){
      exactKeys(body,['criterionId','expectedRevision'],'BC_REQUEST_BODY');criterion(body.criterionId);
      return access(context,applicationId,true,(a,wallet,time)=>{
        const route=(bridge?'request2:':'request:')+applicationId,prior=replay(wallet,route,key,body);if(prior)return projection(prior);
        ready(a);cas(a,body.expectedRevision);window(a,time);const g=source(a,body.criterionId,time);check(g,'BC_SOURCE_UNKNOWN');
        const producer=registry.get(body.criterionId);check(bridge?!!producer?.bridgeVersion:!producer?.bridgeVersion,'BC_REQUEST_VERSION');
        check(!get('SELECT 1 FROM retired_guards WHERE application_id=? AND criterion_id=? AND guard_hash=?',a.id,body.criterionId,guardHash(g)),'BC_SOURCE_RETIRED');
        run("UPDATE requests SET status='REVOKED' WHERE application_id=? AND status='PENDING'",a.id);
        const h=heads(a).find(h=>h.criterion_id===body.criterionId&&h.valid);if(h)retire(a,h,'REQUEST_REPLACED',time);
        run('UPDATE applications SET revision=revision+1 WHERE id=?',a.id);a=app(a.id);
        const version=bridge?'clear-bootcamp-bound-request.2':'clear-bootcamp-request.1';
        const r={version,requestId:newId('request'),participantId:a.participant_id,participantWallet:wallet,
          applicationId:a.id,criterionId:body.criterionId,policyHash:a.policy_hash,runtimeMappingHash:a.mapping_hash,
          expectedRevision:a.revision,authContextHash:sessionHash(context,wallet),nonceHash:p0Hash('NONCE',randomBytes(32).toString('hex')),issuedAt:time,
          expiresAt:Math.min(time+900,guardExpiry(g)),receiptWindowUntilExclusive:demoStartedAt+(a.initial_received_at===null?1800:3600),
          sourceGuardHash:requestGuardHash(g,version),dataMode:producer.dataMode,...(bridge?{producerVersion:producer.bridgeVersion,producerTrustHash:g.trustHash,
            plannedEvidenceId:newId('evidence'),plannedEvidenceRevision:(get('SELECT MAX(revision) n FROM evidence WHERE application_id=? AND criterion_id=?',a.id,body.criterionId).n??0)+1}:{})};
        r.requestHash=p0Hash('REQUEST',r);run("INSERT INTO requests VALUES(?,?,?,?,?,?,'PENDING')",r.requestId,a.id,r.criterionId,r.requestHash,r.nonceHash,canonical(r));
        const d=decide(a,time);return projection(command(a,wallet,route,key,body,{requestId:r.requestId,decisionId:d.decisionId},time,{extraEvent:h?'REVERIFICATION_REQUESTED':null}));
      });
    },
    issueBridgeRequest(context,applicationId,body,key){const result=service.issueRequest(context,applicationId,body,key,{bridge:true});return projection2(result.record);},
    getRequest(context,applicationId,requestId,{bridge=false}={}){
      id(requestId);return access(context,applicationId,false,()=>{const r=get('SELECT * FROM requests WHERE id=? AND application_id=?',requestId,applicationId);check(r,'BC_NOT_FOUND');
        check(decode(r).version===(bridge?'clear-bootcamp-bound-request.2':'clear-bootcamp-request.1'),'BC_REQUEST_VERSION');return freeze({record:decode(r),status:r.status,gates:P0_GATES});});
    },
    // Source/packet only. Human approval happens after this returns, before collectBridge's execution timer starts.
    async prepareBridgeReflection(context,applicationId,body,{signal,timeoutMs=30000}={}){
      exactKeys(body,['requestId','expectedRevision'],'BC_COLLECT_BODY');id(body.requestId);revision(body.expectedRevision);
      check(mode==='ISOLATED_LIVE_TEST'&&Number.isSafeInteger(timeoutMs)&&timeoutMs>=1&&timeoutMs<=30000,'BC_TIMEOUT');
      const started=access(context,applicationId,true,(a,wallet,time)=>{
        ready(a);cas(a,body.expectedRevision);window(a,time);
        const row=get('SELECT * FROM requests WHERE id=? AND application_id=?',body.requestId,a.id);check(row?.status==='PENDING','BC_REQUEST_NOT_PENDING');
        const r=freeze(decode(row)),producer=registry.get(r.criterionId),g=source(a,r.criterionId,time);
        check(r.version==='clear-bootcamp-bound-request.2'&&r.criterionId==='reflection-topics'&&typeof producer?.prepareReflection==='function','BC_LIVE_AI_PREPARATION_REQUEST');
        check(r.expectedRevision===a.revision&&time<r.expiresAt&&g&&requestGuardHash(g,r.version)===r.sourceGuardHash,'BC_REQUEST_STALE');
        return {request:r,wallet,producer};
      });
      const controller=new AbortController(),combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
      let timer,prepared;
      try{
        prepared=await Promise.race([started.producer.prepareReflection(started.request,{signal:combined,isAuthorized:requestAuthority(context,applicationId,started.wallet,started.request)}),
          new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('BC_PRODUCER_TIMEOUT'));},Math.min(timeoutMs,Math.max(0,(started.request.expiresAt-epoch(now()))*1000)));})]);
        check(prepared.isCurrent(),'BC_LIVE_AI_PREPARATION_STALE');return prepared;
      }catch(e){controller.abort();prepared?.dispose();throw e;}finally{clearTimeout(timer);}
    },
    async collect(context,applicationId,body,key,{signal,timeoutMs=5000,bridge=false}={}){
      exactKeys(body,['requestId','expectedRevision'],'BC_COLLECT_BODY');id(body.requestId);revision(body.expectedRevision);
      check(Number.isSafeInteger(timeoutMs)&&timeoutMs>=1&&timeoutMs<=(mode==='ISOLATED_LIVE_TEST'?300000:30000),'BC_TIMEOUT');
      const route=(bridge?'collect2:':'collect:')+applicationId;
      const started=access(context,applicationId,true,(a,wallet,time)=>{
        const prior=replay(wallet,route,key,body);if(prior)return {prior:projection(prior)};
        ready(a);cas(a,body.expectedRevision);window(a,time);
        const row=get('SELECT * FROM requests WHERE id=? AND application_id=?',body.requestId,a.id);check(row?.status==='PENDING','BC_REQUEST_NOT_PENDING');
        const r=decode(row);check(r.expectedRevision===a.revision&&time<r.expiresAt,'BC_REQUEST_STALE');
        check(r.version===(bridge?'clear-bootcamp-bound-request.2':'clear-bootcamp-request.1'),'BC_REQUEST_VERSION');
        const p=registry.get(r.criterionId);check(p,'BC_PRODUCER_UNAVAILABLE');
        const operationId='operation-'+p0Hash('COLLECTION-OPERATION',{applicationId,requestHash:r.requestHash}).slice(2,50),start=ledger.stamp();
        const decision=decode(get('SELECT record FROM decisions WHERE id=?',a.decision_id));
        ledger.attempt(a.id,operationId,{phase:'STARTED',requestHash:r.requestHash,bodyHash:p0Hash('COMMAND-BODY',body),clockEpoch:start.clockEpoch,startedUtcMs:start.utc});
        return {request:freeze(r),producer:p,wallet,operationId,start,decision};
      });
      if(started.prior)return started.prior;
      const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
      if(signal?.aborted)abort();let timer,candidate,failure;
      // Read-only lease authority: no recursive source resolution/transaction.
      // A consumed request retains raw access only while its exact accepted
      // evidence is the valid head. A new decision never revives a retired head.
      const isAuthorized=requestAuthority(context,applicationId,started.wallet,started.request);
      try{
        candidate=await Promise.race([Promise.resolve().then(()=>{
          check(!controller.signal.aborted,'BC_CANCELLED');
          access(context,applicationId,true,a=>{cas(a,started.request.expectedRevision);check(isAuthorized(),'BC_COMMIT_AUTHORITY');});
          return started.producer.verify(started.request,{signal:controller.signal,isAuthorized});}),
          new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('BC_PRODUCER_TIMEOUT'));},mode==='ISOLATED_LIVE_TEST'?Math.min(timeoutMs,Math.max(0,(started.request.expiresAt-epoch(now()))*1000)):timeoutMs);})]);
      }catch(error){failure=error;}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
      reconcile(applicationId);
      let validateCollected=()=>{};
      try{return access(context,applicationId,true,(a,wallet,time)=>{
        const prior=replay(wallet,route,key,body);if(prior)return projection(prior);
        check(wallet===started.wallet,'FORBIDDEN');ready(a);cas(a,body.expectedRevision);window(a,time);
        check(!failure,'BC_PRODUCER_FAILED');check(!controller.signal.aborted&&!signal?.aborted,'BC_CANCELLED');
        const row=get('SELECT * FROM requests WHERE id=? AND application_id=?',body.requestId,a.id);check(row?.status==='PENDING','BC_REQUEST_NOT_PENDING');
        const r=decode(row),g=source(a,r.criterionId,time);check(g&&time<r.expiresAt&&requestGuardHash(g,r.version)===r.sourceGuardHash,'BC_REQUEST_STALE');
        check(started.producer.recheck(candidate,started.request)===true,'BC_PRODUCER_RECHECK');
        const safe=snapshotCandidate(candidate),condition=validateCandidate(safe,r,g,time);
        check(!get('SELECT 1 FROM evidence WHERE bundle_hash=?',safe.proofBundleHash),'BC_PROOF_REPLAY');
        const priorEvidence=get('SELECT id,revision FROM evidence WHERE application_id=? AND criterion_id=? ORDER BY revision DESC LIMIT 1',a.id,r.criterionId);
        const nextRevision=(priorEvidence?.revision??0)+1;check(!bridge||r.plannedEvidenceRevision===nextRevision,'BC_REVISION_CONFLICT');
        const e=evidenceRecord(safe,r,{evidenceId:bridge?r.plannedEvidenceId:newId('evidence'),evidenceRevision:nextRevision,previousEvidenceId:priorEvidence?.id??null,condition,dataMode:started.producer.dataMode});
        const reference=started.producer.bridgeVersion?started.producer.reference(candidate,started.request):null;
        if(reference)check(reference.ledgerRequestHash===r.requestHash&&reference.ledgerNonceHash===r.nonceHash,'BC_BRIDGE_REQUEST');
        // Recheck immediately before the first write; callbacks must be synchronous.
        check(actor(context,true)===wallet&&started.producer.recheck(candidate,started.request)===true,'BC_COMMIT_AUTHORITY');
        const writeTime=epoch(now()),writeGuard=source(a,r.criterionId,writeTime);
        check(writeTime>=time&&writeGuard&&requestGuardHash(writeGuard,r.version)===r.sourceGuardHash,'BC_COMMIT_CONTEXT');
        validateCollected=(currentApp,at)=>{
          const guard=source(currentApp,r.criterionId,at);
          check(guard&&requestGuardHash(guard,r.version)===r.sourceGuardHash,'BC_COMMIT_CONTEXT');
          check(at<r.expiresAt&&at<r.receiptWindowUntilExclusive,'BC_RECEIPT_WINDOW');
          check(started.producer.recheck(candidate,started.request)===true&&actor(context,true)===wallet,'BC_COMMIT_AUTHORITY');
          validateCandidate(safe,r,guard,at);
        };
        validateCollected(a,writeTime);
        run("UPDATE requests SET status='CONSUMED' WHERE id=? AND status='PENDING'",r.requestId);fault('after-nonce');
        run('INSERT INTO evidence VALUES(?,?,?,?,?,?,?,?)',e.evidenceId,a.id,r.criterionId,e.evidenceRevision,r.requestHash,r.nonceHash,safe.proofBundleHash,canonical(e));fault('after-evidence');
        if(reference)ledger.bridge(e.evidenceId,reference);
        run('INSERT INTO evidence_heads VALUES(?,?,?,?,?,1,NULL) ON CONFLICT(application_id,criterion_id) DO UPDATE SET evidence_id=excluded.evidence_id,guard=excluded.guard,valid_until=excluded.valid_until,valid=1,reason=NULL',a.id,r.criterionId,e.evidenceId,canonical(g),safe.validUntilExclusive);
        run('UPDATE applications SET revision=revision+1,initial_received_at=COALESCE(initial_received_at,?) WHERE id=?',time,a.id);a=app(a.id);
        const d=decide(a,time);fault('after-decision');
        const result=command(a,wallet,route,key,body,{evidenceId:e.evidenceId,decisionId:d.decisionId},time,started);fault('after-command');
        const final=tick();check(!final.reversed,'BC_CLOCK_REVERSED');
        check(started.producer.recheck(candidate,started.request)===true&&actor(context,true)===wallet,'BC_COMMIT_AUTHORITY');
        const currentGuard=source(a,r.criterionId,final.time);check(currentGuard&&requestGuardHash(currentGuard,r.version)===r.sourceGuardHash,'BC_COMMIT_CONTEXT');
        validateCandidate(safe,r,currentGuard,final.time);check(final.time<r.receiptWindowUntilExclusive,'BC_RECEIPT_WINDOW');
        // The decision also depends on other criteria's current heads. A change
        // to any of them must reject this acceptance, not commit a mixed result.
        check(refresh(a,final.time).revision===a.revision,'BC_COMMIT_CONTEXT');
        return projection(result);
      },(a,time)=>validateCollected(a,time));}catch(error){
        transaction(()=>{const end=ledger.stamp();ledger.attempt(applicationId,started.operationId,{phase:'FAILED',clockEpoch:end.clockEpoch,endedUtcMs:end.utc});
          ledger.emit({applicationId,decision:started.decision,operationId:started.operationId,eventType:'OPERATION_FAILED',start:started.start,end});});
        throw error;
      }
    },
    async collectBridge(context,applicationId,body,key,options={}){
      const result=await service.collect(context,applicationId,body,key,{...options,bridge:true});
      reconcile(applicationId);return service.getR2Operation(context,applicationId,result.record.operationId);
    },
    invalidate(context,applicationId,body,key){
      exactKeys(body,['criterionId','reason','expectedRevision'],'BC_INVALIDATION_BODY');criterion(body.criterionId);check(inactiveReasons.includes(body.reason),'BC_INVALIDATION_REASON');
      return access(context,applicationId,true,(a,wallet,time)=>{
        const route='invalidate:'+applicationId,prior=replay(wallet,route,key,body);if(prior)return projection(prior);cas(a,body.expectedRevision);
        const h=heads(a).find(h=>h.criterion_id===body.criterionId);if(h?.valid)retire(a,h,body.reason,time);
        const g=source(a,body.criterionId,time);if(g)run('INSERT OR IGNORE INTO retired_guards VALUES(?,?,?)',a.id,body.criterionId,guardHash(g));
        run("UPDATE requests SET status='REVOKED' WHERE application_id=? AND status='PENDING'",a.id);
        run('UPDATE applications SET revision=revision+1 WHERE id=?',a.id);a=app(a.id);event(a,body.reason,body.criterionId,time);
        const d=decide(a,time);return projection(command(a,wallet,route,key,body,{decisionId:d.decisionId},time));
      });
    },
    cancel(context,applicationId,body,key){
      exactKeys(body,['expectedRevision'],'BC_CANCEL_BODY');
      return access(context,applicationId,true,(a,wallet,time)=>{
        const route='cancel:'+applicationId,prior=replay(wallet,route,key,body);if(prior)return projection(prior);cas(a,body.expectedRevision);
        run("UPDATE applications SET status='CANCELLED',revision=revision+1 WHERE id=?",a.id);a=app(a.id);
        for(const h of heads(a).filter(h=>h.valid))retire(a,h,'CANCELLED',time);
        run("UPDATE requests SET status='REVOKED' WHERE application_id=? AND status='PENDING'",a.id);event(a,'CANCELLED',a.id,time);
        const d=decide(a,time);return projection(command(a,wallet,route,key,body,{decisionId:d.decisionId},time));
      });
    },
    getOperation(context,applicationId,operationId){
      id(operationId);return access(context,applicationId,false,()=>{const r=get('SELECT record FROM commands WHERE id=? AND application_id=?',operationId,applicationId);check(r,'BC_NOT_FOUND');
        const record=decode(r);check(!/^(r2-|e3-|request2:|collect2:)/.test(record.route),'BC_REQUEST_VERSION');return projection(record);});
    },
    getDecision(context,applicationId,decisionId){
      id(decisionId);return access(context,applicationId,false,a=>{const row=get('SELECT record FROM decisions WHERE id=? AND application_id=?',decisionId,applicationId);check(row,'BC_NOT_FOUND');return freeze({record:decode(row),current:a.status==='ACTIVE'&&a.decision_id===decisionId,gates:P0_GATES});});
    },
    getEvidence(context,applicationId,evidenceId){
      id(evidenceId);return access(context,applicationId,false,a=>{
        const row=get('SELECT record FROM evidence WHERE id=? AND application_id=?',evidenceId,applicationId);check(row,'BC_NOT_FOUND');
        const h=get('SELECT valid,reason FROM evidence_heads WHERE application_id=? AND evidence_id=?',applicationId,evidenceId);
        return freeze({record:decode(row),current:a.status==='ACTIVE'&&!!h?.valid,invalidationReason:h?h.reason:'SUPERSEDED',gates:P0_GATES});
      });
    },
  };
  return Object.assign(service,createOperations({db,transaction,authentication,operatorBindings:currentOperators,app,refresh,tick,sessionHash,ledger,heads,replay,command,
    projectOperation:projection2,source,mode,procedurePorts,fault}),{execution:createExecutionOperations({db,transaction,authentication,operatorBindings:currentOperators,
      app,refresh,tick,sessionHash,ledger,heads,source,services:executionServices,e4CurrentPorts,e4BridgePorts,fenceWitness,fault})});
}
