# E5 복구 연결 사전 검토 — 미구현 경계

2026-10-19. 상태 `READ_ONLY_PREPARATION_NOT_E5_ACCEPTANCE`. 기존 API 세션의 읽기 전용 검토와 공통 검토를 기록한다. 기준은 E3 `c3b71c710f558529680e255222857f0e81fe1dcb`, E4 실행 준비 `ab02b2846c224d8f28cd7bf497aa9582b955c909`, 공통 단계 허용 `085878860d604095b0a6152329f8d82a445574b7`이다. E4 양성 결과와 최종 포트 인수 후 구현한다. 아래 파일명은 제안이며 현재 구현·호출 가능한 계약이 아니다.

## 소유·인수 순서

| 순서 | API 소유 범위 | E4 소유자로부터 필요한 입력 |
| --- | --- | --- |
| 1 | 별도 TEST `execution-ports.mjs` | 실행 runtime·ABI·실측 token/code/domain/instance·역할/key pin, 실행 reader·서명/전송 capability |
| 2 | `execution-ledger.mjs`와 store migration | immutable intent·시도·관측, worker lease/fencing, 기존 이력 보존·구버전 writer 거부 |
| 3 | 내부 execution operations와 E3 연결 | 등록→전액 배정 확인→공개/startReview→현재 관측/동의→unsigned→chain prepare 순서 |
| 4 | worker와 readback·새 상태 DTO | 서명 전후 current/CAS, 정확 전송 envelope·txHash, canonical receipt/state 검증 |
| 5 | 별도 backend host·통합 시험 | 독립 persistent EVM lifecycle, backend-stop 뒤 anycaller 직접 claim, 재시작·reorg |

기존 grant/outbox를 플래그로 켜거나 준비 전용 reader의 이름만 바꾸지 않는다. MET 등록·정정은 E1 서버 수락 sequence를 따르고 같은 app 명령과 역할별 Ethereum transaction nonce를 직렬화한다. 사용자 로그인 token을 장기 worker 권한으로 보관·재사용하지 않는다.

## 짧은 DB transaction과 외부 실행

1. DB에서 intent lease와 fencing generation을 확보하고 transaction을 종료한다.
2. E4 reader가 transaction 밖에서 동일 canonical checkpoint의 runtime/app version/epoch/key/nonce/전액 예약/prepared digest를 읽는다.
3. 신뢰한 내부 관측 사본으로 E3 current 검사와 정확 revision/ledgerSequence/snapshot CAS를 수행한다. browser body·hash·verified flag는 권한이 아니다.
4. E4 capability가 외부에서 서명하고 source·chain·E3 current/CAS를 다시 검사한다. 변경되면 서명 출력과 dispatch 허용을 폐기한다.
5. 내구성 있는 정확 envelope 참조·예상 txHash·sender nonce·calldata digest·worker generation을 저장한 뒤 transaction 밖에서 전송한다.
6. receipt/readback은 외부에서 수집하고 현재 generation/관측 CAS를 확인하는 짧은 transaction으로 반영한다.

E3 동기 transaction에 async callback/RPC를 넣지 않는다. enqueue 당시 CAS를 영구 전송 권한으로 쓰지 않는다. worker heartbeat가 업무 sequence를 불필요하게 올려 자기 CAS를 깨지 않게 운영 lease와 업무 이력을 나눈다. 최종 DB 검사와 broadcast 사이의 간격은 남으며, 이를 분산 원자 처리로 주장하지 않는다. 계약의 nonce/epoch/expectedVersion/현재 조건 검사와 canonical readback이 함께 필요하다.

## 응답 유실·멱등성

| 상황 | 필요한 처리 |
| --- | --- |
| intent commit 전 중단 | DB rollback, 전송 없음 |
| commit 후 dispatch 전 중단 | 기존 immutable intent/op 복구, 새 op 발급 금지 |
| dispatch marker 뒤 응답 유실 | UNKNOWN, 저장 txHash·sender nonce·operation mapping 대조; 미전송으로 단정 금지 |
| receipt 뒤 DB 반영 전 중단 | 동일 canonical receipt 재검증·멱등 반영 |
| 두 worker·만료 worker의 늦은 완료 | fencing CAS로 늦은 DB 반영 거부, 이미 나간 거래는 canonical 조회 |
| 동일 op·동일 payload | 원래 처리·영수증 복구 |
| 동일 op·다른 payload | 충돌. expectedVersion·signature·caller 변경도 다른 payload |

일반 계약 operation digest는 `msg.sender + 전체 calldata`다. 선행 pause 등의 modifier 때문에 이미 반영된 op 재호출이 실패할 수도 있으므로 재호출 성공만으로 복구하지 않는다. `claim(appId)`에는 operationId가 없다. 고정 AcceptedRight·SETTLED tombstone·RightSettled·정확 token 이체를 대조하며 중복 claim revert로 과거 정산을 실패 처리하지 않는다.

서명과 signed transaction은 재사용 가능한 권한 자료다. API DB에 키·원문·쿠키를 넣지 않는다. E4 소유 보관 capability가 정확 envelope의 보존 기간·권한·내구성·재시작 조회·최소 공개 참조를 확정해야 한다. API가 opaque ref만 저장해 놓고 실제 복구 자료는 메모리에서 유실되는 상태를 crash-safe 완료로 인정하지 않는다.

## canonical·재기준·확정 권리

- receipt status1과 canonical 포함은 INCLUDED다. FINALIZED에는 지원되는 별도 근거가 필요하다. 로컬 finality 모델을 공개망 PoS finality로 표시하지 않는다.
- 명령·각 전송 시도·현재 권리는 별도 상태다. 새 시도의 실패가 과거 성공 명령이나 SETTLED 기록을 덮지 않는다.
- reorg receipt는 REORGED 이력으로 보존하고 현재 canonical operation/app을 다시 읽는다. 과거 replacement로 최신 target을 덮지 않는다.
- E3의 현재 epoch/version checkpoint는 후퇴를 거부한다. E5에는 인증된 canonical reorg 근거와 관측 무효화·재기준 절차가 별도로 필요하다. 불변 업무 이력 삭제나 낮은 값을 강제로 덮어쓰는 우회는 금지한다. 아직 이 절차는 구현·인수되지 않았다.
- 원천·권한 무효화는 최초 accept를 계속 차단한다. 이미 전송된 accept와 무효화의 경합은 canonical chain 순서로 판단한다. accept-first면 고정 recipient/100 권리를 보존하고 source/key/epoch/만료로 회수하지 않는다.
- DB 종료 intent는 예약을 해제하지 않는다. 계약의 미수락·세 정당 종료조건·terminator 권한·epoch/R/O 원자 전이 결과만 반영한다.

## E5 실측 인수 조건

새 소유 persistent EVM을 backend와 별도 lifecycle로 보존한다. accept 후 backend/worker/signer를 중단하고 별도 anycaller가 source·새 서명·현재 key 없이 고정 recipient에게100을 한 번만 청구하는지 확인한다. backend 재시작 readback·동시/중복 claim·응답 유실·reorg는 각각 검증한다. 메모리 EVM 결과는 이 검증을 대신하지 않는다. 기존 사용자 DB·체인·키·volume은 초기화하지 않는다.

이 문서 자체의 실행·서명·지급·원천 수락은0이다. E4 양성 및 E5 최종 포트 인수 전의 준비 기록이며 기존 v1/상용 차단을 변경하지 않는다. main/develop 병합·배포는 포함하지 않는다.

## Astra/High 복구 검토 추가 — 여전히 미구현

기존 API 세션의 별도 Astra/High 읽기 전용 검토는 관측 재기준화와 거래 재실행을 분리하도록 결론냈다. 다음은 E5 구현 전 확정해야 하는 내부 계약이다.

- 금고 단위 `runtimeLineageGeneration`, 계보 안의 실제 block hash/number·contract version/epoch, 독립 `workerFence`를 분리한다. 실제 chain epoch/version에 가상 숫자를 더하지 않는다. 인증된 ancestry와 이전 canonical 이탈 근거 없이 RPC 오류·낮은 버전만으로 새 계보를 만들지 않는다.
- CAS로 기존 계보를 닫고 OBSERVATION_INVALIDATED/REBASE_PENDING을 추가한다. E4 저장소의 fence 반영과 새 canonical 전체 상태 확인이 모두 끝나기 전에는 실행하지 않는다. 두 저장소 사이 원자성을 주장하지 않는다. FINALIZED로 인정한 checkpoint와 충돌하면 자동 재기준화 대신 정지한다.
- 과거 source/consent/preparation/envelope는 새 계보의 권한으로 자동 승격하지 않는다. source 취득시각·expiry, 원래 공개·120/600, business 재검증 횟수와 불변 decisionHash는 유지한다. 옛 권한 nonce도 재발급하지 않는다.
- 기존 준비 전용 port를 실제 실행 port로 이름만 바꾸지 않는다. 새 내부 실행 projection/CAS와 활성 계보 membership을 버전 분리하며 기존 HTTP/.3의24필드 wire를 보존한다.

현재 실행 계약은 publication이 allocation/target 기록 시각 이후여야 한다. reorg로 등록·배정이 사라진 뒤 새 블록에서 복원하면 기존 고정 공개 시각을 만족하지 못할 수 있다. 최소 복구는 이 경우 RECOVERY_BLOCKED로 남긴다. 공개 시각·firstStart·600초를 새로 시작하거나 새 절차를 만들어 우회하지 않는다. startReview만 사라지고 배정/target 시각이 기존 공개 이전이면 남은 고정 창을 만족하는 재실행을 별도로 검증한다.

canonical accept가 사라진 경우는 현재 수락 권리가 없고, accept가 남아 claim만 사라진 경우는 source/새 지급 승인 없이 다시 청구할 권리가 남는다. canonical SETTLED는 정산 완료를 유지한다. orphan 관측은 REORGED 이력으로 남기되 현재 완료 표시로 쓰지 않는다. accepted-first 권리 보존은 현재 canonical 이력의 수락을 뜻하며 모든 분기의 orphan 거래가 영구 유효하다는 보장이 아니다.

관측 세대와 fencing은 이미 외부로 나간 서명을 체인에서 취소하지 못한다. 과거 epoch/version/prepared/nonce가 돌아오는 ABA에서는 옛 서명이 다시 유효할 수 있다. 실제 canonical 무효화 거래와 accept의 순서 및 계약 조건으로 판정하며, API 세대 전환만으로 모든 분기의 재실행을 막았다고 주장하지 않는다.

### 내구 envelope의 추가 합격 조건

opaque ref는 bearer 권한이 아니다. E4가 내부 호출자·command·generation/fence를 인증한다. API worker에는 .3 signature/raw signed transaction을 반환하지 않는다. 정확 bytes를 내구 저장하고 sender/chainId/to/value/nonce/calldata/txHash를 역검증한 SEALED 이후 같은 요청 ID는 동일 manifest만 반환한다. API의 ref commit 확인 후 현재성 재검사와 영속 SEND_STARTED를 거쳐 broadcast한다. 서로 다른 nonce(계정 거래 nonce와 .3 권한 nonce)를 혼동하지 않는다.

UNKNOWN의 자동 교체·취소·수수료 인상은 최소 구현에서 제외한다. 별도 dispatch 기한·복구 bytes 보존기한·비밀 삭제/실패·비밀 없는 tombstone 보존을 명시하고 source 원문의 보존정책에서 자동 유추하지 않는다. 삭제/TTL은 이미 유출·전송된 raw transaction을 무효화하지 않는다. fence 수락 후 옛 worker의 새 dispatch는 막지만 이미 시작된 전송은 나중에 채굴될 수 있다.

### 블록 결합과 실행 환경의 준비 상태

블록 높이 조회의 앞뒤 hash 비교만으로는 중간에 분기가 바뀌었다 돌아오는 ABA를 배제할 수 없다. [EIP-1898](https://eips.ethereum.org/EIPS/eip-1898)은 이 문제와 blockHash/requireCanonical 선택자를 명시한다. 실행 reader는 지원되는 블록 hash 결합을 실제 확인하고, 지원하지 않는 조회를 같은 보장으로 표시하지 않아야 한다.

현재 설치된 Ganache7.9.2의 선언은 eth_call blockNumber에 QUANTITY/Tag만 표시한다. 이는 런타임 지원 여부의 완전한 증거가 아니며 실제 capability probe는 E5 단위에서 수행한다. 읽기 전용 inventory에서 anvil/geth 실행 파일은 없고 Docker는 있었다. 대안인 [Geth 개발 모드](https://geth.ethereum.org/docs/developers/dapp-developer/dev-mode)는 외부 peer 없는 로컬 개발망이며, [공식 RPC 문서](https://geth.ethereum.org/docs/interacting-with-geth/rpc/ns-eth)는 EIP-1898 선택자를 설명한다. [공식 container 배포](https://geth.ethereum.org/docs/getting-started/installing-geth)를 선택한다면 새 소유 환경·고정 image digest·독립 volume·loopback만 사용한다. 이번 준비에서는 image pull·새 chain 시작·외부 RPC를 하지 않았다.
