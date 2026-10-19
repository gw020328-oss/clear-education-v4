import {ensure} from './private-storage.mjs';
export function loopbackRpc(endpoint){
 const u=new URL(endpoint);ensure(u.protocol==='http:'&&u.hostname==='127.0.0.1'&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash,'E5_LOOPBACK_ONLY');let id=0;
 return async(method,params=[])=>{
  let response;const requestId=++id;
  try{response=await fetch(u,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params}),signal:AbortSignal.timeout(10000),redirect:'error'});}
  catch{throw Error('E5_RPC_TRANSPORT');}
  ensure(response.ok,'E5_RPC_HTTP');let result;try{result=await response.json();}catch{throw Error('E5_RPC_JSON');}ensure(result?.jsonrpc==='2.0'&&result.id===requestId,'E5_RPC_ID');
  if(result.error){const error=new Error('E5_RPC_REJECTED');error.rpcCode=result.error.code;throw error;}
  ensure(Object.hasOwn(result,'result'),'E5_RPC_INCOMPLETE');return result.result;
 };
}
export async function blockHashCapability(rpc){
 const block=await rpc('eth_getBlockByNumber',['latest',false]);ensure(block?.hash,'E5_RPC_INCOMPLETE');
 const target='0x0000000000000000000000000000000000000001',selector={blockHash:block.hash,requireCanonical:true};
 const probes=[['eth_getCode',[target]],['eth_getBalance',[target]],['eth_getTransactionCount',[target]],['eth_call',[{to:target,data:'0x'}]]];
 for(const [method,args]of probes){
  await rpc(method,[...args,selector]);let rejected=false;
  try{await rpc(method,[...args,{blockHash:'0x'+'ac'.repeat(32),requireCanonical:true}]);}catch(e){rejected=e.message==='E5_RPC_REJECTED';}
  ensure(rejected,'E5_HASH_SELECTOR_IGNORED');
 }
 return {version:'clear-e5-blockhash-capability.1',blockHash:block.hash,methods:probes.map(x=>x[0]),unknownHashRejected:true,numberFallback:false};
}
