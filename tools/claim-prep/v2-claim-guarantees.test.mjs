// Focused V2 evidence for claim-after-accept, duplicate/tamper rejection and
// vault accounting. In-process ganache only: no Docker, no clear-* container,
// no CLEAR store/API, no external RPC. The fixture mirrors
// tests/hackathon-test-vault/recipient-registration-v2.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import {BrowserProvider,ContractFactory,Wallet,id} from 'ethers';
import {buildExecutionV2} from '../../tests/hackathon-test-vault/execution-v2-build.mjs';
import {recipientRegistration} from '../../src/bootcamp/recipient-registration.mjs';
import {TYPES as PAYMENT_TYPES,PROFILE_HASH} from '../../src/bootcamp-authorization/test-schema-v3.mjs';
import {independentClaim} from './independent-claim.mjs';

const START=1900000000,A=100000000n;
const sent=async promise=>(await promise).wait();
// Roles: 0 registrar, 1 keyAdmin, 2 relayer, 3 depositor, 4 terminator. 5 and 6 hold no role.
async function fixture(t){
 const b=buildExecutionV2();
 const raw=ganache.provider({logging:{quiet:true},chain:{chainId:431729,hardfork:'shanghai',time:new Date(START*1000)},miner:{timestampIncrement:0},wallet:{totalAccounts:7}});
 const provider=new BrowserProvider(raw,undefined,{cacheTimeout:-1});provider.pollingInterval=10;
 t.after(async()=>{provider.destroy();await raw.disconnect();});
 const accounts=await Promise.all(Array.from({length:7},(_,i)=>provider.getSigner(i)));
 const addresses=await Promise.all(accounts.map(a=>a.getAddress()));
 const token=await new ContractFactory(b.tokenContract.abi,'0x'+b.tokenContract.evm.bytecode.object,accounts[3]).deploy(10000000000n);await token.waitForDeployment();
 const signer=Wallet.createRandom();
 const roles={registrar:addresses[0],initialSigner:signer.address,keyAdmin:addresses[1],relayer:addresses[2],depositor:addresses[3],terminator:addresses[4]};
 const policyHash='0x1c6f90cd998e91a11bc6abc9fca3fb9f918238225b077b1aa0610de395fae281';
 const config={chainId:431729,instanceId:id('claim-prep-v2-instance'),policyHash,runtimeMappingHash:id('claim-prep-mapping')};
 const vault=await new ContractFactory(b.contract.abi,'0x'+b.contract.evm.bytecode.object,accounts[0]).deploy(await token.getAddress(),config.instanceId,policyHash,config.runtimeMappingHash,roles);await vault.waitForDeployment();
 config.verifyingContract=await vault.getAddress();
 let n=0;const op=()=>id('claim-prep-operation-'+(++n));
 async function registration(wallet=Wallet.createRandom()){
  const payload=recipientRegistration({...config,participant:wallet.address,applicationSalt:op(),nonce:op(),deadline:START+200});
  const signature=await wallet.signTypedData(payload.domain,payload.types,payload.message);
  const target={decisionId:op(),revision:1,decisionHash:op(),sourceValidUntilExclusive:START+240,acceptanceSequence:0,sourceReceiptHash:op()};
  return {wallet,payload,signature,target,appId:payload.message.applicationId};
 }
 const register=r=>sent(vault.registerCurrentMet(op(),r.appId,r.payload.message.recipient,r.target,r.payload.message,r.signature));
 const fund=async amount=>{await sent(token.connect(accounts[3]).approve(await vault.getAddress(),amount));await sent(vault.connect(accounts[3]).fund(op(),amount));};
 const accounting=async()=>{const x=await vault.accounting();return Object.fromEntries(['B','R','O','A','U','S','surplus'].map(k=>[k,x[k]]));};
 const balanceOf=a=>token.balanceOf(a);
 return {b,provider,vault,token,accounts,addresses,signer,config,op,registration,register,fund,accounting,balanceOf};
}
// Same derivation the server validates in src/bootcamp/execution-e4-ports.mjs:30.
function derived(x){const {B,R,O,A:avail,U,S}=x;return B>=R&&O>=R&&avail===B-R&&U===O-R&&S===(U>avail?U-avail:0n);}
async function prepared(f,{fundAmount=A}={}){
 const r=await f.registration();await f.register(r);await f.fund(fundAmount);
 const allocationId=f.op(),procedureId=f.op(),signerKeyId=f.op();
 await sent(f.vault.allocate(f.op(),r.appId,allocationId,1));
 await sent(f.vault.startReview(f.op(),r.appId,procedureId,START,2));
 const consentSetHash=f.op();await sent(f.vault.bindConsents(f.op(),r.appId,consentSetHash,true,3));
 await sent(f.vault.connect(f.accounts[1]).registerKey(f.op(),signerKeyId,f.signer.address));
 const m={applicationId:r.appId,policyHash:f.config.policyHash,runtimeMappingHash:f.config.runtimeMappingHash,
  decisionId:r.target.decisionId,decisionRevision:1,decisionHash:r.target.decisionHash,recipient:r.wallet.address,
  token:await f.token.getAddress(),amountAtoms:100000000,allocationId,consentSetHash,deadlinePolicyHash:f.op(),
  eligibilityRoute:1,nonce:f.op(),issuedAt:START,expiresAt:START+200,signerKeyId,authorizationEpoch:3,
  operationsPolicyHash:PROFILE_HASH,procedureId,firstReviewStartedAt:START,decisionPublishedAt:START,
  sourceValidUntilExclusive:START+240,revalidationCount:0};
 await sent(f.vault.prepareUnsigned(f.op(),m,4));
 const domain={name:'ClearBootcampTestPayment',version:'3',chainId:f.config.chainId,verifyingContract:f.config.verifyingContract,salt:f.config.instanceId};
 return {r,m,domain,signature:await f.signer.signTypedData(domain,PAYMENT_TYPES,m),appId:r.appId};
}

test('accounting walk: B,R,O,A,U,S,surplus follow contract formulas through one application',async t=>{
 const f=await fixture(t),vaultAddress=await f.vault.getAddress(),zero={B:0n,R:0n,O:0n,A:0n,U:0n,S:0n,surplus:0n};
 assert.deepEqual(await f.accounting(),zero);
 const r=await f.registration();await f.register(r);
 assert.deepEqual(await f.accounting(),{...zero,O:A,U:A,S:A}); // registered obligation, nothing funded
 await f.fund(A);
 assert.deepEqual(await f.accounting(),{...zero,B:A,O:A,A,U:A}); // funded but not yet reserved
 // Unsolicited direct transfer is surplus; it is not credited to B and cannot be allocated.
 await sent(f.token.connect(f.accounts[3]).transfer(vaultAddress,7n));
 assert.deepEqual(await f.accounting(),{...zero,B:A,O:A,A,U:A,surplus:7n});
 assert.equal(await f.balanceOf(vaultAddress),A+7n);
 await sent(f.vault.allocate(f.op(),r.appId,f.op(),1));
 const reserved={...zero,B:A,R:A,O:A,surplus:7n};assert.deepEqual(await f.accounting(),reserved);
 assert(derived(await f.accounting()));
});

test('two applications, 150 TEST funded: shortfall S and all-or-nothing allocation from A=B-R',async t=>{
 const f=await fixture(t),first=await f.registration(),second=await f.registration();
 await f.register(first);await f.register(second);await f.fund(150000000n);
 assert.deepEqual(await f.accounting(),{B:150000000n,R:0n,O:2n*A,A:150000000n,U:2n*A,S:50000000n,surplus:0n});
 await sent(f.vault.allocate(f.op(),first.appId,f.op(),1));
 assert.deepEqual(await f.accounting(),{B:150000000n,R:A,O:2n*A,A:50000000n,U:A,S:50000000n,surplus:0n});
 await assert.rejects(()=>f.vault.allocate.staticCall(f.op(),second.appId,f.op(),1),/SHORTFALL/);
 await f.fund(50000000n);await sent(f.vault.allocate(f.op(),second.appId,f.op(),1));
 const x=await f.accounting();assert.deepEqual(x,{B:2n*A,R:2n*A,O:2n*A,A:0n,U:0n,S:0n,surplus:0n});assert(derived(x));
});

test('post-signature recipient/amount tamper is rejected (staticCall and included failing tx); nonce, state and balances unchanged',async t=>{
 const f=await fixture(t),p=await prepared(f),attacker=f.addresses[6],relayer=f.vault.connect(f.accounts[2]);
 const tampered=[{recipient:attacker},{amountAtoms:100000001},{amountAtoms:200000000}];
 for(const patch of tampered){
  // Original operator signature reused on a changed message.
  await assert.rejects(()=>relayer.accept.staticCall(f.op(),{...p.m,...patch},p.signature,5),/FIXED_RIGHT/);
  // Even a fresh signature over the changed message by the registered signer key is rejected by the stored right.
  const resigned=await f.signer.signTypedData(p.domain,PAYMENT_TYPES,{...p.m,...patch});
  await assert.rejects(()=>relayer.accept.staticCall(f.op(),{...p.m,...patch},resigned,5),/FIXED_RIGHT/);
 }
 // Registrar cannot prepare a different recipient either; the recipient is fixed at participant-signed registration.
 await assert.rejects(()=>f.vault.prepareUnsigned.staticCall(f.op(),{...p.m,recipient:attacker,nonce:f.op()},5),/FIXED_RIGHT/);
 // Same tampered acceptance as an actual included transaction: status 0, nothing changes.
 const tx=await relayer.accept(f.op(),{...p.m,recipient:attacker},p.signature,5,{gasLimit:3000000n});
 let receipt;try{receipt=await tx.wait();}catch(error){receipt=error?.receipt??await f.provider.getTransactionReceipt(tx.hash);}
 assert.equal(receipt.status,0);
 assert.equal(await f.vault.usedNonces(p.m.nonce),false);assert.equal((await f.vault.application(p.appId)).state,3n);
 assert.equal(await f.balanceOf(attacker),0n);assert.equal(await f.balanceOf(p.r.wallet.address),0n);
 // Untampered acceptance still succeeds and stores the participant-registered recipient.
 await sent(relayer.accept(f.op(),p.m,p.signature,5));
 const right=await f.vault.acceptedRight(p.appId);assert.equal(right.recipient,p.r.wallet.address);assert.equal(right.amountAtoms,A);
});

test('no-role caller claims after ACCEPT despite pause, key revocation and expired cap; registered recipient receives exactly 100 TEST; duplicates fail',async t=>{
 const f=await fixture(t),p=await prepared(f),caller=f.accounts[5];
 assert.deepEqual(f.b.contract.abi.find(x=>x.name==='claim').inputs.map(i=>i.type),['bytes32']); // no recipient argument
 await assert.rejects(()=>f.vault.connect(caller).claim.staticCall(p.appId),/ACCEPTED_RIGHT_REQUIRED/); // before ACCEPT
 await assert.rejects(independentClaim({provider:f.provider,vaultAbi:f.b.contract.abi,vaultAddress:await f.vault.getAddress(),tokenAddress:await f.token.getAddress(),applicationId:p.appId,caller}),/CLAIM_PREP_NOT_ACCEPTED/);
 await sent(f.vault.connect(f.accounts[2]).accept(f.op(),p.m,p.signature,5));
 const accepted=await f.accounting();assert.deepEqual(accepted,{B:A,R:A,O:A,A:0n,U:0n,S:0n,surplus:0n}); // ACCEPT does not move accounting
 await sent(f.vault.connect(f.accounts[1]).setPause(f.op(),true));
 await sent(f.vault.connect(f.accounts[1]).revokeKey(f.op(),p.m.signerKeyId));
 await f.provider.send('evm_increaseTime',[700]);await f.provider.send('evm_mine',[]);
 const report=await independentClaim({provider:f.provider,vaultAbi:f.b.contract.abi,vaultAddress:await f.vault.getAddress(),tokenAddress:await f.token.getAddress(),applicationId:p.appId,caller,duplicateTransaction:true});
 assert.equal(report.caller,f.addresses[5].toLowerCase());assert.equal(report.callerIsRecipient,false);
 assert.equal(report.recipient,p.r.wallet.address.toLowerCase());assert.equal(report.after.state,'6');
 assert.equal(BigInt(report.after.recipientAtoms)-BigInt(report.before.recipientAtoms),A);
 assert.deepEqual(report.after.accounting,{B:'0',R:'0',O:'0',A:'0',U:'0',S:'0',surplus:'0'});
 assert.equal(report.duplicate.staticCall,'REJECTED:ACCEPTED_RIGHT_REQUIRED');assert.equal(report.duplicate.transaction.status,0);
 assert.equal(await f.balanceOf(p.r.wallet.address),A);assert.equal(await f.balanceOf(f.addresses[5]),0n);
 // A different no-role caller cannot claim again either.
 await assert.rejects(()=>f.vault.connect(f.accounts[6]).claim.staticCall(p.appId),/ACCEPTED_RIGHT_REQUIRED/);
});

test('terminator cannot revoke an ACCEPTED right after the review cap; reservation stays',async t=>{
 const f=await fixture(t),p=await prepared(f);
 await sent(f.vault.connect(f.accounts[2]).accept(f.op(),p.m,p.signature,5));
 await f.provider.send('evm_increaseTime',[700]);await f.provider.send('evm_mine',[]);
 await assert.rejects(()=>f.vault.connect(f.accounts[4]).terminate.staticCall(f.op(),p.appId,1,f.op(),6),/UNACCEPTED_STATE/);
 assert.deepEqual(await f.accounting(),{B:A,R:A,O:A,A:0n,U:0n,S:0n,surplus:0n});
});
