# E6 usage 호환성 v2와 추가 8건 평가 준비

**PREPARED / NOT_APPROVED / 새 실제 호출0·count0·키 읽기0.** 이전 [실제 중단 기록](REVIEW_PRECHECK_E6_PAID_EIGHT_ACTUAL_20261019.ko.md)은 그대로 보존한다. 실제 fetch1·HTTP2xx1 뒤 thoughts 누락으로 중단했고 평가 가능한 사례0/8, 품질·전체 청구액 N/A다. 원시 응답을 보관하지 않았으므로 소급 채점하지 않는다. 기존 승인·원장·spent/lock은 열거나 초기화하지 않는다. 이 준비는 남은7건 재개가 아닌 **별도 추가8건 제안**이다. 추천 Sol/High이며 현재 턴 모델 설정은 별도 변경하지 않았다.

## 공식 근거와 제한된 추론

2026-10-19 확인한 [REST UsageMetadata 정의](https://ai.google.dev/api/generate-content#UsageMetadata)는 total을 prompt·tool-use prompt·thoughts·response candidates의 합계로 설명한다. [공식 Python SDK의 UsageMetadata](https://github.com/googleapis/python-genai/blob/364889aafe40bfa8f3b9db847ba272d299f7d632/google/genai/types.py)는 thoughts를 Optional[int]/기본 None으로 둔다. SDK의 이름을 REST wire 필드와 동일시하지 않고 optionality 보조 근거로만 사용한다. 다른 GenerateContentResponseUsageMetadata 클래스의 지원 표시는 이 근거가 아니다.

[공식 GenerateContent protobuf](https://github.com/googleapis/googleapis/blob/e7513c828b8db536fa12fc5493d541f323aedf90/google/ai/generativelanguage/v1beta/generative_service.proto)의 thoughts는 implicit-presence int32다. 필드 생략을 provider가 명시 보고한0으로 해석하지 않는다. 이 파일의 오래된 total 설명은 계산 근거로 사용하지 않는다. 공개 원문 commit·SHA256은 `e6-usage-definition-evidence-v2.json`에 고정했다.

다음은 위 REST 정의를 **고정 텍스트·도구 없음·캐시 없음 범위**에 적용한 조건부 추론이다. prompt/candidate/total이 명시된 안전한 비음수 정수이고 total≥prompt+candidate일 때 `total−prompt`를 결합 생성량의 **파생 보수적 상한**으로 취급한다. thoughts 원시값은 누락/null 그대로 남기며 residual을 provider가 보고한 thoughts라고 부르지 않는다. thoughts가 명시되면 residual과 일치해야 한다.

| 오프라인 반례 | 처리 |
| --- | --- |
| prompt314 / candidate135 / thoughts누락 / total449 | raw thoughts=null, derived combined135, residual0, 조건부 US$0.0004317 |
| 같은 입력 / total454 | raw thoughts=null, derived combined140, residual5, 조건부 US$0.0004442 |
| total454 / 명시 thoughts0 | 합계 모순으로 중단 |
| total 누락·잘못된 정수·total<prompt+candidate | N/A로 중단 |
| 도구·캐시 양수/상세, 비텍스트 modality, 범위 밖 요청/응답, 알 수 없는 usage 필드 | 중단 |

첫 행은 숫자만 이용한 오프라인 사례이며 이전 실제 실행을 성공으로 재분류하지 않는다. 모달리티 상세와 tool/cache 필드의 생략을 명시된0의 증거로 삼지 않는다. 고정 요청/응답 구조를 검사하고 양수·예상 밖 지표를 거부한다. 조건부 비용은 `prompt×300 + derivedCombined×2500` nanoUSD다. 청구서 검증·provider 확정 cash cap·개별 thinking 실측을 뜻하지 않는다.

## 새 평가안과 실행 경계

이전8건과 **동일한 공개 합성 Python 텍스트·gold·provider body·모델·제한**을 사용한다. 실제 Moodle/HackerRank 자료·이미지는0이며 gold는 provider에 보내지 않는다. 모델은 Gemini Developer API Paid Standard `gemini-3.5-flash-lite`/MINIMAL, 생성최대8·count0·retry/continuation/키·모델·무료 대체0이다. 최소60초 간격·요청45초 timeout, 본문2048/전체8192 UTF-8바이트, maxOutputTokens1024 설정을 유지한다.

[공식 Standard 가격](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite)의 입력US$0.30/백만·출력(thinking 포함)US$2.50/백만을 가정하고 실행일에 다시 확인한다. 입력3000/건·결합 생성1024/건 가정의 추가8건 추정은 **US$0.02768**다. 이는 US$0.05의 확정 상한이 아니며 이미 시작한 호출은 초과할 수 있다. 관측 prompt>3000, 파생 결합 생성>1024 또는 누적 조건부 추정≥US$0.05면 후속 호출을 중단한다. timeout/HTTP오류/usage불명/기타 guard 실패도 재시도 없이 중단하고 미실행 사례를 NOT_RUN으로 남긴다. 이전1회 비용은 이 추가8건 시나리오에 포함하지 않는다.

사용 가능한 것으로 확인된 기존 source `clear-e6-existing-server-gemini-env.1`을 그대로 사용한다. 새 키나 연결 답변을 다시 요구하지 않는다. 실제 승인 전 이 준비에서 키를 읽지 않았다. 파일 탐색/다른 키 fallback 없이 승인과 사전 영속 예약을 통과한 요청에서만 기존 source를 읽는다. 실제 결제 계정·잔액·청구 인증은 별도 N/A다.

새 범위는 `E6_PAID_USAGE_V2_FRESH_EIGHT`, 승인 버전은 `clear-e6-paid-usage-v2-user-approval.2`, 직접 승인 종류는 `DIRECT_HUMAN_NEW_PAID_USAGE_V2_FRESH_EIGHT`다. 최종 clean codeHead/plan/corpus/gold/requests/**usagePolicyHash**·실행일·공식가격 검토·직접 인간 승인 증거를 결합한다. v1 승인과 boolean-only 승인은 거부한다. 공개 null template은 실행 승인이 아니다.

새 승인 경로는 `private/e6-python-paid-usage-v2/approval.json`, 원장은 `artifacts/e6-python-paid-usage-v2-run/`이다. 별도 v2 lease/spent/summary·wx 배타·fsync·원자 사전 checkpoint·소유권 검사를 사용한다. 강제 종료 lock/단회 표식은 자동 삭제·회복하지 않는다. 이 준비에서 active 승인 파일을 만들거나 CLI를 실행하지 않았다. 원시 응답/quote/키/프로젝트 ID 없이 안전한 usage 숫자·파생량·집계·오류코드·hash만 기록한다. paymentAuthority/usableForAcceptance/paymentAllowed=false다.

planHash: `0x640a78767508987d92abab8defe0c102bcdaf05644ecec3ea715d614c3d604b6`.
정확한 코드 HEAD는 이 문서를 포함한 최종 커밋을 PR 완료 보고에서 별도로 제시한다. 구 codeHead/구 planHash 승인을 승계하지 않는다.

## 추가8건에 대한 단일 승인 문안

“최종 codeHead와 위 planHash/usagePolicyHash에 고정된 공개 합성 Python 텍스트 **추가8건**을 기존 유료 키로 평가하도록 새로 승인하시나요? gemini-3.5-flash-lite/MINIMAL, 생성최대8·count0, 재시도·continuation·다른 키/모델/무료 대체0입니다. thoughts 누락은 null로 보존하고 유효 total−prompt로 조건부 생성량 상한을 계산합니다. 이전 실패1회는 그대로 보존합니다. 추가8건 추정 US$0.02768과 **US$0.05 초과 가능성**을 수락하는 안이며, 오류·사용량 불명·관측 가정 초과·누적 추정 US$0.05 도달 시 후속 호출을 중단합니다. 실제 Moodle/HackerRank 자료는 없습니다. 키 값은 보내지 마세요.”

이 문안은 검토 가능한 제안이며 이 준비 자체로 새 실행 승인을 받았다고 보지 않는다.

## 오프라인 검증

가짜 응답·가짜 reader/HTTPS·임시 원장만 사용한다. 누락/null/양수 residual, 명시 thoughts 모순, 정수·합계·도구/캐시/모달리티 반례와 최대8/count0·pacing·승인/head/day/policy pin·사전 checkpoint·timeout·늦은 응답·비용 초과·배타/강제종료·raw 미저장을 검사한다. fake gold 응답 PASS는 모델 품질이 아니다. 기존 실제 실패 레코드와 v1 시험도 유지한다. 담당 tests/ai-review-precheck는 root CI에 포함되지 않으므로 로컬 검사와 원격 CI 결과를 구분한다. 로컬 신규25개를 포함한 사전검토175/175 및 ai-policy/document-precheck 관련291/291이 통과했다. 원본·legacy191개 지문 검증도 통과했다. 원격 CI는 최종 codeHead의 PR 완료 보고를 따른다.
