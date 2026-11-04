# 현재 로컬 Moodle 경로의 최소 세대 공급원 제안

2026-11-04. 설계 제안만 작성했다. SQL 파일, schema, trigger, DB 권한, 설치 세대 파일은 생성·변경하지 않았다. 기존 합성 `clear_probe`/`clear_guard` 저장소를 실제 공급원으로 승격하지 않는다. 현재 bridge는 공급원이 없으면 UNAVAILABLE이다.

## 제안 파일과 소유 경계

| 후보 파일 | 역할 | 이번 상태 |
| --- | --- | --- |
| `plugins/moodle/local_clearbridge/db/course_authority_pg.sql` | 별도 운영자 offline 설치용 보호 revision 테이블·함수·trigger, 일반 plugin upgrade에서 자동 실행하지 않음 | 제안만 |
| `plugins/moodle/local_clearbridge/classes/course_authority_generation.php` | 승인된 설치 세대 파일 및 primary PostgreSQL scoped revision을 읽는 provider | 제안만 |
| `plugins/moodle/moodle-integration/course_authority_generation_test.php` | 최소 실제 PostgreSQL fixture의 커밋 경쟁·ABA·scope·권한 검증 | 제안만 |

정확한 DB schema 이름, 기존 Moodle DB 역할과 함수 owner, 실제 mapping 저장 테이블, 배포 manifest 위치는 본부/A 설치 책임자가 확정해야 한다. 이름만 바꿔 기존 합성 테이블을 실환경에 붙이지 않는다.

## 무관한 heartbeat와 범위

모든 source DML이 단일 global authorityEpoch를 직접 올리면 다른 사용자의 sessions.timemodified 갱신도 이미 진행 중인 5초 조회를 무효화한다. 정상 동시 사용에서 반복 UNAVAILABLE을 만들 수 있다. 초기 후보는 한 보호 테이블의 범위별 revision을 사용한다.

```text
(scopeKind, scopeKey) primary key
revision bigint 1..9007199254740991
```

후보 scopeKind는 CLOCK, POLICY, COURSE, USER, SESSION, ENROLMENT, MAPPING이다. CLOCK의 singleton row는 발행 순서 직렬화용이며 조회 결과의 authorityEpoch 계산에서는 제외한다.

- SESSION은 원래 세션 행 ID에 묶는다. 해당 행의 INSERT/UPDATE/DELETE는 모두 증가시킨다. 같은 세션 heartbeat도 보수적으로 폐기하지만 다른 세션 heartbeat는 해당 요청의 revision 집합을 바꾸지 않는다. sessdata를 application에 내보내거나 heartbeat 예외 분류를 구현하지 않는다.
- USER는 actor와 대상 subject의 두 사용자 행을 확인한다. 계정 변경, 그 사용자에 대한 역할 할당/회수는 USER revision을 올린다. 처음에는 같은 사용자의 다른 강좌 역할 변경도 폐기하는 보수적 범위다.
- ENROLMENT는 `(userId, courseId)`에 묶어 actor와 subject의 현재 강좌 등록 변경을 처리한다. enrol instance의 상태/강좌/삭제 변경은 OLD/NEW course의 COURSE revision을 함께 올린다. cascade로 부모 행을 읽을 수 없을 때에도 부모 OLD course의 폐기 범위를 빠뜨리지 않아야 한다.
- COURSE는 대상 강좌의 공개/삭제·이동 등 변경을 처리한다. category 이동/공개와 context tree 변경은 초기에는 POLICY를 올려 전체 폐기한다. 부모 context 계산을 놓치는 좁은 최적화보다 보수적 범위를 택한다.
- POLICY는 role/capability 정의, 상위 ACL 의미, 기본 역할·siteadmin·sessiontimeout 등 관련 설정을 다룬다. 초기 승인 의존성 목록을 확정하기 전에는 관련 ACL/config 테이블 DML을 보수적으로 POLICY로 처리한다. 따라서 무관한 config/role 변경에 의한 정상 실패는 여전히 있을 수 있다. 이 한계를 heartbeat 문제 해결과 구분한다.
- MAPPING은 승인된 installation/course/actor/subject/run 매핑의 실제 행에 묶는다. 매핑 공급원이 외부 owner DB라면 C trigger로 원자적 변경을 주장하지 않는다. 해당 owner의 실제 monotonic revision을 별도 검증하거나, 이 로컬 후보에서는 매핑을 승인 run 동안 불변으로 제한하고 변경 전에 run을 폐기하는 결정을 받아야 한다. 현재 저장 위치가 미정이므로 구현하지 않는다.

한 요청은 POLICY, 현재 COURSE, actor/subject USER, 원래 SESSION, 두 ENROLMENT, 승인된 MAPPING revision을 조회한다. 모든 필수 row가 실제 존재해야 하며 누락을 0이나 1로 보충하지 않는다. authorityEpoch는 이 집합의 최대 실제 revision 값이다. 쿠키·SID는 이 조회키에 포함하지 않는다.

## 같은 트랜잭션 ABA와 커밋 순서

단순 sequence의 nextval을 각 scope에 배정하고 max를 취하는 방식은 충분하지 않다. 먼저 작은 번호를 배정받은 트랜잭션이 늦게 커밋하면, 그 사이 다른 scope의 더 큰 번호를 읽은 요청이 뒤늦은 변경을 놓칠 수 있다.

따라서 후보 trigger 함수는 CLOCK singleton row를 UPDATE해 새 revision을 얻고 그 row lock을 source 트랜잭션 종료까지 유지한다. 영향을 받는 scope row들을 같은 트랜잭션에서 그 revision으로 갱신한다. CLOCK 자체는 요청의 max 집합에서 제외하므로 무관한 세션은 요청을 폐기하지 않지만, 모든 authority 변경 writer는 CLOCK에서 직렬화된다. 이는 쓰기 경합 비용이 있는 후보이며 처리량 최적화를 보장하지 않는다. deadlock/timeout은 source DML 전체 rollback이어야 한다.

정지→복구가 같은 트랜잭션에서 끝나 최종 active가 같아도 revision은 증가한다. 두 트랜잭션이면 각각 증가한다. rollback은 source와 scope revision 모두 되돌린다. epoch를 timestamp, row ID, 최종 상태 hash, registry floor로 대체하지 않는다. source DML commit과 revision commit이 분리되는 event observer/비동기 큐는 이 후보를 충족하지 않는다.

reader는 실제 primary에서 매번 fresh committed revision을 읽는다. 앞뒤 검사를 같은 오래된 repeatable-read snapshot에 고정하면 새 commit을 볼 수 없으므로 금지한다. 현재 bridge는 Moodle delegated transaction 안의 검증을 거부한다. 검사 후 전송 직전 발생한 commit까지 원자적으로 막는 보장은 별도이며, 현재 요청은 관측된 권한의 재검사 의미다.

## TRUNCATE, 복원, 설치 세대

행 DELETE와 같은 ID 재생성 뒤에도 scope tombstone/revision row를 보존한다. source TRUNCATE는 OLD row 집합을 안전하게 열거할 수 없으므로 POLICY를 올려 기존 요청 전체를 무효화한다. runtime에는 TRUNCATE·DDL·trigger-disable·revision 직접 쓰기 권한을 부여하지 않는다. ALWAYS trigger, 고정 search_path, PUBLIC 함수 실행 회수와 non-owner runtime을 인수해야 한다. 함수 owner 및 schema 권한의 실제 설치 상태도 검사해야 한다.

전체 DB 복원은 이 DB 안의 revision을 함께 되돌리므로 DB revision만으로 탐지할 수 없다. `installationGeneration`의 실제 공급자는 A/본부가 승인한 설치 운영자다. 운영자가 승인 manifest를 DB 밖의 읽기 전용 mount에 제공하고 Moodle PHP는 읽기만 한다. `$CFG->local_clearbridge_installation_generation_file` 같은 설정은 그 경로를 가리키는 포트일 뿐 자체 공급원이 아니다. 파일의 소유자·쓰기 권한·실제 위치·최초 generation 값은 현재 미지정이며 이번 코드가 값을 발급하지 않는다. runtime이 쓰기 가능한 dataroot의 registry 파일에 설치 세대를 맡기지 않는다.

복원/재설치 후 bridge를 다시 활성화하기 전에 운영자가 설치 세대를 교체하고 현재 DB/profile을 인수해야 한다. 이 수동 활성화 관문만 제안하며 복구/절전 자동화나 일반 복구 framework를 추가하지 않는다.

## 실제 구현 승인 뒤 필요한 집중 검증

다른 SESSION heartbeat가 대상 요청의 max revision을 바꾸지 않는 경우와 같은 SESSION heartbeat가 폐기하는 경우를 나눠 검사한다. actor·subject·course·상위 ACL·mapping 변경, 동일 트랜잭션/별도 트랜잭션 ABA, rollback, 두 writer의 커밋 순서, CLOCK lock timeout, TRUNCATE, row ID 재생성, runtime의 trigger/revision 직접 조작 거부를 실제 임시 PostgreSQL에서 검사한다. DB 복원 경계는 승인 manifest 세대 불일치 거부로 검사한다. 공급원 fixture 통과와 실제 설치 적용/로그인 성공은 별도 증거로 남긴다.
