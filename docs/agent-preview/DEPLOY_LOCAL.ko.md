# 같은 PC에서 D를 별도 프로세스로 띄우는 절차 (로컬 D)

작성: 2026-11-06. 메인 통합 담당 요청에 따른 절차와 값이다.

- 구조: A 실행본(CLEAR 서버, 지급 호스트)은 D를 **자기 프로세스 안에서 돌리지 않는다**. 별도 Node 프로세스로 띄운 D origin을 HMAC 서버 간 호출로 부른다. D 프로세스는 지급 키·RPC 설정을 받지 않는다.
- 이 문서의 명령은 오프라인으로 확인했다(9절). D 실제 기동과 Gemini 호출은 하지 않았다. 실제 기동은 메인 담당이 한다. Gemini 키와 1회 호출 승인은 사용자 결정이다.
- 화면과 보고에서는 "로컬 AI 구조화"로 표기한다. "외부 서버"라고 쓰지 않는다.

## 1. 값 (메인이 쓸 것)

| 항목 | 값 | 비고 |
|---|---|---|
| dConnectOrigin (D 접속 주소) | `http://127.0.0.1:18991` | D listener는 127.0.0.1에만 bind한다. 18991은 2026-11-06 확인 시 비어 있었다 |
| dPublicOrigin (Host 고정값) | `https://d-preview.clear.invalid` | DNS에 없는 고정 가상 origin이다. B 클라이언트가 이 host를 `Host` 헤더로 보내고, D는 정확히 일치할 때만 받는다 |
| dExecution | `ACTUAL` | D는 실제 전송기(`developerTransport`)로 응답에 `execution:'ACTUAL'`을 넣는다. 키가 없으면 generate는 실패하지만 표기는 같다 |
| artifactHash | `6d0696c2b4c1881c0125ec6c11095035fce29f616a43bb0e35fc4649f73ee564` | 커밋 `2a1f392`를 패키징한 `build-manifest.json`의 SHA-256(462파일). 분리 작업본에서 다시 만들어도 같은 값이었다 |
| deploymentEpoch | `bcedf086-03be-44c1-a34c-f90a1ad216d2` | 로컬 D용으로 새로 만든 UUIDv4. 비밀이 아니며 다른 시험에 쓰지 않았다. 바꾸면 bindingHash도 바뀐다 |
| bindingHash | `ddd9663cd63241d7606a476a8aecd3969842b1d72614593dd169e10c491f8050` | 위 origin·dActor·artifactHash·epoch로 `approval.mjs prepare`가 계산한 값. 포트·파일 경로는 들어가지 않는다 |
| limitsHash | `d428e64cf3e7183e8ecc3a99f14c4be5b53d0f002c33c8fcbca92bfadbf28ae0` | 고정 |
| model | `gemini-3.5-flash-lite` | 고정 |
| dActor | `{"institutionId":"clear-demo","courseId":"2","operatorId":"6"}` | 메인 확인: 강좌 2의 editingteacher이자 실제 운영자 로그인 기록이 사용자 6 |
| execute | **`503 OBSERVATION_ADAPTER_NOT_ACCEPTED` 유지(기본)** | 관측 어댑터를 아직 인수하지 않았다. B relay도 `DISPLAY_ONLY`로 둔다. [결정안](DEPLOY_EXECUTE_DECISION.ko.md) |

### `clear-operator-preview-scope.1` 예시 (scopeFile, 비밀 없음)

develop의 `validateOperatorScopeConfig`로 통과를 확인했다. `expiresAtMs`는 2026-11-07 23:59:59 KST다.

```json
{"version":"clear-operator-preview-scope.1","bindings":[{
  "courseOperatorRef":"course-operator-demo",
  "scopeRef":"course-operator-demo:preview",
  "authorityRevision":1,
  "expiresAtMs":1794063599000,
  "dActor":{"institutionId":"clear-demo","courseId":"2","operatorId":"6"},
  "deployment":{
    "artifactHash":"6d0696c2b4c1881c0125ec6c11095035fce29f616a43bb0e35fc4649f73ee564",
    "deploymentEpoch":"bcedf086-03be-44c1-a34c-f90a1ad216d2",
    "bindingHash":"ddd9663cd63241d7606a476a8aecd3969842b1d72614593dd169e10c491f8050",
    "model":"gemini-3.5-flash-lite",
    "limitsHash":"d428e64cf3e7183e8ecc3a99f14c4be5b53d0f002c33c8fcbca92bfadbf28ae0"}}]}
```

`courseOperatorRef`는 A 실행본의 `operatorBindings` 값과 같아야 한다. 기본값은 `course-operator-demo`이고, 다르면 그 값으로 바꾼다.

### A 설정(`clear-normal-operator-preview.1`)과의 대응

| A 설정 키 | 값 |
|---|---|
| dPublicOrigin | `https://d-preview.clear.invalid` |
| dConnectOrigin | `http://127.0.0.1:18991` |
| dExecution | `ACTUAL` |
| scopeFile | 위 scope JSON을 0600으로 저장한 절대 경로 |
| sharedSecretFile | 3절의 `clear-preview-hmac` 절대 경로. A와 D가 같은 macOS 사용자이므로 **같은 파일 하나**를 함께 읽는다 |
| approvalsFile | 6절 4단계의 `{version:'clear-normal-operator-preview-approvals.1', approvals:[…]}` |

## 2. 폴더와 권한

Mac 관리형 저장 정책(`config/mac-managed-storage.json`: 사용자 비공개 FileVault Application Support)에 맞춰 다음 폴더를 제안한다.

```
~/Library/Application Support/CLEAR/d-preview-local/        0700
  build-2a1f392/            패키지(소스 + node_modules, 비밀 없음)
  profile.json              0600  D 설정(비밀 없음, 경로·지문만)
  clear-preview-hmac        0600  HMAC 키(hex 64자). A·D만 읽는다
  source.txt                0600  승인할 정확한 원문
  state/approvals.sqlite    0600  nonce·승인 원장(D가 만든다)
```

이 폴더는 저장소 밖에 있으므로 Git에 들어가지 않는다. 지급 키·RPC·신청 DB 파일은 이 폴더에 두지 않는다.

## 3. 준비(오프라인, 1회)

`REPO`는 커밋 `2a1f392`가 있고 `.toolchain`이 설치된 체크아웃이다(이 브랜치의 저장소). `tools/npm`은 저장소 루트로 `cd`하므로 빌드 폴더 설치에는 쓰지 않는다. 대신 toolchain의 `npm --prefix`를 쓴다.

```sh
REPO=/Users/ohgyuwon/Documents/ChatGPT/블록체인/workspaces/clear-claude-student-cards
NODE="$REPO/.toolchain/node-v24.21.0-darwin-arm64/bin/node"
D_HOME="$HOME/Library/Application Support/CLEAR/d-preview-local"
mkdir -p -m 700 "$D_HOME"

# 1) 커밋 2a1f392를 분리 작업본으로 꺼내 패키징한다(추적 파일만 복사, 비밀 없음)
git -C "$REPO" worktree add --detach /private/tmp/clear-d-src-2a1f392 2a1f392
"$NODE" /private/tmp/clear-d-src-2a1f392/deploy/agent-preview/package.mjs "$D_HOME/build-2a1f392"
git -C "$REPO" worktree remove /private/tmp/clear-d-src-2a1f392
shasum -a 256 "$D_HOME/build-2a1f392/build-manifest.json"   # 6d0696c2…e564 이어야 한다

# 2) Dockerfile과 같은 의존성 설치(lockfile 그대로, 스크립트 실행 없음)
env -i HOME="$HOME" PATH="$(dirname "$NODE"):/usr/bin:/bin" \
  npm --prefix "$D_HOME/build-2a1f392" ci --ignore-scripts --no-audit --no-fund

# 3) HMAC 키: 화면에 출력하지 않고 0600 파일로만 만든다
( umask 077; openssl rand -hex 32 > "$D_HOME/clear-preview-hmac" )

# 4) 승인할 원문(끝 개행 없음)
( umask 077; printf '%s' 'Python 기초 강의 완료' > "$D_HOME/source.txt" )
```

`profile.json`(0600)에는 비밀이 없고 경로와 지문만 들어간다. `databasePath`와 `sharedSecretFile`은 절대 경로여야 한다. `$D_HOME`을 실제 경로로 풀어 쓴다.

```json
{"version":"clear-external-preview-config.1",
 "publicOrigin":"https://d-preview.clear.invalid",
 "port":18991,
 "institutionId":"clear-demo","courseId":"2","operatorId":"6",
 "dataMode":"DEMO_ACCOUNTS_ONLY",
 "databasePath":"/Users/<사용자>/Library/Application Support/CLEAR/d-preview-local/state/approvals.sqlite",
 "sharedSecretFile":"/Users/<사용자>/Library/Application Support/CLEAR/d-preview-local/clear-preview-hmac",
 "artifactHash":"6d0696c2b4c1881c0125ec6c11095035fce29f616a43bb0e35fc4649f73ee564",
 "deploymentEpoch":"bcedf086-03be-44c1-a34c-f90a1ad216d2"}
```

## 4. 기동·중지 (메인 담당이 실행)

`server.mjs`는 시작할 때 다음 순서로 진행한다.

1. Node 버전이 `v24.21.0`인지 확인한다.
2. 프로필 JSON에서 artifactHash를 꺼내 `build-manifest.json`의 SHA-256과 대조한다.
3. 열거된 462개 파일의 바이트와 경로 집합을 대조한다.
4. 1~3을 통과한 뒤에만 앱 모듈을 불러와 설정을 검증하고 HMAC 파일을 읽는다. 그다음 `127.0.0.1:18991`에서 받기 시작한다.

`CLEAR_PREVIEW_BUILD_MANIFEST`는 지정하지 않는다. 기본값이 빌드 폴더의 `build-manifest.json`이다.

먼저 **키 없이** 띄운다. `env -i`로 터미널의 다른 환경 변수(지급·RPC 관련 포함)를 D에 넘기지 않는다.

```sh
env -i HOME="$HOME" PATH="/usr/bin:/bin" \
  CLEAR_PREVIEW_CONFIG="$D_HOME/profile.json" \
  "$NODE" "$D_HOME/build-2a1f392/deploy/agent-preview/server.mjs"
# 정상: {"event":"LISTENING","port":18991,"scope":"PRECONFIGURATION_ONLY","uid":…,"actualObservationEnabled":false,"paymentAllowed":false}
# 실패: PREVIEW_START_FAILED (지문 불일치·설정 오류·키 파일 권한 등. 원인 문자열은 일부러 출력하지 않는다)
```

- 중지: 그 터미널에서 Ctrl+C 또는 `kill -TERM <pid>`. 진행 중 작업을 먼저 취소하고 종료한다.
- 재시작: 같은 명령을 다시 실행한다. 같은 DB를 쓰므로 nonce와 승인 소진 상태가 유지된다.
- 로그: LISTENING 한 줄 또는 고정 오류 코드만 나온다. 요청 본문·헤더·키는 기록하지 않는다.

### 실제 Gemini 전송을 켤 때(사용자 승인 뒤)

키는 **D 프로세스의 `GEMINI_API_KEY` 환경 변수로만** 준다. 값을 명령줄·파일·문서에 쓰지 않는다. 키가 이미 설정된 사용자 터미널에서 그 변수만 넘긴다(normal host의 기존 방식과 같음, 파일·Keychain fallback 없음).

```sh
env -i HOME="$HOME" PATH="/usr/bin:/bin" \
  CLEAR_PREVIEW_CONFIG="$D_HOME/profile.json" \
  GEMINI_API_KEY="$GEMINI_API_KEY" \
  "$NODE" "$D_HOME/build-2a1f392/deploy/agent-preview/server.mjs"
```

- D는 호출할 때마다 자기 프로세스 환경에서 키를 읽는다. 프로세스 환경은 시작할 때 정해지므로, 키를 넣거나 빼려면 D를 재시작한다. epoch·HMAC 키는 그대로 둔다.
- A 프로세스는 이 키가 없어도 된다. D 미리보기에 대해서는 A가 Gemini를 부르지 않는다.
- 키 없이 등록된 승인으로 generate를 부르면 실패하고 그 승인은 소진된다. 승인 등록은 키를 넣고 재시작한 뒤에 한다.

## 5. 기동 후 점검(모델 호출 없음)

```sh
CLEAR_SMOKE_ROOT="$REPO" \
CLEAR_SMOKE_CONNECT=http://127.0.0.1:18991 \
CLEAR_SMOKE_PUBLIC_ORIGIN=https://d-preview.clear.invalid \
CLEAR_SMOKE_SECRET_FILE="$D_HOME/clear-preview-hmac" \
CLEAR_SMOKE_ACTOR='{"institutionId":"clear-demo","courseId":"2","operatorId":"6"}' \
CLEAR_SMOKE_EXPECT='{"bindingHash":"ddd9663cd63241d7606a476a8aecd3969842b1d72614593dd169e10c491f8050","limitsHash":"d428e64cf3e7183e8ecc3a99f14c4be5b53d0f002c33c8fcbca92bfadbf28ae0"}' \
"$NODE" <이 브랜치 체크아웃>/deploy/agent-preview/tests/remote-smoke.mjs
```

- `CLEAR_SMOKE_ROOT`는 develop 이상의 `src/agent-preview/d-preview-transport.mjs`가 있는 체크아웃이어야 한다.
- `remote-smoke.mjs`는 커밋 `77c8d50`부터 있다.
- 결과에 `"ok": true`가 나와야 한다. 7항목은 무인증·다른 Host·Origin 헤더 403, `GET /` 404, prepare 200(지문 일치), 미등록 승인 422, 없는 draft 422다.
- 이 점검은 등록된 approvalRef를 보내지 않으므로 키가 있어도 모델을 부르지 않는다.

## 6. 승인 등록(원문 → bodyHash → 등록)

1. **지문 확인(호출 없음)**

   ```sh
   env -i HOME="$HOME" PATH="/usr/bin:/bin" CLEAR_PREVIEW_CONFIG="$D_HOME/profile.json" \
     "$NODE" "$D_HOME/build-2a1f392/deploy/agent-preview/approval.mjs" prepare "$D_HOME/source.txt"
   ```

   `Python 기초 강의 완료`(UTF-8 27바이트)의 출력은 다음과 같다.
   - bodyHash `ac7ed3efc93f48f855f2ae66e8a63997be54d04feea790261593892c9f17643c`
   - bindingHash `ddd9663c…8050`
   - `scopeValues`(1절과 같음)

   CLI는 파일 내용의 앞뒤 공백을 잘라 쓴다. 운영자가 화면에 넣는 문장도 앞뒤 공백 없이 한 글자까지 같아야 한다. 다르면 bodyHash가 달라져 승인이 결합되지 않는다.

2. **사용자 직접 승인**: 원문·bodyHash·bindingHash·모델·상한(입력 4096/출력 2048 tokens, countTokens 1 + generateContent 1, 재시도 0)을 보여 준다. 비용 상한은 2026-11-04 단가 기준 USD 0.0063488이다. 승인 직전에 현재 단가를 다시 확인한다.

3. **D 원장 등록**: D가 떠 있어도 된다. 같은 SQLite 파일을 쓴다.

   ```sh
   env -i HOME="$HOME" PATH="/usr/bin:/bin" CLEAR_PREVIEW_CONFIG="$D_HOME/profile.json" \
     CLEAR_APPROVED_BODY_HASH=ac7ed3efc93f48f855f2ae66e8a63997be54d04feea790261593892c9f17643c \
     CLEAR_APPROVED_BINDING_HASH=ddd9663cd63241d7606a476a8aecd3969842b1d72614593dd169e10c491f8050 \
     "$NODE" "$D_HOME/build-2a1f392/deploy/agent-preview/approval.mjs" record-approved-input "$D_HOME/source.txt" <approvalRef>
   ```

   - `<approvalRef>`는 `^[A-Za-z0-9_-]{8,80}$` 형식의 새 값이다.
   - 출력의 `approvalExpiresAt`(ms, 등록 시각 + 1시간)이 D의 정확한 만료다.
   - 지문이 다르면 `PREVIEW_APPROVAL_FAILED`가 나오고 아무것도 기록하지 않는다. 같은 ref는 다시 등록할 수 없다.

4. **A owner 목록**: A의 approvalsFile에 같은 값을 넣는다. A는 한 번 쓰면 이 항목을 지운다.

   ```json
   {"version":"clear-normal-operator-preview-approvals.1","approvals":[
     {"bodyHash":"ac7ed3ef…643c","bindingHash":"ddd9663c…8050","approvalRef":"<approvalRef>","expiresAt":<approvalExpiresAt>}]}
   ```

5. 운영자(사용자 6)가 Moodle 패널에 **같은 원문**을 넣고 「제안 생성」을 누른다. prepare 안에서 승인이 한 번 결합된다. 이어서 generate에서 D가 원장을 소비하고 Gemini를 1회 부른다. 실패하거나 응답이 유실돼도 같은 승인으로 다시 시도하지 않는다.

## 7. 바뀌면 다시 계산해야 하는 것

| 바꾼 것 | 영향 |
|---|---|
| 패키징 커밋 | artifactHash → bindingHash → scope·승인 모두 새로 |
| deploymentEpoch, publicOrigin, dActor | bindingHash → scope·승인 새로 |
| 포트, 파일 경로 | bindingHash 영향 없음. A의 dConnectOrigin만 맞춘다 |
| HMAC 키 회전 | A·D 동시 교체. bindingHash 영향 없음 |
| DB 삭제·복원, 시계 역행 의심 | 즉시 중지 → 새 epoch + 새 키 → 새 직접 승인(DEPLOY_PLAN 3·5절) |

## 8. 경계

- D가 받는 환경 변수는 `HOME`, `PATH`, `CLEAR_PREVIEW_CONFIG`, (승인 뒤) `GEMINI_API_KEY`뿐이다. 지급 키·RPC URL·신청 DB 경로는 넘기지 않는다.
- D는 loopback에만 bind한다. 다른 기기나 브라우저는 D에 닿지 않는다. 브라우저는 A의 `/bootcamp/preview/*`만 부른다.
- D는 Moodle·체인·신청 DB에 연결하지 않는다. execute는 503이다. 응답은 항상 `paymentAllowed:false`이고 학생 지급 정책은 바뀌지 않는다.

## 9. 이 절차의 오프라인 확인 기록 (2026-11-06)

| 확인 | 결과 |
|---|---|
| 3절 1)의 분리 작업본 패키징 | 462파일, artifactHash `6d0696c2…e564`(HEAD 2a1f392에서 만든 값과 같음). 임시 작업본은 바로 제거 |
| 3절 2)의 `npm --prefix … ci --ignore-scripts` | 성공(354 packages) |
| 6절 1)의 `approval.mjs prepare`(새 빌드, `env -i`) | 1절의 bodyHash·bindingHash·scopeValues 출력. 승인 기록 없음 |
| 1절의 scope 예시 | develop `validateOperatorScopeConfig` 통과 |
| `server.mjs` 기동, `remote-smoke.mjs`, 승인 record·소비 | 이번 로컬 절차로는 **실행하지 않음**(요청대로). 같은 코드의 동작은 기존 시험이 대신한다: `artifact.test.mjs`(패키지 → server.mjs 기동 → SIGTERM), 루프백 9/9(`https://d-preview.clear.invalid` + `http://127.0.0.1` 연결), 컨테이너 점검(DEPLOY_PLAN 9-2) |
