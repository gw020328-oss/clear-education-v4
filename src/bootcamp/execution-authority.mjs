import {randomUUID} from 'node:crypto';
import {canonical,exactKeys,freeze,requireRule as check} from '../policy/values.mjs';
import {id,hash,revision} from './model.mjs';
import {e4Hash} from './execution-e4-ports.mjs';

const tables=['e5_worker_meta','e5_runtime_workers','e5_worker_fences','e5_worker_slots','e5_worker_stops','e5_worker_witnesses'];
const immutable=tables.slice(2);
const schema=`
CREATE TABLE e5_worker_meta(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL CHECK(version=1),writer INTEGER NOT NULL CHECK(writer IN(0,1))) STRICT;
CREATE TABLE e5_runtime_workers(runtime_id TEXT PRIMARY KEY REFERENCES e5_runtimes(id),pin_hash TEXT NOT NULL UNIQUE,scope_key TEXT NOT NULL UNIQUE,
 fence INTEGER NOT NULL CHECK(fence>=1),owner TEXT NOT NULL,incarnation TEXT NOT NULL,lease_id TEXT NOT NULL UNIQUE,generation INTEGER NOT NULL CHECK(generation>=1),
 expires_at INTEGER NOT NULL,slot_revision INTEGER NOT NULL CHECK(slot_revision>=0),slot_id TEXT,intent_id TEXT,local_fence INTEGER,local_revision INTEGER) STRICT;
CREATE TABLE e5_worker_fences(runtime_id TEXT NOT NULL REFERENCES e5_runtimes(id),fence INTEGER NOT NULL CHECK(fence>=1),lease_id TEXT NOT NULL UNIQUE,record TEXT NOT NULL,PRIMARY KEY(runtime_id,fence)) STRICT;
CREATE TABLE e5_worker_slots(runtime_id TEXT NOT NULL REFERENCES e5_runtimes(id),revision INTEGER NOT NULL CHECK(revision>=1),slot_id TEXT NOT NULL UNIQUE,record TEXT NOT NULL,PRIMARY KEY(runtime_id,revision)) STRICT;
CREATE TABLE e5_worker_stops(runtime_id TEXT PRIMARY KEY REFERENCES e5_runtimes(id),record TEXT NOT NULL) STRICT;
CREATE TABLE e5_worker_witnesses(id TEXT PRIMARY KEY,runtime_id TEXT NOT NULL REFERENCES e5_runtimes(id),fence INTEGER NOT NULL CHECK(fence>=0),record TEXT NOT NULL) STRICT;
`;
function definitions(){
 const result=new Map(),add=(name,body)=>result.set(name,`CREATE TRIGGER ${name} ${body}`);
 for(const t of immutable)for(const op of ['UPDATE','DELETE'])add(t+'_no_'+op.toLowerCase(),`BEFORE ${op} ON ${t} BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END`);
 add('e5_runtime_workers_no_delete',"BEFORE DELETE ON e5_runtime_workers BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END");
 for(const t of tables.slice(1))for(const op of (immutable.includes(t)?['INSERT']:['INSERT','UPDATE']))
  add(t+'_writer_'+op.toLowerCase(),`BEFORE ${op} ON ${t} WHEN (SELECT writer FROM e5_worker_meta WHERE id=1)!=1 OR (SELECT writer FROM e5_meta WHERE id=1)!=1 BEGIN SELECT RAISE(ABORT,'BC_E5_GLOBAL_WRITER_REQUIRED'); END`);
 // Old 97f writers can otherwise issue a read-only current certificate without
 // touching guarded business tables. Fence the transaction entry itself.
 add('e5_global_transaction_entry',"BEFORE UPDATE OF writer ON e5_meta WHEN NEW.writer=1 AND (SELECT writer FROM e5_worker_meta WHERE id=1)!=1 BEGIN SELECT RAISE(ABORT,'BC_E5_GLOBAL_WRITER_REQUIRED'); END");
 return result;
}
export function migrateExecutionAuthority({db,transaction,fault=()=>{}}){
 transaction(()=>{
  const exists=t=>!!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(t),triggers=definitions();
  if(exists('e5_worker_meta')){
   const m=db.prepare('SELECT * FROM e5_worker_meta WHERE id=1').get();check(m?.version===1&&m.writer===0&&tables.every(exists),'BC_E5_GLOBAL_SCHEMA');
   const normalize=s=>s.replace(/\s+/g,' ').trim();
   for(const sql of schema.split(';').map(s=>s.trim()).filter(Boolean)){
    const name=sql.match(/^CREATE TABLE (\w+)/)[1],actual=db.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name=?").get(name)?.sql;
    check(typeof actual==='string'&&normalize(actual)===normalize(sql),'BC_E5_GLOBAL_SCHEMA');
   }
   for(const [name,sql]of triggers)check(db.prepare("SELECT sql FROM sqlite_schema WHERE type='trigger' AND name=?").get(name)?.sql===sql,'BC_E5_GLOBAL_SCHEMA');
   return;
  }
  check(tables.every(t=>!exists(t)),'BC_E5_GLOBAL_SCHEMA');db.exec(schema);db.exec('INSERT INTO e5_worker_meta VALUES(1,1,0)');fault('e5-global-after-schema');
  for(const sql of triggers.values())db.exec(sql);fault('e5-global-after-guards');
 });
}
export function createFenceWitness(configuration=null){
 if(configuration===null)return Object.freeze({configured:false});
 exactKeys(configuration,['version','read'],'BC_E5_FENCE_WITNESS_CONFIGURATION');
 check(configuration.version==='clear-bootcamp-runtime-fence-reader.1'&&typeof configuration.read==='function','BC_E5_FENCE_WITNESS_CONFIGURATION');
 const read=configuration.read.bind(configuration),tickets=new WeakMap();
 return Object.freeze({configured:true,
  async read(query){const q=freeze(structuredClone(query)),value=structuredClone(await read(q));
   exactKeys(value,['version','runtimeId','runtimePinHash','scopeKey','highestFence'],'BC_E5_FENCE_WITNESS');
   check(value.version==='clear-bootcamp-runtime-fence-witness.1'&&value.runtimeId===q.runtimeId&&value.runtimePinHash===q.runtimePinHash&&value.scopeKey===q.scopeKey,'BC_E5_FENCE_WITNESS');
   check(Number.isSafeInteger(value.highestFence)&&value.highestFence>=0,'BC_E5_FENCE_WITNESS');
   const ticket=Object.freeze({});tickets.set(ticket,freeze(value));return ticket;},
  consume(ticket){check(tickets.has(ticket),'BC_E5_UNTRUSTED_FENCE_WITNESS');return tickets.get(ticket);},
 });
}
export function createRuntimeAuthority({db,runtimeId,runtimePinHash,e4Runtime=null,requireWitness=false,fault=()=>{}}){
 const incarnation='worker-'+randomUUID(),scopeKey=e4Hash(e4Runtime?{kind:'VAULT',chainId:e4Runtime.domain.chainId,vault:e4Runtime.domain.verifyingContract,instance:e4Runtime.domain.salt}:
  {kind:'METADATA_ONLY',runtimePinHash});
 const get=()=>db.prepare('SELECT * FROM e5_runtime_workers WHERE runtime_id=?').get(runtimeId)??null;
 const decode=r=>r?JSON.parse(r.record):null;
 const lastFence=()=>db.prepare('SELECT * FROM e5_worker_fences WHERE runtime_id=? ORDER BY fence DESC LIMIT 1').get(runtimeId);
 const lastSlot=()=>db.prepare('SELECT * FROM e5_worker_slots WHERE runtime_id=? ORDER BY revision DESC LIMIT 1').get(runtimeId);
 function stop(reason,time,evidence=null){
  const old=decode(db.prepare('SELECT record FROM e5_worker_stops WHERE runtime_id=?').get(runtimeId));
  if(!old){const record={version:'clear-bootcamp-global-authority-stop.1',runtimeId,reason,recordedAt:time,evidence,automaticCounterRepair:false};
   db.prepare('INSERT INTO e5_worker_stops VALUES(?,?)').run(runtimeId,canonical(record));
   db.prepare("UPDATE e5_runtimes SET status='RECOVERY_BLOCKED',revision=revision+1,record=? WHERE id=?").run(canonical(record),runtimeId);
  }
  return {status:'BLOCKED',reason:old?.reason??reason,automaticCounterRepair:false};
 }
 function audit(time){
  const old=decode(db.prepare('SELECT record FROM e5_worker_stops WHERE runtime_id=?').get(runtimeId));if(old)return old.reason;
  const row=get(),last=lastFence(),slot=lastSlot(),floor=db.prepare('SELECT MAX(fence) n FROM e5_worker_witnesses WHERE runtime_id=?').get(runtimeId).n??0;
  let reason=null;
  if(!row){if(last||slot||floor)reason='GLOBAL_AUTHORITY_ROW_MISSING';}
  else{
   const record=decode(last),count=db.prepare('SELECT COUNT(*) n FROM e5_worker_fences WHERE runtime_id=?').get(runtimeId).n;
   if(!Number.isSafeInteger(row.fence)||row.fence<1||row.fence!==last?.fence||count!==row.fence||row.fence<floor)reason='GLOBAL_COUNTER_REGRESSION_OR_CORRUPTION';
   else if(row.pin_hash!==runtimePinHash||row.scope_key!==scopeKey||!record||record.runtimePinHash!==runtimePinHash||record.scopeKey!==scopeKey||record.fence!==row.fence||last.lease_id!==record.leaseId
    ||['owner','incarnation','generation'].some(k=>row[k]!==record[k])||row.lease_id!==record.leaseId||row.expires_at<record.expiresAt)reason='GLOBAL_LEASE_BINDING_CORRUPTION';
   else if(!Number.isSafeInteger(row.slot_revision)||row.slot_revision!==(slot?.revision??0)||db.prepare('SELECT COUNT(*) n FROM e5_worker_slots WHERE runtime_id=?').get(runtimeId).n!==row.slot_revision)reason='GLOBAL_SLOT_COUNTER_CORRUPTION';
   else if(row.slot_id!==null){const s=decode(slot);if(!s||s.kind!=='BIND'||s.slotId!==row.slot_id||s.intentId!==row.intent_id||s.localFence!==row.local_fence||s.localRevision!==row.local_revision)reason='GLOBAL_SLOT_BINDING_CORRUPTION';}
   else if([row.intent_id,row.local_fence,row.local_revision].some(v=>v!==null)||slot&&decode(slot).kind!=='RELEASE')reason='GLOBAL_SLOT_BINDING_CORRUPTION';
  }
  if(reason)stop(reason,time);return reason;
 }
 function shape(h){exactKeys(h,['runtimeId','scopeKey','owner','incarnation','leaseId','workerFence','generation'],'BC_E5_GLOBAL_HANDLE');
  for(const k of ['runtimeId','owner','incarnation','leaseId'])id(h[k]);hash(h.scopeKey);revision(h.workerFence);revision(h.generation);return h;}
 function live(h,time,owner){shape(h);const row=get();
  check(row&&h.runtimeId===runtimeId&&h.scopeKey===scopeKey&&h.incarnation===incarnation&&row.incarnation===incarnation&&row.owner===owner&&h.owner===owner
   &&row.lease_id===h.leaseId&&row.fence===h.workerFence&&row.generation===h.generation&&row.expires_at>time,'BC_E5_GLOBAL_FENCED');return row;}
 const handle=row=>freeze({runtimeId,scopeKey,owner:row.owner,incarnation:row.incarnation,leaseId:row.lease_id,workerFence:row.fence,generation:row.generation});
 const checkSeconds=n=>check(Number.isSafeInteger(n)&&n>=1&&n<=60,'BC_E5_LEASE');
 return {incarnation,scopeKey,audit,live,
  acquire(time,authority,r,{owner,expectedFence=0,generation,leaseSeconds=30}){
   id(owner);revision(generation);checkSeconds(leaseSeconds);check(Number.isSafeInteger(expectedFence)&&expectedFence>=0,'BC_E5_FENCE');
   check(owner===authority.serviceId,'BC_E5_SERVICE_AUTHORITY');check(['UNOBSERVED','ACTIVE'].includes(r.status)&&r.generation===generation,'BC_E5_RUNTIME_SUSPENDED');
   const previous=get();check((previous?.fence??0)===expectedFence&&(!previous||previous.expires_at<=time),'BC_E5_GLOBAL_LEASE_BUSY');
   if(requireWitness){const witnessed=decode(db.prepare('SELECT record FROM e5_worker_witnesses WHERE runtime_id=? ORDER BY rowid DESC LIMIT 1').get(runtimeId));
    check(witnessed&&witnessed.incarnation===incarnation&&witnessed.apiFenceAtRead===(previous?.fence??0)&&witnessed.highestFence<=(previous?.fence??0)
     &&time>=witnessed.recordedAt&&time-witnessed.recordedAt<=5,'BC_E5_GLOBAL_FENCE_PREFLIGHT_REQUIRED');}
   check(!db.prepare('SELECT runtime_id FROM e5_runtime_workers WHERE runtime_id!=? AND (pin_hash=? OR scope_key=?)').get(runtimeId,runtimePinHash,scopeKey),'BC_E5_GLOBAL_SCOPE_CONFLICT');
   const fence=expectedFence+1;if(!Number.isSafeInteger(fence))return stop('GLOBAL_FENCE_EXHAUSTED',time);
   const record={version:'clear-bootcamp-runtime-worker-lease.1',runtimeId,runtimePinHash,scopeKey,fence,owner,incarnation,
    leaseId:'runtime-lease-'+randomUUID(),generation,acquiredAt:time,expiresAt:Math.min(time+leaseSeconds,authority.expiresAt)};
   db.prepare('INSERT INTO e5_worker_fences VALUES(?,?,?,?)').run(runtimeId,fence,record.leaseId,canonical(record));fault('e5-global-after-fence');
   db.prepare(`INSERT INTO e5_runtime_workers VALUES(?,?,?,?,?,?,?,?,?,0,NULL,NULL,NULL,NULL)
    ON CONFLICT(runtime_id) DO UPDATE SET fence=excluded.fence,owner=excluded.owner,incarnation=excluded.incarnation,lease_id=excluded.lease_id,generation=excluded.generation,expires_at=excluded.expires_at`)
    .run(runtimeId,runtimePinHash,scopeKey,fence,owner,incarnation,record.leaseId,generation,record.expiresAt);
   fault('e5-global-after-lease');return handle(get());
  },
  heartbeat(h,time,authority,seconds=30){checkSeconds(seconds);const row=live(h,time,authority.serviceId);
   db.prepare('UPDATE e5_runtime_workers SET expires_at=? WHERE runtime_id=?').run(Math.max(row.expires_at,Math.min(time+seconds,authority.expiresAt)),runtimeId);
   return handle(get());},
  bind(h,local,time,authority){const row=live(h,time,authority.serviceId);
   check(local.generation===row.generation,'BC_E5_GLOBAL_FENCED');
   check(!row.intent_id||row.intent_id===local.intentId,'BC_E5_GLOBAL_INTENT_BUSY');
   if(row.slot_id){const prior=decode(lastSlot());if(prior.globalFence===row.fence&&prior.localFence===local.workerFence&&prior.localRevision===local.leaseRevision)return freeze(prior);}
   const n=row.slot_revision+1;check(Number.isSafeInteger(n),'BC_E5_GLOBAL_SLOT_EXHAUSTED');
   const record={version:'clear-bootcamp-runtime-intent-slot.1',kind:'BIND',slotId:'runtime-slot-'+randomUUID(),runtimeId,scopeKey,globalFence:row.fence,
    revision:n,intentId:local.intentId,localFence:local.workerFence,localRevision:local.leaseRevision,recordedAt:time};
   db.prepare('INSERT INTO e5_worker_slots VALUES(?,?,?,?)').run(runtimeId,n,record.slotId,canonical(record));
   db.prepare('UPDATE e5_runtime_workers SET slot_revision=?,slot_id=?,intent_id=?,local_fence=?,local_revision=? WHERE runtime_id=?')
    .run(n,record.slotId,local.intentId,local.workerFence,local.leaseRevision,runtimeId);fault('e5-global-after-slot');return freeze(record);
  },
  slot(h,local,time,authority){const row=live(h,time,authority.serviceId),s=decode(lastSlot());
   check(s&&row.slot_id===s.slotId&&row.intent_id===local.intentId&&s.globalFence===row.fence&&row.local_fence===local.workerFence&&row.local_revision===local.leaseRevision,'BC_E5_GLOBAL_INTENT_FENCED');
   return {row,commitment:{...handle(row),slotId:s.slotId,slotRevision:s.revision,intentId:s.intentId,localFence:s.localFence,localRevision:s.localRevision}};
  },
  release(h,local,time,authority){this.slot(h,local,time,authority);
   check(!db.prepare("SELECT 1 FROM e5_events WHERE intent_id=? AND kind IN ('E4_SEAL_REQUESTED','E4_SEALED_REFERENCE')").get(local.intentId)
    &&!db.prepare('SELECT 1 FROM e5_envelopes WHERE intent_id=?').get(local.intentId),'BC_E5_GLOBAL_INTENT_UNRESOLVED');
   const row=get(),n=row.slot_revision+1;check(Number.isSafeInteger(n),'BC_E5_GLOBAL_SLOT_EXHAUSTED');
   const record={version:'clear-bootcamp-runtime-intent-slot.1',kind:'RELEASE',slotId:'runtime-release-'+randomUUID(),runtimeId,scopeKey,globalFence:row.fence,
    revision:n,intentId:local.intentId,releaseOf:row.slot_id,recordedAt:time};
   db.prepare('INSERT INTO e5_worker_slots VALUES(?,?,?,?)').run(runtimeId,n,record.slotId,canonical(record));
   db.prepare('UPDATE e5_runtime_workers SET slot_revision=?,slot_id=NULL,intent_id=NULL,local_fence=NULL,local_revision=NULL WHERE runtime_id=?').run(n,runtimeId);
   fault('e5-global-after-release');
   return freeze({released:true,workerFence:h.workerFence,transactionReplacement:false});
  },
  witnessQuery(){return {runtimeId,runtimePinHash,scopeKey};},
  witnessBasis(){const row=get();return e4Hash(row?{fence:row.fence,leaseId:row.lease_id,incarnation:row.incarnation,generation:row.generation}:null);},
  acceptWitness(value,time){const row=get(),floor=db.prepare('SELECT MAX(fence) n FROM e5_worker_witnesses WHERE runtime_id=?').get(runtimeId).n??0;
   const localFence=row?.fence??0,record={...value,apiFenceAtRead:localFence,incarnation,recordedAt:time};db.prepare('INSERT INTO e5_worker_witnesses VALUES(?,?,?,?)').run('fence-witness-'+randomUUID(),runtimeId,value.highestFence,canonical(record));
   if(value.highestFence>localFence)return stop('API_FENCE_BEHIND_E4',time,{apiFence:localFence,e4Fence:value.highestFence});
   if(value.highestFence<floor)return stop('E4_FENCE_WITNESS_REGRESSION',time,{prior:floor,e4Fence:value.highestFence});
   return freeze({status:'OBSERVED',highestFence:value.highestFence,workerFence:localFence,dispatchAuthorized:false});
  },
 };
}
