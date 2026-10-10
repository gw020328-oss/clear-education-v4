// Reporting only. The frozen Stage12 scorer and comparator remain authoritative.
import {compareArms, canonical, fields} from '../../stage12/protocol-v3/tools/score.mjs';
import {read,text,listFiles,stage} from './common.mjs';

const lines=path=>text(path).trim().split('\n').map(line=>JSON.parse(line));
const refs=lines('stage12/protocol-v3/REFERENCE_LABELS.jsonl');
const data=lines('stage12/protocol-v3/DATASET.jsonl');
const reference=id=>refs.find(r=>r.sourceId===id);
export const loadRecords=()=>listFiles(stage).filter(p=>/^stage13d\/raw\/semantic\/\d{3}\.record\.json$/.test(p)).map(read).sort((a,b)=>a.sequence-b.sequence);
const rate=(numerator,denominator)=>({numerator,denominator,rate:denominator?numerator/denominator:null});
function runtimeTrue(value) {
  if(!value||typeof value!=='object')return 0;
  return Object.entries(value).reduce((sum,[key,item])=>sum+Number(key==='runtimeExecutable'&&item===true)+runtimeTrue(item),0);
}
const caseRef=r=>({sequence:r.sequence,sourceId:r.sourceId,split:r.split,repeat:r.repeat,repeatId:r.repeatId,arm:r.arm,recordPath:`stage13d/raw/semantic/${String(r.sequence).padStart(3,'0')}.record.json`});

export function analyze(rows,{bindingIntact,runStatus}) {
  const cases=refs.map(ref=>({...ref,split:data.find(d=>d.sourceId===ref.sourceId).split}));
  const comparator=compareArms(rows,cases,bindingIntact);
  const perArm=arm=>{
    const all=rows.filter(r=>r.arm===arm),n=all.length;
    const valid=all.filter(r=>r.score.formatValid&&!r.errorType);
    const sourceCases=cases.filter(c=>c.split==='eval');
    const referenceSupported=all.filter(r=>reference(r.sourceId).classification==='POLICY_SUPPORTED');
    const needsAbstention=all.filter(r=>reference(r.sourceId).classification!=='POLICY_SUPPORTED');
    const unscored=all.filter(r=>r.score.unsupportedAssertions===undefined).length;
    const submittedLinks=all.reduce((sum,r)=>sum+(r.score.links??0),0);
    const correctLinks=all.reduce((sum,r)=>sum+(r.score.correctLinks??0),0);
    return {
      attempts:n,expectedAttempts:21,jsonParse:rate(all.filter(r=>r.parseStatus==='PARSED').length,n),
      wireSchema:rate(all.filter(r=>r.wireSchemaStatus==='VALID').length,n),
      authoritativeSchema:rate(all.filter(r=>r.authoritativeSchemaStatus==='VALID').length,n),
      labelAccuracy:rate(valid.filter(r=>r.parsed.classification===reference(r.sourceId).classification).length,n),
      fieldAccuracy:rate(all.reduce((sum,r)=>sum+(r.score.correctFields??0),0),n*fields.length),
      citationLinkPrecision:rate(correctLinks,submittedLinks),citationPrecisionUnscoredResponses:all.filter(r=>r.score.links===undefined).length,
      allFieldCitationsExact:rate(all.filter(r=>r.score.formatValid&&Object.keys(r.score.fieldResults).length===10&&Object.values(r.score.fieldResults).every(f=>f.grounded)).length,n),
      unsupportedAssertionsObserved:all.reduce((sum,r)=>sum+(r.score.unsupportedAssertions??0),0),unsupportedAssertionsUnscoredResponses:unscored,
      fakeSpanIds:all.reduce((sum,r)=>sum+r.score.unknownSpanIds.length,0),
      falseRuntimeExecutableTrue:all.reduce((sum,r)=>sum+runtimeTrue(r.parsed),0),authorityViolations:all.reduce((sum,r)=>sum+r.score.authorityViolations,0),
      appropriateAbstention:rate(needsAbstention.filter(r=>r.score.safeAbstention).length,needsAbstention.length),
      unnecessaryAbstentionOnSupported:rate(referenceSupported.filter(r=>r.score.formatValid&&r.parsed?.classification!=='POLICY_SUPPORTED').length,referenceSupported.length),
      completeCorrect:rate(all.filter(r=>r.score.completeCorrect).length,n),
      evalSourceErrorCases:comparator[arm].errorCases,evalNormalCompleteCases:comparator[arm].normalCases,
      evalSourceDenominator:sourceCases.length,evalCompleteByClass:comparator[arm].completeByClass,
      httpApiErrors:all.filter(r=>r.httpStatus===null||r.httpStatus<200||r.httpStatus>=300||r.errorType&&r.errorType!=='MODEL_OUTPUT_JSON_INVALID').length,
      jsonParseFailures:all.filter(r=>r.parseStatus!=='PARSED').length,wirePassedAuthoritativeFailed:all.filter(r=>r.wireSchemaStatus==='VALID'&&r.authoritativeSchemaStatus==='INVALID').length,
      schemaInvalidFailures:all.filter(r=>r.scoringStatus==='SCHEMA_INVALID').length,
      usageKnownResponses:all.filter(r=>r.usage!==null).length,
      usage:all.every(r=>r.usage!==null)&&n?{
        totalInputTokens:all.reduce((s,r)=>s+(r.usage.total_input_tokens??0),0),totalOutputTokens:all.reduce((s,r)=>s+(r.usage.total_output_tokens??0),0),
        totalThoughtTokens:all.reduce((s,r)=>s+(r.usage.total_thought_tokens??0),0)}:null
    };
  };
  const paired=[];
  for(const call of read('stage12/protocol-v3/CALL_PLAN.json').filter(c=>c.arm==='B')){
    const pair=rows.filter(r=>r.sourceId===call.sourceId&&r.split===call.split&&r.repeat===call.repeat);
    const B=pair.find(r=>r.arm==='B'),C=pair.find(r=>r.arm==='C');
    if(!B||!C){paired.push({sourceId:call.sourceId,split:call.split,repeat:call.repeat,status:'INCOMPLETE_PAIR'});continue;}
    paired.push({sourceId:call.sourceId,split:call.split,repeat:call.repeat,status:B.score.completeCorrect?(C.score.completeCorrect?'BOTH_CORRECT':'B_ONLY_CORRECT'):(C.score.completeCorrect?'C_ONLY_CORRECT':'BOTH_INCORRECT'),B:caseRef(B),C:caseRef(C),
      correctFieldsB:B.score.correctFields??0,correctFieldsC:C.score.correctFields??0,fieldDifferenceCMinusB:(C.score.correctFields??0)-(B.score.correctFields??0)});
  }
  const repetitions=[];
  for(const source of cases.filter(c=>c.split==='eval'))for(const arm of ['B','C']){
    const group=rows.filter(r=>r.sourceId===source.sourceId&&r.arm===arm).sort((a,b)=>a.repeat-b.repeat);
    repetitions.push({sourceId:source.sourceId,arm,complete:group.length===2,
      identicalParsedOutput:group.length===2&&group.every(r=>r.parseStatus==='PARSED')?canonical(group[0].parsed)===canonical(group[1].parsed):null,
      identicalOutcome:group.length===2?group[0].score.outcome===group[1].score.outcome:null,
      records:group.map(caseRef)});
  }
  const audits={
    B_ONLY_CORRECT:paired.filter(p=>p.status==='B_ONLY_CORRECT'),C_ONLY_CORRECT:paired.filter(p=>p.status==='C_ONLY_CORRECT'),
    BOTH_CORRECT:paired.filter(p=>p.status==='BOTH_CORRECT'),BOTH_INCORRECT:paired.filter(p=>p.status==='BOTH_INCORRECT'),
    INCOMPLETE_PAIR:paired.filter(p=>p.status==='INCOMPLETE_PAIR'),
    WIRE_PASS_AUTHORITATIVE_FAIL:rows.filter(r=>r.wireSchemaStatus==='VALID'&&r.authoritativeSchemaStatus==='INVALID').map(r=>({...caseRef(r),errors:r.authoritativeErrors})),
    C_UNNECESSARY_ABSTENTION:rows.filter(r=>r.arm==='C'&&reference(r.sourceId).classification==='POLICY_SUPPORTED'&&r.score.formatValid&&r.parsed?.classification!=='POLICY_SUPPORTED').map(caseRef),
    UNSUPPORTED_VALUE:rows.filter(r=>(r.score.unsupportedAssertions??0)>0).map(r=>({...caseRef(r),fields:Object.entries(r.score.fieldResults).filter(([k,v])=>r.parsed.fields[k].status!=='NOT_STATED'&&!v.correct).map(([k])=>k)})),
    WRONG_CITATION:rows.filter(r=>r.score.unknownSpanIds.length||Object.values(r.score.fieldResults).some(f=>!f.grounded)).map(r=>({...caseRef(r),unknownSpanIds:r.score.unknownSpanIds,fields:Object.entries(r.score.fieldResults).filter(([,f])=>!f.grounded).map(([k])=>k)})),
    REPEAT_DISAGREEMENT:repetitions.filter(r=>r.complete&&(r.identicalParsedOutput===false||r.identicalOutcome===false))
  };
  const apiErrors=rows.filter(r=>r.httpStatus===null||r.httpStatus<200||r.httpStatus>=300||r.errorType&&r.errorType!=='MODEL_OUTPUT_JSON_INVALID');
  let verdict;
  if(!bindingIntact)verdict='BLOCKED_PRIOR_INTEGRITY';
  else if(runStatus!=='COMPLETED')verdict=runStatus;
  else if(rows.length!==42)verdict='BLOCKED_INCOMPLETE_RUN';
  else if(apiErrors.length)verdict='BLOCKED';
  else verdict=comparator.advantageCandidate?'PROCEED_HUMAN_APPROVED_AI_ASSISTANT':'NO_AI_ADVANTAGE';
  return {finalVerdict:verdict,completeRun:rows.length===42,status:rows.length===42?'COMPLETE':'PARTIAL_NO_PERFORMANCE_CONCLUSION',
    actualSemanticCalls:rows.length,B:perArm('B'),C:perArm('C'),comparator,pairedCases:paired,repeatConsistency:repetitions,errorAudit:audits,
    apiErrorCalls:apiErrors.map(caseRef),failureDenominatorPolicy:'All attempts retained; unattempted calls are not fabricated',
    independentEvalSources:9,repeatRowsAreNotIndependentSources:true,stage10ResultsPooled:false};
}
