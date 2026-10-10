// Independent, read-only reconstruction. No client/budget, network or credential imports.
import fs from 'node:fs';
import {resolve} from 'node:path';
import {root,read,sha} from '../lib/io.mjs';
export const changedExistingFiles=['README.md','DECISION.md','AI_ROLE_AND_LIMITS.md','EVIDENCE_MAP.md','DEMO_SCRIPT.md','tests/verify.mjs','artifacts/FINAL_SELECTION.json','checksums.sha256'];
export const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export const need=(ok,code)=>{if(!ok)throw Error(code);};
const usd=n=>Number(n)/1e9;
// Integer nano-USD arithmetic; tolerance only compares historical IEEE-754 fields.
const matches=(value,n)=>typeof value==='number'&&Math.abs(value-usd(n))<=Number.EPSILON;
const bytes=p=>fs.readFileSync(resolve(root,p));
const hash=p=>sha(bytes(p));
export function reconstructLedger(at,source={bytes,names:()=>fs.readdirSync(resolve(root,'artifacts/ai'))}){
 const get=p=>JSON.parse(source.bytes(p));
 const extensions=['.json','.request.json','.reserved.json','.response.txt'];
 const expected=Array.from({length:6},(_,i)=>extensions.map(ext=>`attempt-${i+1}${ext}`)).flat().sort();
 need(same(source.names().filter(p=>p.startsWith('attempt-')).sort(),expected),'ATTEMPT_FILE_SET');
 const lock=get('ai/COST_LOCK.json');
 need(lock.config.model==='gemini-3.8-flash'&&lock.config.inputPrice===.75&&lock.config.outputPrice===3.75&&lock.authorization.maximumHTTPTransmissions===6&&lock.authorization.maximumUSD===1,'COST_LOCK_CHANGED');
 let conservative=0n,usageTotal=0n;const attempts=[];
 for(let number=1;number<=6;number++){
  const stem=`artifacts/ai/attempt-${number}`,result=get(stem+'.json'),reserved=get(stem+'.reserved.json'),requestBytes=source.bytes(stem+'.request.json'),body=JSON.parse(requestBytes),raw=source.bytes(stem+'.response.txt'),envelope=JSON.parse(raw),usage=envelope.usage??null;
  const expectedCase=['smoke','complete','missing','conflict','conflict','complete'][number-1],logicalAttempt=number===5?2:1;
  for(const item of [result,reserved])need(item.number===number&&item.attempt===logicalAttempt&&item.caseId===expectedCase&&item.smoke===(number===1),'ATTEMPT_IDENTITY');
  need(reserved.startedAt===result.startedAt&&Date.parse(result.endedAt)>=Date.parse(result.startedAt),'ATTEMPT_TIME');
  need(body.model===lock.config.model&&body.generation_config.thinking_level==='low'&&body.generation_config.max_output_tokens===(number===1?64:4096),'MODEL_SETTINGS');
  need(!body.headers&&!body.tools&&!body.previous_interaction_id&&body.store===false&&body.stream===false&&body.background===false,'PROHIBITED_REQUEST_CAPABILITY');
  need(requestBytes.toString()===JSON.stringify(body)&&reserved.requestSha256===sha(requestBytes)&&result.rawResponseSha256===sha(raw),'RAW_REQUEST_RESPONSE_HASH');
  const estimated=BigInt(requestBytes.length)*750n+BigInt(body.generation_config.max_output_tokens)*3750n;
  let usageNano=null,billableOutputTokens=null;
  if(usage!==null){
   need(['total_input_tokens','total_output_tokens','total_tokens'].every(k=>Number.isSafeInteger(usage[k])&&usage[k]>=0)&&Number.isSafeInteger(usage.total_thought_tokens??0)&&(usage.total_thought_tokens??0)>=0,'USAGE_TOKEN_FIELDS');
   billableOutputTokens=usage.total_output_tokens+(usage.total_tokens===usage.total_input_tokens+usage.total_output_tokens?0:usage.total_thought_tokens??0);
   usageNano=BigInt(usage.total_input_tokens)*750n+BigInt(billableOutputTokens)*3750n;
  }
  need(same(result.usage,usage)&&(usageNano===null?result.usageEstimatedCostUSD===null:matches(result.usageEstimatedCostUSD,usageNano)),'USAGE_COST_MISMATCH');
  need(matches(result.estimatedCostUSD,estimated)&&matches(reserved.estimatedCostUSD,estimated)&&matches(reserved.estimatedCostBeforeUSD,conservative),'RESERVATION_COST_MISMATCH');
  need(result.actualBilledCostUSD===null&&result.live===true&&result.httpStatus===(number===4?500:200)&&result.status===(number===4?'TRANSPORT_PROVIDER_FAILURE':'VALID'),'RECORDED_RESULT_MISMATCH');
  need(result.actualModel===(envelope.model??null)&&result.interactionStatus===(envelope.status??null),'RESPONSE_METADATA_MISMATCH');
  if(number!==4)need(envelope.model===lock.config.model&&envelope.status==='completed','RESPONSE_MODEL_STATUS');
  if(number>1)need(Date.parse(result.startedAt)>=Date.parse(get(`artifacts/ai/attempt-${number-1}.json`).endedAt),'ATTEMPT_ORDER');
  need(conservative+estimated<=1000000000n,'BUDGET_EXCEEDED');
  const before=conservative;conservative+=usageNano!==null&&usageNano>estimated?usageNano:estimated;usageTotal+=usageNano??0n;
  need(conservative<=1000000000n,'USAGE_BUDGET_EXCEEDED');
  attempts.push({number,caseId:expectedCase,attempt:logicalAttempt,smoke:number===1,httpStatus:result.httpStatus,status:result.status,startedAt:result.startedAt,endedAt:result.endedAt,phase:number<=5?'EVALUATION_AT_FREEZE':'POST_FREEZE_LIVE_DEMO',estimatedCostBeforeUSD:usd(before),estimatedCostUSD:usd(estimated),usageEstimatedCostUSD:usageNano===null?null:usd(usageNano),actualBilledCostUSD:null,requestBytes:requestBytes.length,usageTokens:usage===null?null:{input:usage.total_input_tokens,output:usage.total_output_tokens,thought:usage.total_thought_tokens??0,billableOutput:billableOutputTokens},conservativeNanoUSD:(usageNano!==null&&usageNano>estimated?usageNano:estimated).toString(),usageNanoUSD:usageNano?.toString()??null,rawFilesSha256:Object.fromEntries(extensions.map(ext=>[stem+ext,sha(source.bytes(stem+ext))]))});
 }
 const fourth=get('artifacts/ai/attempt-4.json'),fifth=get('artifacts/ai/attempt-5.json');
 need(source.bytes('artifacts/ai/attempt-4.request.json').equals(source.bytes('artifacts/ai/attempt-5.request.json'))&&Date.parse(fifth.startedAt)-Date.parse(fourth.endedAt)>=Math.max(30000,fourth.retryDelayMs),'RETRY_POLICY');
 const evaluation=get('artifacts/ai/product-evaluation.json'),snapshot=get('artifacts/final-snapshot.json');
 need(Date.parse(attempts[4].endedAt)<=Date.parse(evaluation.at)&&Date.parse(evaluation.at)<=Date.parse(snapshot.at)&&Date.parse(snapshot.at)<Date.parse(attempts[5].startedAt),'FREEZE_CHRONOLOGY');
 const aggregate=items=>{const cost=items.reduce((s,t)=>s+BigInt(t.conservativeNanoUSD),0n),used=items.reduce((s,t)=>s+BigInt(t.usageNanoUSD??0),0n);return {attemptNumbers:items.map(t=>t.number),httpTransmissions:items.length,retries:items.filter(t=>t.attempt===2).length,estimatedCostUSD:usd(cost),usageEstimatedCostUSD:usd(used),usageAvailableTransmissions:items.filter(t=>t.usageNanoUSD!==null).length,conservativeNanoUSD:cost.toString(),usageNanoUSD:used.toString(),actualBilledCostUSD:null};};
 return {at,provider:'Google',model:lock.config.model,method:'READ_ONLY_RAW_FILE_RECONSTRUCTION',externalAPICalls:0,newTransactions:0,credentialEnvironmentRead:false,priceBasis:'Historical ai/COST_LOCK.json; not a new price or billing verification',arithmetic:{unit:'nano-USD',inputPerByteOrToken:750,outputPerToken:3750,reservation:'request UTF-8 bytes as input bound plus max output tokens',usage:'recorded top-level input/output tokens; add thought tokens only when not already included',conservative:'sum(max(request reservation, available usage estimate))',missingUsage:'null; HTTP 500 remains covered by its reservation',historicalFloatComparisonTolerance:Number.EPSILON},attemptNumbers:attempts.map(t=>t.number),evaluationAttemptNumbers:[1,2,3,4,5],postFreezeDemoAttemptNumbers:[6],productCaseCount:3,attempt6IncludedInProductEvaluation:false,attempt6IncludedInCache:false,attempt6AddsIndependentCaseOrPerformanceClaim:false,evaluationFrozenAt:evaluation.at,firstSnapshotAt:snapshot.at,evaluationBudgetAtFreeze:aggregate(attempts.slice(0,5)),postFreezeDemoBudget:aggregate(attempts.slice(5)),lifecycleBudgetFinal:aggregate(attempts),limits:{maxTransmissions:6,maxEstimatedCostUSD:1,transmissionCapRespected:attempts.length<=6,costCapRespected:conservative<=1000000000n,remainingTransmissions:6-attempts.length},productEvaluationSha256:sha(source.bytes('artifacts/ai/product-evaluation.json')),cacheSha256:sha(source.bytes('ai/cached-examples.json')),costLockSha256:sha(source.bytes('ai/COST_LOCK.json')),attempts};
}
export function verifyEvaluationPrefix(ledger){
 const e=read('artifacts/ai/product-evaluation.json'),cache=read('ai/cached-examples.json'),prefix=ledger.evaluationBudgetAtFreeze;
 need(same(e.cases.map(c=>[c.caseId,c.httpNumber]),[['complete',2],['missing',3],['conflict',5]]),'EVALUATION_CASE_REFERENCES');
 need(e.budget.httpTransmissions===prefix.httpTransmissions&&Math.abs(e.budget.estimatedCostUSD-prefix.estimatedCostUSD)<=Number.EPSILON&&e.budget.actualBilledCostUSD===null,'EVALUATION_PREFIX_BUDGET');
 need(same(cache.examples.map(c=>[c.id,c.attempt]),[['complete',2],['missing',3],['conflict',5]]),'CACHE_PREFIX_REFERENCES');
 need(read('artifacts/ai/smoke.json').number===1&&read('artifacts/ai/smoke.json').smoke===true,'SMOKE_REFERENCE');
 const original=read('artifacts/reconciliation/pre-edit-hashes.json').files;
 for(const p of ['artifacts/ai/product-evaluation.json','ai/cached-examples.json','ai/cache-checksum.json'])need(hash(p)===original[p],'EVALUATION_OR_CACHE_CHANGED');
 return {productCases:3,productAttemptNumbers:[2,3,5],postFreezeDemoExcluded:true,evaluationBudgetAtFreeze:prefix,lifecycleBudgetFinal:ledger.lifecycleBudgetFinal};
}
