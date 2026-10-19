import test from 'node:test';
import assert from 'node:assert/strict';
import {createApprovedReviewEvaluator} from './approved-evaluator.mjs';
const fixtures=Array.from({length:8},(_,i)=>({caseId:'T'+i,synthetic:true,task:'TEXT_REVIEW',text:'SYNTHETIC DEMO Course ALPHA',
  requestedFieldIds:['course-label'],imageBase64:null,maxInputTokens:2000}));
const output=id=>({caseId:id,fields:[{fieldId:'course-label',value:'ALPHA',location:'line 1'}],questions:[],flags:[],authenticity:'UNVERIFIED',completeness:'UNVERIFIED',author:'UNVERIFIED',paymentAllowed:false});
function transport(){let calls=0;return {execution:'MOCK',get calls(){return calls;},async request(model,method,body){
  calls++;assert.equal(model,'gemini-3.5-flash-lite');
  if(method==='countTokens')return {totalTokens:100};
  const data=JSON.parse(body.contents[0].parts[0].text);
  return {candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(output(data.caseId))}]}}],usageMetadata:{promptTokenCount:100,candidatesTokenCount:50,totalTokenCount:150}};
}};}
test('new evaluator rejects absent approval/tampered fixture before transport',async()=>{
  const t=transport(),e=createApprovedReviewEvaluator({fixtures,transport:t,checkpoint:async()=>{}});
  await assert.rejects(()=>e.evaluate(fixtures[0]),/REVIEW_EVAL_APPROVAL/);assert.equal(t.calls,0);
  const approved=createApprovedReviewEvaluator({fixtures,approved:true,transport:t,checkpoint:async()=>{}});
  await assert.rejects(()=>approved.evaluate({...fixtures[0],text:'tampered'}),/REVIEW_EVAL_FIXTURE_PIN/);assert.equal(t.calls,0);
});
test('8 count + 8 generation cap, durable checkpoints precede dispatch, and no replay',async()=>{
  const t=transport();let saves=0;
  const e=createApprovedReviewEvaluator({fixtures,approved:true,transport:{execution:'MOCK',request(...args){assert.ok(saves>t.calls);return t.request(...args);}},checkpoint:async()=>{saves++;}});
  for(const f of fixtures)assert.equal((await e.evaluate(f)).result.fields[0].value,'ALPHA');
  assert.equal(t.calls,16);assert.equal(e.usage().countCalls,8);assert.equal(e.usage().generationCalls,8);
  assert.ok(BigInt(e.usage().reservedNanoUsd)<50000000n);
  await assert.rejects(()=>e.evaluate(fixtures[0]),/REVIEW_EVAL_LIMIT/);assert.equal(t.calls,16);
});
test('failed checkpoint blocks dispatch and consumes case; provider error never retried',async()=>{
  const t=transport(),e=createApprovedReviewEvaluator({fixtures,approved:true,transport:t,checkpoint:async()=>{throw Error('disk-failed');}});
  await assert.rejects(()=>e.evaluate(fixtures[0]),/disk-failed/);assert.equal(t.calls,0);
  await assert.rejects(()=>e.evaluate(fixtures[0]),/REVIEW_EVAL_FIXTURE_PIN/);
  let calls=0;
  const broken=createApprovedReviewEvaluator({fixtures,approved:true,transport:{execution:'MOCK',request(){calls++;throw Error('network');}},checkpoint:async()=>{}});
  await assert.rejects(()=>broken.evaluate(fixtures[0]),/network/);
  await assert.rejects(()=>broken.evaluate(fixtures[0]),/REVIEW_EVAL_FIXTURE_PIN/);assert.equal(calls,1);
});
test('oversized input cannot dispatch generation and malformed authority output is rejected',async()=>{
  let calls=0;const e=createApprovedReviewEvaluator({fixtures,approved:true,transport:{execution:'MOCK',async request(){calls++;return {totalTokens:2001};}},checkpoint:async()=>{}});
  await assert.rejects(()=>e.evaluate(fixtures[0]),/REVIEW_EVAL_INPUT_LIMIT/);assert.equal(calls,1);assert.equal(e.usage().generationCalls,0);
  const t=transport(),original=t.request;t.request=async(...args)=>{
    const r=await original(...args);if(args[1]==='generateContent')r.candidates[0].content.parts[0].text=JSON.stringify({...output('T0'),paymentAllowed:true});return r;};
  const b=createApprovedReviewEvaluator({fixtures,approved:true,transport:t,checkpoint:async()=>{}});
  await assert.rejects(()=>b.evaluate(fixtures[0]),/REVIEW_EVAL_OUTPUT_SCHEMA/);assert.equal(b.usage().generationCalls,1);
});
