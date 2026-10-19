import test from 'node:test';
import assert from 'node:assert/strict';
import {executionFixture,database,dump,H} from './fixture.mjs';
import {createExecutionWorker} from '../../src/bootcamp/execution-worker.mjs';
import {validateObservation,validateEnvelope} from '../../src/bootcamp/execution-ports.mjs';
import {hashTestUnsignedPayload} from '../../src/bootcamp-authorization/test-encoding-v3.mjs';

test('no services: default blocks enqueue and worker without reader/signature/dispatch',async t=>{
 const f=await executionFixture(t,{configured:false});assert.equal(f.store.execution.status().status,'UNCONFIGURED');
 assert.throws(()=>f.enqueue(),/BC_E5_UNCONFIGURED/);
 const worker=createExecutionWorker({execution:f.store.execution,serviceContext:f.context,owner:'worker-one'});
 assert.deepEqual(await worker.inspect('unknown-intent'),{status:'BLOCKED',reason:'UNCONFIGURED'});
 assert.deepEqual(f.metrics,{authorizations:0,reads:0,lookups:0,signatures:0,broadcasts:0});assert.equal(dump(f).e5_intents.length,0);
});
test('constructor rejects fixture relabel and command cannot carry browser verified/receipt/raw fields',async t=>{
 const f=await executionFixture(t);f.configuration.executionServices={...f.ports,version:'SYNTHETIC_PORT_FIXTURE'};
 assert.throws(()=>f.open(),/BC_E5_PORT_CONFIGURATION/);
 for(const extra of [{verified:true},{receiptHash:H('forged')},{signature:'must-not-be-stored'},{rawTransaction:'must-not-be-stored'}])assert.throws(()=>f.enqueue(extra),/BC_E5_COMMAND_BODY/);
 assert.equal(dump(f).e5_intents.length,0);
});
test('intent and receipt are atomic; retry same op/body preserves immutable receipt after restart',async t=>{
 const f=await executionFixture(t),body=f.body(),key=f.key(),first=f.store.execution.enqueue(f.aliceContext,f.a,body,key),before=dump(f);
 f.restart();const retry=f.store.execution.enqueue(f.aliceContext,f.a,body,key);assert.deepEqual(retry.receipt,first.receipt);assert.deepEqual(dump(f),before);
 const another=f.store.execution.enqueue(f.operatorContext,f.a,body,f.key());assert.equal(another.outbox.intent.intentId,first.outbox.intent.intentId);
 assert.equal(dump(f).e5_intents.length,1);assert.equal(dump(f).e5_receipts.length,2);
});
for(const stage of ['e5-after-intent','e5-after-receipt'])test(`${stage} rollback stores neither half and preserves E3 bytes`,async t=>{
 const f=await executionFixture(t),before=dump(f),legacy=dump(f,['e3_procedures','e3_publications','e3_records','e3_ids','e3_prepared','commands']);
 f.configuration.fault=s=>{if(s===stage)throw Error('INJECTED_E5_FAULT');};f.restart();assert.throws(()=>f.enqueue(),/INJECTED_E5_FAULT/);
 assert.deepEqual(dump(f),before);assert.deepEqual(dump(f,['e3_procedures','e3_publications','e3_records','e3_ids','e3_prepared','commands']),legacy);
 f.configuration.fault=()=>{};f.restart();assert.ok(f.enqueue().receipt.operationReceiptId);
});
test('same key/different body and same operation/different caller/version/payload conflict',async t=>{
 const f=await executionFixture(t),body=f.body(),key=f.key();f.store.execution.enqueue(f.aliceContext,f.a,body,key);
 assert.throws(()=>f.store.execution.enqueue(f.aliceContext,f.a,{...body,expectedChainVersion:'5'},key),/BC_E5_IDEMPOTENCY_CONFLICT/);
 for(const extra of [{caller:'0x'+'55'.repeat(20)},{expectedChainVersion:'5'},{payloadHash:H('other-payload')}])
  assert.throws(()=>f.store.execution.enqueue(f.aliceContext,f.a,{...body,...extra},f.key()),/BC_E5_OPERATION_CONFLICT/);
 assert.equal(dump(f).e5_intents.length,1);
});
test('user scope and worker authority are separate; user cookie and forged service object cannot acquire',async t=>{
 const f=await executionFixture(t),i=f.enqueue().receipt.intentId;
 assert.throws(()=>f.store.execution.get(f.bobContext,f.a,i),/FORBIDDEN/);
 for(const context of [f.aliceContext,{},Object.freeze({serviceId:'worker-one'})])
  assert.throws(()=>f.store.execution.acquire(context,i,{owner:'worker-one',generation:1}),/SERVICE_FORBIDDEN/);
 assert.throws(()=>f.store.execution.acquire(f.context,i,{owner:'worker-two',generation:1}),/BC_E5_SERVICE_AUTHORITY/);
 const serialized=JSON.stringify(dump(f));assert.equal(serialized.includes(f.aliceContext.token),false);
 assert.equal(serialized.includes('csrf'),false);
});
test('authority revoked during final check rolls back intent and receipt',async t=>{
 const f=await executionFixture(t),original=f.configuration.authentication,body=f.body();
 let calls=0;f.configuration.authentication={authorizeWorkflow(context,write){const result=original.authorizeWorkflow(context,write);if(++calls===2)throw Error('AUTH_REVOKED');return result;}};
 f.restart();calls=0;assert.throws(()=>f.store.execution.enqueue(f.aliceContext,f.a,body,f.key()),/AUTH_REVOKED/);
 assert.equal(dump(f).e5_intents.length,0);assert.equal(dump(f).e5_receipts.length,0);
});
test('ACCEPT metadata binds the stored unsigned digest; no signature or nonce consumption',async t=>{
 const f=await executionFixture(t);f.consent(f.a);f.consent(f.a,f.operatorContext);const prepared=f.prepare(f.a).record.target.preparationId;
 const target=f.store.inspectPreparedForE4(f.operatorContext,f.a,prepared),digest=hashTestUnsignedPayload({domain:target.payload.domain,message:target.payload.message}).digest;
 assert.throws(()=>f.enqueue({kind:'ACCEPT'}),/BC_E5_PREPARATION_REQUIRED/);
 assert.throws(()=>f.enqueue({kind:'ACCEPT',preparationId:prepared,authorizationDigest:H('forged-digest')}),/BC_E5_AUTHORIZATION_DIGEST/);
 const result=f.enqueue({kind:'ACCEPT',preparationId:prepared,authorizationDigest:digest});assert.equal(result.outbox.intent.authorizationDigest,digest);
 assert.equal(result.outbox.paymentAuthority,false);assert.equal(f.metrics.signatures,0);
});
test('two connections contend on lease; heartbeat changes no business or execution sequence',async t=>{
 const f=await executionFixture(t),i=f.enqueue().receipt.intentId,h=f.acquire(i),sequence=f.view(f.a).ledgerSequence,executionSequence=f.store.execution.get(f.aliceContext,f.a,i).executionSequence;
 const other=f.open();t.after(()=>other.close());
 assert.throws(()=>other.execution.acquire(f.other,i,{owner:'worker-two',generation:1}),/BC_E5_LEASE_BUSY/);
 f.setTime(f.time+1);const next=f.store.execution.heartbeat(f.context,h);assert.equal(f.view(f.a).ledgerSequence,sequence);
 assert.equal(f.store.execution.get(f.aliceContext,f.a,i).executionSequence,executionSequence);
 assert.deepEqual(next,h);assert.ok(f.inspect(h).businessHash);
});
test('lease takeover rejects late old worker and reuses operation/attempt without fee/new-op path',async t=>{
 const f=await executionFixture(t),i=f.enqueue().receipt.intentId,h=f.acquire(i);await f.observe(h);
 const first=f.store.execution.beginAttempt(f.context,h,f.inspect(h));f.setTime(f.time+30);
 const h2=f.store.execution.acquire(f.other,i,{owner:'worker-two',generation:1,expectedFence:1});
 assert.throws(()=>f.inspect(h),/BC_E5_FENCED/);
 const same=f.store.execution.beginAttempt(f.other,h2,f.store.execution.inspect(f.other,h2));assert.deepEqual(same,first);
 assert.equal(dump(f).e5_intents.length,1);assert.equal(dump(f).e5_attempts.length,1);assert.equal(f.metrics.broadcasts,0);
});
test('reversed server time cannot revive a lease',async t=>{
 const f=await executionFixture(t),i=f.enqueue().receipt.intentId,h=f.acquire(i);f.setTime(f.time+5);f.inspect(h);f.setTime(f.time-1);
 assert.throws(()=>f.inspect(h),/BC_CLOCK_REVERSED|BC_E5_CLOCK_REVERSED/);
});
test('reader await holds no DB lock; consent change during read invalidates fresh CAS',async t=>{
 const f=await executionFixture(t),i=f.enqueue().receipt.intentId,h=f.acquire(i);let release,started;
 const entered=new Promise(r=>{started=r;});f.setReadHook(()=>{started();return new Promise(r=>{release=r;});});
 const pending=f.observe(h);await entered;
 database(f,db=>{db.exec('BEGIN IMMEDIATE');db.exec('ROLLBACK');});
 f.consent(f.a,f.aliceContext,'WITHDRAW');release();await assert.rejects(pending,/BC_E5_CURRENT_CHANGED/);assert.equal(dump(f).e5_observations.length,0);
});
test('expired/taken-over worker cannot commit late reader response',async t=>{
 const f=await executionFixture(t),i=f.enqueue().receipt.intentId,h=f.acquire(i);let release,started;
 const entered=new Promise(r=>{started=r;});f.setReadHook(()=>{started();return new Promise(r=>{release=r;});});
 const pending=f.observe(h);await entered;f.setTime(f.time+30);
 f.store.execution.acquire(f.other,i,{owner:'worker-two',generation:1,expectedFence:1});release();await assert.rejects(pending,/BC_E5_FENCED/);
 assert.equal(dump(f).e5_observations.length,0);
});
test('service revocation during reader await rejects result; reader errors neither rebase nor allocate new op',async t=>{
 const f=await executionFixture(t),i=f.enqueue().receipt.intentId,h=f.acquire(i);f.setReadHook(async()=>{throw Error('OFFLINE_READER_UNAVAILABLE');});
 await assert.rejects(f.observe(h),/OFFLINE_READER_UNAVAILABLE/);assert.equal(f.store.execution.get(f.aliceContext,f.a,i).runtime.generation,1);
 f.setReadHook(async()=>f.revoke());await assert.rejects(f.observe(h),/SERVICE_FORBIDDEN/);assert.equal(dump(f).e5_observations.length,0);assert.equal(dump(f).e5_intents.length,1);
});
test('chain grows without permanent block; measured B/R/O shows shortfall50 after first100 reservation',async t=>{
 const f=await executionFixture(t),i=f.enqueue().receipt.intentId,h=f.acquire(i);await f.observe(h);
 f.chain.checkpoint={...f.chain.checkpoint,blockNumber:'101',parentHash:f.chain.checkpoint.blockHash,blockHash:H('block-101')};
 const next=await f.observe(h);assert.equal(next.runtime.status,'ACTIVE');assert.equal(next.observed.accounting.S,'50000000');
 assert.equal(next.observed.accounting.A,'50000000');assert.equal(dump(f).e5_observations.length,2);
 f.chain.accounting={B:'200000000',R:'100000000',O:'200000000',A:'100000000',U:'100000000',S:'0'};
 f.chain.checkpoint={...f.chain.checkpoint,blockNumber:'102',blockHash:H('block-102')};assert.equal((await f.observe(h)).observed.accounting.S,'0');
});
test('accounting/queue arithmetic and forbidden public finality are rejected',async t=>{
 const f=await executionFixture(t),o=structuredClone(f.chain);o.accounting.S='0';assert.throws(()=>validateObservation(o),/BC_E5_ACCOUNTING/);
 o.accounting=f.chain.accounting;o.checkpoint.finality={kind:'FINALIZED',evidenceHash:H('unsupported-public-finality')};assert.throws(()=>validateObservation(o),/BC_E5_FINALITY/);
 o.checkpoint.finality=f.chain.checkpoint.finality;o.queue=[...o.queue,{applicationId:H('third'),acceptanceSequence:'1'}];assert.throws(()=>validateObservation(o),/BC_E5_QUEUE_ORDER/);
});
for(const finalized of [false,true])test(`lower version suspends old lineage, finalized=${finalized}`,async t=>{
 const f=await executionFixture(t),i=f.enqueue().receipt.intentId,h=f.acquire(i);
 if(finalized)f.chain.checkpoint.finality={kind:'LOCAL_FINALIZED',evidenceHash:H('local-finality-policy')};await f.observe(h);
 const before=dump(f).e5_observations;f.chain.application.version='2';f.chain.application.epoch='1';
 f.chain.checkpoint={...f.chain.checkpoint,blockNumber:'101',blockHash:H('alternate-101')};
 const result=await f.observe(h);assert.equal(result.reason,finalized?'FINALIZED_CONFLICT':'REORG_EVIDENCE_REQUIRED');
 const view=f.store.execution.get(f.aliceContext,f.a,i);assert.equal(view.runtime.generation,1);assert.equal(view.observationCurrent,false);
 assert.deepEqual(dump(f).e5_observations,before);assert.equal(dump(f).e5_events.at(-1).kind,'RUNTIME_SUSPENDED');assert.throws(()=>f.inspect(h),/BC_E5_RUNTIME_SUSPENDED/);
});
test('no ancestry service: rebase request suspends without rewriting epoch/version or history',async t=>{
 const f=await executionFixture(t),i=f.enqueue().receipt.intentId,h=f.acquire(i);await f.observe(h);const old=dump(f).e5_observations;
 const result=f.store.execution.requestRebase(f.context,i);assert.equal(result.reason,'REORG_EVIDENCE_REQUIRED');
 assert.deepEqual(dump(f).e5_observations,old);assert.equal(f.store.execution.get(f.aliceContext,f.a,i).runtime.generation,1);
});
test('restored allocation later than fixed publication is RECOVERY_BLOCKED; firstStart/120/600 unchanged',async t=>{
 const f=await executionFixture(t),before=f.view(f.a),i=f.enqueue().receipt.intentId,h=f.acquire(i);
 f.chain.application.state='RESERVED';f.chain.application.firstStartedAt='0';f.chain.application.publishedAt='0';f.chain.application.allocatedAt=String(f.time+1);
 assert.equal((await f.observe(h)).reason,'RECOVERY_BLOCKED');const after=f.view(f.a);
 assert.deepEqual(after.procedure,before.procedure);assert.equal(after.procedure.reviewCapAt,after.procedure.firstStartedAt+600);
});
test('canonical accepted/SETTLED rights remain readable after source/key expiry and backend restart',async t=>{
 const f=await executionFixture(t),i=f.enqueue().receipt.intentId,h=f.acquire(i),old=structuredClone(f.chain.application);
 f.chain.application.state='ACCEPTED';f.chain.application.version='5';f.chain.authorization.signerActive=false;
 f.chain.right={recipient:old.recipient,token:old.token,amountAtoms:'100000000',allocationId:old.allocationId,authorizationDigest:H('accepted-digest'),nonce:H('used-auth-nonce'),settledAt:'0'};
 f.setTime(f.time+301);const h2=f.acquire(i,{expectedFence:1});const accepted=await f.observe(h2);
 assert.equal(accepted.observed.acceptedRight.requiresCurrentSource,false);assert.equal(accepted.observed.acceptedRight.requiresNewPaymentSignature,false);
 f.chain.application.state='SETTLED';f.chain.application.version='6';f.chain.right.settledAt=String(f.time);
 f.chain.checkpoint={...f.chain.checkpoint,blockNumber:'101',blockHash:H('settled-101')};await f.observe(h2);f.restart();
 const settled=f.store.execution.get(f.operatorContext,f.a,i);assert.equal(settled.observed.acceptedRight.claimState,'CLAIMED');
 assert.equal(settled.observed.acceptedRight.claimExpiresAt,null);assert.equal(f.metrics.signatures,0);assert.equal(f.metrics.broadcasts,0);
});
test('DB termination metadata never releases reservation or resets immutable procedure',async t=>{
 const f=await executionFixture(t),p=dump(f,['e3_procedures','e3_publications']),i=f.enqueue({kind:'TERMINATE'}).receipt.intentId,h=f.acquire(i);
 const result=await f.observe(h);assert.equal(result.reservationReleased,false);assert.equal(result.observed.accounting.R,'100000000');
 assert.deepEqual(dump(f,['e3_procedures','e3_publications']),p);
});
test('exact private envelope manifest commits before confirmation; duplicate lookup is idempotent; no dispatch authorization',async t=>{
 const f=await executionFixture(t),i=f.enqueue().receipt.intentId,h=f.acquire(i);await f.observe(h);const attempt=f.store.execution.beginAttempt(f.context,h,f.inspect(h));
 const m=f.setManifest(i,h,attempt),first=await f.store.execution.attachEnvelope(f.context,h,f.inspect(h),m.envelopeRef),before=dump(f);
 assert.equal(first.dispatchAuthorized,false);assert.deepEqual(await f.store.execution.attachEnvelope(f.context,h,f.inspect(h),m.envelopeRef),first);assert.deepEqual(dump(f),before);
 f.restart();assert.deepEqual(f.store.execution.confirmEnvelopeCommit(f.context,h,m.envelopeRef,m.manifestHash),first);
 assert.equal(f.metrics.signatures,0);assert.equal(f.metrics.broadcasts,0);assert.equal(JSON.stringify(dump(f)).includes('rawTransaction'),false);
});
test('different calldata/signature digest under same op cannot replace committed envelope',async t=>{
 const f=await executionFixture(t),i=f.enqueue().receipt.intentId,h=f.acquire(i);await f.observe(h);const attempt=f.store.execution.beginAttempt(f.context,h,f.inspect(h));
 const m=f.setManifest(i,h,attempt);await f.store.execution.attachEnvelope(f.context,h,f.inspect(h),m.envelopeRef);const before=dump(f).e5_envelopes;
 f.setManifest(i,h,attempt,{calldataHash:H('different-signature-bytes'),commandDigest:H('different-command')});
 await assert.rejects(f.store.execution.attachEnvelope(f.context,h,f.inspect(h),m.envelopeRef),/BC_E5_OPERATION_CONFLICT/);assert.deepEqual(dump(f).e5_envelopes,before);
 assert.throws(()=>validateEnvelope({...m,rawTransaction:'not-permitted'}),/BC_E5_ENVELOPE/);
});
test('envelope commit fault rolls back ref; current source/lease change during lookup rejects result',async t=>{
 const f=await executionFixture(t),i=f.enqueue().receipt.intentId,h=f.acquire(i);await f.observe(h);const attempt=f.store.execution.beginAttempt(f.context,h,f.inspect(h));
 const m=f.setManifest(i,h,attempt);f.configuration.fault=s=>{if(s==='e5-after-envelope')throw Error('COMMIT_CRASH');};f.restart();
 await assert.rejects(f.store.execution.attachEnvelope(f.context,h,f.inspect(h),m.envelopeRef),/COMMIT_CRASH/);assert.equal(dump(f).e5_envelopes.length,0);
 f.configuration.fault=()=>{};f.restart();f.setLookupHook(async()=>f.consent(f.a,f.aliceContext,'WITHDRAW'));
 await assert.rejects(f.store.execution.attachEnvelope(f.context,h,f.inspect(h),m.envelopeRef),/BC_E5_CURRENT_CHANGED/);assert.equal(dump(f).e5_envelopes.length,0);
});
test('worker foundation observes only and exposes explicit pending E4 handoff',async t=>{
 const f=await executionFixture(t),i=f.enqueue().receipt.intentId;
 const worker=createExecutionWorker({execution:f.store.execution,serviceContext:f.context,owner:'worker-one'}),result=await worker.inspect(i);
 assert.equal(result.status,'AWAITING_E4_HANDOFF');assert.equal(result.current.executionAuthorized,false);
 assert.equal(result.signatures,0);assert.equal(result.broadcasts,0);assert.equal(f.metrics.reads,1);assert.equal(f.metrics.lookups,0);
});
test('same block cannot report different accounting; advancing without authenticated ancestry suspends',async t=>{
 const f=await executionFixture(t),i=f.enqueue().receipt.intentId,h=f.acquire(i);await f.observe(h);
 f.chain.accounting={B:'200000000',R:'100000000',O:'200000000',A:'100000000',U:'100000000',S:'0'};
 await assert.rejects(f.observe(h),/BC_E5_SAME_BLOCK_CONFLICT/);assert.equal(dump(f).e5_observations.length,1);
 f.chain.checkpoint={...f.chain.checkpoint,blockNumber:'101',blockHash:H('new-but-unproven')};
 f.chain.ancestry={fromBlockHash:H('block-100'),relation:'UNPROVEN',evidenceHash:null,finalizedBlockHash:null,finalizedRelation:'NONE'};
 assert.equal((await f.observe(h)).reason,'REORG_EVIDENCE_REQUIRED');assert.equal(dump(f).e5_observations.length,1);
});
test('finalized anchor survives later INCLUDED observations and conflicting fork halts',async t=>{
 const f=await executionFixture(t),i=f.enqueue().receipt.intentId,h=f.acquire(i);f.chain.checkpoint.finality={kind:'LOCAL_FINALIZED',evidenceHash:H('finality-proof')};await f.observe(h);
 f.chain.checkpoint={blockNumber:'101',blockHash:H('included-101'),parentHash:H('block-100'),finality:{kind:'INCLUDED',evidenceHash:null}};await f.observe(h);
 f.chain.checkpoint={...f.chain.checkpoint,blockNumber:'102',blockHash:H('conflicting-102')};
 f.chain.ancestry={fromBlockHash:H('included-101'),relation:'DIVERGED',evidenceHash:H('verified-ancestry-conflict'),finalizedBlockHash:H('block-100'),finalizedRelation:'DIVERGED'};
 assert.equal((await f.observe(h)).reason,'FINALIZED_CONFLICT');assert.equal(dump(f).e5_observations.length,2);
});
test('service metadata survives participant logout; no user token is used as worker authority',async t=>{
 const f=await executionFixture(t),i=f.enqueue().receipt.intentId;f.service.logout(f.aliceContext);
 const worker=createExecutionWorker({execution:f.store.execution,serviceContext:f.context,owner:'worker-one'});
 const result=await worker.inspect(i);assert.equal(result.status,'AWAITING_E4_HANDOFF');assert.equal(result.current.executionAuthorized,false);
 assert.equal(f.store.execution.getInternal(f.context,i).intent.intentId,i);assert.throws(()=>f.store.execution.get(f.aliceContext,f.a,i),/AUTH_REQUIRED/);
});
test('final operator binding removal rejects metadata command and rolls back both records',async t=>{
 const f=await executionFixture(t),body=f.body();f.configuration.fault=stage=>{if(stage==='e5-after-receipt')f.configuration.operatorBindings.splice(0);};f.restart();
 // Normalized static bindings are owned copies; use the explicit resolver to
 // model a server-side scope change after the write and before final auth.
 f.configuration.resolveOperatorBindings=()=>f.configuration.operatorBindings;f.restart();
 assert.throws(()=>f.store.execution.enqueue(f.operatorContext,f.a,body,f.key()),/FORBIDDEN/);assert.equal(dump(f).e5_receipts.length,0);
});
test('async service authorizer is rejected inside synchronous transaction',async t=>{
 const f=await executionFixture(t),i=f.enqueue().receipt.intentId;
 f.configuration.executionServices={...f.ports,authorizeService:async()=>({serviceId:'worker-one',runtimeId:f.ports.runtimeId,expiresAt:f.time+60})};f.restart();
 assert.throws(()=>f.acquire(i),/BC_E5_ASYNC_TRANSACTION/);assert.equal(database(f,db=>db.prepare('SELECT count(*) n FROM e5_leases').get().n),0);
});
test('shortened service authority invalidates old CAS before reader; it is never silently refreshed',async t=>{
 const f=await executionFixture(t),i=f.enqueue().receipt.intentId;let expiry=f.time+120;
 f.configuration.executionServices={...f.ports,authorizeService:()=>({serviceId:'worker-one',runtimeId:f.ports.runtimeId,expiresAt:expiry})};f.restart();
 const h=f.acquire(i),before=f.inspect(h);expiry=f.time+10;
 await assert.rejects(f.store.execution.observe(f.context,h,before),/BC_E5_CURRENT_CHANGED/);assert.equal(f.metrics.reads,0);
});
test('different intents on the same application cannot acquire concurrent execution leases',async t=>{
 const f=await executionFixture(t),first=f.enqueue().receipt.intentId,second=f.enqueue({operationId:H('operation-two')}).receipt.intentId;
 f.acquire(first);assert.throws(()=>f.store.execution.acquire(f.other,second,{owner:'worker-two',generation:1}),/BC_E5_APPLICATION_BUSY/);
 f.setTime(f.time+30);assert.equal(f.store.execution.acquire(f.other,second,{owner:'worker-two',generation:1}).workerFence,1);
});
test('heartbeat during reader await preserves same-fence work without renewing its original cap',async t=>{
 const f=await executionFixture(t),i=f.enqueue().receipt.intentId,h=f.acquire(i);let release,entered;
 const started=new Promise(r=>{entered=r;});f.setReadHook(()=>{entered();return new Promise(r=>{release=r;});});
 const original=f.inspect(h),pending=f.store.execution.observe(f.context,h,original);await started;f.setTime(f.time+1);
 assert.deepEqual(f.store.execution.heartbeat(f.context,h),h);release();assert.equal((await pending).runtime.status,'ACTIVE');
 f.setReadHook(async()=>{});const cap=f.inspect(h);f.setTime(cap.authorityExpiresAt-1);f.store.execution.heartbeat(f.context,h);
 f.setTime(cap.authorityExpiresAt);const reads=f.metrics.reads;
 await assert.rejects(f.store.execution.observe(f.context,h,cap),/BC_E5_CURRENT_CHANGED/);assert.equal(f.metrics.reads,reads);
});
