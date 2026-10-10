import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {settings,authorization,pricing,semanticBody,smokeBody,conservativeCost,usageCost,decode,evaluate,retryable,retryHintMs,wrongBilling,smokePass} from './policy.mjs';
import {read,text,save,exists,need,sha,fileSha,integrity,manifestCheck,listFiles,stage} from './io.mjs';

export function credentialGate(){const gemini=Boolean(process.env.GEMINI_API_KEY),google=Boolean(process.env.GOOGLE_API_KEY);return google?(gemini?'BLOCKED_AMBIGUOUS_GOOGLE_CREDENTIAL':'BLOCKED_WRONG_KEY_VARIABLE'):gemini?'PASS':'AWAITING_GEMINI_API_KEY';}
function containsCredential(raw){const key=process.env.GEMINI_API_KEY;return Boolean(key&&raw.includes(key))||/\bAIza[0-9A-Za-z_-]{20,}\b/.test(raw)||/["'](?:x-goog-api-key|authorization)["']\s*:\s*["'][^"']+["']/i.test(raw);}
function safeNetworkCode(error){if(error?.name==='TimeoutError'||['ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT'].includes(error?.cause?.code))return 'NETWORK_TIMEOUT';if(error?.cause?.code==='ECONNRESET')return 'CONNECTION_RESET';return 'OTHER_NETWORK_ERROR';}
const state={completedLogicalCalls:0,semanticTransmissions:0,smokeTransmissions:0,retries:0,estimatedCostUSD:0,conservativeEstimatedCostUSD:0,usageEstimatedCostUSD:0,usageKnownAttempts:0,lastEnd:0};
export const progress=()=>console.log(JSON.stringify({completedLogicalCalls:state.completedLogicalCalls,total:42,transportRetries:state.retries,estimatedCostUSD:Number(state.estimatedCostUSD.toFixed(6))}));
async function waitForInterval(ms){let remaining=Math.max(0,ms-(Date.now()-state.lastEnd));while(remaining>0){await delay(Math.min(remaining,30000));remaining=Math.max(0,ms-(Date.now()-state.lastEnd));}}

async function transmit({kind,id,index,serialized,waitMs,retryReason}){
 const estimated=conservativeCost(serialized);
 need(state.estimatedCostUSD+estimated<=pricing.maximum_authorized_estimated_cost_usd+1e-12,'BLOCKED_COST_CAP');
 await waitForInterval(waitMs);
 need(credentialGate()==='PASS',credentialGate());
 const prefix=`raw/${kind}/${id}/attempt-${index}`;
 const startedAt=new Date().toISOString(),requestSha256=sha(serialized);
 const base={kind,logicalId:id,attempt:index,startedAt,requestSha256,requestPath:`stage13e/raw/${kind}/${id}/request.json`,headersOmitted:true,
  requestedModel:settings.model,retryReason,requiredWaitMs:waitMs,estimatedCostUSD:estimated,
  estimatedCostBeforeUSD:state.estimatedCostUSD,estimatedCostReservedUSD:state.estimatedCostUSD+estimated,
  wireSchemaSha256:fileSha('stage13e/WIRE_SCHEMA.json'),authoritativeSchemaSha256:fileSha('stage12/protocol-v3/schemas/output.schema.json'),transportLockSha256:fileSha('stage13e/TRANSPORT_LOCK.json')};
 save(prefix+'.started.json',{...base,status:'TRANSMISSION_RESERVED_NO_REPLAY'});
 state.estimatedCostUSD+=estimated;state.conservativeEstimatedCostUSD+=estimated;if(index>1)state.retries++;if(kind==='semantic')state.semanticTransmissions++;else state.smokeTransmissions++;
 let httpStatus=null,rawBytes=null,networkCode=null,waitHeader=null;
 const t=performance.now();
 try{
  const response=await fetch(settings.endpoint,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','x-goog-api-key':process.env.GEMINI_API_KEY},body:serialized,signal:AbortSignal.timeout(settings.timeoutMs)});
  httpStatus=response.status;waitHeader=response.headers.get('retry-after');rawBytes=Buffer.from(await response.arrayBuffer());
 }catch(error){networkCode=safeNetworkCode(error);}
 const endedAt=new Date().toISOString();state.lastEnd=Date.parse(endedAt);
 let rawResponsePath=null,rawResponseSha256=null,rawResponseWithheld=false;
 if(rawBytes!==null){rawResponseWithheld=containsCredential(rawBytes.toString('utf8'));if(!rawResponseWithheld){rawResponsePath='stage13e/'+prefix+'.response.txt';save(prefix+'.response.txt',rawBytes);rawResponseSha256=sha(rawBytes);}}
 const raw=rawBytes!==null&&!rawResponseWithheld?rawBytes.toString('utf8'):'';
 const decoded=raw?decode(raw):{envelope:null,parsed:null,parseStatus:'NOT_PARSED',parseError:rawResponseWithheld?'SECRET_RESPONSE_WITHHELD':'NO_RESPONSE_BODY'};
 const envelope=decoded.envelope,usage=envelope?.usage??null,usageEstimate=usageCost(usage);
 if(usageEstimate){state.usageKnownAttempts++;state.usageEstimatedCostUSD+=usageEstimate.estimatedCostUSD;state.estimatedCostUSD+=Math.max(0,usageEstimate.estimatedCostUSD-estimated);}
 const result={...base,endedAt,latencyMs:performance.now()-t,httpStatus,networkCode,
  rawResponsePath,rawResponseSha256,rawResponseWithheld,parseStatus:decoded.parseStatus,parseError:decoded.parseError,parsed:decoded.parsed,
  actualModel:typeof envelope?.model==='string'?envelope.model:null,actualModelVersion:envelope?.model_version??null,
  interactionId:typeof envelope?.id==='string'?envelope.id:null,interactionStatus:envelope?.status??null,
  envelopeErrorCount:Array.isArray(envelope?.errors)?envelope.errors.length:envelope?.error?1:0,
  responseGenerationConfig:envelope?.generation_config??null,
  usage,usageEstimate,estimatedCostAfterUSD:state.estimatedCostUSD,
  retryable:retryable(httpStatus,networkCode)&&!rawResponseWithheld,
  providerRetryDelayMs:httpStatus!==200?retryHintMs(waitHeader,raw,endedAt):0,
  wrongBillingProject:wrongBilling(httpStatus,raw),runtimePaidTierProof:'UNKNOWN_UNLESS_PROVIDER_EXPLICITLY_RETURNS_IT',
  providerExplicitBillingTier:typeof envelope?.billing_tier==='string'?envelope.billing_tier:null};
 save(prefix+'.json',result);return result;
}

async function logicalCall(kind,row,wire){
 const id=kind==='smoke'?'smoke-001':String(row.sequence).padStart(3,'0');
 const body=kind==='smoke'?smokeBody(wire):semanticBody(row,wire),serialized=JSON.stringify(body);
 if(kind==='semantic'){const expected=read('stage13e/EXECUTION_PLAN.json').requestHashes[row.sequence];need(sha(serialized)===expected.requestSha256,'REQUEST_HASH_MISMATCH');}
 save(`raw/${kind}/${id}/request.json`,serialized);
 const attempts=[];let stopReason=null;
 for(let index=1;index<=3;index++){
  const previous=attempts.at(-1),waitMs=Math.max(30000,index===3?60000:30000,previous?.providerRetryDelayMs??0);
  try{const attempt=await transmit({kind,id,index,serialized,waitMs,retryReason:previous?(previous.httpStatus!==null?'HTTP_'+previous.httpStatus:previous.networkCode):null});attempts.push(attempt);
   if(attempt.wrongBillingProject){stopReason='BLOCKED_WRONG_BILLING_PROJECT';break;}
   if(attempt.rawResponseWithheld){stopReason='BLOCKED_TRANSPORT_INCOMPLETE';break;}
   if(attempt.httpStatus===200||!attempt.retryable)break;
  }catch(error){if(['BLOCKED_COST_CAP','AWAITING_GEMINI_API_KEY','BLOCKED_AMBIGUOUS_GOOGLE_CREDENTIAL','BLOCKED_WRONG_KEY_VARIABLE'].includes(error.message)){stopReason=error.message;break;}throw error;}
 }
 // First HTTP 200, otherwise the sole terminal transport state. No candidate ranking.
 const terminal=attempts.find(a=>a.httpStatus===200)??attempts.at(-1)??null;
 const evaluated=evaluate(terminal,row,wire);
 const result={kind,...(row??{}),logicalId:id,repeatId:row?.seed??null,requestSha256:sha(serialized),
  actualModel:terminal?.actualModel??null,actualModelVersion:terminal?.actualModelVersion??null,
  startedAt:attempts[0]?.startedAt??null,endedAt:attempts.at(-1)?.endedAt??null,
  transmissionCount:attempts.length,retryCount:Math.max(0,attempts.length-1),attemptPaths:attempts.map(a=>`stage13e/raw/${kind}/${id}/attempt-${a.attempt}.json`),
  selectedAttempt:terminal?.attempt??null,terminalHTTPStatus:terminal?.httpStatus??null,selectionRule:'FIRST_HTTP_200_ELSE_FINAL_TRANSPORT_FAILURE',
  terminalRawResponsePath:terminal?.rawResponsePath??null,usage:terminal?.usage??null,
  estimatedCostUSD:attempts.reduce((sum,a)=>sum+Math.max(a.estimatedCostUSD,a.usageEstimate?.estimatedCostUSD??0),0),
  cumulativeEstimatedCostUSD:state.estimatedCostUSD,stopReason,...evaluated,
  includedInDenominator:kind==='semantic'&&attempts.length>0,repair:false,manualCorrection:false,resultBasedRetries:0,responseSelection:0,priorStageResponsesReused:0};
 save(`raw/${kind}/${id}/logical.json`,result);
 return result;
}

export async function execute(){
 need(!exists('artifacts/EXECUTION_STARTED.json'),'EXECUTION_ALREADY_STARTED_NO_RESTART');
 need(credentialGate()==='PASS',credentialGate());need(integrity().passed,'BLOCKED_PRIOR_INTEGRITY');manifestCheck('stage13e/checksums-before-smoke.sha256');
 const costLock=read('stage13e/COST_LOCK.json');need(costLock.firstAttempts.estimatedCostUSD<=3,'BLOCKED_COST_CAP');
 save('artifacts/EXECUTION_STARTED.json',{at:new Date().toISOString(),authorization,firstAPIRequestNotYetSent:true});
 const heartbeat=setInterval(progress,30000);let finalStatus='COMPLETED',reason=null;let smoke=null;
 try{
  const wire=read('stage13e/WIRE_SCHEMA.json');smoke=await logicalCall('smoke',null,wire);
  const passed=smokePass(smoke);
  save('artifacts/SMOKE_STATUS.json',{at:new Date().toISOString(),passed,status:passed?'PASS':smoke.stopReason??'BLOCKED_SMOKE',logicalCalls:1,transmissions:smoke.transmissionCount,retries:smoke.retryCount,actualModel:smoke.actualModel});
  if(!passed){finalStatus=smoke.stopReason??'BLOCKED_SMOKE';reason='SMOKE_DID_NOT_PASS';return;}
  manifestCheck('stage13e/checksums-before-smoke.sha256');
  save('MODEL_LOCK.json',{lockedAt:new Date().toISOString(),locked:true,requestedModel:settings.model,actualModel:smoke.actualModel,actualModelVersion:smoke.actualModelVersion,
   provider:'GOOGLE',settings,actualSemanticCallsBeforeLock:0,smokeLogicalSha256:fileSha('stage13e/raw/smoke/smoke-001/logical.json'),
   locks:Object.fromEntries(['SCHEMA_LOCK.json','TRANSPORT_LOCK.json','COST_LOCK.json','EXECUTION_PLAN.json'].map(p=>[p,fileSha('stage13e/'+p)])),
   billingTier:'USER_ATTESTED_PAID_TIER',billingEvidence:'USER_PAYMENT_CONFIRMATION',runtimePaidTierProof:'UNKNOWN_UNLESS_PROVIDER_EXPLICITLY_RETURNS_IT'});
  const lockedPaths=[...Object.keys(read('stage13e/artifacts/frozen-input-hashes.json').files),...listFiles(stage)].sort();
  save('checksums-before-run.sha256',lockedPaths.map(p=>fileSha(p)+'  '+p).join('\n')+'\n');
  save('artifacts/SEMANTIC_STARTED.json',{at:new Date().toISOString(),planned:42,startedFromSequence:0,stage13dOutputsReused:0});
  let consecutiveFailures=0;
  for(const row of read('stage13e/EXECUTION_PLAN.json').calls){
   const result=await logicalCall('semantic',row,wire);
   if(result.transmissionCount>0)state.completedLogicalCalls++;
   progress();
   if(result.stopReason){finalStatus=result.stopReason;reason=result.stopReason;break;}
   consecutiveFailures=result.transportFailure?consecutiveFailures+1:0;
   if(consecutiveFailures>=3){finalStatus='BLOCKED_PROVIDER_OUTAGE';reason='THREE_CONSECUTIVE_LOGICAL_TRANSPORT_FAILURES';break;}
  }
  if(state.completedLogicalCalls!==42&&finalStatus==='COMPLETED')finalStatus='BLOCKED_TRANSPORT_INCOMPLETE';
 }catch(error){const safe=new Set(['BLOCKED_COST_CAP','BLOCKED_PRIOR_INTEGRITY','LOCK_HASH_MISMATCH','REQUEST_HASH_MISMATCH']);finalStatus=safe.has(error.message)?error.message:'BLOCKED_TRANSPORT_INCOMPLETE';reason=safe.has(error.message)?error.message:'INTERNAL_ERROR_BODY_SUPPRESSED';}
 finally{clearInterval(heartbeat);save('artifacts/EXECUTION_STATUS.json',{at:new Date().toISOString(),status:finalStatus,reason,...state,actualBilledCostUSD:null});progress();}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){try{await execute();}catch(error){console.log(JSON.stringify({status:'BLOCKED',reason:['EXECUTION_ALREADY_STARTED_NO_RESTART','AWAITING_GEMINI_API_KEY','BLOCKED_AMBIGUOUS_GOOGLE_CREDENTIAL','BLOCKED_WRONG_KEY_VARIABLE','BLOCKED_PRIOR_INTEGRITY','BLOCKED_COST_CAP','LOCK_HASH_MISMATCH'].includes(error.message)?error.message:'INTERNAL_ERROR_BODY_SUPPRESSED'}));process.exitCode=2;}}
