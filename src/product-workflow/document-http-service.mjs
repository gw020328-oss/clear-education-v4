// C2 public-fixture-only loopback development workflow. Student raw stays in memory.
import { randomUUID } from 'node:crypto';
import { canonical,exactKeys,freeze,requireRule as check } from '../policy/values.mjs';
import { digest } from '../policy/mvp/contract.mjs';
import { GATES,WORKFLOW_VERSION,identifier,revision,hash32,bytesDigest,createDocumentManifest,manifestHash,submissionHash,validateReviewSummary } from './contract.mjs';
import { openPrivateDb } from './private-db.mjs';
import { openSourceStore } from './source-store.mjs';
import { sourceBundleHash,sourceSnapshotHash } from './source-contract.mjs';
import { openReviewLedger } from './review-ledger.mjs';
import { createReviewPreview } from '../document-precheck/bound-policy.mjs';
import { reviewWorkflowDocument } from '../document-precheck/workflow-adapter.mjs';
export const DOCUMENT_HTTP_VERSION='clear-mvp-document-http.1';
export const DOCUMENT_HTTP_LIMITS=freeze({bodyBytes:393216,files:4,fileBytes:65536,totalBytes:262144,rawBytes:1048576,uploads:2,rawSeconds:1800,receiveMs:10000});
const gates={...GATES,version:DOCUMENT_HTTP_VERSION,dataMode:'SYNTHETIC',identityVerified:false,policyPublished:false,documentSubmissionReady:false,
 syntheticDocumentSubmissionReady:true,realDataAllowed:false,imageDecodeReady:false,fundingStatus:'UNKNOWN'};
const schema=`
CREATE TABLE IF NOT EXISTS heads(app TEXT PRIMARY KEY,revision INTEGER NOT NULL,fingerprint TEXT NOT NULL,ack TEXT,submission TEXT,submission_revision INTEGER NOT NULL,updated INTEGER NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS acknowledgments(id TEXT PRIMARY KEY,app TEXT NOT NULL,actor TEXT NOT NULL,record TEXT NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS submissions(id TEXT PRIMARY KEY,app TEXT NOT NULL,actor TEXT NOT NULL,revision INTEGER NOT NULL,workflow_revision INTEGER NOT NULL,fingerprint TEXT NOT NULL,ack TEXT NOT NULL,fixture TEXT NOT NULL,manifest TEXT NOT NULL,input_hash TEXT NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL,deleted INTEGER NOT NULL DEFAULT 0) STRICT;
CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,app TEXT NOT NULL,actor TEXT NOT NULL,submission TEXT NOT NULL,workflow_revision INTEGER NOT NULL,method TEXT NOT NULL,state TEXT NOT NULL,created INTEGER NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS commands(id TEXT PRIMARY KEY,app TEXT NOT NULL,actor TEXT NOT NULL,route TEXT NOT NULL,key TEXT NOT NULL,request_hash TEXT NOT NULL,kind TEXT NOT NULL,target TEXT NOT NULL,created INTEGER NOT NULL,UNIQUE(actor,route,key)) STRICT;
CREATE TRIGGER IF NOT EXISTS document_submission_immutable BEFORE UPDATE OF id,app,actor,revision,workflow_revision,fingerprint,ack,fixture,manifest,input_hash,created,expires ON submissions BEGIN SELECT RAISE(ABORT,'IMMUTABLE_DOCUMENT_SUBMISSION');END;
CREATE TRIGGER IF NOT EXISTS document_ack_immutable BEFORE UPDATE ON acknowledgments BEGIN SELECT RAISE(ABORT,'IMMUTABLE_DOCUMENT_ACK');END;
CREATE TRIGGER IF NOT EXISTS document_command_immutable BEFORE UPDATE ON commands BEGIN SELECT RAISE(ABORT,'IMMUTABLE_DOCUMENT_COMMAND');END;
`;
const id=prefix=>prefix+'-'+randomUUID();
export function createDocumentWorkflowService({directory,authentication,student,instanceId,configuration,now=()=>Math.floor(Date.now()/1000),timeoutMs=1000}){
 check(authentication&&student&&configuration&&Number.isInteger(timeoutMs)&&timeoutMs>=1&&timeoutMs<=30000,'DOC_CONFIGURATION_REQUIRED');identifier(instanceId);
 const {policy,adapter}=configuration;check(adapter?.execution==='MOCK'&&adapter.modelVersion==='mock-document.1','DOC_CONFIGURATION_REQUIRED');
 // Bound-policy handle validates host authority. No browser configuration is accepted.
 const fixtures=configuration.fixtures.map(f=>({...structuredClone(f),files:f.files.map(x=>({...x,bytes:Buffer.from(x.bytes)}))}));
 check(fixtures.length>0&&fixtures.length<=16&&new Set(fixtures.map(f=>f.fixtureId)).size===fixtures.length,'DOC_CONFIGURATION_REQUIRED');
 const configHash=digest('CLEAR-DOC-HOST.1',{policyHash:policy.compiled.policyHash,manifestHash:policy.manifestHash,sourceBundleHash:configuration.sourceBundleHash,
  fixtures:fixtures.map(f=>({fixtureId:f.fixtureId,posts:f.posts,files:f.files.map(x=>({postId:x.postId,imageId:x.imageId,mediaType:x.mediaType,sha256:bytesDigest(x.bytes)}))})),model:adapter.modelVersion});
 const store=openPrivateDb(directory,'document-http.sqlite',{instanceId,origin:authentication.origin,mode:'SYNTHETIC_DOCUMENT_HTTP',configHash},schema,['heads','acknowledgments','submissions','runs','commands']);
 const {db,transaction}=store;let archive,ledger,closed=false;const raw=new Map(),active=new Map(),tasks=new Set(),slots=new Set();
 const clock=()=>{const t=now();check(Number.isSafeInteger(t)&&t>=0&&t<=4102444800,'MVP_CLOCK');return t;};
 try{
  archive=openSourceStore({directory,environment:{instanceId,origin:authentication.origin,mode:'PUBLIC_SOURCE_ONLY'},now});
  check(sourceBundleHash(configuration.bundle)===configuration.sourceBundleHash,'DOC_CONFIGURATION_REQUIRED');
  for(const k of ['institutionId','productId','cohortId'])check(configuration.bundle[k]===policy.compiled.policy[k],'DOC_CONFIGURATION_REQUIRED');
  const pin=policy.compiled.policy.sources.find(s=>s.sourceId===configuration.source.snapshot.sourceId),snapshot=configuration.source.snapshot;
  check(pin&&pin.capturedAt===snapshot.collectedAt&&pin.rawHash===snapshot.artifacts.find(a=>a.role==='RESPONSE_BODY')?.sha256&&pin.normalizedHash===snapshot.artifacts.find(a=>a.role==='EXTRACTED_TEXT')?.sha256,'DOC_CONFIGURATION_REQUIRED');
  check(configuration.bundle.entries[0].snapshotHash===sourceSnapshotHash(configuration.source.snapshot),'DOC_CONFIGURATION_REQUIRED');
  archive.purgeExpired();archive.putSnapshot(configuration.source.snapshot,configuration.source.blobs);archive.putBundle(configuration.bundle);
  ledger=openReviewLedger({directory,environment:{instanceId,origin:authentication.origin,mode:'SYNTHETIC'},now});
  // No raw survives restart. Recover stored receipts only, never dispatch a model.
  for(const r of db.prepare("SELECT * FROM runs WHERE state IN ('RESERVED','RUNNING')").all()){
   check(clock()>=r.created,'MVP_CLOCK');let accepted=false;
   try{accepted=ledger.get(r.id).state==='ACCEPTED';if(!accepted)ledger.cancel(r.id);}catch(e){if(e.message!=='WORKFLOW_RUN_NOT_FOUND')throw e;}
   db.prepare('UPDATE runs SET state=? WHERE id=?').run(accepted?'ACCEPTED':'INTERRUPTED',r.id);
  }
 }catch(e){ledger?.close();archive?.close();store.close();throw e;}
 const actor=(context,write=false)=>{check(!closed,'MVP_CLOSED');const s=authentication.authorizeWorkflow(context,write);check(s.role==='participant','FORBIDDEN');return s;};
 const head=app=>db.prepare('SELECT * FROM heads WHERE app=?').get(app);
 function wipe(sub){const value=raw.get(sub);if(value){clearTimeout(value.timer);for(const f of value.files)f.bytes.fill(0);value.posts=[];raw.delete(sub);
   // Expiry must also release worker/observer copies, not just the upload cache.
   for(const work of active.values())if(work.submission===sub)work.controller.abort();
  }}
 function stopApp(app,supersede=false){for(const slot of slots)if(slot.app===app)slot.controller.abort();for(const [run,value]of active)if(value.app===app){value.controller.abort();if(!supersede)try{ledger.cancel(run);}catch{}}for(const s of db.prepare('SELECT id FROM submissions WHERE app=?').all(app))wipe(s.id);}
 function sourceCurrent(){archive.purgeExpired();const b=archive.getBundle(configuration.sourceBundleHash);for(const entry of b.entries){const s=archive.getSnapshot(entry.snapshotHash);for(const a of s.artifacts)archive.getArtifact(entry.snapshotHash,a.artifactId);}return b;}
 function resolve(context,app,write=false){
  const s=actor(context,write),a=student.get(context,app),c1=student.preview(context,app); // ownership before configuration/clock details
  const t=clock();for(const [sub,value]of raw)if(t>=value.expiresAt)wipe(sub);
  check(a.state==='ACKNOWLEDGED_SYNTHETIC'&&a.policyCurrent&&a.acknowledgment?.current,'DOC_CONFIGURATION_REQUIRED');
  check(a.policyHash===policy.compiled.policyHash,'DOC_CONFIGURATION_REQUIRED');const b=sourceCurrent(),review=createReviewPreview(policy,c1.binding);
  check(review.status==='READY_SYNTHETIC','DOC_CONFIGURATION_REQUIRED');const fingerprint=digest('CLEAR-DOC-CURRENT.1',{c1Revision:a.workflowRevision,c1Ack:a.acknowledgment.acknowledgmentHash,
   binding:c1.binding,manifest:policy.manifestHash,preview:review.previewHash,source:configuration.sourceBundleHash});
  transaction(()=>{const h=head(app);if(h){check(t>=h.updated,'MVP_CLOCK');if(h.fingerprint!==fingerprint){
    db.prepare('UPDATE heads SET revision=revision+1,fingerprint=?,ack=NULL,submission=NULL,updated=? WHERE app=?').run(fingerprint,t,app);stopApp(app,true);ledger.invalidate(app);
   }}else db.prepare('INSERT INTO heads VALUES(?,1,?,NULL,NULL,0,?)').run(app,fingerprint,t);});
  return {s,a,c1,review,b,fingerprint,h:head(app)};
 }
 function currentOrInvalidate(context,app){try{return resolve(context,app);}catch(e){
  // An authenticated owner can see historical hashes when policy/source is unavailable.
  actor(context);student.get(context,app);if(['DOC_CONFIGURATION_REQUIRED','SOURCE_EXPIRED','SOURCE_NOT_FOUND'].includes(e.message)){stopApp(app,true);ledger.invalidate(app);return null;}throw e;
 }}
 function previewValue(v){const payload={applicationId:v.a.applicationId,expectedWorkflowRevision:v.h.revision,c1WorkflowRevision:v.a.workflowRevision,c1AcknowledgmentHash:v.a.acknowledgment.acknowledgmentHash,
  c1DisplayHash:v.c1.displayHash,c1PreviewHash:v.c1.previewHash,documentRequirements:policy.planBindings.map(p=>({requirementId:p.requirementId,ruleId:p.ruleId,methods:['CODE','TEXT_AI','VISION']})),binding:v.c1.binding,reviewPreview:v.review,sourceBundleHash:configuration.sourceBundleHash,sourceBundleRevision:v.b.revision,acknowledgementScope:'SYNTHETIC_DOCUMENT_ACK_ONLY',...gates};
  return freeze({...payload,documentPreviewHash:digest('CLEAR-DOC-PREVIEW.1',payload),documentAcknowledgment:v.h.ack?ackView(v.h.ack):null});}
 function ackView(ack){const row=db.prepare('SELECT record FROM acknowledgments WHERE id=?').get(ack);check(row,'MVP_NOT_FOUND');return JSON.parse(row.record);}
 function loadSubmission(app,sub,s){identifier(sub);const row=db.prepare('SELECT * FROM submissions WHERE id=? AND app=? AND actor=?').get(sub,app,s.wallet);check(row,'MVP_NOT_FOUND');check(clock()>=row.created,'MVP_CLOCK');return row;}
 function submissionView(row,v){const current=!!v&&v.h.submission===row.id&&v.h.fingerprint===row.fingerprint&&v.h.ack===row.ack&&!row.deleted;
  const bytes=raw.get(row.id);if(bytes&&clock()>=row.expires)wipe(row.id);
  return freeze({submissionId:row.id,submissionRevision:row.revision,workflowRevision:row.workflow_revision,manifest:JSON.parse(row.manifest),assetsHash:manifestHash(JSON.parse(row.manifest)),inputHash:row.input_hash,
   current,state:row.deleted?'DELETED':!current?'SUPERSEDED':raw.has(row.id)?'RECEIVED':'RAW_UNAVAILABLE',rawAvailable:current&&raw.has(row.id),createdAt:row.created,expiresAt:row.expires,...gates,syntheticDocumentSubmissionReady:!!v});}
 function runRow(app,run,s){identifier(run);const r=db.prepare('SELECT * FROM runs WHERE id=? AND app=? AND actor=?').get(run,app,s.wallet);check(r,'MVP_NOT_FOUND');check(clock()>=r.created,'MVP_CLOCK');return r;}
 function runView(r,v){let stored;try{stored=ledger.get(r.id);}catch(e){if(e.message!=='WORKFLOW_RUN_NOT_FOUND')throw e;}
  const current=!!v&&v.h.revision===r.workflow_revision&&v.h.submission===r.submission&&!!stored?.current;
  let state=r.state;if(stored?.state==='ACCEPTED'&&r.state!=='ACCEPTED'){db.prepare("UPDATE runs SET state='ACCEPTED' WHERE id=?").run(r.id);state='ACCEPTED';}
  else if(!['INTERRUPTED','ACCEPTED','RESERVED'].includes(state)&&stored)state=stored.state;
  return freeze({runId:r.id,submissionId:r.submission,workflowRevision:r.workflow_revision,method:r.method,state,current:current&&state!=='INTERRUPTED',
   summary:current&&state==='ACCEPTED'?stored.summary:null,reason:state==='INTERRUPTED'?'INTERRUPTED':!current?'STALE_CONTEXT':stored?.reason??null,createdAt:r.created,...gates,syntheticDocumentSubmissionReady:!!v});}
 function operationValue(row,context){check(clock()>=row.created,'MVP_CLOCK');const s=actor(context),v=currentOrInvalidate(context,row.app);check(row.actor===s.wallet,'MVP_NOT_FOUND');let result;
  if(row.kind==='submissions'||row.kind==='delete')result=submissionView(loadSubmission(row.app,row.target,s),v);
  else if(row.kind==='review-runs'||row.kind==='cancel')result=runView(runRow(row.app,row.target,s),v);
  else result={...ackView(row.target),current:!!v&&v.h.ack===row.target,syntheticDocumentSubmissionReady:!!v};
  return freeze({operationId:row.id,kind:row.kind,applicationId:row.app,state:'RECORDED',current:result.current,result,...gates,syntheticDocumentSubmissionReady:!!v});}
 function command(context,app,kind,key,body,fn){identifier(key);const s=actor(context,true),route=app+'/'+kind,requestHash=digest('CLEAR-DOC-COMMAND.1',body);
  const row=transaction(()=>{actor(context,true);student.get(context,app);const prior=db.prepare('SELECT * FROM commands WHERE actor=? AND route=? AND key=?').get(s.wallet,route,key);
   if(prior){check(prior.request_hash===requestHash,'IDEMPOTENCY_CONFLICT');return prior;}
   check(db.prepare('SELECT COUNT(*) AS n FROM commands').get().n<2000,'DOC_LIMIT');const target=fn(s),operationId=id('document-op');
   db.prepare('INSERT INTO commands VALUES(?,?,?,?,?,?,?,?,?)').run(operationId,app,s.wallet,route,key,requestHash,kind,target,clock());return db.prepare('SELECT * FROM commands WHERE id=?').get(operationId);
  });return operationValue(row,context);
 }
 function validateFiles(fixture,files){check(Array.isArray(files)&&files.length<=4&&files.length===fixture.files.length,'DOC_FILE_SET');const owned=[],names=new Set(),hashes=new Set(),ids=new Set();let size=0;
  try{for(const f of files){exactKeys(f,['postId','imageId','name','mediaType','base64'],'DOC_FILE_SET');identifier(f.postId);identifier(f.imageId);
   check(typeof f.name==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(f.name)&&!f.name.includes('..')&&!names.has(f.name),'DOC_FILE_NAME');names.add(f.name);
   const pair=f.postId+'/'+f.imageId;check(!ids.has(pair),'DOC_FILE_SET');ids.add(pair);
   check(typeof f.base64==='string'&&f.base64.length>0&&f.base64.length<=87384&&f.base64.length%4===0&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(f.base64),'DOC_MEDIA');
   const bytes=Buffer.from(f.base64,'base64');owned.push({postId:f.postId,imageId:f.imageId,mediaType:f.mediaType,bytes});size+=bytes.length;
   check(bytes.length<=65536&&size<=262144&&bytes.toString('base64')===f.base64,'DOC_LIMIT');
   const expected=fixture.files.find(e=>e.postId===f.postId&&e.imageId===f.imageId),hash=bytesDigest(bytes);
   check(expected&&expected.mediaType===f.mediaType&&bytesDigest(expected.bytes)===hash,'DOC_SYNTHETIC_ONLY');check(!hashes.has(hash),'DOC_FILE_SET');hashes.add(hash);
  }return owned;}catch(e){for(const f of owned)f.bytes.fill(0);throw e;}
 }
 const rawSize=()=>[...raw.values()].reduce((sum,r)=>sum+r.files.reduce((n,f)=>n+f.bytes.length,0),0);
 async function worker(context,app,run,submission,files){const control=active.get(run),controller=control.controller;
  try{
   const v=resolve(context,app,true),r=runRow(app,run,v.s);check(v.h.revision===r.workflow_revision&&!controller.signal.aborted,'MVP_STALE');
   const issued=ledger.get(run),summary=await reviewWorkflowDocument({context:issued.context,policy,submission,files},adapter,{signal:controller.signal,timeoutMs});
   const latest=resolve(context,app,true);check(latest.h.revision===r.workflow_revision&&latest.h.submission===r.submission&&!controller.signal.aborted,'MVP_STALE');
   check(raw.has(r.submission)&&clock()<loadSubmission(app,r.submission,latest.s).expires,'DOC_RAW_UNAVAILABLE');
   let accepted=summary;
   if(files.length&&!summary.reasons.some(x=>x.code==='IMAGE_NOT_DECODED'))accepted={...summary,resultHash:digest('CLEAR-DOC-DECODE-HOLD.1',summary),reviewStatus:summary.reviewStatus==='CHECKED'?'NEEDS_REVIEW':summary.reviewStatus,
    outcome:summary.reviewStatus==='CHECKED'?'UNDETERMINED':summary.outcome,reasons:[...summary.reasons.slice(0,31),{fieldId:null,code:'IMAGE_NOT_DECODED'}]};
   validateReviewSummary(accepted);ledger.complete(run,accepted);db.prepare("UPDATE runs SET state='ACCEPTED' WHERE id=?").run(run);
  }catch{let terminal='CANCELLED';try{const prior=ledger.get(run);terminal=prior.state==='RUNNING'?ledger.cancel(run).state:prior.state;}catch{}db.prepare("UPDATE runs SET state=? WHERE id=? AND state IN ('RESERVED','RUNNING')").run(terminal,run);}
  finally{for(const f of files)f.bytes.fill(0);wipe(control.submission);active.delete(run);}
 }
 return {origin:authentication.origin,
  preview(context,app){return previewValue(resolve(context,app));},
  authorize(context,app,write=false){const s=actor(context,write);student.get(context,app);return s;},
  acquireUpload(context,app){const v=resolve(context,app,true);check(v.h.ack,'DOC_DISPLAY_CHANGED');
   check(slots.size<2&&![...slots].some(s=>s.wallet===v.s.wallet)&&rawSize()+(slots.size+1)*262144<=1048576,'DOC_BUSY');
   const slot={wallet:v.s.wallet,app,controller:new AbortController()};slots.add(slot);const release=()=>slots.delete(slot);release.signal=slot.controller.signal;return release;},
  acknowledge(context,app,body,key){exactKeys(body,['expectedWorkflowRevision','documentPreviewHash','acknowledgement'],'DOC_DISPLAY_CHANGED');revision(body.expectedWorkflowRevision);hash32(body.documentPreviewHash);
   const v=resolve(context,app,true);return command(context,app,'document-agreement',key,body,s=>{const h=head(app);check(h.revision===body.expectedWorkflowRevision&&!h.ack&&body.acknowledgement==='SYNTHETIC_DOCUMENT_ACK_ONLY','DOC_DISPLAY_CHANGED');
    check(previewValue({...v,h}).documentPreviewHash===body.documentPreviewHash,'DOC_DISPLAY_CHANGED');const ack=id('document-ack'),record={documentAcknowledgmentId:ack,documentAcknowledgmentHash:digest('CLEAR-DOC-ACK.1',{preview:body.documentPreviewHash,c1Ack:v.a.acknowledgment.acknowledgmentHash,binding:v.c1.binding}),
     applicationId:app,documentPreviewHash:body.documentPreviewHash,c1AcknowledgmentHash:v.a.acknowledgment.acknowledgmentHash,scope:'SYNTHETIC_DOCUMENT_ACK_ONLY',recordedAt:clock(),current:true,...gates};
    db.prepare('INSERT INTO acknowledgments VALUES(?,?,?,?)').run(ack,app,s.wallet,canonical(record));db.prepare('UPDATE heads SET revision=revision+1,ack=?,updated=? WHERE app=?').run(ack,clock(),app);return ack;
   });},
  submit(context,app,body,key){exactKeys(body,['expectedWorkflowRevision','expectedSubmissionRevision','documentAcknowledgmentHash','fixtureId','files'],'DOC_FILE_SET');revision(body.expectedWorkflowRevision);
   check(Number.isInteger(body.expectedSubmissionRevision)&&body.expectedSubmissionRevision>=0,'MVP_STALE');hash32(body.documentAcknowledgmentHash);identifier(body.fixtureId);
   const v=resolve(context,app,true),fixture=fixtures.find(f=>f.fixtureId===body.fixtureId);check(fixture,'DOC_SYNTHETIC_ONLY');const files=validateFiles(fixture,body.files);let adopted=false,adoptedId;
   try{return command(context,app,'submissions',key,body,s=>{const h=head(app);check(h.revision===body.expectedWorkflowRevision&&h.submission_revision===body.expectedSubmissionRevision&&h.ack&&ackView(h.ack).documentAcknowledgmentHash===body.documentAcknowledgmentHash,'MVP_STALE');
    check(db.prepare('SELECT COUNT(*) AS n FROM submissions').get().n<500&&rawSize()+files.reduce((n,f)=>n+f.bytes.length,0)<=1048576,'DOC_LIMIT');
    const sub=id('submission'),n=h.submission_revision+1,submission={submissionId:sub,revision:n,routeRevision:n,posts:structuredClone(fixture.posts)},manifest=createDocumentManifest(submission,files),t=clock();
    stopApp(app,true);ledger.invalidate(app);db.prepare('INSERT INTO submissions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0)').run(sub,app,s.wallet,n,h.revision+1,h.fingerprint,h.ack,fixture.fixtureId,canonical(manifest),submissionHash(submission),t,t+1800);
    db.prepare('UPDATE heads SET revision=revision+1,submission=?,submission_revision=?,updated=? WHERE app=?').run(sub,n,t,app);
    const value={posts:submission.posts,files,wallet:s.wallet,expiresAt:t+1800,timer:setTimeout(()=>wipe(sub),1800000)};value.timer.unref();raw.set(sub,value);adopted=true;adoptedId=sub;return sub;
   });}catch(e){if(adoptedId)wipe(adoptedId);throw e;}finally{if(!adopted)for(const f of files)f.bytes.fill(0);}},
  submissions(context,app){const s=actor(context),v=currentOrInvalidate(context,app);return db.prepare('SELECT * FROM submissions WHERE app=? AND actor=? ORDER BY revision DESC LIMIT 50').all(app,s.wallet).map(r=>submissionView(r,v));},
  submission(context,app,sub){const s=actor(context);student.get(context,app);const row=loadSubmission(app,sub,s);return submissionView(row,currentOrInvalidate(context,app));},
  startRun(context,app,body,key){exactKeys(body,['expectedWorkflowRevision','submissionId','expectedSubmissionRevision','method'],'DOC_FILE_SET');revision(body.expectedWorkflowRevision);revision(body.expectedSubmissionRevision);identifier(body.submissionId);check(['CODE','TEXT_AI','VISION'].includes(body.method),'DOC_CONFIGURATION_REQUIRED');
   const v=resolve(context,app,true);let launch,result;
   try{result=command(context,app,'review-runs',key,body,s=>{const h=head(app),sub=loadSubmission(app,body.submissionId,s),value=raw.get(sub.id);
    check(h.revision===body.expectedWorkflowRevision&&h.submission===sub.id&&sub.revision===body.expectedSubmissionRevision&&h.ack===sub.ack,'MVP_STALE');
    check(value&&clock()<sub.expires&&!sub.deleted,'DOC_RAW_UNAVAILABLE');check(active.size<2&&![...active.values()].some(x=>x.app===app),'DOC_BUSY');
    const plan=policy.planBindings[0],run=id('document-run'),submission={submissionId:sub.id,revision:sub.revision,routeRevision:sub.revision,posts:structuredClone(value.posts)};
    const snapshot={version:WORKFLOW_VERSION,mode:'SYNTHETIC',binding:v.c1.binding,workflowRevision:h.revision,agreementHash:ackView(h.ack).documentAcknowledgmentHash,
     ruleId:plan.ruleId,requirementId:plan.requirementId,ruleHash:policy.compiled.ruleHashes[plan.ruleId],planVersion:plan.planVersion,planHash:plan.planHash,displayHash:plan.displayHash,
     reviewManifestHash:policy.manifestHash,previewHash:v.review.previewHash,sourceBundleHash:configuration.sourceBundleHash,sourceBundleRevision:v.b.revision,
     submissionId:sub.id,submissionRevision:sub.revision,routeRevision:sub.revision,inputHash:sub.input_hash,manifest:JSON.parse(sub.manifest),method:body.method,fieldIds:body.method==='CODE'?[]:['content'],promptVersion:'clear-document-observe.1',modelVersion:adapter.modelVersion};
    db.prepare("INSERT INTO runs VALUES(?,?,?,?,?,?,'RESERVED',?)").run(run,app,s.wallet,sub.id,h.revision,body.method,clock());launch={run,snapshot,submission,files:value.files.map(f=>({...f,bytes:Buffer.from(f.bytes)}))};return run;
   });}catch(e){if(launch)for(const f of launch.files)f.bytes.fill(0);throw e;}
   if(launch){try{ledger.pinLatest(launch.snapshot);ledger.begin(launch.snapshot,{idempotencyKey:launch.run,runId:launch.run});db.prepare("UPDATE runs SET state='RUNNING' WHERE id=?").run(launch.run);
     active.set(launch.run,{app,submission:body.submissionId,wallet:v.s.wallet,controller:new AbortController()});const task=Promise.resolve().then(()=>worker(context,app,launch.run,launch.submission,launch.files));tasks.add(task);task.then(()=>tasks.delete(task),()=>tasks.delete(task));
    }catch(e){for(const f of launch.files)f.bytes.fill(0);wipe(body.submissionId);db.prepare("UPDATE runs SET state='INTERRUPTED' WHERE id=?").run(launch.run);throw e;}}
   return launch?this.operation(context,app,result.operationId):result;
  },
  run(context,app,run){const s=actor(context);student.get(context,app);const row=runRow(app,run,s);return runView(row,currentOrInvalidate(context,app));},
  cancel(context,app,run,body,key){exactKeys(body,[],'DOC_CANCELLED');this.authorize(context,app,true);return command(context,app,'cancel',key,{runId:run},s=>{runRow(app,run,s);active.get(run)?.controller.abort();ledger.cancel(run);const r=db.prepare('SELECT submission FROM runs WHERE id=?').get(run);wipe(r.submission);return run;});},
  deleteRaw(context,app,sub,key){this.authorize(context,app,true);return command(context,app,'delete',key,{submissionId:sub},s=>{const row=loadSubmission(app,sub,s);if(row.deleted)return sub;wipe(sub);for(const [run,v]of active)if(v.submission===sub){v.controller.abort();ledger.cancel(run);}db.prepare('UPDATE submissions SET deleted=1 WHERE id=?').run(sub);if(head(app)?.submission===sub){db.prepare('UPDATE heads SET revision=revision+1,updated=? WHERE app=?').run(clock(),app);ledger.invalidate(app);}return sub;});},
  operation(context,app,operation){const s=actor(context);student.get(context,app);identifier(operation);const row=db.prepare('SELECT * FROM commands WHERE id=? AND app=? AND actor=?').get(operation,app,s.wallet);check(row,'MVP_NOT_FOUND');return operationValue(row,context);},
  recover(context,app,kind,key){const s=actor(context);student.get(context,app);check(['document-agreement','submissions','review-runs','cancel','delete'].includes(kind),'MVP_NOT_FOUND');identifier(key);
   const row=db.prepare('SELECT * FROM commands WHERE actor=? AND route=? AND key=?').get(s.wallet,app+'/'+kind,key);check(row,'MVP_NOT_FOUND');return operationValue(row,context);},
  refresh(context,app){currentOrInvalidate(context,app);},
  logout(context){const s=authentication.authorizeWorkflow(context,true);if(s.role!=='participant')return;for(const slot of slots)if(slot.wallet===s.wallet)slot.controller.abort();for(const r of db.prepare('SELECT id FROM submissions WHERE actor=?').all(s.wallet))wipe(r.id);for(const [run,v]of active)if(v.wallet===s.wallet){v.controller.abort();ledger.cancel(run);}},
  async idle(){await Promise.all([...tasks]);},
  async close(){if(closed)return;for(const slot of slots)slot.controller.abort();for(const v of active.values())v.controller.abort();await Promise.allSettled([...tasks]);for(const sub of raw.keys())wipe(sub);closed=true;ledger.close();archive.close();store.close();},
 };
}
