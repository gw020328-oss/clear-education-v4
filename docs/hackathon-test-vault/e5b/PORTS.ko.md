# E5-B 소유 bridge 연결 계약

2026-10-19. `COMPONENT_CANDIDATE_ACTUAL_API_ORCHESTRATION_NOT_CONNECTED`.
실행 파일은 `src/hackathon-test-vault/e5b/bridge.mjs`, 정확한 타입은 같은 디렉터리의 `bridge.d.mts`다. 기본 signer/서비스는 계속 차단된다. 이 문서는 새 소유 TEST 환경의 명시적 조립 계약이며 HTTP 활성화 명령이 아니다.

## 입력과 소유 경계

- E5-A/PR95 `0e6d4225e5b645e57e3988dc426937b08069ead8`에서 별도 B 브랜치를 만들었다. A 실행 모듈 7개와 기존 workflow는 수정하지 않는다. E2·.3 24필드·계약·정책·v1 경계는 유지한다.
- API `97f6413`/root `725506f`를 먼저 정상 병합했다. root가 검토한 API `4dec3bd94ad786d2f1b52d00b5bfa1eab8f82ec0`와 root `f5aaccb`도 정상 병합하고, memory consumer는 v4를 명시 소비한다. v4 SHA256은 `2cf7aba578d1ac5ed712a00288edcdff88d58e2152acdfd709c1228078f078a6`이다. E3 8개+실행 import 9개 지문을 검사한다. v1/v2/v3 기록은 불변이다.
- v4의 권한은 memory 호환성 검사다. B persistent TEST 개발은 별도의 E5 development/service intake와 승인 범위에 따른다. v4를 persistent 활성화 승인으로 사용하지 않는다.
- API source는 해당 소유자의 이력으로만 병합하며 이번 B 구현에서 수정하지 않았다. 새로운 실제 API 어댑터, E3 현재성 검사와 전체 절차는 API 담당의 후속이다.
- 추천/요청 설정은 Astra / High다. 현재 실행 모델은 독립 확인하지 않았으며 문구로 설정을 바꿨다고 주장하지 않는다.

## 최초 조립과 호출 순서

1. 소유 조립 코드가 **새 소유 환경**의 `environmentId`로 `openOwnedApiBridge`를 연다. browser/HTTP body가 환경·clock·cut을 고르지 않는다. runtime 공개 투영과 제한된 reader/worker만 전달하고 owner 객체는 보유한다.
2. API store constructor에 owner의 `fenceReader`와 아래 고정 runtime/scope 매핑을 캡처한다. metadata 경로의 witness 생략을 실제 B 활성화에 허용하지 않는다.
3. API store를 만든 뒤 `owner.bindController(factory)`를 한 번 호출한다. factory는 `witnesses.consume` 및 제한 issuer만 받고 동기 controller 3개를 반환한다. bind 전 worker/chain reader 호출은 UNBOUND, 두 번째 bind는 거부한다. bind 실패도 해당 instance에서 재시도하지 않는다.
4. API transaction **밖에서** fence preflight를 읽는다. API는 복귀 후 incarnation/counter/lease CAS와 5초 유효기간을 검사하고 전역 lease를 획득한다. intent별 lease/slot과 전역 lease는 별개다.
5. API transaction 밖에서 `reader.observe(command)`로 사전 관측한다. API가 인증·E3·intent/global lease와 정확 command를 결합한 B binding을 준비한다. `worker.authorize({binding,command})`를 transaction 밖에서 호출한다.
6. E4는 실제 canonical 관측/ancestry/명령/업무 기한을 읽은 뒤 `authorizeSync({ticket})`를 호출한다. API callback은 짧은 transaction에서 ticket을 한 번 소비하고 최신 사실을 검사한 후 `issuer.capability(ticket)`를 동기로 호출한다. 발급된 certificate를 반환하고 transaction을 닫는다.
7. API는 `E4_SEAL_REQUESTED` identity를 먼저 영속화하고 transaction을 닫은 뒤 `worker.seal`을 호출한다. 서명 직전/직후 E4가 `readCurrentSync`를 부를 때도 같은 consume→검사→issuer.current 순서다.
8. SEALED ref/manifest를 얻으면 `adopt`로 별도 현재 인수 기록을 만들고 API에 ref/manifest/adoptionId/adoptionHash를 원자적으로 영속화한다. 그 transaction을 닫은 뒤 `dispatch`한다. E4의 `commitCurrentSync`는 현재 API commit 및 권한을 읽고 `issuer.commit`을 반환해야 한다. E4는 그 뒤 SEND_STARTED 직전에도 current를 다시 검사한다.

기존 97f/4dec의 `ports.certify` 호출에 `authorize`를 끼워 넣는 방식은 **이 계약과 호환되지 않는다**. `authorize`는 async 최초 진입이고 issuer는 active callback에서만 동작한다. API transaction을 연 채 worker를 부르거나 callback에서 worker에 재진입하지 않는다. 후자는 명시 거부한다. E4의 current callback이 자체 E4 transaction 안에서 실행될 수 있지만 issuer는 E4 DB transaction/RPC를 전혀 하지 않아 E4→API→E4 transaction 재귀를 만들지 않는다. API adapter가 이 새 순서를 명시 구현해야 한다.

## typed facts와 제한 issuer

binding v2는 intent/request/attempt, runtime/lineage, **전역** workerFence/workerId/leaseId/expiresAt, E3 commitment, commandHash, anchor hash/number/time, businessHash, purpose, business window를 결합한다. commitment에는 API가 intent별 권한과 전역 권한을 함께 반영한다. lineage는 실제 contract epoch와 다르다.

`witnesses.consume(ticket)`이 주는 frozen evidence는 runtime·phase·binding·exact command·실제 observation·reader proof·서명할 payload·commit reference다. 실행 proof는 등록 reader의 query/application/nonce, anchor와 current checkpoint, business/command/binding hash와 실제 ancestry를 담는다. block hash가 맞아도 anchor number/time이 실제 블록과 다르면 거부한다. public reader가 반환한 JSON 또는 boolean을 이 proof로 제출하는 포트는 없다.

ticket은 private WeakMap의 **객체 동일성**과 현재 동기 callback에 묶인다. clone/JSON/다른 callback/재사용은 거부한다. consume 한 번 뒤 matching issuer 한 번만 허용한다. issuer는 미리 결합된 capability/current/commit payload만 서명하고 임의 digest, 키, wallet, 지급 서명, raw transaction을 받거나 반환하지 않는다. controller 인증 서명은 지급 키와 별도의 새 TEST 키다. callback Promise는 거부하며 private 예외 원문은 반환하지 않는다.

API callback은 실제 서비스 인증, intent/global lease 및 slot CAS, source/raw/query의 원래 만료, E3 revision/sequence, 동의·이의, 정확 명령·기한을 현재 DB 사실과 비교해야 한다. fixture의 `current` boolean과 간단한 commitment는 이 검사를 대체하지 않는다. claim/recovery/retention에는 과거 원천·동의·현재 key/epoch/pause를 새 자격 관문으로 추가하지 않는다. 새 송신 권한과 source-independent 조회 권한은 계속 인증한다.

`reader.compare({previous,current})`도 실제 두 블록의 hash/number/time을 대조한다. retained orphan 증거를 확인하면 `REORG_PROVEN_RECOVERY_BLOCKED`를 반환하고 자동 rebase하지 않는다. B 실행 경로는 별도 영속 stop을 유지한다. RPC 오류는 reorg 증명이 아니다.

`prepareUnsigned`와 `accept`는 모두 .3 message의 실제 authorization nonce로 관측하며 private proof의 query에도 같은 nonce를 결합한다. ZERO nonce 관측을 새 nonce 검사로 대신하지 않는다. 이미 소비된 nonce의 prepare capability는 키 접근 전에 거부한다. API도 이 사실을 현재 nonce 예약/CAS와 대조해야 한다.

## Envelope 없는 직접 claim receipt 인수

등록된 `reader.claimReceipt({applicationId,txHash})`는 backend 중단 중 anycaller가 직접 claim한 경우의 읽기 포트다. 입력은 두 식별자뿐이며 from/nonce/calldata/row/verified/operationId를 받지 않는다. 실제 tx에서 sender/account nonce/calldata hash를 파생하고 정확한 고정 vault의 `claim(applicationId)` calldata인지 검사한다. 등록 reader가 canonical block의 transaction·receipt·log membership, 체인/runtime/code pin, RightSettled와 고정 recipient의 100 TEST Transfer, 실제 state/readback을 검증한다. accepted allocation/recipient를 application과 연결하고, 영구 acceptedRight의 authorization digest/nonce 및 used nonce를 확인한다. accept가 임시 prepared 필드를 지우므로 그것을 영구 digest와 비교하지 않으며 cleared 상태를 확인한다. 반환된 영구 digest는 API의 원래 accepted 기록과 대조할 값이다.

성공은 `clear-e5b-direct-claim-receipt.1`의 INCLUDED, 실제 checkpoint/observation, allocationId/authorizationDigest/recipient/token/amountAtoms와 `finalized:false`다. 조회 부재·잘못된 거래/app·실패 receipt·불완전 증거는 UNKNOWN/automaticPromotion:false로 남는다. 해당 거래에 가짜 envelope/ref/operation을 만들거나 state SETTLED만 보고 지급 완료로 승격하지 않는다. 새 원천/현재 key/epoch/pause를 claim 자격으로 요구하지 않는다. API는 constructor에 캡처한 이 포트의 결과만 private intake로 받아야 하며 browser JSON을 인증된 receipt로 받으면 안 된다. API 저장/재시작 통합 자체는 아직 미구현이다.

## API acquire 전 독립 fence 조회

`owner.fenceReader`는 constructor 전용 `clear-bootcamp-runtime-fence-reader.1`이다. worker에 노출하지 않으며 controller binding 전에도 조회할 수 있어 초기 조립 순환을 만들지 않는다. API callback 중 재진입은 거부한다. 읽기는 실제 별도 E4 `metadata.sqlite`의 runtime row에서 수행하며 counter를 증가시키거나 고치지 않는다.

정확한 B 매핑은 frozen `runtime.authorityScope`다.

| 필드 | E4의 고정 근거 |
| --- | --- |
| runtimeId | 새 소유 environmentId |
| runtimePinHash | E4 전체 공개 runtime manifest의 SHA256 |
| scopeKey | `SHA256(canonical({chainId,vaultAddress,instanceId}))` |
| highestFence | E4 DB의 영속 전역 fence를 안전한 정수로 변환한 값 |

read는 위 세 query 필드만 수락한다. 임의 highestFence/다른 runtime·scope는 거부한다. 결과는 동일 query와 `clear-bootcamp-runtime-fence-witness.1`, highestFence다. DB의 runtime hash/lineage/정수 범위도 검사한다. 이 witness의 counter는 그 E4가 실제 수락한 최고 권한이며 API에서 발급만 하고 E4에 전달하지 않은 모든 번호를 보았다고 주장하지 않는다.

이 매핑은 명시적인 **새 B 계약**이다. 기존 API metadata/current projection의 hash나 scope 계산과 자동으로 같다고 가정하지 않는다. API 소유자는 실제 consumer에서 이 투영/계산을 명시 결합하고 생성 시 reader를 캡처해야 한다. browser가 read 결과를 제출하거나 scope를 임의 지정하여 신뢰를 얻을 수 없다. API acquire 전 비동기 호출, 복귀 후 CAS/5초 규칙, 외부 값이 더 높으면 영속 정지하고 숫자를 맞추지 않는 동작을 함께 연결·시험하기 전에는 actual B를 활성화할 수 없다. 둘의 전체 저장소를 함께 되돌린 경우나 같은 UID/root 공격을 완전히 탐지하는 독립 보장은 아니다.

## 기존 거래 조회와 새 작업자 인수

- `lookup`은 원래 request/intent/attempt/operation 충돌을 찾고 runtime/lineage/exact command/business window까지 일치시킨다. `FOUND`, `FOUND_UNSEALED_HOLD`, `NOT_FOUND` 모두 `automaticSeal:false`다. NOT_FOUND는 재서명 허가가 아니며 API marker를 지우지 않는다.
- `envelope`는 공개 metadata만 반환한다. 미완성 row의 manifest/tx hash는 null일 수 있다. raw bytes·지급 서명·키·DB 경로는 없다.
- `adopt`는 B v2 SEALED만 허용한다. 원래 binding/command/bytes/manifest/tx hash/nonce/fee는 불변이다. 새 global fence/lease/anchor/E3 commitment는 별도 append-only adoption에 결합한다. heartbeat만으로 adoption이 갱신되지 않는다.
- `businessValidUntil = min(createdAt+120, sourceUntil, reviewUntil, messageUntil)`이며 null은 제외한다. sourceUntil은 원래 원천 cutoff 이하, reviewUntil은 첫 시작+600 이하, messageUntil은 .3 expiry 이하이다. API는 더 이른 실제 source/raw/query 한도를 대조한다. 새 authorityUntil은 `min(원래 businessValidUntil, 새 worker expiresAt)`다. old lease가 끝나도 이 원래 한도 안에서만 동일 bytes 인수가 가능하다.
- A v1 row는 원래 lease에 묶인 dispatchUntil을 그대로 보존한다. B에서 읽기/승격/인수하지 않는다. A의 과거 수명을 새 의미로 해석하지 않는다.
- API commit은 현재 adoption까지 정확히 저장해야 한다. 과거 ref/manifest만 있는 commit은 새 인수 송신 권한이 아니다. 송신 전 bytes 역검증·실제 simulation·current/fence 재검사 후 SEND_STARTED를 영속화한다.
- SEND_STARTED/UNKNOWN 이후에는 원래 tx hash만 canonical 조회한다. 자동 재전송·재서명·fee bump·새 nonce/operation을 만들지 않는다. 이미 시작된 네트워크 송신을 fence가 취소했다고 주장하지 않는다.
- 보관 bytes는 기존 7일, nonce/tombstone은 소유 환경 수명이다. source raw 정책의 보존기간과 다르다. 삭제해도 이미 전파된 거래가 무효가 되지 않는다.

## API 담당에게 남는 조립

이 구현은 새 소유 fixture API DB+실제 로컬 Geth를 쓴 **bridge 구성요소**다. API4dec는 정상 이력/지문/회귀 입력이며 실제 controller로 연결하지 않았다. 다음 작업이 모두 남는다.

1. 위 B 매핑과 mandatory E4 fence reader, 동기 callback/issuer의 새 adapter를 실제 API constructor에 연결한다. 기존 metadata adapter를 활성화한 척하지 않는다.
2. 실제 auth/source/E3/consent/objection/intent+global CAS를 각 최종 callback에 대조한다. 첫 unsigned 준비와 source min을 계산한다.
3. 등록→배정→공개→review→동의→prepare→accept를 실제 관측/receipt로 조립하고 응답 유실·adoption/commit 경계를 영속화한다.
4. canonical accept 뒤 별도 고정 claim job을 만들고 token transfer receipt를 검증한다. backend/API/worker/service 전체 중단 후 독립 anycaller claim 및 재시작 인수를 통합 검증한다.

B fixture의 service-stop claim 시험은 실제 chain/전송 receipt와 추가 지급 서명 없음만 입증한다. 전체 API backend-stop/자동 정산 구현 인수가 아니다. 실제 원천·기존 사용자 키/DB/체인·공개 체인·유료 호출·develop/main 병합·배포는 수행하지 않는다.
