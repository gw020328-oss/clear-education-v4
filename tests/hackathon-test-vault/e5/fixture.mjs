import {randomBytes,randomUUID} from 'node:crypto';
import {Contract,JsonRpcProvider,hexlify,Transaction,keccak256} from 'ethers';
import {createEnvironment,loadRuntime,ownedTestWallet} from '../../../src/hackathon-test-vault/e5/environment.mjs';
import {ExecutionReader,ZERO,businessHashFor} from '../../../src/hackathon-test-vault/e5/reader.mjs';
import {OwnedExecutionService} from '../../../src/hackathon-test-vault/e5/envelope-service.mjs';
import {sha} from '../../../src/hackathon-test-vault/e5/private-storage.mjs';
import {testController} from './controller-fixture.mjs';
export const hash=()=>hexlify(randomBytes(32));
export async function fixture(existingId){
 const id=existingId??(await createEnvironment()).environmentId,m=loadRuntime(id),reader=new ExecutionReader(m),controller=testController(id);
 const provider=new JsonRpcProvider(m.endpoint,undefined,{cacheTimeout:-1,batchMaxCount:1});provider.pollingInterval=50;
 const wallet=role=>ownedTestWallet(id,role).connect(provider),vault=new Contract(m.vaultAddress,reader.vault,wallet('registrar')),token=new Contract(m.tokenAddress,reader.token,wallet('depositor'));
 let service=new OwnedExecutionService({environmentId:id,controller});
 const f={id,m,reader,controller,provider,wallet,vault,token,get service(){return service;},hash,
  async request(command,{bindingPatch={},reader:rd=reader}={}){const o=await rd.observe({applicationId:command.applicationId,nonce:command.method==='accept'?command.args[1].nonce:ZERO});const binding={version:'clear-e5-execution-capability.1',intentId:randomUUID(),requestId:randomUUID(),attemptId:randomUUID(),runtimeHash:reader.runtimeHash,lineage:controller.state.lineage,workerFence:controller.state.fence,workerId:'test-worker',leaseId:randomUUID(),expiresAt:Math.floor(Date.now()/1000)+120,e3Commitment:hash(),commandHash:sha(command),anchor:o.checkpoint,businessHash:businessHashFor(command,o),...bindingPatch};return {binding,command,capability:controller.certify(binding)};},
  async included(request,result){if(result.status==='UNKNOWN'&&!result.code){await provider.waitForTransaction(service.row(request.ref).txHash,1,10000);return service.recover(request);}return result;},
  async submit(command){const req=await f.request(command),sealed=await service.seal(req);controller.commit(sealed);const request={...req,...sealed};return {req,sealed,result:await f.included(request,await service.dispatch(request))};},
  restart(options={}){service.close();service=new OwnedExecutionService({environmentId:id,controller,...options});return service;},
  async sent(p){return (await p).wait();},
  async ready(){
   const app=hash(),op=hash,now=Number((await reader.block()).timestamp),target={decisionId:hash(),revision:'1',decisionHash:hash(),sourceValidUntilExclusive:String(now+3600),acceptanceSequence:String((await vault.lastAcceptanceSequence())+1n),sourceReceiptHash:hash()};
   await f.sent(token.approve(m.vaultAddress,100000000n));await f.sent(vault.connect(wallet('depositor')).fund(op(),100000000n));
   await f.sent(vault.registerCurrentMet(op(),app,ownedTestWallet(id,'recipient').address,target));
   await f.sent(vault.allocate(op(),app,hash(),1));let a=await vault.application(app);
   await f.sent(vault.startReview(op(),app,hash(),a.allocatedAt,a.version));a=await vault.application(app);
   await f.sent(vault.bindConsents(op(),app,hash(),true,a.version));a=await vault.application(app);
   const msg={applicationId:app,policyHash:m.policyHash,runtimeMappingHash:m.runtimeMappingHash,decisionId:a.target.decisionId,decisionRevision:String(a.target.revision),decisionHash:a.target.decisionHash,recipient:a.recipient.toLowerCase(),token:m.tokenAddress,amountAtoms:'100000000',allocationId:a.allocationId,consentSetHash:a.consentSetHash,deadlinePolicyHash:hash(),eligibilityRoute:'1',nonce:hash(),issuedAt:String((await reader.block()).timestamp),expiresAt:String(a.firstStartedAt+590n),signerKeyId:m.signerKeyId,authorizationEpoch:String(a.epoch),operationsPolicyHash:m.operationsPolicyHash,procedureId:a.procedureId,firstReviewStartedAt:String(a.firstStartedAt),decisionPublishedAt:String(a.publishedAt),sourceValidUntilExclusive:String(a.target.sourceValidUntilExclusive),revalidationCount:String(a.revalidationCount)};
   const prepared=await f.submit({method:'prepareUnsigned',applicationId:app,args:[op(),msg,String(a.version)]});if(prepared.result.status!=='INCLUDED')throw Error('E5_TEST_PREPARATION_NOT_INCLUDED');a=await vault.application(app);f.restart();
   return {app,msg,command:{method:'accept',applicationId:app,args:[op(),msg,String(a.version)]}};
  },
  async mine(){await f.sent(wallet('controller').sendTransaction({to:ownedTestWallet(id,'controller').address,value:0n}));},
  close(){service.close();provider.destroy();},
 };
 return f;
}
