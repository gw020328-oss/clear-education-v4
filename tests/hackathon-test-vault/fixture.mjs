import ganache from 'ganache';
import {BrowserProvider,ContractFactory,id,TypedDataEncoder} from 'ethers';
import {buildPreparation} from './build.mjs';
import {p0PolicyHash,P0_POLICY} from '../../specs/bootcamp/p0-contract.mjs';
import {testDeadlineHash} from '../../src/bootcamp-authorization/test-encoding-v3.mjs';
import {TYPES} from '../../src/bootcamp-authorization/test-schema-v3.mjs';
let cached;
export const AMOUNT=100000000n,BASE=2000000000;
export const sent=async p=>(await p).wait();
export async function setup(t){
 const artifacts=cached??=buildPreparation();
 // Fresh process-local memory chain. Only transaction fixture accounts; no key export,
 // existing DB/chain, network server, authorization signing, accept or payout.
 const raw=ganache.provider({logging:{quiet:true},chain:{chainId:31339,hardfork:'shanghai',time:new Date(BASE*1000)},miner:{timestampIncrement:0},wallet:{totalAccounts:8}});
 const provider=new BrowserProvider(raw,undefined,{cacheTimeout:-1});provider.pollingInterval=10;
 const signers=await Promise.all(Array.from({length:8},(_,i)=>provider.getSigner(i)));
 const addresses=await Promise.all(signers.map(s=>s.getAddress()));
 const roles={registrar:addresses[0],initialSigner:addresses[1],keyAdmin:addresses[2],relayer:addresses[3],depositor:addresses[4],terminator:addresses[5]};
 const deploy=async(name,args=[],who=0)=>{const c=await new ContractFactory(artifacts[name].abi,artifacts[name].bytecode,signers[who]).deploy(...args);await c.waitForDeployment();return c;};
 const token=await deploy('ClearTestToken',[10000000000n],4),config={instanceId:id('SYNTHETIC_E4_INSTANCE'),policyHash:p0PolicyHash(P0_POLICY),runtimeMappingHash:id('SYNTHETIC_E4_MAPPING')};
 const vault=await deploy('HackathonTestVaultPreparation',[await token.getAddress(),config.instanceId,config.policyHash,config.runtimeMappingHash,roles]);
 let opNumber=0,seq=0;const op=()=>id('SYNTHETIC_E4_OP_'+(++opNumber));
 const keyId=id('SYNTHETIC_E4_KEY_ID');
 const now=async()=>Number(BigInt((await provider.send('eth_getBlockByNumber',['latest',false])).timestamp));
 const time=async seconds=>{await provider.send('evm_setTime',[seconds*1000]);await provider.send('evm_mine',[]);};
 const target=(tag,patch={})=>({decisionId:id('SYNTHETIC_DECISION_'+tag),revision:1n,decisionHash:id('SYNTHETIC_DECISION_HASH_'+tag),sourceValidUntilExclusive:BigInt(BASE+900),acceptanceSequence:BigInt(++seq),sourceReceiptHash:id('SYNTHETIC_SOURCE_RECEIPT_'+tag),...patch});
 const state=app=>vault.application(app);
 const version=async app=>(await state(app)).version;
 const register=async(tag='a',patch={})=>{const app=id('SYNTHETIC_APP_'+tag),decision=target(tag,patch);await sent(vault.registerCurrentMet(op(),app,addresses[6],decision));return app;};
 const fund=async amount=>{await sent(token.connect(signers[4]).approve(await vault.getAddress(),amount));const operation=op(),tx=await vault.connect(signers[4]).fund(operation,amount);await tx.wait();return {operation,tx};};
 const allocate=async app=>sent(vault.allocate(op(),app,id('SYNTHETIC_ALLOCATION_'+app),await version(app)));
 const review=async app=>{const a=await state(app);return sent(vault.startReview(op(),app,a.procedureId!=='0x'+'00'.repeat(32)?a.procedureId:id('SYNTHETIC_PROCEDURE_'+app),await now(),a.version));};
 const consent=async(app,mutual=true)=>sent(vault.bindConsents(op(),app,id('SYNTHETIC_CONSENT_'+app+'_'+await version(app)),mutual,await version(app)));
 const observe=async(app,patch={})=>{const a=await state(app);return sent(vault.observeCurrent(op(),app,{currentMet:a.currentMet,validObjection:a.validObjection,unassessedObjection:a.unassessedObjection,newValidError:a.newValidError,sourceValidUntilExclusive:a.target.sourceValidUntilExclusive,observedAt:BigInt(await now()),receiptHash:id('SYNTHETIC_OBSERVATION_'+app+'_'+a.version),...patch},a.version));};
 const key=async()=>sent(vault.connect(signers[2]).registerKey(op(),keyId,addresses[1]));
 const payload=async(app,{route='1',...patch}={})=>{
  const a=await state(app),n=await now(),m={applicationId:app,policyHash:config.policyHash,runtimeMappingHash:config.runtimeMappingHash,decisionId:a.target.decisionId,decisionRevision:a.target.revision.toString(),decisionHash:a.target.decisionHash,recipient:a.recipient.toLowerCase(),token:(await token.getAddress()).toLowerCase(),amountAtoms:AMOUNT.toString(),allocationId:a.allocationId,consentSetHash:a.consentSetHash,deadlinePolicyHash:id('SYNTHETIC_PENDING_WINDOW'),eligibilityRoute:route,nonce:id('SYNTHETIC_NONCE_'+app+'_'+a.epoch),issuedAt:String(n),expiresAt:String(Math.min(n+60,Number(a.firstStartedAt)+600,Number(a.target.sourceValidUntilExclusive))),signerKeyId:keyId,authorizationEpoch:a.epoch.toString(),operationsPolicyHash:await vault.PROFILE(),procedureId:a.procedureId,firstReviewStartedAt:a.firstStartedAt.toString(),decisionPublishedAt:a.publishedAt.toString(),sourceValidUntilExclusive:a.target.sourceValidUntilExclusive.toString(),revalidationCount:a.revalidationCount.toString(),...patch};
  m.deadlinePolicyHash=testDeadlineHash(m);
  return {domain:{name:'ClearBootcampTestPayment',version:'3',chainId:'31339',verifyingContract:(await vault.getAddress()).toLowerCase(),salt:config.instanceId},message:m};
 };
 const prepare=async(app,options)=>{const p=await payload(app,options);await sent(vault.prepareUnsigned(op(),p.message,await version(app)));return p;};
 const ready=async()=>{const app=await register();await fund(AMOUNT);await allocate(app);await review(app);await consent(app);await key();return app;};
 const invariant=async()=>{const values=await vault.accounting(),apps=await vault.applicationIds();let O=0n,R=0n;for(const app of apps){const a=await state(app);if([1n,2n,3n,5n].includes(a.state))O+=AMOUNT;if([2n,3n,5n].includes(a.state))R+=AMOUNT;}const {B,R:actualR,O:actualO,A,U,S}=values; if(!(actualR===R&&actualO===O&&B>=R&&O>=R&&A===B-R&&U===O-R&&S===(U>A?U-A:0n)))throw new Error('ACCOUNTING_INVARIANT');return values;};
 t.after(async()=>{provider.destroy();await raw.disconnect();});
 return {artifacts,raw,provider,signers,addresses,roles,token,vault,config,deploy,op,keyId,now,time,target,state,version,register,fund,allocate,review,consent,observe,key,payload,prepare,ready,invariant,typedHash:p=>TypedDataEncoder.hash(p.domain,TYPES,p.message)};
}
