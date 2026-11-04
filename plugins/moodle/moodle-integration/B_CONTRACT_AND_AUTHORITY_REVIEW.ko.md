# B .3 계약 연결 및 authority/native 경계 리뷰

입력: C `afa3d17b292e74812ea526b054373219995b478d`, B `9db5ac78ecb1f174cd8bd23965fd4c8160849310`. 검토·수정은 Astra 실행 모델에서 수행했다(작업 권장 Astra/High). B/common 소스는 Git object로 읽었으며 수정하지 않았다. 실제 기관·브라우저 로그인·서명 없이 별도 Moodle 4.5.15 코어 설치와 합성 fixture만 사용했다.

## 계약 대조와 C 변경

| 항목 | B 9db5ac7 | 이전 C | 현재 C |
| --- | --- | --- | --- |
| observations 항목 | targetRef/status/observedAt exact keys | state → DTO_KEYS | status, 실제 PHP JSON을 B validator에 입력 |
| issuer/ref | ASCII 영숫자로 시작하는 `[A-Za-z0-9_-]`, 1–128자 | 일부 모두 64 hex로 제한 | issuerEpoch, attemptRef, requestRef, confirmationRef에 동일 opaque 규칙 |
| scope hash | 소문자 hex 64자 | hex 64자이나 요청값을 직접 발급에 사용 | 같은 형식 + 서버 attempt registry와 exact 대조 |
| confirmationRequest | version/attemptRef/requestRef/issuerEpoch/bindingScopeHash | 내부 두 필드 발급 입력만 존재 | exact .3 요청을 검증하고 조회는 발급과 분리 |
| confirmation 응답 | 신뢰 주체·시간·attempt·session 세대 등 전체 exact DTO | ref/expiry 내부 receipt만 존재 | `confirmation()`이 B 전체 DTO를 새 snapshot에서 반환 |
| 최초 확인 수명 | confirmedAt/ref/최초 expiry 유지, requestRef·관측은 갱신 | confirmation 재조회 없음 | attempt당 최초 발급 1건 UNIQUE, 재발급 거부, 조회는 원래 수명 유지 |
| 관측 시각 | 요청 뒤 fresh snapshot, observedAt ≤ checkedAt, B 최종 fence | observations에만 fresh snapshot | 두 조회 모두 새 RR READ ONLY; B 실제 currentness 검사도 실행 |
| 주체/신뢰 값 | B 정책의 installation/course/subject/audience/issuer/roster/trust와 exact 대조 | 합성 상수 또는 요청 issuer echo | 보호된 합성 attempt registry에서 반환 |
| 기능 권한 | READ_PREVIEW / OBSERVED_AT, 지급·자격 권한 없음 | 같은 제한 | 유지. targetRef와 accountHint는 합성 Page profile의 고정값 |

`mint()`는 별도 명시적 합성 사용자 확인 동작이다. B의 preview/complete verifier 조회를 곧바로 mint에 연결하지 않는다. `confirmation()`에 확인서가 없으면 CONFIRMATION으로 거부하며 절대로 새로 발급하지 않는다. `requestRef`는 매 조회 echo하지만 최초 발급 시각이나 수명을 재설정하지 않는다. `observe()`는 confirmationRef로 동일 확인서를 찾는다. 확인서 scope/profile/installation/session/authority와 registry를 모두 같은 snapshot에서 확인한다.

`clear_probe.attempts`는 신뢰하는 fixture owner만 쓸 수 있다. request의 issuer/scope와 registry의 ACTIVE/expiry, 내부 user/course/module mapping을 대조하고, 반환할 주체·roster/trust 값은 registry에서 얻는다. 등록/변경/삭제는 authority trigger에 참여한다. runtime/reader에는 SELECT만 허용한다. SECURITY DEFINER insert도 attempt·user·issuer·scope·expiry와 중복 발급을 확인한다. `attempt_fixture.php`는 공개 합성 owner 자격으로 이 registry를 준비하는 시험 도구이며 기관 서명 검증이나 운영 관리 API가 아니다.

시간 정책은 C의 합성 120초 상한, 원래 session idle 만료, 등록 만료, registry attempt 만료의 최솟값이다. 두 조회는 원래 confirmedAt 이전으로 시계가 돌아간 경우도 거부한다. B의 승인된 bindingSeconds/skew/왕복/최종 fence 정책을 C가 승인하거나 대체하지 않는다. 교차 시험은 **명시적 합성** bindingSeconds 120, roundTrip 5000ms, finalFence 1000ms, 관측 나이 10초, skew 0을 사용했다. B는 운영 정책과 C의 수명을 별도로 대조해야 한다.

## 모든 조회 입력의 변경 경계

| 입력/의존 테이블 | 변경 경로와 보호 | 검토·검사 범위 |
| --- | --- | --- |
| user | auth/confirmed/deleted/suspended/필수 프로필 등 전체 I/U/D/TRUNCATE → shared revision | 3 DML 경로 잠금, runtime TRUNCATE 거부, owner TRUNCATE revision·rollback |
| user_preferences, user_info_field, user_info_data | 강제 비밀번호 변경, custom 필드의 존재를 포함해 모든 DML → shared revision | 각 테이블 같은 경로 검사; 지원 profile은 custom 필드 없음 |
| enrol, user_enrolments | manual 방식, 상태, 대상 강좌·사용자, 시작/종료 변경 → shared revision | 각 테이블 같은 경로 검사; 활성/기한은 매 snapshot SQL 검사 |
| role, role_assignments, role_capabilities, capabilities, context | 역할/override/context/default 권한은 full metadata digest + shared revision | 각 테이블 같은 경로 검사; collector 초기 평가와 이후 digest 분리 |
| config, config_plugins | DB 설정/권한 정의 변화 → digest + shared revision | 각 테이블 같은 경로 검사; 프로세스 CFG 캐시는 별도 아래 경계 |
| course, course_categories, course_sections | 강좌/상위 category/section visibility·availability·group·completion 변화 → shared revision | 각 테이블 같은 경로 검사 |
| course_modules, modules, page | 모듈/instance/강좌 연결과 Page profile 변화 → shared revision | 각 테이블 같은 경로 검사; 본문은 reader 조회 불가 |
| clear_probe.attempts | issuer/scope/사용자 mapping/주체/roster/trust/expiry/status → shared revision | owner I/U/D도 발급 잠금 중 차단; runtime 쓰기·TRUNCATE 거부 |
| sessions, generations | 기존 session 행 FOR UPDATE + 코어 advisory lock + 세션별 I/U/D generation; TRUNCATE는 shared revision | 현재 UPDATE/DELETE 차단, 다른 session I/U/D 독립, post-read 변경·logout·native role switch 무효화 |
| course_modules_completion | 권한이 아닌 관측 값. **authority lock으로 보호하지 않음** | 동일 RR snapshot에서 읽음. 도중 완료 변경은 이전값, 다음 조회는 새 값. 0/1/없음만 허용 |
| confirmations | guard 함수만 INSERT, runtime 직접 쓰기 없음 | 원래 수명/attempt UNIQUE, sid/generation/revision/registry 결합. owner 유지보수는 서비스 정지 전제 |
| pg_proc/pg_trigger/pg_class/pg_namespace/pg_roles/pg_auth_members/pg_parameter_acl/pg_attribute | **authority lock으로 보호하지 않음**. 정의·owner·ACL·상태 pin + non-owner runtime 권한 경계 | 기존 함수/trigger drift 거부 검사는 유지. DB owner의 동시 DDL·역할 변경을 잠금으로 막는다고 주장하지 않음 |
| 코드, config.php의 allowlist CFG, collector profile, 설치 epoch, PHP 메모리, 시계 | **DB authority lock 대상 아님** | 코드 ro mount/boot hash, 명시 CFG 비교, 신뢰된 quiescent collector, native 최종 encoding·alias 검사, 시간 fence로 구분 |

19개 public authority 테이블의 I/U/D는 실제 PostgreSQL statement trigger에 도달하는 별도 연결에서 검사했다(0행 DML도 statement trigger가 실행된다). runtime TRUNCATE 거부와 owner TRUNCATE의 revision 증가/rollback도 각 테이블에서 검사했다. attempts와 sessions의 별도 경로까지 포함한다. COPY/MERGE 같은 다른 SQL 표면은 독립 실행했다고 주장하지 않는다. 같은 서버 trigger 발화 및 권한 모델에 의존하며, 운영 DML 표면·partition·replica·restore 경로는 인수 대상이다.

전역 revision은 보수적이다. 다른 사용자의 역할 변경이나 다른 attempt 등록도 기존 확인서를 무효화할 수 있다. 세션 generation만 사용자 session 단위로 분리되어 있다. 가용성 최적화 없이 검증 경계를 좁히지 않는다.

## 발견한 반례와 native lifecycle 경계

1. **외부 delegated transaction**: 내부 `allow_commit()`은 최상위 commit이 아닐 수 있다. `mint()`가 열린 외부 transaction을 OUTER_TRANSACTION으로 거부하도록 수정했고 발급 0건을 검사했다.
2. **native 메모리 연결 분리**: `$USER`/`$SESSION`과 `$_SESSION`이 다른 객체이면 검사한 사용자와 저장한 상태가 달라질 수 있다. 시작 및 flush 이후 두 객체의 동일성을 확인한다. USER 연결을 끊는 전·후 반례가 거부된다.
3. **필수 profile 문자열 "0"**: 코어 `user_not_fully_set_up()`은 PHP empty()로 누락 처리하지만 기존 SQL의 `<>''`는 허용했다. firstname/lastname/email에서 `''`와 `'0'`을 모두 거부하고 실제 core helper와 SQL의 같은 반례를 검사했다.
4. **abort 뒤 메모리는 변경 가능**: session_abort는 native persistence를 끝낼 뿐 PHP globals를 동결하지 않는다. 실제 handler로 native read/decode → flush/commit → abort/close를 검사했으며 종료 후 session_write_close가 메모리 변경을 저장하지 않음을 확인했다. 이를 HTTP 동작 종료 보장으로 표현하던 주석을 수정했다.

`native_handler_fixture.php`는 실제 core-derived handler를 PHP native save handler로 등록한다. persisted bytes를 PHP가 decode하고 globals를 연결하며, 재개 후 실제 core role_switch → native write_close가 기존 확인서를 무효화한다. 이전 no-storage codec fixture와 구별한다. 하지만 CLI에서 Moodle manager의 sessionactive/static handler 전체 초기화·쿠키 검증·로그인·regenerate_id·shutdown·destroy_all을 실행한 것은 아니다. 운영 host는 사용자 확인 후 그 action을 종료하고, 승인한 handler와 manager lifecycle을 일치시켜야 한다. core failure 로그/close·destroy 오류 경로도 HTTP 오류 정제와 함께 인수해야 한다.

collector의 최초 권한 판정은 정지된 합성 fixture에서 캐시와 DB가 일치한다는 전제다. 최초 수집 중 캐시가 오래됐거나 관리자가 변경하는 상황을 SQL lock 하나로 해결하지 않았다. 운영 승인 collector는 quiescent bootstrap 또는 fresh context/cache 수집과 서명/epoch를 갖춰야 한다. read-only bind mount도 호스트 관리자에게 불변인 것은 아니므로 프로세스 실행 중 호스트 소스를 고치지 않는다.

## 재현과 남은 관문

`README.ko.md`의 새 격리 설치 절차를 따른다. 이 commit의 install.php는 새 attempts schema/함수 서명을 포함하므로 이전 fixture DB에 단순 덮어쓰기하지 않는다. source/adapter는 ro mount, target JSON은 합성 numeric ID만 사용한다. 기존 서비스에는 연결하지 않는다.

```sh
docker exec -e CLEAR_ACTUAL_MOODLE_PROBE=1 clear-actual-reader-web php /probe/moodle-integration/boundary_tests.php
docker exec -e CLEAR_ACTUAL_MOODLE_PROBE=1 clear-actual-reader-web php /probe/moodle-integration/mutation_tests.php
./tools/node plugins/moodle/moodle-integration/cross-language.test.mjs
```

교차 스크립트는 B commit의 contract.mjs와 currentness.mjs를 `git show`로 읽어 메모리에서 import한다. B checkout/변경은 없으며, actual PHP process가 출력한 JSON을 그대로 validateDto 및 checkCurrentness에 넣는다. 1자/128자/일반 opaque, 잘못된 issuer/scope/ref, extra userId, 최초 확인 유지, 실제 Page 변경, native role switch, registry 회수와 이전 state shape 거부를 검사한다. `cross-language-output.json`은 실제 합성 DTO와 요청/수신 시각, B source hash를 담는다. 이는 B coordinator 전체 제품 연결·HTTP/mTLS 인수 결과가 아니다.

운영 관문은 authenticated attempt 조회·기관 roster/trust 서명 registry, 동의/CSRF 및 HTTP 사용자 확인 경로, issuer peer 인증과 오류 정제, B와 공유하는 운영 시간 정책, durable 설치 epoch·복구·청소, Moodle manager 전체 lifecycle과 최초 승인 collector다. C 합성 registry의 owner 준비 동작을 기관 신원·신뢰 승인으로 대체하지 않는다. 실제 기관 자료 반환·자격·지급은 활성화하지 않는다.
