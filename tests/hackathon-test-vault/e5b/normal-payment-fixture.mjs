// Fresh isolated TEST chain, invented actors/source/model only. Never opens a retained actual run.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {atomicPrivate} from '../../../src/hackathon-test-vault/e5/private-storage.mjs';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
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

export async function normalPaymentFixture(t,{crossing=false,fault=()=>{},wallClock=false,readWhileAsync=false}={}){
 const e=await createEnvironment(),id=e.environmentId,m=e.manifest,{dir}=environmentRecord(id);
 let auth,store,connection,metadata,serial=0,ticks=0,crossed=false,floor=Math.floor(Date.now()/1000),extraSeconds=0,reads=0;const readErrors=[];
 const report={startedAt:Math.floor(Date.now()/1000),stages:[],completed:false};
 const state=()=>metadata?.prepare("SELECT state FROM envelopes WHERE json_extract(record,'$.method')='bindConsents'").get()?.state??null;
 // Diagnostic fault tests use a monotonic logical clock advanced by canonical
 // block timestamps and explicit injections, not the CI runner's scheduling.
 const now=()=>{if(wallClock)return Math.floor(Date.now()/1000);
  if(crossing&&!crossed&&report.stage==='BIND_CONSENTS'&&state()==='SEND_STARTED'&&++ticks===3){floor++;crossed=true;}
  return floor;
 };
 const provider=new JsonRpcProvider(m.endpoint,undefined,{cacheTimeout:-1,batchMaxCount:1});provider.pollingInterval=50;
 t.after(()=>{if(report.paymentFailure)t.diagnostic(JSON.stringify({paymentFailure:report.paymentFailure,executionDiagnostics:report.executionDiagnostics}));metadata?.close();store?.close();auth?.close();connection?.close();provider.destroy();stopEnvironment(id);parkEnvironment(id);});
 const participant=ownedTestWallet(id,'recipient'),operator=ownedTestWallet(id,'terminator');
 auth=createApplicationService({directory:join(dir,'offline-bind-auth'),origin:'https://offline-bind.example.invalid',chainId:Number(m.chainId),instanceId:m.instanceId,
  participants:[participant.address],operators:[operator.address],now});
 const login=async wallet=>{const c=auth.challenge({wallet:wallet.address,chainId:Number(m.chainId)}),r=auth.login({nonce:c.nonce,signature:await wallet.signMessage(c.message)},c.browserToken);
  return {token:r.token,wallet:r.wallet,chainId:Number(m.chainId),csrf:r.csrf};};
 const user=await login(participant),op=await login(operator),serviceContext=Object.freeze({});
 const native=openDevelopmentConnection({environmentId:id,now});
 connection=Object.freeze({...native,async refresh(applicationId){if(!wallClock){const block=await provider.getBlock('latest');floor=Math.max(floor,Number(block.timestamp)+extraSeconds);}return native.refresh(applicationId);}});metadata=new DatabaseSync(join(dir,'envelopes/metadata.sqlite'),{readOnly:true});
 const source=syntheticAuthority({now}),seen=new WeakSet();
 const resolveSource=r=>{const v=source.resolveSource(r);if(!seen.has(v)){v.authExpiresAt=now()+600;v.rawExpiresAt=now()+300;v.queryExpiresAt=now()+600;seen.add(v);}return v;};
 const executionServices={version:'clear-bootcamp-test-execution-port.1',runtimeId:id,runtimePinHash:connection.runtime.runtimeHash,
  authorizeService(c){assert.equal(c,serviceContext);return {serviceId:'normal-worker',runtimeId:id,expiresAt:report.startedAt+600};},
  reader:{async snapshot(){throw Error('OFFLINE_LEGACY_DISABLED');}},envelope:{async lookup(){throw Error('OFFLINE_LEGACY_DISABLED');}}};
 store=createBootcampStore({directory:join(dir,'offline-bind-store'),authentication:auth,instanceId:'offline-'+id,demoStartedAt:report.startedAt,mode:'SYNTHETIC_FIXTURE',runtimeMappingHash:m.runtimeMappingHash,now,fault:point=>fault(point,{report,metadata}),
  producers:source.producers,resolveSource,operatorBindings:[{wallet:operator.address,courseOperatorRef:'course-operator-demo'}],procedurePorts:connection.procedurePorts,executionServices,executionBridge:connection.configuration});
 const key=()=> 'offline-bind-'+(++serial),app=store.createApplication(user,{},key()).record.applicationId;
 for(const criterion of P0_POLICY.criteria){const req=store.issueRequest(user,app,{criterionId:criterion.criterionId,expectedRevision:store.getApplication(user,app).revision},key());await store.collect(user,app,{requestId:req.record.target.requestId,expectedRevision:req.record.applicationRevision},key());}
 const sourceTarget=normalSourceTarget(store.getApplication(user,app));
 const directConsent=context=>{const v=store.getProcedure(context,app);store.recordReviewConsent(context,app,{expectedRevision:v.applicationRevision,expectedLedgerSequence:v.ledgerSequence,
  targetDecisionId:v.decisionId,targetDecisionRevision:v.decisionRevision,targetDecisionHash:v.decisionHash,value:'AGREE'},key());};
 const reportPath=join(dir,'offline-normal-payment-report.json');
 const run=async()=>{const timer=readWhileAsync?setInterval(()=>{try{readNormalView(()=>store.getApplication(user,app));readNormalView(()=>store.getProcedure(op,app));reads++;}catch(e){readErrors.push(e);}},250):null;
 try{return await executeNormalPayment({store,connection,serviceContext,user,op,app,recipient:participant.address.toLowerCase(),provider,key,report,sourceTarget,write:()=>atomicPrivate(reportPath,report),stage:name=>{report.stage=name;atomicPrivate(reportPath,report);},
  waitForConsents:async options=>{let polls=0;await waitForExplicitConsents({...options,pollMs:1,read:async()=>{const v=await options.read();if(++polls===2){directConsent(user);directConsent(op);}return v;}});assertExplicitConsents(await options.read(),options.target);}});
 }finally{clearInterval(timer);}};
 return {run,report,reportPath,connection,concurrentReads:()=>reads,readErrors,advance:seconds=>{extraSeconds+=seconds;floor+=seconds;},readReport:()=>JSON.parse(readFileSync(reportPath)),metadata,store,user,app,get crossed(){return crossed;},nativeState:state,environmentId:id,runtimeHash:connection.runtime.runtimeHash,diagnostics:()=>connection.diagnostics(),metrics:()=>connection.metrics()};
}
