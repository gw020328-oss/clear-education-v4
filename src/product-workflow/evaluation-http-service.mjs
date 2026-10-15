// C3: synchronous public-fixture acceptance + pure M2 evaluation in one private DB.
import {randomUUID} from 'node:crypto';
import {canonical,exactKeys,freeze,requireRule as check} from '../policy/values.mjs';
import {digest,validateContract} from '../policy/mvp/contract.mjs';
import {requireMvpPolicy,quoteMvpAmount} from '../policy/mvp/compiler.mjs';
import {evaluateMvpEligibility,validateEvaluationResult,EVALUATOR_VERSION} from '../eligibility/mvp/evaluator.mjs';
import {GATES,identifier,revision,hash32} from './contract.mjs';
import {openPrivateDb} from './private-db.mjs';
export const EVALUATION_HTTP_VERSION='clear-mvp-evidence-http.1';
const gates={...GATES,version:EVALUATION_HTTP_VERSION,dataMode:'SYNTHETIC',identityVerified:false,policyPublished:false,
 timeMode:'PUBLIC_SYNTHETIC_SCENARIO',realDataAllowed:false,evidenceAcceptanceReady:false,syntheticEvidenceAcceptanceReady:true,fundingStatus:'UNKNOWN',claimAuthority:false};
const tables=['heads','evidence','selections','finalizations','decisions','commands'];
const schema=`
CREATE TABLE IF NOT EXISTS heads(app TEXT PRIMARY KEY,epoch TEXT NOT NULL,revision INTEGER NOT NULL,facts INTEGER NOT NULL,selection_revision INTEGER NOT NULL,selection TEXT,finalization TEXT,first_score TEXT,initial_at INTEGER,latest TEXT,updated INTEGER NOT NULL,invalidated INTEGER NOT NULL DEFAULT 0 CHECK(invalidated IN(0,1))) STRICT;
CREATE TABLE IF NOT EXISTS evidence(id TEXT PRIMARY KEY,app TEXT NOT NULL,actor TEXT NOT NULL,epoch TEXT NOT NULL,requirement TEXT NOT NULL,revision INTEGER NOT NULL,workflow_revision INTEGER NOT NULL,created INTEGER NOT NULL,record TEXT NOT NULL,UNIQUE(app,requirement,revision)) STRICT;
CREATE TABLE IF NOT EXISTS selections(id TEXT PRIMARY KEY,app TEXT NOT NULL,actor TEXT NOT NULL,epoch TEXT NOT NULL,workflow_revision INTEGER NOT NULL,created INTEGER NOT NULL,record TEXT NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS finalizations(id TEXT PRIMARY KEY,app TEXT NOT NULL,actor TEXT NOT NULL,epoch TEXT NOT NULL,workflow_revision INTEGER NOT NULL,created INTEGER NOT NULL,record TEXT NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS decisions(id TEXT PRIMARY KEY,app TEXT NOT NULL,actor TEXT NOT NULL,epoch TEXT NOT NULL,workflow_revision INTEGER NOT NULL,created INTEGER NOT NULL,record TEXT NOT NULL,UNIQUE(app,epoch,workflow_revision)) STRICT;
CREATE TABLE IF NOT EXISTS commands(id TEXT PRIMARY KEY,app TEXT NOT NULL,actor TEXT NOT NULL,kind TEXT NOT NULL,key TEXT NOT NULL,request_hash TEXT NOT NULL,target TEXT NOT NULL,created INTEGER NOT NULL,UNIQUE(app,actor,kind,key)) STRICT;
${tables.filter(t=>t!=='heads').map(t=>`CREATE TRIGGER IF NOT EXISTS immutable_evaluation_${t} BEFORE UPDATE ON ${t} BEGIN SELECT RAISE(ABORT,'IMMUTABLE_EVALUATION_RECORD');END;`).join('\n')}
`;
const id=kind=>kind+'-'+randomUUID();
export function createEvaluationWorkflowService({directory,authentication,student,instanceId,configuration,now=()=>Math.floor(Date.now()/1000)}){
 identifier(instanceId);check(authentication&&student&&configuration,'EVAL_CONFIGURATION_REQUIRED');
 const {compiled}=configuration,p=requireMvpPolicy(compiled),fixtures=structuredClone(configuration.fixtures);
 check(p.mode==='SYNTHETIC'&&fixtures.length>0&&fixtures.length<=32&&new Set(fixtures.map(f=>f.fixtureId)).size===fixtures.length,'EVAL_CONFIGURATION_REQUIRED');
 for(const f of fixtures){identifier(f.fixtureId);validateContract('Evidence',f.evidence);check(f.provenance==='PUBLIC_SYNTHETIC_ASSERTION'&&f.evidence.binding.policyHash===compiled.policyHash,'EVAL_CONFIGURATION_REQUIRED');}
 const store=openPrivateDb(directory,'evaluation-http.sqlite',{instanceId,origin:authentication.origin,mode:'SYNTHETIC_EVALUATION_HTTP',
  configHash:digest('CLEAR-EVALUATION-HOST.1',{policyHash:compiled.policyHash,fixtures})},schema,tables),{db,transaction}=store;
 let closed=false;
 const clock=()=>{const t=now();check(Number.isSafeInteger(t)&&t>=0&&t<=4102444800,'MVP_CLOCK');return t;};
 const actor=(c,write=false)=>{check(!closed,'MVP_CLOSED');const s=authentication.authorizeWorkflow(c,write);check(s.role==='participant','FORBIDDEN');return s;};
 const head=app=>db.prepare('SELECT * FROM heads WHERE app=?').get(app);
 function resolve(c,app,write=false){
  const s=actor(c,write),a=student.get(c,app),preview=student.preview(c,app),t=clock(),h=head(app);
  if(h)check(t>=h.updated,'MVP_CLOCK');
  const configured=a.state==='ACKNOWLEDGED_SYNTHETIC'&&a.policyCurrent&&a.acknowledgment?.current&&a.policyHash===compiled.policyHash;
  const epoch=configured?digest('CLEAR-EVALUATION-EPOCH.1',{binding:preview.binding,c1Revision:a.workflowRevision,ack:a.acknowledgment.acknowledgmentHash}):null;
  // Once observed invalid, a fixed development environment cannot revive old facts by re-enabling a policy.
  if(h&&!h.invalidated&&(!configured||h.epoch!==epoch)){db.prepare('UPDATE heads SET invalidated=1,revision=revision+1,facts=facts+1,selection_revision=selection_revision+1,latest=NULL,updated=? WHERE app=?').run(t,app);h.invalidated=1;h.revision++;h.facts++;h.selection_revision++;h.latest=null;h.updated=t;}
  return {s,a,preview,t,h,epoch,ready:!!configured&&!h?.invalidated};
 }
 function sync(v){check(v.ready,'EVAL_CONFIGURATION_REQUIRED');
  if(!v.h)db.prepare('INSERT INTO heads VALUES(?,?,1,1,1,NULL,NULL,NULL,NULL,NULL,?,0)').run(v.a.applicationId,v.epoch,v.t);
  return {...v,h:head(v.a.applicationId)};
 }
 const latestRevision=(app,requirement)=>db.prepare('SELECT MAX(revision) AS n FROM evidence WHERE app=? AND requirement=?').get(app,requirement).n??0;
 const currentEvidence=v=>db.prepare('SELECT * FROM evidence WHERE app=? AND epoch=? ORDER BY revision').all(v.a.applicationId,v.epoch)
  .filter((r,i,rows)=>!rows.slice(i+1).some(next=>next.requirement===r.requirement));
 const selection=h=>h.selection?JSON.parse(db.prepare('SELECT record FROM selections WHERE id=?').get(h.selection).record).selection
  :{tier:null,revision:h.selection_revision,acknowledged:false,rule:'OFFICIAL_OPEN'};
 function previewValue(v){const payload={applicationId:v.a.applicationId,policyHash:compiled.policyHash,policyRevision:v.a.policyRevision,binding:v.preview.binding,
  c1AcknowledgmentHash:v.a.acknowledgment.acknowledgmentHash,c1PreviewHash:v.preview.previewHash,c1DisplayHash:v.preview.displayHash,
  workflowRevision:v.h.revision,factsRevision:v.h.facts,selectionRevision:v.h.selection_revision,selection:selection(v.h),finalized:!!v.h.finalization,
  firstScoreRef:v.h.first_score?JSON.parse(v.h.first_score):null,initialSubmissionAt:v.h.initial_at,
  tiers:p.tiers.map(x=>({tier:x.tier,support:x.support,quote:quoteMvpAmount(compiled,x.tier)})),amount:p.amount,selectionRule:p.selection,deadlines:p.deadlines,
  requirements:p.requirements.map(r=>({requirementId:r.requirementId,kind:r.kind,expectedEvidenceRevision:latestRevision(v.a.applicationId,r.requirementId),
   fixtures:fixtures.filter(f=>f.evidence.requirementId===r.requirementId).map(f=>({fixtureId:f.fixtureId,provenance:f.provenance,sourceStatus:f.evidence.sourceStatus,authenticity:f.evidence.authenticity,semantics:f.evidence.semantics}))})),...gates};
  return freeze({...payload,scenarioTime:v.t,selectionPreviewHash:digest('CLEAR-EVALUATION-SELECTION-DISPLAY.1',payload)});
 }
 function load(table,c,app,target){identifier(target);const v=resolve(c,app),r=db.prepare(`SELECT * FROM ${table} WHERE id=? AND app=? AND actor=?`).get(target,app,v.s.wallet);
  check(r,'MVP_NOT_FOUND');check(v.t>=r.created,'MVP_CLOCK');return {v,r};
 }
 function recordView(table,r,v){check(v.t>=r.created,'MVP_CLOCK');const record=JSON.parse(r.record),sameEpoch=v.ready&&v.h?.epoch===v.epoch&&r.epoch===v.epoch;
  const current=!!sameEpoch&&(table==='evidence'?r.revision===latestRevision(r.app,r.requirement):table==='selections'?v.h.selection===r.id:table==='finalizations'?v.h.finalization===r.id:v.h.latest===r.id&&v.h.revision===r.workflow_revision);
  if(table==='decisions'){validateEvaluationResult(record.result);check(digest('CLEAR-EVALUATION-SNAPSHOT.1',record.snapshot)===record.snapshotHash&&digest('CLEAR-EVALUATION-RESULT.1',record.result)===record.resultHash,'EVAL_INTEGRITY');}
  return freeze({recordId:r.id,applicationId:r.app,workflowRevision:r.workflow_revision,current,reason:current?null:'STALE_CONTEXT',createdAt:r.created,
   ...(table==='decisions'?{decisionId:r.id,result:current?record.result:null,historicalResult:current?null:record.result,snapshot:record.snapshot,snapshotHash:record.snapshotHash,resultHash:record.resultHash}:record),
   ...gates,syntheticEvidenceAcceptanceReady:v.ready});
 }
 const tableFor=kind=>({'evidence-receipts':'evidence','evaluation-selection':'selections','evaluation-finalization':'finalizations',evaluations:'decisions'})[kind];
 function operationValue(row,c){const {v,r}=load(tableFor(row.kind),c,row.app,row.target);check(row.actor===v.s.wallet&&v.t>=row.created,'MVP_CLOCK');
  const result=recordView(tableFor(row.kind),r,v);return freeze({operationId:row.id,applicationId:row.app,kind:row.kind,state:'RECORDED',current:result.current,result,...gates,syntheticEvidenceAcceptanceReady:v.ready});
 }
 function command(c,app,kind,key,body,fn){identifier(key);const requestHash=digest('CLEAR-EVALUATION-COMMAND.1',body);
  return transaction(()=>{const first=resolve(c,app,true),old=db.prepare('SELECT * FROM commands WHERE app=? AND actor=? AND kind=? AND key=?').get(app,first.s.wallet,kind,key);
   if(old){check(old.request_hash===requestHash,'IDEMPOTENCY_CONFLICT');return operationValue(old,c);}
   check(db.prepare('SELECT COUNT(*) AS n FROM commands').get().n<2000,'EVAL_LIMIT');const v=sync(first);check(v.h.revision===body.expectedWorkflowRevision,'MVP_STALE');
   const target=fn(v),operation=id('evaluation-op');db.prepare('INSERT INTO commands VALUES(?,?,?,?,?,?,?,?)').run(operation,app,v.s.wallet,kind,key,requestHash,target,v.t);
   return operationValue(db.prepare('SELECT * FROM commands WHERE id=?').get(operation),c);
  });
 }
 function insertRecord(table,recordId,v,record,workflowRevision){db.prepare(`INSERT INTO ${table} VALUES(?,?,?,?,?,?,?)`).run(recordId,v.a.applicationId,v.s.wallet,v.epoch,workflowRevision,v.t,canonical(record));}
 const mutable=v=>check(!v.h.finalization,'EVAL_FINALIZED');
 const withinEvidence=v=>check(v.t>=p.deadlines.evidenceFrom&&v.t<p.deadlines.supplementUntil,'EVAL_PERIOD');
 return {origin:authentication.origin,
  authorize(c,app,write=false){return resolve(c,app,write).s;},
  preview(c,app){return transaction(()=>previewValue(sync(resolve(c,app))));},
  accept(c,app,body,key){exactKeys(body,['expectedWorkflowRevision','expectedEvidenceRevision','fixtureId'],'EVAL_INPUT');revision(body.expectedWorkflowRevision);identifier(body.fixtureId);
   check(Number.isInteger(body.expectedEvidenceRevision)&&body.expectedEvidenceRevision>=0,'EVAL_INPUT');
   return command(c,app,'evidence-receipts',key,body,v=>{mutable(v);withinEvidence(v);const fixture=fixtures.find(f=>f.fixtureId===body.fixtureId);check(fixture,'EVAL_SYNTHETIC_ONLY');
    const req=fixture.evidence.requirementId,prior=latestRevision(app,req);check(prior===body.expectedEvidenceRevision,'MVP_STALE');
    check(db.prepare('SELECT COUNT(*) AS n FROM evidence').get().n<1000,'EVAL_LIMIT');
    const evidence=structuredClone(fixture.evidence),sourceAccount=digest('CLEAR-EVALUATION-SOURCE-ACCOUNT.1',{subject:v.preview.binding.subjectRef,policyHash:compiled.policyHash,requirement:req});
    Object.assign(evidence,{binding:v.preview.binding,evidenceId:'evidence-'+digest('CLEAR-EVALUATION-ID.1',{app,req}).slice(2,50),revision:prior+1,acceptedAt:v.t,
     sourceBinding:{institutionId:p.institutionId,providerInstanceId:'synthetic-'+configuration.profile,courseId:p.productId,sourceAccountRef:'account-'+sourceAccount.slice(2,34),accountBindingId:'binding-'+sourceAccount.slice(2,34),accountBindingVersion:'synthetic-binding.1'}});
    check(evidence.collectedAt<=v.t&&v.t-evidence.collectedAt<=p.requirements.find(r=>r.requirementId===req).maxAgeSeconds,'EVAL_ACQUISITION_TIME');validateContract('Evidence',evidence);
    const receipt=id('evidence-receipt');let first=v.h.first_score?JSON.parse(v.h.first_score):null,exam=null;
    if(fixture.exam){const commitment=fixture.exam.submissionRef.examCommitment;check(!first||first.examCommitment===commitment,'EVAL_FIRST_SCORE_LOCKED');
     first??={submissionId:receipt,revision:evidence.revision,examCommitment:commitment};exam={evidenceId:evidence.evidenceId,revision:evidence.revision,eventAt:fixture.exam.eventAt,submissionRef:first};}
    const record={receiptId:receipt,fixtureId:fixture.fixtureId,provenance:fixture.provenance,c1AcknowledgmentHash:v.a.acknowledgment.acknowledgmentHash,evidence,
     evidenceHash:digest('CLEAR-MVP-EVIDENCE',evidence),exam};
    db.prepare('INSERT INTO evidence VALUES(?,?,?,?,?,?,?,?,?)').run(receipt,app,v.s.wallet,v.epoch,req,evidence.revision,v.h.revision+1,v.t,canonical(record));
    db.prepare('UPDATE heads SET revision=revision+1,facts=facts+1,first_score=?,initial_at=COALESCE(initial_at,?),latest=NULL,updated=? WHERE app=?').run(first?canonical(first):null,v.t,v.t,app);return receipt;
   });},
  select(c,app,body,key){exactKeys(body,['expectedWorkflowRevision','selectionPreviewHash','tier','acknowledgement'],'EVAL_INPUT');revision(body.expectedWorkflowRevision);hash32(body.selectionPreviewHash);
   return command(c,app,'evaluation-selection',key,body,v=>{mutable(v);withinEvidence(v);check(body.acknowledgement==='SYNTHETIC_SELECTION_ONLY'&&previewValue(v).selectionPreviewHash===body.selectionPreviewHash,'EVAL_DISPLAY_CHANGED');
    check(p.tiers.some(t=>t.tier===body.tier),'EVAL_TIER');const recordId=id('selection'),n=v.h.selection_revision+1;
    insertRecord('selections',recordId,v,{selectionId:recordId,selectionPreviewHash:body.selectionPreviewHash,c1AcknowledgmentHash:v.a.acknowledgment.acknowledgmentHash,
     selection:{tier:body.tier,revision:n,acknowledged:true,rule:p.selection.syntheticRule}},v.h.revision+1);
    db.prepare('UPDATE heads SET revision=revision+1,selection_revision=?,selection=?,latest=NULL,updated=? WHERE app=?').run(n,recordId,v.t,app);return recordId;
   });},
  finalize(c,app,body,key){exactKeys(body,['expectedWorkflowRevision','expectedFactsRevision','expectedSelectionRevision','acknowledgement'],'EVAL_INPUT');revision(body.expectedWorkflowRevision);revision(body.expectedFactsRevision);revision(body.expectedSelectionRevision);
   return command(c,app,'evaluation-finalization',key,body,v=>{mutable(v);check(v.t>=p.deadlines.supplementUntil&&v.t<p.deadlines.finalizeUntil,'EVAL_PERIOD');
    check(v.h.facts===body.expectedFactsRevision&&v.h.selection_revision===body.expectedSelectionRevision&&v.h.selection&&body.acknowledgement==='SYNTHETIC_FINALIZATION_ONLY','MVP_STALE');
    const recordId=id('finalization');insertRecord('finalizations',recordId,v,{finalizationId:recordId,finalization:{state:'FINALIZED_SYNTHETIC',factsRevision:v.h.facts,selectionRevision:v.h.selection_revision,finalizedAt:v.t}},v.h.revision+1);
    db.prepare('UPDATE heads SET revision=revision+1,finalization=?,latest=NULL,updated=? WHERE app=?').run(recordId,v.t,app);return recordId;
   });},
  evaluate(c,app,body,key){exactKeys(body,['expectedWorkflowRevision'],'EVAL_INPUT');revision(body.expectedWorkflowRevision);
   return command(c,app,'evaluations',key,body,v=>{const old=db.prepare('SELECT id FROM decisions WHERE app=? AND epoch=? AND workflow_revision=?').get(app,v.epoch,v.h.revision);if(old)return old.id;
    check(db.prepare('SELECT COUNT(*) AS n FROM decisions').get().n<500,'EVAL_LIMIT');const records=currentEvidence(v).map(r=>JSON.parse(r.record)),evidence=records.map(r=>r.evidence),decisionId=id('decision');
    const selected=selection(v.h),finalization=v.h.finalization?JSON.parse(db.prepare('SELECT record FROM finalizations WHERE id=?').get(v.h.finalization).record).finalization
     :{state:'OPEN',factsRevision:v.h.facts,selectionRevision:v.h.selection_revision,finalizedAt:null};
    const context={evaluatorVersion:EVALUATOR_VERSION,mode:'SYNTHETIC',binding:v.preview.binding,decisionId,factsRevision:v.h.facts,evaluatedAt:v.t,
     sourceBindings:evidence.map(e=>({requirementId:e.requirementId,sourceBinding:e.sourceBinding})),evidencePins:records.map(r=>({evidenceId:r.evidence.evidenceId,revision:r.evidence.revision,digest:r.evidenceHash})),
     examPins:records.flatMap(r=>r.exam?[r.exam]:[]),firstScoreRef:v.h.first_score?JSON.parse(v.h.first_score):null,initialSubmissionAt:v.h.initial_at,finalization};
    const result=evaluateMvpEligibility(compiled,{context,evidence,selection:selected});validateEvaluationResult(result);
    const snapshot={context,evidence,selection:selected,c1AcknowledgmentHash:v.a.acknowledgment.acknowledgmentHash,policyHash:compiled.policyHash,
     sourceSetHash:compiled.sourceSetHash,ruleHashes:compiled.ruleHashes,amount:p.amount};
    insertRecord('decisions',decisionId,v,{result,snapshot,snapshotHash:digest('CLEAR-EVALUATION-SNAPSHOT.1',snapshot),resultHash:digest('CLEAR-EVALUATION-RESULT.1',result)},v.h.revision);
    db.prepare('UPDATE heads SET latest=?,updated=? WHERE app=?').run(decisionId,v.t,app);return decisionId;
   });},
  receipts(c,app){const v=resolve(c,app);return db.prepare('SELECT * FROM evidence WHERE app=? AND actor=? ORDER BY rowid DESC LIMIT 100').all(app,v.s.wallet).map(r=>recordView('evidence',r,v));},
  receipt(c,app,target){const {r,v}=load('evidence',c,app,target);return recordView('evidence',r,v);},
  decisions(c,app){const v=resolve(c,app);return db.prepare('SELECT * FROM decisions WHERE app=? AND actor=? ORDER BY rowid DESC LIMIT 50').all(app,v.s.wallet).map(r=>recordView('decisions',r,v));},
  decision(c,app,target){const {r,v}=load('decisions',c,app,target);return recordView('decisions',r,v);},
  operation(c,app,target){const v=resolve(c,app);identifier(target);const row=db.prepare('SELECT * FROM commands WHERE id=? AND app=? AND actor=?').get(target,app,v.s.wallet);check(row,'MVP_NOT_FOUND');return operationValue(row,c);},
  recover(c,app,kind,key){const v=resolve(c,app);identifier(key);check(tableFor(kind),'MVP_NOT_FOUND');const row=db.prepare('SELECT * FROM commands WHERE app=? AND actor=? AND kind=? AND key=?').get(app,v.s.wallet,kind,key);check(row,'MVP_NOT_FOUND');return operationValue(row,c);},
  close(){closed=true;store.close();},
 };
}
