// Loopback synthetic transport only: real handler/auth/CSRF, no TLS CA or external login.
import {createServer,request as httpRequest} from 'node:http';
import {once} from 'node:events';
import {createBootcampHandler} from '../../src/bootcamp/http.mjs';
export async function recipientHttp(t,{store,context,key,normalUi=null}){
 const server=createServer(createBootcampHandler(store,{allowLoopbackHttpForTests:true,normalUi}));
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
 const raw=(path,{method='GET',body,headers={},actor=context,idempotencyKey=key()}={})=>new Promise((resolve,reject)=>{
  const r=httpRequest({hostname:'127.0.0.1',port:server.address().port,path,method,headers:{host:new URL(store.origin).host,origin:store.origin,
   cookie:'__Host-clear-session='+actor.token,'x-wallet':actor.wallet,'x-chain-id':String(actor.chainId),'x-csrf-token':actor.csrf,
   'content-type':'application/json','idempotency-key':idempotencyKey,...headers}},res=>{const chunks=[];res.on('data',p=>chunks.push(p));res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks)),headers:res.headers}));});
  r.on('error',reject);r.end(body===undefined?undefined:JSON.stringify(body));
 });
 return {raw,request:async(path,options)=>{const r=await raw(path,options);if(r.status!==200)throw Error(r.body.error);return r.body;}};
}
