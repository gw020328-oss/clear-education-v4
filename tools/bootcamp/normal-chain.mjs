// One isolated TEST application. Synthetic evidence is explicit and never a
// claim that Moodle, Reclaim or a paid model was verified in this run.
import {randomBytes} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Contract,JsonRpcProvider} from 'ethers';
import {createEnvironment,environmentRecord,ownedTestWallet,stopEnvironment,parkEnvironment} from '../../src/hackathon-test-vault/e5/environment.mjs';
import {ExecutionReader} from '../../src/hackathon-test-vault/e5/reader.mjs';
import {waitSetupReceipt} from '../../src/hackathon-test-vault/e5/setup-receipt.mjs';
import {atomicPrivate} from '../../src/hackathon-test-vault/e5/private-storage.mjs';
import {createApplicationService} from '../../src/application/service.mjs';
import {createBootcampStore} from '../../src/bootcamp/store.mjs';
import {openDevelopmentConnection} from '../../src/bootcamp/execution-development.mjs';
import {syntheticAuthority} from '../../tests/bootcamp-store/fixture.mjs';
import {waitForNormalReviewConsents} from './explicit-consents.mjs';
import {requireNormalSourceWindow,REVIEW_WINDOW} from './normal-review-window.mjs';
import {registerNormalSourceTarget,normalProcedureBody,readNormalView} from './normal-current-view.mjs';
import {waitForNormalChainTime} from './normal-chain-time.mjs';
import {executionErrorSummary} from '../../src/bootcamp/execution-diagnostics.mjs';
import {P0_POLICY} from '../../specs/bootcamp/p0-contract.mjs';
const hash=()=> '0x'+randomBytes(32).toString('hex');
const now=()=>Math.floor(Date.now()/1000);
const ensure=(condition,code)=>{if(!condition)throw Error(code);};
export async function executeNormalPayment({store,connection,serviceContext,user,op,app,recipient,provider,key,report,write,stage,waitForConsents,waitForRecipientRegistration,signal,sourceTarget,requireReviewReaders}){
 const started=performance.now();let step='VALIDATE',operation='SETUP';
 try{
 const automatic=connection.configuration.sourceMode==='SYNTHETIC_TEST_SOURCE'&&waitForConsents===undefined;
 ensure(automatic||typeof waitForConsents==='function','BC_NORMAL_EXPLICIT_CONSENTS_REQUIRED');
 ensure(connection.configuration.sourceMode!=='REGISTERED_TEST_SOURCE'||sourceTarget,'BC_NORMAL_SOURCE_TARGET_REQUIRED');
 const m=connection.runtime.manifest,id=m.environmentId,reader=new ExecutionReader(m),bridge=store.execution.connectBridge(serviceContext);
  ensure(user.wallet.toLowerCase()===recipient.toLowerCase(),'BC_NORMAL_RECIPIENT');
  const reviewWindow=()=>{if(!automatic){requireReviewReaders?.();requireNormalSourceWindow({store,context:user,applicationId:app,sourceTarget:target});}};
  step='REGISTER_SOURCE_TARGET';const {target,intake}=await registerNormalSourceTarget({store,connection,user,app,key,sourceTarget});
  if(m.version==='clear-e5-test-runtime.2'){
   ensure(typeof waitForRecipientRegistration==='function','BC_NORMAL_RECIPIENT_SIGNATURE_REQUIRED');
   step='WAIT_RECIPIENT_SIGNATURE';stage('AWAITING_RECIPIENT_REGISTRATION_SIGNATURE');
   await waitForRecipientRegistration({applicationId:app,registrationTargetId:intake.record.id,signal});
   ensure(readNormalView(()=>store.getRecipientRegistration(user,app)).status==='SIGNED','BC_NORMAL_RECIPIENT_SIGNATURE_REQUIRED');
  }
  reviewWindow();
  const body=(context=user,extra={})=>normalProcedureBody(store,context,app,target,extra);
  const chainApp=intake.record.opaqueTarget.applicationId;report.chainApplicationId=chainApp;
  const token=new Contract(m.tokenAddress,reader.token,ownedTestWallet(id,'depositor').connect(provider));
  const vault=new Contract(m.vaultAddress,reader.vault,ownedTestWallet(id,'depositor').connect(provider));
  for(const tx of [()=>token.approve(m.vaultAddress,100000000n),()=>vault.fund(hash(),100000000n)]){reviewWindow();step='FUND_SEND';const sent=await tx();step='FUND_RECEIPT';await waitSetupReceipt(provider,sent.hash);}
  stage(connection.configuration.sourceMode==='SYNTHETIC_TEST_SOURCE'?'SYNTHETIC_CURRENT_MET_AND_RESERVE':'REGISTERED_CURRENT_MET_AND_RESERVE');
  step='RUNTIME_FENCE';await store.execution.observeRuntimeFence(serviceContext);
  step='ACQUIRE_RUNTIME';const g=store.execution.acquireRuntime(serviceContext,{owner:'normal-worker',expectedFence:0,generation:1,leaseSeconds:60});
  async function execute(kind,preparationId=null){
   operation=kind;step='REVIEW_WINDOW';if(['REGISTER','ALLOCATE','START_REVIEW'].includes(kind))reviewWindow();
   stage(kind);step='HEARTBEAT';store.execution.heartbeatRuntime(serviceContext,g,60);
   step='REFRESH';const observation=await connection.refresh(app);
   step='PLAN';const plan=['OBSERVE','REPLACE','TERMINATE'].includes(kind)?await store.execution.planCorrection(user,app,{kind,operationId:hash()}):store.execution.plan(user,app,{kind,operationId:hash(),expectedChainVersion:observation.business.application.version,preparationId});
   step='ENQUEUE';const i=store.execution.enqueue(user,app,plan.body,key()).receipt.intentId;
   step='ACQUIRE_INTENT';const h=store.execution.acquire(serviceContext,i,{owner:'normal-worker',generation:1,leaseSeconds:60});step='BIND_RUNTIME';store.execution.bindRuntimeIntent(serviceContext,g,h);
   const expected=bridge.inspect(g,h);
   if(m.blockPeriodSeconds===1&&['startReview','prepareUnsigned'].includes(plan.command.method)){
    step='WAIT_CHAIN_TIME';const v=readNormalView(()=>store.getProcedure(user,app)),message=plan.command.method==='prepareUnsigned'?plan.command.args[1]:null;
    const requiredAt=message?Number(message.issuedAt):Number(plan.command.args[3]);
    const businessUntil=Math.min(v.evidence.validUntilExclusive,v.procedure.reviewCapAt,message?Number(message.expiresAt):Infinity);
    const readiness=await waitForNormalChainTime({requiredAt,businessUntil,authorityUntil:expected.authorityExpiresAt,readBlock:()=>provider.getBlock('latest'),signal});
    (report.clockReadiness??=[]).push({kind,...readiness});write();
   }
   step='PREPARE_CAPABILITY';const request=await bridge.prepare(g,h,expected);step='SEAL';await bridge.seal(g,h,request.binding);step='LOOKUP';const found=await bridge.lookup(g,h,request.binding);step='ADOPT';await bridge.adopt(g,h,request.binding);
   step='DISPATCH';await bridge.dispatch(g,h,request.binding);step='RECEIPT_WAIT';await waitSetupReceipt(provider,found.envelope.txHash);
   step='RECOVER';const completed=await bridge.recover(g,h,request.binding);ensure(completed.completion?.status==='INCLUDED','BC_NORMAL_RECEIPT_PENDING');report.executionDiagnostics=connection.diagnostics().slice(0,16);report.stages.push({kind,txHash:completed.completion.txHash,checkpoint:completed.completion.checkpoint});write();return completed;
  }
  let lastReviewChange=null;
  async function synchronizeReview(){
   const v=readNormalView(()=>store.getProcedure(user,app));
   if(v.chain.status!=='UNACCEPTED')return;
   if(!v.objection.records.length&&!v.procedure.revalidationCount&&!v.procedure.terminationReason&&v.decisionId===v.procedure.publishedDecisionId)return;
   const change=JSON.stringify({decision:v.decisionId,objections:v.objection.records,revalidation:v.procedure.revalidationCount,termination:v.procedure.terminationReason});
   if(change===lastReviewChange)return;
   await execute('OBSERVE');lastReviewChange=change;await connection.refresh(app);
  }
  await execute('REGISTER');await execute('ALLOCATE');
  const allocated=await connection.refresh(app),publishedNotBefore=Math.max(Number(allocated.business.application.allocatedAt),Number(allocated.business.application.targetRecordedAt));
  ensure(publishedNotBefore-now()<=30,'BC_NORMAL_CHAIN_CLOCK_AHEAD');
  if(now()<publishedNotBefore)await new Promise(resolve=>setTimeout(resolve,publishedNotBefore*1000-Date.now()+20));
  step='PUBLISH_REVIEW';await connection.refresh(app);store.publishReview(user,app,body(),key());
  await execute('START_REVIEW');await connection.refresh(app);
  if(automatic){
   store.recordReviewConsent(user,app,body(user,{value:'AGREE'}),key());store.recordReviewConsent(op,app,body(op,{value:'AGREE'}),key());
   report.consentOrigin='SYNTHETIC_AUTOMATIC_TEST_ROLES';
  }else{
   step='WAIT_CONSENTS';await waitForNormalReviewConsents({store,connection,context:user,applicationId:app,sourceTarget,waitForConsents,
    minimumWindowSeconds:REVIEW_WINDOW.openingSeconds,synchronizeReview,
    heartbeat:()=>store.execution.heartbeatRuntime(serviceContext,g,60),signal,
    onTarget:(target,window)=>{report.reviewTarget=target;report.reviewWindowAtOpen=window;stage('AWAITING_AUTHENTICATED_APP_CONSENTS');}});
   report.consentOrigin='AUTHENTICATED_APP_CONSENT_RECORDS';
  }

  await synchronizeReview();
  await execute('BIND_CONSENTS');step='PREPARE_AUTHORIZATION';await connection.refresh(app);const preparation=store.prepareReviewAuthorization(user,app,body(),key()).record.target.preparationId;
  await execute('PREPARE',preparation);const accepted=await execute('ACCEPT',preparation);ensure(accepted.claimJob,'BC_NORMAL_CLAIM_JOB_REQUIRED');
  operation='CLAIM';stage('SEPARATE_CLAIM');step='BALANCE_BEFORE';const before=await token.balanceOf(recipient);step='CLAIM_SEND';const claim=await vault.connect(ownedTestWallet(id,'anycaller').connect(provider)).claim(chainApp);step='CLAIM_RECEIPT_WAIT';await waitSetupReceipt(provider,claim.hash);
  step='CLAIM_CANONICAL';const settlement=await bridge.directClaimReceipt(g,accepted.claimJob.jobId,claim.hash);ensure(settlement.status==='SETTLED','BC_NORMAL_CLAIM_PENDING');
  step='BALANCE_AFTER';const after=await token.balanceOf(recipient);ensure(after-before===100000000n,'BC_NORMAL_BALANCE');
  step='DUPLICATE_CHECK';let duplicateRejected=false;try{await vault.claim.staticCall(chainApp);}catch{duplicateRejected=true;}ensure(duplicateRejected,'BC_NORMAL_DUPLICATE');
  report.claim={txHash:claim.hash,checkpoint:settlement.receipt.checkpoint,amountAtoms:String(after-before),duplicateRejected};report.completed=true;stage(connection.configuration.sourceMode==='SYNTHETIC_TEST_SOURCE'?'SYNTHETIC_SOURCE_CHAIN_COMPLETE':'REGISTERED_SOURCE_CHAIN_COMPLETE');
  return report;
 }catch(error){
  try{report.executionDiagnostics=connection.diagnostics().slice(0,16);report.paymentFailure??={operation,step,...executionErrorSummary(error),atUnixMs:Date.now(),offsetMs:Math.max(0,performance.now()-started),metrics:connection.metrics(),native:connection.failureState?.()??null};write();}catch{}
  throw error;
 }
}
export async function runSyntheticNormalChain(){
 const created=await createEnvironment({blockPeriodSeconds:1}),id=created.environmentId,m=created.manifest,{dir}=environmentRecord(id);
 let auth,store,connection,provider;const report={version:'clear-bootcamp-normal-chain.1',environmentId:id,sourceMode:'SYNTHETIC_TEST_SOURCE',realSourceVerified:false,production:false,stages:[],completed:false};
 const write=()=>atomicPrivate(join(dir,'api-normal-report.json'),report);
 const stage=name=>{report.stage=name;write();process.stdout.write(JSON.stringify({stage:name})+'\n');};
 try{
  stage('NEW_OWNED_CHAIN');
  provider=new JsonRpcProvider(m.endpoint,undefined,{cacheTimeout:-1,batchMaxCount:1});provider.pollingInterval=50;
  const participant=ownedTestWallet(id,'recipient'),operator=ownedTestWallet(id,'terminator');
  auth=createApplicationService({directory:join(dir,'api-auth'),origin:'https://clear-normal.example.invalid',chainId:Number(m.chainId),instanceId:m.instanceId,participants:[participant.address],operators:[operator.address],now});
  const login=async wallet=>{const q=auth.challenge({wallet:wallet.address,chainId:Number(m.chainId)}),r=auth.login({nonce:q.nonce,signature:await wallet.signMessage(q.message)},q.browserToken);return {token:r.token,wallet:r.wallet,chainId:Number(m.chainId),csrf:r.csrf};};
  const user=await login(participant),op=await login(operator),serviceContext=Object.freeze({});
  connection=openDevelopmentConnection({environmentId:id,now});
  const synthetic=syntheticAuthority({now}),initialized=new WeakSet();
  const resolveSource=r=>{const g=synthetic.resolveSource(r);if(!initialized.has(g)){g.authExpiresAt=now()+600;g.rawExpiresAt=now()+300;g.queryExpiresAt=now()+600;initialized.add(g);}return g;};
  const executionServices={version:'clear-bootcamp-test-execution-port.1',runtimeId:id,runtimePinHash:connection.runtime.runtimeHash,
   authorizeService(c){ensure(c===serviceContext,'BC_E5_SERVICE_AUTHORITY');return {serviceId:'normal-worker',runtimeId:id,expiresAt:report.startedAt+600};},
   reader:{async snapshot(){throw Error('BC_NORMAL_LEGACY_READER_DISABLED');}},envelope:{async lookup(){throw Error('BC_NORMAL_LEGACY_ENVELOPE_DISABLED');}}};
  report.startedAt=now();
  store=createBootcampStore({directory:join(dir,'api-store'),authentication:auth,instanceId:'normal-'+id,demoStartedAt:report.startedAt,mode:'SYNTHETIC_FIXTURE',now,producers:synthetic.producers,resolveSource,
   operatorBindings:[{wallet:operator.address,courseOperatorRef:'course-operator-demo'}],procedurePorts:connection.procedurePorts,executionServices,executionBridge:connection.configuration});
  let serial=0;const key=()=> 'normal-'+(++serial);
  const app=store.createApplication(user,{},key()).record.applicationId;report.applicationId=app;report.recipient=participant.address.toLowerCase();
  stage('AUTHENTICATED_TEST_APPLICATION');
  for(const criterion of P0_POLICY.criteria){const request=store.issueRequest(user,app,{criterionId:criterion.criterionId,expectedRevision:store.getApplication(user,app).revision},key());await store.collect(user,app,{requestId:request.record.target.requestId,expectedRevision:request.record.applicationRevision},key());}
  return await executeNormalPayment({store,connection,serviceContext,user,op,app,recipient:participant.address.toLowerCase(),provider,key,report,write,stage});
 }catch(error){report.failure={code:/^(BC|E5|E5B)_[A-Z0-9_]{1,100}$/.test(error?.message)?error.message:'BC_NORMAL_FAILURE',diagnostics:connection?.diagnostics()??[]};write();throw Error(report.failure.code);}
 finally{store?.close();auth?.close();connection?.close();provider?.destroy();stopEnvironment(id);parkEnvironment(id);}
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
 ensure(process.argv[2]==='--synthetic-source','BC_NORMAL_EXPLICIT_SYNTHETIC_SOURCE_REQUIRED');
 runSyntheticNormalChain().then(r=>process.stdout.write(JSON.stringify(r)+'\n'),e=>{process.stderr.write(e.message+'\n');process.exitCode=1;});
}
