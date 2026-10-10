import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validate} from './schema.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),read=p=>fs.readFileSync(root+p,'utf8');
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const freeze=JSON.parse(read('artifacts/AI_FREEZE.json'));
for(const [p,h] of Object.entries(freeze.files))if(sha(read(p))!==h)throw Error('FREEZE_BROKEN');
const out=fs.mkdtempSync(root+'artifacts/diagnostic-'),save=(p,v)=>fs.writeFileSync(out+'/'+p,JSON.stringify(v,null,2)+'\n',{flag:'wx'});
const endpoint='http://127.0.0.1:11434';
async function call(route,payload,timeout=5000){
 const startedAt=new Date().toISOString(),start=performance.now();let status=null,raw=null,error=null;
 try{const r=await fetch(endpoint+route,{method:payload?'POST':'GET',headers:payload?{'Content-Type':'application/json'}:undefined,body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(timeout)});status=r.status;raw=await r.json();if(!r.ok)error='HTTP_'+r.status;}catch(e){error={name:e.name,message:e.message};}
 return {startedAt,finishedAt:new Date().toISOString(),elapsedMs:performance.now()-start,status,raw,error,request:payload??null};
}
const names=['OPENAI_API_KEY','ANTHROPIC_API_KEY','GEMINI_API_KEY','GOOGLE_API_KEY','AZURE_OPENAI_API_KEY','OLLAMA_API_KEY'];
const tags=await call('/api/tags'),version=await call('/api/version');
save('access.json',{at:new Date().toISOString(),credentialPresence:Object.fromEntries(names.map(n=>[n,!!process.env[n]])),tags,version,scope:'Environment presence only; no auth file contents; no external paid calls; installed tags do not prove inference availability.'});
let selected=null,smokeCalls=0;
for(const name of ['llama3.3:70b','llama3.2:latest']){
 const metadata=tags.raw?.models?.find(m=>m.name===name);if(!metadata){save('unavailable-'+name.replaceAll(':','-')+'.json',{name,reason:'NOT_INSTALLED'});continue;}
 const request={model:name,stream:false,format:{type:'object',properties:{numbers:{type:'array',items:{type:'number'}}},required:['numbers'],additionalProperties:false},messages:[{role:'user',content:'Return numbers containing integers 1, 2, 3. Neutral availability check.'}],options:{num_ctx:8192,num_predict:128,temperature:0,top_p:1,seed:113}};
 save('smoke-request-'+smokeCalls+'.json',{metadata,request,frozenBeforeCall:new Date().toISOString()});
 const result=await call('/api/chat',request,120000);smokeCalls++;
 const ps=await call('/api/ps');const usable=!result.error&&result.raw?.done===true&&!!result.raw.message?.content&&ps.raw?.models?.some(m=>(m.name===name||m.model===name)&&m.context_length>=8192);
 save('smoke-'+smokeCalls+'.json',{name,result,ps,usable});console.log(JSON.stringify({event:'smoke',name,usable,elapsedMs:result.elapsedMs,error:result.error}));
 if(usable){selected={name,digest:metadata.digest,details:metadata.details,strong:name==='llama3.3:70b',options:{num_ctx:8192,num_predict:1536,temperature:0,top_p:1,seed:113},repetitions:1};break;}
}
save('model-selection.json',selected??{status:'BLOCKED'});
if(!selected){save('summary.json',{status:'INTERFACE_BLOCKED',semanticStatus:'BLOCKED_STRONG_BASELINE',smokeCalls,neutralCalls:0});process.exitCode=2;}else{
 const schema=JSON.parse(read('diagnostic/schema.json')),tasks=read('diagnostic/tasks.jsonl').trim().split('\n').map(JSON.parse),records=[];
 for(const [i,t]of tasks.entries())for(const arm of i%2===0?['B','C']:['C','B']){
  const input={taskId:t.taskId,spans:t.spans};
  const request={model:selected.name,stream:false,format:schema,messages:[{role:'system',content:read('diagnostic/'+arm+'.txt')},{role:'user',content:JSON.stringify(input)}],options:selected.options};
  const result=await call('/api/chat',request,120000);let parsed=null,parseError=null;
  try{if(result.error||result.raw?.done!==true)throw Error('INCOMPLETE_CALL');parsed=JSON.parse(result.raw.message.content);}catch(e){parseError=e.message;}
  const errors=validate(parsed,schema),record={taskId:t.taskId,arm,inputHash:sha(JSON.stringify(input)),result,parsed,parseError,schemaValid:!parseError&&errors.length===0,errors,inputTokens:result.raw?.prompt_eval_count??null,outputTokens:result.raw?.eval_count??null};
  save(t.taskId+'-'+arm+'.json',record);records.push(record);console.log(JSON.stringify({event:'neutral',taskId:t.taskId,arm,schemaValid:record.schemaValid,count:records.length,elapsedMs:result.elapsedMs}));
 }
 const arms=Object.fromEntries(['B','C'].map(a=>{const rows=records.filter(r=>r.arm===a);return [a,{calls:rows.length,valid:rows.filter(r=>r.schemaValid).length,rate:rows.filter(r=>r.schemaValid).length/rows.length,inputTokens:rows.reduce((n,r)=>n+(r.inputTokens??0),0),outputTokens:rows.reduce((n,r)=>n+(r.outputTokens??0),0),meanLatencyMs:rows.reduce((n,r)=>n+r.result.elapsedMs,0)/rows.length}]}));
 const interfacePass=Object.values(arms).every(a=>a.rate>=0.9);
 save('summary.json',{completedAt:new Date().toISOString(),model:selected,smokeCalls,neutralCalls:records.length,arms,interfaceStatus:interfacePass?'PASS':'INTERFACE_BLOCKED',semanticStatus:!selected.strong?'BLOCKED_STRONG_BASELINE':!interfacePass?'INTERFACE_BLOCKED':'DATASET_REQUIRED',semanticCalls:0,localApiBill:'No external paid API invoked; power/time cost unmeasured',replayResponses:0,realHumanParticipants:0});
}
console.log(JSON.stringify({event:'done',out}));
