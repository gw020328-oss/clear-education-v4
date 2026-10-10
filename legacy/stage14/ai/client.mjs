import fs from 'node:fs';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {root,read,save,sha,safeCode} from '../lib/io.mjs';
import {proposalSchema,validateDraft,cases} from '../policy/product.mjs';
export const config={model:'gemini-3.8-flash',endpoint:'https://generativelanguage.googleapis.com/v1beta/interactions',thinkingLevel:'low',maxOutputTokens:4096,maxTransmissions:6,maxEstimatedCostUSD:1,inputPrice:0.75,outputPrice:3.75};
const system='You structure refund notices into reviewable DRAFTS, not decisions. Return PolicyProposalV1 JSON only. Extract exactly the ten requested fields; value must be a short exact substring of cited source spans. Never invent a value. Missing fields use value:null,status:UNSUPPORTED,sourceSpanIds:[] and appear in unsupported and ambiguities with a Korean question. Conflicting amounts or dates must also be null/UNSUPPORTED with a Korean clarification question. DIRECT requires actual sourceSpanIds. Do not resolve conflicts yourself. No runtime, signatures, legal decisions or payment authority. Output under 1800 tokens.';
export function bodyFor(source,smoke=false){return {model:config.model,system_instruction:smoke?'Neutral format smoke. Return {"ok":true}.':system,input:smoke?'Return the one-field JSON object.':JSON.stringify(source),generation_config:{thinking_level:'low',max_output_tokens:smoke?64:4096},response_format:{type:'text',mime_type:'application/json',schema:smoke?{type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false}:proposalSchema},stream:false,store:false,background:false};}
export const estimate=body=>Buffer.byteLength(JSON.stringify(body))*.75/1e6+body.generation_config.max_output_tokens*3.75/1e6;
export const retryable=(status,network)=>[429,500,502,503,504].includes(status)||status===null&&['CONNECTION_RESET','NETWORK_TIMEOUT'].includes(network);
export function classify(status,envelope,smoke=false){if(status!==200)return 'TRANSPORT_PROVIDER_FAILURE';if(envelope?.model!==config.model)return 'MODEL_MISMATCH';if(envelope?.status==='incomplete'||envelope?.status!=='completed')return 'MODEL_OUTPUT_INCOMPLETE';
 const parts=envelope?.steps?.filter(s=>s.type==='model_output').flatMap(s=>(s.content??[]).filter(c=>c.type==='text').map(c=>c.text))??[];
 const u=envelope?.usage,output=u?.total_output_tokens??0,thinking=u?.total_thought_tokens??0;if(output+(u?.total_tokens===u?.total_input_tokens+output?0:thinking)>(smoke?64:4096))return 'MODEL_OUTPUT_INCOMPLETE';
 let parsed;try{parsed=JSON.parse(parts.join(''));}catch(e){return /Unexpected end|Unterminated/.test(e.message)?'MODEL_OUTPUT_INCOMPLETE':'JSON_SCHEMA_FAILURE';}return {parsed};}
const ledger=()=>{const dir=resolve(root,'artifacts/ai');return fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>/^attempt-\d+\.reserved\.json$/.test(f)).map(f=>read('artifacts/ai/'+f)):[];};
export function budget(){const entries=ledger();let estimatedCostUSD=0;for(const e of entries){const p=resolve(root,`artifacts/ai/attempt-${e.number}.json`);const result=fs.existsSync(p)?JSON.parse(fs.readFileSync(p)):null;estimatedCostUSD+=Math.max(e.estimatedCostUSD,result?.usageEstimatedCostUSD??0);}return {httpTransmissions:entries.length,estimatedCostUSD,actualBilledCostUSD:null,keyPresent:Boolean(process.env.GEMINI_API_KEY)};}
function secretIn(x){const key=process.env.GEMINI_API_KEY;return Boolean(key&&x.includes(key))||/\bAIza[\w-]{20,}\b/.test(x);}
export async function callGemini(source,{smoke=false,caseId='interactive'}={}){
 if(!process.env.GEMINI_API_KEY)return {status:'AI_KEY_UNAVAILABLE',live:false};
 if(process.env.GOOGLE_API_KEY)return {status:'AMBIGUOUS_CREDENTIAL',live:false};
 if(!smoke&&!cases.some(c=>c.source.text===source.text))return {status:'FIXED_DEMO_CASES_ONLY',live:false};
 fs.mkdirSync(resolve(root,'artifacts/ai'),{recursive:true});const guard=resolve(root,'artifacts/ai/request.lock');let fd;try{fd=fs.openSync(guard,'wx',0o600);}catch{return {status:'AI_BUSY',live:false};}
 try{
  const smokePath=resolve(root,'artifacts/ai/smoke.json');if(!smoke&&(!fs.existsSync(smokePath)||read('artifacts/ai/smoke.json').status!=='VALID'))return {status:'SMOKE_NOT_VALID',live:false};
  if(smoke&&fs.existsSync(smokePath))return {...read('artifacts/ai/smoke.json'),reused:true,live:false};
  const body=bodyFor(source,smoke),serialized=JSON.stringify(body),cost=estimate(body);let last=null;
  for(let attempt=1;attempt<=2;attempt++){
   const before=budget();if(before.httpTransmissions>=6||before.estimatedCostUSD+cost>1){last={status:'AI_BUDGET_LIMIT',live:false};break;}
   const number=before.httpTransmissions+1,startedAt=new Date().toISOString();save(`artifacts/ai/attempt-${number}.reserved.json`,{number,attempt,caseId,smoke,startedAt,estimatedCostUSD:cost,estimatedCostBeforeUSD:before.estimatedCostUSD,requestSha256:sha(serialized)});save(`artifacts/ai/attempt-${number}.request.json`,serialized);
   let status=null,raw='',envelope=null,network=null,retryAfter=null;const start=performance.now();
   try{const response=await fetch(config.endpoint,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','x-goog-api-key':process.env.GEMINI_API_KEY},body:serialized,signal:AbortSignal.timeout(120000)});status=response.status;retryAfter=response.headers.get('retry-after');raw=await response.text();}catch(e){network=e.name==='TimeoutError'||/TIMEOUT/.test(e.cause?.code??'')?'NETWORK_TIMEOUT':e.cause?.code==='ECONNRESET'?'CONNECTION_RESET':'OTHER_NETWORK_ERROR';}
   if(secretIn(raw)){last={status:'SECRET_RESPONSE_WITHHELD',live:false};save(`artifacts/ai/attempt-${number}.json`,{number,...last});break;}
   save(`artifacts/ai/attempt-${number}.response.txt`,raw);try{envelope=JSON.parse(raw);}catch{}
   const classified=classify(status,envelope,smoke);let resultStatus=typeof classified==='string'?classified:'VALID',errors=[];
   if(typeof classified==='object'){errors=smoke?(JSON.stringify(classified.parsed)==='{"ok":true}'?[]:['SMOKE_SCHEMA']):validateDraft(classified.parsed,source);if(errors.length)resultStatus='JSON_SCHEMA_FAILURE';}
   const usage=envelope?.usage??null,usageEstimatedCostUSD=usage&&Number.isFinite(usage.total_input_tokens)&&Number.isFinite(usage.total_output_tokens)?(usage.total_input_tokens*.75+(usage.total_output_tokens+(usage.total_tokens===usage.total_input_tokens+usage.total_output_tokens?0:usage.total_thought_tokens??0))*3.75)/1e6:null;
   const retryDelayMs=Math.max(30000,retryAfter?(Number.isFinite(Number(retryAfter))?Number(retryAfter)*1000:Date.parse(retryAfter)-Date.now()):0);
   last={status:resultStatus,live:true,number,attempt,caseId,smoke,httpStatus:status,networkCode:network,actualModel:envelope?.model??null,interactionStatus:envelope?.status??null,parsed:typeof classified==='object'?classified.parsed:null,errors,usage,usageEstimatedCostUSD,estimatedCostUSD:cost,startedAt,endedAt:new Date().toISOString(),latencyMs:performance.now()-start,retryDelayMs,actualBilledCostUSD:null,billingTier:'NOT_INDEPENDENTLY_VERIFIED',rawResponseSha256:sha(raw)};
   save(`artifacts/ai/attempt-${number}.json`,last);
   if(status===429&&/free_tier/i.test(raw)){last={...last,status:'WRONG_BILLING_PROJECT'};break;}
   if(attempt===2||!retryable(status,network))break;
   let remaining=retryDelayMs;while(remaining>0){await delay(Math.min(remaining,30000));remaining-=30000;}
  }
  if(smoke)save('artifacts/ai/smoke.json',last);return last;
 }finally{fs.closeSync(fd);fs.unlinkSync(guard);}
}
