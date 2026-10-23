// Observe only the owned client's claim RPC boundary. The trusted synchronous
// callback receives a state and the original error for fixed categorization;
// no request/result is passed and nothing from the call is retained here.
import {withSendContext} from './send-context.mjs';
const clients=new WeakMap();
export function installClaimRpcObserver(client){
 if(clients.has(client))return;
 const rpc=client.rpc,entry={listener:null,wrapper:null};
 if(typeof rpc!=='function')return;
 const notify=(listener,state,error,details)=>{try{if(listener?.active)listener.observe(state,error,details);}catch{}};
 entry.wrapper=async function(...args){
  const listener=args[0]==='claimTunnel'?entry.listener:null;
  // SDK 5.1.4 starts each RPC response timer before encoding/sending. Carry
  // that same budget through the sender, including 5s disconnect RPCs. This
  // deadline is earlier than the SDK timer and cannot extend it.
  const timeout=args[2]===undefined?90000:args[2];
  const context={deadline:performance.now()+(Number.isFinite(timeout)&&timeout>0&&timeout<=2147483647?timeout:0),
   observe:listener?(state,error,details)=>notify(listener,`SEND_${state}`,error,details):null};
  notify(listener,'STARTED');
  try{const result=await withSendContext(context,()=>Reflect.apply(rpc,this,args));notify(listener,'COMPLETED');return result;}
  catch(error){notify(listener,'FAILED',error);throw error;}
 };
 client.rpc=entry.wrapper;clients.set(client,entry);
}
export function observeClaimRpc(client,observe){
 const entry=clients.get(client);
 if(!entry||client.rpc!==entry.wrapper||entry.listener||typeof observe!=='function')return null;
 const listener={active:true,observe};entry.listener=listener;
 return ()=>{listener.active=false;if(entry.listener===listener)entry.listener=null;};
}
