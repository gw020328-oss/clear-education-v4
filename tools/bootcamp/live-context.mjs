import {waitForNormalRecipientRegistration} from './normal-recipient-wait.mjs';
import {createNormalResumeControl} from './normal-resume-control.mjs';
import {normalFailureState} from './normal-failure-wait.mjs';
import {productSigningContext} from '../embedded-wallet/product-mount.mjs';
// Constructor-only owner context. Opening is deferred until all source ports are ready.
import {observeSource} from '../../src/hackerrank-evidence/diagnostics.mjs';
import {mkdirSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {JsonRpcProvider} from 'ethers';
import {readPrivate,atomicPrivate,privateDirectory,sha} from '../../src/hackathon-test-vault/e5/private-storage.mjs';
import {loadRuntime,startEnvironment,stopEnvironment,parkEnvironment} from '../../src/hackathon-test-vault/e5/environment.mjs';
import {ExecutionReader} from '../../src/hackathon-test-vault/e5/reader.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
import {createApplicationService} from '../../src/application/service.mjs';
import {createBootcampStore} from '../../src/bootcamp/store.mjs';
import {createMoodleCommandScope} from '../../src/bootcamp/moodle-command-scope.mjs';
import {openDevelopmentConnection} from '../../src/bootcamp/execution-development.mjs';
import {createLiveMoodleConsumer} from '../../src/bootcamp/moodle-live-consumer.mjs';
import {requireProfileMode} from '../../src/hackerrank-evidence/self-profile.mjs';
import {createLiveReclaimConsumer} from '../../src/bootcamp/reclaim-live-consumer.mjs';
import {requireRule as requireUiRule,exactKeys,canonical,freeze} from '../../src/policy/values.mjs';
import {openMoodlePaymentSnapshots} from '../../src/bootcamp/moodle-payment-snapshot.mjs';
import {FIXED_MOODLE_MAPPING_VERSION,FIXED_MOODLE_SCOPE_VERSION} from '../../src/bootcamp/moodle-payment-projection.mjs';
import {createNormalMoodleLogin} from './moodle-login-owner.mjs';
import {createMoodleCourseReadHost} from './moodle-course-read-host.mjs';
import {readRecipientRegistration} from '../../src/bootcamp/recipient-registration-ui.mjs';
import {createNormalReceiptReader} from '../../src/bootcamp/normal-receipt.mjs';
import {createNormalUiSession} from '../../src/bootcamp/ui-session.mjs';
import {createBootcampFrontendServer} from './frontend-server.mjs';
import {waitForExplicitConsents} from './explicit-consents.mjs';
import {LIVE_WORKER_RECIPE_HASH} from '../../src/bootcamp/reclaim-live-consumer.mjs';
import {executeNormalPayment} from './normal-chain.mjs';
import {readNormalView,normalSourceTarget} from './normal-current-view.mjs';
import {createNormalSourceSequence} from './normal-source-sequence.mjs';
import {createNormalReviewReaders,requireNormalConsentAction,REVIEW_WINDOW} from './normal-review-window.mjs';
import {waitUntil} from './normal-host-flow.mjs';
const now=()=>Math.floor(Date.now()/1000);
const ensure=(ok,code)=>{if(!ok)throw Error(code);};
// Called from inside the store transaction: authenticate against the separate
// session service, but never re-enter getApplication through ui.participant().
// The calling store owns current application/request checks; UI signing also
// checks the bound participant outside the transaction before publishing.
export function resolveNormalSourceLease(r,{authentication,context,closed,participantWallet,applicationId,participantId,runtimeMappingHash,sourceWindows,startedAt,time}){
 try{const actor=authentication.authorizeWorkflow(context,true);
  ensure(!closed&&actor.wallet.toLowerCase()===participantWallet&&actor.role==='participant'&&r.applicationId===applicationId&&r.participantId===participantId&&r.participantWallet===participantWallet&&r.runtimeMappingHash===runtimeMappingHash,'BC_LIVE_CONTEXT');
  return {available:sourceWindows.has(r.criterionId)&&time<sourceWindows.get(r.criterionId),authExpiresAt:Math.min(startedAt+3600,sourceWindows.get(r.criterionId)??0),rawExpiresAt:sourceWindows.get(r.criterionId)??0,queryExpiresAt:sourceWindows.get(r.criterionId)??0};
 }catch{return null;}
}
// Private constructor boundary, also tested without starting a chain/source.
// It stores only contexts already authenticated in this run's own UI. A Moodle
// server cannot supply/replace a CLEAR context or borrow the other role's login.
export function createNormalMoodleReadBoundary({databasePath,authentication,getDecisionEvidence,resolveOperatorBindings,
 receiptSource,getOwnerState,now,monotonic=()=>performance.now()}){
 ensure([authentication?.authorizeWorkflow,authentication?.whoami,getDecisionEvidence,resolveOperatorBindings,getOwnerState,now].every(f=>typeof f==='function'),'BC_MOODLE_READ_CONFIG');
 const contexts=new Map();let closed=false,snapshots=null,mounted=false;
 const owner=()=>{ensure(!closed,'BC_MOODLE_READ_CLOSED');const state=getOwnerState();ensure(state&&now()<state.expiresAtExclusive,'BC_MOODLE_READ_EXPIRED');return state;};
 const actor=(context,role,state)=>{
  const a=authentication.authorizeWorkflow(context,false),s=authentication.whoami(context),expected=role==='PARTICIPANT'?'participant':'operator';
  ensure(['PARTICIPANT','COURSE_OPERATOR'].includes(role)&&a.role===expected&&s.role===expected&&a.wallet.toLowerCase()===s.wallet.toLowerCase()
   &&a.wallet.toLowerCase()===(role==='PARTICIPANT'?state.participantWallet:state.operatorWallet),'BC_MOODLE_READ_ACTOR');return s;
 };
 return Object.freeze({
  observeSession(context){
   const state=owner(),a=authentication.authorizeWorkflow(context,false),role=a.role==='participant'?'PARTICIPANT':'COURSE_OPERATOR';
   actor(context,role,state);exactKeys(context,['token','wallet','chainId','csrf'],'BC_MOODLE_READ_CONTEXT');
   if(canonical(context)!==canonical(contexts.get(role)??null))contexts.set(role,freeze(structuredClone(context)));
  },
  createHost({ownerRunId,mapping,installationGeneration,actorRefs,verifyMoodleAuthority,readBindingCurrentness,readFixedMapping,createCourseEvidenceReader,readSourceStates}){
   const fixed=mapping?.version===FIXED_MOODLE_MAPPING_VERSION;
   ensure(!mounted&&[verifyMoodleAuthority,fixed?readFixedMapping:readBindingCurrentness,createCourseEvidenceReader].every(f=>typeof f==='function'),'BC_MOODLE_READ_PORTS');
   // Separate contract, not an epoch/binding fallback. Missing legacy authority
   // cannot silently opt into the fixed single-course demonstration profile.
   ensure(!fixed||(installationGeneration===undefined&&readBindingCurrentness===undefined),'BC_MOODLE_READ_FIXED_PORTS');
   const pinned=freeze(structuredClone(mapping)),actors=freeze(structuredClone(actorRefs));
   exactKeys(actors,['PARTICIPANT','COURSE_OPERATOR'],'BC_MOODLE_READ_ACTORS');
   const ref=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(v);
   ensure((fixed||ref(installationGeneration))&&Object.values(actors).every(ref)&&actors.PARTICIPANT===pinned.subjectRef
    &&actors.COURSE_OPERATOR!==pinned.subjectRef,'BC_MOODLE_READ_ACTORS');
   const currentOwner=()=>{const state=owner();ensure(ownerRunId===state.runId&&state.applicationId&&state.participantId,'BC_MOODLE_READ_RUN');
    if(fixed){const current=readFixedMapping();exactKeys(current,['mapping','actorRefs'],'BC_MOODLE_READ_FIXED_MAPPING');
     ensure(canonical(current)===canonical({mapping:pinned,actorRefs:actors}),'BC_MOODLE_READ_FIXED_MAPPING');}
    for(const k of ['applicationId','participantId','courseOperatorRef','policyHash','runtimeMappingHash','participantWallet','operatorWallet','recipient','token'])ensure(pinned[k]===state[k],'BC_MOODLE_READ_MAPPING');
    return state;
   };
   currentOwner();
   const resolveAuthority=async(handle,request,{signal}={})=>{
    signal?.throwIfAborted();currentOwner();
    // Authenticated server-only verifier: no browser session resume, SID,
    // cookies or CLEAR credentials in this reverse-channel request.
    const verified=structuredClone(await verifyMoodleAuthority(request,{signal}));signal?.throwIfAborted();
    const authorityKeys=['version','requestRef','ownerRunId','moodleAuthorityRef','role','status','installationRef',
     'installationGeneration','authorityEpoch','courseRef','subjectRef','actorRef','expiresAtExclusive'];
    exactKeys(verified,fixed?[...authorityKeys.filter(k=>!['installationGeneration','authorityEpoch'].includes(k)),
     'applicationRef','displayOnly','authorityConsumptionAllowed']:authorityKeys,'BC_MOODLE_READ_AUTHORITY');
    ensure(verified.version===(fixed?FIXED_MOODLE_SCOPE_VERSION:'clear-moodle-authority-check.1')&&verified.status==='OK'&&verified.requestRef===request.requestRef
     &&verified.ownerRunId===ownerRunId&&verified.moodleAuthorityRef===request.moodleAuthorityRef&&verified.role===request.role
     &&verified.installationRef===pinned.installationRef&&(fixed||verified.installationGeneration===installationGeneration)
     &&verified.courseRef===pinned.courseRef&&verified.subjectRef===pinned.subjectRef&&verified.actorRef===actors[request.role]
     &&(!fixed||(verified.applicationRef===pinned.applicationId&&verified.displayOnly===true&&verified.authorityConsumptionAllowed===false))
     &&(fixed||(Number.isSafeInteger(verified.authorityEpoch)&&verified.authorityEpoch>0))
     &&Number.isSafeInteger(verified.expiresAtExclusive)&&now()<verified.expiresAtExclusive&&verified.expiresAtExclusive<=request.expiresAtExclusive,'BC_MOODLE_READ_AUTHORITY');
    const authority={requestRef:verified.requestRef,authorityRef:verified.moodleAuthorityRef,...(fixed?{version:FIXED_MOODLE_SCOPE_VERSION}:{authorityEpoch:verified.authorityEpoch}),
     expiresAtExclusive:verified.expiresAtExclusive,mapping:pinned,role:verified.role};
    const state=currentOwner(),context=contexts.get(authority.role);ensure(context,'BC_MOODLE_READ_LOGIN_REQUIRED');actor(context,authority.role,state);
    let bindingExpiry=authority.expiresAtExclusive;
    if(!fixed){
    // This required port must use legitimate B runtime/trustedTime and current
    // authority for this actor; a student's session is never substituted here.
    const binding=structuredClone(await readBindingCurrentness(context,{applicationId:pinned.bApplicationId,bindingRef:pinned.bindingRef,bindingRevision:pinned.bindingRevision},
     {role:authority.role,actorRef:verified.actorRef,authorityRef:authority.authorityRef,authorityEpoch:authority.authorityEpoch,signal}));
    exactKeys(binding,['version','applicationId','bindingRef','bindingRevision','scope','currentness','checkedAt','expiresAtExclusive'],'BC_MOODLE_READ_BINDING');
    exactKeys(binding.scope,['installationRef','courseRef','subjectRef'],'BC_MOODLE_READ_BINDING');
    ensure(binding.version==='clear-moodle-binding-currentness.1'&&binding.currentness==='LOCAL_BINDING_CURRENT'
     &&binding.applicationId===pinned.bApplicationId&&binding.bindingRef===pinned.bindingRef&&binding.bindingRevision===pinned.bindingRevision
     &&['installationRef','courseRef','subjectRef'].every(k=>binding.scope[k]===pinned[k])
     &&Number.isSafeInteger(binding.checkedAt)&&binding.checkedAt===now()&&Number.isSafeInteger(binding.expiresAtExclusive)&&now()<binding.expiresAtExclusive,'BC_MOODLE_READ_BINDING');
    bindingExpiry=binding.expiresAtExclusive;
    }
    signal?.throwIfAborted();const last=currentOwner();ensure(contexts.get(authority.role)===context,'BC_MOODLE_READ_SESSION_CHANGED');
    const session=actor(context,authority.role,last);
    const expiresAtExclusive=Math.min(authority.expiresAtExclusive,bindingExpiry,last.expiresAtExclusive,session.expiresAt);
    ensure(now()<expiresAtExclusive,'BC_MOODLE_READ_EXPIRED');return {...authority,expiresAtExclusive,clearContext:context};
   };
   snapshots=openMoodlePaymentSnapshots({databasePath,authentication,resolveOperatorBindings,now});
   try{const host=createMoodleCourseReadHost({ownerRunId,mapping:pinned,resolveAuthority,authentication,snapshots,receiptSource,
    createCourseEvidenceReader,getDecisionEvidence,readSourceStates,now,monotonic});mounted=true;return host;}
   catch(error){snapshots.close();snapshots=null;throw error;}
  },
  close(){if(!closed){closed=true;contexts.clear();snapshots?.close();snapshots=null;}}
 });
}
export async function openLiveContext({preparationPath,withReader,hackerRank,attestorMode='OFFICIAL',reviewReflection,reflectionHost=null,diagnostics,moodleFirst=false}){
 ensure(typeof moodleFirst==='boolean','BC_NORMAL_SOURCE_ORDER');
 ensure(typeof withReader==='function'&&typeof hackerRank?.pins==='function'&&typeof hackerRank.collectLease==='function'&&typeof reviewReflection==='function','BC_LIVE_PORTS_REQUIRED');
 preparationPath=resolve(preparationPath);const base=privateDirectory(dirname(preparationPath));
 const root=fileURLToPath(new URL('../../private/bootcamp-normal-live/',import.meta.url));ensure(base.startsWith(root)&&preparationPath===join(base,'preparation.json'),'BC_LIVE_OWNER_DIRECTORY');
 const prepared=JSON.parse(readPrivate(preparationPath)),{mapping,runtimeMappingHash}=JSON.parse(readPrivate(join(base,'mapping.json'))),pins=hackerRank.pins();
 ensure(['clear-bootcamp-normal-live-input.1','clear-bootcamp-normal-live-input.2'].includes(prepared.version)&&resolve(prepared.directory)===base&&runtimeMappingHash===prepared.runtimeMappingHash&&runtimeMappingHash===p0Hash('NORMAL-REGISTERED-MAPPING',mapping),'BC_LIVE_MAPPING');
 requireProfileMode(pins?.selfAttestor,attestorMode,mapping.selfAttestor??null);
 // The old UNCONFIGURED preparation remains blocked. Reviewed trust needs its own immutable mapping.
 ensure(mapping.hackerRank.trustStatus==='REVIEWED'&&pins?.dataMode==='RECLAIM_SIGNED_RECORD'&&mapping.hackerRank.trustConfigHash===pins.trustConfigHash&&mapping.hackerRank.recipeHash===pins.recipeHash&&mapping.hackerRank.expectedClaimOwner===pins.expectedClaimOwner,'BC_LIVE_HR_TRUST_REQUIRED');
 ensure(prepared.version==='clear-bootcamp-normal-live-input.2'&&prepared.identityMode==='EXTERNAL_UI_WALLETS','BC_LIVE_EXTERNAL_UI_REQUIRED');
 const origin=new URL(prepared.origin);ensure(origin.protocol==='https:'&&origin.hostname==='127.0.0.1'&&origin.origin===prepared.origin&&origin.port,'BC_LIVE_UI_ORIGIN');
 ensure([prepared.participantWallet,prepared.operatorWallet].every(x=>/^0x[0-9a-f]{40}$/.test(x)&&x!=='0x'+'00'.repeat(20))&&prepared.participantWallet!==prepared.operatorWallet
  &&mapping.participantWallet===prepared.participantWallet&&pins.recipeHash===LIVE_WORKER_RECIPE_HASH,'BC_LIVE_IDENTITY');
 const participant={address:prepared.participantWallet},operator={address:prepared.operatorWallet};
 const m=loadRuntime(prepared.environmentId);ensure(sha(m)===prepared.runtimeHash&&m.version===(prepared.runtimeVersion??'clear-e5-test-runtime.1')&&m.runtimeMappingHash===runtimeMappingHash&&m.policyHash===mapping.policyHash,'BC_LIVE_CHAIN_MAPPING');
 const runId='run-'+randomUUID(),directory=join(base,runId);mkdirSync(directory,{mode:0o700});const startedAt=now(),instanceId='normal-'+runId;
 let auth,store,connection,provider,ui,resumeControl,mounted,moodleRead,moodleLogin,user,app,participantId,sourceTarget,sourceSequence=null,paymentStarted=false,paymentCheckpoint=null,failureState=null,closed=false,started=false,serial=0;const key=()=> 'normal-'+(++serial);
 const sourceWindows=new Map(),controller=new AbortController();
 const report={version:'clear-bootcamp-normal-live-run.1',runId,environmentId:prepared.environmentId,runtimeMappingHash,sourceMode:'REGISTERED_TEST_SOURCE',...(mapping.selfAttestor?{selfAttestor:mapping.selfAttestor}:{}),realSourceVerified:false,startedAt,stages:[],completed:false,production:false};
 const write=()=>atomicPrivate(join(directory,'report.json'),report);
 const stage=name=>{report.stage=name;write();};
 const close=()=>{if(closed)return;closed=true;resumeControl?.cancel();controller.abort();moodleLogin?.close();moodleRead?.close();mounted?.server.closeAllConnections();mounted?.server.close();ui?.close();store?.close();auth?.close();connection?.close();provider?.destroy();if(started){stopEnvironment(prepared.environmentId);parkEnvironment(prepared.environmentId);}};
 try{
  await startEnvironment(prepared.environmentId);started=true;
  const reader=new ExecutionReader(m);ensure((await reader.call('applicationIds',[],await reader.block()))[0].length===0,'BC_LIVE_REQUIRES_UNUSED_TEST_REALM');
  provider=new JsonRpcProvider(m.endpoint,undefined,{cacheTimeout:-1,batchMaxCount:1});provider.pollingInterval=50;
  auth=createApplicationService({directory:join(directory,'authentication'),origin:prepared.origin,chainId:Number(m.chainId),instanceId:m.instanceId,participants:[participant.address],operators:[operator.address],now});
  const commandScope=createMoodleCommandScope({enabled:()=>moodleLogin?.native===true,
   reserve:input=>moodleLogin.reserveCommand(input)});
  const uiAuthentication=Object.freeze({...auth,authorizeWorkflow(context,write){
   const actor=auth.authorizeWorkflow(context,write);commandScope.assertContext(context);return actor;}});
  const serviceContext=Object.freeze({});
  const resolveLease=r=>resolveNormalSourceLease(r,{authentication:auth,context:user,closed,participantWallet:prepared.participantWallet,applicationId:app,participantId,runtimeMappingHash,sourceWindows,startedAt,time:now()});
  const resolvePin=r=>{if(r.applicationId!==app||r.participantId!==participantId||r.runtimeMappingHash!==runtimeMappingHash)return null;const c=r.criterionId;
   const t=c==='activity-complete'?{...mapping.targets.activity,module:'page',selectedPostId:null}:c==='assignment-submitted'?{...mapping.targets.assignment,module:'assign',selectedPostId:null}:{cmId:mapping.targets.reflection.cmId,instanceId:mapping.targets.reflection.forumId,module:'forum',selectedPostId:mapping.targets.reflection.selectedPostId};
   return {environmentRef:mapping.environmentRef,runRef:mapping.runRef,sourceVersion:mapping.sourceVersion,apiVersion:mapping.apiVersion,fixtureReportHash:mapping.fixtureReportHash,courseId:mapping.courseId,participantMapping:{participantId,applicationId:app,moodleUserId:mapping.moodleUserId,accountBindingRef:mapping.accountBindingRef,revision:mapping.revision},target:{targetLogicalId:c==='activity-complete'?'python-intro-activity':c==='assignment-submitted'?'python-practice-task':'python-reflection',...t},completionSetupReceiptHash:c==='activity-complete'?mapping.completionSetupReceiptHash:null};};
  const producers=Object.fromEntries(['activity-complete','assignment-submitted','reflection-topics'].map(criterionId=>[criterionId,createLiveMoodleConsumer({criterionId,withReader,resolvePin,resolveLease,reviewReflection,modelVersion:'gemini-3.5-flash-lite',reflectionHost,sourceValiditySeconds:900,now})]));
  producers['python-basic-certificate']=createLiveReclaimConsumer({selfAttestor:mapping.selfAttestor??null,pins:hackerRank.pins,collectLease:(request,options)=>hackerRank.collectLease(request,{...options,signRequest:message=>ui.requestSignature(request,message,{signal:options.signal})}),resolveLease,now});
  const services={version:'clear-bootcamp-test-execution-port.1',runtimeId:m.environmentId,runtimePinHash:prepared.runtimeHash,authorizeService(c){ensure(c===serviceContext&&!closed&&!failureState&&now()<startedAt+1800,'BC_LIVE_SERVICE');return {serviceId:'normal-worker',runtimeId:m.environmentId,expiresAt:startedAt+1800};},reader:{async snapshot(){throw Error('BC_NORMAL_LEGACY_READER_DISABLED');}},envelope:{async lookup(){throw Error('BC_NORMAL_LEGACY_ENVELOPE_DISABLED');}}};
  connection=openDevelopmentConnection({environmentId:m.environmentId,sourceMode:'REGISTERED_TEST_SOURCE'});
  store=createBootcampStore({directory:join(directory,'store'),authentication:uiAuthentication,commandScope,instanceId,demoStartedAt:startedAt,mode:'ISOLATED_LIVE_TEST',runtimeMappingHash,producers,onCollectionFailure:failure=>{report.collectionFailure=failure;write();},resolveSource:r=>producers[r.criterionId]?.resolveSource(r),now,operatorBindings:[{wallet:operator.address,courseOperatorRef:'course-operator-demo'}],procedurePorts:connection.procedurePorts,executionServices:services,executionBridge:connection.configuration});
  ui=createNormalUiSession({authentication:uiAuthentication,participantWallet:prepared.participantWallet,operatorWallet:prepared.operatorWallet,getApplication:(c,a)=>store.getApplication(c,a),now,diagnostics});
  const bindParticipant=(context,applicationId)=>{
   ensure(!closed&&!app,'BC_LIVE_SINGLE_APPLICATION');ui.bindParticipant(context,applicationId,pins);user=ui.participant();app=applicationId;participantId=store.getApplication(user,app).participantId;
   Object.assign(report,{applicationId:app,participantId,recipient:prepared.participantWallet,sourceStatus:'NOT_COLLECTED',allocationAtoms:'0'});stage('AUTHENTICATED_EXTERNAL_UI_APPLICATION');
   atomicPrivate(join(directory,'context.json'),{runId,environmentId:m.environmentId,applicationId:app,participantId,participantWallet:prepared.participantWallet,policyHash:m.policyHash,runtimeMappingHash,startedAt,sourceStatus:'NOT_COLLECTED',allocationAtoms:'0'},{exclusive:true});
   return {applicationId:app,status:'AUTHENTICATED_SOURCE_SESSION_BOUND',paymentAuthorization:false};
  };
  const paymentReceipt=createNormalReceiptReader({selfAttestor:mapping.selfAttestor??null,authorize:(c,a)=>store.getOperationsProjection(c,a),readReport:()=>report,
   readCanonicalClaim:q=>connection.configuration.reader.claimReceipt(q),runtimeHash:connection.runtime.runtimeHash,runtimeMappingHash,policyHash:m.policyHash,recipient:prepared.participantWallet,token:m.tokenAddress});
  moodleRead=createNormalMoodleReadBoundary({databasePath:join(directory,'store','bootcamp.sqlite'),authentication:auth,
   getDecisionEvidence:(context,id)=>store.getDecisionEvidence(context,id),resolveOperatorBindings:()=>[{wallet:operator.address,courseOperatorRef:'course-operator-demo'}],
   receiptSource:{selfAttestor:mapping.selfAttestor??null,runtimeHash:connection.runtime.runtimeHash,readReport:()=>structuredClone(report),
    readCanonicalClaim:q=>connection.configuration.reader.claimReceipt(q)},now,
   getOwnerState:()=>{ensure(!closed&&!failureState,'BC_LIVE_CONTEXT');return {runId,applicationId:app,participantId,courseOperatorRef:'course-operator-demo',
    policyHash:m.policyHash,runtimeMappingHash,participantWallet:prepared.participantWallet,operatorWallet:prepared.operatorWallet,
    recipient:prepared.participantWallet,token:m.tokenAddress.toLowerCase(),expiresAtExclusive:startedAt+1800};}});
  const refreshProcedure=async(c,a)=>{
   store.getOperationsProjection(c,a);if(failureState)return;requireUiRule(a===app&&!!report.chainApplicationId,'BC_NORMAL_PROCEDURE_NOT_READY');
   await connection.refresh(a);store.getOperationsProjection(c,a);
  };
  const readers=createNormalReviewReaders({now});
  const waitForReaders=async()=>{stage('AWAITING_BOTH_REVIEW_SCREENS');
   await waitUntil(()=>readers.ready(),{signal:controller.signal,timeoutMs:Math.max(1,(startedAt+1800-now())*1000)});};
  const reflectionApproval=reflectionHost?.createApprovalControl?.({
   authorize:(c,w)=>ui.authorize(c,w),getPreparation:()=>sourceSequence?.preparation,getApplicationId:()=>app,
   requireReaders:()=>readers.require(),nowMs:()=>Date.now(),commandScope})??null;
  const paymentCode=reflectionHost?.codeState?.();
  const paymentAuthority=()=>{readNormalView(()=>ui.participant());ensure(!closed&&now()<startedAt+1800&&paymentCode?.clean===true
   &&JSON.stringify(reflectionHost.codeState())===JSON.stringify(paymentCode),'BC_LIVE_CONTEXT');};
  const inspectResume=()=>{
   if(paymentStarted)return paymentCheckpoint?.inspect()??{status:'PAYMENT_RECEIPT_RECONCILIATION_REQUIRED',resumeAllowed:false};
   const ai=reflectionHost?.recovery?.();
   if(ai&&['UNKNOWN','APPROVAL_SPENT_NOT_SENT'].includes(ai.status))return {...ai,resumeAllowed:false};
   const original=ui.participant(),v=readNormalView(()=>store.getApplication(original,app));
   const recovery=sourceSequence?.recovery()??{status:'STAGE_NOT_RESUMABLE',resumeAllowed:false};
   return {...recovery,applicationRevision:v.revision};
  };
  resumeControl=createNormalResumeControl({applicationId:()=>app,authorize:(c,w)=>ui.authorize(c,w),inspect:inspectResume,
   prepareResume(current){readNormalView(()=>ui.participant());readers.require();
    if(current.status==='RECIPIENT_WAIT_NOT_SENT'){paymentCheckpoint.requestResume();return;}
    if(current.status==='NOT_SENT')reflectionHost.authorizeResume();sourceSequence.requestResume();
   }});
  const getSession=context=>{const actor=ui.authorize(context,false);if(app&&!failureState)readNormalView(()=>store.getOperationsProjection(context,app));
   // Observe only the real authenticated UI request, never a Moodle poll. Keep
   // this optional read binding out of the existing failure/resume UI path.
   if(!failureState&&now()<startedAt+1800)moodleRead.observeSession(context);
   readers.observe(actor.role.toUpperCase());return Object.freeze({
   version:'clear-bootcamp-normal-session.1',role:actor.role.toUpperCase(),applicationId:app??null,policyHash:m.policyHash,runtimeMappingHash,phase:report.stage,failure:failureState?resumeControl.view():null,
   signingContext:actor.role==='participant'?productSigningContext({runtime:m,pins,applicationId:app,participantId,participant:prepared.participantWallet}):null,
   recipientRegistrationRequired:m.version==='clear-e5-test-runtime.2',procedureReady:!!report.chainApplicationId,sourceMode:'REGISTERED_TEST_SOURCE',...(mapping.selfAttestor?{selfAttestor:mapping.selfAttestor}:{}),receiptRequired:true,
   reviewScreensReady:readers.ready(),expectedPayment:{recipient:prepared.participantWallet,token:m.tokenAddress.toLowerCase(),
    amountAtoms:'100000000',symbol:'TEST',decimals:6},aiApproval:failureState?null:reflectionApproval?.brief(context)??null});};
  const recipientView=(c,a,checkpoint)=>{requireUiRule(a===app,'BC_LIVE_CONTEXT');return readRecipientRegistration({store,connection,context:c,applicationId:a,checkpoint,authorize:(c,w)=>ui.authorize(c,w)});};
  const normalUi=Object.freeze({commandScope,walletRuntime:Object.freeze({instanceId:m.instanceId}),assertWritable(path){requireUiRule(!failureState||path==='/bootcamp/v4/applications/'+app+'/resume','BC_NORMAL_FAILED_WAITING');},resume:(c,a,b)=>resumeControl.request(c,a,b),getRecipientRegistration:recipientView,
   beforeRecipientRegistration(c,a){ui.participant();ui.authorize(c,true);requireUiRule(a===app&&c.token===user.token,'BC_RECIPIENT_REGISTRATION_SESSION');},getSession,refreshProcedure,getPaymentReceipt:paymentReceipt,bindParticipant,
   beforeReviewConsent(c,a,b,view){ui.authorize(c,true);requireUiRule(a===app,'BC_LIVE_CONTEXT');
    requireNormalConsentAction({view,body:b,phase:report.stage,sourceTarget,reviewTarget:report.reviewTarget});},
   approveReflection(c,a,b,k){requireUiRule(a===app&&reflectionApproval,'BC_NORMAL_AI_APPROVAL_TARGET');return reflectionApproval.approve(c,a,b,k);},
   pendingSignature(c,a){ensure(a===app,'BC_LIVE_CONTEXT');return ui.pendingSignature(c);},submitSignature(c,a,b){ensure(a===app,'BC_LIVE_CONTEXT');return ui.submitSignature(c,b);}});
  stage('AWAITING_EXTERNAL_UI_AUTHENTICATION');
  return Object.freeze({metadataPath:join(directory,'context.json'),
   createMoodleCourseReadHost:options=>moodleRead.createHost(options),
   configureMoodleLogin(options,{native=false}={}){
    ensure(!closed&&!mounted&&!moodleLogin,'MOODLE_LOGIN_CONFIG');
    moodleLogin=createNormalMoodleLogin({options,ownerRunId:runId,runExpiresAtExclusive:startedAt+1800,
     authentication:auth,wallets:{PARTICIPANT:participant.address,COURSE_OPERATOR:operator.address},now,signal:controller.signal,native});
    return moodleLogin.owner;
   },
   createFrontend({tls,webRoot}){ensure(!closed&&!mounted,'BC_LIVE_FRONTEND_ONCE');mounted=createBootcampFrontendServer({authentication:auth,store,tls,sourceMode:'REGISTERED_TEST_SOURCE',chainId:Number(m.chainId),webRoot,normalUi,moodleLogin:moodleLogin?.browser,network:{chainId:Number(m.chainId),rpcUrl:m.endpoint}});return mounted;},
   async collectSources({prepareReflection=false}={}){
    ui.participant();ensure(!closed&&!failureState,'BC_LIVE_CONTEXT');
    sourceSequence??=createNormalSourceSequence({store,getContext:()=>{ui.participant();return user;},applicationId:app,moodleFirst,
     getReflectionRecovery:id=>producers['reflection-topics'].recovery(store.getRequest(user,app,id,{bridge:true}).record),sourceWindows,startedAt,now,nowMs:()=>Date.now(),signal:controller.signal,key,stage,diagnostics,waitForReaders,requireReaders:()=>readers.require()});
    const result=await sourceSequence.collect({prepareReflection});if(prepareReflection)return result;
    ensure(result.decision.record.conditionsStatus==='MET'&&result.evidence.length===4
     &&result.evidence.every(e=>e.current&&e.record.dataMode!=='SYNTHETIC_FIXTURE'),'BC_LIVE_ALL_CURRENT_MET');
    sourceTarget=normalSourceTarget(result);report.realSourceVerified=true;stage('REGISTERED_SOURCE_ALL_CURRENT_MET');return result;
   },
   async pay({onRecipientWaitFailure}={}){
    readNormalView(()=>ui.participant());ensure(!failureState&&report.realSourceVerified===true&&!paymentStarted&&!report.completed,'BC_LIVE_SOURCE_REQUIRED');paymentStarted=true;
    try{return await executeNormalPayment({store,connection,serviceContext,user,app,sourceTarget,requireReviewReaders:()=>readers.require(),
     assertRecipientWaitCurrent:paymentAuthority,
     onRecipientWaitFailure:async(error,checkpoint)=>{paymentCheckpoint=checkpoint;try{return await onRecipientWaitFailure?.(error)===true;}finally{paymentCheckpoint=null;}},
     waitForRecipientRegistration:({deadlineMs})=>waitForNormalRecipientRegistration({participant:()=>ui.participant(),registration:()=>store.getRecipientRegistration(user,app),deadlineMs,signal:controller.signal}),
     waitForConsents:options=>waitForExplicitConsents({...options,stopMarginSeconds:REVIEW_WINDOW.settlementReserveSeconds}),signal:controller.signal,recipient:prepared.participantWallet,provider,key,report,write,stage});}
    catch(error){try{report.executionDiagnostics=connection.diagnostics().slice(0,16);write();}catch{}throw error;}
   },
   enterFailureWait(error){
    const state=normalFailureState(error,{phase:report.stage,collectionFailure:report.collectionFailure,paymentStarted});
    if(!state||closed)return false;if(failureState)return true;
    failureState=state;const offered=resumeControl.open(state);
    if(!offered.resumeAllowed){controller.abort();sourceSequence?.dispose();sourceWindows.clear();for(const producer of Object.values(producers))producer.close?.();}
    report.failure=offered;stage('FAILED_WAITING');return true;
   },
   async waitForResume({signal}){
    try{await waitUntil(()=>{
     readNormalView(()=>ui.participant());if(resumeControl.take()){failureState=null;report.failure=null;delete report.collectionFailure;stage(paymentCheckpoint?'RESUMING_RECIPIENT_REGISTRATION':'RESUMING_REFLECTION');return true;}
     ensure(resumeControl.view()?.resumeAllowed,'BC_NORMAL_RESUME_EXPIRED');return false;
    },{signal,timeoutMs:Math.max(1,(startedAt+1800-now())*1000)});return true;}
    catch(error){if(signal?.aborted)throw error;controller.abort();sourceSequence?.dispose();sourceWindows.clear();for(const producer of Object.values(producers))producer.close?.();report.failure=resumeControl.view();write();return false;}
   },report:()=>structuredClone(report),close,
  });
 }catch(error){report.failureCode=/^(BC|E5|E5B)_[A-Z0-9_]+$/.test(error?.message)?error.message:'BC_LIVE_OPEN_FAILED';write();close();throw Error(report.failureCode);}
}
