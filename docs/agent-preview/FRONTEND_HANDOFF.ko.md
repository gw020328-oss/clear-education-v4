# 조건·계획 사전설정 시연 인수 v1

기준 develop e7f77ed, 담당 B. HTTP endpoint 없음. 정상 지급과 별개인 개설 전 시연이며 학생별 정책 변경·실제 수집·지급을 허용하지 않는다.

독립 ESM 패키지 `@clear/preview-core` (`packages/clear-core/src/index.mjs`), 저장소 진입점 `src/agent-preview/index.mjs`.

| 함수 | 입력 | 출력 |
| --- | --- | --- |
| structureSynthetic(sourceText) | 공개 예문 문자열, 최대 4096 UTF-16 units | Draft |
| buildPlan(draft) | 검증된 READY draft | Plan |
| validatePlan(plan,draft) | Plan, 원문이 포함된 Draft | `{ok,errors,sourceHash,planHash}` |
| executePublicDemo(plan,draft) | 검사를 통과한 Plan, Draft | 합성 관측 근거·호출 목록 |

Draft: version, executionMode=SYNTHETIC_RULES, actualModelCall=false, sourceText/sourceHash, clauses[{id,start,end,text}], conditions[{id,clauseId,capability,target}], questions[{clauseId,reason}], status=READY/UNSUPPORTED/NEEDS_CLARIFICATION, draftHash. source span은 원문 UTF-16 위치, 정규화 전 원문을 보존한다. 지원 문법 밖 문장은 질문으로 남기며 부분 실행하지 않는다. 자연어 범용 AI 해석 결과가 아니다.

Plan: version, executionMode=PUBLIC_SYNTHETIC, sourceHash,draftHash, steps[{id,tool,version,conditionId,input:{clauseId,target},dependsOn:[],output,onFailure:STOP}], planHash. 공개 manifest의 4개 읽기 전용 도구만 허용한다. 각 조건 하나당 한 단계, 현재 버전은 단계 간 의존을 지원하지 않는다(외부 참조·순환·선행단계 포함 모두 거부). 최대 4단계. 알려지지 않은 필드(권한·URL·callback 포함) 거부.

결과: executionMode=PUBLIC_SYNTHETIC, actualModelCall=false, sourceHash/planHash, hashStatus=VERIFIED, scope=PRECONFIGURATION_ONLY, automaticEligibility=false, paymentAllowed=false. 관측은 공개 인공 자료에 대한 로컬 검증이며 실제 Moodle 조회·Reclaim 서명 검증·실제 Gemini 호출이 아니다. 원문/해시는 출처 진위나 의미 정확성 보장이 아니다.

실제 S4 원문 HTTP는 이 패키지에서 제공하지 않는다. 실제 AI wire는 별도 준비 계약으로 인수하며 기존 MOCK를 ACTUAL로 바꾸지 않는다. 기존 회고의 3항목/입력별 승인·고정 4조건 정상 지급 경계는 보존한다.

## 0.1.x 저장소 시연과 구조화 요청 준비

`src/agent-preview/existing-module-demo.mjs`의 `executeExistingModuleDemo(plan,draft)`는 선택한 Moodle 활동/과제에만 기존 `readBootcampMoodle`와 `validateBootcampMoodleResult`를 호출한다. 인공 API 응답·인공 ID·고정 P0 context이며 실제 LMS 접속이 아니다. 회고 선택 시 기존 `validateGroundedReview`가 세 항목의 인공 원문 인용 위치를 검사한다. 변형 preview 해시를 P0 정책 해시에 대입하지 않는다. 내부 producer의 LOCAL_LMS_RECORD receipt는 외부로 내보내지 않고 합성 모드의 facts/지문만 반환한다. HackerRank 선택은 `RECLAIM_SIGNATURE_DEMO_NOT_CONNECTED`, 전체 coverage는 PARTIAL이다. 이는 서명 시연 완료가 아니다.

이 저장소 어댑터에는 루트 npm 의존성(ethers 등)이 필요하다. 독립 tarball에는 기존 producer를 복사하지 않는다. 현재 패키지 인수 범위는 (1)조건·계획뿐이며 (2)Moodle/Reclaim, (3)회고AI/근거, (4)기존정산 연결의 독립 패키징은 후속이다. 임의 콜백이나 금고 전송 기능을 공개하지 않는다.

`src/agent-preview/gemini-preparation.mjs`의 `prepareGeminiStructureRequest(sourceText)`는 기존 Gemini 모델용 정확한 body/bodyHash·출력 schema만 준비한다. PREPARED_NOT_EXECUTED이며 API 호출·키 탐색·비용 승인이 없다. 실제 응답을 현재 SYNTHETIC_RULES draft로 위장하지 않는다. 가격/정확한 비용 검토, 해당 bodyHash 신규 직접 승인, 단회 store와 기존 전송기 소유자 연결, 응답 AST 검사가 필요하다. 현재 실제 모델 응답 재생 자료도 없으므로 SYNTHETIC을 REPLAY/ACTUAL로 표시하지 않는다.

## 0.1.1 JSON 경계 보정

해시/클론 전에 plain JSON DTO만 허용한다. undefined, 배열 extra field/빈 슬롯, symbol/non-enumerable/accessor, 사용자 정의 prototype, 함수/toJSON, 비유한 수/-0, 깊이 32 초과를 거부한다. 추가 필드를 JSON.stringify로 생략한 뒤 VERIFIED로 표시하지 않는다. 동일 오류는 validatePlan의 errors에 DTO_JSON_*로 표시되며 buildPlan/executePublicDemo/hash는 해당 code로 throw한다. 검사/해시는 JS 객체의 accessor를 호출하지 않는다.

## 0.2.0 독립 모듈 인수

`@clear/preview-core/modules`는 `runEvidenceDemo`, `runReflectionGroundingDemo`, `runSettlementConnectionDemo`, `prepareGeminiStructureRequest`를 내보낸다. 앞의 세 함수는 고정 공개 합성 데이터로 실행한다. 패키지 작성 명령과 클린 폴더 예제는 패키지 README에 있다.

- 증빙은 기존 Moodle activity/assignment producer 및 receipt 검사와 Reclaim SDK 기반 HackerRank verifier를 호출한다. 임시 합성 signer의 서명 두 건을 검증하고 변조 인증서 서명을 거부한다. live source 또는 공식 운영 attestor를 사용했다는 뜻은 아니다.
- 회고는 기존 grounding으로 고정 세 항목의 원문 위치를 확인한다. 기존 `bootcamp-reflection.mjs`의 프로필과 `fixed-normal-reflection.mjs`의 요청 준비 함수로 본문 지문을 계산한다. 별도로 노출한 Gemini 준비 함수는 조건 구조화용이다.
- 정산 연결은 기존 `decisionRecord`와 `createDecisionEvidenceReader`를 고정 네 조건으로 호출한다. 실제 제품은 store가 이 reader를 인수하고 기존 S4 decision-evidence 조회에 연결한다. 데모는 입력 증거가 없는 UNKNOWN decision과 메모리 SQLite query-only view로 지문 일치를 확인한다. 실제 지급·서명·수락 흐름은 제품 호스트 소유다.

## 0.3.0 Gemini 조건 구조화 인수

`@clear/preview-core/gemini`의 `requestGeminiPreview(sourceText, {approvalRef, claimAndDispatch, signal})`는 고정 Gemini 요청을 만들고 호스트 포트를 한 번 호출한다. 운영 호스트가 인증과 본문 지문에 결합된 입력별 승인, 비용 검토, 영속 단회 소비 및 기존 Gemini 전송기를 제공해야 한다. 호스트 포트의 승인 확인과 단회 소비 구현은 본부 인수 사항이다. 함수는 키를 읽거나 자체적으로 네트워크에 연결하지 않는다.

`inspectHostGeminiReply`와 `inspectFixtureReply`는 각각 HOST_SUPPLIED_PROVIDER_RESPONSE와 OFFLINE_RESPONSE_FIXTURE를 표시한다. 전자는 호스트가 전달한 응답이라는 표시이며 모델 실행 영수증이 아니다. 응답에 빠진 원문 범위, 중복 키, 예상 밖 도구·필드, 잘린 응답, 알려진 문구에 대한 잘못된 capability 매핑을 거부한다. 줄바꿈이나 세미콜론으로 나눈 각 원문 조항은 정확한 UTF-16 범위와 함께 한 번씩 돌아와야 한다. 새 표현의 의미는 운영자가 원문과 capability를 비교해 확인한다.

`executeReviewedGeminiPreview(packet, reviewedHash)`는 운영자가 확인한 proposalHash가 현재 응답과 일치하고 미결 질문이 없을 때만 허용 manifest에서 계획을 만들고 검증한다. 검토 지문은 내용 결합 수단이며 운영자 인증은 호스트 책임이다. 실행은 기존 Moodle·회고 grounding·Reclaim 합성 모듈로 연결되며 결과의 PUBLIC_SYNTHETIC 범위와 지급 금지를 유지한다.

실제 호출 검토용 공개 입력은 `examples/clear-core/gemini-preview-demo.mjs`의 두 문장이다. 모델 gemini-3.5-flash-lite에 입력마다 generateContent 1회, 재시도 0회, 출력 상한 2048 tokens를 적용한다. 전송 범위는 인공 안내문, 원문 위치, 허용 capability/회고 항목 목록과 고정 프롬프트·스키마다. 두 본문 지문은 `450794af7d0d7284a74c0a3790fa1fec396715b0490c7d011ac09f4c27872a25`, `197c51f2aeb8630594fa1f233d620135dc0e958244f0851545af47789d8beae8`이다. 최신 단가와 비용 검토 및 직접 입력별 승인 이후 실제 결과를 별도로 기록한다.

## 0.4.0 서버 조건 관계 검사와 구조화 DTO (2026-11-05, Claude)

기준 develop `9a626a7`. 프롬프트·응답 schema·모델·`bodyHash` 는 바꾸지 않았다(기존 승인·fixture 지문 유지).

**서버 보류 검사** — `reviewModelProposal` 은 모델의 `SUPPORTED` 를 그대로 믿지 않는다. 정규 문법 문장이 아닌 조항에 아래가 있으면 그 조항을 조건으로 만들지 않고 질문으로 남긴다. 원문 인용·위치는 그대로다. draft 에 `guards[{clauseId,kinds,modelStatus,modelCapability}]` 가 추가된다.

| kind | 예 | 결과 |
| --- | --- | --- |
| ALTERNATIVE | 강의 수강 또는 과제 제출 | NEEDS_CLARIFICATION |
| SUBSTITUTE | 과제 제출 대신 후기 작성 | NEEDS_CLARIFICATION |
| NEGATION | 과제 제출은 필요 없습니다 | NEEDS_CLARIFICATION |
| THRESHOLD | 강의 3개 이상 수강 | NEEDS_CLARIFICATION |
| DEADLINE | 11월 30일까지 과제 제출 | NEEDS_CLARIFICATION |
| OPTIONAL | (선택) 수료 후기 작성 | NEEDS_CLARIFICATION |
| MULTIPLE_CONDITIONS | 강의수강 후기적기 과제제출 | NEEDS_CLARIFICATION |
| CAPABILITY_CONTRADICTION | 실습 과제를 Moodle에 제출하세요 → 모델이 활동 완료 | NEEDS_CLARIFICATION |
| UNSUPPORTED_MEASURE | 출석률 90% 이상 | UNSUPPORTED |

질문이 하나라도 있으면 draft 는 READY 가 될 수 없어 `buildPlan` 이 `DRAFT_NOT_READY` 로 거부한다. 다른 조항을 읽었어도 마찬가지다.

**프론트 규칙 제안자와의 차이** — 프론트 `normalize.js` 는 한 문장에서 조건 여럿을 뽑고(「강의수강 후기적기 과제제출」 → 셋), 정규 문장 `A; B; C` 로 이어 보낸다. 서버 계약은 `;`·줄바꿈으로 나눈 **한 조항 = 한 조건**이라, 같은 문장을 원문 그대로 Gemini 경로로 보내면 MULTIPLE_CONDITIONS 로 보류한다. 프론트의 대안·대체 보류(held)와 서버 보류는 같은 방향이지만 규칙은 따로 있다.

**`src/agent-preview/condition-structuring.mjs`** — 리스너·네트워크 클라이언트 없음. 호스트 경로가 부른다.

| 함수 | 역할 |
| --- | --- |
| `prepareStructuring(sourceText)` | 모델 호출 없는 검토 묶음(model·sourceHash·bodyHash·조항·한도) |
| `structureWithGemini(sourceText,{approvalRef,claimAndDispatch,signal,transportExecution})` | 기존 `requestGeminiPreview` 를 한 번 부른다. stage `PROPOSED`·`APPROVAL_REQUIRED`·`MODEL_CALL_FAILED`·`MODEL_RESPONSE_REJECTED`. 실패 때 규칙 결과로 대신하지 않는다(`fallback:'NONE'`) |
| `proposalDto(draft)` | 프론트 DTO `clear-condition-proposal.1` — 조항별 quote·start·end·status·capability·tool·question·serverGuard |
| `rowsFromDraft(draft)` | 호스트가 원 응답 대신 저장할 행 |
| `planReviewedProposal` / `executeReviewedProposal` | 운영자 검토 지문으로 재검토 → 등록 manifest 매핑 → `validatePlan` → 기존 PUBLIC_SYNTHETIC 실행. 결과에 `toolSelection:'MODEL_CLASSIFIES_CAPABILITY_CODE_MAPS_TOOL'`, `selectedBy:'CODE_TOOL_MANIFEST'`, `toolSource:'PUBLIC_FIXTURE'`, `actualMoodleQuery:false`, `actualReclaimVerification:false` |

도구 선택: 모델은 조항마다 capability(조건 종류)만 고른다. 도구는 코드가 `TOOL_MANIFEST` 에서 매핑한다. 모델이 도구를 직접 고르는 경로는 없다.

**HTTP** — develop 에는 서버 경로가 없다. 기존 경로는 D 의 Draft 연쇄(`deploy/agent-preview`, PR #154 계열)의 `/v1/preview/prepare`·`/generate`·`/execute` 다. 최소 확장안:

- `generate` 응답에 `proposal`(=`proposalDto(draft)`)과 `modelCall`(stage·attempted·succeeded·errorCode·execution) 추가. 실패는 HTTP 오류와 함께 `stage` 를 그대로 준다.
- `execute` 는 지금처럼 저장 행·proposalHash 로 재검토하되 결과를 `executeReviewedProposal` 모양(steps·validation·execution 원천 표시)으로 준다. D 의 실제 관측 연결(`ACTUAL_TOOL_NOT_ENABLED`·활동 1단계 제한)은 그대로 둔다.

요청·응답 예시는 워크트리의 `CLAUDE_HANDOFF.md` 에 있다.

**검사** — `./tools/node --import ./tests/agent-preview/network-block.mjs --test tests/agent-preview/condition-structuring.test.mjs` (11). 기존 developerTransport 에 시험용 fetch·키만 주입하고 승인은 bodyHash 단회 소비 대역이다. 실제 Gemini 호출 없음.

## PR166 보정 후보: core 0.1.2 / 모델 draft v2

기준 head `93c849b7027dca75877f878ba39534ef062582c9`. E가 확인한 `안 들어도`, `선택적으로`, `두 번`, `2시간`, 요일·ISO 날짜 기한과 같은 종류의 의무 두 개(`강의 A와 강의 B`)를 보류한다. `빠짐없이 완료`는 부정으로 보지 않고, `강의 수강 후기를 작성`의 강의는 후기의 주제로 처리한다. 별도 수강 의무(`강의를 수강하고 후기를 작성`)는 계속 복수 조건으로 보류한다. 이 검사는 알려진 표현에 대한 보수적 검사이며 임의 자연어의 의미 보장은 아니다.

- `clear-preview-model-draft.2`는 원본 모델 행의 복사본 `modelRows`를 포함한다. 서버가 보류한 SUPPORTED 행과 중복 조건도 원형을 유지한다. `rowsFromDraft`는 직렬화 후에도 이 행과 `proposalHash`의 결합을 검사해 복사하여 반환한다. 표시용 `proposal.clauses`를 저장 행으로 대체하지 않는다.
- `proposalHash=hash({sourceText,rows})`와 프롬프트·schema·모델·bodyHash는 그대로다. draft 버전/필드 및 검사 결과 때문에 `draftHash`와 이를 포함한 `planHash`는 달라진다. 과거 plan/draft를 재사용하지 않고 저장한 원본 행을 현재 core에서 재검토한다. `.1` draft만 남아 원본 응답/행이 없으면 `MODEL_ROWS_UNAVAILABLE`이며 새 제안을 받아야 한다. 원본 행과 hash가 맞지 않으면 `MODEL_ROWS_BINDING`이다.
- `clear-condition-structuring.2`의 `actualModelCall`은 `true | false | null`이다. ACTUAL 호스트의 응답 수신은 true, 호스트 진입 전 거부/준비 단계와 오프라인 경로는 false다. 호스트의 예약 코드 `APPROVAL_REQUIRED_OR_SPENT`는 provider 전송 전 승인 거부만 뜻하므로 false다. 다른 ACTUAL 호스트 실패가 응답 없이 끝나면 null(전송 여부 미확인)이다. `modelCall.attempted`는 호스트 함수 진입일 뿐 승인 소비·전송 증거가 아니다. true 역시 호스트가 전달한 응답과 ACTUAL 선언에 따른 표시이지 독립적인 과금 영수증은 아니다. null을 true나 false로 강제 변환하지 않는다. countTokens와 generateContent의 세부 전송 단계는 D가 실제 호스트 근거로 인수할 사항이며 이 wrapper는 그 단계를 추정하지 않는다.
- HTTP/프론트 소비자는 draft v2와 nullable 호출 표시를 인수해야 한다. D의 `/execute` 단일 활동/오프라인 관측 계약은 이 변경으로 확장되지 않는다. D 소유 HTTP 파일은 수정하지 않았고 호스트 전송 인터페이스도 그대로다.
- `packages/clear-core`는 0.1.2 후보이며 0.1.1을 같은 버전으로 재출시하지 않는다. 별도 full-module 번들은 이번 범위에서 재패키징하지 않는다. 패키지 업그레이드 시 기존 모델 draft/plan 캐시를 무효화한다. 합성 규칙 draft 형식은 유지한다.

후속 오보류 보정: 한글 수량의 시작이 앞 단어에 붙어 있으면 수량 후보로 보지 않는다. `포함한 회고`·`상세 회고`를 `한 회`·`세 회`로 읽지 않는다. 같은 종류의 명사 반복 검사에서 `강의와 관련된 활동`의 관계 수식어는 별도 대상으로 세지 않되, `강의와 관련된 활동 A와 활동 B`의 두 대상은 계속 보류한다. 이 보정은 새로운 조건 종류나 자연어 지원 범위를 정의하지 않는다. 모델 draft/행 보존/출처 표시 계약과 패키지 후보 버전은 위와 같다.

수량 경계 설계 재검토(기준 `c11e13d`): 단위 뒤 조사 목록으로 수량을 인정하던 조건을 제거했다. 목록 밖 `두 번으로`·`두 번이나`가 지원 조건으로 축소되는 결함이 있었기 때문이다. 현재 기준은 **독립된 수량 어두 + 등록 단위 후보가 있으면 뒤 표현과 무관하게 보류**다. `포함한`·`상세`는 수량 어두가 아니므로 회고 명사의 일부를 횟수로 읽지 않는다. 반면 `한 회고`처럼 독립 수량 다음의 단위 후보가 명사의 시작일 수도 있는 경우는 모호한 수량문으로 보류한다. 단위 뒤 표현을 해석해 실행을 허용하지 않으며, 조사별 예외 목록을 확장하지 않는다. 이는 수량 손실 가능성을 잡는 보수적 검사이지 한국어 형태소 분석이나 모든 수량 표현의 완전한 판정이 아니다.
