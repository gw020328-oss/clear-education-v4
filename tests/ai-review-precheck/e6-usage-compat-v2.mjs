// GenerateContent-only, text/no-tools/no-cache usage compatibility. Pure/offline.
import {readFileSync} from 'node:fs';
import {sha} from './e6-quality-plan.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
const evidence=readFileSync(new URL('./e6-usage-definition-evidence-v2.json',import.meta.url));
export const USAGE_V2_POLICY=Object.freeze({version:'clear-e6-generatecontent-usage-policy.2',
  evidenceSha256:sha(evidence),scope:'PINNED_SINGLE_TEXT_NO_TOOL_NO_CACHE_STANDARD',
  requiredReportedCounters:['promptTokenCount','candidatesTokenCount','totalTokenCount'],
  missingThoughts:'PRESERVE_NULL_DERIVE_TOTAL_MINUS_PROMPT',
  derivation:'COMBINED_GENERATED_CONSERVATIVE_BOUND_NOT_REPORTED_THOUGHTS',
  cost:'PROMPT_TIMES_300_PLUS_DERIVED_COMBINED_TIMES_2500_NANO_USD',
  invoiceVerified:false,providerHardCashCapVerified:false,retroactiveOldRunScoringAllowed:false});
export const USAGE_V2_POLICY_HASH=p0Hash('E6-GENERATECONTENT-USAGE-POLICY.2',USAGE_V2_POLICY);
const check=(c,code)=>{if(!c)throw Error(code);};
const safe=n=>Number.isSafeInteger(n)&&n>=0;
const scalarKeys=['promptTokenCount','candidatesTokenCount','thoughtsTokenCount','totalTokenCount'];
export const safeRawUsage=u=>Object.fromEntries(scalarKeys.map(k=>[k,safe(u?.[k])?u[k]:null]));
const exactTextPart=p=>p&&typeof p.text==='string'&&Object.keys(p).every(k=>k==='text');
export function validateUsageV2Scope(body,response){
  check(body&&Object.keys(body).every(k=>['systemInstruction','contents','generationConfig'].includes(k))
    &&Array.isArray(body.contents)&&body.contents.length===1&&body.contents[0].role==='user'
    &&Object.keys(body.contents[0]).sort().join(',')==='parts,role'
    &&Object.keys(body.systemInstruction??{}).join(',')==='parts'
    &&body.contents[0].parts?.length===1&&body.contents[0].parts.every(exactTextPart)
    &&body.systemInstruction?.parts?.length===1&&body.systemInstruction.parts.every(exactTextPart),'E6_UV2_REQUEST_SCOPE');
  const cfg=body.generationConfig;
  check(cfg&&Object.keys(cfg).sort().join(',')==='maxOutputTokens,responseMimeType,responseSchema,thinkingConfig'
    &&cfg.maxOutputTokens===1024&&cfg.responseMimeType==='application/json'
    &&Object.keys(cfg.thinkingConfig??{}).sort().join(',')==='includeThoughts,thinkingLevel'
    &&cfg.thinkingConfig?.thinkingLevel==='MINIMAL'&&cfg.thinkingConfig.includeThoughts===false,'E6_UV2_REQUEST_SCOPE');
  check(response?.modelVersion==='gemini-3.5-flash-lite'&&response.candidates?.length===1,'E6_UV2_RESPONSE_SCOPE');
  const c=response.candidates[0];
  for(const k of ['groundingMetadata','urlContextMetadata','citationMetadata','groundingAttributions'])
    check(c[k]==null,'E6_UV2_UNEXPECTED_FEATURE');
  check(c.content&&Object.keys(c.content).every(k=>['role','parts'].includes(k))&&(c.content.role==null||c.content.role==='model')&&Array.isArray(c.content.parts)
    &&c.content.parts.every(p=>p&&typeof p.text==='string'&&(p.thought===undefined||p.thought===false)
      &&Object.keys(p).every(k=>['text','thought','thoughtSignature'].includes(k))
      &&(p.thoughtSignature==null||typeof p.thoughtSignature==='string')),'E6_UV2_RESPONSE_SCOPE');
}
export function deriveUsageV2(body,response){
  validateUsageV2Scope(body,response);const u=response.usageMetadata;
  check(u&&typeof u==='object'&&!Array.isArray(u),'E6_UV2_USAGE_REQUIRED');
  const allowed=[...scalarKeys,'cachedContentTokenCount','toolUsePromptTokenCount','promptTokensDetails','cacheTokensDetails',
    'candidatesTokensDetails','toolUsePromptTokensDetails','serviceTier'];
  check(Object.keys(u).every(k=>allowed.includes(k)),'E6_UV2_UNKNOWN_USAGE_FIELD');
  for(const k of ['promptTokenCount','candidatesTokenCount','totalTokenCount'])check(safe(u[k]),'E6_UV2_COUNTER_REQUIRED');
  const presentThoughts=u.thoughtsTokenCount!=null;
  if(Object.hasOwn(u,'thoughtsTokenCount')&&u.thoughtsTokenCount!==null)
    check(safe(u.thoughtsTokenCount),'E6_UV2_COUNTER_INVALID');
  for(const k of ['cachedContentTokenCount','toolUsePromptTokenCount'])
    check(u[k]==null||(safe(u[k])&&u[k]===0),'E6_UV2_TOOL_OR_CACHE');
  for(const k of ['cacheTokensDetails','toolUsePromptTokensDetails'])
    check(u[k]==null||(Array.isArray(u[k])&&u[k].length===0),'E6_UV2_TOOL_OR_CACHE');
  check(u.serviceTier==null||u.serviceTier==='STANDARD','E6_UV2_SERVICE_TIER');
  for(const [key,countKey] of [['promptTokensDetails','promptTokenCount'],['candidatesTokensDetails','candidatesTokenCount']]){
    const details=u[key];if(details==null)continue;
    check(Array.isArray(details),'E6_UV2_MODALITY');if(details.length===0)continue;
    check(details.every(d=>d&&Object.keys(d).sort().join(',')==='modality,tokenCount'&&d.modality==='TEXT'&&safe(d.tokenCount)),'E6_UV2_MODALITY');
    check(details.reduce((n,d)=>n+BigInt(d.tokenCount),0n)===BigInt(u[countKey]),'E6_UV2_MODALITY_TOTAL');
  }
  const p=BigInt(u.promptTokenCount),c=BigInt(u.candidatesTokenCount),t=BigInt(u.totalTokenCount);
  check(t>=p+c,'E6_UV2_TOTAL_INCONSISTENT');const combined=t-p,residual=combined-c;
  check(combined<=BigInt(Number.MAX_SAFE_INTEGER)&&residual<=BigInt(Number.MAX_SAFE_INTEGER),'E6_UV2_OVERFLOW');
  if(presentThoughts)check(residual===BigInt(u.thoughtsTokenCount),'E6_UV2_THOUGHTS_INCONSISTENT');
  return {policyHash:USAGE_V2_POLICY_HASH,rawUsage:safeRawUsage(u),
    thoughtsFieldPresence:!Object.hasOwn(u,'thoughtsTokenCount')?'OMITTED':u.thoughtsTokenCount===null?'EXPLICIT_NULL':'REPORTED_INTEGER',
    measurement:presentThoughts?'DERIVED_TOTAL_WITH_EXPLICIT_THOUGHTS_CROSSCHECK':'DERIVED_TOTAL_BOUND_THOUGHTS_UNREPORTED',
    derived:{combinedGeneratedUpperBoundTokens:Number(combined),nonCandidateResidualTokens:Number(residual),
      basis:'REST_TOTAL_MINUS_PROMPT_UNDER_NO_TOOL_CACHE_TEXT_SCOPE',individualThoughtsReported:presentThoughts},
    conditionalGenerationEstimateNanoUsd:String(p*300n+combined*2500n),invoiceVerified:false,providerHardCashCapVerified:false};
}
