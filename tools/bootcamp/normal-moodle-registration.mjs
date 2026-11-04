import {DatabaseSync} from 'node:sqlite';
import {openSync,closeSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {verifyMessage} from 'ethers';
import {canonical,exactKeys,freeze,requireRule as check} from '../../src/policy/values.mjs';
import {isMoodlePaymentSnapshots} from '../../src/bootcamp/moodle-payment-snapshot.mjs';

export const NORMAL_MOODLE_REGISTRATION='clear-normal-moodle-registration.1';
const capabilities=new WeakMap();
export function normalMoodleRegistrationAccess(owner){
 const access=capabilities.get(owner);check(access,'NORMAL_MOODLE_OWNER_REQUIRED');return access;
}
const hash=value=>createHash('sha256').update(canonical(value)).digest('hex');
const same=(a,b)=>canonical(a)===canonical(b);
const ref=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
const slug=value=>typeof value==='string'&&/^[a-z][a-z0-9.-]{0,63}$/.test(value);
const positive=value=>Number.isSafeInteger(value)&&value>0;
const hex=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const address=value=>typeof value==='string'&&/^0x[0-9a-f]{40}$/.test(value)&&value!=='0x'+'00'.repeat(20);
const roles=['PARTICIPANT','COURSE_OPERATOR'];
const signingMessage=p=>'CLEAR Moodle identity registration\nThis signature only '+(p.operation==='REGISTER'?'registers':'revokes')+' this Moodle/CLEAR identity link. It does not authorize payment, token transfer or recipient registration.\n'+canonical(p);
const targetKeys=['applicationId','participantId','courseOperatorRef','policyHash','runtimeMappingHash',
 'participantWallet','operatorWallet','recipient','token'];
const schema=`
CREATE TABLE metadata(id INTEGER PRIMARY KEY CHECK(id=1),version TEXT NOT NULL,run_id TEXT NOT NULL,floor INTEGER NOT NULL) STRICT;
CREATE TABLE requests(id TEXT PRIMARY KEY,slot TEXT NOT NULL,record TEXT NOT NULL,consumed INTEGER NOT NULL CHECK(consumed IN (0,1))) STRICT;
CREATE TABLE heads(slot TEXT PRIMARY KEY,revision INTEGER NOT NULL CHECK(revision>0),record TEXT NOT NULL) STRICT;
`;
const schemaShape=sql=>sql.replace(/\s+/g,'').replace(/;$/,'');
const schemas=schema.trim().split(';').filter(s=>s.trim()).map(s=>schemaShape(s));

// Owner-only constructor. create=true creates one NEW private registry; opening
// an absent, foreign or damaged registry never repairs/reinitializes authority.
// This is a separate normal-run identity store, not a B synthetic registration.
export function openNormalMoodleRegistration({databasePath,create=false,ownerRunId,scope,
 authentication,snapshots,getOwnerState,verifyMoodleAuthority,now=()=>Math.floor(Date.now()/1000),monotonic=()=>performance.now()}){
 check(ref(ownerRunId)&&[authentication?.authorizeWorkflow,authentication?.whoami,getOwnerState,verifyMoodleAuthority,now,monotonic].every(f=>typeof f==='function')
  &&isMoodlePaymentSnapshots(snapshots,authentication),'NORMAL_MOODLE_CONFIG');
 exactKeys(scope,['installationRef','installationGeneration','courseRef','subjectRef','actorRefs'],'NORMAL_MOODLE_SCOPE');
 exactKeys(scope.actorRefs,roles,'NORMAL_MOODLE_SCOPE');
 const pinned=freeze(structuredClone(scope));
 check(['installationRef','installationGeneration','courseRef','subjectRef'].every(k=>ref(pinned[k]))
  &&Object.values(pinned.actorRefs).every(ref)&&pinned.actorRefs.PARTICIPANT===pinned.subjectRef
  &&pinned.actorRefs.COURSE_OPERATOR!==pinned.subjectRef,'NORMAL_MOODLE_SCOPE');
 const path=resolve(databasePath),directory=dirname(path),uid=process.getuid();
 const privatePath=(p,directory=false)=>{const s=lstatSync(p);check(realpathSync(p)===p&&!s.isSymbolicLink()&&s.uid===uid
  &&(directory?s.isDirectory()&&(s.mode&0o777)===0o700:s.isFile()&&s.nlink===1&&(s.mode&0o777)===0o600),'NORMAL_MOODLE_PRIVATE_STORE');return s;};
 privatePath(directory,true);
 if(create){const fd=openSync(path,'wx',0o600);closeSync(fd);}
 const initial=privatePath(path),issuedChallenges=new Map();let db,readDb,closed=false,wallFloor=0;
 const file=()=>{check(!closed,'NORMAL_MOODLE_CLOSED');privatePath(directory,true);const s=privatePath(path);check(s.dev===initial.dev&&s.ino===initial.ino,'NORMAL_MOODLE_STORE_CHANGED');};
 const assertSchema=connection=>{
  const rows=connection.prepare("SELECT sql FROM sqlite_schema WHERE type IN ('table','trigger','view') ORDER BY name").all();
  check(rows.length===3&&rows.every(r=>schemas.includes(schemaShape(r.sql))),'NORMAL_MOODLE_SCHEMA');
  const meta=connection.prepare('SELECT * FROM metadata').all();
  check(meta.length===1&&meta[0].id===1&&meta[0].version===NORMAL_MOODLE_REGISTRATION&&meta[0].run_id===ownerRunId,'NORMAL_MOODLE_STORE_RUN');
  return meta[0];
 };
 try{
  db=new DatabaseSync(path,{allowExtension:false,timeout:100});db.exec('PRAGMA trusted_schema=OFF; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;');
  if(create){db.exec('BEGIN IMMEDIATE');try{db.exec(schema);db.prepare('INSERT INTO metadata VALUES(1,?,?,0)').run(NORMAL_MOODLE_REGISTRATION,ownerRunId);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}
  assertSchema(db);readDb=new DatabaseSync(path,{readOnly:true,allowExtension:false,timeout:100});readDb.exec('PRAGMA trusted_schema=OFF; PRAGMA query_only=ON;');
 }catch(e){readDb?.close();db?.close();throw e;}
 const time=()=>{file();const wall=now(),mono=monotonic(),meta=assertSchema(readDb);
  check(positive(wall)&&wall>=wallFloor&&wall>=meta.floor&&Number.isFinite(mono)&&mono>=0,'NORMAL_MOODLE_CLOCK');wallFloor=wall;return {wall,mono};};
 const target=(context,role,write=false)=>{
  const state=structuredClone(getOwnerState()),clock=time(),actor=authentication.authorizeWorkflow(context,write),session=authentication.whoami(context);
  check(roles.includes(role)&&state.runId===ownerRunId&&positive(state.expiresAtExclusive)&&clock.wall<state.expiresAtExclusive,'NORMAL_MOODLE_RUN');
  check(['applicationId','participantId','courseOperatorRef'].every(k=>slug(state[k]))
   &&['policyHash','runtimeMappingHash'].every(k=>/^0x[0-9a-f]{64}$/.test(state[k]))
   &&['participantWallet','operatorWallet','recipient','token'].every(k=>address(state[k]))
   &&state.participantWallet===state.recipient&&state.operatorWallet!==state.participantWallet,'NORMAL_MOODLE_TARGET');
  const wallet=role==='PARTICIPANT'?state.participantWallet:state.operatorWallet,clearRole=role==='PARTICIPANT'?'participant':'operator';
  check(actor.role===clearRole&&session.role===clearRole&&actor.wallet.toLowerCase()===wallet&&session.wallet.toLowerCase()===wallet
   &&positive(session.expiresAt)&&clock.wall<session.expiresAt,'NORMAL_MOODLE_ACTOR');
  const snapshot=snapshots.read(context,state.applicationId);
  check(snapshot.applicationActive===true&&['applicationId','participantId','courseOperatorRef','policyHash','runtimeMappingHash','participantWallet'].every(k=>snapshot[k]===state[k]),'NORMAL_MOODLE_APPLICATION');
  if(snapshot.publication)check(snapshot.publication.recipient===state.recipient&&snapshot.publication.token===state.token,'NORMAL_MOODLE_RECIPIENT');
  const identity={ownerRunId,...Object.fromEntries(targetKeys.map(k=>[k,state[k]])),installationRef:pinned.installationRef,
   installationGeneration:pinned.installationGeneration,courseRef:pinned.courseRef,subjectRef:pinned.subjectRef,actorRef:pinned.actorRefs[role],role,wallet};
  return {identity,snapshot,expiresAtExclusive:Math.min(state.expiresAtExclusive,session.expiresAt)};
 };
 const stableSnapshot=s=>{const {observedAt,...stable}=s;return stable;};
 const authenticateRequest=async(context,input,{signal,write=false}={})=>{
  exactKeys(context,['token','wallet','chainId','csrf'],'NORMAL_MOODLE_CONTEXT');context=freeze(structuredClone(context));
  exactKeys(input,['version','requestRef','ownerRunId','moodleAuthorityRef','role','expiresAtExclusive'],'NORMAL_MOODLE_REQUEST');
  const request=freeze(structuredClone(input)),start=time();let end=request.expiresAtExclusive;
  check(request.version==='clear-moodle-course-read-request.1'&&request.ownerRunId===ownerRunId&&hex(request.requestRef)&&hex(request.moodleAuthorityRef)
   &&roles.includes(request.role)&&positive(end)&&start.wall<end&&end<=start.wall+5,'NORMAL_MOODLE_REQUEST');
  const current=()=>{signal?.throwIfAborted();const t=time();check(t.wall<end&&t.mono>=start.mono&&t.mono-start.mono<5000,'NORMAL_MOODLE_LEASE_EXPIRED');return t;};
  const first=target(context,request.role,write);end=Math.min(end,first.expiresAtExclusive);
  const authority=async()=>{
   current();const v=structuredClone(await verifyMoodleAuthority(request,{signal}));current();
   exactKeys(v,['version','requestRef','ownerRunId','moodleAuthorityRef','role','status','installationRef','installationGeneration',
    'authorityEpoch','courseRef','subjectRef','actorRef','expiresAtExclusive'],'NORMAL_MOODLE_AUTHORITY');
   check(v.version==='clear-moodle-authority-check.1'&&v.status==='OK'
    &&['requestRef','ownerRunId','moodleAuthorityRef','role'].every(k=>v[k]===request[k])
    &&['installationRef','installationGeneration','courseRef','subjectRef','actorRef'].every(k=>v[k]===first.identity[k])
    &&positive(v.authorityEpoch)&&positive(v.expiresAtExclusive)&&v.expiresAtExclusive<=request.expiresAtExclusive&&now()<v.expiresAtExclusive,'NORMAL_MOODLE_AUTHORITY');
   end=Math.min(end,v.expiresAtExclusive);return v;
  };
  const initialAuthority=await authority();
  const assertCurrent=()=>{current();const last=target(context,request.role,write);
   check(same(last.identity,first.identity)&&same(stableSnapshot(last.snapshot),stableSnapshot(first.snapshot)),'NORMAL_MOODLE_TARGET_CHANGED');
   end=Math.min(end,last.expiresAtExclusive);current();return last;
  };
  assertCurrent();const finalAuthority=await authority();check(same(initialAuthority,finalAuthority),'NORMAL_MOODLE_AUTHORITY_CHANGED');assertCurrent();
  return {context,request,identity:first.identity,authority:finalAuthority,assertCurrent,current,expiry:()=>end};
 };
 const slotOf=identity=>identity.applicationId+':'+identity.role;
 const head=slot=>{file();assertSchema(readDb);const row=readDb.prepare('SELECT * FROM heads WHERE slot=?').get(slot);if(!row)return null;
  const record=JSON.parse(row.record);check(record.revision===row.revision&&slotOf(record.identity)===slot,'NORMAL_MOODLE_RECORD');return record;};
 const mutate=(frame,action)=>{
  file();db.exec('BEGIN IMMEDIATE');try{
   const meta=assertSchema(db);check(time().wall>=meta.floor,'NORMAL_MOODLE_CLOCK');frame.assertCurrent();
   const result=action();frame.assertCurrent();file();db.prepare('UPDATE metadata SET floor=? WHERE id=1').run(time().wall);db.exec('COMMIT');return result;
  }catch(e){db.exec('ROLLBACK');throw e;}
 };
 const publicRecord=r=>freeze({version:NORMAL_MOODLE_REGISTRATION,ownerRunId,applicationId:r.identity.applicationId,role:r.identity.role,
  registrationRef:r.registrationRef,registrationRevision:r.revision,status:r.status,expiresAtExclusive:r.expiresAtExclusive,paymentAuthority:false});
 const owner=Object.freeze({
  async prepare(context,request,{operation,expectedRevision},{signal}={}){
   check(['REGISTER','REVOKE'].includes(operation)&&Number.isSafeInteger(expectedRevision)&&expectedRevision>=0,'NORMAL_MOODLE_COMMAND');
   const frame=await authenticateRequest(context,request,{signal,write:true}),slot=slotOf(frame.identity),started=time();
   const result=mutate(frame,()=>{
    const previous=head(slot);check((previous?.revision??0)===expectedRevision,'NORMAL_MOODLE_REVISION');
    if(operation==='REVOKE')check(previous?.status==='ACTIVE'&&same(previous.identity,frame.identity),'NORMAL_MOODLE_REVOKE');
    check(db.prepare('SELECT count(*) AS n FROM requests').get().n<1024,'NORMAL_MOODLE_REQUEST_LIMIT');
    const id=randomBytes(32).toString('hex'),registrationRef=previous?.registrationRef??'normal-registration-'+randomBytes(16).toString('hex');
    const expiresAtExclusive=Math.min(started.wall+120,frame.assertCurrent().expiresAtExclusive);
    const proposal={version:'clear-normal-moodle-registration-challenge.1',challengeId:id,operation,registrationRef,expectedRevision,
     identity:frame.identity,issuedAt:started.wall,expiresAtExclusive,registrationExpiresAtExclusive:frame.assertCurrent().expiresAtExclusive,paymentAuthority:false};
    const message=signingMessage(proposal);
    const record={proposal,message,sessionHash:hash(frame.context)};
    db.prepare('INSERT INTO requests VALUES(?,?,?,0)').run(id,slot,canonical(record));
    return freeze({...proposal,message});
   });
   // Pending human challenges do not survive owner process replacement. The
   // persisted consumed bit/revision still prevents replay after reopening.
   issuedChallenges.set(result.challengeId,started);return result;
  },
  async consume(context,request,{challengeId,signature},{signal}={}){
   check(hex(challengeId)&&typeof signature==='string'&&/^0x[0-9a-fA-F]{130}$/.test(signature),'NORMAL_MOODLE_SIGNATURE');
   const frame=await authenticateRequest(context,request,{signal,write:true});
   return mutate(frame,()=>{
    const row=db.prepare('SELECT * FROM requests WHERE id=?').get(challengeId);check(row&&row.consumed===0,'NORMAL_MOODLE_CHALLENGE_USED');
    const {proposal:p,message,sessionHash}=JSON.parse(row.record),current=time(),issued=issuedChallenges.get(challengeId);
    check(issued&&current.mono>=issued.mono&&current.mono-issued.mono<120000,'NORMAL_MOODLE_CHALLENGE_EXPIRED');
    check(message===signingMessage(p),'NORMAL_MOODLE_CHALLENGE_CHANGED');
    check(p.challengeId===challengeId&&p.issuedAt<=current.wall&&current.wall<p.expiresAtExclusive&&p.expiresAtExclusive<=p.issuedAt+120
     &&sessionHash===hash(frame.context)&&row.slot===slotOf(frame.identity)&&same(p.identity,frame.identity),'NORMAL_MOODLE_CHALLENGE_CHANGED');
    check(verifyMessage(message,signature).toLowerCase()===frame.identity.wallet,'NORMAL_MOODLE_SIGNATURE');
    const previous=head(row.slot);check((previous?.revision??0)===p.expectedRevision,'NORMAL_MOODLE_REVISION');
    if(p.operation==='REVOKE')check(previous?.status==='ACTIVE'&&same(previous.identity,frame.identity),'NORMAL_MOODLE_REVOKE');
    check(['REGISTER','REVOKE'].includes(p.operation),'NORMAL_MOODLE_COMMAND');
    const record={registrationRef:p.registrationRef,revision:p.expectedRevision+1,identity:frame.identity,
     status:p.operation==='REGISTER'?'ACTIVE':'REVOKED',expiresAtExclusive:Math.min(p.registrationExpiresAtExclusive,frame.assertCurrent().expiresAtExclusive),approvedAt:current.wall};
    check(current.wall<record.expiresAtExclusive,'NORMAL_MOODLE_EXPIRED');
    db.prepare('UPDATE requests SET consumed=1 WHERE id=? AND consumed=0').run(challengeId);
    db.prepare('INSERT INTO heads VALUES(?,?,?) ON CONFLICT(slot) DO UPDATE SET revision=excluded.revision,record=excluded.record').run(row.slot,record.revision,canonical(record));
    return publicRecord(record);
   });
  },
  close(){if(!closed){closed=true;issuedChallenges.clear();readDb.close();db.close();}}
 });
 capabilities.set(owner,Object.freeze({authenticateRequest,head,slotOf,time,publicRecord}));return owner;
}
