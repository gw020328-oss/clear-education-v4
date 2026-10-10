import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {verify,root,read,lines,sha} from './verify.mjs';
import {applyGate} from './gate.mjs';
import {score} from './score.mjs';
import {runtimeGate} from './runtime-gate.mjs';
const check=verify();if(check.failed)throw Error('FREEZE_BROKEN');
const runDir=fs.mkdtempSync(path.join(root,'../artifacts/run-'));
const save=(name,value)=>fs.writeFileSync(path.join(runDir,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
save('freeze-check.json',check);
const endpoint='http://127.0.0.1:11434';
async function request(route,payload,timeout){
 const start=performance.now(),startedAt=new Date().toISOString();let raw=null,error=null,status=null;
 try{const r=await fetch(endpoint+route,{method:payload?'POST':'GET',headers:payload?{'Content-Type':'application/json'}:undefined,body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(timeout)});status=r.status;const text=await r.text();try{raw=JSON.parse(text);}catch{raw={unparsedBody:text};}if(!r.ok)error=raw.error??'HTTP_'+r.status;}
 catch(e){error={name:e.name,message:e.message};}
 return {startedAt,finishedAt:new Date().toISOString(),elapsedMs:performance.now()-start,httpStatus:status,request:{url:endpoint+route,payload},raw,error,retries:0};
}
const tags=await request('/api/tags',null,5000),version=await request('/api/version',null,5000);
save('environment.json',{node:process.version,platform:os.platform(),arch:os.arch(),memoryBytes:os.totalmem(),cpu:os.cpus()[0]?.model,tags,version});
const neutral='This is a neutral runtime capacity check, unrelated to any dataset. Ignore the neutral padding. Return a JSON object listing the integers 1 through 20.\n'+('neutral context marker alpha beta gamma.\n'.repeat(512));
let selected=null;
for(const [i,name]of ['llama3.3:70b','llama3.2:latest','gemma3:4b'].entries()){
 const info=await request('/api/show',{model:name},10000);
 const smoke=await request('/api/chat',{model:name,stream:false,format:'json',messages:[{role:'user',content:neutral}],options:{num_ctx:16384,num_predict:128,temperature:0.2,top_p:0.95,seed:137}},120000);
 const ps=await request('/api/ps',null,5000);
 const advertised=Object.entries(info.raw?.model_info??{}).find(([k])=>k.endsWith('.context_length'))?.[1];
 const activeContext=ps.raw?.models?.find(m=>m.name===name||m.model===name)?.context_length;
 const usable=!smoke.error&&smoke.raw?.done===true&&!!smoke.raw.message?.content&&(activeContext>=16384||advertised>=16384);
 save('smoke-'+i+'.json',{name,info,smoke,ps,advertisedContext:advertised??null,activeContext:activeContext??null,usable,selectionBasis:'Availability, latency and context support only. Neutral response quality not ranked.'});
 console.log(JSON.stringify({event:'smoke',name,usable,error:smoke.error,elapsedMs:smoke.elapsedMs}));
 if(usable){selected={name,digest:tags.raw?.models?.find(m=>m.name===name)?.digest??null,details:info.raw?.details,version:version.raw,activeContext:activeContext??null,advertisedContext:advertised??null,selectedAt:new Date().toISOString(),reason:i===0?'First available preferred 70b':'Earlier candidates failed availability/context/time checks',options:{num_ctx:16384,num_predict:2048,temperature:0.2,top_p:0.95}};break;}
}
save('model-selection.json',selected??{status:'BLOCKED',reason:'No usable candidate'});
if(!selected){console.log(JSON.stringify({event:'blocked',runDir}));process.exit(2);}
const dataset=lines('DATASET.jsonl'),refs=lines('REFERENCE_LABELS.jsonl'),schema=JSON.parse(read('schemas/output.schema.json'));
const completed=[];
for(const split of ['dev','eval'])for(const row of dataset.filter(r=>r.split===split))for(let repeat=1;repeat<=(split==='dev'?1:2);repeat++)for(const arm of repeat===1?['B','C']:['C','B']){
 const id=`v2-${row.sourceId}-${arm}-r${repeat}`;
 const user={input:{...row.input,runtime:null},outputSchema:schema};
 const payload={model:selected.name,stream:false,format:'json',messages:[{role:'system',content:read('prompts/'+arm+'.txt')},{role:'user',content:JSON.stringify(user)}],options:{...selected.options,seed:repeat===1?137:271}};
 const call=await request('/api/chat',payload,180000);
 let parsed=null,parseError=null;try{if(call.error)throw Error('CALL_FAILED');parsed=JSON.parse(call.raw?.message?.content??'');}catch(e){parseError=e.message;}
 const gate=parsed?applyGate(parsed,user.input,schema):null;
 const delivered=arm==='C'?gate?.output??null:parsed;
 const ref=refs.find(x=>x.sourceId===row.sourceId);
 const record={id,sourceId:row.sourceId,split,repeat,arm,model:selected,inputSha256:sha(JSON.stringify(user.input)),call,parsed,jsonParseValid:parseError===null,parseError,gateApplied:arm==='C',gate:arm==='C'?gate:null,bSameGateDiagnostic:arm==='B'?gate:null,delivered,expected:ref.expected,rawScore:score(parsed,ref,schema),deliveredScore:score(delivered,ref,schema),usage:{inputTokens:call.raw?.prompt_eval_count??null,outputTokens:call.raw?.eval_count??null,apiTotalDurationNs:call.raw?.total_duration??null,cost:null}};
 save(id+'.json',record);completed.push(id);
 console.log(JSON.stringify({event:'completed',id,completed:completed.length,total:40,elapsedMs:call.elapsedMs,error:call.error}));
}
const runtime=lines('SYNTHETIC_RUNTIME_FIXTURES.jsonl').map(f=>({fixtureId:f.fixtureId,name:f.name,dataKind:f.dataKind,expected:f.expectedRuntimeExecutable,result:runtimeGate(f.input)}));
save('runtime-results.json',runtime);
save('completion.json',{completedAt:new Date().toISOString(),runDir,model:selected.name,publicCalls:completed.length,ids:completed,syntheticRuntimeCases:runtime.length,modelReplays:0,realHumanParticipants:0});
console.log(JSON.stringify({event:'done',runDir,publicCalls:completed.length}));
