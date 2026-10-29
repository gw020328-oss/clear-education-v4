# Privy 내장 EOA 연결 준비

2026-10-29 · SDK 설치/번들 및 합성 경계 검증 완료 · 실제 Google 로그인·첫 지갑 생성·새로고침 후 동일 주소·로컬 RPC 확인 완료 · 동일 Google 재로그인 주소 복원·별도 운영자 주소/로컬 확인은 사용자 보고 · 실제 SIWE/제품 연결 미완료.

실제 브라우저에서 Google 로그인 후 첫 생성 버튼이 숨겨지는 문제를 확인했다. SDK 3.51.0의 `useWallets.ready`는 외부 connector 준비도 포함하며, 외부 지갑을 끄면 초기화가 생략된다. 첫 생성 버튼은 인증된 사용자와 `privy.ready` 및 기존 내장 지갑 부재로 판단하도록 수정했다. 외부 지갑이 명시적으로 비활성인 snapshot에서만 aggregate ready 대신 현재 연결된 내장 지갑의 정확한 소유권·user/address/id/chain 매치를 요구한다. 외부 지갑 사용 시 기존 ready 요구를 유지하며, 실제 provider의 계정/체인 읽기와 EOA code 검증도 계속 수행한다. 75/75 합성 경계 시험, SDK 번들, 실제 선택 주소의 읽기 전용 probe 성공을 확인했다. 새로고침 직후 배경 탭에서는 지갑 연결이 지연됐으며, 탭을 전면에 둔 뒤 동일 주소가 복원됐다. 로그아웃 후 같은 Google 계정의 동일 주소 복원과 별도 프로필/Google 계정의 운영자 주소·로컬 확인 성공은 사용자가 보고했다. 실제 SIWE 서명·제품 지급은 아직 미검증이다.

기준은 develop `d44b01216241d120064145016a99d73b1b361e34`, 작업은 `codex/bootcamp-privy-sdk`다. PR60 원격 HEAD는 `a0620cd39fe5cd44b62a1deb5806883503242227`이며 팀원 로컬 작업을 인수한 것은 아니다. [Issue106 소유 경계·인수 요청](https://github.com/gw020328-oss/clear-education-v4/issues/106#issuecomment-6487251657)을 남겼다.

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

두 주소를 확인한 뒤 로컬 settings의 `authRoles`에 `participant`와 `operator`를 명시하면 AUTH_LOCAL_TEST를 연다. 실제 주소는 Git/공개 문서에 넣지 않는다. 매 시작 `auth-check-` 접두사의 새 임시 인증 저장소를 만들고 정상 종료/시작 실패 시 해당 실행이 만든 디렉터리를 삭제한다. 강제 종료 시 잔존할 수 있으며 다음 실행이 그 저장소를 재사용하지 않는다. 각 브라우저 프로필에서 새로고침 → 주소 선택 → 로컬 네트워크 확인 → **CLEAR 로그인 서명 확인**을 누르고 로컬 사이트/주소/로그인 메시지를 확인한다. 서버가 표시하는 참가자/운영자 역할을 각각 확인한다. 상품 동의·거래 전송은 포함하지 않는다.

| 설정 | 정확한 값/행동 |
| --- | --- |
| 외부 브라우저 | Chrome, `https://127.0.0.1:9457/onboarding` |
| 로컬 TLS | `var/embedded-wallet-onboarding/ca.pem`은 이번에 만든 공개 CA 인증서. 시스템 trust 자동 변경 없음. 최초 Chrome 접근은 `ERR_CERT_AUTHORITY_INVALID`로 중단됨. 사용자가 인증서를 직접 확인해야 하며 에이전트가 경고를 통과하지 않음 |
| Privy 앱 | 무료 개발 앱을 만들거나 선택. 공개 App ID만 설정 |
| Google | Login methods에서 Google 활성화, 첫 개발 시험은 Privy 기본 OAuth 자격증명 사용 |
| Allowed origin | `https://127.0.0.1:9457` (path·wildcard 없음). 정확한 IP/포트의 콘솔 수락 및 실제 로그인 확인 |
| OAuth redirect | `https://127.0.0.1:9457/onboarding` (trailing slash/query 없음) |
| wallet | 사용자 소유 Ethereum EOA, smart wallet/자동 추가 wallet/서버 위임 signer 사용하지 않음 |
| 참가자/운영자 | 서로 다른 계정·브라우저 프로필로 두 주소 확인 → 별도 로컬 authRoles 설정 → SIWE/서버 역할 확인; 제품 host 활성화는 후속 |

자체 Google OAuth가 꼭 필요한 경우에만 별도 콘솔에서 callback `https://auth.privy.io/api/v1/oauth/callback`을 설정한다. client secret을 채팅/코드/브라우저에 넣지 않는다. 유료 요금제·공개 배포·RPC 터널은 이번 범위가 아니다. SDK 인증 토큰/복구 자료는 Privy SDK가 관리하며 CLEAR adapter는 이를 읽거나 저장하지 않는다. SDK 자체 브라우저 저장/복구 수명은 실제 로그인 검증에 포함한다.

## 검증과 미확인 사항

2026-10-29 로컬:

- 새 모듈 **75/75**: 기존73 + AUTH_LOCAL_TEST 세션/폐기1 + 격리 HTTPS 양측 역할/쿠키/재사용 거부1. 기존 application 회귀 **99/99**, 합계 **174/174** 통과. 역할 주입·미등록 주소·다른 브라우저·서명 재사용·지갑 변경·CSRF 누락·기본 제품 쿠키 사용을 거부하고 올바른 세션 종료를 확인한다. localhost TLS는 시험 전용 CA를 명시해 검증하며 TLS 검증을 끄지 않았다.
- 기존 회귀 **36/36**: `recipient-registration-v2.test.mjs`, `ui-session.test.mjs`, `recipient-registration.test.mjs`. 가짜 원천 및 새 인메모리 키/체인으로 V2 등록→별도 anycaller claim→100000000 atoms, 중복/권한/수락권리 경계를 검사한다. Privy 사용자 지급이 아니다.
- SDK production bundle 성공(전체 chunks 약7.2MiB), `verify:workspace` PASS, 기존191개 원본 지문 보존.
- 초기 이식 시험은 collector 패키지가 없는 새 checkout에서 import 오류로 실패했다. 고정 lock대로 의존성을 설치한 후 통과했다. 첫 hostile Host 검사는 Node TLS가 HTTP 전에 hostname 불일치를 잡아 실패했다. 시험 TLS servername을 인증서에 있는 localhost로 고정하여 TLS 검증을 유지하고 서버 Host403까지 확인했다. 경계나 만료 시간을 완화하지 않았다.
- 초기 시도에서는 인증서 경고/App ID 미입력으로 중단됐다. 이후 사용자 콘솔 설정·Google 로그인·지갑 생성, 새로고침 후 동일 주소 및 선택한 EOA/provider/RPC 성공을 브라우저에서 확인했다. 동일 Google 재로그인 복원과 별도 운영자 프로필/주소/로컬 확인은 사용자 보고다. 실제 SIWE 서명·새 제품 지급은 아직 0회이며 CI 결과는 PR의 정확한 HEAD checks를 따른다.

의존성 주의: 3.51.0 설치는 SDK 내부 `@privy-io/ethereum@0.2.5`의 viem2.56.5 peer와 SDK가 고정한2.57.8 차이를 경고한다. npm audit(omit dev)은 **31개 영향 패키지: high17/moderate14/critical0**를 보고했다. 이는31개 서로 다른 취약점이라는 뜻이 아니다. 직접 advisory는 zod의 대형 collection 메모리 소모, ws의 메모리/DoS, decode-uri-component의 malformed percent decode DoS, uuid buffer bounds다. zod3→4 강제 치환이나 audit의 오래된 Privy3.6.1 downgrade 권고를 검증 없이 적용하지 않았다. 외부 wallet 기능은 비활성이고 CSP로 해당 외부 host를 차단하지만 SDK 의존성 전체의 비도달성을 입증한 것은 아니다. **최종 채택/제품 병합 검토에는 이 의존성 위험 처리가 남아 있다.**

CSP는 `auth.privy.io` frame/connect, Cloudflare Turnstile script/frame 및 정확한 loopback RPC만 추가한다. SDK 스타일용 매 응답 nonce를 `sc-nonce` meta 및 scriptNonce에 제공한다. inline attribute 스타일은 차단한다. 로그인 UI에서 추가 CSP 위반이 있으면 실제 위반과 필요한 기능을 확인하며 wildcard/unsafe-inline/unsafe-eval로 해결하지 않는다. 기존 제품 host CSP는 변경하지 않았다.

## 실제 완료 관문

두 계정의 Google 로그인·같은 주소 복원·fresh SIWE → 새 신청의 HR account/certificate proof pair·Moodle·이번 입력 AI 승인·네 조건 → 별도 V2 수령인 등록 공개 안내/직접 서명 → 동일 최신 판정에 양측 직접 동의 → 기존 서비스 REGISTER/ACCEPT 및 별도 anycaller CLAIM → canonical receipt/Transfer/잔액 증가100000000 atoms=100 TEST/중복거부를 확인한다. 참가자 ETH 충전과 TEST에서 가스 차감은 요구하지 않는다. 기존120초/1회/600초·수락권리를 유지한다. `INCLUDED/finalized=false`를 최종 확정으로 표시하지 않는다. 새 Reclaim/유료AI는 해당 입력 승인 시점 전까지 실행하지 않는다. r20 V1과 이번 V2/Privy 기록은 분리한다.

## 근거

- [Privy EIP1193](https://docs.privy.io/wallets/using-wallets/ethereum/ethereum-provider), [custom chain](https://docs.privy.io/basics/react/advanced/configuring-evm-networks): custom chain 지원은 문서 확인. 문서의 explorer 필수 표현과 달리 이 버전 타입/번들에는 생략 가능하나 실제 SDK provider와 loopback RPC 확인은 성공했다.
- [CSP](https://docs.privy.io/security/implementation-guide/content-security-policy), [Google 기본 개발 OAuth](https://docs.privy.io/basics/get-started/dashboard/configure-login-methods), [origin](https://docs.privy.io/recipes/dashboard/allowed-domains), [redirect](https://docs.privy.io/recipes/react/allowed-oauth-redirects).
- [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [uuid advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq), [ws memory](https://github.com/advisories/GHSA-58qx-3vcg-4xpx), [ws DoS](https://github.com/advisories/GHSA-96hv-2xvq-fx4p), [decode advisory](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr).
