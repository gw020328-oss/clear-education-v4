import test from 'node:test';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import {BrowserProvider,ContractFactory,Wallet,id,TypedDataEncoder} from 'ethers';
import {buildExecutionV2} from './execution-v2-build.mjs';
import {recipientRegistration,verifyRecipientRegistration} from '../../src/bootcamp/recipient-registration.mjs';
import {TYPES as PAYMENT_TYPES,PROFILE_HASH} from '../../src/bootcamp-authorization/test-schema-v3.mjs';

const START=1900000000;
const sent=async promise=>(await promise).wait();
async function fixture(t) {
 const b=buildExecutionV2();
 const raw=ganache.provider({logging:{quiet:true},chain:{chainId:431729,hardfork:'shanghai',time:new Date(START*1000)},miner:{timestampIncrement:0},wallet:{totalAccounts:6}});
 const provider=new BrowserProvider(raw,undefined,{cacheTimeout:-1});provider.pollingInterval=10;
 t.after(async()=>{provider.destroy();await raw.disconnect();});
 const accounts=await Promise.all(Array.from({length:6},(_,i)=>provider.getSigner(i)));
 const addresses=await Promise.all(accounts.map(a=>a.getAddress()));
 const token=await new ContractFactory(b.tokenContract.abi,'0x'+b.tokenContract.evm.bytecode.object,accounts[3]).deploy(10000000000n);await token.waitForDeployment();
 const signer=Wallet.createRandom();
 const roles={registrar:addresses[0],initialSigner:signer.address,keyAdmin:addresses[1],relayer:addresses[2],depositor:addresses[3],terminator:addresses[4]};
 const policyHash='0x1c6f90cd998e91a11bc6abc9fca3fb9f918238225b077b1aa0610de395fae281';
 const config={chainId:431729,instanceId:id('synthetic-v2-instance'),policyHash,runtimeMappingHash:id('synthetic-mapping')};
 const vault=await new ContractFactory(b.contract.abi,'0x'+b.contract.evm.bytecode.object,accounts[0]).deploy(await token.getAddress(),config.instanceId,policyHash,config.runtimeMappingHash,roles);await vault.waitForDeployment();
 config.verifyingContract=await vault.getAddress();
 let n=0;const op=()=>id('synthetic-operation-'+(++n));
 async function registration(wallet=Wallet.createRandom(),patch={}) {
  const payload=recipientRegistration({...config,participant:wallet.address,applicationSalt:op(),nonce:op(),deadline:START+200,...patch});
  const signature=await wallet.signTypedData(payload.domain,payload.types,payload.message);
  const target={decisionId:op(),revision:1,decisionHash:op(),sourceValidUntilExclusive:START+240,acceptanceSequence:0,sourceReceiptHash:op()};
  return {wallet,payload,signature,target};
 }
 const args=r=>[op(),r.payload.message.applicationId,r.payload.message.recipient,r.target,r.payload.message,r.signature];
 return {b,raw,provider,vault,token,accounts,signer,config,registration,args,op};
}

test('V2 compiles within actual EVM limits and omits unsigned registration overload',()=>{
 const b=buildExecutionV2();assert(b.runtimeBytes<=24576);assert(b.creationBytes+320<=49152);assert.deepEqual(b.warnings,[]);
 const registrations=b.contract.abi.filter(x=>x.name==='registerCurrentMet');assert.equal(registrations.length,1);assert.equal(registrations[0].inputs.length,6);
});
test('participant-bound typed registration matches chain hash, consumes nonce once and fixes order',async t=>{
 const f=await fixture(t),r=await f.registration(),m=r.payload.message;
 assert.equal(await f.vault.participantApplicationId(m.participant,m.applicationSalt),m.applicationId);
 assert.equal(await f.vault.hashRegistration(m),TypedDataEncoder.hash(r.payload.domain,r.payload.types,m));
 assert.equal(verifyRecipientRegistration(r.payload,r.signature,{applicationOwner:r.wallet.address,nowSeconds:START,sourceValidUntilExclusive:START+240}).applicationId,m.applicationId);
 const args=f.args(r);await sent(f.vault.registerCurrentMet(...args));await sent(f.vault.registerCurrentMet(...args));
 assert.equal(await f.vault.lastAcceptanceSequence(),1n);assert.equal(await f.vault.usedRegistrationNonces(m.participant,m.nonce),true);
 assert.equal((await f.vault.application(m.applicationId)).recipient,r.wallet.address);
 await assert.rejects(()=>f.vault.registerCurrentMet.staticCall(...f.args(r)),/APPLICATION/);
 const reused=await f.registration(r.wallet,{nonce:m.nonce});await assert.rejects(()=>f.vault.registerCurrentMet.staticCall(...f.args(reused)),/REGISTRATION_NONCE/);
});
test('attacker self signature cannot claim fixed victim application; backend owner anchor is required',async t=>{
 const f=await fixture(t),victim=await f.registration(),attacker=await f.registration();
 const forged={...attacker,payload:{...attacker.payload,message:{...attacker.payload.message,applicationId:victim.payload.message.applicationId}}};
 forged.signature=await attacker.wallet.signTypedData(forged.payload.domain,forged.payload.types,forged.payload.message);
 await assert.rejects(()=>f.vault.registerCurrentMet.staticCall(...f.args(forged)),/REGISTRATION_APPLICATION/);
 assert.throws(()=>verifyRecipientRegistration(attacker.payload,attacker.signature,{applicationOwner:victim.wallet.address,nowSeconds:START,sourceValidUntilExclusive:START+240}),/REGISTRATION_APPLICATION_OWNER/);
});
test('wrong signature domain, owner, recipient, policy, application and deadline fail before registration',async t=>{
 const f=await fixture(t),r=await f.registration();
 for(const patch of [{chainId:431730},{verifyingContract:Wallet.createRandom().address},{salt:id('other-instance')},{name:'ClearBootcampTestPayment'},{version:'3'}]) {
  const signature=await r.wallet.signTypedData({...r.payload.domain,...patch},r.payload.types,r.payload.message);
  await assert.rejects(()=>f.vault.registerCurrentMet.staticCall(...f.args({...r,signature})),/REGISTRATION_SIGNER/);
 }
 for(const patch of [{recipient:Wallet.createRandom().address},{policyHash:id('other-policy')},{applicationId:id('other-app')},{deadline:START},{deadline:START+241}]) {
  const message={...r.payload.message,...patch};const signature=await r.wallet.signTypedData(r.payload.domain,r.payload.types,message);
  await assert.rejects(()=>f.vault.registerCurrentMet.staticCall(...f.args({...r,payload:{...r.payload,message},signature})));
 }
 const signature=await Wallet.createRandom().signTypedData(r.payload.domain,r.payload.types,r.payload.message);
 await assert.rejects(()=>f.vault.registerCurrentMet.staticCall(...f.args({...r,signature})),/REGISTRATION_SIGNER/);
 assert.equal(await f.vault.lastAcceptanceSequence(),0n);
});
test('chain arrival order governs allocation, refresh retains order, registrar cannot assign a sequence',async t=>{
 const f=await fixture(t),a=await f.registration(),b=await f.registration();
 await assert.rejects(()=>f.vault.registerCurrentMet.staticCall(...f.args({...a,target:{...a.target,acceptanceSequence:90}})),/REGISTRATION_SEQUENCE/);
 await sent(f.vault.registerCurrentMet(...f.args(b)));await sent(f.vault.registerCurrentMet(...f.args(a)));
 const aid=a.payload.message.applicationId,bid=b.payload.message.applicationId;
 assert.equal(await f.vault.nextAllocatable(),bid);
 const replacement={...b.target,decisionHash:f.op(),revision:2,acceptanceSequence:1};
 await sent(f.vault.replaceTarget(f.op(),bid,replacement,0,1));assert.equal(await f.vault.nextAllocatable(),bid);
 await assert.rejects(()=>f.vault.replaceTarget.staticCall(f.op(),bid,{...replacement,decisionHash:f.op(),revision:3,acceptanceSequence:3},0,2),/REGISTRATION_SEQUENCE_FIXED/);
 await sent(f.token.connect(f.accounts[3]).approve(await f.vault.getAddress(),200000000n));await sent(f.vault.connect(f.accounts[3]).fund(f.op(),200000000n));
 await assert.rejects(()=>f.vault.allocate.staticCall(f.op(),aid,f.op(),1),/QUEUE_ORDER_OR_SOURCE/);
 await sent(f.vault.allocate(f.op(),bid,f.op(),2));assert.equal(await f.vault.nextAllocatable(),aid);
});

async function prepared(f) {
 const r=await f.registration(),appId=r.payload.message.applicationId;
 await sent(f.vault.registerCurrentMet(...f.args(r)));
 await sent(f.token.connect(f.accounts[3]).approve(await f.vault.getAddress(),100000000n));
 await sent(f.vault.connect(f.accounts[3]).fund(f.op(),100000000n));
 const allocationId=f.op(),procedureId=f.op(),signerKeyId=f.op();
 await sent(f.vault.allocate(f.op(),appId,allocationId,1));
 await sent(f.vault.startReview(f.op(),appId,procedureId,START,2));
 const consentSetHash=f.op();await sent(f.vault.bindConsents(f.op(),appId,consentSetHash,true,3));
 await sent(f.vault.connect(f.accounts[1]).registerKey(f.op(),signerKeyId,f.signer.address));
 const m={applicationId:appId,policyHash:f.config.policyHash,runtimeMappingHash:f.config.runtimeMappingHash,
 decisionId:r.target.decisionId,decisionRevision:1,decisionHash:r.target.decisionHash,recipient:r.wallet.address,
 token:await f.token.getAddress(),amountAtoms:100000000,allocationId,consentSetHash,deadlinePolicyHash:f.op(),
 eligibilityRoute:1,nonce:f.op(),issuedAt:START,expiresAt:START+200,signerKeyId,authorizationEpoch:3,
 operationsPolicyHash:PROFILE_HASH,procedureId,firstReviewStartedAt:START,decisionPublishedAt:START,
 sourceValidUntilExclusive:START+240,revalidationCount:0};
 await sent(f.vault.prepareUnsigned(f.op(),m,4));
 const domain={name:'ClearBootcampTestPayment',version:'3',chainId:f.config.chainId,verifyingContract:f.config.verifyingContract,salt:f.config.instanceId};
 const signature=await f.signer.signTypedData(domain,PAYMENT_TYPES,m);
 return {r,m,signature,appId};
}
test('signed registration reaches exact 100 TEST claim; accepted right survives cap, pause and key revocation',async t=>{
 const f=await fixture(t),p=await prepared(f);
 await sent(f.vault.connect(f.accounts[2]).accept(f.op(),p.m,p.signature,5));
 await assert.rejects(()=>f.vault.registerCurrentMet.staticCall(...f.args(p.r)),/APPLICATION/);
 await assert.rejects(()=>f.vault.replaceTarget.staticCall(f.op(),p.appId,{...p.r.target,revision:2,decisionHash:f.op(),acceptanceSequence:1},0,6),/UNACCEPTED_STATE/);
 await sent(f.vault.connect(f.accounts[1]).setPause(f.op(),true));
 await sent(f.vault.connect(f.accounts[1]).revokeKey(f.op(),p.m.signerKeyId));
 await f.provider.send('evm_increaseTime',[700]);await f.provider.send('evm_mine',[]);
 await assert.rejects(()=>f.vault.connect(f.accounts[4]).terminate.staticCall(f.op(),p.appId,1,f.op(),6),/UNACCEPTED_STATE/);
 await sent(f.vault.connect(f.accounts[5]).claim(p.appId));
 assert.equal(await f.token.balanceOf(p.r.wallet.address),100000000n);
 assert.equal((await f.vault.application(p.appId)).state,6n);
 await assert.rejects(()=>f.vault.claim.staticCall(p.appId),/ACCEPTED_RIGHT_REQUIRED/);
 assert.deepEqual(Array.from(await f.vault.accounting()).slice(0,3),[0n,0n,0n]);
});
test('onchain objection and replacement invalidate prepared approval without releasing reservation',async t=>{
 const f=await fixture(t),p=await prepared(f);
 const observation={currentMet:true,validObjection:true,unassessedObjection:false,newValidError:false,sourceValidUntilExclusive:START+240,observedAt:START,receiptHash:f.op()};
 await sent(f.vault.observeCurrent(f.op(),p.appId,observation,5));
 await assert.rejects(()=>f.vault.connect(f.accounts[2]).accept.staticCall(f.op(),p.m,p.signature,6),/CURRENT_REVIEW/);
 assert.equal((await f.vault.accounting())[1],100000000n);
 await sent(f.vault.replaceTarget(f.op(),p.appId,{...p.r.target,decisionHash:f.op(),revision:2,acceptanceSequence:1},1,6));
 const app=await f.vault.application(p.appId);assert.equal(app.revalidationCount,1n);assert.equal(app.target.acceptanceSequence,1n);
 await assert.rejects(()=>f.vault.connect(f.accounts[2]).accept.staticCall(f.op(),p.m,p.signature,7));
 assert.equal(await f.vault.usedNonces(p.m.nonce),false);
});
test('termination winning before acceptance rejects old approval and releases only unaccepted reservation',async t=>{
 const f=await fixture(t),p=await prepared(f);
 await f.provider.send('evm_increaseTime',[600]);await f.provider.send('evm_mine',[]);
 await sent(f.vault.connect(f.accounts[4]).terminate(f.op(),p.appId,1,f.op(),5));
 await assert.rejects(()=>f.vault.connect(f.accounts[2]).accept.staticCall(f.op(),p.m,p.signature,6),/UNACCEPTED_STATE/);
 assert.equal(await f.token.balanceOf(p.r.wallet.address),0n);assert.equal((await f.vault.accounting())[1],0n);
});
