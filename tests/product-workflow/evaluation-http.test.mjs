import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {RuleError} from '../../src/policy/values.mjs';
import {evaluationHttpFixture,headersFor,appPath as path} from './evaluation-http-fixture.mjs';
async function ybmReady(f,app){for(const id of ['score-ready','review-ready','mock-ready'])assert.equal((await f.accept(app,id)).status,200);f.setEvaluationTime(f.configuration.compiled.policy.deadlines.evidenceUntil+1);assert.equal((await f.accept(app,'learning-ready')).status,200);assert.equal((await f.select(app)).status,200);}
test('YBM authenticated acceptance, M2 candidate, explicit finalization, immutable result and restart GET',async t=>{
 const f=await evaluationHttpFixture(t),app=await f.create();await ybmReady(f,app);
 const candidate=await f.evaluate(app);assert.equal(candidate.status,200,JSON.stringify(candidate.body));assert.equal(candidate.body.result.result.settlement,'CANDIDATE_SYNTHETIC');assert.equal(candidate.body.result.result.paymentAllowed,false);
 f.setEvaluationTime(f.configuration.compiled.policy.deadlines.supplementUntil);assert.equal((await f.finalize(app)).status,200);
 const final=await f.evaluate(app,'final');assert.equal(final.body.result.result.settlement,'FINAL_SYNTHETIC');assert.equal(final.body.result.result.entitlement.claimAuthority,false);assert.equal(final.body.result.result.entitlement.amountAtoms,'100000000');
 const snapshot=final.body.result.snapshot;assert.equal(snapshot.context.binding.applicationId,app);assert.equal(snapshot.evidence.length,4);assert.ok(snapshot.evidence.every(e=>e.binding.subjectRef===snapshot.context.binding.subjectRef&&e.sourceBinding.courseId===snapshot.context.binding.productId));
 await f.restart();assert.deepEqual((await f.request(path(app)+'/evaluation-operations/evaluations/final')).body,final.body);
 assert.equal((await f.request(path(app)+'/evaluations/'+candidate.body.result.decisionId)).body.current,false);
 assert.equal((await f.accept(app,'score-corrected')).body.code,'EVAL_FINALIZED');
});
test('unverified review observations remain UNKNOWN; explicit synthetic fixture supplementation supersedes results',async t=>{
 const f=await evaluationHttpFixture(t),app=await f.create();await f.accept(app,'score-ready');await f.accept(app,'review-unverified');await f.accept(app,'mock-ready');f.setEvaluationTime(f.configuration.compiled.policy.deadlines.evidenceUntil+1);await f.accept(app,'learning-ready');await f.select(app);
 const held=await f.evaluate(app);assert.equal(held.body.result.result.rules.find(r=>r.requirementId==='review').state,'UNKNOWN');assert.equal(held.body.result.result.settlement,'ON_HOLD');
 await f.accept(app,'review-ready','supplement');const old=(await f.request(path(app)+'/evaluations/'+held.body.result.decisionId)).body;assert.equal(old.current,false);assert.equal(old.result,null);assert.equal(old.historicalResult.settlement,'ON_HOLD');
 assert.equal((await f.evaluate(app,'reevaluate')).body.result.result.settlement,'CANDIDATE_SYNTHETIC');
});
test('same interface handles Siwon OR/history hold and 400 precheck while rejecting 500',async t=>{
 const f=await evaluationHttpFixture(t,{profile:'siwon'}),app=await f.create();for(const x of ['score-ready','review-ready','history-unverified'])await f.accept(app,x);
 f.setEvaluationTime(f.configuration.compiled.policy.deadlines.evidenceUntil+1);await f.accept(app,'learning-ready');await f.select(app,200);
 const held=await f.evaluate(app);assert.equal(held.body.result.result.tiers.find(x=>x.tier===100).state,'MET');assert.equal(held.body.result.result.tiers.find(x=>x.tier===200).state,'UNKNOWN');
 await f.accept(app,'history-ready','history-supplement');const ready=await f.evaluate(app,'ready');assert.equal(ready.body.result.result.tiers.find(x=>x.tier===200).state,'MET');assert.equal(ready.body.result.result.tiers.find(x=>x.tier===200).quote.state,'CALCULATED_SYNTHETIC');
 await f.select(app,400,'select-400');const precheck=await f.evaluate(app,'precheck');assert.equal(precheck.body.result.result.settlement,'PRECHECK_ONLY');assert.equal(precheck.body.result.result.entitlement,null);
 assert.equal((await f.select(app,500,'invalid-tier')).body.code,'EVAL_TIER');
});
test('all reads and writes preserve participant ownership and pre-body auth/CSRF',async t=>{
 const f=await evaluationHttpFixture(t),app=await f.create(),receipt=await f.accept(app,'score-ready'),decision=await f.evaluate(app);
 for(const suffix of ['/evaluation-preview','/evidence-receipts','/evidence-receipts/'+receipt.body.result.recordId,'/evaluations','/evaluations/'+decision.body.result.decisionId,'/evaluation-operations/'+receipt.body.operationId,'/evaluation-operations/evidence-receipts/score-ready']){
  assert.equal((await f.request(path(app)+suffix,{headers:headersFor(f.bobContext)})).status,404,suffix);assert.equal((await f.request(path(app)+suffix,{headers:headersFor(f.operatorContext)})).status,403,suffix);
 }
 assert.equal((await f.request(path(app)+'/evidence-receipts',{method:'POST',headers:{},body:{pad:'x'.repeat(70000)}})).status,401);
 assert.equal((await f.request(path(app)+'/evidence-receipts',{method:'POST',headers:{...headersFor(f.aliceContext),'x-csrf-token':''},body:{}})).status,403);
});
test('browser score/verified/context/C2 receipt and arbitrary fixture fields never become evidence',async t=>{
 const f=await evaluationHttpFixture(t),app=await f.create(),p=await f.preview(app),body={expectedWorkflowRevision:p.workflowRevision,expectedEvidenceRevision:0,fixtureId:'score-ready'};
 for(const extra of [{score:990},{verified:true},{PASS:true},{context:{}},{binding:{}},{evidence:{}},{documentRunId:'document-run-any'},{acceptedAt:1}])assert.equal((await f.post(path(app)+'/evidence-receipts',{...body,...extra},'bad')).body.code,'EVAL_INPUT');
 assert.equal((await f.post(path(app)+'/evidence-receipts',{...body,fixtureId:'real-proof'},'bad')).body.code,'EVAL_SYNTHETIC_ONLY');assert.equal((await f.request(path(app)+'/evidence-receipts')).body.length,0);
});
test('C1 ACK and exact selection display are mandatory; stale or real-consent fields fail',async t=>{
 const f=await evaluationHttpFixture(t),app=await f.create(f.aliceContext,false);assert.equal((await f.request(path(app)+'/evaluation-preview')).body.code,'EVAL_CONFIGURATION_REQUIRED');
 const c1=(await f.request(path(app)+'/agreement-preview')).body;await f.post(path(app)+'/agreement',{expectedRevision:c1.expectedRevision,previewHash:c1.previewHash,acknowledgement:'SYNTHETIC_ACK_ONLY'},'ack');
 const p=await f.preview(app),body={expectedWorkflowRevision:p.workflowRevision,selectionPreviewHash:p.selectionPreviewHash,tier:100,acknowledgement:'SYNTHETIC_SELECTION_ONLY'};
 assert.equal((await f.post(path(app)+'/evaluation-selection',{...body,selectionPreviewHash:c1.previewHash},'wrong')).body.code,'EVAL_DISPLAY_CHANGED');
 assert.equal((await f.post(path(app)+'/evaluation-selection',{...body,acknowledgement:'REAL_CONSENT'},'wrong')).body.code,'EVAL_DISPLAY_CHANGED');
 await f.accept(app,'score-ready');assert.equal((await f.post(path(app)+'/evaluation-selection',body,'stale')).body.code,'MVP_STALE');
});
test('first exam cannot be replaced, explicit same-exam correction preserves the first reference',async t=>{
 const f=await evaluationHttpFixture(t),app=await f.create();const first=await f.accept(app,'score-ready'),p=await f.preview(app);
 assert.equal((await f.accept(app,'score-other-exam')).body.code,'EVAL_FIRST_SCORE_LOCKED');const corrected=await f.accept(app,'score-corrected');assert.equal(corrected.status,200);
 assert.deepEqual(corrected.body.result.exam.submissionRef,p.firstScoreRef);assert.equal(corrected.body.result.evidence.revision,2);assert.equal(corrected.body.result.evidence.sourceRevision,'source-revision.2');
 assert.equal((await f.request(path(app)+'/evidence-receipts/'+first.body.result.recordId)).body.current,false);
 const result=await f.evaluate(app);assert.ok(!result.body.result.result.rules.some(r=>r.reason==='FIRST_SCORE_MISMATCH'));
});
test('concurrent CAS accepts one revision, replay and lost-response GET keep one target, changed body conflicts',async t=>{
 const f=await evaluationHttpFixture(t),app=await f.create(),p=await f.preview(app),body={expectedWorkflowRevision:p.workflowRevision,expectedEvidenceRevision:0,fixtureId:'score-ready'};
 const pair=await Promise.all(['one','two'].map(key=>f.post(path(app)+'/evidence-receipts',body,key)));assert.deepEqual(pair.map(r=>r.status).sort(),[200,409]);const winner=pair.findIndex(r=>r.status===200),key=['one','two'][winner];
 assert.deepEqual((await f.post(path(app)+'/evidence-receipts',body,key)).body,pair[winner].body);assert.deepEqual((await f.request(path(app)+'/evaluation-operations/evidence-receipts/'+key)).body,pair[winner].body);
 assert.equal((await f.post(path(app)+'/evidence-receipts',{...body,fixtureId:'score-corrected'},key)).body.code,'IDEMPOTENCY_CONFLICT');
 const a=await f.evaluate(app,'a'),b=await f.evaluate(app,'b');assert.equal(a.body.result.decisionId,b.body.result.decisionId);
});
test('atomic command failure rolls back evidence and head, allowing a clean same-key retry',async t=>{
 const f=await evaluationHttpFixture(t),app=await f.create(),p=await f.preview(app),db=new DatabaseSync(join(f.directory,'evaluation-http.sqlite'));
 db.exec("CREATE TRIGGER fail_command BEFORE INSERT ON commands BEGIN SELECT RAISE(ABORT,'SYNTHETIC_FAILURE');END;");
 assert.equal((await f.accept(app,'score-ready')).status,500);assert.equal((await f.preview(app)).workflowRevision,p.workflowRevision);assert.equal((await f.request(path(app)+'/evidence-receipts')).body.length,0);
 db.exec('DROP TRIGGER fail_command');db.close();assert.equal((await f.accept(app,'score-ready')).status,200);
});
test('finalization checks exact revisions and periods, initial late submission remains held',async t=>{
 const f=await evaluationHttpFixture(t),app=await f.create();await f.select(app);assert.equal((await f.finalize(app)).body.code,'EVAL_PERIOD');
 f.setEvaluationTime(f.configuration.compiled.policy.deadlines.evidenceUntil+1);for(const req of f.configuration.compiled.policy.requirements)await f.accept(app,req.requirementId+'-ready');
 const candidate=await f.evaluate(app);assert.equal(candidate.body.result.result.reason,'INITIAL_SUBMISSION_PERIOD');
 f.setEvaluationTime(f.configuration.compiled.policy.deadlines.supplementUntil);const p=await f.preview(app);
 assert.equal((await f.post(path(app)+'/evaluation-finalization',{expectedWorkflowRevision:p.workflowRevision,expectedFactsRevision:p.factsRevision-1,expectedSelectionRevision:p.selectionRevision,acknowledgement:'SYNTHETIC_FINALIZATION_ONLY'},'bad')).body.code,'MVP_STALE');
 assert.equal((await f.accept(app,'score-corrected')).body.code,'EVAL_PERIOD');assert.equal((await f.finalize(app)).status,200);assert.equal((await f.evaluate(app,'final')).body.result.result.entitlement,null);
});
test('policy removal invalidates receipt/result capability and cannot replay a current decision',async t=>{
 const f=await evaluationHttpFixture(t),app=await f.create();await f.accept(app,'score-ready');const decision=await f.evaluate(app);await f.restart([]);
 const old=(await f.request(path(app)+'/evaluations/'+decision.body.result.decisionId)).body;assert.equal(old.current,false);assert.equal(old.result,null);assert.equal(old.syntheticEvidenceAcceptanceReady,false);
 const recovered=await f.request(path(app)+'/evaluation-operations/evaluations/evaluate');assert.equal(recovered.body.current,false);assert.equal((await f.request(path(app)+'/evaluation-preview')).body.code,'EVAL_CONFIGURATION_REQUIRED');
});
test('clock reversal and logout reject reads/replay before stored future data can become current',async t=>{
 const f=await evaluationHttpFixture(t),app=await f.create();await f.accept(app,'score-ready');const decision=await f.evaluate(app);f.setEvaluationTime(f.evaluationTime-1);
 assert.equal((await f.request(path(app)+'/evaluations/'+decision.body.result.decisionId)).body.code,'MVP_CLOCK');assert.equal((await f.request(path(app)+'/evaluations',{headers:headersFor(f.bobContext)})).status,404);
 f.setEvaluationTime(f.evaluationTime+1);assert.equal((await f.post('/auth/logout',{},'logout')).status,200);assert.equal((await f.request(path(app)+'/evaluation-operations/evaluations/evaluate')).status,401);
});
test('receipt/decision/command records reject in-place mutation',async t=>{
 const f=await evaluationHttpFixture(t),app=await f.create();await f.accept(app,'score-ready');await f.evaluate(app);const db=new DatabaseSync(join(f.directory,'evaluation-http.sqlite'));
 for(const table of ['evidence','decisions','commands'])assert.throws(()=>db.prepare(`UPDATE ${table} SET id='changed'`).run(),/IMMUTABLE_EVALUATION_RECORD/);db.close();
});

test('explicit C1 policy change invalidates old facts and requires newly reviewed host configuration',async t=>{
 const {createStudentWorkflowService}=await import('../../src/product-workflow/student-http-service.mjs');
 const f=await evaluationHttpFixture(t),app=await f.create();await f.accept(app,'score-ready');const result=await f.evaluate(app),next=structuredClone(f.configuration.studentPolicies);next[0].revision=2;next[0].draft.policyVersion='evaluation-ybm.2';
 const update=createStudentWorkflowService({directory:join(f.directory,'../student'),authentication:f.service,instanceId:'evaluation-test',policies:next,now:()=>f.evaluationTime});update.close();
 let old=(await f.request(path(app)+'/evaluations/'+result.body.result.decisionId)).body;assert.equal(old.current,false);assert.equal(old.result,null);
 const p=(await f.request('/mvp/policies')).body.policies[0],a=(await f.request(path(app))).body;
 assert.equal((await f.post(path(app)+'/policy-selection',{expectedRevision:a.workflowRevision,policyHash:p.policyHash},'choose-new')).status,200);
 const shown=(await f.request(path(app)+'/agreement-preview')).body;await f.post(path(app)+'/agreement',{expectedRevision:shown.expectedRevision,previewHash:shown.previewHash,acknowledgement:'SYNTHETIC_ACK_ONLY'},'ack-new');
 assert.equal((await f.request(path(app)+'/evaluation-preview')).body.code,'EVAL_CONFIGURATION_REQUIRED');old=(await f.request(path(app)+'/evaluation-operations/evaluations/evaluate')).body;assert.equal(old.current,false);
});

test('evaluation result and latest pointer also roll back if its command cannot commit',async t=>{
 const f=await evaluationHttpFixture(t),app=await f.create();await f.accept(app,'score-ready');const db=new DatabaseSync(join(f.directory,'evaluation-http.sqlite'));
 db.exec("CREATE TRIGGER fail_decision_command BEFORE INSERT ON commands WHEN NEW.kind='evaluations' BEGIN SELECT RAISE(ABORT,'SYNTHETIC_FAILURE');END;");
 assert.equal((await f.evaluate(app)).status,500);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM decisions').get().n,0);assert.equal(db.prepare('SELECT latest FROM heads WHERE app=?').get(app).latest,null);
 db.exec('DROP TRIGGER fail_decision_command');db.close();const done=await f.evaluate(app);assert.equal(done.status,200);await f.restart();assert.equal((await f.request(path(app)+'/evaluations')).body.length,1);
});

test('a new explicit tier selection makes prior decision stale and Siwon 300 uses the same route',async t=>{
 const f=await evaluationHttpFixture(t,{profile:'siwon'}),app=await f.create();for(const x of ['score-ready','history-ready','review-ready'])await f.accept(app,x);f.setEvaluationTime(f.configuration.compiled.policy.deadlines.evidenceUntil+1);await f.accept(app,'learning-ready');await f.select(app,200);
 const first=await f.evaluate(app);await f.accept(app,'score-corrected');await f.select(app,300,'select-300');const next=await f.evaluate(app,'tier-300');assert.equal(next.body.result.result.tiers.find(t=>t.tier===300).state,'MET');assert.equal(next.body.result.result.selection.tier,300);assert.equal(next.body.result.result.settlement,'CANDIDATE_SYNTHETIC');
 assert.equal((await f.request(path(app)+'/evaluations/'+first.body.result.decisionId)).body.result,null);
});

test('same-key write replay reauthenticates inside the write transaction',async t=>{
 const f=await evaluationHttpFixture(t),app=await f.create();await f.preview(app);let calls=0;const original=f.service.authorizeWorkflow;
 f.service.authorizeWorkflow=(context,write)=>{calls++;if(write&&calls>=2)throw new RuleError('AUTH_REQUIRED');return original(context,write);};
 assert.equal((await f.post(path(app)+'/evidence-receipts',{expectedWorkflowRevision:1,expectedEvidenceRevision:0,fixtureId:'score-ready'},'blocked')).status,401);
 f.service.authorizeWorkflow=original;assert.equal((await f.request(path(app)+'/evidence-receipts')).body.length,0);
 const prior=await f.accept(app,'score-ready');const expected=prior.body.result.workflowRevision-1;calls=0;
 f.service.authorizeWorkflow=(context,write)=>{calls++;if(write&&calls>=2)throw new RuleError('AUTH_REQUIRED');return original(context,write);};
 assert.equal((await f.post(path(app)+'/evidence-receipts',{expectedWorkflowRevision:expected,expectedEvidenceRevision:0,fixtureId:'score-ready'},'score-ready')).status,401);f.service.authorizeWorkflow=original;
});

test('changed host fixture definitions cannot silently reopen or repin an existing environment',async t=>{
 const {createEvaluationWorkflowService}=await import('../../src/product-workflow/evaluation-http-service.mjs');
 const f=await evaluationHttpFixture(t),app=await f.create();const receipt=await f.accept(app,'score-ready'),changed={...f.configuration,fixtures:structuredClone(f.configuration.fixtures)};
 changed.fixtures[0].evidence.sourceRevision='changed-host-fixture';
 assert.throws(()=>createEvaluationWorkflowService({directory:f.directory,authentication:f.service,student:f.student,instanceId:'evaluation-test',configuration:changed,now:()=>f.evaluationTime}),/WORKFLOW_DB_ENVIRONMENT/);
 assert.deepEqual((await f.request(path(app)+'/evidence-receipts/'+receipt.body.result.recordId)).body,receipt.body.result);
});

test('a policy becoming unavailable cannot silently resurrect an old decision when re-enabled',async t=>{
 const f=await evaluationHttpFixture(t),app=await f.create();await f.accept(app,'score-ready');const result=await f.evaluate(app);
 await f.restart([]);assert.equal((await f.request(path(app)+'/evaluations/'+result.body.result.decisionId)).body.current,false);
 await f.restart(f.configuration.studentPolicies);const old=(await f.request(path(app)+'/evaluations/'+result.body.result.decisionId)).body;
 assert.equal(old.current,false);assert.equal(old.result,null);assert.equal(old.syntheticEvidenceAcceptanceReady,false);
});
