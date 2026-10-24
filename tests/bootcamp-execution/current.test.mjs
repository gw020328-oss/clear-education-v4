import test from 'node:test';
import assert from 'node:assert/strict';
import {Wallet} from 'ethers';
import {currentFixture} from './current-fixture.mjs';
import {executionFixture,database,dump,H} from './fixture.mjs';
import {createE4CurrentPorts,e4Hash} from '../../src/bootcamp/execution-e4-ports.mjs';

test('E5-B remains unconfigured by default; old metadata status does not grant dispatch',async t=>{
 const f=await executionFixture(t);assert.throws(()=>f.store.execution.connectCurrentController(f.context),/BC_E5_E4_UNCONFIGURED/);
 assert.equal(f.store.execution.status().broadcastImplemented,false);
});
for(const kind of ['PREPARE','ACCEPT'])test(`${kind}: current gate uses E3 records + explicit E4 observation; old fixture ports are not read`,async t=>{
 const f=await currentFixture(t,{kind});f.setHook(()=>{throw Error('OLD_FIXTURE_PORT_MUST_NOT_BE_READ');});
 const before=dump(f,['e3_prepared','e3_procedures','e3_publications','e3_records']);const result=await f.prepare();
 assert.deepEqual(result.command,f.command);assert.equal(result.executionAuthorized,false);assert.equal(result.binding.expiresAt,f.time+30);
 assert.equal(f.metrics.certificates,0);assert.equal(f.metrics.seals,0);assert.deepEqual(dump(f,['e3_prepared','e3_procedures','e3_publications','e3_records']),before);
 const cert=f.connection.controller.readCurrentSync(f.currentRequest(result.binding));assert.equal(cert.payload.bindingHash,e4Hash(result.binding));
 assert.equal(f.connection.worker.status().sourceMode,'SYNTHETIC_TEST_SOURCE');assert.equal(f.store.execution.status().status,'METADATA_ONLY');
 assert.equal(f.connection.worker.dispatch().status,'BLOCKED');assert.equal(f.metrics.dispatches,0);
});
test('connection rejects owner class/DB/key accessors, wrong mode/runtime and async issuer',async t=>{
 const f=await currentFixture(t),base=f.configuration;
 for(const extra of [{sourceMode:'SYNTHETIC_PORT_FIXTURE'},{reader:{...base.reader,db:{}}},{service:Object.assign(Object.create({bytesPath(){}}),base.service)},
  {certificateIssuer:{...base.certificateIssuer,privateKey:'not-a-key'}}])assert.throws(()=>createE4CurrentPorts({...base,...extra}),/BC_E5_E4_/);
 f.configuration.certificateIssuer={certifySync:async payload=>({payload,signature:'invalid'})};f.reconnect();const {binding}=await f.prepare();
 assert.throws(()=>f.connection.controller.readCurrentSync(f.currentRequest(binding)),/BC_E5_ASYNC_TRANSACTION/);
});
test('browser user/session and arbitrary snapshot cannot substitute for internal service/read ticket',async t=>{
 const f=await currentFixture(t);assert.throws(()=>f.store.execution.connectCurrentController(f.aliceContext),/SERVICE_FORBIDDEN/);
 assert.throws(()=>createE4CurrentPorts(f.configuration).consume({observation:f.snapshot()}),/BC_E5_E4_UNTRUSTED_TICKET/);
 assert.deepEqual(Object.keys(f.connection.worker),['status','inspect','prepare','seal','readAcceptedRight','dispatch']);
 for(const secret of ['db','row','verifyBytes','bytesPath','certify','issuer','controller','ownedTestWallet'])assert.equal(f.connection.worker[secret],undefined);
});
test('reader methods are pinned and reads happen outside SQLite transaction',async t=>{
 const f=await currentFixture(t);let release,entered;const started=new Promise(r=>{entered=r;});
 f.readHook(()=>{entered();return new Promise(r=>{release=r;});});const pending=f.prepare();await started;
 database(f,db=>{db.exec('BEGIN IMMEDIATE');db.exec('ROLLBACK');});
 f.configuration.reader.observe=async()=>{throw Error('MUTATED_PROVIDER');};release();assert.ok((await pending).binding);
});
test('unconfigured certificate issuer permits inspection only and never calls seal',async t=>{
 const f=await currentFixture(t,{issuer:false});await f.prepare();await assert.rejects(f.connection.worker.seal(f.h),/BC_E5_CONTROLLER_ISSUER_UNCONFIGURED/);
 assert.equal(f.metrics.seals,0);
});
test('exact request binding and hash challenge reject mutation before certification',async t=>{
 const f=await currentFixture(t),{binding}=await f.prepare();
 for(const patch of [{workerFence:'2'},{expiresAt:binding.expiresAt+1},{e3Commitment:H('forged')},{commandHash:H('forged')}])
  assert.throws(()=>f.connection.controller.readCurrentSync(f.currentRequest({...binding,...patch})),/BC_E5_E4_IMMUTABLE_BINDING/);
 const request=f.currentRequest(binding);request.payload.observationHash=H('wrong');assert.throws(()=>f.connection.controller.readCurrentSync(request),/BC_E5_E4_CURRENT_CHALLENGE/);
 assert.equal(f.metrics.certificates,0);
});
test('source revocation after binding blocks key-adjacent current and persists invalidation',async t=>{
 const f=await currentFixture(t),{binding}=await f.prepare();f.change(f.a,'activity-complete',{rawAvailable:false});
 assert.throws(()=>f.connection.controller.readCurrentSync(f.currentRequest(binding)),/BC_E5_CURRENT_CHANGED|BC_E5_CURRENT_PREPARATION_REQUIRED/);
 assert.equal(f.metrics.certificates,0);assert.ok(database(f,db=>db.prepare('SELECT count(*) n FROM evidence_heads WHERE valid=0').get().n)>0);
});
test('consent withdrawal invalidates current capability',async t=>{
 const f=await currentFixture(t);
 const {binding}=await f.prepare();f.consent(f.a,f.operatorContext,'WITHDRAW');
 assert.throws(()=>f.connection.controller.readCurrentSync(f.currentRequest(binding)),/BC_E5_CURRENT_CHANGED/);assert.equal(f.metrics.certificates,0);
});
test('new substantive objection before prepare blocks despite unchanged E4 business snapshot',async t=>{
 const f=await currentFixture(t),body=f.body(),evidence=f.store.getApplication(f.aliceContext,f.a).evidence[0].record.evidenceId;
 f.store.submitReviewObjection(f.aliceContext,f.a,{expectedRevision:body.expectedRevision,expectedLedgerSequence:body.expectedLedgerSequence,
  targetDecisionId:body.targetDecisionId,targetDecisionRevision:body.targetDecisionRevision,targetDecisionHash:body.targetDecisionHash,reason:'UNRESOLVED_QUESTION',evidenceId:evidence},f.key());
 await assert.rejects(f.prepare(),/BC_E5_OBJECTION_BLOCKED/);assert.equal(f.metrics.certificates,0);
});
for(const change of [o=>{o.business.keyRevoked=true;},o=>{o.business.nonceUsed=true;},o=>{o.business.paused=true;},o=>{o.business.application.epoch='99';},o=>{o.business.application.target.sourceValidUntilExclusive=String(Number(o.business.application.target.sourceValidUntilExclusive)+1);}])
 test('current E4 key/nonce/pause/epoch/source change rejects PREPARE',async t=>{
  const f=await currentFixture(t);change(f.observation);await assert.rejects(f.prepare(),/BC_E5_CHAIN_/);assert.equal(f.metrics.certificates,0);
 });
test('normal block growth requires captured ancestry + same business, never extends original lease/window',async t=>{
 const f=await currentFixture(t),first=await f.prepare();f.setTime(f.time+1);Object.assign(f.observation.checkpoint,{number:'101',hash:H('e4-block-101'),time:String(f.time)});
 assert.throws(()=>f.connection.controller.readCurrentSync(f.currentRequest(first.binding)),/BC_E5_CANONICAL_REVALIDATION_REQUIRED/);
 const next=await f.prepare();assert.deepEqual(next.binding,first.binding);assert.equal(f.metrics.compares,1);
 assert.ok(f.connection.controller.readCurrentSync(f.currentRequest(first.binding)).signature);
 f.setTime(f.time+29);assert.throws(()=>f.connection.controller.readCurrentSync(f.currentRequest(first.binding)),/BC_E5_FENCED|BC_E5_E4_CAPABILITY_EXPIRED/);
});
test('proven reorg durably stops runtime without replacing binding or rebasing generation',async t=>{
 const f=await currentFixture(t),first=await f.prepare(),before=dump(f);f.observation.checkpoint={number:'101',hash:H('new'),time:String(f.time)};
 f.compareHook((from,to)=>({status:'REORG_PROVEN_RECOVERY_BLOCKED',oldHash:from.hash,replacementHash:H('fork'),currentHash:to.hash,commonAncestor:{number:'99',hash:H('ancestor'),time:String(f.time)},automaticRebase:false}));
 assert.equal((await f.prepare()).reason,'RECOVERY_BLOCKED');assert.deepEqual(dump(f).e5_attempts,before.e5_attempts);assert.equal(first.binding.workerFence,'1');
 assert.throws(()=>f.reconnect(),/BC_E5_RUNTIME_SUSPENDED/);const state=f.store.execution.getInternal(f.context,f.i).runtime;assert.equal(state.status,'RECOVERY_BLOCKED');assert.equal(state.generation,1);
});
test('takeover cannot reauthorize old envelope binding or create a new attempt/signature',async t=>{
 const f=await currentFixture(t),first=await f.prepare();f.setTime(f.time+30);
 const h=f.store.execution.acquire(f.other,f.i,{owner:'worker-two',generation:1,expectedFence:1});
 assert.throws(()=>f.connection.controller.readCurrentSync(f.currentRequest(first.binding)),/BC_E5_FENCED/);
 const g=f.store.execution.acquireRuntime(f.other,{owner:'worker-two',expectedFence:1,generation:1,leaseSeconds:30});f.store.execution.bindRuntimeIntent(f.other,g,h);
 const other=f.store.execution.connectCurrentController(f.other,g);
 await assert.rejects(other.worker.prepare(h,other.worker.inspect(h)),/BC_E5_E4_CAPABILITY_EXPIRED/);
 assert.equal(dump(f).e5_attempts.length,1);assert.equal(f.metrics.certificates,0);
});
test('seal returns only ref/hash; API commits immutable original binding and keeps dispatch blocked after restart',async t=>{
 const f=await currentFixture(t),{binding}=await f.prepare();
 const absent={ref:'missing-reference',manifestHash:H('missing')};assert.throws(()=>f.connection.controller.commitCurrentSync(f.commitRequest(binding,absent)),/BC_E5_E4_REFERENCE_NOT_COMMITTED/);
 const result=await f.connection.worker.seal(f.h);assert.equal(result.dispatchAuthorized,false);assert.equal(f.metrics.seals,1);
 f.reconnect();assert.throws(()=>f.connection.controller.commitCurrentSync(f.commitRequest(binding,result)),/BC_E5_GLOBAL_BINDING_REVIEW_REQUIRED/);
 await assert.rejects(f.connection.worker.seal(f.h),/BC_E5_E4_REFERENCE_RECOVER_ONLY/);
 const saved=dump(f);assert.equal(saved.e5_events.filter(r=>r.kind==='E4_SEALED_REFERENCE').length,1);
 assert.equal(JSON.stringify(saved).includes('signature'),false);assert.equal(f.metrics.dispatches,0);
});
test('source/consent change while seal awaits prevents API commit; no automatic reseal',async t=>{
 const f=await currentFixture(t);await f.prepare();f.sealHook(async()=>{f.consent(f.a,f.operatorContext,'WITHDRAW');});
 await assert.rejects(f.connection.worker.seal(f.h),/BC_E5_CURRENT_CHANGED/);
 assert.equal(dump(f).e5_events.filter(r=>r.kind==='E4_SEALED_REFERENCE').length,0);assert.equal(f.metrics.seals,1);
 f.reconnect();await assert.rejects(f.connection.worker.seal(f.h),/BC_E5_E4_SEAL_RECOVERY_REQUIRED/);assert.equal(f.metrics.seals,1);
});
test('post-issuer source recheck prevents a certificate escaping after source revocation',async t=>{
 const f=await currentFixture(t),{binding}=await f.prepare();
 f.certifyHook(()=>f.change(f.a,'activity-complete',{rawAvailable:false}));
 assert.throws(()=>f.connection.controller.readCurrentSync(f.currentRequest(binding)),/BC_E5_CURRENT_CHANGED|BC_E5_CURRENT_PREPARATION_REQUIRED/);
 assert.equal(f.metrics.certificates,1);assert.equal(f.metrics.seals,0);
});
test('removed course operator binding invalidates prior current capability across restart',async t=>{
 const f=await currentFixture(t),{binding}=await f.prepare();f.setOperators([]);f.reconnect();
 assert.throws(()=>f.connection.controller.readCurrentSync(f.currentRequest(binding)),/BC_E5_GLOBAL_BINDING_REVIEW_REQUIRED/);assert.equal(f.metrics.certificates,0);
});
test('scope removal before prepare fails mutual consent even if chain says mutual',async t=>{
 const f=await currentFixture(t);f.setOperators([]);f.reconnect();await assert.rejects(f.prepare(),/BC_E5_MUTUAL_CONSENT_REQUIRED/);
});
test('stored deadline route stays exact and never becomes a new 120/600 window',async t=>{
 const f=await currentFixture(t,{route:'DEADLINE'}),before=structuredClone(f.m),{binding,command}=await f.prepare();
 assert.equal(command.args[1].eligibilityRoute,'2');assert.equal(command.args[1].issuedAt,String(Number(command.args[1].decisionPublishedAt)+120));
 f.setTime(f.time+1);const second=await f.prepare();assert.deepEqual(second.binding,binding);assert.deepEqual(command.args[1],before);
});
test('wrong controller signer or altered signed payload is rejected',async t=>{
 for(const wrong of ['signer','payload']){
  const f=await currentFixture(t),wallet=Wallet.createRandom();
  f.configuration.certificateIssuer={certifySync(payload){return {payload:wrong==='payload'?{...payload,phase:'FORGED'}:payload,signature:wallet.signingKey.sign(e4Hash(payload)).serialized};}};
  f.reconnect();const {binding}=await f.prepare();assert.throws(()=>f.connection.controller.readCurrentSync(f.currentRequest(binding)),wrong==='signer'?/BC_E5_CONTROLLER_SIGNER/:/BC_E5_CONTROLLER_CERTIFICATE/);
 }
});
test('response loss after seal request persists recovery barrier and never retries signing automatically',async t=>{
 const f=await currentFixture(t);await f.prepare();f.sealHook(async()=>{throw Error('OFFLINE_RESPONSE_LOST');});
 await assert.rejects(f.connection.worker.seal(f.h),/OFFLINE_RESPONSE_LOST/);assert.equal(f.metrics.seals,1);
 f.reconnect();await assert.rejects(f.connection.worker.seal(f.h),/BC_E5_E4_SEAL_RECOVERY_REQUIRED/);assert.equal(f.metrics.seals,1);
 assert.equal(dump(f).e5_events.filter(r=>r.kind==='E4_SEAL_REQUESTED').length,1);
});
for(const stage of ['e5-after-current-binding','e5-after-seal-request','e5-after-e4-reference'])test(`${stage}: transaction rollback does not invent a committed capability/reference`,async t=>{
 const f=await currentFixture(t);
 if(stage!=='e5-after-current-binding')await f.prepare();
 f.setFault(s=>{if(s===stage)throw Error('E5_B_INJECTED_ROLLBACK');});
 await assert.rejects(stage==='e5-after-current-binding'?f.prepare():f.connection.worker.seal(f.h),/E5_B_INJECTED_ROLLBACK/);
 const events=dump(f).e5_events;
 assert.equal(events.filter(r=>r.kind===(stage==='e5-after-current-binding'?'E4_CURRENT_BINDING':stage==='e5-after-seal-request'?'E4_SEAL_REQUESTED':'E4_SEALED_REFERENCE')).length,0);
 assert.equal(f.metrics.seals,stage==='e5-after-e4-reference'?1:0);
 if(stage==='e5-after-current-binding')assert.equal(dump(f).e5_attempts.length,0);
 if(stage==='e5-after-e4-reference')assert.equal(events.filter(r=>r.kind==='E4_SEAL_REQUESTED').length,1);
});
test('lease/service expiry during external seal prevents late reference commit',async t=>{
 const f=await currentFixture(t);await f.prepare();f.sealHook(async()=>{f.setTime(f.time+30);});
 await assert.rejects(f.connection.worker.seal(f.h),/BC_E5_FENCED/);assert.equal(dump(f).e5_events.filter(r=>r.kind==='E4_SEALED_REFERENCE').length,0);
});
test('same-height hash conflict is not accepted on a claimed canonical proof',async t=>{
 const f=await currentFixture(t);await f.prepare();f.observation.checkpoint.hash=H('different-hash-same-height');
 // An actually registered reader must reject this proof; API additionally checks
 // same-height identity so even a malformed provider result cannot excuse it.
 await assert.rejects(f.prepare(),/BC_E5_E4_ANCESTRY/);
});
test('stored accepted right and SETTLED readback survive source/key/epoch/pause expiry; no claim operation invented',async t=>{
 const f=await currentFixture(t,{kind:'ACCEPT'});await f.prepare();f.setTime(f.time+1000);f.change(f.a,'activity-complete',{rawAvailable:false});
 const b=f.observation.business;Object.assign(b.application,{state:'5',version:'5',epoch:'99',currentMet:false});b.paused=true;b.keyRevoked=true;b.nonceUsed=true;
 b.right={recipient:f.m.recipient,token:f.m.token,amountAtoms:f.m.amountAtoms,allocationId:f.m.allocationId,authorizationDigest:f.digest,nonce:f.m.nonce,signerKeyId:f.m.signerKeyId,
  authorizationEpoch:f.m.authorizationEpoch,acceptedAt:f.m.issuedAt,settledAt:'0'};
 f.observation.checkpoint={number:'101',hash:H('accepted-block'),time:String(f.time)};
 f.reconnect();
 const accepted=await f.connection.worker.readAcceptedRight(f.h);assert.equal(accepted.status,'ACCEPTED');assert.equal(accepted.claimOperationId,null);
 assert.equal(accepted.requiresCurrentSource,false);assert.equal(accepted.requiresCurrentSigner,false);assert.equal(accepted.claimExpiresAt,null);
 b.application.state='6';b.application.version='6';b.right.settledAt=String(f.time+1);b.accounting={B:'50000000',R:'0',O:'100000000',A:'50000000',U:'100000000',S:'50000000',surplus:'0'};
 f.observation.checkpoint={number:'102',hash:H('settled-block'),time:String(f.time+1)};
 const settled=await f.connection.worker.readAcceptedRight(f.h);assert.equal(settled.status,'SETTLED');assert.equal(settled.receiptVerified,false);
 assert.equal(settled.automaticClaimImplemented,false);assert.equal(f.metrics.certificates,0);assert.equal(f.metrics.seals,0);
});
test('unregistered or wrong recipient accepted right never becomes readback',async t=>{
 const f=await currentFixture(t);f.observation.business.application.state='5';
 await assert.rejects(f.connection.worker.readAcceptedRight(f.h),/BC_E5_UNREGISTERED_RIGHT/);
});
test('service authority shortening during final commit rolls back current binding',async t=>{
 const f=await currentFixture(t);let count=0;
 f.ports.authorizeService=function(context,request){if(request.action==='E4_BIND_CURRENT')count++;return {serviceId:'worker-one',runtimeId:this.runtimeId,expiresAt:f.time+(request.action==='E4_BIND_CURRENT'&&count===2?10:120)};};
 f.reconnect();count=0;
 await assert.rejects(f.prepare(),/BC_E5_SERVICE_AUTHORITY/);
 assert.equal(dump(f).e5_events.filter(r=>r.kind==='E4_CURRENT_BINDING').length,0);
});
test('reader or seal response carrying private/wire-only fields is rejected before persistence',async t=>{
 const f=await currentFixture(t);f.configuration.service={...f.configuration.service,seal:async()=>({ref:'env-offline',manifestHash:H('manifest'),rawTransaction:'not-a-transaction'})};
 f.reconnect();await f.prepare();await assert.rejects(f.connection.worker.seal(f.h),/BC_E5_E4_SEALED_REFERENCE/);
 assert.equal(dump(f).e5_events.filter(r=>r.kind==='E4_SEALED_REFERENCE').length,0);
 const o=f.observation;o.business.application.verified=true;
 await assert.rejects(f.prepare(),/BC_E5_E4_APPLICATION/);
});
