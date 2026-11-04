# C authorize-command 최소 후보

2026-11-05. 기준은 intentTarget을 고정한 C `6d8be7f834c3e0b693dc4723d19955ca713dcfda`다.
0.1.12 CSP/실브라우저 증거와 0.1.13 target ZIP은 보존한다. 요청 모델은 Astra / High,
현재 실제 실행 모델은 GPT-6.1 Sol이며 턴 설정을 바꿨다고 주장하지 않는다.

이번 0.1.14는 C의 명령 승인 경계만 추가한다. 업무 버튼, A의 실제 업무 dispatch·최종
쓰기 fence, 유료 AI, 서명·지급이나 live 설치를 활성화하지 않는다.

## 확정 DTO와 경로

브라우저는 고정 `POST /local/clearbridge/login_action.php`에 기존 form content type으로
exact4 `{id,sesskey,operation:'authorize-command',commandHash}`를 보낸다.
commandHash는 소문자64 hex다. body/서명/CLEAR CSRF/token/commandBinding/intentRef는
이 form에서 받지 않는다. extra·잘못된 형식·현재 SESSION intent 부재는403 UNAVAILABLE다.

C는 자기 SESSION의 현재 intent와 실제 로그인·role·활성 등록·전체 scope를 확인한다.
현재 intentRef를 서버가 선택해 기존 C→D HMAC/TLS client로 다음 exact8을 보낸다.

```text
POST /v1/moodle/connect/authorize-command
{version:'clear-moodle-command.1',requestRef,ownerRunId,moodleAuthorityRef,
 role,expiresAtExclusive,intentRef,commandHash}
```

requestRef/moodleAuthorityRef는 기존 생성 방식의 새64 hex다. deadline은 현재 시각+5초와
scope 만료 중 이른 값이며 기존 monotonic/wall fence를 유지한다. D의
`authorizeCommand(frozenRequest,{signal,assertCurrent})` callback이 이 입력을 A에 넘긴다.
C의 private transport key/CA/pinned origin을 재사용하고 browser cookie/Origin은 전달하지 않는다.

A/D 성공 응답은 exact4
`{version:'clear-moodle-command.1',requestRef,status:'AUTHORIZED',expiresAtExclusive}`다.
C는 version/status/키 개수 및 **원요청 requestRef·deadline과 strict equality**를 확인한다.
기한을 늘리거나 줄인 응답, 잘못된 ref, 만료·extra도 거부한다. D 오류는 기존
HTTP503 `clear-moodle-login-error.1 / UNAVAILABLE`이고 C client는 성공으로 해석하지 않는다.
최종 currentness·wall/monotonic 검사가 끝나야 브라우저 exact3
`{status:'AUTHORIZED',requestRef,expiresAtExclusive}`를 반환한다.

## 기존 역검증·저장 경계 재사용

registry 파일/버전·수명은 기존 `clear-moodle-login-registry.1` 그대로다. common request
header exact6에 두 허용 version을 구분하고, record operation과 version도 일치해야 한다.
기존 operation digest가 authorize-command와 **전체 exact8**을 결합한다. commandHash·
intentRef 원문을 registry에 새로 저장하지 않으며, body/binding/token을 저장하지 않는다.

A→C의 고정 `POST /local/clearbridge/login_authority.php`는 기존 direction-separated
HMAC과 cookie-free TLS를 사용한다. envelope의 operation만 authorize-command를 추가한다.
exact13 `clear-moodle-login-authority-result.1` 결과와 내부 exact8 grant는 그대로다.
commandHash/intentRef가 바뀌면 publication digest와 달라 역검증이 실패한다.
전체 scope/세션 row/실제 handler/등록/역할/5초 fence를 다시 확인한다.
client는 성공·실패 모두 finally에서 자기 registry lease를 revoke한다.

A의 authorizeCommand가 해당 intent의 CONNECTED 상태와 원 CLEAR context를 확인한다.
C는 UI 연결 표시나 별도 status/read 응답을 업무 권한으로 바꾸지 않는다. A는 native redeem의
commandBinding을 controller 메모리와 A header에만 보관하며, 실제 실행 때
`x-clear-command-binding` 및 `x-clear-command-ref`와 정확한 method/path/body/key/context를
다시 결합해야 한다. 최종 write fence와 단회 소비는 A/D 소유이며 이 C 응답만으로
업무를 실행하거나 이미 성공했다고 표시할 수 없다.

## 표적 검증

- 실제 C request/registry/respond/currentness/response validator에 Moodle identity·clock·
  curl transport만 모델링한15개 검사: 양 역할 exact8/기존 registry, 다른 commandHash·intent·
  operation의 거부, exact response/deadline, 응답 오류/전송 실패/5초 wall·mono 만료,
  등록·역할·전체 scope·세션 변경, 모든 결과의 registry lease revoke.
- 실제 login_action.php를 격리 PHP HTTP 서버에서 실행한25개 기존/명령 scope 분기와
  target 늦은 end/status 회귀. 현재 SESSION intent를 사용한 exact3 응답 및
  no-intent/malformed hash/extra intent·binding·body가 호출 없이 거부됨을 확인.
- 기존 읽기/로그인 authority 회귀와 관련 PHP lint를 실행한다.

이 결과는 actual C PHP 코드에 대한 합성 경계 검사다. 새 업무 경로의 실제 A/D TLS 조립,
실제 Moodle 사용자 인증·서명·업무 실행 성공을 뜻하지 않는다. 검토한 A/D 고정 head와
함께 조립하고 최종 서버 경계를 확인하기 전 live 활성화하지 않는다.
