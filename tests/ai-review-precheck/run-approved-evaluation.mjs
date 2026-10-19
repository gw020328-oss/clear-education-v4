// Single explicitly approved run. Never resumes or retries a spent case.
import {mkdir,open,readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {withEvaluationLease,atomicEvaluationCheckpoint} from '../../src/ai-policy/evaluation-ledger.mjs';
import {createApprovedReviewEvaluator,APPROVED_PINS,sha} from './approved-evaluator.mjs';
import {assessRecovery} from '../ai-policy/recovery-assessment.mjs';
import {buildReviewEvaluationRequest} from './request-builder.mjs';
const enabled=process.argv.length===3&&process.argv[2]==='--execute-approved-20261016';
if(!enabled){console.log(JSON.stringify({execution:'DRY_RUN',keyRead:false,generationCalls:0,countCalls:0,maxGenerationCalls:8,maxCountCalls:8,budgetUsd:'0.05'}));process.exit(0);}
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
if(day!=='2026-10-16')throw Error('REVIEW_EVAL_DATE_REVERIFY');
const prepared=new URL('../../artifacts/review-precheck-evaluation/',import.meta.url);
const corpus=await readFile(new URL('./evaluation-corpus.json',import.meta.url)),fixtureBytes=await readFile(new URL('fixtures.json',prepared)),
  requestBytes=await readFile(new URL('requests.json',prepared)),goldBytes=await readFile(new URL('gold.json',prepared));
for(const [name,bytes] of Object.entries({corpus,fixtures:fixtureBytes,requests:requestBytes,gold:goldBytes}))
  if(sha(bytes)!==APPROVED_PINS[name])throw Error('REVIEW_EVAL_APPROVED_HASH');
const fixtures=JSON.parse(fixtureBytes),gold=JSON.parse(goldBytes);
if(JSON.stringify(JSON.parse(requestBytes))!==JSON.stringify(fixtures.map(f=>({caseId:f.caseId,body:buildReviewEvaluationRequest(f)}))))
  throw Error('REVIEW_EVAL_REQUEST_BODY_PIN');
const dir=pathToFileURL(resolve('artifacts/review-precheck-actual-20261016')+'/');await mkdir(dir,{recursive:true,mode:0o700});
await withEvaluationLease(dir,async()=>{
  const lock=await open(new URL('approved-run.lock',dir),'wx',0o600);await lock.close();
  const report={version:'clear-review-actual-evaluation.1',execution:'ACTUAL',syntheticOnly:true,startedAt:new Date().toISOString(),
    approval:{approvedByUser:true,approvedAt:'2026-10-16',existingSecureKeyConfigurationConfirmed:true,maxGenerationCalls:8,maxCountCalls:8,budgetUsd:'0.05',automaticRetries:0},
    pins:APPROVED_PINS,pricing:{checkedAt:'2026-10-16',inputUsdPerMillion:'0.30',outputUsdPerMillion:'2.50',
      source:'https://ai.google.dev/gemini-api/docs/pricing',countCostConservativelyReservedAsInput:true},
    attempts:[],paymentAllowed:false,billingInvoiceVerified:false};
  const path=new URL('results.json',dir);
  const evaluator=createApprovedReviewEvaluator({fixtures,approved:true,checkpoint:async usage=>{report.usage=usage;await atomicEvaluationCheckpoint(path,report);}});
  report.usage=evaluator.usage();await atomicEvaluationCheckpoint(path,report);
  for(const fixture of fixtures){
    try{
      const r=await evaluator.evaluate(fixture),g=gold[fixture.caseId],normal=['RT01','RT02','RV01'].includes(fixture.caseId);
      const rawAssessment=assessRecovery(r.rawObservation,g,{normal}),reviewedAssessment=assessRecovery(r.result,g,{normal});
      const sourceComparison=g.sourceFixture?{execution:'FIXTURE',expected:g.expectedComparison,
        raw:r.rawObservation.fields.some(f=>f.fieldId===g.sourceFixture.fieldId&&f.value!==null&&f.value!==g.sourceFixture.value)?'CONFLICT':'UNDETERMINED',
        reviewed:r.result.fields.some(f=>f.fieldId===g.sourceFixture.fieldId&&f.value!==null&&f.value!==g.sourceFixture.value)?'CONFLICT':'UNDETERMINED'}:null;
      report.attempts.push({...r,rawAssessment,reviewedAssessment,sourceComparison});
      console.log(JSON.stringify({caseId:r.caseId,rawAssessment,reviewedAssessment,sourceComparison,tokens:r.tokens}));
    }catch(e){
      const code=/^(?:GEMINI|REVIEW_EVAL)_[A-Z_]+$/.test(e.message)?e.message:'REVIEW_EVAL_FAILED';
      report.attempts.push({caseId:fixture.caseId,execution:'ACTUAL',status:'ERROR',code,httpStatus:Number.isInteger(e.httpStatus)?e.httpStatus:null});
      console.log(JSON.stringify({caseId:fixture.caseId,status:'ERROR',code}));break;
    }finally{report.usage=evaluator.usage();await atomicEvaluationCheckpoint(path,report);}
  }
  report.finishedAt=new Date().toISOString();
  report.knownGenerationNanoUsd=String(report.attempts.reduce((sum,a)=>a.tokens?sum+BigInt(a.tokens.promptTokenCount??0)*300n
    +BigInt((a.tokens.candidatesTokenCount??0)+(a.tokens.thoughtsTokenCount??0))*2500n:sum,0n));
  report.tokenUsageComplete=report.attempts.every(a=>a.tokens&&a.tokens.promptTokenCount!==null&&a.tokens.candidatesTokenCount!==null
    &&a.tokens.totalTokenCount===a.tokens.promptTokenCount+a.tokens.candidatesTokenCount+(a.tokens.thoughtsTokenCount??0));
  await atomicEvaluationCheckpoint(path,report);
  console.log(JSON.stringify({execution:'ACTUAL',usage:report.usage,knownGenerationNanoUsd:report.knownGenerationNanoUsd,tokenUsageComplete:report.tokenUsageComplete}));
});
