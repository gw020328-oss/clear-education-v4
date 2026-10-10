// Frozen Gemini adapter. Exactly one smoke; one serial, session-resumable run.
// Each sequence is marked before sending; no retries, repair, redirects or replay.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {schema, validate, score} from '../../stage12/protocol-v3/tools/score.mjs';
import {requestFor, dataset} from '../../stage12/protocol-v3/tools/run.mjs';
import {read, text, sha, fileSha, need, save, exists, priorIntegrity, checkManifest, encode} from './common.mjs';

export const settings = Object.freeze({provider:'GOOGLE', endpoint:'https://generativelanguage.googleapis.com/v1beta/interactions',
  model:'gemini-3.8-flash', thinkingLevel:'medium', maxOutputTokens:4096, minimumIntervalMs:15000, timeoutMs:600000,
  parallelCalls:1, retryCount:0, jsonRepair:false, manualCorrection:false, store:false, stream:false,
  temperature:'provider_default', top_p:'provider_default', top_k:'provider_default', seed:'not_sent', tools:'omitted'});

export function credentialGate() {
  const gemini = Boolean(process.env.GEMINI_API_KEY), google = Boolean(process.env.GOOGLE_API_KEY);
  return google ? 'BLOCKED_AMBIGUOUS_GEMINI_CREDENTIAL' : !gemini ? 'AWAITING_GEMINI_API_KEY' : 'PASS';
}
export function requestBody(system, input, wire) {
  const body = {model:settings.model, system_instruction:system, input,
    generation_config:{thinking_level:settings.thinkingLevel,max_output_tokens:settings.maxOutputTokens},
    response_format:{type:'text',mime_type:'application/json',schema:wire}, stream:false, store:false, background:false};
  need(Buffer.byteLength(JSON.stringify(body)) <= 128000, 'REQUEST_LIMIT');
  return body;
}
export function semanticRequest(row, wire) {
  // Reuse the frozen input assembly. Only the API transport changes.
  const original = requestFor(row, settings.model);
  return requestBody(original.messages[0].content, original.messages[1].content, wire);
}
export function smokeRequest(wire) {
  return requestBody('Neutral formatting smoke only. No refund policy is supplied. Return a JSON object with classification CLARIFICATION_REQUIRED, all ten fields NOT_STATED with value null and spanIds [], and ambiguities [], clarificationQuestions [], unsupportedConditions []. Do not add any other fields.',
    'This is a public synthetic empty-input formatting test. Produce the empty policy object described in the system instruction.', wire);
}
export function parseResponse(raw) {
  let envelope;
  try {envelope = JSON.parse(raw);} catch {return {envelopeParsed:false,parseStatus:'NOT_PARSED',error:'API_ENVELOPE_JSON_INVALID',parsed:null};}
  // Current REST representation: steps[].model_output.content[].text.
  // output_text is SDK convenience only and is deliberately not assumed here.
  const steps = envelope?.steps;
  const blocks = Array.isArray(steps) ? steps.filter(s => s.type === 'model_output').flatMap(s => Array.isArray(s.content) ? s.content.filter(c => c.type === 'text' && typeof c.text === 'string').map(c => c.text) : []) : [];
  const output = blocks.length ? blocks.join('') : null;
  let parsed = null, error = null;
  if (output === null) error = 'NO_MODEL_OUTPUT_TEXT';
  else try {parsed = JSON.parse(output);} catch {error = 'MODEL_OUTPUT_JSON_INVALID';}
  return {envelopeParsed:true, envelope, outputText:output, parseStatus:error ? 'NOT_PARSED' : 'PARSED', parsed, error};
}
export function validateOutput(parsed, wire, parseStatus) {
  if (parseStatus !== 'PARSED') return {wireSchemaStatus:'NOT_VALIDATED',authoritativeSchemaStatus:'NOT_VALIDATED',wireErrors:[],authoritativeErrors:[]};
  const wireErrors = validate(wire,parsed), authoritativeErrors = validate(schema,parsed);
  return {wireSchemaStatus:wireErrors.length?'INVALID':'VALID', authoritativeSchemaStatus:authoritativeErrors.length?'INVALID':'VALID', wireErrors, authoritativeErrors};
}
function privateContent(bytes) {
  const raw = bytes.toString('utf8');
  // Exact comparison stays in memory; no value, length, prefix or hash is emitted.
  const key = process.env.GEMINI_API_KEY;
  return Boolean(key && raw.includes(key)) || /\bAIza[0-9A-Za-z_-]{20,}\b/.test(raw) || /["'](?:x-goog-api-key|authorization)["']\s*:\s*["'][^"']+["']/i.test(raw);
}
export function detectFailure(httpStatus, envelope, parseError) {
  const errors = JSON.stringify({error:envelope?.error,errors:envelope?.errors}).toLowerCase();
  const quota = httpStatus === 429 || /resource_exhausted|quota.exhaust|daily.*limit.*exceed/.test(errors);
  const billing = /billing.*(enabl|required|activat)|paid tier.*required|payment.*required/.test(errors) || envelope?.billing?.charged === true || Number(envelope?.usage?.cost_usd) > 0;
  const model = typeof envelope?.model === 'string' ? envelope.model : null;
  let error = null;
  if (quota) error = 'FREE_QUOTA_EXHAUSTED';
  else if (billing) error = 'PAID_USAGE_REQUIRED_OR_DETECTED';
  else if (httpStatus === 401 || httpStatus === 403) error = 'AUTHENTICATION_OR_ACCESS_FAILED';
  else if (httpStatus === 404) error = 'MODEL_OR_ENDPOINT_UNAVAILABLE';
  else if (httpStatus === null || httpStatus < 200 || httpStatus >= 300) error = 'HTTP_OR_NETWORK_FAILURE';
  else if (model !== settings.model) error = 'MODEL_MISMATCH_OR_UNVERIFIED';
  else if (Array.isArray(envelope?.errors) && envelope.errors.length) error = 'INTERACTION_API_ERROR';
  else if (envelope?.status !== 'completed') error = 'INTERACTION_NOT_COMPLETED';
  else if (parseError) error = parseError;
  return {error, quotaStatus:quota?'EXHAUSTED':'UNKNOWN', paidUsageSignal:billing, actualModel:model,
    fatalForRemainingRun:quota||billing||['AUTHENTICATION_OR_ACCESS_FAILED','MODEL_OR_ENDPOINT_UNAVAILABLE','MODEL_MISMATCH_OR_UNVERIFIED','API_ENVELOPE_JSON_INVALID','NO_MODEL_OUTPUT_TEXT'].includes(error)};
}

export async function performCall({kind,row,body,wire}) {
  const name = kind === 'smoke' ? '001' : String(row.sequence).padStart(3,'0');
  const prefix = 'raw/' + kind + '/' + name;
  const start = new Date().toISOString();
  const base = {kind:kind==='smoke'?'ACTUAL_NEUTRAL_FULL_SCHEMA_SMOKE':'ACTUAL_SEMANTIC_MODEL_CALL',
    ...(row??{}), repeatId:row?.seed??null, startedAt:start, requestSha256:sha(JSON.stringify(body)),
    wireSchemaSha256:fileSha('stage13d/WIRE_SCHEMA.json'), authoritativeSchemaSha256:fileSha('stage12/protocol-v3/schemas/output.schema.json'),
    transportLockSha256:fileSha('stage13d/TRANSPORT_LOCK.json'), settings, requestBody:body,
    headersOmitted:true, repair:false,retry:false,manualCorrection:false,includedInDenominator:kind==='semantic'};
  save(prefix+'.attempt.json',{...base,status:'ATTEMPT_STARTED_NO_RETRY'});
  let bytes = null, httpStatus = null, networkError = null;
  const t = performance.now();
  try {
    const response = await fetch(settings.endpoint, {method:'POST',redirect:'error',
      headers:{'Content-Type':'application/json','x-goog-api-key':process.env.GEMINI_API_KEY},
      body:JSON.stringify(body),signal:AbortSignal.timeout(settings.timeoutMs)});
    httpStatus = response.status;
    bytes = Buffer.from(await response.arrayBuffer());
  } catch {networkError = 'NETWORK_OR_TIMEOUT_ERROR';}
  const endedAt = new Date().toISOString();
  let rawPath = null, rawSha256 = null, withheld = false;
  if (bytes !== null) {
    withheld = privateContent(bytes);
    if (!withheld) {rawPath = 'stage13d/'+prefix+'.response.txt';save(prefix+'.response.txt',bytes);rawSha256=sha(bytes);}
  }
  const decoded = bytes !== null && !withheld ? parseResponse(bytes.toString('utf8')) : {envelopeParsed:false,parsed:null,parseStatus:'NOT_PARSED',error:withheld?'SECRET_IN_RESPONSE_WITHHELD':'NO_RESPONSE_BODY'};
  const envelope = decoded.envelope;
  const failure = detectFailure(httpStatus,envelope,decoded.error);
  if (networkError || withheld) failure.error = networkError || 'SECRET_IN_RESPONSE_WITHHELD';
  if (withheld || decoded.error === 'API_ENVELOPE_JSON_INVALID') failure.fatalForRemainingRun = true;
  const validation = validateOutput(decoded.parsed,wire,decoded.parseStatus);
  let judged = null, scoringStatus = kind==='smoke'?'NOT_SCORED_SMOKE':null;
  if (kind === 'semantic') {
    const source = dataset.find(d => d.sourceId === row.sourceId);
    const reference = text('stage12/protocol-v3/REFERENCE_LABELS.jsonl').trim().split('\n').map(line => JSON.parse(line)).find(r=>r.sourceId===row.sourceId);
    const eligible = !failure.error && validation.authoritativeSchemaStatus === 'VALID' && validation.wireSchemaStatus === 'VALID';
    // Frozen score is called unchanged. Ineligible transports receive the frozen null-output failure.
    judged = score(eligible ? decoded.parsed : validation.authoritativeSchemaStatus === 'INVALID' ? decoded.parsed : null,reference,source);
    scoringStatus = failure.error ? 'TRANSPORT_FAILURE' : decoded.parseStatus!=='PARSED'?'JSON_PARSE_FAILURE':validation.authoritativeSchemaStatus==='INVALID'?'SCHEMA_INVALID':validation.wireSchemaStatus==='INVALID'?'WIRE_SCHEMA_INVALID':judged.outcome;
  }
  const result = {...base,endedAt,latencyMs:performance.now()-t,httpStatus,interactionId:typeof envelope?.id==='string'?envelope.id:null,
    actualModel:failure.actualModel, actualModelVersion:envelope?.model_version??null, interactionStatus:envelope?.status??null,
    responseGenerationConfig:envelope?.generation_config??null, rawResponsePath:rawPath,rawResponseSha256:rawSha256,rawResponseWithheld:withheld,
    apiEnvelopeParsed:decoded.envelopeParsed,parseStatus:decoded.parseStatus,parseError:decoded.error,parsed:decoded.parsed,
    ...validation,scoringStatus,score:judged,usage:envelope?.usage??null,errorType:failure.error,
    providerErrorCode:typeof envelope?.error?.status==='string'?envelope.error.status:null,
    quotaStatus:failure.quotaStatus,paidUsageSignal:failure.paidUsageSignal,fatalForRemainingRun:failure.fatalForRemainingRun,
    paidTierStatus:'UNKNOWN',billingChanges:0};
  save(prefix+'.record.json',result);
  return result;
}

function assertPreconditions() {
  need(credentialGate()==='PASS',credentialGate());
  need(read('stage13d/artifacts/precheck/summary.json').passed,'BLOCKED_PRIOR_INTEGRITY');
  need(priorIntegrity().passed,'BLOCKED_PRIOR_INTEGRITY');
  checkManifest('stage13d/checksums-before-smoke.sha256');
  need(read('stage13d/SCHEMA_LOCK.json').supersetValidated,'BLOCKED_WIRE_SCHEMA_NARROWING');
}
export async function runSmoke() {
  assertPreconditions();
  need(!exists('raw/smoke/001.attempt.json')&&!exists('artifacts/SMOKE_STATUS.json'),'SMOKE_ALREADY_ATTEMPTED_NO_RETRY');
  const wire = read('stage13d/WIRE_SCHEMA.json');
  const result = await performCall({kind:'smoke',body:smokeRequest(wire),wire});
  const passed = !result.errorType && result.parseStatus==='PARSED' && result.wireSchemaStatus==='VALID' && result.authoritativeSchemaStatus==='VALID' && result.rawResponsePath !== null && !result.paidUsageSignal;
  save('artifacts/SMOKE_STATUS.json',{recordedAt:new Date().toISOString(),status:passed?'PASS':'BLOCKED_SMOKE',passed,
    smokeCalls:1,semanticCalls:0,httpStatus:result.httpStatus,actualModel:result.actualModel,reason:result.errorType??(passed?null:'SMOKE_SCHEMA_INVALID'),recordPath:'stage13d/raw/smoke/001.record.json'});
  console.log(JSON.stringify({status:passed?'PASS':'BLOCKED_SMOKE',smokeCalls:1,semanticCalls:0,httpStatus:result.httpStatus,actualModel:result.actualModel,reason:result.errorType??(passed?null:'SMOKE_SCHEMA_INVALID')}));
  return passed;
}
export async function runSemantic() {
  assertPreconditions();
  need(read('stage13d/artifacts/SMOKE_STATUS.json').passed,'BLOCKED_SMOKE');
  checkManifest('stage13d/checksums-before-run.sha256');
  need(read('stage13d/MODEL_LOCK.json').locked,'MODEL_NOT_LOCKED');
  need(!exists('artifacts/SEMANTIC_STARTED.json'),'RUN_ALREADY_ATTEMPTED_NO_RESTART');
  const calls = read('stage13d/EXECUTION_PLAN.json').calls, wire=read('stage13d/WIRE_SCHEMA.json');
  save('artifacts/SEMANTIC_STARTED.json',{at:new Date().toISOString(),planned:42,restartAllowed:false});
  let completed=0,status='COMPLETED',reason=null;
  const heartbeat=setInterval(()=>console.log(completed+'/42'),30000);
  try {
    const smoke=read('stage13d/raw/smoke/001.record.json');let lastEnd=Date.parse(smoke.endedAt);
    for(const row of calls) {
      const wait=settings.minimumIntervalMs-(Date.now()-lastEnd);if(wait>0)await delay(wait);
      const r=await performCall({kind:'semantic',row,body:semanticRequest(row,wire),wire});lastEnd=Date.parse(r.endedAt);completed++;
      console.log(completed+'/42');
      if(r.fatalForRemainingRun) {status=r.quotaStatus==='EXHAUSTED'?'BLOCKED_FREE_QUOTA_INCOMPLETE':r.errorType==='MODEL_MISMATCH_OR_UNVERIFIED'?'BLOCKED_MODEL_MISMATCH':'BLOCKED';reason=r.errorType;break;}
    }
    if(completed!==42&&status==='COMPLETED')status='BLOCKED_INCOMPLETE_RUN';
  } finally {clearInterval(heartbeat);}
  save('artifacts/SEMANTIC_STATUS.json',{at:new Date().toISOString(),status,reason,actualSemanticCalls:completed,plannedSemanticCalls:42});
  return status;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]) {
  try {
    if(process.argv[2]==='--smoke')process.exitCode=await runSmoke()?0:2;
    else if(process.argv[2]==='--run')process.exitCode=await runSemantic()==='COMPLETED'?0:2;
    else throw new Error('USE_SMOKE_OR_RUN');
  } catch(error) {
    const safeCodes=new Set(['AWAITING_GEMINI_API_KEY','BLOCKED_AMBIGUOUS_GEMINI_CREDENTIAL','BLOCKED_PRIOR_INTEGRITY','BLOCKED_WIRE_SCHEMA_NARROWING','SMOKE_ALREADY_ATTEMPTED_NO_RETRY','RUN_ALREADY_ATTEMPTED_NO_RESTART','LOCK_HASH_MISMATCH','BLOCKED_SMOKE','MODEL_NOT_LOCKED','USE_SMOKE_OR_RUN']);
    console.log(JSON.stringify({status:'BLOCKED',reason:safeCodes.has(error.message)?error.message:'INTERNAL_ERROR_BODY_SUPPRESSED'}));process.exitCode=2;
  }
}
