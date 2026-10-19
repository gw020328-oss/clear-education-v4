# E6 REST 응답 호환성 v3 — 오프라인 준비·root 검토 대기

**PREPARED / NOT_APPROVED / 실제 추가 호출0·count0·키 읽기0.** v2 첫 응답의 서비스 등급 검사 중단 후, 한 필드 수정만으로 다시 유료 실행을 제안하지 않고 공식 응답 규격 전체와 부분 결과 보존 방식을 검토했다. 권장 Sol/High, 실제 턴 설정은 별도 변경하지 않았다. 새 active approval/실제 journal을 만들지 않았고 CLI는 기본 모드도 실행하지 않았다. root 검토 전 새 실행 승인 질문을 제시하지 않는다.

[이전 v1 실제 중단](REVIEW_PRECHECK_E6_PAID_EIGHT_ACTUAL_20261019.ko.md)과 [v2 실제 중단](REVIEW_PRECHECK_E6_USAGE_V2_ACTUAL_20261019.ko.md)을 그대로 보존한다. 누적 실제 fetch2/HTTP2xx2/count0/채점0이며 이전 응답 본문과 v2 등급 문자열은 미보존이다. 새 fixture는 과거 응답의 재구성/캡처가 아니다. 과거 실패를 소급 성공/채점으로 바꾸거나 원장·spent를 초기화하지 않는다.

## 검토한 규격과 결정

근거는 [REST GenerateContentResponse](https://ai.google.dev/api/generate-content#GenerateContentResponse), [UsageMetadata](https://ai.google.dev/api/generate-content#UsageMetadata), [ServiceTier](https://ai.google.dev/api/generate-content#ServiceTier), [Candidate](https://ai.google.dev/api/generate-content#Candidate), [Part](https://ai.google.dev/api/generate-content#Part) 및 [ProtoJSON의 optional/null 규칙](https://protobuf.dev/programming-guides/json/#null-values)이다. **SDK 클래스/enum 이름을 REST wire 표기로 전용하지 않았다.** v2의 대문자 STANDARD mock을 공식 응답처럼 취급한 검토 누락은 인정하며 원인 기록을 보존한다.

기계 검토표 `e6-wire-evidence-v3.json`은 14개 행으로 모든 사용 guard와 응답의 선택 필드를 연결한다. `e6-rest-wire-fixture-v3.json`은 **공식 표기를 사용한 합성 값**이며 provider 실제 캡처/품질 근거가 아니다. 이 두 파일, 기존 usage 정의 근거, 새 해석 코드의 지문을 plan/policy에 결합했다.

| 대상 | v3 판단 |
| --- | --- |
| serviceTier | 소문자 standard·문서상 기본 unspecified·미보고만 Standard 가정 후보. flex/priority/숫자/알 수 없는 값은 후속 중단. 실제 결제 인증으로 표시하지 않음 |
| 필수 사용량·합계 | prompt/candidate/total의 안전한 비음수 JSON 정수 요구. 누락/음수/소수/overflow/잘못된 합계는 비용 N/A·후속 중단. JSON 숫자 문자열은 이번 좁은 진단 정책에서 거부 |
| thoughts | 누락/null 그대로 보존. 유효 total−prompt는 파생 결합 생성량 상한. 명시 thoughts는 residual과 대조. 개별 thinking 실측으로 승격하지 않음 |
| modality·tool/cache | TEXT 대문자, 유효 상세 합계. 선택 상세의 null/빈 배열과 TEXT-zero tool/cache 상세 허용. 양수 tool/cache·비텍스트·불명 상세는 후속 중단 |
| 완료·안전·본문 | STOP 대문자, 단일 candidate, optional role의 model/미보고, 차단되지 않은 text parts만 채점. truncate/차단/도구·미디어 혼합/thought 본문은 채점 불가 |
| 선택 부가정보 | thoughtSignature·partMetadata·speechMetadata·비디오가 아닌 Part의 mediaProcessing·citationMetadata·responseId·modelStatus·로그확률/종료설명은 소비하거나 보존하지 않음. 인용 표시를 검색 실행/원문 증거로 취급하지 않음 |
| grounding·URL 선택 필드 | 알려진 빈 컨테이너/default 문자열은 허용. 실제 검색/검색결과/URL/Maps 지표나 모르는 필드는 후속 중단. media/audio/video annotation도 빈 객체만 비용 해석에 허용. 채워진 표시는 후속 중단하되 유효 본문 채점 보존. 일반적인 재귀 빈값 추측은 사용하지 않음 |
| 앞으로 추가될 미지 필드 | 알려진 비과금 annotation은 무시하지만 미지 response/candidate/usage 필드는 요금/범위를 추정하지 않고 후속 중단. 유효 본문 채점과 별개 |

이것은 모든 ProtoJSON 표현을 허용하는 범용 parser가 아니라 고정 GenerateContent 텍스트 진단의 읽기 정책이다. 알려진 비과금 부가정보를 버릴 때 그 내부 enum/type의 유효성이나 외부 사실을 인증하지 않는다. signature/URI/metadata를 후속 요청에 되돌려 보내거나 URL을 열지 않는다. 미보고를 provider가 명시한0으로 만들지 않는다.

## 이미 받은 본문과 다음 유료 호출을 분리

응답 수신 후 원문은 메모리에서만 처리하며, 모델/단일 candidate/완료·안전·텍스트/엄격한 topic schema를 통과하면 기존 원문 grounding 채점기로 검사한다. provider citation URI나 외부 grounding은 증거로 사용하지 않는다. 결과에는 원문/quote 대신 response hash·정답 상태 수·원문 근거 성공 수·false hold 집계만 남긴다.

**사용량/서비스 등급 검사가 실패해도 유효한 이미 받은 텍스트의 부분 채점은 남기고 다음 dispatch를 중단한다.** 응답을 다시 요청하거나 원시 응답을 디스크에 저장하는 기능이 아니다. 반대로 본문 JSON/완료 검사가 실패해도 사용량을 안전하게 해석할 수 있으면 조건부 비용 부분액은 보존하고 후속 중단한다. timeout/HTTP 실패처럼 본문을 얻지 못한 경우는 채점0·비용 N/A다.

`PARTIAL_STOPPED`는 전체8건 완료가 아니다. plannedCases/scorableCases/scoredTopics·정답 상태 수/분모·grounding검사 분모·평가된 정상 대조군·NOT_RUN을 명시한다. falseHoldTopics는 보류된 정상 topic 수이고 분모는 assessedNormalControlTopics(평가된 정상 사례의 scoredTopics 합계)다. falseHoldCases는 보류 topic이 하나 이상인 정상 사례 수이고 분모는 assessedNormalControls다. 정상1건의3topic 중2topic이 보류되면 topics2/분모3, cases1/분모1로 구분한다. 정상 대조군 평가0건이면 두 false hold 집계는 null, 두 분모는0이며 정확도도 채점 topic이0이면 null이다. 비용은 `knownCompletedUsageEstimateNanoUsd`(알려진 부분)와 `unknownUsageReservedCalls`를 구분한다. 실패한 사례의 비용을0으로 만들지 않는다. 합성 gold 재생 PASS/부분 정확도1도 모델 품질 실측이나 자격/지급 권한이 아니다.

## 고정된 요청·비용·실행 경계

기존 공개 합성 Python8건·gold·provider body·모델 `gemini-3.5-flash-lite`/MINIMAL·기존 key-source를 그대로 사용한다. 실제 Moodle/HackerRank 자료·이미지0, 생성최대8/count0/retry·continuation·키/모델/무료 대체0이다. 최소60초 간격·45초 timeout·본문2048/전체8192 UTF-8바이트·maxOutputTokens1024 설정을 유지한다. provider에는 gold/정답을 보내지 않는다.

입력3000/건·결합 생성1024/건 및 Standard 입력US$0.30/백만·출력(thinking 포함)US$2.50/백만 가정의 추가8건 시나리오는 US$0.02768다. 실행일 [공식 가격](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite)을 다시 확인해야 하며 실제 등급/결제 계정/청구 인증을 대체하지 않는다. **US$0.05의 확정 cash cap은 없고 이미 시작한 호출은 이를 넘을 수 있다.** 관측 입력>3000/파생 결합 생성>1024/누적 추정≥US$0.05면 현재 유효 부분 채점을 남기고 이후 중단한다. paymentAuthority/usableForAcceptance/paymentAllowed=false다.

새 scope `E6_PAID_WIRE_V3_FRESH_EIGHT`, 새 승인 버전 `clear-e6-paid-wire-v3-user-approval.3`, 새 직접 승인 종류 `DIRECT_HUMAN_NEW_PAID_WIRE_V3_FRESH_EIGHT`다. 최종 clean codeHead·plan/corpus/gold/request/policy 지문·실행일·가격 검토·직접 인간 승인 증거를 결합하며 v1/v2/boolean 승인은 거부한다. 공개 template의 실행 승인 값은 null이다. 기존 키가 사용 가능함은 이미 확인됐으므로 연결 여부나 키 값을 다시 묻지 않는다.

새 승인 경로 `private/e6-python-paid-wire-v3/approval.json`, 새 단회 원장 경로 `artifacts/e6-python-paid-wire-v3-run/`은 아직 사용하지 않았다. 배타 wx lock·fsync·사전 영속 예약·원자 checkpoint·lease 소유권·강제종료 표식 보존을 유지한다. 가짜 reader/임시 원장 시험 외에는 키 source를 읽지 않았다.

planHash는 `0x29be00a2f5c79a757b41bf0e7f41c278c5ed403b9f4fb5aea4e50c1cf8d12bfb`, usagePolicyHash는 `0xc7aa9411a5241b533ab79b338736ca798a7b59a0e95ccb25a99cd06234d47902`이며 커밋된 `e6-paid-wire-v3-approval-plan.json`과 일치한다. 최종40자리 HEAD와 함께 Draft PR 완료 보고에 제시한다. root 검토 대기 상태이며 이 문서에 새 유료 실행 승인 질문을 넣지 않는다.

## 오프라인 검증

공식 표기의 합성 응답8/count0·60초 간격·안전한 빈/기본 metadata·인용과 원문 evidence 분리, priority/flex/불명/잘못된 total/nontext/tools의 후속 중단과 부분 채점 보존, 불완전 JSON의 알려진 비용 보존, 현재 응답의 비용 초과 뒤 중단, 승인/head/day/지문 변조·checkpoint/timeout/늦은 응답·원장 배타/단회/강제종료를 네트워크 차단 상태에서 검사했다. 기존 두 실제 실패 파일은 수정하지 않았다. 담당 tests/ai-review-precheck는 root CI 밖이므로 로컬 합성 검증과 원격 CI를 구분한다. 이전 준비 HEAD의 신규27개 포함 관련 로컬321/321과 원본·legacy191개 지문 검사는 보존한다. 이후 보고 단위 수정에서는 정상1건의2topic 보류 반례를 추가하고 관련 v3 검사28/28을 통과했다. legacy scorer·wire 정책·호출 판단은 변경하지 않았다. 실제 모델 품질은 여전히 N/A다. 최종 HEAD의 공개 이력 검사·원격 CI는 PR 완료 보고를 따른다.
