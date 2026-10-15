// One read-only model metadata request; no generation or source material.
import { readFile } from 'node:fs/promises';
import { withEvaluationLease,atomicEvaluationCheckpoint } from '../../src/ai-policy/evaluation-ledger.mjs';
const dir=new URL('../../artifacts/gemini-v3-retest-20261015/',import.meta.url),path=new URL('actual-v3-results.json',dir);
if(process.argv.length!==3||process.argv[2]!=='--execute-read-only')console.log(JSON.stringify({execution:'DRY_RUN',modelMetadataRequests:1,generationRequests:0,countRequests:0,keyRead:false}));
else await withEvaluationLease(dir,async()=>{
 const report=JSON.parse(await readFile(path,'utf8'));if(report.accessChecks)throw new Error('METADATA_CHECK_ALREADY_USED');
 report.accessChecks=1;await atomicEvaluationCheckpoint(path,report);
 const key=process.env.GEMINI_API_KEY;if(!key)throw new Error('GEMINI_KEY_MISSING');
 let diagnostic;
 try{
  const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite',{method:'GET',headers:{'x-goog-api-key':key},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384)throw new Error('LIMIT');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
  const json=JSON.parse(Buffer.concat(chunks).toString('utf8')),message=typeof json.error?.message==='string'?json.error.message:'';
  const categories=Object.entries({KEY_EXPIRED:/api key.*expired|expired.*api key/i,KEY_INVALID:/api.?key.*(invalid|not valid)|invalid.*api.?key/i,KEY_RESTRICTED:/key.*restrict/i,BILLING:/billing|payment/i,REGION:/region|location/i,QUOTA:/quota|rate limit/i,SCHEMA:/schema|enum|minItems|anyOf/i,MODEL:/model/i}).filter(([,pattern])=>pattern.test(message)).map(([name])=>name);
  diagnostic={httpStatus:response.status,modelMetadataAvailable:response.ok&&json.name==='models/gemini-3.5-flash-lite',categories};
 }catch{diagnostic={httpStatus:null,modelMetadataAvailable:false,categories:['METADATA_REQUEST_FAILED']};}
 report.accessDiagnostic=diagnostic;await atomicEvaluationCheckpoint(path,report);console.log(JSON.stringify({kind:'READ_ONLY_MODEL_METADATA_DIAGNOSTIC',generationRequests:0,countRequests:0,...diagnostic}));
});
