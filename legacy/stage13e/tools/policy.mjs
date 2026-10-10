import {schema,validate,score,fields} from '../../stage12/protocol-v3/tools/score.mjs';
import {requestFor,dataset} from '../../stage12/protocol-v3/tools/run.mjs';
import {read,jsonl,need} from './io.mjs';
export const settings=Object.freeze({provider:'GOOGLE',endpoint:'https://generativelanguage.googleapis.com/v1beta/interactions',model:'gemini-3.8-flash',thinking_level:'medium',max_output_tokens:4096,stream:false,store:false,background:false,previous_interaction_id:'omitted',tools:'omitted',seed:'not_sent',temperature:'provider_default',top_p:'provider_default',top_k:'provider_default',parallelCalls:1,minimumIntervalMs:30000,maxAttempts:3,retryWaitMs:[30000,60000],timeoutMs:600000});
export const pricing=Object.freeze({input_usd_per_1m_tokens:0.75,output_including_thinking_usd_per_1m_tokens:3.75,maximum_authorized_estimated_cost_usd:3});
export const authorization=Object.freeze({approved:true,provider:'GOOGLE',route:'GEMINI_API_PAID_TIER',model:'gemini-3.8-flash',thinking_level:'medium',api_key_environment_variable:'GEMINI_API_KEY',allow_paid_api:true,allow_free_api:false,maximum_authorized_estimated_cost_usd:3.00,allow_billing_changes:false,allow_model_download:false,allow_new_api_key_creation:false});
export function buildBody(system,input,wire){const body={model:settings.model,system_instruction:system,input,generation_config:{thinking_level:'medium',max_output_tokens:4096},response_format:{type:'text',mime_type:'application/json',schema:wire},stream:false,store:false,background:false};need(Buffer.byteLength(JSON.stringify(body))<=128000,'REQUEST_LIMIT');return body;}
export function semanticBody(row,wire){const original=requestFor(row,settings.model);return buildBody(original.messages[0].content,original.messages[1].content,wire);}
export function smokeBody(wire){return buildBody('Neutral formatting smoke only. No refund policy is supplied. Return a JSON object with classification CLARIFICATION_REQUIRED, all ten fields NOT_STATED with value null and spanIds [], and ambiguities [], clarificationQuestions [], unsupportedConditions []. Do not add any other fields.','This is a public synthetic empty-input formatting test. Produce the empty policy object described in the system instruction.',wire);}
export const conservativeCost=bodyString=>Buffer.byteLength(bodyString)*pricing.input_usd_per_1m_tokens/1e6+4096*pricing.output_including_thinking_usd_per_1m_tokens/1e6;
export function usageCost(usage){
 if(!usage||!Number.isFinite(usage.total_input_tokens)||!Number.isFinite(usage.total_output_tokens))return null;
 const input=usage.total_input_tokens,output=usage.total_output_tokens,thinking=Number.isFinite(usage.total_thought_tokens)?usage.total_thought_tokens:null,total=usage.total_tokens;
 // Reconcile provider totals to avoid counting thinking twice where totals include it.
 let billedOutput=output,interpretation='OUTPUT_TOTAL';
 if(thinking!==null&&thinking>0){if(Number.isFinite(total)&&total===input+output){interpretation='THINKING_INCLUDED_IN_OUTPUT_TOTAL';}else{billedOutput=output+thinking;interpretation='OUTPUT_PLUS_SEPARATE_THINKING_CONSERVATIVE';}}
 return {estimatedCostUSD:(input*pricing.input_usd_per_1m_tokens+billedOutput*pricing.output_including_thinking_usd_per_1m_tokens)/1e6,inputTokens:input,outputTokens:output,thinkingTokens:thinking,billedOutputTokens:billedOutput,interpretation};
}
export function decode(raw){let envelope;try{envelope=JSON.parse(raw);}catch{return {envelope:null,parsed:null,parseStatus:'NOT_PARSED',parseError:'ENVELOPE_JSON_INVALID'};}
 const blocks=Array.isArray(envelope?.steps)?envelope.steps.filter(s=>s.type==='model_output').flatMap(s=>Array.isArray(s.content)?s.content.filter(c=>c.type==='text'&&typeof c.text==='string').map(c=>c.text):[]):[];
 if(!blocks.length)return {envelope,parsed:null,parseStatus:'NOT_PARSED',parseError:'NO_MODEL_OUTPUT_TEXT'};
 try{return {envelope,parsed:JSON.parse(blocks.join('')),parseStatus:'PARSED',parseError:null};}catch{return {envelope,parsed:null,parseStatus:'NOT_PARSED',parseError:'MODEL_OUTPUT_JSON_INVALID'};}
}
export function validateParsed(parsed,wire,parseStatus){if(parseStatus!=='PARSED')return {wireSchemaStatus:'NOT_VALIDATED',authoritativeSchemaStatus:'NOT_VALIDATED',wireErrors:[],authoritativeErrors:[]};const wireErrors=validate(wire,parsed),authoritativeErrors=validate(schema,parsed);return {wireSchemaStatus:wireErrors.length?'INVALID':'VALID',authoritativeSchemaStatus:authoritativeErrors.length?'INVALID':'VALID',wireErrors,authoritativeErrors};}
export function retryable(status,networkCode){return [429,500,502,503,504].includes(status)||status===null&&['CONNECTION_RESET','NETWORK_TIMEOUT'].includes(networkCode);}
export const wrongBilling=(status,raw)=>status===429&&/free_tier|generate_content_free_tier_requests/i.test(raw);
export function retryHintMs(header,raw,endedAt){let result=0;if(header){const seconds=Number(header);result=Number.isFinite(seconds)?Math.max(0,seconds*1000):Math.max(0,Date.parse(header)-Date.parse(endedAt))||0;}
 let value;try{value=JSON.parse(raw);}catch{}
 const walk=x=>{if(!x||typeof x!=='object')return;for(const[k,v]of Object.entries(x)){if(/retry.?delay|retry.?after/i.test(k)){if(typeof v==='string'&&/^\d+(\.\d+)?s$/.test(v))result=Math.max(result,Number(v.slice(0,-1))*1000);else if(typeof v==='number'&&Number.isFinite(v))result=Math.max(result,v*1000);else if(v&&typeof v==='object'&&Number.isFinite(Number(v.seconds)))result=Math.max(result,Number(v.seconds)*1000+Number(v.nanos??0)/1e6);}walk(v);}};walk(value);
 for(const match of raw.matchAll(/(?:retry|try again)\s+(?:after|in)\s+(\d+(?:\.\d+)?)\s*(seconds?|s|minutes?|m)\b/gi))result=Math.max(result,Number(match[1])*(match[2].toLowerCase().startsWith('m')?60000:1000));
 return Math.ceil(result);
}
export function evaluate(attempt,row,wire){const parsed=attempt?.parsed??null,validation=validateParsed(parsed,wire,attempt?.parseStatus);
 const transportFailure=Boolean(!attempt||attempt.httpStatus!==200||attempt.actualModel!==settings.model||attempt.interactionStatus!=='completed'||attempt.envelopeErrorCount>0||attempt.rawResponseWithheld);
 let scoringStatus=transportFailure?'TRANSPORT_FAILURE':attempt.parseStatus!=='PARSED'?'JSON_PARSE_FAILURE':validation.authoritativeSchemaStatus==='INVALID'?'SCHEMA_INVALID':validation.wireSchemaStatus==='INVALID'?'WIRE_SCHEMA_INVALID':'SCORED';
 let judged=null;if(row){const source=dataset.find(d=>d.sourceId===row.sourceId),reference=jsonl('stage12/protocol-v3/REFERENCE_LABELS.jsonl').find(r=>r.sourceId===row.sourceId);judged=score(transportFailure?null:parsed,reference,source);if(scoringStatus==='SCORED')scoringStatus=judged.outcome;}
 return {parsed,parseStatus:attempt?.parseStatus??'NOT_PARSED',...validation,transportFailure,scoringStatus,score:judged};
}
export function smokePass(logical){return !logical.transportFailure&&logical.parseStatus==='PARSED'&&logical.wireSchemaStatus==='VALID'&&logical.authoritativeSchemaStatus==='VALID'&&fields.every(f=>logical.parsed.fields[f].status==='NOT_STATED');}
