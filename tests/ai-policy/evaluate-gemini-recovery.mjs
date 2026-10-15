// New approval only: <=5 generation/count requests and USD0.03, never reset a
// previous run. Each explicit phase runs once; errors stop without auto retry.
import {open,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {withEvaluationLease,atomicEvaluationCheckpoint} from '../../src/ai-policy/evaluation-ledger.mjs';
import {createGeminiEvaluation,EVALUATION_PROMPT_VERSION,GEMINI_EVALUATION_MODEL as model,maximumCostNanoUsd} from '../../src/ai-policy/gemini-evaluation.mjs';
import {assessRecovery} from './recovery-assessment.mjs';
const phases={baseline:{version:'clear-gemini-eval.3',ids:['T01','T04']},controls:{version:'clear-gemini-eval.3',ids:['V02']},revised:{version:'clear-gemini-eval.4',ids:['T01','T04','V02']}};
if(process.argv.length!==4||!['--execute-approved','--continue-approved'].includes(process.argv[2])||!Object.hasOwn(phases,process.argv[3])){
 console.log(JSON.stringify({execution:'DRY_RUN',model,maxGenerationCalls:5,maxCountCalls:5,budgetUsd:'0.03',maxOutputTokens:1024,maximumPlannedGenerationReservationUsd:'0.01610',keyRead:false}));process.exit(0);
}
const phase=process.argv[3],selection=phases[phase];
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
if(day!=='2026-10-15'||model!=='gemini-3.5-flash-lite'||maximumCostNanoUsd(1,0)!==300n||maximumCostNanoUsd(0,1)!==2500n)throw new Error('RECOVERY_PRICING_REVERIFY_REQUIRED');
if(EVALUATION_PROMPT_VERSION!==selection.version)throw new Error('RECOVERY_PHASE_PROMPT_MISMATCH');
const dir=new URL('../../artifacts/gemini-recovery-eval-20261015/',import.meta.url),path=new URL('results.json',dir);
const bytes=await readFile(new URL('fixtures.json',dir)),goldBytes=await readFile(new URL('gold.json',dir)),renderer=JSON.parse(await readFile(new URL('renderer.json',dir),'utf8'));
const hash=value=>createHash('sha256').update(value).digest('hex');
if(hash(bytes)!==renderer.fixtureSha256)throw new Error('RECOVERY_CORPUS_HASH');
const corpus=JSON.parse(bytes),gold=JSON.parse(goldBytes),fixtures=corpus.map(f=>({...f,maxInputTokens:f.imageBase64===null?2000:3000}));
await withEvaluationLease(dir,async()=>{
 let report;
 if(process.argv[2]==='--execute-approved'){
  if(phase!=='baseline')throw new Error('RECOVERY_BASELINE_REQUIRED');
  const lock=await open(new URL('approved-run.lock',dir),'wx',0o600);await lock.close();
  report={kind:'ACTUAL_SYNTHETIC_ACCOUNT_RECOVERY_EVALUATION',execution:'ACTUAL',model,startedAt:new Date().toISOString(),corpusHash:hash(bytes),goldHash:hash(goldBytes),
   approval:{maxGenerationCalls:5,maxCountCalls:5,budgetNanoUsd:'30000000',maxOutputTokens:1024,automaticRetries:0},
   pricing:{verifiedAt:'2026-10-15',source:'https://ai.google.dev/gemini-api/docs/pricing',inputNanoUsdPerToken:'300',outputNanoUsdPerToken:'2500'},
   accountRecoveryConfirmedByUser:true,billingInvoiceVerified:false,phases:[],attempts:[],usage:{countCalls:0,generationCalls:0,reservedNanoUsd:'0',actualModelCalls:0},paymentAllowed:false};
 }else report=JSON.parse(await readFile(path,'utf8'));
 if(report.corpusHash!==hash(bytes)||report.goldHash!==hash(goldBytes)||report.model!==model||report.approval.maxGenerationCalls!==5||report.approval.maxCountCalls!==5||report.approval.budgetNanoUsd!=='30000000')throw new Error('RECOVERY_RUN_MISMATCH');
 if(report.phases.includes(phase)||(phase!=='baseline'&&!report.phases.includes('baseline')))throw new Error('RECOVERY_PHASE_USED');
 const previous=structuredClone(report.usage);
 if(previous.countCalls>=5||previous.generationCalls>=5||BigInt(previous.reservedNanoUsd)>=30000000n)throw new Error('RECOVERY_LIMIT');
 // Persist phase before any dispatch: a crash cannot silently repeat it.
 report.phases.push(phase);
 const evaluator=createGeminiEvaluation({fixtures,approval:{approved:true,service:'GEMINI_DEVELOPER_API_PAID_STANDARD',model,syntheticOnly:true,maxGenerationCalls:5-previous.generationCalls,maxCountCalls:5-previous.countCalls,maxOutputTokens:1024,budgetNanoUsd:String(30000000n-BigInt(previous.reservedNanoUsd))},onCheckpoint:()=>save()});
 const save=async()=>{const current=evaluator.usage();report.usage={...current,countCalls:previous.countCalls+current.countCalls,generationCalls:previous.generationCalls+current.generationCalls,actualModelCalls:previous.actualModelCalls+current.actualModelCalls,reservedNanoUsd:String(BigInt(previous.reservedNanoUsd)+BigInt(current.reservedNanoUsd))};await atomicEvaluationCheckpoint(path,report);};
 await save();
 for(const caseId of selection.ids){
  try{
   const fixture=fixtures.find(f=>f.caseId===caseId),result=await evaluator.evaluate(fixture),options={normal:caseId==='T01'};
   const attempt={phase,task:fixture.task,...result,rawAssessment:assessRecovery(result.rawObservation,gold[caseId],options),reviewedAssessment:assessRecovery(result.result,gold[caseId],options)};
   report.attempts.push(attempt);await save();console.log(JSON.stringify({caseId,phase,raw:attempt.rawAssessment,reviewed:attempt.reviewedAssessment,tokens:result.tokens}));
  }catch(error){report.attempts.push({caseId,phase,execution:'ACTUAL',status:'ERROR',code:/^GEMINI_[A-Z_]+$/.test(error.message)?error.message:'RECOVERY_EVALUATION_FAILED',httpStatus:Number.isInteger(error.httpStatus)?error.httpStatus:null});await save();console.log(JSON.stringify({caseId,phase,status:'ERROR',code:report.attempts.at(-1).code}));break;}
 }
 report.finishedAt=new Date().toISOString();report.knownGenerationNanoUsd=String(report.attempts.reduce((sum,a)=>a.tokens?sum+BigInt(a.tokens.promptTokenCount??0)*300n+BigInt((a.tokens.candidatesTokenCount??0)+(a.tokens.thoughtsTokenCount??0))*2500n:sum,0n));
 report.tokenUsageComplete=report.attempts.every(a=>a.tokens&&a.tokens.promptTokenCount!==null&&a.tokens.candidatesTokenCount!==null&&a.tokens.totalTokenCount===a.tokens.promptTokenCount+a.tokens.candidatesTokenCount+(a.tokens.thoughtsTokenCount??0));await save();
 console.log(JSON.stringify({execution:'ACTUAL',usage:report.usage,knownGenerationNanoUsd:report.knownGenerationNanoUsd,tokenUsageComplete:report.tokenUsageComplete}));
});
