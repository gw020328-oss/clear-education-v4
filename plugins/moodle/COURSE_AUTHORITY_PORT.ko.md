# Moodle course 권한 발행 포트 후보

2026-11-04. 기준 C wire `c21ebc76be0482caa507319030e40c15c2ea0c6b`에 대한 후속이다. 구현은 `plugins/moodle/**`에 한정된다. 실제 외부 권한 resolver와 durable epoch는 미연결이며 정상 owner는 검증할 수 없는 ref에 `UNAVAILABLE`을 반환해야 한다.

## 이번 구현

`course_authority_lease::issue(courseId, userId, role, binding, readGeneration)`은 서버 설정과 확인된 Moodle 페이지 인수만 받는다. HTTP 사용자 입력으로 binding이나 generation 함수를 만들지 않는다. Moodle build `2024100715.00`인 4.5.15, database session backend, manual auth 계정만 지원한다. 현재 로그인, 비게스트, 비대리로그인, 비역할전환, confirmed·활성 계정, 같은 내부 세션 행 세대, 활성 등록, 요청 역할의 fresh core capability 평가가 필요하다. 실제 검사는 기존 `course_moodle_access`를 호출한다. 해당 객체의 세션 행 ID·생성 시각은 PHP 메모리에만 남는다.

binding의 exact 필드는 다음과 같다.

```text
installationRef, ownerRunId, courseRef, subjectRef, actorRef, expiresAtExclusive
```

모든 ref는 운영자가 실제 설치·강좌·대상 학생·현재 주체와 대조한 opaque 문자열이다. 이 클래스는 외부 매핑 저장소를 조회하지 않는다. `subjectRef`는 대상 학생이고 `actorRef`는 로그인한 학생 또는 교사 주체다. 교사에게 학생 subjectRef만 부여하여 교사 인가를 대신할 수 없다. 호출자는 인수 courseId/userId와 binding의 실제 매핑을 검증해야 한다. 이 의존성이 없으면 호출하지 않고 미연결 상태를 유지한다.

`readGeneration()`의 exact 반환값은 다음과 같다.

```text
{ installationGeneration: opaque restore generation, authorityEpoch: positive safe integer }
```

이는 운영자 전용 동기 함수다. 설치 복구 세대는 DB 복원으로 재사용되지 않아야 하고, epoch는 해당 계정·세션·등록·역할·권한·매핑 변경 및 폐기를 누락 없이 기록해야 한다. 발행과 매 검증에서 fresh 접근 검사 양쪽의 세대가 같고 최초 발행 세대와도 같아야 한다. 같은 초에 철회 후 복구돼 최종 상태가 같더라도 epoch 변화로 거부한다. epoch를 상수·시각·session ID·HMAC·최종 active 상태의 hash로 만들지 않는다. 구현 후보 및 DML 경계는 기존 [권한 epoch 결정안](AUTHORITY_DECISION.ko.md)을 따른다. 그 결정안의 trigger나 schema를 이번에 설치하지 않았다.

발행 ref는 `random_bytes(32)`의 소문자 hex64다. 만료는 발행 시각 +5초, binding 만료, 현재 Moodle 세션/등록 만료의 최솟값으로 고정된다. 이후 연장하지 않는다. 별도 monotonic 5초 상한과 wall/monotonic 역행 거부가 있다. 검증 실패와 명시적 revoke는 해당 객체를 영구 폐기한다. 직렬화·복원·복제를 막고 디버그 출력에서 내부 binding과 참조를 숨긴다. generation provider 예외도 밖으로 출력하지 않는다.

기존 `$CFG->local_clearbridge_course_authority` Closure는 이 객체를 반환할 수 있다. 페이지가 `grant_for(courseId,userId,role,ownerRunId)`를 사용해 잘못 전달된 객체를 거부하고 기존 2필드 wire grant를 얻는다. owner 응답 뒤 `is_current()`를 호출하며, 성공·실패·예외 모두 `finally`에서 폐기한다. 기존 외부 issuer의 2필드 배열 계약은 변경하지 않았다. 현재 코드나 설정에 기본 발행기, 운영 epoch, 승인된 매핑을 만들어 넣지 않았다.

## A 검증 입력과 결과 제안

새 HTTP route와 인증키는 아직 합의하거나 구현하지 않았다. 아래는 local `check()`의 계약 후보다. 이 함수는 호출자의 HMAC을 직접 검증하지 않는다. 원래 Moodle 요청 안에서 이미 인증된 owner 요청에 대해 호출하는 서버 포트이며, 다른 PHP worker나 Node A가 이 객체를 호출할 수 있는 전송·저장소는 없다. 기존 C wire client가 보내는 요청을 외부 callback과 연결하는 bridge도 아직 없다.

입력은 기존 C→A wire의 6필드와 동일하다.

```json
{
  "version": "clear-moodle-course-read-request.1",
  "requestRef": "<lowercase hex64>",
  "ownerRunId": "<approved run>",
  "moodleAuthorityRef": "<issued lowercase hex64>",
  "role": "PARTICIPANT | COURSE_OPERATOR",
  "expiresAtExclusive": 2000000005
}
```

run/ref/role과 발행 deadline을 검사하고 최초 requestRef·deadline에 고정한다. 같은 요청에 대한 반복 조회는 허용하지만 매번 fresh 검사를 수행한다. 다른 요청으로 재사용하면 폐기한다. 성공 결과의 exact 필드는 13개다.

```text
version = clear-moodle-authority-check.1
requestRef, ownerRunId, moodleAuthorityRef, role, status = OK
installationRef, installationGeneration, authorityEpoch
courseRef, subjectRef, actorRef, expiresAtExclusive
```

로컬 실패 결과는 `null`이다. 미래 HTTP 실패 envelope/상태코드는 공동 계약에서 별도로 고정해야 한다. PHP 쿠키, SID, sessdata, Moodle token/숫자 사용자 ID, CLEAR 인증 context를 결과에 넣지 않는다.

A는 매 scope 호출에서 인증된 C의 현재 검증을 수행하고 결과 전체를 해당 run/requestRef/ref/role에 대조해야 한다. 설치 세대·authorityEpoch·actorRef가 바뀌면 이미 읽은 자료를 폐기한다. installationRef/courseRef/subjectRef는 A의 pinned mapping과 같아야 한다. actorRef는 별도로 허용된 participant 또는 operator의 CLEAR 현재 인가와 연결한다. A의 기존 resolveAuthority는 `{requestRef,authorityRef,authorityEpoch,expiresAtExclusive,mapping,role,clearContext}` 7필드이므로 C 결과에 mapping이나 CLEAR token을 보태서 반환하지 않는다. A가 자기 서버의 검증된 mapping과 별도 CLEAR context로 구성한다. installationGeneration은 현재 7필드에 없으므로 A resolver가 최초 세대를 pin하고 변화 시 실패시키는 책임도 필요하다.

## 실제 연동 전 남은 차단점

남은 연결은 A의 현재 C 권한 조회 bridge다. 최소 파일 제안은 기존 Moodle 웹서버의 `local_clearbridge/authority.php`와 `classes/course_authority_registry.php`, `classes/course_authority_currentness.php`다. 첫 파일의 후보 route는 `POST /local/clearbridge/authority.php`이며 서버 인증 후 아래 두 포트를 호출한다. registry는 원래 페이지의 private 세션 행 세대·확인된 매핑·requestRef 등록/폐기를 담당하고 currentness는 쿠키 없이 현재 세대·등록·권한을 재검사한다. 이 세 파일과 route는 미구현 제안이다. 본부가 계약과 저장소를 확정하기 전에는 추가하지 않는다. A가 최종 환경을 조립하며 C 후보 ZIP 설치 자체가 이 bridge를 제공하지는 않는다.

- DB 복원 세대 및 등록·역할·capability·세션·매핑 변경의 영속 epoch 발행, 권한 보호와 우회 경로 인수.
- 세션 쿠키 없이 내부 세션 행 세대를 다시 확인할 C registry 및 외부 검증기. 현재 객체는 원래 세션의 `$USER`와 active PHP 세션을 요구하므로 별도 HTTP 요청에 재사용할 수 없다. 이 조건을 삭제해 외부 callback으로 가장하지 않는다.
- A→C route의 정확한 method/path/host/CA, 방향별 키와 run, body 제한, nonce/replay, timeout/cancel, 명확한 실패 envelope. 기존 C→A 키를 자동으로 역방향에 재사용하지 않는다.
- 원래 요청의 lease 등록·requestRef 결합·종료 폐기 및 worker 실패/재시작/복원 시 폐기. PHP DB 세션 잠금을 유지한 채 A를 기다리는 상황에서 callback이 같은 세션 잠금을 기다리지 않도록 별도 조회 경로를 검토해야 한다.
- 실제 installation/course/subject/actor와 B/A/CLEAR 매핑, 교사의 독립 현재 권한과 대상 학생 조회 범위.
- 단일 DB snapshot이나 원격 응답 전송과 철회의 원자성은 이 객체가 보장하지 않는다. 관측 직후 철회의 경쟁은 남는다. 외부 서비스 완료 시점의 재검사와 C 표시 직전 검사를 모두 유지해야 한다.

## 집중 검증

`moodle-integration/course_authority_lease_test.php`는 실제 새 PHP 클래스·기존 fresh 접근 클래스·페이지·wire client 코드를 실행하고 Moodle DB/helper 및 cURL을 모형으로 대체한다. 별도 `--network none` 임시 PHP 컨테이너에서 수행한다. 실제 DB epoch/trigger, TLS, 브라우저, A→C HTTP를 검증한 것으로 해석하지 않는다. 이전 browser 10개/lint 18개 묶음은 반복하지 않는다.

신규 집중 시험 20개와 변경 PHP 4개 lint가 통과했다. 새 ZIP은 A 조립용이며 기존 `http://127.0.0.1:18772` 설치의 0.1.5를 덮어쓰지 않았다. 기존 정상 경로는 `/course/view.php?id=<courseId>`, 학생 `/local/clearbridge/index.php?id=<courseId>`, 교사 `/local/clearbridge/configure.php?id=<courseId>`다. 권한이 있는 Moodle 사용자는 같은 메뉴와 기록 상태 다시 확인을 사용할 수 있으나 실제 owner가 미연결이면 기록은 미연결로 표시한다. 기존 철회 시험 계정의 등록·역할을 복구하거나 실제 사용자 로그인·서명을 실행하지 않았다.

발행 세대 경쟁, 누락/오류 provider, 지원 외 환경, 세션 교체/삭제, 계정/등록/권한/정의 철회, 최종 active가 같은 철회·복구, 설치 복구, epoch 역행, 시계/독점 만료 경계, requestRef 재사용, 다른 페이지·역할·run, actor 분리, 페이지 owner 응답 중 epoch 변경, 성공/실패/예외 폐기를 검사한다. 합성 epoch 증가는 의존성의 예상 동작을 시험하며 실제 Moodle DML 연동 완료를 주장하지 않는다.
