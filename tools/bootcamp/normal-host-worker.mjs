// Enter only through normal-host-launch's real lockf/ulimit boundary.
import {createSourceDiagnostics,observeSource} from '../../src/hackerrank-evidence/diagnostics.mjs';
import {randomBytes,randomUUID} from 'node:crypto';
import {openManagedNormalReflectionRun} from './normal-reflection-run.mjs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {existsSync,readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {loadHostConfig,hostReadiness,sha,fail,readPriceReview} from './normal-host-config.mjs';
import {atomicPrivate} from '../../src/hackathon-test-vault/e5/private-storage.mjs';
import {safeCode,composeNormalFlow,reflectionHostOptions,awaitExactReflectionApproval} from './normal-host-flow.mjs';
process.umask(0o077);
const controller=new AbortController(),{signal}=controller;let unexpected=false,diagnostics,selfAttestor,retainedFailure;
for(const s of ['uncaughtException','unhandledRejection'])process.once(s,()=>{unexpected=true;process.exitCode=1;controller.abort();});
for(const s of ['SIGINT','SIGTERM','SIGHUP'])process.once(s,()=>controller.abort());
const notify=v=>process.stdout.write(JSON.stringify(v)+'\n');
async function waitForCommand(command,{signal}){
 const rl=createInterface({input:process.stdin,terminal:false});
 try{await new Promise((resolve,reject)=>{
  const done=()=>{signal.removeEventListener('abort',abort);rl.removeListener('line',line);rl.removeListener('close',close);};
  const abort=()=>{done();reject(Error('NORMAL_HOST_CANCELLED'));};
  const line=value=>{if(value.trim()===command){done();resolve();}};
  const close=()=>{done();reject(Error('NORMAL_HOST_INPUT_CLOSED'));};
  rl.on('line',line);rl.once('close',close);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
 });}finally{rl.close();}
}
try{
 fail(process.env.CLEAR_LOCKED==='1'&&!process.env.CLEAR_TEST_ROOT&&process.versions.node==='24.21.0'&&process.platform==='darwin'&&process.arch==='arm64','NORMAL_HOST_LOCKED_PLATFORM');
 const [mode,name,...extra]=process.argv.slice(2);fail(['registry','run'].includes(mode)&&extra.length===0,'NORMAL_HOST_WORKER_ARGUMENT');
 const {directory,config}=loadHostConfig(name);
 const {loadManagedHackerRankTrust}=await import('../../src/hackerrank-evidence/worker-trust.mjs');
 const loadTrust=async()=>{if(config.attestorMode!=='SELF_ATTESTOR_TEST')return loadManagedHackerRankTrust({audience:config.audience,privacyKeyId:config.privacyKeyId,signal});
  selfAttestor=await (await import('../local-attestor-review/host.mjs')).startSelfAttestorTest({signal});
  atomicPrivate(join(directory,'self-attestor-profile.json'),selfAttestor.profile,{exclusive:true});
  return selfAttestor.trust({audience:config.audience,privacyKeyId:config.privacyKeyId});};
 if(mode==='registry'){
  fail(config.attestorMode!=='SELF_ATTESTOR_TEST','NORMAL_HOST_SELF_USE_CHECK_WITHOUT_REGISTRY');
  const trust=await loadTrust();
  const {hash}=await import('../../src/hackerrank-evidence/values.mjs');
  const result={version:'clear-bootcamp-normal-registry-check.1',checkedAt:Math.floor(Date.now()/1000),signerCount:trust.signers.length,epochs:trust.epochs,
   trustConfigHash:hash('TRUST',trust),recipeHash:hash('RECIPE',trust.recipe),expiresAt:trust.expiresAt,sourceVerified:false,sourceLeaseIssued:false,applicationCreated:false,browserOpened:false};
  atomicPrivate(join(directory,'registry-check.json'),result);notify(result);
 }else{
  const readiness=hostReadiness({directory,config});fail(readiness.readyForActivation,'NORMAL_HOST_ACTIVATION_NOT_READY');readPriceReview(directory);
  fail(!existsSync(join(directory,'prepared-listener.lock')),'NORMAL_HOST_STOP_PREPARED_LISTENER_FIRST');
  atomicPrivate(join(directory,'run.used.json'),{version:'clear-bootcamp-normal-host-one-run.2',hostName:name,runId:'normal-run-'+randomUUID(),startedAt:Date.now(),code:readiness.code},{exclusive:true});
  const managedRun=openManagedNormalReflectionRun(name);
  diagnostics=createSourceDiagnostics({persist:value=>atomicPrivate(join(directory,'source-diagnostics.json'),value)});
  const trust=await loadTrust();
  const {defaultRoot,clearAbandoned,createSession,removeSession}=await import('../../src/mac-collector/storage.mjs');
  const {stopRecordedBrowser}=await import('../../src/mac-collector/chrome.mjs');
  const {withManagedHackerRankSource}=await import('../../src/hackerrank-evidence/managed-source.mjs');
  const {prepareLiveInput}=await import('./prepare-live-input.mjs');const {openLiveContext}=await import('./live-context.mjs');
  const {loadTls}=await import('../../src/dev/tls.mjs');const {listenNormalServer}=await import('./normal-host-prepared-server.mjs');
  const {runManagedNormalReflection}=await import('../../tests/ai-review-precheck/first-normal-reflection-entry.mjs');
  fail(sha(readFileSync(config.moodleReader))===config.moodleReaderSha256,'NORMAL_HOST_MOODLE_READER_CHANGED');
  const {withReader}=await import(pathToFileURL(config.moodleReader));fail(typeof withReader==='function','NORMAL_HOST_MOODLE_READER');
  const host=reflectionHostOptions(directory,managedRun),reviewReflection=args=>runManagedNormalReflection(managedRun,{...args,approval:host.readApproval(),currentApprovalHash:host.currentApprovalHash});
  let session,complete,key;const root=defaultRoot();
  try{
   await clearAbandoned(root,stopRecordedBrowser);signal.throwIfAborted();session=await createSession(root,Date.now(),process.pid);key=randomBytes(32);
   complete=await withManagedHackerRankSource(session,{selfAttestor,trustConfig:trust,commitmentKey:key,selectedCertificateId:config.selectedCertificateId,signal,diagnostics,
    waitForReady:async({signal})=>{notify({event:'HR_LOGIN_WINDOW_OPEN_READY_ONLY_AFTER_SELF_LOGIN',command:'READY'});await waitForCommand('READY',{signal});},
    useSource:(source,{signal})=>composeNormalFlow({source,config,directory,signal,ports:{prepare:prepareLiveInput,
     open:opts=>openLiveContext({...opts,withReader,reflectionHost:host.reflectionHost,reviewReflection,diagnostics}),tls:loadTls(directory,config.tlsFingerprint),listen:listenNormalServer,
     notify,async awaitResume({context,signal}){
      const stop=new AbortController(),combined=AbortSignal.any([signal,stop.signal]);
      try{return await Promise.race([context.waitForResume({signal:combined}),waitForCommand('FINISH',{signal:combined}).then(()=>{throw Error('NORMAL_HOST_EXPLICIT_FINISH');})]);}
      finally{stop.abort();}
     },retainFailure:value=>{retainedFailure=value;},awaitApproval:awaitExactReflectionApproval,finish:async({signal})=>{notify({event:'BOTH_ROLE_RECEIPT_REVIEW_THEN_FINISH',command:'FINISH'});await waitForCommand('FINISH',{signal});}}})});
  }finally{key?.fill(0);if(session){await stopRecordedBrowser(session.path);await removeSession(root,session.path);}}
  if(retainedFailure){
   // Managed browser/route/client/profile/key cleanup has completed above.
   await selfAttestor?.close();selfAttestor=null;
   notify({event:'NORMAL_HOST_FAILED_WAITING',failure:retainedFailure.context.report().failure,origin:config.origin,command:'FINISH',sourceResourcesReleased:true});
   await waitForCommand('FINISH',{signal});
   notify({event:'NORMAL_FAILED_RUN_FINISHED',completed:false});
  }
  fail(!signal.aborted&&!unexpected,'NORMAL_HOST_CANCELLED');notify({event:'NORMAL_RUN_FINISHED',...complete,profilesDeleted:true});
 }
}catch(error){observeSource(diagnostics,'NORMAL_FLOW','FAILED',error);notify({event:'NORMAL_HOST_STOPPED',code:safeCode(error),actualCompletionClaimed:false,diagnosticPersistence:diagnostics?.snapshot().persistence??'NOT_STARTED'});process.exitCode=1;}finally{retainedFailure?.context.close();await retainedFailure?.mounted?.drain();await selfAttestor?.close();}
