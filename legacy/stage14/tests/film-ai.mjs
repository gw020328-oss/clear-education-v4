// Two further filming calls authorized by the user, USD 0.06 total maximum.
// Original six-call client and COST_LOCK are historical and unchanged.
import fs from 'node:fs';
import {resolve} from 'node:path';
import {root,read,save,sha} from '../lib/io.mjs';
import {bodyFor,classify,estimate,config,budget} from '../ai/client.mjs';
import {cases,validateDraft} from '../policy/product.mjs';
export {budget};
export async function callGemini(source,{caseId='conflict'}={}){
 if(!process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY)return {status:'AI_KEY_UNAVAILABLE',live:false};
 if(source.text!==cases.find(x=>x.id==='conflict').source.text)return {status:'FILM_FIXED_CASE_ONLY',live:false};
 caseId='conflict';
 const authPath='artifacts/clear-video-success-authorization.json',authorization=read(authPath);
 if(!authorization.userApproved||authorization.additionalHTTPTransmissions!==2||authorization.maximumAdditionalUSD!==.06)return {status:'FILM_AUTHORIZATION_INVALID',live:false};
 const before=budget(),body=bodyFor(source),serialized=JSON.stringify(body),cost=estimate(body);
 const added=[8,9].filter(n=>fs.existsSync(resolve(root,`artifacts/ai/attempt-${n}.reserved.json`)));
 if(added.some(n=>fs.existsSync(resolve(root,`artifacts/ai/attempt-${n}.json`))&&read(`artifacts/ai/attempt-${n}.json`).status==='VALID'))return {status:'FILM_SUCCESS_ALREADY_RECORDED',live:false};
 const spent=added.reduce((s,n)=>s+Math.max(read(`artifacts/ai/attempt-${n}.reserved.json`).estimatedCostUSD,fs.existsSync(resolve(root,`artifacts/ai/attempt-${n}.json`))?read(`artifacts/ai/attempt-${n}.json`).usageEstimatedCostUSD??0:0),0);
 if(before.httpTransmissions<7||before.httpTransmissions>=9||cost>.03||spent+cost>.06)return {status:'AI_BUDGET_LIMIT',live:false};
 if(added.length&&Date.now()-Date.parse(read(`artifacts/ai/attempt-${added.at(-1)}.json`).endedAt)<60000)return {status:'FILM_RETRY_WAIT_REQUIRED',live:false};
 const guard=resolve(root,'artifacts/ai/request.lock');let fd;try{fd=fs.openSync(guard,'wx',0o600);}catch{return {status:'AI_BUSY',live:false};}
 try{
  if(budget().httpTransmissions!==before.httpTransmissions)return {status:'AI_BUDGET_LIMIT',live:false};
  const number=before.httpTransmissions+1,attempt=number-7,smoke=false,startedAt=new Date().toISOString(),stem=`artifacts/ai/attempt-${number}`;
  save(stem+'.reserved.json',{number,attempt,caseId,smoke,startedAt,estimatedCostUSD:cost,estimatedCostBeforeUSD:before.estimatedCostUSD,requestSha256:sha(serialized),authorization:authPath});
  save(stem+'.request.json',serialized);let status=null,raw='',envelope=null,networkCode=null;const start=performance.now();
  try{const response=await fetch(config.endpoint,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','x-goog-api-key':process.env.GEMINI_API_KEY},body:serialized,signal:AbortSignal.timeout(120000)});status=response.status;raw=await response.text();}catch{networkCode='FILM_TRANSPORT_FAILURE';}
  if(raw.includes(process.env.GEMINI_API_KEY)||/\bAIza[\w-]{20,}\b/.test(raw)){save(stem+'.json',{number,attempt,caseId,smoke,status:'SECRET_RESPONSE_WITHHELD',live:false,actualBilledCostUSD:null});return {status:'SECRET_RESPONSE_WITHHELD',live:false};}
  save(stem+'.response.txt',raw);try{envelope=JSON.parse(raw);}catch{}
  const parsed=classify(status,envelope),errors=typeof parsed==='object'?validateDraft(parsed.parsed,source):[];
  const usage=envelope?.usage??null,usageEstimatedCostUSD=usage?(usage.total_input_tokens*.75+(usage.total_output_tokens+(usage.total_tokens===usage.total_input_tokens+usage.total_output_tokens?0:usage.total_thought_tokens??0))*3.75)/1e6:null;
  const result={number,attempt,caseId,smoke,httpStatus:status,networkCode,status:typeof parsed==='string'?parsed:errors.length?'JSON_SCHEMA_FAILURE':'VALID',live:true,actualModel:envelope?.model??null,interactionStatus:envelope?.status??null,parsed:typeof parsed==='object'?parsed.parsed:null,errors,usage,usageEstimatedCostUSD,estimatedCostUSD:cost,startedAt,endedAt:new Date().toISOString(),latencyMs:performance.now()-start,retryDelayMs:0,actualBilledCostUSD:null,billingTier:'NOT_INDEPENDENTLY_VERIFIED',rawResponseSha256:sha(raw),authorization:authPath,retriesAllowed:0};
  save(stem+'.json',result);return result;
 }finally{fs.closeSync(fd);fs.unlinkSync(guard);}
}
