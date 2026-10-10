// Derive final reporting artifacts from immutable requests/responses and frozen criteria.
import {loadRecords,analyze} from './report.mjs';
import {read,save,priorIntegrity,fileSha,need} from './common.mjs';

const rows=loadRecords(),smoke=read('stage13d/raw/smoke/001.record.json');
const smokeStatus=read('stage13d/artifacts/SMOKE_STATUS.json'),runStatus=read('stage13d/artifacts/SEMANTIC_STATUS.json');
const preservation=priorIntegrity();
const summary=analyze(rows,{bindingIntact:preservation.passed,runStatus:runStatus.status});
const verdict=summary.finalVerdict;
const allowed=['PROCEED_HUMAN_APPROVED_AI_ASSISTANT','NO_AI_ADVANTAGE','AWAITING_GEMINI_API_KEY','BLOCKED_AMBIGUOUS_GEMINI_CREDENTIAL','BLOCKED_PRIOR_INTEGRITY','BLOCKED_WIRE_SCHEMA_NARROWING','BLOCKED_SMOKE','BLOCKED_MODEL_MISMATCH','BLOCKED_FREE_QUOTA_INCOMPLETE','BLOCKED_INCOMPLETE_RUN','BLOCKED'];
need(allowed.includes(verdict),'INVALID_VERDICT');
const complete=summary.completeRun,authorization=read('stage13d/artifacts/authorization.json').authorization;
const rateText=r=>r.denominator?`${r.numerator}/${r.denominator} (${(100*r.rate).toFixed(1)}%)`:'NOT_RUN';
const actualModels=[...new Set([smoke,...rows].map(r=>r.actualModel).filter(Boolean))];
const quota=read('stage13d/artifacts/quota-evidence.json');
save('artifacts/summary.json',summary);
save('artifacts/error-audit.json',{status:complete?'COMPLETED':'PARTIAL_TRANSPORT_FAILURES_NO_SEMANTIC_CONCLUSION',
  categories:summary.errorAudit,unattemptedCalls:42-rows.length,modelValueClaimsEvaluable:rows.filter(r=>r.parseStatus==='PARSED').length,
  emptyCategoriesAreNotEvidenceOfSafety:true,criteriaChanged:false});
save('RUN_RECORD.json',{
  recordedAt:new Date().toISOString(),status:complete?'COMPLETED':'BLOCKED',finalVerdict:verdict,reason:runStatus.reason,
  authorization,keyPresent:true,googleKeyPresent:false,requestedModel:'gemini-3.8-flash',actualUsedModel:actualModels.length===1?actualModels[0]:null,
  actualModelConfirmedBy:'Neutral full-schema smoke HTTP 200; semantic errors did not return model metadata.',
  actualModelEndpointRequests:1+rows.length,actualMetadataRequests:0,actualSmokeCalls:1,actualSemanticCalls:rows.length,
  plannedSemanticCalls:42,unstartedPlannedCalls:42-rows.length,actualDevCalls:rows.filter(r=>r.split==='dev').length,actualEvalCalls:rows.filter(r=>r.split==='eval').length,
  requests:rows.map(r=>({sequence:r.sequence,sourceId:r.sourceId,split:r.split,repeat:r.repeat,repeatId:r.repeatId,arm:r.arm,startedAt:r.startedAt,endedAt:r.endedAt,httpStatus:r.httpStatus,
    requestSha256:r.requestSha256,recordPath:`stage13d/raw/semantic/${String(r.sequence).padStart(3,'0')}.record.json`,rawResponsePath:r.rawResponsePath,rawResponseSha256:r.rawResponseSha256,
    actualModel:r.actualModel,parseStatus:r.parseStatus,wireSchemaStatus:r.wireSchemaStatus,authoritativeSchemaStatus:r.authoritativeSchemaStatus,errorType:r.errorType,includedInDenominator:true})),
  rawResponses:[smoke,...rows].map(r=>r.rawResponsePath).filter(Boolean),smoke:{passed:smokeStatus.passed,recordPath:'stage13d/raw/smoke/001.record.json',httpStatus:smoke.httpStatus,actualModel:smoke.actualModel,wireSchemaStatus:smoke.wireSchemaStatus,authoritativeSchemaStatus:smoke.authoritativeSchemaStatus},
  actualRetries:0,actualJsonRepairs:0,manualCorrections:0,modelResponseReplayCount:0,codexResponsesUsedAsEvaluationData:0,
  actualModelDownloadGB:0,billingChanges:0,maximumAuthorizedCostUSD:0,expectedFreeTierCostUSD:0,actualBilledCostUSD:null,
  billingEvidence:'Official free model route; account billing tier and invoice not programmatically verified. User explicitly allowed UNKNOWN tier; no billing changes made.',
  paidUsageSignalDetected:[smoke,...rows].some(r=>r.paidUsageSignal),paidTierStatus:'UNKNOWN',quota,
  usage:{smoke:smoke.usage,semantic:rows.map(r=>({sequence:r.sequence,usage:r.usage})),missingUsageNotAssumedZero:true},
  metrics:{status:complete?'COMPLETED':'PARTIAL_OPERATIONAL_COUNTS_ONLY',B:summary.B,C:summary.C,performanceConclusionAllowed:complete&&summary.apiErrorCalls.length===0,
    pairedCases:summary.pairedCases,repeatConsistency:summary.repeatConsistency},
  frozenComparator:{result:summary.comparator,eligibleForPerformanceVerdict:complete&&summary.apiErrorCalls.length===0},
  priorFilesPreserved:preservation.passed,firstAPIRequestAt:smoke.startedAt,firstSemanticRequestAt:rows[0]?.startedAt??null,
  immutableTransportLockSha256:fileSha('stage13d/TRANSPORT_LOCK.json'),immutableModelLockSha256:fileSha('stage13d/MODEL_LOCK.json'),
  finalAttemptPolicy:'No additional Stage 13 evaluation; on technical block recommend Stage 14 manual-template deterministic-compiler prototype.'
});

const table=[
 ['의미 API 시도',String(summary.B.attempts),String(summary.C.attempts)],
 ['JSON parse',rateText(summary.B.jsonParse),rateText(summary.C.jsonParse)],
 ['Wire Schema',rateText(summary.B.wireSchema),rateText(summary.C.wireSchema)],
 ['원본 Schema',rateText(summary.B.authoritativeSchema),rateText(summary.C.authoritativeSchema)],
 ['HTTP/API 오류',String(summary.B.httpApiErrors),String(summary.C.httpApiErrors)],
 ['라벨 정확성',complete?rateText(summary.B.labelAccuracy):'판단 불가',complete?rateText(summary.C.labelAccuracy):'판단 불가'],
 ['필드 정확성',complete?rateText(summary.B.fieldAccuracy):'판단 불가',complete?rateText(summary.C.fieldAccuracy):'판단 불가'],
 ['citation/source-span 정확성',complete?rateText(summary.B.citationLinkPrecision):'판단 불가',complete?rateText(summary.C.citationLinkPrecision):'판단 불가'],
 ['근거 없는 값·false runtimeExecutable=true','의미 출력 없음 / 판단 불가','의미 출력 없음 / 판단 불가'],
 ['적절한 유보·정상 과도 유보','판단 불가','판단 불가'],
 ['B/C paired-case 차이·반복 일관성','완주 전 판단 불가','완주 전 판단 불가']
];
save('RESULTS.md',`# Stage 13D 결과\n\n최종 판정: ${verdict}.\n\n중립 full-schema smoke 1회는 HTTP 200으로 통과했다. 실제 반환 모델은 ${smoke.actualModel}이고 Wire/원본 Schema 모두 1/1이다. 의미 호출은 ${rows.length}/42회(dev ${rows.filter(r=>r.split==='dev').length}/6, eval ${rows.filter(r=>r.split==='eval').length}/36)에서 종료했다. HTTP 500 두 건 뒤 세 번째 시도에서 HTTP 429가 발생했다. 재시도는 0회이며 남은 39개는 미시도로 보존했다.\n\n| 지표 | B | C |\n| --- | --- | --- |\n${table.map(r=>'| '+r.join(' | ')+' |').join('\n')}\n\n의미 Wire/원본 유효율은 각각 0/3으로, API 실패를 분모에서 제외하지 않은 운영 지표다. 이는 모델이 반환한 의미 JSON의 품질이 0%라는 결론이 아니다. 의미 JSON 응답은 0건이고 B/C 우열, 개선·퇴행, 인용·유보 품질을 판단할 수 없다. scorer에는 실제 세 실패를 원래 순서로 기록했으며, 전체 기준을 계산한 기계 결과는 완주 조건 미충족으로 성능 판정에 사용할 수 없다.\n\n[공식 가격표](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash)에 무료 제공되는 모델만 요청했고 Billing 변경·모델 다운로드는 0회다. 429로 할당량 고갈을 관찰했지만 RPM/TPM/RPD 수치와 계정 결제 등급, 실제 청구액은 UNKNOWN이다. 승인 비용 상한과 기대 무료 비용은 USD 0이며, 청구 확인값으로 단정하지 않는다.\n\nStage10 소형 모델 표본과 합산하지 않았다. 시장 수요·전체 약관 해석·법적 환급·블록체인 필요성·모든 운영 중단 해결을 검증하지 않았다.\n`);
const categoryCounts=Object.entries(summary.errorAudit).map(([name,items])=>`- ${name}: ${items.length}건`).join('\n');
save('ERROR_AUDIT.md',`# 오류 감사\n\n${categoryCounts}\n\nB_ONLY/C_ONLY/BOTH 분류는 저장된 scorer 결과의 기계적 분류이며, 이번 BOTH_INCORRECT 1쌍은 V301의 B/C 모두 HTTP 500으로 실패한 쌍이다. V302는 C만 HTTP 429를 받았고 B는 미시도다. 미실행 쌍은 INCOMPLETE_PAIR로 남긴다. 실제 의미 출력이 없으므로 근거 없는 값·잘못된 인용·불필요한 유보 범주가 비어 있다는 사실은 안전성 또는 정확성 증거가 아니다.\n\n전체 9개 감사 범주와 모든 미완성 쌍은 artifacts/error-audit.json에 저장했다. Wire 통과/원본 실패의 실제 의미 응답은 없었다. 반복 비교 가능한 평가 원문도 없다. 대표 개선·퇴행 사례는 판단 불가다. 기존 합성 fixture의 세 반례는 사전 검증용이며 모델 오류 사례에 넣지 않았다. 정답·점수·기준·응답은 변경하지 않았다.\n`);
save('DECISION.md',`# 최종 판정\n\n${verdict}\n\n전체 Wire Schema smoke는 통과했지만 의미 실행이 3/42에서 HTTP 429로 중단됐다. 앞선 두 시도도 HTTP 500이었다. 동결한 완주 기준이 충족되지 않아 NO_AI_ADVANTAGE라는 성능 결론을 내리지 않는다.\n\n사용자가 승인한 마지막 기술 시도 원칙에 따라 AI를 핵심 차별점에서 제외하고 선택적인 사람 검토용 보조로 내린다. 수동 템플릿과 결정론적 컴파일러를 기본 경로로 유지한다. AI는 지급, runtimeExecutable, vault 생성, 서명, 증빙 진위, 법적 권리를 결정하지 않는다. 공모전에서 이번 실험에 따른 AI 우위를 주장하지 않는다.\n\n14단계에서 해야 할 단 하나의 권장 작업: 수동 PolicyProposal 템플릿을 결정론적 컴파일러에 연결한 블록체인 환급 금고 시제품을 제작한다.\n\n13E 또는 다른 추가 AI 평가 단계를 만들거나 제안하지 않는다.\n`);
save('README.md',`# Stage 13D — ${verdict}\n\n이중 Schema 사전 검증과 중립 full-schema smoke는 통과했다. 의미 호출은 HTTP 500 두 건 및 429 한 건으로 3/42에서 종료했다. B/C 성능 결론은 없다.\n\n- 키 존재: GEMINI_API_KEY=true, GOOGLE_API_KEY=false. 실제 값·인증 헤더 미기록.\n- 요청 및 smoke 반환 모델: gemini-3.8-flash. 의미 오류 응답에는 모델 확인 정보 없음.\n- smoke 1회, 의미 3회, 재시도/repair/수동 교정 0회.\n- Wire/원본 Schema: smoke 모두 1/1, 의미 모두 0/3(전부 HTTP 실패).\n- 기존 ${preservation.checked}개 파일 보존 결과: artifacts/final-verification.json.\n- 계정 등급·활성 할당량 수치·청구액 UNKNOWN. Billing 변경 0회.\n\n[실행 기록](RUN_RECORD.json), [결과](RESULTS.md), [오류 감사](ERROR_AUDIT.md), [판정과 14단계 권고](DECISION.md)를 참조한다. 실제 원문은 raw/smoke 및 raw/semantic에 있다. 합성 fixture는 실제 모델 데이터에 포함하지 않았다.\n\n규약과 실행 코드는 첫 요청 전 checksums-before-smoke.sha256, 모델 잠금과 smoke 증거는 첫 의미 호출 전 checksums-before-run.sha256으로 고정했다. 최종 checksums.sha256은 자기 자신을 제외한 모든 산출물을 포함한다. 기록 생성 도구는 재실행 시 기존 산출물 덮어쓰기를 거부한다.\n\n읽기 전용 검증:\n\n\`\`\`sh\nnode stage13d/tools/verify.mjs --with-checksums\nshasum -a 256 -c stage13d/checksums.sha256\n\`\`\`\n\nStage13C verifier를 다시 실행하지 않는다. 원격 runner를 다시 호출하지 않는다. 추가 AI 평가 대신 14단계 수동 템플릿·결정론적 컴파일러 시제품을 권고한다.\n`);
console.log(JSON.stringify({finalVerdict:verdict,smokeCalls:1,semanticCalls:rows.length,priorFilesPreserved:preservation.passed,performanceConclusion:false}));
