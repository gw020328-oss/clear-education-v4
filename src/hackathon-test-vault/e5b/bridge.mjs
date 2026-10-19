import {loadRuntime} from '../e5/environment.mjs';
import {sha} from '../e5/private-storage.mjs';
import {ZERO,businessHashFor} from '../e5/reader.mjs';
import {controllerGate} from './controller-gate.mjs';
import {BridgeExecutionService} from './service.mjs';
export function openOwnedApiBridge({environmentId,clock,cut}){
 const manifest=loadRuntime(environmentId),gate=controllerGate(environmentId,sha(manifest));
 const service=new BridgeExecutionService({environmentId,clock,cut,gate});
 const sanitized=error=>Error(/^E5B?_[A-Z0-9_]{1,80}$/.test(error?.message)?error.message:'E5B_PORT_REJECTED');
 const bound=fn=>(...args)=>{try{gate.assertBound();const value=fn(...args);return value?.then?value.catch(error=>{throw sanitized(error);}):value;}catch(error){throw sanitized(error);}};
 const observe=bound(async command=>{command=structuredClone(command);service.command(command);const observation=await service.reader.observe({applicationId:command.applicationId,nonce:command.method==='accept'?command.args[1].nonce:ZERO});return {observation,businessHash:businessHashFor(command,observation)};});
 const worker=Object.freeze(Object.fromEntries(['authorize','lookup','envelope','seal','adopt','dispatch','recover'].map(name=>[name,bound(request=>service[name](request))])));
 const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
 return Object.freeze({version:'clear-e5-api-bridge.1',runtime:freeze({runtimeHash:service.runtimeHash,manifest:structuredClone(manifest)}),reader:Object.freeze({observe}),worker,
  owner:Object.freeze({bindController:factory=>gate.bind(factory),close:()=>service.close(),metrics:()=>structuredClone(service.metrics),prune:bound(request=>service.prune(request))})});
}
