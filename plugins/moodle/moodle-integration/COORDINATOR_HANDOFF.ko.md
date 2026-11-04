# B coordinator와 C Moodle 합성 인수

B PR151의 `210a739e1d8a2b8e7af2ef894b9309c1352b5a14`를 사용했다. 이 커밋에는 최종 기한 검사 전에 SQLite 쓰기 잠금을 확보하는 변경이 포함되어 있다. 테스트는 Git object의 모듈 원문을 일회용 디렉터리에 읽기 전용으로 복사하고 B의 `createSyntheticEnvironment`, `createBindingCoordinator`, `createSyntheticVerifier`를 사용한다. 실제 시각과 monotonic clock을 쓰고 B의 시간 검사는 그대로 실행한다.

합성 workflow에는 기존 신청과 참가자·지갑·강좌·매핑을 미리 넣는다. B가 `start`로 발급한 attempt를 로컬 fixture의 SQLite에서 읽기 전용으로 찾아, 기존 신청·revision·PENDING 상태·만료를 대조한다. 확인한 scope와 만료를 C 합성 registry에 등록하고 별도 fixture 명령으로 Moodle 확인을 발급한다. 이후 B verifier는 격리 PHP 프로세스에서 받은 DTO를 그대로 돌려준다. verifier 조회에서는 등록이나 발급을 호출하지 않는다.

SQLite 직접 조회는 테스트 전용 attempt 인수다. 기관 연결에는 인증된 B attempt 조회와 서명된 설치·명부·신뢰 registry가 필요하다. 이 결과의 범위는 합성 SQLite, 격리 Moodle 4.5.15, PHP 8.3.35, PostgreSQL 16.14, Node 24.21.0이다.

## 재현

1. [격리 Moodle 설치 절차](README.ko.md)에 따라 새 fixture DB와 Page를 준비한다. C 저장소의 `plugins/moodle`을 `/probe:ro`로 연결한 PHP 컨테이너 이름은 `clear-actual-reader-web`이다.
2. C 저장소의 Git object에 아래 B SHA가 있어야 한다. 필요하면 `git fetch origin codex/moodle-binding-contract`로 가져온다.
3. 저장소 루트에서 고정 Node로 실행한다.

```sh
./tools/node plugins/moodle/moodle-integration/coordinator-flow.test.mjs 210a739e1d8a2b8e7af2ef894b9309c1352b5a14
```

[실행 결과](coordinator-flow-verification.txt)에 9개 PASS와 B SHA가 있다. 기존 신청과 일치하지 않는 학생·강좌·매핑, 다른 신청의 attempt/binding, 확인 발급 전 조회, Moodle 내부 학생·강좌 불일치를 거부했다. 실제 PHP가 반환한 잘못된 subject는 B가 거부했고, PHP registry 철회는 완료 전과 binding 생성 후 조회에서 각각 차단됐다. 동시 완료와 이후 재호출에서 binding은 하나만 생성됐다. 정상 흐름은 실제 Page의 수동 완료 행을 새 snapshot에서 관찰해 INCOMPLETE에서 COMPLETE로 바뀌었으며 자격과 지급 플래그는 false였다. 각 시나리오의 B auth·workflow 파일 지문은 실행 전후 같았다.

이 흐름은 C 파일만으로 재현된다. 공통 CI 등록은 별도 인수다. 자동화하려면 `.github/workflows/public-synthetic.yml`에서 B SHA와 격리 Moodle 런타임·fixture 준비를 고정하고 이 명령을 호출하는 작업이 필요하다.
