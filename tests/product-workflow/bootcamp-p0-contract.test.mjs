import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bootcampP0Example} from '../../specs/bootcamp/p0-example.mjs';
import {P0_POLICY,CAPABILITIES,validateP0Policy,referenceP0Decision,validateP0Evidence,validateP0Consent,validateP0Objection,validateP0PayoutIntent} from '../../specs/bootcamp/p0-contract.mjs';
const decide=f=>referenceP0Decision({...f,evaluatedAt:f.time+2});
test('fixed AND policy uses explicit new capabilities, holder semantics and 100 TEST exact token units',()=>{
 validateP0Policy(P0_POLICY);assert.equal(BigInt(P0_POLICY.amount.amountAtoms),100n*10n**6n);
 const token=readFileSync(new URL('../../contracts/ClearTestToken.sol',import.meta.url),'utf8');assert.match(token,/decimals = 6;/);
 assert.deepEqual(P0_POLICY.criteria.map(c=>c.capability),CAPABILITIES);
 assert.equal(P0_POLICY.criteria[3].predicate.achievementAtRequired,false);assert.equal(P0_POLICY.criteria[3].predicate.proofTimeMayReplaceAchievementAt,false);
 for(const value of ['EXAM','BASELINE','DAILY'])assert.ok(!CAPABILITIES.includes(value));
 const mapping=JSON.parse(readFileSync(new URL('../../specs/bootcamp/p0-runtime-mapping.json',import.meta.url)));
 assert.equal(mapping.ready,false);for(const t of Object.values(mapping.targets))if(t.kind.startsWith('MOODLE'))assert.equal(t.actualIds,null);
});
test('all four conditions MET remains demo metadata with payout disabled',()=>{
 const f=bootcampP0Example();assert.equal(f.decision.conditionsStatus,'MET');assert.equal(f.decision.gates.paymentAllowed,false);assert.equal(f.decision.gates.independentClaim,'NO_GO');
 validateP0Consent(f.consent,f);validateP0Objection(f.objection,f.decision);validateP0PayoutIntent(f.payout,f);
});
for(const i of [0,1,2,3])test('one missing or failed criterion cannot pass AND: '+i,()=>{
 const f=bootcampP0Example();f.evidence=structuredClone(f.evidence);f.evidence[i].condition='NOT_MET';assert.equal(decide(f).conditionsStatus,'NOT_MET');
 f.evidence[i].condition='MISSING';assert.equal(decide(f).conditionsStatus,'NEEDS_SUPPLEMENT');
});
for(const field of ['participantBinding','requestBinding','integrity','freshness'])test('unverified proof/source '+field+' is UNKNOWN despite predicate MET',()=>{
 const f=bootcampP0Example();f.evidence=structuredClone(f.evidence);f.evidence[3].verification[field]='UNKNOWN';assert.equal(decide(f).conditionsStatus,'UNKNOWN');
});
test('source unavailable with successful AI content never becomes a verified decision',()=>{
 const f=bootcampP0Example();f.evidence=structuredClone(f.evidence);f.evidence[2].verification.sourceStatus='UNAVAILABLE';assert.equal(decide(f).conditionsStatus,'UNKNOWN');
});
test('other participant, capability coercion and duplicate latest revision fail closed',()=>{
 const f=bootcampP0Example(),e=structuredClone(f.evidence[0]);e.participantId='participant-other';assert.throws(()=>decide({...f,evidence:[e,...f.evidence.slice(1)]}),/BC_PARTICIPANT/);
 e.participantId=f.participantId;e.capability='EXAM';assert.throws(()=>validateP0Evidence(e),/BC_CAPABILITY/);
 assert.throws(()=>decide({...f,evidence:[...f.evidence,f.evidence[0]]}),/BC_REVISION_CONFLICT/);
});
test('correction appends new evidence/decision and invalidates old consent target',()=>{
 const f=bootcampP0Example(),corrected=structuredClone(f.evidence[0]);corrected.evidenceId='evidence-corrected';corrected.evidenceRevision=2;corrected.previousEvidenceId=f.evidence[0].evidenceId;corrected.condition='UNKNOWN';
 const d=referenceP0Decision({...f,evidence:[...f.evidence,corrected],evaluatedAt:f.time+4,decisionId:'decision-new',decisionRevision:2,previousDecisionId:f.decision.decisionId});
 assert.equal(d.conditionsStatus,'UNKNOWN');assert.equal(d.previousDecisionId,f.decision.decisionId);assert.throws(()=>validateP0Consent(f.consent,{...f,decision:d}),/BC_DECISION_TARGET/);
});
test('conditions met without full allocation cannot record valid consent or payout intent',()=>{
 const f=bootcampP0Example(),allocation={...f.allocation,status:'WAITING_FOR_FUNDS',amountAtoms:'40000000'};
 assert.throws(()=>validateP0Consent(f.consent,{...f,allocation}),/BC_ALLOCATION/);assert.throws(()=>validateP0PayoutIntent(f.payout,{...f,allocation}),/BC_ALLOCATION/);
});
test('time or agreement cannot turn UNKNOWN evidence into consent/payout authorization',()=>{
 const f=bootcampP0Example();f.evidence=structuredClone(f.evidence);f.evidence[3].verification.sourceStatus='UNKNOWN';const decision=decide(f);
 assert.equal(decision.conditionsStatus,'UNKNOWN');assert.throws(()=>validateP0Consent(f.consent,{...f,decision}),/BC_DECISION_TARGET/);
 assert.throws(()=>validateP0PayoutIntent(f.payout,{...f,decision}),/BC_DECISION_TARGET/);
});
test('received objection is not a valid objection and never extends the deadline by itself',()=>{
 const f=bootcampP0Example();assert.throws(()=>validateP0Objection({...f.objection,validityStatus:'VALIDATED_OBJECTIVE_ERROR'},f.decision),/BC_OBJECTION/);
 assert.throws(()=>validateP0Objection({...f.objection,deadlineExtensionAllowed:true},f.decision),/BC_OBJECTION/);
});
test('fresh receipt cannot hide an old signed proof, while unknown achievement time is allowed for holding',()=>{
 const f=bootcampP0Example();assert.equal(f.evidence[3].facts.achievementAt,null);assert.equal(decide(f).conditionsStatus,'MET');
 f.evidence=structuredClone(f.evidence);f.evidence[3].facts.accountProofIssuedAt=f.time-901;assert.equal(decide(f).conditionsStatus,'UNKNOWN');
});
test('certificate cannot be relabeled as locally verified Moodle evidence',()=>{
 const e=structuredClone(bootcampP0Example().evidence[3]);e.dataMode='LOCAL_LMS_RECORD';e.verification.sourceStatus='VERIFIED_LOCAL_API';assert.throws(()=>validateP0Evidence(e),/BC_SOURCE_CAPABILITY/);
});
test('payout and full allocation bind the exact decision and recipient',()=>{
 const f=bootcampP0Example();assert.throws(()=>validateP0PayoutIntent({...f.payout,recipientRef:'recipient-other'},f),/BC_DECISION_TARGET/);
 const allocation={...f.allocation,targetDecisionHash:'0x'+'0'.repeat(64)};assert.throws(()=>validateP0Consent(f.consent,{...f,allocation}),/BC_ALLOCATION/);
});
test('decision parties are explicit and cannot be replaced by a claimed actor role',()=>{
 const f=bootcampP0Example();assert.throws(()=>validateP0Consent({...f.consent,actorRef:'participant-other'},f),/BC_ACTOR/);
 validateP0Consent({...f.consent,actorRole:'COURSE_OPERATOR',actorRef:f.decision.courseOperatorRef},f);
 assert.throws(()=>validateP0Objection({...f.objection,actorRef:'operator-unrelated'},f.decision),/BC_ACTOR/);
});
