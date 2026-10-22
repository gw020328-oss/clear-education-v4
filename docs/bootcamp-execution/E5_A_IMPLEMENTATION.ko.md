# E5-A TEST 실행 메타데이터와 복구 기반

2026-10-19. 상태 `LOCAL_METADATA_IMPLEMENTATION_PENDING_SOURCE_REVIEW_AND_E4_INTEGRATION`.
승인 입력은 공통249f4bd2088cea687333f02fb2e18add2c15efcd와 E4 memory17dca2eea07f50e4e15c3dc11f8b57169c7d3f9b다. E3 c3b71c710f558529680e255222857f0e81fe1dcb의 브랜치/PR89는 보존하고 별도 `codex/bootcamp-e5-execution`에서 두 입력을 normal merge했다. 이번 단위 요청/추천은 Sol/High이며 실제 런타임 모델 설정은 독립 확인하지 않았다.

## 현재 구현 범위

`store.execution`은 HTTP에 노출하지 않는 별도 TEST 메타데이터 서비스다. 기존 grant/outbox·v1·`.3` 서명 필드·E3 wire를 활성화하거나 바꾸지 않는다. 기본 `executionServices=null`은 UNCONFIGURED이며 enqueue/worker 실행을 막는다. 명시된 내부 서비스가 있어도 이번 버전은 METADATA_ONLY다. signer/broadcast/rebase 구현이 없으며 모든 DB commit 확인은 `dispatchAuthorized:false`, 현재 CAS는 `executionAuthorized:false`다. 실제 E4 reader/envelope/host 인수나 persistent/backend-stop 검증을 완료한 것으로 해석하지 않는다.

소유 파일은 `src/bootcamp/execution-{ledger,ports,operations,worker,readback}.mjs`, store의 migration/writer/구성 연결, 새 `tests/bootcamp-execution`, CI 발견용 product-workflow wrapper와 본 디렉터리다. 기존 R2 metric 단위 fixture는 E5 writer marker를 설정·finally 복구하도록만 변경했다. 공통 specs/root 문서와 E4 소스는 수정하지 않았다.

## 저장·명령 경계

E5 side schema는 기존 DB의 별도 표다. e5_intents/receipts/attempts/events/observations/envelopes는 append-only이며 runtimes/leases는 내부 CAS용 가변 메타데이터다. migration의 schema/guard 생성을 같은 transaction에서 처리하고 reopen 때 표 정의와 trigger SQL을 검사한다. 기존 업무 record/ID/publication/prepared bytes는 backfill·갱신하지 않는다. 구 E3 writer는 legacy 업무 표에 쓸 수 없으며 단순한 기존 read는 유지한다. 기존 immutable 표의 자체 APPEND_ONLY 및 pre-E3 INSERT guard는 그대로 적용한다.

intent와 접수 receipt는 같은 DB transaction에 저장한다. 같은 actor/key의 다른 본문, 같은 runtime/operationId의 다른 본문(caller/expectedChainVersion/payloadHash 포함)은 충돌이다. 다른 actor가 같은 요청을 접수하면 한 intent를 참조하는 별도 receipt를 갖는다. 접수 body의 hash/operationId/authorizationDigest 자체는 실행 권한이 아니다. ACCEPT 메타데이터는 저장된 E3 unsigned preparation과 실제 E2 digest를 결합하지만 그 준비물이 여전히 현재라는 서명 권한을 발급하지 않는다.

사용자는 기존 인증 서비스의 participant/현재 course operator scope를 처음과 commit 직전에 검사한다. worker는 별도 constructor-injected `authorizeService`로 인증하고 사용자 login token/CSRF/쿠키를 보관하지 않는다. 서비스 권한은 source lease나 학생/운영자의 새 지급 승인 권한을 대체하지 않는다. async authorizer/DB callback은 거부한다.

lease는 owner·workerFence·generation·leaseRevision·expiry를 결합한다. 같은 신청의 다른 intent도 동시에 lease를 갖지 못한다. 만료 후 takeover는 fence와 leaseRevision을 증가시키며 만료 worker의 늦은 결과를 거부한다. heartbeat는 R2 업무 sequence·E5 이력 sequence·동일 소유자의 fence/revision을 증가시키지 않는다. 진행 중 cap의 원래 expiry까지는 같은 worker 작업을 유지하지만 lease 연장이 그 cap의 만료를 연장하지 않는다. intent당 attempt는 한 개이며 재시작·takeover로 새 operation/attempt/fee replacement를 자동 발급하지 않는다. Ethereum sender nonce의 내구 직렬화는 E4 소유다.

## 현재 CAS와 비동기 관측

내부 `inspect`의 `clear-bootcamp-test-execution-cas.1`에는 generation/runtimeRevision, workerFence/leaseRevision, applicationRevision/ledgerSequence, businessHash, observedSnapshotHash, authorityExpiresAt, expected chain version와 authorization digest가 있다. businessHash는 실제 E3 업무/원천 head·guard/동의·이의·절차/현재 operator binding을 결합한다. source expiry로 발생한 기존 업무 무효화는 실패 명령 rollback과 분리해 보존한다. 만료·짧아진 권한·변경된 snapshot을 기존 cap에 조용히 덮어써 진행하지 않는다.

reader/lookup은 transaction 밖의 await다. 응답 뒤 새 짧은 transaction에서 같은 lease/fence/generation과 현재 CAS를 다시 검사한다. 생성 시 관측을 오래된 enqueue CAS의 영구 권한으로 쓰지 않는다. 새 canonical block은 이전 checkpoint의 후손이며 같은 업무 조건을 계속 읽을 수 있다. 블록 hash가 바뀌었다는 이유로 영구 정지하지 않는다. 실제 signing/broadcast 전후에는 E4의 새 canonical checkpoint에 대한 app version/epoch/key/nonce/current와 별도 E3 현재 승인 검사가 추가로 필요하다. 이번 READBACK용 CAS가 이를 수행했다고 주장하지 않는다.

## E4 reader에 필요한 정확 계약

constructor 입력은 `clear-bootcamp-test-execution-port.1`이며 runtimeId/runtimePinHash, 동기 authorizeService, reader.snapshot, envelope.lookup이다. 각 함수는 생성 시 고정한다. 브라우저 본문에 provider·snapshot·verified·receiptHash를 넣어 신뢰를 얻는 경로는 없다. 반환 관측/manifest는 private WeakSet ticket으로 생성되어 내부 소비하며 raw 입력을 저장하는 public append API는 없다. API의 형태/산술 검사는 chain 진위·공식 source 검증을 대체하지 않는다.

`reader.snapshot(request)` 요청 필드:

- version `clear-bootcamp-test-reader-request.1`, runtimeId/runtimePinHash, generation/workerFence
- intentId, logical applicationId, opaque chainApplicationId, operationId
- previousCheckpoint, 해당 계보의 마지막 LOCAL_FINALIZED인 finalizedCheckpoint

응답 `clear-bootcamp-test-chain-observation.1`의 정확 필드는 execution-ports.mjs에 정의했다. E4는 runtime/code/domain/type/역할/token/key pin을 검사하고 app·key/nonce·권리·operation mapping·B/R/O·queue를 **동일 blockHash**에 읽어야 한다. ancestry는 이전 checkpoint와 finalized anchor에 대한 결합 결과/근거 commitment다. reader는 실제 header ancestry·canonical 상태와 지원되는 hash-bound RPC를 검증해야 하며 caller boolean/hash를 전달하는 shim으로 구현하면 안 된다. initial root 관측도 동일 runtime을 실측해야 한다.

B/R/O,A=B-R,U=O-R,S=max(0,U-A)는 실측치다. queue는 현재 MET인 대기 app을 수락 sequence 순으로 읽는다. API는 산술·중복/순서만 확인한다.150예치/O200/첫100예약은 A50/U100/S50이며 추가50으로 A100/S0이다. memory fixture의 hardcoded queue를 실제 port로 재사용하지 않는다. 이번 검사의 이 수치는 인공 관측이고 실측 재원 인수가 아니다.

같은 blockHash의 상충 값은 거부한다. RPC 실패는 관측을 저장하지 않으며 rebase하지 않는다. 낮은 version/epoch, 분기 이탈 또는 ancestry UNPROVEN은 기존 계보를 보존한 채 runtime을 정지한다. FINALIZED anchor와 충돌하면 FINALIZED_CONFLICT다. 후속 INCLUDED 관측이 과거 finalized anchor를 지우지 않는다. 등록/배정 시각이 고정 공개보다 늦거나 firstStart/publication 복원이 불가능하면 RECOVERY_BLOCKED다. ancestry가 확인된 자동 rebase나 새 generation activation은 **미구현**이다. requestRebase는 정지만 수행한다. E3 checkpoint의 단조 검사를 우회하지 않는다.

관측 권리는 별도 축이다. canonical ACCEPTED/SETTLED는 기존 publication의 recipient/token/allocation/100과 대조하며 source/key 만료 뒤에도 조회한다. SETTLED는 CLAIMED로 표시하고 새 지급 승인 서명·source·key·claim expiry를 요구하지 않는다. DB termination 메타데이터는 R/O를 해제하거나 원래 firstStart/120/1/600을 바꾸지 않는다. orphan accept/claim의 새 계보 반영과 실제 이체 검증은 E4/E5 후속 인수다.

## E4 envelope와 DB commit 확인

API는 `envelope.lookup({envelopeRef,intentId,attemptId,generation,workerFence})`로만 manifest를 얻는다. API worker에 .3 signature/raw signed transaction을 돌려주지 않는다. manifest는 `clear-bootcamp-test-envelope-manifest.1`이며 runtime pin, intent/attempt/fence, operation/caller/expectedVersion/payloadHash/authorizationDigest, calldataHash/commandDigest, transactionHash/senderNonce/chainId/to/value, dispatchNotAfter/retainUntil과 manifestHash를 결합한다. 소스 원문 보존기간에서 retainUntil을 유추하지 않는다.

E4는 exact signed bytes를 내구 저장한 뒤 lookup 가능 상태로 만들고 txHash/sender/nonce/calldata/chain/to/value와 승인된 역할·runtime을 역검증해야 한다. API는 비밀 bytes를 볼 수 없으므로 manifest hash만으로 이 검증을 했다고 주장하지 않는다. 같은 intent의 다른 signature/calldata/command manifest는 기존 committed envelope를 덮지 못한다.

attachEnvelope의 fresh CAS가 통과하면 ref/manifest를 같은 transaction으로 저장한다. 반환은 SQLite commit 뒤에만 나간다. E4는 응답 유실 시 `confirmEnvelopeCommit`을 인증된 내부 호출로 재조회할 수 있다. 응답에는 ref/hash/intent/attempt/current fence와 원 envelope fence, executionSequence가 있다. **현 단계의 응답은 항상 E5_A_METADATA_ONLY/dispatchAuthorized=false이므로 E4는 broadcast하면 안 된다.** 실제 dispatch 인수에서는 완전한 E3 현재 승인·chain 재검사·E4 fence 수락·SEND_STARTED 내구 기록 계약을 추가하고 별도 검증해야 한다.

DB fencing은 늦은 저장을 막는다. 이미 전송된 거래 취소, 두 저장소와 체인의 분산 원자성, 외부에 나온 옛 서명의 모든 fork 재사용 금지를 보장하지 않는다. UNKNOWN은 동일 exact envelope/op/nonce로 조회해야 하며 새 op/교체/수수료 인상 자동 생성은 없다. 이번 버전은 실제 transport 자체를 구현하지 않았다.

## 검증과 다음 인수

검사 범위는 전용 E5 오프라인 검사와 기존 E1/E3 store 회귀다. 새 synthetic DB·로그인 fixture만 사용하며 외부 네트워크 guard 아래 실행한다. 기존 회귀의 인공 로그인/source 서명은 지급 승인 서명이 아니다. 실제 원천·기존 key 읽기·지급 승인 서명·실제 거래·새 체인·유료 호출은0이다. verify:dependencies의 reference compile도 메모리 compile만 한다. 테스트 집계와 source SHA는 E5_A_VERIFICATION.json을 따른다.

E3 source8 중 store.mjs만 바뀐다. 기존 boundary-v1과 memory host의 과거 source pin을 수정하지 않았다. 현재 새 head를 그 memory 검사에 넣으면 STAGE_SOURCE_PIN 거부가 나는 것이 예상되므로 이번 단위는 push/CI/full memory suite를 실행하지 않는다. 공통 소유자가 변경을 검토해 새 memory 호환 입력v2를 고정하고 E4가 명시 path/hash를 소비한 뒤 정상 이력 merge·교차 검사·exact-head CI를 진행해야 한다. 소비 harness 자기 hash를 입력에 순환 포함시키지 않는다.

다음 인수는 실제 reader의 hash-bound/canonical·finality·기존/새 checkpoint postcheck, private envelope 내구성과 보존/폐기, E4 runtime/역할 pin, API full current approval·dispatch handshake, UNKNOWN readback, 새 persistent host/backend-stop anycaller claim 결과다. 현재 구현이나 문서만으로 fullruntime/원천/지급 수락을 선언하지 않는다. 기존 금고·DB·체인·키, 멘토 미결 정책·400% 자동 자격/지급 금지·500% 제외·Moodle/source 차단·grant/outbox HOLD·독립 청구 NO-GO·Mac 원인 미확정을 유지한다.
