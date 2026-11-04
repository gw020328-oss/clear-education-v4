# Moodle A/B 투영의 격리 합성 검증

검토된 C `1a480e0e12312fa87cc924b0ce4c4a87ef6ddea8`의 0.1.3 ZIP을 그대로 설치한다. B 표시 필드는 독립 검토된 `145720325711cba3243d8b41cd698f5dcce5dba4`의 계약을 따른다. A의 영수증 문구는 화면 검증용 표지이며 A wire 계약이나 실제 수령 증거가 아니다.

두 시험 페이지는 PHP에서 Moodle 로그인·강좌·활성 등록·역할을 확인한다. 시험 헤더의 공개 합성 값은 이 Moodle 사용자/역할 및 지정 시연 강좌와 별도로 대조한다. 교사도 이 시험에서는 강좌에 등록한 합성 편집 교사만 사용한다. URL의 강좌 ID나 역할·신청 문자열은 CLEAR 권한을 제공하지 않는다. 인증 부재·다른 강좌·읽기 오류·최종 권한 철회는 DTO를 표시하지 않는다. 교사/학생의 범위 불일치나 Moodle 로그인 부재는 Moodle 접근 검사에서 먼저 거부한다.

시험 페이지는 ZIP 밖 파일을 시험 Apache alias로 명시적으로 연다. 정식 플러그인 경로의 미연결 상태는 유지한다. 이 fixture는 실제 CLEAR resolver, 인증 프로토콜, 지급 구현 또는 교사용 학생 조회 정책이 아니다. 실제 credential을 입력하지 않으며, 세션 갱신·동의·체인 호출도 실행하지 않는다.

다음 명령은 기존 로컬 합성 Moodle 코어 읽기 전용 볼륨 `clear-zip-code`와 로컬에 있는 PHP/DB 이미지를 사용한다. 새 테스트 DB, 코드, data, 포트를 생성하며 동일 이름 리소스를 재사용하지 않는다.

```sh
sh plugins/moodle/moodle-integration/run_course_dto_fixture.sh \
  /absolute/path/local_clearbridge-0.1.3.zip /absolute/path/new-test-evidence
```

실행이 끝난 시험 환경에서 HTTP 확인만 다시 할 때:

```sh
python3 plugins/moodle/moodle-integration/course_dto_http_test.py \
  /absolute/path/new-test-evidence/course-ids.json
```
