// Synthetic adapter tests only. Never calls a network or accesses credentials.
import assert from 'node:assert/strict';
import {tests} from '../../stage12/protocol-v3/tools/fixtures.mjs';
import {schema, validate, score} from '../../stage12/protocol-v3/tools/score.mjs';
import {requestFor} from '../../stage12/protocol-v3/tools/run.mjs';
import {dualSchemaValidation} from './schema-validation.mjs';
import {parseResponse,validateOutput,detectFailure,semanticRequest,smokeRequest,settings} from './gemini-runner.mjs';
import {read,encode} from './common.mjs';

export function testAdapter() {
  const {wire,report}=dualSchemaValidation(),results=[];
  const test=(name,fn)=>{try{fn();results.push({name,passed:true});}catch{results.push({name,passed:false});}};
  const baseline=tests[0];
  const envelope={id:'SYNTHETIC_OFFLINE_ONLY',model:settings.model,status:'completed',steps:[{type:'thought',summary:[{type:'text',text:'This must not be extracted.'}]},{type:'model_output',content:[{type:'text',text:JSON.stringify(baseline.output)}]}]};
  test('35-fixtures-superset-and-frozen-score',()=>assert(report.passed));
  test('three-wire-passes-remain-authoritative-score-failures',()=>assert(report.threeCounterexamplesStillFailed));
  test('current-rest-steps-extraction',()=>assert.deepEqual(parseResponse(JSON.stringify(envelope)).parsed,baseline.output));
  test('non-json-envelope-fails-without-error-body',()=>assert.equal(parseResponse('<html>error</html>').error,'API_ENVELOPE_JSON_INVALID'));
  test('no-markdown-json-repair',()=>{const e=structuredClone(envelope);e.steps[1].content[0].text='```json\n'+JSON.stringify(baseline.output)+'\n```';assert.equal(parseResponse(JSON.stringify(e)).parseStatus,'NOT_PARSED');});
  test('no-thought-summary-as-output',()=>assert.equal(parseResponse(JSON.stringify({...envelope,steps:[envelope.steps[0]]})).error,'NO_MODEL_OUTPUT_TEXT'));
  test('null-json-is-parsed-but-authoritatively-invalid',()=>{const e=structuredClone(envelope);e.steps[1].content[0].text='null';const p=parseResponse(JSON.stringify(e));assert.equal(p.parseStatus,'PARSED');assert.equal(validateOutput(p.parsed,wire,p.parseStatus).authoritativeSchemaStatus,'INVALID');});
  test('quota-stops-without-retry',()=>assert(detectFailure(429,{error:{status:'RESOURCE_EXHAUSTED'}},null).fatalForRemainingRun));
  test('billing-required-stops',()=>assert(detectFailure(403,{error:{message:'Billing must be enabled'}},null).paidUsageSignal));
  test('different-model-stops',()=>assert.equal(detectFailure(200,{...envelope,model:'UNAPPROVED'},null).error,'MODEL_MISMATCH_OR_UNVERIFIED'));
  test('missing-model-does-not-pretend-confirmed',()=>assert.equal(detectFailure(200,{status:'completed'},null).error,'MODEL_MISMATCH_OR_UNVERIFIED'));
  test('incomplete-result-is-not-correct-output',()=>assert.equal(detectFailure(200,{...envelope,status:'incomplete'},null).error,'INTERACTION_NOT_COMPLETED'));
  test('smoke-carries-entire-wire-schema',()=>assert.deepEqual(smokeRequest(wire).response_format.schema,wire));
  test('all-42-frozen-prompts-and-public-inputs-identical',()=>{for(const row of read('stage12/protocol-v3/CALL_PLAN.json')){const old=requestFor(row,settings.model),body=semanticRequest(row,wire);assert.equal(body.system_instruction,old.messages[0].content);assert.equal(body.input,old.messages[1].content);assert.equal(body.model,settings.model);assert(!('seed' in body.generation_config));assert(!('previous_interaction_id' in body));assert(!('tools' in body));assert(!('headers' in body));}});
  test('failure-response-retains-frozen-failure-score',()=>{const judged=score(null,baseline.reference,baseline.source);assert.equal(judged.completeCorrect,false);assert.equal(judged.majorError,true);});
  test('authoritative-schema-still-original',()=>assert.equal(validate(schema,tests.find(t=>t.id==='zero-denominator').output).length>0,true));
  return {kind:'SYNTHETIC_OFFLINE_ADAPTER_TESTS_NOT_MODEL_EVALUATION',passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,total:results.length,results};
}
if(process.argv[1]?.endsWith('/test-adapter.mjs')){const report=testAdapter();console.log(encode(report));process.exitCode=report.failed?1:0;}
