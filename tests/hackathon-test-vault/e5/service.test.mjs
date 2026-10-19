import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {lstatSync,mkdirSync,renameSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
import {Wallet,keccak256,Transaction} from 'ethers';
import {fixture,hash} from './fixture.mjs';
import {raceChild} from './race-fixture.mjs';
import {childDiagnostic} from './child-diagnostics.mjs';
import {createExecutionService,OwnedExecutionService,RETENTION,workerFacade} from '../../../src/hackathon-test-vault/e5/envelope-service.mjs';
import {ExecutionReader,ZERO} from '../../../src/hackathon-test-vault/e5/reader.mjs';
import {environmentRecord,parkEnvironment,stopEnvironment,startEnvironment,environmentStatus,ownedTestWallet} from '../../../src/hackathon-test-vault/e5/environment.mjs';
import {atomicPrivate,readPrivate,sha} from '../../../src/hackathon-test-vault/e5/private-storage.mjs';
const saved=[];
async function setup(t){const f=await fixture();saved.push({id:f.id,manifest:f.m,runtimeHash:f.reader.runtimeHash});t.after(()=>{f.close();stopEnvironment(f.id);parkEnvironment(f.id);});return f;}
const command=(method,args,applicationId=ZERO)=>({method,args,applicationId});
const rowFor=(f,request)=>JSON.parse(f.service.db.prepare('SELECT record FROM envelopes WHERE request_id=?').get(request.binding.requestId).record);
const requestRef=(req,sealed)=>({...req,...sealed});
const crash=(f,request,action,cut)=>{
 f.service.close();const {dir}=environmentRecord(f.id);atomicPrivate(join(dir,'crash-request.json'),request);
 const r=spawnSync(process.execPath,['tests/hackathon-test-vault/e5/crash-child.mjs',f.id,action,cut],{encoding:'utf8',timeout:45000});
 const diagnostics=(r.stderr??'').split('\n').filter(x=>x.startsWith('E5_CHILD_DIAGNOSTIC ')).flatMap(x=>{try{return [childDiagnostic(JSON.parse(x.slice(20)).diagnostic)];}catch{return [];}});
 assert.equal(r.status,86,JSON.stringify({exitCode:r.status,timedOut:r.error?.code==='ETIMEDOUT',stdoutBytes:Buffer.byteLength(r.stdout??''),stderrBytes:Buffer.byteLength(r.stderr??''),diagnostics}));assert.equal(Buffer.byteLength(r.stdout??''),0);
 f.restart();
};
test('E5 default stays blocked; body flags and a reference do not activate it',async()=>{
 for(const method of ['seal','dispatch','recover'])assert.equal((await createExecutionService()[method]({verified:true,commit:true,ref:'env-forged'})).status,'BLOCKED');
});
test('Geth canonical runtime, historic hash state, queue and restart persistence',async t=>{
 const f=await setup(t),probe=await f.reader.probe();assert.equal(probe.unknownHashRejected,true);assert.equal(probe.numberFallback,false);
 assert.notEqual(f.m.networkId,f.m.chainId);assert.match(f.m.clientVersion,/Geth\/v1.17.8/);assert.equal(await f.reader.rpc('net_peerCount'),'0x0');
 const initial=await f.reader.observe(),apps=[hash(),hash()],now=Number(initial.checkpoint.time);
 for(let i=0;i<2;i++)await f.sent(f.vault.registerCurrentMet(hash(),apps[i],f.wallet('recipient').address,{decisionId:hash(),revision:1,decisionHash:hash(),sourceValidUntilExclusive:now+3600,acceptanceSequence:i+1,sourceReceiptHash:hash()}));
 await f.sent(f.token.approve(f.m.vaultAddress,150000000n));await f.sent(f.vault.connect(f.wallet('depositor')).fund(hash(),150000000n));
 await f.sent(f.vault.allocate(hash(),apps[0],hash(),1));
 const o=await f.reader.observe({applicationId:apps[1]});assert.equal(o.business.accounting.S,'50000000');assert.equal(o.business.accounting.R,'100000000');assert.equal(o.business.nextAllocatable,apps[1]);
 assert.equal((await f.reader.observe({blockHash:initial.checkpoint.hash})).business.accounting.B,'0');
 await f.sent(f.token.approve(f.m.vaultAddress,50000000n));await f.sent(f.vault.connect(f.wallet('depositor')).fund(hash(),50000000n));await f.sent(f.vault.allocate(hash(),apps[1],hash(),1));
 const before=await f.reader.observe({applicationId:apps[1]});assert.equal(before.business.accounting.S,'0');assert.equal(before.business.accounting.R,'200000000');
 stopEnvironment(f.id);await startEnvironment(f.id);const after=await f.reader.observe({applicationId:apps[1]});assert.deepEqual(after,before);assert.equal(environmentStatus(f.id).running,true);
 await t.test('all six role/code/key/domain pins reject altered manifests',async()=>{
  const variants=[...Object.keys(f.m.roles).map(k=>({...f.m,roles:{...f.m.roles,[k]:f.wallet('recipient').address.toLowerCase()}})),...['genesisHash','vaultCodeHash','tokenCodeHash','instanceId','typeHash','domainSeparator','signerKeyId'].map(k=>({...f.m,[k]:hash()}))];
  for(const m of variants)await assert.rejects(()=>new ExecutionReader(m).observe());
 });
 await t.test('lower checkpoint and FINALIZED input never silently rebase',async()=>{await assert.rejects(()=>f.reader.compare(before.checkpoint,initial.checkpoint),/E5_CHECKPOINT_REGRESSION/);await assert.rejects(()=>f.reader.compare(before.checkpoint,before.checkpoint,{previousFinality:'FINALIZED'}),/E5_FINALIZED_UNSUPPORTED_STOP/);});
});
test('durable accept, authenticated commit and fixed claim after key revocation/pause',async t=>{
 const f=await setup(t),ready=await f.ready(),req=await f.request(ready.command);
 await t.test('forged authority, command mutation and reference cannot access key',async()=>{
  const bad=structuredClone(req);bad.capability={payload:bad.binding,signature:Wallet.createRandom().signingKey.sign(sha(bad.binding)).serialized};await assert.rejects(()=>f.service.seal(bad),/E5_CERTIFICATE_SIGNER/);
  await assert.rejects(()=>f.service.seal({...req,command:{...ready.command,args:[hash(),...ready.command.args.slice(1)]}}),/E5_CAPABILITY_COMMAND/);assert.equal(f.service.metrics.keyAccesses,0);
 });
 const facade=workerFacade(f.service);assert.deepEqual(Object.keys(facade).sort(),['dispatch','envelope','observe','recover','seal']);assert.equal(facade.db,undefined);assert.equal(facade.verifyBytes,undefined);assert.equal(facade.bytesPath,undefined);
 const sealed=await facade.seal(req),row=f.service.row(sealed.ref);assert.deepEqual(Object.keys(sealed).sort(),['manifestHash','ref']);assert.equal(row.state,'SEALED');assert.notEqual(row.nonce,ready.msg.nonce);
 const manifest=facade.envelope({...req,...sealed});assert.equal(manifest.txHash,row.txHash);assert.equal(manifest.transactionNonce,row.nonce);for(const key of ['raw','signature','command','db','bytesPath','verifyBytes'])assert.equal(manifest[key],undefined);
 assert.equal(lstatSync(f.service.bytesPath(sealed.ref)).mode&0o777,0o600);assert.equal(lstatSync(f.service.root).mode&0o777,0o700);
 const bytes=readPrivate(f.service.bytesPath(sealed.ref));
 await t.test('same request returns same durable bytes across service restart',async()=>{f.restart();assert.deepEqual(await f.service.seal(req),sealed);assert.equal(readPrivate(f.service.bytesPath(sealed.ref)),bytes);assert.equal(f.service.metrics.keyAccesses,0);});
 await t.test('same operation/request with changed payload conflicts',async()=>{const altered=command('accept',[ready.command.args[0],ready.msg,String(BigInt(ready.command.args[2])+1n)],ready.app);const other=await f.request(altered);await assert.rejects(()=>f.service.seal(other));});
 await t.test('caller commit=true cannot bypass internal durable API commit',async()=>{await assert.rejects(()=>f.service.dispatch({...req,...sealed,commit:true,verified:true}),/E5_TEST_API_COMMIT_MISSING/);assert.equal(f.service.metrics.broadcasts,0);});
 f.controller.commit(sealed);const accepted=await f.included({...req,...sealed},await f.service.dispatch({...req,...sealed}));assert.equal(accepted.status,'INCLUDED');assert.equal(accepted.finalized,false);assert.equal(accepted.observation.business.right.amountAtoms,'100000000');
 await t.test('historical prepare readback never downgrades the accepted authorization nonce tombstone',async()=>{
  const n=f.service.db.prepare('SELECT * FROM authorization_nonces WHERE nonce=?').get(ready.msg.nonce);assert.equal(n.state,'ACCEPTED');
  const p=JSON.parse(f.service.db.prepare('SELECT record FROM envelopes WHERE request_id=?').get(n.prepare_request).record);
  await f.service.recover({binding:p.binding,capability:f.controller.certify(p.binding),ref:p.ref,manifestHash:p.manifestHash});
  assert.equal(f.service.db.prepare('SELECT state FROM authorization_nonces WHERE nonce=?').get(ready.msg.nonce).state,'ACCEPTED');
 });
 await t.test('receipt actor, exact calldata and event errors fail closed',async()=>{
  await assert.rejects(()=>f.reader.receipt({...row,sender:f.wallet('recipient').address.toLowerCase()}),/E5_TX_BINDING/);
  const rpc=async(method,args)=>{const r=await f.reader.rpc(method,args);if(method==='eth_getTransactionReceipt')return {...r,logs:[]};return r;};await assert.rejects(()=>new ExecutionReader(f.m,{rpc}).receipt(row),/E5_OPERATION_EVENT_REQUIRED/);
 });
 await f.sent(f.vault.connect(f.wallet('keyAdmin')).revokeKey(hash(),f.m.signerKeyId));await f.sent(f.vault.connect(f.wallet('keyAdmin')).setPause(hash(),true));f.controller.state.current=false;
 // The TEST service is closed; direct anycaller uses only its own new TEST transaction key.
 f.service.close();const before=await f.token.balanceOf(f.wallet('recipient').address),tx=await f.vault.connect(f.wallet('anycaller')).claim(ready.app);const receipt=await tx.wait();assert.equal(receipt.status,1);assert.equal(await f.token.balanceOf(f.wallet('recipient').address),before+100000000n);
 const chainTx=await f.reader.rpc('eth_getTransactionByHash',[tx.hash]);const expected={txHash:tx.hash,sender:chainTx.from.toLowerCase(),to:f.m.vaultAddress,nonce:BigInt(chainTx.nonce).toString(),dataHash:keccak256(chainTx.input),applicationId:ready.app,method:'claim'};
 const settled=await f.reader.receipt(expected);assert.equal(settled.status,'INCLUDED');assert.equal(settled.observation.business.application.state,'6');await assert.rejects(()=>f.vault.connect(f.wallet('anycaller')).claim.staticCall(ready.app));
 f.restart();assert.equal(f.service.metrics.paymentSignatures,0);
 saved.at(-1).serviceStoppedClaim={txHash:tx.hash,blockHash:receipt.blockHash,apiBackendStopIntegrated:false};
});
test('normal new blocks require explicit same-business revalidation, current checks after await',async t=>{
 const f=await setup(t),r=await f.ready(),req=await f.request(r.command);await f.mine();f.controller.state.revalidate=false;
 await assert.rejects(()=>f.service.seal(req),/E5_TEST_EXPLICIT_REVALIDATION_REQUIRED/);assert.equal(f.service.metrics.keyAccesses,0);
 f.controller.state.revalidate=true;
 const rpc=async(method,args)=>{const result=await f.reader.rpc(method,args);if(method==='eth_call'&&args[0]?.data.startsWith(f.reader.vault.getFunction('checkPrepared').selector))f.controller.state.current=false;return result;};
 f.restart({reader:new ExecutionReader(f.m,{rpc})});await assert.rejects(()=>f.service.seal(req),/E5_TEST_E3_CURRENT/);assert.equal(f.service.metrics.keyAccesses,0);
 f.controller.state.current=true;f.restart();const sealed=await f.service.seal(req);assert.equal(f.service.row(sealed.ref).state,'SEALED');
});
test('source/current change after signing discards output and blocks a new role nonce',async t=>{
 const f=await setup(t),r=await f.ready(),req=await f.request(r.command);
 f.restart({cut:phase=>{if(phase==='SIGNED_BEFORE_RECHECK')f.controller.state.current=false;}});
 await assert.rejects(()=>f.service.seal(req),/E5_TEST_E3_CURRENT/);assert.equal(f.service.metrics.paymentSignatures,1);assert.equal(rowFor(f,req).state,'SIGNING_UNCERTAIN');
 f.controller.state.current=true;const next=await f.request(r.command);await assert.rejects(()=>f.service.seal(next),/E5_IMMUTABLE_REQUEST_CONFLICT/);
 const other=await f.request({...r.command,args:[hash(),r.msg,r.command.args[2]]});await assert.rejects(()=>f.service.seal(other),/E5_ROLE_NONCE_BUSY|E5_AUTHORIZATION_NONCE_RESERVATION/);
});
test('storage failure occurs before signing and emits no bytes',async t=>{
 const f=await setup(t),r=await f.ready(),req=await f.request(r.command);f.service.db.exec('PRAGMA query_only=ON');
 await assert.rejects(()=>f.service.seal(req));assert.equal(f.service.metrics.keyAccesses,0);assert.equal(f.service.metrics.broadcasts,0);f.service.db.exec('PRAGMA query_only=OFF');
});
test('durable SEALED survives process exit; expired worker cannot dispatch after newer fence',async t=>{
 const f=await setup(t),r=await f.ready(),req=await f.request(r.command);crash(f,req,'seal','SEALED_BEFORE_API_COMMIT');
 const row=rowFor(f,req),sealed={ref:row.ref,manifestHash:row.manifestHash};assert.equal(row.state,'SEALED');assert.deepEqual(await f.service.seal(req),sealed);
 await assert.rejects(()=>f.service.dispatch({...req,...sealed}),/E5_TEST_API_COMMIT_MISSING/);
 f.controller.state.fence='2';const nextBinding={...req.binding,workerFence:'2'},recovery={...req,...sealed,binding:nextBinding,capability:f.controller.certify(nextBinding)};
 assert.equal((await f.service.recover(recovery)).status,'UNKNOWN');assert.equal(f.service.state().fence,'2');
 // Even a stale controller response cannot lower the persisted fence.
 f.controller.state.fence='1';f.controller.commit(sealed);await assert.rejects(()=>f.service.dispatch({...req,...sealed}),/E5_STALE_WORKER/);assert.equal(f.service.metrics.broadcasts,0);
});
test('durable private bytes recover after exit between fsync and SEALED without re-signing',async t=>{
 const f=await setup(t),r=await f.ready(),req=await f.request(r.command);crash(f,req,'seal','BYTES_DURABLE_BEFORE_SEALED');
 const before=rowFor(f,req);assert.equal(before.state,'PREPARING');const secret=readPrivate(f.service.bytesPath(before.ref));
 const sealed=await f.service.seal(req);assert.equal(sealed.ref,before.ref);assert.equal(f.service.metrics.keyAccesses,0);assert.equal(readPrivate(f.service.bytesPath(before.ref)),secret);
});
test('crash before signing preserves reservation and never guesses or re-signs',async t=>{
 const f=await setup(t),r=await f.ready(),req=await f.request(r.command);crash(f,req,'seal','RESERVED_BEFORE_SIGN');
 assert.equal(rowFor(f,req).state,'PREPARING');await assert.rejects(()=>f.service.seal(req),/E5_EXISTING_ATTEMPT_RECOVER_ONLY/);assert.equal(f.service.metrics.keyAccesses,0);
});
test('SEND_STARTED crash with no broadcast remains UNKNOWN and never retransmits',async t=>{
 const f=await setup(t),r=await f.ready(),req=await f.request(r.command),sealed=await f.service.seal(req);crash(f,{...req,...sealed},'dispatch','SEND_STARTED_BEFORE_BROADCAST');
 assert.equal(f.service.row(sealed.ref).state,'SEND_STARTED');const result=await f.service.dispatch({...req,...sealed});assert.equal(result.status,'UNKNOWN');assert.equal(f.service.metrics.broadcasts,0);assert.equal(f.service.metrics.keyAccesses,0);
});
test('broadcast response loss and post-commit readback error recover by canonical lookup',async t=>{
 const f=await setup(t),r=await f.ready(),req=await f.request(r.command),sealed=await f.service.seal(req);f.controller.commit(sealed);
 f.restart({cut:phase=>{if(phase==='BROADCAST_RESPONSE')throw Error('E5_TEST_RESPONSE_LOSS');}});assert.equal((await f.service.dispatch({...req,...sealed})).status,'UNKNOWN');
 const rpc=async(method,args)=>{if(method==='eth_getTransactionReceipt')throw Error('E5_TEST_RPC_DOWN');return f.reader.rpc(method,args);};f.restart({reader:new ExecutionReader(f.m,{rpc})});assert.equal((await f.service.recover({...req,...sealed})).status,'UNKNOWN');
 f.restart();const recovered=await f.included({...req,...sealed},await f.service.recover({...req,...sealed}));assert.equal(recovered.status,'INCLUDED');assert.equal(f.service.metrics.keyAccesses,0);assert.equal(f.service.metrics.broadcasts,0);
 const row=f.service.row(sealed.ref);assert.equal(row.state,'INCLUDED');
});
test('dispatch TTL, secret deletion failure and secret-free tombstone preserve nonce barrier',async t=>{
 const f=await setup(t),req=await f.request(command('approve',[f.m.vaultAddress,'1'])),sealed=await f.service.seal(req);f.controller.commit(sealed);
 const row=f.service.row(sealed.ref);f.restart({clock:()=>row.dispatchUntil});await assert.rejects(()=>f.service.dispatch({...req,...sealed}),/E5_CAPABILITY_EXPIRED|E5_DISPATCH_DEADLINE/);
 const lateBinding={...req.binding,expiresAt:row.bytesUntil+100},late={...req,...sealed,binding:lateBinding,capability:f.controller.certify(lateBinding)};f.restart({clock:()=>row.bytesUntil});
 const path=f.service.bytesPath(sealed.ref);renameSync(path,path+'.retained');mkdirSync(path,{mode:0o700});assert.throws(()=>f.service.prune(late),/E5_SECRET_DELETION_FAILED/);assert.equal(f.service.row(sealed.ref).secretDeletion,'FAILED');
 const {rmdirSync}=await import('node:fs');rmdirSync(path);renameSync(path+'.retained',path);const result=f.service.prune(late);assert.equal(result.secretDeletion,'DELETED');assert.equal(result.invalidatesBroadcast,false);assert.equal(result.nonceRetained,true);assert(!existsSync(path));
 const stored=JSON.stringify(f.service.row(sealed.ref));assert(!stored.includes('"raw":'));assert(!stored.includes('"signature":'));assert.equal(f.service.row(sealed.ref).state,'EXPIRED_UNSENT');assert.equal(RETENTION.rawSourcePolicyInherited,false);
});
test.after(()=>{mkdirSync(new URL('../../../.toolchain/hackathon-test-vault/e5/',import.meta.url),{recursive:true});const path=new URL('../../../.toolchain/hackathon-test-vault/e5/service-runtimes.json',import.meta.url);writeFileSync(path,JSON.stringify({version:'clear-e5-test-runs.1',runtimes:saved,actualApiIntegration:false,backendStopIntegration:false},null,2)+'\n');console.log('E5_RUNTIME_SUMMARY '+JSON.stringify({ownedEnvironments:saved.length,clients:[...new Set(saved.map(x=>x.manifest.clientVersion))],actualApiIntegration:false,backendStopIntegration:false}));});

test('sealed claim remains dispatchable after source withdrawal, key revocation and pause without payment signature',async t=>{
 const f=await setup(t),ready=await f.ready();assert.equal((await f.submit(ready.command)).result.status,'INCLUDED');
 const req=await f.request(command('claim',[ready.app],ready.app)),sealed=await f.service.seal(req);f.controller.commit(sealed);const signed=f.service.metrics.paymentSignatures;
 await f.sent(f.vault.connect(f.wallet('keyAdmin')).revokeKey(hash(),f.m.signerKeyId));await f.sent(f.vault.connect(f.wallet('keyAdmin')).setPause(hash(),true));f.controller.state.current=false;
 const result=await f.included({...req,...sealed},await f.service.dispatch({...req,...sealed}));assert.equal(result.status,'INCLUDED');assert.equal(result.observation.business.application.state,'6');assert.equal(f.service.metrics.paymentSignatures,signed);
});
test('two service processes cannot reserve the same role nonce; changed bytes fail reverse verification',async t=>{
 const f=await setup(t),{dir}=environmentRecord(f.id);f.service.close();
 const a=raceChild(t,f.id,'a','nonce'),b=raceChild(t,f.id,'b','nonce');await Promise.all([a.wait('READY'),b.wait('READY')]);
 // Compile both real readers before issuing the ordinary 120-second capability.
 const req=await f.request(command('approve',[f.m.vaultAddress,'1'])),other=await f.request(command('approve',[f.m.vaultAddress,'2']));atomicPrivate(join(dir,'race-a-request.json'),req);atomicPrivate(join(dir,'race-b-request.json'),other);
 // Finish both BEFORE_SIGN observations before racing synchronous nonce reservation.
 a.release('READY');await a.wait('NONCE_READY');b.release('READY');await b.wait('NONCE_READY');a.release('NONCE_READY');b.release('NONCE_READY');
 const results=await Promise.all([a.finished,b.finished]);console.log('E5_NONCE_RACE '+JSON.stringify(results));assert.equal(results.filter(r=>r.exitCode===0).length,1,JSON.stringify(results));assert.equal(results.filter(r=>r.exitCode===87).length,1);assert.equal(results.find(r=>r.exitCode===87).events.at(-1).diagnostic.code,'E5_ROLE_NONCE_BUSY');f.restart();
 assert.equal(f.service.db.prepare('SELECT count(*) AS n FROM envelopes').get().n,1);
 const success=results.find(r=>r.exitCode===0),winner=success.slot==='a'?req:other,sealed=JSON.parse(readPrivate(join(dir,'race-'+success.slot+'-result.json'))),row=f.service.row(sealed.ref),secret=JSON.parse(readPrivate(f.service.bytesPath(sealed.ref)));
 secret.raw=secret.raw.slice(0,-2)+(secret.raw.endsWith('00')?'01':'00');atomicPrivate(f.service.bytesPath(sealed.ref),secret);f.controller.commit(sealed);await assert.rejects(()=>f.service.dispatch({...winner,...sealed}));assert.equal(f.service.metrics.broadcasts,0);
});
test('checkpoint contention after signing: identical observation is idempotent; new block still refuses',async t=>{
 for(const advance of [false,true])await t.test(advance?'new canonical block':'identical canonical checkpoint',async sub=>{
  const f=await setup(sub),{dir}=environmentRecord(f.id);f.service.close();
  const a=raceChild(sub,f.id,'a','checkpoint'),b=raceChild(sub,f.id,'b','checkpoint');await Promise.all([a.wait('READY'),b.wait('READY')]);
  const req=await f.request(command('approve',[f.m.vaultAddress,'1'])),other=await f.request(command('approve',[f.m.vaultAddress,'2']));atomicPrivate(join(dir,'race-a-request.json'),req);atomicPrivate(join(dir,'race-b-request.json'),other);
  a.release('READY');await a.wait('NONCE_READY');a.release('NONCE_READY');await a.wait('CHECKPOINT_READY');
  if(advance)await f.mine(); // Actual owned Geth block; never fabricate an RPC observation.
  b.release('READY');await b.wait('NONCE_READY');b.release('NONCE_READY');const loser=await b.finished;a.release('CHECKPOINT_READY');const winner=await a.finished;
  console.log('E5_CHECKPOINT_RACE '+JSON.stringify({advance,children:[winner,loser]}));assert.equal(loser.exitCode,87);assert.equal(loser.events.at(-1).diagnostic.code,'E5_ROLE_NONCE_BUSY');assert.equal(loser.events.at(-1).diagnostic.metrics.keyAccesses,0);
  assert.equal(winner.exitCode,advance?87:0);assert.equal(winner.events.at(-1).diagnostic.code,advance?'E5_CHECKPOINT_CAS_RETRY_REQUIRED':'OK');
  f.restart();const row=rowFor(f,req);assert.equal(row.state,advance?'SIGNING_UNCERTAIN':'SEALED');assert.equal(f.service.db.prepare('SELECT count(*) AS n FROM envelopes').get().n,1);assert.equal(existsSync(f.service.bytesPath(row.ref)),!advance);assert.equal(winner.events.at(-1).diagnostic.metrics.transactionSignatures,1);assert.equal(winner.events.at(-1).diagnostic.metrics.broadcasts,0);
  const observations=f.service.db.prepare('SELECT record FROM observations ORDER BY sequence').all().map(r=>JSON.parse(r.record));assert.equal(observations.length,advance?2:1);if(advance)assert.notEqual(observations[0].checkpoint.hash,observations[1].checkpoint.hash);
  if(advance){await assert.rejects(()=>f.service.seal(req),/E5_EXISTING_ATTEMPT_RECOVER_ONLY/);assert.equal(f.service.metrics.keyAccesses,0);assert.equal(f.service.metrics.broadcasts,0);}
 });
});
test('expired capability remains a diagnosed pre-key refusal after child compilation',async t=>{
 const f=await setup(t),{dir}=environmentRecord(f.id);f.service.close();const child=raceChild(t,f.id,'a','nonce');await child.wait('READY');
 const req=await f.request(command('approve',[f.m.vaultAddress,'1']),{bindingPatch:{expiresAt:Math.floor(Date.now()/1000)-1}});atomicPrivate(join(dir,'race-a-request.json'),req);child.release('READY');const result=await child.finished;
 console.log('E5_CHILD_EXPIRED '+JSON.stringify(result));assert.equal(result.exitCode,87);assert.equal(result.timedOut,false);const d=result.events.at(-1).diagnostic;assert.equal(d.code,'E5_CAPABILITY_EXPIRED');assert(d.leaseRemainingSeconds<0);assert.equal(d.metrics.keyAccesses,0);f.restart();assert.equal(f.service.db.prepare('SELECT count(*) AS n FROM envelopes').get().n,0);
});
test('checkpoint idempotence requires exact runtime, hash, number, time and finality',async t=>{
 const f=await setup(t),o=await f.reader.observe();await f.service.track(o);
 const base={checkpoint:o.checkpoint,runtimeHash:f.reader.runtimeHash,finality:'INCLUDED'},compare=f.service.reader.compare.bind(f.service.reader);
 const append=record=>f.service.db.prepare('INSERT INTO observations(record) VALUES(?)').run(JSON.stringify(record));
 const changes=[{...base,runtimeHash:hash()},{...base,checkpoint:{...base.checkpoint,hash:hash()}},{...base,checkpoint:{...base.checkpoint,number:String(BigInt(base.checkpoint.number)+1n)}},{...base,checkpoint:{...base.checkpoint,time:String(BigInt(base.checkpoint.time)+1n)}},{...base,finality:'FINALIZED'}];
 for(const changed of changes){
  // Synthetic concurrent metadata corruption, not a fabricated canonical RPC result.
  f.service.reader.compare=async(...args)=>{const result=await compare(...args);append(changed);return result;};
  await assert.rejects(()=>f.service.track(o),/E5_CHECKPOINT_CAS_RETRY_REQUIRED/);append(base);
 }
 f.service.reader.compare=compare;const before=f.service.db.prepare('SELECT count(*) AS n FROM observations').get().n;await f.service.track(o);assert.equal(f.service.db.prepare('SELECT count(*) AS n FROM observations').get().n,before);assert.equal(f.service.metrics.keyAccesses,0);
});
test('new lineage is rejected, and a post-read current withdrawal prevents SEND_STARTED',async t=>{
 const f=await setup(t),r=await f.ready(),req=await f.request(r.command),sealed=await f.service.seal(req);f.controller.commit(sealed);
 const changed={...req.binding,lineage:'2'};f.controller.state.lineage='2';await assert.rejects(()=>f.service.recover({...req,...sealed,binding:changed,capability:f.controller.certify(changed)}),/E5_REFERENCE_BINDING/);f.controller.state.lineage='1';
 f.controller.state.beforeCurrent=phase=>{if(phase==='SEND_STARTED_FINAL_SYNC')f.controller.state.current=false;};await assert.rejects(()=>f.service.dispatch({...req,...sealed}),/E5_TEST_E3_CURRENT/);assert.equal(f.service.row(sealed.ref).state,'SEALED');assert.equal(f.service.metrics.broadcasts,0);
});

test('process exits after actual broadcast: restart confirms original hash with zero new signing or sends',async t=>{
 const f=await setup(t),r=await f.ready(),req=await f.request(r.command),sealed=await f.service.seal(req);crash(f,{...req,...sealed},'dispatch','BROADCAST_RESPONSE');
 assert.equal(f.service.row(sealed.ref).state,'SEND_STARTED');
 let missingOnce=true;const rpc=async(method,args)=>{if(method==='eth_getTransactionReceipt'&&missingOnce){missingOnce=false;return null;}return f.reader.rpc(method,args);};f.restart({reader:new ExecutionReader(f.m,{rpc})});
 const request={...req,...sealed},first=await f.service.recover(request);assert.equal(first.status,'UNKNOWN');
 const result=await f.included(request,first);assert.equal(result.status,'INCLUDED');assert.equal(f.service.metrics.keyAccesses,0);assert.equal(f.service.metrics.broadcasts,0);
 const observations=f.service.db.prepare('SELECT record FROM receipt_observations WHERE ref=? ORDER BY sequence').all(sealed.ref).map(r=>JSON.parse(r.record).status);assert.deepEqual(observations,['UNKNOWN','INCLUDED']);
});

test('withdrawal or newer fence at RESERVED_BEFORE_SIGN rejects immediately before any key access',async t=>{
 for(const change of ['withdraw','fence'])await t.test(change,async sub=>{
  const f=await setup(sub),r=await f.ready(),req=await f.request(r.command);
  f.restart({cut:phase=>{if(phase==='RESERVED_BEFORE_SIGN'){if(change==='withdraw')f.controller.state.current=false;else f.controller.state.fence='2';}}});
  await assert.rejects(()=>f.service.seal(req),/E5_TEST_E3_CURRENT|E5_TEST_CONTROLLER_FENCE/);assert.equal(f.service.metrics.keyAccesses,0);assert.equal(f.service.metrics.paymentSignatures,0);assert.equal(f.service.metrics.transactionSignatures,0);
 });
});
test('authorization nonce is reserved before prepare signing and binds application, lineage and exact digest',async t=>{
 const f=await setup(t),r=await f.ready(),reservation=f.service.db.prepare('SELECT * FROM authorization_nonces WHERE nonce=?').get(r.msg.nonce);
 assert.equal(reservation.application_id,r.app);assert.equal(reservation.lineage,'1');assert.equal(reservation.state,'PREPARED');
 const attempt=await f.request(command('prepareUnsigned',[hash(),r.msg,r.command.args[2]],r.app));await assert.rejects(()=>f.service.seal(attempt),/E5_AUTHORIZATION_NONCE_REUSE/);assert.equal(f.service.metrics.keyAccesses,0);
 const req=await f.request(r.command);f.service.db.prepare('UPDATE authorization_nonces SET application_id=? WHERE nonce=?').run(hash(),r.msg.nonce);await assert.rejects(()=>f.service.seal(req),/E5_AUTHORIZATION_NONCE_RESERVATION/);assert.equal(f.service.metrics.keyAccesses,0);
 f.service.db.prepare('UPDATE authorization_nonces SET application_id=?,lineage=? WHERE nonce=?').run(r.app,'2',r.msg.nonce);await assert.rejects(()=>f.service.seal(req),/E5_AUTHORIZATION_NONCE_RESERVATION/);assert.equal(f.service.metrics.keyAccesses,0);
 f.service.db.prepare('UPDATE authorization_nonces SET lineage=?,digest=? WHERE nonce=?').run('1',hash(),r.msg.nonce);await assert.rejects(()=>f.service.seal(req),/E5_AUTHORIZATION_NONCE_RESERVATION/);assert.equal(f.service.metrics.keyAccesses,0);
});
