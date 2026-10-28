import {AsyncLocalStorage} from 'node:async_hooks';
import {loadRuntime} from '../e5/environment.mjs';
import {sha,ensure} from '../e5/private-storage.mjs';
import {exactKeys} from '../../policy/values.mjs';
import {keccak256} from 'ethers';
import {ZERO,businessHashFor,checkpoint} from '../e5/reader.mjs';
import {controllerGate} from './controller-gate.mjs';
import {BridgeExecutionService} from './service.mjs';
export function openOwnedApiBridge({environmentId,clock,cut,onFailure}){
 const manifest=loadRuntime(environmentId),gate=controllerGate(environmentId,sha(manifest));
 const diagnose=(phase,error)=>{try{onFailure?.(phase,error);}catch{}};
 const service=new BridgeExecutionService({environmentId,clock,cut,gate,diagnose}),diagnosticContext=new AsyncLocalStorage();
 Object.defineProperty(service,'diagnosticPhase',{get:()=>diagnosticContext.getStore()?.phase??'NATIVE_UNKNOWN',set:phase=>{const c=diagnosticContext.getStore();if(c)c.phase=phase;}});
 const sanitized=error=>Error(/^E5B?_[A-Z0-9_]{1,80}$/.test(error?.message)?error.message:'E5B_PORT_REJECTED');
 const bound=(fn,phase='NATIVE_READER')=>(...args)=>diagnosticContext.run({phase},()=>{try{gate.assertBound();const value=fn(...args);return value?.then?value.catch(error=>{diagnose(service.diagnosticPhase,error);throw sanitized(error);}):value;}catch(error){diagnose(service.diagnosticPhase,error);throw sanitized(error);}});
 const observe=bound(async command=>{command=structuredClone(command);service.command(command);const observation=await service.reader.observe({applicationId:command.applicationId,nonce:['prepareUnsigned','accept'].includes(command.method)?command.args[1].nonce:ZERO});return {observation,businessHash:businessHashFor(command,observation)};});
 const compare=bound(async input=>{
  input=structuredClone(input);exactKeys(input,['previous','current'],'E5B_COMPARE_SHAPE');
  for(const point of [input.previous,input.current]){exactKeys(point,['hash','number','time'],'E5B_ANCHOR_SHAPE');ensure(/^0x[0-9a-f]{64}$/.test(point.hash),'E5B_ANCHOR_HASH');const block=await service.reader.rpc('eth_getBlockByHash',[point.hash,false]);ensure(block&&sha(checkpoint(block))===sha(point),'E5B_ANCHOR_METADATA');if(point===input.current)await service.reader.validate(block);}
  return service.reader.compare(input.previous,input.current);
 });
 const worker=Object.freeze(Object.fromEntries(['authorize','lookup','envelope','seal','adopt','dispatch','recover'].map(name=>[name,bound(request=>service[name](request),'NATIVE_'+name.toUpperCase())])));
 const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
 const claimReceipt=bound(async query=>{
  query=structuredClone(query);exactKeys(query,['applicationId','txHash'],'E5B_CLAIM_QUERY');ensure(Object.values(query).every(x=>typeof x==='string'&&/^0x[0-9a-f]{64}$/.test(x)),'E5B_CLAIM_QUERY');
  const unknown=()=>freeze({version:'clear-e5b-direct-claim-receipt.1',runtimeHash:service.runtimeHash,...query,status:'UNKNOWN',code:'E5B_CLAIM_READBACK_UNAVAILABLE',automaticPromotion:false});
  try{
   const tx=await service.reader.rpc('eth_getTransactionByHash',[query.txHash]);ensure(tx&&tx.hash===query.txHash&&tx.to?.toLowerCase()===manifest.vaultAddress&&tx.blockHash&&tx.input===service.reader.vault.encodeFunctionData('claim',[query.applicationId]),'E5B_CLAIM_TRANSACTION');
   const at=await service.reader.observe({applicationId:query.applicationId,blockHash:tx.blockHash});
   const result=await service.reader.receipt({txHash:query.txHash,sender:tx.from.toLowerCase(),to:manifest.vaultAddress,nonce:BigInt(tx.nonce).toString(),dataHash:keccak256(tx.input),applicationId:query.applicationId,authorizationNonce:at.business.right.nonce,method:'claim'});
   ensure(result.status==='INCLUDED','E5B_CLAIM_NOT_INCLUDED');const {application:a,right:r,nonceUsed}=result.observation.business;
   ensure(a.state==='6'&&a.recipient.toLowerCase()===r.recipient.toLowerCase()&&r.token.toLowerCase()===manifest.tokenAddress&&r.amountAtoms==='100000000'&&a.allocationId===r.allocationId&&r.allocationId!==ZERO&&r.authorizationDigest!==ZERO&&r.nonce!==ZERO&&nonceUsed&&a.preparedDigest===ZERO&&a.preparedNonce===ZERO,'E5B_CLAIM_ACCEPTED_RELATION');
   return freeze({version:'clear-e5b-direct-claim-receipt.1',runtimeHash:service.runtimeHash,...query,status:'INCLUDED',checkpoint:result.checkpoint,observation:result.observation,allocationId:r.allocationId,authorizationDigest:r.authorizationDigest,recipient:r.recipient,token:r.token,amountAtoms:r.amountAtoms,finalized:false});
  }catch(error){diagnose('NATIVE_CLAIM_RECEIPT',error);return unknown();}
 });
 // This deterministic E4 mapping is an explicit B contract. An API adapter must
 // configure exactly this scope (or review a new mapping), not echo body fields.
 const vaultScope=freeze({chainId:manifest.chainId,vaultAddress:manifest.vaultAddress,instanceId:manifest.instanceId});
 const authorityScope=freeze({runtimeId:manifest.environmentId,runtimePinHash:service.runtimeHash,scopeKey:sha(vaultScope)});
 const fenceReader=Object.freeze({version:'clear-bootcamp-runtime-fence-reader.1',read:async query=>{
  try{gate.assertIdle();exactKeys(query,['runtimeId','runtimePinHash','scopeKey'],'E5B_FENCE_QUERY');ensure(sha(query)===sha(authorityScope),'E5B_FENCE_SCOPE');
   const state=service.state();ensure(state.hash===service.runtimeHash&&state.lineage==='1','E5B_FENCE_RUNTIME');const highestFence=Number(state.fence);ensure(Number.isSafeInteger(highestFence)&&highestFence>=0&&String(highestFence)===state.fence,'E5B_FENCE_VALUE');
   return freeze({version:'clear-bootcamp-runtime-fence-witness.1',...authorityScope,highestFence});
  }catch(error){diagnose('NATIVE_FENCE',error);throw sanitized(error);}
 }});
 return Object.freeze({version:'clear-e5-api-bridge.1',runtime:freeze({runtimeHash:service.runtimeHash,manifest:structuredClone(manifest),vaultScope,authorityScope}),reader:Object.freeze({observe,compare,claimReceipt}),worker,
  owner:Object.freeze({failureState:()=>({envelopes:service.db.prepare('SELECT state,count(*) count FROM envelopes GROUP BY state').all().map(x=>({state:['PREPARING','SIGNING_UNCERTAIN','SEALED','SEND_STARTED','UNKNOWN','INCLUDED','REVERTED','REORGED','EXPIRED_UNSENT'].includes(x.state)?x.state:'UNKNOWN_STATE',count:x.count}))}),fenceReader,bindController:factory=>gate.bind(factory),close:()=>service.close(),metrics:()=>structuredClone(service.metrics),prune:bound(request=>service.prune(request))})});
}
