# Gemini v3 실제 소규모 재평가 — 2026-10-15

이번 결과는 `gemini-3.5-flash-lite` / `clear-gemini-eval.3`의 **ACTUAL 합성 텍스트** 평가다. 정상 대조군 T01과 점수 충돌 T04를 사용했다. 기존 mock 7건, 이전 텍스트 4·이미지 8건 파일럿, 별도 3.8 비교 결과와 분모를 합치지 않는다. [실제 응답·누적 사용 기록](gemini-v3-reevaluation.json)을 보존한다.

## 승인·사용·비용

사용자는 US$0.03 안에서 생성·사전계수 각각 2회를 승인한 뒤, HTTP 오류 진단·수정 후 **각각 추가 3회**를 명시 승인했다. 최초 두 번의 입력 상한은 8,000·출력 상한은 2,048 토큰이었다. 추가 세 번은 입력 2,000·출력 1,024 토큰으로 축소했다. 누적 생성 5회·사전계수 5회를 모두 사용했으며 자동 재시도는 없다. 이전 승인/ledger를 초기화하거나 새 한도로 간주하지 않았다. 추가 유료 호출은 승인되지 않았다.

| 항목 | 결과 |
| --- | --- |
| 누적 보수적 생성 예약 | US$0.02452 / 승인 US$0.03 |
| 모델 응답 | 2건; 나머지 3건은 HTTP 오류 |
| 성공 응답에서 확인한 토큰 | T01 입력 225·출력 161, T04 입력 239·출력 252 |
| 위 두 응답의 부분 비용 추정 | US$0.0011717 |
| 실제 전체 청구액 | 미확인; 실패 3건 usage가 없고 thinking 항목도 별도 제공되지 않음 |
| 별도 읽기 전용 모델 metadata GET | 1회, HTTP 200; 생성/사전계수 호출 아님 |

비용 추정은 입력 US$0.30·출력 US$2.50/백만 토큰의 Standard 요금을 사용했다. 출력 과금에는 thinking이 포함된다. 사전계수 과금, 세금·환율·청구 지연을 임의로 0으로 확정하지 않는다. 예약액은 청구 확인값이 아니다. [공식 요금](https://ai.google.dev/gemini-api/docs/pricing), [모델 문서](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)

## 오류와 실제 응답

앞선 JSON Schema 인코딩 3건은 모델 출력을 받기 전에 실패했다. 첫 요청의 HTTP 상태는 당시 보존하지 못했고, 다음 두 건은 HTTP 400이었다. 세 번째는 `INVALID_ARGUMENT`이었다. 원문 오류 메시지·프로젝트 식별자는 출력하거나 보존하지 않고, 상태와 고정 허용 진단 범주만 남긴다.

공식 OpenAPI Schema 형식의 `responseSchema`로 전송한 다음 두 건은 응답을 받았다. wire schema는 nullable·대문자 타입·문자열 enum을 사용하며, boolean enum·배열 길이·추가 필드 제한 등 더 엄격한 조건은 로컬 검증에서 계속 적용한다. `paymentAllowed:true`나 추가 필드가 허용되는 제품 경계로 바뀌지 않았다. 이 비교만으로 앞선 HTTP 400을 특정 단일 schema 키의 문제로 확정할 수는 없다. [구조화 출력](https://ai.google.dev/gemini-api/docs/structured-output), [공식 SDK schema 설명](https://googleapis.github.io/python-genai/genai.html)

| 사례 | raw 필드값 | 질문·flag 및 후처리 | 판정 |
| --- | --- | --- | --- |
| T01 정상 대조군 | 700 / 80 / 14, gold 일치 | 불필요한 score 질문과 전역 `INJECTED_INSTRUCTIONS` flag로 세 필드 모두 null/NEEDS_REVIEW | **과잉 보류 미해결**, 후처리 필드 gold 실패 |
| T04 상충 점수·예치 미결 | score=null, depositMultiplier=null | 점수 conflict·예치 질문·전역 flag, null 유지 | 필드 gold 통과, 지급/정책 확정 불가 |

raw 평가의 2/2는 **필드값 및 필수 질문 검사**만의 수치다. 예상 밖 질문/flag를 벌점 처리한 종합 품질 점수가 아니다. 후처리 필드 gold는 1/2이며, T01의 불필요한 신호를 별도 `normalSignalAdjudication`에 기록했다. 오류를 숨기려고 flag를 무시하거나 gold를 null로 바꾸지 않았다. 충돌을 모델이 탐지하지 못한 경우까지 결정적 후처리가 발견한다는 보장은 없다. 두 영어 합성 텍스트로 Vision·한국어·실제 서류 성능을 추정하지 않는다.

## 키·데이터 경계

고정 Google Gemini Developer API HTTPS 호스트에 기존 실행 환경의 `GEMINI_API_KEY`를 헤더로만 사용했다. 키 값은 채팅·로그·Git·명령줄 인자로 요청하거나 출력하지 않았다. metadata HTTP 200과 생성 성공은 **이 키의 프로젝트가 사용자가 충전한 선불 계정이라는 증거가 아니다**. AI Studio에서 해당 키의 프로젝트와 Billing 선불 프로젝트 일치를 사용자가 확인해야 하며, 코드가 결제 계정을 조회·변경하지 않았다. Vertex AI/ADC는 사용하지 않았다. [결제](https://ai.google.dev/gemini-api/docs/billing), [API 키](https://ai.google.dev/gemini-api/docs/api-key)

이번 전송은 renderer로 만든 새 합성 텍스트 T01/T04뿐이다. 실제 성적표·개인정보·쿠키·Reclaim 원본이나 이미지는 전송하지 않았다. Paid 기본 조건은 입력/출력을 제품 개선에 이용하지 않지만 악용 감시 데이터의 55일 보존과 검토 가능성이 있다. Contributor/프로젝트 공유 설정은 확인되지 않았으며 Contributor 프로그램을 활성화하지 않았다. 무보존을 보장하지 않는다. [약관](https://ai.google.dev/gemini-api/terms), [악용 감시](https://ai.google.dev/gemini-api/docs/usage-policies), [로그 정책](https://ai.google.dev/gemini-api/docs/logs-policy)

## 실행 원장과 재현

`evaluation-ledger.mjs`의 배타적 `execution.lock`은 **잔여 한도를 읽기 전에** 획득한다. checkpoint는 같은 디렉터리 임시 파일 쓰기/fsync→rename→디렉터리 fsync로 교체하고, 성공한 뒤에만 count/generate를 전송한다. 실패·불확실한 요청 예약은 되돌리지 않는다. 다른 resume 프로세스는 차단한다. 강제 종료 후 lock은 자동 PID 판정으로 삭제하지 않고 원장·기존 프로세스의 명시적 오프라인 확인을 요구한다. 이것은 로컬 CLI의 실수 방지이며, 사용자가 코드를 바꾸는 것까지 막는 서비스 과금 상한은 아니다.

새 실행 기록은 Git 제외 `artifacts/gemini-v3-retest-20261015/`에 있고 이전 기록은 유지한다. 실제 재실행 옵션은 새 승인 없이 사용하지 않는다. 아래 명령은 네트워크 없는 회귀와 DRY_RUN만 수행한다.

```sh
./tools/node --test tests/ai-policy/gemini-evaluation.test.mjs tests/ai-policy/evaluation-ledger.test.mjs tests/ai-policy/field-review.test.mjs
./tools/node tests/ai-policy/reevaluate-gemini-v3.mjs
./tools/node tests/ai-policy/inspect-gemini-access.mjs
```

동시 두 프로세스의 단일 잔여 호출 경쟁, 강제 종료 후 자동 복구 금지, checkpoint 실패 후 dispatch 금지, 실제 v3 응답의 과잉 보류 재현을 합성 회귀로 검사했다. 평가 전용 ACTUAL 연결은 제품의 MOCK 전용 observer와 분리되며 Evidence·자동 자격·지급 권한을 만들지 않는다. 예치 정책 OPEN, 400% 사전검토만/500% 제외, 원천·동일인 미확인 보류, grant/outbox HOLD·독립 claim NO-GO를 유지한다.
