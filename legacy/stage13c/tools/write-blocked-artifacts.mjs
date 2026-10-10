// One-time offline record creation. All local writes go through apply_patch.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { auditSchema, encode } from './schema-audit.mjs';
import { intendedSettings } from './gemini-runner.mjs';

const project = fileURLToPath(new URL('../../', import.meta.url));
process.chdir(project);
const read = p => JSON.parse(fs.readFileSync(p));
const sha = p => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const now = new Date().toISOString();
const preflight = read('stage13c/artifacts/precheck/summary.json');
const keys = read('stage13c/artifacts/key-presence.json');
const prior = read('stage13c/artifacts/prior-files.json');
const {candidate, report} = auditSchema();
if (!preflight.passed || !keys.GEMINI_API_KEY_present || keys.GOOGLE_API_KEY_present || report.status !== 'BLOCKED_SCHEMA_INCOMPATIBLE') {
  throw new Error('UNEXPECTED_GATE_STATE');
}
const verdict = report.status;
const authorization = {approved: true, provider: 'GOOGLE', route: 'GEMINI_API_FREE_TIER', model: 'gemini-3.8-flash',
  thinking_level: 'medium', api_key_environment_variable: 'GEMINI_API_KEY', allow_free_api: true, allow_paid_api: false,
  max_cost_usd: 0, allow_billing_changes: false, allow_model_download: false};
const sourcePaths = {
  schema: 'stage12/protocol-v3/schemas/output.schema.json',
  promptB: 'stage12/protocol-v3/prompts/B.txt', promptC: 'stage12/protocol-v3/prompts/C.txt',
  dataset: 'stage12/protocol-v3/DATASET.jsonl', referenceLabels: 'stage12/protocol-v3/REFERENCE_LABELS.jsonl',
  scorer: 'stage12/protocol-v3/tools/score.mjs', fixtures: 'stage12/protocol-v3/tools/fixtures.mjs',
  evaluationProtocol: 'stage12/protocol-v3/EVALUATION_PROTOCOL.md',
  stage12Manifest: 'stage12/protocol-v3/SHA256_MANIFEST.json', stage12FreezeReceipt: 'stage12/protocol-v3/FREEZE_RECEIPT.json',
  callPlan: 'stage12/protocol-v3/CALL_PLAN.json', stage13bChecksums: 'stage13b/checksums.sha256'
};
const sourceHashes = Object.fromEntries(Object.entries(sourcePaths).map(([name, path]) => [name, {path, sha256: sha(path)}]));
const calls = read(sourcePaths.callPlan);
if (calls.length !== 42 || calls.filter(c => c.split === 'dev').length !== 6 || calls.filter(c => c.split === 'eval').length !== 36) throw new Error('CALL_PLAN_MISMATCH');
const files = new Map();
const put = (path, body) => files.set(path, typeof body === 'string' ? body : encode(body));
const digest = value => createHash('sha256').update(value).digest('hex');

put('artifacts/authorization.json', {recordedAt: now, authorization});
put('artifacts/source-hashes.json', {recordedAt: now, files: sourceHashes});
put('artifacts/schema/gemini-candidate.schema.json', encode(candidate));
put('artifacts/schema/compatibility.json', report);
put('artifacts/official-documentation.json', {
  checkedAt: now, method: 'Unauthenticated public official documentation browsing; no Gemini API request',
  sources: [
    {url: 'https://ai.google.dev/gemini-api/docs/structured-output#json_schema_support', finding: 'Documented subset omits minLength, maxLength, pattern, uniqueItems; anyOf and recursive examples are documented.'},
    {url: 'https://ai.google.dev/api/interactions-api', finding: 'Verified input, response_format, generation_config, stream, store, background and endpoint fields. The reference lists seed, but the user requires it omitted.'},
    {url: 'https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash', finding: 'Stable model ID, 1048576 input tokens, 65536 output tokens, Structured Outputs and low/medium/high thinking documented; latest update September 2026.'},
    {url: 'https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash', finding: 'Standard free-tier input and output listed as free; this is not account-specific tier or quota verification.'}
  ],
  documentationOnlyModelMetadata: {requestedModel: authorization.model, documentedStatus: 'stable', documentedInputTokenLimit: 1048576,
    documentedOutputTokenLimit: 65536, structuredOutputsDocumented: true, thinkingLevelsDocumented: ['low','medium','high'],
    documentedLatestUpdate: 'September 2026', accountAvailability: 'NOT_CHECKED', actualModelVersion: null},
  metadataAPIRequests: 0, metadataAPISkippedReason: verdict,
  projectBillingTier: 'UNKNOWN', activeQuota: {RPM: 'UNKNOWN', TPM: 'UNKNOWN', RPD: 'UNKNOWN'}
});

put('AUTHORIZATION.md', `# Stage 13C 승인 범위\n\n${encode(authorization)}\n사용자 승인 원문을 위와 같이 전사했다. 공개 약관 B/C 벤치마크에 한정한다. 유료 호출·결제 등록·Billing 변경·모델 다운로드·자동 모델 대체는 허용되지 않는다.\n\n키는 존재 여부 boolean만 기록했다. 실제 값·길이·접두어·해시 및 인증 헤더 값은 산출물에 넣지 않는다. 키 파일 검색은 하지 않았다. 이번 경로는 Schema 검사에서 종료되어 인증 헤더를 구성하거나 전송하지 않았다.\n\n모든 신규 파일은 stage13c/ 아래에만 작성한다. 기존 데이터·source span·정답·프롬프트·분할·호출 순서·repeat ID·scorer·판정 규칙은 읽기 전용이다. Codex 합성 출력은 모델 평가 결과로 사용하지 않는다.\n`);
put('PREFLIGHT.md', `# Stage 13C 사전 검사\n\n키 상태: GEMINI_API_KEY=true, GOOGLE_API_KEY=false. 인증 성공 여부는 NOT_RUN이다.\n\nstage13c/ 생성 전, 파일 해시와 아래 명령의 출력·종료 코드를 메모리에 보관했다. 세 검사 종료 후에만 폴더를 만들고 저장했다. 생성 후 Stage 13B verifier는 재실행하지 않았다.\n\n- python3 stage13b/tools/verify.py --with-checksums: ${preflight.stage13bVerifier.passed}/${preflight.stage13bVerifier.total}, 실패 0.\n- shasum -a 256 -c stage13b/checksums.sha256: ${preflight.stage13bChecksums.matched}/${preflight.stage13bChecksums.matched}, 종료 코드 0.\n- node stage12/protocol-v3/tools/test-scorer.mjs: 42/42, 실패 0.\n- Stage 13B 의미 호출: 0회.\n- 사전 검사 전후 기존 파일 보존: PASS.\n\n기준 시각 ${prior.recordedAt}. 프로젝트의 기존 파일 ${preflight.priorFileCount}개와 심볼릭 링크 ${preflight.priorSymlinkCount}개를 기록했다. node_modules와 숨김 파일도 포함한다. 디렉터리 심볼릭 링크는 따라가지 않는다. 상세 원본 검사 출력은 artifacts/precheck/, 종료 대조는 artifacts/final-verification.json에 있다.\n`);
put('TRANSPORT_ADDENDUM.md', `# Stage 13C 전송 부록 — 실행 차단\n\n공식 [Interactions API 명세](https://ai.google.dev/api/interactions-api)를 확인했다. 의도한 요청은 POST https://generativelanguage.googleapis.com/v1beta/interactions 이며 model, input, response_format 및 generation_config를 사용한다. JSON 형식은 response_format.type=text, mime_type=application/json, schema이고, 사고 수준과 출력 한도는 generation_config.thinking_level=medium, max_output_tokens=4096이다.\n\nstream=false, store=false, background=false를 사용하고 tools와 previous_interaction_id를 생략한다. google_search/url_context/code_execution을 별도 가짜 필드로 보내지 않는다. temperature/top_p/top_k는 생략해 제공자 기본값을 사용한다. seed는 명세에 있지만 사용자 지시에 따라 보내지 않고 원본 반복 식별자로만 보존한다. 각 요청은 독립적이다.\n\nB/C 공통 조건은 직렬 1개, 호출 사이 최소 15초, 재시도 0, JSON repair 0, 수동 교정 0, 비용 상한 USD 0이다. 이 조건은 Stage 12의 로컬 백엔드 전송 설정만 대체할 예정이었으며, 원본 프롬프트나 평가 의미를 바꿀 권한은 아니다.\n\n최종 상태 ${verdict}. Schema 후보가 기존 fixture의 accept/reject를 바꾸므로 전송을 활성화하지 않았다. gemini-runner.mjs는 오프라인 차단 실행기이며 fetch/SDK/인증 헤더/네트워크 구현이 없다. 향후 어댑터가 실행 검증됐다고 주장하지 않는다. TRANSPORT_LOCK은 이번 차단 상태와 전송 명세의 해시를 고정한 기록이고, 실제 모델 호출 설정 잠금은 NOT_RUN이다.\n`);
put('SCHEMA_COMPATIBILITY.md', `# Schema 호환성 — ${verdict}\n\n원본 SHA-256: ${report.originalSchemaSha256}\n\n거부된 Gemini 부분집합 후보 SHA-256: ${report.candidateSchemaSha256}\n\n실제 전송 Schema SHA-256: null (전송 0회). 후보 파일은 호환성 실패를 재현하기 위한 것으로, 승인된 전송 Schema가 아니다.\n\n[공식 Structured Outputs 지원 명세](https://ai.google.dev/gemini-api/docs/structured-output#json_schema_support)에 없는 검증 키를 제거한 후보를 검사했다. $schema 1개는 dialect 주석이고, minLength 58개·maxLength 58개·pattern 6개·uniqueItems 17개는 실제 제약이다. 전체 위치·원래 값·이유와 필드/required/enum/배열/null/additionalProperties 목록은 artifacts/schema/compatibility.json에 있다.\n\n필드 이름, required, enum, 배열 items와 최소/최대 개수, null 분기, 추가 필드 금지는 동일하다. 문자열 길이, 수치 문자열 패턴과 배열 중복 금지는 보존되지 않는다. 자유 문자열의 제약을 유한 enum으로 줄이거나 숫자 문자열을 number로 바꾸면 원래 허용 집합/타입이 달라진다. 무제한 문자열 배열의 중복 금지를 maxItems로 대신할 수도 없다. 프롬프트 설명이나 원본 validator의 사후 적용은 전송 Schema 의미 동등성을 증명하지 않는다.\n\n원본 validate 함수를 수정 없이 원본 Schema와 후보 Schema에 각각 적용했다. 기존 출력 fixture 35개 중 32개만 동일하고 3개는 다르다. 42 scorer 검사에는 별도의 집계 검사 7개가 포함되며, 그 7개는 응답 JSON fixture가 아니다.\n\n| 기존 fixture | 원본 | 후보 | 잃어버린 제약 |\n| --- | --- | --- | --- |\n| duplicate-span-format | 거부 | 허용 | uniqueItems |\n| empty-question-format | 거부 | 허용 | minLength |\n| zero-denominator | 거부 | 허용 | pattern |\n\n이 결과는 문서상 부분집합으로 만든 후보의 비동등성을 입증한다. 미문서화된 실제 서버 동작은 호출해 탐색하지 않았다. 사용자가 요구한 동등성 조건을 충족하지 못했으므로 smoke 이전에 종료했다. 모델 성능 실패나 B/C 퇴행으로 집계하지 않는다.\n\n재현: node stage13c/tools/schema-audit.mjs --summary (의도된 종료 코드 2).\n`);

const transport = {recordedAt: now, status: verdict, frozen: true, freezeScope: 'BLOCKED_TRANSPORT_SPECIFICATION_AND_REJECTED_CANDIDATE_ONLY',
  executionEnabled: false, validated: false, firstModelCallAt: null, authorization, intendedSettings,
  requestFieldMapping: {thinking_level: 'generation_config.thinking_level', max_output_tokens: 'generation_config.max_output_tokens',
    structuredOutput: 'response_format', streaming: 'stream=false', conversationStorage: 'store=false', background: false,
    tools: 'omitted', previous_interaction_id: 'omitted', seed: 'omitted_by_user_instruction'},
  appliedTransport: null, originalSchemaSha256: report.originalSchemaSha256, geminiSchemaSha256: null,
  rejectedCandidateSchemaSha256: report.candidateSchemaSha256, schemaFixtureEquivalence: 'FAIL_3_OF_35',
  transportCodePath: 'stage13c/tools/gemini-runner.mjs', transportCodeSha256: sha('stage13c/tools/gemini-runner.mjs'),
  schemaAuditCodeSha256: sha('stage13c/tools/schema-audit.mjs'),
  transportAddendumSha256: digest(files.get('TRANSPORT_ADDENDUM.md')),
  schemaCompatibilityDocumentSha256: digest(files.get('SCHEMA_COMPATIBILITY.md')),
  sourceHashes};
put('TRANSPORT_LOCK.json', transport);
put('MODEL_LOCK.json', {status: 'NOT_RUN', reason: verdict, locked: false, requestedModel: authorization.model,
  actualUsedModel: null, actualModelVersion: null, modelResponseInformation: null, provider: authorization.provider,
  endpoint: intendedSettings.endpoint, thinkingLevel: 'medium', maxOutputTokens: 4096, authorization,
  schemaSha256: null, rejectedCandidateSchemaSha256: report.candidateSchemaSha256,
  runnerSha256: transport.transportCodeSha256, transportLockSha256: digest(files.get('TRANSPORT_LOCK.json')),
  sourceHashes, stage13bPrecheckResult: preflight, neutralSmokeStatus: 'NOT_RUN', actualSettingsEquality: 'NOT_RUN'});
put('EXECUTION_PLAN.json', {status: 'NOT_RUN', reason: verdict, executionPlanFrozen: false,
  preservedOriginalPlan: true, calls, sourceCallPlanSha256: sha(sourcePaths.callPlan), plannedSemanticCalls: 42,
  plannedDevCalls: 6, plannedEvalCalls: 36, repeatSeedUse: 'IDENTIFIER_ONLY_NOT_SENT_TO_GEMINI',
  intendedSettings, actualAppliedSettings: null, modelLockActivated: false, sourceHashes,
  transportLockSha256: digest(files.get('TRANSPORT_LOCK.json')), retries: 0, jsonRepair: false,
  manualCorrection: false, freeOnly: true, terminalStage: true});
const stages = [
  {stage: 'key_presence', status: 'PASS'}, {stage: 'prior_integrity', status: 'PASS'},
  {stage: 'official_transport_documentation', status: 'PASS_DOCUMENTATION_ONLY'},
  {stage: 'schema_compatibility', status: 'FAIL', reason: verdict},
  ...['account_model_metadata', 'account_free_tier_and_quota', 'neutral_smoke', 'model_and_execution_activation',
    '42_semantic_calls', 'frozen_scoring', 'model_error_audit'].map(stage => ({stage, status: 'NOT_RUN', reason: verdict}))
];
put('RUN_RECORD.json', {status: 'BLOCKED', reason: 'SCHEMA_VALIDATOR_ACCEPT_REJECT_MISMATCH', finalVerdict: verdict,
  recordedAt: now, authorization, keyPresent: true, googleKeyPresent: false, requestedModel: authorization.model,
  actualUsedModel: null, actualModelVersion: null, actualModelEndpointRequests: 0, actualMetadataRequests: 0,
  actualSmokeCalls: 0, actualSemanticCalls: 0, plannedSemanticCalls: 42, unstartedPlannedCalls: 42,
  requests: [], rawResponses: [], actualRetries: 0, actualJsonRepairs: 0, manualCorrections: 0,
  codexResponsesUsedAsEvaluationData: 0, replayResponses: 0, actualCostUSD: 0,
  costBasis: 'No authenticated metadata or generation API requests; public documentation browsing only.',
  actualModelDownloadGB: 0, freeTier: {status: 'NOT_RUN_ACCOUNT_CHECK', confirmed: null, publicStandardFreeTierDocumented: true, reason: verdict},
  quota: {RPM: 'UNKNOWN', TPM: 'UNKNOWN', RPD: 'UNKNOWN', quotaExhaustionObserved: null},
  paidTierStatus: 'UNKNOWN_NOT_CHECKED', paidUsageDetected: false, paidUsageDetectionBasis: 'Zero API calls, not a billing-account inspection.',
  billingChanges: 0, usage: null, latency: null, httpFailures: [], parseFailures: [],
  metrics: {status: 'NOT_RUN', B: null, C: null, pairedCases: null, repeatConsistency: null},
  schemaCompatibility: {status: 'FAIL', fixtureCount: 35, equal: 32, mismatches: report.mismatches.map(x => x.id)}, stages});

put('RESULTS.md', `# Stage 13C 결과 — ${verdict}\n\nsmoke 0회, 의미 호출 0/42회(dev 0/6, eval 0/36). 요청 기록이 없으므로 B/C 성능 결론과 통계 비교를 산출하지 않는다. 미실행 호출 42개는 실패 응답이 아니라 미착수 계획으로 보존한다.\n\n| 지표 | B | C |\n| --- | --- | --- |\n| Schema validity | NOT_RUN | NOT_RUN |\n| Label accuracy | NOT_RUN | NOT_RUN |\n| Field-level accuracy | NOT_RUN | NOT_RUN |\n| Citation/source-span 정확성 | NOT_RUN | NOT_RUN |\n| 근거 없는 필드 생성 | NOT_RUN | NOT_RUN |\n| false runtimeExecutable=true | NOT_RUN | NOT_RUN |\n| clarification/abstention 적절성 | NOT_RUN | NOT_RUN |\n| 정상 사례 과도 유보 | NOT_RUN | NOT_RUN |\n| Paired-case 차이 | NOT_RUN | NOT_RUN |\n| 반복 간 일관성 | NOT_RUN | NOT_RUN |\n| HTTP/API 실패 | 0 (요청 0) | 0 (요청 0) |\n| JSON 파싱 실패 | 0 (응답 0) | 0 (응답 0) |\n\nSchema 호환성 fixture 32/35 일치는 모델 성능이 아니다. scorer 회귀 검사 42/42도 모델 결과가 아니다. 기존 Stage 10의 소형 모델 결과는 합산하지 않았다.\n\n공식 [가격표](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash)는 Standard 무료 경로를 기재하지만, 이 계정의 등급·잔여 할당량은 확인하지 않았다. RPM/TPM/RPD는 모두 UNKNOWN이다. API 요청 0회이므로 이번 API 비용은 USD 0이고 실제 사용 모델은 없다.\n\n공개 선택 조항의 B/C 상대 성능조차 아직 검증되지 않았다. 시장 수요·전체 약관 해석·법적 유효성·실제 환급 가능성·블록체인 필요성·모든 운영 중단 해결에 관한 근거로 사용할 수 없다.\n`);
const auditCategories = ['B_ONLY_CORRECT','C_ONLY_CORRECT','BOTH_CORRECT','BOTH_INCORRECT','ONE_ARM_SCHEMA_FAILURE',
  'C_UNNECESSARY_ABSTENTION','UNSUPPORTED_VALUE','WRONG_CITATION','REPEAT_DISAGREEMENT'];
put('artifacts/error-audit.json', {status: 'NOT_RUN', reason: verdict,
  categories: auditCategories.map(category => ({category, status: 'NOT_RUN', count: null, cases: null})),
  schemaCompatibilityCounterexamples: report.mismatches.map(x => x.id), counterexamplesAreModelResponses: false});
put('ERROR_AUDIT.md', `# 오류 감사 — 모델 결과 NOT_RUN\n\n${auditCategories.map(name => '- ' + name + ': NOT_RUN (사례 수 null)').join('\n')}\n\n대표 개선·퇴행 사례는 없다. 응답이 0건이므로 위 집합을 빈 오류율 또는 전부 정답으로 해석하지 않는다.\n\n실행 전 기술 감사에서는 duplicate-span-format, empty-question-format, zero-denominator의 세 기존 합성 fixture가 원본 거부/후보 허용으로 바뀌었다. 이것은 전송 Schema 제약 손실이며 C 또는 B의 실제 오류가 아니다. 상세 accept/reject와 원본 validator 오류는 artifacts/schema/compatibility.json에 보존했다. 이 감사로 정답·점수·기준을 변경하지 않았다.\n`);
put('DECISION.md', `# 최종 판정\n\n${verdict}\n\n사용자 지시 7절의 Schema 의미 동등성 조건이 충족되지 않았다. 기존 35개 출력 fixture 중 3개의 accept/reject가 달라져 인증·smoke·의미 호출 이전에 종료한다. 원본 Schema를 약화하거나 다른 모델로 대체하지 않았다.\n\nPROCEED_HUMAN_APPROVED_AI_ASSISTANT와 NO_AI_ADVANTAGE 중 어느 성능 판정도 이번 결과로 선택하지 않는다. 새 B/C 성능 근거가 없으므로 AI 핵심 기능 승격은 보류한다. 기존 수동 템플릿·결정론적 컴파일러 기본 경로와 사람 검토 전제의 보조 역할을 유지한다. AI의 runtimeExecutable 결정·vault 생성·지급·서명·증빙 진위·법적 환급 가능성 판단을 승인하는 결과가 아니다.\n\n14단계의 단 하나의 권장 작업: 원본 Schema의 문자열·수치 패턴·중복 금지 의미를 보존할 수 있는 전송 규약을 별도 설계하여 승인·동결한다. 기존 stage12와 이번 stage13c를 수정해 재시작하지 않는다.\n`);
put('README.md', `# Stage 13C — ${verdict}\n\nGemini 키는 존재하고 Google 키는 없다. 기존 무결성 검사는 모두 통과했지만, Gemini 문서상 Schema 부분집합 후보에서 기존 fixture 3개가 원본과 다른 판정을 받아 API 호출 전에 종료했다.\n\n- 실제 사용 모델: 없음 (승인 대상 gemini-3.8-flash).\n- smoke: 0회. 의미 호출: 0/42회. API 비용: USD 0.\n- B/C 성능·개선/퇴행 사례: NOT_RUN. 무료 할당량: UNKNOWN.\n- 기존 파일 ${preflight.priorFileCount}개의 기준 해시: artifacts/prior-files.json.\n- 최종 보존·산출물 감사: artifacts/final-verification.json.\n- 해시 목록: checksums.sha256 (자기 자신 제외).\n\n[Schema 차단 근거](SCHEMA_COMPATIBILITY.md), [최종 판정](DECISION.md), [실행 기록](RUN_RECORD.json), [최종 검증](artifacts/final-verification.json)을 참조한다.\n\n검증 명령:\n\n\`\`\`sh\nnode stage13c/tools/schema-audit.mjs --summary\nnode stage13c/tools/gemini-runner.mjs\nnode stage13c/tools/verify.mjs --with-checksums\nshasum -a 256 -c stage13c/checksums.sha256\n\`\`\`\n\n첫 두 명령의 종료 코드 2는 동결된 차단 상태 재현이다. Stage 13B verifier는 stage13c 생성 후 다시 실행하지 않는다. MODEL_LOCK/EXECUTION_PLAN 파일은 필수 미실행 기록이며 실제 모델/실행 활성화 잠금은 아니다. checksums-before-run.sha256은 smoke 미실행으로 생성 조건에 도달하지 않았다. gemini-runner는 원격 요청 기능이 없는 오프라인 차단 실행기다.\n`);
put('raw/README.md', '# 원시 응답 없음\n\nSchema 단계에서 종료했다. API 요청·원시 모델 응답은 0건이다. 하위 README는 안내이며 모델 응답으로 계산하지 않는다.\n');
put('raw/smoke/README.md', '# Smoke NOT_RUN\n\nBLOCKED_SCHEMA_INCOMPATIBLE. 원시 smoke 응답 0건.\n');
put('raw/semantic/README.md', '# Semantic NOT_RUN\n\nBLOCKED_SCHEMA_INCOMPATIBLE. 원시 의미 응답 0건. 42개 호출 계획은 EXECUTION_PLAN.json에 원래 순서로 보존된다.\n');

let patch = '*** Begin Patch\n';
for (const [path, body] of files) {
  if (fs.existsSync('stage13c/' + path)) throw new Error('REFUSING_TO_OVERWRITE_ARTIFACT');
  patch += '*** Add File: stage13c/' + path + '\n' + body.replace(/\n$/, '').split('\n').map(line => '+' + line).join('\n') + '\n';
}
patch += '*** End Patch\n';
const env = {...process.env}; delete env.GEMINI_API_KEY; delete env.GOOGLE_API_KEY;
const result = spawnSync('apply_patch', [], {input: patch, encoding: 'utf8', env, maxBuffer: 16 * 1024 * 1024});
if (result.status !== 0) throw new Error('ARTIFACT_PATCH_FAILED');
console.log(JSON.stringify({status: verdict, createdFiles: files.size, smokeCalls: 0, semanticCalls: 0}));
