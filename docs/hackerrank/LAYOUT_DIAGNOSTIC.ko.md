# HackerRank 원천 형식 관찰 — 실행 전 인계

2026-10-20. 정상 시연의 실제 recipe 검토 입력을 얻는 최소 진단이다. **명령은 준비됐지만 실제 로그인·실제 본문 관찰·hosted proof는 아직 실행하지 않았다.** 본부가 사용자에게 한 번 안내한 뒤 실행한다. UNCONFIGURED trust를 변경하거나 synthetic recipe를 실제 recipe로 승격하지 않는다.

## 정확한 실행 방법

소유 작업본 `workspaces/clear-hackerrank-bootcamp`에서 고정 Node 24.21.0과 기존 설치된 root/ybm-collector/hackerrank-evidence 의존성을 사용한다. Apple Silicon Mac, 설치된 Chrome, FileVault 및 기존 관리형 저장 정책이 선행 조건이다.

```sh
./tools/node src/hackerrank-evidence/layout-launch.mjs
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

**외부 전달:** 실행 시작부터 `wss://attestor.reclaimprotocol.org:444/ws`에 연결한다. 새 Chrome의 허용된 HackerRank/hrcdn HTTPS 트래픽을 공식 attestor가 중계하므로 목적지·연결 시각·암호문 트래픽 메타데이터를 볼 수 있다. 로그인 요청/응답의 평문은 HackerRank, 로컬 Chrome 및 이 로컬 관찰기의 처리 범위다. 이 진단에서는 `claimTunnel`이나 선택 공개 proof를 보내지 않는다. 나중 실제 proof 생성 단계에서 attestor에 공개되는 필드는 별도의 recipe 검토 대상이다. 현재 요약만으로 개인정보 비공개 보장이 검증됐다고 표시하지 않는다.

**비용:** 이 진단에는 모델 호출, 결제 API, app ID/secret, 구매/가입 자동화가 없다. 공개 attestor의 현재 접근 허용·요금·서비스 제한은 확인하지 못했으므로 무료라고 단정하지 않는다. 인증/결제 요구로 실패하면 그대로 중단한다. 승인 예산을 재사용하거나 개인 키/계정을 찾아 우회하지 않는다. [공식 attestor 인증 설명](https://docs.reclaimprotocol.org/manual/inapp-sdks/advanced/attestor-auth)은 private attestor의 인증·허용 도메인 설정을 설명하며 공개 endpoint의 무료 사용을 보증하지 않는다.

## 결과 해석과 다음 한 단계

항상 `proofVerified:false`, `authenticatedAccountControlProven:false`, `requestBound:false`, `apiAcceptance:HOLD`, `paymentAllowed:false`다. 계정 JSON 경로와 certificate 필드 구조가 보여도 계정 통제·전체 목록 완전성·동일 계정 결합·공식 서명은 증명되지 않는다. 실제 관찰 결과를 바탕으로 로그인된 계정 원천의 의미와 recipe를 검토하고, registry signer/epoch 및 hosted context를 별도로 확인해야 한다. 이번 출력은 실제 수집 API의 lease나 candidate가 아니므로 수락할 수 없다. 기존 신청/owner/nonce/current/expiry/privacy 조건은 유지된다.

## 검증

`LOG_LEVEL=silent ./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/hackerrank-evidence/*.test.mjs`

108 PASS, FAIL/CANCELLED/SKIPPED 0. 이 중 신규 진단 14개는 합성 본문·가짜 browser transport로 ready 이전/경로 밖 접근 금지, 원문 없는 요약, redirect/cache/오류 거부, 진행 중 읽기의 정리 대기, 전체 transport 정리, worker 밖 실행 거부를 확인했다. launcher/worker 구문 검사를 통과했다. 실제 Mac 실행/로그인/정리 통합 결과를 대신하지 않는다.

코드 리뷰에서 취소 신호가 먼저 CDP를 닫아 정상 정리를 실패시키는 순서를 발견해, 관찰 중지 후 transport 취소 순서로 수정했다. 실제 Chrome과 같은 abort-sensitive 가짜 transport로 정상 종료를 검증했고, 이미 취소된 채널에는 CDP 명령을 추가 발행하지 않으며 브라우저 정리 실패 뒤에도 route/client 정리를 계속하는 검사를 추가했다.
