# E4 — 승인된 새 메모리 TEST 실행

2026-10-19. 공통 인수 `085878860d604095b0a6152329f8d82a445574b7`와 E3 최종 `c3b71c710f558529680e255222857f0e81fe1dcb`를 기준으로, 실제 E1/E2/E3 모듈의 합성 자료·인증된 절차에서 새 메모리 Execution 계약의 `.3` 서명→accept→고정 수취인 100 TEST claim을 실행했다. 이번 인수 범위는 `FRESH_ISOLATED_MEMORY_EVM_STAGE_HARNESS`뿐이다. 요청 모델은 Astra / High이며 실제 실행 모델 ID는 독립 확인하지 않았다.

[새 실행 결과](memory-stage-verification.json), [22개 계획별 결과](memory-stage-positive-plan-results.json), [실측 runtime 예](memory-stage-runtime-example.json)를 함께 읽는다. 기존 `EXECUTION_PREPARATION.ko.md`, `execution-verification.json`, `execution-positive-plan.json`의 compile66/당시 NOT_RUN22 및 runtimePin=null은 당시 기록으로 보존한다. 새 실행 근거로 덮어쓰지 않는다. PR88 준비50, E2 .3, 준비 계약/reader/artifact, Execution 계약 및 기본 차단 signer 소스도 변경하지 않았다.

## 실행 경계와 순서

`createFreshMemoryStage()`는 외부 설정·RPC·DB·키·runtime·snapshot을 받지 않는다. 새 임시 E1/E3/auth 저장소, 합성 source, 새로운 메모리 Ganache, 고정 ClearTestToken, 별도 Execution instance, 새 ephemeral TEST signer를 직접 만든다. 기존 키/.env/개인자료/실제 source를 읽지 않는다. Ganache는 서버나 외부 RPC를 열지 않으며 테스트 종료 때 연결과 임시 저장소를 정리한다. 고정 기본 adapter `createExecutionSignerAdapter()`는 계속 BLOCKED다. enabled/verified/receiptHash가 signing capability를 만들지 못한다.

1. 공통 intake와 consumer manifest 자체 SHA256 및 그 안의 E3 8개/준비 5개/E2 지문을 확인한다.
2. 실제 배포의 chainId/genesis/vault·token code/instance/domain/type/정책/역할/key를 측정한다. 정상 Shanghai/EIP-170 설정이며 무제한 크기 옵션을 쓰지 않는다.
3. 실제 인증된 E1 collect 네 조건→E3 내부 bootstrap/inspection이 opaque ID를 발급한다. E4의 Map은 그 발급 결과를 이 새 인스턴스에 라우팅하는 사본이며 새 opaque ID registry가 아니다.
4. 계약 등록→전액100 배정→E3 publication→chain startReview→현재 동의 set 결합→E3 unsigned→chain exact digest preparation을 수행한다. prepare 뒤 최신 E3 revision/ledgerSequence/snapshot CAS와 chain checkpoint/app version을 고정한 프로세스 내부 WeakMap capability를 발급한다.
5. 키 사용 전·서명 후에 실제 E3 내부 인증/현재성/CAS, E2 inspector, 동의 recipe, 등록 target, 실측 runtime, chain CAS, key/nonce/pause/전액 예약, exact prepared digest를 다시 확인한다. 서명 후 변경·철회·폐기·provider 오류면 출력은 BLOCKED/signature=null이다. 동시에 두 signing 호출을 허용하지 않는다. 체인 조회 await 뒤 키 사용 직전 및 결과 반환 직전에 동기 E3 검사를 다시 수행하여 그 대기 중 발생한 철회도 검사한다.
6. accept 직전에도 위 검사를 수행한다. 계약은 최신 현재 조건과 strict65-byte/low-s/v27·28 서명·정확 digest를 검사하고 nonce 소비와 고정 권리를 원자 저장한다. R/O/B는 accept만으로 변하지 않는다. claim은 새 서명 없이 누구나 제출하며 고정 recipient/token/100에 한 번 지급한다.

E3 포트의 wire tag는 기존 E3 계약이 허용하는 `SYNTHETIC_PORT_FIXTURE`다. source/assessment는 합성이다. funding/key/nonce/epoch/accepted-right 값은 새 메모리 체인의 실제 같은 block 조회에서 공급한다. 이 조합은 실제 인터넷 원천·persistent 운영 adapter의 인수를 뜻하지 않는다. 직접 노출한 evidence/faults/raw/provider는 이 테스트 호스트의 통제 수단이고 브라우저/HTTP 입력이나 제품 capability가 아니다.

`sync()`는 지정 block에서 상태를 모아 최신 hash가 여전히 같은지 검사한 뒤 E3의 동기 포트 cache를 교체한다. 메모리 호스트의 같은 block CAS 검사이며 E5 canonical reader/finality/reorg 복구 구현은 아니다. chain 포트는 INCLUDED로만 표시하며 FINALIZED로 승격하지 않는다.

## 검증과 최초 실패

최초 전체 실행은 **36개 중32 PASS/4 FAIL**이었다. 실패 로그는 삭제하거나 성공 기록으로 덮어쓰지 않았다.

- 자금50 부족 검사 두 개는 ethers estimateGas가 `missing revert data`를 반환해 `/SHORTFALL/` 문자열 기대와 맞지 않았다. 정확한 app/배정순서/현재성/B/R/O/가용50 전제를 확인하고 staticCall의 SHORTFALL 및 실제 실패 거래 후 상태·operation 미소비를 함께 검사하도록 고쳤다.
- once rollback 검사는 실패 거래로 block이 진행한 뒤 옛 capability를 재사용해 STAGE_CHAIN_CAS로 막혔다. 이 거부를 유지하고 명시적으로 시험한다. 계약 수준 once/rollback/idempotence만 별도 직접 호출로 검증한다.
- out-of-gas rollback 검사는 ethers Result Proxy 두 객체를 비교했다. 같은 B/R/O 및 전체 회계값을 plain BigInt 배열로 비교하고 권리/recipient balance/state/version을 따로 확인한다.

수락 후 정정 거부를 추가한 첫 fixture는 이미 pause한 상태라 PAUSED를 먼저 받았다. 정정 검사를 pause 전에 옮겨 UNACCEPTED_STATE를 직접 확인했고 후속 검사를 통과했다. 계약 guard를 변경하지 않았다.

추가로 깨끗한 checkout에서도 metrics 폴더를 생성하도록 고쳤다. 초기화 실패는 이미 등록된 cleanup을 실행하며 close는 provider/VM 정리 오류가 나도 나머지 store cleanup을 시도한다. 실패한 cleanup은 성공으로 숨기지 않는다. disconnect 오류 후 임시 폴더 삭제 및 초기화 실패 후 두 DB close를 시험한다. 초기화 시험의 첫 mock은 Ganache provider가 method가 아닌 getter라는 점을 잘못 가정해 실패했고, 원래 descriptor를 복구하는 fixture로 수정했다.

`.3`24필드·5 domain·strict signature, 다른 instance, E3/chain CAS, key 접근 전 불충분 조건, 서명 전후 철회/권한/source/이의/오류,120/1/600 및 exclusive equality, 정정 후 stable allocation/R/O/firstStart, 재검증1회 제한, 세 종료조건/역할, accepted-first/terminate-first, nonce 재사용,150+50/다른 예약 보존, 중복/동시 claim을 검사한다. E3 정정은 새 ID 경로를 실제 모듈로 검증하며 같은 ID의 higher revision은 별도 contract-level target 변형으로 검증한다.

고정 TEST 토큰은 전송 실패·callback을 제공하지 않는다. 세 통제 probe에서는 별도 악성 probe 배포를 정상 asset으로 생성하려 하면 TOKEN_CODE로 거부되는 것을 먼저 검사한다. 오직 새 메모리 VM에서 snapshot 뒤 code를 주입해 재진입 거부, transfer=false, 수취금액1 부족과 원자 rollback을 검사한다. signer는 code pin 변화로 거부한다. snapshot을 복원하고 고정 asset code를 재확인한 뒤 정상 claim을 수행한다. 이 주입 성공을 지원 토큰 범위나 정상 signer 경로의 성공으로 세지 않으며 probe 수치는 별도 기록한다.

새 `tests/product-workflow/hackathon-test-vault-memory-stage.test.mjs`가 이 전용 suite만 import한다. 기존 workflow의 network-guard/glob가 새 E4 검사를 실제 실행한다. 공통 workflow·기존 준비 wrapper·패키지 의존성·API/DB/spec/web/producer를 직접 변경하지 않았다. 새46개와 과거 준비50/compile66/E2 또는 CI 전체 분모를 합산해 새 E4 수치로 보고하지 않는다.

## 직접 코드 리뷰

같은 작업 세션에서 신규 host/검사와 unchanged Execution 계약을 경계별로 직접 대조했다. 별도 사람 승인이나 독립 보안 감사가 아니다.

- 입력 설정 없이 새 인스턴스만 생성하고, manifest hash를 고정하여 self-described hash table을 그대로 권한으로 믿지 않는지 확인했다. 역할은 constructor에서 분리되고 실제 immutable runtime hash와 선택 key 상태를 반복 확인한다.
- signing capability는 소유 WeakMap에만 존재한다. JSON 복제·flag/receiptHash로 만들 수 없다. 서명 전후 및 accept 직전 내부 인증/CAS 검사, nonce 소비의 계약 단일 소유, source/키/동의 오류의 출력 폐기를 확인했다.
- 체인 await 중 E3 철회가 생기면 앞선 검사만으로는 키를 먼저 사용할 수 있는 간격을 발견했다. 키 접근/결과 반환 바로 옆에 동기 current 재검사를 추가하고, 해당 await 중 철회 주입 두 사례에서 키 접근0 또는 생성된 서명 폐기를 확인했다.
- 준비 뒤 실패 거래/새 block도 CAS를 전진시킨다. stale handle을 조용히 갱신하는 경로를 추가하지 않았다. accepted 권리는 새 current 조건과 분리하고, 중복/재진입/전송 실패 때 상태·회계 원자성을 검증했다.
- lifecycle의 정상/초기화 실패/서명 중 close/cleanup 실패 경로를 검토하고 실패 뒤 나머지 정리를 시도하도록 보강했다. 공개 기록에는 count·합성 배포 식별자·code/hash/tx만 남기며 개인키·서명 원문·source 원문·auth token은 기록하지 않는다.
- default signer, 계약 크기/고정 token, E2 wire와 frozen evidence를 바꾸지 않았다. 확인된 범위 내 미해결 구현 결함은 없지만 아래 E5 경계는 별도 구현과 검증이 필요하다.

## E5 인계: 필요한 포트·capability·CAS·reader

| 구분 | E5가 제공·검증할 것 |
| --- | --- |
| 내부 E3 포트 | 인증된 `registerCurrentMetForE4`/`inspectRegistrationForE4`, `inspectPreparedForE4`, `inspectTerminationForE4`. source/auth/동의/이의와 revision·ledgerSequence·snapshotHash의 최신 현재성. 브라우저가 opaque mapping이나 현재성 receipt를 선언하지 않음 |
| runtime reader | accepted Execution source/artifact, chainId/genesis/actual deployed code/token code/instance/domain/type/6역할/key pins. 등록/app version/epoch/전액 allocation/prepared digest/nonce/key/pause를 하나의 확인된 block에서 읽음 |
| 비동기→동기 연결 | RPC는 E3 DB transaction 밖에서 완료하고 canonical checkpoint hash/number와 확인 상태를 동기 port snapshot으로 제공. publication baseline과 latest chain CAS를 구분하고 낡은 replacement receipt로 최신 target을 덮지 않음 |
| signing capability | 지금 WeakMap handle은 프로세스 내부·해당 임시 환경의 권한이며 직렬화/다른 runtime에 재사용 불가. E5의 durable envelope/실제 key service는 미구현. 서명 전후 인증/current/E3 CAS+chain CAS를 재검사하고 실패·폐기·중단 시 출력 폐기 |
| 수락 제출 | accept 직전 재검사와 계약 CAS/current 조건. offchain 철회가 마지막 검사와 transaction 사이에 생기는 분산 원자성은 이 harness가 해결하지 않음. E5는 원천 무효화 전달·epoch fencing·재시도 정책을 확정해야 함 |
| 재시도/복구 | `once` digest는 sender와 전체 calldata를 포함한다. 같은 opId라도 expectedVersion/signature 등 한 byte가 달라지면 OPERATION_CONFLICT이며 다른 caller는 역할 검사부터 거부된다. 실패 tx는 op/nonce 소비를 rollback. 응답 유실 후 무조건 새 서명/수정 retry 금지 |
| claim/receipt | claim에는 opId가 없다. `ACCEPTED`/`SETTLED`, 고정 acceptedRight와 `RightSettled`의 canonical tx/log를 조회해 결과를 복구해야 함. claim은 current source/key/epoch/pause/새 서명 없이 가능하며 재호출은 두 번째 지급을 만들지 않음 |
| 최종성/지속성 | canonical receipt/readback/reorg/FINALIZED 및 persistent backend-stop direct claim은 NOT_RUN. memory chain 종료 후 권리는 소멸하므로 backend-stop 검증을 대체하지 않음 |

이번 PR은 stage-scoped 양성 실행과 반례의 근거다. 새 persistent chain/signer, real source trust, 제품/production, develop/main merge, 배포는 수행하지 않는다.

최종 소스 기준: `221aac70b8b2868971ffc77f25016724e3b92a2c` (핵심 host 구현 `41983cc1a8fe509a643f7cbc9b76cb7ca7a32e2a`). 로컬 전체46 PASS/0 FAIL, 최종 accepted-correction 추가 assert의 focused1 PASS, 기존66 회귀 PASS. 같은 사례/재실행은 분모에 더하지 않는다. 최종 문서 커밋의 원격 CI와 전체46 실제 포함 여부는 PR93 본문의 exact-head 기록을 따른다.
