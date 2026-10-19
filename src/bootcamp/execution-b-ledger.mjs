import {randomUUID} from 'node:crypto';
import {canonical,freeze,requireRule as check} from '../policy/values.mjs';

const tables=['e5b_meta','e5b_requests','e5b_bindings','e5b_events','e5b_completions','e5b_claim_jobs'];
const schema=`
CREATE TABLE e5b_meta(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL CHECK(version=1),writer INTEGER NOT NULL CHECK(writer IN(0,1)),scope TEXT NOT NULL) STRICT;
CREATE TABLE e5b_requests(intent_id TEXT PRIMARY KEY,attempt_id TEXT NOT NULL UNIQUE,record TEXT NOT NULL) STRICT;
CREATE TABLE e5b_bindings(id TEXT PRIMARY KEY,intent_id TEXT NOT NULL REFERENCES e5b_requests(intent_id),record TEXT NOT NULL) STRICT;
CREATE TABLE e5b_events(id TEXT PRIMARY KEY,intent_id TEXT NOT NULL REFERENCES e5b_requests(intent_id),kind TEXT NOT NULL,event_key TEXT NOT NULL UNIQUE,record TEXT NOT NULL) STRICT;
CREATE TABLE e5b_completions(intent_id TEXT PRIMARY KEY REFERENCES e5b_requests(intent_id),record TEXT NOT NULL) STRICT;
CREATE TABLE e5b_claim_jobs(id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES applications(id),allocation_id TEXT NOT NULL,accepted_digest TEXT NOT NULL,record TEXT NOT NULL,UNIQUE(application_id,allocation_id,accepted_digest)) STRICT;
`;
function triggers(){
 const result=new Map();
 for(const table of tables.slice(1)){
  for(const op of ['UPDATE','DELETE'])result.set(`${table}_no_${op.toLowerCase()}`,`BEFORE ${op} ON ${table} BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END`);
  result.set(`${table}_writer`,`BEFORE INSERT ON ${table} WHEN (SELECT writer FROM e5b_meta WHERE id=1)!=1 OR (SELECT writer FROM e5_meta WHERE id=1)!=1 BEGIN SELECT RAISE(ABORT,'BC_E5B_WRITER_REQUIRED'); END`);
 }
 result.set('e5b_transaction_entry',"BEFORE UPDATE OF writer ON e5_worker_meta WHEN NEW.writer=1 AND (SELECT writer FROM e5b_meta WHERE id=1)!=1 BEGIN SELECT RAISE(ABORT,'BC_E5B_WRITER_REQUIRED'); END");
 return new Map([...result].map(([name,body])=>[name,`CREATE TRIGGER ${name} ${body}`]));
}
export function migrateExecutionBridge({db,transaction,scope,fault=()=>{}}){
 transaction(()=>{
  const exists=name=>!!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(name),defs=triggers();
  if(exists('e5b_meta')){
   const m=db.prepare('SELECT * FROM e5b_meta WHERE id=1').get();check(m?.version===1&&m.writer===0&&m.scope===canonical(scope)&&tables.every(exists),'BC_E5B_SCHEMA_SCOPE');
   const normalize=s=>s.replace(/\s+/g,' ').trim();
   for(const sql of schema.split(';').map(s=>s.trim()).filter(Boolean)){
    const name=sql.match(/^CREATE TABLE (\w+)/)[1];check(normalize(db.prepare("SELECT sql FROM sqlite_schema WHERE name=? AND type='table'").get(name)?.sql??'')===normalize(sql),'BC_E5B_SCHEMA');
   }
   for(const [name,sql]of defs)check(db.prepare("SELECT sql FROM sqlite_schema WHERE name=? AND type='trigger'").get(name)?.sql===sql,'BC_E5B_SCHEMA');
   return;
  }
  check(tables.every(t=>!exists(t)),'BC_E5B_SCHEMA');
  // Explicit B scope is a new environment contract. Never rewrite old rows or
  // silently promote a 97f/4dec capability, counter or request into this scope.
  check(db.prepare('SELECT COUNT(*) n FROM e5_runtimes').get().n===0&&db.prepare('SELECT COUNT(*) n FROM e5_runtime_workers').get().n===0,'BC_E5B_LEGACY_RUNTIME_REFUSED');
  db.exec(schema);db.prepare('INSERT INTO e5b_meta VALUES(1,1,0,?)').run(canonical(scope));fault('e5b-after-schema');
  for(const sql of defs.values())db.exec(sql);fault('e5b-after-guards');
 });
}
export function executionBridgeLedger(db){
 const decode=row=>row?JSON.parse(row.record):null;
 const request=id=>decode(db.prepare('SELECT record FROM e5b_requests WHERE intent_id=?').get(id));
 const event=(id,kind)=>decode(db.prepare('SELECT record FROM e5b_events WHERE intent_id=? AND kind=? ORDER BY rowid DESC LIMIT 1').get(id,kind));
 const completion=id=>decode(db.prepare('SELECT record FROM e5b_completions WHERE intent_id=?').get(id));
 return {request,event,completion,
  bindings:id=>db.prepare('SELECT record FROM e5b_bindings WHERE intent_id=? ORDER BY rowid').all(id).map(decode),
  requestOnce(id,value){const prior=request(id);if(prior){check(canonical(prior)===canonical(value),'BC_E5B_REQUEST_CONFLICT');return freeze(prior);}
   db.prepare('INSERT INTO e5b_requests VALUES(?,?,?)').run(id,value.attemptId,canonical(value));return freeze(value);},
  bind(id,value){db.prepare('INSERT INTO e5b_bindings VALUES(?,?,?)').run('binding-'+randomUUID(),id,canonical(value));return freeze(value);},
  append(id,kind,key,value){const old=decode(db.prepare('SELECT record FROM e5b_events WHERE event_key=?').get(key));
   if(old){check(canonical(old)===canonical(value),'BC_E5B_EVENT_CONFLICT');return freeze(old);}
   db.prepare('INSERT INTO e5b_events VALUES(?,?,?,?,?)').run('bridge-event-'+randomUUID(),id,kind,key,canonical(value));return freeze(value);},
  complete(id,value){check(!completion(id),'BC_E5B_ALREADY_COMPLETED');db.prepare('INSERT INTO e5b_completions VALUES(?,?)').run(id,canonical(value));return freeze(value);},
  claimJob(id){return decode(db.prepare('SELECT record FROM e5b_claim_jobs WHERE id=?').get(id));},
  claims(applicationId){return db.prepare('SELECT record FROM e5b_claim_jobs WHERE application_id=? ORDER BY rowid').all(applicationId).map(decode);},
  createClaim(applicationId,right,value){
   const prior=decode(db.prepare('SELECT record FROM e5b_claim_jobs WHERE application_id=? AND allocation_id=? AND accepted_digest=?').get(applicationId,right.allocationId,right.authorizationDigest));
   if(prior){check(canonical(prior.right)===canonical(right),'BC_E5B_ACCEPTED_RIGHT_CONFLICT');return freeze(prior);}
   db.prepare('INSERT INTO e5b_claim_jobs VALUES(?,?,?,?,?)').run(value.jobId,applicationId,right.allocationId,right.authorizationDigest,canonical(value));return freeze(value);
  },
 };
}
