import { readFile, writeFile, open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createGeminiEvaluation } from '../../src/ai-policy/gemini-evaluation.mjs';
const dir=new URL('../../artifacts/gemini-pilot/',import.meta.url),model='gemini-3.8-flash';
const bytes=await readFile(new URL('fixtures.json',dir));
const renderer=JSON.parse(await readFile(new URL('renderer.json',dir),'utf8'));
if(createHash('sha256').update(bytes).digest('hex')!==renderer.fixtureSha256)throw new Error('CORPUS_HASH_MISMATCH');
const all=JSON.parse(bytes),fixtures=['T01','T04'].map(id=>all.find(f=>f.caseId===id));
const gold=JSON.parse(await readFile(new URL('gold.json',dir),'utf8'));
if(process.argv.length!==3||!['--execute-approved','--resume-zero-dispatch','--resume-approved'].includes(process.argv[2]))console.log(JSON.stringify({execution:'DRY_RUN',model,cases:['T01','T04'],maxGenerationCalls:2,maxCountCalls:2,budgetUsd:'0.05',keyRead:false}));
else{
 let preflightFailures=[],prior=null;
 if(process.argv[2]==='--resume-zero-dispatch'){const previous=JSON.parse(await readFile(new URL('comparison-results.json',dir),'utf8'));if(previous.usage.countCalls!==0||previous.usage.generationCalls!==0||previous.usage.reservedNanoUsd!=='0'||previous.corpusHash!==renderer.fixtureSha256||previous.model!==model)throw new Error('RESUME_REQUIRES_ZERO_DISPATCH');preflightFailures=previous.attempts;}
 else if(process.argv[2]==='--resume-approved'){prior=JSON.parse(await readFile(new URL('comparison-results.json',dir),'utf8'));if(prior.model!==model||prior.corpusHash!==renderer.fixtureSha256||prior.usage.countCalls>=2||prior.usage.generationCalls>=2)throw new Error('RESUME_LIMIT');}
 else{const lock=await open(new URL('comparison-run.lock',dir),'wx',0o600);await lock.close();}
 const previous=prior?.usage??{countCalls:0,generationCalls:0,reservedNanoUsd:'0',actualModelCalls:0};
 const report=prior??{execution:'ACTUAL',model,corpusHash:renderer.fixtureSha256,startedAt:new Date().toISOString(),preflightFailures,attempts:[],paymentAllowed:false};
 const evaluator=createGeminiEvaluation({fixtures,model,approval:{approved:true,service:'GEMINI_DEVELOPER_API_PAID_STANDARD',model,syntheticOnly:true,maxGenerationCalls:2-previous.generationCalls,maxCountCalls:2-previous.countCalls,budgetNanoUsd:String(50000000n-BigInt(previous.reservedNanoUsd))},onCheckpoint:async()=>save()});
 const save=async()=>{const current=evaluator.usage();report.usage={...current,countCalls:previous.countCalls+current.countCalls,generationCalls:previous.generationCalls+current.generationCalls,actualModelCalls:previous.actualModelCalls+current.actualModelCalls,reservedNanoUsd:String(BigInt(previous.reservedNanoUsd)+BigInt(current.reservedNanoUsd))};await writeFile(new URL('comparison-results.json',dir),JSON.stringify(report,null,2),{mode:0o600});};
 await save();
 for(const fixture of fixtures){
  if(report.attempts.some(a=>a.caseId===fixture.caseId))continue;
  try{
   const result=await evaluator.evaluate(fixture),expected=gold[fixture.caseId],fields=new Map(result.result.fields.map(f=>[f.fieldId,f])),errors=[];
   if(fields.size!==result.result.fields.length)errors.push('DUPLICATE_FIELDS');
   if(fields.size!==Object.keys(expected.fields).length)errors.push('FIELD_SET');
   for(const [field,value]of Object.entries(expected.fields)){
    if(!fields.has(field)||fields.get(field).value!==value)errors.push('VALUE:'+field);
    if(value!==null&&!fields.get(field)?.location)errors.push('LOCATION:'+field);
   }
   if(expected.questionRequired&&!result.result.questions.length)errors.push('QUESTION_MISSING');
   report.attempts.push({...result,status:errors.length?'SEMANTIC_ERROR':'PASS',errors});
   await save();console.log(JSON.stringify({caseId:fixture.caseId,status:report.attempts.at(-1).status,tokens:result.tokens}));
  }catch(error){const code=/^GEMINI_[A-Z_]+$/.test(error.message)?error.message:'GEMINI_EVALUATION_FAILED';report.attempts.push({caseId:fixture.caseId,execution:'ACTUAL',status:'ERROR',code});await save();console.log(JSON.stringify({caseId:fixture.caseId,status:'ERROR',code}));break;}
 }
 report.finishedAt=new Date().toISOString();report.costComplete=report.attempts.every(a=>a.tokens && a.tokens.promptTokenCount!==null && a.tokens.candidatesTokenCount!==null);report.estimatedGenerationNanoUsd=String(report.attempts.reduce((sum,a)=>a.tokens?sum+BigInt(a.tokens.promptTokenCount??0)*750n+BigInt((a.tokens.candidatesTokenCount??0)+(a.tokens.thoughtsTokenCount??0))*3750n:sum,0n));await save();console.log(JSON.stringify({execution:'ACTUAL',usage:report.usage,estimatedGenerationNanoUsd:report.estimatedGenerationNanoUsd}));
}
