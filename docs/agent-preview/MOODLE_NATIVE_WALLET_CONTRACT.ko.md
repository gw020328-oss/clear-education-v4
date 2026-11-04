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
- 반환값은 `dispatch(command)`, `submitCommand(command)`, `runWorkflow(input)`, 비동기 `destroy()`다. provider, 서명 함수,
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
- C의 성공(2xx) `text/html` 문서만 `Referrer-Policy: same-origin`을 사용한다.
  이는 Moodle 로그인 form POST의 Origin을 유지하며 외부 이동에는 Referer를 보내지 않는다.
  A OAuth/API, C 비HTML 및 오류/redirect 응답은 `no-referrer`를 유지한다.
  POST의 Origin/Fetch-Site 정확 비교는 그대로이며 `Origin: null`은 허용하지 않는다.
- Moodle 4.5 설치에서는 `config.php`의 `$CFG->nolastloggedin = true`로
  사용자명 기억 쿠키 발급을 억제한다. 이를 DB 설정으로 저장하지 않는다.
  실제 로그인 세션 검사 redirect에 필요한 `testsession` query는
  `/login/index.php` inventory에만 포함한다. 인증 쿠키 allowlist를 확장하지 않는다.
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
recipient-registration, review-consents, reflection-approval 및 아래 별도 검토 후보의
source-session/source-signature다. resume은 허용하지 않는다. 전체 사용자 여정과
Moodle 업무 버튼의 연결은 아직 완료가 아니다.

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

## 원천 세션·서명 명령 확장 후보

`source-session`의 첫 durable effect는 기존 exclusive `context.json`이다. 신청/지갑/
원천 pins를 검증한 뒤 temp fsync/close 다음 실제 게시 직전에 같은 command fence를
확인한다. 파일 게시 후에만 broker의 bound context를 설치하며, 이후 실패하면 기존
파일과 UNKNOWN을 보존한다. 재발급으로 파일을 덮어쓰거나 연결 성공을 추정하지 않는다.

`source-signature`는 기존 evidence 요청/approvalId/서명 소유자/기한/원 CLEAR 세션을
검사한 후, pending waiter의 resolve 바로 전에 command fence를 확인한다. resolve와
명령 소비 사이에 await·외부 callback을 두지 않는다. 진단 기록은 그 뒤에 수행한다.
서버가 서명하지 않으며 지급 동의/결제 권한으로 재사용하지 않는다. 이 두 기존 API만
idempotencyKey `null`을 허용한다. 다른 네 쓰기 명령은 기존 key가 필수다.

## C 업무 버튼의 body·읽기·서명 계약

아래 표의 body는 정확한 키 목록이다. C에 새 권한 판단이나 signer를 추가하지 않는다.
`a`는 현재 신청 ID이고, 모든 값은 기존 A 응답과 명시 사용자 선택에서 나온다.
직렬화 정본은 `src/bootcamp/normal-client.mjs`다.

| POST 경로 | body | 역할·결합 |
| --- | --- | --- |
| `/bootcamp/v1/applications` | `{}` | 참가자 |
| `/bootcamp/v4/applications/a/source-session` | `{}` | 원 참가자 세션, 기존 source pins |
| `/bootcamp/v4/applications/a/source-signature` | `{approvalId,signature}` | 원 참가자, pending evidence 메시지 |
| `/bootcamp/v3/applications/a/recipient-registration` | `{expectedRevision,expectedLedgerSequence,targetDecisionId,targetDecisionRevision,targetDecisionHash,registrationTargetId,signature}` | 참가자, 검토한 registration packet과 기존 typed signature |
| `/bootcamp/v3/applications/a/review-consents` | `{expectedRevision,expectedLedgerSequence,targetDecisionId,targetDecisionRevision,targetDecisionHash,value}` | 양측 각각, `value=AGREE` 또는 `WITHDRAW`, 기존 CAS |
| `/bootcamp/v4/applications/a/reflection-approval` | `{version,applicationId,bodySha256,planHash,contextHash,runBindingHash,codeHead,model,action,costAcknowledgment}` | 지정 비용 승인 지갑, exact input·실행·코드·모델 |

회고 body의 version은 `clear-normal-ai-approval-action.1`, action은
`APPROVE_THIS_INPUT_ONCE`다. 나머지는 `/bootcamp/v4/session`의 최신 `aiApproval`
표시를 사용한다. 운영자라는 이유만으로 AI 전송·비용 승인이 생기지 않는다.

기존 읽기 계약은 `/bootcamp/v4/session`, v3 `procedure`, v2 `operations`, v3
`decision-evidence`, v4 `source-signature`, v3 `recipient-registration` 및 v4
`payment-receipt`다. registration의 검토 후 재조회는 기존 checkpoint query를 유지한다.
원천 서명은 `createApprovalSigner.source`, 수령 등록은
`createProductSession.readRegistration/submitRegistration`의 현재 context 및
서명 전후 재검사를 재사용해야 한다. raw signer/provider/CSRF/일반 request를 C에
전달하지 않는다. C가 사용할 제한된 읽기·검토 후 서명은 아래 runWorkflow 후보로 제공한다.
기존 submitCommand는 하위 포트이며 C 업무 화면에서 직접 조합하지 않는다. provider 승인창을 제외한 업무
화면은 기존 Moodle DOM에서 렌더링한다.

## 격리 실제 설치 결합 결과 (2026-11-05)

A `3faceaa2bf922e3fad329177942571f3a2931398`, C `fabf01e3327d61413118a8bfa9713ea9ab0ad113`
ZIP 0.1.15, D `4a6f9251e7864f604523d65611836cd898ba2a67`를 격리 Moodle 4.5에
조립했다. 실제 사용자 실행과 별개이며, 새 Chrome 합성 프로필만 사용하고 정리했다.

- 실제 A ESM·합성 EIP6963 provider로 운영자 선택→네트워크 확인→SIWE→Moodle
  finish CONNECTED를 원 Moodle URL에서 확인했다. 실제 MetaMask 승인은 아니다.
- 학생은 합성 Privy SDK adapter와 실제 A controller/login/session/HTTP/store,
  실제 C PHP 세션/권한/atomic take 및 SQLite를 사용했다. Google 인증 검증은 아니다.
- 정상 신청은 commands 1건. authorize 후 세션 종료·원 session row 교체·역할 해제·
  원 5초 기한 만료는 각각 0건. 동시 동일 POST는 200/409와 1건, 응답 유실 후
  같은 grant 재전송은 409로 차단되고 기존 1건을 보존했다.
- 이 검사는 C 신청 버튼 대신 공개 submitCommand 포트를 호출했다. Moodle 전체
  업무 버튼/실제 증빙/유료 AI/지급 완료를 의미하지 않는다.

## C 연결용 runWorkflow 포트 후보

mount 반환값에 `runWorkflow(input)`이 추가된다. 입력 검사 함수
`validateNativeWorkflowCommand`도 같은 ESM에서 export한다. 모든 action은 명시 호출이며
mount/로그인 복귀에서 신청·서명·동의·AI 승인을 자동 실행하지 않는다. `CONNECTED`,
`authenticated=true`, `busy=false`일 때만 호출할 수 있다. 같은 controller의 원
session/wallet/epoch를 전후 재검사하며 작업 중에는 wallet의 기존 cancel을 사용할 수 있다.
각 `input`은 아래 `action`과 나열한 추가 필드만 허용한다. `reviewed`는 직전 해당
읽기가 반환한 객체를 변경 없이 다시 넘긴다. A 내부에도 별도 복제본을 보관한다.

| action | 추가 입력 | 성공 결과: 기존 DTO/필드 |
| --- | --- | --- |
| `read-session` | 없음 | `clear-bootcamp-normal-session.1`: role `PARTICIPANT/OPERATOR`, applicationId 또는 null, policyHash/runtimeMappingHash, phase, failure, procedureReady, reviewScreensReady, expectedPayment, aiApproval. 원 normal-client의 기존 session 응답이며 source signingContext는 A 내부 검증용이다. |
| `create-application` | idempotencyKey | 기존 v1 `{record,current,gates}`. record.applicationId/operationId를 보존하여 후속 조회에 사용한다. |
| `read-application` | applicationId | `clear-bootcamp-normal-view.1`. role `PARTICIPANT/COURSE_OPERATOR`, target, decision, criteria, agreedPayment, funding, procedure, consent, objection, payment, sourceMode. displayOnly=true이며 권한 증거가 아니다. |
| `bind-source-session` | applicationId | 기존 `{applicationId,status:'AUTHENTICATED_SOURCE_SESSION_BOUND',paymentAuthorization:false}` |
| `read-source-signature` | applicationId | `{approvalId,requestHash,message,expiresAt,purpose,applicationId}`. purpose는 `HACKERRANK_EVIDENCE_OBSERVATION_NOT_PAYMENT_AUTHORIZATION`. 메시지 표시는 textContent로 한다. |
| `approve-source-signature` | reviewed | 기존 `{approvalId,requestHash,status:'PARTICIPANT_SIGNATURE_ACCEPTED',paymentAuthorization:false}`. 서명값은 반환하지 않는다. |
| `read-registration` | 없음 | `clear-bootcamp-recipient-registration.1`: 현재 server application, role/status/purpose/calldataPublic, payload, registrationTargetId, CAS 필드, chain 관측·checkpoint. 기존 normal-client 및 product-session 정본을 사용한다. |
| `approve-registration` | reviewed | 기존 `clear-bootcamp-procedure-operation.1`, record.applicationId/operationId/target, current, usableForPayment=false. 저장 확인이며 지급 완료가 아니다. |
| `approve-reflection` | reviewed, idempotencyKey | reviewed는 read-session.aiApproval 전체. 기존 `clear-normal-ai-approval-receipt.1`의 applicationId/runBindingHash/승인 결과. 비용·전송 표시를 읽고 명시 버튼으로만 호출한다. |
| `consent` | reviewed, value, idempotencyKey | reviewed는 read-application 전체, value는 AGREE 또는 WITHDRAW. 기존 `clear-bootcamp-procedure-operation.1` 결과. 각 역할이 별도로 누른다. |
| `payment-receipt` | applicationId | `clear-bootcamp-normal-payment-receipt.1`. claim.state는 NOT_OBSERVED/READBACK_UNAVAILABLE/INCLUDED. 정상 포함 시 canonical=true, transferAmountAtoms/balance.receivedAtoms=`100000000`, exactExpectedAmountVerified=true. finalized는 기존 DTO 사실 그대로 표시한다. |
| `decision-evidence` | applicationId | 기존 `clear-bootcamp-decision-evidence.1`, manifest/manifestHash/limitations. 원천 재수집을 수행하지 않는다. |
| `read-operation` | applicationId, operationId, kind | kind `application`: 기존 v1 operations 조회. kind `procedure`: 기존 v3 procedure-operations 조회. 반환 record의 두 ID가 입력과 일치해야 한다. |

GET과 POST 경로는 A 내부 allowlist에만 있다. C에 일반 request, cookie/CSRF,
provider, signer 또는 서명 결과를 전달하지 않는다. 원천·등록은 기존 독립 signer와
source/registration context, 서명 전후 현재 응답 검사를 재사용한다. 특히 원천의
approvalId/기한 등 검토 packet 전체가 바뀌면 같은 메시지여도 새 검토가 필요하다.
지갑 승인이 끝난 다음에만 C의 5초 command grant를 발급하므로 지갑 대기시간으로
원 grant를 연장하지 않는다. grant 실패 후 서명값을 저장·재전송하지 않는다.

동의는 보관한 원 view와 제출값의 동일성을 검사하고 최신 view의 target/금액을 다시
비교한 뒤 기존 CAS body를 만든다. AI 승인은 보관한 aiApproval 및 최신 permitted/
body·plan·context·run·code·model·cost acknowledgment 결합을 다시 확인한다. 이 포트
자체가 AI provider를 호출하거나 지갑 거래를 대신 전송하지 않는다.

### 오류·UNKNOWN 및 조회 책임

- 입력 shape/ID/action 오류 또는 미연결 상태는 I/O 전에 거부한다. C는 버튼을 잠그고
  입력/연결을 다시 읽는다. 원 예외 원문은 화면에 표시하지 않는다.
- 시작한 작업 실패는 고정 `code=MOODLE_WORKFLOW_UNAVAILABLE`를 던진다. 읽기의
  outcome은 NOT_SENT(업무 쓰기 미전송), 쓰기의 outcome은 보수적으로 UNKNOWN이다.
  쓰기 실패를 확정 미접수로 표현하지 않는다. 확정 실패와 단순 timeout을 추정해
  재전송하는 복구 절차를 추가하지 않는다.
- 쓰기 실패는 controller 연결을 취소·폐기하고 검토 cache를 지운다. 계정/네트워크/
  세션/역할 변경 또는 cancel 후 늦은 결과는 버린다. 읽기 실패도 검토 cache를 지우며,
  인증 경계 실패는 연결까지 폐기한다. C는 CONNECTED가 사라지면 모든 쓰기 버튼과
  이전 connected/검토 표시를 즉시 해제한다.
- idempotencyKey는 사용자의 한 명시 작업에 대해 한 번 생성한다. 결과 유실 후 새 key,
  새 grant 또는 재서명으로 같은 작업을 자동 재실행하지 않는다. A/C 메모리나 DOM의
  오래된 성공 표시를 durable 영수증으로 취급하지 않는다.
- 성공 응답에서 이미 applicationId/operationId를 얻었다면 read-operation으로 기존
  durable 결과를 다시 읽을 수 있다. operationId를 받지 못한 생성 UNKNOWN은 현재
  API에 key→operation 조회가 없으므로 미해결로 멈춘다. applicationId=null은 원천에
  연결된 신청이 없다는 뜻이며, 생성된 신청이 전혀 없다는 증거가 아니다.
- 양측 동의와 등록 결과는 read-application/read-registration, AI 기록 상태는
  read-session.aiApproval로 다시 관측할 수 있다. NOT_OBSERVED/조회 실패/partial은
  미지급·미전송을 확정하지 않는다. 지급 완료는 payment-receipt의 실제 관측 사실로만
  표시하며, 자동 재지급 버튼은 없다. 원천 서명 결과 유실은 새 서명 없이 상태를
  확인하고 불명확하면 중단한다.

C는 기존 Moodle 영역에서 표시/입력만 연결한다. 별도 `/onboarding`/`operator` 이동,
iframe 업무 화면, raw submitCommand orchestration, C의 자체 서명/body 생성은 필요 없다.

### 표준 frontend의 명시적 native 조립

`tools/embedded-wallet/build-product.mjs --moodle-native`는 새 불변 출력 디렉터리에
native ESM과 고정 OAuth return ESM을 함께 빌드한다. 두 entry의 실제 esbuild 의존
그래프만 `clear-moodle-native-assets.html` 내부 목록에 경로/SHA-256으로 기록한다.
기존 owner의 `frontendAssetSha256` 전체 snapshot 검사는 계속 적용한다. `--team`과
동시에 사용할 수 없고, 기본 빌드/기본 frontend 동작은 그대로다.

hash-pinned Moodle owner의 `options.nativeFrontDoor`에는 정확히 `courseId`, `routes`,
`handleC`를 제공한다. `routes`는 검토된 C inventory만, `handleC`는 기존에 고정한
C transport만 받는다. `options.login.native`도 true여야 한다. attachment가 기존
`context.createFrontend`에 `moodleNative`로 전달하며, 표준 HTTPS 서버의 단일
request listener가 A/C를 분배한다. 이 설정만으로 사용자 실행을 활성화하지 않는다.

frontend는 native marker, 필수 entry, 각 파일 해시, C native 문서 inventory와
native login 모드가 맞지 않으면 RPC listener를 시작하기 전에 거부한다. 반환한
`mounted.nativeWalletConfig`는 이번 실행의 공개 설정이며 C의 native wallet 설정과
동일하게 설치해야 한다. C 문서 nonce는 요청마다 새로 발급한다. A/C 쿠키 분리와
기존 인증·권한 검사는 계속 적용된다.

A API inventory는 코드에 고정되어 있다. 기존 신청/operation ID 전체 세그먼트만
`[a-z][a-z0-9.-]{0,63}`로 받으며 임의 regex/template은 받지 않는다. C/auth/OAuth/
assets에 ID parameter를 사용할 수 없다. asset prefix 아래에서도 불변 목록의
정확한 파일만 제공한다. `/onboarding`, `/operator`, `__embedded/config`, 이전
Moodle popup과 내부 authority 경로는 이 공개 frontdoor에서 열리지 않는다.

검증 범위: 표준 HTTPS frontend의 C 문서/nonce, 메모리 snapshot asset, 고정 OAuth
return, 기존 v1 operation 조회와 다른 소유자 거부, 시작 설정 거부, parameter 경계,
기존 non-native frontend 및 attachment 회귀. 실제 Google 로그인·증명·AI 호출·지급
성공을 이 합성 검증으로 주장하지 않는다. C 설치 ZIP/실제 버튼 결합 결과는 별도로
고정한 조립 근거에 기록한다.
