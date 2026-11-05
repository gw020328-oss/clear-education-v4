# 운영자 조건 미리보기 중계 후보

신규 `src/agent-preview/operator-relay.mjs`와 `operator-http.mjs`만으로 구성한 **미마운트 후보**다. 기존 application service, bootcamp HTTP, participant preview, A runtime/panel, D deploy 서비스에는 변경이 없다. 실제 로그인·모델 호출·승인 등록·공개 연결을 수행하지 않는다. 아래 A 공급자가 없으면 `PREVIEW_UNAVAILABLE`이며 operator 역할만으로 통과할 수 없다.

기준 core: `494d74df4f0448f6d8d20a8a6accbc9ffbeeebaa` (core `f5a8972` + CI). D 계약 참고: `caa3291eebf854cc77520c709331d10d0c247724`. E 공유 계약 참고: `d696f0357fcc18ad9a6d3ac80d83f4e0b69ef288`, `docs/pivot/gemini-proposal-candidate/README.v2.1.ko.md`. D/E 코드를 복제하거나 수정하지 않는다.

## 브라우저 DTO

A가 별도 연결할 동일 CLEAR origin의 POST 경로는 `/bootcamp/preview/prepare`, `/generate`, `/execute`다. 이하 version은 `clear-operator-preview.1`이다. 모든 입력은 명시된 키만 허용한다.

| 작업 | 요청 | 성공 응답의 작업별 필드 |
| --- | --- | --- |
| prepare | `{version,sourceText}` | `stage:'PREPARED',contextRef,revision,expiresAt,bodyHash,sourceHash,model,limits,approvalState:'REQUIRED'|'RECORDED'` |
| generate | `{version,contextRef,revision,bodyHash}` | `stage:'PROPOSED',contextRef,revision,expiresAt,generated` |
| execute | `{version,contextRef,revision,draftId,proposalHash}` | `stage:'OBSERVED',contextRef,revision,observation` |

모든 응답에 `version,scope:'PRECONFIGURATION_ONLY',automaticEligibility:false,paymentAllowed:false`가 있다. `expiresAt`은 밀리초이며 배타적이다. revision은 서버 발급 양의 안전 정수다. contextRef는 임의 UUID이며 다른 세션에서 사용할 수 없다. 원문을 trim하거나 바꾸지 않는다. 원문은 core의 4096 UTF-16 길이, HTTP JSON은 16384 bytes 제한을 함께 적용한다.

`generated`는 검증된 D `clear-external-preview-draft.1` 전체다. `draft`는 `.2`이며 원 `modelRows`를 사용해 core 검토 결과와 proposal을 다시 비교한다. 모델 실행 provenance와 두 메서드의 invoked/replied 상태가 모두 명시돼야 한다. `observation`은 검증된 D `clear-external-preview-observation.1` 전체다. 성공은 자격·지급 성공이 아니다.

실패는 `stage:'FAILED',failure`이며 D 실패에는 해당 contextRef/revision도 포함한다.

- RELAY: `{kind:'RELAY',code:<중계 고정 코드>}`. 외부 예외 메시지·stack·body·headers는 노출하지 않고 `PREVIEW_REJECTED`로 변환한다.
- D_HTTP: `{kind:'D_HTTP',status,error:<clear-external-preview-error.1>}`. D 공개 오류 키와 코드 allowlist만 허용한다. HTTP 오류에는 실제 모델 호출 여부 정보가 없으므로 `actualModelCall:false`나 native `.2` 오류를 합성하지 않는다. 호출 상태는 미확인으로 표시한다.

D 성공의 `actualModelCall`은 고정 transport execution과 대조한다. `null`을 포함하는 native 실패는 이 경로의 입력이 아니다. native `clear-condition-structuring.2`를 별도로 다루는 UI는 E `failureView`의 false/null/true를 유지해야 한다.

## A가 공급해야 하는 포트

```ts
type Context = { token: string; wallet: string; chainId: number; csrf: string };
type CommandFence = { assertCurrent(): void }; // 동기 검사; Promise 금지
type Scope = {
  scopeRef: string;                 // [A-Za-z0-9_.:-]{1,128}
  authorityRevision: number;       // 양의 안전 정수, 권한 변경 때 증가
  expiresAtMs: number;             // 세션/강좌/배포 권한 교집합, 배타적 ms
  dActor: {
    institutionId: string;         // [A-Za-z0-9_-]{1,64}
    courseId: string; operatorId: string; // D 숫자 ID [1-9][0-9]{0,9}
  };
  deployment: {
    artifactHash: string; bindingHash: string; limitsHash: string; // 64 lowercase hex
    deploymentEpoch: string;       // D UUID v4
    model: 'gemini-3.5-flash-lite';
  };
  assertCurrent(): void;           // 해당 snapshot의 현재성, 동기 검사
};
resolveOperatorPreviewScope(context: Context, options: {signal: AbortSignal}): Scope | Promise<Scope>;
runCommand(
  input: {request: IncomingMessage; context: Context;
    command: {method:'POST'; path:string; body:unknown}; signal:AbortSignal},
  work: (fence: CommandFence) => Promise<unknown>
): Promise<unknown>;
```

이 포트의 실제 공급원·마운트·운영자↔강좌↔D 고정 매핑은 **A 소유이며 아직 구현하지 않았다**. 브라우저의 wallet/actor/강좌 값에서 추론하지 않는다. scope 값은 현재 operatorBindings/courseOperatorRef 및 승인된 D 배포 구성에서 명시적으로 공급해야 한다. deployment.bindingHash는 D의 기존 bindingHash이고 limitsHash는 같은 배포의 limits를 core hash로 계산한 값이다. resolver가 반환한 assertCurrent는 현재 DB 권한을 확인해야 하며, 값만 반환하는 대역을 실제 설정에 사용하면 안 된다.

`authentication`은 기존 `authorizeWorkflow(context,true)`와 `whoami(context)`다. 후자는 기존 초 단위 `expiresAt`을 반환한다. HTTP handler는 `__Host-clear-session` 하나와 기존 `x-wallet`, `x-chain-id`, `x-csrf-token`을 사용해 body 읽기 전후 인증한다. 새 preview 쿠키·로그인 API는 없다. loopback TLS, 정확한 Host/Origin, same-origin fetch-site, POST JSON만 허용한다. 기존 전역 body limit은 변경하지 않는다.

`runCommand`는 A의 기존 native grant/reserve command scope를 **정확한 method/path/body**에 결합해야 한다. work 실행 전과 끝에서 reservation.assert를 수행하고 A의 finish/fail 규칙을 지킨다. work를 정확히 한 번 await하고 finish 직전 현재성을 다시 확인해야 한다. 취소를 signal로 전달하며, lease가 끝나면 assertCurrent가 반드시 실패해야 한다. 5초 lease를 45초 D 작업에 맞춰 갱신·연장하거나 reserve 없이 callback을 실행하는 공급자는 부적합하다. 장시간 모델 응답의 실제 수용 가능성은 A의 이 계약 검토 전까지 미확정이다.

호출 예시는 형태만 보여주며 공급자나 마운트를 구현하지 않는다.

```js
const dPort = createOperatorDPort({request: existingAuthenticatedDRequest, execution});
const relay = createOperatorPreviewRelay({authentication, resolveOperatorPreviewScope, dPort});
const handler = createOperatorPreviewHandler({enabled: true, origin, authentication, relay, runCommand});
```

`enabled` 기본값은 false다. callback·resolver 누락을 대체 구현으로 보완하지 않는다. A는 종료 때 relay.close(), 로그아웃·권한 변경 때 해당 context의 relay.invalidate(contextRef)를 호출하고 현재성 검사도 유지해야 한다. 입력 편집 시 프론트 세대를 즉시 올려 기존 proposal/cache/실행 핀을 폐기한다. 오래된 응답으로 새 핀을 갱신하지 않는다. generate/execute는 각각 명시적 클릭에서만 실행하며 E 기본 `DISPLAY_ONLY`를 유지한다.

## D 전송 및 직접 승인

`createOperatorDPort({request,execution})`의 execution은 서버 고정 `ACTUAL` 또는 `OFFLINE_TEST_TRANSPORT`다. request 인자는 `{method:'POST',path,body}`와 `{signal}`이다. 반환은 exact `{status,body}`다. body는 파싱된 JSON이며 어댑터는 wire 수신 크기도 제한해야 한다. 다음 세 경로 외에는 호출할 수 없다.

| operation | D 고정 경로 | exact body |
| --- | --- | --- |
| prepare | `/v1/preview/prepare` | institutionId, courseId, operatorId, sourceText |
| generate | `/v1/preview/generate` | 위 필드 + approvalRef |
| execute | `/v1/preview/execute` | prepare 필드 + draftId, proposalHash |

request의 실제 transport는 owner가 기존 D 인증 구현에 연결해야 한다. 고정 TLS origin, redirect 금지, 동일 serialized bytes의 HMAC 서명/전송, fresh nonce, 재시도 0, signal 취소를 유지한다. CLEAR cookie/context/CSRF/Origin을 D에 전달하지 않는다. 이번 구현에는 URL·HMAC·credential reader·network 호출·승인 저장소가 없으며 오프라인 대역만 사용했다.

`relay.bindApproval(context,{version,contextRef,revision,bodyHash,bindingHash,approvalRef,expiresAt},fenceOptions)`는 **이미 직접 승인하여 D의 기존 관리 경로로 등록한 ref**만 서버에서 결합하는 owner 전용 메서드다. HTTP route가 아니며 등록 기능도 없다. 등록된 원 만료를 정확히 전달해야 한다. bodyHash/bindingHash/context가 다르면 결합을 거절한다. ref가 없으면 generate는 `APPROVAL_REQUIRED`다. 준비 hash 또는 UI 클릭으로 새 승인을 만들지 않는다. D CLI의 trim과 exact 브라우저 원문 hash가 다르면 원문을 몰래 바꾸지 않고 승인을 다시 맞춰야 한다.

승인은 D 호출 전에 메모리에서 소비하며 동시/재전송·오류 후 재사용을 막는다. 프로세스 재시작까지 보장하는 소비 정본은 D의 기존 durable single-use store다. 로컬 spent key는 다음 generate 때 만료 항목을 정리하며 새 preview나 실패로 복구하지 않는다.

## 수명과 실행 경계

상태는 메모리 전용이다. 원 session token의 digest, scope/revision, D 배포 결합, exact 원문·hash에 묶는다. 원 token/CSRF를 상태에 저장하거나 로그로 출력하지 않는다. 최대 16개 context/진행 작업, 256개 미만의 미만료 소비 ref를 허용한다. HTTP 동시 처리는 8개 이하이다.

TTL 기본 60초, 상한 15분이며 세션·scope·승인·D draft 만료의 교집합으로만 줄어든다. 줄어든 만료에 정리 타이머도 맞춘다. 요청별 45초 상한과 원 monotonic deadline을 별도로 적용하며 native fence를 늘리지 않는다. 매 await 전후 현재 권한·세션·CSRF·scope·fence를 확인한다. 새 prepare는 같은 세션의 이전 context를 무효화하고 첫 await 전 순번을 고정한다. 뒤늦은 이전 resolver/응답은 최신 입력을 대체할 수 없다. 만료·invalidate·close·실패 시 원문/초안 참조와 타이머를 정리한다. 취소된 전송의 늦은 결과를 채택하지 않는다. 주입 공급자도 abort를 지키고 민감정보를 보관/로그하지 않아야 한다.

기본 실행은 `DISPLAY_ONLY`다. 서버 설정이 명시적으로 `D_SINGLE_ACTIVITY_OFFLINE.1`인 경우에만 현재 원 modelRows를 core에서 다시 검토하고, 검토된 proposalHash와 READY 단일 `moodle.activity.public` plan을 확인한 뒤 D execute를 한 번 보낸다. D 결과도 plan/hash/현재 관측 시간·OFFLINE_TEST_ADAPTER/NOT_EVALUATED를 대조한다. 실제 Moodle 도구·Reclaim·자격/지급 연결은 없다.

## 검증

```sh
./tools/node --import ./tests/agent-preview/network-block.mjs --test \
  tests/agent-preview/operator-relay.test.mjs tests/agent-preview/operator-http.test.mjs
```

고정 Node 24.21.0, 네트워크 차단 preload, 합성 세션·scope·native fence·D 응답만 사용한다. auth/원문 hash/서버 revision/동시 소비/재사용/만료 단축/중도 취소/늦은 응답/고정 D DTO/HTTP 오류 상태/기본 실행 금지를 검사한다. 기존 core guard 전체 시험, live A native command, D 실서버 HMAC, 실제 승인 등록·모델·지급은 이 검증에 포함하지 않는다.
