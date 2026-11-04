import {DatabaseSync} from 'node:sqlite';
import {lstatSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {canonical,exactKeys,freeze,requireRule as check} from '../policy/values.mjs';
import {id,epoch} from './model.mjs';

const ownedReaders=new WeakMap();
export const isMoodlePaymentSnapshots=(reader,authentication)=>ownedReaders.get(reader)===authentication;
export const MOODLE_PAYMENT_SNAPSHOT_VERSION='clear-moodle-payment-snapshot.1';
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
