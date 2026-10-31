import {requireProfileMode} from '../../src/hackerrank-evidence/self-profile.mjs';
// Narrow owner composition. The production worker supplies concrete native ports; no HTTP supplies these functions.
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {readPrivate,atomicPrivate} from '../../src/hackathon-test-vault/e5/private-storage.mjs';
import {validateNormalReflectionClearance,NORMAL_REFLECTION_COST_ACK} from '../../src/document-precheck/review/fixed-normal-reflection.mjs';
import {fail,localDay,codeState,readPriceReview} from './normal-host-config.mjs';
import {createNormalReflectionApproval,NORMAL_REFLECTION_SOURCE_SCOPE} from './normal-reflection-approval.mjs';
import {requireNormalModelWindow} from './normal-review-window.mjs';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const safeCode=e=>/^[A-Z][A-Z0-9_]{0,90}$/.test(e?.code??e?.message??'')?(e.code??e.message):'NORMAL_HOST_STOPPED';
export async function waitUntil(check,{signal,timeoutMs,pollMs=250}){
 const end=Date.now()+timeoutMs;
 for(;;){fail(!signal?.aborted,'NORMAL_HOST_CANCELLED');fail(Date.now()<end,'NORMAL_HOST_WAIT_EXPIRED');if(await check())return;
  await new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(t);signal?.removeEventListener('abort',abort);reject(Error('NORMAL_HOST_CANCELLED'));};
   const t=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},pollMs);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();});
 }
}
export function reflectionHostOptions(directory,managedRun=null){
 const approvalPath=join(directory,'approval.json');
 const readApproval=()=>JSON.parse(readPrivate(approvalPath));
 const currentApprovalHash=()=>{try{return hash(readApproval());}catch{return null;}};
 return {reflectionHost:{codeState,day:localDay,...(managedRun?{bindManagedRun:input=>managedRun.bind(input)}:{}),
  createApprovalControl({authorize,getPreparation,getApplicationId,requireReaders,nowMs}){
   managedRun?.assertCurrent();const config=JSON.parse(readPrivate(join(directory,'host.json')));
   return createNormalReflectionApproval({directory,config,getPreparation,getApplicationId,requireReaders,nowMs,
    currentCodeState:codeState,currentDay:localDay,authorize(c,w){managedRun?.assertCurrent();return authorize(c,w);}});
  }},readApproval,currentApprovalHash};
}
export async function awaitExactReflectionApproval({directory,prepared,signal,onPrepared}){
 fail(prepared.managedRun?.version==='clear-normal-reflection-run.1'&&/^[a-f0-9]{64}$/.test(prepared.managedRun.bindingHash??''),'NORMAL_HOST_RUN_BINDING_REQUIRED');
 const price=readPriceReview(directory),template={version:'clear-e6-paid-wire-v3-user-approval.3',scope:'FIRST_NORMAL_REFLECTION_ONE',approvedOn:prepared.day,codeHead:prepared.codeState.head,
  planHash:prepared.packet.planHash,contextHash:prepared.packet.contextHash,runBindingHash:prepared.managedRun.bindingHash,maxGenerationCalls:1,maxCountCalls:0,automaticRetries:0,continuations:0,keySourceFallbacks:0,modelFallbacks:0,freeFallbacks:0,
  keySourceId:'clear-e6-existing-server-gemini-env.1',costAcknowledgment:NORMAL_REFLECTION_COST_ACK,pricingReview:price,
  authorization:{kind:'PENDING_DIRECT_HUMAN_CONFIRMATION',evidenceSha256:null}};
 atomicPrivate(join(directory,'approval-request.json'),{version:'clear-bootcamp-normal-approval-request.1',packetPreparedAtMs:Date.now(),packet:prepared.packet,codeState:prepared.codeState,day:prepared.day,
  managedRun:prepared.managedRun,
  sourceScope:NORMAL_REFLECTION_SOURCE_SCOPE,pricingReview:price,scenarioUsd:'0.00346',hardCashCapVerified:false,
  approvalTemplatePath:join(directory,'approval-template.json')});
 atomicPrivate(join(directory,'approval-template.json'),template);onPrepared?.();
 const host=reflectionHostOptions(directory);
 await waitUntil(()=>{
  fail(prepared.isCurrent(),'NORMAL_HOST_PREPARED_SOURCE_EXPIRED');requireNormalModelWindow(prepared);let a;
  try{a=host.readApproval();}catch(e){if(e.code==='ENOENT')return false;throw e;}
  validateNormalReflectionClearance({packet:prepared.packet,approval:a,codeState:codeState(),day:localDay()});
  fail(a.runBindingHash===prepared.managedRun.bindingHash,'NORMAL_HOST_RUN_APPROVAL_CHANGED');
  fail(a.pricingReview.evidenceSha256===price.evidenceSha256,'NORMAL_HOST_PRICE_EVIDENCE_CHANGED');return true;
 },{signal,timeoutMs:Math.max(1,prepared.packet.leaseExpiresAtMs-Date.now())});
}
export async function composeNormalFlow({source,config,directory,signal,ports}){
 // Called only inside the managed source's after-ready useSource callback.
 fail(source?.pins?.()?.dataMode==='RECLAIM_SIGNED_RECORD','NORMAL_HOST_REAL_SOURCE_REQUIRED');
 requireProfileMode(source.pins().selfAttestor,config.attestorMode??'OFFICIAL',config.attestorMode==='SELF_ATTESTOR_TEST'?source.pins().selfAttestor:null);
 let context,mounted;const stop=()=>context?.close();signal?.addEventListener('abort',stop,{once:true});
 try{
  fail(!signal?.aborted,'NORMAL_HOST_CANCELLED');
  const preparation=await ports.prepare({hackerRankPins:source.pins(),attestorMode:config.attestorMode??'OFFICIAL',uiIdentity:{participantWallet:config.participantWallet,operatorWallet:config.operatorWallet,origin:config.origin}});
  fail(!signal?.aborted,'NORMAL_HOST_CANCELLED');
  context=await ports.open({preparationPath:join(preparation.directory,'preparation.json'),hackerRank:source,attestorMode:config.attestorMode??'OFFICIAL'});
  if(signal?.aborted){context.close();throw Error('NORMAL_HOST_CANCELLED');}
  mounted=context.createFrontend({tls:ports.tls,webRoot:config.webRoot});await mounted.ready;await ports.listen(mounted.server,config.origin);
  ports.notify({event:'NORMAL_HOST_ACTIVE',origin:config.origin,chainId:mounted.config.chainId,network:mounted.config.network,applicationId:null,sourceVerified:false});
  await waitUntil(()=>!!context.report().applicationId,{signal,timeoutMs:Math.max(1,(context.report().startedAt+1800)*1000-Date.now())});
  ports.notify({event:'APPLICATION_BOUND',applicationId:context.report().applicationId});
  const prepared=await context.collectSources({prepareReflection:true});
  await ports.awaitApproval({directory,prepared,signal,onPrepared:()=>ports.notify({event:'AWAITING_EXACT_AI_APPROVAL',applicationId:context.report().applicationId,approvalRequestPath:join(directory,'approval-request.json')})});
  await context.collectSources();fail(!signal?.aborted,'NORMAL_HOST_CANCELLED');
  const result=await context.pay();fail(result.completed===true,'NORMAL_HOST_PAYMENT_INCOMPLETE');
  ports.notify({event:'PAYMENT_RECORDED_READ_RECEIPT_IN_BOTH_ROLE_SCREENS',applicationId:result.applicationId,origin:config.origin});
  await ports.finish({signal});return {applicationId:result.applicationId,completed:true};
 }finally{signal?.removeEventListener('abort',stop);context?.close();await mounted?.drain();}
}
