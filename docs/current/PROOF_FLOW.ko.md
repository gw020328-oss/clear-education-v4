# 증명 세션의 공통 클라이언트 흐름

2026-10-13, [이슈 #28](https://github.com/gw020328-oss/clear-education-v4/issues/28), 담당 A의 B1/F4 공통 연결. PR #27 병합 develop `77d1c4b`를 기준으로 [지갑 승인 도구](PROOF_WALLET.ko.md)와 기존 생성·조회·취소·결과 조회 API를 조합한다. `web/`는 아직 없고 F0 화면은 [이슈 #11](https://github.com/gw020328-oss/clear-education-v4/issues/11)의 별도 범위다. 이번 단위는 화면이 구독할 상태와 명시적 사용자 동작의 연결이며 실제 화면·확장 지갑 E2E 완료가 아니다.

## 생성과 사용

[src/application/proof-session-flow.mjs](../../src/application/proof-session-flow.mjs)는 브라우저 모듈이며 Node/DB/수집기·저장소를 가져오지 않는다. 같은 인증 지갑의 `walletClient`, 그 지갑 도구에 전달한 **동일 provider**, 선택한 applicationId로 생성한다. 서로 다른 지갑 도구/provider를 섞지 않는다.

```js
const flow = createProofSessionFlow({ walletClient, provider, applicationId });
const unsubscribe = flow.subscribe(render); // 최초 상태와 후속 불변 snapshot

// 아래 각 호출은 별도 사용자 동작에 연결한다. 자동 순차 실행 예제가 아니다.
await flow.start({ ownerPublicKey: collectorOwnerPublicKey, idempotencyKey });
const reviewed = flow.getState();
// 화면에서 reviewed.session과 reviewedRuntime을 먼저 보여준다.
await flow.authorize({ revision: reviewed.revision, reviewedRuntime, ownerPublicKey: collectorOwnerPublicKey });
await flow.refresh();
await flow.cancel();

// 화면 이탈 때 구독·provider 이벤트를 정리한다.
unsubscribe();
flow.dispose();
```

새로고침 후 알고 있는 세션 ID는 새 flow의 `refresh(proofSessionId)`로 읽는다. 세션 ID를 모르면 기존 `walletClient.request('/applications/:id/proof-sessions')` 목록에서 사용자에게 선택하게 한다. 목록은 최대 100건이므로 없다고 미생성을 단정하거나 최신 항목을 자동 선택하지 않는다. 다른 세션 조회를 시작하면 이전 선택을 지워 조회 실패 뒤 옛 세션을 취소하지 않게 한다.

생성 키는 호출자가 같은 사용자 작업 동안 유지한다. flow는 키를 생성하거나 바꾸지 않는다. owner 공개키는 선택한 수집기에서 독립적으로 얻은 값이며 실제 collector 연결·개인키 관리와 별도다. 응답에 있는 owner를 그대로 승인 기대값으로 복사하지 않는다. flow는 서명·키·쿠키·세션을 저장하거나 로그로 남기지 않는다.

## 화면 상태와 승인

`getState()`와 `subscribe(listener)`는 `revision`, `phase`, `operation`, `session`, `result`, `error`, `checkedAt`, `needsRefresh`, `creationRecovery` 및 항상 꺼진 실제 수집/검증/지급 플래그를 제공한다. 서명 nonce·typedData·체인 관측 원문·raw proof·점수·불필요한 수락 hash는 화면 상태에 넣지 않는다. session에는 ID·상태·지갑·정책/runtime hash·owner 공개키·발급/만료/승인 시각만 투영한다. 서명은 내부의 고정된 B1 세션과 검토한 runtime을 기존 helper에 넘겨 검증한다.

| phase | 화면의 의미 |
| --- | --- |
| IDLE | 아직 선택·생성한 세션 없음 |
| BUSY | START/REFRESH/AUTHORIZE/CANCEL 처리 중. 중복 동작은 FLOW_BUSY |
| READY | 마지막 조회/작업 응답을 확인함. checkedAt은 클라이언트 관측 시각이며 실시간 보증이 아님 |
| ERROR | 요청 실패. session/result가 남아도 needsRefresh=true인 과거 관측 |
| RECOVERY_REQUIRED | 쓰기 결과 불확실 또는 이전 생성의 불확실성이 남음. 새 서명·생성 전에 결과 확인 |
| CONTEXT_CHANGED | 계정/체인/disconnect 또는 조용한 지갑 변경을 감지함. 이전 표시를 비우고 이 flow를 닫음 |
| DISPOSED | 화면 이탈로 종료함 |

승인은 READY·ISSUED 및 화면에서 확인한 **현재 revision**이 일치할 때만 가능하다. 조회/오류/작업으로 revision이 바뀌면 다시 검토한다. 자동 서명·거래 전송은 없으며 기존 `ProofSessionBindingV4` 수집 세션 승인 서명만 호출한다. CLEAR 지급 승인 서명과 다르다. runtime/owner/만료·지갑 문맥·서명 검증은 PR #27 helper를 그대로 재사용한다.

세션 AUTHORIZED와 result의 ACCEPTED_SYNTHETIC은 별도 표시다. `refresh()`는 세션과 result를 순서대로 읽으며 두 응답이 모두 유효해야 READY가 된다. result는 과거 합성 수락 영수증으로, 세션이 CANCELLED/EXPIRED여도 남을 수 있다. 승인만 된 경우 NOT_ACCEPTED다. 둘 다 실제 proof·원천 전체성·자격·지급 완료가 아니며 `dataMode=SYNTHETIC`, `collectionEnabled=false`, `proofVerified=false`, `paymentAllowed=false`, `grantOutboxEnabled=false`를 유지한다.

자동 polling/타이머는 없다. 화면은 만료 시각을 표시하고 필요할 때 명시적으로 새로고침한다. READY만으로 버튼이 영구 유효하다고 가정하지 않는다. 승인 시 helper와 서버가 시각/상태를 다시 검증한다. 선택적 clock은 초 단위 가상 시계 시험용이며 서버 권한을 대신하지 않는다.

## 중단·실패·재접속

`stop()`은 진행 중 대기를 중단하고 늦은 응답을 버린다. 서버 세션을 취소하지 않는다. `cancel()`만 기존 서버 취소 API를 호출하며 응답이 CANCELLED 또는 EXPIRED인지 확인한다. 취소 응답을 잃으면 과거 상태에 needsRefresh를 표시하고 조회로 확인한다. 취소·만료된 세션을 새로 시작할 때에는 서버의 새 owner/새 멱등 키 조건을 따른다.

생성 응답을 잃으면 입력/키를 메모리에 고정하고 `creationRecovery=true`로 새 생성을 막는다. 사용자가 명시적으로 `retryStart()`를 호출하면 **동일 body·동일 키**를 사용한다. 복구 시도의 인증 오류 등이 이전 불확실성을 지우지 않는다. 기존 목록에서 찾은 ID를 `refresh(id)`로 읽어 동일 신청·고정 owner를 확인해도 복구할 수 있다. 페이지 전체를 닫으면 이 메모리는 사라지므로 호출자는 기존 키와 ID의 복구 정책을 준비해야 한다. 이 모듈은 브라우저 재시작 후 키 보존을 구현하지 않는다. 목록 부재만으로 새 키를 만들지 않는다.

승인 응답 유실 후에는 같은 세션을 조회한다. AUTHORIZED를 확인하면 승인 사실만 표시하고 재서명하지 않는다. 오류와 중단 뒤에는 과거 revision으로 서명할 수 없다. 모든 동작은 자동 재시도하지 않는다. 오류 상태와 reject에는 고정 허용 코드·자체 계산한 outcome/nextAction/retryable만 전달하며 provider/서버 원문이나 임의 복구 지시는 버린다. 쓰기가 전송되지 않았다는 근거가 없으면 보수적으로 UNKNOWN이다.

provider의 accountsChanged/chainChanged/disconnect와 동작 중 확인된 조용한 문맥 변경은 상태를 비우고 flow를 닫는다. 재연결·로그인 뒤 새 flow로 본인 세션을 조회한다. 기존 B1 서버의 발급 로그인 결합 때문에 새 로그인에서는 옛 승인 재개 대신 조회·취소 후 새 owner/키로 시작해야 할 수 있다. 화면 이탈은 반드시 dispose하며 지갑 도구 자체의 dispose는 그 도구 소유자가 담당한다. 과거 지갑 RPC가 늦게 끝나도 flow 상태를 덮어쓰지 않는다.

## 검증과 남은 조건

`./tools/node --test tests/proof-sessions/flow*.test.mjs`로 상태 전이·동일 키 복구·중복/지연·안전한 표시와 기존 HTTPS 서버/DB의 실제 합성 경로를 검증한다. 기존 wallet HTTPS fixture를 공유하며 테스트는 새 임시 지갑·DB·메모리 TEST 체인·로컬 CA만 사용한다. 기존 `test:proof-sessions` CI에 포함된다. 2026-10-13 Apple Silicon Mac/Node 24.21.0에서 신규 35개 포함 관련 회귀 686개, 마지막 변경 후 집중 시험 38개가 통과했다(실패/skip 0, 집중 시험은 회귀에 포함). 원본 보존·의존성·변경 문서 로컬 링크 93개와 diff 검사도 통과했다. 원격 CI는 연결 PR의 정확한 head 결과를 확인한다.

서버 HTTP/DB·서명 계약·정책(800점 AND 80%/최고점)·금고·Moodle provider 및 연결 명세는 유지한다. 화면 프레임워크·collector·실제 기관 API·지급 경로를 새로 연결하지 않는다. 실제 Moodle 연동·YBM 전체 목록 등 원천 검증 차단, grant/outbox·CLEAR 추가 지급 서명 종속 확대 보류와 독립 청구 제품 전환 NO-GO는 그대로다. 합성 활동 완료를 실제 출석이나 실제 학습 기록으로 표현하지 않는다.
