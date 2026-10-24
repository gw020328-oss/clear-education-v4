import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {canonical,exactKeys,requireRule as check} from '../policy/values.mjs';
import {P0_GATES,p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
import {R2_ADDENDUM} from '../../specs/bootcamp/r2-reference.mjs';
import {id,hash,revision,epoch} from './model.mjs';

const names=['r2_meta','r2_decisions','r2_metrics','r2_attempts','r2_bridges','r2_actions'];
const schema=`
 CREATE TABLE r2_meta(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL,sequence INTEGER NOT NULL,writer INTEGER NOT NULL CHECK(writer IN (0,1))) STRICT;
 INSERT INTO r2_meta VALUES(1,2,0,0);
 CREATE TABLE r2_decisions(decision_id TEXT PRIMARY KEY REFERENCES decisions(id),sequence INTEGER NOT NULL UNIQUE) STRICT;
 CREATE TABLE r2_metrics(id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES applications(id),logical_key TEXT NOT NULL UNIQUE,
  record TEXT NOT NULL,clock_epoch TEXT NOT NULL,started_utc_ms INTEGER NOT NULL,ended_utc_ms INTEGER NOT NULL,sequence INTEGER NOT NULL UNIQUE) STRICT;
 CREATE TABLE r2_attempts(id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES applications(id),operation_id TEXT NOT NULL,
  record TEXT NOT NULL,sequence INTEGER NOT NULL UNIQUE) STRICT;
 CREATE TABLE r2_bridges(evidence_id TEXT PRIMARY KEY REFERENCES evidence(id),record TEXT NOT NULL,sequence INTEGER NOT NULL UNIQUE) STRICT;
 CREATE TABLE r2_actions(id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES applications(id),kind TEXT NOT NULL,
  logical_key TEXT NOT NULL UNIQUE,record TEXT NOT NULL,sequence INTEGER NOT NULL UNIQUE) STRICT;
`;
const immutable=['r2_decisions','r2_metrics','r2_attempts','r2_bridges','r2_actions'];
const guarded=['applications','requests','evidence','evidence_heads','decisions','events','commands'];
export const METRIC_VERSION='clear-bootcamp-metric-event.2';
export const PROJECTION_VERSION='clear-bootcamp-operations-projection.2';
const metricKeys=['version','eventId','scenarioRunId','applicationRef','decisionRevision','decisionHash','operationId','eventType','startedAtMs','endedAtMs','actorRef','provenance'];
export function validateMetric(e){
  exactKeys(e,metricKeys,'BC_METRIC_FIELDS');check(e.version===METRIC_VERSION,'BC_METRIC_VERSION');
  for(const k of ['eventId','scenarioRunId','applicationRef','operationId','actorRef'])id(e[k]);revision(e.decisionRevision);hash(e.decisionHash);
  epoch(e.startedAtMs);epoch(e.endedAtMs);check(e.endedAtMs>=e.startedAtMs,'BC_METRIC_INTERVAL');
  check(R2_ADDENDUM.metrics.eventTypes.includes(e.eventType)&&R2_ADDENDUM.metrics.provenance.includes(e.provenance),'BC_METRIC_TYPE');return e;
}
const logical=e=>p0Hash('METRIC-LOGICAL',['scenarioRunId','applicationRef','decisionRevision','decisionHash','operationId','eventType'].map(k=>e[k]));
const union=rows=>{let end=-1,total=0;for(const r of [...rows].sort((a,b)=>a.startedAtMs-b.startedAtMs)){
  total+=Math.max(0,r.endedAtMs-Math.max(end,r.startedAtMs));end=Math.max(end,r.endedAtMs);
}return total;};
export function summarizeMetrics(events){
  events.forEach(validateMetric);check(new Set(events.map(e=>e.scenarioRunId)).size<=1,'BC_METRIC_EPOCH_MIX');
  check(new Set(events.map(e=>e.applicationRef)).size<=1&&new Set(events.map(e=>e.provenance)).size<=1,'BC_METRIC_SCOPE_MIX');
  const of=t=>events.filter(e=>e.eventType===t),human=of('HUMAN_WORK_INTERVAL'),wait=of('WAIT_INTERVAL'),verification=of('CONDITION_VERIFIED');
  return {scenarioRunId:events[0]?.scenarioRunId??null,provenance:events[0]?.provenance??null,coverage:'RECORDED_SERVER_INTERVALS_ONLY',eventCount:events.length,
    conditionVerificationWallMs:verification.length?Math.max(...verification.map(e=>e.endedAtMs))-Math.min(...verification.map(e=>e.startedAtMs)):null,
    overallElapsedMs:null,humanWorkMs:human.length?[...new Set(human.map(e=>e.actorRef))].reduce((n,actor)=>n+union(human.filter(e=>e.actorRef===actor)),0):null,
    waitingWallMs:wait.length?union(wait):null,automatedOperationCount:events.length?of('AUTO_OPERATION_COMPLETED').length:null,
    manualInterventionCount:human.length||null,supplementCount:events.length?of('SUPPLEMENT_REQUESTED').length:null,
    reverificationCount:events.length?of('REVERIFICATION_REQUESTED').length:null,failureCount:events.length?of('OPERATION_FAILED').length:null,
    humanWorkCoverageComplete:false,baselineComparable:false,baselineHumanWorkMs:null,humanWorkReductionPercent:null,
    caseCompletionMeasured:false,gates:P0_GATES};
}
export function validateBridgeReference(r){
  const common=['version','producer','ledgerRequestHash','ledgerNonceHash','producerRequestHash','receiptHash'];
  check(r?.version==='clear-bootcamp-producer-bridge.2','BC_BRIDGE_REFERENCE');
  if(r.producer==='hackerrank-adapter.1'){
    exactKeys(r,[...common,'producerNonceHash','proofBundleHash','trustConfigHash','expectedClaimOwnerHash','recipeHash','validUntilExclusive'],'BC_BRIDGE_REFERENCE');
    for(const k of ['producerNonceHash','proofBundleHash','trustConfigHash','expectedClaimOwnerHash','recipeHash'])hash(r[k]);epoch(r.validUntilExclusive);
  }else{
    exactKeys(r,[...common,'sourceHash','sourceDataMode','execution','producerUsableForAcceptance','observationHash'],'BC_BRIDGE_REFERENCE');
    check(((r.producer==='offline-moodle-ai-composition.2'&&r.execution==='OFFLINE_SYNTHETIC_FIXTURE')||(r.producer==='live-moodle-ai-composition.1'&&r.execution==='OBSERVED_LOCAL_API'))&&r.sourceDataMode==='LOCAL_LMS_RECORD'
      &&r.producerUsableForAcceptance===false,'BC_BRIDGE_REFERENCE');hash(r.sourceHash);if(r.observationHash!==null)hash(r.observationHash);
  }
  for(const k of ['ledgerRequestHash','ledgerNonceHash','producerRequestHash','receiptHash'])hash(r[k]);return r;
}
export function migrateR2({db,transaction,fault=()=>{}}){
  transaction(()=>{
    const exists=name=>!!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(name);
    if(exists('r2_meta')){
      const meta=db.prepare('SELECT version,writer FROM r2_meta WHERE id=1').get();
      check(names.every(exists)&&meta?.version===2&&meta.writer===0,'BC_R2_SCHEMA_INCOMPLETE');
      const trigger=name=>!!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='trigger' AND name=?").get(name);
      check(immutable.every(t=>['update','delete'].every(op=>trigger(t+'_no_'+op)))&&guarded.every(t=>trigger('r2_insert_'+t)),'BC_R2_SCHEMA_INCOMPLETE');
      check(!db.prepare('SELECT 1 FROM decisions d LEFT JOIN r2_decisions r ON r.decision_id=d.id WHERE r.decision_id IS NULL').get(),'BC_R2_SEQUENCE_INCOMPLETE');return;
    }
    check(names.every(name=>!exists(name)),'BC_R2_SCHEMA_INCOMPLETE');db.exec(schema);fault('r2-after-schema');
    for(const table of immutable)for(const operation of ['UPDATE','DELETE'])db.exec(`CREATE TRIGGER ${table}_no_${operation.toLowerCase()} BEFORE ${operation} ON ${table} BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;`);
    for(const table of guarded)db.exec(`CREATE TRIGGER r2_insert_${table} BEFORE INSERT ON ${table} WHEN (SELECT writer FROM r2_meta WHERE id=1)!=1 BEGIN SELECT RAISE(ABORT,'BC_R2_WRITER_REQUIRED'); END;`);
    let sequence=0;for(const d of db.prepare('SELECT id FROM decisions ORDER BY rowid').all())db.prepare('INSERT INTO r2_decisions VALUES(?,?)').run(d.id,++sequence);
    db.prepare('UPDATE r2_meta SET sequence=? WHERE id=1').run(sequence);fault('r2-after-backfill');
  });
}
// Factory methods are internal; never expose append/event/time input over HTTP.
export function r2Ledger(db,{nowUtcMs=()=>Date.now(),monotonicMs=()=>performance.now()}={}){
  const runId='run-'+randomUUID(),clockEpoch='epoch-'+randomUUID();let floor=0;
  const next=()=>{db.prepare('UPDATE r2_meta SET sequence=sequence+1 WHERE id=1').run();return sequence();};
  const sequence=()=>db.prepare('SELECT sequence FROM r2_meta WHERE id=1').get().sequence;
  const stamp=()=>{const mono=Math.floor(monotonicMs()),utc=nowUtcMs();epoch(mono);epoch(utc);check(mono>=floor,'BC_METRIC_CLOCK');floor=mono;return {mono,utc,runId,clockEpoch};};
  function insertMetric(e,{startedUtcMs,endedUtcMs,epochId=clockEpoch}){
    validateMetric(e);epoch(startedUtcMs);epoch(endedUtcMs);id(epochId);check(endedUtcMs>=startedUtcMs,'BC_METRIC_CLOCK');
    const record=canonical(e),prior=db.prepare('SELECT * FROM r2_metrics WHERE id=?').get(e.eventId);
    if(prior){check(prior.record===record&&prior.clock_epoch===epochId&&prior.started_utc_ms===startedUtcMs&&prior.ended_utc_ms===endedUtcMs,'BC_METRIC_ID_CONFLICT');return e;}
    check(!db.prepare('SELECT 1 FROM r2_metrics WHERE logical_key=?').get(logical(e)),'BC_METRIC_OPERATION_DUPLICATE');
    db.prepare('INSERT INTO r2_metrics VALUES(?,?,?,?,?,?,?,?)').run(e.eventId,e.applicationRef,logical(e),record,epochId,startedUtcMs,endedUtcMs,next());return e;
  }
  function emit({applicationId,decision,operationId,eventType,actorRef='system-bootcamp',start,end=stamp()}){
    const e={version:METRIC_VERSION,eventId:'metric-'+p0Hash('METRIC-ID',{runId,applicationId,decisionHash:decision.decisionHash,operationId,eventType}).slice(2,50),
      scenarioRunId:runId,applicationRef:applicationId,decisionRevision:decision.decisionRevision,decisionHash:decision.decisionHash,operationId,eventType,
      startedAtMs:start?.mono??end.mono,endedAtMs:end.mono,actorRef,provenance:'MEASURED_ISOLATED_TEST'};
    const prior=db.prepare('SELECT record FROM r2_metrics WHERE logical_key=?').get(logical(e));
    if(prior)return JSON.parse(prior.record); // internal retry reuses original measured interval
    return insertMetric(e,{startedUtcMs:start?.utc??end.utc,endedUtcMs:end.utc});
  }
  return {sequence,next,stamp,runId,insertMetric,emit,
    decision(d){db.prepare('INSERT INTO r2_decisions VALUES(?,?)').run(d.decisionId,next());},
    bridge(evidenceId,record){validateBridgeReference(record);db.prepare('INSERT INTO r2_bridges VALUES(?,?,?)').run(evidenceId,canonical(record),next());},
    attempt(applicationId,operationId,record){db.prepare('INSERT INTO r2_attempts VALUES(?,?,?,?,?)').run('attempt-'+randomUUID(),applicationId,operationId,canonical(record),next());},
    action(applicationId,kind,logicalKey,record){
      const prior=db.prepare('SELECT record FROM r2_actions WHERE logical_key=?').get(logicalKey);if(prior)return JSON.parse(prior.record);
      db.prepare('INSERT INTO r2_actions VALUES(?,?,?,?,?,?)').run(record.id,applicationId,kind,logicalKey,canonical(record),next());return record;
    },
    actions(applicationId){return db.prepare('SELECT record FROM r2_actions WHERE application_id=? ORDER BY sequence').all(applicationId).map(r=>JSON.parse(r.record));},
    metrics(applicationId,scenarioRunId=null){
      if(scenarioRunId!==null)id(scenarioRunId);
      const rows=db.prepare('SELECT record FROM r2_metrics WHERE application_id=? ORDER BY sequence').all(applicationId).map(r=>JSON.parse(r.record));
      const selected=scenarioRunId??rows.at(-1)?.scenarioRunId??null;
      return summarizeMetrics(rows.filter(r=>r.scenarioRunId===selected));
    },
    events(applicationId){return db.prepare('SELECT record FROM r2_metrics WHERE application_id=? ORDER BY sequence').all(applicationId).map(r=>JSON.parse(r.record));},
  };
}
