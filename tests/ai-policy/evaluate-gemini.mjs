import { readFile, writeFile, open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createGeminiEvaluation, GEMINI_EVALUATION_MODEL as model } from '../../src/ai-policy/gemini-evaluation.mjs';
const dir = new URL('../../artifacts/gemini-pilot/', import.meta.url);
const bytes = await readFile(new URL('fixtures.json',dir));
const renderer = JSON.parse(await readFile(new URL('renderer.json',dir),'utf8'));
if(createHash('sha256').update(bytes).digest('hex')!==renderer.fixtureSha256)throw new Error('CORPUS_HASH_MISMATCH');
const fixtures=JSON.parse(bytes),gold=JSON.parse(await readFile(new URL('gold.json',dir),'utf8'));
if(process.argv.length!==3 || !['--execute-approved','--resume-approved'].includes(process.argv[2])){
  console.log(JSON.stringify({execution:'DRY_RUN',model,text:4,images:8,maxGenerationCalls:14,maxCountCalls:14,budgetUsd:'0.25',keyRead:false}));
}else{
  // Exclusive persistent lock: rerunning never resets this approved run's budget.
  const prior = process.argv[2]==='--resume-approved' ? JSON.parse(await readFile(new URL('actual-results.json',dir),'utf8')) : null;
  if (!prior) { const lock=await open(new URL('approved-run.lock',dir),'wx',0o600);await lock.close(); }
  else if(prior.corpusHash!==renderer.fixtureSha256 || prior.model!==model || prior.execution!=='ACTUAL') throw new Error('RESUME_MISMATCH');
  const previous=prior?.usage??{countCalls:0,generationCalls:0,reservedNanoUsd:'0',actualModelCalls:0};
  const approval={approved:true,service:'GEMINI_DEVELOPER_API_PAID_STANDARD',model,syntheticOnly:true,maxGenerationCalls:14-previous.generationCalls,maxCountCalls:14-previous.countCalls,budgetNanoUsd:String(250000000n-BigInt(previous.reservedNanoUsd))};
  const evaluator=createGeminiEvaluation({fixtures,approval,onCheckpoint:async()=>save()});
  const report=prior??{execution:'ACTUAL',model,startedAt:new Date().toISOString(),corpusHash:renderer.fixtureSha256,attempts:[],paymentAllowed:false};
  const save=async()=>{const current=evaluator.usage();report.usage={...current,countCalls:previous.countCalls+current.countCalls,generationCalls:previous.generationCalls+current.generationCalls,actualModelCalls:previous.actualModelCalls+current.actualModelCalls,reservedNanoUsd:String(BigInt(previous.reservedNanoUsd)+BigInt(current.reservedNanoUsd))};await writeFile(new URL('actual-results.json',dir),JSON.stringify(report,null,2),{mode:0o600});};
  await save();
  for(const fixture of fixtures){
    if(report.attempts.some(a=>a.caseId===fixture.caseId && a.status!=='ERROR'))continue;
    try{
      const result=await evaluator.evaluate(fixture),expected=gold[fixture.caseId],fields=new Map(result.result.fields.map(f=>[f.fieldId,f]));
      const errors=[];
      if(fields.size!==result.result.fields.length)errors.push('DUPLICATE_FIELDS');
      if(fields.size!==Object.keys(expected.fields).length)errors.push('FIELD_SET');
      for(const [field,value] of Object.entries(expected.fields)){
        if(!fields.has(field)||fields.get(field).value!==value)errors.push('VALUE:'+field);
        if(value!==null&&!fields.get(field)?.location)errors.push('LOCATION:'+field);
      }
      if(expected.questionRequired&&!result.result.questions.length)errors.push('QUESTION_MISSING');
      report.attempts.push({...result,status:errors.length?'SEMANTIC_ERROR':'PASS',errors});
      await save();console.log(JSON.stringify({caseId:fixture.caseId,status:report.attempts.at(-1).status,tokens:result.tokens}));
    }catch(error){
      const code=/^(GEMINI_[A-Z_]+)$/.test(error.message)?error.message:'GEMINI_EVALUATION_FAILED';
      report.attempts.push({caseId:fixture.caseId,execution:'ACTUAL',status:'ERROR',code,...(error.syntheticDiagnostic?{syntheticDiagnostic:error.syntheticDiagnostic}:{})});await save();
      console.log(JSON.stringify({caseId:fixture.caseId,status:'ERROR',code}));
      // Service/auth/format failures stop the run. No automatic retry or model switch.
      break;
    }
  }
  report.finishedAt=new Date().toISOString();
  report.costComplete=report.attempts.every(a=>a.tokens && a.tokens.promptTokenCount!==null && a.tokens.candidatesTokenCount!==null);
  report.estimatedGenerationNanoUsd=String(report.attempts.reduce((sum,a)=>a.tokens&&a.tokens.promptTokenCount!==null&&a.tokens.candidatesTokenCount!==null?sum+BigInt(a.tokens.promptTokenCount)*300n+BigInt(a.tokens.candidatesTokenCount+(a.tokens.thoughtsTokenCount??0))*2500n:sum,0n));
  await save();console.log(JSON.stringify({execution:'ACTUAL',completed:report.attempts.length,usage:report.usage,estimatedGenerationNanoUsd:report.estimatedGenerationNanoUsd}));
}
