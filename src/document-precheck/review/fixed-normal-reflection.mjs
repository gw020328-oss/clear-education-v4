// First-normal-demo-only fixed transport. No source collection, credential search or new product protocol.
import {executionErrorSummary} from '../../bootcamp/execution-diagnostics.mjs';
import {createHash} from 'node:crypto';
import {freeze,requireRule as check} from '../../policy/values.mjs';
import {p0Hash,P0_POLICY} from '../../../specs/bootcamp/p0-contract.mjs';
import {developerTransport} from '../../ai-policy/gemini-evaluation.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
export const NORMAL_REFLECTION_MODEL='gemini-3.5-flash-lite';
export const NORMAL_REFLECTION_WIRE_POLICY_HASH='0xc7aa9411a5241b533ab79b338736ca798a7b59a0e95ccb25a99cd06234d47902';
const PROMPT_HASH='383d3d642e8fdd4c0bac482806439f324cb263f5d02d5b2a2f3d11f4b7c09081';
const TOPICS=P0_POLICY.criteria.find(c=>c.capability==='REFLECTION_REQUIRED_TOPICS.1').predicate.topics;
export const NORMAL_REFLECTION_SCHEMA=freeze({type:'OBJECT',properties:{topics:{type:'ARRAY',items:{type:'OBJECT',properties:{
 topicId:{type:'STRING',enum:TOPICS},state:{type:'STRING',enum:['PRESENT','MISSING','UNCERTAIN','CONFLICT']},
 evidence:{type:'OBJECT',nullable:true,properties:{sourceId:{type:'STRING'},quote:{type:'STRING'}},required:['sourceId','quote']},
},required:['topicId','state','evidence']}}},required:['topics']});
export const NORMAL_REFLECTION_COST_ACK='ESTIMATE_ONLY_NO_PROVIDER_HARD_CASH_CAP_IN_FLIGHT_MAY_EXCEED_USD_0_05';
const PRICING='https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite';
const adapters=new WeakMap();
export const isFixedNormalReflectionAdapter=a=>adapters.has(a);
function providerBody(request,messageFormat){
 check(request?.purpose==='REFLECTION_REQUIRED_TOPICS.1'&&hash(request.instruction??'')===PROMPT_HASH,'NORMAL_FIXED_PROFILE');
 check(JSON.stringify(request.topicIds)===JSON.stringify(TOPICS)&&request.sources?.length===1,'NORMAL_FIXED_PROFILE');
 const source=request.sources[0];check(source?.kind==='TEXT'&&typeof source.text==='string'&&source.text.isWellFormed()
   &&Buffer.byteLength(source.text,'utf8')<=2048&&[1,2].includes(messageFormat),'NORMAL_INPUT');
 return {systemInstruction:{parts:[{text:request.instruction}]},contents:[{role:'user',parts:[{text:JSON.stringify({
  caseId:request.contextHash,topicIds:TOPICS,source:{sourceId:source.sourceId,kind:'TEXT',messageFormat,
   locationBasis:'ORIGINAL_REFLECTION_BODY_UTF16',normalizationApplied:false,text:source.text}})}]}],
 generationConfig:{maxOutputTokens:1024,thinkingConfig:{thinkingLevel:'MINIMAL',includeThoughts:false},
 responseMimeType:'application/json',responseSchema:NORMAL_REFLECTION_SCHEMA}};
}
// Call only on an authorized owner read. Returns hashes/limits, never body/quotes.
export function prepareNormalReflectionPacket({request,decisionRef=null,messageFormat,leaseExpiresAtMs}){
 const body=providerBody(request,messageFormat),bytes=JSON.stringify(body);
 check(Buffer.byteLength(bytes,'utf8')<=8192&&Number.isSafeInteger(leaseExpiresAtMs),'NORMAL_INPUT');
 const p={model:NORMAL_REFLECTION_MODEL,wirePolicyHash:NORMAL_REFLECTION_WIRE_POLICY_HASH,contextHash:request.contextHash,profileHash:request.profileHash,promptSha256:PROMPT_HASH,
  schemaHash:p0Hash('E6-QUALITY-SCHEMA',NORMAL_REFLECTION_SCHEMA),inputHash:'0x'+hash(Buffer.from(request.sources[0].text,'utf8')),
  bodySha256:hash(bytes),decisionRefHash:p0Hash('E6-DECISION-REF',decisionRef),messageFormat,leaseExpiresAtMs,
  maxGenerationCalls:1,maxCountCalls:0,automaticRetries:0,continuations:0,fallbacks:0,maxOutputTokens:1024,
  scenarioNanoUsd:'3460000',providerHardCashCapVerified:false,invoiceVerified:false};
 return freeze({...p,planHash:p0Hash('E6-FIRST-NORMAL-REFLECTION',p)});
}
export function validateNormalReflectionClearance({packet,approval,codeState,day}){
 check(typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day),'NORMAL_APPROVAL_REQUIRED');
 check(packet?.model===NORMAL_REFLECTION_MODEL&&packet.wirePolicyHash===NORMAL_REFLECTION_WIRE_POLICY_HASH&&packet.promptSha256===PROMPT_HASH
  &&packet.schemaHash===p0Hash('E6-QUALITY-SCHEMA',NORMAL_REFLECTION_SCHEMA)&&packet.maxGenerationCalls===1&&packet.maxCountCalls===0
  &&packet.automaticRetries===0&&packet.continuations===0&&packet.fallbacks===0&&packet.maxOutputTokens===1024,'NORMAL_FIXED_PROFILE');
 check(packet?.planHash===p0Hash('E6-FIRST-NORMAL-REFLECTION',Object.fromEntries(Object.entries(packet).filter(([k])=>k!=='planHash'))),'NORMAL_PACKET');
 check(codeState?.clean===true&&/^[a-f0-9]{40}$/.test(codeState.head??'')&&approval?.codeHead===codeState.head,'NORMAL_CODE');
 check(approval?.version==='clear-e6-paid-wire-v3-user-approval.3'&&approval.scope==='FIRST_NORMAL_REFLECTION_ONE'
  &&approval.approvedOn===day&&approval.planHash===packet.planHash&&approval.contextHash===packet.contextHash
  &&approval.authorization?.kind==='DIRECT_HUMAN_FRESH_NORMAL_ONE'&&/^[a-f0-9]{64}$/.test(approval.authorization.evidenceSha256??'')
  &&approval.maxGenerationCalls===1&&approval.maxCountCalls===0&&approval.automaticRetries===0&&approval.continuations===0
  &&approval.keySourceFallbacks===0&&approval.modelFallbacks===0&&approval.freeFallbacks===0
  &&approval.keySourceId==='clear-e6-existing-server-gemini-env.1'&&approval.costAcknowledgment===NORMAL_REFLECTION_COST_ACK
  &&approval.pricingReview?.reviewedOn===day&&approval.pricingReview.officialSource===PRICING
  &&approval.pricingReview.inputNanoUsdPerToken==='300'&&approval.pricingReview.outputIncludingThinkingNanoUsdPerToken==='2500'
  &&approval.pricingReview.basis==='PUBLIC_PRICE_REVIEW_NOT_BILLING_AUTHENTICATION'
  &&/^[a-f0-9]{64}$/.test(approval.pricingReview.evidenceSha256??''),'NORMAL_APPROVAL_REQUIRED');
}
// Native Developer transport is the only dispatcher. Injected readers/fetch in offline tests are explicitly test doubles.
// Caller supplies the existing v3 safe wire reader, durable single-run store and authenticated current resolver.
function buildFixedNormalReflectionAdapter({packet,approval,codeState,day,currentCodeState,currentDay,currentApprovalHash,
 assertCurrent,store,readResponse,nowMs=()=>Date.now(),transportOptions}={}){
 packet=structuredClone(packet);approval=structuredClone(approval);codeState=structuredClone(codeState);
 validateNormalReflectionClearance({packet,approval,codeState,day});
 check([currentCodeState,currentDay,currentApprovalHash,assertCurrent,readResponse].every(f=>typeof f==='function')
   &&typeof store?.claim==='function'&&typeof store.checkpoint==='function','NORMAL_HOST_REQUIRED');
 const approvalHash=hash(JSON.stringify(approval)),state={used:false,claimed:false,report:{execution:'ACTUAL',generationCalls:0,countCalls:0,
  status:'PREPARED',transportInvocations:0,providerResponsesReceived:0,contextHash:packet.contextHash,planHash:packet.planHash,approvalHash,codeHead:codeState.head,
  cost:null,usableForAcceptance:false,paymentAuthority:false,paymentAllowed:false}};
 const syncGuard=()=>{
  const currentCode=currentCodeState(),currentDate=currentDay(),currentHash=currentApprovalHash();
  check(!currentHash?.then,'NORMAL_SYNC_HOST_REQUIRED');
  validateNormalReflectionClearance({packet,approval,codeState:currentCode,day:currentDate});
  check(currentCode.head===codeState.head&&currentDate===day&&currentHash===approvalHash,'NORMAL_CURRENT');
  check(nowMs()<packet.leaseExpiresAtMs,'NORMAL_EXPIRED');
  const current=assertCurrent();check(!current?.then,'NORMAL_SYNC_HOST_REQUIRED');
 };
 const guard=async()=>{
  validateNormalReflectionClearance({packet,approval,codeState:currentCodeState(),day:currentDay()});
  check(currentCodeState().head===codeState.head&&currentDay()===day&&await currentApprovalHash()===approvalHash,'NORMAL_CURRENT');
  check(nowMs()<packet.leaseExpiresAtMs,'NORMAL_EXPIRED');await assertCurrent();syncGuard();
 };
 const reserve=async()=>{
  await guard();if(state.claimed)return;
  await store.claim({scope:'FIRST_NORMAL_REFLECTION_ONE',codeHead:codeState.head,planHash:packet.planHash,
   contextHash:packet.contextHash,approvalHash});state.claimed=true;state.report.status='RESERVED_NO_DISPATCH';
  await store.checkpoint(structuredClone(state.report));
 };
 const adapter=Object.freeze({execution:'ACTUAL',modelVersion:NORMAL_REFLECTION_MODEL,reserve,
  async observe(request,{signal,beforeDispatch}={}){
   check(typeof beforeDispatch==='function','NORMAL_HOST_REQUIRED');
   check(!state.used,'NORMAL_ONE_CALL_SPENT');state.used=true;await guard();
   const body=providerBody(request,packet.messageFormat);
   check(hash(JSON.stringify(body))===packet.bodySha256&&request.contextHash===packet.contextHash
    &&request.profileHash===packet.profileHash,'NORMAL_INPUT_CHANGED');
   check(!signal?.aborted,'NORMAL_CANCELLED');await reserve();
   state.report.generationCalls=1;state.report.status='DISPATCH_RESERVED';await store.checkpoint(structuredClone(state.report));
   await guard();await beforeDispatch();syncGuard();check(!signal?.aborted,'NORMAL_CANCELLED');
   try{
    state.report.transportInvocations++;const response=await developerTransport({...transportOptions,keyReader:()=>{syncGuard();check(!signal?.aborted,'NORMAL_CANCELLED');return transportOptions?transportOptions.keyReader():process.env.GEMINI_API_KEY;}}).request(NORMAL_REFLECTION_MODEL,'generateContent',body,signal);
    state.report.providerResponsesReceived++;await guard();check(!signal?.aborted,'NORMAL_CANCELLED');const received=readResponse(response);
    state.report.status='RECEIVED';state.report.cost=received.usage;state.report.responseSha256=received.responseSha256;
    await store.checkpoint(structuredClone(state.report));return received.output;
   }catch(e){state.report.failure=executionErrorSummary(e);state.report.status='UNKNOWN_STOPPED';if(!signal?.aborted)await store.checkpoint(structuredClone(state.report));throw Error('NORMAL_MODEL_STOPPED',{cause:e});}
  },summary:()=>freeze(structuredClone(state.report))});
 adapters.set(adapter,state);return adapter;
}
// Live callers cannot replace the native transport or the existing server key source.
export function createFixedNormalReflectionAdapter(options={}){
 check(!Object.hasOwn(options,'transportOptions'),'NORMAL_LIVE_OVERRIDE_FORBIDDEN');
 return buildFixedNormalReflectionAdapter(options);
}
// Offline-only fixture seam. Results from its entry never receive the live-result brand.
export function createOfflineNormalReflectionFixtureAdapter(options={}){
 check(typeof options.transportOptions?.keyReader==='function'&&typeof options.transportOptions?.fetchImpl==='function','NORMAL_OFFLINE_TRANSPORT_REQUIRED');
 return buildFixedNormalReflectionAdapter(options);
}
// Preserve core timeout/cancellation semantics without passing ACTUAL through the MOCK boundary.
export async function invokeFixedNormalReflection(adapter,input,{signal,timeoutMs,beforeDispatch}={}){
 check(isFixedNormalReflectionAdapter(adapter),'NORMAL_FIXED_ADAPTER_REQUIRED');
 check(Number.isInteger(timeoutMs)&&timeoutMs>=1&&timeoutMs<=30000,'NORMAL_TIMEOUT');
 const controller=new AbortController(),timeout=Symbol(),cancel=Symbol();let timer,abort;
 try{
  if(signal?.aborted)return {status:'CANCELLED',execution:'ACTUAL',output:null};
  const stop=new Promise((_,reject)=>{abort=()=>{controller.abort();reject(cancel);};signal?.addEventListener('abort',abort,{once:true});
    timer=setTimeout(()=>{controller.abort();reject(timeout);},timeoutMs);});
  const output=await Promise.race([Promise.resolve().then(()=>adapter.observe(input,{signal:controller.signal,beforeDispatch})),stop]);
  return {status:'SUCCEEDED',execution:'ACTUAL',output};
 }catch(e){return {status:e===timeout?'TIMED_OUT':e===cancel?'CANCELLED':'FAILED',execution:'ACTUAL',output:null};}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
