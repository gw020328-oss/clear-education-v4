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
3. C 응답 exact `{status:'WAITING',expiresAtExclusive,launchCode,browserProof,finishProof,intentTarget}`.
   finishProof는 원 controller closure 전용이다.
4. A `POST /moodle/connect/redeem`, exact `{code,challenge,browserProof}`와 bootstrap
   cookie. 기존 `intents.redeem`의 proof, challenge, 실행, intent, 만료, 단회 소비를
   그대로 적용한다. native 모드 응답은 redirect 대신 exact
   `{status:'WAITING',role,expiresAtExclusive,commandBinding}`이다. commandBinding은 별도 난수이고
   controller 메모리에만 보관한다. browser binding 쿠키에는 이 값을 넣지 않는다.
   native 모드는 origin=moodleOrigin일 때만 생성할 수 있다.
5. 기존 `createClearSession`의 nonce→선택 지갑 SIWE→verify→session 검증을 사용한다.
   메시지 origin/chain/instance/address는 기존 validator가 검사한다. 서버 역할이
   현재 화면 역할과 다르면 세션을 폐기한다.
6. `POST /auth/moodle-complete {}`는 기존 CLEAR 세션과 browser binding으로
   `AUTHENTICATED_PENDING_MOODLE`를 만든다. pending TTL 최대 60초다.
7. 원 Moodle 탭의 명시 finish-connection은 C form exact
   `{id,sesskey,operation:'finish',finishProof}`. C는 기존 status→handback 확인→finish를
   수행한다. 원 PHP session/전체 scope/지갑/실행/만료/단회 소비가 그대로 적용된다.
8. finish 응답 유실은 C form `{id,sesskey,operation:'status',intentTarget}`만 조회한다.
   end도 같은 target을 반드시 보내며 `NOT_CURRENT`를 성공으로 해석하지 않는다. 확인되지
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
`cmvt0wl3v043w0hjp00elt4rf`다. 2026-11-04 실제 Privy 콘솔을 읽기 전용으로 확인했다.
Basics → Domains and clients의 Allowed origins에는 HTTPS 127.0.0.1의
9457/9467/9477 세 주소가 있고 HttpOnly cookies 설정은 꺼져 있다.
Basics → Advanced의 Allowed OAuth redirect URLs에는 같은 세 origin의
`/onboarding` 경로만 있다. UI는 full URL path가 매칭된다고 명시한다.
새 exact redirect 후보는 `https://127.0.0.1:9477/local/clearbridge/wallet-return`이다.
해당 경로는 등록돼 있지 않아 실제 native Google 연결 전 추가가 필요하다.
이 조사에서 어떤 입력값이나 설정도 변경하지 않았다. 기존 origin 허용만으로
새 redirect까지 허용됐다고 판단하지 않는다.

## 연결 종료와 사업 명령 후보 (2026-11-05)

Moodle end UNKNOWN latch는 CLEAR revocation UNKNOWN과 별도다. 원 intentTarget을
보내며 종료 응답이 불명확하면 자동 재전송/재연결하지 않는다. finish 응답 이후에도
캡처한 같은 session/wallet을 다시 검사한 뒤에만 CONNECTED를 표시한다.

사업 명령은 별도 검토 후보이며 live는 꺼져 있다. 기존 actor/서명/body/원자 저장/
idempotency 검사를 유지한다. mount의 `submitCommand({method,path,body,idempotencyKey})`
포트는 CONNECTED 원 controller에서만 사용할 수 있으며 provider/signer/세션 비밀을
반환하지 않는다. 검증된 경로만 allowlist에 넣는다. 현재 후보는 POST application 생성,
recipient-registration, review-consents, reflection-approval 네 종류다.
source-session/source-signature/resume 및 전체 사용자 여정은 아직 연결 완료가 아니다.

- C browser form exact `{id,sesskey,operation:'authorize-command',commandHash}`.
- C→A private POST `/v1/moodle/connect/authorize-command` exact
  `{version:'clear-moodle-command.1',requestRef,ownerRunId,moodleAuthorityRef,role,expiresAtExclusive,intentRef,commandHash}`.
- A private 성공 exact `{version:'clear-moodle-command.1',requestRef,status:'AUTHORIZED',expiresAtExclusive}`.
  requestRef/expiry는 원 요청과 같다. C browser 응답은 version을 뺀 exact3이다.
- digest는 lowerhex64 SHA-256 of canonical
  `{domain:'clear-moodle-command.1',method:'POST',path,body,idempotencyKey}`.
  query/임의 경로는 거부하고 기존 body validators를 유지한다.
- 실제 A POST만 `x-clear-command-ref`와 `x-clear-command-binding`을 받는다.
  C에는 원 body/서명/CLEAR CSRF/쿠키/commandBinding을 보내지 않는다.

A는 원 CONNECTED intent의 전체 Moodle identity/sessionRef와 CLEAR token/wallet/role/
chain/CSRF를 검사하고 digest를 실제 POST에서 재계산한다. 원탭 commandBinding은
native redeem 단회 응답에만 발급하고 서버에는 hash만 저장한다. 기존 browserProof
수명은 늘리지 않는다. cookie/URL/storage/status/view에 쓰지 않고 client invalidate/
end/logout/expiry/close 때 폐기한다. 같은 origin 악성 JS와의 격리를 주장하지 않는다.

실행시 권한 재검증 보정(P1): authorize 응답 때의 C snapshot만으로 POST를 실행하지
않는다. C는 최종 응답·check_origin·wall/mono 검사까지 성공한 authorize-command
record만 원 5초 기한까지 보존한다. A 실제 POST가 binding/context/hash를 검사하고
await 전 RESERVED_PENDING으로 단독 예약한 후, 원 exact8 q와 원 deadline으로
reverse-only `execute-command`를 호출한다. 새 browser form/D route는 없다.
C는 기존 registry lock/transaction 안에서 exact request와 authorize-command digest를
대조해 단회 take한 record로 원 세션/현재 역할·등록/full scope/intent/hash/horizon을
검사한다. 가져온 record는 검증 실패/응답 유실에도 복구하지 않는다. 다른 q의 불일치는
해당 record를 소비하지 않는다. A는 새 identity와 원 CONNECTED identity를 대조하고
원 lease를 연장하지 않는다. C 원자 take delta와 함께 결합 검사해야 한다.
마지막 C 권한 관측과 A commit 사이 원격 변경을 원자적으로 막는다고 주장하지 않는다.
보장은 실행시 재검증 + 원 5초 상한 + 최종 동기 local commit fence다.

예약/상태는 기존 intent 안에만 보관한다. 같은 grant를 matching POST 하나가 예약하고
actor 재검사는 소비하지 않는다. 원 C/D 5초 wall+monotonic/signal/assertCurrent를
연장하지 않으며 await 뒤와 실제 outer COMMIT 직전에 다시 검사한다. 요청 범위는
AsyncLocalStorage 인스턴스로 연결하고 DB hook은 해당 transaction 호출에만 전달한다.
공용 private-db의 optional 동기 beforeCommit/afterCommit은 기존 단일인자 동작을
유지한다. afterCommit은 COMMIT 성공 뒤 rollback catch 밖에 있고 Promise hook은
거부한다. savepoint RELEASE를 COMMIT으로 보지 않으며 business `{error}`의
invalidation-only COMMIT는 성공 소비가 아닌 UNKNOWN으로 닫는다.

회고 승인은 두 기존 exclusive 파일의 temp write/fsync 이후, 실제 linkSync 게시
직전 beforePublish fence를 검사한다. writer의 rename 경로도 같은 optional 동기 hook을
지원한다. 비동기 hook은 rejection을 관측한 뒤 동기 계약 오류로 거부한다. 첫 durable effect
뒤 부분 실패 시 파일을 보존하고 재예약을 열지 않는다. 결과 유실은 같은 grant를
재전송하지 않고 기존 durable operation receipt를 조회한다. 재시작 시 intent는
폐기되므로 새 인증과 기존 결과 확인이 필요하다. source/AI 호출 및 실제 지급은
합성 검증에 포함하지 않는다.

격리 조립 입력: A base 1997b613619eb15a945a3c3fa6201bc92a0f66de 위 command 후보,
C 6d8be7f834c3e0b693dc4723d19955ca713dcfda의 0.1.13 ZIP,
D 4a6f9251e7864f604523d65611836cd898ba2a67. 이는 조립 입력이며 아직 실제 Moodle
전체 연결이나 실제 인증/서명/지급 성공을 증명하는 목록이 아니다.
