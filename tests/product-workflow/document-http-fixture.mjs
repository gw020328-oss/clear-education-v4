import {join} from 'node:path';
import {once} from 'node:events';
import {request as httpRequest} from 'node:http';
import {fixture} from '../application/fixture.mjs';
import {createApplicationServer} from '../../src/application/http.mjs';
import {createStudentWorkflowService} from '../../src/product-workflow/student-http-service.mjs';
import {createDocumentWorkflowService} from '../../src/product-workflow/document-http-service.mjs';
import {documentHttpExample,DOCUMENT_FIXTURE_EPOCH} from '../../specs/m3/document-http-example.mjs';
import {headersFor} from './student-http-fixture.mjs';
export {headersFor};
export async function documentHttpFixture(t,{adapter,timeoutMs=1000,initialStudentPolicies}={}){
 const hooks=[],f=await fixture({after:fn=>hooks.push(fn)}),configuration=documentHttpExample();if(adapter)configuration.adapter=adapter;
 const directory=join(f.directory,'documents');let time=DOCUMENT_FIXTURE_EPOCH+100,student,documents,server,policies=initialStudentPolicies??configuration.studentPolicies;
 const start=async()=>{student=createStudentWorkflowService({directory:join(f.directory,'student'),authentication:f.service,instanceId:'document-test',policies,now:()=>time});
  documents=createDocumentWorkflowService({directory,authentication:f.service,student,instanceId:'document-test',configuration,now:()=>time,timeoutMs});
  server=createApplicationServer(f.service,{studentWorkflow:student,documentWorkflow:documents,allowLoopbackHttpForTests:true});server.listen(0,'127.0.0.1');await once(server,'listening');};
 const stop=async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await documents.close();student.close();};
 await start();t.after(async()=>{await stop();for(const fn of hooks.reverse())await fn();});
 const request=(path,{method='GET',body,headers=headersFor(f.aliceContext)}={})=>new Promise((resolve,reject)=>{
  const req=httpRequest({hostname:'127.0.0.1',port:server.address().port,path,method,headers:{host:'clear.example.invalid',origin:f.service.origin,...(body===undefined?{}:{'content-type':'application/json'}),...headers}},res=>{
   const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks).toString())}));res.on('error',reject);
  });req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));
 });
 const post=(path,body,key,context=f.aliceContext)=>request(path,{method:'POST',body,headers:{...headersFor(context),'idempotency-key':key}});
 return {...f,configuration,directory,request,post,get documents(){return documents;},get student(){return student;},get port(){return server.address().port;},setTime(t){time=t;},async restart(next=policies){await stop();policies=next;await start();},
  async create(context=f.aliceContext){const p=(await request('/mvp/policies',{headers:headersFor(context)})).body.policies[0];const c=await post('/mvp/applications',{policyHash:p.policyHash},'create',context),app=c.body.applicationId;
   const a=(await request('/mvp/applications/'+app+'/agreement-preview',{headers:headersFor(context)})).body;
   await post('/mvp/applications/'+app+'/agreement',{expectedRevision:1,previewHash:a.previewHash,acknowledgement:'SYNTHETIC_ACK_ONLY'},'c1-ack',context);return app;},
  async acknowledge(app){const p=(await request('/mvp/applications/'+app+'/document-preview')).body;
   return post('/mvp/applications/'+app+'/document-agreement',{expectedWorkflowRevision:p.expectedWorkflowRevision,documentPreviewHash:p.documentPreviewHash,acknowledgement:'SYNTHETIC_DOCUMENT_ACK_ONLY'},'doc-ack');},
  async submit(app,fixtureId='ready-text',key='submit',revision=0){const p=(await request('/mvp/applications/'+app+'/document-preview')).body,fixture=configuration.fixtures.find(f=>f.fixtureId===fixtureId);
   return post('/mvp/applications/'+app+'/submissions',{expectedWorkflowRevision:p.expectedWorkflowRevision,expectedSubmissionRevision:revision,documentAcknowledgmentHash:p.documentAcknowledgment.documentAcknowledgmentHash,fixtureId,
    files:fixture.files.map(f=>({postId:f.postId,imageId:f.imageId,name:'synthetic.png',mediaType:f.mediaType,base64:f.bytes.toString('base64')}))},key);},
 };
}
