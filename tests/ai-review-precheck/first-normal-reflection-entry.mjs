// One first-normal reflection, injected by the authenticated API owner. Importing never reads key/source/approval.
// No CLI, active approval creation, source collector, saved-evaluation replay or product Evidence publication.
import {fileURLToPath} from 'node:url';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
import {sha} from './e6-quality-plan.mjs';
import {receivedTextV3,deriveUsageV3,safeRawUsage,WIRE_V3_POLICY_HASH} from './e6-wire-v3.mjs';
import {withE6PaidWireV3Store} from './e6-paid-wire-v3-runner.mjs';
import {createE6LeasedReflectionSession} from '../../src/document-precheck/review/e6-leased-reflection.mjs';
import {validateReflectionContext,reflectionContextHash,REFLECTION_INSTRUCTION,REFLECTION_TOPICS,REFLECTION_CAPABILITY} from '../../src/document-precheck/review/bootcamp-reflection.mjs';
import {prepareNormalReflectionPacket,createFixedNormalReflectionAdapter,createOfflineNormalReflectionFixtureAdapter,validateNormalReflectionClearance} from '../../src/document-precheck/review/fixed-normal-reflection.mjs';
export function prepareFirstNormalReflectionPacket({context,decisionRef=null,messageFormat,text,leaseExpiresAtMs}){
 validateReflectionContext(context);
 const request={purpose:REFLECTION_CAPABILITY,contextHash:reflectionContextHash(context),profileHash:context.profileHash,
  instruction:REFLECTION_INSTRUCTION,topicIds:REFLECTION_TOPICS,sources:[{sourceId:context.sourceId,kind:'TEXT',text}]};
 const packet=prepareNormalReflectionPacket({request,decisionRef,messageFormat,leaseExpiresAtMs:Math.min(context.expiresAtMs,leaseExpiresAtMs)});
 if(packet.wirePolicyHash!==WIRE_V3_POLICY_HASH||packet.inputHash!==context.inputHash||context.modelVersion!==packet.model)throw Error('NORMAL_CONTEXT_INPUT');return packet;
}
function readResponse(response){
 const text=receivedTextV3(response);let usage,output;
 try{usage=deriveUsageV3(response);}catch{usage={status:'UNKNOWN',rawUsage:safeRawUsage(response?.usageMetadata),
  conditionalGenerationEstimateNanoUsd:null,invoiceVerified:false,providerHardCashCapVerified:false};}
 try{output=JSON.parse(text);}catch{output={};}
 return {output,usage,responseSha256:sha(text)};
}
async function runReflection({packet,approval,codeState,day,currentCodeState,currentDay,currentApprovalHash,
 resolveCurrent,context,decisionRef=null,messageFormat,lease,signal,timeoutMs=30000,nowMs=()=>Date.now(),store,transportOptions}={},offline=false){
 validateReflectionContext(context);
 if(packet.contextHash!==reflectionContextHash(context)||packet.decisionRefHash!==p0Hash('E6-DECISION-REF',decisionRef)
  ||packet.messageFormat!==messageFormat)throw Error('NORMAL_CONTEXT_CHANGED');
 validateNormalReflectionClearance({packet,approval,codeState,day}); // Before creating journal, reading raw, or key.
 const action=async activeStore=>{
  const session=createE6LeasedReflectionSession(resolveCurrent,{nowMs});
  const adapter=(offline?createOfflineNormalReflectionFixtureAdapter:createFixedNormalReflectionAdapter)({packet,approval,codeState,day,currentCodeState,currentDay,currentApprovalHash,
   assertCurrent:()=>{if(!session.refresh())throw Error('NORMAL_CURRENT');},store:activeStore,readResponse,nowMs,...(offline?{transportOptions}:{})});
  try{
   await adapter.reserve(); // Whole single-run grant is consumed even when a later source guard stops before model dispatch.
   const view=await session.review({context,decisionRef,messageFormat,lease},adapter,{signal,timeoutMs});
   const current=session.consume(view),dispatch=adapter.summary();
   const report={...dispatch,provenance:offline?'OFFLINE_FIXTURE':'NATIVE_DEVELOPER',dispatchStatus:dispatch.status,status:!current.current?'STALE_OR_UNAVAILABLE':
     dispatch.status==='RECEIVED'?'RECEIVED_CURRENT':'MODEL_UNAVAILABLE_CURRENT_SOURCE',view:current,
    usableForAcceptance:false,paymentAuthority:false,paymentAllowed:false};
   await activeStore.checkpoint(report);
   // Owner must consume/recheck while session remains live before its CAS; it then closes this borrowed AI session.
   const result=Object.freeze({view:current,report,isCurrent:()=>session.refresh(),consume:()=>session.consume(view),close:()=>session.dispose()});
   if(!offline)liveResults.add(result);return result;
  }catch(e){session.dispose();throw e;}
 };
 if(store)return action(store);
 return withE6PaidWireV3Store(fileURLToPath(new URL('../../artifacts/e6-first-normal-reflection-run/',import.meta.url)),action);
}

const liveResults=new WeakSet();
export const isFirstNormalReflectionResult=result=>liveResults.has(result);
export function consumeFirstNormalReflection(result){
 if(!liveResults.has(result))throw Error('NORMAL_LIVE_RESULT_REQUIRED');return result.consume();
}
export function runFirstNormalReflection(options={}){
 if(Object.hasOwn(options,'transportOptions')||Object.hasOwn(options,'store'))throw Error('NORMAL_LIVE_OVERRIDE_FORBIDDEN');
 return runReflection(options);
}
export function runFirstNormalReflectionOfflineFixture(options={}){
 if(!options.store||!options.transportOptions)throw Error('NORMAL_OFFLINE_FIXTURE_REQUIRED');
 return runReflection(options,true);
}
