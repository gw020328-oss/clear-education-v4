# E5-A 내부 실행 포트 v1 — API 연결 대기

이 문서는 `src/hackathon-test-vault/e5/`의 별도 TEST 실행 경계를 정의한다. 실제 E1/E3 DB controller와 API worker 연결은 아직 없다. 기본 `createExecutionService()`는 계속 BLOCKED이며, 테스트의 `controller-fixture.mjs`는 실제 인증·동의·원천 CAS 구현을 대신하지 않는다. 기존 execution signer, memory boundary-v1, .3의 24필드, 계약과 E2 wire는 바꾸지 않는다.

## 구성과 권한

`openOwnedExecutionPorts({environmentId, controller})`의 worker에는 observe/envelope/seal/dispatch/recover bound facade만 전달한다. owner에는 close/prune만 남는다. `OwnedExecutionService` 전체 instance·db·verifyBytes·bytesPath를 worker에 넘기지 않는다. 같은 프로세스/UID에 임의 파일 읽기 권한을 준 비신뢰 코드를 격리한다는 뜻은 아니다.

`OwnedExecutionService({environmentId, controller})`는 새 소유 환경의 private manifest/키만 읽는 내부 구성이다. 브라우저·API body로 구성하거나 flags로 활성화하지 않는다. `ExecutionReader(manifest)`는 검토된 로컬 manifest의 loopback RPC와 frozen compiled ABI를 소비한다. 운영자가 새 환경을 만드는 명령은 `./tools/node src/hackathon-test-vault/e5/host.mjs create`; status/start/stop/probe에는 출력된 environment ID만 전달한다. 키나 서명, raw transaction을 CLI 인수로 전달하지 않는다.

API 연결 전 필요한 controller 포트는 다음 둘이다. 둘 다 동기 함수이며 Promise를 거부한다. 실제 DB transaction 안에서 외부 RPC를 수행하지 않는다.

| 포트 | 해야 하는 검증 | 반환 |
| --- | --- | --- |
| `readCurrentSync({binding, observation, payload})` | 현재 내부 worker/lease/fence, active lineage, E3 revision/ledgerSequence/snapshot, 원천 현재성·권한·동의·이의·정확 명령 digest. chain observation은 앞서 transaction 밖에서 수집됨. 새 블록이면 anchor의 canonical ancestry와 동일 업무 payload에 대한 명시적 재검증을 수락해야 함 | `{payload, signature}`: pinned controller 공개키로 SHA256(canonical payload)를 검증할 수 있는 내부 인증 증명 |
| `commitCurrentSync({binding, payload})` | 같은 intent/attempt/fence의 ref+manifestHash가 API DB에 실제 커밋됐는지 조회. browser의 commit/verified flag를 읽지 않음 | 위와 같은 challenge-bound 인증 증명 |

서명자는 독립 controller TEST 키이며 raw key는 서비스 호출자나 worker에 전달하지 않는다. 인증 증명은 fresh challenge·phase·bindingHash·observationHash/runtimeHash 또는 ref/manifestHash에 결합된다. 같은 UID/root가 private 파일을 읽을 수 있는 호스트 위협까지 막는 격리는 아니다. production 인증 프로토콜로 승인된 것이 아니다.

## 입력·출력

`seal({binding, command, capability})`의 command는 정확히 `{method, args, applicationId}`다. args는 frozen ABI의 값들이다. `accept`만 `[operationId, unsignedMessage24Fields, expectedVersion]`이고 지급 서명은 서비스 안에서 삽입한다. `claim`은 `[applicationId]`이며 operationId가 없다. 다른 vault 명령은 ABI 순서 그대로다. token의 유일한 명령은 `approve(vaultAddress, amount)`다. arbitrary target/value/calldata는 받지 않는다.

역할은 registerCurrentMet/allocate/startReview/observeCurrent/replaceTarget/bindConsents/prepareUnsigned=registrar, accept=relayer, terminate=terminator, key/pause=keyAdmin, fund/approve=depositor, claim=새 anycaller다. 모든 Ethereum tx의 value는 0, chain/to는 manifest로 고정한다.

binding의 정확 필드:

- `version`: `clear-e5-execution-capability.1`
- `intentId, requestId, attemptId, workerId, leaseId`: ASCII 식별자
- `runtimeHash`: canonical JSON manifest의 SHA256
- `lineage, workerFence`: 양의 10진 문자열; contract epoch와 별개
- `expiresAt`: 내부 lease 기한, Unix 초 정수
- `e3Commitment`: 검토된 E3 current/CAS 묶음의 32바이트 commitment
- `commandHash`: canonical command SHA256
- `anchor`: `{number, hash, time}` canonical checkpoint
- `businessHash`: `businessHashFor(command, observation)` 결과. claim은 고정 권리·상태만 결합하고 현재 원천/키/epoch/pause를 청구 조건으로 만들지 않음

`capability`는 정확 binding에 대한 controller 인증 증명이다. 해시·ref·verified boolean 자체는 권한이 아니다. 이 포트에 E3 commitment를 만드는 실제 DB adapter는 API 소유자의 후속 구현/검토가 필요하다.

`seal` 성공 반환은 **`{ref, manifestHash}`만**이다. 정확 .3 signature/raw signed tx는 새 private 디렉터리의 0600 파일에만 보관한다. transaction hash/nonce/sender/to/calldata digest를 포함하는 비밀 없는 manifest는 서비스 메타데이터에 보존한다. 동일 request/intent/attempt/operation의 다른 payload는 충돌이다. 같은 요청의 SEALED 재조회는 같은 ref/hash/bytes를 돌려주며 재서명하지 않는다.

`envelope({...request, ref, manifestHash})`는 인증 후 비밀 없는 txHash/sender/두 nonce/to/chainId/dataHash/intent·attempt·계보·기한을 조회한다. manifestHash는 소유자가 보존한 전체 SEALED metadata의 지문이며 이 축약 DTO 자체의 지문은 아니다. raw bytes/signature/DB accessor는 반환하지 않는다.

`dispatch({...request, ref, manifestHash})`는 원래 fence/binding으로만 가능하다. 새 fence의 recovery는 조회 권한이며, SEALED의 동일 bytes를 새 worker가 인수해 전송하는 adoption은 E5-B 미완료다. 새 chain/current 확인 → 정확 bytes 역검증 → 인증된 API commit 조회 → 최종 동기 current/fence 확인 → 영속 SEND_STARTED → broadcast 순서다. DB 검사와 네트워크 전송은 분산 원자 연산이 아니다. 이미 SEND_STARTED인 호출은 같은 ref라도 재전송하지 않고 조회한다.

`recover({...request, ref, manifestHash})`는 같은 immutable binding의 새 lease/fence 인증으로 조회할 수 있다. 반환 상태는 UNKNOWN/INCLUDED/REVERTED/REORGED 또는 준비 중단 상태다. receipt 조회 실패를 tx revert로 기록하지 않으며, 과거 성공 명령·권리를 새 시도의 실패로 덮어쓰지 않는다. `INCLUDED`는 공개망 PoS FINALIZED가 아니다. 반환에는 원문 calldata/signature/raw transaction이 없다. API는 observation을 다시 자신의 현재 CAS/fence와 대조해 원자 반영해야 한다.

## 영속성·nonce·보존

SQLite FULL 동기·짧은 BEGIN IMMEDIATE transaction으로 role account nonce를 예약한다. 한 role에 미해결 PREPARING/SEALED/SEND_STARTED/UNKNOWN/REORGED가 있으면 새 nonce를 자동 배정하지 않는다. .3 authorization nonce는 별도 값이다. `prepareUnsigned`의 키 접근 전부터 별도 영속 테이블에서 nonce를 전역 고유 예약하고 applicationId·lineage·정확 typed digest·prepare request에 결합한다. canonical prepare readback 후 PREPARED가 되며 accept 키 접근 전 PAYMENT_SIGNING_STARTED로 원자 전이한다. 앱·계보·digest 변경, 미예약, 재예약을 거부한다. ACCEPTED tombstone을 과거 prepare 조회가 PREPARED로 내리지 않는다. 완료된 nonce도 환경 수명 동안 남겨 재사용을 막는다. 사용자 지갑/이전 chain/DB를 읽지 않는다.

1. 키 접근 전에 PREPARING+계정 nonce와 필요한 .3 nonce 예약을 커밋한다. RESERVED_BEFORE_SIGN 시험 cut 뒤 첫 키 접근 바로 앞에서도 동기 current/fence를 재검증한다. 지급 서명 await 이후 계정 거래 키 접근 전에도 다시 확인한다.
2. 지급/계정 서명 후 다시 chain 및 동기 current를 검증한다.
3. sender/chainId/to/value/nonce/calldata/txHash를 역검증하고 공개 metadata를 저장한다.
4. 정확 secret bytes를 임시 0600 파일에 fsync → exclusive link/rename → 부모 fsync 한다.
5. SEALED를 커밋한 뒤에만 ref를 반환한다.

bytes 저장 뒤 SEALED 전 프로세스 종료는 일치하는 기존 bytes를 검증해 복구한다. bytes가 없거나 서명 여부가 불확실하면 자동 재서명하지 않는다. 응답 유실은 저장 txHash의 canonical 조회만 수행한다. fee bump/cancel/replacement/new operation 자동 발급은 없다.

dispatch 기한은 seal 시점부터 최대120초와 lease 기한 중 이른 값이다. 복구 bytes는 생성부터7일 보존한다. 별도 원천 raw의 승인된 최대1800초·최소 lease 정책에서 유추한 값이 아니며 TEST 정책으로 고정했다. `prune`은 인증된 내부 호출로 기한 뒤 unlink+부모 fsync를 수행한다. 삭제 실패는 FAILED로 남긴다. 비밀 없는 tombstone·nonce barrier는 환경 수명 동안 유지한다. 파일 삭제는 포렌식 완전 소거나 이미 유출/전송된 tx의 취소가 아니다.

## canonical과 복구 정지

상태 eth_call/code/balance/txcount는 EIP-1898 `{blockHash, requireCanonical:true}`에 결합한다. 숫자 블록 조회 fallback은 없다. receipt/transaction/block membership/logIndex/event/calldata actor와 계약 state를 검증한다. claim은 SETTLED·저장 AcceptedRight·RightSettled·정확 token Transfer를 검증한다.

서비스는 관측 checkpoint 이력을 영속 보존한다. 정상 새 블록은 canonical ancestry+업무 동일성+controller 재검증으로만 허용한다. 낮은 checkpoint/RPC 오류만으로 세대를 바꾸지 않는다. 실제 reorg 증거가 확인되면 영속 RECOVERY_BLOCKED로 새 실행을 중지한다. **새 lineage 활성화·등록/공개 순서 복원은 이 버전에 없다.** API와 E4 저장소를 함께 인수하는 별도 절차가 필요하다. 고정 publication/firstStart/120/600을 새로 시작하는 복구는 없다. 옛 receipt는 새 lineage 권한으로 자동 승격되지 않는다. DB fence는 이미 밖으로 나간 서명이나 전송을 취소하지 못한다.

## 공동 후속

실제 API ledger/lease/fencing/CAS adapter, 자동 accept→claim orchestration, 새 fence의 SEALED adoption, 검토된 호환 입력 manifest v2, API+worker 전체 중단 뒤 독립 claim, 재시작 readback 통합은 아직 미완료다. 이 소유 범위의 Geth·서비스 프로세스 중단 시험과 구분한다. 기존 memory 입력 지문과 E2/계약 변경은 하지 않는다.
