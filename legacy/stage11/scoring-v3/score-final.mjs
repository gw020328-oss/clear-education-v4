// Exact structured-reference comparator. It does not infer semantics from raw prose.
import {canonical,keys,need} from '../policy-binding/core.mjs';
export const fields=['amount','asset','activities','completionPeriod','claimPeriod','evidenceType','approvalRole','exceptions','recipient'];
export const labels=['POLICY_SUPPORTED','POLICY_UNSUPPORTED','CLARIFICATION_REQUIRED'];
const equal=(a,b)=>canonical(a)===canonical(b);
const empty=new Set(['','NOT_STATED','not stated','not specified','none specified','(no value)','미기재','미명시']);
export function normalizeMissing(value){
 if(value===null||typeof value==='string'&&empty.has(value.trim())||Array.isArray(value)&&value.length===0)return null;
 return value;
}
function amount(v){
 keys(v,['fixedAmount','rate','multiplier','cap','deductionOrder']);
 for(const name of ['fixedAmount','cap'])if(v[name]!==null){keys(v[name],['units','unit']);need(typeof v[name].units==='string'&&/^(0|[1-9][0-9]*)$/.test(v[name].units)&&typeof v[name].unit==='string'&&v[name].unit.length>0,'AMOUNT_TYPE');}
 for(const name of ['rate','multiplier'])if(v[name]!==null){keys(v[name],['numerator','denominator']);need(Number.isSafeInteger(v[name].numerator)&&v[name].numerator>=0&&Number.isSafeInteger(v[name].denominator)&&v[name].denominator>0,'OPERATOR_TYPE');}
 need(Array.isArray(v.deductionOrder)&&v.deductionOrder.every(x=>typeof x==='string'),'DEDUCTION_ORDER');
}
export function formatCheck(output){
 try{
  canonical(output);keys(output,['type','sourceId','sourceDocHash','classification','fields','unsupportedConditions','clarificationQuestions']);
  need(output.type==='PolicyProposal'&&typeof output.sourceId==='string'&&/^0x[0-9a-f]{64}$/.test(output.sourceDocHash)&&labels.includes(output.classification),'OUTPUT_TYPE');keys(output.fields,fields);
  for(const [name,v]of Object.entries(output.fields)){
   keys(v,['status','value','spanIds']);need(['EXTRACTED','NOT_STATED','AMBIGUOUS'].includes(v.status)&&Array.isArray(v.spanIds)&&new Set(v.spanIds).size===v.spanIds.length&&v.spanIds.every(s=>typeof s==='string'),'FIELD_TYPE');
   if(v.status==='NOT_STATED'){need(normalizeMissing(v.value)===null&&v.spanIds.length===0,'MISSING_ASSERTION');continue;}
   need(v.value!==null,'EMPTY_ASSERTION');if(name==='amount')amount(v.value);
   else if(['activities','exceptions'].includes(name))need(Array.isArray(v.value)&&v.value.every(x=>typeof x==='string'),'ARRAY_TYPE');
   else if(['completionPeriod','claimPeriod'].includes(name)){keys(v.value,['kind','start','end','unit','timeZone']);need(['ABSOLUTE','RELATIVE'].includes(v.value.kind),'PERIOD_TYPE');for(const k of ['start','end'])need(v.value[k]===null||typeof v.value[k]==='string'||Number.isSafeInteger(v.value[k]),'PERIOD_VALUE');for(const k of ['unit','timeZone'])need(v.value[k]===null||typeof v.value[k]==='string','PERIOD_VALUE');}
   else need(typeof v.value==='string','STRING_TYPE');
  }
  need(Array.isArray(output.unsupportedConditions)&&output.unsupportedConditions.every(x=>typeof x==='string'),'UNSUPPORTED_TYPE');
  need(Array.isArray(output.clarificationQuestions),'QUESTION_TYPE');for(const q of output.clarificationQuestions){keys(q,['field','text']);need(fields.includes(q.field)&&typeof q.text==='string'&&q.text.trim().length>0,'QUESTION_TYPE');}
  return {valid:true,errors:[]};
 }catch(e){return {valid:false,errors:[e.code??e.message]};}
}
export function score(output,reference,source){
 const format=formatCheck(output),base={formatValid:format.valid,errors:format.errors,normalPass:false,safeAbstention:false,completeCorrect:false,unknownSpanIds:[],fieldResults:{}};
 if(!format.valid)return {...base,outcome:'FORMAT_FAILURE',majorError:true};
 const ids=new Set(source.spans.map(s=>s.id));
 const fake=[...new Set(Object.values(output.fields).flatMap(v=>v.spanIds).filter(id=>!ids.has(id)))];
 if(fake.length)return {...base,outcome:'INVALID_EVIDENCE',errors:['UNKNOWN_SPAN'],unknownSpanIds:fake,majorError:true};
 if(output.sourceId!==source.sourceId||output.sourceDocHash!==source.sourceDocHash)return {...base,outcome:'SOURCE_MISMATCH',majorError:true};
 let correct=0,asserted=0,unsupportedAssertions=0,missing=0,links=0,correctLinks=0;
 for(const name of fields){
  const v=output.fields[name],r=reference.fields[name];
  const valueCorrect=v.status===r.status&&(r.status==='NOT_STATED'?normalizeMissing(v.value)===null:equal(v.value,r.value));
  const grounded=r.status==='NOT_STATED'?v.spanIds.length===0:v.spanIds.length>0&&v.spanIds.every(s=>r.spanIds.includes(s))&&r.spanIds.every(s=>v.spanIds.includes(s));
  const ok=valueCorrect&&grounded;correct+=Number(ok);
  const assertion=v.status!=='NOT_STATED';asserted+=Number(assertion);unsupportedAssertions+=Number(assertion&&!ok);
  missing+=Number(r.status!=='NOT_STATED'&&!ok);links+=v.spanIds.length;correctLinks+=valueCorrect?v.spanIds.filter(s=>r.spanIds.includes(s)).length:0;
  base.fieldResults[name]={correct:ok,valueCorrect,grounded};
 }
 const questionsCorrect=reference.questionFields.every(f=>output.clarificationQuestions.some(q=>q.field===f&&q.text.trim().length>0));
 const reasonsCorrect=equal([...output.unsupportedConditions].sort(),[...reference.unsupportedConditions].sort());
 const complete=correct===fields.length&&output.classification===reference.classification&&questionsCorrect&&reasonsCorrect;
 return {...base,outcome:complete?'COMPLETE_CORRECT':'SEMANTIC_ERROR',completeCorrect:complete,normalPass:complete&&reference.classification==='POLICY_SUPPORTED',safeAbstention:complete&&reference.classification!=='POLICY_SUPPORTED',majorError:!complete,correctFields:correct,missing,asserted,unsupportedAssertions,links,correctLinks};
}
export function compareArms(B,C){
 const stats=rows=>({errors:rows.filter(r=>r.majorError).length,normals:rows.filter(r=>r.normalPass).length,complete:rows.filter(r=>r.completeCorrect).length});
 const b=stats(B),c=stats(C);
 return {B:b,C:c,advantageCandidate:c.errors<b.errors&&c.normals>=b.normals&&c.normals>0,allBlockedSuccess:false};
}
