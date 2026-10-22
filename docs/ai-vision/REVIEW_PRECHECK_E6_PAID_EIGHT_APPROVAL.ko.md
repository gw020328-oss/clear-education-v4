# E6 기존 유료 키·고정 생성8회 평가 준비안

**PREPARED / NOT_APPROVED / ACTUAL_CALLS=0 / MODEL_QUALITY=N/A.** 사용자의 “내가 결제 해둔 유료 api 키 사용하면 안되나?”는 기존 키 사용 희망이며 이8건의 실제 전송/키 읽기 승인은 아직 아니다. 무료 프로젝트나 새 키 생성을 요구하지 않는다. 기존 PR94/74db9d1, PR86/e9ea454 및 소진된 승인/원장을 보존하고 새 버전/승인/원장을 분리했다. 이번에는 실제 CLI도 실행하지 않았고 실제 키 값·존재·보안 경로/.env·과거 원장을 조회하지 않았다. 권장/요청은 Sol/High이며 현재 턴 설정을 별도 전환하지 않았다.

## 한 번에 검토할 정확한 범위

기존 공개 합성 Python 회고8건과 gold를 그대로 사용한다. 정상·문제없음+점검·부정적 의견·학습 누락·모호함·충돌·문서 명령·원본 HTML/entity이며 [8사례 기대 기준표](REVIEW_PRECHECK_E6_FREE_APPROVAL.ko.md#승인-대상과-기대-기준)와 동일하다. gold는 정책 기반 합성 기대값/인간 검토 대기이며 독립 holdout이 아니다. 실제 Moodle/HackerRank 사용자 자료·계정·이미지·성적·증명은 포함하지 않는다. provider에는 gold/기대 state/사례 목적/정답을 보내지 않는다.

- Gemini **Developer API Paid Standard `gemini-3.5-flash-lite` / MINIMAL**, 고정 사례당 generateContent1회, **생성최대8/countTokens0**이다. 모델 목록/별도 연결시험0, retry/continuation/다른 모델/다른 키 source/무료 fallback0이다. 검색·도구·명시 캐시·파일 API·Batch·Vertex·Interactions는 사용하지 않는다. [공식 stable 모델](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)
- Free 준비안의 안전한 provider body를 그대로 재사용한다. temperature/candidateCount 제거, 본문2,048/전체 요청8,192 UTF-8바이트 이하, 현재 최대453/2,467바이트, 정확한 body SHA256 고정이다. paid request manifest만 별도 namespace/version이다. 입력3,000토큰은 원격 측정/검증 상한이 아니다.
- maxOutputTokens1024는 요청 설정이며 exact endpoint의 thinking 결합 cash cap VERIFIED가 아니다. 무료 조건을 true로 바꾸거나 다른 모델/endpoint의 설명을 이 모델 보증으로 전용하지 않는다. count0이므로 countTokens 단가 확인은 이번 실행 전제가 아니다.

## 비용 가정과 중단 조건

2026-10-19 [공식 Standard 가격](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite)은 입력 **US$0.30/백만**, 출력(thinking 포함) **US$2.50/백만 토큰**이다. 입력3,000/건·thinking 포함 생성1,024/건을 산정 가정으로 놓으면 다음과 같다.

`(8×3000×0.30 + 8×1024×2.50) / 1000000 = US$0.02768`

**이는 조건부 추정치이며 US$0.05 또는 다른 금액의 provider 확정 cash cap이 아니다.** 입력 token 수와 thinking 결합 상한은 확정되지 않았다. 실제 사용량·프로젝트 과금·청구서·세금/환율/잔액도 확인하지 않았다. 이미 시작한 호출은 추정치나 US$0.05를 넘을 수 있다. 이 가능성을 수락할 수 없다면 이 준비안으로 실행하지 않고 기존 hard-cap 차단을 유지해야 한다.

다음 조건으로 **후속 dispatch를 중단**한다. 이 조건들은 현재 호출의 초과 청구를 미리 막거나 취소하지 않는다.

| 조건 | 처리 |
| --- | --- |
| 전체8회 예약 또는 key/model/count scope 이탈 | 추가 호출 없음 |
| 요청당45초 timeout, 429/HTTP 오류, 키 없음, 불완전 JSON/모델 불일치 | 즉시 종료, 재시도/대체 없음 |
| prompt/candidate/thinking/total 사용량 누락·잘못된 합계 | null/N/A, 정확 토큰·비용으로 가장하지 않고 종료 |
| 응답의 prompt >3,000 또는 thinking+candidate >1,024 | 산정 가정 초과로 후속 중단; 사전 상한 보증 아님 |
| 알려진 응답 토큰의 누적 가격 추정 ≥US$0.05 | 후속 중단; 해당 응답 시점에 이미 초과 가능 |
| head/clean/실행일/승인 record 변경, checkpoint 실패, clock 역행 | 추가 전송 차단 |

순차 최소60초 간격으로 호출한다. 프로젝트 quota·capacity나8건 완료를 보장하지 않는다. 모든 호출 전 횟수를 먼저 영속 예약하고, 실패/UNKNOWN도 사용한 단회 실행으로 남긴다. 남은 사례는 NOT_RUN이며 자동 resume/새 원장 선택/표식 삭제로 되살리지 않는다. 사후 토큰 기반 가격 계산은 `knownCompletedUsageEstimateNanoUsd`로 표시하고 청구액으로 부르지 않는다. 오류/timeout의 미관측 비용은 N/A다. 예약 횟수와 실제 성공 횟수도 구분한다.

## 기존 키 연결 방법 — 새 키 불필요

비밀값 없는 기존 소스 `src/ai-policy/gemini-evaluation.mjs:53`와 공개 연결 문서를 검토했다. 지원하는 기존 provider는 **실행 환경의 `GEMINI_API_KEY` → 고정 Google HTTPS의 x-goog-api-key 헤더**다. `.env` 자동 로드나 파일 검색, Vertex/ADC, Free 전용 credential 파일은 사용하지 않는다. 이 사실은 설정 코드의 지원 방식이며 현재 키가 존재/유효하거나 원하는 결제 프로젝트에 연결됐다는 실측이 아니다.

새 key-source ID는 `clear-e6-existing-server-gemini-env.1`로 고정했다. 새 `e6-paid-eight-source.mjs`는 이 source를 **명시적으로 선택**하고, 승인·지문·head·사전 checkpoint를 통과한 실제 generateContent 요청 안에서만 기존 환경값을 읽는다. 자동 환경 탐색/fallback과 구분되며 다른 source/model/count 요청은 reader 전에 거부한다. 생성자/import/기본 차단 상태는 키 존재도 검사하지 않는다. 기존 공유 키 보관/주입 방식을 바꾸거나 새 파일에 복사하지 않는다.

새 승인 후에는 **이미 기존 보안 설정이 주입되는 동일 서버/로컬 실행 환경**에서 CLI를 시작하는 방법을 사용한다. 이 평가 프로세스가 그 환경값을 상속받는지는 현재 N/A이며 승인 전 확인하지 않는다. 값이 전달되지 않으면 GEMINI_KEY_MISSING으로 중단하고 파일/다른 키를 찾지 않는다. 연결이 필요하면 기존 비밀관리자의 프로세스 환경 주입을 재사용해야 하며 키를 채팅·명령줄 인자·로그·fixture에 넣지 않는다. 사용자에게 새 키/무료 프로젝트를 만들도록 요구하지 않는다.

## 새 승인·실행 경계

새 private approval은 `private/e6-python-paid-eight-v1/approval.json`(폴더0700/파일0600)이다. 기존 paid/Free 승인 파일이나 credential을 읽지 않는다. 공개 `e6-paid-eight-control-template.json`은 핵심 값 null인 차단 양식이다. 사용자 새 답변 전 active approval을 생성하지 않는다.

`clear-e6-paid-eight-user-approval.1` / scope `E6_EXISTING_PAID_KEY_EIGHT_GENERATIONS`, authorization.kind `DIRECT_HUMAN_NEW_PAID_EIGHT_E6`와 직접 인간 승인 증거 SHA256, 최종40자리 codeHead/plan/corpus/gold/requests pins·실행일·기존 key-source·추정 비용/초과 가능성 수락 문구를 요구한다. boolean-only/구 승인/Free scope/US$0.05 hard-cap 주장/추가 Free 필드는 거부한다. 실행일의 공식 가격 재검토 기록도 같은 단가와 날짜/근거 hash를 요구한다. 이 공개 가격 검토는 담당자가 수행하며 결제 계정 인증으로 표시하지 않는다. 가격이 달라지면 이 고정 안으로 전송하지 않는다.

새 원장은 `artifacts/e6-python-paid-eight-run.v1/`이며 paid-eight 전용 lease/단회 표식/summary version이다. 배타 wx lock·token 소유권·원자 predispatch checkpoint·fsync를 사용한다. 강제 종료는 lock까지 남기고 자동 복구하지 않는다. 원문/quote/gold문장/raw model response/HTTP raw·provider error 원문/키·프로젝트 ID는 결과에 저장하지 않는다. usage·집계·고정 오류코드·해시와 조건부 가격 계산만 남긴다. 기존 P0 grounding 채점기와 false authority gates를 유지하며 paymentAuthority/usableForAcceptance/paymentAllowed=false다.

| 지문 | 값 |
| --- | --- |
| 새 paid-eight planHash | `0xf1d965041da451b13252e3e7b9b3d1255e12a8d7e10170361bbe3eea7ba879d9` |
| 새 request manifest SHA256 | `9cf184cbecacebf7e3fd8aef52b6b0fb172eb728da96b1c0631cd944692d9685` |
| 보존 corpus SHA256 | `1a304a596a15fedcda846ed721b87d0a6daa418fa019ecebe2f55443e7a8b951` |
| 보존 gold SHA256 | `4f13f00b884d9360e6526fac2e80147466bfd17c8410509a18f6f72cd825e83a` |

실행 승인은 이 PR의 최종 codeHead 전체40자리를 결합한다. 코드/계획 변경 뒤 옛 승인을 자동 승계하지 않는다. 아래 실제 명령은 **새 사용자 승인 후 별도 실행 단위에서만** 사용하며 이번에는 기본 모드도 실행하지 않았다.

```sh
PATH=/Users/ohgyuwon/Documents/ChatGPT/블록체인/workspaces/clear-education-v4/.toolchain/node-v24.21.0-darwin-arm64/bin:$PATH ./tools/node tests/ai-review-precheck/run-e6-paid-eight.mjs --execute-new-paid-eight-approval
```

## 단 한 번 제시할 실행 승인 질문

“최종 codeHead와 위 planHash에 고정된 공개 합성 Python 텍스트8건을 기존 보안 설정의 유료 GEMINI_API_KEY로 평가하도록 새로 승인하시나요? 범위는 gemini-3.5-flash-lite/MINIMAL, 생성최대8·count0, 재시도/continuation/다른 키·모델·무료 fallback0입니다. 산정 가정의 추정액은 US$0.02768이며 **US$0.05의 확정 cash cap은 없고 이미 시작한 호출은 이를 넘을 수 있음**을 수락하는 평가안입니다. 오류·usage 불명·관측 가정 초과·누적 추정 US$0.05 도달 시 이후 호출은 중단합니다. 승인 후에만 기존 key-source를 읽고 전송하며 실제 Moodle/HackerRank 자료는 포함하지 않습니다. 키 값은 보내지 마세요.”

사용자가 확정 하드 상한만 허용한다면 이 질문에 대한 조건부 승인을 실행 허용으로 해석하지 않는다. 아직 실제 실행 승인/키 읽기 허용은 받지 않았으며, 이번 문서는 구체적인 검토 준비다.

## 오프라인 검증

새 guard는 승인 부재·Free/구 paid/하드-cap scope 혼용·fake ACTUAL 증거·가격 검토 누락/변조·head/day/요청/gold 변조·reader 전 차단·count0/최대8/pacing·checkpoint 실패·429/키없음/timeout/늦은 응답·usage N/A·관측 비용 이미 초과·후속 중단·raw 미저장·원장 배타/단회/강제 종료를 검사한다. injected key reader/가짜 HTTPS·임시 합성 원장만 사용했고 실제 환경값·private 경로를 조회하지 않았다. gold 재생 PASS는 모델 품질이 아니다. 신규18개와 전체 회귀/보존/공개scan/정확 HEAD CI 결과는 PR 완료 보고를 따른다. 담당 tests/ai-review-precheck glob은 기존 root CI 밖이며 로컬 검사와 구분한다.
