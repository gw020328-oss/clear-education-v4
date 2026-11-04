# Moodle CLEAR 설치 플러그인

`local_clearbridge` 0.1.0은 Moodle 4.5 계열의 강좌별 설정 골격이다. 기준 로컬 Moodle은 4.5.15 (Build: 20261005, core version 2024100715.00), PHP 8.3.35다.

```sh
cd plugins/moodle
zip -r /tmp/local_clearbridge-0.1.0.zip local_clearbridge
```

관리자가 ZIP을 Moodle 플러그인 설치 기능에 전달하거나, ZIP의 `local_clearbridge` 디렉터리를 Moodle 코드의 `local/clearbridge`로 배치하고 관리자 CLI 업그레이드를 실행한다. 배포 전 대상 Moodle의 백업·설치 정책을 확인한다.

강좌의 CLEAR 매핑 링크는 강좌 편집 교사와 관리자 역할의 `local/clearbridge:configure` 권한으로 제어한다. 활동 완료 추적이 켜진 모듈, 과제 제출(Assignment), 회고(Assignment 또는 Forum)를 강좌 모듈 ID로 선택한다. 값 0은 미설정이며 선택한 모듈은 해당 강좌에 속하고 설정자에게 표시 가능해야 한다. 저장에는 Moodle 폼 검증과 세션 키가 적용된다. 모듈 교체·삭제 후에는 편집자가 매핑을 다시 확인해야 한다.

활성 등록 상태와 강좌 범위의 `local/clearbridge:view` 권한이 있는 학생은 CLEAR 페이지에서 연결 대기와 비활성 버튼을 본다. URL의 `id`는 강좌 ID다. 학생 식별은 Moodle 세션과 강좌 등록에 의존한다. 외부 인증 계약이 확정되면 별도 연결 작업에서 기존 매핑을 다시 검증해야 한다.

실제 Moodle 코어 session·등록·권한·Page 테이블을 사용하는 합성 CLI adapter와 B 계약 교차 검증을 포함한 196개 검사 결과는 [moodle-integration](moodle-integration/README.ko.md)에 있다. 별도 격리 설치용 실험이며 이 설치 플러그인이나 실제 기관 endpoint에서 활성화하지 않는다.
