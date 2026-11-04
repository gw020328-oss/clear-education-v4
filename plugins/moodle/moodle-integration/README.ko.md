# 실제 Moodle 코어 테이블 통합 실험

Moodle **4.5.15 (2024100715 / Build 20261005)**, PHP **8.3.35**, PostgreSQL **16.14**의 별도 설치에서 합성 계정·강좌·Page를 사용한 CLI 통합 프로토타입이다. 앞 단계 `../synthetic-profile/`의 shadow 테이블 실험과 구분한다. 이 디렉터리의 입력은 실제 `mdl_sessions`, 등록, 역할, 권한, 강좌, Page, 수동 완료 테이블이다. `clear_probe`는 세대·권한 revision·확인서만 보관한다.

[B 계약 대조·authority/native 경계 리뷰](B_CONTRACT_AND_AUTHORITY_REVIEW.ko.md)는 후속 수정과 재현 조건을 설명한다.

실제 기관 계정 로그인, 브라우저 쿠키 왕복, 기관 서명, 배포 또는 운영 승인 결과가 아니다. `local_clearbridge` 업그레이드에서 실행되지 않으며 `CLEAR_ACTUAL_MOODLE_PROBE=1`과 합성 사이트를 전제로 한다. 공개 fixture 비밀번호를 운영 설정에 사용하지 않는다.

## 발급 경계

1. `guarded_database.php`는 실제 코어 database handler를 상속한다. 기존 session 행을 읽고 코어 PostgreSQL advisory lock을 획득한 뒤 저장된 bytes와 generation을 함께 읽는다. 실패 신호에 sid나 원문 세션을 넣지 않는다.
2. `adapter.php::mint()`는 같은 sid의 활성 PHP 세션에서 `session_encode()`를 직접 호출한다. 호출자가 직렬화된 bytes를 전달하지 않는다. 로그인 가장·role switch 상태를 거부한다.
3. 같은 Moodle DB 연결의 트랜잭션에서 authority 행을 `FOR SHARE`, 실제 session 행을 `FOR UPDATE`로 잠근다. read 이후 generation 변경을 거부하고, strict handler로 직렬화한 세션을 저장한 뒤 영속 bytes가 정확히 일치하는지 다시 확인한다. 실패하면 발급하지 않는다.
4. 잠긴 권한 snapshot과 profile을 확인하고 실제 등록·Page gate를 다시 조회한다. flush 이후의 role switch 및 PHP 세션 메모리 변화도 insert 전에 거부한다.
5. 신뢰하는 합성 registry의 attempt/issuer/scope/사용자·강좌·모듈/기한을 대조한다. `insert_confirmation` SECURITY DEFINER 함수는 해당 backend가 코어 session advisory lock을 보유하는지 직접 확인한다. authority/session 행 잠금, 사용자·generation·revision 일치와 최대 120초의 만료를 다시 검증한다. 외부 delegated transaction을 거부하며 저장과 확인서 insert는 같은 최상위 트랜잭션으로 commit된다. attempt당 최초 발급은 한 번만 허용한다. 이후 native session을 abort하고 lock을 해제한다.

동시 session UPDATE는 행 잠금으로, 권한 변경은 statement trigger가 갱신하는 authority 행으로 차단된다. 잠금 해제 후 성공한 변경은 세대 또는 revision을 증가시키므로 기존 확인서를 되살리지 않는다. 함수 호출 권한은 신뢰하는 Moodle runtime에만 있으며 함수 자체가 HTTP 인증 경계를 대신하지 않는다.

`native_codec_fixture.php`는 쿠키·파일 저장 없이 PHP native codec을 실행하기 위한 CLI fixture다. 코어 handler의 DB persistence/lock과 native 직렬화를 함께 검사하지만, `native_handler_fixture.php`는 실제 handler의 native read/decode/write_close/abort까지 별도 검사한다. 실제 HTTP session manager의 초기화·종료 전체 경로는 아직 연결하지 않았다. session_abort가 PHP globals를 동결한다고 해석하지 않는다. 합성 사용자는 `manager::set_user()`로 설정하며 실제 로그인 성공을 주장하지 않는다.

## 관찰과 승인 profile

`confirmation()`과 `observe()`는 `.3` 요청 필드를 엄격히 확인한 뒤 전용 reader 연결에서 새 `REPEATABLE READ READ ONLY` 트랜잭션을 연다. 확인서 첫 조회가 snapshot을 획득한다. confirmation 조회는 새 발급을 하지 않으며 최초 confirmedAt/ref/expiry를 유지한다. 항목 키는 B의 exact 계약과 같은 `status`다. 같은 snapshot에서 함수·trigger·ACL, 역할/config digest, 세대·권한 revision, 등록 및 Page 상태를 확인한다. 5초 실행 제한과 배타적 만료를 적용하며 기존 확인서의 유효기간을 연장하지 않는다.

`page.sql`의 범위는 활성 manual 사용자와 단일 manual 등록, 일반 student 역할, 보이는 topics 강좌·상위 category·section·Page, 그룹 및 availability 제한 없음, **수동 완료**뿐이다. 저장된 완료 행 없음/0은 INCOMPLETE, 1은 COMPLETE이며 다른 상태나 중복 행은 거부한다. 실제 사용자의 학습 행위나 과제·성적 달성을 증명하지 않는다. `moodle/course:view`는 등록을 우회하는 권한이므로 학생 필수 gate로 사용하지 않는다. collector는 `local/clearbridge:view`, `mod/page:view` 및 비특권 역할을 확인한다.

collector는 정지된 합성 fixture의 신뢰하는 초기 수집 절차다. 기관 승인 registry·서명 검증은 구현하지 않았다. 이후 역할/assignment/capability/context/config/config_plugins 전체 digest를 고정하고, core 사용자·등록·강좌 gate는 각 요청에서 읽는다. source tree의 지정 확장자 파일과 adapter/base handler 파일을 SHA-256으로 고정한다. 코어에 존재하는 `tool_mfa_after_require_login` hook은 MFA가 꺼진 정확한 inventory만 허용한다.

함수 정의·owner·EXECUTE ACL, trigger 정의·ALWAYS 상태, 역할 특권·membership, parameter/schema/table/column ACL도 고정한다. Moodle root와 `/probe`가 read-only mount인지 확인한 뒤 프로세스 내 code hash를 캐시한다. **호스트 관리자에 의한 파일 변경 및 DB owner 유지보수는 신뢰 경계**이며, 작업 중 수정하지 않고 변경 후 profile을 다시 수집해야 한다. config.php 원문은 hash/export하지 않고 명시된 CFG 값만 검사한다. 운영에서 모든 설정·동적 hook을 포괄한다는 주장은 하지 않는다.

reader는 session sid/sessdata, 사용자 password, Page content, 성적을 읽을 수 없다. 권한 metadata는 SECURITY DEFINER가 계산한 digest로만 읽는다. HTTP 오류 정제, mTLS, 실제 issuer/roster registry, sesskey/CSRF와 브라우저 endpoint는 후속 작업이다. 응답의 installation/course/subject/audience 및 roster/trust 값은 owner만 쓰는 합성 attempt registry에서 반환한다. 실제 기관 registry가 아니며 accountHint와 targetRef는 합성 profile 상수다.

## 재현과 증거

준비 조건은 PostgreSQL 16의 빈 전용 Moodle DB, Moodle 4.5.15 코어와 이 브랜치의 `local_clearbridge`를 설치한 합성 사이트(shortname `clear`), pgsql 확장이 있는 PHP 8.3이다. 테스트 동안 메일·외부 인증·공개 port를 연결하지 않는다.

1. disposable source copy의 config.php에서 초기 fixture owner를 사용해 코어 및 플러그인을 설치한다. session handler는 `\\core\\session\\database`로 지정한다.
2. `/probe`에 `plugins/moodle`을 연결하고 `CLEAR_ACTUAL_MOODLE_PROBE=1 php /probe/moodle-integration/setup.php`를 실행한다. core API로 합성 계정·강좌·수동 Page를 생성하며 `/tmp/clear-target.json`에 내부 fixture ID만 기록한다. `install.php`는 core 테이블을 소유하지 않는 runtime/reader/NOLOGIN guard와 trigger를 단일 트랜잭션으로 설치한다. 새 설치 전용이며 idempotent migration이 아니다.
3. disposable config를 DB host `clear-actual-db`, DB `moodle`, runtime `clear_moodle_runtime`/`synthetic-runtime`으로 바꾸고 코어를 `/var/www/html:ro`, 플러그인을 `/probe:ro`, target 파일을 `/tmp/clear-target.json:ro`에 mount한다. writable dataroot `/var/moodledata`를 별도로 준비한다. 이 fixture의 owner는 `moodle`/`isolatedtest`, reader는 `clear_moodle_reader`/`synthetic-reader`다.
4. 같은 격리 PHP container에서 아래 순서로 실행한다. 실패 injection에는 fixture owner 연결도 사용한다. 다른 DB를 지정하지 않는다.

```sh
export CLEAR_ACTUAL_MOODLE_PROBE=1
php /probe/moodle-integration/tests.php
php /probe/moodle-integration/issuance_failure_tests.php
php /probe/moodle-integration/function_fence_tests.php
php /probe/moodle-integration/boundary_tests.php
php /probe/moodle-integration/mutation_tests.php
# Host에서 B 9db5ac7 Git object와 실제 PHP process를 교차 검증:
./tools/node plugins/moodle/moodle-integration/cross-language.test.mjs
```

최종 결과는 `verification.json`, `verification.txt`, `cross-language-output.json`에 보관한다. 기존 34개 실제 코어 회귀 + 신규 native/반례 10개 + mutation 경로 110개 + 교차 언어 42개 = **196개 PASS**, PHP 15개 파일 lint 통과다. 이번 schema를 새 격리 코어 설치에 적용했다. B 계약 파일은 읽기 전용 Git object로 사용하며 실제 PHP JSON에 B validateDto와 checkCurrentness를 실행했다. 이전 shadow 51개나 B 자체 검사 수는 합산하지 않는다.

권한 trigger가 광범위하므로 관련 없는 config 변경도 확인서를 무효화할 수 있다. 운영 부하, 보관/삭제 정책, 장애 복구 및 실제 브라우저 lifecycle 검증은 남아 있다. 기존 서비스·기관 데이터·B/common/A 코드는 변경하지 않았다.
