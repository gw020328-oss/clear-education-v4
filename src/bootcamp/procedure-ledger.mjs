import {randomBytes,randomUUID} from 'node:crypto';
import {canonical,requireRule as check} from '../policy/values.mjs';

const tables=['e3_procedures','e3_publications','e3_records','e3_ids','e3_prepared'];
const guarded=['applications','requests','evidence','evidence_heads','decisions','events','commands',
  'r2_decisions','r2_metrics','r2_attempts','r2_bridges','r2_actions'];
export function migrateProcedure({db,transaction,fault=()=>{}}){
 transaction(()=>{
  const exists=t=>!!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(t);
  if(exists('e3_meta')){
   const meta=db.prepare('SELECT * FROM e3_meta WHERE id=1').get();
   const trigger=t=>!!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='trigger' AND name=?").get(t);
   check(meta?.version===1&&meta.writer===0&&tables.every(exists)
    &&tables.every(t=>['update','delete'].every(op=>trigger(t+'_no_'+op)))
    &&guarded.every(t=>trigger('e3_insert_'+t)),'BC_E3_SCHEMA');return;
  }
  check(tables.every(t=>!exists(t)),'BC_E3_SCHEMA');
  db.exec(`CREATE TABLE e3_meta(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL,writer INTEGER NOT NULL CHECK(writer IN (0,1))) STRICT;
   INSERT INTO e3_meta VALUES(1,1,0);
   CREATE TABLE e3_procedures(id TEXT PRIMARY KEY,application_id TEXT NOT NULL UNIQUE REFERENCES applications(id),record TEXT NOT NULL) STRICT;
   CREATE TABLE e3_publications(id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES applications(id),decision_id TEXT NOT NULL REFERENCES decisions(id),
    record TEXT NOT NULL,sequence INTEGER NOT NULL UNIQUE,UNIQUE(application_id,decision_id)) STRICT;
   CREATE TABLE e3_records(id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES applications(id),kind TEXT NOT NULL,logical_key TEXT NOT NULL UNIQUE,
    actor_wallet TEXT,record TEXT NOT NULL,sequence INTEGER NOT NULL UNIQUE) STRICT;
   CREATE TABLE e3_ids(kind TEXT NOT NULL,logical_id TEXT NOT NULL,opaque_id TEXT NOT NULL UNIQUE,PRIMARY KEY(kind,logical_id)) STRICT;
   CREATE TABLE e3_prepared(id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES applications(id),nonce_key TEXT NOT NULL UNIQUE,
    record TEXT NOT NULL,sequence INTEGER NOT NULL UNIQUE) STRICT;`);
  fault('e3-after-schema');
  for(const t of tables)for(const op of ['UPDATE','DELETE'])db.exec(`CREATE TRIGGER ${t}_no_${op.toLowerCase()} BEFORE ${op} ON ${t} BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;`);
  for(const t of guarded)db.exec(`CREATE TRIGGER e3_insert_${t} BEFORE INSERT ON ${t} WHEN (SELECT writer FROM e3_meta WHERE id=1)!=1 BEGIN SELECT RAISE(ABORT,'BC_E3_WRITER_REQUIRED'); END;`);
  fault('e3-after-guards');
 });
}
export function procedureLedger(db,ledger){
 const decode=r=>r?JSON.parse(r.record):null;
 const getProcedure=a=>decode(db.prepare('SELECT record FROM e3_procedures WHERE application_id=?').get(a));
 const publications=a=>db.prepare('SELECT record FROM e3_publications WHERE application_id=? ORDER BY sequence').all(a).map(decode);
 const rows=(a,kind)=>db.prepare('SELECT * FROM e3_records WHERE application_id=? AND kind=? ORDER BY sequence').all(a,kind).map(r=>({...r,record:decode(r)}));
 const opaque=(kind,logicalId,create=false,expected=null)=>{
  check(expected===null||kind==='APPLICATION'&&/^0x[0-9a-f]{64}$/.test(expected)&&!/^0x0+$/.test(expected),'BC_E3_ID_BINDING');
  let row=db.prepare('SELECT opaque_id FROM e3_ids WHERE kind=? AND logical_id=?').get(kind,logicalId);
  if(!row&&create){row={opaque_id:expected??'0x'+randomBytes(32).toString('hex')};db.prepare('INSERT INTO e3_ids VALUES(?,?,?)').run(kind,logicalId,row.opaque_id);}
  check(row,'BC_E3_ID_NOT_REGISTERED');check(expected===null||row.opaque_id===expected,'BC_E3_ID_BINDING');return row.opaque_id;
 };
 return {getProcedure,publications,rows,opaque,
  create(a,record){db.prepare('INSERT INTO e3_procedures VALUES(?,?,?)').run(record.procedureId,a,canonical(record));ledger.next();},
  publish(a,record){db.prepare('INSERT INTO e3_publications VALUES(?,?,?,?,?)').run(record.publicationId,a,record.decisionId,canonical(record),ledger.next());},
  record(a,kind,logicalKey,record,wallet=null){
   const prior=db.prepare('SELECT record FROM e3_records WHERE logical_key=?').get(logicalKey);if(prior)return decode(prior);
   db.prepare('INSERT INTO e3_records VALUES(?,?,?,?,?,?,?)').run(record.id,a,kind,logicalKey,wallet,canonical(record),ledger.next());return record;
  },
  prepare(a,nonceKey,record){
   const prior=decode(db.prepare('SELECT record FROM e3_prepared WHERE nonce_key=?').get(nonceKey));
   if(prior){check(canonical(prior.payload)===canonical(record.payload),'BC_E3_PREPARED_NONCE_CONFLICT');return prior;}
   db.prepare('INSERT INTO e3_prepared VALUES(?,?,?,?,?)').run(record.preparationId,a,nonceKey,canonical(record),ledger.next());return record;
  },
  prepared(a,id){return decode(db.prepare('SELECT record FROM e3_prepared WHERE application_id=? AND id=?').get(a,id));},
 };
}
export const procedureId=prefix=>prefix+'-'+randomUUID();
