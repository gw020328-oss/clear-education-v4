import {existsSync} from 'node:fs';
import {createApplicationServer} from '../../src/application/http.mjs';
import {createBootcampHandler} from '../../src/bootcamp/http.mjs';
import {loadPublicAssets} from '../../src/dev/public-assets.mjs';
import {P0_POLICY,p0PolicyHash} from '../../specs/bootcamp/p0-contract.mjs';
import {NORMAL_HOST_VERSION} from '../../src/bootcamp/normal-client.mjs';

// Mount the existing two handlers on one existing HTTPS server; no RPC, collector or signer is installed.
export function createBootcampFrontendServer({authentication,store,tls,sourceMode,chainId,webRoot}){
 if(authentication.origin!==store.origin||authentication.chainId!==chainId||!tls||!['SYNTHETIC_TEST_SOURCE','REGISTERED_TEST_SOURCE'].includes(sourceMode))throw Error('BC_FRONTEND_CONFIG');
 const server=createApplicationServer(authentication,{tls}),auth=server.listeners('request')[0],bootcamp=createBootcampHandler(store);
 const expected=new URL(store.origin),assets=webRoot&&existsSync(webRoot)?loadPublicAssets(webRoot):new Map();
 const config=Object.freeze({version:NORMAL_HOST_VERSION,origin:store.origin,chainId,sourceMode,policyHash:p0PolicyHash(P0_POLICY),
  procedureHttpVersion:'clear-bootcamp-review-procedure.1',operationsHttpVersion:'clear-bootcamp-operations-projection.2',
  reviewConsentHttpImplemented:true,originalEvidenceHttpImplemented:false,executionReceiptHttpImplemented:false,
  sourceCollectionConfigured:false,signerInstalled:false,actualSourceVerification:null,productionEnabled:false});
 server.removeListener('request',auth);const pending=new Set();
 const handle=async(req,res)=>{
  if(/^\/bootcamp(?:\/|\?|$)/.test(req.url)){
   const allowed=req.method==='GET'&&(/^\/bootcamp\/v[23]\/applications\/[a-z][a-z0-9.-]{0,63}\/(operations|procedure)$/.test(req.url)
    ||/^\/bootcamp\/v3\/applications\/[a-z][a-z0-9.-]{0,63}\/procedure-operations\/[a-z][a-z0-9.-]{0,63}$/.test(req.url))
    ||req.method==='POST'&&(/^\/bootcamp\/v3\/applications\/[a-z][a-z0-9.-]{0,63}\/review-consents$/.test(req.url)||req.url==='/bootcamp/v1/applications');
   if(allowed)return bootcamp(req,res);
   res.writeHead(404,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"error":"BC_NOT_FOUND"}');return;
  }
  if(/^\/auth(?:\/|\?|$)/.test(req.url))return auth(req,res);
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'");
  const valid=req.socket.encrypted&&req.headers.host===expected.host&&(!req.headers.origin||req.headers.origin===expected.origin)
   &&(!req.headers['sec-fetch-site']||['same-origin','none'].includes(req.headers['sec-fetch-site']));
  if(!valid){res.writeHead(403,{'Content-Type':'application/json'});res.end('{"error":"ORIGIN"}');return;}
  if(req.method==='GET'&&req.url==='/__dev/config'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(config));return;}
  const path=req.url.split('?')[0],asset=assets.get(path)??(/^\/ui\/[a-zA-Z0-9/_-]*$/.test(path)?assets.get('/'):undefined);
  if(['GET','HEAD'].includes(req.method)&&asset){res.writeHead(200,{'Content-Type':asset.type});res.end(req.method==='HEAD'?undefined:asset.body);return;}
  res.writeHead(404,{'Content-Type':'application/json'});res.end('{"error":"BC_NOT_FOUND"}');
 };
 server.on('request',(req,res)=>{
  const task=Promise.resolve(handle(req,res));pending.add(task);
  task.catch(()=>{if(!res.headersSent){res.writeHead(500,{'Content-Type':'application/json'});res.end('{"error":"BC_INTERNAL"}');}else res.destroy();})
   .finally(()=>pending.delete(task));
 });
 return {server,config,async drain(){await Promise.allSettled([...pending]);}};
}
