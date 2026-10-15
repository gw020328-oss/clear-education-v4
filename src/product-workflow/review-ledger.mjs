import { randomUUID } from 'node:crypto';
import { exactKeys,freeze,canonical,requireRule as check } from '../policy/values.mjs';
import { digest } from '../policy/mvp/contract.mjs';
import { validateSnapshot,snapshotHash,identifier,createRunContext,runContextHash,validateReviewSummary,LIMITS,GATES } from './contract.mjs';
import { openPrivateDb } from './private-db.mjs';
const schema=`
CREATE TABLE IF NOT EXISTS app_heads(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,agreement_hash TEXT NOT NULL,context_hash TEXT NOT NULL,active INTEGER NOT NULL CHECK(active IN(0,1))) STRICT;
CREATE TABLE IF NOT EXISTS heads(scope TEXT PRIMARY KEY,application_id TEXT NOT NULL,revision INTEGER NOT NULL,snapshot_hash TEXT NOT NULL,snapshot TEXT NOT NULL,active INTEGER NOT NULL CHECK(active IN(0,1))) STRICT;
CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,scope TEXT NOT NULL REFERENCES heads(scope),operation_key TEXT NOT NULL,request_hash TEXT NOT NULL,attempt INTEGER NOT NULL,
 context TEXT NOT NULL,context_hash TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN('RUNNING','ACCEPTED','CANCELLED','TIMED_OUT','SUPERSEDED')),
 created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,summary TEXT,summary_hash TEXT,
 UNIQUE(scope,operation_key),UNIQUE(scope,attempt),CHECK((state='ACCEPTED')=(summary IS NOT NULL AND summary_hash IS NOT NULL))) STRICT;
CREATE TRIGGER IF NOT EXISTS receipt_immutable BEFORE UPDATE ON runs WHEN OLD.state='ACCEPTED' BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECEIPT');END;
`;
const applicationContext=s=>digest('CLEAR-WORKFLOW-APPLICATION.1',{binding:s.binding,agreementHash:s.agreementHash,sourceBundleHash:s.sourceBundleHash,sourceBundleRevision:s.sourceBundleRevision,reviewManifestHash:s.reviewManifestHash,previewHash:s.previewHash});
const scope=s=>digest('CLEAR-WORKFLOW-SCOPE.1',{applicationId:s.binding.applicationId,requirementId:s.requirementId,ruleId:s.ruleId,method:s.method});
export function openReviewLedger({directory,environment,now=()=>Math.floor(Date.now()/1000)}){
  exactKeys(environment,['instanceId','origin','mode'],'WORKFLOW_ENVIRONMENT');identifier(environment.instanceId);
  check(environment.mode==='SYNTHETIC'&&new URL(environment.origin).origin===environment.origin&&new URL(environment.origin).protocol==='https:','WORKFLOW_ENVIRONMENT');
  const store=openPrivateDb(directory,'workflow.sqlite',environment,schema,['app_heads','heads','runs']),{db,transaction}=store;
  const clock=()=>{const t=now();check(Number.isSafeInteger(t)&&t>=0&&t<=4102444800,'WORKFLOW_CLOCK');return t;};
  function load(id){identifier(id);const r=db.prepare('SELECT * FROM runs WHERE id=?').get(id);check(r,'WORKFLOW_RUN_NOT_FOUND');return r;}
  function inspect(row){const t=clock(),head=db.prepare('SELECT * FROM heads WHERE scope=?').get(row.scope),context=JSON.parse(row.context);
    const latest=db.prepare('SELECT MAX(attempt) AS n FROM runs WHERE scope=?').get(row.scope).n;
    check(t>=row.created_at,'WORKFLOW_CLOCK');
    const app=db.prepare('SELECT * FROM app_heads WHERE id=?').get(context.snapshot.binding.applicationId);
    const current=!!app?.active&&app.revision===context.snapshot.workflowRevision&&app.context_hash===applicationContext(context.snapshot)&&!!head?.active&&head.snapshot_hash===context.snapshotHash&&latest===row.attempt;
    if(row.state==='RUNNING'&&(!current||t>=row.expires_at)){db.prepare('UPDATE runs SET state=? WHERE id=?').run(!current?'SUPERSEDED':'TIMED_OUT',row.id);row=load(row.id);}
    return freeze({context,contextHash:row.context_hash,state:row.state,current:current&&!['CANCELLED','TIMED_OUT','SUPERSEDED'].includes(row.state),
      createdAt:row.created_at,expiresAt:row.expires_at,summary:current&&row.state==='ACCEPTED'?JSON.parse(row.summary):null,
      reason:!current?'STALE_CONTEXT':row.state==='TIMED_OUT'?'TIMED_OUT':row.state==='CANCELLED'?'CANCELLED':null,...GATES});
  }
  return {
    close:store.close,
    pinLatest(snapshot){validateSnapshot(snapshot);check(snapshot.binding.instanceId===environment.instanceId,'WORKFLOW_INSTANCE');const s=structuredClone(snapshot),key=scope(s),hash=snapshotHash(s);
      return transaction(()=>{const app=db.prepare('SELECT * FROM app_heads WHERE id=?').get(s.binding.applicationId),appHash=applicationContext(s);
        if(app){check(s.workflowRevision>=app.revision,'WORKFLOW_STALE');
          if(s.workflowRevision===app.revision)check(app.active&&app.context_hash===appHash,'WORKFLOW_REVISION_CONFLICT');
          else if(app.context_hash!==appHash)check(app.agreement_hash!==s.agreementHash,'WORKFLOW_NEW_AGREEMENT_REQUIRED');
        }
        db.prepare('INSERT INTO app_heads VALUES(?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,agreement_hash=excluded.agreement_hash,context_hash=excluded.context_hash,active=1').run(s.binding.applicationId,s.workflowRevision,s.agreementHash,appHash);
        const old=db.prepare('SELECT * FROM heads WHERE scope=?').get(key);
        if(old){check(s.workflowRevision>=old.revision,'WORKFLOW_STALE');
          if(s.workflowRevision===old.revision){check(old.active&&old.snapshot_hash===hash,'WORKFLOW_REVISION_CONFLICT');return hash;}
          const p=JSON.parse(old.snapshot);check(s.submissionRevision>=p.submissionRevision&&s.routeRevision>=p.routeRevision
            &&s.binding.bindingRevision>=p.binding.bindingRevision&&s.sourceBundleRevision>=p.sourceBundleRevision,'WORKFLOW_STALE');
          if(canonical(s.binding)!==canonical(p.binding)||['planHash','displayHash','previewHash','reviewManifestHash','sourceBundleHash'].some(k=>s[k]!==p[k]))check(s.agreementHash!==p.agreementHash,'WORKFLOW_NEW_AGREEMENT_REQUIRED');
          db.prepare('UPDATE heads SET revision=?,snapshot_hash=?,snapshot=?,active=1 WHERE scope=?').run(s.workflowRevision,hash,canonical(s),key);
          db.prepare("UPDATE runs SET state='SUPERSEDED' WHERE scope=? AND state='RUNNING'").run(key);
        }else db.prepare('INSERT INTO heads VALUES(?,?,?,?,?,1)').run(key,s.binding.applicationId,s.workflowRevision,hash,canonical(s));return hash;
      });
    },
    invalidate(applicationId){return transaction(()=>{const scopes=db.prepare('SELECT scope FROM heads WHERE application_id=?').all(applicationId);
      db.prepare('UPDATE heads SET active=0 WHERE application_id=?').run(applicationId);
      db.prepare('UPDATE app_heads SET active=0 WHERE id=?').run(applicationId);
      for(const {scope}of scopes)db.prepare("UPDATE runs SET state='SUPERSEDED' WHERE scope=? AND state='RUNNING'").run(scope);
      return {invalidated:scopes.length};});},
    begin(snapshot,{idempotencyKey,runId}){validateSnapshot(snapshot);identifier(idempotencyKey);if(runId!==undefined)identifier(runId);
      const s=structuredClone(snapshot),key=scope(s),hash=snapshotHash(s),requestHash=digest('CLEAR-WORKFLOW-BEGIN.1',{snapshotHash:hash,runId:runId??null});
      return transaction(()=>{const prior=db.prepare('SELECT * FROM runs WHERE scope=? AND operation_key=?').get(key,idempotencyKey);
        if(prior){check(prior.request_hash===requestHash,'WORKFLOW_IDEMPOTENCY_CONFLICT');return inspect(prior);}
        const head=db.prepare('SELECT * FROM heads WHERE scope=?').get(key),app=db.prepare('SELECT * FROM app_heads WHERE id=?').get(s.binding.applicationId);
        check(app?.active&&app.revision===s.workflowRevision&&app.context_hash===applicationContext(s)&&head?.active&&head.snapshot_hash===hash,'WORKFLOW_STALE');
        runId??='run-'+randomUUID();check(!db.prepare('SELECT id FROM runs WHERE id=?').get(runId),'WORKFLOW_RUN_REUSED');
        const attempt=(db.prepare('SELECT MAX(attempt) AS n FROM runs WHERE scope=?').get(key).n??0)+1,context=createRunContext(s,runId,attempt),createdAt=clock();
        db.prepare("UPDATE runs SET state='SUPERSEDED' WHERE scope=? AND state='RUNNING'").run(key);
        db.prepare("INSERT INTO runs VALUES(?,?,?,?,?,?,?,'RUNNING',?,?,NULL,NULL)").run(runId,key,idempotencyKey,requestHash,attempt,canonical(context),runContextHash(context),createdAt,createdAt+LIMITS.runSeconds);
        return inspect(load(runId));
      });
    },
    get(runId){return transaction(()=>inspect(load(runId)));},
    cancel(runId){return transaction(()=>{const r=load(runId);if(r.state==='RUNNING')db.prepare("UPDATE runs SET state='CANCELLED' WHERE id=?").run(runId);return inspect(load(runId));});},
    complete(runId,summary){validateReviewSummary(summary);const encoded=canonical(summary),resultHash=digest('CLEAR-WORKFLOW-RECEIPT.1',summary);
      return transaction(()=>{let r=load(runId);check(r.context_hash===summary.runContextHash,'WORKFLOW_RESULT_CONTEXT');
        if(r.state==='ACCEPTED'){check(r.summary_hash===resultHash,'WORKFLOW_RESULT_CONFLICT');return inspect(r);}
        const view=inspect(r);check(view.current&&view.state==='RUNNING','WORKFLOW_RESULT_STALE');
        if(view.context.snapshot.method==='VISION'&&view.context.snapshot.manifest.files.length)check(summary.reviewStatus!=='CHECKED','WORKFLOW_IMAGE_NOT_DECODED');
        db.prepare("UPDATE runs SET state='ACCEPTED',summary=?,summary_hash=? WHERE id=? AND state='RUNNING'").run(encoded,resultHash,runId);
        return inspect(load(runId));
      });
    },
  };
}
