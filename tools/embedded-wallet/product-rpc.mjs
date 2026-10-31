import {createServer} from 'node:http';
const methods=new Set(['eth_chainId','net_version','eth_getCode','eth_blockNumber','eth_getBalance','eth_call','eth_estimateGas','eth_gasPrice','eth_getBlockByNumber','eth_getBlockByHash','eth_getTransactionCount','eth_getTransactionByHash','eth_getTransactionReceipt','eth_feeHistory','eth_maxPriorityFeePerGas']);
// Read-only browser endpoint for one constructor-pinned local product chain.
// No wallet signing, raw transaction submission, account or debug RPC.
export function createProductRpc({origin,upstream,port}) {
 const base=new URL(origin),target=new URL(upstream);
 if(base.protocol!=='https:'||base.hostname!=='127.0.0.1'||base.origin!==origin
  ||target.protocol!=='http:'||target.hostname!=='127.0.0.1'||target.href!==target.origin+'/'
  ||!Number.isInteger(port)||port<1024||port>65535||String(port)===base.port||String(port)===target.port)throw Error('PRODUCT_RPC_CONFIG');
 const pending=new Set(),url='http://127.0.0.1:'+port;
 const server=createServer({requestTimeout:5000,maxHeaderSize:8192},async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Origin');
  const allowed=['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
   &&req.headers.host==='127.0.0.1:'+port&&[undefined,origin,'chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn'].includes(req.headers.origin);
  const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  if(!allowed)return send(403,{error:'ORIGIN'});
  if(req.headers.origin)res.setHeader('Access-Control-Allow-Origin',req.headers.origin);
  if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','POST');res.setHeader('Access-Control-Allow-Headers','content-type');res.writeHead(204);res.end();return;}
  req.setTimeout(5000,()=>req.destroy());
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),5000);pending.add(abort);
  let upstreamResponse;
  try{
   if(req.method!=='POST'||req.url!=='/'||!/^application\/json(?:;|$)/.test(req.headers['content-type']??''))throw Error();
   const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>8192)throw Error();chunks.push(chunk);}
   const q=JSON.parse(Buffer.concat(chunks));
   if(q?.jsonrpc!=='2.0'||!methods.has(q.method)||!Array.isArray(q.params)||!(typeof q.id==='string'||Number.isSafeInteger(q.id))||Object.keys(q).some(k=>!['jsonrpc','method','params','id'].includes(k)))throw Error();
   upstreamResponse=await fetch(target.href,{method:'POST',redirect:'error',signal:abort.signal,headers:{'content-type':'application/json'},body:JSON.stringify(q)});
   if(!upstreamResponse.ok)throw Error();
   const reader=upstreamResponse.body.getReader(),out=[];let size=0;
   try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>1024*1024)throw Error();out.push(Buffer.from(r.value));}}
   finally{await reader.cancel().catch(()=>{});}
   const value=JSON.parse(Buffer.concat(out));if(value?.jsonrpc!=='2.0'||value.id!==q.id)throw Error();send(200,value);
  }catch{if(!res.headersSent)send(400,{error:'PRODUCT_RPC_REJECTED'});else res.destroy();}
  finally{clearTimeout(timer);pending.delete(abort);await upstreamResponse?.body?.cancel().catch(()=>{});}
 });server.maxConnections=16;
 const ready=new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>resolve());});ready.catch(()=>{});
 let closing;
 return {url,ready,close(){return closing??=(async()=>{for(const c of pending)c.abort();server.closeAllConnections();await new Promise(r=>server.close(r));})();}};
}
