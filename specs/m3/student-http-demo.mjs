import assert from 'node:assert/strict';
import { mkdtempSync,realpathSync,readFileSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { Wallet } from 'ethers';
import { initializeSourceDevelopment,startSourceDevelopment } from '../../src/product-workflow/http-development.mjs';
import { createStudentWorkflowClient } from '../../src/product-workflow/student-http-client.mjs';
import { availablePort,tlsRequest,loginHttp } from './http-demo.mjs';
export async function runStudentHttpDemo(){
 const root=realpathSync(mkdtempSync(join(tmpdir(),'clear-student-c1-demo-'))),directory=join(root,'environment');let server;
 try{
  const operator=Wallet.createRandom(),participant=Wallet.createRandom();
  const config=initializeSourceDevelopment({directory,port:await availablePort(),operator:operator.address,participant:participant.address});
  server=await startSourceDevelopment({directory});const request=tlsRequest(config.origin,readFileSync(join(directory,'ca.pem'))),headers=await loginHttp(request,participant,config.chainId);
  const client=createStudentWorkflowClient({request:async(path,options={})=>{const r=await request(path,{method:options.method,body:options.body,headers:{...headers,...(options.idempotencyKey?{'idempotency-key':options.idempotencyKey}:{})}});assert.equal(r.status,200);return r.body;}});
  const policy=(await client.policies()).policies[0];assert.equal(policy.configurationStatus,'SYNTHETIC_READY');
  const created=await client.create({policyHash:policy.policyHash},{idempotencyKey:'student-create-demo'}),id=created.applicationId;
  const displayed=await client.preview(id);
  const ack=await client.acknowledge(id,{expectedRevision:displayed.expectedRevision,previewHash:displayed.previewHash,acknowledgement:'SYNTHETIC_ACK_ONLY'},{idempotencyKey:'student-ack-demo'});
  assert.equal(ack.result.state,'ACKNOWLEDGED_SYNTHETIC');
  await server.close();server=await startSourceDevelopment({directory});
  assert.equal((await client.recover(id,'agreement','student-ack-demo')).operationId,ack.operationId);
  assert.equal((await client.get(id)).state,'ACKNOWLEDGED_SYNTHETIC');
  assert.equal((await request('/mvp/source-bundles',{headers})).status,403);
  return {kind:'SYNTHETIC_STUDENT_C1_HTTP_DEMO',version:'clear-mvp-student-http.1',verifiedHttps:true,signedInvitedWalletLogin:true,
   studentApplicationHttpImplemented:true,exactDisplayAcknowledgment:true,restartSameOperation:true,state:'ACKNOWLEDGED_SYNTHETIC',
   studentSubmissionHttpImplemented:false,documentSubmissionReady:false,frontendConnected:false,actualWebsiteFetches:0,actualModelCalls:0,
   identityVerified:false,userConsentVerified:false,policyPublished:false,productEligible:false,paymentAllowed:false,fundingStatus:'UNKNOWN',grant:'HOLD',outbox:'HOLD',independentClaim:'NO_GO'};
 }finally{await server?.close();rmSync(root,{recursive:true,force:true});}
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)console.log(JSON.stringify(await runStudentHttpDemo(),null,2));
