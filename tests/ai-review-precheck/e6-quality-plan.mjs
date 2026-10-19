// Offline request/approval material only. No transport, key or environment lookup.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {freeze,requireRule as check} from '../../src/policy/values.mjs';
import {p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
import {REFLECTION_INSTRUCTION,REFLECTION_PROMPT_VERSION,REFLECTION_PROFILE_HASH,REFLECTION_TOPICS,createBootcampReflectionSession} from '../../src/document-precheck/review/bootcamp-reflection.mjs';
import {E6_OPERATIONS_HASH} from '../../src/document-precheck/review/e6-leased-reflection.mjs';
import {bootcampFixture} from './bootcamp-fixture.mjs';
export const sha=v=>createHash('sha256').update(v).digest('hex');
export const E6_QUALITY_SCHEMA=freeze({type:'OBJECT',properties:{topics:{type:'ARRAY',items:{type:'OBJECT',properties:{
  topicId:{type:'STRING',enum:REFLECTION_TOPICS},state:{type:'STRING',enum:['PRESENT','MISSING','UNCERTAIN','CONFLICT']},
  evidence:{type:'OBJECT',nullable:true,properties:{sourceId:{type:'STRING'},quote:{type:'STRING'}},required:['sourceId','quote']},
},required:['topicId','state','evidence']}}},required:['topics']});
export const QUALITY_CONFIG=freeze({model:'gemini-3.5-flash-lite',candidateCount:1,maxOutputTokens:1024,temperature:0,
  thinkingConfig:{thinkingLevel:'MINIMAL',includeThoughts:false}});
export function loadE6QualityCorpus(){
  const corpusBytes=readFileSync(new URL('./e6-python-corpus.json',import.meta.url)),goldBytes=readFileSync(new URL('./e6-python-gold.json',import.meta.url));
  const corpus=JSON.parse(corpusBytes),gold=JSON.parse(goldBytes);
  check(corpus.synthetic===true&&corpus.cases.length===8&&gold.cases.length===8,'E6_QUALITY_CORPUS');
  check(new Set(corpus.cases.map(c=>c.caseId)).size===8&&new Set(gold.cases.map(c=>c.caseId)).size===8,'E6_QUALITY_CORPUS');
  for(const c of corpus.cases){
    check(typeof c.text==='string'&&c.text.length<=32000&&[1,2].includes(c.messageFormat),'E6_QUALITY_CORPUS');
    const g=gold.cases.find(g=>g.caseId===c.caseId);
    check(g?.topics.length===3&&new Set(g.topics.map(t=>t.topicId)).size===3,'E6_QUALITY_GOLD');
    for(const t of g.topics){
      check(REFLECTION_TOPICS.includes(t.topicId)&&['PRESENT','MISSING','UNCERTAIN','CONFLICT'].includes(t.state),'E6_QUALITY_GOLD');
      if(t.state==='PRESENT')check(typeof t.quote==='string'&&t.quote.length>0&&c.text.split(t.quote).length===2,'E6_QUALITY_GOLD');
      else check(t.quote===null,'E6_QUALITY_GOLD');
    }
  }
  return {corpus,gold,corpusSha256:sha(corpusBytes),goldSha256:sha(goldBytes)};
}
export function buildE6QualityRequest(c,sourceId){
  return {systemInstruction:{parts:[{text:REFLECTION_INSTRUCTION}]},
    contents:[{role:'user',parts:[{text:JSON.stringify({caseId:c.caseId,synthetic:true,topicIds:REFLECTION_TOPICS,
      source:{sourceId,kind:'TEXT',messageFormat:c.messageFormat,locationBasis:'ORIGINAL_REFLECTION_BODY_UTF16',normalizationApplied:false,text:c.text}})}]}],
    generationConfig:{candidateCount:QUALITY_CONFIG.candidateCount,maxOutputTokens:QUALITY_CONFIG.maxOutputTokens,temperature:QUALITY_CONFIG.temperature,
      thinkingConfig:QUALITY_CONFIG.thinkingConfig,responseMimeType:'application/json',responseSchema:E6_QUALITY_SCHEMA}};
}
export function prepareE6QualityPlan(){
  const loaded=loadE6QualityCorpus(),schemaHash=p0Hash('E6-QUALITY-SCHEMA',E6_QUALITY_SCHEMA),configHash=p0Hash('E6-QUALITY-CONFIG',QUALITY_CONFIG);
  const requests=loaded.corpus.cases.map(c=>{
    const body=buildE6QualityRequest(c,loaded.corpus.sourceId);
    return {caseId:c.caseId,maxInputTokens:3000,body,countTokensBody:{generateContentRequest:{model:'models/'+QUALITY_CONFIG.model,...body}}};
  });
  const evaluationProfileHash=p0Hash('E6-QUALITY-PROFILE',{version:'clear-e6-quality-evaluation-profile.1',
    baseReflectionProfileHash:REFLECTION_PROFILE_HASH,operationsProfileHash:E6_OPERATIONS_HASH,promptVersion:REFLECTION_PROMPT_VERSION,
    promptSha256:sha(REFLECTION_INSTRUCTION),schemaHash,configHash});
  const plan={version:'clear-e6-quality-approval-plan.1',status:'NOT_APPROVED_ACTUAL_BLOCKED',checkedAt:'2026-10-19',
    model:QUALITY_CONFIG.model,promptVersion:REFLECTION_PROMPT_VERSION,promptSha256:sha(REFLECTION_INSTRUCTION),
    baseReflectionProfileHash:REFLECTION_PROFILE_HASH,operationsProfileHash:E6_OPERATIONS_HASH,schemaHash,configHash,evaluationProfileHash,
    corpusSha256:loaded.corpusSha256,goldSha256:loaded.goldSha256,requestsSha256:sha(JSON.stringify(requests,null,2)+'\n'),
    caseCount:8,maximumGenerationCalls:8,maximumCountTokensCalls:8,maximumTotalRequests:16,automaticRetries:0,
    maxInputTokensPerCase:3000,maxOutputTokensPerCase:1024,maximumInputTokens:24000,maximumOutputTokens:8192,
    hardBudgetNanoUsd:'50000000',hardBudgetUsd:'0.05',generationReservationNanoUsd:'27680000',
    provisionalCountAllowanceNanoUsd:'7200000',provisionalTotalReservationNanoUsd:'34880000',
    standardPricing:{inputUsdPerMillion:'0.30',outputIncludingThinkingUsdPerMillion:'2.50',countTokensStandalonePrice:null,
      countTokensPriceStatus:'N/A_BILLING_FAQ_NAMES_GETTOKENS_NOT_EXPLICIT_REST_COUNTTOKENS'},
    officialSources:{checkedAt:'2026-10-19',model:'https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite',
      pricing:'https://ai.google.dev/gemini-api/docs/pricing',thinking:'https://ai.google.dev/gemini-api/docs/thinking',
      generationConfig:'https://ai.google.dev/api/generate-content',countTokens:'https://ai.google.dev/api/tokens',billing:'https://ai.google.dev/gemini-api/docs/billing'},
    executionPrerequisites:['EXPLICIT_NEW_USER_APPROVAL','RECHECK_PRICES_AND_COUNT_BILLING','VERIFY_COMBINED_OUTPUT_THINKING_CAP','PIN_EXACT_CODE_CORPUS_GOLD_PROMPT_SCHEMA_CONFIG_REQUESTS',
      'FRESH_PRIVATE_LEDGER_LEASE_AND_PRE_DISPATCH_CHECKPOINT','NO_RETRY_OR_CONTINUATION','STOP_ON_BUDGET_OR_UNKNOWN_COST'],
    actualGenerationCalls:0,actualCountTokensCalls:0,modelListApiCalls:0,keyReads:0,modelQuality:'N/A_NOT_RUN',
    paymentAllowed:false,usableForAcceptance:false};
  return freeze({plan:{...plan,planHash:p0Hash('E6-QUALITY-APPROVAL-PLAN',plan)},requests,gold:loaded.gold});
}
// Scoring checks literal evidence AND topic states/required supplements. A gold
// replay tests plumbing only; it is never a fresh model-quality measurement.
export async function assessE6QualityResponse(c,raw,expected,sourceId){
  const f=bootcampFixture({text:c.text});f.context.sourceId=sourceId;
  const session=createBootcampReflectionSession(()=>({context:f.context,rawAvailable:true}),{nowMs:()=>f.clock.value});
  const result=await session.review(f.input,{execution:'MOCK',modelVersion:f.context.modelVersion,observe:async()=>structuredClone(raw)});
  const errors=[];
  for(const e of expected.topics){const t=result.topics.find(t=>t.topicId===e.topicId);
    if(t?.state!==e.state)errors.push('STATE:'+e.topicId);
    if(e.state==='PRESENT'&&!t?.originalEvidenceLocator)errors.push('EVIDENCE:'+e.topicId);
    if(e.state==='PRESENT'&&t?.originalEvidenceLocator){
      const refStart=c.text.indexOf(e.quote),actual=t.originalEvidenceLocator;
      if(actual.start<refStart||actual.end>refStart+e.quote.length)errors.push('WRONG_TOPIC_EVIDENCE:'+e.topicId);
    }
    if(e.state!=='PRESENT'&&(!t?.supplement||t.originalEvidenceLocator!==null))errors.push('SUPPLEMENT:'+e.topicId);
    if(expected.normalControl&&t?.state!=='PRESENT')errors.push('FALSE_HOLD:'+e.topicId);
  }
  return {execution:'OFFLINE_RESPONSE_REPLAY',status:errors.length?'NEEDS_IMPROVEMENT':'PASS',errors,result};
}
