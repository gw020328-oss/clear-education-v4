# 설치 Moodle 관측 연결 검증

B base `7dd6e38eead383824e9cf13bcf04804751fa3a31`. 이 문서를 포함한 커밋이 설치 C 연결 후보다.

- C: `2abcc74abb3560cb4e4c681ee27eebd212803575`, 격리 `clear-c-peer-web` / `clear-c-peer-db`, HTTP `127.0.0.1:18767`.
- D: `bf5f41c62be8ff23bd167905e645e4915ab4e01c`, 고정 `createOfflinePeer` / approval store / service, 임시 사설 CA를 검증하는 실제 HTTPS.
- 정확 입력: `Python 기초 강의 완료`.
- 매핑: `moodle.activity.public` / `python-intro` → C `core-page-manual-mark` → 새 격리 설치의 course 2 / Page CM 2 / synthetic user 3. native ID는 B→D 관측 DTO에 노출하지 않는다.

실제 Moodle Page의 **수동 완료 표시**를 읽었다. 강의 성적·학습 실력·환급 자격을 입증하는 결과는 아니다. D의 모델은 OFFLINE fixture이며 실제 모델 호출은 0회다. 학생 화면 표시까지 완료한 증거도 아니다.

## 정상 연결

1. 새 합성 wallet의 실제 B HTTPS nonce/verify 인증, 현재 학생 신청과 ACK를 사용한다. B source registry는 C의 고정 installation/course/subject/audience에 결합한다. 실제 epoch clock을 사용한다.
2. B coordinator의 첫 preview가 만든 exact confirmation.3 요청을 준비 필요로 거부해 해당 요청은 CANCELLED로 남긴다. scope/attempt를 B에서 재작성하지 않는다.
3. 조회 시간 밖에서 그 요청을 C owner CLI `peer_fixture.php --stdin`에 전달한다. C가 실제 Moodle 확인을 발급한다. 이 단계는 20초 제한의 합성 등록 준비이며 기존 5초 읽기 제한을 늘리는 수단이 아니다. 준비 지연/실패는 자동 재시도하지 않는다.
4. 같은 attempt/scope의 **새 requestRef**로 정상 B preview/complete를 호출한다. 컨테이너 내부 `/lookup` HTTP가 현재 full .3을 반환한다. 기존 receipt의 requestRef/observedAt/checkedAt를 B에서 바꾸거나 캐시 응답을 반환하지 않는다.
5. B context 발행 → D signed generate → 검증된 AST의 단일 도구/target 매핑 → 학생의 명시적 review → C signed observations.3을 정상 coordinator에서 검사 → 현재 triple만 D signed observation-result로 전달 → B HTTPS 응답.

C만 `OFFLINE_TEST` fetchImpl에서 exact `https://synthetic.invalid/observations`를 `http://127.0.0.1:18767/observations`로 매핑한다. 런타임의 HTTPS pin 규칙은 바꾸지 않았다. observation bridge가 `LOCAL_SYNTHETIC_HTTP`를 명시적으로 구분하며 D 전송기는 계속 `LOCAL_SYNTHETIC_HTTPS`만 받는다. C inner .3의 subject/course/scope/generation/revision/currentness와 outer MAC/pin/replay/부모 만료 검사를 모두 유지한다. 후속 확인 조회는 호스트 `/lookup`이 아니라 컨테이너 내부 전용 HTTP를 사용한다.

## 재현과 결과

C 고정 head의 환경이 ready이고 다른 C owner 작업이 멈춘 뒤 직렬 실행한다. 두 체크아웃은 HEAD 및 변경 없는 상태를 확인한다. D가 후속 구현 중이면 고정 head의 별도 detached worktree를 사용한다. Node 24.21.0과 기존 lockfile 의존성이 필요하다.

```sh
CLEAR_D_PEER_WORKTREE=/absolute/path/to/fixed-d \
CLEAR_C_PEER_WORKTREE=/absolute/path/to/fixed-c \
./tools/node --import ./tests/ybm-collector/network-guard.mjs \
  --test tests/agent-preview/preview-local-integration.test.mjs
```

최종 통합 **6/6 PASS** (`/tmp/clear-bcd-final-six.log`), 변경된 fixture를 사용하는 학생 binding/context 회귀 **39/39 PASS** (`/tmp/clear-bcd-binding-context-regression.log`). 이전 B 기반의 전체 binding/peer/context107 및 auth/development HTTP11 PASS는 선행 검증 기록이다.

- 내부 합성 HTTPS의 인증/AST/다른 도구/잘못된 subject/최소 triple/중복/logout 거부.
- 브라우저 연결 해제 시 현재 C 요청 CANCELLED, D 미전달.
- 고정 D 실제 TLS/approval store/service, OFFLINE countTokens/generateContent 각각 1회.
- 설치 C의 실제 COMPLETE 관측, B 저장 bindingScopeHash와 전송 scope 일치, D exact triple.
- HTTP subject/course/target 주입은 C 호출 전에 거부.
- 설치 C가 발급한 확인 결과를 다른 B subject 또는 course에 결합하면 각각 `RESPONSE_SCOPE` 거부. 임의 오류를 성공으로 세지 않는다.

환경 변수 없는 CI는 내부 합성 2개를 실행하고 외부 후보 4개를 명시적으로 skip한다. 마지막 완료 CI인 B7dd6e38 run41788323075는 기존 source provenance pin 때문에 제품 workflow 711개 중664 PASS/47 FAIL, Moodle 단계 SKIPPED였다. frontend/history/Mac/embedded는 성공했다. source pin은 변경하지 않았다.

## UX 및 후속 경계

사용자의 Moodle 내부 CLEAR UX 지시에 따라 별도 CLEAR 웹으로 이동시키는 화면 조립을 후보에서 제외했다. A UI 파일과 iframe/쿠키/CSP 정책은 수정하지 않았다. 임시 별도 UI host 준비 파일은 검증용 보류 자료이며 제품 경로가 아니다. UI action에서 지연 등록하는 별도 실험은 owner CLI timeout으로 미완료였으며 위6개 통합 결과에 포함하지 않는다. 현재 지속 UI origin은 제공하지 않는다.

D 실모델 runtime용 registration/release/provenance 계약은 본부에 인계했지만 아직 이 후보에 연결하지 않았다. `clear-offline-*`/`OFFLINE_TEST`를 실제 모델 실행 결과에 재사용하지 않는다. 지급·추가 기관·외부 배포·사용자 실제 서명·기관 실계정 접근은 수행하지 않았다.
