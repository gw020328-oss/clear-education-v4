# Moodle 현재 권한 bridge 0.1.7

2026-11-04. C 소유 파일만 구현했다. 기존 Moodle 설치·DB·키를 수정하지 않았다. 최종 설치·TLS·A resolver 조립은 A 담당이다. 실제 설치 세대/authorityEpoch 및 승인된 actor/subject 매핑 공급원은 아직 연결되지 않았다. 이 조건에서는 실제 발행/조회가 성공하지 않는다.

## 구현 파일과 호출 순서

- `local_clearbridge/authority.php`는 기존 Moodle 웹서버의 정확한 `POST /local/clearbridge/authority.php`만 받는다. query suffix, 브라우저 쿠키, 사용자 Authorization은 거부한다. bootstrap 전 `NO_MOODLE_COOKIES=true`를 설정하고 active PHP 세션이 있으면 실패한다. Moodle 4.5.15 core manager의 이 분기는 handler 세션을 시작하지 않는다.
- `classes/course_authority_registry.php`는 운영자가 미리 준비한 run 파일만 연다. 새 DB/table/file을 자동 생성하거나 손상 파일을 복구하지 않는다. 동일 파일을 여러 PHP worker가 `flock`으로 읽고 쓴다.
- `classes/course_authority_currentness.php`는 서비스 인증과 현재 DB 검증을 수행한다. 세션 행 ID/userid/생성시각/idle 기한, manual auth의 활성 actor·subject, 각 현재 등록, 강좌·상위 category 공개 상태, 현재 actor의 fresh core role assignment와 capability 및 uncached role definitions를 읽는다. site admin·guest는 이 좁은 후보에서 제외한다. `USER`를 바꾸거나 세션을 재개하지 않고 SID·sessdata를 조회하지 않는다.
- 원래 페이지는 선택적 lease에 bridge를 붙인다. `course_read_client::read()`가 6필드 요청을 만든 직후 `publish_request()`로 정확한 requestRef/run/role/기한을 등록하고 나서 A 호출을 시작한다. callback은 같은 요청만 읽는다. owner 응답 후 페이지가 local lease와 registry/DB를 다시 확인하고 `finally`에서 폐기한다.

원래 요청의 private record에는 request, binding, generation, courseId, actorUserId, subjectUserId, sessionRowId, sessionCreatedAt, startedMonotonic만 있다. SID, Moodle 쿠키·token·sessdata, CLEAR context는 저장하거나 전달하지 않는다. 원래 lease의 monotonic 시작값과 exclusive wall 만료를 함께 검사한다. callback은 원래 요청 수명을 연장하지 않는다.

B가 지적한 PHP numeric-string 비교 문제도 수정했다. `0e` + 62자리 숫자 형식의 서로 다른 유효 hex64 ref는 필드별 `!==`로 구분한다. 같은 요청의 키 순서 변화는 허용한다. registry의 request 값 비교도 strict다.

## 서버 설정 포트

`$CFG->local_clearbridge_authority_service`의 exact 필드는 `enabled, origin, ownerRunId, key`다. origin은 고정 HTTPS origin이고 key는 A→C 전용 lowercase hex64 문자열이다. 기존 `$CFG->local_clearbridge_course_read['key']`와 같으면 거부한다. 실제 키나 설정은 코드/ZIP에 포함하지 않았다.

`$CFG->local_clearbridge_course_authority_bridge`는 서버 전용 무인수 Closure로 exact `{registry, currentness}`를 반환한다. 각각 실제 `course_authority_registry`와 `course_authority_currentness` 객체여야 한다. 원래 페이지와 callback이 같은 run 파일과 승인된 공급원을 사용한다.

```text
new course_authority_registry(absolutePrivateRunFile, ownerRunId)
new course_authority_currentness(readGeneration, resolveCurrentMapping)
```

`readGeneration(privateScope)`의 scope는 exact `installationRef, ownerRunId, courseId, actorUserId, subjectUserId, sessionRowId, sessionCreatedAt`이다. 반환은 기존 exact `{installationGeneration, authorityEpoch}`다. 실제 primary DB의 fresh revision과 운영자의 설치 세대를 읽어야 한다. 원래 local lease의 무인수 generation Closure는 동일 scope를 캡처해 같은 공급원을 호출해야 한다. timestamp, HMAC, registry floor, 고정 합성 숫자로 대체하지 않는다.

`resolveCurrentMapping(binding, role)`은 exact `{binding, courseId, actorUserId, subjectUserId}`를 반환한다. binding의 6필드는 `installationRef, ownerRunId, courseRef, subjectRef, actorRef, expiresAtExclusive`다. 저장된 binding/내부 actor/course/subject와 현재 결과가 모두 같아야 한다. participant의 actorUserId는 subjectUserId와 같아야 한다. teacher는 actor와 대상 학생을 분리하고 `local/clearbridge:configure`를 검사한다. A의 별도 CLEAR operator 인가와 B binding 현재성은 이 결과로 대체하지 않는다.

현재 DB 검사 앞뒤에 generation·mapping을 다시 읽고, 최종 응답을 만들기 전 DB 검사를 한 번 더 수행한다. 원래 페이지가 중간에 폐기했는지도 registry에서 다시 확인한다. Moodle의 진행 중 delegated DB transaction은 거부한다. 공급원이 오래된 transaction snapshot이나 캐시를 반환해서는 안 된다. 이 방식은 검사 후 원격 전송 사이의 철회를 원자적으로 막는다고 주장하지 않는다.

## A→C 인증과 결과

요청 body는 기존 `clear-moodle-course-read-request.1`의 6필드 JSON이다. compact JSON encoding을 사용하며 duplicate keys나 encoding 정규화 차이는 거부한다. 최대 4096 bytes다. 실제 HTTPS 서버의 `HTTPS` 값과 Host를 검사하며 forwarded 헤더로 TLS/host를 추정하지 않는다. A는 고정 CA/hostname 검증, redirect/retry 금지와 남은 요청 기한을 적용해야 한다.

헤더는 `X-Clear-Timestamp`, `X-Clear-Nonce`, `X-Clear-Signature`다. timestamp는 현재 Unix seconds이며 미래 또는 5초 이상 지난 값은 거부한다. nonce는 lowercase hex32, signature는 lowercase hex64다. signing material은 다음 줄들을 LF로 연결한 문자열이며 마지막 LF는 없다. key는 hex 문자열 자체의 UTF-8 bytes다.

```text
CLEAR-MOODLE-AUTHORITY-A-TO-C-1
<timestamp>
<nonce>
POST
/local/clearbridge/authority.php
<sha256(raw body) lowercase hex>
```

같은 callback 요청을 재검증할 때도 A는 새 nonce를 사용해야 한다. 인증 후 nonce를 run registry에서 원자적으로 소비한다. C→A 서명 material과 키를 역방향에 재사용하지 않는다.

인증 실패·disabled/missing config·nonce replay는 HTTP 403 `{"code":"REJECTED"}`다. 인증된 요청은 HTTP 200의 exact 13필드를 반환한다.

```text
version = clear-moodle-authority-check.1
requestRef, ownerRunId, moodleAuthorityRef, role, status
installationRef, installationGeneration, authorityEpoch
courseRef, subjectRef, actorRef, expiresAtExclusive
```

성공 status는 `OK`다. 실패는 `UNAVAILABLE`이며 마지막 scope 7필드가 모두 null이다. request 상관 4필드와 version/status만 남는다. 응답은 no-store이며 Set-Cookie를 내보내지 않는다. A는 매 scope 호출에서 이 결과를 새로 읽고 모든 상관·매핑·설치 세대·actor·epoch를 대조해야 한다. 기존 A resolveAuthority의 mapping/CLEAR context는 A 서버가 구성한다.

## registry 운영 경계

파일의 실제 경로는 A/설치 운영자가 승인해야 한다. 기존 Moodle dataroot 아래 canonical 0700 디렉터리, 웹 PHP uid 소유의 0600 단일 hardlink regular file이 필요하다. 초기 run 파일은 다음 구조를 사전 준비한다. 이 준비를 이번 작업에서 실제 설치에 실행하지 않았다.

```json
{"version":"clear-moodle-authority-registry.1","ownerRunId":"<approved-run>","wallFloor":0,"leases":[],"nonces":[]}
```

파일 최대 256 KiB, 활성 lease 128개, nonce 1024개로 제한한다. 정상 읽기에서도 exclusive 만료를 정리하고 wall floor를 유지한다. floor는 callback replay/시계 역행 방어용이며 authorityEpoch가 아니다. write/flush/fsync와 파일 권한 검사가 실패하면 자료를 반환하지 않는다. 읽기 lock 경합도 `UNAVAILABLE`이며 cleanup은 원래 exclusive 만료 또는 monotonic 5초 한도까지만 재시도한다. cleanup 실패 시 페이지 결과를 숨긴다. 손상/경로 오류를 자동 복구해 이전 권한을 되살리지 않는다. 강제 종료·복원·절전 복구 프레임워크를 추가하지 않았다.

## 검증과 인계 범위

`course_authority_lease_test.php`의 21개에는 B의 magic numeric-string 재현 회귀가 포함된다. `course_authority_bridge_test.php`의 17개는 실제 PHP registry 파일, 별도 프로세스의 nonce 경쟁, 실제 authority.php 파일의 별도 HTTP worker 실행을 포함한다. DB/helper/epoch/mapping 및 HTTP fixture의 HTTPS server flag는 합성 모형이다. 실제 Moodle+TLS·운영 trigger·실제 A 연결 성공으로 합산하지 않는다. fixture는 설치 ZIP 밖에 둔다. 이전 browser10/lint18을 반복하지 않았다.

실제 정상 Moodle은 `http://127.0.0.1:18772/course/view.php?id=2`의 0.1.5 설치를 보존했다. 학생 메뉴 `/local/clearbridge/index.php?id=2`, 교사 메뉴 `/local/clearbridge/configure.php?id=2`와 기록 상태 다시 확인 경로는 유지한다. 새 0.1.7은 A 조립용 ZIP이며 아직 설치하지 않았다. 실제 로그인·증명·서명, 계정 철회 상태 복구, 새 운영 서버/DB/schema/키 생성은 하지 않았다.

실제 연결의 남은 의존성은 승인된 세대·매핑 공급원과 A의 HTTPS/service adapter 설정이다. 최소 PostgreSQL 후보는 [세대 공급원 제안](COURSE_AUTHORITY_GENERATION_PROPOSAL.ko.md)에 분리했다. 해당 DB 변경은 본부가 파일/소유 경로를 확정하기 전에는 실행하지 않는다.
