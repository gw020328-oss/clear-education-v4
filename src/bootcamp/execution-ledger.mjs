import {canonical,requireRule as check} from '../policy/values.mjs';

export const EXECUTION_VERSION='clear-bootcamp-test-execution.1';
const immutable=['e5_intents','e5_receipts','e5_attempts','e5_events','e5_observations','e5_envelopes'];
const mutable=['e5_runtimes','e5_leases'];
const legacy=['applications','requests','evidence','evidence_heads','retired_guards','decisions','events','commands',
 'r2_decisions','r2_metrics','r2_attempts','r2_bridges','r2_actions','e3_procedures','e3_publications','e3_records','e3_ids','e3_prepared'];
const oldInsertGuard=new Set(['applications','requests','evidence','evidence_heads','decisions','events','commands',
 'r2_decisions','r2_metrics','r2_attempts','r2_bridges','r2_actions']);
const legacyImmutable=new Set(['evidence','decisions','events','commands','r2_decisions','r2_metrics','r2_attempts','r2_bridges','r2_actions',
 'e3_procedures','e3_publications','e3_records','e3_ids','e3_prepared']);
const schema=`
 CREATE TABLE e5_meta(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL CHECK(version=1),writer INTEGER NOT NULL CHECK(writer IN(0,1)),sequence INTEGER NOT NULL,clock_floor INTEGER NOT NULL) STRICT;
 INSERT INTO e5_meta VALUES(1,1,0,0,0);
 CREATE TABLE e5_intents(id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES applications(id),runtime_id TEXT NOT NULL,operation_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,record TEXT NOT NULL,sequence INTEGER NOT NULL UNIQUE,UNIQUE(runtime_id,operation_id)) STRICT;
 CREATE TABLE e5_receipts(id TEXT PRIMARY KEY,intent_id TEXT NOT NULL REFERENCES e5_intents(id),application_id TEXT NOT NULL,actor TEXT NOT NULL,
  command_key TEXT NOT NULL,request_hash TEXT NOT NULL,record TEXT NOT NULL,sequence INTEGER NOT NULL UNIQUE,UNIQUE(actor,application_id,command_key)) STRICT;
 CREATE TABLE e5_attempts(id TEXT PRIMARY KEY,intent_id TEXT NOT NULL UNIQUE REFERENCES e5_intents(id),record TEXT NOT NULL,sequence INTEGER NOT NULL UNIQUE) STRICT;
 CREATE TABLE e5_events(id TEXT PRIMARY KEY,intent_id TEXT REFERENCES e5_intents(id),runtime_id TEXT NOT NULL,kind TEXT NOT NULL,
  event_key TEXT NOT NULL UNIQUE,record TEXT NOT NULL,sequence INTEGER NOT NULL UNIQUE) STRICT;
 CREATE TABLE e5_observations(id TEXT PRIMARY KEY,runtime_id TEXT NOT NULL,application_id TEXT NOT NULL,generation INTEGER NOT NULL,
  observation_hash TEXT NOT NULL,record TEXT NOT NULL,sequence INTEGER NOT NULL UNIQUE,UNIQUE(runtime_id,application_id,generation,observation_hash)) STRICT;
 CREATE TABLE e5_envelopes(id TEXT PRIMARY KEY,intent_id TEXT NOT NULL UNIQUE REFERENCES e5_intents(id),attempt_id TEXT NOT NULL UNIQUE REFERENCES e5_attempts(id),
  record TEXT NOT NULL,sequence INTEGER NOT NULL UNIQUE) STRICT;
 CREATE TABLE e5_runtimes(id TEXT PRIMARY KEY,pin_hash TEXT NOT NULL,generation INTEGER NOT NULL CHECK(generation>=1),revision INTEGER NOT NULL,
  status TEXT NOT NULL,record TEXT NOT NULL) STRICT;
 CREATE TABLE e5_leases(intent_id TEXT PRIMARY KEY REFERENCES e5_intents(id),owner TEXT NOT NULL,fence INTEGER NOT NULL CHECK(fence>=1),
  generation INTEGER NOT NULL,expires_at INTEGER NOT NULL,revision INTEGER NOT NULL) STRICT;
`;
function triggerDefinitions(){
 const result=new Map(),add=(name,body)=>result.set(name,`CREATE TRIGGER ${name} ${body}`);
 for(const t of immutable)for(const op of ['UPDATE','DELETE'])add(t+'_no_'+op.toLowerCase(),`BEFORE ${op} ON ${t} BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END`);
 for(const t of [...immutable,...mutable])for(const op of (immutable.includes(t)?['INSERT']:['INSERT','UPDATE','DELETE']))
  add('e5_writer_'+t+'_'+op.toLowerCase(),`BEFORE ${op} ON ${t} WHEN (SELECT writer FROM e5_meta WHERE id=1)!=1 BEGIN SELECT RAISE(ABORT,'BC_E5_WRITER_REQUIRED'); END`);
 for(const t of legacy)for(const op of (legacyImmutable.has(t)?['INSERT']:['INSERT','UPDATE','DELETE'])){
  // A pre-E3 insert is already rejected by the frozen E3 guard. Preserve that
  // error/reader compatibility; a writer with E3 authority additionally needs E5.
  const earlier=op==='INSERT'&&oldInsertGuard.has(t)?' AND (SELECT writer FROM e3_meta WHERE id=1)=1':'';
  add('e5_legacy_'+t+'_'+op.toLowerCase(),`BEFORE ${op} ON ${t} WHEN (SELECT writer FROM e5_meta WHERE id=1)!=1${earlier} BEGIN SELECT RAISE(ABORT,'BC_E5_WRITER_REQUIRED'); END`);
 }
 return result;
}
export function migrateExecution({db,transaction,fault=()=>{}}){
 transaction(()=>{
  const exists=t=>!!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(t),definitions=triggerDefinitions();
  if(exists('e5_meta')){
   const m=db.prepare('SELECT * FROM e5_meta WHERE id=1').get();
   check(m?.version===1&&m.writer===0&&[...immutable,...mutable].every(exists),'BC_E5_SCHEMA');
   const normalized=sql=>sql.replace(/\s+/g,' ').trim();
   for(const sql of schema.split(';').map(s=>s.trim()).filter(s=>s.startsWith('CREATE TABLE '))){
    const name=sql.match(/^CREATE TABLE (\w+)/)[1],actual=db.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name=?").get(name)?.sql;
    check(typeof actual==='string'&&normalized(actual)===normalized(sql),'BC_E5_SCHEMA');
   }
   for(const [name,sql]of definitions)check(db.prepare("SELECT sql FROM sqlite_schema WHERE type='trigger' AND name=?").get(name)?.sql===sql,'BC_E5_SCHEMA');
   check(Number.isSafeInteger(m.sequence)&&m.sequence>=0&&Number.isSafeInteger(m.clock_floor)&&m.clock_floor>=0,'BC_E5_SCHEMA');return;
  }
  check([...immutable,...mutable].every(t=>!exists(t)),'BC_E5_SCHEMA');
  db.exec(schema);fault('e5-after-schema');
  for(const sql of definitions.values())db.exec(sql);
  fault('e5-after-guards');
 });
}
export function executionLedger(db){
 const decode=r=>r?JSON.parse(r.record):null;
 const next=()=>{db.prepare('UPDATE e5_meta SET sequence=sequence+1 WHERE id=1').run();return sequence();};
 const sequence=()=>db.prepare('SELECT sequence FROM e5_meta WHERE id=1').get().sequence;
 const rows=(table,where='',...args)=>db.prepare(`SELECT * FROM ${table} ${where} ORDER BY sequence`).all(...args);
 return {db,next,sequence,decode,
  clock(time){const floor=db.prepare('SELECT clock_floor FROM e5_meta WHERE id=1').get().clock_floor;check(time>=floor,'BC_E5_CLOCK_REVERSED');db.prepare('UPDATE e5_meta SET clock_floor=? WHERE id=1').run(time);return time;},
  intent:id=>decode(db.prepare('SELECT record FROM e5_intents WHERE id=?').get(id)),
  runtime:id=>{const r=db.prepare('SELECT * FROM e5_runtimes WHERE id=?').get(id);return r?{...r,record:decode(r)}:null;},
  attempts:id=>rows('e5_attempts','WHERE intent_id=?',id).map(decode),
  events:id=>rows('e5_events','WHERE intent_id=?',id).map(decode),
  observations:(runtime,application,generation)=>rows('e5_observations','WHERE runtime_id=? AND application_id=? AND generation=?',runtime,application,generation).map(decode),
  envelope:id=>decode(db.prepare('SELECT record FROM e5_envelopes WHERE intent_id=?').get(id)),
  lease:id=>db.prepare('SELECT * FROM e5_leases WHERE intent_id=?').get(id)??null,
  event(record){
   const prior=decode(db.prepare('SELECT record FROM e5_events WHERE event_key=?').get(record.eventKey));
   if(prior){check(canonical(prior)===canonical(record),'BC_E5_EVENT_CONFLICT');return prior;}
   db.prepare('INSERT INTO e5_events VALUES(?,?,?,?,?,?,?)').run(record.id,record.intentId,record.runtimeId,record.kind,record.eventKey,canonical(record),next());
   return record;
  },
 };
}
