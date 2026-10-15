import { join } from 'node:path';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { fixture } from '../application/fixture.mjs';
import { sourceFixture,textObserver } from '../ai-policy/source-bundle-fixture.mjs';
import { createWorkflowHttpService } from '../../src/product-workflow/http-service.mjs';
import { createApplicationServer } from '../../src/application/http.mjs';
export const contextHeaders=c=>({cookie:'__Host-clear-session='+c.token,'x-wallet':c.wallet,'x-chain-id':String(c.chainId),'x-csrf-token':c.csrf});
export async function httpFixture(t, overrides={}){
 const f=await fixture(t),source=sourceFixture();let time=100,calls=0,workflow;
 const b=source.input.bundle,sourceId=source.snapshot.sourceId;
 const config={directory:join(f.directory,'mvp-http'),authentication:f.service,instanceId:'source-http-test',captureMode:'MOCK',now:()=>time,
  bundles:[{bundleId:b.bundleId,sourceId,institutionId:b.institutionId,productId:b.productId,cohortId:b.cohortId,requiredSourceIds:[sourceId,'missing-guide'],urlIds:[0]}],
  collector:async input=>{calls++;return {snapshot:{...structuredClone(source.snapshot),revision:input.revision},blobs:new Map([...source.blobs].map(([id,value])=>[id,Buffer.from(value)]))};},
  proposalInputs:{[b.bundleId]:{draft:source.input.draft,sources:source.input.sources,capabilities:source.input.capabilities}},textAdapter:textObserver(()=>source.output),...overrides};
 workflow=createWorkflowHttpService(config);
 let server;
 const start=async(options={allowLoopbackHttpForTests:true})=>{server=createApplicationServer(f.service,{...options,workflow});server.listen(0,'127.0.0.1');await once(server,'listening');};
 const stop=async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));};
 await start();t.after(async()=>{await stop();workflow.close();});
 const request=async(path,{method='GET',body,headers=contextHeaders(f.operatorContext)}={})=>new Promise((resolve,reject)=>{
  const req=httpRequest({hostname:'127.0.0.1',port:server.address().port,path,method,headers:{host:'clear.example.invalid',origin:f.config.origin,
   ...(body===undefined?{}:{'content-type':'application/json'}),...headers}},res=>{let raw='';res.on('data',b=>raw+=b);res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:JSON.parse(raw)}));});
  req.on('error',reject);req.end(body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body));
 });
 return {...f,source,config,request,get workflow(){return workflow;},get captureCalls(){return calls;},setTime:v=>{time=v;},
  async restart(){await stop();workflow.close();workflow=createWorkflowHttpService({...config,authentication:f.service});await start();},
  async restartTransport(options){await stop();await start(options);},
  capture:(key='capture-a',expectedRevision=0)=>request('/mvp/source-bundles/'+b.bundleId+'/snapshots',{method:'POST',body:{urlId:0,expectedRevision},headers:{...contextHeaders(f.operatorContext),'idempotency-key':key}}),
 };
}
