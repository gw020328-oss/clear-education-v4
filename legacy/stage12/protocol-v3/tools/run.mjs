// Runnable future local adapter. --plan is offline. No keys, downloads, remote APIs or payments.
import {readFileSync,writeFileSync,readdirSync,mkdirSync,mkdtempSync,existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {schema,score,formatCheck,compareArms,canonical} from './score.mjs';
export const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),stage=resolve(root,'..'),project=resolve(stage,'..');
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const jsonl=p=>readFileSync(p,'utf8').trim().split('\n').map(s=>JSON.parse(s));
const hash=x=>createHash('sha256').update(x).digest('hex');
const need=(p,m)=>{if(!p)throw Error(m);};
export const config=read(join(root,'RUN_CONFIG.json'));
export const dataset=jsonl(join(root,'DATASET.jsonl'));
export function plan(){
 const out=[];for(const split of ['dev','eval']){const ds=dataset.filter(d=>d.split===split);for(let rep=0;rep<(split==='dev'?1:2);rep++)ds.forEach((d,i)=>{for(const arm of (i+rep)%2?['C','B']:['B','C'])out.push({sequence:out.length,sourceId:d.sourceId,split,repeat:rep,seed:config.seeds[rep],arm});});}return out;
}
export function modelInput(d){return {sourceId:d.sourceId,title:d.title,scope:d.scope,documents:Object.entries(d.documents).map(([id,m])=>({id,url:m.url})),spans:d.spans.map(({id,documentId,text,section})=>({id,documentId,text,section}))};}
export function requestFor(row,modelId){
 const shared=readFileSync(join(root,'VALUE_CONVENTIONS.md'),'utf8'),prompt=readFileSync(join(root,'prompts',row.arm+'.txt'),'utf8');
 const input=JSON.stringify(modelInput(dataset.find(d=>d.sourceId===row.sourceId)));
 need(Buffer.byteLength(input)<=config.inputUtf8ByteLimit,'INPUT_LIMIT');
 const request={model:modelId,stream:false,think:config.think,format:schema,messages:[{role:'system',content:prompt+'\n\n'+shared+'\n\nJSON Schema:\n'+JSON.stringify(schema)},{role:'user',content:input}],options:{temperature:config.temperature,top_p:config.top_p,num_ctx:config.num_ctx,num_predict:config.num_predict,seed:row.seed}};
 need(Buffer.byteLength(JSON.stringify(request))<=config.requestUtf8ByteLimit,'REQUEST_LIMIT');return request;
}
export function verifyFreeze(){
 const manifest=read(join(root,'SHA256_MANIFEST.json'));for(const [p,h]of Object.entries(manifest.files))need(hash(readFileSync(resolve(stage,p)))===h,'FREEZE_CHANGED:'+p);
 const receipt=read(join(root,'FREEZE_RECEIPT.json'));need(hash(readFileSync(join(root,'SHA256_MANIFEST.json')))===receipt.manifestSha256,'RECEIPT_MISMATCH');need(receipt.semanticOutputsAtFreeze===0,'NONZERO_PREEXISTING_EVALUATION');return receipt.manifestSha256;
}
export function priorIntact(){const before=read(join(stage,'artifacts/precheck/prior-files.json'));return Object.entries(before.files).every(([p,h])=>existsSync(join(project,p))&&hash(readFileSync(join(project,p)))===h);}
export function validateActivation(a){
 const allowed=['modelId','modelVersion','backendVersion','baseUrl','authorized','paid','authorizationReference','capabilityJustification'];
 need(Object.keys(a).length===allowed.length&&Object.keys(a).every(k=>allowed.includes(k)),'ACTIVATION_FIELDS_NO_SECRETS');
 need(a.authorized===true&&a.paid===false,'AUTHORIZED_FREE_LOCAL_MODEL_REQUIRED');
 for(const k of ['modelId','modelVersion','backendVersion','authorizationReference','capabilityJustification'])need(typeof a[k]==='string'&&a[k].length>0&&!a[k].includes('PENDING'),'MODEL_NOT_AUTHORIZED');
 need(!/llama3[.:]2|gemma3:4b|llama3[.:]3:70b/i.test(a.modelId),'PRIOR_SMALL_OR_TIMED_OUT_MODEL_PROHIBITED');
 need(/^[a-f0-9]{64}$/.test(a.modelVersion),'EXACT_DIGEST_REQUIRED');
 const u=new URL(a.baseUrl);need(u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname)&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash,'LOOPBACK_ONLY');return a;
}
async function metadata(a){
 const get=async path=>{const r=await fetch(new URL(path,a.baseUrl),{redirect:'error',signal:AbortSignal.timeout(10000)});need(r.ok,'METADATA_HTTP');return r.json();};
 const tags=await get('/api/tags'),version=await get('/api/version');
 const m=tags.models.find(m=>m.name===a.modelId||m.model===a.modelId);need(m?.digest===a.modelVersion,'MODEL_DIGEST_MISMATCH');need(version.version===a.backendVersion,'BACKEND_VERSION_MISMATCH');return {model:m,version};
}
const save=(p,x)=>writeFileSync(p,JSON.stringify(x,null,2)+'\n',{flag:'wx',mode:0o600});
async function call(a,request){
 const at=new Date().toISOString(),t=performance.now();let raw=null,status=null,body=null,error=null,parsed=null,parseError=null;
 try{const response=await fetch(new URL('/api/chat',a.baseUrl),{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(config.timeoutMs)});status=response.status;raw=await response.text();if(!response.ok)throw Error('MODEL_HTTP_'+status);body=JSON.parse(raw);need(body.done===true,'INCOMPLETE_RESPONSE');need(body.model===a.modelId,'RESPONSE_MODEL_MISMATCH');try{parsed=JSON.parse(body.message.content);}catch(e){parseError=e.message;}}
 catch(e){error=e.message;}
 return {at,latencyMs:performance.now()-t,request,httpStatus:status,rawResponse:raw,error,parseError,parsed,promptTokens:body?.prompt_eval_count??null,outputTokens:body?.eval_count??null,doneReason:body?.done_reason??null,cost:{apiChargeUSD:0,hardwareAndEnergyCost:null},format:parsed?formatCheck(parsed):{valid:false,errors:['NO_PARSED_OUTPUT']}};
}
async function main(){
 const [mode,path,smokePath]=process.argv.slice(2);
 if(mode==='--plan'){const calls=plan();console.log(JSON.stringify({mode:'OFFLINE_PLAN_NOT_CALLS',semanticCallsExecuted:0,plannedCalls:calls.length,maximumOutputTokens:calls.length*config.num_predict,maxRequestBytes:Math.max(...calls.map(r=>Buffer.byteLength(JSON.stringify(requestFor(r,'PENDING_AUTHORIZED_MODEL'))))),calls},null,2));return;}
 need(['--smoke','--run'].includes(mode),'Use --plan, --smoke ACTIVATION.json, or --run ACTIVATION.json SMOKE_DIRECTORY');
 need(path,'MODEL_NOT_AUTHORIZED');const a=validateActivation(read(resolve(path)));const freeze=verifyFreeze();need(priorIntact(),'PRIOR_INTEGRITY_CHANGED');
 const dir=join(stage,'artifacts/model-runs');mkdirSync(dir,{recursive:true});
 if(mode==='--smoke'){
  const marker=join(dir,'SMOKE_STARTED.json');need(!existsSync(marker),'SMOKE_ALREADY_ATTEMPTED_NO_RETRY');
  const meta=await metadata(a),out=mkdtempSync(join(dir,'smoke-'));save(marker,{at:new Date().toISOString(),modelId:a.modelId,outputDirectory:out});
  const neutral=requestFor(plan()[0],a.modelId);neutral.messages=[{role:'system',content:'Synthetic formatting smoke only. Return CLARIFICATION_REQUIRED, all ten fields NOT_STATED with null value and empty spanIds, and empty ambiguities, clarificationQuestions and unsupportedConditions. No external policy is provided. JSON schema: '+JSON.stringify(schema)},{role:'user',content:'Return the empty synthetic policy described in the system message.'}];
  const result=await call(a,neutral);save(join(out,'smoke.json'),{kind:'ACTUAL_NEUTRAL_MODEL_SMOKE',activation:a,freeze,metadata:meta,...result});
  console.log(JSON.stringify({output:out,neutralCalls:1,semanticCalls:0,passed:result.format.valid}));process.exitCode=result.format.valid?0:1;return;
 }
 need(smokePath,'NEUTRAL_SMOKE_REQUIRED');const smoke=read(join(resolve(smokePath),'smoke.json'));
 need(smoke.kind==='ACTUAL_NEUTRAL_MODEL_SMOKE'&&smoke.format.valid&&smoke.freeze===freeze&&canonical(smoke.activation)===canonical(a),'SMOKE_MISMATCH_OR_FAILURE');
 need(!existsSync(join(dir,'SEMANTIC_RUN_STARTED.json')),'RUN_ALREADY_ATTEMPTED_NO_RETRY');
 const meta=await metadata(a),out=mkdtempSync(join(dir,'semantic-'));save(join(dir,'SEMANTIC_RUN_STARTED.json'),{at:new Date().toISOString(),outputDirectory:out});
 save(join(out,'MODEL_LOCK.json'),{activation:a,freeze,metadata:meta,semanticCallsBeforeLock:0,smokeDirectory:resolve(smokePath)});
 const refs=jsonl(join(root,'REFERENCE_LABELS.jsonl')),calls=plan(),rows=[];save(join(out,'call-plan.json'),calls);
 for(const row of calls){const d=dataset.find(d=>d.sourceId===row.sourceId),ref=refs.find(r=>r.sourceId===row.sourceId),result=await call(a,requestFor(row,a.modelId));let judged=score(result.parsed,ref,d);if(result.error||result.doneReason==='length'||result.outputTokens>config.num_predict||result.promptTokens>config.num_ctx-config.num_predict)judged={...judged,majorError:true,normalPass:false,safeAbstention:false,completeCorrect:false,outcome:'TRANSPORT_OR_BUDGET_FAILURE'};
  const record={kind:'ACTUAL_SEMANTIC_MODEL_CALL',...row,...result,score:judged};rows.push(record);save(join(out,String(row.sequence).padStart(3,'0')+'.json'),record);console.log(JSON.stringify({completed:rows.length,total:calls.length,sourceId:row.sourceId,arm:row.arm,outcome:judged.outcome}));}
 let modelStillPinned=false;try{await metadata(a);modelStillPinned=true;}catch{}
 const bindingIntact=priorIntact()&&modelStillPinned,summary=compareArms(rows,refs.map(r=>({...r,split:dataset.find(d=>d.sourceId===r.sourceId).split})),bindingIntact);
 const transportFailures=rows.filter(r=>r.error).length;
 const verdict=transportFailures||!bindingIntact?'BLOCKED':summary.advantageCandidate?'PROCEED_HUMAN_APPROVED_AI_ASSISTANT':'NO_AI_ADVANTAGE';
 save(join(out,'summary.json'),{verdict,actualSemanticCalls:rows.length,transportFailures,modelStillPinned,...summary});console.log(JSON.stringify({output:out,verdict}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(JSON.stringify({blocked:e.message}));process.exitCode=1;});
