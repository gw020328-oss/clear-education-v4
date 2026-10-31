# Privy 내장 EOA 연결 준비

## 2026-10-30 후속 SDK 적용

[공식 Zod backport·viem 호환 검토](SDK_DEPENDENCY_REVIEW_20261030.ko.md)를 반영했다. 고정 lock 설치 뒤 `./tools/node tools/embedded-wallet/reviewed-dependencies.mjs --apply`를 명시 실행하고 빌드한다. 모든 Zod 복사본/ESM/CJS·실제 chunk 검사와 관련 회귀296개를 통과했다. viem2.57.13의 정상 wire 서명과 malformed struct 거부를 유지하며 v42로 소스 지문을 인수한다. 아래 미수정 검토/이전 audit 수치는 해당 시점 이력이다.

공식 Attestor의 정상 연결은 아직403이며 격리 self Attestor 공개 예제 성공은 공식 서비스/실제 지급 성공이 아니다. 실제 사용자 로그인·유료 AI·지갑 거래를 다시 실행하지 않았다. 기존 인증 호스트와 두 지갑은 보존하고 운영자 MetaMask의 입력별 AI 승인 지정을 유지한다.

2026-10-30: [SDK 의존성 재검토](SDK_DEPENDENCY_REVIEW_20261030.ko.md)를 우선한다. 새 설치/번들 및 관련 회귀230/230은 통과했으나 Zod 3 호환 배포 미반영과 viem peer 충돌은 남아 있다. 경고 없는 후보의 typed-data 검증 후퇴를 확인해 SDK/lock은 유지했다. 현재 audit은 영향31패키지(high20/moderate11)·고유 advisory6건이며 아래 이전 수치는 당시 기록이다. 운영자 MetaMask의 입력별 AI 승인 지정은 유지하며 실제 호출 승인을 대신하지 않는다.

최신 실행 결과: 독립 제품 화면 연결·로컬 준비 검사는 완료했지만 공식 Attestor WebSocket의 HTTP403으로 로그인 창 준비 전에 중단됐다. 실제 신청/증빙/AI/지급은 미실행이다. [실행 인계](PRODUCT_WALLET_RUN.ko.md)를 따른다.

2026-10-29 최신: 인증 전용 호스트에서 운영자 MetaMask SIWE/서버 역할은 사용자 스크린샷으로 확인했고 참가자 Privy SIWE/참가자 역할은 사용자 완료 보고를 받았다. 제품의 새 체인·새 세션에서는 별도 로그인한다. 이번 추가는 독립 제품 패널과 기존 normal-client/driver 연결, 서버 준비에서 온 독립 HR/V2 서명 문맥, 수령 지갑 등록 전 공개 calldata 안내, 같은 판정의 양측 동의, canonical 지급 영수증 조회다. 제품 체인의 브라우저 접근은 정확한 loopback/Origin·읽기 전용 RPC 중계로 제한한다. SDK의 임의 거래 전송은 연결하지 않는다. 정상 수집/지급 runner와 만료·동의·예치 조건은 유지한다. 실제 제품 증빙·등록·100 TEST 지급은 아직 완료되지 않았다.

`tools/node tools/embedded-wallet/build-product.mjs`는 기존 로그인 번들을 교체하지 않고 `var/embedded-wallet-products/`에 새 자산 묶음을 만든다. 그 자산을 normal-host의 검토된 webRoot로 지정해야 제품 패널이 열린다. `/clear-wallet-app.html`의 공개 App ID marker도 자산 지문에 포함된다. 기본 self-only CSP는 유지하고 명시적으로 인수한 해당 묶음의 두 역할 문서에만 SDK CSP를 적용한다. 제품 RPC는 해당 HTTPS 포트+2이며 내부 Geth RPC만 중계한다. 프론트 `web/` 인수는 여전히 별도다.

AI 외부 전송/비용 1회 승인자는 사용자가 운영자 MetaMask로 지정했다. 지정은 호출 승인이 아니며, 현재 입력에 대한 화면 확인·직접 승인 없이 AI는 실행하지 않는다.

아래 이전 날짜의 미완료 표현은 위 최신 상태와 함께 읽는다.

2026-10-29 · SDK 설치/번들 및 합성 경계 검증 완료 · 실제 Google 로그인·첫 지갑 생성·새로고침 후 동일 주소·로컬 RPC 확인 완료 · 동일 Google 재로그인 주소 복원·과거 운영자 내장 주소/로컬 확인은 사용자 보고 · 실제 SIWE/제품 연결 미완료.

실제 브라우저에서 Google 로그인 후 첫 생성 버튼이 숨겨지는 문제를 확인했다. SDK 3.51.0의 `useWallets.ready`는 외부 connector 준비도 포함하며, 외부 지갑을 끄면 초기화가 생략된다. 첫 생성 버튼은 인증된 사용자와 `privy.ready` 및 기존 내장 지갑 부재로 판단하도록 수정했다. 외부 지갑이 명시적으로 비활성인 snapshot에서만 aggregate ready 대신 현재 연결된 내장 지갑의 정확한 소유권·user/address/id/chain 매치를 요구한다. 외부 지갑 사용 시 기존 ready 요구를 유지하며, 실제 provider의 계정/체인 읽기와 EOA code 검증도 계속 수행한다. 82/82 합성 경계 시험, SDK 번들, 실제 선택 주소의 읽기 전용 probe 성공을 확인했다. 새로고침 직후 배경 탭에서는 지갑 연결이 지연됐으며, 탭을 전면에 둔 뒤 동일 주소가 복원됐다. 로그아웃 후 같은 Google 계정의 동일 주소 복원과 별도 프로필/Google 계정의 운영자 주소·로컬 확인 성공은 사용자가 보고했다. 당시 운영자 내장 지갑은 현재 완료 조건에서 제외한다. 실제 SIWE 서명·제품 지급은 아직 미검증이다.

기준은 develop `d44b01216241d120064145016a99d73b1b361e34`, 작업은 `codex/bootcamp-privy-sdk`다. PR60 원격 HEAD는 `a0620cd39fe5cd44b62a1deb5806883503242227`이며 팀원 로컬 작업을 인수한 것은 아니다. [Issue106 소유 경계·인수 요청](https://github.com/gw020328-oss/clear-education-v4/issues/106#issuecomment-6487251657)을 남겼다.

## 2026-10-29 지갑 역할 확정

사용자 확정: **참가자는 Privy 소셜 로그인/내장 EOA, 운영자는 당분간 MetaMask**다. 과거 운영자 내장 지갑 생성/로컬 확인은 준비 이력이며 현재 완료 조건이 아니다. 사용자가 이번에 명시한 MetaMask 주소를 별도 로컬 allowlist에 등록하고 새 인증 저장소·instance·chain으로 시작한다. 과거 운영자 주소/서명/권리/제품 DB를 치환하지 않는다.

- 참가자: `/onboarding`, 처음 사용한 동일 Google 계정/기존 내장 주소 → 명시 선택 → 로컬 확인 → CLEAR SIWE 직접 서명.
- 운영자: `/operator`, MetaMask가 설치된 기존 프로필 → EIP-6963에서 표시된 MetaMask 직접 연결 → 운영자 계정 하나만 허용 → 전체 주소 직접 선택 → 이번 로컬 체인 추가/전환 확인 → 운영자 SIWE 직접 서명. MetaMask 제공자 메타데이터는 탐색용 표시이며 권한 근거가 아니다. 주소/체인/제공자 변경과 늦은 서명은 기존 pinnedWallet/서버 세션 폐기 경계를 사용한다.
- 두 화면은 서로 다른 Chrome 프로필/쿠키 저장소에서 사용한다. MetaMask가 참가자용 프로필에만 설치돼 있다면 그 프로필을 운영자용으로 쓰고, 다른 프로필에서 참가자의 원래 Google 계정으로 로그인한다. 운영자용 Google 계정은 필요하지 않다.
- 역할은 서버 allowlist와 새 서명 검증 결과로만 정하며 각 화면의 기대 역할과 다르면 세션을 종료한다. 로컬 settings의 `authRoles`는 참가자/운영자 주소와 명시적 `operatorWalletKind: "metamask"`가 있어야 활성화된다. 과거 내장 운영자 설정은 그대로 활성화할 수 없다.
- MetaMask RPC 검증은 페이지 밖에서 호출될 수 있으므로 읽기 전용 loopback RPC는 정확한 Host/loopback 연결에서 Origin 없음 또는 정확한 MetaMask 확장 Origin도 허용한다. 일반 외부 웹 Origin과 거래/서명 RPC는 계속 거부한다. 참가자 SDK의 외부 지갑 옵션/CSP wildcard를 켜지 않는다.

현재 **82개 embedded + 99개 application = 181/181 PASS**, SDK bundle 성공. 실제 새 조합의 SIWE/HR/V2 서명·정상 지급은 사용자 실행 전이다.

## 범위와 상태

| 항목 | 이번 확인 | 남은 확인 |
| --- | --- | --- |
| SDK | `@privy-io/react-auth` 3.51.0, React 19.3.1, ethers 6.17.0, esbuild 0.28.2, 별도 npm lock | Google 로그인·첫 지갑 생성 확인, 로그아웃 후 동일 주소 복구는 사용자 보고 |
| 기존 서명 | 실제 CLEAR SIWE/HR/V2 codec/store에 합성 EOA provider 연결 | Privy 실제 사용자 서명 3종 |
| 계정 수명 | 명시 선택·주소/user/wallet/chain pin, 변경/취소·늦은 결과 폐기, 서버 역할 확인·logout revoke | 동일 계정 복원·다른 계정/두 프로필은 사용자 보고; 실제 SIWE 역할 확인 대기 |
| CSP | 독립 HTTPS 경로의 정확한 host/nonce·호스트 검증 | SDK frame/storage/CAPTCHA/스타일 실제 브라우저 관찰 |
| 로컬 네트워크 | 매 시작 새 임의 chainId, 별도 무계정 in-memory chain의 읽기 전용 loopback RPC | 실제 SDK provider·HTTP loopback RPC·EOA code 읽기 성공; 제품 체인은 별도 |
| 가스/지급 | 기존 V2 합성 계약 회귀의 서비스 제출·정확100 TEST 경로 통과 | 새 사용자 V2 실제 신청·등록·동의·canonical 지급 |
| 프론트 | 독립 onboarding + ESM adapter bundle | 팀원 최신 web/자산/adapter 인수, 제품 호스트 mount |

`web/`, 기존 normal-host의 self-only CSP, 제품 DB/체인/TEST 정책과 수집기는 변경하지 않았다. 공통 `src/application/http.mjs`에는 서버 설정 전용 선택적 `cookieNamespace`를 추가했다. 쿠키는 포트로 격리되지 않으므로 확인용 포트별 이름을 사용하며, 기본 제품 쿠키 이름/동작은 그대로다. 독립 host는 기본 `ONBOARDING_ONLY`에서 auth를 제공하지 않는다. 로컬 역할 설정이 있을 때만 `AUTH_LOCAL_TEST`에서 기존 서버의 nonce/verify/session/logout 4개 경로를 별도 저장소에 연결한다. 상품 신청·proof·지급 경로는 계속 404다. 이 host의 임시 chain을 제품 지급 runtime이나 r20 증거로 쓰지 않는다.

권장 모델은 인증/서명/복원 경계 Astra/High다. 이번 인증 경계 작업의 실제 실행 모델은 Astra이며 추론 설정은 도구로 재검증하지 않았다. 이후 확정 UI/API 연결 단위 권장은 Sol/Medium이다. 모델 변경을 위한 새 하위 세션은 만들지 않았다.

## 파일과 연결 계약

- `src/embedded-wallet/provider-boundary.mjs`: EIP1193 `eth_accounts`, `eth_chainId`, `personal_sign`, `eth_signTypedData_v4`만 호출. 65-byte EOA 복구, chain 고정, 전체 작업 기한·취소, provider 조회 hang·이벤트·SDK identity 변경 처리. signature는 호출 메모리에만 반환한다.
- `privy-adapter.mjs`: `walletChoices`를 표시하고 사용자가 선택한 `sdkUserId/walletId/address`로 `connectSelectedWallet`을 호출한다. 연결된 사용자 소유·비수입·비위임 Ethereum embedded wallet만 선택한다. v3 legacy wallet에 SDK ID가 없으면 `walletIdKind=local-locator`인 user/HD index/address 결합 식별자를 쓴다. 서버 wallet ID라고 주장하지 않는다.
- `clear-session.mjs`: `createClearSession`은 서버 발급 SIWE 전체 문자열을 origin/chain/instance/주소/nonce/time과 정확히 대조한 뒤 서명한다. role은 verify/session 응답에서만 받는다. 매 인증 요청 전에 현재 서버 세션·role/CSRF와 SDK 지갑을 검사한다. 이전 지갑 헤더로 서버 revoke하며 늦게 도착한 verify도 정리한다. 실패는 `UNKNOWN`; 특히 verify 응답 유실 후 empty-cookie401은 미전달 세션 폐기의 증거가 아니므로 계속 UNKNOWN이며 자동 재로그인을 차단한다. 이 경우 단순 revoke 재시도로 새 세션 발급 여부를 확정할 수 없어 서버측 조사/세션 만료 확인이 필요하다. 새 controller 로그인 전에 `logout/dispose/retryRevocation`의 확인이 필요하다. 새 로그인은 매번 새 SIWE이며 과거 cookie만으로 SDK identity를 복원하지 않는다.
- `approvals.mjs`: `createApprovalSigner.source(reviewed, expected)`는 collector 준비에서 받은 독립 `expectedClaimOwner` 및 신청/정책/mapping/trust/recipe/audience를 대조한다. 참가자 주소로 claim owner를 치환하지 않는다. `registration(reviewed, expected)`는 공개 calldata 안내를 포함한 기존 server packet과 독립 runtime의 contract/instance/chain/participant/정책/mapping을 대조한다. 현재 packet을 서명 전후 다시 읽는다. 두 메서드는 서명만 반환한다. 제출은 별도 명시 사용자 동작에서 기존 `createNormalBootcampClient`를 통해 진행하며 서버의 원래 session/nonce/expiry/CAS 검증을 유지한다.
- `config.mjs`: HTTPS 127.0.0.1/정확한 포트와 redirect, 하나의 custom chain 및 HTTP 127.0.0.1 RPC만 허용한다. mainnet·가짜 explorer·공개 RPC fallback이 없다.
- `onboarding.jsx`: Google 로그인·명시적 첫 지갑 생성·주소 선택·명시적 체인 확인·로그아웃을 제공한다. AUTH_LOCAL_TEST에서는 사용자가 누르는 CLEAR 로그인 서명 확인과 서버 역할 표시/세션 종료를 추가한다. 계정 변경·취소·재선택 시 이전 인증을 폐기하며 폐기 결과가 UNKNOWN이면 새 로그인을 차단한다. 로그인만으로 지갑을 추가 생성하지 않는다. 모든 SDK 지갑이 없어야 첫 생성 버튼을 제공한다. 과거 주소/권리의 자동 치환이나 지갑 transaction API 호출이 없다.
- `tools/embedded-wallet/`: 독립 번들 및 HTTPS 주소 확인 host. `tests/embedded-wallet/`: 아래 공개/합성 검증. CI는 전용 workflow이며 외부 계정/로그인은 실행하지 않는다.

제품 프론트 인수 시 `var/embedded-wallet-build/adapter.js`와 그 상대 chunk를 같은 출처로 제공해야 한다. bare npm import를 정적 web에 직접 넣지 않는다. SDK 훅 변경마다 `selectedIdentity`를 재검사하고 기존 controller를 무효화해야 한다. 로그인 중/서명 중/계정 전환 중 controller를 임의로 교체하지 않는다. `onInvalidate`에서 `session.invalidate()`를 연결하고 revoke가 확인되기 전 새 로그인·쓰기·서명을 차단한다. 새 host가 발급한 `instanceId`와 실제 chain/RPC를 bootstrap에 명시해야 하며 준비 host의 null 값이나 onboarding 임시 값을 복사하지 않는다. 이 제품 mount는 아직 인수 전이다.

SDK의 `disableAutomaticMigration`은 SDK 지갑 migration 제어이며 EIP7702 보장 옵션이라고 해석하지 않는다. 이 코드는 smart-wallet SDK, signer 위임, raw hash/transaction/7702 서명, sendTransaction을 호출하지 않는다. 주소 확인에서 chain code가 `0x`인지 검사한다. 실제 서명 경로·SDK 콘솔 설정은 별도 검증 전이다.

## 실행과 사용자 준비

저장소 루트에서 고정 tools/node·tools/npm을 사용한다.

```sh
./tools/npm ci --ignore-scripts
./tools/npm --prefix src/hackerrank-evidence ci --ignore-scripts
./tools/npm --prefix src/ybm-collector ci --ignore-scripts
./tools/npm --prefix src/embedded-wallet ci --ignore-scripts
./tools/npm --prefix src/embedded-wallet run build
./tools/node --test tests/embedded-wallet/*.test.mjs tests/application/*.test.mjs
./tools/node tools/embedded-wallet/onboarding.mjs init
./tools/node tools/embedded-wallet/onboarding.mjs start
```

`init`은 최초 1회만 실행하며 기존 디렉터리를 덮어쓰지 않는다. 로컬 `var/embedded-wallet-onboarding/settings.json`의 `appId`에 공개 App ID를 넣고 재시작한다. secret은 필요하지 않다. 런타임/인증서/번들은 Git에 넣지 않는다. `start`는 새 임시 chain을 만들며 이전 trial 체인/DB를 초기화하지 않는다. 종료는 해당 foreground 명령의 Ctrl-C다.

두 주소를 확인한 뒤 로컬 settings의 `authRoles`에 `participant`와 `operator`를 명시하면 AUTH_LOCAL_TEST를 연다. 실제 주소는 Git/공개 문서에 넣지 않는다. 매 시작 `auth-check-` 접두사의 새 임시 인증 저장소를 만들고 정상 종료/시작 실패 시 해당 실행이 만든 디렉터리를 삭제한다. 강제 종료 시 잔존할 수 있으며 다음 실행이 그 저장소를 재사용하지 않는다. 참가자 /onboarding과 운영자 /operator의 서로 다른 브라우저 프로필에서 새로고침 → 주소 선택 → 로컬 네트워크 확인 → **CLEAR 로그인 서명 확인**을 누르고 로컬 사이트/주소/로그인 메시지를 확인한다. 서버가 표시하는 참가자/운영자 역할을 각각 확인한다. 상품 동의·거래 전송은 포함하지 않는다.

| 설정 | 정확한 값/행동 |
| --- | --- |
| 외부 브라우저 | Chrome, `https://127.0.0.1:9457/onboarding` |
| 로컬 TLS | `var/embedded-wallet-onboarding/ca.pem`은 이번에 만든 공개 CA 인증서. 시스템 trust 자동 변경 없음. 최초 Chrome 접근은 `ERR_CERT_AUTHORITY_INVALID`로 중단됨. 사용자가 인증서를 직접 확인해야 하며 에이전트가 경고를 통과하지 않음 |
| Privy 앱 | 무료 개발 앱을 만들거나 선택. 공개 App ID만 설정 |
| Google | Login methods에서 Google 활성화, 첫 개발 시험은 Privy 기본 OAuth 자격증명 사용 |
| Allowed origin | `https://127.0.0.1:9457` (path·wildcard 없음). 정확한 IP/포트의 콘솔 수락 및 실제 로그인 확인 |
| OAuth redirect | `https://127.0.0.1:9457/onboarding` (trailing slash/query 없음) |
| wallet | 사용자 소유 Ethereum EOA, smart wallet/자동 추가 wallet/서버 위임 signer 사용하지 않음 |
| 참가자/운영자 | 참가자 Privy + 운영자 MetaMask, 별도 Chrome 프로필 → 사용자가 지정한 두 주소의 로컬 authRoles → 새 SIWE/서버 역할; 제품 host는 후속 |

자체 Google OAuth가 꼭 필요한 경우에만 별도 콘솔에서 callback `https://auth.privy.io/api/v1/oauth/callback`을 설정한다. client secret을 채팅/코드/브라우저에 넣지 않는다. 유료 요금제·공개 배포·RPC 터널은 이번 범위가 아니다. SDK 인증 토큰/복구 자료는 Privy SDK가 관리하며 CLEAR adapter는 이를 읽거나 저장하지 않는다. SDK 자체 브라우저 저장/복구 수명은 실제 로그인 검증에 포함한다.

## 검증과 미확인 사항

2026-10-29 로컬:

- 새 모듈 **82/82**: 기존73 + AUTH_LOCAL_TEST 세션/폐기1 + 격리 HTTPS 양측 역할/쿠키/재사용 거부1 + MetaMask 제공자 탐색/명시 주소/체인 설정/거부/교체/늦은 서명/취소7. 기존 application 회귀 **99/99**, 합계 **181/181** 통과. 역할 주입·미등록 주소·다른 브라우저·서명 재사용·지갑 변경·CSRF 누락·기본 제품 쿠키 사용을 거부하고 올바른 세션 종료를 확인한다. localhost TLS는 시험 전용 CA를 명시해 검증하며 TLS 검증을 끄지 않았다.
- 기존 회귀 **36/36**: `recipient-registration-v2.test.mjs`, `ui-session.test.mjs`, `recipient-registration.test.mjs`. 가짜 원천 및 새 인메모리 키/체인으로 V2 등록→별도 anycaller claim→100000000 atoms, 중복/권한/수락권리 경계를 검사한다. Privy 사용자 지급이 아니다.
- SDK production bundle 성공(전체 chunks 약7.2MiB), `verify:workspace` PASS, 기존191개 원본 지문 보존.
- 초기 이식 시험은 collector 패키지가 없는 새 checkout에서 import 오류로 실패했다. 고정 lock대로 의존성을 설치한 후 통과했다. 첫 hostile Host 검사는 Node TLS가 HTTP 전에 hostname 불일치를 잡아 실패했다. 시험 TLS servername을 인증서에 있는 localhost로 고정하여 TLS 검증을 유지하고 서버 Host403까지 확인했다. 경계나 만료 시간을 완화하지 않았다.
- 초기 시도에서는 인증서 경고/App ID 미입력으로 중단됐다. 이후 사용자 콘솔 설정·Google 로그인·지갑 생성, 새로고침 후 동일 주소 및 선택한 EOA/provider/RPC 성공을 브라우저에서 확인했다. 동일 Google 재로그인 복원과 별도 운영자 프로필/주소/로컬 확인은 사용자 보고다. 실제 SIWE 서명·새 제품 지급은 아직 0회이며 CI 결과는 PR의 정확한 HEAD checks를 따른다.

CI 후속: 50f7a82의 SDK/Mac/공개 이력 검사는 성공했으나 공개 합성 실행은 `STAGE_SOURCE_PIN`으로 실패했다. 공통 HTTP의 선택적 쿠키 namespace 변경을 기존 v38 소스 기록이 거부한 것이 원인이다. v1–v38 원본을 보존하고 v39에 `src/application/http.mjs` 한 파일의 전후 지문과 기본 인증/쿠키 동작 불변을 명시했다. 180개 현행 소스 지문 및 E4/E5 보존 검사, 소스 호환성/실행 회귀 83/83은 통과했으며 최신 CI 결과는 해당 PR HEAD에서 확인한다.

의존성 주의: 3.51.0 설치는 SDK 내부 `@privy-io/ethereum@0.2.5`의 viem2.56.5 peer와 SDK가 고정한2.57.8 차이를 경고한다. npm audit(omit dev)은 **31개 영향 패키지: high17/moderate14/critical0**를 보고했다. 이는31개 서로 다른 취약점이라는 뜻이 아니다. 직접 advisory는 zod의 대형 collection 메모리 소모, ws의 메모리/DoS, decode-uri-component의 malformed percent decode DoS, uuid buffer bounds다. zod3→4 강제 치환이나 audit의 오래된 Privy3.6.1 downgrade 권고를 검증 없이 적용하지 않았다. 외부 wallet 기능은 비활성이고 CSP로 해당 외부 host를 차단하지만 SDK 의존성 전체의 비도달성을 입증한 것은 아니다. **최종 채택/제품 병합 검토에는 이 의존성 위험 처리가 남아 있다.**

CSP는 `auth.privy.io` frame/connect, Cloudflare Turnstile script/frame 및 정확한 loopback RPC만 추가한다. SDK 스타일용 매 응답 nonce를 `sc-nonce` meta 및 scriptNonce에 제공한다. inline attribute 스타일은 차단한다. 로그인 UI에서 추가 CSP 위반이 있으면 실제 위반과 필요한 기능을 확인하며 wildcard/unsafe-inline/unsafe-eval로 해결하지 않는다. 기존 제품 host CSP는 변경하지 않았다.

## 실제 완료 관문

참가자의 Google 로그인·같은 내장 주소 복원과 운영자의 명시 MetaMask 주소·양측 fresh SIWE → 새 신청의 HR account/certificate proof pair·Moodle·이번 입력 AI 승인·네 조건 → 별도 V2 수령인 등록 공개 안내/직접 서명 → 동일 최신 판정에 양측 직접 동의 → 기존 서비스 REGISTER/ACCEPT 및 별도 anycaller CLAIM → canonical receipt/Transfer/잔액 증가100000000 atoms=100 TEST/중복거부를 확인한다. 참가자 ETH 충전과 TEST에서 가스 차감은 요구하지 않는다. 기존120초/1회/600초·수락권리를 유지한다. `INCLUDED/finalized=false`를 최종 확정으로 표시하지 않는다. 새 Reclaim/유료AI는 해당 입력 승인 시점 전까지 실행하지 않는다. r20 V1과 이번 V2/Privy 기록은 분리한다.

## 정상 지급 다음의 CLEAR 중단 검증

정상 지급 후 별도 새 신청에서 **수락·전액 배정되고 아직 미청구인 권리**를 준비한다. 이미 지급된 권리의 재청구 거부와 구분한다. 신청 ID/chain/contract/ABI/필요 승인 데이터는 중단 전 사용자가 독립 보관할 수 있게 하되 키·복구 문구·원본 개인정보는 포함하지 않는다. 사용자 키 내보내기/복구가 필요하면 사용자가 비공개 UI에서 직접 수행하고 에이전트·채팅·로그·산출물은 키를 수집하지 않는다.

| 시험 | 판정할 내용 | 현재 |
| --- | --- | --- |
| CLEAR 프론트/백엔드/승인 서버/relayer 중지 | 지원되는 독립 지갑 UI/독립 청구 페이지/사용자 직접 외부 복구 중 최소 경로로 미청구 권리 청구, receipt/Transfer/잔액 확인 | 미검증 |
| 새 브라우저·세션 만료 | CLEAR origin/session 없이 지갑 접근·서명·복구 가능 여부 | 미검증 |
| 중단 중 가스 | 독립 대납 또는 참가자 네이티브 시험 가스의 출처/소비 실측; 직접 청구와 무료 청구를 구분 | 미검증 |
| 자산 이동 | 소유 확인한 다른 본인 시험 주소로 명시적 전송, receipt/양측 잔액 확인 | 미검증 |
| 외부 의존성 | CLEAR 중단과 Privy/Google/RPC/독립 페이지 호스팅 중단을 구분; 로컬 Geth/RPC는 유지 | 미검증 |

수락 전/새 승인이 필요한 신청까지 독립 처리할 수 있다고 주장하지 않는다. 기존 nonce/domain/chain/만료/판정 버전/수령인/재사용 방지를 유지한다. 광범위 복구 기능은 PR125에 넣지 않고 정상 연결 이후 별도 작은 시험·다음 PR로 분리한다. 실제 자금·유료 가입·공개 배포는 제외한다.

## 근거

- [Privy EIP1193](https://docs.privy.io/wallets/using-wallets/ethereum/ethereum-provider), [custom chain](https://docs.privy.io/basics/react/advanced/configuring-evm-networks): custom chain 지원은 문서 확인. 문서의 explorer 필수 표현과 달리 이 버전 타입/번들에는 생략 가능하나 실제 SDK provider와 loopback RPC 확인은 성공했다.
- [CSP](https://docs.privy.io/security/implementation-guide/content-security-policy), [Google 기본 개발 OAuth](https://docs.privy.io/basics/get-started/dashboard/configure-login-methods), [origin](https://docs.privy.io/recipes/dashboard/allowed-domains), [redirect](https://docs.privy.io/recipes/react/allowed-oauth-redirects).
- [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [uuid advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq), [ws memory](https://github.com/advisories/GHSA-58qx-3vcg-4xpx), [ws DoS](https://github.com/advisories/GHSA-96hv-2xvq-fx4p), [decode advisory](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr).

- [MetaMask EIP-1193/제공자 API](https://github.com/MetaMask/metamask-docs/blob/main/metamask-connect/evm/reference/provider-api.md), [EIP-6963 명시 제공자 탐색](https://eips.ethereum.org/EIPS/eip-6963), [EIP-3326 체인 전환](https://eips.ethereum.org/EIPS/eip-3326).


## 2026-10-31 제품 대기 응답 연결 보정

실제 자체 Attestor 시험에서 참가자 SIWE·원천 승인과 계정/인증서 자체 서명 검증을 완료했고, 실행기는 회고 AI 승인 준비까지 도달했다. 공식 hosted 공증 또는 실제 지급 완료를 뜻하지 않는다. AI 유료 호출과 지급은 이 실행에서 완료하지 않았다.

제품 화면이 사용하는 application API 전송기는 `{code}` 오류만 처리하지만 normal 실행기의 준비 전 procedure 조회는 HTTP 409 `{error:"BC_NORMAL_PROCEDURE_NOT_READY"}`를 반환한다. 기존 driver가 이 정상 대기를 operations 조회로 전환하기 전에 코드가 `API_REQUEST_FAILED`로 바뀌어 AI 승인 자료까지 지워졌다.

보정은 GET `/bootcamp/v3/applications/:id/procedure`의 정확한 409/고정 오류 코드에만 적용한다. 이때 기존 operations 조회와 AI 승인 표시가 유지되며 자동 승인은 없다. 다른 경로·POST·상태 코드·알 수 없는 오류는 기존 실패 처리, 승인 자료 폐기와 지급 차단을 유지한다. 원천/AI 만료, 양쪽 화면 조회, 수령인 서명, 지급 동의 및 금액은 변경하지 않는다.

회귀 시험은 실제 제품 HTTP 전송기를 거쳐 정상 대기 → operations 조회 → AI 자료 표시 → 명시 승인 기록을 검사한다. 합성 입력만 사용하며 모델 호출·키 읽기 0회다. 실제 오류에서 승인 자료 폐기와 지급 차단도 검사한다. 실행 중이던 기존 불변 번들을 교체하지 않으며, 새 번들·새 시험으로 실제 지급은 별도 확인해야 한다.


## 2026-10-31 원천 유효시간과 사용자 검토 분리

정상 시험 호스트는 원천별 최초 요청에서 900초 상한을 고정한다. 로그인 준비에 걸린 시간으로 이 상한을 단축하지 않는다. 실제 원천/인증/원문/요청 lease가 더 짧으면 그 기한이 우선한다. Moodle 소비자의 기본 240/300초 설정은 다른 호출자에 대해 유지하며 정상 호스트만 900초를 지정한다. 새로 생성된 `.review900` 원천 버전만 원장과 지급 전 검증의 Moodle 관찰 나이 상한을 900초로 일치시킨다. 기존 버전 자료는 300초 상한을 유지한다.

AI 승인 기한은 정확한 입력 준비 후 300초와 원천 만료 145초 전 중 빠른 시각이다. 조회나 재시도로 이 기한을 갱신하지 않는다. 지급 판정 게시 후 검토 상한은 기존 600초이며 원천 기한과 정산 여유 30초를 넘지 않는다. 따라서 5분/10분은 상한이며 항상 보장되는 대기시간은 아니다. 화면은 AI 승인 남은 초, 원천 만료 시각, 지급 검토 남은 초를 따로 표시한다.

기존 더 짧은 sourceValidUntilExclusive는 그대로 유효하며 새 상한으로 늘려 해석하지 않는다. 판정 변경·정확 입력 승인·단일 호출·nonce/중복/재사용 검사 및 지급 직전 만료 검사를 유지한다. 새 실제 로그인·모델 호출·지급 성공을 이 변경의 근거로 주장하지 않는다.
