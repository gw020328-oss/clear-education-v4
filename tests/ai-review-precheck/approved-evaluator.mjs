import {createHash} from 'node:crypto';
import {developerTransport,EVALUATION_SCHEMA,maximumCostNanoUsd} from '../../src/ai-policy/gemini-evaluation.mjs';
import {validateShape} from '../../src/policy/mvp/contract.mjs';
import {reviewFields} from '../../src/ai-policy/field-review.mjs';
import {freeze,requireRule as check} from '../../src/policy/values.mjs';
import {buildReviewEvaluationRequest,REVIEW_EVALUATION_PROMPT_VERSION} from './request-builder.mjs';
export const sha=value=>createHash('sha256').update(value).digest('hex');
export const APPROVED_PINS=freeze({corpus:'72c15f9e18b0f21238c27648dcd428d8b4c98d722ddd6a22dd79d34998f531a1',
  fixtures:'1146c0427a6589d39a301529ece0a0730ee72fbfdfd57d7ee6c60e6a3477968f',
  requests:'354abe24645e265849e59d26ab56cd08d1497826b9a8e3f52c2bc682c5c62701',
  gold:'90af106344e8ffb0055af5c18719997f20ea148ddcc8e05a2d4353ee83cb81b2'});
const model='gemini-3.5-flash-lite',fingerprint=v=>sha(JSON.stringify(v));
export function createApprovedReviewEvaluator({fixtures,approved=false,transport=developerTransport(),checkpoint}) {
  check(fixtures.length===8 && typeof checkpoint==='function','REVIEW_EVAL_CONFIGURATION');
  const owned=structuredClone(fixtures),allowed=new Map(owned.map(f=>[f.caseId,fingerprint(f)]));
  check(allowed.size===8,'REVIEW_EVAL_CONFIGURATION');
  let countCalls=0,generationCalls=0,reserved=0n,busy=false;const used=new Set();
  const usage=()=>({execution:transport.execution,countCalls,generationCalls,reservedNanoUsd:String(reserved),
    actualModelCalls:transport.execution==='ACTUAL'?generationCalls:0});
  return {usage,async evaluate(input){
    check(approved===true,'REVIEW_EVAL_APPROVAL');
    check(!busy && countCalls<8 && generationCalls<8,'REVIEW_EVAL_LIMIT');
    const f=structuredClone(input);
    check(allowed.get(f.caseId)===fingerprint(f) && !used.has(f.caseId),'REVIEW_EVAL_FIXTURE_PIN');
    check(f.maxInputTokens===(f.imageBase64===null?2000:3000),'REVIEW_EVAL_TOKEN_CAP');
    const body=buildReviewEvaluationRequest(f),generationReserve=maximumCostNanoUsd(f.maxInputTokens,1024,model);
    // Conservatively reserve count input too; do not claim an invoice total.
    const countReserve=maximumCostNanoUsd(f.maxInputTokens,0,model);
    check(reserved+countReserve+generationReserve<=50000000n,'REVIEW_EVAL_BUDGET');
    busy=true;used.add(f.caseId);const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
    try{
      countCalls++;reserved+=countReserve;await checkpoint(usage());
      check(!controller.signal.aborted,'REVIEW_EVAL_TIMEOUT');
      const counted=await transport.request(model,'countTokens',{generateContentRequest:{model:'models/'+model,...body}},controller.signal);
      check(Number.isSafeInteger(counted.totalTokens)&&counted.totalTokens>0&&counted.totalTokens<=f.maxInputTokens,'REVIEW_EVAL_INPUT_LIMIT');
      check(!controller.signal.aborted,'REVIEW_EVAL_TIMEOUT');
      generationCalls++;reserved+=generationReserve;await checkpoint(usage());
      check(!controller.signal.aborted,'REVIEW_EVAL_TIMEOUT');
      const response=await transport.request(model,'generateContent',body,controller.signal);
      check(!controller.signal.aborted,'REVIEW_EVAL_TIMEOUT');
      const candidate=response.candidates?.[0],parts=candidate?.content?.parts;
      check(candidate?.finishReason==='STOP'&&!response.promptFeedback?.blockReason&&Array.isArray(parts)
        && parts.every(p=>typeof p.text==='string'&&!p.thought),'REVIEW_EVAL_INCOMPLETE');
      let raw;
      try{raw=JSON.parse(parts.map(p=>p.text).join(''));validateShape(raw,EVALUATION_SCHEMA);}
      catch{throw Error('REVIEW_EVAL_OUTPUT_SCHEMA');}
      check(raw.caseId===f.caseId,'REVIEW_EVAL_CASE_PIN');
      const fieldReview=reviewFields({fields:raw.fields,questions:raw.questions,flags:raw.flags},f.requestedFieldIds);
      const result={...raw,fields:fieldReview.fields.map(({fieldId,value,location})=>({fieldId,value,location}))};
      const u=response.usageMetadata??{},tokens=Object.fromEntries(['promptTokenCount','candidatesTokenCount','thoughtsTokenCount','totalTokenCount']
        .map(k=>[k,Number.isSafeInteger(u[k])&&u[k]>=0?u[k]:null]));
      return freeze({caseId:f.caseId,execution:transport.execution,model,promptVersion:REVIEW_EVALUATION_PROMPT_VERSION,
        resolvedModel:typeof response.modelVersion==='string'?response.modelVersion.slice(0,120):null,
        countedTokens:counted.totalTokens,tokens,rawObservation:raw,result,fieldReview,paymentAllowed:false});
    }finally{clearTimeout(timer);busy=false;}
  }};
}
