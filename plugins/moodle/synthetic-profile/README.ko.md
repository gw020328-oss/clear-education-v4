# 합성 Page profile 및 DB 권한 구현

후속 실제 코어 테이블 adapter·collector·동일 트랜잭션 발급 실험은 [moodle-integration](../moodle-integration/README.ko.md)에 추가했다. 아래 내용과 이 디렉터리의 verification/dependencies는 당시 shadow 단계 기록이며, 실제 코어 통합 결과와 합산하지 않는다.

이 디렉터리는 disposable PostgreSQL clear_profile 전용이다. 운영 Moodle migration이나 연결 endpoint는 제공하지 않는다. 실제 Moodle 설치의 권한 의존성을 축약한 shadow schema이므로 현행 Moodle에 SQL을 적용하면 안 된다.

## 구현과 실행

- install.sql은 login 불가 owner, non-owner runtime, 제한 reader를 만든다. source DML과 shared authority revision 및 per-session generation을 SECURITY DEFINER trigger로 묶는다. search_path 고정, PUBLIC EXECUTE 회수, ALWAYS trigger, epoch 안전정수 상한 및 rollback을 적용한다. runtime은 DDL/epoch 직접 변경/TRUNCATE/SET ROLE/replication_role/temp 생성 권한이 없다. 설치는 별도 offline migration 연결로 한다.
- privilege_preflight.php는 reader에서 역할/membership/parameter ACL/DDL·temp·epoch 권한/함수 definer 및 search_path/trigger 활성 상태를 검사한다. 현재 검사에 더해 운영 profile은 실제 함수 본문·trigger 전체 정의와 schema fingerprint를 외부 승인본에 pin해야 한다. 이 구조 검사를 운영 설치 무결성의 완성으로 간주하지 않는다.
- profile.php는 SYNTHETIC_ONLY, Moodle 4.5.15, manual auth/enrol, 고정 core Page 수동 완료와 exact 승인/관측 profile 일치를 요구한다. hook/custom profile/site policy/timeout/role switch/login-as/availability/group/replication은 거부한다. code/CFG/ACL/query/dependency hash 누락 및 변경을 거부한다.
- dependencies.json은 F3의 user_preferences, user_info, policy/hook/상위 context 및 코드/CFG 의존성을 명시한다. code_inventory.py는 공개 소스와 상대경로의 파일 집합을 hash한다. root config.php와 runtime 데이터는 읽지 않는다. 기존 hash를 자동 승인하지 않는다. 실제 CFG와 plugin/hook 활성 상태를 trusted collector가 안전한 allowlist로 추출하여 승인본과 비교하는 작업은 남아 있다. 단순 HTTP 값이나 reader 입력 boolean으로 운영 권한을 입증할 수 없다.
- reader.php는 .3 요청의 exact key/requestRef/issuerEpoch/scope/confirmation 결합, safe integer와 privilege preflight 후 새 REPEATABLE READ READ ONLY snapshot을 연다. page.sql로 최소 값만 조회하고 상태 없음/0은 INCOMPLETE, 1은 COMPLETE, 다른 값/중복은 거부한다. 세션·authority generation, 설치/profile 지문, idle/등록/confirmation expiry, 5초 경과, 역행을 검사한다. observedAt은 첫 query의 snapshot 획득 완료 상한 시각이며 request 시작과 그 사이의 구간에 snapshot이 획득된다. 정수초와 왕복 시계 오차의 최종 소비 검사는 B도 수행한다.

고정 이미지 PostgreSQL 16.14와 PHP 8.3.35에서 별도 네트워크/컨테이너로 검증했다. PHP의 pgsql 확장이 필요하다. 테스트 역할의 비밀번호는 공개 합성 값이다. runtime/read role을 기존 설치에 생성하거나 기존 볼륨을 연결하지 않는다. 테스트는 새 DB에서 install.sql → tests.php 순서이며, 실패 후 재실행에는 fixture 초기화가 포함된다.

## F1/F2와 발행 순서

moodle_session_probe.php는 별도 설치한 Moodle 4.5.15와 합성 사용자만 사용한다. 실제 core role_switch/loginas를 호출하여 생성된 메모리 상태를 reject_assumed_identity가 거부한다. 실제 core database handler와 synthetic sessions 행에 UPDATE 실패 trigger를 넣어 write가 true를 반환하는 문제를 재현했다. 기존 raw sid 오류 sink는 /dev/null로 지정하여 기록하지 않았다.

strict_database_candidate.php는 시험용 상속 handler다. confirmation용 flush에서 writable session lock과 기존 row를 요구하고 최종 persisted bytes를 메모리에서 exact 대조한다. 실패는 sticky false로 유지하며 sid/원문/예외문을 로그에 쓰지 않는다. 같은 bytes를 종료 때 다시 저장하지 않아 자기 generation 갱신을 막는다. receipt는 내부 row ID만이며 이 receipt로 confirmation을 직접 발행할 수 없다.

발행 adapter의 필수 순서는 writable session advisory lock 획득 → 현재 메모리의 REALUSER/realuser/loginascontext/모든 rsw 부재 확인 → 지원 profile 검사 → 최종 session persistence 검증 → DB row와 shared authority fence를 유지하며 persisted 세션 generation·권한을 다시 검사 → 동일 트랜잭션 confirmation insert → 메모리 변경 없이 abort/close와 응답이다. 실패 시 confirmation insert 0건이어야 한다. 브라우저에서 보낸 userId/세션 정보는 쓰지 않는다.

이번 구현은 strict flush receipt까지만 제공한다. Moodle delegated transaction/savepoint와 별도 snapshot 연결, advisory lock과 관리자 session 삭제를 함께 조정하여 confirmation insert까지 원자화하는 adapter는 남아 있다. core read/destroy 경로의 기존 sid 로그와 destroy_all 예외 삼킴도 아직 교체하지 않았다. 따라서 후보 handler는 production CFG에 등록하지 않고 운영 confirmation 발행은 계속 차단한다. 단순 write_close 뒤 generation SELECT로 대체할 수 없다.

## 검증과 잔여 조건

새 tests.php의 권한/rollback/per-session 분리/Page DTO/프로필 변조 40개와 privilege preflight 1개를 확인했다. Moodle 새 반례/후보 수정 7개와 안전정수 overflow 및 원자 rollback 3개는 별도다. 총 신규 체크 51개이며 verification.json에 항목과 소스 지문을 보관했다. 이전 17개와 합산하거나 재실행하지 않았다. 원본 학생 자료·본문·grade·실제 기관 조회·사용자 로그인·서명·유료 호출은 0이다.

F4는 합성 schema의 non-owner 실행에서 검증했고 실제 Moodle의 전체 의존 테이블과 upgrade/restore 경로 인수는 남아 있다. F3 exact profile validator와 의존 manifest는 구현했으며 실제 설치 증거 수집기/승인 ACL 전체 query는 미구현이다. 첫 Page projection은 축약 gate row를 신뢰하는 합성 전용이다. 실제 Moodle 테이블에서 그 gate를 생성하고 같은 snapshot에서 판단하는 adapter가 없으므로 기관 자료 반환을 활성화할 수 없다. 외부 승인·명부·mTLS registry 대기와 별개의 기술 잔여 사항이다.
