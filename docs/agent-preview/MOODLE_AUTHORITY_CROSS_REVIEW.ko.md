# C의 Moodle 권한 결정안과 B revision 3 교차 리뷰

2026-11-04. B 기준 `0ec25db95697ec02140485bc394cb58a6d6dd769`, C 기준 `26b0bc36eaeb14ccfbffc8962456008dde0472f8`. C의 `plugins/moodle/AUTHORITY_DECISION.ko.md`, `BINDING_REVIEW.ko.md`, 합성 `authority_epoch.php`를 [B 구현 결정안](MOODLE_BINDING_IMPLEMENTATION_DECISIONS.ko.md) 및 [revision 3 계약](MOODLE_CLEAR_BINDING_CONTRACT.ko.md)과 대조했다.

**판정: PostgreSQL trigger + 별도 REPEATABLE READ snapshot이라는 기법은 조건부 채택 가능하다. 학생 자료 SQL projection 및 실제 confirmation 연결은 아직 통과하지 못했다.** 다음 작업은 제한 profile의 합성 구현과 아래 새 반례의 검증으로 한정할 수 있다. C가 이미 실행한 7/7과 B의 9/9 시험을 반복하지 않았다.

공개 소스만 실행 중 로컬 Moodle 이미지에서 읽었다. `version.php`는 4.5.15 / 2024100715.00이며 소스 지문은 [증거 JSON](moodle-cross-review-source-evidence.json)에 있다. config.php, DB, 세션/cookie, 학생 기록과 credential은 읽지 않았고 컨테이너·플러그인을 변경하지 않았다. 아래 경로/줄 번호는 이 Moodle 소스 기준이다. 코드로 가능한 interleaving을 찾은 것이며 실제 HTTP 경쟁을 재현했다는 뜻은 아니다.

## 수정이 필요한 발견

### F1 / P1: 전체 sessions UPDATE는 확인 자체를 폐기할 수 있고, 실패가 HTTP 실패로 전파되지 않는다

`lib/classes/session/manager.php:493–510`은 보통 20초 간격 또는 첫 갱신에 timemodified를 쓴다. `lib/classes/session/database.php:215–244`는 직렬화된 session data가 바뀌면 sessdata를 UPDATE한다. 따라서 확인 POST에서 epoch E를 읽어 confirmation을 만든 뒤 요청 종료가 세션을 저장하면 같은 요청이 E+1을 만들고 곧바로 CLEAR lookup이 거부된다. 별도 학생 활동이 없어도 가능한 순서다. 모든 요청이 반드시 sessdata를 쓴다는 주장은 아니다.

또한 database.php의 write()는 DB 예외를 catch하고 로그를 남긴 후 true를 반환한다. manager.php:953–966의 destroy_all()도 특정 예외를 삼킨다. C의 “trigger 오류는 원래 DML을 실패시킨다”는 DB 수준 설명은 맞지만 “그 결과 Moodle 확인/응답이 반드시 중단된다”는 결론은 별도 구현 없이는 성립하지 않는다. trigger lock timeout 때문에 실패한 session write를 write_close() 성공처럼 취급하면 검증 대상 persisted session과 현재 메모리 세션이 달라질 수 있다. 기존 에러 메시지에 sid가 포함되는 경로도 있어 새 contention이 기존 로그의 비밀 노출 경로를 자극할 수 있다.

수정 조건: confirmation의 세션 상태 검사·최종 persistence·generation 포착·confirmation insert 순서를 명시하고, session 저장 성공을 명시적으로 확인할 수 있는 adapter를 만든다. `write_close(); SELECT epoch` 두 줄만으로 해결됐다고 간주하지 않는다. close 후 다른 동일 세션 요청이 바꾼 권한 상태를 이전 메모리 판정으로 승인할 수 있기 때문이다. C는 지원 handler의 세션 lock을 포함한 순서 및 실패 시 confirmation 발행 0건을 입증해야 한다. core handler 보완이 필요하면 본부가 소유권을 배정하고, 배정 전에는 원래 handler를 임의 수정하지 않는다. 기존 민감 sid 로그 경로는 배포 로그 정책에서 차단·검증해야 한다.

### F2 / P1: SQL의 session 행 존재·userid만으로 role-switch/login-as를 배제할 수 없다

`lib/accesslib.php:4412–4437`의 role_switch()는 `$USER->access['rsw']`를 바꾼다. `lib/classes/session/manager.php:1134–1144`의 loginas()는 세션의 REALUSER/realuser/loginascontext를 구성한다. manager.php:443–445는 tracking userid에 실제 사용자를 사용하기도 한다. 따라서 sessions의 id/userid/timecreated만 읽는 SQL은 확인 시점부터 이미 role-switch/login-as 상태인 세션을 구별하는 충분조건이 아니다. “그 뒤 epoch가 안 바뀌었다”도 최초 상태의 정당성을 보완하지 못한다.

수정 조건: browser 확인에서 동일 세션 lock 하에 `realuser/loginascontext`와 모든 적용 context의 `rsw`가 비어 있음을 명시 검사하고, 해당 확인의 persistence/generation 결합을 F1과 함께 증명한다. snapshot에서 현재 participant가 site admin이 아니며 추가 역할·switchroles/loginas 권한을 갖지 않는 제한 profile도 요구한다. raw sessdata를 CLEAR로 보내거나 일반 SQL reader가 PHP 역직렬화하는 우회는 허용하지 않는다. handler/profile 제약을 기술적으로 강제할 수 없으면 confirmation 지원을 거부한다.

### F3 / P1: 실제 로그인·접근 의존성 목록이 아직 닫혀 있지 않다

현재 C 표의 user/enrol/roles/context/config만으로 “승인 학생 권한”을 다 표현하지 못한다. `lib/moodlelib.php:2373–2408`은 `user_preferences.auth_forcepasswordchange`, 계정 설정 상태를 확인한다. `3018–3048`의 user_not_fully_set_up()는 필수 profile/custom fields 및 세션 캐시에도 의존한다. `2423`과 `2457–2464`는 after_require_login hook 및 site policy 경로를 가진다. manual auth라는 사용자 행 값만 고정해도 enabled auth plugin의 timeout hook과 코드/설정에 의한 추가 접근 조건이 자동 제외되지 않는다. `$CFG`의 파일 설정·플러그인 코드 변경은 DB trigger가 감지하지 못한다.

수정 조건: profile manifest에 허용 core/build·auth/enrol/course format/module/plugin 및 hook 목록, 고정 CFG, 역할·capability/상위 context와 source query hash를 고정한다. `user_preferences`를 포함한 실제 술어의 mutable DB 의존성은 같은 snapshot/epoch 대상에 추가한다. 필수 custom profile/site-policy/timeout hook 등 아직 해석하지 못한 기능이 활성화돼 있으면 해당 설치를 거부한다. 파일·코드·설정 변경은 worker 정지 → profile/설치 epoch 교체 → 재검증으로만 허용한다. “추가 plugin 없음”을 단순 운영 약속이나 HTTP 파라미터로 대체하지 않는다. profile 완결성은 새 코드/설정 인수 자료로 확인해야 한다.

### F4 / P1: runtime 권한 분리와 trigger 함수 권한은 별도 구현해야 한다

C의 실험 함수는 기본 SECURITY INVOKER이며 owner 연결로 실행했다. 이를 그대로 가져와 runtime의 epoch UPDATE 권한을 뺀다면 trigger도 권한 오류로 실패한다. 반대로 runtime에 epoch 직접 UPDATE를 허용하면 값 복구/삭제로 재사용 차단을 우회할 수 있다. 현재 7/7의 마지막 PASS는 owner 우회 재현이며 보호가 완성됐다는 증거가 아니다.

최소 설치 계약은 다음과 같다.

- login 불가 전용 소유자와 non-owner runtime/read-only reader/오프라인 migration 역할을 분리한다. runtime은 owner 역할 membership/SET ROLE, SUPERUSER/CREATEROLE/REPLICATION, schema CREATE와 trigger/함수 변경 권한을 갖지 않는다. 데이터베이스/스키마 소유권까지 점검한다.
- 전용 SECURITY DEFINER trigger 함수가 schema-qualified epoch 행만 증가시킨다. search_path는 신뢰 schema와 pg_catalog 및 마지막 pg_temp로 고정하고, untrusted schema의 객체 해석을 금지한다. PUBLIC EXECUTE는 생성 트랜잭션 안에서 회수하고 설치에 필요한 최소 권한만 부여한다. 누락/중복 epoch와 overflow는 실패한다.
- runtime의 `session_replication_role` SET 권한은 직접·상속 모두 없어야 한다. non-superuser라고 충분하지 않다. 필요하다면 `ENABLE ALWAYS`를 추가하되 owner/관리자 우회 방지의 대체물로 쓰지 않는다. logical replication/read replica를 최초 profile에서 제외한다.
- 모든 승인 의존 테이블의 INSERT/UPDATE/DELETE 및 TRUNCATE를 포함한다. runtime TRUNCATE는 우선 금지한다. AFTER STATEMENT trigger는 0행 UPDATE에도 실행되므로 그 비용을 포함한다. partition/새 테이블/schema migration은 최초 범위에서 제외하거나 정지 재검증한다.
- 전용 reader는 명시 column/view만 SELECT하고 sessions.sid/sessdata, password, 원문/파일/grade에는 권한이 없다. READ ONLY transaction만 선언하는 것으로 테이블 접근권한 분리를 대신하지 않는다. confirmation writer는 reader와 별도 최소 역할이다.
- trigger 정의/활성 상태·함수 hash/owner/ACL·역할 membership/parameter ACL 및 profile을 부팅 시 검증한다. 실행 중 이를 바꿀 수 있는 DBA 작업은 preview를 정지한 maintenance에서만 수행하고 새 설치 epoch로 재개한다. 일반 Moodle upgrade는 기존 owner 권한이 필요한 별도 배포 작업이다.

근거: [PostgreSQL 16 session_replication_role](https://www.postgresql.org/docs/16/runtime-config-client.html#GUC-SESSION-REPLICATION-ROLE), [SECURITY DEFINER 안전 설정](https://www.postgresql.org/docs/16/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY), [statement trigger](https://www.postgresql.org/docs/16/sql-createtrigger.html). 실제 배포 PostgreSQL 버전·권한은 아직 확인하지 않았으므로 별도 인수 대상이다.

### F5 / P2: 전역 무효화는 설치 전체의 일반 활동을 한 학생의 재확인 사유로 만든다

다른 사용자의 sessions INSERT/UPDATE/DELETE, session 정리 cron, 0행 권한 DML도 전역 epoch를 올릴 수 있다. C가 제안한 넓은 user/config 테이블 감시까지 합치면 access tracking/설정 캐시 작업도 폐기 원인이 될 수 있다. 120초 완료/300초 연결은 보장되는 사용 시간이 아니라 상한일 뿐이다. 한 사용자가 session update를 반복하면 전체 pending/binding의 사용을 방해할 수 있고, 모든 writer는 한 행 lock에서 경합한다. 장기 원천 transaction과 교차 테이블 갱신은 deadlock/timeout 및 정상 Moodle 요청 실패 위험을 만든다. 처리량이나 성공률은 측정하지 않았다.

전역 all-update 방안은 **전용 격리 합성 설치의 보수적 기준 구현**으로만 조건부 채택한다. 여러 학생이 사용하는 기관 운영 profile로는 통과시키지 않는다. 운영 후보는 shared authority epoch와 해당 confirmation의 per-session generation을 분리하고 세션의 모든 갱신을 우선 해당 세션만 폐기하는 것이다. 관련 사용자의 권한 epoch까지 더 세분하는 최적화는 후속이다. 단순 heartbeat 제외는 보안 검토 없이 추가하지 않는다. 선택한 전역/분리 세대는 하나의 SQL snapshot에서 함께 읽고 세대가 달라지면 확인을 재발행하지 말고 새 사용자 확인을 요구한다.

## 구현 가능한 최소 자료 범위

지금 통과 가능한 것은 위 제약을 강제하는 **합성 profile validator, DB 역할/trigger installer, session adapter 및 snapshot query의 개발 범위**다. 실제 학생 자료를 반환하는 승인과 구분한다. C의 기존 설치 UI나 관리자 token reader는 새 confirmation의 대체물이 아니다.

첫 자료 projection은 고정 core Page 하나의 **저장된 수동 완료 표시**로 좁힐 것을 제안한다. Assignment 제출은 다음 단계로 분리한다. 다음 술어를 전부 명시한 동일 snapshot SQL과 정확한 profile manifest가 먼저 필요하다.

| 대상 | 최소 확인 / 거부 조건 |
| --- | --- |
| 계정/세션 | 설치 epoch와 session generation 일치, 같은 내부 행/사용자, 확인된 비게스트·비관리자 manual 계정, deleted/suspended 없음, 현재 idle/확인 만료 검사. F1–F3 실패면 전체 거부. |
| 등록/역할 | 지정 course의 활성 manual enrol instance/user_enrolment와 시작/종료, 승인된 student role·default role·모든 ancestor context/capability profile exact match. 추가 enrol 방식/role/override는 거부. role의 이름/shortname만으로 판정하지 않음. |
| 강좌/모듈 | course와 모든 category ancestors, section, module의 현재 공개 상태·소속·context 경로, deletioninprogress 없음, 승인 core Page 유형과 instance 일치. course format 고정. availability/group/grouping/stealth 또는 해석하지 않은 접근 조건은 거부. |
| 완료 자료 | completion enabled, module manual tracking만, grade/pass/custom completion 없음. 지정 userid+module의 저장된 completion 행 0/1만 허용, 중복/다른 값은 거부. 행 없음은 이 제한 profile에서 INCOMPLETE, 0→INCOMPLETE, 1→COMPLETE. `observedAt`은 snapshot 관측 시각이며 완료 시각/합격 시각으로 쓰지 않음. |
| 출력 의미 | “저장된 수동 완료 표시”를 targetRef의 승인 설명에 고정. 실제 학습 성취·자동 eligibility·네 조건 충족·지급 근거로 승격 금지. 실패한 자료 항목을 성공처럼 표시하지 않음. |

`lib/completionlib.php:84–94`에는 PASS/FAIL/FAIL_HIDDEN 상태가 있고 `1141–1163`은 grade 상태를 별도로 가공한다. 따라서 임의 completionstate를 boolean이나 합격으로 바꾸면 의미·숨김 grade 경계를 손상할 수 있다. 최소 profile은 그런 module/state를 거부한다. get_data()의 MUC/cache/helper를 새 SQL snapshot과 혼합하지 않는다.

Assignment는 `mod/assign/locallib.php:3820`의 사용자·assignment·groupid=0 및 최대 attempt 선택, `996`의 effective override, submit 상태 enum·drafts·재시도, module 접근을 추가로 인수해야 한다. `can_view_submission():5072`의 “본인이면 true”만 떼어내면 course/module gate가 빠진다. 최신 행을 임의 하나 고르거나 모든 nonempty 상태를 제출 완료로 취급하지 않는다. group submission/override/timelimit/custom submission plugin, forum 회고·gradebook·파일·본문은 이번 최소 projection에서 모두 제외한다. 이것을 기존 P0 네 조건 구현 완료라고 보고하지 않는다.

## revision 3에 대한 구체 인수 조건

- C 문서는 아직 B revision 2 기준이다. `.3`의 issuerEpoch/requestRef echo, 새 observations DTO를 구현 명세로 인수해야 한다. 설치 복구 epoch와 CLEAR issuerEpoch는 서로 대체하지 않는다.
- DB bigint authority epoch를 JS safe integer로 무조건 변환하지 않는다. 안전 정수 상한 이전까지로 제한하고 overflow 시 폐쇄·epoch 교체한다. 또는 별도 버전 변경을 통해 opaque/hash generation으로 정의한다. 현재 `.3` 숫자 revision 계약에서는 전자를 선택한다.
- 전역 또는 분리 authority 세대가 enrolmentRevision을 대표한다면 “등록만 변경될 때 증가”한다는 의미를 붙이지 않는다. capability/설정 변화도 확인을 폐기하는 보수적 authority revision임을 schema에 명시한다. per-session generation은 raw sid가 아닌 설치 epoch/내부 id/세대를 서버에서 결합한 opaque 값이다.
- SQL snapshot 관측 시각은 `BEGIN` 문장 시각이라고 가정하지 않는다. 첫 snapshot 획득 구간과 종료 시각을 기록하고 B의 요청 왕복/시계/expiry 상한을 적용한다. lock 대기 뒤 이미 지난 등록·세션 만료도 최종 시각으로 거부한다.
- lookup 서버 경로는 브라우저 session bootstrap/heartbeat/confirmation 재발행을 수행하지 않는 별도 authenticated read 경로다. 기관 registry·명부 불일치와 지원하지 않는 profile은 전체 거부하며 stale helper/cache로 fallback하지 않는다.

## 새 검증만 필요한 인수 목록과 소유권

| 다음 담당 | 새로운 인수 증거 |
| --- | --- |
| C | F1 확인 POST 종료 때 sessdata 변경 → generation 자기 폐기 및 trigger timeout → handler true 반례. 수정 adapter가 올바른 최종 session state에서만 confirmation을 발행함을 검증. sid 없는 로그 검사 포함. |
| C | 이미 role-switch/login-as인 세션의 확인 거부 및 확인 직후 동일 세션 변경 경쟁. forcepasswordchange/정책·hook/profile drift를 단일 SQL predicate가 거부하는지 확인. |
| C/본부 DBA | non-owner runtime에서 정상 DML→epoch 증가, epoch 직접 UPDATE/trigger disable/SET ROLE/replication_role/temp shadow 공격 거부. 권한 오류·0행 DML·TRUNCATE/rollback·restore 설치 epoch 인수. 기존 owner 우회 재현 반복은 불필요. |
| C | 위 수동 완료 Page projection의 exact SQL/ACL dependency manifest, warm helper cache를 사용하지 않는 경로, snapshot과 권한/자료 변경 경합. 이후 별도 Assignment profile 제안. |
| 본부 | 전역 epoch는 격리 합성용으로 제한할지 확인하고, 실제 운영에는 session별 generation/handler 수정 소유권 및 업그레이드·복구 절차 배정. 운영 사용성/경합 계측 전 활성화 금지. |
| B | 본부 승인 범위에서 `.3` DTO/CAS/coordinator 합성 구현은 독립 진행 가능. C의 운영 verifier가 미완료이면 실제 설치 verifier는 DISABLED로 유지. |

F1–F4와 정확한 SQL/profile이 해결되기 전 실제 confirmation/학생 자료 연결은 보류한다. 이것은 기관 명부·승인 대기 때문만이 아니라 아직 남은 **기술 수정 조건**이다. 기존 7/7·9/9 성공은 그대로 인정하되 이 새 인수 시험의 성공으로 합산하지 않는다. 이번 결과는 공개 소스 대조와 설계 반례이며 새로운 실행 시험·실제 로그인·학생 관측·지급은 0건이다.
