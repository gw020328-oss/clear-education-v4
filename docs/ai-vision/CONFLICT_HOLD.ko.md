# 충돌값의 결정적 보류 경계

2026-10-15. #39 / Draft #51 후속. 권장 Sol / High이며 이 문구만으로 실제 설정을 변경했다고 주장하지 않는다. 소유 경로인 ai-policy/document-precheck·전용 테스트·문서만 변경한다.

## 문제와 소비 규칙

실제 합성 T04에서 Gemini 3.5와 3.8 모두 700/800 점수 충돌에 대한 질문/flag와 `score=700`을 함께 반환했다. 기존 지시문 v2의 null 요청은 모델이 따라야 하는 지시였다. 이번에는 모델 결과를 받은 뒤 순수 코드로 값을 보류한다.

`reviewFields` (`clear-field-review.1`)는 다음 규칙을 적용한다.

- 질문 `{questionId, fieldIds, text}` 및 flag `{code, fieldIds}`의 대상 필드는 `value=null`, `state=HELD`다. 모든 질문은 미확정으로 취급한다. flag 종류를 자연어로 해석해 보류를 해제하지 않는다.
- 범위가 `null`이거나 기존 문자열 형식이면 모든 필드를 보류한다. 질문/flag가 가리키는 필드를 추정하지 않는다. 일부 정상 필드를 과도하게 보류할 수 있다.
- 명시된 범위 외의 관찰값은 근거 위치가 있을 때 `OBSERVED`로 유지한다. 이는 확정 정책이나 자격 증거가 아니다. 누락/읽지 못한 값은 `UNOBSERVED`/null이다.
- 숫자만 있는 응답, 숫자형 value, 중복·미등록 필드, 알 수 없는 대상, 근거 위치 없는 non-null, 추가 승인 필드를 거부한다. `provenance.observedValue`는 원래 값과 위치를 보존하는 진단 자료이며 확정값으로 사용하는 두 번째 경로가 아니다. 질문/flag도 원형을 보존한다.

원문에서 모델이 충돌을 발견하지 못하고 질문/flag 없이 문자열 숫자만 반환하면 후처리는 이를 `OBSERVED`로 유지한다. 이 코드가 모든 원문 충돌·의미 오류·의도적으로 잘못 지정한 field scope를 독립 탐지하지 않는다. 위치와 인용의 일치도 해당 숫자가 규정을 올바르게 해석했다는 증거가 아니다. 원천/동일인·진위·이력 완전성 검증은 여전히 별도다.

## 소비자 연결

`proposePolicy`의 wrapper 버전은 `ai-policy-proposal.2`다. OPEN 질문의 rule/requirement ID, rule.questionIds, threshold/days 범위를 결정적으로 대조한다. 관련 Rule의 threshold/days를 null로 만들고 OFFICIAL_OPEN 및 questionIds를 유지한다. 범위를 알 수 없는 질문은 모든 Rule의 값 필드를 보류한다. 모델이 questionIds 연결을 빠뜨려도 명시된 rule/requirement 질문을 보류한다. 모델 실패/거부 시 템플릿에 이미 있는 OPEN 질문도 처리하여 숫자가 fallback으로 복구되지 않는다. 원래 후보와 인용은 `grounds`, 원래 숫자는 `heldRuleFields.observedValues`에 남는다. 운영자 의견을 기록해도 OPEN/null이 풀리지 않는다.

`precheckObservation`은 기존 두 필드 출력과 새 `questions/flags`를 포함한 출력을 모두 검증한다. 관찰 위치·TEXT_AI 인용 일치 검증을 먼저 하고 후처리를 거쳐 `record.observations`에 넣는다. 충돌이 있는데 모델이 CHECKED로 표시해도 NEEDS_REVIEW로 내린다. 대상이 없는 NEEDS_REVIEW/UNREADABLE 등은 전체 보류다. 원문 인용을 포함한 관찰 후보는 wrapper의 `observationEvidence`에 보존한다. `markPrecheckCurrent`는 최신 binding/revision/inputHash/runId와 다르면 current=false와 함께 소비 값을 모두 null로 만들며, 원래 wrapper를 변형하지 않는다.

Gemini 평가 연결은 prompt `clear-gemini-eval.3`와 필드 범위가 있는 구조화 질문/flag를 사용한다. `result.fields`는 후처리 값만 반환하고 원래 관찰값/위치는 `fieldReview.provenance`에 남긴다. `fieldReview.publishable/automaticEligibility/paymentAllowed`는 항상 false다. v1 실제 기록 및 v2 지시문만의 mock 결과와 구분한다.

## 늦은 revision과 재시도

`createFieldReviewSession`은 field별 허용 목록과 caller가 고정한 `{revision,inputHash,runId}`의 메모리 내 수락 경계다. 새 revision 또는 같은 revision/hash의 새 run을 시작하면 이전 receipt는 더 이상 current가 아니다. 같은 revision의 다른 hash, run 재사용, 복제한/소비한 ticket, 이전 revision을 거부한다. 낡은 응답은 payload를 채택하지 않는 STALE, 잘못된 최신 응답은 REJECTED다. 새 재시도가 실패해도 이전 receipt를 current로 복구하지 않는다. 원문 hash의 진실성은 caller가 보장해야 한다. 인증·영속 CAS·DB 동시성/서비스 전체 멱등성을 구현한 것이 아니다. 반환된 과거 receipt는 사용 직전에 `isCurrent`로 확인해야 한다.

## 검증과 실제 모델 분리

```sh
./tools/node --test tests/ai-policy/*.test.mjs tests/document-precheck/*.test.mjs
./tools/node tests/ai-policy/replay-field-review.mjs
./tools/node tests/ai-policy/evaluate-mock.mjs
```

정상 관찰, 질문/flag+숫자, 숫자만/잘못된 출력, 범위 미상, 다중 필드 중 일부 충돌, 템플릿 OPEN과 모델 실패, 운영자 revision, 늦은 revision/동일 revision 재시도·최신 실패·소비/복제 handle, 실제 T04 저장 응답 재생을 시험한다.

`conflict-hold-replay.json`은 과거 실제 합성 응답 2건을 코드로 재처리한 **오프라인 재생**이다. 두 경우 score 소비 값은 null이며 원래 700/질문/flag/위치를 보존한다. 새 모델 호출은 0이다. 과거 실제 모델의 11/12 결과를 새 모델의 성공률로 고쳐 쓰지 않는다. 지시문 v3와 새 구조화 출력은 아직 실제 Gemini로 재평가하지 않았다.

기존 생성/사전계수 3.5 각각14회 + 3.8 각각2회의 승인은 모두 소진됐다. 제안한 후속 최소 재평가는 3.5 정상/충돌 각1건, 생성·사전계수 최대2회·US$0.03이다. 사용자 답변은 사용한 결제 API에 대한 확인 질문이므로 이를 추가 예산 승인으로 해석하지 않는다. 새 유료 호출은 실행하지 않았다. 실제 실행에 사용한 환경변수 키의 소유 프로젝트와 사용자가 충전한 Billing 프로젝트의 일치는 독립 확인하지 못했다. 키 값·결제 식별자를 요구하거나 출력하지 않는다.

공통 #43/#46은 확인 시점에 미병합이다. 병합 commit 수신 후 소비 검증을 이어가며, 이번 변경으로 M2 또는 정본 결합이 완료됐다고 기록하지 않는다. reviewPlan→policyHash OPEN, 운영 Evidence 연결 차단을 유지한다. 예치 정책 미확정,400% 사전검토만,500% 제외, grant/outbox HOLD·독립청구 NO-GO·원천/동일인 미확인 보류도 유지한다. 브랜드별 특례가 없다.

이번 로컬 검증은 192 tests PASS(공통 M1 10 포함), 소비자 mock 7/7, 저장 ACTUAL T04 오프라인 재생2/2, M0 3종·workspace local PASS다. 새 구조화 Gemini 응답은 fake transport로 검증했다. 기존 #51 d3c1736 원격 CI 6개 PASS를 확인했으며, 후속 head의 CI는 별도 결과로 기록한다.

추가 검증으로 Gemini 입력 fixture에 `requestedFieldIds`를 독립 pin했다. 모델이 반환한 필드로 허용 목록을 만들지 않고, 잘못된 필드/질문 대상은 거부한다. renderer는 이 ID 목록만 prompt에 전달하며 gold 값은 보내지 않는다. 과거 v1 corpus/ledger를 덮거나 초기화해 승인 한도를 재사용하지 않는다. 새 corpus 준비는 별도 ignored 디렉터리에서 진행해야 한다. 최종 전용·기존 회귀는 193 PASS다.
