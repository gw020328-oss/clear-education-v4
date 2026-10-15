import { withEvaluationLease, atomicEvaluationCheckpoint } from '../../src/ai-policy/evaluation-ledger.mjs';
// Separate, explicitly approved 2026-10-15 run. No retries or legacy ledger reset.
import { open, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createGeminiEvaluation, GEMINI_EVALUATION_MODEL as model, EVALUATION_PROMPT_VERSION } from '../../src/ai-policy/gemini-evaluation.mjs';
const dir=new URL('../../artifacts/gemini-v3-retest-20261015/',import.meta.url);
const bytes=await readFile(new URL('fixtures.json',dir)),meta=JSON.parse(await readFile(new URL('renderer.json',dir),'utf8'));
if(createHash('sha256').update(bytes).digest('hex')!==meta.fixtureSha256)throw new Error('CORPUS_HASH_MISMATCH');
const fixtures=JSON.parse(bytes),gold=JSON.parse(await readFile(new URL('gold.json',dir),'utf8'));
const ids=['T01','T04'];
if(process.argv[2]==='--plan-repair'){console.log(JSON.stringify({execution:'DRY_RUN',additionalAttemptsMax:3,maxGenerationCalls:5,maxCountCalls:5,maxInputTokens:2000,maxOutputTokens:1024,maximumAccumulatedGenerationReservationUsd:'0.02452',budgetUsd:'0.03',keyRead:false}));process.exit(0);}
if(process.argv.length!==3||!['--execute-approved','--continue-approved','--repair-approved'].includes(process.argv[2]))console.log(JSON.stringify({execution:'DRY_RUN',model,promptVersion:EVALUATION_PROMPT_VERSION,cases:ids,maxGenerationCalls:2,maxCountCalls:2,budgetUsd:'0.03',maximumGenerationReservationUsd:'0.01504',keyRead:false}));
else await withEvaluationLease(dir,async()=>{
 const repair=process.argv[2]==='--repair-approved',callCap=repair?5:2;
 const prior=process.argv[2]!=='--execute-approved'?JSON.parse(await readFile(new URL('actual-v3-results.json',dir),'utf8')):null;
 if(!prior){const lock=await open(new URL('approved-v3-run.lock',dir),'wx',0o600);await lock.close();}
 else if(prior.corpusHash!==meta.fixtureSha256||prior.model!==model||prior.usage.countCalls>=callCap||prior.usage.generationCalls>=callCap)throw new Error('RESUME_LIMIT');
 const previous=prior?.usage??{countCalls:0,generationCalls:0,reservedNanoUsd:'0',actualModelCalls:0};
 const report=prior??{kind:'ACTUAL_SYNTHETIC_V3_REEVALUATION',execution:'ACTUAL',model,promptVersion:EVALUATION_PROMPT_VERSION,corpusHash:meta.fixtureSha256,startedAt:new Date().toISOString(),
  approval:{maxGenerationCalls:2,maxCountCalls:2,budgetUsd:'0.03',automaticRetries:0},billingProjectLinkVerified:false,actualBillVerified:false,attempts:[],paymentAllowed:false};
 if(repair){report.approval={...report.approval,maxGenerationCalls:5,maxCountCalls:5,maxOutputTokens:1024,repairAttemptsMax:3,automaticRetries:0};}
 const evaluationFixtures=repair?fixtures.map(f=>ids.includes(f.caseId)?{...f,maxInputTokens:2000}:f):fixtures;
 const evaluator=createGeminiEvaluation({fixtures:evaluationFixtures,approval:{approved:true,service:'GEMINI_DEVELOPER_API_PAID_STANDARD',model,syntheticOnly:true,maxGenerationCalls:callCap-previous.generationCalls,maxCountCalls:callCap-previous.countCalls,maxOutputTokens:repair?1024:2048,budgetNanoUsd:String(30000000n-BigInt(previous.reservedNanoUsd))},onCheckpoint:async()=>save()});
 const save=async()=>{const current=evaluator.usage();report.usage={...current,countCalls:previous.countCalls+current.countCalls,generationCalls:previous.generationCalls+current.generationCalls,actualModelCalls:previous.actualModelCalls+current.actualModelCalls,reservedNanoUsd:String(BigInt(previous.reservedNanoUsd)+BigInt(current.reservedNanoUsd))};await atomicEvaluationCheckpoint(new URL('actual-v3-results.json',dir),report);};
 const assess=(result,expected)=>{
  const fields=new Map(result.fields.map(field=>[field.fieldId,field])),errors=[];
  if(fields.size!==result.fields.length||fields.size!==Object.keys(expected.fields).length)errors.push('FIELD_SET');
  for(const [id,value]of Object.entries(expected.fields)){if(!fields.has(id)||fields.get(id).value!==value)errors.push('VALUE:'+id);if(value!==null&&!fields.get(id)?.location)errors.push('LOCATION:'+id);}
  if(expected.questionRequired&&!result.questions.length)errors.push('QUESTION_MISSING');
  return {status:errors.length?'SEMANTIC_ERROR':'PASS',errors};
 };
 await save();
 for(const caseId of ids){
  if(report.attempts.some(a=>a.caseId===caseId&&(!repair||a.reviewedAssessment)))continue;
  try{
   const fixture=evaluationFixtures.find(f=>f.caseId===caseId),result=await evaluator.evaluate(fixture);
   const rawAssessment=assess(result.rawObservation,gold[caseId]),reviewedAssessment=assess(result.result,gold[caseId]);
   report.attempts.push({...result,rawAssessment,reviewedAssessment});await save();
   console.log(JSON.stringify({caseId,raw:rawAssessment.status,reviewed:reviewedAssessment.status,tokens:result.tokens}));
  }catch(error){const code=/^GEMINI_[A-Z_]+$/.test(error.message)?error.message:'GEMINI_EVALUATION_FAILED';report.attempts.push({caseId,execution:'ACTUAL',status:'ERROR',code,httpStatus:Number.isInteger(error.httpStatus)?error.httpStatus:null,...(error.providerStatus?{providerStatus:error.providerStatus}:{}),...(error.schemaKeywords?{schemaKeywords:error.schemaKeywords}:{})});await save();console.log(JSON.stringify({caseId,status:'ERROR',code}));break;}
 }
 report.finishedAt=new Date().toISOString();report.costComplete=report.attempts.every(a=>a.tokens&&a.tokens.promptTokenCount!==null&&a.tokens.candidatesTokenCount!==null);
 report.knownGenerationNanoUsd=String(report.attempts.reduce((sum,a)=>a.tokens?sum+BigInt(a.tokens.promptTokenCount??0)*300n+BigInt((a.tokens.candidatesTokenCount??0)+(a.tokens.thoughtsTokenCount??0))*2500n:sum,0n));await save();
 console.log(JSON.stringify({execution:'ACTUAL',usage:report.usage,knownGenerationNanoUsd:report.knownGenerationNanoUsd,costComplete:report.costComplete}));
});
