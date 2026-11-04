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
