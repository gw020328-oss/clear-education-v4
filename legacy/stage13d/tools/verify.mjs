// Read-only final audit. No credential access, no provider calls, no prior verifier rerun.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {schema,score,canonical} from '../../stage12/protocol-v3/tools/score.mjs';
import {dualSchemaValidation} from './schema-validation.mjs';
import {semanticRequest,smokeRequest,parseResponse,validateOutput} from './gemini-runner.mjs';
import {loadRecords,analyze} from './report.mjs';
import {read,text,fileSha,sha,encode,need,priorIntegrity,checkManifest,listFiles,stage,project} from './common.mjs';

export function verify({withChecksums=false}={}) {
 const checks=[];
 const check=(name,fn)=>{try{checks.push({name,passed:true,detail:fn()});}catch{checks.push({name,passed:false,error:'CHECK_FAILED_ERROR_BODY_SUPPRESSED'});}};
 const eq=(a,b)=>canonical(a)===canonical(b);
 const run=read('stage13d/RUN_RECORD.json'),rows=loadRecords(),smoke=read('stage13d/raw/smoke/001.record.json');
 const all=[smoke,...rows],plan=read('stage13d/EXECUTION_PLAN.json'),wire=read('stage13d/WIRE_SCHEMA.json');
 const transport=read('stage13d/TRANSPORT_LOCK.json'),model=read('stage13d/MODEL_LOCK.json'),schemaLock=read('stage13d/SCHEMA_LOCK.json');
 const stageFiles=listFiles(stage),preserve=priorIntegrity();
 check('all-prior-files-and-links-byte-identical',()=>{need(preserve.passed,'PRIOR');return preserve;});
 check('new-files-confined-to-stage13d',()=>{need(preserve.newFilesOutsideStage13d.length===0,'OUTSIDE');return {newFilesOutsideStage13d:[],projectScoped:true};});
 check('prechecks-before-directory-creation',()=>{
  const pre=read('stage13d/artifacts/precheck/summary.json'),commands=read('stage13d/artifacts/precheck/commands.json');
  const c=read('stage13d/artifacts/precheck/stage13c-verify.json'),s=read('stage13d/artifacts/precheck/stage12-scorer.json');
  need(pre.passed&&pre.stage13dDidNotExistDuringChecks&&commands.length===3&&commands.every(c=>c.exitCode===0&&c.performedBeforeStage13dCreation),'PRE');
  need(c.passed===18&&c.failed===0&&s.passed===42&&s.failed===0,'CHECKS');
  const sums=text('stage13d/artifacts/precheck/stage13c-checksums.txt').trim().split('\n');need(sums.length===36&&sums.every(l=>l.endsWith(': OK')),'SUMS');
  need(read('stage13/RUN_RECORD.json').actualNeutralSmokeCalls===0&&read('stage13b/RUN_RECORD.json').actualSmokeCalls===0&&read('stage13c/RUN_RECORD.json').actualSmokeCalls===0,'PRIOR_SMOKE');
  need(pre.priorGeminiSemanticCalls===0&&pre.priorGeminiSmokeCalls===0,'PRIOR_CALLS');
  return {stage13cVerifier:'18/18',stage13cChecksums:'36/36',scorer:'42/42',priorGeminiSmoke:0,priorGeminiSemantic:0,priorVerifierRerunByThisTool:false};
 });
 check('authorization-and-boolean-only-key-record',()=>{
  const auth=read('stage13d/artifacts/authorization.json').authorization,k=read('stage13d/artifacts/key-presence.json');
  need(k.GEMINI_API_KEY_present===true&&k.GOOGLE_API_KEY_present===false&&!k.homeCredentialSearchPerformed&&!k.credentialFileSearchPerformed,'KEY');
  need(auth.approved&&auth.provider==='GOOGLE'&&auth.model==='gemini-3.8-flash'&&auth.thinking_level==='medium'&&auth.allow_free_api&&!auth.allow_paid_api&&auth.max_cost_usd===0&&!auth.allow_billing_changes&&!auth.allow_model_download,'AUTH');
  need(eq(run.authorization,auth)&&eq(transport.authorization,auth),'AUTH_RECORD');return {GEMINI_API_KEY:true,GOOGLE_API_KEY:false};
 });
 check('wire-is-positive-assertion-deletion-superset',()=>{
  const {wire:expected,report}=dualSchemaValidation();need(eq(wire,expected)&&eq(report,read('stage13d/artifacts/schema-validation.json')),'WIRE');
  need(report.passed&&report.structuralSupersetProof.passed&&report.narrowingCount===0&&report.originalValidImpliesWireValid&&report.threeCounterexamplesStillFailed,'SUPERSET');
  return {fixtureCount:35,authoritativeValid:report.authoritativeValidCount,wireValid:report.wireValidCount,narrowing:0,structuralSupersetProof:true,threeCounterexamplesStillAuthoritativelyRejected:true};
 });
 check('authoritative-schema-and-original-scorer-unchanged',()=>{
  const inputs=read('stage13d/artifacts/frozen-input-hashes.json').files;need(Object.entries(inputs).every(([p,h])=>fileSha(p)===h),'SOURCE_HASH');
  need(schemaLock.authoritativeSchemaSha256===fileSha('stage12/protocol-v3/schemas/output.schema.json'),'SCHEMA_HASH');
  const manifest=read('stage12/protocol-v3/SHA256_MANIFEST.json');need(Object.entries(manifest.files).every(([p,h])=>fileSha('stage12/'+p)===h),'MANIFEST');
  return {frozenInputFiles:Object.keys(inputs).length,stage12ManifestFiles:Object.keys(manifest.files).length,authoritativeValidator:'Stage12 original validate',scorer:'Stage12 unchanged score/compareArms'};
 });
 check('pre-smoke-locks-predate-first-request-and-remain-identical',()=>{
  const entries=checkManifest('stage13d/checksums-before-smoke.sha256');
  need([schemaLock.frozenAt,transport.frozenAt,plan.frozenAt].every(at=>Date.parse(at)<=Date.parse(smoke.startedAt)),'FREEZE_TIME');
  need(transport.runnerSha256===fileSha('stage13d/tools/gemini-runner.mjs')&&transport.commonCodeSha256===fileSha('stage13d/tools/common.mjs'),'CODE');
  need(schemaLock.wireSchemaSha256===fileSha('stage13d/WIRE_SCHEMA.json')&&schemaLock.supersetValidated,'SCHEMA');
  return {entries:entries.length,firstAPIRequestAt:smoke.startedAt,frozenBeforeFirstAPI:true};
 });
 check('post-smoke-model-lock-predates-semantic-calls',()=>{
  const entries=checkManifest('stage13d/checksums-before-run.sha256');
  need(model.locked&&model.actualSemanticCallsBeforeLock===0&&model.smokePassed,'MODEL_LOCK');
  need(Date.parse(model.lockedAt)>=Date.parse(smoke.endedAt)&&rows.every(r=>Date.parse(model.lockedAt)<=Date.parse(r.startedAt)),'MODEL_TIME');
  need(model.smokeRecordSha256===fileSha('stage13d/raw/smoke/001.record.json')&&model.executionPlanSha256===fileSha('stage13d/EXECUTION_PLAN.json'),'MODEL_HASH');
  return {entries:entries.length,modelLockedBeforeSemantic:true,model:model.actualModel};
 });
 check('exact-original-call-order-and-repeat-identifiers',()=>{
  const original=read('stage12/protocol-v3/CALL_PLAN.json');need(eq(plan.calls,original)&&original.length===42,'PLAN');
  need(plan.repeatSeedUse==='IDENTIFIER_ONLY_NOT_SENT_TO_GEMINI','SEED');
  need(rows.every((r,i)=>Object.entries(original[i]).every(([key,value])=>r[key]===value)&&r.repeatId===r.seed),'ORDER');
  return {planned:42,dev:6,eval:36,attemptedPrefix:rows.length,repeatIdentifiersPreserved:true};
 });
 check('exact-frozen-prompt-input-and-request-hashes',()=>{
  for(const r of rows){const body=semanticRequest(plan.calls[r.sequence],wire);need(eq(body,r.requestBody)&&sha(JSON.stringify(body))===r.requestSha256,'REQUEST');need(plan.requestHashes[r.sequence].sha256===r.requestSha256,'PLAN_HASH');}
  need(eq(smoke.requestBody,smokeRequest(wire))&&plan.neutralSmokeRequestSha256===smoke.requestSha256,'SMOKE_REQUEST');
  return {semanticRequestsChecked:rows.length,sourceAssembly:'Frozen Stage12 requestFor messages unchanged',headersSaved:false};
 });
 check('same-model-and-configuration-for-both-arms',()=>{
  need(all.every(r=>eq(r.settings,transport.settings)&&r.requestBody.model==='gemini-3.8-flash'&&r.requestBody.generation_config.thinking_level==='medium'&&r.requestBody.generation_config.max_output_tokens===4096),'SETTINGS');
  need(all.every(r=>r.requestBody.stream===false&&r.requestBody.store===false&&!Object.hasOwn(r.requestBody,'tools')&&!Object.hasOwn(r.requestBody,'previous_interaction_id')&&!Object.hasOwn(r.requestBody.generation_config,'seed')),'INDEPENDENT');
  need(smoke.actualModel==='gemini-3.8-flash'&&rows.every(r=>r.actualModel===null||r.actualModel==='gemini-3.8-flash'),'ACTUAL_MODEL');
  return {requestedModel:'gemini-3.8-flash',sameSettings:true,actualModelConfirmedBy:'Smoke',semanticModelMetadataReturned:rows.filter(r=>r.actualModel!==null).length};
 });
 check('single-full-schema-smoke-valid',()=>{
  need(smoke.httpStatus===200&&smoke.parseStatus==='PARSED'&&smoke.wireSchemaStatus==='VALID'&&smoke.authoritativeSchemaStatus==='VALID'&&!smoke.errorType,'SMOKE');
  need(smoke.includedInDenominator===false&&smoke.score===null&&eq(smoke.requestBody.response_format.schema,wire),'SMOKE_SCHEMA');
  need(stageFiles.filter(p=>/^stage13d\/raw\/smoke\/\d+\.attempt\.json$/.test(p)).length===1,'SMOKE_COUNT');
  return {smokeCalls:1,wire:'1/1',authoritative:'1/1',excludedFromSemanticDenominator:true};
 });
 check('raw-response-bytes-and-parsing-reproducible',()=>{
  for(const r of all){need(r.rawResponsePath!==null&&!r.rawResponseWithheld&&fileSha(r.rawResponsePath)===r.rawResponseSha256,'RAW');const parsed=parseResponse(text(r.rawResponsePath));need(parsed.parseStatus===r.parseStatus&&eq(parsed.parsed,r.parsed),'PARSE');const validation=validateOutput(parsed.parsed,wire,parsed.parseStatus);need(eq(validation,{wireSchemaStatus:r.wireSchemaStatus,authoritativeSchemaStatus:r.authoritativeSchemaStatus,wireErrors:r.wireErrors,authoritativeErrors:r.authoritativeErrors}),'VALIDATE');}
  return {rawResponsesChecked:all.length,byteHashesMatch:true,wireAndAuthoritativeValidationRecomputed:true};
 });
 check('failure-scores-use-original-scorer-and-remain-in-denominator',()=>{
  const dataset=text('stage12/protocol-v3/DATASET.jsonl').trim().split('\n').map(JSON.parse);
  const references=text('stage12/protocol-v3/REFERENCE_LABELS.jsonl').trim().split('\n').map(JSON.parse);
  for(const r of rows){const eligible=!r.errorType&&r.authoritativeSchemaStatus==='VALID'&&r.wireSchemaStatus==='VALID';const evaluated=eligible?r.parsed:r.authoritativeSchemaStatus==='INVALID'?r.parsed:null;
   need(eq(score(evaluated,references.find(v=>v.sourceId===r.sourceId),dataset.find(v=>v.sourceId===r.sourceId)),r.score),'SCORE');need(r.includedInDenominator&&!r.score.completeCorrect&&r.score.majorError,'FAILURE_DENOMINATOR');}
  need(run.metrics.B.attempts+run.metrics.C.attempts===rows.length,'METRIC_DENOMINATOR');
  return {attemptsInDenominator:rows.length,failedAttempts:rows.filter(r=>r.score.majorError).length,unattemptedNotFabricated:42-rows.length};
 });
 check('serial-15-second-interval-and-no-retry-repair-correction',()=>{
  const gaps=all.slice(1).map((r,i)=>Date.parse(r.startedAt)-Date.parse(all[i].endedAt));need(gaps.every(g=>g>=15000),'GAPS');
  need(all.every(r=>!r.retry&&!r.repair&&!r.manualCorrection&&r.headersOmitted),'NO_REPAIR');
  need(run.actualRetries===0&&run.actualJsonRepairs===0&&run.manualCorrections===0&&run.codexResponsesUsedAsEvaluationData===0,'COUNTS');
  return {minimumEndToStartGapMs:Math.min(...gaps),requiredGapMs:15000,retries:0,repairs:0,manualCorrections:0,parallelCalls:1};
 });
 check('attempt-journal-complete-and-no-duplicate-sequence',()=>{
  const attempts=stageFiles.filter(p=>/^stage13d\/raw\/semantic\/\d{3}\.attempt\.json$/.test(p)).map(read);
  need(attempts.length===rows.length&&new Set(attempts.map(r=>r.sequence)).size===attempts.length,'ATTEMPTS');
  for(const r of rows){const a=attempts.find(a=>a.sequence===r.sequence);need(a.requestSha256===r.requestSha256&&a.startedAt===r.startedAt,'JOURNAL');}
  need(rows.length===3&&run.actualSemanticCalls===3&&run.unstartedPlannedCalls===39,'COUNTS');
  return {actualAttempts:3,completedAttemptRecords:3,planned:42,runComplete:false,unattempted:39,noDuplicates:true};
 });
 check('quota-stops-run-without-performance-conclusion',()=>{
  need(eq(rows.map(r=>r.httpStatus),[500,500,429]),'HTTP');
  need(rows.at(-1).quotaStatus==='EXHAUSTED'&&read('stage13d/artifacts/SEMANTIC_STATUS.json').status==='BLOCKED_FREE_QUOTA_INCOMPLETE','QUOTA');
  need(run.finalVerdict==='BLOCKED_FREE_QUOTA_INCOMPLETE'&&!run.metrics.performanceConclusionAllowed,'VERDICT');
  return {statuses:[500,500,429],quotaExhaustionObserved:true,remainingCallsNotSent:39,performanceConclusion:false};
 });
 check('free-model-only-and-billing-evidence-not-overstated',()=>{
  need(all.every(r=>r.requestBody.model==='gemini-3.8-flash'&&!r.paidUsageSignal),'MODEL');
  need(run.billingChanges===0&&run.actualModelDownloadGB===0&&run.maximumAuthorizedCostUSD===0&&run.actualBilledCostUSD===null&&run.paidTierStatus==='UNKNOWN','BILLING');
  need(['activeRPM','activeTPM','activeRPD'].every(k=>run.quota[k]==='UNKNOWN'),'QUOTA_UNKNOWN');
  return {approvedModelOnly:true,billingChanges:0,knownPaidUsageSignals:0,accountBillingTier:'UNKNOWN',actualBilledCostUSD:null,paidUsageAbsenceIndependentlyConfirmed:false};
 });
 check('no-recorded-credential-or-authentication-header-value',()=>{
  const patterns=[/\bAIza[0-9A-Za-z_-]{20,}\b/,/["'](?:x-goog-api-key|authorization)["']\s*:\s*["'][^"']+["']/i];
  need(stageFiles.every(path=>!patterns.some(p=>p.test(text(path)))),'SECRET_PATTERN');
  need(all.every(r=>!Object.hasOwn(r,'headers')&&!Object.hasOwn(r.requestBody,'headers')&&r.headersOmitted),'HEADERS');
  return {recognizableMatches:0,storedHeaders:0,rawResponseCredentialGuard:'Exact in-memory key comparison plus recognizable patterns before byte preservation',auditReadsActualCredential:false};
 });
 check('final-metrics-audit-and-verdict-recompute',()=>{
  const summary=analyze(rows,{bindingIntact:preserve.passed,runStatus:read('stage13d/artifacts/SEMANTIC_STATUS.json').status});
  need(eq(summary,read('stage13d/artifacts/summary.json'))&&summary.finalVerdict===run.finalVerdict,'RECOMPUTE');
  const audit=read('stage13d/artifacts/error-audit.json');need(eq(audit.categories,summary.errorAudit),'AUDIT');
  need(text('stage13d/DECISION.md').split('\n\n')[1]===run.finalVerdict,'DECISION');
  return {finalVerdict:run.finalVerdict,reportMatchesFrozenScorer:true,additionalEvaluationRecommended:false,aiRole:'OPTIONAL_HUMAN_REVIEW_AUXILIARY',nextStep:'STAGE14_MANUAL_TEMPLATE_DETERMINISTIC_COMPILER_PROTOTYPE'};
 });
 check('all-required-artifacts-present',()=>{
  const required=['README.md','AUTHORIZATION.md','PREFLIGHT.md','DUAL_SCHEMA_PROTOCOL.md','WIRE_SCHEMA.json','SCHEMA_LOCK.json','TRANSPORT_LOCK.json','MODEL_LOCK.json','EXECUTION_PLAN.json','RUN_RECORD.json','RESULTS.md','ERROR_AUDIT.md','DECISION.md','artifacts/prior-files.json','artifacts/schema-validation.json','checksums-before-run.sha256','tools/gemini-runner.mjs'];
  need(required.every(p=>fs.statSync(stage+'/'+p).size>0),'REQUIRED');return {nonemptyRequiredFiles:required.length,finalVerificationAndChecksumsCreatedAfterAudit:!withChecksums};
 });
 if(withChecksums)check('final-checksum-coverage-and-verification-record',()=>{
  const entries=checkManifest('stage13d/checksums.sha256');const expected=stageFiles.filter(p=>p!=='stage13d/checksums.sha256');
  need(eq(entries.map(e=>e.path).sort(),expected)&&entries.length===new Set(entries.map(e=>e.path)).size,'COVERAGE');
  const final=read('stage13d/artifacts/final-verification.json');need(final.failed===0&&final.finalVerdict===run.finalVerdict&&final.priorFilesByteIdentical,'FINAL_RECORD');
  return {matchedFiles:entries.length,excludesSelf:true,includesFinalVerification:true};
 });
 return {kind:'STAGE13D_FINAL_READ_ONLY_AUDIT',recordedAt:new Date().toISOString(),finalVerdict:run.finalVerdict,
  passed:checks.filter(c=>c.passed).length,failed:checks.filter(c=>!c.passed).length,total:checks.length,priorFilesByteIdentical:preserve.passed,
  actualSmokeCalls:1,actualSemanticCalls:rows.length,plannedSemanticCalls:42,runComplete:rows.length===42,
  checksums:withChecksums?'VERIFIED':'GENERATE_AFTER_THIS_RECORD',checks};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){try{const result=verify({withChecksums:process.argv.includes('--with-checksums')});console.log(encode(result));process.exitCode=result.failed?1:0;}catch{console.log(JSON.stringify({status:'AUDIT_SETUP_FAILURE',error:'ERROR_BODY_SUPPRESSED'}));process.exitCode=1;}}
