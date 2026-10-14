import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, chmodSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { openHistoryIntake } from '../../src/exam-evidence/intake.mjs';
import { hash } from '../../src/policy/values.mjs';

const start = 1791954000, owner = '0x' + '11'.repeat(20);
const binding = {applicationId:'app-one',participantRef:'person-one',recipientRef:'recipient-one',bindingRevision:1};
const policy = { policyVersion:'policy-one',consentVersion:'consent-one',baselineRequired:true,
  baselineWindow:'CALENDAR_TWO_YEARS_CANDIDATE',baselineLagSeconds:600,achievementFromSeconds:0,
  achievementUntilSeconds:3600,acceptanceMaxAgeSeconds:300,sessionSeconds:600,retentionSeconds:7200 };
const proof = { fabricated:'SYNTHETIC_SCORE_AND_PRIVATE_DATA', seq:1 };
const verified = async (p, s) => ({contextDigest:s.contextDigest,collectedAt:s.createdAt,
  proofVerified:true,wholeHistoryTableClaim:true,independentProcess:true,claimIdentifier:hash(p)});
function fixture(t, overrides = {}) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(),'clear-intake-'))); let current = start, store;
  const config = {directory,instanceId:'synthetic-intake',mode:'SYNTHETIC',verifierProfile:'synthetic-test.1',verifierConfigDigest:hash({synthetic:true}),verify:verified,clock:()=>current,...overrides};
  const open = () => store = openHistoryIntake(config);
  open(); t.after(() => {store.close();rmSync(directory,{recursive:true,force:true});});
  store.register({binding,policy});
  return {get store(){return store;},config,directory,open,advance:seconds=>current+=seconds,
    sql(fn){const db=new DatabaseSync(join(directory,'history-intake.sqlite'));try{return fn(db);}finally{db.close();}}};
}
test('fixed registration, purpose separation, same-input recovery and restart receipt', async t => {
  const f=fixture(t), s=f.store.openSession(binding.applicationId,'BASELINE_HISTORY',owner);
  const r=await f.store.accept(s.sessionId,proof); f.advance(601);
  assert.deepEqual(await f.store.accept(s.sessionId,proof),r);
  assert.equal(f.store.register({binding,policy}).registeredAt,start);
  f.store.close();f.open(); assert.deepEqual(f.store.receipt(s.sessionId),r);
  const a=f.store.openSession(binding.applicationId,'ACHIEVEMENT',owner);
  assert.notEqual(a.nonce,s.nonce);assert.notEqual(a.contextDigest,s.contextDigest);
  assert.equal(r.proofVerified,false); assert.equal(r.syntheticSignatureVerified,true);
  for(const flag of ['fullHistoryProven','accountIdentityBound','productEligible','paymentAllowed','baselineBelowThreshold','absenceEstablished']) assert.equal(r[flag],false);
  assert.equal(r.status,'UNKNOWN');
});
test('baseline only opens for required route; registration cannot be backdated or changed', t => {
  const f=fixture(t);const b={...binding,applicationId:'not-required'};
  f.store.register({binding:b,policy:{...policy,baselineRequired:false}});
  assert.throws(()=>f.store.openSession(b.applicationId,'BASELINE_HISTORY',owner),/NOT_REQUIRED/);
  assert.throws(()=>f.store.register({binding,policy:{...policy,consentVersion:'other'}}),/CONFLICT/);
  assert.throws(()=>f.store.register({binding:{...binding,registeredAt:1},policy}),/BINDING/);
  assert.throws(()=>f.store.openSession(binding.applicationId,'OTHER',owner),/PURPOSE/);
});
test('different proof conflicts; verified claim cannot be reused across purpose/app', async t => {
  const f=fixture(t),s=f.store.openSession(binding.applicationId,'BASELINE_HISTORY',owner);
  await f.store.accept(s.sessionId,proof);
  await assert.rejects(f.store.accept(s.sessionId,{...proof,seq:2}),/CONFLICT/);
  const a=f.store.openSession(binding.applicationId,'ACHIEVEMENT',owner);
  await assert.rejects(f.store.accept(a.sessionId,proof),/SOURCE_REUSE/);
});
test('concurrent same-proof calls return one receipt and one replay record', async t => {
  const f=fixture(t),s=f.store.openSession(binding.applicationId,'BASELINE_HISTORY',owner);
  const all=await Promise.all(Array.from({length:8},()=>f.store.accept(s.sessionId,proof)));
  all.forEach(r=>assert.deepEqual(r,all[0]));
  assert.equal(f.sql(db=>db.prepare('SELECT count(*) AS n FROM receipts').get().n),1);
  assert.equal(f.sql(db=>db.prepare('SELECT count(*) AS n FROM replays').get().n),1);
});
test('late verifier result cannot overwrite a new revision or cancelled session', async t => {
  let release;const f=fixture(t,{verify:(p,s)=>new Promise(resolve=>{release=()=>resolve(verified(p,s));})});
  for(const action of ['supersede','cancel']){
    const s=f.store.openSession(binding.applicationId,'BASELINE_HISTORY',owner),pending=f.store.accept(s.sessionId,proof);
    if(action==='supersede')f.store.openSession(binding.applicationId,'BASELINE_HISTORY',owner);else f.store.cancel(s.sessionId);
    release();await assert.rejects(pending,/SUPERSEDED|CLOSED/);
  }
});
test('expiration during verification and abort do not consume a nonce', async t => {
  let release;const f=fixture(t,{verify:(p,s)=>new Promise(resolve=>{release=()=>resolve(verified(p,s));})});
  const s=f.store.openSession(binding.applicationId,'BASELINE_HISTORY',owner),pending=f.store.accept(s.sessionId,proof);
  f.advance(600);release();await assert.rejects(pending,/EXPIRED/);
  assert.equal(f.store.receipt(s.sessionId),null);
  await assert.rejects(f.store.accept(s.sessionId,proof,{signal:AbortSignal.abort()}));
});
for(const [field,value] of [['contextDigest','0x'+'00'.repeat(32)],['collectedAt',start+1],['proofVerified',false],['independentProcess',false],['claimIdentifier','raw-private-id']])
  test(`rejects invalid verifier result ${field}`,async t=>{
    const f=fixture(t,{verify:async(p,s)=>({...await verified(p,s),[field]:value})}),s=f.store.openSession(binding.applicationId,'BASELINE_HISTORY',owner);
    await assert.rejects(f.store.accept(s.sessionId,proof));assert.equal(f.store.receipt(s.sessionId),null);
  });
test('transaction failure rolls back replay, receipt and session consumption',async t=>{
  const f=fixture(t),s=f.store.openSession(binding.applicationId,'BASELINE_HISTORY',owner);
  f.sql(db=>db.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT,'SYNTHETIC_FAULT'); END"));
  await assert.rejects(f.store.accept(s.sessionId,proof));
  assert.equal(f.store.session(s.sessionId).state,'OPEN');
  assert.equal(f.sql(db=>db.prepare('SELECT count(*) AS n FROM replays').get().n),0);
  f.sql(db=>db.exec('DROP TRIGGER fail_receipt'));await f.store.accept(s.sessionId,proof);
});
test('no raw claim persisted; deletion retains opaque replay/tombstone and prevents reopening',async t=>{
  const f=fixture(t),s=f.store.openSession(binding.applicationId,'BASELINE_HISTORY',owner);
  await f.store.accept(s.sessionId,proof);
  assert.ok(!readFileSync(join(f.directory,'history-intake.sqlite')).includes('SYNTHETIC_SCORE_AND_PRIVATE_DATA'));
  f.advance(policy.retentionSeconds);f.store.close();f.open();
  assert.throws(()=>f.store.receipt(s.sessionId),/MISSING/);
  assert.throws(()=>f.store.register({binding,policy}),/DELETED/);
  assert.equal(f.sql(db=>db.prepare('SELECT count(*) AS n FROM replays').get().n),1);
  assert.ok(!readFileSync(join(f.directory,'history-intake.sqlite')).includes(binding.participantRef));
});
test('missing tables, altered receipt pin and changed environment fail closed',async t=>{
  const f=fixture(t),s=f.store.openSession(binding.applicationId,'BASELINE_HISTORY',owner);await f.store.accept(s.sessionId,proof);
  f.sql(db=>db.prepare('UPDATE receipts SET pin=?').run('0'.repeat(64)));
  assert.throws(()=>f.store.receipt(s.sessionId),/INTEGRITY/);
  f.store.close();assert.throws(()=>openHistoryIntake({...f.config,mode:'LIVE_SOURCE'}),/ENVIRONMENT/);
  f.sql(db=>db.exec('DROP TABLE replays'));assert.throws(()=>f.open(),/SCHEMA_INCOMPLETE/);
});
test('permissive storage refuses opening',t=>{
  const f=fixture(t);f.store.close();chmodSync(f.directory,0o755);
  assert.throws(()=>f.open(),/STORAGE/);chmodSync(f.directory,0o700);
});
test('separate processes racing different evidence consume session once',async t=>{
  const f=fixture(t),s=f.store.openSession(binding.applicationId,'BASELINE_HISTORY',owner);
  const run=seq=>new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[fileURLToPath(new URL('./intake-worker.mjs',import.meta.url)),f.directory,s.sessionId,String(seq)],{stdio:['ignore','pipe','pipe']});
    let out='';child.stdout.on('data',b=>out+=b);child.on('error',reject);child.on('close',code=>code===0?resolve(out.trim()):reject(new Error('CHILD_FAILED')));
  });
  assert.deepEqual((await Promise.all([run(1),run(2)])).sort(),['ACCEPTED','CONFLICT']);
});

test('process killed during transaction rolls back on next open',async t=>{
  const f=fixture(t),s=f.store.openSession(binding.applicationId,'BASELINE_HISTORY',owner);
  f.store.close();
  await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[fileURLToPath(new URL('./intake-worker.mjs',import.meta.url)),f.directory,s.sessionId,'crash'],{stdio:'ignore'});
    child.on('error',reject);child.on('close',(code,signal)=>signal==='SIGKILL'?resolve():reject(new Error('CRASH_NOT_INJECTED')));
  });
  f.open();assert.equal(f.sql(db=>db.prepare('SELECT count(*) AS n FROM replays').get().n),0);
  await f.store.accept(s.sessionId,proof);
});
test('tampered registration/session metadata cannot change context or retention',t=>{
  const f=fixture(t),s=f.store.openSession(binding.applicationId,'BASELINE_HISTORY',owner);
  f.sql(db=>db.prepare('UPDATE sessions SET pin=?').run('broken'));
  assert.throws(()=>f.store.session(s.sessionId),/INTEGRITY/);
  f.sql(db=>db.prepare('UPDATE registrations SET pin=?').run('broken'));
  assert.throws(()=>f.store.purge(),/INTEGRITY/);
});
