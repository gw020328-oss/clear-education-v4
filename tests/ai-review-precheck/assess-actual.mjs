// Offline quality rubric. Does not change the locked execution record or rerun a model.
export function assessActualReview(attempt, gold, {normal=false,vision=false}={}) {
  const raw=attempt.rawObservation,reviewed=attempt.result;
  const field=raw.fields.find(f=>f.fieldId==='course-label'),accepted=reviewed.fields.find(f=>f.fieldId==='course-label');
  const literalMatches=field?.value===gold.fields['course-label'] && accepted?.value===gold.fields['course-label'];
  const reasonCodes=raw.flags.filter(f=>f.fieldIds===null||f.fieldIds.includes('course-label')).map(f=>f.code);
  const missingReasonCodes=gold.requiredFlags.filter(code=>!reasonCodes.includes(code));
  const falseHold=normal&&(raw.questions.length>0||raw.flags.length>0||accepted?.value===null);
  // Synthetic renderer puts the header in row 1, course label in row 2.
  // Text source body is line 2 in the prepared request. No regex guess at meaning.
  let locationStatus='NOT_APPLICABLE';
  if(field?.location!==null){
    const expected=vision?/^(?:image )?row 2$/i:/^line 2$/i;
    locationStatus=expected.test(field?.location??'')?'MATCHED_SYNTHETIC_LAYOUT':'LOCATION_NOT_GROUNDED';
  }else if(field?.value!==null)locationStatus='LOCATION_NOT_GROUNDED';
  const sourceConflictMatches=!gold.sourceFixture || (attempt.sourceComparison?.raw==='CONFLICT'&&attempt.sourceComparison?.reviewed==='CONFLICT');
  return {literalMatches,missingReasonCodes,falseHold,locationStatus,sourceConflictMatches,
    status:literalMatches&&!missingReasonCodes.length&&!falseHold&&locationStatus!=='LOCATION_NOT_GROUNDED'&&sourceConflictMatches?'PASS':'NEEDS_IMPROVEMENT'};
}
