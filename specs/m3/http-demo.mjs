import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { request as httpsRequest } from 'node:https';
import { pathToFileURL } from 'node:url';
import { Wallet } from 'ethers';
import { initializeSourceDevelopment,startSourceDevelopment } from '../../src/product-workflow/http-development.mjs';
import { createWorkflowSourceClient } from '../../src/product-workflow/http-client.mjs';
export async function availablePort(){const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));return port;}
export function tlsRequest(origin,ca){return (path,{method='GET',body,headers={},trusted=true}={})=>new Promise((resolve,reject)=>{
 const req=httpsRequest(origin+path,{method,agent:false,servername:'localhost',ca:trusted?ca:undefined,headers:{origin,...(body===undefined?{}:{'content-type':'application/json'}),...headers}},res=>{
  const chunks=[];let size=0;res.on('data',b=>{size+=b.length;if(size>16777216){res.destroy();reject(Error('DEMO_RESPONSE_SIZE'));}else chunks.push(b);});res.on('error',reject);
  res.on('end',()=>{try{resolve({status:res.statusCode,headers:res.headers,body:JSON.parse(Buffer.concat(chunks).toString())});}catch(e){reject(e);}});
 });req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));
});}
export async function loginHttp(request,wallet,chainId){
 const challenge=await request('/auth/nonce',{method:'POST',body:{wallet:wallet.address,chainId}});assert.equal(challenge.status,200);
 const preauth=challenge.headers['set-cookie'][0].split(';')[0];
 const login=await request('/auth/verify',{method:'POST',body:{nonce:challenge.body.nonce,signature:await wallet.signMessage(challenge.body.message)},headers:{cookie:preauth}});assert.equal(login.status,200);
 const cookie=login.headers['set-cookie'].find(c=>c.startsWith('__Host-clear-session=')).split(';')[0];
 return {cookie,'x-wallet':wallet.address,'x-chain-id':String(chainId),'x-csrf-token':login.body.csrf};
}
export async function runSourceHttpDemo(){
 const root=realpathSync(mkdtempSync(join(tmpdir(),'clear-source-http-demo-'))),directory=join(root,'environment');let server;
 try{
  const operator=Wallet.createRandom(),participant=Wallet.createRandom(),config=initializeSourceDevelopment({directory,port:await availablePort(),operator:operator.address,participant:participant.address});
  server=await startSourceDevelopment({directory});const request=tlsRequest(config.origin,readFileSync(join(directory,'ca.pem'))),headers=await loginHttp(request,operator,config.chainId);
  const client=createWorkflowSourceClient({request:async(path,options={})=>{const r=await request(path,{method:options.method,body:options.body,headers:{...headers,...(options.idempotencyKey?{'idempotency-key':options.idempotencyKey}:{})}});assert.equal(r.status,200);return r.body;}});
  assert.equal((await client.catalogue()).captureMode,'MOCK');
  const first=await client.capture('synthetic-demo',{expectedRevision:0,urlId:0},{idempotencyKey:'demo-capture'});assert.equal(first.state,'SUCCEEDED');
  const p=await client.preview('synthetic-demo');assert.equal(p.status,'NEEDS_SUPPLEMENT');
  const draft=await client.propose('synthetic-demo',{expectedRevision:p.revision,bundleHash:p.bundleHash},{idempotencyKey:'demo-draft'});assert.equal(draft.state,'SUCCEEDED');
  const displayed=await client.preview('synthetic-demo');assert.ok(displayed.draft?.proposal);
  const review=await client.review('synthetic-demo',{expectedRevision:displayed.revision,previewHash:displayed.previewHash,acknowledgement:'SYNTHETIC_REVIEW_ONLY'},{idempotencyKey:'demo-review'});
  await server.close();server=await startSourceDevelopment({directory});
  assert.equal((await client.recover('synthetic-demo','drafts','demo-draft')).operationId,draft.operationId);
  assert.equal((await client.reviews('synthetic-demo'))[0].reviewId,review.reviewId);
  return {kind:'SYNTHETIC_SOURCE_HTTP_DEMO',verifiedHttps:true,signedWalletLogin:true,captureMode:'MOCK',actualWebsiteFetches:0,actualModelCalls:0,
   sourceStatus:p.status,draftStatus:draft.state,reviewStatus:review.status,restartSameOperation:true,restartSameReview:true,
   studentSubmissionHttpImplemented:false,frontendConnected:false,identityVerified:false,policyPublished:false,paymentAllowed:false,grant:'HOLD',outbox:'HOLD',independentClaim:'NO_GO'};
 }finally{await server?.close();rmSync(root,{recursive:true,force:true});}
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)console.log(JSON.stringify(await runSourceHttpDemo(),null,2));
