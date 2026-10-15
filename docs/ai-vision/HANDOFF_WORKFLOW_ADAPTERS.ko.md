# AI/Vision M3 소비자 인계 — 2026-10-15

## 위치와 검증 기준

- repo: `https://github.com/gw020328-oss/clear-education-v4`
- worktree: `/Users/ohgyuwon/Documents/ChatGPT/블록체인/workspaces/clear-ai-vision-gemini`
- branch: `codex/ai-workflow-adapters`
- 검증된 구현 head: `15040cd55eb04380ae6e31c41ac0d27e4d6dd271` (이후 인계문서·검증 기록 커밋은 코드 변경과 구분)
- 기준 develop: `4ae548b8c844f482418f3abfb20a2f1886cac398` (평가 PR #54 병합)
- 이력 반영한 공통 의존: `4018e32693efe990d70cef5f2524984efab5f977` → `91430c6feec97fec5de62fdd2a889146005351dc` → consumer export 동결 `48d211774d6c78bd2332738c500cc590264c1a48`.
- 담당 PR: [#57](https://github.com/gw020328-oss/clear-education-v4/pull/57), develop 대상 Draft·자동 병합 금지. 열린 이슈 #55(공통 연결), #39(AI). 최종 담당 head/CI는 PR 본문과 인계 최종 보고를 함께 확인한다.
- 공통 세션: `01a130ae-cde7-7763-95cb-2ea5469721ed`. 조정 세션: `01a11411-3254-7c70-a566-c2743d88d4f7`. 이번 작업 관련 직접 협의/결과 공유는 사용자 승인 범위다.

현재 작업본에서 `git status --short --branch`, `git rev-parse HEAD`, `gh pr view 57 --json headRefOid,isDraft,state,statusCheckRollup`을 읽어 최종 문서 커밋 이후 상태를 확인한다. 다른 작업본을 checkout/reset하거나 기존 DB를 열지 않는다.

## 최신 승인과 소유

공통 계약을 소비하는 문서 bytes→관찰→보완 요약과 source bundle→조건/필요 증거 초안의 **합성 모듈 연결**이다. 운영 HTTP/학생 화면·실동의·개인자료 업로드/decode·운영 Evidence/재원 연결은 미완료다. URL은 공통 collector/store만 담당하며 AI adapter는 lookup으로 고정 snapshot을 읽는다. URL 직접 fetch/새 수집기/로그인/무제한 크롤링은 금지다.

AI 소유는 신규 `src/document-precheck/workflow-adapter.mjs`, `src/ai-policy/source-bundle-adapter.mjs`, 전용 tests/docs다. 기존 proposal/precheck 모듈 수정은 필요 시 이 범위에서만 허용됐으나 이번 구현은 새 adapter로 분리했다. 공통 소유 `src/product-workflow/`, `specs/m3/`, API/DB/collector/root CI/정본문서 및 web/는 직접 고치지 않는다. 이 PR에 보이는 해당 경로 변경은 공통 의존 이력이다.

키는 기존 서버 환경에서만 읽는 transport 경계를 유지한다. **지난 평가 승인 5/5는 소진됐고 새 유료 호출 승인은 없다.** 이 연결 시험의 실제 모델/유료/실제 URL 호출은 0이다. 평가 PR #54는 3종 합성 소규모 비교이며 일반적인 실서류 성능 보장이 아니다. 결제 계정·키 값·실제 증명·쿠키·개인정보를 이 문서나 fixture에 넣지 않는다.

## 구현과 중요한 경계

1. `reviewWorkflowDocument`는 호스트 발급 RunContext와 in-process bound policy를 맞춘다. 실제 policy/rule/plan/display/reviewManifest/preview와 original bytes manifest를 검사한다. 기존 metadata inputHash와 assetsHash는 별도다. ruleVersion은 planVersion이다. `nowMs` 옵션은 밀리초이며 공통 source/ledger의 초 단위 now와 다르다.
2. CODE/mock TEXT_AI/VISION만 호출하고 ACTUAL은 거부한다. Vision SIGNATURE_ONLY_NOT_DECODED는 IMAGE_NOT_DECODED/NEEDS_REVIEW로 남긴다. 엄격 text span/quote·post/image locator를 유지하고 provider row/L1 위치를 자동 승격하지 않는다.
3. 반환 ReviewSummary는 지문/상태/허용 이유만 포함하며 이름/점수/quote/raw output/bytes는 넣지 않는다. 호스트가 ledger begin/complete/CAS·retry/cancel/latest/restart를 담당한다. context hash를 인증으로 보거나 기존 WeakMap ack를 복원하지 않는다.
4. 소유 original/observer byte copy를 성공/오류/취소/timeout에 zero-fill한다. caller 원본, 공통 resolver 내부/독립 라이브러리 복사본·JS 문자열·강제종료 완전 삭제는 보장하지 않는다. callback이 원본과 다른 bytes로 변환하면 거부한다.
5. `proposeSourceBundle`는 expected/current bundleHash를 전후 확인하고 source snapshot/hash/기관·상품·반·raw/text/normalizer/time/정확 locator를 독립 M1 Source pin과 대조한다. host origin/applicability를 자동 합성 승격/repin하지 않는다.
6. 텍스트 조건은 기존 템플릿 slot/quote 검사로 OFFICIAL_DRAFT/OFFICIAL_OPEN과 OPEN 질문을 만든다. optional evidenceNeeds는 기존 requirement의 허용 fieldIds·원문 인용을 검증한 미승인 초안이다. quote 포함은 의미적 지지·공식 승인 보장이 아니다.
7. image-only는 draft=null/sources=[]/capabilities=null로 별도 관찰/coverage만 반환한다. Vision 값을 텍스트 quote나 공식 조건으로 만들지 않는다. PUBLIC_URL/PASTE/FILE provenance, failed resourceRequests/미수집 guide·JS·image·판독 범위를 보완 진단에 남긴다.
8. source refresh/만료/취소/전체 deadline 시 초안·필요증거·Vision 관찰을 소비 결과에서 내린다. 이미 확정·동의한 정책은 수정하지 않는다. 전체 source 작업 최대30초, aggregate16MiB·text blocks64를 넘으면 조용히 잘라 통과시키지 않는다.

상세: [WORKFLOW_ADAPTERS.ko.md](WORKFLOW_ADAPTERS.ko.md). 공통 정본: [PRODUCT_WORKFLOW_CONTRACT.ko.md](../current/PRODUCT_WORKFLOW_CONTRACT.ko.md). source adapter 결과는 transient 검토 자료로 제한된 인용/관찰을 포함하므로 문서 receipt DB에 통째로 저장하면 안 된다.

## 검증과 재현

구현 head에서 관련 **306 PASS**, 실패/skip0이다. 기존 AI/document83 + 신규 문서14/source16/실제 공통 합성호스트 연결3 + 공통계약/ledger/source36 + 기존 정책112/M1M2 27/준비15를 함께 실행했다. 합성호스트는 임시 전용 SQLite만 사용하고 종료 시 정리했다. CODE 단회 수락/동일 재조회/다른 결과 거부/restart와 늦은 Vision CAS 거부, private source lookup 후 bundle 갱신 stale을 확인했다. 호스트 권한의 제품 적용 전체가 완료됐다는 뜻은 아니다.

```sh
./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/ai-policy/*.test.mjs tests/document-precheck/*.test.mjs tests/product-workflow/*.test.mjs tests/mvp-policy/*.test.mjs tests/policy/*.test.mjs spikes/ai-vision-preparation/*.test.mjs
./tools/node --import ./tests/ybm-collector/network-guard.mjs specs/m3/demo.mjs
./tools/node tools/verify-workspace.mjs
./tools/node tools/verify-workspace.mjs --local
```

M3 demo·mock7/7·binding 예제 byte 대조·workspace portable/local·diff-check도 PASS다. 로컬 runtime은 다른 작업본의 checkout을 건드리지 않고 기존 고정 실행파일을 PATH에만 명시했다: `/Users/ohgyuwon/Documents/ChatGPT/블록체인/workspaces/clear-education-v4/.toolchain/node-v24.21.0-darwin-arm64/bin` + 저장소 tools/node. 전역 런타임/의존성/legacy는 바꾸지 않는다. 시험 로그·갭 재현·기존 합성 이미지는 Git 제외 `artifacts/ai-vision-product-preparation/`에 있으며 비밀 원문을 추가하지 않는다.

## 바로 다음 작업과 세션 전환

공통 의존 PR의 최신 문서/병합 SHA 수신, 필요 이력 통합, #57 최종 head CI와 공통 소비 수락/실질 경계 리뷰가 다음이다. 공통 코드의 문제를 찾으면 해당 세션에 근거와 함께 보고하고 독단 복제하지 않는다. 필요 없는 전체 재검사를 반복하지 않는다. 실제 UI/동의/개인자료·decode·Evidence는 후속 승인 단위다. 새 유료 호출/자동 병합은 금지다.

전환 권장 시점은 #57 검증·인계 경계다. 유료 모델/결제 진단에서 공통 계약 변화와 두 소비자 구현을 거쳐 이제 의존 통합·리뷰 단계로 역할이 바뀌었다. 전환은 이 단계 전환과 누적된 상이한 이력을 정리하기 위한 것이며 대화 수/날짜/자동압축 한 번이나 확인할 수 없는 잔량 추정에 따른 것이 아니다. 새 세션 생성·기존 세션 정리는 조정 세션이 문서 확인 후 승인 범위로 처리한다. **인계 이후 기존 AI 세션은 추가 구현하지 않고 인수 확인을 기다려 중복 개발을 막는다.**

이번 위임 설정은 GPT-6.1 Sol / Medium이다. 현재 실행 모델을 별도 조회·전환했다고 주장하지 않는다. 다음 일반 소비 수정은 Sol / Medium, 원문/메모리 수명·권한·재사용/동의 경계의 실질 리뷰는 Astra / High 권장, CI 상태 조회만은 Sol / Low면 된다.

새 세션 시작 프롬프트:

> CLEAR AI/Vision #57 인수를 이어가세요. 먼저 이 HANDOFF와 WORKFLOW_ADAPTERS 및 공통 PRODUCT_WORKFLOW_CONTRACT를 읽고, 지정 worktree의 branch/head/clean 상태와 PR57 CI를 확인하세요. 구현 기준15040cd, 공통 consumer 계약48d2117을 이력 반영했습니다. 기존 AI 세션은 인계 후 추가 구현하지 않습니다. 공통 세션에서 최종 계약/병합 SHA와 담당 소유 범위를 확인한 뒤 필요한 이력 통합·일반 소비 수정·Draft 리뷰 보고만 진행하세요. API/DB/collector/CI/정본문서/web 직접 수정·원문 전체 Git 복사·새 유료 호출·자동 병합은 금지입니다. 기존 예치 OPEN/400%사전검토만/원천·동일인 미확인 보류/grant-outbox HOLD/독립claim NO-GO를 유지하고 실제 HTTP/UI/동의/Evidence 완료를 주장하지 마세요.
