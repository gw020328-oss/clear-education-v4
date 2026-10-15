import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Wallet} from 'ethers';
import {initializeSourceDevelopment,startSourceDevelopment} from '../../src/product-workflow/http-development.mjs';
import {createStudentWorkflowClient} from '../../src/product-workflow/student-http-client.mjs';
import {createEvaluationWorkflowClient} from '../../src/product-workflow/evaluation-http-client.mjs';
import {evaluationHttpExample} from './evaluation-http-example.mjs';
import {availablePort,tlsRequest,loginHttp} from './http-demo.mjs';
export async function runEvaluationHttpDemo({profile='ybm',includeResponses=false}={}){
 const root=realpathSync(mkdtempSync(join(tmpdir(),'clear-evaluation-demo-'))),directory=join(root,'environment');let server;
 try{
  const definition=evaluationHttpExample(profile),deadlines=definition.compiled.policy.deadlines;let time=definition.scenarioStart;
  const operator=Wallet.createRandom(),participant=Wallet.createRandom(),config=initializeSourceDevelopment({directory,port:await availablePort(),operator:operator.address,participant:participant.address,evaluationProfile:profile});
  const options={directory,evaluationNow:()=>time};server=await startSourceDevelopment(options);
  const request=tlsRequest(config.origin,readFileSync(join(directory,'ca.pem'))),headers=await loginHttp(request,participant,config.chainId);
  const authenticated=async(path,options={})=>{const r=await request(path,{method:options.method,body:options.body,headers:{...headers,...(options.idempotencyKey?{'idempotency-key':options.idempotencyKey}:{})}});assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
  const student=createStudentWorkflowClient({request:authenticated}),client=createEvaluationWorkflowClient({request:authenticated}),policy=(await student.policies()).policies[0];
  const created=await student.create({policyHash:policy.policyHash},{idempotencyKey:'create-demo'}),app=created.applicationId,c1=await student.preview(app);
  await student.acknowledge(app,{expectedRevision:c1.expectedRevision,previewHash:c1.previewHash,acknowledgement:'SYNTHETIC_ACK_ONLY'},{idempotencyKey:'c1-demo'});
  const preview=await client.preview(app),receipts=[];
  async function accept(fixtureId){const p=await client.preview(app),req=p.requirements.find(r=>r.fixtures.some(f=>f.fixtureId===fixtureId));const r=await client.accept(app,{expectedWorkflowRevision:p.workflowRevision,expectedEvidenceRevision:req.expectedEvidenceRevision,fixtureId},{idempotencyKey:fixtureId});receipts.push(r);return r;}
  await accept('score-ready');await accept('review-unverified');await accept(profile==='ybm'?'mock-ready':'history-ready');
  time=deadlines.evidenceUntil+1;await accept('learning-ready');let p=await client.preview(app);
  await client.select(app,{expectedWorkflowRevision:p.workflowRevision,selectionPreviewHash:p.selectionPreviewHash,tier:profile==='ybm'?100:200,acknowledgement:'SYNTHETIC_SELECTION_ONLY'},{idempotencyKey:'select'});
  p=await client.preview(app);const held=await client.evaluate(app,{expectedWorkflowRevision:p.workflowRevision},{idempotencyKey:'held'});assert.equal(held.result.result.settlement,'ON_HOLD');
  await accept('review-ready');p=await client.preview(app);const candidate=await client.evaluate(app,{expectedWorkflowRevision:p.workflowRevision},{idempotencyKey:'candidate'});assert.equal(candidate.result.result.settlement,'CANDIDATE_SYNTHETIC');
  time=deadlines.supplementUntil;p=await client.preview(app);await client.finalize(app,{expectedWorkflowRevision:p.workflowRevision,expectedFactsRevision:p.factsRevision,expectedSelectionRevision:p.selectionRevision,acknowledgement:'SYNTHETIC_FINALIZATION_ONLY'},{idempotencyKey:'finalize'});
  p=await client.preview(app);const final=await client.evaluate(app,{expectedWorkflowRevision:p.workflowRevision},{idempotencyKey:'final'});assert.equal(final.result.result.settlement,'FINAL_SYNTHETIC');
  await server.close();server=await startSourceDevelopment(options);const recovered=await client.recover(app,'evaluations','final');assert.deepEqual(recovered,final);
  const stale=await client.decision(app,held.result.decisionId);assert.equal(stale.current,false);assert.equal(stale.result,null);
  const value={kind:'SYNTHETIC_EVIDENCE_EVALUATION_HTTP_DEMO',version:'clear-mvp-evidence-http.1',profile,verifiedHttps:true,signedInvitedWalletLogin:true,
   timeMode:'TRUSTED_HOST_SYNTHETIC_PHASES',restartSameDecision:true,atomicEvidenceAndDecision:true,sourceVerified:false,userConsentVerified:false,productEligible:false,paymentAllowed:false,
   fundingStatus:'UNKNOWN',grant:'HOLD',outbox:'HOLD',independentClaim:'NO_GO',actualWebsiteFetches:0,paidModelCalls:0};
  return includeResponses?{...value,responses:{preview,receipt:receipts[0],held,candidate,final,recovered,stale}}:value;
 }finally{await server?.close();rmSync(root,{recursive:true,force:true});}
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)console.log(JSON.stringify(await runEvaluationHttpDemo({profile:process.argv.includes('--siwon')?'siwon':'ybm',includeResponses:process.argv.includes('--responses')}),null,2));
