# HackerRank 원천 형식 관찰 — 실행 전 인계

## 최신: 다음 한 번의 관찰을 위한 schema.2 준비

이번82588은 `3d968e7`의 수정 진단이며 이전92921과 구분한다. 자체 로그인 후 두 허용 응답을 관찰했고 정상 자동 종료(exit0/profilesDeleted:true)했다. account는 `STRICT_SIZE_LIMIT` 뒤 `structureParsed=false`, username 위치 미확정이었다. certificate는 `STRICT_VALUE_OR_GRAMMAR_POLICY` / `structureParsed=true`, data 배열 32행 이하이나 공통 직계 문자열 필드 목록이 비어 있었다. 이 결과는 실제 JSON의 숫자 정책 불일치와 flat 구조 가정의 부족을 보여 주며, account의 2차 실패 이유는 당시 출력으로 알 수 없다. 원문은 삭제되어 복원하지 않는다.

사용자가 재로그인 반복을 피하도록 준비를 먼저 끝내라고 요청했다. 후속은 `HACKERRANK_LAYOUT_SCHEMA.2`로 두 판독 단계의 고정 코드와 중첩 필드의 **구조 후보**를 함께 보고한다. 준비 중 실제 진단 실행·로그인 요청은 없다. source recipe·verifier·trust·nonce/owner·lease·API·금고·AI는 변경하지 않는다.

### 판독 결과와 고정 한도

| 단계 | 경계 | 반환 의미 |
| --- | --- | --- |
| 1차 | 기존 `strictJson` 실제 호출: 64KiB, depth24, 4096 nodes, safe integer만 | 실제 통과 여부를 유지한다. 별도 진단 parser와 결과가 충돌하면 `DIAGNOSTIC_MISMATCH`로 구조 반환을 막는다. |
| 2차 진단 | account script 1MiB / certificate 64KiB, depth48, 32768 nodes | JSON 숫자의 자료형만 보관하는 shape tree다. 숫자·문자열 값은 tree에 넣지 않는다. 중복/위험 key·문법을 전체 입력에서 검사하며 첫 거부에서 멈춘다. |
| HTML | 기존 account 응답 1MiB, 100000 HTML nodes, depth64, JSON script16개 | 초과하면 부분 관찰 표시. script ID는 정확한 `__NEXT_DATA__`일 때 `NEXT_DATA`, 나머지는 `OTHER_OR_MISSING`이다. |
| 구조 탐색 | path depth12, walk8192, 보고 필드64개 전체 공유 | 한도를 넘은 관찰을 완전한 부재 판정으로 사용하지 않는다. |
| 인증서 후보 | 후보 배열4개, 배열당 앞32행만 구조 보관 | 모든 JSON 입력은 parser 한도 내에서 검사하되 누락된 행의 필드를 추측하지 않는다. 여러 행/배열을 자동 선택하지 않는다. |
| 출력 | 최종 role 요약64KiB 이하 | 초과 시 `OUTPUT_LIMIT`과 미해결 상태만 반환한다. 원문/값/임의 key/본문 지문/예외 원문은 없다. |

`scriptDiagnostics`(account)와 `parserDiagnostics`(certificate)는 `primaryStatus`, `secondaryStatus`, `numericForms`를 제공한다. 상태 코드는 `ACCEPTED`, `SIZE_LIMIT`, `DEPTH_LIMIT`, `NODE_LIMIT`, `DUPLICATE_KEY`, `UNSAFE_KEY`, `JSON_SYNTAX`, `NUMBER_FRACTION`, `NUMBER_EXPONENT`, `NUMBER_UNSAFE_INTEGER`, `DIAGNOSTIC_MISMATCH`, `DIAGNOSTIC_ERROR`로 제한한다. 각 단계의 **첫 거부 이유**이며, 거부 뒤 전체 문서의 모든 문제를 찾았다는 뜻이 아니다. numericForms도 실패 시 앞에서 관찰한 고정 종류뿐이다.

이전 호환 필드 `jsonParsed`는 1차 실제 strict 통과 여부, `jsonStatus`/`jsonScriptStatuses`는 기존 묶음 분류를 유지한다. 새 판정은 반드시 상세 두 단계 코드와 `structureParsed`, `limitsReached`를 함께 읽는다. `structureParsed=true`는 진단 shape tree를 만들었다는 뜻이며 signed parser가 완화되거나 실제 원천이 검증됐다는 뜻이 아니다.

### 필드·경로의 개인정보 경계

사전 허용 vocabulary는 [`layout-json.mjs`](../../src/hackerrank-evidence/layout-json.mjs)의 고정 목록이다. props/pageProps/initialState/auth/currentUser/current_hacker/user/hacker/profile/data/models/attributes/certificate/test/results 등의 후보 container와 username/user_name/handle, certificate ID/name/status 및 일부 일반 id/name/title 후보만 사용한다. 목록 밖의 key는 모두 `{unlisted}`로 바꾸고 `locationKnown=false`로 표시한다. 임의 key나 실제 script ID를 그대로 경로에 붙이지 않는다. 동적인 계정명·인증서 ID가 key여도 출력되지 않는다.

account는 script slot별 후보 경로·자료형·단일/복수 출현을 반환한다. `candidateJsonPaths`에는 허용 경로의 문자열 후보만 넣지만, 이것만으로 현재 로그인 사용자라고 인정하지 않는다. 여러 script/후보 또는 `{unlisted}`가 있으면 모호하거나 위치 미확정이다.

certificate는 배열 후보와 **각 행 slot별** 필드 경로·자료형·coverage를 반환한다. 서로 다른 행이나 내부 배열의 필드를 합치지 않는다. 일반 `id`/`name`은 곧바로 certificate ID/name으로 보지 않고, 사전 정의한 `certificate.id/name/title` 문맥에서만 구조 후보로 분류한다. 필드가 같은 행의 문자열이어도 실제 값 일치·Python(Basic) 선택·계정 통제·발급기관 의미는 검증하지 않는다. `MISSING`, `NON_STRING`, `AMBIGUOUS`, `UNLOCATED`, `STRING_CANDIDATE`도 자료형/위치 진단 상태다.

### 다음 한 번의 실행 및 판정 체크리스트

실행 소유자는 이 PR103 세션이며 본부가 사용자 안내를 한 번씩 조율한다. 사용자 준비 신호 전에는 창을 열지 않는다. 다음 실행도 아래 기존 pinned Node launcher와 15분 상한을 사용하고, 프로필/원문 보존이나 로그인 세션 연장은 하지 않는다.

1. head·clean 상태와 기존 진단/관리형 Chrome 미실행을 확인한다. 단일 launcher를 열어 로그인 대기까지 준비한 뒤 본부에 알린다. CI나 준비 검사를 이유로 미리 로그인하지 않는다.
2. 사용자는 새 진단 Chrome에서 Google 대신 본인 username/email와 HackerRank 비밀번호로 로그인하고 완료만 알린다. 본부의 완료 신호 뒤 담당자가 `ready`를 한 번 입력한다.
3. account 관찰 뒤 같은 탭에서 본인 프로필의 인증서 목록/Python(Basic) 화면을 열도록 본부가 안내한다. 임의 username URL·다른 계정·추가 원천을 요청하지 않는다.
4. 두 응답 관찰 후 자동 종료 안내와 cleanup을 확인한다. exit0와 `profilesDeleted:true`를 함께 확인해야 정상 정리다. close/중단/15분 만료·원천 관문 실패·cleanup 실패는 성공으로 기록하지 않고 고정 phase와 실제 출력 범위만 보고한다.
5. account의 primary/secondary 코드로 기존64KiB 제한과 후속 depth/node/중복/위험 key/문법을 구분한다. `ACCOUNT_PATH_REQUIRES_SOURCE_REVIEW`가 있더라도 현재 사용자 의미는 후속 검토다. 한도·parser 거부·여러 후보·가려진 경로는 미해결로 남긴다.
6. certificate의 숫자 정책과 2차 문법/shape 결과를 구분한다. 각 행의 네 의미 후보가 문자열인지, 누락/비문자열/모호/가려진 위치인지 확인한다. 여러 record/배열 또는 한도 초과는 자동 선택·전체성 주장 없이 미해결이다.
7. `schemaOutcome`과 `limitsReached`를 읽고 **구조 후보 확보 / 정확한 한도·거부 확인 / 미지원 구조** 중 어디까지 확인됐는지 결정한다. 해결 안 된 항목 때문에 같은 조건으로 자동 재실행하거나 임의 key/값 덤프를 추가하지 않는다.
8. 모든 경우 `authenticatedAccountControlProven=false`, `accountJoinProven=false`, `proofVerified=false`, `requestBound=false`, API HOLD/paymentAllowed=false를 유지한다. 공식 signer/epoch/context·실제 recipe·새 요청 결합은 별도 미확정 상태다.

검증은 관련 layout/transport 합성 반례만 실행한다. HR 전용 `HackerRank bounded layout diagnostics` CI는 stacked PR에도 적용하고 외부 네트워크를 차단한 두 layout 시험 파일을 실행한다. 기존 일반 CI·과거 준비19개·실제 관찰과 이 결과를 섞지 않는다. 무관 full suite/run3의 수동 재실행은 없다.

준비 검증: 고정 Node24.21.0/network guard 아래 기존21+신규13 = **34/34 PASS**, diff check·새 CI YAML 구문 PASS다. 수동 리뷰에서 raw key/value를 shape tree·결과에 보관하지 않는지, 숫자/escape 처리·원래 strict 판독과의 차이를 공개 오류 코드로 구분하는지, 행/내부 배열을 넘어 coverage를 합치지 않는지, 탐색 한도를 미해결로 표시하는지 확인했다. `3d968e7`과 비교해 `values/verifier/collector/request/recipes/pending-trust`는 변경0이다. 원격 CI 결과는 해당 PR의 최종 head로 확인하며 여기의 합성 PASS를 실제 관찰로 대체하지 않는다.

## 2026-10-20 자체 비밀번호 로그인 후 실제 관찰

사용자가 공식 경로의 자체 비밀번호 설정과 새 진단용 Chrome의 로그인 완료를 확인했다. PR103 `fc803e4`에서 기존 launcher를 한 번 실행했고, 살아 있는 실행에 사용자 완료 신호 이후 `ready`를 한 번 입력했다. 계정 응답 뒤 같은 탭의 인증서 응답까지 관찰되어 **exit0 / profilesDeleted:true로 자동 종료**됐다. 사용자가 보고한 “갑자기 꺼짐”은 이 정상 종료이며 timeout/crash가 아니다. Google OAuth 재시도·쿠키/프로필 복사·새 proof/신청/AI/지급은 없었다.

값 없는 당시 요약은 account `htmlParsed=true`, `jsonScriptPresent=true`, `usernameKeyPresent=true`, `currentHackerKeyPresent=false`, `candidateJsonPaths=[]`; certificate `jsonParsed=false`, `recordShapes=[]`였다. `proofVerified`, `authenticatedAccountControlProven`, `requestBound`는 모두 false이며 API HOLD다. 허용된 HTTP200/JSON MIME 응답 관찰과 JSON 해석 성공을 구분한다. 원문은 보존하지 않아 그 실패 이유는 지금 복원할 수 없다.

기존 진단은 정수·64KiB·depth/node/중복키 제한이 있는 signed-record용 `strictJson`을 계정 스크립트와 인증서 응답에 그대로 적용했다. 따라서 당시 `jsonParsed=false`는 일반 JSON 문법 오류와 strict 정책 거부를 구분하지 못한다. 소수 등이 실제 원인이었다고 단정하지 않는다.

같은 PR의 후속은 `jsonStatus` / `jsonScriptStatuses`를 고정 분류로 추가한다: `STRICT_ACCEPTED`, `JSON_SYNTAX_INVALID`, `STRICT_SIZE_LIMIT`, `STRICT_DEPTH_OR_NODE_LIMIT`, `STRICT_DUPLICATE_OR_UNSAFE_KEY`, `STRICT_VALUE_OR_GRAMMAR_POLICY`. `jsonParsed`는 기존 strict parser 통과 의미를 유지한다.

새 `structureParsed`는 **진단용 문자열 필드 구조만** 관찰했는지를 나타낸다. 일반 JSON 문법이 유효하지만 숫자/스크립트 크기 정책으로 거부된 경우, 문자열을 보존하고 숫자 token만 0으로 치환한 메모리 사본을 별도로 검사한다. 입력 한도(account 1MiB/certificate 64KiB), depth/node·중복/위험 key 거부는 유지하며, 값·본문·임의 key·예외 메시지는 출력하지 않는다. 정규화한 값은 proof/verifier/recipe/lease 입력으로 쓰지 않는다. required source field가 숫자이면 문자열로 인정하지 않는다. 실제 검증기의 `strictJson`과 서명/추출 정책은 변경하지 않는다.

두 응답을 관찰하면 정리를 위해 창을 닫는다는 안내도 종료 전에 출력하도록 했다. 형식 해석 실패가 정상 정리와 구분되며, 수집 성공을 가장하지 않는다. 이 후속의 관련 network-blocked 진단 **21/21 PASS**다. 새 관찰 코드는 실제 재실행 전이며, 이전 원문을 가져와 새 결과로 승격하지 않았다.

현재 브라우저/임시 프로필은 정상 정리되어 재사용할 세션이 없다. 다음 실제 관찰은 본부가 사용자와 한 번 조율한 뒤 새 진단에서 수행해야 한다. 당시 로그인 성공만으로 실제 recipe·account control·공식 signer/epoch/context·request-bound proof가 준비됐다고 표시하지 않는다. 아래 Google 차단 및 원천0 기록은 이 실행 이전 이력이다.

2026-10-20. 정상 시연의 실제 recipe 검토 입력을 얻는 최소 진단이다. **본부의 후속 실행은 로그인 화면까지 열렸으나 사용자가 선택한 Google 로그인 popup의 중계가 차단됐다. ready·원천 본문 관찰·hosted proof는 아직 실행하지 않았다.** 본부가 사용자에게 한 번 안내한 뒤 실행한다. UNCONFIGURED trust를 변경하거나 synthetic recipe를 실제 recipe로 승격하지 않는다.

## 정확한 실행 방법

소유 작업본 `workspaces/clear-hackerrank-bootcamp`에서 고정 Node 24.21.0과 설치된 root/ybm-collector/hackerrank-evidence 의존성을 사용한다. 이 작업본 자체에는 고정 Node가 없고 시스템 Node는 25.6.1이어서 아래 기존 주작업본의 고정 실행 파일을 명시한다. 시스템 Node로 대체하지 않는다. Apple Silicon Mac, 설치된 Chrome, FileVault 및 기존 관리형 저장 정책이 선행 조건이다.

```sh
../clear-education-v4/.toolchain/node-v24.21.0-darwin-arm64/bin/node src/hackerrank-evidence/layout-launch.mjs
```

이 명령은 바로 공식 attestor 연결과 새 전용 Chrome을 연다. 따라서 준비 확인을 위해 미리 실행하지 않는다. 인수·환경 파일·기존 키·proof 파일·API 토큰 입력은 없다. 기존 사용자 Chrome 프로필을 재사용하지 않는다.

1. 새 Chrome에서 본인의 HackerRank 계정으로 로그인한다. 비밀번호·쿠키는 터미널이나 채팅에 입력하지 않는다.
2. 터미널에 `ready`를 입력하면 dashboard를 다시 연다. 그 전에는 본문 관찰기를 설치하지 않는다.
3. 계정 페이지 구조 관찰 완료가 표시되면 같은 탭에서 본인의 프로필·인증서 화면을 연다. 고정 certificate endpoint의 응답이 실제 발생해야 한다. 임의 username URL을 입력시키거나 인증서를 발명하지 않는다.
4. 두 응답을 관찰하면 자동 정리한다. 해당 응답이 나타나지 않으면 `close`로 종료한다. 15분 제한 및 Ctrl-C도 종료 경로다. 결과가 일부만 있으면 그대로 미확인이다. 원문이나 네트워크 로그를 추가 제출하지 않는다.

성공 출력은 값 없는 구조 요약과 `profilesDeleted:true`다. 정상 본문·쿠키·개인 경로·username·certificate ID·본문 지문은 출력하지 않는다. 고정 오류 코드만 반환하며 정리 실패 시 완료/삭제 성공을 출력하지 않는다.

## 수집 범위와 개인정보 경계

관찰은 선택한 새 탭의 `GET https://www.hackerrank.com/dashboard`와 `GET https://www.hackerrank.com/community/v1/test_results/hacker_certificate?username=…`로 한정한다. 추가 query, 다른 도메인·탭·메서드, redirect, non-200, 잘못된 MIME, 서비스워커/디스크 캐시 응답을 수락하지 않는다. account 1 MiB, certificate 64 KiB 이하다. 요약은 고정된 JSON 경로·필드 이름·boolean만 포함한다. 이 진단은 cookie API, proof 생성, 수집 동의 서명, 지급 서명, API 수락 또는 지급 함수를 호출하지 않는다.

새 worker는 기존 전용 잠금과 보관 폴더를 사용한다. 브라우저→중계→client 정리를 모두 시도하고, 기록된 소유 브라우저 종료를 확인한 다음 임시 프로필 폴더를 삭제한다. 중단된 이전 실행은 기존 승인된 재시작 정리 정책을 따른다. 관리형 암호화 저장이며 완전한 무디스크 실행·문자열/GC/swap 완전 소거를 주장하지 않는다.

**외부 전달:** 실행 시작부터 `wss://attestor.reclaimprotocol.org:444/ws`에 연결한다. 새 Chrome의 허용된 HackerRank/hrcdn HTTPS 트래픽과 정확한 accounts.google.com, fonts.gstatic.com, www.gstatic.com, www.google.com의 로그인 과정 HTTPS 트래픽을 공식 attestor가 중계하므로 해당 목적지·연결 시각·암호문 트래픽 메타데이터를 볼 수 있다. Google 로그인 평문은 Google과 로컬 Chrome이 처리하며, 로컬 원천 관찰기는 Google 본문·쿠키·토큰·OAuth 응답·callback을 읽거나 증명하지 않는다. HackerRank 원천 관찰은 위 두 응답의 메모리 처리 범위로 한정한다. 이 진단에서는 `claimTunnel`이나 선택 공개 proof를 보내지 않는다. 나중 실제 proof 생성 단계에서 attestor에 공개되는 필드는 별도의 recipe 검토 대상이다. 현재 요약만으로 개인정보 비공개 보장이 검증됐다고 표시하지 않는다.

**비용:** 이 진단에는 모델 호출, 결제 API, app ID/secret, 구매/가입 자동화가 없다. 공개 attestor의 현재 접근 허용·요금·서비스 제한은 확인하지 못했으므로 무료라고 단정하지 않는다. 인증/결제 요구로 실패하면 그대로 중단한다. 승인 예산을 재사용하거나 개인 키/계정을 찾아 우회하지 않는다. [공식 attestor 인증 설명](https://docs.reclaimprotocol.org/manual/inapp-sdks/advanced/attestor-auth)은 private attestor의 인증·허용 도메인 설정을 설명하며 공개 endpoint의 무료 사용을 보증하지 않는다.

## 결과 해석과 다음 한 단계

항상 `proofVerified:false`, `authenticatedAccountControlProven:false`, `requestBound:false`, `apiAcceptance:HOLD`, `paymentAllowed:false`다. 계정 JSON 경로와 certificate 필드 구조가 보여도 계정 통제·전체 목록 완전성·동일 계정 결합·공식 서명은 증명되지 않는다. 실제 관찰 결과를 바탕으로 로그인된 계정 원천의 의미와 recipe를 검토하고, registry signer/epoch 및 hosted context를 별도로 확인해야 한다. 이번 출력은 실제 수집 API의 lease나 candidate가 아니므로 수락할 수 없다. 기존 신청/owner/nonce/current/expiry/privacy 조건은 유지된다.

## 검증

`LOG_LEVEL=silent ./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/hackerrank-evidence/*.test.mjs`

108 PASS, FAIL/CANCELLED/SKIPPED 0. 이 중 신규 진단 14개는 합성 본문·가짜 browser transport로 ready 이전/경로 밖 접근 금지, 원문 없는 요약, redirect/cache/오류 거부, 진행 중 읽기의 정리 대기, 전체 transport 정리, worker 밖 실행 거부를 확인했다. launcher/worker 구문 검사를 통과했다. 실제 Mac 실행/로그인/정리 통합 결과를 대신하지 않는다.

코드 리뷰에서 취소 신호가 먼저 CDP를 닫아 정상 정리를 실패시키는 순서를 발견해, 관찰 중지 후 transport 취소 순서로 수정했다. 실제 Chrome과 같은 abort-sensitive 가짜 transport로 정상 종료를 검증했고, 이미 취소된 채널에는 CDP 명령을 추가 발행하지 않으며 브라우저 정리 실패 뒤에도 route/client 정리를 계속하는 검사를 추가했다.

## 첫 Mac 시작 실패의 최소 수정

본부의 첫 `tools/node` 실행은 고정 runtime 부재/시스템 Node25.6.1로 preflight에서 종료됐고, 고정 실행 파일을 직접 지정한 두 번째 시도는 ready/login prompt 전에 일반 실패 코드로 종료됐다. 프로필 삭제 성공을 이 로그만으로 단정하지 않는다.

이 작업본의 `src/ybm-collector/node_modules` 부재와 실제 client가 요구하는 TLS/TLS-WebCrypto/attestor-core 세 모듈의 resolution 실패를 로컬 정적 검사로 확인했다. 고정 Node의 `npm ci --prefix src/ybm-collector --ignore-scripts --no-audit --no-fund`로 기존 잠금 파일대로 설치했다. global Node·잠금 파일·기존 사용자 프로필은 변경하지 않았다. 새 launcher는 이 의존성을 저장/네트워크 시작 전에 검사하고 누락 시 `HACKERRANK_LAYOUT_DEPENDENCY_MISSING`만 표시한다.

새 worker/run의 실패 출력은 `HACKERRANK_LAYOUT_PHASE`의 고정 값으로 한정한다: STORAGE_RECOVERY, SESSION_CREATE, MANAGED_WORKER, ATTESTOR_CONNECT, LOCAL_ROUTE, CHROME_START, CHROME_TARGET, DASHBOARD_NAVIGATE, READY_WAIT, SOURCE_LAYOUT, TRANSPORT_CLEANUP, UNEXPECTED_TERMINATION. 예외 message/stack/path/host 응답은 출력하지 않는다. 기존 프로필 검색·일반 복구·볼륨 삭제·동시 진단을 추가하지 않았다. 설치 후에도 실제 연결/Chrome 정상 기동은 아직 확인하지 않았으므로 본부가 위 명령으로 한 번 단계 확인 후 사용자에게 로그인 필요 시점을 안내한다.

설치 후 세 모듈의 import를 `LOG_LEVEL=silent` 및 외부 네트워크 차단 아래 확인했다. SDK 기본 경고가 로컬 경로를 표시한 최초 점검은 무출력 설정으로 정정했다. 실제 client는 기존대로 SDK import 전에 LOG_LEVEL=silent와 quiet logger를 적용한다. 진단 합성14개/전체 HR108개 검사를 통과했으며 실제 접속 성공을 대신하지 않는다.

## Google 로그인 중계의 최소 허용

이 절은925e3d0 당시 기록이다. 현행 추가 허용은 아래 관측된3개 host 절을 따른다.

본부는 사용자가 선택한 Google 로그인에서 ERR_TUNNEL_CONNECTION_FAILED가 발생했고 기존 HR/hrcdn 전용 중계가 accounts.google.com의 CONNECT를 403으로 거부함을 확인했다. 이전 실행에는 ready를 입력하지 않았으며 본부가 close로 정리를 진행한다. 이 보고만으로 삭제 성공을 확정하지 않는다.

HR 형식 진단 경로만 정확한 `accounts.google.com:443` 중계를 추가했다. Google 전체 도메인·서브도메인·Google API·추측한 정적 host는 허용하지 않는다. 추가 정적 host의 필요는 확인되지 않아 추가하지 않았다. 기존 route 기본값과 YBM 경로는 수정하지 않았다. 로그인 권한·scope·SDK·사용자 보안 설정도 바꾸지 않았다.

이 허용은 TLS 중계만 위한 것이다. 관찰기의 고정 HackerRank dashboard/certificate 범위는 그대로이며 Google popup과 같은 탭 Google 응답 모두 본문 읽기 0건으로 검사한다. 실제 OAuth URL/state/code·사용자 화면·쿠키를 로그나 fixture로 복사하지 않는다.

수정 후 작은 합성 검사에서 exact Google CONNECT 허용, 유사 도메인·서브도메인·Google API/미확인 정적 host·비443 중계 거부, Google 본문/cookie/proof 접근 0을 확인한다. 실제 재실행은 본부가 기존 실행 정리를 확인한 뒤 위 고정 Node 명령으로 한 번 진행한다. 여기서는 브라우저를 열거나 사용자에게 로그인을 요청하지 않는다.

## Google ‘다음’ 무반응의 host 수준 근거

이 절은b193010의 진단 준비 기록이다. 실제 관측 결과와 현행 허용은 다음 절을 따른다.

본부의 후속 실행은 Google 로그인 화면을 열었으나 사용자가 ‘다음’이 동작하지 않는다고 보고했다. 원인이 정적 리소스 중계 403인지 계정 보안 제한인지는 아직 확정하지 않는다. 실제 OAuth URL·화면 원문·계정 정보는 기록하지 않는다.

새 진단은 기존 HR 전용 `allowHost` wrapper에서 **거부된 CONNECT** 중 다음 네 개의 고정 후보만 횟수를 센다: `ssl.gstatic.com`, `www.gstatic.com`, `fonts.gstatic.com`, `www.google.com`. 이 목록은 관측 후보이며 **중계 허용 목록이 아니다**. 앞의 세 개는 GOOGLE_STATIC_CANDIDATE, 마지막은 GOOGLE_RESOURCE_CANDIDATE로 표시한다. 모두 계속 거부하며 확인되지 않은 host를 추가 허용하지 않았다.

종료·정리 뒤 `scope:HACKERRANK_LAYOUT_LOGIN_TRANSPORT` 줄의 `deniedGoogleResources`에 host/category/count만 출력한다. 각 count는1000 상한, 최대4행이다. URL/path/query/header/body/계정정보와 다른 임의 host는 저장·출력하지 않는다. Google 본문·cookie·OAuth 응답·callback·proof 관찰은 계속0이며 기본 route/YBM도 변경하지 않았다. 빈 목록은 이 네 후보의 거부 근거가 없다는 뜻이고 다른 원인까지 배제하지 않는다. 거부 목록이 있어도 host만으로 해당 리소스가 필수 script임을 확정하지 않는다.

본부는 이전 실행 정리를 확인한 뒤 같은 명령으로 한 번 실행하고, 증상이 재현되면 ready를 입력하지 않고 close로 마친 뒤 위 요약만 확인한다. 이후 실제 거부 근거와 필요한 리소스를 대조해 정확한 host 하나의 허용 여부를 결정한다. 담당자는 별도 창을 열지 않았다. 합성 진단17개가 통과했고 임의 host 비보존·카운터 상한·run별 초기화·실제 wrapper 연결/종료 요약·기존 Google 관찰0을 확인했다. 실제 Google ‘다음’ 성공은 아직 미검증이다.

## 실제 관측된 세 로그인 연결의 허용

본부의 단일 진단은 Google 로그인 클릭만 수행한 뒤 ready 없이 종료했고, exit0/profilesDeleted=true/layouts={}를 보고했다. 개인정보 없는 실제 거부 CONNECT 요약은 `fonts.gstatic.com:1`, `www.google.com:17`, `www.gstatic.com:5`였다. 이메일 입력·원천 관찰·proof 생성은 없었다.

이 근거와 본부 지시에 따라 HR 형식 진단의 TLS 중계에 정확한 fonts.gstatic.com, www.gstatic.com, www.google.com을 추가했다. accounts.google.com과 합쳐 Google 관련 허용은 네 개의 exact host/443뿐이다. www.google.com을 정적 CDN으로 표현하지 않으며 횟수만으로 각 연결이 필수 script였다고 단정하지 않는다. Google 로그인 중 실제 거부된 연결을 허용하는 수정이고 정상 로그인 성공은 재시험 전 미확인이다. 미관찰 ssl.gstatic.com과 모든 다른 Google/Google API/서브도메인·유사도메인·비443은 계속 거부한다.

공식 attestor는 추가된 세 목적지로의 TLS 암호문과 목적지·연결 메타데이터도 중계한다. Google 본문/cookie/token/OAuth 응답/callback/proof는 관찰하지 않으며 ready 뒤 선택 HR dashboard/certificate 두 응답만 읽는다. 기본 route/YBM/P1 실제 collector와 로그인 SDK·권한·보안 설정은 바꾸지 않았다.

기존 진단17개를 대조해 네 exact CONNECT 허용, 유사 도메인/미관찰host/비443 거부, 네 Google host의 같은 탭/popup 본문/cookie/proof 접근0을 확인했다. 거부 진단은 계속 고정 후보 중 실제 거부된 host만 세며 허용된 세 host는 더 이상 거부 목록에 나오지 않는다. 여기서는 실제 브라우저를 열지 않았고 본부가 기존 고정 Node 명령으로 한 번 정상 로그인을 확인한다.
