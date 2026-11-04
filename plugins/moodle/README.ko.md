# Moodle 강좌의 CLEAR 환급 확인

`local_clearbridge` 0.1.3은 Moodle 4.5.15에서 학생의 환급 확인 진입과 교사의 기존 활동 매핑 폼을 제공합니다.

```sh
python3 plugins/moodle/moodle-integration/build_peer_zip.py /tmp/local_clearbridge-0.1.3.zip
```

관리자가 ZIP을 Moodle의 플러그인 설치 기능에 전달하거나, 압축의 `clearbridge` 디렉터리를 Moodle의 `local/clearbridge`에 배치하고 관리자 CLI 업그레이드를 실행합니다. 배포 전 대상 Moodle의 백업·설치 정책을 확인합니다.

- Moodle 사이트 운영자가 `config.php`의 `$CFG->local_clearbridge_demo_courseid`에 시연용 Python 강좌의 Moodle ID를 정수로 지정합니다. 이 설정이 없거나 다른 강좌이면 네 조건과 100 TEST 시연 정책을 표시하지 않습니다. 강좌의 URL ID는 접근 권한이나 시연 설정을 부여하지 않습니다.
- 학생은 해당 강좌의 활성 등록과 `local/clearbridge:view` 권한이 있어야 합니다. Moodle 등록은 CLEAR 수령인 등록이나 외부 인증 상태를 나타내지 않습니다. 서버 투영이 없을 때는 CLEAR 등록 상태를 조회할 수 없다고 표시합니다.
- 편집 교사·관리자는 해당 강좌의 `local/clearbridge:configure` 권한으로 활동 매핑을 열 수 있습니다. Moodle 폼·세션 키를 재사용합니다. 설정은 완료 추적이 켜진 활동, 과제, 회고 모듈의 강좌 내 매핑만 저장합니다. 모듈 삭제·교체 후에는 편집자가 매핑을 다시 확인해야 합니다.
- 읽기 DTO·동의·지급·영수증·AI 미리보기의 연결 전 단계입니다. 판정과 지급은 표시하지 않으며 새 인증 요청을 시작하지 않습니다. 별도 CLEAR 인가와 운영자가 검증한 신청 매핑은 연동의 선행 조건입니다. 이 ZIP은 외부 iframe, 인증 콜백, 세션 전달 또는 신규 외부 호출을 추가하지 않습니다.

표시 계층은 B 후보 `fa9e6aacde62ec38e924504085898f6278d62df5`의 `clear-moodle-course-evidence.1`에 맞춰 준비했습니다. 저장 당시 상태와 만료·삭제 등 근거 가용성을 구분하고, 현재 원천 상태를 확인하지 않았다고 표시합니다. 원본 근거, 대기 작업 링크, 권한과 지급 가능 여부를 DTO에서 전달하지 않습니다. 아직 PHP 페이지와 DTO 공급자는 연결하지 않습니다. 기존 peer 검증의 Moodle Page 수동 완료는 이 시연의 자동 완료 조건으로 간주하지 않습니다.

격리 검증은 새 DB·코드·moodledata 볼륨으로 Moodle을 설치하고, 플러그인 ZIP을 설치한 뒤 `moodle-integration/course_ui_fixture.php`와 `course_ui_http_test.py`를 사용합니다. fixture는 `http://127.0.0.1:18769` 및 `CLEAR_ISOLATED_COURSE_UI=1`의 비어 있는 시험 DB에서만 동작합니다. fixture JSON의 `course`를 시연 강좌로 설정한 다음 Python 시험에 JSON 파일 경로를 전달합니다.

기존 합성 CLI adapter 및 서명 관측 경계는 [moodle-integration](moodle-integration/README.ko.md)을 참고하세요.
