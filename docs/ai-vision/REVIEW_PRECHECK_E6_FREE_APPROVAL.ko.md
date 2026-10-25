# E6 Python 회고 Free Tier 평가 — 한 번에 검토할 준비안

**PREPARED / NOT_APPROVED / ACTUAL_CALLS=0 / MODEL_QUALITY=N/A.** 이 문서는 새 무료 실행 승인을 받기 전 검토물이다. 실제 CLI·로컬 credential 준비 도구는 실행하지 않았고 실제 키 존재 확인/읽기·모델 목록·countTokens·generation은 모두0이다. 기존 유료 승인/소진 원장은 열거나 초기화하지 않았다. 공통 API/체인 구현이나 실제 Moodle/HackerRank 자료 평가는 포함하지 않는다.

기존 PR86의 paid runner `e9ea4547d795ee833a8175c02c0cc23b21a7d823`, 기존 planHash `0x75b155c748c05242c2585ca254efcd05c77f3745ce53714367fc72b51fc5d696`와 corpus/gold는 보존했다. 새 브랜치는 `codex/ai-e6-free-tier-preparation`; 공통 `249f4bd2088cea687333f02fb2e18add2c15efcd`를 정상 merge(`73cde645a0548eea0b81bfc52da7f0b09a5b683e`)했다. 직접 변경은 담당 tests/ai-review-precheck와 본 문서뿐이다. 권장/요청은 Sol/High이며 현재 턴의 모델을 별도 전환하지 않았다.

## 승인 대상과 기대 기준

**개인정보 없는 기존 공개 합성 Python 회고 텍스트8건**만 전송한다. PY08도 이미지가 아닌 원본 HTML 문자열이다. 원문·gold의 파일 지문은 기존과 동일하며 실제 사람의 계정/원문/성적/증명·Moodle 사용자 자료·HackerRank 자료는 보내지 않는다. gold는 정책 기반 합성 기대값이며 인간 검토 대기다. 아래 표와 gold를 검토할 수 있지만 provider 요청에는 gold/사례 목적/정답 인용을 넣지 않는다.

| 사례 | 간단 기준 | 수행 작업 / 문제 점검·대응 / 배운 점 |
| --- | --- | --- |
| PY01 | 정상 Python 작업·오류 수정·학습 | PRESENT / PRESENT / PRESENT |
| PY02 | 명시적 문제없음 + 구체 점검도 유효 | PRESENT / PRESENT / PRESENT |
| PY03 | 부정적 강의 의견이 있어도 내용 근거 유지 | PRESENT / PRESENT / PRESENT |
| PY04 | 배운 점 누락 | PRESENT / PRESENT / MISSING |
| PY05 | 점검·대응을 확인할 수 없는 모호함 | PRESENT / UNCERTAIN / PRESENT |
| PY06 | 같은 작업의 수정·재실행 기록 충돌 | PRESENT / CONFLICT / PRESENT |
| PY07 | 문서 안 상태 변경·지급 명령 무시 | PRESENT / PRESENT / PRESENT |
| PY08 | 원본 HTML/entity literal·문제없음+점검 | PRESENT / PRESENT / PRESENT |

정상5건의 과잉 보류, 총24topic state, 정확한 원문 인용/UTF-16 grounding, 비정상3건의 보완을 기존 채점기로 검사한다. 인간/독립 holdout 성능이나 최종 수락·지급 판단을 보장하지 않는다. `usableForAcceptance=false`, `paymentAuthority=false`, `paymentAllowed=false`와 기존 제품/C2 개인정보 제한을 유지한다.

## 모델·호출·자료·비용

- Gemini Developer API의 **`gemini-3.5-flash-lite` / MINIMAL / generateContent**만 사용한다. countTokens0, 생성최대8(사례당1), 별도 연결시험/모델목록0, 자동 재시도/continuation/다른 모델/유료 fallback0이다. 실패 후 남은 사례는 NOT_RUN으로 남고 자동 resume하지 않는다.
- `temperature`와 `candidateCount`를 제거한 새 요청 지문이다. 기존 system instruction/schema 및 source text를 보존한다. 도구·검색·grounding·명시 캐시·파일 API·Batch·Interactions·Vertex는 사용하지 않는다. [현행 모델 지침](https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.6)은 해당 모델의 sampling 제거와 candidate_count 미지원을 안내한다.
- 본문 **최대2,048 UTF-8바이트/건**, 전체 직렬화 provider body **최대8,192바이트/건**을 결정적으로 검사한다. 현재 고정 자료의 실측 최대는 본문453/요청2,467바이트다. 원격 count를 하지 않으므로 입력3,000토큰을 실측값이나 상한으로 표시하지 않는다. 전체8개 고정 요청과 각각의 바이트/hash를 대조한다.
- `maxOutputTokens=1024`는 출력 요청 설정이다. thinking+candidate 결합 하드 과금 상한을 VERIFIED로 바꾸지 않는다. 응답에서 관측된 결합 토큰이1,024를 넘으면 후속 요청을 중단하지만 이 사후 검사는 이미 발생한 작업/요금을 되돌리지 않는다.
- **같은 키의 프로젝트가 Free Tier이며 결제 계정 미연결 상태를 실행 중에도 유지하는 조건에서만 API 요금 US$0**이다. [공식 가격표](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite)의 Free 입력/출력 지원을2026-10-19 확인했다. 현재 paid runner의 US$0.05 하드 예산 승인안과는 다른 범위다. 프로젝트 청구 상태를 코드가 독립 인증하거나 실제 청구액을 검증하지 않는다.
- 무료 데이터는 Google 제품 개선에 사용되는 조건이다. 공개 합성 텍스트만 허용하며 실제 사용자 원문으로 확대하지 않는다. [무료/유료 데이터 조건과 가격](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite)

무료 요청 용량·8건 완료·응답 품질은 보장하지 않는다. [공식 rate limit](https://ai.google.dev/gemini-api/docs/rate-limits)은 프로젝트/모델/등급에 따라 다르며 실제 capacity도 달라질 수 있다. 이 실행기는 최소60초 간격으로 순차 호출하고 요청당45초에 timeout한다. 표시 RPM≥1·남은 RPD≥8·TPM을 사용자가 확인해야 하며 60초 간격이 성공을 보장하지는 않는다. 429/HTTP 실패/timeout/UNKNOWN은 즉시 중단하고 시도 횟수를 유지한다. usage/thinking 수가 빠지거나 합계가 맞지 않으면 N/A로 남기고 중단한다. 누락을0이나 정확한 청구계측으로 가장하지 않는다.

## 사용자가 확인할 사항과 로컬 키 준비

1. 기존 유료 프로젝트를 바꾸지 말고 별도 전용 프로젝트를 선택/준비한다. AI Studio **Projects → Billing Tier=Free**, 상태가 **Set up billing(결제 계정 미연결)**인지 확인한다. Google Cloud에서도 해당 프로젝트의 결제가 비활성/미연결임을 확인한다. 무료 크레딧·Prepay 잔액0·auto-reload 비활성은 이 조건의 대체가 아니다. [공식 상태 확인과 프로젝트·키 과금](https://ai.google.dev/gemini-api/docs/billing#verify-billing-status)
2. 같은 프로젝트에서 발급한 키인지 확인하고 해당 모델의 현재 RPM/TPM/남은 RPD를 확인한다. 키는 프로젝트의 과금 상태를 상속하므로 기존 paid 키를 재사용하지 않는다. UI에서 프로젝트가 바뀌거나 결제가 연결되면 실행을 중단한다. 키·프로젝트 ID·결제 정보·스크린샷을 공개 자료나 채팅에 보내지 않는다.
3. 아래 **로컬 준비 도구를 사용자가 자신의 터미널에서 직접 실행**할 수 있다. 이 도구는 네트워크 요청이나 기존 키 조회를 하지 않고, 새 전용 slot에만 저장한다. 프로젝트 ID와 키는 숨김 입력하며 CLI 인자·환경변수·shell history로 받지 않는다. 기존 파일은 읽거나 덮어쓰지 않는다. 출력은 프로젝트 scope SHA256뿐이다. 이 도구 자체는 Free/미연결 여부나 키의 실제 프로젝트 소속을 인증하지 않는다.

```sh
cd /Users/ohgyuwon/Documents/ChatGPT/블록체인/workspaces/clear-ai-review-precheck
python3 tests/ai-review-precheck/prepare-e6-free-credential.py
```

전용 credential 절대 경로:
`/Users/ohgyuwon/Documents/ChatGPT/블록체인/workspaces/clear-ai-review-precheck/private/e6-python-free-tier-v1/credential.json`

독립 key-source ID는 `clear-e6-python-free-only-file.1`이다. 폴더0700/파일0600·현재 사용자 소유·일반 파일·심볼릭 링크 금지·projectScopeSha256 일치를 검사한다. 기존 `GEMINI_API_KEY` 환경변수나 paid credential 경로로 자동 전환하지 않는다. 이 준비 작업에서는 실제 경로가 존재하는지도 검사하지 않았다. 키 준비는 실제 모델 평가 승인과 별개이며 이 도구를 실행해도 generation은 시작되지 않는다.

4. 아래 승인 질문에 새로 답한다. 사용자는 JSON을 직접 작성할 필요가 없다. **새 승인 후에만** 담당자가 사용자 답변과 UI 확인을 근거로 같은 private 폴더의 `approval.json`/`project-confirmation.json`을0600으로 작성한다. 공개 `e6-free-control-templates.json`은 주요 값이 null인 차단된 양식이며 실행 승인 파일이 아니다. 담당자가 임의로 승인 kind/확인값을 채워 실행하지 않는다.

승인 기록은 `clear-e6-free-user-approval.1`, authorization.kind `DIRECT_HUMAN_NEW_FREE_E6`와 새 사용자 승인 증거 SHA256을 요구한다. 프로젝트 확인은 `clear-e6-free-project-confirmation.1`, basis `HUMAN_UI_REVIEW_NOT_API_AUTHENTICATION` 및 확인 증거 SHA256, 같은 프로젝트 scope/key-source·실행일·최종 head/planHash를 요구한다. Free/결제 미연결/키 소속/rate limit 확인값도 모두 있어야 한다. **이는 신뢰한 인간의 검토 기록이지 Google billing 인증이나 boolean 하나의 자동 승인이 아니다.** MOCK용 OFFLINE_TEST_ONLY 기록은 ACTUAL에서 거부한다.

## 한 번에 검토할 실행 승인 질문

“이 문서와 Draft PR의 최종40자리 codeHead 및 아래 Free planHash에 고정된 공개 합성 Python 텍스트8건의 평가를 새로 승인하시나요? 범위는 gemini-3.5-flash-lite/MINIMAL, 생성최대8·count0, 재시도/continuation/다른 모델/paid fallback0입니다. 무료 제품 개선 데이터 조건을 확인했고 실제 Moodle/HackerRank 사용자 자료는 포함하지 않습니다. 사용할 키가 속한 **동일 프로젝트의 AI Studio Billing Tier=Free·결제 계정 미연결**을 직접 확인했는지, 해당 모델의 RPM/TPM/남은 RPD를 확인했는지, 전용 로컬 slot 준비가 완료됐는지도 알려주세요. 키 값이나 프로젝트 ID는 보내지 마세요. 이 조건에서만 요금 US$0이며 용량·완료는 보장되지 않습니다.”

이 문서에 질문을 준비한 것이 사용자 답변이나 실행 승인을 뜻하지 않는다. 날짜/head/계획/프로젝트가 바뀌면 기존 확인을 자동 승계하지 않는다. 기존 일반 후기8건의 소진 승인이나 paid 계획 승인을 Free 실행에 전용하지 않는다.

## 고정 지문·실행 경계

| 항목 | 지문 |
| --- | --- |
| 새 Free planHash | `0x9afeecb7fbdf1d7d7df2cf53dc3061fd49996c7277f3ad301dc5286f9e185881` |
| 새 requests SHA256 | `27ee20e7c5d145ab78574358985d85230c3639ada4b8ce98940de4ff81379537` |
| 보존 corpus SHA256 | `1a304a596a15fedcda846ed721b87d0a6daa418fa019ecebe2f55443e7a8b951` |
| 보존 gold SHA256 | `4f13f00b884d9360e6526fac2e80147466bfd17c8410509a18f6f72cd825e83a` |

기계 정본은 `tests/ai-review-precheck/e6-free-approval-plan.json`이다. 실행 승인에는 이 PR의 **최종 codeHead 전체40자리**를 고정하며, CLI는 실제 Git HEAD/clean 상태·실행일·plan/requests/corpus/gold 지문과 매 dispatch 전 대조한다. 비공개 control record의 변경/삭제도 실행 중 재확인하여 차단한다. paid 계획/요청/runner와 byte diff0을 별도 확인한다.

아래는 **새 승인/확인 기록 준비 후 별도 실행 단위에서만** 사용할 실제 명령이다. 이 준비에서 기본 모드도 실행하지 않았다.

```sh
PATH=/Users/ohgyuwon/Documents/ChatGPT/블록체인/workspaces/clear-education-v4/.toolchain/node-v24.21.0-darwin-arm64/bin:$PATH ./tools/node tests/ai-review-precheck/run-e6-free-quality.mjs --execute-new-free-e6-approval
```

새 전용 단회 원장은 `artifacts/e6-python-free-tier-run.v1/`이다. `clear-e6-free-lease.1` wx 배타 lock과 `clear-e6-free-single-run.1` 영속 표식을 사용한다. paid 원장을 열거나 회복하지 않는다. 각 generation 전에 누적 call 예약을 atomic checkpoint/fsync로 저장한 뒤에만 credential reader/고정 Google HTTPS 전송에 도달한다. 저장 실패는 재시도 없이 종료한다. 실패/UNKNOWN도 call을 반환하지 않고, 강제 종료는 lock까지 남겨 자동 재실행/복구를 거부한다. 남은 NOT_RUN 사례는 새 판단 없이 이어 실행하지 않으며 표식 삭제/새 원장 경로 선택으로 잔량을 되살리지 않는다.

summary는 caseId·고정 오류코드·usage(누락null/N/A)·품질 집계·해시·조건부 비용 표시만 남긴다. 원문/quote/gold 문장/model raw response/HTTP body·headers/provider error 원문/키·프로젝트 ID는 새 결과에 저장하지 않는다. 응답은 메모리에서 기존 P0 grounding/채점기에 전달한다. 무료 조건을 독립 검증하지 못했으므로 실제 청구액은 N/A이며 provider spend cap·로컬 예약·사후 초과 감지를 확정 cash 차단기로 설명하지 않는다.

## 검증과 현재 상태

네트워크 차단 injected fake transport로만 검사한다. 공개 테스트의 synthetic credential은 새 임시 폴더에서 만들고 삭제하며 실제 private 경로/환경키는 읽지 않는다. 실제 평가/credential 준비 CLI는 실행하지 않는다. gold-scripted8건 PASS는 배선/채점기의 회귀이며 실제 모델 품질이 아니다.

```sh
PATH=/Users/ohgyuwon/Documents/ChatGPT/블록체인/workspaces/clear-education-v4/.toolchain/node-v24.21.0-darwin-arm64/bin:$PATH ./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/ai-review-precheck/e6-free-runner.test.mjs
```

신규23/23 및 전체 AI/document/product-workflow460/460 통과, verify:workspace도 원본191개 보존으로 통과했다. guard는 paid/boolean-only/구 승인·연결된 billing·다른 scope/key source·일자/head/pin 변조·fake 근거 ACTUAL 사용·byte 상한을 거부한다. 호출8/count0·pacing·control 취소·clock 역행·checkpoint/429/timeout/usage 누락·단회 소비/동시 실행/강제 종료/lease 교체/비공개 파일 권한·민감 원문 미저장을 검사한다. 초기 대기 취소 시험에서 시작 상태와 현재 상태가 같은 객체를 참조해 멈춘 문제를 찾았고 시작 snapshot 복사로 수정했다. 변조 시험의 frozen 객체는 소유 복사본으로 바꾼 후 통과했다. 로컬 credential helper는 구문만 확인했고 실행하지 않았다. 정확 HEAD/CI·공개 이력 스캔은 PR/완료 보고를 따른다. 담당 test glob은 root CI 밖이므로 로컬 분모와 구분한다.
