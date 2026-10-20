# HackerRank 원천 형식 관찰 — 실행 전 인계

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

**외부 전달:** 실행 시작부터 `wss://attestor.reclaimprotocol.org:444/ws`에 연결한다. 새 Chrome의 허용된 HackerRank/hrcdn HTTPS 트래픽과 정확한 accounts.google.com 로그인 HTTPS 트래픽을 공식 attestor가 중계하므로 해당 목적지·연결 시각·암호문 트래픽 메타데이터를 볼 수 있다. Google 로그인 평문은 Google과 로컬 Chrome이 처리하며, 로컬 원천 관찰기는 Google 본문·쿠키·토큰·OAuth 응답·callback을 읽거나 증명하지 않는다. HackerRank 원천 관찰은 위 두 응답의 메모리 처리 범위로 한정한다. 이 진단에서는 `claimTunnel`이나 선택 공개 proof를 보내지 않는다. 나중 실제 proof 생성 단계에서 attestor에 공개되는 필드는 별도의 recipe 검토 대상이다. 현재 요약만으로 개인정보 비공개 보장이 검증됐다고 표시하지 않는다.

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

본부는 사용자가 선택한 Google 로그인에서 ERR_TUNNEL_CONNECTION_FAILED가 발생했고 기존 HR/hrcdn 전용 중계가 accounts.google.com의 CONNECT를 403으로 거부함을 확인했다. 이전 실행에는 ready를 입력하지 않았으며 본부가 close로 정리를 진행한다. 이 보고만으로 삭제 성공을 확정하지 않는다.

HR 형식 진단 경로만 정확한 `accounts.google.com:443` 중계를 추가했다. Google 전체 도메인·서브도메인·Google API·추측한 정적 host는 허용하지 않는다. 추가 정적 host의 필요는 확인되지 않아 추가하지 않았다. 기존 route 기본값과 YBM 경로는 수정하지 않았다. 로그인 권한·scope·SDK·사용자 보안 설정도 바꾸지 않았다.

이 허용은 TLS 중계만 위한 것이다. 관찰기의 고정 HackerRank dashboard/certificate 범위는 그대로이며 Google popup과 같은 탭 Google 응답 모두 본문 읽기 0건으로 검사한다. 실제 OAuth URL/state/code·사용자 화면·쿠키를 로그나 fixture로 복사하지 않는다.

수정 후 작은 합성 검사에서 exact Google CONNECT 허용, 유사 도메인·서브도메인·Google API/미확인 정적 host·비443 중계 거부, Google 본문/cookie/proof 접근 0을 확인한다. 실제 재실행은 본부가 기존 실행 정리를 확인한 뒤 위 고정 Node 명령으로 한 번 진행한다. 여기서는 브라우저를 열거나 사용자에게 로그인을 요청하지 않는다.

## Google ‘다음’ 무반응의 host 수준 근거

본부의 후속 실행은 Google 로그인 화면을 열었으나 사용자가 ‘다음’이 동작하지 않는다고 보고했다. 원인이 정적 리소스 중계 403인지 계정 보안 제한인지는 아직 확정하지 않는다. 실제 OAuth URL·화면 원문·계정 정보는 기록하지 않는다.

새 진단은 기존 HR 전용 `allowHost` wrapper에서 **거부된 CONNECT** 중 다음 네 개의 고정 후보만 횟수를 센다: `ssl.gstatic.com`, `www.gstatic.com`, `fonts.gstatic.com`, `www.google.com`. 이 목록은 관측 후보이며 **중계 허용 목록이 아니다**. 앞의 세 개는 GOOGLE_STATIC_CANDIDATE, 마지막은 GOOGLE_RESOURCE_CANDIDATE로 표시한다. 모두 계속 거부하며 확인되지 않은 host를 추가 허용하지 않았다.

종료·정리 뒤 `scope:HACKERRANK_LAYOUT_LOGIN_TRANSPORT` 줄의 `deniedGoogleResources`에 host/category/count만 출력한다. 각 count는1000 상한, 최대4행이다. URL/path/query/header/body/계정정보와 다른 임의 host는 저장·출력하지 않는다. Google 본문·cookie·OAuth 응답·callback·proof 관찰은 계속0이며 기본 route/YBM도 변경하지 않았다. 빈 목록은 이 네 후보의 거부 근거가 없다는 뜻이고 다른 원인까지 배제하지 않는다. 거부 목록이 있어도 host만으로 해당 리소스가 필수 script임을 확정하지 않는다.

본부는 이전 실행 정리를 확인한 뒤 같은 명령으로 한 번 실행하고, 증상이 재현되면 ready를 입력하지 않고 close로 마친 뒤 위 요약만 확인한다. 이후 실제 거부 근거와 필요한 리소스를 대조해 정확한 host 하나의 허용 여부를 결정한다. 담당자는 별도 창을 열지 않았다. 합성 진단17개가 통과했고 임의 host 비보존·카운터 상한·run별 초기화·실제 wrapper 연결/종료 요약·기존 Google 관찰0을 확인했다. 실제 Google ‘다음’ 성공은 아직 미검증이다.
