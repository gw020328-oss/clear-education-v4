import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createServer,request as httpRequest} from 'node:http';
import {once} from 'node:events';
import {createBootcampHandler} from '../../src/bootcamp/http.mjs';
import {createNormalBootcampClient} from '../../src/bootcamp/normal-client.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
import {procedureFixture,START} from './procedure-fixture.mjs';

const read=(f,a,context=f.aliceContext,decisionId)=>f.store.getDecisionEvidence(context,a,decisionId);
const snapshot=f=>readFileSync(join(f.directory,'bootcamp.sqlite'));
test('S4 exact decision/evidence snapshot, four allowlisted checks, stable manifest and zero query writes or source calls',async t=>{
 const f=await procedureFixture(t),a=f.create();await f.complete(a);
 const original=f.store.getApplication(f.aliceContext,a),d=original.decision.record;
 f.configuration.resolveSource=()=>{throw Error('QUERY_MUST_NOT_CALL_SOURCE');};
 for(const p of Object.values(f.configuration.producers))for(const k of ['verify','recheck'])p[k]=()=>{throw Error('QUERY_MUST_NOT_CALL_PRODUCER');};
 f.configuration.procedurePorts.funding=()=>{throw Error('QUERY_MUST_NOT_CALL_EXECUTION');};f.restart();
 const before=snapshot(f),counts=f.counts(),s=read(f,a),o=read(f,a,f.operatorContext);
 assert.deepEqual(s.manifest,o.manifest);assert.equal(o.role,'COURSE_OPERATOR');
 assert.equal(s.manifest.decision.decisionId,d.decisionId);assert.equal(s.manifest.decision.decisionRevision,d.decisionRevision);assert.equal(s.manifest.decision.decisionHash,d.decisionHash);
 assert.equal(s.manifestHash,p0Hash('EVIDENCE-MANIFEST',s.manifest));
 assert.deepEqual(s.manifest.criteria.map(r=>r.evidenceId),d.criterionResults.map(r=>r.evidenceId));
 const reflection=s.manifest.criteria[2];assert.equal(reflection.checks.modelVersion.status,'UNAVAILABLE');assert.equal(reflection.checks.rubricVersion.value,null);
 assert.equal(reflection.checks.topics.length,3);assert.equal(reflection.checks.topics[0].location.evidenceId,reflection.evidenceId);
 assert.equal(s.manifest.criteria[3].checks.accountProofHash,original.evidence.find(r=>r.record.criterionId==='python-basic-certificate').record.facts.accountProofHash);
 assert.equal(s.availability.every(r=>r.status==='VALID_AS_RECORDED'&&r.sourceCurrentness==='UNKNOWN'&&!r.original.httpAvailable),true);
 assert.deepEqual(s.limitations,{hashProvesSourceTruth:false,independentReverificationAvailable:false,liveSourceChecked:false,originalTextHttpAvailable:false,usableForPayment:false});
 assert.deepEqual(snapshot(f),before);assert.deepEqual(f.counts(),counts);
 f.setTime(START+302);const expired=read(f,a);assert.equal(expired.availability.every(r=>r.status==='EXPIRED'),true);
 assert.equal(expired.availability.every(r=>r.original.status==='UNAVAILABLE'&&r.original.expiresAt>START+302),true);
 assert.equal(expired.currentDecision.matchesRequestedDecision,true);assert.equal(expired.manifestHash,s.manifestHash);
 assert.deepEqual(snapshot(f),before);assert.deepEqual(f.counts(),counts);
 const text=JSON.stringify(s);
 for(const forbidden of [f.aliceContext.token,f.alice.address.toLowerCase(),f.directory,'accountBindingRef','sourceUsernameHash','claimOwnerHash','originalEvidenceLocator','rawLocator','ledgerNonceHash','expectedClaimOwnerHash','originalBody"','signature"','cookie','privateKey'])assert.equal(text.includes(forbidden),false,forbidden);
 for(const e of original.evidence)for(const v of Object.values(e.record.source))assert.equal(text.includes('"'+v+'"'),false);
});
test('S4 preserves historical targets, missing/deleted/superseded sources and restart without reviving original text',async t=>{
 const f=await procedureFixture(t),a=f.create(),initial=read(f,a);
 assert.equal(initial.availability.every(r=>r.status==='MISSING'),true);
 await f.complete(a);const before=read(f,a),d=before.manifest.decision;
 f.store.invalidate(f.aliceContext,a,{criterionId:'reflection-topics',reason:'DELETED',expectedRevision:f.store.getApplication(f.aliceContext,a).revision},f.key());
 const deleted=read(f,a,f.operatorContext,d.decisionId);
 assert.equal(deleted.currentDecision.matchesRequestedDecision,false);assert.equal(deleted.availability[2].status,'DELETED');
 assert.deepEqual(deleted.manifest,before.manifest);
 await f.accept(a,'activity-complete');const old=read(f,a,f.aliceContext,d.decisionId);
 assert.equal(old.availability[0].status,'SUPERSEDED');assert.equal(old.manifestHash,before.manifestHash);
 f.restart();assert.deepEqual(read(f,a,f.aliceContext,d.decisionId).manifest,before.manifest);
 const missing=read(f,a,f.aliceContext,initial.manifest.decision.decisionId);assert.equal(missing.availability.every(r=>r.status==='MISSING'),true);
});
test('S4 owner/course isolation and exact application/decision relation',async t=>{
 const f=await procedureFixture(t),a=f.create(),b=f.create(f.bobContext),bd=read(f,b,f.bobContext).manifest.decision.decisionId;
 assert.throws(()=>read(f,a,f.bobContext),/FORBIDDEN/);assert.throws(()=>read(f,b,f.operatorContext,read(f,a).manifest.decision.decisionId),/BC_NOT_FOUND/);
 assert.throws(()=>read(f,a,f.aliceContext,bd),/BC_NOT_FOUND/);
 f.configuration.operatorBindings=[{wallet:f.operator.address,courseOperatorRef:'another-course'}];f.restart();
 assert.throws(()=>read(f,a,f.operatorContext),/FORBIDDEN/);
 assert.equal(read(f,a).role,'PARTICIPANT');
});
test('S4 final authentication/course scope, clock reversal and rollover fail closed without writes',async t=>{
 const f=await procedureFixture(t),a=f.create();let n=0;
 f.configuration.resolveOperatorBindings=()=>++n===1?[{wallet:f.operator.address.toLowerCase(),courseOperatorRef:'course-operator-demo'}]:[];f.restart();
 const before=snapshot(f);assert.throws(()=>read(f,a,f.operatorContext),/FORBIDDEN/);assert.deepEqual(snapshot(f),before);
 f.configuration.resolveOperatorBindings=()=>{if(++n===2)f.service.logout(f.aliceContext);return [];};n=0;f.restart();
 assert.throws(()=>read(f,a),/AUTH_REQUIRED/);assert.deepEqual(snapshot(f),before);
 const context=await f.login(f.alice);f.configuration.resolveOperatorBindings=null;f.configuration.now=()=>START-1;f.restart();
 assert.throws(()=>read(f,a,context),/BC_CLOCK_REVERSED/);
 let clock=START;f.configuration.now=()=>clock++;f.restart();assert.throws(()=>read(f,a,context),/BC_VIEW_STALE/);
 assert.deepEqual(snapshot(f),before);
});
test('S4 absent stored evidence metadata is explicit UNAVAILABLE, never replaced by current head',async t=>{
 const f=await procedureFixture(t),a=f.create();await f.complete(a);const d=read(f,a).manifest.decision.decisionId;
 // Synthetic corruption fixture only; no product deletion or schema policy change.
 const db=new DatabaseSync(join(f.directory,'bootcamp.sqlite'));
 try{db.exec('PRAGMA foreign_keys=OFF; DROP TRIGGER evidence_no_delete');db.prepare('DELETE FROM evidence WHERE criterion_id=?').run('assignment-submitted');}finally{db.close();}
 const r=read(f,a,f.aliceContext,d);assert.equal(r.manifest.criteria[1].metadataStatus,'UNAVAILABLE');assert.equal(r.availability[1].status,'UNAVAILABLE');assert.equal(r.manifest.criteria[1].source,null);
});
test('S4 authenticated HTTP and normal client GET only, safe errors and no normal refresh callback',async t=>{
 const f=await procedureFixture(t),a=f.create();await f.complete(a);
 const server=createServer(createBootcampHandler(f.store,{allowLoopbackHttpForTests:true,normalUi:{refreshProcedure(){throw Error('NO_REFRESH');}}}));
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
 const request=(path,{context=f.aliceContext,method='GET'}={})=>new Promise((resolve,reject)=>{
  const r=httpRequest({hostname:'127.0.0.1',port:server.address().port,path,method,headers:{host:'clear.example.invalid',origin:f.config.origin,
   cookie:'__Host-clear-session='+context.token,'x-wallet':context.wallet,'x-chain-id':String(context.chainId),'x-csrf-token':context.csrf,'content-type':'application/json'}},res=>{
   const chunks=[];res.on('data',p=>chunks.push(p));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:JSON.parse(Buffer.concat(chunks))}));
  });r.on('error',reject);r.end(method==='POST'?'{}':undefined);
 });
 const before=snapshot(f),base='/bootcamp/v3/applications/'+a+'/decision-evidence';
 const response=await request(base);assert.equal(response.status,200);assert.equal(response.headers['cache-control'],'no-store');
 const d=response.body.manifest.decision.decisionId;assert.deepEqual((await request(base+'/'+d,{context:f.operatorContext})).body.manifest,response.body.manifest);
 assert.equal((await request(base,{context:f.bobContext})).status,403);assert.equal((await request(base+'/decision-missing')).status,404);
 assert.equal((await request(base,{method:'POST'})).status,404);assert.equal((await request(base+'?decisionId='+d)).status,404);
 assert.deepEqual(snapshot(f),before);
 let last;const client=createNormalBootcampClient({request:async(path,options)=>{last={path,options};const r=await request(path);if(r.status!==200)throw Error(r.body.error);return r.body;}});
 const controller=new AbortController();const result=await client.decisionEvidence(a,{decisionId:d,signal:controller.signal});assert.deepEqual(result.manifest,response.body.manifest);
 assert.equal(last.path,base+'/'+d);assert.equal(last.options.signal,controller.signal);assert.equal(last.options.method,undefined);
 const bad=createNormalBootcampClient({request:async()=>({...response.body,applicationId:'application-other'})});await assert.rejects(()=>bad.decisionEvidence(a),/BC_NORMAL_DECISION_EVIDENCE/);
 const wrong=createNormalBootcampClient({request:async()=>response.body});await assert.rejects(()=>wrong.decisionEvidence(a,{decisionId:'decision-other'}),/BC_NORMAL_DECISION_EVIDENCE/);
});
