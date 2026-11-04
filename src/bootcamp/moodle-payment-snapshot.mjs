import {DatabaseSync} from 'node:sqlite';
import {lstatSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {canonical,exactKeys,freeze,requireRule as check} from '../policy/values.mjs';
import {id,epoch} from './model.mjs';

const ownedReaders=new WeakMap();
export const isMoodlePaymentSnapshots=(reader,authentication)=>ownedReaders.get(reader)===authentication;
export const MOODLE_PAYMENT_SNAPSHOT_VERSION='clear-moodle-payment-snapshot.1';
// This reader interprets the base store, R2 v2 and E3 v1 only. These are
// schema declarations, never executed as migrations. Compare inside each read
// transaction so an existing inode/unchanged top-level config cannot hide drift.
const supportedTables={
 metadata:'id INTEGER PRIMARY KEY CHECK(id=1),config TEXT NOT NULL',
 clock:'id INTEGER PRIMARY KEY CHECK(id=1),floor INTEGER NOT NULL',
 applications:'id TEXT PRIMARY KEY,participant_id TEXT NOT NULL,wallet TEXT NOT NULL,recipient_ref TEXT NOT NULL,course_operator_ref TEXT NOT NULL,policy_hash TEXT NOT NULL,mapping_hash TEXT NOT NULL,revision INTEGER NOT NULL,decision_id TEXT,status TEXT NOT NULL,created_at INTEGER NOT NULL,initial_received_at INTEGER',
 requests:'id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES applications(id),criterion_id TEXT NOT NULL,request_hash TEXT NOT NULL UNIQUE,nonce_hash TEXT NOT NULL UNIQUE,record TEXT NOT NULL,status TEXT NOT NULL',
 evidence:'id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES applications(id),criterion_id TEXT NOT NULL,revision INTEGER NOT NULL,request_hash TEXT NOT NULL UNIQUE,nonce_hash TEXT NOT NULL UNIQUE,bundle_hash TEXT NOT NULL UNIQUE,record TEXT NOT NULL,UNIQUE(application_id,criterion_id,revision)',
 evidence_heads:'application_id TEXT NOT NULL REFERENCES applications(id),criterion_id TEXT NOT NULL,evidence_id TEXT NOT NULL REFERENCES evidence(id),guard TEXT NOT NULL,valid_until INTEGER NOT NULL,valid INTEGER NOT NULL,reason TEXT,PRIMARY KEY(application_id,criterion_id)',
 events:'id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES applications(id),record TEXT NOT NULL',
 commands:'id TEXT PRIMARY KEY,wallet TEXT NOT NULL,route TEXT NOT NULL,key TEXT NOT NULL,body_hash TEXT NOT NULL,application_id TEXT NOT NULL REFERENCES applications(id),record TEXT NOT NULL,UNIQUE(wallet,route,key)',
 decisions:'id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES applications(id),revision INTEGER NOT NULL,record TEXT NOT NULL,UNIQUE(application_id,revision)',
 r2_meta:'id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL,sequence INTEGER NOT NULL,writer INTEGER NOT NULL CHECK(writer IN (0,1))',
 r2_decisions:'decision_id TEXT PRIMARY KEY REFERENCES decisions(id),sequence INTEGER NOT NULL UNIQUE',
 r2_metrics:'id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES applications(id),logical_key TEXT NOT NULL UNIQUE,record TEXT NOT NULL,clock_epoch TEXT NOT NULL,started_utc_ms INTEGER NOT NULL,ended_utc_ms INTEGER NOT NULL,sequence INTEGER NOT NULL UNIQUE',
 r2_attempts:'id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES applications(id),operation_id TEXT NOT NULL,record TEXT NOT NULL,sequence INTEGER NOT NULL UNIQUE',
 r2_bridges:'evidence_id TEXT PRIMARY KEY REFERENCES evidence(id),record TEXT NOT NULL,sequence INTEGER NOT NULL UNIQUE',
 r2_actions:'id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES applications(id),kind TEXT NOT NULL,logical_key TEXT NOT NULL UNIQUE,record TEXT NOT NULL,sequence INTEGER NOT NULL UNIQUE',
 e3_meta:'id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL,writer INTEGER NOT NULL CHECK(writer IN (0,1))',
 e3_procedures:'id TEXT PRIMARY KEY,application_id TEXT NOT NULL UNIQUE REFERENCES applications(id),record TEXT NOT NULL',
 e3_publications:'id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES applications(id),decision_id TEXT NOT NULL REFERENCES decisions(id),record TEXT NOT NULL,sequence INTEGER NOT NULL UNIQUE,UNIQUE(application_id,decision_id)',
 e3_records:'id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES applications(id),kind TEXT NOT NULL,logical_key TEXT NOT NULL UNIQUE,actor_wallet TEXT,record TEXT NOT NULL,sequence INTEGER NOT NULL UNIQUE',
 e3_ids:'kind TEXT NOT NULL,logical_id TEXT NOT NULL,opaque_id TEXT NOT NULL UNIQUE,PRIMARY KEY(kind,logical_id)',
 e3_prepared:'id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES applications(id),nonce_key TEXT NOT NULL UNIQUE,record TEXT NOT NULL,sequence INTEGER NOT NULL UNIQUE',
};
const r2Immutable=['r2_decisions','r2_metrics','r2_attempts','r2_bridges','r2_actions'];
const e3Immutable=['e3_procedures','e3_publications','e3_records','e3_ids','e3_prepared'];
const baseGuarded=['applications','requests','evidence','evidence_heads','decisions','events','commands'];
// Whitespace outside quoted literals is immaterial; quoted guard messages are exact.
const sqlShape=sql=>typeof sql==='string'?sql.replace(/'[^']*'|\s+/g,v=>v.startsWith("'")?v:'').replace(/;$/,''):null;
function assertSupportedSchema(db){
 const fail='MOODLE_PAYMENT_SCHEMA';
 const objects=new Map(db.prepare("SELECT name,type,tbl_name,sql FROM sqlite_schema WHERE type IN ('table','trigger')").all().map(r=>[r.name,r]));
 for(const [table,columns]of Object.entries(supportedTables)){
  const r=objects.get(table);check(r?.type==='table'&&r.tbl_name===table
   &&sqlShape(r.sql)===sqlShape(`CREATE TABLE ${table}(${columns}) STRICT`),fail);
 }
 for(const [table,version]of [['r2_meta',2],['e3_meta',1]]){
  const rows=db.prepare(`SELECT * FROM ${table}`).all();
  check(rows.length===1&&rows[0].id===1&&rows[0].version===version&&rows[0].writer===0,fail);
 }
 const guard=(name,table,sql)=>{const r=objects.get(name);check(r?.type==='trigger'&&r.tbl_name===table&&sqlShape(r.sql)===sqlShape(sql),fail);};
 for(const table of ['evidence','decisions','events','commands',...r2Immutable,...e3Immutable])for(const op of ['UPDATE','DELETE']){
  const name=table+'_no_'+op.toLowerCase();guard(name,table,`CREATE TRIGGER ${name} BEFORE ${op} ON ${table} BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END`);
 }
 for(const [prefix,tables]of [['r2',baseGuarded],['e3',[...baseGuarded,...r2Immutable]]])for(const table of tables){
  const name=prefix+'_insert_'+table;
  guard(name,table,`CREATE TRIGGER ${name} BEFORE INSERT ON ${table} WHEN (SELECT writer FROM ${prefix}_meta WHERE id=1)!=1 BEGIN SELECT RAISE(ABORT,'BC_${prefix.toUpperCase()}_WRITER_REQUIRED'); END`);
 }
}
// Owner-only read connection. Never calls store access/tick/refresh, procedure
// ports, source producers or review presence. Opening cannot create/migrate a DB.
export function openMoodlePaymentSnapshots({databasePath,authentication,resolveOperatorBindings,now}){
 check(typeof databasePath==='string'&&[authentication?.whoami,resolveOperatorBindings,now].every(v=>typeof v==='function'),'MOODLE_PAYMENT_SNAPSHOT_CONFIG');
 const path=resolve(databasePath),initialFile=lstatSync(path);
 check(initialFile.isFile()&&!initialFile.isSymbolicLink()&&initialFile.nlink===1&&realpathSync(path)===path
  &&initialFile.uid===process.getuid()&&(initialFile.mode&0o777)===0o600,'MOODLE_PAYMENT_DATABASE');
 const db=new DatabaseSync(path,{readOnly:true,allowExtension:false,timeout:5000});
 let closed=false,metadata;
 const row=(sql,...args)=>db.prepare(sql).get(...args),decode=r=>r?JSON.parse(r.record):null;
 try{db.exec('PRAGMA trusted_schema=OFF; PRAGMA query_only=ON;');metadata=row('SELECT config FROM metadata WHERE id=1')?.config;
  const config=JSON.parse(metadata);
  check(config.schemaVersion===1&&config.name==='bootcamp.sqlite'&&config.environment.version==='clear-bootcamp-store.1','MOODLE_PAYMENT_DATABASE');
 }catch(e){db.close();throw e;}
 const actor=context=>{const s=authentication.whoami(context);check(['participant','operator'].includes(s.role)&&/^0x[0-9a-fA-F]{40}$/.test(s.wallet),'FORBIDDEN');return {role:s.role,wallet:s.wallet.toLowerCase(),expiresAt:s.expiresAt};};
 const operatorBindings=()=>{const values=resolveOperatorBindings();check(Array.isArray(values),'MOODLE_PAYMENT_OPERATOR_SCOPE');return values.map(v=>{exactKeys(v,['wallet','courseOperatorRef'],'MOODLE_PAYMENT_OPERATOR_SCOPE');check(/^0x[0-9a-fA-F]{40}$/.test(v.wallet),'MOODLE_PAYMENT_OPERATOR_SCOPE');id(v.courseOperatorRef);return {...v,wallet:v.wallet.toLowerCase()};});};
 const allowed=(s,a,bindings)=>check(s.role==='participant'?s.wallet===a.wallet:bindings.some(b=>b.wallet===s.wallet&&b.courseOperatorRef===a.course_operator_ref),'FORBIDDEN');
 const reader=Object.freeze({read(context,applicationId){
  check(!closed,'MOODLE_PAYMENT_SNAPSHOT_CLOSED');id(applicationId);
  const stat=lstatSync(path);check(stat.dev===initialFile.dev&&stat.ino===initialFile.ino&&!stat.isSymbolicLink(),'MOODLE_PAYMENT_DATABASE_CHANGED');
  const bindings=operatorBindings(),first=actor(context);db.exec('BEGIN');
  try{
   assertSupportedSchema(db);
   check(row('SELECT config FROM metadata WHERE id=1')?.config===metadata,'MOODLE_PAYMENT_DATABASE_CHANGED');
   const a=row('SELECT * FROM applications WHERE id=?',applicationId);check(a,'BC_NOT_FOUND');allowed(first,a,bindings);
   const time=epoch(now());check(time>=row('SELECT floor FROM clock WHERE id=1').floor,'BC_CLOCK_REVERSED');
   const dr=row('SELECT * FROM decisions WHERE id=? AND application_id=?',a.decision_id,a.id),d=decode(dr);
   check(d&&d.decisionId===dr.id&&d.applicationId===a.id&&d.decisionRevision===dr.revision&&d.policyHash===a.policy_hash,'BC_DECISION_TARGET');
   const p=decode(row('SELECT record FROM e3_procedures WHERE application_id=?',a.id));
   const pub=decode(row('SELECT record FROM e3_publications WHERE application_id=? ORDER BY sequence DESC LIMIT 1',a.id));
   const publicationCurrent=!!pub&&pub.procedureId===p?.procedureId&&pub.decisionId===d.decisionId
    &&pub.decisionRevision===d.decisionRevision&&pub.decisionHash===d.decisionHash;
   const rows=db.prepare("SELECT actor_wallet,record,sequence FROM e3_records WHERE application_id=? AND kind='CONSENT' ORDER BY sequence").all(a.id);
   const currentBindings=operatorBindings(),last=new Map();
   for(const r of rows){const c=decode(r);if(publicationCurrent&&c.procedureId===p.procedureId&&c.scopeHash===pub.consentScopeHash&&c.decisionId===d.decisionId)last.set(c.actorRole,{wallet:r.actor_wallet,record:c});}
   const recordedConsent={participant:'NOT_RECORDED',operator:'NOT_RECORDED'};
   for(const [role,key]of [['PARTICIPANT','participant'],['COURSE_OPERATOR','operator']]){
    const c=last.get(role);if(!c)continue;
    const currentActor=role==='PARTICIPANT'?c.wallet===a.wallet:currentBindings.some(b=>b.wallet===c.wallet&&b.courseOperatorRef===a.course_operator_ref);
    if(!currentActor){recordedConsent[key]='ACTOR_NO_LONGER_AUTHORIZED';continue;}
    check(['AGREE','WITHDRAW'].includes(c.record.value),'MOODLE_PAYMENT_CONSENT');recordedConsent[key]=c.record.value==='AGREE'?'RECORDED_AGREE':'RECORDED_WITHDRAW';
   }
   const value={version:MOODLE_PAYMENT_SNAPSHOT_VERSION,applicationId:a.id,participantId:a.participant_id,participantWallet:a.wallet,
    courseOperatorRef:a.course_operator_ref,policyHash:a.policy_hash,runtimeMappingHash:a.mapping_hash,
    applicationRevision:a.revision,applicationActive:a.status==='ACTIVE',ledgerSequence:row('SELECT sequence FROM r2_meta WHERE id=1').sequence,
    role:first.role==='operator'?'OPERATOR':'PARTICIPANT',decisionId:d.decisionId,decisionRevision:d.decisionRevision,decisionHash:d.decisionHash,
    recordedConditionsStatus:d.conditionsStatus,sourceCurrentness:'NOT_RECHECKED',observedAt:time,
    publication:pub?{current:publicationCurrent,decisionId:pub.decisionId,decisionRevision:pub.decisionRevision,decisionHash:pub.decisionHash,
     procedureId:pub.procedureId,scopeHash:pub.consentScopeHash,recipient:pub.recipient,token:pub.token,amountAtoms:pub.amountAtoms}:null,
    recordedConsent,clearSessionExpiresAtExclusive:first.expiresAt};
   const finalTime=epoch(now());check(finalTime>=time,'BC_CLOCK_REVERSED');check(finalTime===time,'BC_VIEW_STALE');
   const finalBindings=operatorBindings(),final=actor(context);
   check(canonical(finalBindings)===canonical(currentBindings)&&canonical(first)===canonical(final),'BC_COMMIT_AUTHORITY');allowed(final,a,finalBindings);
   const finalFile=lstatSync(path);check(finalFile.dev===initialFile.dev&&finalFile.ino===initialFile.ino&&!finalFile.isSymbolicLink(),'MOODLE_PAYMENT_DATABASE_CHANGED');
   db.exec('COMMIT');return freeze(value);
  }catch(e){db.exec('ROLLBACK');throw e;}
 },close(){if(!closed){closed=true;db.close();}}});
 ownedReaders.set(reader,authentication);return reader;
}
