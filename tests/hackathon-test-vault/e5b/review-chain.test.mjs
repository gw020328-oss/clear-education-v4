import test from 'node:test';
import assert from 'node:assert/strict';
import {Contract,hexlify,randomBytes} from 'ethers';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {normalPaymentFixture} from './normal-payment-fixture.mjs';
import {executeReviewChainChange} from '../../../src/bootcamp/review-chain-worker.mjs';
import {ownedTestWallet,environmentRecord} from '../../../src/hackathon-test-vault/e5/environment.mjs';
import {ExecutionReader} from '../../../src/hackathon-test-vault/e5/reader.mjs';
import {waitSetupReceipt} from '../../../src/hackathon-test-vault/e5/setup-receipt.mjs';
import {waitForNormalChainTime} from '../../../tools/bootcamp/normal-chain-time.mjs';
import {TYPES} from '../../../src/bootcamp-authorization/test-schema-v3.mjs';
const hash=()=>hexlify(randomBytes(32));
const STOP='S3_SCENARIO_COMPLETE';
async function driver(f){
 const {store,connection,bridge,runtimeHandle:g,serviceContext:sc,user,app,key,provider}=f;
 const m=connection.runtime.manifest,reader=new ExecutionReader(m),wallet=role=>ownedTestWallet(m.environmentId,role).connect(provider);
 const vault=new Contract(m.vaultAddress,reader.vault,wallet('registrar')),token=new Contract(m.tokenAddress,reader.token,wallet('depositor'));
 const read=()=>connection.refresh(app);
 const execute=async(kind,preparationId=null)=>{
  store.execution.heartbeatRuntime(sc,g,60);
  if(['OBSERVE','REPLACE','TERMINATE'].includes(kind))return executeReviewChainChange({store,bridge,serviceContext:sc,runtimeHandle:g,context:user,applicationId:app,kind,operationId:hash(),key:key(),waitReceipt:tx=>waitSetupReceipt(provider,tx)});
  const o=await read(),plan=store.execution.plan(user,app,{kind,preparationId,operationId:hash(),expectedChainVersion:o.business.application.version});
  const id=store.execution.enqueue(user,app,plan.body,key()).receipt.intentId,h=store.execution.acquire(sc,id,{owner:g.owner,generation:1,leaseSeconds:60});store.execution.bindRuntimeIntent(sc,g,h);
  const expected=bridge.inspect(g,h);
  if(['PREPARE','START_REVIEW'].includes(kind)){const v=store.getProcedure(user,app);await waitForNormalChainTime({requiredAt:Number(kind==='PREPARE'?plan.command.args[1].issuedAt:plan.command.args[3]),businessUntil:Math.min(v.evidence.validUntilExclusive,v.procedure.reviewCapAt),authorityUntil:expected.authorityExpiresAt,readBlock:()=>provider.getBlock('latest')});}
  const r=await bridge.prepare(g,h,expected);await bridge.seal(g,h,r.binding);const found=await bridge.lookup(g,h,r.binding);await bridge.adopt(g,h,r.binding);await bridge.dispatch(g,h,r.binding);await waitSetupReceipt(provider,found.envelope.txHash);
  const done=await bridge.recover(g,h,r.binding);assert.equal(done.completion.status,'INCLUDED');return done;
 };
 const call=async(resource,extra={})=>{await read();return f.http.request('/bootcamp/v3/applications/'+app+'/'+resource,{method:'POST',body:f.body(extra)});};
 const prepare=async()=>{
  await read();store.recordReviewConsent(user,app,f.body({value:'AGREE'}),key());store.recordReviewConsent(f.op,app,f.body({value:'AGREE'}),key());
  await execute('BIND_CONSENTS');await read();const p=store.prepareReviewAuthorization(user,app,f.body(),key()).record.target.preparationId;await execute('PREPARE',p);
  const {dir}=environmentRecord(m.environmentId),db=new DatabaseSync(join(dir,'offline-bind-store/bootcamp.sqlite'),{readOnly:true});let record;try{record=JSON.parse(db.prepare('SELECT record FROM e3_prepared WHERE id=?').get(p).record);}finally{db.close();}
  return {id:p,message:record.payload.message,signature:await wallet('initialSigner').signTypedData(m.domain,TYPES,record.payload.message)};
 };
 return {...f,m,reader,wallet,vault,token,read,execute,call,prepare};
}

test('S3 wall clock HTTP objection blocks server ACCEPT; canonical observation rejects old signed approval; assessment resumes exact payment',async t=>{
 const assessments=new Map();let completed=false;
 const f=await normalPaymentFixture(t,{executionVersion:2,wallClock:true,sourceSeconds:240,assessmentPorts:{objectionAssessment:({assessmentId})=>assessments.get(assessmentId)},onReview:async base=>{
  const h=await driver(base),old=await h.prepare(),before=await h.read(),app=before.business.applicationId;
  const evidenceId=h.store.getApplication(h.user,h.app).evidence[0].record.evidenceId;
  const received=await h.call('review-objections',{reason:'SOURCE_MISMATCH',evidenceId});assert.equal(received.record.target.chainStatus,'NOT_OBSERVED');
  const pending=await h.store.execution.reviewChain(h.user,h.app);assert.equal(pending.status,'PENDING');assert.equal(pending.serverBlocked,true);assert.equal(pending.current.unassessedObjection,false);
  const plan=h.store.execution.plan(h.user,h.app,{kind:'ACCEPT',operationId:hash(),expectedChainVersion:before.business.application.version,preparationId:old.id});
  assert.throws(()=>h.store.execution.enqueue(h.user,h.app,plan.body,h.key()),/OBJECTION_BLOCKED/);
  await h.execute('OBSERVE');const blocked=await h.read();assert.equal(blocked.business.application.unassessedObjection,true);assert.equal(blocked.business.application.preparedDigest,'0x'+'00'.repeat(32));
  await assert.rejects(h.vault.connect(h.wallet('relayer')).accept.staticCall(hash(),old.message,old.signature,blocked.business.application.version));
  assert.equal((await h.store.execution.reviewChain(h.user,h.app)).status,'INCLUDED');
  const v=h.store.getProcedure(h.user,h.app),assessmentId='s3-assessment';assessments.set(assessmentId,{version:'clear-bootcamp-procedure-assessment.1',execution:'REGISTERED_TEST_CHAIN',assessmentId,applicationId:h.app,objectionId:received.record.target.actionId,decisionId:v.decisionId,decisionHash:v.decisionHash,outcome:'IRRELEVANT',basisEvidenceIds:[evidenceId],receiptHash:hash()});
  await h.call('objection-assessments',{assessmentId,objectionId:received.record.target.actionId});await h.execute('OBSERVE');
  const next=await h.prepare(),accepted=await h.execute('ACCEPT',next.id);assert.ok(accepted.claimJob);
  const balance=await h.token.balanceOf(h.user.wallet);await (await h.vault.connect(h.wallet('anycaller')).claim(app)).wait();assert.equal((await h.token.balanceOf(h.user.wallet))-balance,100000000n);
  await assert.rejects(h.vault.claim.staticCall(app));assert.equal((await h.read()).business.application.target.acceptanceSequence,'1');completed=true;throw Error(STOP);
 }});
 await assert.rejects(f.run(),new RegExp(STOP));assert.equal(completed,true);
});

test('S3 corrected target keeps recipient/order/cap, rejects old signature, publishes once; second valid error terminates before ACCEPT',async t=>{
 const assessments=new Map();let completed=false;
 const f=await normalPaymentFixture(t,{executionVersion:2,wallClock:true,sourceSeconds:240,assessmentPorts:{revalidationAssessment:({assessmentId})=>assessments.get(assessmentId)},onReview:async base=>{
  const h=await driver(base),old=await h.prepare(),before=await h.read(),chainApp=before.business.applicationId;
  const assess=async name=>{await h.read();const v=h.store.getProcedure(h.user,h.app),evidenceId=h.store.getApplication(h.user,h.app).evidence[0].record.evidenceId;
   assessments.set(name,{version:'clear-bootcamp-procedure-assessment.1',execution:'REGISTERED_TEST_CHAIN',assessmentId:name,applicationId:h.app,fromDecisionId:v.procedure.publishedDecisionId,fromDecisionHash:v.decisionHash,kind:'OBJECTIVE_ERROR',basisEvidenceIds:[evidenceId],receiptHash:hash()});
   await h.call('review-revalidations',{assessmentId:name});await h.execute('OBSERVE');};
  await assess('s3-correct-first');
  h.source.change(h.app,'activity-complete',{sourceHash:hash(),sourceReceiptHash:hash()});
  const req=h.store.issueRequest(h.user,h.app,{criterionId:'activity-complete',expectedRevision:h.store.getApplication(h.user,h.app).revision},h.key());
  await h.store.collect(h.user,h.app,{requestId:req.record.target.requestId,expectedRevision:req.record.applicationRevision},h.key());
  await h.read();const registration=h.store.registerCurrentMetForE4(h.user,h.app,h.body(),h.key());
  const intake=h.store.inspectRegistrationForE4(h.user,h.app,registration.record.target.registrationTargetId).record;
  h.connection.bindDecision(h.app,intake.opaqueTarget,{...intake.registration,acceptanceSequence:intake.decisionAcceptanceSequence});
  await h.execute('REPLACE');let o=await h.read(),a=o.business.application;
  assert.equal(a.recipient,before.business.application.recipient);assert.equal(a.target.acceptanceSequence,'1');assert.equal(a.firstStartedAt,before.business.application.firstStartedAt);assert.equal(a.revalidationCount,'1');
  assert.equal(a.target.decisionHash,intake.registration.decisionHash);assert.equal(a.target.revision,String(intake.registration.decisionRevision));
  await assert.rejects(h.vault.connect(h.wallet('relayer')).accept.staticCall(hash(),old.message,old.signature,a.version));
  h.store.publishReview(h.user,h.app,h.body(),h.key());await h.execute('START_REVIEW');
  const fresh=await h.prepare();assert.notEqual(fresh.message.nonce,old.message.nonce);assert.equal(fresh.message.firstReviewStartedAt,old.message.firstReviewStartedAt);
  await assess('s3-correct-second');await h.call('termination-intents');const done=await h.execute('TERMINATE');assert.equal(done.completion.status,'INCLUDED');
  o=await h.read();assert.equal(o.business.application.state,'4');assert.equal(o.business.accounting.R,'0');assert.equal(o.business.accounting.O,'0');
  await assert.rejects(h.vault.connect(h.wallet('relayer')).accept.staticCall(hash(),fresh.message,fresh.signature,o.business.application.version));
  assert.equal((await h.store.execution.reviewChain(h.user,h.app)).status,'INCLUDED');completed=true;throw Error(STOP);
 }});
 await assert.rejects(f.run(),new RegExp(STOP));assert.equal(completed,true);
});

test('S3 already submitted ACCEPT may win after HTTP objection; observation/termination cannot retract accepted right or permit double claim',async t=>{
 let completed=false;
 const f=await normalPaymentFixture(t,{executionVersion:2,wallClock:true,sourceSeconds:240,onReview:async base=>{
  const h=await driver(base),old=await h.prepare(),before=await h.read(),chainApp=before.business.applicationId;
  const evidenceId=h.store.getApplication(h.user,h.app).evidence[0].record.evidenceId;
  const body=h.body({reason:'DECISION_TARGET_ERROR',evidenceId});
  // Broadcast before the API receipt. The API's cached view can still be
  // unaccepted; only chain ordering settles which operation takes effect.
  const pending=await h.vault.connect(h.wallet('relayer')).accept(hash(),old.message,old.signature,before.business.application.version);
  await h.http.request('/bootcamp/v3/applications/'+h.app+'/review-objections',{method:'POST',body});
  await pending.wait();
  await assert.rejects(h.execute('OBSERVE'),/CORRECTION_UNACCEPTED/);
  const o=await h.read();assert.equal(o.business.application.state,'5');assert.equal((await h.store.execution.reviewChain(h.user,h.app)).acceptedRightPreserved,true);
  await assert.rejects(h.vault.connect(h.wallet('terminator')).terminate.staticCall(hash(),chainApp,1,hash(),o.business.application.version));
  h.source.change(h.app,'activity-complete',{rawAvailable:false});await (await h.vault.connect(h.wallet('keyAdmin')).revokeKey(hash(),h.m.signerKeyId)).wait();
  await (await h.vault.connect(h.wallet('anycaller')).claim(chainApp)).wait();assert.equal(await h.token.balanceOf(h.user.wallet),100000000n);
  await assert.rejects(h.vault.claim.staticCall(chainApp));completed=true;throw Error(STOP);
 }});
 await assert.rejects(f.run(),new RegExp(STOP));assert.equal(completed,true);
});

test('active normal worker reflects received objection before leaving the consent wait; HTTP/client read distinguishes inclusion',async t=>{
 const f=await normalPaymentFixture(t,{executionVersion:2,wallClock:true,sourceSeconds:240,onReview:async h=>{
  const evidenceId=h.store.getApplication(h.user,h.app).evidence[0].record.evidenceId;
  const r=await h.http.request('/bootcamp/v3/applications/'+h.app+'/review-objections',{method:'POST',body:h.body({reason:'UNRESOLVED_QUESTION',evidenceId})});
  assert.equal(r.record.target.chainStatus,'NOT_OBSERVED');
 }});
 await assert.rejects(f.run(),/BC_NORMAL_REVIEW_BLOCKED/);
 const status=await f.api.reviewChain(f.app);assert.equal(status.status,'INCLUDED');assert.equal(status.current.unassessedObjection,true);assert.equal(status.canonical,true);assert.equal(status.finalized,false);
 assert.equal(f.metrics().paymentSignatures,0);assert.equal(f.metrics().broadcasts,4);
});
