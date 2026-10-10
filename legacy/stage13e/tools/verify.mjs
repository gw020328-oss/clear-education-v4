// Post-execution, read-only audit. Does not read credentials or invoke the runner.
import fs from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonical} from '../../stage12/protocol-v3/tools/score.mjs';
import {verifyFreeze,requestFor} from '../../stage12/protocol-v3/tools/run.mjs';
import {dualSchemaValidation} from '../../stage13d/tools/schema-validation.mjs';
import {settings,authorization,pricing,semanticBody,smokeBody,conservativeCost,usageCost,decode,evaluate,retryable,retryHintMs,wrongBilling,smokePass} from './policy.mjs';
import {read,text,bytes,sha,fileSha,integrity,manifestCheck,listFiles,project,stage} from './io.mjs';
import {logicalRecords,transmissionRecords,analyze} from './report.mjs';

const eq=(a,b)=>canonical(a)===canonical(b),near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-9;
const requireThat=(value,message)=>{if(!value)throw new Error(message);};
const select=(x,keys)=>Object.fromEntries(keys.map(k=>[k,x[k]]));
const stamp=x=>Date.parse(x);
const relativeAttempt=t=>`stage13e/raw/${t.kind}/${t.logicalId}/attempt-${t.attempt}.json`;
function inventory(){const out=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=resolve(dir,e.name);if(e.isDirectory())walk(p);else out.push({path:p.slice(project.length),type:e.isSymbolicLink()?'symlink':e.isFile()?'file':'other'});}}walk(project);return out;}

export function verify({withChecksums=false}={}){
 const checks=[];
 const check=(id,fn)=>{try{const detail=fn();checks.push({id,passed:true,...(detail?{detail}:{})});}catch(error){checks.push({id,passed:false,error:/^[A-Z0-9_:.-]+$/.test(error.message)?error.message:'AUDIT_EXCEPTION_DETAILS_SUPPRESSED'});}};
 const prior=read('stage13e/artifacts/prior-files.json'),pre=read('stage13e/artifacts/precheck/summary.json');
 const plan=read('stage13e/EXECUTION_PLAN.json'),originalPlan=read('stage12/protocol-v3/CALL_PLAN.json');
 const execution=read('stage13e/artifacts/EXECUTION_STATUS.json'),run=read('stage13e/RUN_RECORD.json'),summary=read('stage13e/artifacts/summary.json');
 const wire=read('stage13e/WIRE_SCHEMA.json'),rows=logicalRecords(),attempts=transmissionRecords();
 const smoke=read('stage13e/raw/smoke/smoke-001/logical.json'),allLogical=[smoke,...rows];
 const actualRows=rows.filter(r=>r.transmissionCount>0),preservation=integrity();
 const grouped=r=>attempts.filter(t=>t.kind===r.kind&&t.logicalId===r.logicalId).sort((a,b)=>a.attempt-b.attempt);
 const failures=actualRows.filter(r=>r.transportFailure).length;
 const completedByArm=Object.fromEntries(['B','C'].map(arm=>[arm,actualRows.filter(r=>r.arm===arm).length]));

 check('01_PRIOR_FILES_AND_SYMLINK_BYTES',()=>{
  requireThat(preservation.passed,'PRIOR_BYTES_CHANGED');
  const current=new Map(inventory().map(e=>[e.path,e.type]));
  requireThat(prior.entries.every(e=>current.get(e.path)===e.type),'PRIOR_ENTRY_TYPE_CHANGED');
  requireThat(prior.entries.length===11404&&Object.keys(prior.symlinks).length===45,'BASELINE_COUNT');
  return {entries:prior.entries.length,regularFiles:prior.entries.filter(e=>e.type==='file').length,symlinks:45};
 });
 check('02_NEW_FILES_ONLY_IN_STAGE13E',()=>{
  const before=new Set(prior.entries.map(e=>e.path)),extras=inventory().filter(e=>!before.has(e.path)&&!e.path.startsWith('stage13e/'));
  requireThat(extras.length===0,'NEW_ENTRY_OUTSIDE_STAGE13E');
  requireThat(inventory().filter(e=>e.path.startsWith('stage13e/')).every(e=>e.type==='file'),'NEW_NONREGULAR_ENTRY');
 });
 check('03_CAPTURED_PREFLIGHT_AND_APPROVAL',()=>{
  requireThat(pre.passed&&pre.stage13eDidNotExistDuringChecks&&pre.stage13dPriorFileCount===11344,'PREFLIGHT_FAILED');
  const old=read('stage13e/artifacts/precheck/stage13d-verify.json'),scorer=read('stage13e/artifacts/precheck/stage12-scorer.json');
  requireThat(old.passed===22&&old.failed===0&&scorer.passed===42&&scorer.failed===0,'CAPTURED_TESTS_FAILED');
  const lines=text('stage13e/artifacts/precheck/stage13d-checksums.txt').trim().split('\n');
  requireThat(lines.length===59&&lines.every(l=>l.endsWith(': OK')),'PRIOR_CHECKSUM_RESULTS');
  requireThat(read('stage13e/artifacts/precheck/commands.json').every(c=>c.exitCode===0&&c.performedBeforeStage13eCreation),'PRECHECK_TIMING');
  requireThat(eq(run.authorization,authorization)&&eq(read('stage13e/artifacts/authorization.json').authorization,authorization),'AUTHORIZATION_CHANGED');
  const key=read('stage13e/artifacts/key-presence.json');
  requireThat(key.GEMINI_API_KEY_present===true&&key.GOOGLE_API_KEY_present===false&&eq(run.keyPresence,{GEMINI_API_KEY:true,GOOGLE_API_KEY:false}),'KEY_PRESENCE_GATE');
 });
 check('04_FROZEN_STAGE12_INPUTS_AND_SCORER',()=>{
  requireThat(verifyFreeze()==='f51327fa484caf5c2894302c7c68ca8dfeea50937e9197eaf03f919b09c70242','STAGE12_FREEZE');
  requireThat(pre.expectedHashes.every(h=>h.expected===fileSha(h.path)),'EXPECTED_HASH_CHANGED');
  const frozen=read('stage13e/artifacts/frozen-input-hashes.json').files;
  requireThat(Object.entries(frozen).every(([p,h])=>fileSha(p)===h)&&eq(plan.frozenInputHashes,frozen),'INPUT_HASH_CHANGED');
  requireThat(!Object.keys(frozen).some(p=>/stage13d\/(raw|artifacts\/semantic)/.test(p)),'PRIOR_RESPONSE_INPUT');
  const scorer=read('stage13e/artifacts/scorer-before-first-api.json');
  requireThat(scorer.passed===42&&scorer.failed===0,'SCORER_PRE_API');
 });
 check('05_WIRE_BYTES_AND_STRUCTURAL_SUPERSET',()=>{
  requireThat(bytes('stage13e/WIRE_SCHEMA.json').equals(bytes('stage13d/WIRE_SCHEMA.json')),'WIRE_BYTES_CHANGED');
  const {wire:derived,report}=dualSchemaValidation();
  requireThat(eq(wire,derived)&&report.passed&&report.fixtureCount===35&&report.narrowingCount===0&&report.structuralSupersetProof.passed,'WIRE_NARROWING');
  requireThat(eq(report,read('stage13e/artifacts/schema-validation.json')),'SCHEMA_AUDIT_CHANGED');
  return {fixtures:35,narrowing:0};
 });
 check('06_PRE_API_LOCKS_AND_POST_SMOKE_PIN',()=>{
  const beforeSmoke=manifestCheck('stage13e/checksums-before-smoke.sha256'),beforeRun=manifestCheck('stage13e/checksums-before-run.sha256');
  const schemaLock=read('stage13e/SCHEMA_LOCK.json'),transport=read('stage13e/TRANSPORT_LOCK.json'),cost=read('stage13e/COST_LOCK.json'),model=read('stage13e/MODEL_LOCK.json');
  requireThat(eq(transport.settings,settings)&&eq(transport.authorization,authorization)&&eq(cost.pricing,pricing)&&eq(plan.settings,settings),'SETTINGS_CHANGED');
  requireThat([schemaLock.frozenAt,transport.frozenAt,cost.lockedAt,plan.frozenAt].every(t=>stamp(t)<stamp(smoke.startedAt)),'FREEZE_AFTER_FIRST_API');
  requireThat(model.locked&&model.actualModel===settings.model&&model.requestedModel===settings.model&&model.actualSemanticCallsBeforeLock===0,'MODEL_NOT_PINNED');
  requireThat(stamp(model.lockedAt)>=stamp(smoke.endedAt)&&(!actualRows.length||stamp(model.lockedAt)<=stamp(actualRows[0].startedAt)),'MODEL_LOCK_TIMING');
  requireThat(model.smokeLogicalSha256===fileSha('stage13e/raw/smoke/smoke-001/logical.json')&&Object.entries(model.locks).every(([p,h])=>fileSha('stage13e/'+p)===h),'MODEL_LOCK_HASH');
  return {beforeSmokeEntries:beforeSmoke.length,beforeRunEntries:beforeRun.length};
 });
 check('07_NEUTRAL_SMOKE_ONE_LOGICAL_CALL',()=>{
  requireThat(smoke.kind==='smoke'&&smoke.logicalId==='smoke-001'&&smokePass(smoke),'SMOKE_NOT_PASSED');
  requireThat(smoke.includedInDenominator===false&&allLogical.filter(r=>r.kind==='smoke').length===1,'SMOKE_DENOMINATOR');
  requireThat(text('stage13e/raw/smoke/smoke-001/request.json')===JSON.stringify(smokeBody(wire)),'SMOKE_REQUEST_CHANGED');
  requireThat(run.smokeLogicalCalls===1&&run.smokePassed===true&&run.smokeTransmissions===grouped(smoke).length,'SMOKE_RUN_RECORD');
 });
 check('08_CALL_SEQUENCE_REPEAT_IDS_AND_COMPLETION_ACCOUNTING',()=>{
  requireThat(eq(plan.calls,originalPlan)&&plan.calls.length===42,'ORIGINAL_PLAN_CHANGED');
  requireThat(rows.length<=42&&rows.every((r,i)=>eq(select(r,Object.keys(originalPlan[i])),originalPlan[i])&&r.sequence===i&&r.repeatId===originalPlan[i].seed),'SEQUENCE_OR_REPEAT_CHANGED');
  requireThat(actualRows.length===execution.completedLogicalCalls&&run.semanticLogicalCalls===actualRows.length,'LOGICAL_COUNT_MISMATCH');
  requireThat(summary.B.logicalCalls===completedByArm.B&&summary.C.logicalCalls===completedByArm.C,'ARM_COUNT_MISMATCH');
  const complete=completedByArm.B===21&&completedByArm.C===21;
  requireThat(summary.complete42===complete&&(complete||run.finalVerdict.startsWith('BLOCKED_')),'INCOMPLETE_NOT_DISCLOSED');
  requireThat(run.terminalOutcomes.length===42&&run.terminalOutcomes.every((t,i)=>{
   const r=rows.find(x=>x.sequence===i);return eq(select(t,Object.keys(originalPlan[i])),originalPlan[i])&&t.repeatId===originalPlan[i].seed&&t.transmissionCount===(r?.transmissionCount??0)&&t.status===(r?.transmissionCount?r.scoringStatus:'NOT_ATTEMPTED')&&t.transportFailure===(r?.transmissionCount?r.transportFailure:null);
  }),'TERMINAL_42_OUTCOMES');
  return {expected:{B:21,C:21},observed:completedByArm,completionRequirementMet:complete,interpretation:complete?'COMPLETE':'NOT_MET_EXECUTION_BLOCKED_NOT_A_PERFORMANCE_RESULT'};
 });
 check('09_FRESH_ORIGINAL_REQUEST_BYTES',()=>{
  for(const row of rows){const original=requestFor(originalPlan[row.sequence],settings.model),p=`stage13e/raw/semantic/${row.logicalId}/request.json`,serialized=text(p),body=JSON.parse(serialized),expected=JSON.stringify(semanticBody(originalPlan[row.sequence],wire));
   requireThat(serialized===expected&&sha(serialized)===row.requestSha256&&sha(serialized)===plan.requestHashes[row.sequence].requestSha256,'REQUEST_BYTES_CHANGED');
   requireThat(body.system_instruction===original.messages[0].content&&body.input===original.messages[1].content,'ORIGINAL_MESSAGES_CHANGED');
   requireThat(!['headers','tools','previous_interaction_id','seed'].some(k=>Object.hasOwn(body,k)),'PROHIBITED_REQUEST_FIELD');
  }
  requireThat(plan.priorStageOutputsReused===0&&read('stage13e/artifacts/SEMANTIC_STARTED.json').stage13dOutputsReused===0,'PRIOR_DATA_REUSED');
 });
 check('10_ATOMIC_ATTEMPT_RECORDS_AND_RAW_HASHES',()=>{
  const paths=listFiles(stage),started=paths.filter(p=>/\/attempt-\d\.started\.json$/.test(p)),completed=paths.filter(p=>/\/attempt-\d\.json$/.test(p));
  requireThat(started.length===attempts.length&&completed.length===attempts.length&&!paths.some(p=>p.includes('.tmp-')),'PENDING_OR_EXTRA_ATTEMPT');
  for(const t of attempts){const start=read(relativeAttempt(t).replace('.json','.started.json'));const {status,...base}=start;
   requireThat(status==='TRANSMISSION_RESERVED_NO_REPLAY'&&eq(base,select(t,Object.keys(base))),'STARTED_RECORD_CHANGED');
   requireThat(t.headersOmitted===true&&t.requestSha256===fileSha(t.requestPath),'ATTEMPT_REQUEST_HASH');
   requireThat(t.rawResponseWithheld===false,'RAW_RESPONSE_WITHHELD');
   if(t.rawResponsePath)requireThat(t.rawResponsePath===relativeAttempt(t).replace('.json','.response.txt')&&fileSha(t.rawResponsePath)===t.rawResponseSha256,'RAW_HASH_MISMATCH');
   else requireThat(t.rawResponseSha256===null&&t.networkCode!==null,'MISSING_RAW_WITHOUT_NETWORK_ERROR');
   requireThat(stamp(t.endedAt)>=stamp(t.startedAt)&&Number.isFinite(t.latencyMs)&&t.latencyMs>=0,'INVALID_TRANSMISSION_TIME');
  }
  const rawPaths=paths.filter(p=>/\/attempt-\d\.response\.txt$/.test(p));
  requireThat(eq(rawPaths.sort(),attempts.map(t=>t.rawResponsePath).filter(Boolean).sort()),'EXTRA_RAW_RESPONSE');
 });
 check('11_RAW_ENVELOPE_JSON_AND_USAGE_REPLAY',()=>{
  for(const t of attempts){const raw=t.rawResponsePath?text(t.rawResponsePath):'',decoded=raw?decode(raw):{envelope:null,parsed:null,parseStatus:'NOT_PARSED',parseError:'NO_RESPONSE_BODY'},e=decoded.envelope;
   requireThat(eq(select(t,['parsed','parseStatus','parseError']),select(decoded,['parsed','parseStatus','parseError'])),'RAW_PARSE_MISMATCH');
   const expected={actualModel:typeof e?.model==='string'?e.model:null,actualModelVersion:e?.model_version??null,interactionId:typeof e?.id==='string'?e.id:null,interactionStatus:e?.status??null,envelopeErrorCount:Array.isArray(e?.errors)?e.errors.length:e?.error?1:0,responseGenerationConfig:e?.generation_config??null,usage:e?.usage??null,providerExplicitBillingTier:typeof e?.billing_tier==='string'?e.billing_tier:null};
   requireThat(eq(select(t,Object.keys(expected)),expected)&&eq(t.usageEstimate,usageCost(expected.usage)),'ENVELOPE_METADATA_MISMATCH');
   requireThat(t.wrongBillingProject===wrongBilling(t.httpStatus,raw)&&t.retryable===retryable(t.httpStatus,t.networkCode),'TRANSPORT_CLASSIFICATION');
   requireThat(Number.isFinite(t.providerRetryDelayMs)&&t.providerRetryDelayMs>=0&&t.providerRetryDelayMs>=(t.httpStatus!==200?retryHintMs(null,raw,t.endedAt):0),'PROVIDER_DELAY_TOO_SHORT');
  }
 });
 check('12_LOGICAL_FIRST_200_AND_ORIGINAL_SCORER_REPLAY',()=>{
  for(const r of allLogical){const tx=grouped(r),terminal=tx.find(t=>t.httpStatus===200)??tx.at(-1)??null,row=r.kind==='semantic'?originalPlan[r.sequence]:null,replayed=evaluate(terminal,row,wire);
   requireThat(eq(select(r,Object.keys(replayed)),replayed),'SCORER_OR_SCHEMA_MISMATCH');
   requireThat(r.selectedAttempt===(terminal?.attempt??null)&&r.transmissionCount===tx.length&&r.retryCount===Math.max(0,tx.length-1),'SELECTION_OR_COUNT_MISMATCH');
   requireThat(eq(r.attemptPaths,tx.map(relativeAttempt))&&r.terminalRawResponsePath===(terminal?.rawResponsePath??null)&&r.terminalHTTPStatus===(terminal?.httpStatus??null),'LOGICAL_TERMINAL_MISMATCH');
   requireThat(r.includedInDenominator===(r.kind==='semantic'&&tx.length>0),'FAILURE_REMOVED_FROM_DENOMINATOR');
   requireThat(r.selectionRule==='FIRST_HTTP_200_ELSE_FINAL_TRANSPORT_FAILURE'&&r.repair===false&&r.manualCorrection===false&&r.resultBasedRetries===0&&r.responseSelection===0&&r.priorStageResponsesReused===0,'RESULT_MODIFICATION');
  }
 });
 check('13_TRANSPORT_ONLY_RETRIES_AND_IDENTICAL_BODY',()=>{
  for(const r of allLogical){const tx=grouped(r);requireThat(tx.length<=3,'TOO_MANY_ATTEMPTS');
   for(let i=0;i<tx.length;i++){const t=tx[i],p=tx[i-1];requireThat(t.attempt===i+1&&t.requestSha256===r.requestSha256,'RETRY_REQUEST_CHANGED');
    if(!p)requireThat(t.retryReason===null,'INITIAL_RETRY_REASON');
    else requireThat(p.httpStatus!==200&&retryable(p.httpStatus,p.networkCode)&&!p.wrongBillingProject&&!p.rawResponseWithheld&&t.retryReason===(p.httpStatus!==null?'HTTP_'+p.httpStatus:p.networkCode),'FORBIDDEN_RETRY');
   }
   requireThat(tx.filter(t=>t.httpStatus===200).length<=1&&(!tx.some(t=>t.httpStatus===200)||tx.at(-1).httpStatus===200),'RETRY_AFTER_HTTP_200');
  }
 });
 check('14_SERIAL_30_60_SECOND_AND_PROVIDER_DELAYS',()=>{
  let minimumGap=null;
  for(let i=0;i<attempts.length;i++){const t=attempts[i],group=attempts.filter(a=>a.kind===t.kind&&a.logicalId===t.logicalId),previous=group.find(a=>a.attempt===t.attempt-1),required=Math.max(30000,t.attempt===3?60000:30000,previous?.providerRetryDelayMs??0);
   requireThat(t.requiredWaitMs===required,'WAIT_RULE_CHANGED');
   if(i){const gap=stamp(t.startedAt)-stamp(attempts[i-1].endedAt);minimumGap=minimumGap===null?gap:Math.min(minimumGap,gap);requireThat(gap>=required,'INTERVAL_TOO_SHORT');}
  }
  return {minimumObservedGapMs:minimumGap,parallelCalls:1};
 });
 check('15_RUN_RECORD_MATCHES_EVERY_TRANSMISSION',()=>{
  requireThat(run.transports.length===attempts.length&&run.actualTransmissions===attempts.length,'TRANSMISSION_COUNT');
  for(let i=0;i<attempts.length;i++){const recorded=run.transports[i],t=attempts[i],{transmissionRecordPath,...rest}=recorded;requireThat(transmissionRecordPath===relativeAttempt(t)&&eq(rest,select(t,Object.keys(rest))),'RUN_RECORD_RAW_MISMATCH');}
  const semantic=attempts.filter(t=>t.kind==='semantic').length,smokeCount=attempts.filter(t=>t.kind==='smoke').length,retries=attempts.filter(t=>t.attempt>1).length;
  requireThat(run.semanticTransmissions===semantic&&execution.semanticTransmissions===semantic&&execution.smokeTransmissions===smokeCount&&execution.retries===retries&&run.transportRetries===retries,'COUNTER_MISMATCH');
  requireThat(run.finalTransportFailures===failures&&eq(run.actualReturnedModels,[...new Set(attempts.map(a=>a.actualModel).filter(Boolean))]),'MODEL_OR_FAILURE_COUNT');
 });
 check('16_COST_RESERVATIONS_USAGE_AND_CAP',()=>{
  let total=0,conservative=0,usageTotal=0;
  for(const t of attempts){const estimate=conservativeCost(text(t.requestPath)),usage=usageCost(t.usage);requireThat(near(t.estimatedCostUSD,estimate)&&near(t.estimatedCostBeforeUSD,total)&&near(t.estimatedCostReservedUSD,total+estimate)&&total+estimate<=3+1e-12,'COST_BEFORE_TRANSMISSION');
   conservative+=estimate;usageTotal+=usage?.estimatedCostUSD??0;total+=Math.max(estimate,usage?.estimatedCostUSD??0);requireThat(near(t.estimatedCostAfterUSD,total),'COST_AFTER_TRANSMISSION');
  }
  for(const r of allLogical){const tx=grouped(r);requireThat(near(r.estimatedCostUSD,tx.reduce((s,t)=>s+Math.max(t.estimatedCostUSD,t.usageEstimate?.estimatedCostUSD??0),0)),'LOGICAL_COST');}
  const cost=read('stage13e/COST_LOCK.json'),expectedCosts=[JSON.stringify(smokeBody(wire)),...originalPlan.map(r=>JSON.stringify(semanticBody(r,wire)))];
  requireThat(cost.requestCosts.length===43&&cost.requestCosts.every((c,i)=>c.requestSha256===sha(expectedCosts[i])&&c.inputTokenUpperBound===Buffer.byteLength(expectedCosts[i])&&c.outputIncludingThinkingTokenUpperBound===4096&&near(c.estimatedCostUSD,conservativeCost(expectedCosts[i]))),'LOCKED_COST_PLAN');
  requireThat(near(cost.firstAttempts.estimatedCostUSD,expectedCosts.reduce((s,c)=>s+conservativeCost(c),0))&&cost.firstAttempts.estimatedCostUSD<=3,'INITIAL_BUDGET');
  requireThat([run,summary,execution].every(x=>near(x.estimatedCostUSD,total)&&near(x.conservativeEstimatedCostUSD,conservative)&&near(x.usageEstimatedCostUSD,usageTotal)&&x.actualBilledCostUSD===null),'TOTAL_COST_MISMATCH');
  requireThat(total<=3+1e-12&&run.maximumAuthorizedEstimatedCostUSD===3,'CAP_EXCEEDED');
  return {estimatedCostUSD:total,usageEstimatedCostUSD:usageTotal,actualBilledCostUSD:null};
 });
 check('17_STOP_RULE_AND_NO_FURTHER_REQUESTS',()=>{
  let consecutive=0,firstOutage=null;for(const r of actualRows){consecutive=r.transportFailure?consecutive+1:0;if(consecutive===3&&firstOutage===null)firstOutage=r.sequence;}
  const wrong=attempts.find(t=>t.wrongBillingProject);
  if(wrong)requireThat(attempts.at(-1)===wrong&&execution.status==='BLOCKED_WRONG_BILLING_PROJECT','WRONG_BILLING_NOT_STOPPED');
  if(firstOutage!==null)requireThat(execution.status==='BLOCKED_PROVIDER_OUTAGE'&&actualRows.at(-1).sequence===firstOutage&&rows.length===actualRows.length,'OUTAGE_NOT_STOPPED');
  if(execution.status==='BLOCKED_PROVIDER_OUTAGE')requireThat(firstOutage!==null&&execution.reason==='THREE_CONSECUTIVE_LOGICAL_TRANSPORT_FAILURES','UNSUPPORTED_OUTAGE');
  if(execution.status==='BLOCKED_COST_CAP'){const terminal=rows.at(-1)??smoke;requireThat(terminal.stopReason==='BLOCKED_COST_CAP'&&execution.estimatedCostUSD+conservativeCost(text(`stage13e/raw/${terminal.kind}/${terminal.logicalId}/request.json`))>3,'UNSUPPORTED_COST_STOP');}
  requireThat(attempts.every(t=>stamp(t.endedAt)<=stamp(execution.at))&&run.stopStatus===execution.status&&run.stopReason===execution.reason,'POST_STOP_TRANSMISSION');
  return {executionStatus:execution.status,firstOutageSequence:firstOutage,finalTransportFailures:failures};
 });
 check('18_NO_REPAIR_SELECTION_PRIOR_POOLING_OR_BILLING_CLAIM',()=>{
  requireThat(['jsonRepair','manualCorrection','resultBasedRetries','responseSelection','stage13dResponsesReused','stage10ResultsPooled','billingChanges','newKeysCreated','modelDownloads'].every(k=>run[k]===0),'FORBIDDEN_ACTIVITY_RECORDED');
  requireThat(summary.priorStageResultsPooled===false&&run.billingTier==='USER_ATTESTED_PAID_TIER'&&run.billingEvidence==='USER_PAYMENT_CONFIRMATION'&&run.runtimePaidTierProof==='UNKNOWN_UNLESS_PROVIDER_EXPLICITLY_RETURNS_IT','UNSUPPORTED_BILLING_OR_POOLING_CLAIM');
  requireThat(attempts.every(t=>t.kind==='semantic'||t.kind==='smoke'),'NON_STAGE13E_SAMPLE');
 });
 check('19_SECRET_PATTERNS_AND_STORED_HEADERS_ABSENT',()=>{
  // Scan without reading any credential variable; report counts, never matching text.
  const keyPattern=/\bAIza[0-9A-Za-z_-]{20,}\b/;
  const headerValue=/["'](?:x-goog-api-key|authorization)["']\s*:\s*["'][^"']+["']/i;
  let hits=0;for(const p of listFiles(stage)){const content=text(p);if(keyPattern.test(content)||headerValue.test(content))hits++;}
  requireThat(hits===0,'SECRET_OR_AUTH_HEADER_PATTERN_FOUND');
  requireThat(allLogical.every(r=>!Object.hasOwn(read(`stage13e/raw/${r.kind}/${r.logicalId}/request.json`),'headers')),'REQUEST_HEADERS_STORED');
  return {recognizableSecretPatternMatches:0,storedAuthenticationHeaders:0,credentialEnvironmentRead:false};
 });
 check('20_FIXED_METRICS_ERROR_AUDIT_AND_VERDICT',()=>{
  const recomputed=analyze(rows,execution,preservation);
  requireThat(eq(recomputed,summary)&&eq(run.metrics,summary),'SUMMARY_RECOMPUTE_MISMATCH');
  requireThat(eq(read('stage13e/artifacts/error-audit.json').categories,summary.errorAudit),'ERROR_AUDIT_MISMATCH');
  let verdict=!preservation.passed?'BLOCKED_PRIOR_INTEGRITY':execution.status!=='COMPLETED'?execution.status:actualRows.length!==42||failures?'BLOCKED_TRANSPORT_INCOMPLETE':summary.comparator.advantageCandidate?'PROCEED_HUMAN_APPROVED_AI_ASSISTANT':'NO_AI_ADVANTAGE';
  requireThat(run.finalVerdict===verdict&&summary.finalVerdict===verdict,'FINAL_VERDICT_MISMATCH');
  requireThat(summary.performanceConclusionAllowed===(actualRows.length===42&&failures===0&&preservation.passed&&execution.status==='COMPLETED'),'INVALID_PERFORMANCE_CONCLUSION');
  for(const p of ['README.md','RESULTS.md','DECISION.md'])requireThat(text('stage13e/'+p).includes(verdict),'DOCUMENT_VERDICT_MISMATCH');
 });
 check('21_REQUIRED_ARTIFACTS_AND_POST_EXECUTION_VERIFIER',()=>{
  const required=['README.md','AUTHORIZATION.md','PREFLIGHT.md','PAID_TIER_EVIDENCE.md','COST_PROTOCOL.md','DUAL_SCHEMA_PROTOCOL.md','TRANSPORT_RETRY_PROTOCOL.md','WIRE_SCHEMA.json','MODEL_LOCK.json','SCHEMA_LOCK.json','TRANSPORT_LOCK.json','COST_LOCK.json','EXECUTION_PLAN.json','RUN_RECORD.json','RESULTS.md','ERROR_AUDIT.md','DECISION.md','checksums-before-smoke.sha256','checksums-before-run.sha256','tools/verify.mjs'];
  requireThat(required.every(p=>fs.statSync(resolve(stage,p)).isFile()),'MISSING_REQUIRED_FILE');
  requireThat(['artifacts','raw/smoke','raw/semantic','tools'].every(p=>fs.statSync(resolve(stage,p)).isDirectory()),'MISSING_REQUIRED_DIRECTORY');
  requireThat(fs.statSync(fileURLToPath(import.meta.url)).birthtimeMs>=stamp(execution.at),'VERIFIER_WRITTEN_BEFORE_EXECUTION_END');
 });
 if(withChecksums)check('22_FINAL_CHECKSUMS_COMPLETE_SELF_EXCLUDED',()=>{
  const entries=manifestCheck('stage13e/checksums.sha256'),expected=listFiles(stage).filter(p=>p!=='stage13e/checksums.sha256').sort();
  requireThat(eq(entries.map(e=>e.path).sort(),expected)&&new Set(entries.map(e=>e.path)).size===entries.length,'FINAL_MANIFEST_COVERAGE');
  requireThat(expected.includes('stage13e/artifacts/final-verification.json'),'AUDIT_REPORT_NOT_CHECKSUMMED');
  const saved=read('stage13e/artifacts/final-verification.json');
  requireThat(saved.failed===0&&saved.finalVerdict===summary.finalVerdict&&eq(saved.completion,{expected:{B:21,C:21},observed:completedByArm,complete42:summary.complete42}),'SAVED_AUDIT_FAILED_OR_MISMATCH');
  return {entries:entries.length,selfExcluded:true};
 });
 const failed=checks.filter(c=>!c.passed).length;
 return {kind:'READ_ONLY_POST_EXECUTION_INTEGRITY_AUDIT',recordedAt:new Date().toISOString(),finalVerdict:failed?'BLOCKED_FINAL_INTEGRITY':summary.finalVerdict,executionVerdict:summary.finalVerdict,passed:checks.length-failed,failed,total:checks.length,checksums:withChecksums,completion:{expected:{B:21,C:21},observed:completedByArm,complete42:summary.complete42},finalTransportFailures:failures,performanceConclusionAllowed:failed?false:summary.performanceConclusionAllowed,priorFilesByteIdentical:preservation.passed,checks};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const report=verify({withChecksums:process.argv.includes('--with-checksums')});console.log(JSON.stringify(report,null,2));process.exitCode=report.failed?1:0;}
 catch{console.log(JSON.stringify({finalVerdict:'BLOCKED_FINAL_INTEGRITY',error:'AUDIT_COULD_NOT_COMPLETE_DETAILS_SUPPRESSED'}));process.exitCode=1;}
}
