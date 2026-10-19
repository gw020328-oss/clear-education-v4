import {randomUUID} from 'node:crypto';
import {ownedTestWallet} from '../e5/environment.mjs';
import {ensure,sha} from '../e5/private-storage.mjs';
const deepFreeze=value=>{if(value&&typeof value==='object'){for(const v of Object.values(value))deepFreeze(v);Object.freeze(value);}return value;};
// Private identity tickets have no serializable authority. The issuer cannot sign
// arbitrary payloads and is usable only during the bound synchronous callback.
export function controllerGate(environmentId,runtimeHash){
 let controller,attempted=false,active=null;
 const tickets=new WeakMap();
 const consume=ticket=>{
  const call=tickets.get(ticket);ensure(active===call&&call&&!call.read,'E5B_WITNESS_UNOWNED_OR_REPLAY');call.read=true;return call.evidence;
 };
 const issue=(kind,ticket)=>{
  const call=tickets.get(ticket);ensure(call&&active===call&&call.kind===kind&&call.read&&!call.issued,'E5B_ISSUER_SCOPE');call.issued=true;
  const signature=ownedTestWallet(environmentId,'controller').signingKey.sign(sha(call.payload)).serialized;
  return {payload:structuredClone(call.payload),signature};
 };
 const ports=Object.freeze({witnesses:Object.freeze({consume}),issuer:Object.freeze({capability:ticket=>issue('capability',ticket),current:ticket=>issue('current',ticket),commit:ticket=>issue('commit',ticket)})});
 return Object.freeze({
  assertIdle(){ensure(!active,'E5B_CONTROLLER_REENTRANT');},
  assertBound(){ensure(controller,'E5B_CONTROLLER_UNBOUND');ensure(!active,'E5B_CONTROLLER_REENTRANT');},
  bind(factory){ensure(!attempted,'E5B_CONTROLLER_ALREADY_BOUND');attempted=true;ensure(typeof factory==='function','E5B_CONTROLLER_FACTORY');const next=factory(ports);if(next?.then)Promise.resolve(next).catch(()=>{});ensure(next&&!next.then&&['authorizeSync','readCurrentSync','commitCurrentSync'].every(k=>typeof next[k]==='function'),'E5B_CONTROLLER_SHAPE');controller=Object.freeze(Object.fromEntries(['authorizeSync','readCurrentSync','commitCurrentSync'].map(k=>[k,next[k].bind(next)])));},
  invoke(kind,{binding,command,observation,proof,phase,payload,reference=null}){
   ensure(controller&&!active,'E5B_CONTROLLER_UNBOUND_OR_REENTRANT');ensure(binding.runtimeHash===runtimeHash,'E5B_CONTROLLER_RUNTIME');
   const ticket=Object.freeze({version:'clear-e5b-private-ticket.1',challenge:randomUUID()});
   const evidence=deepFreeze(structuredClone({version:'clear-e5b-controller-evidence.1',runtimeHash,phase,binding,command,observation,proof,reference,payload}));
   const call={kind,evidence,payload:structuredClone(payload),read:false,issued:false};tickets.set(ticket,call);active=call;
   try{const result=controller[{capability:'authorizeSync',current:'readCurrentSync',commit:'commitCurrentSync'}[kind]]({ticket});if(result?.then)Promise.resolve(result).catch(()=>{});ensure(result&&!result.then&&call.read&&call.issued,'E5B_SYNCHRONOUS_ISSUED_WITNESS_REQUIRED');return result;}
   catch(error){const safe=new Set(['E5B_SYNCHRONOUS_ISSUED_WITNESS_REQUIRED','E5B_WITNESS_UNOWNED_OR_REPLAY','E5B_ISSUER_SCOPE','E5B_CONTROLLER_REENTRANT']);throw Error(safe.has(error?.message)?error.message:'E5B_CONTROLLER_REJECTED');}
   finally{active=null;tickets.delete(ticket);}
  }
 });
}
