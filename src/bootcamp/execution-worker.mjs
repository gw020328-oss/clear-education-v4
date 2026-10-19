import {freeze,requireRule as check} from '../policy/values.mjs';

// The injected context is an internal service credential. Never capture a user
// login token, accept a browser snapshot, or keep SQLite open across the await.
// Stage A observes only: no signer, broadcast, fee replacement or rebase path.
export function createExecutionWorker({execution,serviceContext,owner,leaseSeconds=30}){
 check(execution&&typeof execution.observe==='function','BC_E5_WORKER');
 return freeze({
  async inspect(intentId,{expectedFence=0,generation=1}={}){
   if(execution.status().status==='UNCONFIGURED')return freeze({status:'BLOCKED',reason:'UNCONFIGURED'});
   const handle=execution.acquire(serviceContext,intentId,{owner,expectedFence,generation,leaseSeconds});
   const before=execution.inspect(serviceContext,handle);
   const observed=await execution.observe(serviceContext,handle,before);
   if(observed.transport?.status!=='BLOCKED')return observed;
   const current=execution.inspect(serviceContext,handle);
   return freeze({status:'AWAITING_E4_HANDOFF',handle,current,observed,signatures:0,broadcasts:0});
  },
 });
}
