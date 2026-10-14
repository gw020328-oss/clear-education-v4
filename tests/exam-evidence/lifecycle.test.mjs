import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSyntheticExamLifecycle,lifecycleDigest} from '../../src/exam-evidence/lifecycle.mjs';
const fixture=JSON.parse(readFileSync(new URL('../../specs/m0/lifecycle.json',import.meta.url)));
const T=fixture.registeredAt,D=86400;
function setup(policyChanges={},bindingChanges={}) {
  let time=T;
  const policy={...structuredClone(fixture.policy),...policyChanges};
  const binding={...structuredClone(fixture.binding),...bindingChanges};
  const flow=createSyntheticExamLifecycle({policy,binding,clock:()=>time});
  return {flow,policy,binding,setTime:t=>{time=t;}};
}
function submission(session,changes={}) {
  const {createdAt,acceptUntil,...rest}=session;
  return {...rest,sourceTrustProfile:'synthetic-lifecycle-verifier.1',sourceDigest:lifecycleDigest({sessionId:session.sessionId}),
    collectedAt:createdAt,signatureVerifiedSynthetic:true,accountBoundSynthetic:true,coverage:'COMPLETE_SYNTHETIC',emptyMeaning:'UNKNOWN',
    rows:structuredClone(session.purpose==='BASELINE_HISTORY'?fixture.baselineRows:fixture.achievementRows),...changes};
}
const baselineSession = h => h.flow.openSession('BASELINE_HISTORY',{sessionId:'session-baseline',nonce:'nonce-baseline'});
const achievementSession = h => {h.setTime(T+91*D);return h.flow.openSession('ACHIEVEMENT',{sessionId:'session-achievement',nonce:'nonce-achievement'});};
const reject = (fn,code) => assert.throws(fn,e=>e.message===code);

test('registration fixes the server event/time and copies policy/binding',()=>{
 const h=setup();h.policy.baselineRequired=false;h.binding.participantRef='swapped';
 const reg=h.flow.registration();assert.equal(reg.registeredAt,T);assert.equal(reg.event,'SYNTHETIC_TERMS_ACCEPTED');
 reg.registeredAt=0;assert.equal(h.flow.registration().registeredAt,T);assert.equal(h.flow.registration().binding.participantRef,fixture.binding.participantRef);
 const session=baselineSession(h);assert.equal(session.period.from,T-730*D);assert.equal(session.period.until,T);
});
test('separate baseline/achievement receipts combine without product eligibility',()=>{
 const h=setup(),baseline=h.flow.accept(submission(baselineSession(h)));
 const achievement=h.flow.accept(submission(achievementSession(h)));
 const result=h.flow.evaluate({baseline,achievement});assert.equal(result.status,'MET_SYNTHETIC');
 assert.equal(result.productEligible,false);assert.equal(result.paymentAllowed,false);
 for(const r of [baseline,achievement]) {assert.equal(r.proofVerified,false);assert.equal(r.accountIdentityBound,false);assert.equal(r.fullHistoryProven,false);assert.equal('rows' in r,false);}
});
test('retained baseline stays valid after acquisition freshness and source rolling retention expire',()=>{
 const h=setup(),baseline=h.flow.accept(submission(baselineSession(h))),achievement=h.flow.accept(submission(achievementSession(h)));
 h.setTime(T+3*366*D);assert.equal(h.flow.evaluate({baseline,achievement}).status,'MET_SYNTHETIC');
});
test('stale first acquisition cannot masquerade as a retained receipt',()=>{
 const h=setup(),s=submission(baselineSession(h));h.setTime(T+301);reject(()=>h.flow.accept(s),'ACQUISITION_TIME');
});
test('registration cannot be retroactively supplied in a submission',()=>{
 const h=setup(),s=submission(baselineSession(h));s.registeredAt-=D;reject(()=>h.flow.accept(s),'BINDING_MISMATCH');
});
test('baseline collection grace is explicit and inclusive, later collection is rejected',()=>{
 const h=setup();h.setTime(T+600);const s=baselineSession(h);assert.equal(h.flow.accept(submission(s)).status,'MET_SYNTHETIC');
 const late=setup();late.setTime(T+601);reject(()=>baselineSession(late),'COLLECTION_WINDOW_CLOSED');
});
test('baseline accepting after grace fails even if collection was fresh',()=>{
 const h=setup(),s=submission(baselineSession(h));h.setTime(T+601);reject(()=>h.flow.accept(s),'ACQUISITION_TIME');
});
for(const key of ['from','until']) test(`registration coverage ${key} cannot shift with collection time`,()=>{
 const h=setup(),s=submission(baselineSession(h));s.period[key]+=1;reject(()=>h.flow.accept(s),'PERIOD_MISMATCH');
});
test('purpose swapping cannot turn baseline into achievement',()=>{
 const h=setup(),s=submission(baselineSession(h));s.purpose='ACHIEVEMENT';reject(()=>h.flow.accept(s),'PURPOSE_MISMATCH');
});
for(const [key,value] of Object.entries({applicationId:'other-app',policyVersion:'other-policy',participantRef:'other-participant',bindingRevision:2,recipientRef:'other-recipient',instanceId:'other-instance'})) test(`rejects foreign ${key}`,()=>{
 const h=setup(),s=submission(baselineSession(h));s.binding[key]=value;reject(()=>h.flow.accept(s),'BINDING_MISMATCH');
});
test('policy digest mismatch is rejected independently of its version label',()=>{
 const h=setup(),s=submission(baselineSession(h));s.policyDigest=lifecycleDigest({changed:true});reject(()=>h.flow.accept(s),'BINDING_MISMATCH');
});
test('session nonce/revision binding is exact',()=>{
 for(const key of ['nonce','revision']) {const h=setup(),s=submission(baselineSession(h));s[key]=key==='nonce'?'other-nonce':2;reject(()=>h.flow.accept(s),'SESSION_BINDING');}
});
test('session IDs, nonce and accepted sessions are single use within the synthetic registry',()=>{
 const h=setup(),session=baselineSession(h),s=submission(session);h.flow.accept(s);reject(()=>h.flow.accept(s),'SESSION_CONSUMED');
 reject(()=>h.flow.openSession('ACHIEVEMENT',{sessionId:'different-session',nonce:session.nonce}),'SESSION_REUSE');
 reject(()=>h.flow.openSession('ACHIEVEMENT',{sessionId:session.sessionId,nonce:'different-nonce'}),'SESSION_REUSE');
});
test('the same evidence source digest cannot be reused for achievement',()=>{
 const h=setup(),b=h.flow.accept(submission(baselineSession(h))),s=submission(achievementSession(h));s.sourceDigest=b.sourceDigest;
 reject(()=>h.flow.accept(s),'SOURCE_REUSE');
});
test('receipt tampering fails even after recomputing a client-side digest',()=>{
 const h=setup(),baseline=h.flow.accept(submission(baselineSession(h),{coverage:'UNKNOWN'}));
 baseline.status='MET_SYNTHETIC';baseline.reason='NONE';lifecycleDigest(baseline);
 reject(()=>h.flow.evaluate({baseline}),'RECEIPT_INTEGRITY');
});
test('an old result cannot override a new collection revision',()=>{
 const h=setup(),s=baselineSession(h),baseline=h.flow.accept(submission(s));
 h.flow.openSession('BASELINE_HISTORY',{sessionId:'replacement',nonce:'replacement-nonce'});
 reject(()=>h.flow.evaluate({baseline}),'RECEIPT_SUPERSEDED');reject(()=>h.flow.accept(submission(s)),'SESSION_SUPERSEDED');
 assert.equal(h.flow.evaluate().baselineStatus,'UNKNOWN');
});
test('receipt from a different application is rejected, including same synthetic scores',()=>{
 const h=setup(),baseline=h.flow.accept(submission(baselineSession(h))),other=setup({}, {applicationId:'other-app'});
 reject(()=>other.flow.evaluate({baseline}),'BINDING_MISMATCH');
});
test('baseline receipt passed as achievement cannot satisfy it',()=>{
 const h=setup(),baseline=h.flow.accept(submission(baselineSession(h)));reject(()=>h.flow.evaluate({achievement:baseline}),'PURPOSE_MISMATCH');
});
for(const [label,changes,reason] of [
 ['unverified signature',{signatureVerifiedSynthetic:false},'SOURCE_UNVERIFIED'],
 ['account not bound',{accountBoundSynthetic:false},'ACCOUNT_UNVERIFIED'],
 ['whole signed table with unconfirmed coverage',{coverage:'UNKNOWN'},'COVERAGE_UNKNOWN'],
 ['empty rolling query',{rows:[]},'EMPTY_UNCONFIRMED'],
 ['empty with incomplete coverage',{rows:[],emptyMeaning:'NO_RECORD_SYNTHETIC',coverage:'UNKNOWN'},'COVERAGE_UNKNOWN'],
 ['unknown publication time',{rows:[{...fixture.baselineRows[0],availableAt:null}]},'PUBLICATION_UNKNOWN'],
 ['unknown score',{rows:[{...fixture.baselineRows[0],score:null}]},'SCORE_UNKNOWN']
]) test(`${label} stays UNKNOWN`,()=>{
 const h=setup(),r=h.flow.accept(submission(baselineSession(h),changes));assert.equal(r.status,'UNKNOWN');assert.equal(r.reason,reason);
});
test('only explicit complete synthetic no-record assertion models no exams',()=>{
 const h=setup(),r=h.flow.accept(submission(baselineSession(h),{rows:[],emptyMeaning:'NO_RECORD_SYNTHETIC'}));
 assert.equal(r.status,'MET_SYNTHETIC');assert.equal(r.fullHistoryProven,false);
});
test('baseline missing does not get synthesized from later achievement or an expired source',()=>{
 const h=setup(),achievement=h.flow.accept(submission(achievementSession(h)));h.setTime(T+3*366*D);
 assert.equal(h.flow.evaluate({achievement}).reason,'BASELINE_MISSING');assert.equal(h.flow.evaluate({achievement}).status,'UNKNOWN');
});
test('YBM/attendance routes without history do not require a baseline',()=>{
 const h=setup({baselineRequired:false});reject(()=>baselineSession(h),'BASELINE_NOT_REQUIRED');
 const achievement=h.flow.accept(submission(achievementSession(h))),result=h.flow.evaluate({achievement});
 assert.equal(result.baselineStatus,'NOT_REQUIRED');assert.equal(result.status,'MET_SYNTHETIC');
});
test('a low old score cannot hide another high score in complete synthetic history',()=>{
 const h=setup(),r=h.flow.accept(submission(baselineSession(h),{rows:[...fixture.baselineRows,{...fixture.baselineRows[0],examRef:'other-exam',score:750}]}));
 assert.equal(r.status,'NOT_MET');
});
test('half-open baseline period excludes registration instant and includes lower bound',()=>{
 const h=setup(),s=baselineSession(h);const row={...fixture.baselineRows[0],examAt:T,availableAt:T};
 reject(()=>h.flow.accept(submission(s,{rows:[row]})),'EXAM_PERIOD');
 row.examAt=s.period.from;assert.equal(h.flow.accept(submission(s,{rows:[row]})).status,'MET_SYNTHETIC');
});
test('exam date, announcement date and acquisition time are distinct',()=>{
 const h=setup(),s=baselineSession(h);h.setTime(T+30);
 const r=h.flow.accept(submission(s,{collectedAt:T+30,rows:[{...fixture.baselineRows[0],availableAt:T+20}]}));
 assert.equal(r.reason,'PUBLICATION_AFTER_REGISTRATION');assert.equal(r.status,'UNKNOWN');
 const other=setup(),os=baselineSession(other);reject(()=>other.flow.accept(submission(os,{rows:[{...fixture.baselineRows[0],availableAt:T+1}]})),'PUBLICATION_TIME');
});
test('achievement must use an exam in the pinned course recognition window',()=>{
 const h=setup(),s=achievementSession(h);
 reject(()=>h.flow.accept(submission(s,{rows:fixture.baselineRows})),'EXAM_PERIOD');
 const r=h.flow.accept(submission(s,{rows:[{...fixture.achievementRows[0],score:749}]}));assert.equal(r.status,'NOT_MET');
});
test('achievement first accepted exam is fixed across correction revisions',()=>{
 const h=setup(),s=achievementSession(h);h.flow.accept(submission(s));
 const next=h.flow.openSession('ACHIEVEMENT',{sessionId:'achievement-corrected',nonce:'achievement-corrected-nonce'});
 reject(()=>h.flow.accept(submission(next,{rows:[{...fixture.achievementRows[0],examRef:'replacement-exam'}]})),'FIRST_ACHIEVEMENT_MISMATCH');
 assert.equal(h.flow.accept(submission(next)).status,'MET_SYNTHETIC');
});
test('multiple achievement exams cannot silently select the highest',()=>{
 const h=setup(),s=achievementSession(h);reject(()=>h.flow.accept(submission(s,{rows:[...fixture.achievementRows,{...fixture.achievementRows[0],examRef:'another-exam'}]})),'ACHIEVEMENT_SINGLE_EXAM');
});
test('LIVE mode, extra claims and unbounded/invalid timestamps fail schema validation',()=>{
 for(const edit of [s=>{s.mode='LIVE_SOURCE';},s=>{s.proofVerified=true;},s=>{s.collectedAt=NaN;},s=>{s.rows=Array(257).fill(fixture.baselineRows[0]);}]) {
  const h=setup(),s=submission(baselineSession(h));edit(s);reject(()=>h.flow.accept(s),'LIFECYCLE_SCHEMA');
 }
});
test('clock rollback cannot establish a retroactive registration collection',()=>{
 const h=setup();h.setTime(T-1);reject(()=>baselineSession(h),'CLOCK_ROLLBACK');
});
test('new registry cannot restore a receipt using only a client-supplied digest',()=>{
 const h=setup(),baseline=h.flow.accept(submission(baselineSession(h))),restarted=setup();
 reject(()=>restarted.flow.evaluate({baseline}),'RECEIPT_SUPERSEDED');
});
test('mutating returned session data does not rewrite the server-pinned period',()=>{
 const h=setup(),session=baselineSession(h);session.period.until+=1;
 reject(()=>h.flow.accept(submission(session)),'PERIOD_MISMATCH');
});
test('future exam cannot be accepted even when publication is unknown',()=>{
 const h=setup(),s=h.flow.openSession('ACHIEVEMENT',{sessionId:'early-achievement',nonce:'early-achievement-nonce'});
 reject(()=>h.flow.accept(submission(s,{rows:[{...fixture.achievementRows[0],availableAt:null}]})),'EXAM_TIME');
});
test('collection before its session or after the receiving clock is rejected',()=>{
 for(const delta of [-1,1]) {const h=setup(),s=submission(baselineSession(h),{collectedAt:T+delta});reject(()=>h.flow.accept(s),'ACQUISITION_TIME');}
});
test('a rolling window truncated by post-registration acquisition cannot replace baseline',()=>{
 const h=setup();h.setTime(T+60);const s=submission(baselineSession(h));s.period.from+=60;
 reject(()=>h.flow.accept(s),'PERIOD_MISMATCH');
});
test('announcement before the exam and duplicate baseline exams are invalid',()=>{
 const h=setup(),s=baselineSession(h);
 reject(()=>h.flow.accept(submission(s,{rows:[{...fixture.baselineRows[0],availableAt:fixture.baselineRows[0].examAt-1}]})),'PUBLICATION_TIME');
 reject(()=>h.flow.accept(submission(s,{rows:[fixture.baselineRows[0],fixture.baselineRows[0]]})),'DUPLICATE_EXAM');
});
test('achievement period upper bound stays exclusive even when collected later',()=>{
 const h=setup();h.setTime(T+101*D);
 const s=h.flow.openSession('ACHIEVEMENT',{sessionId:'late-achievement',nonce:'late-achievement-nonce'});
 reject(()=>h.flow.accept(submission(s,{rows:[{...fixture.achievementRows[0],examAt:T+100*D,availableAt:T+101*D}]})),'EXAM_PERIOD');
});
test('reusing the first exam reference cannot silently change its exam date',()=>{
 const h=setup(),s=achievementSession(h);h.flow.accept(submission(s));
 const next=h.flow.openSession('ACHIEVEMENT',{sessionId:'date-correction',nonce:'date-correction-nonce'});
 reject(()=>h.flow.accept(submission(next,{rows:[{...fixture.achievementRows[0],examAt:fixture.achievementRows[0].examAt-86400}]})),'FIRST_ACHIEVEMENT_MISMATCH');
});
