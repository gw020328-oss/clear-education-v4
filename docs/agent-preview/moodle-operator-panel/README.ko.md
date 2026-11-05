# Moodle 운영자 조건 초안 패널 — 연결 후보

강좌 CLEAR 설정(`configure.php`)의 "개설 전 조건 미리보기" 자리에 기존 ai-compare 패널과 operator-proposer를 붙이는 후보다. 표시 전용이며, 학생 지급·강좌 매핑·고정 네 조건 정책은 바꾸지 않는다.

## 구성

| 위치 | 내용 | 소유 |
| --- | --- | --- |
| `web/src/bootcamp/finals-panels/operator-condition-mount.js` | `mountOperatorConditionPanel(root, {courseId, readConnection, subscribe, previewRequest})` | 이 브랜치 |
| `web/src/bootcamp/finals-panels/ai-compare.js` | `onStatus` 옵션·`PROPOSAL_PHASE` 추가 | 이 브랜치 |
| `c-f0c7ece-operator-conditions.patch` | C `f0c7ece9d77b9a4a8f5a6a8afa89a3e57db0f00d` 기준 Moodle 쪽 후보. `git apply --check` 통과, **적용하지 않음** | C 적용 |
| `assemble-harness.sh`, `configure.html`, `harness.mjs` | 격리 하네스(실제 Moodle 아님) | 검증용 |

패치는 C 파일 4개를 바꾼다.

- `configure.php`: 정적 "아직 연결되지 않았습니다" 문단을 `[data-clear-operator-conditions][data-course-id]` 칸으로 감싼다. JS가 붙지 않으면 그 문단이 그대로 보인다.
- `amd/src/course_native_wallet.js`: 운영자 역할에서 위 칸을 찾아 `panels.mountOperatorConditionPanel`을 붙인다.
  - 연결은 검증된 지갑 화면 상태를 쓴다(`phase==='CONNECTED' && authenticated`). Moodle 로그인 여부는 쓰지 않는다.
  - `sessionRef`는 로그아웃이나 지갑 변경 때마다 바뀐다.
  - 화면이 닫히면 `destroy`를 부른다.
- `styles.css`: `[data-clear-operator-conditions]` 범위의 패널 스타일.
- `build_condition_panels.sh`: `OPERATOR_PANEL_COMMIT`(검토한 이 브랜치 커밋)의 `web/src`를 `operator/` 아래로 꺼내 번들에 `mountOperatorConditionPanel`을 추가한다.
- 적용 뒤 C는 `course_native_wallet.min.js`와 `course_native_panels.min.js`를 다시 빌드해야 한다.

## A가 채울 포트 (지금은 없음 → 패널은 '미연결')

A의 `mountCourseWallet(...)` 핸들에 `previewRequest(path, {method:'POST', body, signal}) => Promise<object>`가 필요하다. 지금 핸들에는 `dispatch`·`submitCommand`·`runWorkflow`만 있다.

1. **경로**: `/bootcamp/preview/prepare`, `/bootcamp/preview/generate`만 허용한다. `execute`는 열지 않는다(DISPLAY_ONLY).
2. **인증**
   - 기존 운영자 CLEAR 세션(MetaMask 서명)의 쿠키, `x-wallet`, `x-chain-id`, `x-csrf-token`을 쓴다. 브라우저에 D HMAC·API 키·승인 ref를 두지 않는다.
   - 요청마다 `captured.assertSession`과 지갑 guard를 다시 확인한다(`runWorkflow`와 같은 방식).
3. **명령 범위**: Moodle native 명령 범위(`x-clear-command-ref` intent grant 예약)에 정확한 method·path·body를 묶는다.
   - B의 `createOperatorPreviewHandler`에 넘길 `runCommand`가 B 계약 `work(fence)`를 지켜야 한다. `work`를 정확히 한 번 await하고, finish 전에 `assertCurrent`를 호출한다. 지금 `commandScope.run`은 `work()`에 fence를 넘기지 않는다.
   - 5초 lease와 D의 최대 45초 응답 사이의 차이는 A가 결정해야 한다.
   - PR #168의 `SEPARATE_ENV_SESSION_FENCE`를 이 자리에 대신 쓰지 않는다.
4. **서버 마운트**: `frontend-server.mjs`(지문 고정)에 `/bootcamp/preview/*`를 B 핸들러로 연결한다. 예시는 PR #168 `tools/agent-preview/operator-preview-stack.mjs`의 조합이다.
   - 함께 필요한 것: `resolveOperatorPreviewScope` 공급원(`operator-scope.mjs`)의 미리보기 범위 설정 파일, D 전송(`d-preview-transport.mjs`), 직접 승인 결합(`operator-owner-approval.mjs`).
5. **실패 모양**: `transport.js` `BootcampError`와 같게 던진다(`outcome`·`status`·`previewFailure`). 그래야 화면이 승인 필요·만료·D 오류·결과 미확인을 나눠 표시한다.

## 화면 상태

미연결 / 생성 전 / 생성 중 / 승인 필요 / 성공 / 서버 보류 / 생성 실패 / 만료 / 결과 미확인.

- 미연결 이유는 셋이다: 포트 없음, CLEAR 운영자 연결 없음(Moodle 로그인만), 다른 강좌.
- 미연결이면 입력 칸·생성 버튼이 없고 요청도 보내지 않는다. 녹화·합성 응답으로 대체하지 않는다.
- 연결 상태에서는 "조건 하나당 한 줄"을 안내한다. 성공하면 원문 구절·조건·선택 도구·보류 사유·출처·호출 여부·유효 시각·표시 전용을 보인다.

## 검증

```sh
./tools/node --test web/tests/operator-condition-mount.test.mjs web/tests/operator-proposer.test.mjs web/tests/proposal-failure.test.mjs web/tests/finals-panels.test.mjs
ESBUILD=<esbuild 경로> docs/agent-preview/moodle-operator-panel/assemble-harness.sh <C 저장소> f0c7ece9d77b9a4a8f5a6a8afa89a3e57db0f00d <cards+panel 저장소> <panel commit> <출력 폴더>
```

하네스는 `configure.php` 모양의 HTML에 C의 실제 AMD 소스(패치 적용본)와 빌드한 번들을 올린 것이다. A 핸들은 대역이고, `?port=replay`일 때만 PR #168의 녹화 응답을 재생한다. **실제 Moodle·실제 CLEAR 인증·실제 Gemini 연결의 성공이 아니다.**

이 PC는 전역 `core.autocrlf=true`다. 빈 git에서 패치를 적용하면 CRLF가 생겨 셸 스크립트가 깨진다. 스크립트는 `-c core.autocrlf=false`로 적용한다. C 저장소는 `.gitattributes`의 `* text eol=lf`로 막힌다.
