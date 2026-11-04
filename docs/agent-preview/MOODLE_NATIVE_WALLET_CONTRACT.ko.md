# Moodle 원 탭 지갑 연결 후보 v1

2026-11-04 사용자 정정에 따라 별도 CLEAR 업무 화면을 제거하는 후보다. 기존 실행을
바꾸거나 완료한 지급을 다시 실행하지 않는다. 이 문서는 지갑 화면 계약과 합성 후보를
고정한다. 사업 변경 권한 연결, 실제 Moodle 설치, Google/MetaMask 실제 검증은 미완료다.

## 소유권과 진입점

- A는 `src/embedded-wallet/moodle-native*.mjs`, `moodle-native.jsx`,
  `moodle-oauth-return.jsx`, `tools/bootcamp/moodle-front-door.mjs`,
  `moodle-oauth-return.mjs`를 소유한다. C의 `plugins/moodle/**`는 수정하지 않는다.
- 고정 ESM URL은 `/clear-assets/moodle-native.js`다. 빌드에서 생긴 의존 chunk도
  검토된 asset inventory에서만 제공한다. `mountCourseWallet({element,config,onState})`
  는 C DOM을 교체하지 않고 provider modal host만 추가한다.
- 반환값은 `dispatch(command)`, 비동기 `destroy()`뿐이다. provider, 서명 함수,
  CLEAR CSRF/token, 일반 URL request 함수를 C UI에 내주지 않는다.
- mount, SDK 복귀, refresh는 지갑 선택/체인 변경/서명/finish를 자동 실행하지 않는다.

## mount 설정과 표시 계약

`config`는 `appId, origin, redirectUri, phase, chainId, rpcUrl, instanceId, surface,
role, courseId, sesskey`다. `surface=MOODLE_NATIVE`, phase는 기존
`ACTIVE_LOCAL_TEST`, origin은 owner가 고정한 HTTPS loopback Moodle origin이다.
`redirectUri=origin + '/local/clearbridge/wallet-return'`이다.
`role=participant|operator`는 표시용이며 서버 역할 확인을 대신하지 않는다.
`courseId`는 현재 C 강좌의 양의 정수이고 `sesskey`는 현재 C 페이지에서만 공급한다.
sesskey는 C `login_action.php` POST form body에만 들어간다. PrivyProvider 설정,
A API body/header, onState, 저장소, 로그에 포함하지 않는다.

정확한 키/enum/extra field 거부 코드는
`src/embedded-wallet/moodle-native-contract.mjs`가 정본이다.

| 구분 | 값 |
| --- | --- |
| version | `clear-moodle-wallet-view.1` |
| role | `participant`, `operator` |
| phase | `IDLE`, `CONNECTING`, `CHOOSING`, `SELECTED`, `CHECKING_NETWORK`, `NETWORK_READY`, `SIGNING_IN`, `AUTHENTICATED`, `CONNECTION_PENDING`, `CONFIRMING_CONNECTION`, `CONNECTED`, `REVOKING`, `CANCELLED`, `EXPIRED`, `ERROR`, `CLOSED` |
| providers | exact `{providerId}` 배열, 참가자는 항상 빈 배열 |
| choices | exact `{choiceId,address}` 배열 |
| selectedChoiceId | 미선택 `null`, 또는 현재 choices의 selector |
| busy/networkReady/authenticated | boolean |
| allowedActions | 아래 명시 action 문자열의 중복 없는 배열, 화면용 |
| error | `null` 또는 exact `{code,outcome}` |

code는 `UNAVAILABLE, BUSY, INVALID_COMMAND, STALE_SELECTION, WALLET_REJECTED,
WALLET_CHANGED, NETWORK_UNAVAILABLE, AUTH_REQUIRED, ROLE_CHANGED, EXPIRED,
CANCELLED, REVOCATION_UNKNOWN` 중 하나다. outcome은 `NOT_SENT, REJECTED, UNKNOWN`이다.
오류 원문/SDK 사용자 ID/provider 객체는 표시하지 않는다.

명령은 `{action:'connect-google'}`, `{action:'connect-metamask',providerId}`,
`{action:'select-wallet',choiceId}`, `{action:'check-network'}`, `{action:'sign-in'}`,
`{action:'finish-connection'}`, `{action:'cancel'}`, `{action:'sign-out'}`다.
selector는 현재 controller 세대에서만 쓰는 불투명 식별자다. 취소/계정 변경/세션
종료/destroy 이후 이전 selector와 늦은 provider 결과는 사용하지 않는다.

## 원 Moodle 연결 처리 순서

Google 인증은 SDK가 실행되는 Moodle 원 탭에서 명시 connect-google로 시작한다.
Google 인증 후 선택·네트워크 확인을 끝내고 sign-in을 누른 시점부터 아래 연결을
시작한다. Google 인증 대기 시간에는 Moodle 연결 grant를 발급하지 않는다.

1. 동일 origin `POST /moodle/connect/bootstrap`, exact `{}`. A는 기존 bootstrap
   cookie를 `HttpOnly; Secure; SameSite=Strict; Path=/`로 설정하고 exact
   `{challenge,expiresAtExclusive}`를 반환한다. TTL 최대 120초다.
2. C `POST /local/clearbridge/login_action.php`에 form exact
   `{id,sesskey,operation:'start',challenge}`. C는 실제 로그인/등록/역할/전체 고정
   scope와 원 PHP session을 확인하고 기존 C→D→A private HMAC 요청 및 A→C
   pinned TLS/HMAC 역검증을 사용한다. 기존 wire DTO/5초 lease를 바꾸지 않는다.
3. C 응답 exact `{status:'WAITING',expiresAtExclusive,launchCode,browserProof,finishProof}`.
   finishProof는 원 controller closure 전용이다.
4. A `POST /moodle/connect/redeem`, exact `{code,challenge,browserProof}`와 bootstrap
   cookie. 기존 `intents.redeem`의 proof, challenge, 실행, intent, 만료, 단회 소비를
   그대로 적용한다. native 모드 응답은 redirect 대신 exact
   `{status:'WAITING',role,expiresAtExclusive}`이며 browser binding 쿠키만 발급한다.
   native 모드는 origin=moodleOrigin일 때만 생성할 수 있다.
5. 기존 `createClearSession`의 nonce→선택 지갑 SIWE→verify→session 검증을 사용한다.
   메시지 origin/chain/instance/address는 기존 validator가 검사한다. 서버 역할이
   현재 화면 역할과 다르면 세션을 폐기한다.
6. `POST /auth/moodle-complete {}`는 기존 CLEAR 세션과 browser binding으로
   `AUTHENTICATED_PENDING_MOODLE`를 만든다. pending TTL 최대 60초다.
7. 원 Moodle 탭의 명시 finish-connection은 C form exact
   `{id,sesskey,operation:'finish',finishProof}`. C는 기존 status→handback 확인→finish를
   수행한다. 원 PHP session/전체 scope/지갑/실행/만료/단회 소비가 그대로 적용된다.
8. finish 응답 유실은 C status만 조회하며 finish를 재전송하지 않는다. 확인되지
   않은 성공을 CONNECTED로 표시하지 않는다. 취소/종료 후 proof를 폐기한다.

`AUTHENTICATED`와 `CONNECTED`는 표시 사실이다. 이 값이나 client role만으로
신청/AI 호출/등록/동의/지급을 허용하지 않는다.

## HTTPS front door와 CSP

현재 후보는 설정만으로 listener를 열지 않는다. owner가 정확한 경로·메서드·query
키 목록을 공급하고 A handler 및 고정 private C upstream handler를 결합해야 한다.
unknown/encoded path, dot segment, 중복 query, 임의 redirect, 공개 역권한 callback은
거부한다. browser Host/Origin은 확정된 HTTPS origin과 같아야 한다. 전달된
X-Forwarded-*를 권한 판단에 사용하지 않는다.

- A에는 `__Host-clear-*`만, C에는 설정된 `MoodleSession`만 전달한다. C 요청에서
  CLEAR CSRF/wallet/chain/Authorization을 제거한다. A에는 MoodleSession을 보내지 않는다.
- Set-Cookie도 소유자를 검사한다. A의 __Host 쿠키는 Secure/HttpOnly/Strict/Path=/,
  C 쿠키는 Secure/HttpOnly/Lax 또는 Strict/Path=/, 두 소유자 모두 Domain 금지다.
- same-origin은 양쪽 프론트를 같은 신뢰 영역에 둔다. 위 필터는 두 JS 실행
  환경이 서로 격리된다는 주장이 아니다. C 최신 권한과 CLEAR 서명 검증이 필요하다.
- 정확한 C native 문서 `/local/clearbridge/index.php`, `/local/clearbridge/configure.php`
  에만 요청별 `randomBytes(24).toString('base64')` nonce를 만든다. caller가 보낸
  `x-clear-document-nonce`는 폐기하고 private C handler에 새 값을 전달한다.
- nonce 형식은 `/^[A-Za-z0-9+/]{32}$/`. C가 생성하는 신뢰 requirements 조각, meta
  `sc-nonce`, 고정 module 태그가 같은 값을 사용한다. A 최종 CSP는
  `embeddedCsp(nonce,rpcUrl)`다. 임의 Moodle HTML 전체에 nonce를 추가하지 않는다.
- C의 page/requirements 하위 클래스 최소 적용 및 실제 CSP 브라우저 검사는
  C 후보와 별도로 조립해야 한다. core 전체 수정, unsafe-inline/eval은 이 후보에 없다.

## OAuth callback

고정 SDK `@privy-io/react-auth@3.51.0`의 `initLoginWithHeadlessOAuth`는
`window.location.assign`을 호출하고 `customOAuthRedirectUrl`을 사용한다.
타입 정의에도 해당 설정이 있다. 현재 기본 headless 흐름을 popup으로 오인하지 않는다.
외부 이동은 Google 인증을 위한 일시 이동뿐이며 업무 화면을 외부로 넘기지 않는다.

A가 소유하는 `/local/clearbridge/wallet-return`만 OAuth query를 받는다.
허용 키는 `privy_oauth_code,privy_oauth_state,privy_oauth_provider`이며 provider=google이다.
이 request URL은 PHP나 upstream에 넘기지 않고 access log를 남기지 않는다.
응답은 no-store/no-referrer와 nonce CSP를 사용한다. SDK가 완료 상태를 확인한 뒤
query를 history에서 제거하고 owner 고정 courseId의 Moodle index로 복귀한다.
임의 returnURL을 받지 않는다. OAuth code/token/signature를 PHP에 전달하지 않는다.

현재 재사용 후보 origin은 `https://127.0.0.1:9477`이고 Privy App ID는 기존
`cmvt0wl3v043w0hjp00elt4rf`다. 기존 사용자 설정은 `/onboarding` redirect다.
새 exact redirect 후보는 `https://127.0.0.1:9477/local/clearbridge/wallet-return`이다.
새 경로의 콘솔 허용 여부는 아직 읽기 확인하지 않았고 등록/수정하지 않았다.
단순히 기존 origin이 허용됐다는 이유로 새 redirect도 허용됐다고 판단하지 않는다.

## 사업 action 권한 계약 검토 요청

아래는 미구현 검토안이다. 지갑 UI를 활성화했다는 이유로 기존 모든 `/bootcamp/**`
API를 front door에 넣지 않는다. 신청/증빙/AI/등록/동의/영수증의 기존 검증 코드를
재사용하되 현재 C 권한과 연결하는 마지막 서버 경계를 검토해야 한다.

읽기 투영은 C의 기존 전체 고정 scope 및 A 세션에 결합된 읽기 권한을 사용한다.
표시된 applicationId/role/current/allowedActions를 변경 권한으로 받지 않는다.
변경 요청에는 기존 exact body와 idempotency key 및 applicationRevision,
ledgerSequence, decisionId/revision/hash, 필요시 서명 payload/hash를 보존한다.

확인한 미연결 지점은 `src/bootcamp/http.mjs`의 `store.authorizeOperations`와 실제
dispatch/최종 쓰기 사이에서 현재 C session/전체 scope를 해당 요청과 결합하는
경계다. `src/bootcamp/ui-session.mjs`의 actor는 기존 CLEAR session/pinned wallet을
검사한다. `normal-moodle-currentness.mjs`는 displayOnly/paymentAuthority=false라
변경 권한으로 승격시킬 수 없다.

최소 검토안은 기존 CONNECTED login intent와 원 CLEAR context 및 C/D의 등록·lease를
재사용하는 것이다. C→A private operation `authorize-command` 한 개가 기존 intent에
method/path/bodyDigest/idempotencyKey digest를 짧게 결합하고, A HTTP dispatch와
기존 최종 쓰기 fence에서 같은 세션·정확한 명령·lease를 확인해 한 번 소비한다.
C에는 지갑 서명/CSRF/CLEAR token/body를 전달하지 않는다. 새 actionRef registry,
별도 등록 DB/전역 epoch/복구 시스템을 선행하지 않는다. read/status 자체는
write grant가 아니다. exact wire DTO와 consumption/fence는 아직 검토 대상이다.

서명 prompt가 필요한 경우 기존 독립 signer가 표시 내용을 재검증하고 사용자에게
서명을 받은 후 짧은 C 현재성 lease를 취득한다. AI 승인도 읽은 입력 hash·비용·전송
고지를 특정한 별도 명시 동의다. TTL/최종 쓰기 fence/DB 원자 소비/replay/응답 유실
조회 계약을 기존 D와 합의하기 전 실제 business action은 활성화하지 않는다.
이 검토안의 wire DTO가 최종 계약으로 수락됐다고 기록하지 않는다.
