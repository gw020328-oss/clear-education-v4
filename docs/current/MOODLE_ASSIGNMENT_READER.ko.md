# 활동 전용 실행의 과제 읽기 연결 후보

r20에서 C030 카드 click/return은 강의 원천 MET 1건을 생성했다. 과제 복귀는 두 번째 요청을 생성했지만 BC_PRODUCER_FAILED로 끝났다. 강의 current 근거는 보존됐다. 원래 소유자 reader의 조건은 site_info 외 모든 메서드에 args.courseid===2를 요구하여, 기존 과제 adapter의 courseids[0]/assignid 입력을 ACTIVITY_READER_TARGET에서 거부한다. transport와 Moodle 서비스도 강의용 3개 메서드만 등록돼 있었다. 원 오류 본문을 수집했다는 주장은 아니다.

기존 3개 읽기에 정확히 다음 2개만 추가한다.

- mod_assign_get_assignments: 정확한 {'courseids[0]':2}.
- mod_assign_get_submission_status: 정확한 {assignid:1,userid:0}. 0은 새 임의 사용자가 아니라 발급된 토큰의 현재 Moodle 참가자다.

normal-moodle-read-policy.mjs는 임의 메서드·추가 필드·다른 강좌/과제/사용자·숫자 문자열을 거부한다. 원 AbortSignal을 그대로 전달하고 전후 취소 및 기존 소유자 현재성 callback을 유지한다. 이 callback을 새 역할 인증으로 취급하지 않는다. 기존 command/source lease/단회/현재 역할 검증은 상위 실행기에 남아 있다.

normal-moodle-reader.php는 기존 소유자 전용 CLI 토큰 경계를 추적 가능한 파일로 옮긴 후보다. 고정 service2/참가자3/소속 강좌2/assignment1/cm4만 받는다. 서비스 membership은 정확히 참가자 한 명이어야 하며 정지·삭제·등록 상실 또는 과제 submit capability 상실 시 발급을 거부한다. prepare는 Moodle webservice core API로 정확한 5개 함수 구성을 준비하고, issue는 같은 제한 구성을 재검사한다. 기존 60초 토큰·작업 후 revoke를 유지한다. 역할을 잃어도 정리 revoke는 새 역할 검사에 막히지 않는다. 새 제출·채점·기타 쓰기 함수는 등록하지 않는다.

소유자 조립에서 activity-reader.php mount의 bytes를 이 검토 파일로 교체하고, transport.parameters를 normalMoodleReadParameters, reader를 normalMoodleReadClient로 지정한다. 둘 다 source pin에 포함한 새 실행에서만 적용한다. 현재 r20에는 적용하지 않는다. 이 후보는 과제 MET를 직접 기록하지 않으며 기존 공식 Moodle adapter가 실제 응답의 mapped user/group/status를 검증한다.

집중 합성 4개 검사는 원 target guard의 거부 재현, 정확한 두 메서드/기존 강의 읽기 전달, 다른 scope/쓰기/추가 필드 거부, 기존 소유자 callback 전후 거부와 취소 전달을 확인했다. PHP lint 통과. 실제 PHP role/enrol 변경 시험이나 서비스 권한 적용, 새 공식 source 수집은 아직 수행하지 않았다. 독립 권한 검토 뒤 실제 연결에서 확인한다.

## F1 토큰 정리 회귀 수정

초기 후보의 전역 membership 검사는 revoke까지 막았다. 고정 origin/dbhost/service2/user3 검사는 모든 action에 유지하고, 동적 membership 및 사용자 상태·등록·capability 검사는 prepare/issue에만 적용했다. revoke는 권한이 사라진 뒤에도 정확한 token/service/user 조건으로 삭제한다.

`sh tests/fixtures/moodle-reader/run.sh`는 고정 PHP 이미지의 실제 인터프리터로 운영 PHP 파일을 실행한다. DB와 Moodle API만 격리 double이며 네트워크와 실제 DB mount는 없다. membership/역할/등록 소실, suspended/deleted user 각각에서 revoke 성공 및 동일 요청 재삭제의 멱등성, prepare/issue 거절을 확인한다. 다른 service/user/origin/dbhost의 revoke는 거절한다. token이 같아도 다른 service/user인 행과 같은 service/user의 다른 token은 유지한다. 총 19개 사례를 통과했다. 이전 base PHP는 첫 membership-loss revoke 사례에서 실패한다.

이 검사는 실제 Moodle DB 권한 변경·토큰 발급이나 원천 수집을 수행한 결과가 아니다. 서비스 적용과 r21 실행은 재검토 후 진행한다. 변경하지 않은 JS policy의 기존 4개 검사는 이번 F1 수정에서 반복하지 않았다.
