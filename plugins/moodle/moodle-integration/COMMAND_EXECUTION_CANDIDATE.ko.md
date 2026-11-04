# C 실행 직전 권한 재검증·단회 소비 후보

2026-11-05. 기준 C head는 `d68220f1366c1d7118c0df46a166c78268e18a0d`이며
플러그인 후보는 0.1.15 / 2026110503이다. 권한·재사용 방지 검토의 요청 설정은
Astra / High, 실제 이 작업의 실행 모델은 GPT-6.1 Sol이다. 현재 턴 설정을 바꾸지는 못했다.
C PHP/registry/ZIP만 변경하며 A의 binding·dispatch·쓰기와 D transport는 각 소유자의 범위다.

## 승인 성공 시 원래 publication 유지

`course_login_client::request('authorize-command')`는 exchange, check_origin,
원래 wall/monotonic fence, exact 응답 shape/ref/deadline 검증을 모두 통과한 뒤에만
기존 registry record를 보존한다. 성공 flag를 exchange 직후 설정하지 않는다.
실패 및 나머지 operation은 finally에서 revoke한다. 원래 최대 5초 deadline은 연장하지
않으며 새 registry·epoch·추가 저장 필드도 만들지 않는다. 만료 record는 기존 transaction의
pruning 대상이며 시간이 지났다고 즉시 별도 정리 프로세스가 실행되는 것은 아니다.

## A → C 역검증 계약

기존 cookie-free `POST /local/clearbridge/login_authority.php`와 방향별 HMAC/TLS 계약을
재사용한다. 새 transport nonce와 timestamp를 사용하되 아래 request는 원 승인 exact8과 같다.

```text
{operation:'execute-command',request:{
  version:'clear-moodle-command.1',requestRef,ownerRunId,moodleAuthorityRef,
  role,expiresAtExclusive,intentRef,commandHash
}}
```

execute-command는 reverse-only다. outbound request_version, browser form,
D command route에 추가하지 않는다. 기존 authorize-command 역검증은 소비하지 않는다.

`take_command`는 기존 registry transaction의 파일 잠금 안에서 exact common base6와
원 authorize-command operation digest(전체 exact8)를 대조하고 해당 record만 제거한다.
digest/q 불일치는 살아 있는 대상·무관한 record를 소비하지 않는다. removal을 flush/fsync한 뒤
captured record의 원 세션 row·handler, 현재 역할·등록·전체 scope와 horizon을 검사한다.
검사 실패나 응답 손실 이후에도 record를 복구하지 않는다. 동시에 유효한 요청이 와도
성공 grant는 한 요청에만 가능하다. 마지막 horizon/fence를 응답 전에 다시 확인한다.

성공 HTTP200 응답은 기존 exact13이다.

```text
{version:'clear-moodle-login-authority-result.1',requestRef,ownerRunId,
 moodleAuthorityRef,role,intentRef,status:'OK',installationRef,courseRef,
 subjectRef,actorRef,sessionRef,expiresAtExclusive}
```

identity/correlation은 원 요청과 기존 CONNECTED authority에 대응한다. execute 결과의
expiresAtExclusive는 원 요청 deadline과 정확히 같으며, 현재 권한 horizon이 그보다 짧으면
실패한다. 기존 authorize 결과는 긴 세션 horizon을 유지한다. 실패는 기존 HTTP403
`{"code":"REJECTED"}`이며 상세 원인·Moodle ID·proof를 내보내지 않는다.

## A가 조립할 실행 순서와 보장 한계

A는 원 binding/context/hash를 확인하고 await 전에 grant를 RESERVED_PENDING으로
예약한 다음 원 q로 execute 역검증한다. await 이후에도 CONNECTED identity 일치,
D signal/assertCurrent, wall/monotonic/context 검사를 통과해야 동기 local commit한다.
실패·응답 손실은 UNKNOWN이며 사용 가능한 상태로 되돌리지 않는다. 이 A 경계는 이번
C 단독 검사의 실제 실행 대상이 아니다.

보장 범위는 실행 시점 재검증, 원래 최대 5초 기한, A의 동기 local commit이다.
**C의 마지막 관찰 이후 A commit 전 원격 권한이 철회되는 간격까지 원자적으로 막는다고
주장하지 않는다.** 이 후보는 분산 트랜잭션이나 원격 원자적 revoke fence가 아니다.

## 검증과 증거 범위

- 실제 C client/registry/currentness를 쓰는 기존 승인 15개 검사: 완전 검증한 성공만
  원 deadline으로 유지, 잘못된 응답·전송 오류·권한/세션/기한 변경은 revoke.
- 실행 표적 12개 검사: 정상 효과1, 승인 후 세션 교체·삭제·등록·역할·scope·wall/mono
  변경은 효과0, 불일치 요청은 관련 없는 record를 보존, 소비 후 fsync 경계 실패는 재사용 불가.
- 별도 PHP 프로세스 두 개가 각각 실제 방향별 HMAC 및 새 nonce 검증을 마친 후 동시에
  take를 시도해 하나만 성공한다. 테스트 파일에 모사한 업무 효과는 정확히1이며 응답 손실을
  가정한 fresh-nonce 재시도도 실패한다.
- 실제 browser dispatcher의 execute-command 입력은403, owner 호출0, 기존 SESSION
  intent 불변이다. 기존 읽기/로그인/scope dispatcher 회귀 및 관련 PHP lint도 확인한다.

Moodle identity·clock·curl/TLS 환경과 A 업무 쓰기는 모델링했다. HMAC 계산과 registry 파일
잠금·소비는 실제 코드로 실행했다. 실제 A/D TLS 통합, live Moodle 설치/사용자 로그인,
서명·지급·유료 AI·업무 실행의 성공 증거는 아니다. 0.1.12–0.1.14 ZIP/증거는 보존한다.
