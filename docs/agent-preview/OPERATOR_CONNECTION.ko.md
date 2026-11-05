# 운영자 조건 제안 연결 — 기존 인증 · B 중계 · D · 화면

B 중계(`OPERATOR_RELAY.ko.md`, 3f914b9)의 주입 포트를 기존 CLEAR 서버 값으로 채우고, PR #167 제안자 자리에 붙인 **별도 환경 연결**이다. 운영 마운트·실제 Gemini 호출·Moodle/Reclaim 조회·지급은 포함하지 않는다.

```
브라우저 「제안 생성」 클릭
  └ 기존 지갑 세션 request (쿠키 + x-wallet / x-chain-id / x-csrf-token)
      └ POST /bootcamp/preview/{prepare,generate}         B createOperatorPreviewHandler
          runCommand = createSessionCommandFence          별도 환경 전용, Moodle native 아님
          relay      = B createOperatorPreviewRelay       DISPLAY_ONLY
            scope    = createOperatorScopeResolver        기존 auth + operatorBindings + 미리보기 설정
            dPort    = B createOperatorDPort(createDPreviewRequest)   D HMAC, 서버 간
          prepare 안에서 운영 담당자 직접 승인 결합      withOwnerApprovals
  └ 응답 → operator-proposal.js(E) → condition-proposal-v21.js(E) → ai-compare 표시
```

## 운영자·강좌 범위를 서버가 고정하는 방법

기존 서버에는 `operatorBindings: [{wallet, courseOperatorRef}]`(store 옵션 또는 `resolveOperatorBindings`)만 있다. D 의 숫자 `institutionId/courseId/operatorId` 와 배포 결합으로 가는 매핑은 **없다**. 그래서 서버 소유 설정을 하나 더 둔다.

```json
{"version":"clear-operator-preview-scope.1","bindings":[{
  "courseOperatorRef":"course-operator-demo","scopeRef":"course-operator-demo:preview","authorityRevision":1,
  "expiresAtMs":1800000000000,
  "dActor":{"institutionId":"clear-demo","courseId":"2","operatorId":"2"},
  "deployment":{"artifactHash":"<D artifactHash>","deploymentEpoch":"<D UUID>","bindingHash":"<D bindingHash(config)>",
    "model":"gemini-3.5-flash-lite","limitsHash":"<core hash(D limits)>"}}]}
```

- 값은 승인된 D 배포 설정(`deploy/agent-preview/config.mjs`)에서 옮긴다. D 는 배포 하나에 actor 하나라서 한 D actor 를 두 강좌가 같이 쓰면 거절한다.
- 지갑 → 기존 강좌 권한 → 그 강좌의 미리보기 설정이 **정확히 하나**일 때만 scope 가 나온다. operator 역할만, 강좌 권한 없음, 설정 없음, 둘 이상(브라우저가 강좌를 고르지 않으므로)은 모두 거절한다.
- `assertCurrent()` 는 세션·CSRF·강좌 권한·설정 지문·만료를 매번 다시 본다.

## 승인

화면 클릭·준비 bodyHash 로 승인을 만들지 않는다. 운영 담당자가 정확한 원문(앞뒤 공백 포함)의 bodyHash 를 직접 승인해 D 의 단회 저장소에 등록하고, 같은 bodyHash·bindingHash·ref·만료를 CLEAR 서버의 owner 승인 목록에 기록한다. 운영자가 그 원문으로 「제안 생성」 을 누르면 prepare 요청 안에서 한 번 결합(`relay.bindApproval`)되고 목록에서 빠진다. 결합이 없으면 화면은 "직접 승인 필요" 를 보이고 generate 를 보내지 않는다.

## 명령 범위(runCommand)

A 의 Moodle native `commandScope`(codex/native-activity-return)는 Moodle intent grant 를 5초 lease 로 예약하고 `work()` 에 fence 를 넘기지 않는다. B 계약(`work(fence)`)과 바로 맞지 않는다. 이 연결은 별도 환경용 `SEPARATE_ENV_SESSION_FENCE.1` 을 쓴다 — 기존 지갑 세션 기준, 세션당 1건, 정확 method/path/body, work 1회, 45초 이내, 연장 없음. Moodle 안 마운트에는 A 의 어댑터가 필요하다.

## 화면

- `web/src/bootcamp/finals-panels/operator-proposer.js` — `createOperatorProposer({request, appContextRef})`. `request` 는 기존 `createWalletSession().request` 다.
- 결과 갈래: 제안 수신(보류 조항은 제안 안에서) / 직접 승인 필요 / 만료 / 실패 / 결과 미확인. RELAY 와 D_HTTP 를 섞지 않고, D_HTTP·응답 유실은 "모델 호출 여부 미확인" 이다.
- `finals.html?proposer=operator` 는 **녹화 재생 대역**이다. 변환·화면 코드는 실제이고, 응답은 아래 별도 환경 실행에서 녹화한 HTTP 응답이다. 로그인·강좌 범위·승인을 확인하지 않는다.

## 실행

```sh
./tools/node --import ./tests/agent-preview/network-block.mjs --test tests/agent-preview/*.test.mjs
./tools/node --import ./tests/agent-preview-loopback/loopback-only.mjs --test tests/agent-preview-loopback/*.test.mjs
./tools/node --test web/tests/*.test.mjs
```

`tests/agent-preview-loopback` 는 기존 application service(SIWE 세션·CSRF), 기존 bootcamp frontend server, B 중계를 루프백 HTTPS 로 실제로 띄운다. 외부 연결은 preload 가 막는다. `CLEAR_D_PREVIEW_ROOT` 에 D 정확본을 내보낸 폴더를 주면 D 실제 서비스(HMAC·sqlite 단회 승인)를, 없으면 같은 DTO 의 D 대역을 쓴다. 모델 전송은 항상 오프라인이다.

```sh
git -C <D 저장소> archive caa3291eebf854cc77520c709331d10d0c247724 deploy/agent-preview src packages specs | tar -x -C <폴더>
ln -s "$PWD/node_modules" <폴더>/node_modules
CLEAR_D_PREVIEW_ROOT=<폴더> ./tools/node --import ./tests/agent-preview-loopback/loopback-only.mjs --test tests/agent-preview-loopback/*.test.mjs
CLEAR_D_PREVIEW_ROOT=<폴더> ./tools/node --import ./tests/agent-preview-loopback/loopback-only.mjs tools/agent-preview/record-operator-replay.mjs
```

루프백 시험은 기존 CI 의 network-block 단계(`tests/agent-preview/*.test.mjs`)에 들어가지 않도록 별도 폴더에 있다. CI 에 넣으려면 워크플로 소유자가 위 두 번째 명령 단계를 추가해야 한다.
