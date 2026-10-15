// Gold is independent of the model. Normal controls must not invent review
// signals; missing/conflict controls must remain null even with flags present.
export function assessRecovery(result, gold, { normal = false } = {}) {
  const errors=[],fields=new Map(result.fields.map(field=>[field.fieldId,field]));
  if(fields.size!==result.fields.length||fields.size!==Object.keys(gold.fields).length)errors.push('FIELD_SET');
  for(const [id,value] of Object.entries(gold.fields)){
    if(!fields.has(id)||fields.get(id).value!==value)errors.push('VALUE:'+id);
    if(value!==null&&!fields.get(id)?.location)errors.push('LOCATION:'+id);
  }
  if(gold.questionRequired&&!result.questions.length)errors.push('QUESTION_MISSING');
  if(normal&&result.questions.length)errors.push('UNEXPECTED_QUESTION');
  if(normal&&result.flags.length)errors.push('UNEXPECTED_FLAG');
  return {status:errors.length?'SEMANTIC_ERROR':'PASS',errors};
}
