import test,{after,mock} from 'node:test';
import ganache from 'ganache';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createFreshMemoryStage,memoryStageTotals} from '../../src/hackathon-test-vault/memory-stage-harness.mjs';
const setup=async t=>{const f=await createFreshMemoryStage();t.after(()=>f.close());return f;};
const probes={deployments:0,codeInjections:0,injectedClaims:0,contractLevelAccepts:0};
const output=new URL('../../.toolchain/hackathon-test-vault/',import.meta.url);
function record(name,value){mkdirSync(output,{recursive:true});writeFileSync(new URL(name,output),JSON.stringify(value,null,2)+'\n');}
after(()=>{const totals={...memoryStageTotals(),controlledProbes:{...probes}};record('stage-execution-metrics.json',totals);console.log('E4_MEMORY_STAGE_METRICS '+JSON.stringify(totals));});
test('actual E1 E2 E3 authenticated module flow reaches fresh memory .3 accept and fixed claim',async t=>{
 const f=await setup(t),h=await f.ready(),signed=await f.sign(h);assert.equal(signed.status,'SIGNED_MEMORY_STAGE_ONLY');
 const before=await f.token.balanceOf(f.registration(f.firstApp).registration.recipient),accounting=Array.from(await f.vault.accounting());const accepted=await f.accept(h,signed);assert.equal(f.chainState(f.firstApp).state,5n);assert.deepEqual(Array.from(await f.vault.accounting()),accounting);const settled=await f.claim(f.firstApp);record('stage-runtime-example.json',{pin:f.pin,domain:f.domain,deploymentTransactions:{vault:f.vault.deploymentTransaction().hash,token:f.token.deploymentTransaction().hash},preparedChainCas:signed.chainCas,preparedE3Cas:signed.e3Cas,acceptTransaction:accepted.hash,acceptBlock:{number:accepted.blockNumber,hash:accepted.blockHash},claimTransaction:settled.hash,claimBlock:{number:settled.blockNumber,hash:settled.blockHash},authorizationDigest:signed.digest,metrics:f.metrics});
 assert.equal(f.chainState(f.firstApp).state,6n);assert.equal(await f.token.balanceOf(f.registration(f.firstApp).registration.recipient),before+100000000n);
});

import {id,Signature,verifyTypedData,keccak256,Contract,ContractFactory,AbiCoder} from 'ethers';
import {TYPES,MESSAGE_FIELDS} from '../../src/bootcamp-authorization/test-schema-v3.mjs';
import {createExecutionSignerAdapter} from '../../src/hackathon-test-vault/execution-signer.mjs';
import {START} from '../bootcamp-store/fixture.mjs';
const A=100000000n;
const sent=async p=>(await p).wait();
const appid=(f,app=f.firstApp)=>f.registration(app).opaqueTarget.applicationId;
const attempt=(f,signed,patch={},signature=signed.signature,op=f.op(),version=f.chainState(f.firstApp).version,who=2)=>f.vault.connect(f.accounts[who]).accept.staticCall(op,{...signed.payload.message,...patch},signature,version);
const blocked=async(f,h)=>{const n=f.metrics.keyProviderCalls,r=await f.sign(h);assert.equal(r.status,'BLOCKED');assert.equal(r.signature,null);assert.equal(f.metrics.keyProviderCalls,n);return r;};

test('default adapter and external runtime/config flags never mint a signing capability',async()=>{
 const before=memoryStageTotals();await assert.rejects(()=>createFreshMemoryStage({enabled:true}),/STAGE_NO_EXTERNAL_CONFIGURATION/);
 await assert.rejects(()=>createFreshMemoryStage({rpcUrl:'http://example.invalid'}),/STAGE_NO_EXTERNAL_CONFIGURATION/);
 assert.deepEqual(memoryStageTotals(),before);assert.equal((await createExecutionSignerAdapter({enabled:true}).sign({verified:true})).status,'BLOCKED');
});
test('forged unregistered, unallocated and partial allocation commands never access signing key',async t=>{
 const f=await setup(t);await blocked(f,{stage:f.kind,verified:true});await f.complete(f.firstApp);await f.register(f.firstApp);
 for(const reason of [1,2,3])await assert.rejects(()=>f.vault.connect(f.accounts[4]).terminate.staticCall(f.op(),appid(f),reason,id('funding-wait'),f.chainState(f.firstApp).version),/TERMINATION_CONDITION/);
 await assert.rejects(()=>f.prepare(f.firstApp));await f.fund(50000000n);await shortfall(f,f.firstApp,50000000n,0n,A);
 await blocked(f,{stage:f.kind,preparationId:'forged',fullAllocation:true});assert.equal(f.metrics.keyProviderCalls,0);
});
test('all24 signed fields are constrained by exact registered prepared digest',async t=>{
 const f=await setup(t),h=await f.ready(),s=await f.sign(h);assert.equal(s.status,'SIGNED_MEMORY_STAGE_ONLY');assert.equal(MESSAGE_FIELDS.length,24);
 for(const {name,type}of MESSAGE_FIELDS){const v=s.payload.message[name],bad=type==='bytes32'?id('MUTATED_'+name):type==='address'?'0x'+'88'.repeat(20):(BigInt(v)+1n).toString();
  await assert.rejects(()=>attempt(f,s,{[name]:bad}),undefined,name);}
 assert.equal(await f.vault.usedNonces(s.payload.message.nonce),false);await f.accept(h,s);
});
test('valid low-s .3 signature and malformed/high-s/v/zero recovery controls',async t=>{
 const f=await setup(t),h=await f.ready(),s=await f.sign(h),sig=Signature.from(s.signature);
 assert.equal(verifyTypedData(s.payload.domain,TYPES,s.payload.message,s.signature).toLowerCase(),f.pin.signerAddress);
 assert(BigInt(sig.s)<=0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n);
 const N=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
 const high=sig.r.slice(2)+(N-BigInt(sig.s)).toString(16).padStart(64,'0')+(sig.v===27?'1c':'1b');
 const invalid=[['0x','SIGNATURE_LENGTH'],[s.signature.slice(0,-2),'SIGNATURE_LENGTH'],[s.signature+'00','SIGNATURE_LENGTH'],['0x'+high,'SIGNATURE_S'],[s.signature.slice(0,-2)+'00','SIGNATURE_V'],[s.signature.slice(0,-2)+'1d','SIGNATURE_V'],[sig.r+'00'.repeat(32)+'1b','SIGNATURE_S'],['0x'+'00'.repeat(32)+sig.s.slice(2)+'1b','SIGNATURE_RECOVERY']];
 for(const [bad,code]of invalid)await assert.rejects(()=>attempt(f,s,{},bad),new RegExp(code));await f.accept(h,s);
});
test('all5 domain mutations by a faulty provider discard signed output; correct pinned domain succeeds',async t=>{
 const f=await setup(t),h=await f.ready();for(const key of ['name','version','chainId','verifyingContract','salt']){f.faults.providerWrongDomain=key;const r=await f.sign(h);assert.equal(r.status,'BLOCKED');assert.equal(r.signature,null);}
 assert.equal(f.metrics.signaturesDiscarded,5);f.faults.providerWrongDomain=null;assert.equal((await f.sign(h)).status,'SIGNED_MEMORY_STAGE_ONLY');
});
test('signature from another fresh instance cannot authorize this runtime',async t=>{
 const a=await setup(t),b=await setup(t),ha=await a.ready(),hb=await b.ready(),sa=await a.sign(ha),sb=await b.sign(hb);
 assert.notEqual(a.pin.genesisHash,b.pin.genesisHash);assert.notEqual(a.pin.instanceId,b.pin.instanceId);assert.notEqual(a.pin.vaultAddress,b.pin.vaultAddress);
 await assert.rejects(()=>attempt(a,sa,{},sb.signature),/AUTHORIZATION_SIGNER/);
});
test('latest E3 CAS and latest chain CAS are independent required fences',async t=>{
 const f=await setup(t),h=await f.ready();f.consent(f.firstApp);const r=await blocked(f,h);assert.equal(r.code,'STAGE_INTERNAL_CURRENT_REJECTED');
 const g=await setup(t),hg=await g.ready();await g.provider.send('evm_mine',[]);assert.equal((await blocked(g,hg)).code,'STAGE_CHAIN_CAS');
});
for(const change of ['withdraw','logout','scope','lease','objection','new-error'])test('authenticated E3 '+change+' blocks signing before key access',async t=>{
 const f=await setup(t),h=await f.ready(),app=f.firstApp;
 if(change==='withdraw')f.consent(app,'operator','WITHDRAW');
 if(change==='logout')f.evidence.service.logout(f.evidence.operatorContext);
 if(change==='scope'){f.evidence.configuration.resolveOperatorBindings=()=>[];f.evidence.restart();}
 if(change==='lease')f.evidence.change(app,'activity-complete',{rawAvailable:false});
 if(change==='objection'){const e=f.evidence.store.getApplication(f.evidence.aliceContext,app).evidence[0].record.evidenceId;f.evidence.store.submitReviewObjection(f.evidence.aliceContext,app,f.body(app,{reason:'SOURCE_MISMATCH',evidenceId:e}),f.evidence.key());}
 if(change==='new-error')await f.newValidError(app);
 await blocked(f,h);
});
for(const change of ['withdraw','logout','chain','key','close'])test('post-sign '+change+' discards generated signature',async t=>{
 const f=await setup(t),h=await f.ready();f.faults.duringSigning=async()=>{
  if(change==='withdraw')f.consent(f.firstApp,'operator','WITHDRAW');
  if(change==='logout')f.evidence.service.logout(f.evidence.operatorContext);
  if(change==='chain')await f.provider.send('evm_mine',[]);
  if(change==='key')await sent(f.vault.connect(f.accounts[1]).revokeKey(f.op(),f.keyId));
  if(change==='close')await f.close();
 };
 const r=await f.sign(h);assert.equal(r.status,'BLOCKED');assert.equal(r.signature,null);assert.equal(f.metrics.signaturesGenerated,1);assert.equal(f.metrics.signaturesDiscarded,1);
});
test('provider failure and overlapping signing calls remain closed without output',async t=>{
 const f=await setup(t),h=await f.ready();f.faults.providerFailure=true;assert.equal((await f.sign(h)).code,'STAGE_PROVIDER_FAILURE');assert.equal(f.metrics.signaturesGenerated,0);
 f.faults.providerFailure=false;let release;const gate=new Promise(r=>release=r);let entered;const started=new Promise(r=>entered=r);f.faults.duringSigning=async()=>{entered();await gate;};
 const first=f.sign(h);await started;assert.equal((await f.sign(h)).code,'STAGE_BUSY');release();assert.equal((await first).status,'SIGNED_MEMORY_STAGE_ONLY');
});
for(const mutation of ['revoke','pause','epoch','objection','valid-objection','current'])test('contract rechecks '+mutation+' after a valid signature',async t=>{
 const f=await setup(t),h=await f.ready(),s=await f.sign(h);
 if(mutation==='revoke')await sent(f.vault.connect(f.accounts[1]).revokeKey(f.op(),f.keyId));
 if(mutation==='pause')await sent(f.vault.connect(f.accounts[1]).setPause(f.op(),true));
 if(mutation==='epoch')await f.observe(f.firstApp,{});
 if(mutation==='objection')await f.observe(f.firstApp,{unassessedObjection:true});
 if(mutation==='valid-objection')await f.observe(f.firstApp,{validObjection:true});
 if(mutation==='current')await f.observe(f.firstApp,{currentMet:false});
 await f.sync();await assert.rejects(()=>attempt(f,s));await blocked(f,h);assert.equal(await f.vault.usedNonces(s.payload.message.nonce),false);
});
test('route2 requires full120 seconds and a current empty consent set',async t=>{
 const f=await setup(t),app=f.firstApp;await f.complete(app);await f.register(app);await f.fund(A);await f.allocate(app);await f.publish(app);
 await f.time(START+119);await f.bind(app);await assert.rejects(()=>f.prepare(app),/BC_E3_CONFIRMATION_WINDOW/);
 await f.time(START+120);await f.bind(app);const h=await f.prepare(app),s=await f.sign(h);assert.equal(s.payload.message.eligibilityRoute,'2');assert.equal(f.target(h).consentSet.consents.length,0);await f.accept(h,s);await f.claim(app);
});
for(const bound of ['expiry','source'])test('exclusive '+bound+' equality rejects first acceptance but retains reservation',async t=>{
 const f=await setup(t),app=f.firstApp;if(bound==='expiry')await f.expiry(app,START+10);
 const h=await f.ready(),s=await f.sign(h),at=Number(bound==='expiry'?s.payload.message.expiresAt:s.payload.message.sourceValidUntilExclusive);
 await f.time(at);await assert.rejects(()=>attempt(f,s));await blocked(f,h);assert.equal((await f.vault.accounting()).R,A);assert.equal((await f.vault.accounting()).O,A);
});
test('correction preserves allocation100 and original600; late route2 cannot reset cap',async t=>{
 const f=await setup(t),app=f.firstApp,h=await f.ready(),s=await f.sign(h),old=f.chainState(app),scope=f.publication(app).consentScope;
 await f.refreshEvidence(app,START+480);await f.replace(app);const next=f.chainState(app);assert.equal(next.allocationId,old.allocationId);assert.equal(next.firstStartedAt,old.firstStartedAt);
 assert.equal((await f.vault.accounting()).R,A);assert.equal((await f.vault.accounting()).O,A);await assert.rejects(()=>attempt(f,s));
 await f.publish(app);assert.equal(f.publication(app).consentScope.reviewCapAt,scope.reviewCapAt);assert.equal(f.view(app).procedure.deadlineRouteAvailable,false);
 await f.time(START+599);await f.bind(app);await assert.rejects(()=>f.prepare(app),/BC_E3_CONFIRMATION_WINDOW/);
 f.consent(app);f.consent(app,'operator');await f.bind(app);await f.nextNonce(app);const nh=await f.prepare(app),ns=await f.sign(nh);assert.equal(ns.status,'SIGNED_MEMORY_STAGE_ONLY');assert.equal(ns.payload.message.expiresAt,String(START+600));
 await f.time(START+600);await assert.rejects(()=>attempt(f,ns));const end=await f.terminate(app);assert.equal(end.intent.reason,'REVIEW_CAP_UNRESOLVED');assert.equal((await f.vault.accounting()).R,0n);
});
test('one assessed revalidation is preserved and second valid error terminates before cap',async t=>{
 const f=await setup(t),app=f.firstApp;await f.ready();await f.newValidError(app);await f.refreshEvidence(app,START+30);await f.replace(app,1);await f.publish(app);
 assert.equal(f.chainState(app).revalidationCount,1n);assert.equal(f.view(app).procedure.revalidationCount,1);
 const a=f.chainState(app),tgt={decisionId:a.target.decisionId,revision:a.target.revision+1n,decisionHash:id('second-revalidation'),sourceValidUntilExclusive:a.target.sourceValidUntilExclusive,acceptanceSequence:a.target.acceptanceSequence+1n,sourceReceiptHash:id('second-receipt')};
 await assert.rejects(()=>f.vault.replaceTarget.staticCall(f.op(),appid(f),tgt,1,a.version),/REVALIDATION_LIMIT/);
 await f.newValidError(app);
 assert.equal(f.chainState(app).terminalError,true);const ended=await f.terminate(app);assert.equal(ended.intent.reason,'NEW_VALID_ERROR_AFTER_ONE_REVERIFICATION');assert.equal(f.chainState(app).state,4n);assert.equal((await f.vault.accounting()).O,0n);
});
test('terminate-first invalidates old signature and atomically removes only unaccepted obligation',async t=>{
 const f=await setup(t),app=f.firstApp,h=await f.ready(),s=await f.sign(h);await f.time(START+600);const before=f.chainState(app),end=await f.terminate(app);
 assert.equal(end.intent.reason,'EXPIRED_EVIDENCE_NOT_REFRESHED_WITHIN_CAP');assert(f.chainState(app).epoch>before.epoch);await assert.rejects(()=>attempt(f,s),/UNACCEPTED_STATE/);
 assert.equal(await f.vault.usedNonces(s.payload.message.nonce),false);const ac=await f.vault.accounting();assert.equal(ac.R,0n);assert.equal(ac.O,0n);assert.equal(ac.B,A);
});
test('accepted-first protects stored right from terminate/correction; any caller claims after source key pause expiry changes',async t=>{
 const f=await setup(t),app=f.firstApp,h=await f.ready(),s=await f.sign(h);await f.accept(h,s);const right=await f.vault.acceptedRight(appid(f));
 const target=f.chainState(app).target;
 await assert.rejects(()=>f.vault.replaceTarget.staticCall(f.op(),appid(f),{decisionId:target.decisionId,revision:target.revision+1n,decisionHash:id('after-accept-correction'),sourceValidUntilExclusive:START+2000,acceptanceSequence:target.acceptanceSequence+1n,sourceReceiptHash:id('after-accept-receipt')},0,f.chainState(app).version),/UNACCEPTED_STATE/);
 await sent(f.vault.connect(f.accounts[1]).revokeKey(f.op(),f.keyId));await sent(f.vault.connect(f.accounts[1]).setPause(f.op(),true));f.evidence.change(app,'activity-complete',{rawAvailable:false});await f.time(START+1200);
 await assert.rejects(()=>f.vault.connect(f.accounts[4]).terminate.staticCall(f.op(),appid(f),1,id('receipt'),f.chainState(app).version),/UNACCEPTED_STATE/);
 await assert.rejects(()=>f.vault.observeCurrent.staticCall(f.op(),appid(f),{currentMet:false,validObjection:false,unassessedObjection:false,newValidError:false,sourceValidUntilExclusive:START+300,observedAt:START+1200,receiptHash:id('changed')},f.chainState(app).version),/UNACCEPTED_STATE/);
 assert.equal(f.view(app).chain.acceptedRight.claimExpiresAt,null);await f.claim(app,6);assert.equal((await f.vault.acceptedRight(appid(f))).authorizationDigest,right.authorizationDigest);
 await assert.rejects(()=>f.vault.connect(f.accounts[5]).claim.staticCall(appid(f)),/ACCEPTED_RIGHT_REQUIRED/);
 const ac=await f.vault.accounting();assert.equal(ac.B,0n);assert.equal(ac.R,0n);assert.equal(ac.O,0n);
});
test('once digest binds full calldata; failed operation rolls back and same successful operation has one effect',async t=>{
 const f=await setup(t),h=await f.ready(),s=await f.sign(h),op=f.op(),v=f.chainState(f.firstApp).version;
 await assert.rejects(()=>sent(f.vault.connect(f.accounts[2]).accept(op,s.payload.message,'0x',v,{gasLimit:1000000})));assert.equal(await f.vault.operations(op),'0x'+'00'.repeat(32));assert.equal(await f.vault.usedNonces(s.payload.message.nonce),false);
 await assert.rejects(()=>f.accept(h,s,op),/STAGE_CHAIN_CAS/);
 // Explicit contract-level call: stale stage capability stays rejected.
 await sent(f.vault.connect(f.accounts[2]).accept(op,s.payload.message,s.signature,v));probes.contractLevelAccepts++;await f.sync();const again=await sent(f.vault.connect(f.accounts[2]).accept(op,s.payload.message,s.signature,v));assert.equal(again.logs.length,0);
 const calldata=f.vault.interface.encodeFunctionData('accept',[op,s.payload.message,s.signature,v]);
 assert.equal(await f.vault.operations(op),keccak256(AbiCoder.defaultAbiCoder().encode(['address','bytes'],[f.roles.relayer,calldata])));
 await assert.rejects(()=>attempt(f,s,{},s.signature,op,v,5),/ROLE/);
 await assert.rejects(()=>attempt(f,s,{},s.signature,op,v+1n),/OPERATION_CONFLICT/);await assert.rejects(()=>attempt(f,s,{},s.signature+'00',op,v),/OPERATION_CONFLICT/);
 await assert.rejects(()=>attempt(f,s,{},s.signature,f.op(),v),/UNACCEPTED_STATE/);assert.equal(await f.vault.usedNonces(s.payload.message.nonce),true);
});
test('150 plus50 preserves another reservation; consumed nonce cannot prepare a second application',async t=>{
 const f=await setup(t),a=f.firstApp,b=f.newApp();for(const app of [a,b]){await f.complete(app);await f.register(app);}await f.fund(150000000n);await f.allocate(a);await shortfall(f,b,150000000n,A,2n*A);
 assert.equal(f.chainState(b).firstStartedAt,0n);await f.fund(50000000n);await f.allocate(b);await f.publish(a);f.consent(a);f.consent(a,'operator');await f.bind(a);const h=await f.prepare(a),s=await f.sign(h);await f.accept(h,s);await f.claim(a);
 const ac=await f.vault.accounting();assert.equal(ac.B,A);assert.equal(ac.R,A);assert.equal(ac.O,A);
 await f.publish(b);f.consent(b);f.consent(b,'operator');await f.bind(b);const hb=await f.prepare(b),sb=await f.sign(hb);assert.equal(sb.status,'SIGNED_MEMORY_STAGE_ONLY');
 await assert.rejects(()=>f.vault.prepareUnsigned.staticCall(f.op(),{...sb.payload.message,nonce:s.payload.message.nonce},f.chainState(b).version),/NONCE_USED/);await f.accept(hb,sb);await f.claim(b);assert.equal((await f.vault.accounting()).B,0n);
});
test('wrong roles and arbitrary early termination reasons do not release funds or nonce',async t=>{
 const f=await setup(t),h=await f.ready(),s=await f.sign(h),a=appid(f),version=f.chainState(f.firstApp).version;
 for(const who of [0,1,3,4,5,6])await assert.rejects(()=>attempt(f,s,{},s.signature,f.op(),version,who),/ROLE/);
 for(const reason of [0,1,2,3])await assert.rejects(()=>f.vault.connect(f.accounts[4]).terminate.staticCall(f.op(),a,reason,id('arbitrary-receipt'),version),/TERMINATION_CONDITION/);
 await assert.rejects(()=>f.vault.terminate.staticCall(f.op(),a,1,id('arbitrary-receipt'),version),/ROLE/);assert.equal((await f.vault.accounting()).R,A);assert.equal(await f.vault.usedNonces(s.payload.message.nonce),false);
});
test('controlled out-of-gas claim failure rolls back state and transfer; subsequent claim succeeds',async t=>{
 const f=await setup(t),h=await f.ready(),s=await f.sign(h);await f.accept(h,s);const a=appid(f),before=await f.vault.accounting(),recipient=f.registration(f.firstApp).registration.recipient,balance=await f.token.balanceOf(recipient);
 await assert.rejects(()=>sent(f.vault.connect(f.accounts[5]).claim(a,{gasLimit:50000})));assert.equal((await f.vault.application(a)).state,5n);assert.equal(await f.token.balanceOf(recipient),balance);assert.deepEqual(Array.from(await f.vault.accounting()),Array.from(before));await f.claim(f.firstApp);
});

async function shortfall(f,app,B,R,O){
 const before=Array.from(await f.vault.accounting()),a=f.chainState(app),r=f.registration(app),op=f.op();
 assert.deepEqual(before.slice(0,3),[B,R,O]);assert.equal(B-R,50000000n);
 assert.equal(a.state,1n);assert.equal(a.currentMet,true);assert.equal(await f.vault.nextAllocatable(),r.opaqueTarget.applicationId);
 await assert.rejects(()=>f.vault.allocate.staticCall(op,r.opaqueTarget.applicationId,r.opaqueTarget.allocationId,a.version),/SHORTFALL/);
 await assert.rejects(()=>sent(f.vault.allocate(op,r.opaqueTarget.applicationId,r.opaqueTarget.allocationId,a.version,{gasLimit:1000000})));
 assert.deepEqual(Array.from(await f.vault.accounting()),before);assert.equal((await f.vault.application(r.opaqueTarget.applicationId)).version,a.version);
 assert.equal(await f.vault.operations(op),'0x'+'00'.repeat(32));await f.sync();
}
test('same decision ID higher revision keeps reservation and rejects stale E3 capability',async t=>{
 const f=await setup(t),h=await f.ready(),s=await f.sign(h),a=f.chainState(f.firstApp);
 const target={decisionId:a.target.decisionId,revision:a.target.revision+1n,decisionHash:id('higher-revision'),sourceValidUntilExclusive:a.target.sourceValidUntilExclusive,acceptanceSequence:a.target.acceptanceSequence+1n,sourceReceiptHash:id('revision-receipt')};
 // Contract-only target mutation; E3 has not registered this new revision.
 await sent(f.vault.replaceTarget(f.op(),appid(f),target,0,a.version));await f.sync();const next=f.chainState(f.firstApp);
 assert.equal(next.target.decisionId,a.target.decisionId);assert.equal(next.allocationId,a.allocationId);assert.equal(next.firstStartedAt,a.firstStartedAt);
 assert.deepEqual(Array.from(await f.vault.accounting()).slice(0,3),[A,A,A]);await assert.rejects(()=>attempt(f,s));await blocked(f,h);
});
test('disconnect failure still closes owned stores and removes temporary directory',async()=>{
 const f=await createFreshMemoryStage(),directory=f.evidence.config.directory,disconnect=f.raw.disconnect.bind(f.raw);
 f.raw.disconnect=async()=>{await disconnect();throw new Error('injected-disconnect-error');};
 await assert.rejects(()=>f.close(),/STAGE_CLEANUP_FAILED/);assert.equal(existsSync(directory),false);
 assert.equal((await f.sign({})).code,'STAGE_CLOSED');await assert.rejects(()=>f.close(),/STAGE_CLEANUP_FAILED/);
});

import {buildStageProbe} from './stage-probe-build.mjs';
import {buildExecution} from './execution-build.mjs';
for(const mode of [1,2,3])test('controlled unsupported-token VM probe '+mode+' checks claim boundary then restores fixed asset',async t=>{
 const f=await setup(t),h=await f.ready(),s=await f.sign(h);await f.accept(h,s);
 const built=buildStageProbe(),probe=await new ContractFactory(built.abi,'0x'+built.evm.bytecode.object,f.accounts[0]).deploy(f.pin.vaultAddress,appid(f),mode);await probe.waitForDeployment();probes.deployments++;
 // Constructor must reject this runtime as an asset. This is not a supported-token path.
 const exe=buildExecution(),factory=new ContractFactory(exe.contract.abi,'0x'+exe.contract.evm.bytecode.object,f.accounts[0]);
 const bad=await factory.getDeployTransaction(await probe.getAddress(),id('bad-instance'),f.pin.policyHash,f.pin.runtimeMappingHash,f.roles);
 await assert.rejects(()=>f.provider.call({...bad,from:f.roles.registrar}),/TOKEN_CODE/);
 const snapshot=await f.provider.send('evm_snapshot',[]),code=await f.provider.getCode(await probe.getAddress());
 const before=Array.from(await f.vault.accounting()),recipient=f.registration(f.firstApp).registration.recipient,balance=await f.token.balanceOf(recipient),version=(await f.vault.application(appid(f))).version;
 try{
  await f.provider.send('evm_setAccountCode',[f.pin.tokenAddress,code]);probes.codeInjections++;
  assert.equal((await blocked(f,h)).code,'STAGE_RUNTIME_PIN');
  if(mode===1){
   await sent(f.vault.connect(f.accounts[5]).claim(appid(f),{gasLimit:1000000}));probes.injectedClaims++;
   const injected=new Contract(f.pin.tokenAddress,built.abi,f.provider);
   const expected=keccak256('0x08c379a0'+AbiCoder.defaultAbiCoder().encode(['string'],['REENTRANCY']).slice(2));
   assert.equal(await injected.callbackRevertHash(),expected);assert.equal(await f.token.balanceOf(recipient),balance+A);
   assert.equal((await f.vault.application(appid(f))).state,6n);
  }else{
   await assert.rejects(()=>f.vault.connect(f.accounts[5]).claim.staticCall(appid(f)),new RegExp(mode===2?'TOKEN_TRANSFER':'EXACT_TRANSFER'));
   await assert.rejects(()=>sent(f.vault.connect(f.accounts[5]).claim(appid(f),{gasLimit:1000000})));
   assert.equal((await f.vault.application(appid(f))).state,5n);assert.equal((await f.vault.application(appid(f))).version,version);
   assert.equal((await f.vault.acceptedRight(appid(f))).settledAt,0n);assert.equal(await f.token.balanceOf(recipient),balance);
   assert.deepEqual(Array.from(await f.vault.accounting()),before);
  }
 }finally{assert.equal(await f.provider.send('evm_revert',[snapshot]),true);}
 assert.equal(keccak256(await f.provider.send('eth_getCode',[f.pin.tokenAddress,'latest'])),f.pin.tokenCodeHash);
 await f.sync();assert.equal(f.chainState(f.firstApp).state,5n);await f.claim(f.firstApp);assert.equal(await f.token.balanceOf(recipient),balance+A);
});
test('two concurrent any-callers produce exactly one fixed settlement',async t=>{
 const f=await setup(t),h=await f.ready(),s=await f.sign(h);await f.accept(h,s);
 const recipient=f.registration(f.firstApp).registration.recipient,before=await f.token.balanceOf(recipient);
 const results=await Promise.allSettled([f.claim(f.firstApp,5),f.claim(f.firstApp,6)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.metrics.claims,1);
 assert.equal(await f.token.balanceOf(recipient),before+A);assert.deepEqual(Array.from(await f.vault.accounting()).slice(0,3),[0n,0n,0n]);
});

test('initialization failure after store creation closes both owned databases',async()=>{
 const before=memoryStageTotals(),original=DatabaseSync.prototype.close;let closed=0;
 const db=mock.method(DatabaseSync.prototype,'close',function(){closed++;return original.call(this);});
 const vm=Object.getOwnPropertyDescriptor(ganache,'provider');
 Object.defineProperty(ganache,'provider',{configurable:true,value:()=>{throw Error('INJECTED_VM_CONSTRUCTION_FAILURE');}});
 try{await assert.rejects(()=>createFreshMemoryStage(),/INJECTED_VM_CONSTRUCTION_FAILURE/);assert.equal(closed,2);assert.deepEqual(memoryStageTotals(),before);}
 finally{Object.defineProperty(ganache,'provider',vm);db.mock.restore();}
});

for(const phase of ['before-key','after-sign'])test('E3 withdrawal during awaited chain read at '+phase+' is fenced synchronously',async t=>{
 const f=await setup(t),h=await f.ready(),send=f.provider.send.bind(f.provider),selector=f.vault.interface.getFunction('checkPrepared').selector;
 let armed=phase==='before-key',changed=false;
 if(phase==='after-sign')f.faults.duringSigning=async()=>{armed=true;};
 f.provider.send=async(method,args)=>{
  const result=await send(method,args);
  if(armed&&!changed&&method==='eth_call'&&args[0].data.startsWith(selector)){changed=true;f.consent(f.firstApp,'operator','WITHDRAW');}
  return result;
 };
 const result=await f.sign(h);assert.equal(changed,true);assert.equal(result.status,'BLOCKED');assert.equal(result.signature,null);
 assert.equal(f.metrics.keyProviderCalls,phase==='before-key'?0:1);
 assert.equal(f.metrics.signaturesDiscarded,phase==='before-key'?0:1);
});

test('measured role readback mismatch rejects signing before key access',async t=>{
 const f=await setup(t),h=await f.ready(),send=f.provider.send.bind(f.provider),selector=f.vault.interface.getFunction('roles').selector;
 const measured=await f.vault.roles(),bad=Array.from(measured);bad[0]=await f.accounts[6].getAddress();let intercepted=false;
 f.provider.send=async(method,args)=>{
  const result=await send(method,args);
  if(method==='eth_call'&&args[0].data.startsWith(selector)){intercepted=true;return f.vault.interface.encodeFunctionResult('roles',bad);}
  return result;
 };
 assert.equal((await blocked(f,h)).code,'STAGE_RUNTIME_PIN');assert.equal(intercepted,true);
});
