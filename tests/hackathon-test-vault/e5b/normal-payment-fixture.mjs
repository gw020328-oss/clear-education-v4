// Fresh isolated TEST chain, invented actors/source/model only. Never opens a retained actual run.
import assert from 'node:assert/strict';
import {RuleError} from '../../../src/policy/values.mjs';
import {readFileSync} from 'node:fs';
import {atomicPrivate} from '../../../src/hackathon-test-vault/e5/private-storage.mjs';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {createNormalReceiptReader} from '../../../src/bootcamp/normal-receipt.mjs';
import {readRecipientRegistration} from '../../../src/bootcamp/recipient-registration-ui.mjs';
import {recipientHttp} from '../../bootcamp-store/recipient-http-fixture.mjs';
import {createNormalBootcampClient} from '../../../src/bootcamp/normal-client.mjs';
import {JsonRpcProvider} from 'ethers';
import {createEnvironment,environmentRecord,ownedTestWallet,stopEnvironment,parkEnvironment} from '../../../src/hackathon-test-vault/e5/environment.mjs';
import {ExecutionReader} from '../../../src/hackathon-test-vault/e5/reader.mjs';
import {createApplicationService} from '../../../src/application/service.mjs';
import {createBootcampStore} from '../../../src/bootcamp/store.mjs';
import {openDevelopmentConnection} from '../../../src/bootcamp/execution-development.mjs';
import {syntheticAuthority} from '../../bootcamp-store/fixture.mjs';
import {P0_POLICY} from '../../../specs/bootcamp/p0-contract.mjs';
import {normalSourceTarget,readNormalView} from '../../../tools/bootcamp/normal-current-view.mjs';
import {executeNormalPayment} from '../../../tools/bootcamp/normal-chain.mjs';
import {assertExplicitConsents,waitForExplicitConsents} from '../../../tools/bootcamp/explicit-consents.mjs';

export async function normalPaymentFixture(t,{executionVersion=1,onReview=null,assessmentPorts=null,beforeRegistrationSignature=()=>{},crossing=false,fault=()=>{},wallClock=false,readWhileAsync=false,sourceSeconds=null,onPlanTick=()=>{},afterPlan=()=>{},onStoreTick=()=>{}}={}){
 const e=await createEnvironment({blockPeriodSeconds:wallClock?1:0,executionVersion}),id=e.environmentId,m=e.manifest,{dir}=environmentRecord(id);
 let serviceLive=true;
 let auth,store,connection,metadata,serial=0,ticks=0,crossed=false,floor=Math.floor(Date.now()/1000),extraSeconds=0,reads=0;const readErrors=[];
 const report={startedAt:Math.floor(Date.now()/1000),stages:[],completed:false};
 const state=()=>metadata?.prepare("SELECT state FROM envelopes WHERE json_extract(record,'$.method')='bindConsents'").get()?.state??null;
 // Diagnostic fault tests use a monotonic logical clock advanced by canonical
 // block timestamps and explicit injections, not the CI runner's scheduling.
 const now=()=>{if(wallClock)return Math.floor(Date.now()/1000);
  if(crossing&&!crossed&&report.stage==='BIND_CONSENTS'&&state()==='SEND_STARTED'&&++ticks===3){floor++;crossed=true;}
  return floor;
 };
 let planFrame=null;
 const storeNow=()=>{onStoreTick({store,report});if(planFrame)onPlanTick(++planFrame.ticks,{kind:planFrame.kind,store,source,app,user,op,auth,time:now(),advanceClock:seconds=>{floor+=seconds;}});return now();};
 const provider=new JsonRpcProvider(m.endpoint,undefined,{cacheTimeout:-1,batchMaxCount:1});provider.pollingInterval=50;
 t.after(()=>{if(report.paymentFailure)t.diagnostic(JSON.stringify({paymentFailure:report.paymentFailure,executionDiagnostics:report.executionDiagnostics}));metadata?.close();store?.close();auth?.close();connection?.close();provider.destroy();stopEnvironment(id);parkEnvironment(id);});
 const participant=ownedTestWallet(id,'recipient'),operator=ownedTestWallet(id,'terminator');
 auth=createApplicationService({directory:join(dir,'offline-bind-auth'),origin:'https://offline-bind.example.invalid',chainId:Number(m.chainId),instanceId:m.instanceId,
  participants:[participant.address],operators:[operator.address],now});
 const login=async wallet=>{const c=auth.challenge({wallet:wallet.address,chainId:Number(m.chainId)}),r=auth.login({nonce:c.nonce,signature:await wallet.signMessage(c.message)},c.browserToken);
  return {token:r.token,wallet:r.wallet,chainId:Number(m.chainId),csrf:r.csrf};};
 const user=await login(participant),op=await login(operator),serviceContext=Object.freeze({});
 const native=openDevelopmentConnection({environmentId:id,now,assessmentPorts});
 connection=Object.freeze({...native,async refresh(applicationId){if(!wallClock){const block=await provider.getBlock('latest');floor=Math.max(floor,Number(block.timestamp)+extraSeconds);}return native.refresh(applicationId);}});metadata=new DatabaseSync(join(dir,'envelopes/metadata.sqlite'),{readOnly:true});
 const source=syntheticAuthority({now}),seen=new WeakSet();
 const resolveSource=r=>{const v=source.resolveSource(r);if(!seen.has(v)){v.authExpiresAt=now()+(sourceSeconds??600);v.rawExpiresAt=now()+(sourceSeconds??300);v.queryExpiresAt=now()+(sourceSeconds??600);seen.add(v);}return v;};
 const executionServices={version:'clear-bootcamp-test-execution-port.1',runtimeId:id,runtimePinHash:connection.runtime.runtimeHash,
  authorizeService(c){assert.equal(c,serviceContext);if(!serviceLive)throw Error('BC_E5_SERVICE_AUTHORITY');return {serviceId:'normal-worker',runtimeId:id,expiresAt:report.startedAt+600};},
  reader:{async snapshot(){throw Error('OFFLINE_LEGACY_DISABLED');}},envelope:{async lookup(){throw Error('OFFLINE_LEGACY_DISABLED');}}};
 store=createBootcampStore({directory:join(dir,'offline-bind-store'),authentication:auth,instanceId:'offline-'+id,demoStartedAt:report.startedAt,mode:'SYNTHETIC_FIXTURE',runtimeMappingHash:m.runtimeMappingHash,now:storeNow,fault:point=>fault(point,{report,metadata}),
  producers:source.producers,resolveSource,operatorBindings:[{wallet:operator.address,courseOperatorRef:'course-operator-demo'}],procedurePorts:connection.procedurePorts,executionServices,executionBridge:connection.configuration});
 const receiptReader=createNormalReceiptReader({authorize:(c,a)=>store.getOperationsProjection(c,a),readReport:()=>report,readCanonicalClaim:q=>connection.configuration.reader.claimReceipt(q),runtimeHash:connection.runtime.runtimeHash,runtimeMappingHash:m.runtimeMappingHash,policyHash:m.policyHash,recipient:participant.address.toLowerCase(),token:m.tokenAddress});
 const key=()=> 'offline-bind-'+(++serial),http=executionVersion===2?await recipientHttp(t,{store,context:user,key,normalUi:{getPaymentReceipt:receiptReader,getRecipientRegistration:(context,applicationId)=>readRecipientRegistration({store,connection,context,applicationId,authorize:(c,w)=>auth.authorizeWorkflow(c,w)})}}):null,api=http?createNormalBootcampClient(http):null;
 const app=(http?await http.request('/bootcamp/v1/applications',{method:'POST',body:{}}):store.createApplication(user,{},key())).record.applicationId;
 const setupDb=new DatabaseSync(join(dir,'offline-bind-store/bootcamp.sqlite'),{readOnly:true});
 try{for(const criterion of P0_POLICY.criteria){
  const req=store.issueRequest(user,app,{criterionId:criterion.criterionId,expectedRevision:readNormalView(()=>store.getApplication(user,app)).revision},key());
  const body={requestId:req.record.target.requestId,expectedRevision:req.record.applicationRevision},collectionKey=key();
  const sequence=()=>setupDb.prepare('SELECT sequence FROM r2_meta WHERE id=1').get().sequence,before=sequence();
  try{await store.collect(user,app,body,collectionKey);}catch(error){
   // A STARTED attempt is durable before verify runs. Retry only an initial
   // rolled-back clock boundary: no attempt, producer invocation or accepted write.
   if(Object.getPrototypeOf(error)!==RuleError.prototype||error.message!=='BC_VIEW_STALE'||sequence()!==before
    ||setupDb.prepare('SELECT status FROM requests WHERE id=?').get(body.requestId)?.status!=='PENDING'
    ||setupDb.prepare('SELECT revision FROM applications WHERE id=?').get(app)?.revision!==body.expectedRevision)throw error;
   await store.collect(user,app,body,collectionKey);
  }
 }}finally{setupDb.close();}
 Object.assign(report,{applicationId:app,recipient:participant.address.toLowerCase(),runtimeMappingHash:m.runtimeMappingHash,sourceMode:'SYNTHETIC_TEST_SOURCE',realSourceVerified:false});
 const sourceTarget=normalSourceTarget(readNormalView(()=>store.getApplication(user,app)));
 const directConsent=async context=>{const v=readNormalView(()=>store.getProcedure(context,app)),body={expectedRevision:v.applicationRevision,expectedLedgerSequence:v.ledgerSequence,
  targetDecisionId:v.decisionId,targetDecisionRevision:v.decisionRevision,targetDecisionHash:v.decisionHash,value:'AGREE'};if(http)await http.request('/bootcamp/v3/applications/'+app+'/review-consents',{method:'POST',body,actor:context});else store.recordReviewConsent(context,app,body,key());};
 const reportPath=join(dir,'offline-normal-payment-report.json');
 let activeBridge,activeRuntime;
 const run=async()=>{const timer=readWhileAsync?setInterval(()=>{try{readNormalView(()=>store.getApplication(user,app));if(report.chainApplicationId)readNormalView(()=>store.getProcedure(op,app));reads++;}catch(e){readErrors.push(e);}},250):null;
 const paymentStore=Object.freeze({...store,execution:Object.freeze({...store.execution,connectBridge(...args){return activeBridge=store.execution.connectBridge(...args);},acquireRuntime(...args){return activeRuntime=store.execution.acquireRuntime(...args);},plan(...args){planFrame={kind:args[2].kind,ticks:0};try{const value=store.execution.plan(...args);afterPlan(value,{store,source,app,user,op,auth});return value;}finally{planFrame=null;}}})});
 try{return await executeNormalPayment({store:paymentStore,connection,serviceContext,user,op,app,recipient:participant.address.toLowerCase(),provider,key,report,sourceTarget,write:()=>atomicPrivate(reportPath,report),stage:name=>{report.stage=name;atomicPrivate(reportPath,report);},
  waitForRecipientRegistration:api?async()=>{const packet=await api.recipientRegistration(app);report.registrationRequest={status:packet.status,chainStatus:packet.chainStatus};await beforeRegistrationSignature({store,source,app,user,op,auth,packet});const signature=await participant.signTypedData(packet.payload.domain,packet.payload.types,packet.payload.message);const result=await api.submitRecipientRegistration(app,packet,signature,{idempotencyKey:key()});report.registrationAccepted=result.record.target.signatureAccepted;assert.equal((await api.recipientRegistration(app)).status,'SIGNED');}:undefined,
  waitForConsents:async options=>{if(onReview)await onReview({store,connection,bridge:activeBridge,runtimeHandle:activeRuntime,serviceContext,user,op,app,key,http,provider,participant,source,now,body:(extra={})=>{const v=store.getProcedure(user,app);return {expectedRevision:v.applicationRevision,expectedLedgerSequence:v.ledgerSequence,targetDecisionId:v.decisionId,targetDecisionRevision:v.decisionRevision,targetDecisionHash:v.decisionHash,...extra};}});let polls=0;await waitForExplicitConsents({...options,pollMs:1,read:async()=>{const v=await options.read();if(++polls===2){await directConsent(user);await directConsent(op);}return v;}});assertExplicitConsents(await options.read(),options.target);}});
 }finally{clearInterval(timer);}};
 return {run,report,reportPath,api,http,op,connection,revokeService:()=>{serviceLive=false;},withdrawSource:()=>source.change(app,'activity-complete',{rawAvailable:false}),concurrentReads:()=>reads,readErrors,advance:seconds=>{extraSeconds+=seconds;floor+=seconds;},readReport:()=>JSON.parse(readFileSync(reportPath)),metadata,store,user,app,get crossed(){return crossed;},nativeState:state,environmentId:id,runtimeHash:connection.runtime.runtimeHash,diagnostics:()=>connection.diagnostics(),metrics:()=>connection.metrics()};
}
