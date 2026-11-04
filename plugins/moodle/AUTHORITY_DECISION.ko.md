# Moodle 권한 epoch 및 읽기 최소 지원 결정안

2026-11-04. 검토 기준 ee3b71a7ba1996780955ee70026edb1c74dd738b. B revision 2 검토용 제안이며 운영 활성화와 실제 학생 바인딩 구현은 승인 대기다. 이전 Moodle 설치·권한·폼 17개 시험은 재실행하지 않았다.

## 제안과 선행조건

초기 후보는 Moodle 4.5.15 / PostgreSQL, database session backend, manual auth, 단일 설치·강좌·학생·사전 허용 module이다. 세션의 내부 숫자 행 ID와 설치 복구 epoch를 결합한다. 세션 생성/계정 교체/삭제와 계정·등록·역할·capability 변경이 같은 PostgreSQL 트랜잭션에서 단조 증가 authority epoch를 올리도록 하는 DB trigger가 후보 수단이다. 전역 단일 행 epoch로 먼저 제한하면 영향 범위 계산 누락을 줄일 수 있다. 이 경우 다른 학생 변경도 기존 confirmation을 무효화하므로 운영 부담과 사용성에 대한 명시적 승인이 필요하다.

기본 후보 trigger는 해당 테이블의 INSERT/UPDATE/DELETE/TRUNCATE 후 epoch 행을 증가시킨다. heartbeat를 포함한 sessions UPDATE도 모두 폐기하는 가장 보수적인 모델이다. heartbeat 예외를 도입하려면 userid/state/행 재발급 및 auth 관련 필드와 단순 timemodified 연장을 구별하고 추가 검토해야 한다. 임의 heartbeat를 권한 연장으로 신뢰하지 않는다. 사용자 idle 만료, enrol start/end, confirmation 기한은 DB 변경 없이 지나가므로 조회 시각에서 별도로 판정한다.

이 후보를 플러그인 일반 설치 migration에 바로 넣지 않았다. 기존 Moodle 테이블 trigger는 DBA 설치 작업과 모든 DML 경로 인수가 필요하다. 업그레이드·복원·관리 스크립트는 서비스를 닫은 상태에서 별도 DBA 역할로 수행해야 한다.

## 쓰기 경로 대조

아래 줄 번호는 확인한 로컬 Moodle 4.5.15 소스 기준이다.

| 변경 | 실제 경로 | epoch 후보 테이블 및 주의 |
| --- | --- | --- |
| 세션 로그인/계정 교체·로그아웃·관리 폐기 | lib/classes/session/manager.php login_user 630, terminate_current 652, kill_user_sessions 930 → database.php destroy 77 | sessions 생성/삭제. handler.php add_session 121의 새 행을 기존 confirmation으로 치환 금지 |
| 신규 등록·정지·복구·삭제 | lib/enrollib.php insert 2135, update 2250, delete 2314, 전체 삭제 1160/1195/2784 | user_enrolments. 같은 행과 같은 초의 최종 active만 비교하면 철회를 놓침 |
| 등록 방식 중지/삭제 | lib/enrollib.php enrol instance 변경과 bulk 삭제 | enrol 및 user_enrolments. manual 외 방식은 초기 범위 제외 |
| 역할 부여·회수 | lib/accesslib.php role_assign insert 1651, role_unassign_all delete 1752/1796 | role_assignments. course보다 상위 context도 포함 |
| capability 허용·철회 | lib/accesslib.php assign_capability update 1451/insert 1455, unassign_capability delete 1501/1503 | role_capabilities, role, capabilities, context와 기본 역할 관련 config까지 인수 필요 |
| 계정 상태·강좌/모듈·설정 | user, course, course_categories, course_sections, course_modules, modules, config/config_plugins 등 | 지원 정책에서 참조하는 모든 테이블을 명시. custom auth/availability/plugin의 바깥 상태는 초기 범위 제외 |

표는 검토할 의존성 목록이며 설치 완료된 트리거 목록이 아니다. 일반 Moodle 기능 전체의 권한 의미를 이 목록만으로 보장할 수 없다. 직접 DML도 활성 trigger가 있으면 epoch를 바꾸지만 테이블 owner/superuser의 trigger disable, replication_role 변경, TRUNCATE/restore, epoch 직접 조작은 우회 경로다. 애플리케이션 역할은 non-owner/non-superuser이고 schema/function/trigger/epoch DDL·직접 UPDATE 권한이 없어야 한다. runtime에는 필요한 DML만 주고 epoch 증가는 잠긴 search_path와 정해진 테이블을 쓰는 검토된 함수만 수행해야 한다. 설치 integrity 검사는 요청 직전 확인만으로 충분하지 않으므로 runtime 역할 자체가 검사를 깨뜨릴 수 없도록 한다. DB 복원 뒤 외부 유지 설치 epoch 교체가 필수다.

## 직렬화와 관측 의미

source DML과 trigger의 epoch UPDATE는 같은 트랜잭션이다. trigger 오류/epoch 행 부재/lock timeout은 원래 DML도 실패시킨다. 서로 다른 권한 테이블의 worker도 epoch 한 행에서 경합한다. deadlock이나 serialization 오류를 성공으로 처리하지 않는다. 오류 후 confirmation 발행 및 자료 응답은 중단한다.

reader는 별도 연결에서 BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY로 시작하여 epoch, 내부 세션 행, 계정, 등록, 허용 ACL 조건, 매핑, 자료를 같은 snapshot에서 읽는다. source 변경 commit 전 시작한 reader는 이전 권한과 이전 자료를 함께 읽을 수 있고, 다음 reader는 새 epoch와 삭제/철회를 함께 본다. 이것은 OBSERVED_AT 의미다. 응답 직전의 별도 현재 epoch 검사로 이미 커밋된 변경을 거부할 수 있지만 검사 후 전송 사이의 원격 철회를 원자적으로 막지는 못한다.

## 캐시를 제외한 최소 읽기 후보

is_enrolled(lib/enrollib.php 1385–1465)는 현재 USER의 enrolled 캐시가 유효하면 DB 등록 조회 전에 true를 반환할 수 있다. has_capability(accesslib.php 570 부근)는 USER.access 또는 ACCESSLIB_PRIVATE의 권한 데이터를 사용한다. modinfolib.php 595 등은 MUC coursemodinfo를 사용하고 cm_info.uservisible은 현재 사용자와 동적 모듈 코드의 영향을 받는다. 이 helper들을 별도 SQL snapshot과 섞으면 단일 snapshot 판정을 주장할 수 없다. 이 사실은 소스 대조이며 이번에 warm-cache 실제 Moodle HTTP 경쟁을 재현한 것은 아니다.

B가 승인할 수 있는 좁은 후보는 다음과 같다.

- 사전 검토된 기본 역할/허용 capability/상위 context 및 config의 정확한 ACL 프로필을 고정한다. snapshot SQL에서 현재 행들이 그 프로필과 일치하는 경우만 허용하고 추가 역할, override, role switch, login-as, custom auth/availability, 동적 접근 플러그인은 차단한다. 프로필이 바뀌었다가 복구돼도 authority epoch가 달라 기존 confirmation을 폐기한다. 일반 has_capability를 재구현했다는 주장을 하지 않는다.
- 강좌·section·module이 공개이고 접근 조건이 없으며 group/grouping 제한이 없는, 고정된 module만 허용한다. 설정과 사용자 등록/계정 상태는 같은 SQL snapshot에서 검사한다. 숨김/삭제 진행/조건부 접근/알 수 없는 타입이면 자료를 반환하지 않는다.
- 초기 자료는 지정 사용자·module의 저장된 completion 상태 및 지정 개인 Assignment의 제출 상태 같은 최소 구조화 값으로 제한하는 후보를 검토한다. group submission, forum 회고, gradebook, 파일·본문·custom source는 별도 권한 분석 전 제외한다. 이번에는 이 SQL projection을 구현하지 않았다. 모듈별 권한 의존성 및 ACL 프로필 고정 인수 전에는 메타데이터 관측만 가능하고 학생 자료 응답은 보류한다.

완성된 지원 범위로 승인하려면 권한 프로필 전체 의존성, 설치 DB 역할/trigger 보호, 동일 SQL snapshot query, 시간 경계와 cold/warm cache 우회 시험, 세션 row 삭제·등록 복귀·역할 override 경쟁을 실제 격리 Moodle에서 함께 통과해야 한다. 일반 플러그인 권한 API만 사용할 경우 단일 snapshot 보장은 미충족으로 표시한다.

## 신규 격리 실험 결과

experiments/authority_epoch.php는 Moodle을 bootstrap하지 않는 합성 PostgreSQL 메커니즘 시험이다. 실제 Moodle sessions/학생 데이터/쿠키/token을 읽지 않는다. 합성 probe_session/probe_enrolment/probe_fact 세 테이블과 epoch만 사용한다. 실험은 기존 PostgreSQL 및 PHP 이미지의 별도 컨테이너에서 수행했고 공개 포트는 없다.

1. 같은 timemodified에서 정지→활성 복귀, 최종 상태 동일, epoch +2 확인.
2. 세션 삭제 트랜잭션 rollback 시 세션과 epoch 함께 복구.
3. 삭제·자료 변경 commit 전 시작한 repeatable snapshot의 이전 세션·epoch·자료 일관성.
4. 다음 snapshot의 세션 삭제·새 epoch·새 자료 동시 관측.
5. 다른 권한 테이블을 갱신하는 두 worker가 공통 epoch 행에서 경합하고 55P03 lock timeout 발생.
6. 막힌 statement의 부분 세션 insert가 남지 않음.
7. owner가 trigger를 disable한 뒤 권한 변경을 하자 epoch가 그대로인 우회 재현. 이 시험의 PASS는 취약 조건 재현 성공을 뜻한다.

결과는 7/7이며 출력은 /private/tmp/clear-authority-epoch-results.log다. 운영 trigger 구현·Moodle 로그인·실제 기관 조회·바인딩 완료·캐시 통합 검증으로 합산하지 않는다. 원본 plugin 코드와 설치 ZIP은 이번에 변경하지 않았다.
