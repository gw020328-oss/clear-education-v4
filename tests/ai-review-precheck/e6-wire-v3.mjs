// Offline-compatible REST reader. Text scoring and permission for NEXT dispatch are independent.
import {readFileSync} from 'node:fs';
import {sha,assessE6QualityResponse} from './e6-quality-plan.mjs';
import {safeRawUsage} from './e6-usage-compat-v2.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
export {safeRawUsage};
export const WIRE_V3_POLICY=Object.freeze({version:'clear-e6-rest-wire-policy.3',
 evidenceSha256:sha(readFileSync(new URL('./e6-wire-evidence-v3.json',import.meta.url))),
 fixtureSha256:sha(readFileSync(new URL('./e6-rest-wire-fixture-v3.json',import.meta.url))),
 usageEvidenceSha256:sha(readFileSync(new URL('./e6-usage-definition-evidence-v2.json',import.meta.url))),
 serviceTier:'REST_LOWERCASE_STANDARD_OR_DOCUMENTED_DEFAULT',
 usage:'TOTAL_MINUS_PROMPT_CONDITIONAL_BOUND_MISSING_THOUGHTS_REMAINS_NULL',
 ordering:'SCORE_RECEIVED_TEXT_IN_MEMORY_INDEPENDENT_OF_USAGE_STOP_NEXT_DISPATCH',
 cost:'PROMPT_300_PLUS_COMBINED_2500_NANO_USD',pastRunRescoring:false,invoiceVerified:false,providerHardCashCapVerified:false});
export const WIRE_V3_POLICY_HASH=p0Hash('E6-REST-WIRE-POLICY.3',WIRE_V3_POLICY);
const check=(c,s)=>{if(!c)throw Error('E6_WV3_'+s);};
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const safe=n=>Number.isSafeInteger(n)&&n>=0;
const tierObservation=u=>u?.serviceTier==null?'UNREPORTED_DOCUMENTED_DEFAULT':
 ['standard','unspecified','flex','priority'].includes(u.serviceTier)?u.serviceTier:'UNRECOGNIZED_REDACTED';
const knownKeys=(v,keys)=>obj(v)&&Object.keys(v).every(k=>keys.includes(k));
const emptyArray=v=>v==null||(Array.isArray(v)&&v.length===0);
function unblocked(v){
 if(v==null)return true;
 return Array.isArray(v)&&v.every(s=>obj(s)&&(s.blocked==null||s.blocked===false));
}
export function receivedTextV3(response,{requireComplete=true}={}){
 check(response?.modelVersion==='gemini-3.5-flash-lite','MODEL');
 check(Array.isArray(response.candidates)&&response.candidates.length===1,'CANDIDATES');
 const c=response.candidates[0],f=response.promptFeedback;
 check(obj(c)&&(!requireComplete||c.finishReason==='STOP')&&(c.index==null||c.index===0),'FINISH');
 check((f==null||(obj(f)&&(f.blockReason==null||f.blockReason==='BLOCK_REASON_UNSPECIFIED')&&unblocked(f.safetyRatings)))
   &&unblocked(c.safetyRatings),'SAFETY');
 const content=c.content;
 check(knownKeys(content,['role','parts'])&&(content.role==null||content.role==='model')
   &&Array.isArray(content.parts)&&content.parts.length>0,'TEXT_SCOPE');
 check(content.parts.every(p=>knownKeys(p,['text','thought','thoughtSignature','partMetadata','speechMetadata','mediaProcessing','mediaResolution','audioTranscription','videoMetadata'])&&typeof p.text==='string'
   &&(p.thought==null||p.thought===false)&&(p.thoughtSignature==null||typeof p.thoughtSignature==='string')
   &&(p.partMetadata==null||obj(p.partMetadata))&&(p.speechMetadata==null||obj(p.speechMetadata))
   &&(p.mediaProcessing==null||typeof p.mediaProcessing==='string')
   &&['mediaResolution','audioTranscription','videoMetadata'].every(k=>p[k]==null||obj(p[k]))),'TEXT_SCOPE');
 return content.parts.map(p=>p.text).join('');
}
function emptyToolMetadata(c){
 if(!emptyArray(c.groundingAttributions))return false;
 if(c.urlContextMetadata!=null&&(!knownKeys(c.urlContextMetadata,['urlMetadata'])||!emptyArray(c.urlContextMetadata.urlMetadata)))return false;
 if(c.groundingMetadata==null)return true;
 // Known empty/default containers carry no retrieval content. Populated/unknown indicators stop next dispatch.
 const g=c.groundingMetadata;
 return knownKeys(g,['groundingChunks','groundingSupports','webSearchQueries','imageSearchQueries','searchEntryPoint','retrievalMetadata','googleMapsWidgetContextToken'])
   &&['groundingChunks','groundingSupports','webSearchQueries','imageSearchQueries'].every(k=>emptyArray(g[k]))
   &&(g.searchEntryPoint==null||(knownKeys(g.searchEntryPoint,['renderedContent','sdkBlob'])
     &&Object.values(g.searchEntryPoint).every(v=>v==null||v==='')))
   &&(g.retrievalMetadata==null||(obj(g.retrievalMetadata)&&Object.keys(g.retrievalMetadata).length===0))
   &&(g.googleMapsWidgetContextToken==null||g.googleMapsWidgetContextToken==='');
}
export function deriveUsageV3(response){
 receivedTextV3(response,{requireComplete:false}); // Fixed text request is separately pinned by the bundle/approval.
 check(knownKeys(response,['candidates','promptFeedback','usageMetadata','modelVersion','responseId','modelStatus']),'UNKNOWN_RESPONSE_FIELD');
 const c=response.candidates[0];
 check(knownKeys(c,['content','finishReason','safetyRatings','citationMetadata','tokenCount','groundingAttributions',
   'groundingMetadata','avgLogprobs','logprobsResult','urlContextMetadata','continuationToken','index','finishMessage']),'UNKNOWN_CANDIDATE_FIELD');
 check(c.continuationToken==null||c.continuationToken==='','CONTINUATION');
 check(emptyToolMetadata(c),'TOOL_METADATA');
 check(c.content.parts.every(p=>['mediaResolution','audioTranscription','videoMetadata'].every(k=>p[k]==null||Object.keys(p[k]).length===0)),'MEDIA_METADATA');
 const u=response.usageMetadata,keys=['promptTokenCount','candidatesTokenCount','thoughtsTokenCount','totalTokenCount',
 'cachedContentTokenCount','toolUsePromptTokenCount','promptTokensDetails','cacheTokensDetails','candidatesTokensDetails','toolUsePromptTokensDetails','serviceTier'];
 check(knownKeys(u,keys),'USAGE_FIELDS');
 check(u.serviceTier==null||u.serviceTier==='standard'||u.serviceTier==='unspecified','SERVICE_TIER');
 for(const k of ['promptTokenCount','candidatesTokenCount','totalTokenCount'])check(safe(u[k]),'COUNTERS');
 if(u.thoughtsTokenCount!=null)check(safe(u.thoughtsTokenCount),'COUNTERS');
 else check(!Object.hasOwn(u,'thoughtsTokenCount')||u.thoughtsTokenCount===null,'COUNTERS');
 for(const k of ['cachedContentTokenCount','toolUsePromptTokenCount'])check(u[k]==null||(safe(u[k])&&u[k]===0),'TOOL_CACHE');
 for(const [key,expected] of [['promptTokensDetails',u.promptTokenCount],['candidatesTokensDetails',u.candidatesTokenCount],
   ['cacheTokensDetails',0],['toolUsePromptTokensDetails',0]]){
   const d=u[key];if(d==null)continue;check(Array.isArray(d),'MODALITY');if(d.length===0)continue;
   check(d.every(x=>knownKeys(x,['modality','tokenCount'])&&x.modality==='TEXT'&&safe(x.tokenCount)),'MODALITY');
   check(d.reduce((n,x)=>n+BigInt(x.tokenCount),0n)===BigInt(expected),'MODALITY_TOTAL');
 }
 const p=BigInt(u.promptTokenCount),candidates=BigInt(u.candidatesTokenCount),total=BigInt(u.totalTokenCount);
 check(total>=p+candidates,'TOTAL');const combined=total-p,residual=combined-candidates;
 if(u.thoughtsTokenCount!=null)check(residual===BigInt(u.thoughtsTokenCount),'THOUGHTS_TOTAL');
 return {status:'CONDITIONAL_BOUND',policyHash:WIRE_V3_POLICY_HASH,rawUsage:safeRawUsage(u),
   reportedServiceTier:u.serviceTier??null,serviceTierBasis:u.serviceTier==null?'PINNED_REQUEST_DOCUMENTED_DEFAULT_NOT_BILLING_AUTH':
     u.serviceTier==='unspecified'?'DOCUMENTED_STANDARD_DEFAULT_NOT_BILLING_AUTH':'REPORTED_STANDARD_NOT_BILLING_AUTH',
   thoughtsFieldPresence:!Object.hasOwn(u,'thoughtsTokenCount')?'OMITTED':u.thoughtsTokenCount===null?'EXPLICIT_NULL':'REPORTED_INTEGER',
   derived:{combinedGeneratedUpperBoundTokens:Number(combined),nonCandidateResidualTokens:Number(residual),individualThoughtsReported:u.thoughtsTokenCount!=null},
   conditionalGenerationEstimateNanoUsd:String(p*300n+combined*2500n),invoiceVerified:false,providerHardCashCapVerified:false};
}
const codes=new Set(['MODEL','CANDIDATES','FINISH','SAFETY','TEXT_SCOPE','UNKNOWN_RESPONSE_FIELD','UNKNOWN_CANDIDATE_FIELD',
 'CONTINUATION','TOOL_METADATA','MEDIA_METADATA','USAGE_FIELDS','SERVICE_TIER','COUNTERS','TOOL_CACHE','MODALITY','MODALITY_TOTAL','TOTAL','THOUGHTS_TOTAL','JSON','SCHEMA'].map(s=>'E6_WV3_'+s));
const publicCode=e=>codes.has(e?.message)?e.message:'E6_WV3_UNKNOWN';
export async function assessReceivedResponseV3({response,corpusCase,goldCase,sourceId}){
 let quality={status:'UNSCORABLE',code:null,assessment:null};
 // This path never consumes usage, citation URIs, opaque signatures or external grounding as evidence.
 try{
   const text=receivedTextV3(response);let raw;try{raw=JSON.parse(text);}catch{throw Error('E6_WV3_JSON');}
   const ids=goldCase.topics.map(t=>t.topicId);
   check(knownKeys(raw,['topics'])&&Array.isArray(raw.topics)&&raw.topics.length===3
    &&new Set(raw.topics.map(t=>t?.topicId)).size===3&&raw.topics.every(t=>knownKeys(t,['topicId','state','evidence'])
      &&Object.keys(t).length===3&&ids.includes(t.topicId)&&['PRESENT','MISSING','UNCERTAIN','CONFLICT'].includes(t.state)
      &&(t.state==='PRESENT'?knownKeys(t.evidence,['quote','sourceId'])&&Object.keys(t.evidence).length===2
        &&typeof t.evidence.quote==='string'&&typeof t.evidence.sourceId==='string':t.evidence===null)),'SCHEMA');
   const a=await assessE6QualityResponse(corpusCase,raw,goldCase,sourceId);
   const falseHoldTopics=a.errors.filter(e=>e.startsWith('FALSE_HOLD:')).length;
   quality={status:a.status,code:null,responseSha256:sha(text),assessment:{errors:a.errors.length,
    falseHoldTopics,falseHoldCases:falseHoldTopics>0?1:0,normalControl:goldCase.normalControl,scoredTopics:3,
    correctTopicStates:goldCase.topics.filter(t=>a.result.topics.find(x=>x.topicId===t.topicId)?.state===t.state).length,
    expectedPresentTopics:goldCase.topics.filter(t=>t.state==='PRESENT').length,
    groundedPresentTopics:goldCase.topics.filter(t=>t.state==='PRESENT'&&a.result.topics.find(x=>x.topicId===t.topicId)?.state==='PRESENT'
      &&!a.errors.includes('EVIDENCE:'+t.topicId)&&!a.errors.includes('WRONG_TOPIC_EVIDENCE:'+t.topicId)).length}};
 }catch(e){quality.code=publicCode(e);}
 let usage;try{usage=deriveUsageV3(response);}catch(e){usage={status:'UNKNOWN',code:publicCode(e),rawUsage:safeRawUsage(response?.usageMetadata),
   conditionalGenerationEstimateNanoUsd:null,serviceTierObservation:tierObservation(response?.usageMetadata),invoiceVerified:false,providerHardCashCapVerified:false};}
 return {quality,usage,nextDispatchAllowed:quality.status!=='UNSCORABLE'&&usage.status==='CONDITIONAL_BOUND',
   usableForAcceptance:false,paymentAuthority:false,paymentAllowed:false};
}
