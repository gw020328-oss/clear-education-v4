# E6 Python 회고 전용 평가 실행기 준비 — 2026-10-19

**PREPARED / ACTUAL_BLOCKED / MODEL_QUALITY=N/A.** 이 작업에서는 injected MOCK transport와 임시 합성 원장만 시험했다. 실제 실행 CLI는 기본 모드도 실행하지 않았으며 기존 키의 존재 확인/읽기·모델 목록 API·countTokens·generation은 모두0이다. 기존 소진된 평가 원장/lock/승인을 열거나 초기화하지 않았다. 10월16일 텍스트4/이미지4 평가 승인 답변은 새 Python 텍스트8건 승인으로 전용하지 않는다.

기준 계획은 [승인용 계획](REVIEW_PRECHECK_E6_QUALITY_APPROVAL.ko.md)과 `tests/ai-review-precheck/e6-python-approval-plan.json`이다. 기존 planHash `0x75b155c748c05242c2585ca254efcd05c77f3745ce53714367fc72b51fc5d696` 및 corpus/gold/request/prompt/schema/config 지문은 바꾸지 않았다. 준비 기준 head는 `fccd49d1d4e695ce49e32e023de1dd1628c68627`; 실행 승인에는 runner를 포함하는 **최종 커밋의 전체40자리 head**를 별도로 고정해야 한다. 요청/권장 모델은 Sol/High이고 이 턴에서 실행 모델 설정을 변경하지 않았다.

## 실행 경계

전용 구현은 `tests/ai-review-precheck/e6-quality-runner.mjs`, CLI는 `run-e6-quality.mjs`다. 모듈 import만으로 키·비공개 승인·원장을 읽지 않는다. CLI 기본 상태는 ACTUAL_BLOCKED이며 유일한 실제 실행 옵션은 아래와 같다. **다음 명령은 이번 작업에서 실행하지 않았다.** 새 승인과 검증된 비용 근거를 준비한 후 별도 실행 단위에서만 사용한다.

```sh
PATH=/Users/ohgyuwon/Documents/ChatGPT/블록체인/workspaces/clear-education-v4/.toolchain/node-v24.21.0-darwin-arm64/bin:$PATH ./tools/node tests/ai-review-precheck/run-e6-quality.mjs --execute-new-e6-approval
```

CLI는 고정 비공개 경로 `private/e6-python-quality-v1/approval.json` 및 `cost-verification.json`만 읽는다. 이 파일들은 이번에 생성/조회하지 않았다. key를 인자나 파일에 넣지 않는다. 모든 guard와 사전 checkpoint를 통과한 뒤에만 기존 developerTransport가 보안 환경설정의 키를 메모리에서 읽을 수 있다. endpoint/model/method는 기존 고정 Google HTTPS 전송 경계를 재사용한다. 별도 연결시험·목록조회·다른 모델·continuation은 없다.

승인 control record는 `clear-e6-python-user-approval.1`이며 다음 조건을 모두 요구한다.

- 명시 새 승인 `explicitNewApproval=true`, 범위 `E6_PYTHON_TEXT_ONLY`, 기존 보안설정 사용 확인, 승인일과 실행일(한국시간) 일치, 승인 증거 SHA256.
- codeHead와 clean Git 상태, 승인 planHash 및 exact codeHead/plan/corpus/gold/requests pins 일치. 입력 전체 bundle도 committed 계획의 재생성과 대조한다. 요청은 메모리 소유 복사본으로 고정한다.
- count8/generation8, budgetNanoUsd `50000000`, automaticRetries0/continuations0. 일반 후기 텍스트/이미지 승인은 범위 불일치로 차단한다.

비용 record는 `clear-e6-python-cost-verification.1`이다. 승인과 동일한 head/plan/검토일, `PAID_STANDARD`, scope `v1beta/models/gemini-3.5-flash-lite:generateContent+countTokens`, 입력300 nanoUSD/token·출력(thinking 포함)2500 nanoUSD/token을 요구한다. `countTokensBilling=VERIFIED_UPPER_BOUND`와 독립 count 요청당 최대비용, `combinedOutputThinkingCap=VERIFIED_1024`, 근거 SHA256 및 `evidenceKind=PRIMARY_ENDPOINT_SPECIFIC`이 있어야 한다. MOCK 시험의 `OFFLINE_TEST_ONLY` 증거는 ACTUAL guard에서 거부한다.

이 record는 **신뢰한 운영자의 검토 기록**이며 코드가 Google 청구 조건을 독립 인증하거나 문서 내용을 자동 판독하는 장치가 아니다. 필드를 true/VERIFIED로 바꾸는 것만으로 미확정 사실이 확인되지는 않는다. 근거를 실제 검토한 후에만 기록해야 하며 현재는 두 전제가 미해소여서 record를 만들지 않는다. 임의 CLI 승인 flag 하나로 이 검토를 대체하지 않는다.

## 원장·한도·중단

고정 원장은 `artifacts/e6-python-quality-run.v1/`다. 다른 원장 경로를 받는 CLI 옵션은 없다. 디렉터리 소유자·권한0700·실제 경로/심볼릭 링크를 검사하고 새 파일은0600으로 만든다. `clear-e6-python-lease.1` 배타 lock을 wx로 획득하고 token 소유권을 checkpoint 전후/해제 때 확인한다. 동시 실행은 거부한다.

최초 실행에 `spent.v1.lock`을 wx로 생성하고 파일과 디렉터리를 동기화한다. 이 표식은 성공/실패/UNKNOWN 모두 남는다. 강제 종료 뒤에는 execution lease도 남고 PID만 보고 자동 복구하지 않는다. 원장/표식을 삭제·다른 경로 선택·resume하여 승인 잔량을 되살리지 않는다. 복구는 별도 오프라인 대조가 필요한 상태이며 이 CLI는 복구 기능이 없다.

각 count/generation 전에 누적 횟수와 전체 예약액을 먼저 증가시키고, 같은 디렉터리 임시파일→fsync→rename→디렉터리 fsync의 원자 checkpoint를 완료한다. 저장 실패 시 dispatch/저장 재시도를 하지 않는다. count/생성 최대8회와 전체 US$0.05를 검사하고 코드/head/clean 상태·실행일·clearance를 dispatch 직전에도 대조한다. 입력3000 초과 시 generation을 보내지 않는다. timeout/HTTP 오류/알 수 없는 사용량/불완전 응답은 즉시 중단하고 예약을 반환하지 않는다. 한 요청의45초 timeout 이후 늦은 응답은 채택/재시도하지 않는다.

검증된 count당 최대비용을 C nanoUSD라 하면 전체 예약 상한은 `8 × (C + 3000×300 + 1024×2500) <= 50000000`이어야 한다. MOCK fixture의 C=900000일 때 US$0.03488은 산식 시험값일 뿐 실제 count 청구 상한을 확인한 값이 아니다. 청구된 생성·thinking·input 사용량은 응답에서 안전한 정수만 허용하고 합계/상한 불일치나 thoughts 누락도 UNKNOWN으로 중단한다. 응답을 받은 뒤의 초과 감지는 비용을 되돌릴 수 없으므로 **사전 endpoint cap 확인을 대체하지 않는다.** 프로젝트 전체 사용량/세금/환율의 결제 차단기를 구현한 것이 아니다.

## 공개 결과·품질 범위

summary는 승인/비용 검토/입력/응답의 해시, 사용량·횟수·예약액, caseId와 고정 오류 코드, 품질 집계만 저장한다. 원문·인용·gold 문장·raw response·HTTP body/headers·provider error 원문·키/프로젝트 정보는 출력하지 않는다. 모델 응답은 메모리에서 기존 P0 validator/원문 grounding 채점기에 전달하고 집계만 남긴다. 의미 오류/과잉 보류는 품질 미흡으로 집계하며 실행 실패와 구분한다.

`usableForAcceptance=false`, `paymentAuthority=false`, `paymentAllowed=false`를 유지한다. 기존 v1/E6 제품 adapter는 계속 MOCK이고 business120/1/600 ledger·source/auth·수락/지급 권한을 바꾸지 않았다. gold-scripted8건의 PASS는 배선/집계기 시험이며 모델 성능·개선율이 아니다.

## 공식 문서 추가 확인과 남은 전제

2026-10-19 [billing FAQ](https://ai.google.dev/gemini-api/docs/billing)는 `GetTokens` 비과금을 명시한다. 이것을 REST `models.countTokens`의 확인된 가격0으로 매핑할 근거는 여전히 N/A다. [thinking 문서](https://ai.google.dev/gemini-api/docs/thinking)의 `max_output_tokens` 설명은 thinking 포함 및 infrastructure hard cutoff를 명시하지만 해당 예제/표기는 Interactions API다. [GenerateContent GenerationConfig](https://ai.google.dev/api/generate-content)의 `maxOutputTokens` 설명은 response candidate 최대 토큰 수다. 이를 동일한 thinking 결합 상한으로 읽는 것은 추론이며 이 실행기의 endpoint-specific VERIFIED 근거로 채택하지 않았다. 실제 API 탐색이나 외부 문의로 확인하지 않았다.

남은 조건은 새 Python8건 사용자 승인·최종 head 고정·실행일 가격/REST count 과금 상한과 GenerateContent output+thinking cap 근거 검토·gold 인간 검토다. 현재 실행 금지를 유지한다.

## 오프라인 검증

```sh
PATH=/Users/ohgyuwon/Documents/ChatGPT/블록체인/workspaces/clear-education-v4/.toolchain/node-v24.21.0-darwin-arm64/bin:$PATH ./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/ai-review-precheck/e6-quality-runner.test.mjs
```

신규19개는 fake16요청의 사전 checkpoint·원문 미저장, 승인/비용/head/일자/pin 변조, provisional·과다 예산·ACTUAL에 fake 근거 사용 거부, 저장 실패(최초/생성 직전/실제 디스크 rename), count/생성 실패·timeout·usage 불명·결합 상한·JSON/모델 불일치, 정상 과잉 보류 집계, 동시 실행·영속 단회 사용·강제 종료·lease 교체·권한/심볼릭 링크 차단을 검사한다. Mac 임시 경로 별칭으로 첫 디스크 시험3개가 실패했으며 시험 경로를 realpath로 바꾼 후19/19 통과했다. 전체 AI/document/product-workflow 회귀437/437 및 verify:workspace(원본191개 보존)도 통과했다. 실제 실행 CLI를 시험한 것이 아니다. 공개 이력 검사는 PR/완료 보고의 exact head 기록을 따른다. 담당 test glob은 기존 root CI 범위 밖이며 CI와 로컬 분모를 구분한다.
