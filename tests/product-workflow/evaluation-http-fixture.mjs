import {join} from 'node:path';
import {once} from 'node:events';
import {request as httpRequest} from 'node:http';
import {fixture} from '../application/fixture.mjs';
import {createApplicationServer} from '../../src/application/http.mjs';
import {createStudentWorkflowService} from '../../src/product-workflow/student-http-service.mjs';
import {createEvaluationWorkflowService} from '../../src/product-workflow/evaluation-http-service.mjs';
import {evaluationHttpExample} from '../../specs/m3/evaluation-http-example.mjs';
import {headersFor} from './student-http-fixture.mjs';
export {headersFor};
export const appPath=app=>'/mvp/applications/'+app;
export async function evaluationHttpFixture(t,{profile='ybm'}={}){
 const hooks=[],f=await fixture({after:fn=>hooks.push(fn)}),configuration=evaluationHttpExample(profile),directory=join(f.directory,'evaluation');
 let time=configuration.scenarioStart,student,evaluation,server,policies=configuration.studentPolicies;
 const start=async()=>{student=createStudentWorkflowService({directory:join(f.directory,'student'),authentication:f.service,instanceId:'evaluation-test',policies,now:()=>time});
  evaluation=createEvaluationWorkflowService({directory,authentication:f.service,student,instanceId:'evaluation-test',configuration,now:()=>time});
  server=createApplicationServer(f.service,{studentWorkflow:student,evaluationWorkflow:evaluation,allowLoopbackHttpForTests:true});server.listen(0,'127.0.0.1');await once(server,'listening');};
 const stop=async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));evaluation.close();student.close();};
 await start();t.after(async()=>{await stop();for(const fn of hooks.reverse())await fn();});
 const request=(path,{method='GET',body,headers=headersFor(f.aliceContext)}={})=>new Promise((resolve,reject)=>{
  const req=httpRequest({hostname:'127.0.0.1',port:server.address().port,path,method,headers:{host:'clear.example.invalid',origin:f.service.origin,...(body===undefined?{}:{'content-type':'application/json'}),...headers}},res=>{
   const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks).toString())}));res.on('error',reject);
  });req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));
 });
 const post=(path,body,key,context=f.aliceContext)=>request(path,{method:'POST',body,headers:{...headersFor(context),'idempotency-key':key}});
 const preview=async app=>(await request(appPath(app)+'/evaluation-preview')).body;
 return {...f,configuration,directory,request,post,preview,get evaluation(){return evaluation;},get student(){return student;},get evaluationTime(){return time;},setEvaluationTime(t){time=t;},
  async restart(next=policies){await stop();policies=next;await start();},
  async create(context=f.aliceContext,ack=true){const p=(await request('/mvp/policies',{headers:headersFor(context)})).body.policies[0],c=await post('/mvp/applications',{policyHash:p.policyHash},'create',context),app=c.body.applicationId;
   const a=(await request(appPath(app)+'/agreement-preview',{headers:headersFor(context)})).body;
   if(ack)await post(appPath(app)+'/agreement',{expectedRevision:a.expectedRevision,previewHash:a.previewHash,acknowledgement:'SYNTHETIC_ACK_ONLY'},'c1-ack',context);return app;},
  async accept(app,fixtureId,key=fixtureId){const p=await preview(app),requirement=p.requirements.find(r=>r.fixtures.some(f=>f.fixtureId===fixtureId));
   return post(appPath(app)+'/evidence-receipts',{expectedWorkflowRevision:p.workflowRevision,expectedEvidenceRevision:requirement.expectedEvidenceRevision,fixtureId},key);},
  async select(app,tier=100,key='select'){const p=await preview(app);return post(appPath(app)+'/evaluation-selection',{expectedWorkflowRevision:p.workflowRevision,selectionPreviewHash:p.selectionPreviewHash,tier,acknowledgement:'SYNTHETIC_SELECTION_ONLY'},key);},
  async evaluate(app,key='evaluate'){const p=await preview(app);return post(appPath(app)+'/evaluations',{expectedWorkflowRevision:p.workflowRevision},key);},
  async finalize(app,key='finalize'){const p=await preview(app);return post(appPath(app)+'/evaluation-finalization',{expectedWorkflowRevision:p.workflowRevision,expectedFactsRevision:p.factsRevision,expectedSelectionRevision:p.selectionRevision,acknowledgement:'SYNTHETIC_FINALIZATION_ONLY'},key);},
 };
}
