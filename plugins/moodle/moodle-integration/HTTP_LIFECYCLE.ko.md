# 합성 HTTP session manager 인수

이 결과는 Moodle 4.5.15 / PHP 8.3.35 / PostgreSQL 16.14의 폐기 가능한 합성 사이트에 한정한다. 기존 입력 head `37385cd0fc8ae835c08a95fbd4060d21b8e3d920`, B 시간 정책 소비자는 `210a739e1d8a2b8e7af2ef894b9309c1352b5a14`다. 기관 로그인, 실사용자, 배포, 서명, 운영 플러그인 활성화는 하지 않는다. 변경 소유 범위는 `plugins/moodle/**`다.

## 실제로 연결한 경로

`http_bootstrap.php`는 격리 환경 변수 두 개가 있을 때만 fixture handler를 autoload한다. `http_database`는 실제 `core\session\database`를 상속한 strict/guarded handler의 HTTP 확장이다. 코어 파일은 수정하지 않는다. 새 세션의 빈 native read 뒤 실제 manager가 행을 만들며, 이때 handler는 해당 행의 core advisory lock과 generation receipt를 확보한다. `manager::login_user()`와 `terminate_current()`가 실제 native cookie 재생성·이전 행 삭제·사용자 연결·종료를 수행한다. fixture-login은 고정된 합성 사용자를 선택하는 시험용 helper이며 인증 서비스가 아니다.

`http_router.php`의 확인 경로는 POST, 현재 세션의 Moodle `confirm_sesskey()`, 명시적 `confirm: true`, 합성 학생 identity와 실제 `require_login(course, false, cm)`을 통과해야 한다. 이어 기존 동일 트랜잭션의 strict flush + confirmation insert를 호출한다. 성공·실패 후 native abort와 handler seal, manager write_close를 실행한다. seal은 이후 open/read/write와 manager의 세션 변경 진입을 거부한다. globals는 여전히 바뀔 수 있지만 이 핸들러를 통한 저장은 종료된다. 성공 응답·303 redirect·shutdown에서 globals 변경, native restart, 직접 handler open/write를 시도해 확인한다.

lookup은 Moodle bootstrap 전에 `NO_MOODLE_COOKIES`를 지정한다. owner fixture writer를 import하지 않고 기존 read-only confirmation만 호출한다. 오류 본문은 고정된 `REJECTED` JSON이며 Set-Cookie도 제거한다. 쿠키/SID/raw session/SQL/예외 원문을 응답으로 반환하지 않는다. 합성 sesskey는 정상 `/session` 응답에만 들어가며 시험 클라이언트의 쿠키 jar와 함께 메모리에서 사용한다. 검사 로그에는 출력하지 않는다.

## B 독립 리뷰 조치

**F1 — 관측 나이.** `adapter.php`의 observedAt을 첫 snapshot SELECT 호출 직전으로 옮겼다. snapshot 획득의 정확한 순간이라고 주장하지 않으며, 그보다 늦지 않은 보수적 하한이다. 실행·전송 지연은 checkedAt에만 반영한다. `snapshot_delay_fixture.php`는 실제 PostgreSQL 조회를 수행한 뒤 PHP에 결과를 반환하기 전에 3.1초 기다린다. 실제 lookup DTO와 wall/monotonic 측정값을 B 고정 Git object의 checkCurrentness에 전달한다. age 2초 / RTT 5초에서 `OBSERVATION_OLD`여야 하며, 옛 post-query 시각으로 바꾼 반례는 ACCEPT여야 한다. 시계나 제한을 수정하지 않는다. 이 지연 검사는 CLI worker가 immutable code hash를 시작 때 한 번 계산한 후 수행하며, HTTP 전 구간의 지연 시험이라고 주장하지 않는다.

**F2 — 정상 metadata 갱신 receipt.** HTTP handler의 update_session은 id/userid/lastip/timemodified만 허용한다. core advisory lock을 보유한 상태에서 최상위 transaction을 열고 실제 sessions 행을 FOR UPDATE로 잠근 후 기존 generation과 userid를 검증한다. 같은 DB 연결의 정상 metadata UPDATE로 정확히 generation +1이 된 경우에만 receipt를 진전시킨다. runtime은 generations의 UPDATE 권한을 갖지 않는다. 실제 manager의 첫 재사용·활동 시각 갱신·IP 갱신 경로는 발급 성공으로 확인한다. 별도 runtime DB 연결이 native read 직후 sessdata 또는 userid를 바꾼 경우 metadata 갱신이 이를 승인한 것으로 처리하지 않고 거부한다. flush 시 현재 generation을 무조건 수용하거나 NO_SESSION_UPDATE로 회피하지 않는다.

## 재현

기존 README의 fresh synthetic 설치/setup을 먼저 수행한다. 읽기 전용 core와 `/probe`, writable dataroot, `/tmp/clear-target.json`을 갖춘 전용 컨테이너 `clear-actual-reader-web`을 사용한다. core는 Docker 내부 전용 볼륨의 읽기 전용 mount를 사용했다. macOS 공유 마운트에서는 매 요청 전체 source hash가 5초 제한을 넘어서 거부되었으며, 제한을 늘리지 않았다. `/probe`는 이 브랜치의 plugins/moodle 읽기 전용 mount다.

폐기 가능한 config.php에만 다음 조건부 설정을 추가한다. 기본 CLI 회귀에서는 기존 database backend를 유지한다.

```php
$CFG->wwwroot = 'http://127.0.0.1:18765';
if (getenv('CLEAR_HTTP_LIFECYCLE_PROBE') === '1') {
    $CFG->session_handler_class = '\\clear_moodle_probe\\http_database';
    $CFG->debug = 0;
    $CFG->debugdisplay = 0;
}
```

아래 서버와 클라이언트는 별도 프로세스이며 서버는 컨테이너 loopback에만 bind한다. host port는 공개하지 않는다. 기존 실행 결과나 살아 있는 DB를 재사용할 때는 fresh fixture로 다시 준비하는 편이 낫다. prepare는 owner 권한으로 새 합성 attempt를 추가하며 authority가 바뀌므로 기존 확인서는 무효화된다.

```sh
docker exec -d -e CLEAR_ACTUAL_MOODLE_PROBE=1 -e CLEAR_HTTP_LIFECYCLE_PROBE=1 \
  clear-actual-reader-web sh -c \
  'php -d display_errors=0 -S 127.0.0.1:18765 /probe/moodle-integration/http_router.php >/tmp/clear-http-server.log 2>&1'
docker exec -e CLEAR_ACTUAL_MOODLE_PROBE=1 -e CLEAR_HTTP_LIFECYCLE_PROBE=1 \
  clear-actual-reader-web php /probe/moodle-integration/http_lifecycle_tests.php
./tools/node plugins/moodle/moodle-integration/snapshot-age.test.mjs \
  210a739e1d8a2b8e7af2ef894b9309c1352b5a14
```

HTTP suite는 lookup 비발급, POST/sesskey/명시 동의, 정상 확인·재시도, 중첩 transaction/실패 rollback과 정확한 persistent bytes 보존, 발급 후 응답·redirect·shutdown, 정상 metadata receipt와 외부 변조, logout·regenerate·role switch, 이전 cookie의 identity/confirmation 복구 불가를 검사한다. `http_faults.php`의 고정 헤더 주입은 격리 fixture에서만 허용하는 반례 장치다. 운영 라우터로 복사해서는 안 된다. 새 결과는 `http-lifecycle-verification.txt`에 보관하며 이전 head의 증거 파일은 덮어쓰지 않는다. 최종 실행은 HTTP 113개 assertion(준비/검사 프로세스 검증 포함), F1 시간 정책 반례 2개, 기존 PHP 154 + 교차 언어 42 = 196개 회귀, B coordinator 9개 모두 통과했다. PHP 22개 파일 lint도 통과했다. F1 lookup 측정은 3210.28ms, checkedAt-observedAt은 3초였다.

## 운영 인수에 남은 최소 변경과 외부 입력

- 실제 승인된 handler 등록/autoload와 terminal 확인 controller, session backend별 lock/receipt 검토가 필요하다. 현재 파일은 fixture이며 운영 Moodle endpoint가 아니다.
- 기관의 immutable code/CFG/hook inventory와 일관된 collector bootstrap, 승인된 issuer·installation/course/subject·roster/trust registry, 인증된 verifier transport와 실제 HTTPS/cookie 정책이 필요하다. 시험의 loopback HTTP cookie에는 Secure를 요구하지 않는다.
- schema/role/trigger의 운영 migration, owner 유지보수 직렬화, 복구 epoch·보관/삭제·부하 정책은 별도다. 현재 broad generation trigger는 정상 세션 활동도 기존 확인서를 무효화할 수 있다. 이 보수적 동작을 완화하지 않았다.
- B/common 제품 DB 연결, 기관 UI/실사용자 로그인, 다른 인증·세션 플러그인이나 분산 저장소는 이번 결과의 범위가 아니다. 원격 관측과 CLEAR commit 사이 전역 원자성도 제공하지 않는다.

권장 설정은 Astra/High이며 실제 실행 모델은 Astra다. 성능 대기 때문에 모델 수준을 올리거나 같은 성공 검사를 반복하지 않았다.
