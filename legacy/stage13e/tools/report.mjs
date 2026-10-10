import {compareArms,canonical,fields} from '../../stage12/protocol-v3/tools/score.mjs';
import {read,jsonl,listFiles,stage} from './io.mjs';
const dataset=jsonl('stage12/protocol-v3/DATASET.jsonl'),refs=jsonl('stage12/protocol-v3/REFERENCE_LABELS.jsonl');
export const logicalRecords=()=>listFiles(stage).filter(p=>/^stage13e\/raw\/semantic\/\d{3}\/logical\.json$/.test(p)).map(read).sort((a,b)=>a.sequence-b.sequence);
export const transmissionRecords=()=>listFiles(stage).filter(p=>/^stage13e\/raw\/(smoke|semantic)\/[^/]+\/attempt-\d\.json$/.test(p)).map(read).sort((a,b)=>Date.parse(a.startedAt)-Date.parse(b.startedAt));
const ref=r=>refs.find(x=>x.sourceId===r.sourceId);
const rate=(n,d)=>({numerator:n,denominator:d,rate:d?n/d:null});
const citation=r=>({sequence:r.sequence,sourceId:r.sourceId,arm:r.arm,split:r.split,repeat:r.repeat,repeatId:r.repeatId,path:`stage13e/raw/semantic/${String(r.sequence).padStart(3,'0')}/logical.json`});
function runtimeTrue(x){if(!x||typeof x!=='object')return 0;return Object.entries(x).reduce((s,[k,v])=>s+Number(k==='runtimeExecutable'&&v===true)+runtimeTrue(v),0);}
export function analyze(allRows,execution,preservation){
 const rows=allRows.filter(r=>r.transmissionCount>0),cases=refs.map(r=>({...r,split:dataset.find(d=>d.sourceId===r.sourceId).split}));
 const comparator=compareArms(rows,cases,preservation.passed),transports=transmissionRecords();
 const metric=arm=>{const selected=rows.filter(r=>r.arm===arm),n=selected.length,valid=selected.filter(r=>!r.transportFailure&&r.authoritativeSchemaStatus==='VALID');
  const supported=selected.filter(r=>ref(r).classification==='POLICY_SUPPORTED'),abstention=selected.filter(r=>ref(r).classification!=='POLICY_SUPPORTED');
  const tx=transports.filter(t=>t.kind==='semantic'&&selected.some(r=>r.logicalId===t.logicalId));
  return {logicalCalls:n,expectedLogicalCalls:21,transmissions:tx.length,retries:tx.filter(t=>t.attempt>1).length,
   finalTransportFailures:selected.filter(r=>r.transportFailure).length,
   jsonParse:rate(selected.filter(r=>r.parseStatus==='PARSED').length,n),wireSchema:rate(selected.filter(r=>r.wireSchemaStatus==='VALID').length,n),authoritativeSchema:rate(selected.filter(r=>r.authoritativeSchemaStatus==='VALID').length,n),
   labelAccuracy:rate(valid.filter(r=>r.parsed.classification===ref(r).classification).length,n),fieldAccuracy:rate(selected.reduce((s,r)=>s+(r.score.correctFields??0),0),n*10),completeCorrect:rate(selected.filter(r=>r.score.completeCorrect).length,n),
   citationPrecision:rate(selected.reduce((s,r)=>s+(r.score.correctLinks??0),0),selected.reduce((s,r)=>s+(r.score.links??0),0)),
   allFieldCitationsExact:rate(selected.filter(r=>Object.keys(r.score.fieldResults).length===10&&Object.values(r.score.fieldResults).every(x=>x.grounded)).length,n),
   unscoredCitationResponses:selected.filter(r=>r.score.links===undefined).length,unsupportedAssertionsObserved:selected.reduce((s,r)=>s+(r.score.unsupportedAssertions??0),0),unscoredUnsupportedResponses:selected.filter(r=>r.score.unsupportedAssertions===undefined).length,
   importantErrorEvalCases:comparator[arm].errorCases,normalCompleteEvalCases:comparator[arm].normalCases,completeByClass:comparator[arm].completeByClass,
   appropriateAbstention:rate(abstention.filter(r=>r.score.safeAbstention).length,abstention.length),unnecessaryAbstention:rate(supported.filter(r=>!r.transportFailure&&r.authoritativeSchemaStatus==='VALID'&&r.parsed.classification!=='POLICY_SUPPORTED').length,supported.length),
   fakeSpans:comparator[arm].fakeSpans,authorityViolations:comparator[arm].authorityViolations,falseRuntimeExecutableTrue:selected.reduce((s,r)=>s+runtimeTrue(r.parsed),0),
   wirePassAuthoritativeFail:selected.filter(r=>r.wireSchemaStatus==='VALID'&&r.authoritativeSchemaStatus==='INVALID').length,jsonParseFailures:selected.filter(r=>r.parseStatus!=='PARSED').length,schemaInvalidFailures:selected.filter(r=>r.scoringStatus==='SCHEMA_INVALID').length,
   httpErrors:tx.filter(t=>t.httpStatus!==200).length,estimatedCostUSD:tx.reduce((s,t)=>s+Math.max(t.estimatedCostUSD,t.usageEstimate?.estimatedCostUSD??0),0),
   latencyMs:{total:selected.reduce((s,r)=>s+(Date.parse(r.endedAt)-Date.parse(r.startedAt)),0),perLogicalCall:selected.map(r=>({sequence:r.sequence,latencyMs:Date.parse(r.endedAt)-Date.parse(r.startedAt)}))},
   usageByTransmission:tx.map(t=>({logicalId:t.logicalId,attempt:t.attempt,usage:t.usage,usageEstimate:t.usageEstimate}))};};
 const paired=[];for(const expected of read('stage12/protocol-v3/CALL_PLAN.json').filter(r=>r.arm==='B')){
  const p=rows.filter(r=>r.sourceId===expected.sourceId&&r.repeat===expected.repeat),B=p.find(r=>r.arm==='B'),C=p.find(r=>r.arm==='C');
  paired.push({sourceId:expected.sourceId,split:expected.split,repeat:expected.repeat,status:!B||!C?'INCOMPLETE_PAIR':B.score.completeCorrect?(C.score.completeCorrect?'BOTH_CORRECT':'B_ONLY_CORRECT'):(C.score.completeCorrect?'C_ONLY_CORRECT':'BOTH_INCORRECT'),
   B:B?citation(B):null,C:C?citation(C):null,fieldDifferenceCMinusB:B&&C?(C.score.correctFields??0)-(B.score.correctFields??0):null,transportFailurePresent:Boolean(B?.transportFailure||C?.transportFailure)});
 }
 const repetitions=[];for(const source of cases.filter(c=>c.split==='eval'))for(const arm of ['B','C']){
  const r=rows.filter(r=>r.sourceId===source.sourceId&&r.arm===arm).sort((a,b)=>a.repeat-b.repeat);
  repetitions.push({sourceId:source.sourceId,arm,complete:r.length===2,identicalParsedOutput:r.length===2&&r.every(v=>v.parseStatus==='PARSED')?canonical(r[0].parsed)===canonical(r[1].parsed):null,
   identicalOutcome:r.length===2?r[0].scoringStatus===r[1].scoringStatus:null,records:r.map(citation)});
 }
 const errors={};for(const category of ['B_ONLY_CORRECT','C_ONLY_CORRECT','BOTH_CORRECT','BOTH_INCORRECT','INCOMPLETE_PAIR'])errors[category]=paired.filter(p=>p.status===category);
 errors.WIRE_PASS_AUTHORITATIVE_FAIL=rows.filter(r=>r.wireSchemaStatus==='VALID'&&r.authoritativeSchemaStatus==='INVALID').map(r=>({...citation(r),errors:r.authoritativeErrors}));
 errors.C_UNNECESSARY_ABSTENTION=rows.filter(r=>r.arm==='C'&&!r.transportFailure&&r.authoritativeSchemaStatus==='VALID'&&ref(r).classification==='POLICY_SUPPORTED'&&r.parsed.classification!=='POLICY_SUPPORTED').map(citation);
 errors.UNSUPPORTED_VALUE=rows.filter(r=>(r.score.unsupportedAssertions??0)>0).map(r=>({...citation(r),fields:Object.entries(r.score.fieldResults).filter(([f,v])=>r.parsed.fields[f].status!=='NOT_STATED'&&!v.correct).map(([f])=>f)}));
 errors.WRONG_CITATION=rows.filter(r=>r.score.unknownSpanIds.length||Object.values(r.score.fieldResults).some(v=>!v.grounded)).map(r=>({...citation(r),unknownSpanIds:r.score.unknownSpanIds,fields:Object.entries(r.score.fieldResults).filter(([,v])=>!v.grounded).map(([f])=>f)}));
 errors.REPEAT_DISAGREEMENT=repetitions.filter(r=>r.complete&&(r.identicalParsedOutput===false||r.identicalOutcome===false));
 const failures=rows.filter(r=>r.transportFailure).length;let verdict;
 if(!preservation.passed)verdict='BLOCKED_PRIOR_INTEGRITY';else if(execution.status!=='COMPLETED')verdict=execution.status;
 else if(rows.length!==42||failures)verdict='BLOCKED_TRANSPORT_INCOMPLETE';else verdict=comparator.advantageCandidate?'PROCEED_HUMAN_APPROVED_AI_ASSISTANT':'NO_AI_ADVANTAGE';
 return {finalVerdict:verdict,complete42:rows.length===42,performanceConclusionAllowed:rows.length===42&&failures===0&&preservation.passed&&execution.status==='COMPLETED',
  B:metric('B'),C:metric('C'),finalTransportFailures:failures,comparator,pairedCases:paired,repeatConsistency:repetitions,errorAudit:errors,
  semanticLogicalCalls:rows.length,semanticTransmissions:transports.filter(t=>t.kind==='semantic').length,smokeTransmissions:transports.filter(t=>t.kind==='smoke').length,transportRetries:transports.filter(t=>t.attempt>1).length,
  estimatedCostUSD:transports.reduce((s,t)=>s+Math.max(t.estimatedCostUSD,t.usageEstimate?.estimatedCostUSD??0),0),conservativeEstimatedCostUSD:transports.reduce((s,t)=>s+t.estimatedCostUSD,0),
  usageEstimatedCostUSD:transports.reduce((s,t)=>s+(t.usageEstimate?.estimatedCostUSD??0),0),usageKnownTransmissions:transports.filter(t=>t.usageEstimate!==null).length,
  actualBilledCostUSD:null,priorStageResultsPooled:false};
}
