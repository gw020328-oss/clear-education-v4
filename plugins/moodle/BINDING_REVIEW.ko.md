# Moodle 연결 계약 revision 2 검토

기준 plugin a2fa3a9, Moodle 4.5.15 / 2024100715.00. B 계약 revision 2의 운영 confirmation은 승인 대기다.

## 세션

초기 지원을 PostgreSQL과 core\session\database 및 manual auth로 제한할 것을 제안한다. 확인 POST에서 require_login, sesskey, 활성 등록, 승인 학생 capability, 비게스트·비중지·비삭제 계정을 검사한다. 현재 세션의 서버 sessions 행 내부 숫자 id와 userid, 생성 시각을 confirmation에 결합하고 외부에는 별도 난수 generation을 보낸다. 서버 lookup은 이 내부 행의 존재·계정·생성시각·유휴 만료·설치 epoch·confirmation 만료를 다시 검사한다. raw sid/sessdata/cookie/sesskey는 복제하거나 로그에 남기지 않는다.

Moodle 소스 lib/classes/session/manager.php의 login_user(630), terminate_current(652), destroy(969), kill_user_sessions(930)는 로그인/로그아웃/폐기 시 기존 세션을 제거한다. handler.php:add_session(121)는 새 SQL 행을 만든다. 생성시각만으로 같은 초의 재로그인을 구별할 수 없다. 삭제된 행을 새 세션으로 대체하여 확인을 재사용하면 안 된다. 브라우저 쿠키만 삭제하고 서버 로그아웃 요청이 없으면 서버는 즉시 알 수 없으며 서버 만료/철회로 감지해야 한다.

session_exists(803)는 sid를 요구하며 auth timeout hook을 생략한다. 이를 유일한 검사로 쓰지 않는다. timeout override, SSO, remember-me, login-as는 지원 결정과 시험이 필요하다. file backend는 파일과 DB 수명이 분리되고 redis.php:get_session_by_sid(595)/add_session(604)는 id가 sid이며 SQL 밖에 저장된다. Redis에 숫자 행 참조 설계를 그대로 적용하면 비밀을 복제할 수 있다. 현행 로컬 서버의 실제 backend 설정은 비밀 설정을 읽지 않아 미확인이다.

## 등록 generation

lib/enrollib.php:update_user_enrol(2202)는 같은 행의 status와 초 단위 timemodified를 바꾼다. 정지 후 활성 복귀는 같은 ID와 최종 status를 가지며 같은 초에 발생하면 수정시각도 같을 수 있다. 삭제 후 재등록은 새 행이지만 이 사실만으로 모든 철회를 탐지할 수 없다.

등록/등록 인스턴스, 계정 중지·삭제, 역할 부여·회수, capability 및 context override, 그룹/availability, 강좌·모듈 변경을 포괄하는 별도 authority generation이 필요하다. 상위 context 변경도 포함한다. 시간에 따른 등록 종료는 별도 현재 시각으로 검사한다. events/manager.php(110–153)는 external observer를 commit 이후 실행한다. internal observer도 원래 갱신이 트랜잭션 밖이면 원자성을 만들지 못하며 직접 SQL은 이벤트를 우회할 수 있다. 모든 변경 경로 직렬화 또는 DB epoch trigger 등 포괄 방식의 승인이 필요하다.

## Snapshot

lib/dml/pgsql_native_moodle_database.php(1667)의 기본 delegated transaction은 READ COMMITTED다. 여러 읽기의 동일 시점을 보장하지 않는다. 별도 PostgreSQL 연결에서 BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY로 시작하고 세션 행·계정·등록·권한 generation·강좌 및 모듈 매핑·자료를 함께 조회하는 방법을 제안한다. Moodle access/modinfo/MUC 캐시의 과거 값과 읽기 함수의 캐시 쓰기는 별도 해결해야 한다. cold/warm cache, 다른 worker의 철회와 자료 변경 경쟁 검증이 필요하다. SQL 밖 세션을 같은 snapshot으로 표시할 수 없다. 결과는 OBSERVED_AT이며 관측 후 철회의 원격 원자성을 보장하지 않는다.

## 실제 조회 조건

기존 E6 코드의 loopback 18768 /webservice/rest/server.php는 서버 token과 고정 wsfunction을 쓰는 합성 local API 실험 경로다. 이번에 실제 endpoint 호출·토큰 조회·원본 학생 기록 조회는 수행하지 않았다. local_clearbridge에는 confirmation/자료 조회 endpoint가 아직 없다. 설치 경로 local/clearbridge의 강좌 설정에는 activity/assignment/reflection module ID가 있다. 조회 시 같은 강좌·유형·현재 접근 가능 상태를 재확인해야 한다.

실제 기관 조회에는 기관 승인, HTTPS/mTLS 설치 registry와 trust epoch, 승인 학생 capability, 사전 expectedSubjectRef 명부 결합, 고정 강좌/module 매핑, 서버 인증 및 세션/권한 generation 구현이 선행되어야 한다. 학생의 Moodle 확인 POST와 CLEAR 완료 확인이 필요하다. 기존 관리자 token은 학생 세션 확인을 대신하지 않는다. 명부나 자격증명은 이번에 생성하지 않았다.

## 독립 시험

tests/isolated_probe.php는 CLI, CLEAR_ISOLATED_PROBE=1, 합성 site shortname=clear가 필요하며 새 임시 DB에서만 실행한다. 합성 교사/학생·강좌를 생성하고 등록 정지/복구/재등록, 허용/타 모듈/중복/미설정 mapping, 독립 PostgreSQL 연결의 snapshot 차이를 확인한다. 이전 ZIP 설치·lint·8개 권한 결과를 재사용한다. HTTP 폼 sesskey 거부·실제 세션 계정 전환·cookie 없는 confirmation lookup은 구현 이후 시험 관문이다.

실험에서 Moodle delegated transaction은 이미 SAVEPOINT를 만들기 때문에 그 뒤 SET TRANSACTION ISOLATION LEVEL 변경이 DB 오류로 거부됐다. 별도 native PostgreSQL 연결의 snapshot만 검증했다. 기존 Moodle 권한 helper를 그 연결로 옮겨 일관되게 평가하는 구현은 미검증이며 B 관문으로 남는다.
