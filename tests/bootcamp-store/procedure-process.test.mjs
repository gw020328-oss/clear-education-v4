import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {procedureFixture} from './procedure-fixture.mjs';
function snapshot(f,a){
 const v=f.view(a),db=new DatabaseSync(join(f.directory,'bootcamp.sqlite'),{readOnly:true});
 try{const sequence=db.prepare('SELECT sequence FROM r2_decisions WHERE decision_id=?').get(v.decisionId).sequence;
  return {funding:f.configuration.procedurePorts.funding({applicationId:a,decisionId:v.decisionId,decisionRevision:v.decisionRevision,decisionHash:v.decisionHash,acceptanceSequence:sequence}),
   chain:f.configuration.procedurePorts.chain({applicationId:a}),authorization:f.configuration.procedurePorts.authorization()};
 }finally{db.close();}
}
function rows(f){const db=new DatabaseSync(join(f.directory,'bootcamp.sqlite'),{readOnly:true});try{
 return Object.fromEntries(['e3_procedures','e3_publications','e3_ids','e3_records','e3_prepared','r2_metrics','commands'].map(t=>[t,db.prepare('SELECT COUNT(*) n FROM '+t).get().n]));
}finally{db.close();}}
async function worker(t,f,a,crashStage,assessment){
 const p=fork(new URL('./procedure-worker.mjs',import.meta.url),[],{stdio:['ignore','ignore','ignore','ipc']});
 t.after(()=>{if(p.exitCode===null)p.kill('SIGKILL');});const ready=once(p,'message');
 p.send({action:'prepare',directory:f.directory,authentication:f.config,time:f.time,bindings:f.configuration.operatorBindings,...snapshot(f,a),crashStage,assessment});
 assert.equal((await ready)[0].ready,true);return p;
}
for(const crashStage of ['e3-after-procedure','e3-after-publication','e3-after-consent','e3-after-revalidation','e3-after-prepared','e3-after-command'])test(`E3 SIGKILL ${crashStage} leaves no partial procedure/count/nonce/metric`,{timeout:15000},async t=>{
 const f=await procedureFixture(t),a=f.create();await f.complete(a);let method='publishReview',extra={},assessment;
 if(['e3-after-consent','e3-after-revalidation','e3-after-prepared'].includes(crashStage))f.publish(a);
 if(crashStage==='e3-after-consent'){method='recordReviewConsent';extra={value:'AGREE'};}
 if(crashStage==='e3-after-revalidation'){method='recordReviewRevalidation';const assessmentId=f.registerAssessment(a,'revalidation');extra={assessmentId};assessment=f.revalidationAssessments.get(assessmentId);}
 if(crashStage==='e3-after-prepared'){method='prepareReviewAuthorization';f.consent(a);f.consent(a,f.operatorContext);}
 const body=f.body(a,extra),key=f.key(),before=rows(f),child=await worker(t,f,a,crashStage,assessment),exit=once(child,'exit');
 child.send({action:'command',method,context:f.aliceContext,applicationId:a,body,key});assert.deepEqual(await exit,[null,'SIGKILL']);
 f.restart();assert.deepEqual(rows(f),before);const op=f.store[method](f.aliceContext,a,body,key);assert.ok(op.record.operationId);
 const metrics=f.store.getMetricEvents(f.aliceContext,a).events.filter(e=>e.operationId===op.record.operationId&&e.eventType==='AUTO_OPERATION_COMPLETED');assert.equal(metrics.length,1);
 assert.deepEqual(f.store[method](f.aliceContext,a,body,key),op);
});
test('independent authenticated consent writers contend on same sequence; one wins and fresh retry accepts the other role', {timeout:15000},async t=>{
 const f=await procedureFixture(t),a=f.create();await f.complete(a);f.publish(a);const body=f.body(a,{value:'AGREE'}),children=await Promise.all([worker(t,f,a),worker(t,f,a)]);
 const contexts=[f.aliceContext,f.operatorContext];
 const results=await Promise.all(children.map((child,i)=>{const done=once(child,'message');child.send({action:'command',method:'recordReviewConsent',context:contexts[i],applicationId:a,body,key:'race-'+i});return done.then(r=>r[0]);}));
 assert.equal(results.filter(r=>r.ok).length,1);const loser=results.findIndex(r=>!r.ok);assert.match(results[loser].code,/BC_VIEW_STALE/);
 assert.equal(f.view(a).consent.records.length,1);f.consent(a,contexts[loser]);assert.equal(f.view(a).consent.bothCurrent,true);
});
