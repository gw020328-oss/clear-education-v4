# 자체 Attestor 전용 TEST 실행

2026-10-30 후속. 공식 endpoint·registry·signer 경로는 유지한다. `prepare --self-attestor-test`로 **새 호스트**를 만든 경우만 자체 공증을 사용한다. 공식 403 뒤 자동 전환하지 않는다. 실제 계정 로그인·새 원천 수집·유료 AI·사용자 서명/지급은 이 구현 검증에 포함하지 않는다.

## 신뢰와 격리

- 실행 시작 시 고정 소스 bc36dac/SDK5.1.4 기반의 loopback 전용 공증자 자식 프로세스를 시작한다. 검토한 빌드 입력·번들 93개를 Git의 `build-pins.json`과 대조한다. 개인키는 자식 메모리에만 있고, 임의 signer/endpoint/키를 CLI·HTTP에서 받지 않는다. 인증되지 않은 WebSocket과 허용 목록 밖 호스트를 거부한다.
- 각 실행에 새 signer/auth 키/profileId를 생성한다. 프로필은 신뢰 설정 해시→서명 요청→불변 신청 매핑→새 체인에 결합한다. 기존 호스트·DB·체인·권리·서명·AI 승인 기록을 재사용하지 않는다. 공식 경로는 자체 프로필을 거부하고 자체 경로는 일치하지 않는 프로필·서명자를 거부한다.
- UI와 영수증의 `selfAttestor`는 자체 공증·공식 hosted 성공 아님·독립 공증 아님·BGP 검사 꺼짐을 명시한다. BGP 비활성 env는 자식에만 전달하며 공식 worker 환경을 바꾸지 않는다. loopback WebSocket의 IPC 인증 토큰을 로그나 HTTP에 노출하지 않는다.
- 신청/참가자/수취 지갑·collector claim owner·원천 pair·nonce·신선도·중복 소비 경계를 유지한다. 참가자의 Privy EOA, 운영자의 MetaMask, 운영자 회고 입력별 AI 승인, V2 수령인등록과 양측 지급 동의는 기존 절차 그대로다. 서비스가 가스를 내며 100 TEST에서 차감하지 않는다.

## 원천·로그인 정책

자체 시험은 정확히 `www.hackerrank.com`, `hrcdn.net`의 HTTPS CONNECT만 허용한다. 브라우저와 두 증명은 하나의 인증된 Attestor client를 사용한다. 로그인은 관리형 Chrome에서 본인이 직접 한다. 현재 범위는 HackerRank 자체 로그인이며 Google/GitHub OAuth 호스트는 허용하지 않는다. Google 로그인으로 Privy 지갑을 복구하는 절차와 HackerRank 로그인은 별도다.

익명 `https://www.hackerrank.com/auth/login` 공개 GET은 2026-10-30에 403이었다. 실제 관리형 Chrome 로그인 성공이나 전체 로그인 자산 호스트 목록을 입증한 결과가 아니다. 추가 호스트가 필요한 경우 실패 상태를 기록하고 코드 검토 후 목록을 갱신한다. wildcard·인증서 검사 해제·공식 경로 자동 fallback을 사용하지 않는다. 원천의 실제 형식 변경도 실패/보류 대상이다.

## 로그인 없는 리허설

`CLEAR_SELF_HTTPS_TEST=1`은 일회용 합성 CA와 HackerRank 이름의 HTTPS 서버를 **시험 자식 프로세스 안에서만** 사용한다. 원래 URL/SNI/인증서 검사를 유지하고 TCP 목적지를 합성 서버로 한정한다. 호스트 OS/Chrome의 DNS·CA·인증서 검증 설정은 변경하지 않는다. 인증 쿠키와 계정/인증서 내용은 모두 가상이다.

`CLEAR_SELF_PAYMENT_TEST=1`은 같은 실제 collector/private lease/live consumer를 합성 fixture 어댑터에서 소비한다. Moodle/회고/AI 결과와 두 EOA는 가상이며 제품의 실제 AI 결과 검증을 완화하지 않는다. 같은 신청과 매핑으로 V2 등록→양측 동의→새 Geth 체인→정확 100000000 atoms와 canonical receipt/중복 거부를 검사한다. 이는 실제 계정 자격·실제 AI 평가·사용자 지갑의 수령 성공이 아니다.

재현: 고정 Node 및 잠금 의존성 설치, 명시 Zod 패치 검증, `prepare.mjs --archive <검증 대상 고정 tarball>` 후 아래 두 명령을 별도 프로세스에서 실행한다. CI 전용 workflow도 이 두 시험을 명시 활성화한다.

```sh
LOG_LEVEL=silent CLEAR_SELF_HTTPS_TEST=1 ./tools/node --test tests/hackerrank-evidence/self-attestor-https.test.mjs
LOG_LEVEL=silent CLEAR_SELF_PAYMENT_TEST=1 ./tools/node --test tests/hackathon-test-vault/e5b/self-attestor-payment.test.mjs
```

## 실제 실행 준비와 사용자 단계

새 불변 소스 세대/최종 HEAD CI 확인 후 새 product bundle과 새 `--self-attestor-test` 호스트를 만든다. `check`는 로컬 빌드·Docker/Geth·관리형 Chrome·소유 Moodle·당일 가격 확인·기존 Gemini 키 소스 존재·새 HEAD에 결합한 운영자 AI 승인자 지정·새 프론트 지문을 검사한다. `check --registry`는 자체 시험에서 거부하며 공식 registry 검사와 혼동하지 않는다. 준비는 수집/AI/지급 실행이 아니다.

실제 실행 시 필요한 사용자 조작:
1. 새 로컬 호스트 CA만 신뢰하고 새 정확한 HTTPS origin을 Privy 허용 도메인에 등록한다. 합성 HTTPS용 CA는 설치하지 않는다. 기존 9457 로그인 호스트는 보존한다.
2. 명시 활성화로 열린 관리형 Chrome에서 HackerRank 본인 계정 로그인 후 READY를 입력한다. 추가 OAuth 호스트나 403이 있으면 여기서 멈춘다.
3. 참가자는 Google/Privy로 같은 지갑을 선택하고 새 로컬 체인 확인·CLEAR 로그인 서명·신청·원천 요청 서명을 수행한다. 운영자는 지정된 MetaMask 계정으로 새 로그인 서명을 한다.
4. 운영자는 해당 회고 원문 범위·모델·비용 안내를 읽고 **이번 입력 1회 승인**을 누른다. 승인자 지정만으로 호출하지 않는다.
5. 판정 후 참가자의 V2 수령인등록 서명, 양측의 동일 최종 판정 지급 동의를 확인한다. 서비스 제출 뒤 양쪽 화면에서 canonical 영수증·정확 100 TEST 수령을 읽는다.

## 남는 의존성·보장 한계

고정 Zod 공식 backport 적용과 viem2.57.13/엄격 peer 조합 및 typed-data 검사는 유지한다. Zod의 무제한 컬렉션/x402, decode-uri-component·uuid 경고는 남는다. 이 시험은 x402 지불, wallet funding URL decode, 동적 regex/임의 provider, AA/7702를 호출하지 않는다. 입력·RPC·증명 송수신 한도와 고정 recipe가 적용되지만 모든 SDK 의존성이 무위험이라는 의미는 아니다. native RE2가 없으면 SDK의 native RegExp 대체가 남으며 고정 정규식/응답 크기 제한에서 시험했다. 이 잔여 위험을 이유로 검증을 제거하거나 버전을 낮추지 않는다.

자체 공증자는 같은 기기·운영자가 통제하므로 독립 제3자 원천 보증을 제공하지 않는다. BGP 검사도 비활성이다. 이 명시 TEST 경로의 합성 검증에는 사용할 수 있지만 공식 hosted/운영 보장 또는 실자금 지급 인수 근거로 승격하지 않는다. 정상 100 TEST 실제 완주 뒤 조건 변경·Agent 고도화를 진행한다.
