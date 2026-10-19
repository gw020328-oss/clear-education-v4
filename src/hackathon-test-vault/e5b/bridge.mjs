import {loadRuntime} from '../e5/environment.mjs';
import {sha,ensure} from '../e5/private-storage.mjs';
import {exactKeys} from '../../policy/values.mjs';
import {ZERO,businessHashFor,checkpoint} from '../e5/reader.mjs';
import {controllerGate} from './controller-gate.mjs';
import {BridgeExecutionService} from './service.mjs';
export function openOwnedApiBridge({environmentId,clock,cut}){
 const manifest=loadRuntime(environmentId),gate=controllerGate(environmentId,sha(manifest));
 const service=new BridgeExecutionService({environmentId,clock,cut,gate});
 const sanitized=error=>Error(/^E5B?_[A-Z0-9_]{1,80}$/.test(error?.message)?error.message:'E5B_PORT_REJECTED');
 const bound=fn=>(...args)=>{try{gate.assertBound();const value=fn(...args);return value?.then?value.catch(error=>{throw sanitized(error);}):value;}catch(error){throw sanitized(error);}};
 const observe=bound(async command=>{command=structuredClone(command);service.command(command);const observation=await service.reader.observe({applicationId:command.applicationId,nonce:command.method==='accept'?command.args[1].nonce:ZERO});return {observation,businessHash:businessHashFor(command,observation)};});
 const compare=bound(async input=>{
  input=structuredClone(input);exactKeys(input,['previous','current'],'E5B_COMPARE_SHAPE');
  for(const point of [input.previous,input.current]){exactKeys(point,['hash','number','time'],'E5B_ANCHOR_SHAPE');ensure(/^0x[0-9a-f]{64}$/.test(point.hash),'E5B_ANCHOR_HASH');const block=await service.reader.rpc('eth_getBlockByHash',[point.hash,false]);ensure(block&&sha(checkpoint(block))===sha(point),'E5B_ANCHOR_METADATA');if(point===input.current)await service.reader.validate(block);}
  return service.reader.compare(input.previous,input.current);
 });
 const worker=Object.freeze(Object.fromEntries(['authorize','lookup','envelope','seal','adopt','dispatch','recover'].map(name=>[name,bound(request=>service[name](request))])));
 const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
 // This deterministic E4 mapping is an explicit B contract. An API adapter must
 // configure exactly this scope (or review a new mapping), not echo body fields.
 const vaultScope=freeze({chainId:manifest.chainId,vaultAddress:manifest.vaultAddress,instanceId:manifest.instanceId});
 const authorityScope=freeze({runtimeId:manifest.environmentId,runtimePinHash:service.runtimeHash,scopeKey:sha(vaultScope)});
 const fenceReader=Object.freeze({version:'clear-bootcamp-runtime-fence-reader.1',read:async query=>{
  try{gate.assertIdle();exactKeys(query,['runtimeId','runtimePinHash','scopeKey'],'E5B_FENCE_QUERY');ensure(sha(query)===sha(authorityScope),'E5B_FENCE_SCOPE');
   const state=service.state();ensure(state.hash===service.runtimeHash&&state.lineage==='1','E5B_FENCE_RUNTIME');const highestFence=Number(state.fence);ensure(Number.isSafeInteger(highestFence)&&highestFence>=0&&String(highestFence)===state.fence,'E5B_FENCE_VALUE');
   return freeze({version:'clear-bootcamp-runtime-fence-witness.1',...authorityScope,highestFence});
  }catch(error){throw sanitized(error);}
 }});
 return Object.freeze({version:'clear-e5-api-bridge.1',runtime:freeze({runtimeHash:service.runtimeHash,manifest:structuredClone(manifest),vaultScope,authorityScope}),reader:Object.freeze({observe,compare}),worker,
  owner:Object.freeze({fenceReader,bindController:factory=>gate.bind(factory),close:()=>service.close(),metrics:()=>structuredClone(service.metrics),prune:bound(request=>service.prune(request))})});
}
