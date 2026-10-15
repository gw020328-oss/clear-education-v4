# Gemini 합성 파일럿 — 2026-10-15

기존 M1 소비자 구현은 Draft PR #47이며 CI 6개가 통과했다. 이번 변경은 별도의 평가 전용 REST 연결이다. 기존 `proposePolicy` / `precheckObservation`의 MOCK 제한과 DocumentPrecheck 계약은 유지한다. 실제 모델 출력을 Evidence·지급 결정으로 변환하지 않는다. 일반 구현의 선택 기준은 Sol / Medium이며 설정 안내만으로 모델을 변경한 것으로 간주하지 않는다.

## 공급자와 모델

사용자가 AI Studio / Gemini Developer API 선불 잔액임을 확인했다. AI Studio에서 키가 속한 프로젝트와 Billing의 선불 프로젝트가 같은지 확인해야 한다. 계정 프로젝트 연결이나 Contributor 가입 여부를 이 코드가 독립적으로 증명하지는 않는다. Vertex AI의 프로젝트/ADC 인증과 별도 결제 경로로 전환하지 않았다. [결제 안내](https://ai.google.dev/gemini-api/docs/billing), [키 안내](https://ai.google.dev/gemini-api/docs/api-key)

| 정확한 모델 ID | 입력 / 출력 USD·백만 토큰 | 판단 | 동일 12건 최대 토큰 가정 비용 |
| --- | --- | --- | --- |
| `gemini-3.1-flash-lite` | 0.25 / 1.50 | 가장 저렴한 대안 | 0.050864 |
| `gemini-3.5-flash-lite` | 0.30 / 2.50 | 문서 파싱용 우선 파일럿, MINIMAL | 0.078240 |
| `gemini-3.8-flash` | 0.75 / 3.75 | 오류 사례의 상위 비교 후보 | 0.134160 |

2026-10-15 공식 Standard 요금 기준이다. 출력에는 thinking 토큰을 포함하며, 입력 56,000·출력 24,576 토큰 가정을 모델 간에 동일하게 적용했다. 3.8 가격은 2026-12-31까지이며 2027-01-01부터 1.50 / 7.50으로 변경 예정이다. 세 모델의 실측 우열을 주장하지 않는다. 3.5는 텍스트·이미지 입력과 구조화 출력을 지원한다. [요금](https://ai.google.dev/gemini-api/docs/pricing), [3.5 모델](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [모델 목록](https://ai.google.dev/gemini-api/docs/models)

## 승인과 데이터 경계

사용자가 서비스 확인 후 텍스트 4건·이미지 8건, 재시도 포함 생성 최대 14회·사전계수 최대 14회·US$0.25를 승인했다. 키는 환경변수 `GEMINI_API_KEY` 설정 여부만 사전 확인했으며 값은 출력·저장하지 않았다. 요청 시 고정 Google HTTPS 호스트의 헤더로만 읽는다. 키가 없을 때는 셸의 비출력 입력 또는 로컬 비밀 관리자로 환경변수를 설정한다. 채팅·코드·Git·명령줄 인자에 키를 쓰지 않는다. `.env.*`는 Git 제외이지만 이 평가기는 자동으로 읽지 않는다.

Paid 기본 조건은 입력·출력을 제품 개선에 사용하지 않지만, 악용 감시 데이터는 55일 보존하고 의심 활동 검토가 가능하다. 무보존을 보장하지 않는다. Contributor는 데이터 이용 조건이 다르므로 사용하지 않는다. 프로젝트 로그·데이터셋 공유 설정은 조회하거나 변경하지 않았다. 코드에서 Files API·검색·명시적 캐시·로그 공유를 활성화하지 않는다. PNG를 inline으로 보내는 것도 외부 전송이다. 실제 성적표·개인정보·쿠키·Reclaim 원본은 읽거나 전송하지 않았다. [약관](https://ai.google.dev/gemini-api/terms), [악용 감시](https://ai.google.dev/gemini-api/docs/usage-policies), [로그 정책](https://ai.google.dev/gemini-api/docs/logs-policy)

## 구현과 재현

`src/ai-policy/gemini-evaluation.mjs`는 모델별 별도 승인·고정 모델·corpus hash·합성 표식·PNG 형식·입력 한도·예산 예약을 검사한다. 생성 전 사전계수를 수행하고 생성 출력은 2,048 토큰으로 제한한다. 네트워크/HTTP/잘린 응답/스키마/취소는 고정 오류 코드로 처리한다. 자동 재시도·자동 모델 변경은 없다. 취소 후 늦은 성공도 버린다. 실행 도중 각 호출 전 checkpoint를 저장하며 불확실한 생성 예약액은 환불하지 않는다. 이는 로컬 평가용 방어선이며 호출자가 코드를 수정하는 것까지 막는 서비스 차원의 과금 제한은 아니다.

`tests/ai-policy/render-gemini-fixtures.py`는 Pillow로 새 합성 카드 8장을 만들고 텍스트 4건과 별도 gold를 기록한다. 실제 문서나 외부 이미지를 읽지 않는다. macOS Monaco 폰트와 Pillow 버전·폰트/corpus SHA-256을 저장한다. 생성 이미지 전체를 contact sheet로 확인했다. V03은 마스킹된 점수이며 실제 사진의 흐림/회전 OCR 시험이 아니다. V07은 첨부 수를 적은 manifest 카드이며 실제 사진 수/내용 검증이 아니다.

```sh
python3 tests/ai-policy/render-gemini-fixtures.py
./tools/node --test tests/ai-policy/gemini-evaluation.test.mjs
./tools/node tests/ai-policy/evaluate-gemini.mjs
```

기본 실행은 DRY_RUN이며 키를 읽지 않는다. `--execute-approved`는 명시적 유료 실행, `--resume-approved`는 같은 corpus의 누적 잔여 한도만 사용한다. 예산 승인을 새로 받지 않고 lock/result 파일을 지워 재실행하지 않는다. 이번 실행은 한도가 소진되어 추가 실행하지 않는다. 원본 PNG/base64·로컬 ledger는 Git 제외 `artifacts/gemini-pilot/`에 보존하고, 공개 결과는 `gemini-pilot-result.json`으로 분리했다. 이 파일럿은 이전 45개 case spec 전체의 실행 결과가 아니다.

## 실제 결과와 한계

생성 14회·사전계수 14회, 모델 `gemini-3.5-flash-lite`. 초기 T01 2회는 출력 스키마의 boolean 타입 누락 때문에 `paymentAllowed: null`을 거부했다. 첫 응답 원문/usage는 보존하지 못했다. 두 번째 응답으로 원인을 확인하고 boolean/string 타입을 명시하는 회귀 검사를 추가했다. 해당 오류는 모델 품질 오류와 구분한다.

수정 후 텍스트 3/4·이미지 8/8, 총 11/12 gold 통과. T04는 상충하는 700/800 점수에 대해 질문과 conflict flag를 생성했지만 `score: 700`도 반환했다. gold는 `score: null`을 요구하므로 실패다. 지급 권한은 모든 채택 응답에서 false, 진위·작성자·이력 완전성은 UNVERIFIED였다. 이 오류는 운영 적용 전 충돌값 보류가 필요함을 보여 준다. 추출 결과의 위치는 빈 값 여부만 자동 검사했으며 위치 정확성/픽셀 진실성을 입증하지 않는다. 작은 영어 합성 카드 결과를 한국어 실제 서류 성능이나 규정 준수 보장으로 확대하지 않는다.

보수적 생성 예약 합계는 **US$0.09328**, 확인된 12개 응답 usage의 추정 생성 비용 합계는 **US$0.0084506**이다. 초기 2회 usage 누락으로 실제 총액은 확정할 수 없다. 사전계수 요금을 무료라고 단정하지 않았으며 세금·환율·결제 지연·계정 청구 내역은 이 결과에 포함되지 않는다. US$0.25 승인 및 호출 한도 내에서 종료했다.

오류 재현용 추가 비교는 사용자가 별도로 승인한 3.8 Flash의 T04와 정상 대조군 T01 각 1건이다. 생성·사전계수 각각 최대 2회·US$0.05로 독립 집계하며 동일 corpus/gold와 thinking LOW를 사용한다. 3.5 실행 한도를 재사용하지 않는다. 결과는 아래 추가 비교 기록에 남긴다.

기존 MVP·400% 사전검토 범위·500 제외·예치 정책 OPEN·grant/outbox HOLD·독립 청구 NO-GO를 유지한다. 공식 자료 접근/Moodle/Reclaim 및 reviewPlan→policyHash 결합은 미해결이다.

검증: 외부 호출 없는 단위/계약 테스트 174 PASS, M0 3종 PASS, workspace portable/local PASS. mock 테스트 결과와 ACTUAL 평가 결과를 구분한다. 신규 평가 테스트는 전용 명령으로 실행했으며 기존 CI가 이를 자동 포함한다고 주장하지 않는다.


## 추가 비교 결과와 후속 수정

별도 승인된 3.8 비교도 생성 2회·사전계수 2회에서 종료했다. T01은 45초 제한으로 취소되어 채점 불가, T04는 대기 제한을 120초로 늘려 응답을 받았다. T04는 질문/충돌 flag와 함께 score=700을 반환해 동일 gold 실패다. 상위 모델의 개선 근거는 확보하지 못했다. 공개 기록은 `gemini-comparison-result.json`이다. 로컬 연결 수정 중 한 번의 preflight 오류는 외부 호출 0회로 분리 기록했다.

3.8 생성 예약액은 US$0.02736, 응답을 확인한 T04의 추정 비용은 US$0.00054이며 T01 사용량은 알 수 없다. 두 승인 합계 US$0.30 중 생성 예약 합계는 US$0.12064다. 이 예약액은 실제 청구 내역이 아니다. 두 실행 모두 종료했고 추가 호출은 승인 범위에 포함되지 않는다.

실제 평가 지시문 v1은 누락/판독 불가의 null 처리를 명시했지만 충돌값의 null 처리를 명시하지 않았다. 따라서 T04는 원하는 보류 계약과 실제 출력의 불일치이며, 모델 자체만의 오류 원인으로 단정할 수 없다. 최종 코드의 `clear-gemini-eval.2`는 충돌/미해결 필드가 질문/flag와 함께 있어도 반드시 null이어야 한다고 명시한다. 이 지시문 변경은 mock 요청 검사만 통과했으며 실제 Gemini 재평가는 하지 않았다. 운영 연동은 계속 차단한다. 모델을 올리는 것만으로 보류 계약을 대신하지 않는다.

다음 개발은 3.5를 비용 기준선으로 유지하고 v2의 충돌 보류 계약을 평가한 뒤 판단하는 것이다. 새 유료 실행에는 별도 예산 승인이 필요하다.
