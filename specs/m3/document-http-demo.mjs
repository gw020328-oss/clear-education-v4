import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Wallet} from 'ethers';
import {initializeSourceDevelopment,startSourceDevelopment} from '../../src/product-workflow/http-development.mjs';
import {createStudentWorkflowClient} from '../../src/product-workflow/student-http-client.mjs';
import {createDocumentWorkflowClient} from '../../src/product-workflow/document-http-client.mjs';
import {documentHttpExample,DOCUMENT_FIXTURE_EPOCH} from './document-http-example.mjs';
import {availablePort,tlsRequest,loginHttp} from './http-demo.mjs';
export async function runDocumentHttpDemo({includeResponses=false}={}){
 const root=realpathSync(mkdtempSync(join(tmpdir(),'clear-document-demo-'))),directory=join(root,'environment');let server;
 try{
  const operator=Wallet.createRandom(),participant=Wallet.createRandom(),config=initializeSourceDevelopment({directory,port:await availablePort(),operator:operator.address,participant:participant.address,documentMode:true});
  const options={directory,documentNow:()=>DOCUMENT_FIXTURE_EPOCH+100};server=await startSourceDevelopment(options);
  const request=tlsRequest(config.origin,readFileSync(join(directory,'ca.pem'))),headers=await loginHttp(request,participant,config.chainId);
  const authenticated=async(path,options={})=>{const r=await request(path,{method:options.method,body:options.body,headers:{...headers,...(options.idempotencyKey?{'idempotency-key':options.idempotencyKey}:{})}});assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
  const student=createStudentWorkflowClient({request:authenticated}),client=createDocumentWorkflowClient({request:authenticated});
  const policy=(await student.policies()).policies[0],created=await student.create({policyHash:policy.policyHash},{idempotencyKey:'create-demo'}),app=created.applicationId,c1=await student.preview(app);
  await student.acknowledge(app,{expectedRevision:c1.expectedRevision,previewHash:c1.previewHash,acknowledgement:'SYNTHETIC_ACK_ONLY'},{idempotencyKey:'c1-demo'});
  const preview=await client.preview(app),ack=await client.acknowledge(app,{expectedWorkflowRevision:preview.expectedWorkflowRevision,documentPreviewHash:preview.documentPreviewHash,acknowledgement:'SYNTHETIC_DOCUMENT_ACK_ONLY'},{idempotencyKey:'document-demo'});
  const uploaded=await client.submit(app,{expectedWorkflowRevision:ack.result.current?(await client.preview(app)).expectedWorkflowRevision:0,expectedSubmissionRevision:0,documentAcknowledgmentHash:ack.result.documentAcknowledgmentHash,fixtureId:'image',
   files:documentHttpExample().fixtures.find(f=>f.fixtureId==='image').files.map(f=>({postId:f.postId,imageId:f.imageId,name:'synthetic.png',mediaType:f.mediaType,base64:f.bytes.toString('base64')}))},{idempotencyKey:'submit-demo'});
  const sub=uploaded.result,started=await client.startRun(app,{expectedWorkflowRevision:sub.workflowRevision,submissionId:sub.submissionId,expectedSubmissionRevision:sub.submissionRevision,method:'VISION'},{idempotencyKey:'run-demo'});
  let result;for(let i=0;i<50;i++){result=await client.run(app,started.result.runId);if(result.state==='ACCEPTED')break;await new Promise(r=>setTimeout(r,5));}
  assert.equal(result.state,'ACCEPTED');assert.ok(result.summary.reasons.some(x=>x.code==='IMAGE_NOT_DECODED'));
  await server.close();server=await startSourceDevelopment(options);
  const recovered=await client.recover(app,'review-runs','run-demo');assert.deepEqual(recovered.result,result);
  const raw=await client.submission(app,sub.submissionId);assert.equal(raw.rawAvailable,false);
  const value={kind:'SYNTHETIC_DOCUMENT_C2_HTTP_DEMO',version:'clear-mvp-document-http.1',verifiedHttps:true,signedInvitedWalletLogin:true,timeMode:'SYNTHETIC_FIXED_SOURCE_EPOCH',
   separateC1AndDocumentAcknowledgment:true,receivedActualFixtureBytes:true,storedManifest:true,restartSameReceipt:true,rawDiskPersistence:false,rawAvailableAfterRestart:false,
   reviewStatus:result.summary.reviewStatus,syntheticDocumentSubmissionReady:true,documentSubmissionReady:false,imageDecodeReady:false,realDataAllowed:false,actualWebsiteFetches:0,paidModelCalls:0,
   userConsentVerified:false,productEligible:false,paymentAllowed:false,grant:'HOLD',outbox:'HOLD',independentClaim:'NO_GO'};
  return includeResponses?{...value,responses:{preview,acknowledgment:ack,submission:uploaded,run:result,recovered}}:value;
 }finally{await server?.close();rmSync(root,{recursive:true,force:true});}
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)console.log(JSON.stringify(await runDocumentHttpDemo({includeResponses:process.argv.includes('--responses')}),null,2));
