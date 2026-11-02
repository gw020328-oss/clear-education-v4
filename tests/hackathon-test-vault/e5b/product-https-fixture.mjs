import {createTeamPort} from '../../../src/embedded-wallet/team-port.mjs';
// Product HTTPS mount + browser API + product signing adapter. Wallets are test EOAs.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {request as httpsRequest} from 'node:https';
import {mkdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createCertificates,loadTls} from '../../../src/dev/tls.mjs';
import {createBootcampFrontendServer} from '../../../tools/bootcamp/frontend-server.mjs';
import {createSameOriginApi} from '../../../src/application/api-client.mjs';
import {createProductSession} from '../../../src/embedded-wallet/product-session.mjs';

export async function productHttps(t,{store,authentication,context,key,normalUi,dir,runtime}){
 const tlsDir=join(dir,'synthetic-product-tls');mkdirSync(tlsDir,{mode:0o700});const fingerprint=createCertificates(tlsDir);
 const host=createBootcampFrontendServer({authentication,store,tls:loadTls(tlsDir,fingerprint),sourceMode:'REGISTERED_TEST_SOURCE',chainId:Number(runtime.chainId),normalUi});
 host.server.listen(0,'127.0.0.1');await once(host.server,'listening');
 t.after(async()=>{host.server.closeAllConnections();await new Promise(r=>host.server.close(r));await host.drain();});
 const origin='https://127.0.0.1:'+host.server.address().port,ca=readFileSync(join(tlsDir,'ca.pem')),events=[];
 const raw=(path,{method='GET',body,actor=context,idempotencyKey=key()}={})=>new Promise((resolve,reject)=>{
  events.push({path,method});
  const req=httpsRequest({hostname:'127.0.0.1',servername:'localhost',port:host.server.address().port,path,method,ca,
   headers:{host:new URL(store.origin).host,origin:store.origin,cookie:'__Host-clear-session='+actor.token,'x-wallet':actor.wallet,'x-chain-id':String(actor.chainId),'x-csrf-token':actor.csrf,'content-type':'application/json','idempotency-key':idempotencyKey}},res=>{
    const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks))}));});
  req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));
 });
 const request=async(path,options)=>{const r=await raw(path,options);if(r.status!==200)throw Error(r.body.error);return r.body;};
 const api=createSameOriginApi({origin,fetch:async(url,options)=>{const u=new URL(url);assert.equal(u.origin,origin);
  const r=await raw(u.pathname+u.search,{method:options.method,body:options.body===undefined?undefined:JSON.parse(options.body),idempotencyKey:options.headers.get('idempotency-key')??undefined});
  return Response.json(r.body,{status:r.status});}});
 const product=({app,participant})=>{
  normalUi.getSession=c=>{const actor=authentication.authorizeWorkflow(c,false);return {version:'clear-bootcamp-normal-session.1',sourceMode:'REGISTERED_TEST_SOURCE',receiptRequired:true,role:actor.role.toUpperCase(),applicationId:app,policyHash:runtime.policyHash,runtimeMappingHash:runtime.runtimeMappingHash,expectedPayment:{recipient:participant.address.toLowerCase()},
   signingContext:{source:{applicationId:app,policyHash:runtime.policyHash,runtimeMappingHash:runtime.runtimeMappingHash},registration:{applicationId:app,instanceId:runtime.instanceId,verifyingContract:runtime.vaultAddress,policyHash:runtime.policyHash,runtimeMappingHash:runtime.runtimeMappingHash,participant:participant.address}}};};
  const options={session:{assertSession:async()=>authentication.authorizeWorkflow(context,false),request:(path,{idempotencyKey,...options}={})=>api(path,{...options,headers:idempotencyKey?{'idempotency-key':idempotencyKey}:{}})},
   wallet:{pin:{address:participant.address,chainId:Number(runtime.chainId)},async typed(payload){events.push({method:'WALLET',path:'REGISTRATION'});return participant.signTypedData(payload.domain,payload.types,payload.message);}},
   config:{appId:'synthetic00001',origin,redirectUri:origin+'/onboarding',phase:'ACTIVE_LOCAL_TEST',chainId:Number(runtime.chainId),rpcUrl:runtime.endpoint,instanceId:runtime.instanceId}};
  const team=createTeamPort(options);return {readRegistration:()=>team.normal.recipientRegistration(app),submitRegistration:packet=>team.normal.registerReviewedRecipient(packet)};
 };
 return {raw,request,product,events};
}
