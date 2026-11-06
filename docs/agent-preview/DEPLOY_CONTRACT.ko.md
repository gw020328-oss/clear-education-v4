# D 배포 → 메인 통합 계약값 (OWNERSHIP 2-1)

작성: 2026-11-06, 브랜치 `codex/external-preview-deploy-prep`. 배포 전 준비값이다. 실제 배포 뒤 아래 "배포 시 확정" 값을 다시 계산해 넘긴다.
배경과 절차는 [DEPLOY_PLAN](DEPLOY_PLAN.ko.md)에 있다.

## 1. 값

| 항목 | 값 | 상태 |
|---|---|---|
| D origin | Lightsail `https://52-79-238-13.sslip.io` (epoch `d1239e85-…`, bindingHash `33f79e81…`), 로컬 D `https://d-preview.clear.invalid` | 2026-11-06 배포(키 없음). 값 전체는 [DEPLOY_LIGHTSAIL 11절](DEPLOY_LIGHTSAIL.ko.md)·[DEPLOY_LOCAL](DEPLOY_LOCAL.ko.md) |
| model | `gemini-3.5-flash-lite` | 고정(`limits.mjs`, B `operator-scope.mjs` 모두 이 값만 받음) |
| limitsHash | `d428e64cf3e7183e8ecc3a99f14c4be5b53d0f002c33c8fcbca92bfadbf28ae0` | 고정. `limits.mjs`가 바뀌지 않는 한 같다. B가 `hash(prepare.limits)`와 비교한다 |
| artifactHash | 후보 `6d0696c2b4c1881c0125ec6c11095035fce29f616a43bb0e35fc4649f73ee564` (sourceHead `2a1f392`, 462파일) | 배포 시 확정. 패키징한 커밋이 바뀌면 값도 바뀐다 |
| deploymentEpoch | 배포할 때 새로 만드는 UUIDv4(비밀 아님) | 배포 시 확정. 로컬 시험값은 실제 배포에 재사용하지 않는다 |
| bindingHash | origin·actor·dataMode·artifactHash·epoch·model·methods·limits의 core hash | 배포 시 확정. `approval.mjs prepare` 출력 `scopeValues.deployment.bindingHash` |
| dActor | `{"institutionId":"clear-demo","courseId":"2","operatorId":"6"}` | 메인 확인(Moodle DB 읽기): 강좌 2의 editingteacher이자 실제 운영자 로그인 기록이 사용자 6. 사용자 2는 사이트 관리자다. 바꾸면 bindingHash가 바뀐다 |
| execute | `503 OBSERVATION_ADAPTER_NOT_ACCEPTED` 유지 | [결정안](DEPLOY_EXECUTE_DECISION.ko.md) |
| 외부 모델 호출 | 미실행(0회) | 배포·키·입력 승인 전 |
| 도구 실행 | 미연결 | execute 결정 전 |

### 계산 확인용 로컬 시험값(실제 설정에 쓰지 말 것)

메인이 계산 방식을 맞춰 보는 용도로만 쓴다. 입력은 컨테이너 시험값에서 operatorId만 6으로 바꿨다. bindingHash는 승인 CLI `prepare`로 계산했다(컨테이너 시험 자체는 operatorId 2로 했다).

| 입력 | 값 |
|---|---|
| publicOrigin | `https://preview.example.invalid` |
| dActor | `clear-demo` / `2` / `6` |
| artifactHash | `6d0696c2b4c1881c0125ec6c11095035fce29f616a43bb0e35fc4649f73ee564` |
| deploymentEpoch | `806cfa0b-0569-4547-9370-af79507f5658` |
| → bindingHash | `c50eb4a4f7437721e61b74e9df51017285873414c74131c2cb8ffebbc3021329` |
| 원문 `Python 기초 강의 완료` → bodyHash | `ac7ed3efc93f48f855f2ae66e8a63997be54d04feea790261593892c9f17643c` |

## 2. 값을 얻는 방법

D 호스트에서 승인 CLI의 `prepare`를 실행하면 된다. 모델 호출과 승인 기록은 일어나지 않는다. 산출물 검증 뒤 서버와 같은 프로필로 계산한다.

```sh
docker compose -f deploy/agent-preview/compose.yaml exec preview \
  node deploy/agent-preview/approval.mjs prepare /run/secrets/source.txt
```

출력의 `scopeValues`(비밀 없음):

```json
{"publicOrigin":"https://<D origin>",
 "dActor":{"institutionId":"clear-demo","courseId":"2","operatorId":"6"},
 "deployment":{"artifactHash":"<64hex>","deploymentEpoch":"<uuid v4>","bindingHash":"<64hex>",
   "model":"gemini-3.5-flash-lite","limitsHash":"d428e64cf3e7183e8ecc3a99f14c4be5b53d0f002c33c8fcbca92bfadbf28ae0"}}
```

## 3. `clear-operator-preview-scope.1` 예시(비밀 없음)

`courseOperatorRef`는 A 실행본의 기존 `operatorBindings[{wallet, courseOperatorRef}]` 값이다. 기본값은 `course-operator-demo`(`src/bootcamp/store.mjs`)다. `expiresAtMs`는 행사 종료 시각(2026-11-07 23:59:59 KST)으로 예를 들었다.

```json
{"version":"clear-operator-preview-scope.1","bindings":[{
  "courseOperatorRef":"course-operator-demo",
  "scopeRef":"course-operator-demo:preview",
  "authorityRevision":1,
  "expiresAtMs":1794063599000,
  "dActor":{"institutionId":"clear-demo","courseId":"2","operatorId":"6"},
  "deployment":{
    "artifactHash":"<scopeValues.deployment.artifactHash>",
    "deploymentEpoch":"<scopeValues.deployment.deploymentEpoch>",
    "bindingHash":"<scopeValues.deployment.bindingHash>",
    "model":"gemini-3.5-flash-lite",
    "limitsHash":"d428e64cf3e7183e8ecc3a99f14c4be5b53d0f002c33c8fcbca92bfadbf28ae0"}}]}
```

`deploy/agent-preview/tests/approval-cli.test.mjs`가 CLI 출력만으로 만든 이 형태를 develop의 `validateOperatorScopeConfig`로 검사한다.

## 4. A 실행본 연결 시 주의(메인 담당)

- 전송: `createDPreviewRequest({publicOrigin, secret})`. 배포에서는 `connectOrigin`을 생략한다(= publicOrigin, 공개 CA HTTPS). `ca` 옵션은 쓰지 않는다.
- **`createOperatorDPort({request, execution: 'ACTUAL'})`**. 배포된 D는 실제 전송기(`developerTransport`)로 응답에 `modelCall.execution='ACTUAL'`을 넣는다. `tools/agent-preview/operator-preview-stack.mjs`의 `mountOperatorPreview` 기본값 `dExecution='OFFLINE_TEST_TRANSPORT'`를 그대로 두면 B가 generate 응답을 `D_RESPONSE_INVALID`로 거부한다.
- `withOwnerApprovals(relay, {registry, bindingHash})`의 bindingHash는 위 `deployment.bindingHash`와 같아야 한다.
- relay의 `executionContract`는 `DISPLAY_ONLY`로 둔다. execute는 D에서도 503이다.
- HMAC 키: A 비공개 디렉터리 0600 파일에서 읽어 `secret`에만 넘긴다. 지급 서명 키·RPC 설정과 섞지 않는다. 브라우저 번들·Moodle ZIP·로그에 넣지 않는다.
- 나가는 HTTPS만 필요하다. Mac에 들어오는 포트나 터널은 필요 없다. A 실행 환경에 나가는 네트워크 제한이 있는지는 **미확인**이다.
- D 요청 시간: generate는 D 쪽 상한 45초, B 전송기 timeout 50초, relay 작업 상한 45초다.

## 5. 승인 등록 CLI 요약

1. `prepare /run/secrets/source.txt`로 bodyHash·bindingHash 확인(호출 없음)
2. 사용자 직접 승인(정확 원문·지문·비용 상한)
3. `record-approved-input /run/secrets/source.txt <approvalRef>`, 환경에 `CLEAR_APPROVED_BODY_HASH`·`CLEAR_APPROVED_BINDING_HASH`를 넣음 → `approvalExpiresAt` 출력
4. 메인이 A owner 목록에 `{bodyHash, bindingHash, approvalRef, expiresAt: approvalExpiresAt}` 기록
5. 운영자가 같은 원문으로 「제안 생성」 → D가 1회 소비 → Gemini countTokens 1 + generateContent 1

자세한 명령은 [DEPLOY_PLAN 6절](DEPLOY_PLAN.ko.md#6-승인-등록-절차실제-gemini-1회)에 있다. Railway에서는 3번이 아직 동작하지 않는다(설정 파일·권한 전환 보완 필요).

## 6. 대체안: 외부 배포 없이 로컬 D

전체 절차와 확정 값(origin·epoch·bindingHash·scope 예시)은 [DEPLOY_LOCAL](DEPLOY_LOCAL.ko.md)에 있다. 요약:

외부 배포가 늦어지면 같은 패키지를 Mac에서 띄울 수 있다. publicOrigin은 고정 가상 origin(예: `https://d-preview.clear.invalid`)으로 두고, A는 `connectOrigin: 'http://127.0.0.1:<port>'`로 연결한다. 이 loopback 형식은 `createDPreviewRequest`가 허용한다.

- Docker Desktop(Mac)은 host networking이 기본이 아니다. 그래서 컨테이너 안 `127.0.0.1` listener에 Mac에서 닿지 않는다.
- 이 경우 staged 폴더의 `deploy/agent-preview/server.mjs`를 toolchain Node로 직접 실행한다. staged 폴더에는 `node_modules`가 필요하다. DEPLOY_LOCAL에서는 `npm --prefix <빌드 폴더> ci --ignore-scripts`로 설치한다.
- 화면과 보고에는 "로컬 AI 구조화"로 쓰고 "외부 서버"라고 하지 않는다.
