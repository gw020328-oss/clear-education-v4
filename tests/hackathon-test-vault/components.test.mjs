import test from 'node:test';
import assert from 'node:assert/strict';
import {id,ZeroHash,ZeroAddress,TypedDataEncoder,ContractFactory} from 'ethers';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {setup,sent,AMOUNT,BASE} from './fixture.mjs';
import {TYPES} from '../../src/bootcamp-authorization/test-schema-v3.mjs';
const gone=async(fn,pattern)=>assert.rejects(fn,pattern);

test('preparation ABI cannot activate, accept, claim, withdraw or move another reservation',async t=>{
 const f=await setup(t),names=f.artifacts.HackathonTestVaultPreparation.abi.filter(x=>x.type==='function').map(x=>x.name);
 assert.equal(await f.vault.payoutEnabled(),false);
 for(const name of ['accept','claim','activate','withdraw','reclaimExpired','upgradeTo','transferReservation'])assert(!names.includes(name));
 assert((f.artifacts.HackathonTestVaultPreparation.runtime.length-2)/2<24576);
 const pins=JSON.parse(readFileSync(new URL('../../specs/bootcamp/hackathon-test-consumer-pins-v1.json',import.meta.url)));
 assert.equal(await f.vault.TYPE_HASH(),pins.typedEncoding.typeHash);await f.invariant();
});
test('150 plus50 funds two whole obligations in MET ledger order and protects first reservation',async t=>{
 const f=await setup(t),a=await f.register('a'),b=await f.register('b');await f.fund(150000000n);
 await gone(()=>f.vault.allocate.staticCall(f.op(),b,id('alloc-b'),1),/QUEUE_ORDER_OR_SOURCE/);
 await f.allocate(a);let x=await f.invariant();assert.equal(x.B,150000000n);assert.equal(x.R,AMOUNT);assert.equal(x.O,2n*AMOUNT);assert.equal(x.S,50000000n);
 await gone(()=>f.vault.allocate.staticCall(f.op(),b,id('alloc-b'),1),/SHORTFALL/);
 await f.fund(50000000n);await f.allocate(b);x=await f.invariant();assert.equal(x.R,2n*AMOUNT);assert.equal(x.S,0n);
 assert.equal((await f.state(a)).state,2n);assert.equal(await f.token.balanceOf(f.addresses[6]),0n);
});
test('funding wait does not start600 or release obligation on source expiry',async t=>{
 const f=await setup(t),a=await f.register('a',{sourceValidUntilExclusive:BigInt(BASE+20)});await f.time(BASE+901);
 const state=await f.state(a);assert.equal(state.firstStartedAt,0n);assert.equal(await f.vault.nextAllocatable(),ZeroHash);
 await gone(()=>f.vault.connect(f.signers[5]).terminate.staticCall(f.op(),a,1,id('receipt'),state.version),/TERMINATION_CONDITION/);
 await gone(()=>f.vault.connect(f.signers[5]).terminate.staticCall(f.op(),a,3,id('receipt'),state.version),/TERMINATION_CONDITION/);
 assert.equal((await f.invariant()).O,AMOUNT);
});
test('registration rejects duplicate canonical app, invalid recipient and repeated/out-of-order sequence',async t=>{
 const f=await setup(t),a=await f.register();
 await gone(()=>f.vault.registerCurrentMet.staticCall(f.op(),a,f.addresses[6],f.target('same')),/APPLICATION/);
 await gone(()=>f.vault.registerCurrentMet.staticCall(f.op(),id('new'),ZeroAddress,f.target('zero')),/RECIPIENT/);
 await gone(()=>f.vault.registerCurrentMet.staticCall(f.op(),id('new'),f.addresses[6],f.target('sequence',{acceptanceSequence:1n})),/TARGET_TIME_SEQUENCE/);
 await gone(()=>f.vault.registerCurrentMet.staticCall(f.op(),id('new'),f.addresses[6],f.target('expired',{sourceValidUntilExclusive:BigInt(BASE)})),/TARGET_TIME_SEQUENCE/);
 assert.equal((await f.invariant()).O,AMOUNT);
});
test('one operation applies once and changed payload conflict never credits more',async t=>{
 const f=await setup(t),{operation}=await f.fund(150000000n);await sent(f.vault.connect(f.signers[4]).fund(operation,150000000n));
 assert.equal((await f.invariant()).B,150000000n);
 await gone(()=>f.vault.connect(f.signers[4]).fund.staticCall(operation,50000000n),/OPERATION_CONFLICT/);
});
test('failed token transfer rolls back operation, balances and reservations',async t=>{
 const f=await setup(t),op=f.op();await gone(()=>sent(f.vault.connect(f.signers[4]).fund(op,AMOUNT,{gasLimit:1000000})),/revert|CALL_EXCEPTION/);
 assert.equal(await f.vault.operations(op),ZeroHash);assert.equal((await f.invariant()).B,0n);
});
test('donated tokens remain surplus and cannot fund an allocation',async t=>{
 const f=await setup(t),a=await f.register();await sent(f.token.connect(f.signers[4]).transfer(await f.vault.getAddress(),AMOUNT));
 const x=await f.invariant();assert.equal(x.B,0n);assert.equal(x.surplus,AMOUNT);
 await gone(()=>f.vault.allocate.staticCall(f.op(),a,id('alloc'),1),/SHORTFALL/);
});
test('role separation rejects signer/relayer as registrar or terminator and key admin as allocator',async t=>{
 const f=await setup(t),a=await f.register();await f.fund(AMOUNT);
 for(const i of [1,2,3,4,5,6])await gone(()=>f.vault.connect(f.signers[i]).allocate.staticCall(f.op(),a,id('alloc'),1),/ROLE/);
 for(const i of [0,1,2,3,4,6])await gone(()=>f.vault.connect(f.signers[i]).terminate.staticCall(f.op(),a,1,id('receipt'),1),/ROLE/);
 await gone(()=>f.vault.connect(f.signers[1]).registerCurrentMet.staticCall(f.op(),id('forged'),f.addresses[1],f.target('forged')),/ROLE/);
});
test('constructor requires exact fixed token, P0 policy and distinct nonzero roles',async t=>{
 const f=await setup(t),factory=new ContractFactory(f.artifacts.HackathonTestVaultPreparation.abi,f.artifacts.HackathonTestVaultPreparation.bytecode,f.signers[0]);
 const cfg=[await f.token.getAddress(),f.config.instanceId,f.config.policyHash,f.config.runtimeMappingHash,f.roles];
 for(const [index,value] of [[0,ZeroAddress],[0,await f.vault.getAddress()],[1,ZeroHash],[2,id('wrong-policy')],[4,{...f.roles,initialSigner:f.roles.registrar}],[4,{...f.roles,terminator:ZeroAddress}]]){const args=[...cfg];args[index]=value;await gone(()=>factory.deploy(...args),/TOKEN_CODE|CONFIG|ROLE_SEPARATION|ROLE_ADDRESS|missing revert data/);}
});
test('key IDs and signer addresses are immutable tombstones, key role cannot overlap',async t=>{
 const f=await setup(t);await f.key();await sent(f.vault.connect(f.signers[2]).revokeKey(f.op(),f.keyId));
 await gone(()=>f.vault.connect(f.signers[2]).registerKey.staticCall(f.op(),f.keyId,f.addresses[7]),/KEY_ID/);
 await gone(()=>f.vault.connect(f.signers[2]).registerKey.staticCall(f.op(),id('new-id'),f.addresses[1]),/KEY_ID/);
 await gone(()=>f.vault.connect(f.signers[2]).registerKey.staticCall(f.op(),id('other'),f.addresses[0]),/KEY_ROLE/);
 assert.equal((await f.vault.keys(f.keyId)).revoked,true);
});
test('register, allocation and unsigned prepare CAS reject stale app version',async t=>{
 const f=await setup(t),a=await f.ready(),p=await f.payload(a);
 await gone(()=>f.vault.prepareUnsigned.staticCall(f.op(),p.message,1),/APP_CAS/);
 await gone(()=>f.vault.allocate.staticCall(f.op(),a,id('alloc-new'),1),/APP_CAS/);
});
test('unsigned v3 digest equals frozen JS type and matches registered state without a signature',async t=>{
 const f=await setup(t),a=await f.ready(),p=await f.prepare(a),hash=f.typedHash(p);
 assert.equal(await f.vault.hashAuthorization(p.message),hash);const result=await f.vault.checkPrepared(p.message);assert.equal(result.digest,hash);assert.equal(result.canPay,false);
 assert.equal(await f.token.balanceOf(f.addresses[6]),0n);await f.invariant();
 t.diagnostic('UNSIGNED_PREPARATION_ONLY: authorization signatures0, accepts0, claims0, external RPC0');
});
test('every24 field mutation differs in digest and cannot match a prepared registered command',async t=>{
 const f=await setup(t),a=await f.ready(),p=await f.prepare(a),base=await f.vault.hashAuthorization(p.message);
 for(const [field,value] of Object.entries(p.message)){
  const m={...p.message,[field]:field==='eligibilityRoute'?'2':value.startsWith('0x')?(value.length===42?f.addresses[7]:id('changed-'+field)):(BigInt(value)+1n).toString()};
  assert.notEqual(await f.vault.hashAuthorization(m),base,field);await gone(()=>f.vault.checkPrepared(m),/revert|CALL_EXCEPTION/,field);
 }
});
test('domain chain salt verifyingContract name version mutations differ from chain digest',async t=>{
 const f=await setup(t),a=await f.ready(),p=await f.payload(a),base=await f.vault.hashAuthorization(p.message);
 for(const [k,v] of Object.entries({chainId:'31340',salt:id('other-instance'),verifyingContract:f.addresses[7],name:'OtherDomain',version:'2'}))assert.notEqual(TypedDataEncoder.hash({...p.domain,[k]:v},TYPES,p.message),base,k);
});
test('route1 requires mutual current consent; route2 requires the complete120 and can use tagged partial set',async t=>{
 const f=await setup(t),a=await f.ready();await f.consent(a,false);let p=await f.payload(a);
 const v=await f.version(a);await gone(()=>f.vault.prepareUnsigned.staticCall(f.op(),p.message,v),/MUTUAL_CONSENT/);
 p=await f.payload(a,{route:'2'});await gone(()=>f.vault.prepareUnsigned.staticCall(f.op(),p.message,v),/FULL_CONFIRMATION_WINDOW/);
 await f.time(BASE+120);p=await f.prepare(a,{route:'2'});assert.equal((await f.vault.checkPrepared(p.message)).canPay,false);
});
for(const flag of ['currentMet','validObjection','unassessedObjection','newValidError'])test('current flag '+flag+' invalidates preparation and keeps reserved100/O100',async t=>{
 const f=await setup(t),a=await f.ready(),p=await f.prepare(a),before=await f.state(a);await f.observe(a,{[flag]:flag==='currentMet'?false:true});
 const after=await f.state(a);assert(after.epoch>before.epoch);assert.equal(after.preparedDigest,ZeroHash);
 await gone(()=>f.vault.checkPrepared(p.message),/CURRENT_REVIEW/);const x=await f.invariant();assert.equal(x.R,AMOUNT);assert.equal(x.O,AMOUNT);
});
test('narrowed source bound invalidates old preparation; extending same target is forbidden',async t=>{
 const f=await setup(t),a=await f.ready(),p=await f.prepare(a);await f.observe(a,{sourceValidUntilExclusive:BigInt(BASE+20)});
 await gone(()=>f.vault.checkPrepared(p.message),/PROCEDURE_TARGET/);const v=await f.version(a);
 await gone(()=>f.vault.observeCurrent.staticCall(f.op(),a,{currentMet:true,validObjection:false,unassessedObjection:false,newValidError:false,sourceValidUntilExclusive:BigInt(BASE+900),observedAt:BASE,receiptHash:id('receipt')},v),/SOURCE_EXTENSION/);
 await f.time(BASE+20);await gone(()=>f.vault.checkPrepared(p.message),/CURRENT_REVIEW/);await f.invariant();
});
test('unsigned approval expiration is exclusive even if prepared before deadline',async t=>{
 const f=await setup(t),a=await f.ready(),p=await f.prepare(a);await f.time(Number(p.message.expiresAt)-1);await f.vault.checkPrepared(p.message);
 await f.time(Number(p.message.expiresAt));await gone(()=>f.vault.checkPrepared(p.message),/AUTHORIZATION_TIME/);
});
test('key revoke blocks unsigned check without releasing application reservations',async t=>{
 const f=await setup(t),a=await f.ready(),p=await f.prepare(a);await sent(f.vault.connect(f.signers[2]).revokeKey(f.op(),f.keyId));
 await gone(()=>f.vault.checkPrepared(p.message),/SIGNER_KEY/);const x=await f.invariant();assert.equal(x.R,AMOUNT);assert.equal(x.O,AMOUNT);
});
test('correction preserves one obligation/reservation/original cap, clears consent and invalidates escaped digest',async t=>{
 const f=await setup(t),a=await f.ready(),p=await f.prepare(a),before=await f.state(a);await f.time(BASE+50);
 const replacementOp=f.op();const receipt=await sent(f.vault.replaceTarget(replacementOp,a,f.target('correction',{revision:2n}),1,before.version));const event=receipt.logs.map(l=>{try{return f.vault.interface.parseLog(l);}catch{return null;}}).find(e=>e?.name==='TargetReplaced');
 assert.equal(event.args.operationId,replacementOp);assert.equal(event.args.previous.decisionHash,before.target.decisionHash);assert.equal(event.args.previous.epoch,before.epoch);assert.equal(event.args.current.epoch,before.epoch+1n);assert.equal(event.args.current.appVersion,before.version+1n);assert.equal(event.args.allocationId,before.allocationId);
 const changed=await f.state(a);
 assert.equal(changed.firstStartedAt,before.firstStartedAt);assert.equal(changed.allocationId,before.allocationId);assert.equal(changed.revalidationCount,1n);assert.equal(changed.consentSetHash,ZeroHash);assert.equal(changed.state,2n);assert(changed.epoch>before.epoch);
 await gone(()=>f.vault.checkPrepared(p.message),/CURRENT_REVIEW/);await f.review(a);await f.consent(a);await f.prepare(a);const x=await f.invariant();assert.equal(x.O,AMOUNT);assert.equal(x.R,AMOUNT);
});
test('routine source refresh changes revision/queue but does not consume revalidation budget',async t=>{
 const f=await setup(t),a=await f.register('a'),b=await f.register('b');await sent(f.vault.replaceTarget(f.op(),a,f.target('a-new',{revision:2n}),0,await f.version(a)));
 assert.equal(await f.vault.nextAllocatable(),b);assert.equal((await f.state(a)).revalidationCount,0n);assert.equal((await f.invariant()).O,2n*AMOUNT);
});
test('new valid error requires real revalidation and cannot be silently cleared by observation/refresh',async t=>{
 const f=await setup(t),a=await f.ready();await f.observe(a,{newValidError:true});await f.observe(a,{newValidError:false});assert.equal((await f.state(a)).newValidError,true);
 const next=f.target('revision2',{revision:2n}),v=await f.version(a);await gone(()=>f.vault.replaceTarget.staticCall(f.op(),a,next,0,v),/REVALIDATION_REQUIRED/);
 await sent(f.vault.replaceTarget(f.op(),a,next,1,v));await f.observe(a,{newValidError:true});assert.equal((await f.state(a)).terminalError,true);
 const v2=await f.version(a);await gone(()=>f.vault.replaceTarget.staticCall(f.op(),a,f.target('revision3',{revision:3n}),0,v2),/TERMINAL_ERROR/);
 await sent(f.vault.connect(f.signers[5]).terminate(f.op(),a,2,id('validated-error-receipt'),v2));assert.equal((await f.invariant()).R,0n);assert.equal((await f.state(a)).state,4n);
});
test('unassessed substantive objection cannot be discarded by replacing target',async t=>{
 const f=await setup(t),a=await f.ready();await f.observe(a,{unassessedObjection:true});const v=await f.version(a);
 await gone(()=>f.vault.replaceTarget.staticCall(f.op(),a,f.target('rev2',{revision:2n}),0,v),/OBJECTION_UNASSESSED/);assert.equal((await f.invariant()).R,AMOUNT);
});
test('review firstStart cannot reset and a corrected publication+120 exactly atcap has no deadline route',async t=>{
 const f=await setup(t),a=await f.ready();await f.time(BASE+480);await sent(f.vault.replaceTarget(f.op(),a,f.target('late',{revision:2n}),1,await f.version(a)));
 const v=await f.version(a);await gone(()=>f.vault.startReview.staticCall(f.op(),a,id('different-procedure'),BASE+480,v),/PROCEDURE_FIXED/);
 await f.review(a);await f.consent(a,false);let p=await f.payload(a,{route:'2',issuedAt:String(BASE+600),expiresAt:String(BASE+601)});
 const version=await f.version(a);await gone(()=>f.vault.prepareUnsigned.staticCall(f.op(),p.message,version),/AUTHORIZATION_TIME|ACCEPT_WINDOW/);
 await f.consent(a,true);p=await f.prepare(a);assert.equal(p.message.firstReviewStartedAt,String(BASE));
 await f.time(BASE+600);await gone(()=>f.vault.checkPrepared(p.message),/AUTHORIZATION_TIME|ACCEPT_WINDOW/);
});
test('termination requires explicit authority plus recorded condition, then atomically releases only one reservation',async t=>{
 const f=await setup(t),a=await f.ready(),b=await f.register('b');await f.fund(AMOUNT);await f.allocate(b);await f.review(b);const version=await f.version(a);
 for(const reason of [1,2,3])await gone(()=>f.vault.connect(f.signers[5]).terminate.staticCall(f.op(),a,reason,id('arbitrary-reason'),version),/TERMINATION_CONDITION/);
 await f.time(BASE+600);const op=f.op();await sent(f.vault.connect(f.signers[5]).terminate(op,a,1,id('cap-receipt'),version));await sent(f.vault.connect(f.signers[5]).terminate(op,a,1,id('cap-receipt'),version));
 const state=await f.state(a),x=await f.invariant();assert.equal(state.state,4n);assert.equal(x.O,AMOUNT);assert.equal(x.R,AMOUNT);assert.equal((await f.state(b)).state,3n);assert.equal(x.B,2n*AMOUNT);
 await gone(()=>f.vault.registerCurrentMet.staticCall(f.op(),a,f.addresses[6],f.target('resurrect')),/APPLICATION/);
 await gone(()=>f.vault.connect(f.signers[5]).terminate.staticCall(f.op(),a,1,id('other-receipt'),state.version),/UNACCEPTED_STATE/);
});
test('source-unrefreshed reason needs both original cap and expired source',async t=>{
 const f=await setup(t),a=await f.ready();await f.observe(a,{sourceValidUntilExclusive:BigInt(BASE+10)});await f.time(BASE+10);let v=await f.version(a);
 await gone(()=>f.vault.connect(f.signers[5]).terminate.staticCall(f.op(),a,3,id('expired'),v),/TERMINATION_CONDITION/);
 await f.time(BASE+600);await sent(f.vault.connect(f.signers[5]).terminate(f.op(),a,3,id('expired-after-cap'),v));assert.equal((await f.invariant()).O,0n);
});
test('pause stops new preparation/allocation but preserves pool and permits safe termination',async t=>{
 const f=await setup(t),a=await f.ready(),p=await f.prepare(a);await sent(f.vault.connect(f.signers[2]).setPause(f.op(),true));
 await gone(()=>f.vault.checkPrepared(p.message),/PAUSED/);assert.equal((await f.invariant()).R,AMOUNT);
 await f.time(BASE+600);await sent(f.vault.connect(f.signers[5]).terminate(f.op(),a,1,id('cap'),await f.version(a)));assert.equal((await f.invariant()).R,0n);
});
test('allocation duplicate tx response recovery and concurrent stale commands cannot double R',async t=>{
 const f=await setup(t),a=await f.register();await f.fund(2n*AMOUNT);const op=f.op(),allocation=id('stable-allocation'),v=await f.version(a);
 await sent(f.vault.allocate(op,a,allocation,v));await sent(f.vault.allocate(op,a,allocation,v));
 await gone(()=>sent(f.vault.allocate(f.op(),a,id('second'),v,{gasLimit:1000000})),/revert|CALL_EXCEPTION/);assert.equal((await f.invariant()).R,AMOUNT);
});
test('memory reorg removes funding operation and accounting; canonical reread can reapply same intent',async t=>{
 const f=await setup(t);await f.register();const snapshot=await f.provider.send('evm_snapshot',[]),{operation}=await f.fund(AMOUNT);assert.notEqual(await f.vault.operations(operation),ZeroHash);
 await f.provider.send('evm_revert',[snapshot]);await f.provider.send('evm_mine',[]);assert.equal(await f.vault.operations(operation),ZeroHash);assert.equal((await f.invariant()).B,0n);
 await sent(f.token.connect(f.signers[4]).approve(await f.vault.getAddress(),AMOUNT));await sent(f.vault.connect(f.signers[4]).fund(operation,AMOUNT));assert.equal((await f.invariant()).B,AMOUNT);
});
test('strict ECDSA primitive rejects malformed length, high-s, invalid-v and zero recovery without signing',async t=>{
 const f=await setup(t),probe=await f.deploy('PrimitiveProbe'),digest=id('SYNTHETIC_PRIMITIVE_NOT_AUTHORIZATION');
 const sig=(r,s,v)=>'0x'+r.padStart(64,'0')+s.padStart(64,'0')+v;
 await gone(()=>probe.recover(digest,'0x'),/SIGNATURE_LENGTH/);
 await gone(()=>probe.recover(digest,sig('0','f'.repeat(64),'1b')),/SIGNATURE_S/);
 await gone(()=>probe.recover(digest,sig('0','1','00')),/SIGNATURE_V/);
 await gone(()=>probe.recover(digest,sig('0','1','1b')),/SIGNATURE_RECOVERY/);
 await gone(()=>probe.recover(digest,sig('0','0','1b')),/SIGNATURE_S/);
});

test('second revalidation is rejected even without a subsequent error, while original reservation survives',async t=>{
 const f=await setup(t),a=await f.ready();await sent(f.vault.replaceTarget(f.op(),a,f.target('rev2',{revision:2n}),1,await f.version(a)));const v=await f.version(a);
 await gone(()=>f.vault.replaceTarget.staticCall(f.op(),a,f.target('rev3',{revision:3n}),1,v),/REVALIDATION_LIMIT/);
 assert.equal((await f.invariant()).R,AMOUNT);assert.equal((await f.invariant()).O,AMOUNT);
});
test('global allocationId reuse cannot redirect a second obligation to first reservation',async t=>{
 const f=await setup(t),a=await f.register('a'),b=await f.register('b');await f.fund(2n*AMOUNT);await f.allocate(a);const allocation=(await f.state(a)).allocationId;
 await gone(()=>f.vault.allocate.staticCall(f.op(),b,allocation,1),/ALLOCATION_ID/);assert.equal((await f.invariant()).R,AMOUNT);
});
test('two concurrent allocation submissions with the same appVersion apply once',async t=>{
 const f=await setup(t),a=await f.register();await f.fund(2n*AMOUNT);
 const results=await Promise.allSettled([1,2].map(i=>sent(f.vault.allocate(f.op(),a,id('concurrent-'+i),1,{gasLimit:1000000}))));
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal((await f.invariant()).R,AMOUNT);
});
test('failed on-chain termination leaves operation, app epoch/version and R/O unchanged',async t=>{
 const f=await setup(t),a=await f.ready(),before=await f.state(a),op=f.op();
 await gone(()=>sent(f.vault.connect(f.signers[5]).terminate(op,a,2,id('forged-condition'),before.version,{gasLimit:1000000})),/revert|CALL_EXCEPTION/);
 const after=await f.state(a);assert.equal(after.epoch,before.epoch);assert.equal(after.version,before.version);assert.equal(await f.vault.operations(op),ZeroHash);assert.equal((await f.invariant()).R,AMOUNT);
});
test('pinned E2 source artifacts and ABI order remain exactly those accepted by E0',()=>{
 const pins=JSON.parse(readFileSync(new URL('../../specs/bootcamp/hackathon-test-consumer-pins-v1.json',import.meta.url)));
 for(const [path,hash]of Object.entries(pins.artifactSha256))assert.equal(createHash('sha256').update(readFileSync(new URL('../../'+path,import.meta.url))).digest('hex'),hash,path);
});
