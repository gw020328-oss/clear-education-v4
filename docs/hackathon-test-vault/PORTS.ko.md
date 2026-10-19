# E4 준비 계약 ↔ E3 내부 포트 제안 v1

2026-10-19. E0 소비자 pin `67c7bc8450484fb4d5545c6e36a672e497467174`, E2 `d9407b06b8a13122a489193119c1899929f83fe4`를 보존한다. E3 exact head/DTO/consent recipe 인수 전 **제안 포트**다. 공통 API/DB에 임의 필드를 추가하지 않는다.

이번 계약 `HackathonTestVaultPreparation`에는 accept/claim/withdraw/upgrade/activate 함수가 없다. payoutEnabled=false는 상수다. 역할·등록·전액배정·review snapshot·unsigned 준비·종료를 새 memory EVM에서만 검사한다. 이후 E3 인수 후 별도 실행 계약/새 runtime manifest에서 signer/accept/claim을 인수한다. 이 준비 bytecode를 배포한 뒤 스위치 하나로 지급을 켤 수 없다.

## 내부 호출과 필수 데이터

모든 변경은 별도 transaction operationId(bytes32), exact chain/runtime, app expectedVersion(uint64)을 사용한다. operationId는 재시도 시 그대로, 다른 payload 재사용은 거부한다. ABI와 calldata hash가 outbox의 정확 command다. 브라우저가 current/verified/role 사실을 제공하는 포트가 아니다.

| 포트/계약 호출 | E3가 고정할 입력 | 계약 확인·효과 |
| --- | --- | --- |
| registerCurrentMet | opaque appId/recipient, current decision ID/revision/hash, sourceValidUntilExclusive, MET acceptanceSequence, sourceReceiptHash | 고정 cohort policy/mapping/profile, 미등록 canonical app, 미래 source bound, 전역 증가 sequence. O+=100, R 불변 |
| allocate | appId, allocationId, expectedVersion | 현재 유효 MET의 가장 작은 server sequence, B−R≥100, 전액만 R+=100. allocationId 전역 재사용 거부 |
| startReview | appId, procedureId, publishedAt, expectedVersion | 전액 예약 후 공개, 첫 시작=최초 공개 시각 고정. 정정은 같은 procedure·원래600 상한, 새 공개 시각 |
| observeCurrent | currentMet, valid/unassessed objection, newValidError, narrowed source cutoff, observedAt, receiptHash, expectedVersion | epoch 증가+옛 준비물 삭제. R/O는 그대로. 새 유효 오류는 revalidation 이후 terminal latch |
| replaceTarget | 새 decision/sequence/source receipt, mode ROUTINE_REFRESH 또는 REVALIDATION, expectedVersion | 새 revision/hash·sequence; decisionId는 유지 가능. 같은100/R/O/allocation/firstStart 유지, epoch 증가, 옛 동의/준비물 삭제. 검증된 오류는 REVALIDATION 필요, 최대1 |
| bindConsents | exact current target/version에 대한 consentSetHash, mutualConsent | E3 인증 두 역할 사실의 opaque commitment. epoch 증가+옛 준비물 삭제. hash 자체가 온체인 양측 서명 검증은 아님 |
| prepareUnsigned | E2 .3의 정확24필드, expectedVersion | 등록 target/procedure/source/예약/동의/key/epoch 및 모든 기한 비교, 전체 digest 저장. 서명·accept·송금 없음 |
| terminationIntent→terminate | appId, reason enum, evidenceReceiptHash, expectedVersion | 별도 terminator. 계약 시간/기존 오류 latch로 조건 확인 → epoch무효화+R해제+O감소+terminal tombstone 원자 적용 |
| operationStatus / snapshot | operationId, exact runtime + canonical checkpoint | 제출/포함/확정과 현재 상태를 분리. 과거 성공과 현재 TERMINATED를 동시에 표현할 수 있음 |

Target의 acceptanceSequence는 현재 MET가 E1 ledger에 수락된 단조 증가 순서다. contract 등록/정정은 그 순서로 직렬화해야 한다. 체인은 미등록 off-chain 행이 있는지 알 수 없으므로 전체 queue의 완전성은 controller 신뢰다. chain 함수 호출 순서나 브라우저 click time을 sequence로 만들지 않는다. 한 cohort 최대64 canonical app은 이번 bounded preparation 구현 한도이며 새 정책 금액/자격 변경이 아니다.

## E2 필드 대응

appId/recipient/policyHash/runtimeMappingHash/operationsPolicyHash/token/100000000은 등록·cohort 고정값이다. decision ID/revision/hash와 sourceValidUntilExclusive는 현재 Target이다. procedureId/firstReviewStartedAt/decisionPublishedAt/revalidationCount는 계약 Review state이며 원래 start+600을 저장한다. allocationId는 고정 전액 예약이다. consentSetHash/mutualConsent는 E3의 인증 receipt set을 현재 target에 바인딩한 값이다.

signerKeyId는 key-admin이 등록한 immutable ID→주소와 revoke tombstone, authorizationEpoch는 app의 체인 epoch다. nonce/issuedAt/expiresAt/deadlinePolicyHash는 최종 준비 명령에 포함한다. E2 .3 type/domain/24필드/typeHash는 바꾸지 않는다. `deadlinePolicyHash`의 canonical JSON SHA256는 E2 함수로 계산하여 E3가 전달한다. 계약은 trusted registrar가 등록한 전체 unsigned digest를 저장하므로 signer가 nonce/time/deadline을 포함해 하나라도 바꿀 수 없다. 최종 acceptance에서는 digest 일치 외에도 current state/key/epoch/nonce/시간을 다시 검사해야 한다.

E3 consentSetHash는 final nonce/issuedAt/expiresAt/deadlinePolicyHash를 포함하지 않는 승인된 비순환 recipe여야 한다. 아직 그 recipe의 실제 인증/계산 adapter를 E4가 구현한 것은 아니다. sourceCurrent/오류·이의·미관측 원천 진실 또한 controller oracle 신뢰이며 flags/hash를 source 검증으로 표현하지 않는다. firstStart를 DB 값과 다르게 새로 만들지 말고 첫 confirmed allocation→공개→startReview 경로를 직렬화한다. 계약의 allocatedAt/targetRecordedAt보다 이른 공개는 거부한다.

## 종료 reason과 영속 상태

- CAP_UNRESOLVED(1): firstStart 존재, chain now≥원래 firstStart+600.
- NEW_VALID_ERROR_AFTER_REVALIDATION(2): count=1이고 controller의 검증된 새 오류가 terminal latch로 기록돼 있어야 한다. terminator의 reason 문자열/receipt만으로 latch를 만들 수 없다.
- SOURCE_UNREFRESHED_WITHIN_CAP(3): firstStart 존재, 원래 cap 경과 및 계약에 기록한 source exclusive cutoff 경과.

funding 대기 중 firstStart=0은 단순 대기시간/자료 만료로 종료하지 않는다. 만료·불확실한 source의 O/R을 DB에서 없애지 않는다. refresh/재검증 또는 명시 contract 종료 전에는 그대로 보존한다. 검증된 오류·내용 있는 미평가 이의가 있으면 배정/준비가 차단되며 과거 동의로 우회하지 못한다. TERMINATED는 조건 미충족이나 지급 성공이 아니며 재등록 불가다.

ACCEPTED/SETTLED enum은 후속 실행 계약의 보호 경계를 예약한 것이다. 준비 계약은 그 상태를 생성하지 않는다. accepted-first vs terminate-first, 실제 nonce 소비·claim exactly-once·accepted 이후 current key/epoch/source 무관·operator reclaim 없음은 후속 E3 인수 뒤 실제 거래로 시험한다. 이 단계에서 가짜 accepted storage를 주입해 성공했다고 세지 않는다.

## outbox / checkpoint / 복구 포트

DB 원자 commit의 단위는 준비 명령+expected appVersion+operationId+정확 calldata hash+runtime pin이다. 이것과 외부 chain transaction을 분산 원자 transaction이라고 부르지 않는다. worker는 intent→submitted(txHash)→included(blockHash,blockNumber,transactionIndex,status,logIndex)→finalized를 구분한다. RPC 응답 유실은 UNKNOWN이며 실패/미전송을 가정해 새 operationId를 생성하지 않는다.

reader는 canonical receipt/transaction hash/to/from/input/operation event와 현재 operation digest/app state를 대조해야 한다. 새 reader/restart 시 chainId/genesis/instance/vault code/token code/profile/policy/mapping/role manifest를 확인한다. reorg는 checkpoint를 무효화하고 canonical 결과를 재조회하며 appVersion/epoch/queue/R/O를 DB 관측에 맞춘다. contract의 멱등 operation 적용과 DB CAS는 각각의 경계이며 완전한 원자성을 주장하지 않는다.

persistent 새 격리 EVM과 backend는 서로 다른 lifecycle이어야 한다. backendstop 직접claim/relayer 재시작·public finalized는 E5 인수 대상이다. 현재 메모리 harness의 evm_snapshot/revert는 오프라인 반례 도구이며 기존 사용자 chain/DB/volume을 건드리지 않는다.

## stable allocation 교체 이벤트 / 최소 DTO

E3의 새 allocationId 강제는 필요하지 않다. 계약은 **같은 app·같은 allocationId·같은100 예약/의무**를 유지하고, 새 decision·epoch/version·준비물 삭제를 원자적으로 적용한다. replacement는 source truth 검증이나 payout acceptance가 아니다. 준비 계약은 새 target을 RESERVED로 되돌리므로 새 판정 공개와 새 동의 결합 전에는 준비할 수 없다.

`TargetReplaced(applicationId,operationId,allocationId,previous,current,firstStartedAt,mode)`를 emit한다. previous/current 각각은 decisionId/revision/decisionHash/acceptanceSequence/epoch/appVersion/sourceReceiptHash다. operationId와 exact calldata digest는 같은 transaction의 OperationApplied로 연결한다. 이벤트의 firstStartedAt은 바뀌지 않은 원래 절차 anchor다. sourceReceiptHash는 내부 검증 receipt의 opaque commitment이며 원천 사실을 이벤트가 인증한 것이 아니다.

API용 `clear-hackathon-test-target-replacement.1` 최소 DTO:

- runtime: chainId, genesisHash, instanceId, vaultAddress/vaultCodeHash, tokenAddress/tokenCodeHash, operationsPolicyHash, sourceMode.
- target: applicationId, stable allocationId, firstStartedAt, previous/current의 위7필드, mode, operationId, commandDigest.
- checkpoint: transactionHash, blockNumber, blockHash, transactionIndex, logIndex, status INCLUDED 또는 FINALIZED. 숫자는 decimal string. included를 finalized로 부풀리지 않는다.
- limits: sourceAuthenticatedByEvent=false, payoutAccepted=false, distributedAtomicity=false.

reader는 성공 receipt의 vault 주소·operationId/commandDigest·호출자 registrar·decoded replaceTarget calldata와 이벤트를 대조하고 해당 blockNumber의 canonical hash를 다시 확인해야 한다. 전후 epoch/version이 각각+1, allocationId 불변, 새 decision revision/sequence 증가, 기존 prepared digest 제거와 R/O 보존은 이 계약 code pin 및 직접 회귀로 보장한다. 이벤트만 읽고 더 최신 DB/chain target을 과거 상태로 덮지 않는다. E1 CAS는 previous appVersion/target에서 current로 한 번 전이하며, 이미 같은 replacement를 반영했다면 멱등 성공, 더 최신이면 historical receipt로 보관한다.

canonical checkpoint가 바뀌거나 transaction이 사라지면 REORGED/UNKNOWN으로 되돌려 현재 chain 상태와 operation mapping을 재조회한다. DB commit과 chain 적용 사이의 응답 유실은 복구 가능한 두 경계이며 하나의 분산 원자 commit이 아니다. actual accept-first 경합과 SETTLED tombstone은 E3 경계 인수 후 실행 계약 시험으로 남는다.

관측 갱신은 chain의 consent commitment도 지운다. 같은 decision의 앱 동의 기록을 폐기하거나 사용자에게 새 서명을 요구한다는 의미가 아니다. E3가 현재 창/원천/이의를 다시 확인해 같은 decision의 유효한 receipt set을 재결합할 수 있다. **decision이 달라지면** 새 판정의 동의가 필요하다.

## publication anchor와 latest checkpoint는 별개

publication 때 저장한 epoch/version은 그 시점의 anchor다. 같은 decision에서도 startReview·bindConsents·observeCurrent는 epoch/version을 증가시키며 prepareUnsigned는 version을 증가시킨다. 따라서 정상 TargetReplaced.previous가 publication baseline보다 클 수 있다. 양자를 무조건 같다고 검사하면 유효한 교체를 막는다.

E4 reader의 expected.previous는 **교체 명령을 준비한 직전 latest confirmed chain state/CAS**다. 옛 publication baseline을 이 자리에 넣지 않는다. API는 publication의 old decision ID/revision/hash 및 stable allocation 일치를 확인하고, previous epoch/version이 baseline 이상임을 확인한다. 이후 event의 current와 trusted chain snapshot을 exact target·epoch/version·checkpoint로 대조한다. 더 최신 동작으로 checkpoint가 전진했으면 새 조회/명시 인계를 수행하고 과거 이벤트를 현재 지급 허가로 사용하지 않는다.

교체 명령의 expectedVersion과 이벤트 previous.appVersion은 반드시 같다. 이것은 publication baseline equality 요구와 다르다. E5는 별도 last-confirmed checkpoint+app CAS를 유지한다. reader.replacement는 canonical **과거 교체 영수증**이고 snapshot은 지정된 최신 block 관측이므로 두 응답의 시점도 구분한다. 먼저 교체→새 판정 공개/startReview→consent/unsigned 준비 순서에서 새 버전이 생기는 것을 정상으로 처리한다.

P0 v1의 decisionId는 revision 간 동일할 수 있다. 교체는 더 큰 revision 및 새 canonical decisionHash로 구분하고, opaque decisionId 변경을 강제하지 않는다. old/new exact tuple과 epoch/version/CAS를 모두 비교하므로 같은 ID가 과거 승인 재사용을 허용하지 않는다.

## 초기 ID 발급과 등록 순서 — E3 exact 인수 대기

등록·배정에는 publication 전 application/decision/allocation bytes32가 필요하다. E4는 opaque mapping을 직접 발급하거나 E3 registry를 복제하지 않는다. E3가 인증된 내부 current/MET/source/CAS registration target 및 durable opaque ID 발급·조회 포트를 제공하면 그 exact head/DTO를 인수한다. 내부 ID 발급→등록→전액 배정→publication→startReview 순서이며, ID 발급·등록·배정만으로 publication window나 firstStart를 시작하지 않는다. 현재 준비 fixture의 합성 ID는 E3 registry 구현 또는 통합 완료의 근거가 아니다.
