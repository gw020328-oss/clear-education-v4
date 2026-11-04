# Moodle 강좌의 CLEAR 환급 확인

`local_clearbridge` 0.1.5는 Moodle 4.5.15에서 학생의 환급 확인 진입과 교사의 기존 활동 매핑 폼을 제공합니다.

```sh
python3 plugins/moodle/moodle-integration/build_peer_zip.py /tmp/local_clearbridge-0.1.5.zip
```

관리자가 ZIP을 Moodle의 플러그인 설치 기능에 전달하거나, 압축의 `clearbridge` 디렉터리를 Moodle의 `local/clearbridge`에 배치하고 관리자 CLI 업그레이드를 실행합니다. 배포 전 대상 Moodle의 백업·설치 정책을 확인합니다.

- Moodle 사이트 운영자가 `config.php`의 `$CFG->local_clearbridge_demo_courseid`에 시연용 Python 강좌의 Moodle ID를 정수로 지정합니다. 이 설정이 없거나 다른 강좌이면 네 조건과 100 TEST 시연 정책을 표시하지 않습니다. 강좌의 URL ID는 접근 권한이나 시연 설정을 부여하지 않습니다.
- 학생은 해당 강좌의 활성 등록과 `local/clearbridge:view` 권한이 있어야 합니다. Moodle 등록은 CLEAR 수령인 등록이나 외부 인증 상태를 나타내지 않습니다. 서버 투영이 없을 때는 CLEAR 등록 상태를 조회할 수 없다고 표시합니다.
- 편집 교사·관리자는 해당 강좌의 `local/clearbridge:configure` 권한으로 활동 매핑을 열 수 있습니다. Moodle 폼·세션 키를 재사용합니다. 설정은 완료 추적이 켜진 활동, 과제, 회고 모듈의 강좌 내 매핑만 저장합니다. 모듈 삭제·교체 후에는 편집자가 매핑을 다시 확인해야 합니다.
- 읽기 DTO·동의·지급·영수증·AI 미리보기의 연결 전 단계입니다. 판정과 지급은 표시하지 않으며 새 인증 요청을 시작하지 않습니다. 별도 CLEAR 인가와 운영자가 검증한 신청 매핑은 연동의 선행 조건입니다. 이 ZIP은 외부 iframe, 인증 콜백, 세션 전달 또는 신규 외부 호출을 추가하지 않습니다.

표시 계층은 B 후보 `fa9e6aacde62ec38e924504085898f6278d62df5`의 `clear-moodle-course-evidence.1`에 맞춰 준비했습니다. 저장 당시 상태와 만료·삭제 등 근거 가용성을 구분하고, 현재 원천 상태를 확인하지 않았다고 표시합니다. 원본 근거, 대기 작업 링크, 권한과 지급 가능 여부를 DTO에서 전달하지 않습니다. 아직 PHP 페이지와 DTO 공급자는 연결하지 않습니다. 기존 peer 검증의 Moodle Page 수동 완료는 이 시연의 자동 완료 조건으로 간주하지 않습니다.

격리 검증은 새 DB·코드·moodledata 볼륨으로 Moodle을 설치하고, 플러그인 ZIP을 설치한 뒤 `moodle-integration/course_ui_fixture.php`와 `course_ui_http_test.py`를 사용합니다. fixture는 `http://127.0.0.1:18769` 및 `CLEAR_ISOLATED_COURSE_UI=1`의 비어 있는 시험 DB에서만 동작합니다. fixture JSON의 `course`를 시연 강좌로 설정한 다음 Python 시험에 JSON 파일 경로를 전달합니다.

기존 합성 CLI adapter 및 서명 관측 경계는 [moodle-integration](moodle-integration/README.ko.md)을 참고하세요.

## Moodle 화면 서버 조회 후보

0.1.4는 기존 학생·교사 메뉴에서 운영자 설정의 `$CFG->local_clearbridge_projection_provider`를 호출할 수 있습니다. 설정은 Moodle 서버 PHP의 `Closure`로만 제공합니다. 호출 인수는 현재 Moodle에서 확인한 강좌 ID, 로그인 사용자 ID, 화면 역할입니다. provider는 별도 CLEAR 현재 인가와 B 신청↔지급 신청 매핑을 검증한 뒤 두 결과를 `local_clearbridge\course_projection`으로 반환합니다. 사용자의 HTTP 값으로 provider, 신청, 대상 사용자 또는 권한을 만들 수 없습니다. 설정이 없거나 조회에 실패하면 미연결 화면을 렌더링합니다.

화면은 B 증거와 A 지급 표시 DTO의 역할·저장 판정 일치를 검사합니다. A 응답이 만료됐거나 두 결과가 불일치하면 투영을 숨깁니다. 현재 원천을 재검사하지 않은 저장 상태, 기록된 동의, 영수증 관측 상태만 표시합니다. 100 TEST 블록 포함 상태는 정확한 금액과 canonical·미확정 표시가 있는 경우에만 표시합니다. 지갑, 트랜잭션 식별자, 증명 원문과 서버 예외는 출력하지 않습니다. 기록 상태 다시 확인은 같은 Moodle 페이지를 서버에서 다시 읽습니다.

이 설정은 내부 PHP 호출 지점입니다. 실제 owner 엔드포인트, 인증창 주소와 창 메시지 수신은 검토된 서버 권한·주소·요청 상관 계약이 필요합니다. `moodle-integration/connected_ui_provider.php`는 별도 loopback 시험에서만 쓰는 합성 provider로 0.1.4 ZIP에 들어가지 않습니다.


0.1.5에서 Moodle 운영자는 승인된 run에 한해 서버 PHP 설정 `$CFG->local_clearbridge_course_read`에 `enabled`, `origin`, `ca`, `ownerRunId`, `key`, `synthetic`을 지정할 수 있습니다. `origin`은 고정 HTTPS origin이며 `ca`는 신뢰 CA 파일의 절대 경로입니다. `key`는 run 전용 소문자 64자리 hex 문자열입니다. 별도 운영자 `$CFG->local_clearbridge_course_authority`는 현재 강좌 ID, 로그인 사용자 ID, 화면 역할을 받아 `moodleAuthorityRef`와 `expiresAtExclusive`를 반환하는 PHP Closure입니다. 승인과 권한 발행기가 준비되기 전에는 미연결로 남습니다.

고정 `POST /v1/moodle/course/read`는 기존 raw-body HMAC을 사용합니다. HTTPS 인증서와 호스트명을 확인하며 리디렉션과 자동 재시도를 허용하지 않습니다. owner가 인증한 응답의 run, 요청 참조, 역할, 만료 및 지급 DTO의 요청 참조를 확인합니다. 현재 지원 범위는 Moodle 4.5의 DB 세션과 manual auth입니다. 요청 전후 DB 세션·사용자 상태·활성 등록을 읽고 Moodle 코어 권한을 다시 평가하며, 캐시된 권한 정의가 DB와 다르면 미연결을 표시합니다. 이전 in-process Closure는 별도 합성 화면 검증에 한해 사용할 수 있습니다.

0.1.6의 선택적 `course_authority_lease`는 원래 Moodle 요청 안의 발행·검증·폐기 포트입니다. 운영자 authority Closure가 이 객체를 반환하면 페이지가 강좌·주체·역할·run을 대조하고, owner 응답 후 현재성을 재검사한 뒤 `finally`에서 폐기합니다. 영속 설치 세대·권한 epoch 발행기는 포함하지 않으며, 이 서버 의존성이 없으면 객체를 발행하지 않습니다. 새 HTTP route, 키, DB migration, 실제 연결은 추가하지 않았습니다. A의 외부 요청에서 이 PHP 객체를 조회할 수는 없습니다. 지원 조건, A 검증 입력 및 남은 공동 계약은 [권한 발행 포트 후보](COURSE_AUTHORITY_PORT.ko.md)에 기록했습니다.
