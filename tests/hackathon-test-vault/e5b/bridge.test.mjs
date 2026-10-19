import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {retainedOrphan} from '../e5/fork-fixture.mjs';
import {DatabaseSync} from 'node:sqlite';
import {bridgeFixture,command} from './fixture.mjs';
import {openOwnedApiBridge} from '../../../src/hackathon-test-vault/e5b/bridge.mjs';
import {sha,atomicPrivate} from '../../../src/hackathon-test-vault/e5/private-storage.mjs';
import {hash} from '../e5/fixture.mjs';
const metadata=f=>new DatabaseSync(join(f.dir,'envelopes','metadata.sqlite'),{readOnly:true});
const savedRow=(f,ref)=>{const db=metadata(f);try{return JSON.parse(db.prepare('SELECT record FROM envelopes WHERE ref=?').get(ref).record);}finally{db.close();}};
const secretHash=(f,ref)=>sha(readFileSync(join(f.dir,'envelopes',ref+'.json'),'utf8'));

test('owner fence witness reads the separate durable E4 counter with exact scope before controller bootstrap',async t=>{
 const f=await bridgeFixture(t),query=f.bridge.runtime.authorityScope,unbound=openOwnedApiBridge({environmentId:f.f.id});
 assert.equal(query.runtimeId,f.f.id);assert.equal(query.runtimePinHash,f.bridge.runtime.runtimeHash);assert.equal(query.scopeKey,sha(f.bridge.runtime.vaultScope));
 assert.equal((await unbound.owner.fenceReader.read(query)).highestFence,0);unbound.owner.close();
 assert.equal(f.bridge.worker.fenceReader,undefined);assert.equal(f.bridge.reader.fenceReader,undefined);
 const req=await f.request(command('approve',[f.f.m.vaultAddress,'1']));await f.refresh(req);const issued=await f.bridge.owner.fenceReader.read(query);assert.equal(issued.highestFence,2);
 f.restart();assert.deepEqual(await f.bridge.owner.fenceReader.read(query),issued);assert.equal(f.bridge.owner.metrics().keyAccesses,0);
 for(const key of ['runtimeId','runtimePinHash','scopeKey'])await assert.rejects(()=>f.bridge.owner.fenceReader.read({...query,[key]:'wrong'}),/E5B_FENCE_SCOPE/);
 await assert.rejects(()=>f.bridge.owner.fenceReader.read({...query,highestFence:0}),/E5B_FENCE_QUERY/);
 assert.equal((await f.bridge.owner.fenceReader.read(query)).highestFence,2);assert(Object.isFrozen(issued));
});

test('one-time bootstrap, restricted issuer and first seal have no callback recursion or exposed secrets',async t=>{
 const f=await bridgeFixture(t),unbound=openOwnedApiBridge({environmentId:f.f.id});
 assert.throws(()=>unbound.worker.lookup({}),/E5B_CONTROLLER_UNBOUND/);unbound.owner.bindController(f.factory);assert.throws(()=>unbound.owner.bindController(f.factory),/E5B_CONTROLLER_ALREADY_BOUND/);unbound.owner.close();
 for(const method of ['capability','current','commit'])assert.throws(()=>f.state.ports.issuer[method]({}),/E5B_ISSUER_SCOPE/);assert.throws(()=>f.state.ports.witnesses.consume({}),/E5B_WITNESS_UNOWNED_OR_REPLAY/);
 assert.deepEqual(Object.keys(f.bridge.worker).sort(),['adopt','authorize','dispatch','envelope','lookup','recover','seal']);
 const req=await f.request(command('approve',[f.f.m.vaultAddress,'1'])),sealed=await f.bridge.worker.seal(req);assert.equal(f.bridge.worker.envelope({...req,...sealed}).state,'SEALED');assert.equal(f.bridge.owner.metrics().transactionSignatures,1);
 assert(f.state.seen.some(e=>e.phase==='AUTHORIZE'));assert(f.state.seen.some(e=>e.phase==='BEFORE_KEY_FINAL_SYNC'));assert.equal(f.state.inTransaction,false);
 for(const name of ['db','key','wallet','bytesPath','issuer','verifyBytes'])assert.equal(f.bridge.worker[name],undefined);
});

test('lost seal response is found by exact identity after restart with zero new signing',async t=>{
 const f=await bridgeFixture(t),req=await f.request(command('approve',[f.f.m.vaultAddress,'1'])),sealed=await f.bridge.worker.seal(req),before=secretHash(f,sealed.ref);f.restart();
 const fresh=await f.refresh(req,{purpose:'RECOVER'}),found=f.bridge.worker.lookup(fresh);assert.equal(found.status,'FOUND');assert.equal(found.envelope.ref,sealed.ref);assert.equal(found.envelope.manifestHash,sealed.manifestHash);assert.equal(found.automaticSeal,false);assert.equal(secretHash(f,sealed.ref),before);assert.equal(f.bridge.owner.metrics().keyAccesses,0);
 const altered=await f.request(command('approve',[f.f.m.vaultAddress,'2']),{purpose:'RECOVER',identity:{intentId:req.binding.intentId},business:req.binding.business});assert.throws(()=>f.bridge.worker.lookup(altered),/E5B_REQUEST_IDENTITY_CONFLICT/);
 const missing=await f.request(command('approve',[f.f.m.vaultAddress,'3']),{purpose:'RECOVER'});assert.deepEqual(f.bridge.worker.lookup(missing),{status:'NOT_FOUND',automaticSeal:false});
});

test('expired old worker lease can adopt the immutable same bytes within business bound and requires new API commit',async t=>{
 const f=await bridgeFixture(t);f.state.leaseUntil=Math.floor(Date.now()/1000)+4;
 const req=await f.request(command('approve',[f.f.m.vaultAddress,'1'])),sealed=await f.bridge.worker.seal(req),old=await f.bridge.worker.adopt({...req,...sealed});f.commit(old);const original=savedRow(f,sealed.ref),bytes=secretHash(f,sealed.ref);
 await new Promise(resolve=>setTimeout(resolve,Math.max(0,req.binding.expiresAt*1000-Date.now()+20)));
 const fresh=await f.refresh(req),adoption=await f.bridge.worker.adopt({...fresh,...sealed});assert.notEqual(adoption.adoptionHash,old.adoptionHash);assert(adoption.authorityUntil>original.originalAuthorityUntil);assert(adoption.authorityUntil<=original.businessValidUntil);assert.deepEqual(savedRow(f,sealed.ref),original);assert.equal(secretHash(f,sealed.ref),bytes);
 const request={...fresh,...sealed,adoptionId:adoption.adoptionId,adoptionHash:adoption.adoptionHash};await assert.rejects(()=>f.bridge.worker.dispatch(request),/E5B_CONTROLLER_REJECTED/);assert.equal(f.bridge.owner.metrics().broadcasts,0);
 f.commit(adoption);assert.equal((await f.included(request,await f.bridge.worker.dispatch(request))).status,'INCLUDED');assert.equal(f.bridge.worker.envelope(request).txHash,original.txHash);assert.equal(f.bridge.owner.metrics().transactionSignatures,1);assert.equal(f.bridge.owner.metrics().broadcasts,1);
 assert.equal((await f.bridge.worker.dispatch(request)).status,'INCLUDED');assert.equal(f.bridge.owner.metrics().broadcasts,1);
});

test('actual new block is privately witnessed and source withdrawal immediately before key prevents signing',async t=>{
 const f=await bridgeFixture(t),req=await f.request(command('approve',[f.f.m.vaultAddress,'1']));await f.f.mine();let advanced=false;
 f.state.before=e=>{if(e.phase==='BEFORE_SIGN'){assert.notEqual(e.proof.anchor.hash,e.proof.current.hash);advanced=true;}if(e.phase==='BEFORE_KEY_FINAL_SYNC')f.state.current=false;};
 await assert.rejects(()=>f.bridge.worker.seal(req),/E5B_CONTROLLER_REJECTED/);assert(advanced);assert.equal(f.bridge.owner.metrics().keyAccesses,0);assert.equal(f.bridge.owner.metrics().broadcasts,0);
 f.state.before=null;const recover=await f.refresh(req,{purpose:'RECOVER'});assert.equal(f.bridge.worker.lookup(recover).status,'FOUND_UNSEALED_HOLD');assert.equal(f.bridge.owner.metrics().keyAccesses,0);
});

test('B prepare and accept retain fixed claim after source withdrawal, key revocation and pause',async t=>{
 const f=await bridgeFixture(t),r=await f.ready(),accept=await f.submit(r.command);assert.equal(accept.result.status,'INCLUDED');
 const claim=await f.request(command('claim',[r.app],r.app)),sealed=await f.bridge.worker.seal(claim),before=f.bridge.owner.metrics().paymentSignatures;
 await f.f.sent(f.f.vault.connect(f.f.wallet('keyAdmin')).revokeKey(hash(),f.f.m.signerKeyId));await f.f.sent(f.f.vault.connect(f.f.wallet('keyAdmin')).setPause(hash(),true));f.state.current=false;
 const fresh=await f.refresh(claim),adoption=await f.bridge.worker.adopt({...fresh,...sealed});f.commit(adoption);const request={...fresh,...sealed,adoptionId:adoption.adoptionId,adoptionHash:adoption.adoptionHash};const result=await f.included(request,await f.bridge.worker.dispatch(request));assert.equal(result.status,'INCLUDED');assert.equal(result.observation.business.application.state,'6');assert.equal(f.bridge.owner.metrics().paymentSignatures,before);
});

test('prepare and accept observe their actual authorization nonce; consumed nonce cannot obtain a prepare capability',async t=>{
 const f=await bridgeFixture(t),seen=new Set();f.state.before=e=>{
  if(['prepareUnsigned','accept'].includes(e.command.method)&&e.proof.kind==='REGISTERED_CANONICAL_READER'){
   assert.equal(e.proof.query.nonce,e.command.args[1].nonce);assert.equal(e.observation.business.nonce,e.command.args[1].nonce);seen.add(e.command.method);
  }
 };
 const ready=await f.ready(),accepted=await f.submit(ready.command);assert.equal(accepted.result.status,'INCLUDED');assert.deepEqual([...seen].sort(),['accept','prepareUnsigned']);
 const reused=command('prepareUnsigned',[hash(),ready.msg,ready.command.args[2]],ready.app),observation=(await f.bridge.reader.observe(reused)).observation;
 assert.equal(observation.business.nonce,ready.msg.nonce);assert.equal(observation.business.nonceUsed,true);const before=f.bridge.owner.metrics();
 await assert.rejects(()=>f.request(reused),/E5B_AUTHORIZATION_NONCE_USED/);assert.deepEqual(f.bridge.owner.metrics(),before);
});


test('private witness clone/replay, general signing and reentrant worker calls cannot certify',async t=>{
 const f=await bridgeFixture(t);let stolen;
 f.restart({wrapFactory:(ports,base)=>({...base,authorizeSync:context=>{
  stolen=context.ticket;assert.throws(()=>ports.witnesses.consume(structuredClone(stolen)),/E5B_WITNESS_UNOWNED_OR_REPLAY/);
  assert.throws(()=>f.bridge.worker.lookup({}),/E5B_CONTROLLER_REENTRANT/);
  const result=base.authorizeSync(context);assert.throws(()=>ports.witnesses.consume(stolen),/E5B_WITNESS_UNOWNED_OR_REPLAY/);assert.throws(()=>ports.issuer.capability(stolen),/E5B_ISSUER_SCOPE/);return result;
 }})});
 const req=await f.request(command('approve',[f.f.m.vaultAddress,'1']));assert(req.capability);assert.throws(()=>f.state.ports.issuer.capability(stolen),/E5B_ISSUER_SCOPE/);assert.equal(f.bridge.owner.metrics().keyAccesses,0);
});

test('registered reader proof rejects invented anchor number or time even with an actual block hash',async t=>{
 const f=await bridgeFixture(t),req=await f.request(command('approve',[f.f.m.vaultAddress,'1']));
 for(const field of ['number','time']){
  const binding=structuredClone(req.binding);binding.anchor[field]=String(BigInt(binding.anchor[field])+1n);
  await assert.rejects(()=>f.bridge.worker.authorize({binding,command:req.command}),/E5B_ANCHOR_METADATA/);
  await assert.rejects(()=>f.bridge.reader.compare({previous:binding.anchor,current:req.binding.anchor}),/E5B_ANCHOR_METADATA/);
 }
 assert.equal((await f.bridge.reader.compare({previous:req.binding.anchor,current:req.binding.anchor})).status,'CANONICAL_ANCESTOR');
 assert.equal(f.bridge.owner.metrics().keyAccesses,0);assert.equal(f.bridge.owner.metrics().broadcasts,0);
});

test('new authority cannot extend original business expiry; recovery remains source-independent',async t=>{
 const f=await bridgeFixture(t),req=await f.request(command('approve',[f.f.m.vaultAddress,'1'])),sealed=await f.bridge.worker.seal(req),original=savedRow(f,sealed.ref);f.state.clockOffset=121;
 await assert.rejects(()=>f.refresh(req),/E5B_BUSINESS_EXPIRED/);f.state.current=false;const recovery=await f.refresh(req,{purpose:'RECOVER'});assert.equal(f.bridge.worker.lookup(recovery).envelope.ref,sealed.ref);assert.equal(savedRow(f,sealed.ref).businessValidUntil,original.businessValidUntil);
 const forged={...recovery,binding:{...recovery.binding,purpose:'EXECUTE'}};await assert.rejects(()=>f.bridge.worker.adopt({...forged,...sealed}),/E5_CERTIFICATE_BINDING/);assert.equal(f.bridge.owner.metrics().broadcasts,0);
});

test('new global fence and current checks reject old adoption and changes after API commit check',async t=>{
 const f=await bridgeFixture(t),req=await f.request(command('approve',[f.f.m.vaultAddress,'1'])),sealed=await f.bridge.worker.seal(req),old=await f.bridge.worker.adopt({...req,...sealed});f.commit(old);
 const fresh=await f.refresh(req),next=await f.bridge.worker.adopt({...fresh,...sealed});f.commit(next);
 await assert.rejects(()=>f.bridge.worker.dispatch({...req,...sealed,adoptionId:old.adoptionId,adoptionHash:old.adoptionHash}),/E5B_CURRENT_ADOPTION_REQUIRED/);
 f.state.before=e=>{if(e.phase==='SEND_STARTED_FINAL_SYNC')f.state.current=false;};await assert.rejects(()=>f.bridge.worker.dispatch({...fresh,...sealed,adoptionId:next.adoptionId,adoptionHash:next.adoptionHash}),/E5B_CONTROLLER_REJECTED/);assert.equal(savedRow(f,sealed.ref).state,'SEALED');assert.equal(f.bridge.owner.metrics().broadcasts,0);
});

test('SEND_STARTED crash cut remains query-only after takeover and service restart',async t=>{
 const f=await bridgeFixture(t),req=await f.request(command('approve',[f.f.m.vaultAddress,'1'])),sealed=await f.bridge.worker.seal(req),adoption=await f.bridge.worker.adopt({...req,...sealed});f.commit(adoption);
 f.restart({cut:phase=>{if(phase==='SEND_STARTED_BEFORE_BROADCAST')throw Error('E5B_TEST_CRASH_CUT');}});
 await assert.rejects(()=>f.bridge.worker.dispatch({...req,...sealed,adoptionId:adoption.adoptionId,adoptionHash:adoption.adoptionHash}),/E5B_TEST_CRASH_CUT/);assert.equal(savedRow(f,sealed.ref).state,'SEND_STARTED');f.restart();
 const fresh=await f.refresh(req),request={...fresh,...sealed};await assert.rejects(()=>f.bridge.worker.adopt(request),/E5B_ADOPTION_SEALED_ONLY/);assert.equal((await f.bridge.worker.dispatch(request)).status,'UNKNOWN');assert.equal((await f.bridge.worker.recover(request)).status,'UNKNOWN');assert.equal(f.bridge.owner.metrics().keyAccesses,0);assert.equal(f.bridge.owner.metrics().broadcasts,0);
});

test('exact stored bytes reverse-check fails before broadcast after an authenticated adoption',async t=>{
 const f=await bridgeFixture(t),req=await f.request(command('approve',[f.f.m.vaultAddress,'1'])),sealed=await f.bridge.worker.seal(req),adoption=await f.bridge.worker.adopt({...req,...sealed});f.commit(adoption);
 const path=join(f.dir,'envelopes',sealed.ref+'.json'),bytes=JSON.parse(readFileSync(path,'utf8'));bytes.raw=bytes.raw.slice(0,-2)+(bytes.raw.endsWith('00')?'01':'00');atomicPrivate(path,bytes);
 await assert.rejects(()=>f.bridge.worker.dispatch({...req,...sealed,adoptionId:adoption.adoptionId,adoptionHash:adoption.adoptionHash}),/E5_REVERSE_TRANSACTION|E5_PRIVATE_BYTES_INVALID/);assert.equal(f.bridge.owner.metrics().broadcasts,0);
});

test('old A row and manifest retain their original semantics and cannot be adopted as B',async t=>{
 const f=await bridgeFixture(t);f.f.restart();const aReq=await f.f.request(command('approve',[f.f.m.vaultAddress,'1'])),sealed=await f.f.service.seal(aReq),before=savedRow(f,sealed.ref),bytes=secretHash(f,sealed.ref);f.f.service.close();
 const req=await f.request(aReq.command,{purpose:'RECOVER',identity:Object.fromEntries(['intentId','requestId','attemptId'].map(k=>[k,aReq.binding[k]]))});assert.throws(()=>f.bridge.worker.lookup(req),/E5B_LEGACY_ENVELOPE_READ_ONLY/);assert.throws(()=>f.bridge.worker.envelope({...req,...sealed}),/E5B_LEGACY_ENVELOPE_READ_ONLY/);assert.deepEqual(savedRow(f,sealed.ref),before);assert.equal(secretHash(f,sealed.ref),bytes);assert.equal(f.bridge.owner.metrics().keyAccesses,0);
});


test('real child exit after SEND_STARTED survives restart without rebroadcast or new signature',async t=>{
 const f=await bridgeFixture(t),req=await f.request(command('approve',[f.f.m.vaultAddress,'1'])),sealed=await f.bridge.worker.seal(req),adoption=await f.bridge.worker.adopt({...req,...sealed});f.commit(adoption);const request={...req,...sealed,adoptionId:adoption.adoptionId,adoptionHash:adoption.adoptionHash};
 atomicPrivate(join(f.dir,'b-crash-request.json'),request);atomicPrivate(join(f.dir,'b-test-controller.json'),Object.fromEntries(['fence','workerId','leaseId','leaseUntil','current','intentFence'].map(k=>[k,f.state[k]])));f.bridge.owner.close();
 const child=spawnSync(process.execPath,['tests/hackathon-test-vault/e5b/crash-child.mjs',f.f.id,'SEND_STARTED_BEFORE_BROADCAST'],{encoding:'utf8',timeout:45000});assert.equal(child.status,86,JSON.stringify({status:child.status,stdoutBytes:Buffer.byteLength(child.stdout??''),stderrBytes:Buffer.byteLength(child.stderr??'')}));assert.equal(savedRow(f,sealed.ref).state,'SEND_STARTED');f.restart();
 const fresh=await f.refresh(req,{purpose:'RECOVER'}),found=f.bridge.worker.lookup(fresh);assert.equal(found.envelope.ref,sealed.ref);assert.equal((await f.bridge.worker.recover({...fresh,...sealed})).status,'UNKNOWN');assert.equal(f.bridge.owner.metrics().keyAccesses,0);assert.equal(f.bridge.owner.metrics().broadcasts,0);
});

test('actual retained-orphan reorg stops B adoption and survives bridge restart',async t=>{
 const f=await bridgeFixture(t),cmd=command('approve',[f.f.m.vaultAddress,'1']),req=await f.request(cmd),sealed=await f.bridge.worker.seal(req),adoption=await f.bridge.worker.adopt({...req,...sealed});f.commit(adoption);
 let orphan;await retainedOrphan({...f.f,service:{track:async observation=>{orphan=observation.checkpoint;const concurrent=await f.request(command('approve',[f.f.m.vaultAddress,'2']));assert.equal(concurrent.binding.anchor.hash,observation.checkpoint.hash);await assert.rejects(()=>f.bridge.worker.seal(concurrent),/E5_ROLE_NONCE_BUSY/);}}});
 const current=(await f.bridge.reader.observe(cmd)).observation.checkpoint;assert.equal((await f.bridge.reader.compare({previous:orphan,current})).status,'REORG_PROVEN_RECOVERY_BLOCKED');
 await assert.rejects(()=>f.bridge.worker.dispatch({...req,...sealed,adoptionId:adoption.adoptionId,adoptionHash:adoption.adoptionHash}),/E5_RECOVERY_BLOCKED/);f.restart();const fresh=await f.refresh(req,{purpose:'RECOVER'});assert.equal((await f.bridge.worker.recover({...fresh,...sealed})).status,'RECOVERY_BLOCKED');assert.equal(f.bridge.owner.metrics().keyAccesses,0);assert.equal(f.bridge.owner.metrics().broadcasts,0);
});

test('direct claim receipt intake after service stop derives canonical transaction and fixed accepted right without an envelope',async t=>{
 const f=await bridgeFixture(t),r=await f.ready();assert.equal((await f.submit(r.command)).result.status,'INCLUDED');const signatures=f.bridge.owner.metrics().paymentSignatures;
 await f.f.sent(f.f.vault.connect(f.f.wallet('keyAdmin')).revokeKey(hash(),f.f.m.signerKeyId));await f.f.sent(f.f.vault.connect(f.f.wallet('keyAdmin')).setPause(hash(),true));f.bridge.owner.close();f.state.current=false;
 const tx=await f.f.vault.connect(f.f.wallet('anycaller')).claim(r.app);const receipt=await tx.wait();assert.equal(receipt.status,1);const chainTx=await f.f.reader.rpc('eth_getTransactionByHash',[tx.hash]);
 assert(chainTx);assert(signatures>0);f.restart();const verified=await f.bridge.reader.claimReceipt({applicationId:r.app,txHash:tx.hash});assert.equal(verified.status,'INCLUDED');assert.equal(verified.observation.business.right.amountAtoms,'100000000');assert.equal(verified.observation.business.application.state,'6');assert.equal(verified.authorizationDigest,verified.observation.business.right.authorizationDigest);assert.equal(verified.allocationId,verified.observation.business.application.allocationId);assert(Object.isFrozen(verified));
 for(const query of [{applicationId:hash(),txHash:tx.hash},{applicationId:r.app,txHash:hash()},{applicationId:r.app,txHash:f.f.m.deploymentTransactions.token}]){const result=await f.bridge.reader.claimReceipt(query);assert.equal(result.status,'UNKNOWN');assert.equal(result.automaticPromotion,false);}
 await assert.rejects(()=>f.bridge.reader.claimReceipt({applicationId:r.app,txHash:tx.hash,from:chainTx.from}),/E5B_CLAIM_QUERY/);
 const db=metadata(f);try{assert.equal(db.prepare('SELECT count(*) AS n FROM envelopes WHERE record LIKE ?').get('%'+tx.hash+'%').n,0);}finally{db.close();}
 assert.equal(f.bridge.owner.metrics().paymentSignatures,0);assert.equal(f.bridge.owner.metrics().keyAccesses,0);assert.equal(f.bridge.owner.metrics().broadcasts,0);
});

test('async controller and arbitrary callback errors are rejected without disclosing exception text',async t=>{
 const f=await bridgeFixture(t);f.restart({wrapFactory:(_,base)=>({...base,authorizeSync:async()=>{throw Error('PRIVATE_SENTINEL_NEVER_RETURN');}})});
 await assert.rejects(()=>f.request(command('approve',[f.f.m.vaultAddress,'1'])),/^Error: E5B_SYNCHRONOUS_ISSUED_WITNESS_REQUIRED$/);
 f.restart({wrapFactory:(_,base)=>({...base,authorizeSync:()=>{throw Error('PRIVATE_SENTINEL_NEVER_RETURN');}})});
 await assert.rejects(()=>f.request(command('approve',[f.f.m.vaultAddress,'1'])),/^Error: E5B_CONTROLLER_REJECTED$/);assert.equal(f.bridge.owner.metrics().keyAccesses,0);
});
