# 결제 복구 후 Gemini 실제 재평가 — 2026-10-15

사용자가 기존 키·프로젝트의 결제 복구와 Tier 1을 확인했고, 조정 세션에서 기존 환경 키의 일치와 실제 생성 HTTP 200을 확인한 뒤 이 재평가를 명시 위임했다. 키를 새로 복사·저장·전달하지 않고 기존 `developerTransport`의 고정 Google HTTPS 헤더 경로를 사용했다. 계정·프로젝트·결제 식별자와 키 값은 이 보고서/Git에 포함하지 않는다. 이후 선불 잔액·실제 청구액은 별도로 확인하지 않았다.

## 새 승인과 결과

이번 승인은 **생성 최대 5회·countTokens 최대 5회, 비용 예약 US$0.03**이다. 이전 소진된 승인이나 원장을 초기화하지 않았다. 별도 `artifacts/gemini-recovery-eval-20261015/`에 corpus/gold hash와 누적 원장을 저장했다. 이번 5회에 자동 재시도는 없으며 모두 소진했다. 조정 세션의 별도 연결시험 생성 1회(HTTP 200, exact OK 불일치)는 아래 평가 5회와 구분한다. 선불 잔액 전체를 사용하도록 승인된 것이 아니다.

모델은 공식 stable `gemini-3.5-flash-lite`, MINIMAL, 출력 최대 1,024 토큰이다. 2026-10-15 공식 Standard 요금은 입력 US$0.30·출력 US$2.50/백만 토큰이고 출력에는 thinking이 포함된다. 실행기는 날짜/모델/가격 프로필이 다르면 호출 전에 차단한다. [모델](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [요금](https://ai.google.dev/gemini-api/docs/pricing)

| 단계 | 실제 입력/사례 | raw와 후처리 비교 |
| --- | --- | --- |
| baseline v3 | T01 합성 텍스트 정상 대조군 | 700/80/14 추출은 맞지만 자격 질문과 전역 SYNTHETIC_DATA flag 생성, 후처리 세 값 null. 과잉 보류 재현 |
| baseline v3 | T04 합성 텍스트 충돌/예치 미결/주입 | 점수·예치 null, 질문/충돌·주입 flag 유지. gold 통과 |
| revised v4 | 같은 T01 텍스트 | 질문/flag 없음, 700/80/14 유지. gold 통과 |
| revised v4 | 같은 T04 텍스트 | 두 값 null, 충돌/미결 질문과 전역 주입 flag 유지. gold 통과 |
| revised v4 | 기존 V02 합성 PNG, 실제 inline 이미지 전송 | PERSON_A 관찰 유지, 없는 score만 null/NEEDS_REVIEW. gold 통과 |

HTTP 성공은 **생성 5·사전계수 5**, HTTP 오류 0이다. 평가 시도 5회/서로 다른 사례 3개이며 텍스트 4회·Vision 이미지 1회다. v4 gold는 **3/3**이지만 서로 다른 텍스트 2개와 누락 필드 이미지 1개에 대한 작은 비교다. 반복 측정·한국어/실제 서류·흐림 OCR/진위·저자·전체 이력·자격 성능을 입증하지 않는다. T01 과잉 보류가 이번 비교에서 없어졌다는 범위만 보고하며 일반적으로 해결됐다고 단정하지 않는다.

## 원인 분리와 작은 수정

v3 T01의 raw 숫자는 정확했다. 모델이 생성한 불필요한 질문/전역 flag가 결정적 후처리에 들어가면서 null로 바뀌었다. 후처리는 정책대로 동작했으므로 질문/flag를 결과에서 삭제하거나 무시하도록 바꾸지 않았다.

v4는 **추출할 규칙 임계값과 사용자의 조건 충족 판단**을 구분하고, 합성 표식 자체는 provenance이며 추출 오류가 아니라는 점을 명시한다. 진위·작성자·완전성은 여전히 UNVERIFIED다. renderer가 추가한 정확한 고정 표식/작업 suffix만 분리해 sourceText를 JSON 문자열로 전송한다. 원문 내부의 지시문은 남기고 신뢰하지 않으며, 알 수 없는 scaffold는 원문 그대로 보존한다. 변환과 지시문 보완을 함께 바꿨으므로 두 요소 중 어느 하나의 단독 효과라고 주장하지 않는다.

기존 conflict/missing/null·필드 허용 목록·unknown/global scope 보류·authority/payment false·출력 스키마·Evidence 차단은 유지한다. 모델이 신호 없이 오류를 반환하는 미탐지까지 후처리가 발견한다는 보장은 없다. 평가 전용 v4는 제품의 MOCK observer와 별도이며 실제 동의·운영 Evidence 수락을 연결하지 않는다.

## 비용과 데이터

텍스트 입력 상한 2,000·이미지 입력 상한 3,000, 출력 1,024 토큰으로 생성 전 예약했다. 총 **보수적 생성 예약 US$0.01610**, 성공 5개 응답의 토큰 기준 추정은 **US$0.0029573**이다. `tokenUsageComplete=true`는 보고된 prompt/candidate/thinking/total 합계가 일치한다는 뜻이며 실청구 확인이 아니다. count 요청 요금·세금·환율·결제 지연·이후 잔액은 확정하지 않는다. 실패/불확실 요청도 예약을 유지하는 경계는 그대로다.

원문은 기존 합성 텍스트와 로컬 renderer가 생성한 합성 PNG만 사용했다. 실제 성적표·개인정보·쿠키·Reclaim 원본은 전송하지 않았다. Vision은 실제 API에 PNG를 보냈다는 뜻이며 실제 학생 문서를 뜻하지 않는다. Paid 기본 조건 및 악용 감시 보존·Contributor 설정의 한계는 [기존 데이터 조건 기록](GEMINI_EVALUATION.ko.md)을 따른다. 데이터 이용/무보존을 추가로 보장하지 않는다.

## 검증·재현

[원시 관찰·질문·flag·후처리·usage 공개 기록](gemini-recovery-evaluation.json)은 비밀과 이미지 base64를 제외했다. [이전 v3 HTTP 실패/결과](GEMINI_V3_REEVALUATION.ko.md)는 과거 기록으로 보존한다. 새 품질 비교는 정상 자료에 불필요한 질문/flag도 오류로 세며, raw 숫자만 맞았다고 PASS로 표시하지 않는다.

```sh
./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/ai-policy/*.test.mjs tests/document-precheck/*.test.mjs
./tools/node tests/ai-policy/evaluate-gemini-recovery.mjs
```

기본 CLI는 자료/키를 읽지 않는 DRY_RUN이다. 실제 실행 옵션은 이 승인에만 대응하며 이미 소진되었다. 새 승인 없이 원장/lock을 지우거나 실행하지 않는다. 실행 phase는 dispatch 전에 checkpoint하고 같은 phase의 재실행을 거부한다. 배타 lease·원자 checkpoint·호출/예산 guard는 기존 모듈을 재사용한다. CI의 test glob은 네트워크 없는 gold/저장 응답 재생만 포함하고 실제 실행 CLI나 키를 포함하지 않는다.

예치 정책 OPEN, 400% 자동 자격·지급 금지, 500% 제외, 원천/동일인 미확인 보류, grant/outbox HOLD·독립 claim NO-GO를 유지한다. 신규 PR은 develop 대상 Draft이며 병합 승인은 이번 요청에 포함되지 않는다.
