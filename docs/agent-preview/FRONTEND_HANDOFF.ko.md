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

## 기존 모듈 실행과 실제 AI 준비

`src/agent-preview/existing-module-demo.mjs`의 `executeExistingModuleDemo(plan,draft)`는 선택한 Moodle 활동/과제에만 기존 `readBootcampMoodle`와 `validateBootcampMoodleResult`를 호출한다. 인공 API 응답·인공 ID·고정 P0 context이며 실제 LMS 접속이 아니다. 회고 선택 시 기존 `validateGroundedReview`가 세 항목의 인공 원문 인용 위치를 검사한다. 변형 preview 해시를 P0 정책 해시에 대입하지 않는다. 내부 producer의 LOCAL_LMS_RECORD receipt는 외부로 내보내지 않고 합성 모드의 facts/지문만 반환한다. HackerRank 선택은 `RECLAIM_SIGNATURE_DEMO_NOT_CONNECTED`, 전체 coverage는 PARTIAL이다. 이는 서명 시연 완료가 아니다.

이 저장소 어댑터에는 루트 npm 의존성(ethers 등)이 필요하다. 독립 tarball에는 기존 producer를 복사하지 않는다. 현재 패키지 인수 범위는 (1)조건·계획뿐이며 (2)Moodle/Reclaim, (3)회고AI/근거, (4)기존정산 연결의 독립 패키징은 후속이다. 임의 콜백이나 금고 전송 기능을 공개하지 않는다.

`src/agent-preview/gemini-preparation.mjs`의 `prepareGeminiStructureRequest(sourceText)`는 기존 Gemini 모델용 정확한 body/bodyHash·출력 schema만 준비한다. PREPARED_NOT_EXECUTED이며 API 호출·키 탐색·비용 승인이 없다. 실제 응답을 현재 SYNTHETIC_RULES draft로 위장하지 않는다. 가격/정확한 비용 검토, 해당 bodyHash 신규 직접 승인, 단회 store와 기존 전송기 소유자 연결, 응답 AST 검사가 필요하다. 현재 실제 모델 응답 재생 자료도 없으므로 SYNTHETIC을 REPLAY/ACTUAL로 표시하지 않는다.

## 0.1.1 JSON 경계 보정

해시/클론 전에 plain JSON DTO만 허용한다. undefined, 배열 extra field/빈 슬롯, symbol/non-enumerable/accessor, 사용자 정의 prototype, 함수/toJSON, 비유한 수/-0, 깊이 32 초과를 거부한다. 추가 필드를 JSON.stringify로 생략한 뒤 VERIFIED로 표시하지 않는다. 동일 오류는 validatePlan의 errors에 DTO_JSON_*로 표시되며 buildPlan/executePublicDemo/hash는 해당 code로 throw한다. 검사/해시는 JS 객체의 accessor를 호출하지 않는다.
