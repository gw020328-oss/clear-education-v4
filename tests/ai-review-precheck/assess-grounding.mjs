import {validateGroundedReview} from '../../src/document-precheck/review/grounding.mjs';
// v2 rubric is declared before any v2 paid call. Values alone cannot pass it.
export function assessGroundedReview(raw,gold,fieldIds,sources){
  if(gold.length!==fieldIds.length||new Set(gold.map(g=>g.fieldId)).size!==fieldIds.length||gold.some(g=>!fieldIds.includes(g.fieldId)))
    return {status:'NEEDS_IMPROVEMENT',errors:['GOLD_FIELD_SET'],result:null};
  let result;
  try{result=validateGroundedReview(raw,fieldIds,sources);}
  catch{return {status:'NEEDS_IMPROVEMENT',errors:['INVALID_STATE_OR_EVIDENCE'],result:null};}
  const errors=[];
  for(const expected of gold){
    const f=result.fields.find(f=>f.fieldId===expected.fieldId);
    if(f?.candidateValue!==expected.value)errors.push('VALUE:'+expected.fieldId);
    if(f?.state!==expected.state)errors.push('STATE:'+expected.fieldId);
    if(expected.state!=='OBSERVED'&&(!f?.supplement||f.evidence!==null))errors.push('SUPPLEMENT:'+expected.fieldId);
    if(expected.state==='OBSERVED'&&f?.supplement!==null)errors.push('FALSE_HOLD:'+expected.fieldId);
    if(expected.sourceFixture&&!(f?.candidateValue!==null&&f?.candidateValue!==expected.sourceFixture.value))errors.push('SOURCE_CONFLICT:'+expected.fieldId);
  }
  return {status:errors.length?'NEEDS_IMPROVEMENT':'PASS',errors,result};
}
