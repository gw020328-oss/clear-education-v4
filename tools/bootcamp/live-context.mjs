// Constructor-only owner context. Opening is deferred until all source ports are ready.
import {mkdirSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {JsonRpcProvider} from 'ethers';
import {readPrivate,atomicPrivate,privateDirectory} from '../../src/hackathon-test-vault/e5/private-storage.mjs';
import {loadRuntime,startEnvironment,stopEnvironment,parkEnvironment} from '../../src/hackathon-test-vault/e5/environment.mjs';
import {ExecutionReader} from '../../src/hackathon-test-vault/e5/reader.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
import {createApplicationService} from '../../src/application/service.mjs';
import {createBootcampStore} from '../../src/bootcamp/store.mjs';
import {openDevelopmentConnection} from '../../src/bootcamp/execution-development.mjs';
import {createLiveMoodleConsumer} from '../../src/bootcamp/moodle-live-consumer.mjs';
import {createLiveReclaimConsumer} from '../../src/bootcamp/reclaim-live-consumer.mjs';
import {createNormalReceiptReader} from '../../src/bootcamp/normal-receipt.mjs';
import {createNormalUiSession} from '../../src/bootcamp/ui-session.mjs';
import {createBootcampFrontendServer} from './frontend-server.mjs';
import {waitForExplicitConsents} from './explicit-consents.mjs';
import {LIVE_WORKER_RECIPE_HASH} from '../../src/bootcamp/reclaim-live-consumer.mjs';
import {executeNormalPayment} from './normal-chain.mjs';
const now=()=>Math.floor(Date.now()/1000);
const ensure=(ok,code)=>{if(!ok)throw Error(code);};
export async function openLiveContext({preparationPath,withReader,hackerRank,reviewReflection,reflectionHost=null}){
 ensure(typeof withReader==='function'&&typeof hackerRank?.pins==='function'&&typeof hackerRank.collectLease==='function'&&typeof reviewReflection==='function','BC_LIVE_PORTS_REQUIRED');
 preparationPath=resolve(preparationPath);const base=privateDirectory(dirname(preparationPath));
 const root=fileURLToPath(new URL('../../private/bootcamp-normal-live/',import.meta.url));ensure(base.startsWith(root)&&preparationPath===join(base,'preparation.json'),'BC_LIVE_OWNER_DIRECTORY');
 const prepared=JSON.parse(readPrivate(preparationPath)),{mapping,runtimeMappingHash}=JSON.parse(readPrivate(join(base,'mapping.json'))),pins=hackerRank.pins();
 ensure(['clear-bootcamp-normal-live-input.1','clear-bootcamp-normal-live-input.2'].includes(prepared.version)&&resolve(prepared.directory)===base&&runtimeMappingHash===prepared.runtimeMappingHash&&runtimeMappingHash===p0Hash('NORMAL-REGISTERED-MAPPING',mapping),'BC_LIVE_MAPPING');
 // The old UNCONFIGURED preparation remains blocked. Reviewed trust needs its own immutable mapping.
 ensure(mapping.hackerRank.trustStatus==='REVIEWED'&&pins?.dataMode==='RECLAIM_SIGNED_RECORD'&&mapping.hackerRank.trustConfigHash===pins.trustConfigHash&&mapping.hackerRank.recipeHash===pins.recipeHash&&mapping.hackerRank.expectedClaimOwner===pins.expectedClaimOwner,'BC_LIVE_HR_TRUST_REQUIRED');
 ensure(prepared.version==='clear-bootcamp-normal-live-input.2'&&prepared.identityMode==='EXTERNAL_UI_WALLETS','BC_LIVE_EXTERNAL_UI_REQUIRED');
 const origin=new URL(prepared.origin);ensure(origin.protocol==='https:'&&origin.hostname==='127.0.0.1'&&origin.origin===prepared.origin&&origin.port,'BC_LIVE_UI_ORIGIN');
 ensure([prepared.participantWallet,prepared.operatorWallet].every(x=>/^0x[0-9a-f]{40}$/.test(x)&&x!=='0x'+'00'.repeat(20))&&prepared.participantWallet!==prepared.operatorWallet
  &&mapping.participantWallet===prepared.participantWallet&&pins.recipeHash===LIVE_WORKER_RECIPE_HASH,'BC_LIVE_IDENTITY');
 const participant={address:prepared.participantWallet},operator={address:prepared.operatorWallet};
 const m=loadRuntime(prepared.environmentId);ensure(m.runtimeMappingHash===runtimeMappingHash&&m.policyHash===mapping.policyHash,'BC_LIVE_CHAIN_MAPPING');
 const runId='run-'+randomUUID(),directory=join(base,runId);mkdirSync(directory,{mode:0o700});const startedAt=now(),instanceId='normal-'+runId;
 let auth,store,connection,provider,ui,mounted,user,app,participantId,collectionStarted=false,pendingReflection=null,resumed=false,collecting=false,paymentStarted=false,closed=false,started=false,serial=0;const key=()=> 'normal-'+(++serial);
 const sourceWindows=new Map(),controller=new AbortController();
 const report={version:'clear-bootcamp-normal-live-run.1',runId,environmentId:prepared.environmentId,runtimeMappingHash,sourceMode:'REGISTERED_TEST_SOURCE',realSourceVerified:false,startedAt,stages:[],completed:false,production:false};
 const write=()=>atomicPrivate(join(directory,'report.json'),report);
 const stage=name=>{report.stage=name;write();};
 const close=()=>{if(closed)return;closed=true;controller.abort();mounted?.server.closeAllConnections();mounted?.server.close();ui?.close();store?.close();auth?.close();connection?.close();provider?.destroy();if(started){stopEnvironment(prepared.environmentId);parkEnvironment(prepared.environmentId);}};
 try{
  await startEnvironment(prepared.environmentId);started=true;
  const reader=new ExecutionReader(m);ensure((await reader.call('applicationIds',[],await reader.block()))[0].length===0,'BC_LIVE_REQUIRES_UNUSED_TEST_REALM');
  provider=new JsonRpcProvider(m.endpoint,undefined,{cacheTimeout:-1,batchMaxCount:1});provider.pollingInterval=50;
  auth=createApplicationService({directory:join(directory,'authentication'),origin:prepared.origin,chainId:Number(m.chainId),instanceId:m.instanceId,participants:[participant.address],operators:[operator.address],now});
  const serviceContext=Object.freeze({});
  const resolveLease=r=>{try{ui.participant();const actor=auth.authorizeWorkflow(user,true);ensure(!closed&&actor.wallet===prepared.participantWallet&&actor.role==='participant'&&r.applicationId===app&&r.participantId===participantId&&r.participantWallet===prepared.participantWallet&&r.runtimeMappingHash===runtimeMappingHash,'BC_LIVE_CONTEXT');return {available:sourceWindows.has(r.criterionId)&&now()<sourceWindows.get(r.criterionId),authExpiresAt:Math.min(startedAt+3600,sourceWindows.get(r.criterionId)??0),rawExpiresAt:sourceWindows.get(r.criterionId)??0,queryExpiresAt:sourceWindows.get(r.criterionId)??0};}catch{return null;}};
  const resolvePin=r=>{if(r.applicationId!==app||r.participantId!==participantId||r.runtimeMappingHash!==runtimeMappingHash)return null;const c=r.criterionId;
   const t=c==='activity-complete'?{...mapping.targets.activity,module:'page',selectedPostId:null}:c==='assignment-submitted'?{...mapping.targets.assignment,module:'assign',selectedPostId:null}:{cmId:mapping.targets.reflection.cmId,instanceId:mapping.targets.reflection.forumId,module:'forum',selectedPostId:mapping.targets.reflection.selectedPostId};
   return {environmentRef:mapping.environmentRef,runRef:mapping.runRef,sourceVersion:mapping.sourceVersion,apiVersion:mapping.apiVersion,fixtureReportHash:mapping.fixtureReportHash,courseId:mapping.courseId,participantMapping:{participantId,applicationId:app,moodleUserId:mapping.moodleUserId,accountBindingRef:mapping.accountBindingRef,revision:mapping.revision},target:{targetLogicalId:c==='activity-complete'?'python-intro-activity':c==='assignment-submitted'?'python-practice-task':'python-reflection',...t},completionSetupReceiptHash:c==='activity-complete'?mapping.completionSetupReceiptHash:null};};
  const producers=Object.fromEntries(['activity-complete','assignment-submitted','reflection-topics'].map(criterionId=>[criterionId,createLiveMoodleConsumer({criterionId,withReader,resolvePin,resolveLease,reviewReflection,modelVersion:'gemini-3.5-flash-lite',reflectionHost,now})]));
  producers['python-basic-certificate']=createLiveReclaimConsumer({pins:hackerRank.pins,collectLease:(request,options)=>hackerRank.collectLease(request,{...options,signRequest:message=>ui.requestSignature(request,message,{signal:options.signal})}),resolveLease,now});
  const services={version:'clear-bootcamp-test-execution-port.1',runtimeId:m.environmentId,runtimePinHash:prepared.runtimeHash,authorizeService(c){ensure(c===serviceContext&&!closed&&now()<startedAt+1800,'BC_LIVE_SERVICE');return {serviceId:'normal-worker',runtimeId:m.environmentId,expiresAt:startedAt+1800};},reader:{async snapshot(){throw Error('BC_NORMAL_LEGACY_READER_DISABLED');}},envelope:{async lookup(){throw Error('BC_NORMAL_LEGACY_ENVELOPE_DISABLED');}}};
  connection=openDevelopmentConnection({environmentId:m.environmentId,sourceMode:'REGISTERED_TEST_SOURCE'});
  store=createBootcampStore({directory:join(directory,'store'),authentication:auth,instanceId,demoStartedAt:startedAt,mode:'ISOLATED_LIVE_TEST',runtimeMappingHash,producers,resolveSource:r=>producers[r.criterionId]?.resolveSource(r),now,operatorBindings:[{wallet:operator.address,courseOperatorRef:'course-operator-demo'}],procedurePorts:connection.procedurePorts,executionServices:services,executionBridge:connection.configuration});
  ui=createNormalUiSession({authentication:auth,participantWallet:prepared.participantWallet,operatorWallet:prepared.operatorWallet,getApplication:(c,a)=>store.getApplication(c,a),now});
  const bindParticipant=(context,applicationId)=>{
   ensure(!closed&&!app,'BC_LIVE_SINGLE_APPLICATION');ui.bindParticipant(context,applicationId,pins);user=ui.participant();app=applicationId;participantId=store.getApplication(user,app).participantId;
   Object.assign(report,{applicationId:app,participantId,recipient:prepared.participantWallet,sourceStatus:'NOT_COLLECTED',allocationAtoms:'0'});stage('AUTHENTICATED_EXTERNAL_UI_APPLICATION');
   atomicPrivate(join(directory,'context.json'),{runId,environmentId:m.environmentId,applicationId:app,participantId,participantWallet:prepared.participantWallet,policyHash:m.policyHash,runtimeMappingHash,startedAt,sourceStatus:'NOT_COLLECTED',allocationAtoms:'0'},{exclusive:true});
   return {applicationId:app,status:'AUTHENTICATED_SOURCE_SESSION_BOUND',paymentAuthorization:false};
  };
  const paymentReceipt=createNormalReceiptReader({authorize:(c,a)=>store.getOperationsProjection(c,a),readReport:()=>report,
   readCanonicalClaim:q=>connection.configuration.reader.claimReceipt(q),runtimeHash:connection.runtime.runtimeHash,runtimeMappingHash,policyHash:m.policyHash,recipient:prepared.participantWallet,token:m.tokenAddress});
  const normalUi=Object.freeze({getPaymentReceipt:paymentReceipt,bindParticipant,pendingSignature(c,a){ensure(a===app,'BC_LIVE_CONTEXT');return ui.pendingSignature(c);},submitSignature(c,a,b){ensure(a===app,'BC_LIVE_CONTEXT');return ui.submitSignature(c,b);}});
  stage('AWAITING_EXTERNAL_UI_AUTHENTICATION');
  return Object.freeze({metadataPath:join(directory,'context.json'),
   createFrontend({tls,webRoot}){ensure(!closed&&!mounted,'BC_LIVE_FRONTEND_ONCE');mounted=createBootcampFrontendServer({authentication:auth,store,tls,sourceMode:'REGISTERED_TEST_SOURCE',chainId:Number(m.chainId),webRoot,normalUi});return mounted;},
   async collectSources({prepareReflection=false}={}){
    ui.participant();ensure(!closed&&!collecting&&(!collectionStarted||pendingReflection&&!resumed&&!prepareReflection),'BC_LIVE_SINGLE_COLLECTION');
    if(prepareReflection)ensure(typeof reflectionHost?.codeState==='function'&&typeof reflectionHost?.day==='function','BC_LIVE_AI_PREPARATION_HOST');
    collecting=true;const resuming=collectionStarted;collectionStarted=true;
    try{
    // HR identity/collector preparation happens before opening this short window.
    for(const criterionId of (resuming?['reflection-topics']:['python-basic-certificate','activity-complete','assignment-submitted','reflection-topics'])){
     stage('SOURCE_'+criterionId);let request;
     if(resuming){ensure(pendingReflection.preparation.isCurrent(),'BC_LIVE_AI_PREPARATION_STALE');resumed=true;request=pendingReflection.request;}
     else{sourceWindows.set(criterionId,Math.min(now()+(criterionId==='python-basic-certificate'?900:240),startedAt+1800));request=store.issueBridgeRequest(user,app,{criterionId,expectedRevision:store.getApplication(user,app).revision},key());}
     const body={requestId:request.record.target.requestId,expectedRevision:request.record.applicationRevision};
     if(prepareReflection&&criterionId==='reflection-topics'){
      const preparation=await store.prepareBridgeReflection(user,app,body,{signal:controller.signal,timeoutMs:30000});pendingReflection={request,preparation};stage('AWAITING_EXACT_REFLECTION_APPROVAL');return preparation;
     }
     await store.collectBridge(user,app,body,key(),{signal:controller.signal,timeoutMs:criterionId==='python-basic-certificate'?300000:30000});
    }
    const v=store.getApplication(user,app);ensure(v.decision.record.conditionsStatus==='MET'&&v.evidence.length===4&&v.evidence.every(e=>e.current&&e.record.dataMode!=='SYNTHETIC_FIXTURE'),'BC_LIVE_ALL_CURRENT_MET');report.realSourceVerified=true;stage('REGISTERED_SOURCE_ALL_CURRENT_MET');return v;
    }finally{collecting=false;}
   },
   async pay(){ui.participant();ensure(report.realSourceVerified===true&&!paymentStarted&&!report.completed,'BC_LIVE_SOURCE_REQUIRED');paymentStarted=true;return executeNormalPayment({store,connection,serviceContext,user,app,waitForConsents:waitForExplicitConsents,signal:controller.signal,recipient:prepared.participantWallet,provider,key,report,write,stage});},
   report:()=>structuredClone(report),close,
  });
 }catch(error){report.failureCode=/^(BC|E5|E5B)_[A-Z0-9_]+$/.test(error?.message)?error.message:'BC_LIVE_OPEN_FAILED';write();close();throw Error(report.failureCode);}
}
