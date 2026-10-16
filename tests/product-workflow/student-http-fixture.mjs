import { join } from 'node:path';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { fixture } from '../application/fixture.mjs';
import { createStudentWorkflowService } from '../../src/product-workflow/student-http-service.mjs';
import { createApplicationServer } from '../../src/application/http.mjs';
import { studentHttpExamplePolicies } from '../../specs/m3/student-http-example.mjs';
export const headersFor=c=>({cookie:'__Host-clear-session='+c.token,'x-wallet':c.wallet,'x-chain-id':String(c.chainId),'x-csrf-token':c.csrf});
export async function studentHttpFixture(t,{policies=studentHttpExamplePolicies()}={}){
 const hooks=[],f=await fixture({after:fn=>hooks.push(fn)}),directory=join(f.directory,'student-c1');let student,server,time=100,currentPolicies=policies;
 const start=async()=>{student=createStudentWorkflowService({directory,authentication:f.service,instanceId:'student-test',policies:currentPolicies,now:()=>time});
  server=createApplicationServer(f.service,{studentWorkflow:student,allowLoopbackHttpForTests:true});server.listen(0,'127.0.0.1');await once(server,'listening');};
 const stop=async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));student.close();};
 await start();t.after(async()=>{await stop();for(const fn of hooks.reverse())await fn();});
 const request=(path,{method='GET',body,headers=headersFor(f.aliceContext)}={})=>new Promise((resolve,reject)=>{
  const req=httpRequest({hostname:'127.0.0.1',port:server.address().port,path,method,headers:{host:'clear.example.invalid',origin:f.config.origin,...(body===undefined?{}:{'content-type':'application/json'}),...headers}},res=>{
   const chunks=[];res.on('data',b=>chunks.push(b));res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:JSON.parse(Buffer.concat(chunks).toString())}));
  });req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));
 });
 return {...f,directory,request,get student(){return student;},setTime:v=>{time=v;},
  async restart(policies=currentPolicies){await stop();currentPolicies=policies;await start();},
  async create(key='create-a',context=f.aliceContext){const p=await request('/mvp/policies',{headers:headersFor(context)});return request('/mvp/applications',{method:'POST',body:{policyHash:p.body.policies[0].policyHash},headers:{...headersFor(context),'idempotency-key':key}});},
 };
}
